import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDemoConfigChangesFromScrape } from '../src/tools/demoConfig.mjs';

function byPath(changes) {
  return new Map(changes.map((item) => [item.path, item.value]));
}

test('brand scrape mapping uses evidence-backed brand and industry values', () => {
  const changes = buildDemoConfigChangesFromScrape({
    scrapeStatus: 'complete',
    brandName: 'Qatar Investment Authority',
    url: 'https://www.qia.qa/en/pages/default.aspx',
    industry: 'Financial services',
    analysis: { slogan: 'Investing for future generations' },
    customerLogo: { publicUrl: 'https://content.example.test/qia-logo.svg' },
    crawlSummary: { assets: { colors: [{ hex: '#6b1d45' }] } },
  });
  const mapped = byPath(changes);
  assert.equal(mapped.get('CoreDemoData.name'), 'Qatar Investment Authority');
  assert.equal(mapped.get('CoreDemoData.url'), 'https://www.qia.qa/en/pages/default.aspx');
  assert.equal(mapped.get('CoreDemoData.customerLogo'), 'https://content.example.test/qia-logo.svg');
  assert.equal(mapped.get('CoreDemoData.slogan'), 'Investing for future generations');
  assert.equal(mapped.get('StaffPortal.Colour'), '#6b1d45');
  assert.equal(mapped.get('CallCentre.industryId'), 'fsi');
  assert.equal(mapped.get('ExpAccelerator.displayNameOverride'), 'Qatar Investment Authority');
});

test('brand scrape mapping does not invent slogans or short names and rejects signed logo URLs', () => {
  const changes = buildDemoConfigChangesFromScrape({
    brandName: 'Example Customer',
    baseUrl: 'https://customer.example',
    customerLogo: {
      url: 'https://storage.example/logo.png?X-Goog-Signature=secret&X-Goog-Expires=600',
    },
  }, 'brand_only');
  const mapped = byPath(changes);
  assert.equal(mapped.get('CoreDemoData.name'), 'Example Customer');
  assert.equal(mapped.get('CoreDemoData.url'), 'https://customer.example');
  assert.equal(mapped.has('CoreDemoData.slogan'), false);
  assert.equal(mapped.has('CoreDemoData.shortName'), false);
  assert.equal(mapped.has('CoreDemoData.customerLogo'), false);
  assert.equal(mapped.has('StaffPortal.Colour'), false);
});

test('stable image-hosting logo URL overrides expiring scrape logo evidence', () => {
  const changes = buildDemoConfigChangesFromScrape({
    brandName: 'Example Customer',
    customerLogo: { url: 'https://storage.example/logo.png?X-Goog-Signature=secret' },
  }, 'brand_only', {
    customerLogoUrl: 'https://aep-orchestration-lab.web.app/cdn/apalmer/logo/logo.png',
  });
  assert.equal(
    byPath(changes).get('CoreDemoData.customerLogo'),
    'https://aep-orchestration-lab.web.app/cdn/apalmer/logo/logo.png',
  );
});
