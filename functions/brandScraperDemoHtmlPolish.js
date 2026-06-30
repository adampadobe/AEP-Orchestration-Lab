/**
 * Post-process uploaded HTML demos — strip ad slots, embed scrape customer logo fallback.
 */
'use strict';

const admin = require('firebase-admin');
const { pickLogoUrl } = require('./brandScraperSlideDeck');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = 'AEP-Orchestration-Lab/1.0 (Adobe internal brand scraper demo)';
const AD_IFRAME_HTML_HEAD_RE = /2mdn\.net|sadbundle|doubleclick|Template_H5|Enabler_01/i;
const LOGO_REL_PREFIX = '_brand/customer-logo';
const LOGO_IMG_RE = /logo|brandmark|wordmark|site-logo|header-logo|nav-logo|brand-logo/i;
const AD_SRC_RE = /2mdn\.net|doubleclick|googlesyndication|googletagservices|adservice|safeframe|taboola|outbrain|pubmatic|rubiconproject|adform|criteo|amazon-adsystem|googleadservices|facebook\.com\/tr|sadbundle|Template_H5|Enabler_01|\/ad[s]?\//i;
const AD_CONTAINER_RE = /adsbygoogle|ad-slot|advertisement|dfp-ad|gpt-ad|ad-container|ad__slot|commercial/i;

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

function posixNorm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function extFromContentType(contentType, fallbackUrl) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('svg')) return '.svg';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('gif')) return '.gif';
  if (fallbackUrl) {
    const m = /\.[a-z0-9]{2,5}$/i.exec(String(fallbackUrl));
    if (m) return m[0].toLowerCase();
  }
  return '.png';
}

function contentTypeFromExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === '.svg') return 'image/svg+xml';
  if (e === '.webp') return 'image/webp';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.gif') return 'image/gif';
  return 'image/png';
}

/**
 * Root-absolute URL for assets inside a Profile Viewer demo iframe (immune to saved <base href>).
 * @param {string} fileSlug
 * @param {string} relPath — path under {slug}-demo-assets/, e.g. _brand/customer-logo.png
 */
function profileViewerDemoAssetUrl(fileSlug, relPath) {
  const slug = String(fileSlug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  const rel = posixNorm(relPath);
  if (!slug || !rel) return relPath || '';
  return `/profile-viewer/${slug}-demo-assets/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Chrome "save complete" pages often ship <base href="https://original-site/"> which breaks
 * demo-relative asset paths (e.g. _brand/customer-logo.png resolves on the live site).
 * @param {string} html
 */
function stripDocumentBaseTags(html) {
  return String(html || '').replace(/<base\b[^>]*\/?>/gi, '');
}

function safeSlugPart(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function downloadScrapeCustomerLogo(sandbox, scrapeId, storedPathHint) {
  const bucket = getBucket();
  const candidates = [];
  if (storedPathHint) candidates.push(String(storedPathHint).replace(/^\/+/, ''));
  const sb = safeSlugPart(sandbox);
  const sid = safeSlugPart(scrapeId);
  if (sb && sid) {
    for (const ext of ['.png', '.svg', '.webp', '.jpg', '.jpeg']) {
      candidates.push(`scrapes/${sb}/${sid}/customer-logo${ext}`);
    }
  }
  for (const objectPath of candidates) {
    try {
      const file = bucket.file(objectPath);
      const [exists] = await file.exists();
      if (!exists) continue;
      const [buf] = await file.download();
      if (!buf || !buf.length) continue;
      const ext = extFromContentType(null, objectPath);
      return { buffer: buf, contentType: contentTypeFromExt(ext), ext, objectPath };
    } catch (_e) { /* try next */ }
  }

  const sidOnly = safeSlugPart(scrapeId);
  if (sidOnly && !sb) {
    try {
      const [files] = await bucket.getFiles({ matchGlob: `scrapes/*/${sidOnly}/customer-logo.*` });
      const hit = (files || []).find((f) => f && f.name && /customer-logo\./i.test(f.name));
      if (hit) {
        const [buf] = await hit.download();
        if (buf && buf.length) {
          const ext = extFromContentType(null, hit.name);
          return { buffer: buf, contentType: contentTypeFromExt(ext), ext, objectPath: hit.name };
        }
      }
    } catch (e) {
      console.warn('[downloadScrapeCustomerLogo] glob lookup failed', sidOnly, String((e && e.message) || e));
    }
  }

  return null;
}

async function fetchRemoteBytes(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
    return { buffer: buf, contentType: ct || 'image/png' };
  } catch (_e) {
    return null;
  }
}

/**
 * @param {object} record
 * @param {{ sandbox?: string, scrapeId?: string }} opts
 * @returns {Promise<{ buffer: Buffer, contentType: string, ext: string }|null>}
 */
async function resolveCustomerLogoAsset(record, opts = {}) {
  const logo = record && record.customerLogo;
  if (logo && logo.storedPath) {
    try {
      const [buf] = await getBucket().file(String(logo.storedPath)).download();
      if (buf && buf.length) {
        const ext = extFromContentType(null, logo.storedPath);
        return {
          buffer: buf,
          contentType: contentTypeFromExt(ext),
          ext,
          objectPath: logo.storedPath,
        };
      }
    } catch (_e) { /* fall through */ }
  }

  const scrapeHit = await downloadScrapeCustomerLogo(
    opts.sandbox || record.sandbox,
    opts.scrapeId || record.scrapeId,
    logo && logo.storedPath,
  );
  if (scrapeHit) return scrapeHit;

  const url = (logo && (logo.url || logo.thumbnailUrl || logo.originalUrl)) || '';
  if (url) {
    const fetched = await fetchRemoteBytes(url);
    if (fetched) {
      return {
        buffer: fetched.buffer,
        contentType: fetched.contentType,
        ext: extFromContentType(fetched.contentType, url),
      };
    }
  }

  const assets = (record && record.crawlSummary && record.crawlSummary.assets) || record.assets || {};
  const crawlLogoUrl = pickLogoUrl(assets);
  if (crawlLogoUrl) {
    const fetched = await fetchRemoteBytes(crawlLogoUrl);
    if (fetched) {
      return {
        buffer: fetched.buffer,
        contentType: fetched.contentType,
        ext: extFromContentType(fetched.contentType, crawlLogoUrl),
      };
    }
  }

  return null;
}

function entryHead(content) {
  if (!content || !content.length) return '';
  return content.toString('utf8', 0, Math.min(content.length, 4096));
}

/**
 * Skip ad iframe HTML saved inside Chrome _files/ bundles.
 * @param {string} name
 * @param {Buffer} [content]
 */
function isAdBundleEntry(name, content) {
  const n = posixNorm(name);
  if (!n) return false;
  if (AD_IFRAME_HTML_HEAD_RE.test(n)) return true;
  if (/doubleclick|googlesyndication|adservice|ad-doubleclick|sadbundle/i.test(n)) return true;
  if (content && /\.html?$/i.test(n) && AD_IFRAME_HTML_HEAD_RE.test(entryHead(content))) return true;
  return false;
}

function isAdIframeSrc(src) {
  const s = String(src || '').trim();
  if (!s) return true;
  if (/^about:/i.test(s) || /^javascript:/i.test(s)) return true;
  return AD_SRC_RE.test(s) || AD_CONTAINER_RE.test(s);
}

function isAdElementMarkup(tag) {
  const hay = String(tag || '').toLowerCase();
  if (/\badsbygoogle\b/.test(hay)) return true;
  if (/\b(id|class)\s*=\s*["'][^"']*\b(ad-slot|dfp-ad|gpt-ad|advertisement|ad-container)\b/i.test(hay)) return true;
  const src = (/src\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
  return isAdIframeSrc(src);
}

/**
 * Remove ad iframes, ad network scripts, and common ad containers from saved HTML.
 * @param {string} html
 */
function stripAdvertBlocks(html) {
  let out = String(html || '');

  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (tag) => (isAdElementMarkup(tag) ? '' : tag));
  out = out.replace(/<iframe\b[^>]*\/>/gi, (tag) => (isAdElementMarkup(tag) ? '' : tag));

  out = out.replace(/<ins\b[^>]*>[\s\S]*?<\/ins>/gi, (tag) => (isAdElementMarkup(tag) ? '' : tag));
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, (tag) => (
    /doubleclick|googlesyndication|adservice/i.test(tag) ? '' : tag
  ));

  out = out.replace(
    /<script\b[^>]*src\s*=\s*["'][^"']*(?:googlesyndication|doubleclick|adservice|googletagservices)[^"']*["'][^>]*>\s*<\/script>/gi,
    '',
  );

  out = out.replace(
    /<(aside|div|section)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (block) => {
      if (!AD_CONTAINER_RE.test(block)) return block;
      if (block.length > 12000) return block;
      return '';
    },
  );

  return out;
}

function imgLooksLikeLogo(tag) {
  const hay = String(tag || '').toLowerCase();
  const alt = (/alt\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
  const cls = (/class\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
  const id = (/id\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
  const src = (/src\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
  return LOGO_IMG_RE.test(`${alt} ${cls} ${id} ${src}`);
}

/**
 * @param {string} src
 * @param {string} htmlPath
 * @param {Map} entryMap
 * @param {(href: string, htmlPath: string, entryMap: Map) => string|null} resolveZipPath
 */
function isBrokenLocalImgSrc(src, htmlPath, entryMap, resolveZipPath) {
  const raw = String(src || '').trim();
  if (!raw || /^data:/i.test(raw)) return !raw;
  if (/^https?:\/\//i.test(raw)) return false;
  if (resolveZipPath) {
    const zipPath = resolveZipPath(raw, htmlPath, entryMap);
    if (zipPath) return false;
  }
  return true;
}

/**
 * Point broken or remote logo-like <img> tags at the embedded customer logo asset.
 * @param {string} html
 * @param {string} htmlPath
 * @param {Map} entryMap
 * @param {string} logoRelPath — demo-relative path (e.g. _brand/customer-logo.png)
 * @param {(href: string, htmlPath: string, entryMap: Map) => string|null} resolveZipPath
 */
function applyCustomerLogoFallback(html, htmlPath, entryMap, logoRelPath, resolveZipPath) {
  if (!logoRelPath) return html;
  let replaced = false;

  const out = String(html || '').replace(/<img\b[^>]*>/gi, (tag) => {
    if (!imgLooksLikeLogo(tag)) return tag;
    const src = (/src\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
    const brokenLocal = isBrokenLocalImgSrc(src, htmlPath, entryMap, resolveZipPath);
    const useFallback = !src || brokenLocal || /^https?:\/\//i.test(src);
    if (!useFallback) return tag;
    replaced = true;
    if (/src\s*=\s*["'][^"']*["']/i.test(tag)) {
      return tag.replace(/src\s*=\s*["'][^"']*["']/i, `src="${logoRelPath}"`);
    }
    return tag.replace(/<img\b/i, `<img src="${logoRelPath}"`);
  });

  if (replaced) return out;

  const headerRe = /<header\b[^>]*>[\s\S]*?<\/header>/i;
  const headerMatch = headerRe.exec(out);
  if (headerMatch) {
    const injected = headerMatch[0].replace(
      /(<header\b[^>]*>)/i,
      `$1\n<img class="aep-demo-customer-logo-fallback" src="${logoRelPath}" alt="logo" decoding="async" />`,
    );
    return out.replace(headerMatch[0], injected);
  }

  return out;
}

/**
 * Ensure customer logo bytes are present in the demo upload file list.
 * @returns {string|null} root-absolute Profile Viewer URL for the logo
 */
function ensureCustomerLogoDemoFile({ record, fileSlug, sandbox, scrapeId, files }) {
  return resolveCustomerLogoAsset(record, { sandbox, scrapeId }).then((asset) => {
    if (!asset || !asset.buffer || !asset.buffer.length) return null;
    const rel = `${LOGO_REL_PREFIX}${asset.ext}`;
    const name = `${fileSlug}-demo-assets/${rel}`;
    const entry = { name, content: asset.buffer, contentType: asset.contentType };
    const idx = (files || []).findIndex((f) => f && (
      f.name === name || /-demo-assets\/_brand\/customer-logo\./i.test(String(f.name))
    ));
    if (idx >= 0) files[idx] = entry;
    else files.push(entry);
    return profileViewerDemoAssetUrl(fileSlug, rel);
  });
}

/**
 * Copy scrape customer logo into an existing demo folder when the asset file is missing.
 */
async function syncCustomerLogoToExistingDemo({ fileSlug, record, sandbox, scrapeId }) {
  const bucket = getBucket();
  const slug = safeSlugPart(fileSlug);
  if (!slug) return false;
  const asset = await resolveCustomerLogoAsset(record, { sandbox, scrapeId });
  if (!asset || !asset.buffer || !asset.buffer.length) return false;
  const rel = `${LOGO_REL_PREFIX}${asset.ext}`;
  const objectPath = `profile-viewer-demos/${slug}/${slug}-demo-assets/${rel}`;
  try {
    const [exists] = await bucket.file(objectPath).exists();
    if (exists) return true;
    await bucket.file(objectPath).save(asset.buffer, {
      contentType: asset.contentType,
      resumable: false,
      metadata: { cacheControl: 'public, max-age=300' },
    });
    return true;
  } catch (e) {
    console.warn('[syncCustomerLogoToExistingDemo] failed', slug, String((e && e.message) || e));
    return false;
  }
}

module.exports = {
  stripAdvertBlocks,
  stripDocumentBaseTags,
  profileViewerDemoAssetUrl,
  downloadScrapeCustomerLogo,
  isAdBundleEntry,
  resolveCustomerLogoAsset,
  ensureCustomerLogoDemoFile,
  syncCustomerLogoToExistingDemo,
  applyCustomerLogoFallback,
  imgLooksLikeLogo,
  LOGO_REL_PREFIX,
};
