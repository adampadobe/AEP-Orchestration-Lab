'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBrandScrapeUrl,
  brandScrapeUrlsMatch,
  resolveBrandScrapeFromList,
} = require('../brandScrapeUrlMatch');

describe('brandScrapeUrlMatch', () => {
  it('normalizes www and trailing slash', () => {
    const norm = normalizeBrandScrapeUrl('https://www.Nike.com/');
    assert.equal(norm.key, 'nike.com/');
    assert.ok(brandScrapeUrlsMatch('https://nike.com', norm));
  });

  it('matches starbucks.ae/en variants', () => {
    const target = normalizeBrandScrapeUrl('https://www.starbucks.ae/en');
    assert.equal(target.key, 'starbucks.ae/en');
    const row = resolveBrandScrapeFromList(
      [
        {
          scrapeId: 'complete1',
          url: 'https://starbucks.ae/en',
          brandName: 'Homepage',
          scrapeStatus: 'complete',
          personasPresent: true,
          updatedAt: '2026-06-23T12:20:00.000Z',
        },
      ],
      { url: 'https://www.starbucks.ae/en', require_personas: true, require_complete: true },
    );
    assert.equal(row.scrapeId, 'complete1');
  });

  it('ignores running duplicates when complete exists', () => {
    const row = resolveBrandScrapeFromList(
      [
        {
          scrapeId: 'run1',
          url: 'https://starbucks.ae/en',
          scrapeStatus: 'running',
          personasPresent: false,
          updatedAt: '2026-06-23T12:16:00.000Z',
        },
        {
          scrapeId: 'done1',
          url: 'https://www.starbucks.ae/en',
          scrapeStatus: 'complete',
          personasPresent: true,
          updatedAt: '2026-06-23T12:15:00.000Z',
        },
      ],
      { url: 'https://www.starbucks.ae/en' },
    );
    assert.equal(row.scrapeId, 'done1');
  });
});
