/**
 * Customer logo resolution — og:image, crawl assets, Wikipedia, then domain fallbacks:
 * Clearbit → Brandfetch → Wikidata P154 → Google favicon. SVG → PNG via Sharp.
 * Successful domain lookups are cached in GCS by domain.
 */
'use strict';

const admin = require('firebase-admin');
const wikipediaLogo = require('./brandScraperWikipediaLogo');
const { pickLogoUrl } = require('./brandScraperSlideDeck');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const SIGNED_URL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const USER_AGENT = 'AEP-Orchestration-Lab/1.0 (Adobe internal brand scraper)';
const LOGO_CACHE_PREFIX = 'logo-cache';
const OG_LOGO_MIN_SCORE = 12;
const OG_LOGO_HIGH_CONFIDENCE_SCORE = 25;

const OG_LOGO_SKIP_RE = /hero|banner|campaign|social-share|placeholder|default-og|featured-image|photograph|stock-photo|getty/i;
const OG_LOGO_BOOST_RE = /lockup|wordmark|brandmark|logotype|brand.?mark/i;

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

function safeSlug(s, fallback) {
  const v = String(s || '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return v || (fallback || 'item');
}

function normaliseUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function extractDomain(rawUrl) {
  try {
    const host = new URL(normaliseUrl(rawUrl)).hostname.replace(/^www\./i, '');
    return host || '';
  } catch (_e) {
    return '';
  }
}

async function signedUrlFor(path) {
  const [url] = await getBucket().file(path).getSignedUrl({
    action: 'read',
    expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    version: 'v4',
  });
  return url;
}

async function toPng(bytes) {
  const sharp = require('sharp');
  return sharp(bytes)
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

function isSvgContentType(ct) {
  const hay = String(ct || '').toLowerCase();
  return hay.includes('svg') || hay === 'image/svg+xml';
}

function isSvgBuffer(buf) {
  if (!buf || buf.length < 5) return false;
  const head = buf.slice(0, Math.min(buf.length, 256)).toString('utf8').trim().toLowerCase();
  return head.startsWith('<svg') || head.includes('<svg');
}

async function normaliseLogoBytes(buf, contentType) {
  if (!buf || !buf.length) return null;
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (isSvgContentType(ct) || isSvgBuffer(buf)) {
    try {
      const png = await toPng(buf);
      return { buffer: png, contentType: 'image/png', ext: 'png' };
    } catch (e) {
      console.warn('[brandScraperCustomerLogo] SVG→PNG failed', String((e && e.message) || e));
      return { buffer: buf, contentType: ct || 'image/svg+xml', ext: 'svg' };
    }
  }
  if (ct.includes('png')) return { buffer: buf, contentType: 'image/png', ext: 'png' };
  if (ct.includes('jpeg') || ct.includes('jpg')) return { buffer: buf, contentType: 'image/jpeg', ext: 'jpg' };
  if (ct.includes('webp')) return { buffer: buf, contentType: 'image/webp', ext: 'webp' };
  if (ct.includes('gif')) return { buffer: buf, contentType: 'image/gif', ext: 'gif' };
  if (ct.includes('x-icon') || ct.includes('vnd.microsoft.icon')) {
    return { buffer: buf, contentType: ct, ext: 'ico' };
  }
  return { buffer: buf, contentType: ct || 'image/png', ext: 'png' };
}

async function fetchImageBytes(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  });
  if (!res.ok) return null;
  const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (ct && !ct.startsWith('image/') && ct !== 'application/octet-stream') return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return null;
  return { buffer: buf, contentType: ct || 'image/png', sourceUrl: url };
}

async function readDomainCache(domain) {
  if (!domain) return null;
  const path = `${LOGO_CACHE_PREFIX}/${safeSlug(domain, 'domain')}.png`;
  try {
    const file = getBucket().file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    return {
      source: 'logo-cache',
      domain,
      thumbnailUrl: `gs://${BUCKET_NAME}/${path}`,
      originalUrl: `gs://${BUCKET_NAME}/${path}`,
      storedPath: path,
      cachePath: path,
      cacheHit: true,
      cachedSource: (meta.metadata && meta.metadata.logoSource) || 'unknown',
      contentType: meta.contentType || 'image/png',
    };
  } catch (_e) {
    return null;
  }
}

async function writeDomainCache(domain, buffer, contentType, source) {
  if (!domain || !buffer || !buffer.length) return null;
  const normalised = await normaliseLogoBytes(buffer, contentType);
  if (!normalised) return null;
  const path = `${LOGO_CACHE_PREFIX}/${safeSlug(domain, 'domain')}.png`;
  await getBucket().file(path).save(normalised.buffer, {
    contentType: 'image/png',
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=86400',
      metadata: { logoSource: source || 'unknown', domain },
    },
  });
  return path;
}

async function persistLogoResult(result, opts = {}) {
  const {
    sandbox,
    scrapeId,
    domain,
    persist = true,
  } = opts;

  if (!persist || !sandbox || !scrapeId) {
    return {
      ...result,
      url: result.thumbnailUrl || result.originalUrl || result.sourceUrl,
      fetchedAt: new Date().toISOString(),
    };
  }

  let buf = result.buffer;
  let contentType = result.contentType || 'image/png';
  if (!buf && (result.thumbnailUrl || result.originalUrl)) {
    const fetched = await fetchImageBytes(result.thumbnailUrl || result.originalUrl);
    if (!fetched) return null;
    buf = fetched.buffer;
    contentType = fetched.contentType;
  }
  if (!buf) return null;

  const normalised = await normaliseLogoBytes(buf, contentType);
  if (!normalised) return null;

  let storedPath = `scrapes/${safeSlug(sandbox)}/${safeSlug(scrapeId)}/customer-logo.${normalised.ext}`;
  await getBucket().file(storedPath).save(normalised.buffer, {
    contentType: normalised.contentType,
    resumable: false,
    metadata: { cacheControl: 'private, max-age=3600' },
  });

  let cachePath = null;
  if (domain && !result.cacheHit) {
    try {
      cachePath = await writeDomainCache(domain, normalised.buffer, normalised.contentType, result.source);
    } catch (e) {
      console.warn('[brandScraperCustomerLogo] domain cache write failed', String((e && e.message) || e));
    }
  }

  const signed = await signedUrlFor(storedPath);
  return {
    ...result,
    url: signed,
    thumbnailUrl: signed,
    storedPath,
    cachePath,
    signedUrlExpiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_MS).toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}

async function tryCrawlAssetsLogo(assets) {
  const url = pickLogoUrl(assets);
  if (!url) return null;
  const fetched = await fetchImageBytes(url);
  if (!fetched) return null;
  return {
    source: 'crawl-assets',
    thumbnailUrl: url,
    originalUrl: url,
    sourceUrl: url,
    buffer: fetched.buffer,
    contentType: fetched.contentType,
  };
}

function ogImageUrlFromEntry(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  return String(entry.url || entry.href || entry.src || '').trim();
}

/**
 * Score an og:image / twitter:image URL for logo-likeness (path/filename heuristics).
 * @param {string} url
 * @returns {number}
 */
function scoreOgImageLogoUrl(url) {
  const hay = String(url || '').toLowerCase();
  if (!hay || !/^https?:\/\//i.test(hay)) return -99;
  if (OG_LOGO_SKIP_RE.test(hay)) return -50;

  let score = 0;
  if (/lockup/.test(hay)) score += 35;
  if (/logo/.test(hay)) score += 28;
  if (OG_LOGO_BOOST_RE.test(hay)) score += 18;
  if (/\bbrand\b/.test(hay) && !/rebrand/.test(hay)) score += 8;
  if (/\.svg($|\?|#)/i.test(hay)) score += 6;
  if (/\.png($|\?|#)/i.test(hay)) score += 4;
  if (/favicon|icon-/.test(hay)) score -= 8;

  // Generic OG social card dimensions — deprioritise unless filename looks like a logo
  if (/width=1200.*height=630|1200x630|og-image/.test(hay) && score < 20) score -= 6;

  return score;
}

/**
 * Rank og:image URLs from crawl assets by logo-likeness.
 * @param {object} assets
 * @param {number} limit
 * @returns {Array<{ url: string, score: number }>}
 */
function rankOgImageLogoUrls(assets, limit = 6) {
  const raw = (assets && assets.ogImages) || [];
  const seen = new Set();
  const ranked = [];

  for (const entry of raw) {
    const url = ogImageUrlFromEntry(entry);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const score = scoreOgImageLogoUrl(url);
    if (score > 0) ranked.push({ url, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

function pickOgImageLogoUrl(assets) {
  const ranked = rankOgImageLogoUrls(assets, 1);
  const best = ranked[0];
  if (!best || best.score < OG_LOGO_MIN_SCORE) return null;
  return best.url;
}

async function tryOgImageLogo(assets) {
  const ranked = rankOgImageLogoUrls(assets);
  if (!ranked.length) return null;

  for (const { url, score } of ranked) {
    if (score < OG_LOGO_MIN_SCORE) break;
    const fetched = await fetchImageBytes(url);
    if (!fetched) continue;
    return {
      source: score >= OG_LOGO_HIGH_CONFIDENCE_SCORE ? 'og-image-logo' : 'og-image',
      thumbnailUrl: url,
      originalUrl: url,
      sourceUrl: url,
      buffer: fetched.buffer,
      contentType: fetched.contentType,
      ogImageScore: score,
    };
  }
  return null;
}

async function tryWikipediaLogo(customerName, country) {
  const wiki = await wikipediaLogo.searchWikipediaPage(customerName, { country });
  if (!wiki || !wiki.thumbnailUrl) return null;
  return {
    source: wiki.source || 'wikipedia',
    query: customerName,
    wikipediaTitle: wiki.title,
    wikipediaUrl: wiki.pageUrl,
    thumbnailUrl: wiki.thumbnailUrl,
    originalUrl: wiki.originalUrl,
    imageFile: wiki.imageFile || null,
  };
}

async function tryClearbitLogo(domain) {
  if (!domain) return null;
  const url = `https://logo.clearbit.com/${encodeURIComponent(domain)}`;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return null;
  return {
    source: 'clearbit',
    domain,
    thumbnailUrl: url,
    originalUrl: url,
    sourceUrl: url,
    buffer: buf,
    contentType: (res.headers.get('content-type') || 'image/png').split(';')[0].trim(),
  };
}

function pickBrandfetchLogoUrl(data) {
  const logos = Array.isArray(data && data.logos) ? data.logos : [];
  const ranked = [];
  for (const logo of logos) {
    const type = String(logo.type || '').toLowerCase();
    const formats = Array.isArray(logo.formats) ? logo.formats : [];
    for (const fmt of formats) {
      const src = fmt && fmt.src;
      if (!src) continue;
      let score = 0;
      if (type === 'logo' || type === 'symbol') score += 20;
      if (type === 'icon') score += 8;
      const format = String(fmt.format || '').toLowerCase();
      if (format === 'png') score += 6;
      if (format === 'svg') score += 4;
      if (/theme.*dark/i.test(String(fmt.theme || ''))) score -= 2;
      ranked.push({ url: src, score, format });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].url;
}

async function tryBrandfetchLogo(domain, apiKey) {
  if (!domain || !apiKey) return null;
  const res = await fetch(`https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': USER_AGENT,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  let data;
  try {
    data = await res.json();
  } catch (_e) {
    return null;
  }
  const logoUrl = pickBrandfetchLogoUrl(data);
  if (!logoUrl) return null;
  const fetched = await fetchImageBytes(logoUrl);
  if (!fetched) return null;
  return {
    source: 'brandfetch',
    domain,
    thumbnailUrl: logoUrl,
    originalUrl: logoUrl,
    sourceUrl: logoUrl,
    buffer: fetched.buffer,
    contentType: fetched.contentType,
  };
}

async function tryWikidataLogoByName(customerName) {
  const wd = await wikipediaLogo.searchWikidataLogoByName(customerName);
  if (!wd || !wd.thumbnailUrl) return null;
  return {
    source: wd.source || 'wikidata-p154',
    query: customerName,
    wikipediaTitle: wd.title || null,
    wikipediaUrl: wd.pageUrl || null,
    thumbnailUrl: wd.thumbnailUrl,
    originalUrl: wd.originalUrl,
    imageFile: wd.imageFile || null,
  };
}

async function tryGoogleFavicon(domain) {
  if (!domain) return null;
  const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  const fetched = await fetchImageBytes(url);
  if (!fetched) return null;
  return {
    source: 'google-favicon',
    domain,
    thumbnailUrl: url,
    originalUrl: url,
    sourceUrl: url,
    buffer: fetched.buffer,
    contentType: fetched.contentType,
  };
}

const SOURCE_LABELS = {
  'og-image': 'Customer logo (Open Graph)',
  'og-image-logo': 'Customer logo (Open Graph lockup)',
  'crawl-assets': 'Customer logo (crawl assets)',
  wikipedia: 'Customer logo (Wikipedia)',
  'wikipedia-title': 'Customer logo (Wikipedia)',
  'wikipedia-search': 'Customer logo (Wikipedia)',
  'wikipedia-pageimage': 'Customer logo (Wikipedia)',
  'wikipedia-file': 'Customer logo (Wikipedia)',
  'wikidata-p154': 'Customer logo (Wikidata)',
  clearbit: 'Customer logo (Clearbit)',
  brandfetch: 'Customer logo (Brandfetch)',
  'google-favicon': 'Customer logo (Google favicon)',
  'logo-cache': 'Customer logo (cached)',
};

function sourceStepLabel(source) {
  return SOURCE_LABELS[source] || 'Customer logo';
}

function sourceStepDetail(result, fallbackQuery) {
  if (result.ogImageScore && (result.sourceUrl || result.thumbnailUrl)) {
    try {
      const path = new URL(result.sourceUrl || result.thumbnailUrl).pathname.split('/').pop();
      if (path) return decodeURIComponent(path);
    } catch (_e) { /* ignore */ }
  }
  if (result.wikipediaTitle) return result.wikipediaTitle;
  if (result.domain) return result.domain;
  if (result.cachedSource) return `${result.domain || fallbackQuery} (${result.cachedSource})`;
  return fallbackQuery || result.source || '';
}

/**
 * @param {string} customerName
 * @param {{
 *   url?: string,
 *   domain?: string,
 *   crawlAssets?: object,
 *   country?: string,
 *   sandbox?: string,
 *   scrapeId?: string,
 *   persist?: boolean,
 *   brandfetchApiKey?: string,
 * }} opts
 */
async function resolveCustomerLogo(customerName, opts = {}) {
  const query = String(customerName || '').trim();
  const domain = String(opts.domain || extractDomain(opts.url) || '').trim();
  const country = opts.country || '';
  const brandfetchKey = String(
    opts.brandfetchApiKey || process.env.BRANDFETCH_API_KEY || '',
  ).trim();

  const attempts = [];

  if (opts.crawlAssets) {
    attempts.push(() => tryOgImageLogo(opts.crawlAssets));
    attempts.push(() => tryCrawlAssetsLogo(opts.crawlAssets));
  }
  if (query) {
    attempts.push(() => tryWikipediaLogo(query, country));
  }
  if (domain) {
    attempts.push(async () => {
      const cached = await readDomainCache(domain);
      if (!cached) return null;
      return cached;
    });
    attempts.push(() => tryClearbitLogo(domain));
    attempts.push(() => tryBrandfetchLogo(domain, brandfetchKey));
  }
  if (query) {
    attempts.push(() => tryWikidataLogoByName(query));
  }
  if (domain) {
    attempts.push(() => tryGoogleFavicon(domain));
  }

  for (const attempt of attempts) {
    let hit;
    try {
      hit = await attempt();
    } catch (e) {
      console.warn('[brandScraperCustomerLogo] source failed', String((e && e.message) || e));
      continue;
    }
    if (!hit) continue;

    if (hit.cacheHit) {
      const persisted = await persistLogoResult(hit, {
        sandbox: opts.sandbox,
        scrapeId: opts.scrapeId,
        domain,
        persist: opts.persist,
      });
      if (persisted) {
        return {
          ...persisted,
          source: 'logo-cache',
          domain,
          cacheHit: true,
          cachedSource: hit.cachedSource,
        };
      }
      continue;
    }

    const persisted = await persistLogoResult(hit, {
      sandbox: opts.sandbox,
      scrapeId: opts.scrapeId,
      domain,
      persist: opts.persist,
    });
    if (persisted) return persisted;
  }

  return null;
}

module.exports = {
  extractDomain,
  normaliseLogoBytes,
  pickBrandfetchLogoUrl,
  scoreOgImageLogoUrl,
  rankOgImageLogoUrls,
  pickOgImageLogoUrl,
  sourceStepLabel,
  sourceStepDetail,
  resolveCustomerLogo,
  tryOgImageLogo,
  tryClearbitLogo,
  tryBrandfetchLogo,
  tryGoogleFavicon,
  readDomainCache,
  writeDomainCache,
};
