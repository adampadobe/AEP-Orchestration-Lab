/**
 * Builds and stores the per-demo "training corpus" behind the Gemini
 * Brand Concierge override (see web/profile-viewer/embed-bc/embed-bc-gemini-override.js).
 *
 * Reuses the existing single-URL brand scraper (brandScraperService.crawlSite) —
 * looped once per website in the caller's list — rather than reimplementing
 * crawl/extraction logic. Kept intentionally synchronous (no Firestore-status
 * polling) for v1: a handful of sites at a shallow maxPages completes well
 * within the timeout budget below. If CSVs grow large enough to need a
 * background job, follow brandScraperService.handleAnalyse's 202+poll pattern.
 */

'use strict';

const admin = require('firebase-admin');
const { crawlSite } = require('./brandScraperService');
const { setCors } = require('./httpCors');

const COLLECTION = 'bcGeminiTraining';
const MAX_SITES_PER_TRAIN = 15;
const MAX_PRODUCTS_STORED = 500;
const MAX_MANIFEST_CHARS = 20000;
const MAX_CORPUS_TEXT_CHARS = 20000;
const MAX_CORPUS_IMAGES = 30;
const PER_SITE_MAX_PAGES = 2;
const PER_SITE_WALL_MS = 30000;

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function sandboxKeyFrom(sandbox) {
  const raw = String(sandbox || '').trim().toLowerCase();
  return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
}

function demoPrefixKeyFrom(demoPrefix) {
  const raw = String(demoPrefix || '').trim().toLowerCase();
  return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : 'default';
}

function corpusDocId(sandbox, demoPrefix) {
  return `${sandboxKeyFrom(sandbox)}__${demoPrefixKeyFrom(demoPrefix)}`;
}

/** Firestore rejects `undefined` — mirror brandScrapeStore's null-substitution approach. */
function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      const v = stripUndefined(value[k]);
      out[k] = v === undefined ? null : v;
    }
    return out;
  }
  return value;
}

async function scrapeOneSite(url) {
  const crawl = await crawlSite(url, {
    maxPages: PER_SITE_MAX_PAGES,
    tagAudit: false,
    maxWallMs: PER_SITE_WALL_MS,
  });
  const text = (crawl.pages || [])
    .map((p) => `# ${p.title || p.url}\n${p.text || ''}`)
    .join('\n\n')
    .trim();
  const images = (crawl.assets && crawl.assets.images) || [];
  return {
    url,
    brandName: crawl.brandName || '',
    text,
    imageUrls: images.map((i) => (typeof i === 'string' ? i : i && i.url)).filter(Boolean),
    pageCount: (crawl.pages || []).length,
    failureCount: (crawl.failures || []).length,
  };
}

const PRODUCT_STRING_FIELD_MAX = 2000;

/** Accepts a bare string (legacy "one name per line" shape) or a structured product object. */
function sanitiseProduct(p) {
  if (typeof p === 'string') {
    const name = p.trim();
    return name ? { productName: name.slice(0, PRODUCT_STRING_FIELD_MAX) } : null;
  }
  if (!p || typeof p !== 'object') return null;
  const out = {};
  if (p.productID) out.productID = String(p.productID).trim().slice(0, PRODUCT_STRING_FIELD_MAX);
  if (p.productName) out.productName = String(p.productName).trim().slice(0, PRODUCT_STRING_FIELD_MAX);
  if (p.productDescription) out.productDescription = String(p.productDescription).trim().slice(0, PRODUCT_STRING_FIELD_MAX);
  if (p.productPageURL) out.productPageURL = String(p.productPageURL).trim().slice(0, PRODUCT_STRING_FIELD_MAX);
  if (p.productImageURL) out.productImageURL = String(p.productImageURL).trim().slice(0, PRODUCT_STRING_FIELD_MAX);
  return out.productName ? out : null;
}

function buildCorpus(siteResults, products, manifestText) {
  const successfulSites = siteResults.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const failedSites = siteResults
    .map((s, i) => (s.status === 'rejected' ? { url: s.reason && s.reason.url, error: String(s.reason && s.reason.message || s.reason) } : null))
    .filter(Boolean);

  let text = successfulSites.map((s) => s.text).join('\n\n---\n\n');
  if (text.length > MAX_CORPUS_TEXT_CHARS) text = text.slice(0, MAX_CORPUS_TEXT_CHARS);

  const images = [];
  successfulSites.forEach((s) => {
    s.imageUrls.forEach((u) => {
      if (images.length < MAX_CORPUS_IMAGES) images.push(u);
    });
  });

  const brandNames = Array.from(new Set(successfulSites.map((s) => s.brandName).filter(Boolean)));

  return {
    text,
    images,
    brandNames,
    sitesScraped: successfulSites.map((s) => ({ url: s.url, pageCount: s.pageCount })),
    sitesFailed: failedSites,
    products: (products || []).slice(0, MAX_PRODUCTS_STORED),
    manifestText: String(manifestText || '').slice(0, MAX_MANIFEST_CHARS),
  };
}

async function handleTrain(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }

  const body = req.body || {};
  const sandbox = String(body.sandbox || '').trim();
  const demoPrefix = String(body.demoPrefix || '').trim();
  if (!sandbox || !demoPrefix) {
    res.status(400).json({ ok: false, error: 'sandbox and demoPrefix are required' });
    return;
  }

  const websiteUrls = Array.isArray(body.websiteUrls)
    ? body.websiteUrls.map((u) => String(u || '').trim()).filter(Boolean).slice(0, MAX_SITES_PER_TRAIN)
    : [];
  // Accept the current structured `products` field, falling back to the legacy
  // `productNames` (bare string array) shape in case of client/CDN version skew.
  const rawProducts = Array.isArray(body.products)
    ? body.products
    : Array.isArray(body.productNames)
      ? body.productNames
      : [];
  const products = rawProducts.map(sanitiseProduct).filter(Boolean).slice(0, MAX_PRODUCTS_STORED);
  const manifestText = String(body.manifestText || '');

  if (!websiteUrls.length && !products.length && !manifestText.trim()) {
    res.status(400).json({ ok: false, error: 'Provide at least one of websiteUrls, products, or manifestText' });
    return;
  }

  try {
    const siteResults = await Promise.allSettled(
      websiteUrls.map((url) =>
        scrapeOneSite(url).catch((err) => {
          err.url = url;
          throw err;
        }),
      ),
    );

    const corpus = buildCorpus(siteResults, products, manifestText);
    const docId = corpusDocId(sandbox, demoPrefix);
    const record = stripUndefined({
      sandbox,
      demoPrefix,
      websiteUrls,
      products,
      corpus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await getDb().collection(COLLECTION).doc(docId).set(record, { merge: false });

    res.status(200).json({
      ok: true,
      sandbox,
      demoPrefix,
      siteCount: corpus.sitesScraped.length,
      siteFailures: corpus.sitesFailed,
      productCount: corpus.products.length,
      corpusTextChars: corpus.text.length,
      imageCount: corpus.images.length,
    });
  } catch (err) {
    console.error('[bcGeminiTrain] error', err);
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}

module.exports = { handleTrain, corpusDocId, COLLECTION };
