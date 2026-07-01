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
const OVERLAY_MARKUP_RE = /sp_message|sourcepoint|onetrust|didomi|cookiebot|quantcast|consent-message|paywall|subscription-modal|newsletter-modal|tp-modal|piano-|evidon|trustarc|iubenda|usercentrics|sp_consent|cmp-/i;
const IFRAME_EMBED_ALLOW_RE = /youtube\.com|youtu\.be|youtube-nocookie|vimeo\.com|dailymotion\.com|player\.brightcove/i;
const OVERLAY_SCRIPT_SRC_RE = /sourcepoint|spmsg|onetrust|didomi|cookiebot|quantcast|trustarc|evidon|iubenda|usercentrics|piano\.io|tinypass|paywall|consent/i;

/** 1×1 transparent GIF — served for missing demo image assets instead of plain-text 404. */
const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const EMPTY_HTML_BODY = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body></body></html>';

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
 * Skip ad / consent iframe HTML saved inside Chrome _files/ bundles.
 * @param {string} name
 * @param {Buffer} [content]
 */
function isOverlayBundleEntry(name, content) {
  const n = posixNorm(name);
  if (!n) return false;
  if (AD_IFRAME_HTML_HEAD_RE.test(n)) return true;
  if (/doubleclick|googlesyndication|adservice|ad-doubleclick|sadbundle/i.test(n)) return true;
  if (content && /\.html?$/i.test(n)) {
    const head = entryHead(content);
    if (AD_IFRAME_HTML_HEAD_RE.test(head)) return true;
    if (OVERLAY_MARKUP_RE.test(head) || OVERLAY_SCRIPT_SRC_RE.test(head)) return true;
    if (/SP Consent Message|consent message|privacy manager/i.test(head)) return true;
  }
  return false;
}

function isAdBundleEntry(name, content) {
  return isOverlayBundleEntry(name, content);
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

function isOverlayOrConsentMarkup(tag) {
  const hay = String(tag || '');
  if (OVERLAY_MARKUP_RE.test(hay)) return true;
  if (/\brole\s*=\s*["']dialog["']/i.test(hay) && /\baria-modal\s*=\s*["']true["']/i.test(hay)) return true;
  return false;
}

/**
 * Strip iframes that break demos (ads, consent CMP, paywall modals, saved ad bundles).
 * Keeps a small allowlist (YouTube/Vimeo embeds).
 */
function shouldStripIframe(tag) {
  const hay = String(tag || '');
  if (isAdElementMarkup(hay)) return true;
  if (isOverlayOrConsentMarkup(hay)) return true;
  const src = (/src\s*=\s*["']([^"']*)["']/i.exec(hay) || [])[1] || '';
  if (!src || /^about:blank/i.test(src)) return true;
  if (IFRAME_EMBED_ALLOW_RE.test(src)) return false;
  if (/page-files\/|_files\/|index\.html|consent|message|modal|paywall|subscription|cmp/i.test(src)) return true;
  if (AD_SRC_RE.test(src)) return true;
  // Default: drop third-party iframes — they often 404 in the demo host and render "not found".
  if (/^https?:\/\//i.test(src)) return true;
  return false;
}

function stripOverlayAndConsentBlocks(html) {
  let out = String(html || '');

  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (tag) => (shouldStripIframe(tag) ? '' : tag));
  out = out.replace(/<iframe\b[^>]*\/>/gi, (tag) => (shouldStripIframe(tag) ? '' : tag));

  out = out.replace(
    /<script\b[^>]*src\s*=\s*["'][^"']*(?:sourcepoint|spmsg|onetrust|didomi|cookiebot|quantcast|trustarc|evidon|piano|tinypass|paywall)[^"']*["'][^>]*>\s*<\/script>/gi,
    '',
  );

  out = out.replace(
    /<div\b[^>]*\bid\s*=\s*["'][^"']*(?:sp_message|onetrust|didomi|cookie|consent|paywall|subscription|newsletter|tp-modal)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
    (block) => (block.length > 50000 ? block : ''),
  );

  out = out.replace(
    /<aside\b[^>]*>[\s\S]*?<\/aside>/gi,
    (block) => (OVERLAY_MARKUP_RE.test(block) && block.length < 20000 ? '' : block),
  );

  return out;
}

function injectDemoFailsafeStyles(html) {
  const css = [
    '#sp_message_container,[id^="sp_message_"],[id*="sp_message"]{display:none!important;visibility:hidden!important;pointer-events:none!important;height:0!important;overflow:hidden!important;}',
    '#onetrust-banner-sdk,#onetrust-consent-sdk,#didomi-host,.tp-modal,[class*="paywall"],[class*="subscription-modal"]{display:none!important;visibility:hidden!important;}',
    'body.modal-open,html.modal-open{overflow:auto!important;position:static!important;}',
    'img.aep-demo-video-poster{max-width:100%;height:auto;display:block;object-fit:cover;}',
    '.video-content-container:has(img.aep-demo-video-poster){min-height:0!important;aspect-ratio:auto!important;}',
    '.video-content-container:has(img.aep-demo-video-poster) video{display:none!important;}',
    'video:not([src]):not([poster]){display:none!important;height:0!important;min-height:0!important;}',
  ].join('');
  const block = `<style id="aep-demo-overlay-failsafe">${css}</style>`;
  const h = String(html || '');
  if (/<\/head>/i.test(h)) return h.replace(/<\/head>/i, `${block}\n</head>`);
  return block + h;
}

/**
 * Full HTML polish pass for brand-scraper demo snapshots.
 * @param {string} html
 */
function polishDemoHtml(html) {
  let out = stripAdvertBlocks(html);
  out = stripOverlayAndConsentBlocks(out);
  out = replaceBrokenVideosWithPoster(out);
  out = injectDemoFailsafeStyles(out);
  return out;
}

const LAZY_PLACEHOLDER_SRC_RE = /^(data:image\/|about:blank)/i;
const LAZY_PLACEHOLDER_SRC_PATH_RE = /blank\.(gif|png)|placeholder|1x1|spacer|pixel|transparent/i;

function attrValue(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`, 'i').exec(String(tag || ''));
  return m ? m[2] : '';
}

function setAttr(tag, name, value) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])[^"']*\\1`, 'i');
  const safe = String(value || '').replace(/"/g, '&quot;');
  if (re.test(tag)) return tag.replace(re, `${name}="${safe}"`);
  return tag.replace(/<img\b/i, `<img ${name}="${safe}"`);
}

function isLazyPlaceholderSrc(src) {
  const s = String(src || '').trim();
  if (!s) return true;
  if (LAZY_PLACEHOLDER_SRC_RE.test(s)) return true;
  if (LAZY_PLACEHOLDER_SRC_PATH_RE.test(s)) return true;
  if (/^data:image\/svg/i.test(s)) return true;
  return false;
}

function firstUrlFromSrcset(srcset) {
  const part = String(srcset || '').split(',')[0].trim();
  if (!part) return '';
  return part.split(/\s+/)[0] || '';
}

/**
 * Copy data-src / lazy placeholders onto src so fetch + rewrite can reach real image URLs.
 * @param {string} html
 */
function promoteLazyImages(html) {
  return String(html || '').replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attrValue(tag, 'src');
    const lazy = attrValue(tag, 'data-src')
      || attrValue(tag, 'data-lazy-src')
      || attrValue(tag, 'data-original')
      || attrValue(tag, 'data-image');
    if (!lazy) return tag;
    if (!isLazyPlaceholderSrc(src)) return tag;
    return setAttr(tag, 'src', lazy);
  });
}

/**
 * When <picture> uses <source srcset> only, ensure <img> has a concrete src for static demos.
 * @param {string} html
 */
function promotePictureSources(html) {
  return String(html || '').replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, (block) => {
    const imgTag = (/<img\b[^>]*>/i.exec(block) || [])[0];
    if (!imgTag) return block;
    const src = attrValue(imgTag, 'src');
    if (src && !isLazyPlaceholderSrc(src)) return block;

    let pick = '';
    const sourceTag = (/<source\b[^>]*>/i.exec(block) || [])[0];
    if (sourceTag) {
      pick = firstUrlFromSrcset(attrValue(sourceTag, 'srcset'))
        || firstUrlFromSrcset(attrValue(sourceTag, 'data-srcset'))
        || attrValue(sourceTag, 'src');
    }
    if (!pick) {
      pick = firstUrlFromSrcset(attrValue(imgTag, 'srcset'))
        || firstUrlFromSrcset(attrValue(imgTag, 'data-srcset'));
    }
    if (!pick) return block;

    const nextImg = setAttr(imgTag, 'src', pick);
    return block.replace(imgTag, nextImg);
  });
}

function videoBlockIsPlayable(block) {
  const openTag = (/<video\b[^>]*>/i.exec(block) || [])[0] || '';
  const src = attrValue(openTag, 'src');
  if (src && !/^blob:/i.test(src) && !/\.m3u8|\.mpd/i.test(src)) return true;
  if (/<source\b[^>]*\ssrc\s*=\s*["'][^"']*\.(mp4|webm|ogg)/i.test(block)) return true;
  return false;
}

/**
 * HLS/DRM video players leave large empty boxes in static demos — show poster frame instead.
 * @param {string} html
 */
function replaceBrokenVideosWithPoster(html) {
  return String(html || '').replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, (block) => {
    if (videoBlockIsPlayable(block)) return block;
    const openTag = (/<video\b[^>]*>/i.exec(block) || [])[0] || '';
    const poster = attrValue(openTag, 'poster');
    if (!poster) return '';
    const hiddenPosterImg = (/<img\b[^>]*\bid\s*=\s*["'][^"']*poster[^"']*["'][^>]*>/i.exec(block) || [])[0];
    const posterFromImg = hiddenPosterImg ? attrValue(hiddenPosterImg, 'src') : '';
    const usePoster = poster || posterFromImg;
    if (!usePoster) return '';
    return `<img class="aep-demo-video-poster" src="${String(usePoster).replace(/"/g, '&quot;')}" alt="" loading="lazy" decoding="async" />`;
  });
}

/**
 * Remove ad iframes, ad network scripts, and common ad containers from saved HTML.
 * @param {string} html
 */
function stripAdvertBlocks(html) {
  let out = String(html || '');

  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (tag) => (shouldStripIframe(tag) ? '' : tag));
  out = out.replace(/<iframe\b[^>]*\/>/gi, (tag) => (shouldStripIframe(tag) ? '' : tag));

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

  const out = String(html || '').replace(/<img\b[^>]*>/gi, (tag) => {
    if (!imgLooksLikeLogo(tag)) return tag;
    const src = (/src\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
    const brokenLocal = isBrokenLocalImgSrc(src, htmlPath, entryMap, resolveZipPath);
    const useFallback = !src || brokenLocal || /^https?:\/\//i.test(src);
    if (!useFallback) return tag;
    let next = tag;
    if (/src\s*=\s*["'][^"']*["']/i.test(next)) {
      next = next.replace(/src\s*=\s*["'][^"']*["']/i, `src="${logoRelPath}"`);
    } else {
      next = next.replace(/<img\b/i, `<img src="${logoRelPath}"`);
    }
    if (!/class\s*=/i.test(next)) {
      return next.replace(/<img\b/i, '<img class="aep-demo-customer-logo-fallback"');
    }
    if (!/aep-demo-customer-logo-fallback/i.test(next)) {
      return next.replace(/class\s*=\s*["']([^"']*)["']/i, 'class="$1 aep-demo-customer-logo-fallback"');
    }
    return next;
  });

  return injectDemoLogoStyles(out);
}

function injectDemoLogoStyles(html) {
  const css = [
    'img.aep-demo-customer-logo-fallback,',
    'img[src*="/_brand/customer-logo"]{',
    'max-height:48px;max-width:min(200px,40vw);width:auto;height:auto;',
    'object-fit:contain;vertical-align:middle;',
    '}',
  ].join('');
  const block = `<style id="aep-demo-logo-polish">${css}</style>`;
  const h = String(html || '');
  if (/<\/head>/i.test(h)) return h.replace(/<\/head>/i, `${block}\n</head>`);
  return block + h;
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
  stripOverlayAndConsentBlocks,
  polishDemoHtml,
  promoteLazyImages,
  promotePictureSources,
  replaceBrokenVideosWithPoster,
  stripDocumentBaseTags,
  profileViewerDemoAssetUrl,
  downloadScrapeCustomerLogo,
  isAdBundleEntry,
  isOverlayBundleEntry,
  shouldStripIframe,
  resolveCustomerLogoAsset,
  ensureCustomerLogoDemoFile,
  syncCustomerLogoToExistingDemo,
  applyCustomerLogoFallback,
  injectDemoLogoStyles,
  imgLooksLikeLogo,
  LOGO_REL_PREFIX,
  TRANSPARENT_GIF,
  EMPTY_HTML_BODY,
};
