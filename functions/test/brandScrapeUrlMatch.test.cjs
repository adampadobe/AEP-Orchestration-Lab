'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBrandScrapeUrl,
  brandScrapeUrlsMatch,
  resolveBrandScrapeFromList,
  findInFlightBrandScrapeFromList,
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

  it('findInFlightBrandScrapeFromList picks newest running row for URL', () => {
    const row = findInFlightBrandScrapeFromList(
      [
        {
          scrapeId: 'run-old',
          url: 'https://www.roccofortehotels.com',
          scrapeStatus: 'running',
          updatedAt: '2026-07-13T13:10:00.000Z',
        },
        {
          scrapeId: 'run-new',
          url: 'https://roccofortehotels.com/',
          scrapeStatus: 'crawl_complete',
          analysisPending: true,
          updatedAt: '2026-07-13T13:13:00.000Z',
        },
        {
          scrapeId: 'done1',
          url: 'https://roccofortehotels.com',
          scrapeStatus: 'complete',
          personasPresent: true,
          updatedAt: '2026-07-13T12:00:00.000Z',
        },
      ],
      'https://www.roccofortehotels.com',
    );
    assert.equal(row.scrapeId, 'run-new');
  });
});
