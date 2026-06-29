/**
 * Build demo websites from uploaded HTML/ZIP — preserve source markup, inline zip CSS,
 * rewrite asset paths, and fetch missing assets from the brand domain.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');

const demoPolish = require('./brandScraperDemoHtmlPolish');

const PV_REL = '../../../profile-viewer';
const FETCH_TIMEOUT_MS = 6000;
const MAX_EXTERNAL_FETCHES = 20;
const EXTERNAL_FETCH_WALL_MS = 45000;
const USER_AGENT = 'AEP-Orchestration-Lab/1.0 (Adobe internal brand scraper demo)';

const PRIMARY_HTML_SCORES = [
  { pattern: /(^|\/)index\.html?$/i, score: 100 },
  { pattern: /(^|\/)default\.html?$/i, score: 90 },
  { pattern: /(^|\/)home\.html?$/i, score: 85 },
  { pattern: /(^|\/)main\.html?$/i, score: 80 },
];

/** Saved ad / tracking iframes often land as small HTML under *_files/ (e.g. DoubleClick sadbundle). */
const AD_IFRAME_HTML_HEAD_RE = /2mdn\.net|sadbundle|doubleclick|Template_H5|Enabler_01/i;
const SAVE_PAGE_FILES_DIR_RE = /_files\//i;

function htmlEntryHead(entry) {
  if (!entry || !entry.content || !entry.content.length) return '';
  return entry.content.toString('utf8', 0, Math.min(entry.content.length, 4096));
}

/**
 * Browser "Web Page, Complete" saves: `{Title}.html` + `{Title}_files/` asset folder.
 * @param {Array<{ name: string }>} entries
 * @returns {{ entry: object, name: string } | null}
 */
function findBrowserSavePageRoot(entries) {
  for (const e of entries || []) {
    if (!e || !e.name || !e.content || !e.content.length) continue;
    if (e.isHtml === false || !/\.html?$/i.test(e.name)) continue;
    const name = posixNorm(e.name);
    if (name.includes('/')) continue;
    const m = /^(.+)\.html?$/i.exec(name);
    if (!m) continue;
    const companionPrefix = `${m[1]}_files/`;
    const hasCompanion = (entries || []).some((x) => {
      const p = posixNorm(x && x.name);
      return p && p.startsWith(companionPrefix);
    });
    if (hasCompanion) return { entry: e, name };
  }
  return null;
}

/**
 * @param {object} entry
 * @param {Array} entries
 * @returns {number}
 */
function scoreHtmlCandidate(entry, entries) {
  const name = posixNorm(entry.name);
  let score = 0;

  const saveRoot = findBrowserSavePageRoot(entries);
  if (saveRoot && name === saveRoot.name) {
    score += 150;
    score += Math.min(entry.content.length / 5000, 40);
  }

  if (SAVE_PAGE_FILES_DIR_RE.test(name)) {
    if (/(^|\/)index\.html?$/i.test(name)) score -= 80;
    else score -= 35;
    if (saveRoot) score -= 25;
  }

  for (const rule of PRIMARY_HTML_SCORES) {
    if (rule.pattern.test(name)) score = Math.max(score, rule.score);
  }

  const head = htmlEntryHead(entry);
  if (AD_IFRAME_HTML_HEAD_RE.test(head)) score -= 100;

  if (!name.includes('/')) score += 15;
  score -= (name.split('/').length - 1) * 3;
  score -= Math.min(name.length, 80) * 0.01;

  return score;
}

/**
 * @param {Array<{ name: string, content: Buffer, isHtml?: boolean }>} entries
 */
function pickPrimaryHtml(entries) {
  const htmlFiles = (entries || []).filter((e) => e && e.isHtml !== false && /\.html?$/i.test(e.name));
  if (!htmlFiles.length) return null;

  const ranked = htmlFiles.map((e) => {
    const name = posixNorm(e.name);
    return { entry: e, name, score: scoreHtmlCandidate(e, entries) };
  }).sort((a, b) => b.score - a.score);

  return ranked[0] || null;
}

function posixNorm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function posixDirname(p) {
  const n = posixNorm(p);
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(0, i) : '';
}

function posixJoin(base, rel) {
  return path.posix.normalize(path.posix.join(base || '', rel || '')).replace(/^\/+/, '');
}

function normaliseBaseUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'https://brand.local/';
  if (/^https?:\/\//i.test(s)) return s.endsWith('/') ? s : `${s}/`;
  return `https://${s.replace(/^\/+/, '')}/`;
}

function buildEntryMap(entries) {
  const map = new Map();
  for (const e of entries || []) {
    if (!e || !e.name || !e.content || !e.content.length) continue;
    const key = posixNorm(e.name);
    if (!key || key.includes('..')) continue;
    map.set(key, e.content);
    map.set(key.toLowerCase(), e.content);
  }
  return map;
}

function lookupEntry(map, zipPath) {
  const key = posixNorm(zipPath);
  if (map.has(key)) return { path: key, content: map.get(key) };
  const lower = key.toLowerCase();
  if (map.has(lower)) return { path: key, content: map.get(lower) };
  for (const [k, v] of map.entries()) {
    if (k.toLowerCase() === lower) return { path: k, content: v };
  }
  return null;
}

function documentBaseUrl(baseUrl, htmlPath) {
  const root = normaliseBaseUrl(baseUrl);
  const dir = posixDirname(htmlPath);
  try {
    return new URL(dir ? `${dir}/` : './', root).toString();
  } catch (_e) {
    return root;
  }
}

function resolveHrefToZipPath(href, htmlPath, entryMap) {
  const raw = String(href || '').trim();
  if (!raw || raw.startsWith('#') || /^data:/i.test(raw) || /^javascript:/i.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) {
    const base = normaliseBaseUrl('');
    try {
      const u = new URL(raw);
      const pathname = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
      const hit = lookupEntry(entryMap, pathname);
      if (hit) return hit.path;
    } catch (_e) { /* ignore */ }
    return null;
  }
  const htmlDir = posixDirname(htmlPath);
  const combined = posixJoin(htmlDir, raw.split('?')[0].split('#')[0]);
  const hit = lookupEntry(entryMap, combined);
  return hit ? hit.path : null;
}

function resolveAbsoluteAssetUrl(href, htmlPath, baseUrl) {
  const raw = String(href || '').trim();
  if (!raw || raw.startsWith('#') || /^data:/i.test(raw) || /^javascript:/i.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    return new URL(raw, documentBaseUrl(baseUrl, htmlPath)).toString();
  } catch (_e) {
    return null;
  }
}

function demoRelativeUrl(zipPath) {
  const p = posixNorm(zipPath);
  return p.split('/').map(encodeURIComponent).join('/');
}

function rewriteCssUrls(css, cssPath, htmlPath, entryMap, baseUrl) {
  return String(css || '').replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, inner) => {
    const ref = String(inner || '').trim();
    if (!ref || /^data:/i.test(ref) || /^https?:\/\//i.test(ref)) return full;
    const cssDir = posixDirname(cssPath);
    const relFromRoot = posixJoin(cssDir, ref.split('?')[0].split('#')[0]);
    const zipHit = lookupEntry(entryMap, relFromRoot);
    if (zipHit) {
      return `url(${quote}${demoRelativeUrl(zipHit.path)}${quote})`;
    }
    const abs = resolveAbsoluteAssetUrl(ref, cssPath, baseUrl);
    return abs ? `url(${quote}${abs}${quote})` : full;
  });
}

function inlineStylesheets(html, htmlPath, entryMap, baseUrl) {
  let out = html;
  const linkRe = /<link\b[^>]*>/gi;
  const links = [];
  let m;
  while ((m = linkRe.exec(html)) !== null) links.push(m[0]);

  for (const tag of links) {
    const rel = (/rel\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
    if (!/stylesheet/i.test(rel)) continue;
    const href = (/href\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1];
    if (!href) continue;

    const zipPath = resolveHrefToZipPath(href, htmlPath, entryMap);
    if (zipPath) {
      const hit = lookupEntry(entryMap, zipPath);
      if (hit) {
        let css = hit.content.toString('utf8');
        css = rewriteCssUrls(css, zipPath, htmlPath, entryMap, baseUrl);
        out = out.replace(tag, `<style data-inlined-from="${zipPath.replace(/"/g, '')}">\n${css}\n</style>`);
        continue;
      }
    }

    const abs = resolveAbsoluteAssetUrl(href, htmlPath, baseUrl);
    if (abs) {
      out = out.replace(
        tag,
        tag.replace(/href\s*=\s*["'][^"']*["']/i, `href="${abs.replace(/"/g, '&quot;')}"`),
      );
    }
  }
  return out;
}

function rewriteAttrUrls(html, htmlPath, entryMap, baseUrl) {
  const attrNames = ['src', 'href', 'poster', 'data-src', 'data-href'];
  let out = html;

  for (const attr of attrNames) {
    const re = new RegExp(`(\\b${attr}\\s*=\\s*)(["'])([^"']*)\\2`, 'gi');
    out = out.replace(re, (full, prefix, quote, val) => {
      const zipPath = resolveHrefToZipPath(val, htmlPath, entryMap);
      if (zipPath) {
        return `${prefix}${quote}${demoRelativeUrl(zipPath)}${quote}`;
      }
      const abs = resolveAbsoluteAssetUrl(val, htmlPath, baseUrl);
      if (abs && abs !== val) return `${prefix}${quote}${abs}${quote}`;
      return full;
    });
  }

  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, inner) => {
    const ref = String(inner || '').trim();
    if (!ref || /^data:/i.test(ref) || /^https?:\/\//i.test(ref)) return full;
    const zipPath = resolveHrefToZipPath(ref, htmlPath, entryMap);
    if (zipPath) return `url(${quote}${demoRelativeUrl(zipPath)}${quote})`;
    const abs = resolveAbsoluteAssetUrl(ref, htmlPath, baseUrl);
    return abs ? `url(${quote}${abs}${quote})` : full;
  });

  return out;
}

async function fetchRemoteAsset(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
    return { buffer: buf, contentType: ct || 'application/octet-stream' };
  } catch (_e) {
    return null;
  }
}

function externalAssetKey(url) {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function extFromUrl(url, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('svg')) return '.svg';
  if (ct.includes('woff2')) return '.woff2';
  if (ct.includes('woff')) return '.woff';
  if (ct.includes('css')) return '.css';
  try {
    const p = new URL(url).pathname;
    const m = /\.[a-z0-9]{2,5}$/i.exec(p);
    if (m) return m[0];
  } catch (_e) { /* ignore */ }
  return '.bin';
}

async function fetchMissingExternalAssets(html, htmlPath, entryMap, baseUrl) {
  const extraFiles = [];
  const urlRe = /(?:src|href|poster|data-src)\s*=\s*["']([^"']+)["']/gi;
  const cssUrlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  const candidates = new Set();

  let m;
  while ((m = urlRe.exec(html)) !== null) {
    const abs = resolveAbsoluteAssetUrl(m[1], htmlPath, baseUrl);
    if (abs && !resolveHrefToZipPath(m[1], htmlPath, entryMap)) candidates.add(abs);
  }
  while ((m = cssUrlRe.exec(html)) !== null) {
    const abs = resolveAbsoluteAssetUrl(m[1], htmlPath, baseUrl);
    if (abs && !resolveHrefToZipPath(m[1], htmlPath, entryMap)) candidates.add(abs);
  }

  const list = [...candidates];
  if (!list.length) return { html, extraFiles };

  // News sites reference hundreds of CDN assets — sequential fetch blocked workers for 30+ minutes.
  // Keep absolute URLs in markup when the candidate set is large; the iframe loads them live.
  if (list.length > MAX_EXTERNAL_FETCHES) {
    return { html, extraFiles, skippedExternalCount: list.length };
  }

  let rewritten = html;
  const started = Date.now();
  for (const absUrl of list) {
    if (Date.now() - started > EXTERNAL_FETCH_WALL_MS) break;
    const fetched = await fetchRemoteAsset(absUrl);
    if (!fetched) continue;
    const rel = `_external/${externalAssetKey(absUrl)}${extFromUrl(absUrl, fetched.contentType)}`;
    extraFiles.push({
      name: rel,
      content: fetched.buffer,
      contentType: fetched.contentType,
    });
    const esc = absUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rewritten = rewritten.replace(new RegExp(esc, 'g'), rel);
  }
  return { html: rewritten, extraFiles };
}

/**
 * Chrome "save complete" bundles may include extra paths — keep the root HTML + its _files/ folder only.
 * @param {Array} entries
 * @param {{ name: string }} picked
 */
function filterSavePageEntries(entries, picked) {
  if (!picked || !picked.name) return entries || [];
  const rootName = posixNorm(picked.name);
  if (rootName.includes('/')) return entries || [];
  const base = rootName.replace(/\.html?$/i, '');
  const filesPrefix = `${base}_files/`;
  const hasCompanion = (entries || []).some((e) => {
    const n = posixNorm(e && e.name);
    return n && n.startsWith(filesPrefix);
  });
  if (!hasCompanion) return entries || [];
  return (entries || []).filter((e) => {
    if (!e || !e.name) return false;
    const n = posixNorm(e.name);
    return n === rootName || n.startsWith(filesPrefix);
  });
}

function fillMissingMetadata(html, record) {
  let out = html;
  const brand = record.brandName || record.customerName || 'Brand';
  const about = (record.analysis && !record.analysis.skipped && record.analysis.about) || '';
  const page = (record.crawlSummary && record.crawlSummary.pages && record.crawlSummary.pages[0]) || {};
  const logo = record.customerLogo && (record.customerLogo.url || record.customerLogo.thumbnailUrl);

  if (!/<title[^>]*>[\s\S]*?<\/title>/i.test(out) && (page.title || brand)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n  <title>${escapeHtml(page.title || brand)}</title>`);
  }
  if (!/<meta[^>]+name\s*=\s*["']description["']/i.test(out) && (about || page.description)) {
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1>\n  <meta name="description" content="${escapeHtml(about || page.description || '')}">`,
    );
  }
  if (logo && !/<meta[^>]+property\s*=\s*["']og:image["']/i.test(out)) {
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1>\n  <meta property="og:image" content="${escapeHtml(logo)}">`,
    );
  }
  return out;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function injectLabChrome(html, slug, prefix) {
  const strip = `
  <div hidden data-demo-env-strip-mount="site-clone-minimal" data-demo-env-strip-prefix="${prefix}"></div>
  <link rel="stylesheet" href="${PV_REL}/style.css">
  <link rel="stylesheet" href="${PV_REL}/home.css">
  <link rel="stylesheet" href="${PV_REL}/aep-demo-env-bar.css">
  <link rel="stylesheet" href="${PV_REL}/aep-profile-drawer.css">
  <link rel="stylesheet" href="${PV_REL}/aep-theme.css">
  <script src="${PV_REL}/firebase-database-config.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script src="${PV_REL}/aep-global-sandbox.js"></script>
  <script src="${PV_REL}/aep-lab-sandbox-sync.js"></script>
  <script src="${PV_REL}/email-cache.js"></script>
  <script src="${PV_REL}/identity-picker.js"></script>
  <script src="${PV_REL}/aep-profile-drawer.js"></script>
  <script src="${PV_REL}/demo-tags-injection.js"></script>
  <script src="${PV_REL}/aep-demo-env-bar.js"></script>
  <script src="${PV_REL}/shared/env-bar.js"></script>
  <script src="demo-lab.js"></script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${strip}\n</body>`);
  }
  return html + strip;
}

function buildDemoLabScript(slug, prefix) {
  return `(function () {
  'use strict';
  var PREFIX = '${prefix}';
  window.envBarConfig = window.envBarConfig || { prefix: PREFIX, mode: 'minimal', mountLayout: 'site-clone-minimal' };
  if (typeof window.envBar !== 'undefined' && typeof window.envBar.init === 'function') {
    window.envBar.init(window.envBarConfig);
  }
  if (typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.init) {
    DemoProfileDrawer.init({
      emailInputId: 'customerEmail',
      profileOpenClass: '${slug}-demo-page--profile-open',
      viewName: '${slug} demo',
      fetchBrowserEcidOnInit: true,
    });
  }
})();`;
}

function contentTypeForPath(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.html') || n.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (n.endsWith('.css')) return 'text/css; charset=utf-8';
  if (n.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.woff2')) return 'font/woff2';
  if (n.endsWith('.woff')) return 'font/woff';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

/**
 * @param {{ entries: Array, baseUrl: string, record: object, slug: string, prefix: string }} opts
 * @returns {Promise<{ files: Array, primaryHtmlPath: string, sourceHtmlPath: string }|null>}
 */
async function buildDemoFromUpload(opts) {
  const allEntries = opts.entries || [];
  const picked = pickPrimaryHtml(allEntries);
  if (!picked) return null;

  const entries = filterSavePageEntries(allEntries, picked);
  const entryMap = buildEntryMap(entries);
  const baseUrl = normaliseBaseUrl(opts.baseUrl || opts.record && (opts.record.baseUrl || opts.record.url));
  const htmlPath = picked.name;
  let html = picked.entry.content.toString('utf8');

  html = inlineStylesheets(html, htmlPath, entryMap, baseUrl);
  html = rewriteAttrUrls(html, htmlPath, entryMap, baseUrl);
  const external = await fetchMissingExternalAssets(html, htmlPath, entryMap, baseUrl);
  if (external.skippedExternalCount) {
    console.log('[brandScraperDemoFromUpload] skipped external asset fetch', {
      count: external.skippedExternalCount,
      htmlPath,
    });
  }
  html = external.html;
  html = demoPolish.stripAdvertBlocks(html);

  const logoAsset = await demoPolish.resolveCustomerLogoAsset(opts.record || {}, {
    sandbox: opts.sandbox,
    scrapeId: opts.scrapeId,
  });
  if (logoAsset) {
    const logoRel = `${demoPolish.LOGO_REL_PREFIX}${logoAsset.ext}`;
    external.extraFiles.push({
      name: logoRel,
      content: logoAsset.buffer,
      contentType: logoAsset.contentType,
    });
    html = demoPolish.applyCustomerLogoFallback(
      html,
      htmlPath,
      entryMap,
      demoRelativeUrl(logoRel),
      resolveHrefToZipPath,
    );
  }

  html = fillMissingMetadata(html, opts.record || {});
  if (!opts.skipLabChrome) {
    html = injectLabChrome(html, opts.slug, opts.prefix);
  }

  const files = [];
  files.push({
    name: 'index.html',
    content: Buffer.from(html, 'utf8'),
    contentType: 'text/html; charset=utf-8',
  });
  if (!opts.skipLabChrome) {
    files.push({
      name: 'demo-lab.js',
      content: Buffer.from(buildDemoLabScript(opts.slug, opts.prefix), 'utf8'),
      contentType: 'application/javascript; charset=utf-8',
    });
  }

  for (const e of entries) {
    if (!e || !e.name || !e.content || !e.content.length) continue;
    if (/\.html?$/i.test(e.name)) continue;
    if (demoPolish.isAdBundleEntry(e.name, e.content)) continue;
    const name = posixNorm(e.name);
    if (!name || name === 'index.html') continue;
    files.push({
      name,
      content: e.content,
      contentType: contentTypeForPath(name),
    });
  }

  for (const f of external.extraFiles) {
    files.push(f);
  }

  return {
    files,
    primaryHtmlPath: 'index.html',
    sourceHtmlPath: htmlPath,
  };
}

module.exports = {
  pickPrimaryHtml,
  findBrowserSavePageRoot,
  scoreHtmlCandidate,
  buildEntryMap,
  resolveAbsoluteAssetUrl,
  resolveHrefToZipPath,
  inlineStylesheets,
  rewriteAttrUrls,
  filterSavePageEntries,
  buildDemoFromUpload,
  demoRelativeUrl,
};
