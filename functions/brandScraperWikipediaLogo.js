/**
 * Resolve customer logos from Wikipedia page images and optionally persist to GCS.
 */
'use strict';

const admin = require('firebase-admin');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const SIGNED_URL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const USER_AGENT = 'AEP-Orchestration-Lab/1.0 (Adobe internal brand scraper)';

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

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia API HTTP ${res.status}`);
  return res.json();
}

/**
 * @param {string} query — customer / brand name to search
 * @returns {Promise<{ title: string, pageUrl: string, thumbnailUrl: string, originalUrl: string } | null>}
 */
async function searchWikipediaPage(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  const api = new URL('https://en.wikipedia.org/w/api.php');
  api.searchParams.set('action', 'query');
  api.searchParams.set('format', 'json');
  api.searchParams.set('generator', 'search');
  api.searchParams.set('gsrsearch', q);
  api.searchParams.set('gsrlimit', '1');
  api.searchParams.set('prop', 'pageimages|info');
  api.searchParams.set('inprop', 'url');
  api.searchParams.set('piprop', 'thumbnail|original');
  api.searchParams.set('pithumbsize', '400');

  const data = await fetchJson(api.toString());
  const pages = data.query && data.query.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || page.pageid == null || page.missing !== undefined) return null;

  const thumb = page.thumbnail && page.thumbnail.source;
  const original = page.original && page.original.source;
  const imageUrl = original || thumb;
  if (!imageUrl) return null;

  return {
    title: page.title,
    pageUrl: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`,
    thumbnailUrl: thumb || imageUrl,
    originalUrl: original || thumb,
  };
}

async function signedUrlFor(path) {
  const [url] = await getBucket().file(path).getSignedUrl({
    action: 'read',
    expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    version: 'v4',
  });
  return url;
}

/**
 * @param {string} customerName
 * @param {{ sandbox?: string, scrapeId?: string, persist?: boolean }} opts
 */
async function fetchCustomerLogo(customerName, opts = {}) {
  const query = String(customerName || '').trim();
  if (!query) return null;

  const wiki = await searchWikipediaPage(query);
  if (!wiki || !wiki.thumbnailUrl) return null;

  let url = wiki.thumbnailUrl;
  let storedPath = null;
  let signedUrlExpiresAt = null;

  if (opts.persist !== false && opts.sandbox && opts.scrapeId) {
    try {
      const imgRes = await fetch(wiki.thumbnailUrl, { headers: { 'User-Agent': USER_AGENT } });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const ct = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        const ext = ct.includes('png') ? 'png' : ct.includes('svg') ? 'svg' : 'jpg';
        storedPath = `scrapes/${safeSlug(opts.sandbox)}/${safeSlug(opts.scrapeId)}/customer-logo.${ext}`;
        await getBucket().file(storedPath).save(buf, {
          contentType: ct,
          resumable: false,
          metadata: { cacheControl: 'private, max-age=3600' },
        });
        url = await signedUrlFor(storedPath);
        signedUrlExpiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_MS).toISOString();
      }
    } catch (e) {
      console.warn('[brandScraperWikipediaLogo] GCS store failed — using Wikipedia URL', String((e && e.message) || e));
    }
  }

  return {
    source: 'wikipedia',
    query,
    wikipediaTitle: wiki.title,
    wikipediaUrl: wiki.pageUrl,
    thumbnailUrl: wiki.thumbnailUrl,
    originalUrl: wiki.originalUrl,
    url,
    storedPath,
    signedUrlExpiresAt,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  searchWikipediaPage,
  fetchCustomerLogo,
};
