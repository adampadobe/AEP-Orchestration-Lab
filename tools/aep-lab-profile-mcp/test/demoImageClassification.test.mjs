import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureClassifiedScrapeImages,
  summarizeImageClassification,
} from '../src/demoImageClassification.mjs';

function completeRecord(imagesV2 = [], customerLogo = null) {
  return {
    scrapeStatus: 'complete',
    customerLogo,
    crawlSummary: { assets: { imagesV2 } },
  };
}

test('classification summary requires a logo and useful supporting image', () => {
  const summary = summarizeImageClassification(completeRecord([
    { storagePath: 'cache/logo.png', classification: { category: 'logo', confidence: 'high', subject: 'Brand logo' } },
    { storagePath: 'cache/hero.png', classification: { category: 'hero_banner', confidence: 'high', subject: 'Aircraft' } },
    { storagePath: 'cache/icon.png', classification: { category: 'icon', confidence: 'medium' } },
  ]));
  assert.equal(summary.readyForDemoAssets, true);
  assert.deepEqual(summary.categories, { logo: 1, hero_banner: 1, icon: 1 });
  assert.equal(summary.inventory[1].imageIndex, 1);
  assert.equal(summary.inventory[1].subject, 'Aircraft');
});

test('existing usable classifications skip Gemini unless forced', async () => {
  const record = completeRecord([
    { storagePath: 'cache/logo.png', classification: { category: 'logo' } },
    { storagePath: 'cache/lifestyle.png', classification: { category: 'lifestyle' } },
  ]);
  let classifyCalls = 0;
  const result = await ensureClassifiedScrapeImages(
    { sandbox: 'apalmer', scrapeId: 'scrape-1' },
    {
      getBrandScrape: async () => ({ ok: true, data: record }),
      classifyBrandScrapeImages: async () => { classifyCalls += 1; return { ok: true, data: {} }; },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.classification.ran, false);
  assert.equal(result.classification.reason, 'existing_classification_ready');
  assert.equal(classifyCalls, 0);
});

test('missing categories trigger classifier and reload the saved scrape', async () => {
  const before = completeRecord([]);
  const after = completeRecord([
    { storagePath: 'cache/logo.png', classification: { category: 'logo', confidence: 'high' } },
    { storagePath: 'cache/product.png', classification: { category: 'product', confidence: 'medium' } },
  ]);
  let loads = 0;
  const result = await ensureClassifiedScrapeImages(
    { sandbox: 'apalmer', scrapeId: 'scrape-2' },
    {
      getBrandScrape: async () => ({ ok: true, data: loads++ === 0 ? before : after }),
      classifyBrandScrapeImages: async () => ({ ok: true, data: { classified: 2, total: 2, elapsedMs: 50 } }),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.classification.ran, true);
  assert.equal(result.classification.after.readyForDemoAssets, true);
  assert.equal(result.classification.classified, 2);
  assert.equal(loads, 2);
});
