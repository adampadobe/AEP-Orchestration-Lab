/**
 * Bridges demo prep (an existing brand scrape record, functions/brandScrapeStore.js)
 * straight into the Gemini Brand Concierge override (functions/bcGeminiTrainingService.js) —
 * no manual CSV upload needed. Also builds a downloadable ZIP (websites.csv, products.csv,
 * notes.txt) usable either as a Gemini-override training drop or as a direct upload to
 * Adobe's real Brand Concierge admin console (products.csv matches its sample-catalog.csv
 * column layout).
 *
 * Reuses the scrape's already-crawled page text (record.crawlSummary.pages[]) instead of
 * re-crawling the site, and derives a product list from classified images
 * (record.crawlSummary.assets.imagesV2[], see functions/brandScraperAssetsV2.js) tagged
 * 'product', 'hero_banner', or 'lifestyle'. There is no per-image source-page tracking in
 * the scrape record, so productPageURL falls back to the site's base URL rather than a
 * specific product page.
 */

'use strict';

const archiver = require('archiver');
const { getScrape } = require('./brandScrapeStore');
const { getBucket } = require('./brandScraperAssetsV2');
const { setCors } = require('./httpCors');
const { runTrain } = require('./bcGeminiTrainingService');

const PRODUCT_CLASSIFICATIONS = new Set(['product', 'hero_banner', 'lifestyle']);
const MAX_PREP_PRODUCTS = 40;
const EXPIRY_MS = 72 * 60 * 60 * 1000;

function deriveWebsiteUrl(record) {
  return String(record.baseUrl || record.url || '').trim();
}

function derivePrebuiltSiteResult(record, url) {
  const pages = Array.isArray(record.crawlSummary && record.crawlSummary.pages) ? record.crawlSummary.pages : [];
  const text = pages.map((p) => `# ${p.title || p.url}\n${p.text || ''}`).join('\n\n').trim();
  const imagesV2 = (record.crawlSummary && record.crawlSummary.assets && record.crawlSummary.assets.imagesV2) || [];
  return {
    url,
    brandName: record.brandName || '',
    text,
    imageUrls: imagesV2.map((i) => i.src).filter(Boolean),
    pageCount: pages.length,
    failureCount: 0,
  };
}

function deriveProducts(record, baseUrl) {
  const imagesV2 = (record.crawlSummary && record.crawlSummary.assets && record.crawlSummary.assets.imagesV2) || [];
  const candidates = imagesV2.filter(
    (img) => img && !img.error && PRODUCT_CLASSIFICATIONS.has(img.classification) && (img.src || img.publicUrl),
  );
  return candidates.slice(0, MAX_PREP_PRODUCTS).map((img, i) => {
    const name = (img.alt && img.alt.trim()) || `${record.brandName || 'Featured'} item ${i + 1}`;
    const out = { productName: name.slice(0, 200) };
    const imageUrl = img.src || img.publicUrl;
    if (imageUrl) out.productImageURL = imageUrl;
    if (baseUrl) out.productPageURL = baseUrl;
    return out;
  });
}

function deriveManifestText(record) {
  const a = record.analysis || {};
  const parts = [];
  if (a.about) parts.push(a.about);
  const values = Array.isArray(a.brand_values) ? a.brand_values : [];
  if (values.length) {
    parts.push(`Brand values: ${values.map((v) => v.value).filter(Boolean).join(', ')}`);
  }
  const tone = Array.isArray(a.tone_of_voice) ? a.tone_of_voice : [];
  if (tone.length) {
    parts.push(`Tone of voice: ${tone.map((t) => t.rule).filter(Boolean).join('; ')}`);
  }
  return parts.join('\n\n').slice(0, 8000);
}

async function loadPrepInputs(sandbox, scrapeId) {
  const record = await getScrape(sandbox, scrapeId);
  if (!record) return null;
  const baseUrl = deriveWebsiteUrl(record);
  return {
    record,
    websiteUrls: baseUrl ? [baseUrl] : [],
    prebuiltSiteResults: baseUrl ? [derivePrebuiltSiteResult(record, baseUrl)] : [],
    products: deriveProducts(record, baseUrl),
    manifestText: deriveManifestText(record),
  };
}

async function handlePrepTrain(req, res) {
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
  const scrapeId = String(body.scrapeId || '').trim();
  if (!sandbox || !demoPrefix || !scrapeId) {
    res.status(400).json({ ok: false, error: 'sandbox, demoPrefix, and scrapeId are required' });
    return;
  }

  try {
    const inputs = await loadPrepInputs(sandbox, scrapeId);
    if (!inputs) {
      res.status(404).json({ ok: false, error: 'Scrape not found for that sandbox/scrapeId' });
      return;
    }
    if (!inputs.websiteUrls.length && !inputs.products.length && !inputs.manifestText) {
      res.status(400).json({
        ok: false,
        error: 'Scrape has no site URL, classified product images, or brand analysis to train on yet.',
      });
      return;
    }

    const result = await runTrain({
      sandbox,
      demoPrefix,
      websiteUrls: inputs.websiteUrls,
      products: inputs.products,
      manifestText: inputs.manifestText,
      prebuiltSiteResults: inputs.prebuiltSiteResults,
    });
    res.status(200).json({ ...result, scrapeId, derivedProductCount: inputs.products.length });
  } catch (err) {
    console.error('[bcGeminiPrepTrain] error', err);
    res.status(err.statusCode || 500).json({ ok: false, error: String((err && err.message) || err) });
  }
}

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildWebsitesCsv(websiteUrls) {
  return [['url'], ...websiteUrls.map((u) => [u])].map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
}

function buildProductsCsv(products) {
  const header = 'productID,_id,productName,productDescription,productPageURL,productImageURL,productRating,';
  const rows = products.map((p) =>
    ['', '', p.productName || '', p.productDescription || '', p.productPageURL || '', p.productImageURL || '', '', '']
      .map(csvEscape)
      .join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

async function handlePrepExport(req, res) {
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
  const scrapeId = String(body.scrapeId || '').trim();
  const demoPrefix = String(body.demoPrefix || '').trim();
  if (!sandbox || !scrapeId) {
    res.status(400).json({ ok: false, error: 'sandbox and scrapeId are required' });
    return;
  }

  try {
    const inputs = await loadPrepInputs(sandbox, scrapeId);
    if (!inputs) {
      res.status(404).json({ ok: false, error: 'Scrape not found for that sandbox/scrapeId' });
      return;
    }

    const bucket = getBucket();
    const safeSandbox = sandbox.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeScrape = scrapeId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const brandPart = String(inputs.record.brandName || demoPrefix || 'brand')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const zipPath = `${safeSandbox}/${safeScrape}/bc-gemini-prep/${brandPart}-${ts}.zip`;
    const file = bucket.file(zipPath);
    const writeStream = file.createWriteStream({ contentType: 'application/zip', resumable: false });
    const archive = archiver('zip', { zlib: { level: 6 } });
    const finishWrite = new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      archive.on('error', reject);
    });
    archive.pipe(writeStream);

    archive.append(buildWebsitesCsv(inputs.websiteUrls), { name: 'websites.csv' });
    archive.append(buildProductsCsv(inputs.products), { name: 'products.csv' });
    archive.append(inputs.manifestText || '(no brand notes generated yet)', { name: 'notes.txt' });
    archive.append(
      [
        `Brand Concierge / Gemini training kit — ${inputs.record.brandName || demoPrefix || scrapeId}`,
        '',
        'Use these files one of two ways:',
        '1. Gemini override (this lab): toggle "Use Gemini (repeatable)" in the demo env bar, open the',
        '   Brand Concierge display-mode panel, click "+ Train LLM", and drop this folder in.',
        "2. Real Adobe Brand Concierge admin console: upload products.csv directly — it matches BC's",
        '   own sample-catalog.csv column layout.',
        '',
        `Generated from brand scrape ${scrapeId} — ${new Date().toISOString()}`,
      ].join('\n'),
      { name: 'README.txt' },
    );

    await archive.finalize();
    await finishWrite;

    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + EXPIRY_MS, version: 'v4' });
    res.status(200).json({
      ok: true,
      sandbox,
      scrapeId,
      storagePath: zipPath,
      signedUrl: url,
      signedUrlExpiresAt: new Date(Date.now() + EXPIRY_MS).toISOString(),
      websiteCount: inputs.websiteUrls.length,
      productCount: inputs.products.length,
    });
  } catch (err) {
    console.error('[bcGeminiPrepExport] error', err);
    res.status(err.statusCode || 500).json({ ok: false, error: String((err && err.message) || err) });
  }
}

module.exports = { handlePrepTrain, handlePrepExport };
