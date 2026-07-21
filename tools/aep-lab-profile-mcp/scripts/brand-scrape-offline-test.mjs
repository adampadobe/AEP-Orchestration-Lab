#!/usr/bin/env node
/**
 * Unit tests: brand scrape brief generation + upload param validation (no live API).
 */

import { generateScrapeBrief, briefFilename, BRAND_SCRAPER_UPLOAD_LIMITS } from '../src/brandScraperBrief.mjs';
import {
  buildUploadedHtmlBody,
  validateBrandScrapeUpload,
} from '../src/brandScraperUploadValidation.mjs';
import { buildBrandScrapeAnalyzePostBody } from '../src/labApiClient.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const brief = generateScrapeBrief({
  url: 'https://nike.com',
  customer_name: 'Nike',
  includePersonas: true,
});
assert(brief.includes('# Brand Scraper — offline scrape brief'), 'brief title');
assert(brief.includes('https://nike.com'), 'brief includes url');
assert(brief.includes('lab_brand_scrape_upload'), 'brief mentions upload tool');
assert(brief.includes('Image Eye'), 'brief mentions Image Eye');
assert(brief.includes('30 MB'), 'brief mentions size limit');
assert(briefFilename({ customer_name: 'Nike' }).endsWith('-brand-scrape-brief.md'), 'brief filename');

const tinyHtml = Buffer.from('<html><body>Hello Nike</body></html>').toString('base64');
const valid = validateBrandScrapeUpload({
  files: [{ name: 'index.html', content_base64: tinyHtml }],
});
assert(valid.ok, 'valid single html upload');

const body = buildUploadedHtmlBody(
  { files: [{ name: 'index.html', content_base64: tinyHtml }] },
  { upload_only: true, use_as_fallback: false },
);
assert(body.uploadOnly === true, 'uploadOnly flag');
assert(body.files[0].contentBase64 === tinyHtml, 'contentBase64 passthrough');

const analyzeBody = buildBrandScrapeAnalyzePostBody({
  sandbox: 'apalmer',
  url: 'https://nike.com',
  upload_only: true,
  uploadedHtml: body,
});
assert(analyzeBody.uploadOnly === true, 'analyze uploadOnly');
assert(analyzeBody.uploadedHtml.uploadOnly === true, 'nested uploadedHtml uploadOnly');

const tooMany = validateBrandScrapeUpload({
  files: Array.from({ length: 41 }, (_, i) => ({
    name: `page${i}.html`,
    content_base64: tinyHtml,
  })),
});
assert(!tooMany.ok && tooMany.error.includes('40'), 'max files rejection');

const noHtml = validateBrandScrapeUpload({
  files: [{ name: 'logo.png', content_base64: tinyHtml }],
});
assert(!noHtml.ok && noHtml.error.includes('.html'), 'requires html without zip');

console.log(
  JSON.stringify({
    ok: true,
    limits: BRAND_SCRAPER_UPLOAD_LIMITS,
    briefLength: brief.length,
  }),
);
