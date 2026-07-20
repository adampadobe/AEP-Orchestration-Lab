'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractItems,
  normalizeOfferItem,
  normalizeItemCollection,
  normalizeSelectionStrategy,
  isAllowedPath,
  clampLimit,
} = require('../decisioningCatalogService');
const { assessCatalogHealth } = require('../decisioningCatalogAssessService');

test('extractItems handles results, _embedded, and arrays', () => {
  assert.equal(extractItems({ results: [{ id: 'a' }] }).length, 1);
  assert.equal(extractItems({ _embedded: { results: [{ id: 'b' }] } }).length, 1);
  assert.equal(extractItems([{ id: 'c' }]).length, 1);
});

test('isAllowedPath rejects arbitrary platform paths', () => {
  assert.equal(isAllowedPath('/data/core/dps/offer-items'), true);
  assert.equal(isAllowedPath('/data/core/dps/offer-items/uuid'), true);
  assert.equal(isAllowedPath('/data/core/ups/segment/definitions/x'), false);
});

test('clampLimit defaults to 50 and caps at 50', () => {
  assert.equal(clampLimit(undefined), 50);
  assert.equal(clampLimit(200), 50);
  assert.equal(clampLimit(10), 10);
});

test('normalizeOfferItem maps decision item calendar and tags', () => {
  const item = {
    id: 'offer-1',
    _experience: {
      decisioning: {
        decisionitem: {
          itemName: 'Summer promo',
          itemPriority: 3,
          itemCalendarConstraints: { startDate: '2026-01-01T00:00:00Z', endDate: '2027-01-01T00:00:00Z' },
          itemTagDetails: [{ name: 'seasonal' }],
        },
      },
    },
  };
  const norm = normalizeOfferItem(item);
  assert.equal(norm.name, 'Summer promo');
  assert.equal(norm.priority, 3);
  assert.equal(norm.lifecycleStatus, 'Active');
  assert.deepEqual(norm.tags, ['seasonal']);
});

test('normalizeItemCollection counts constraints', () => {
  const norm = normalizeItemCollection({
    id: 'c1',
    name: 'Tagged offers',
    constraints: [{ uiModel: '{}' }],
    etag: 2,
  });
  assert.equal(norm.constraintCount, 1);
  assert.equal(norm.hasRules, true);
});

test('normalizeSelectionStrategy extracts rank and collection', () => {
  const norm = normalizeSelectionStrategy({
    id: 's1',
    name: 'Hero strategy',
    rank: { priority: 1, order: { orderEvaluationType: 'static' } },
    optionSelection: { filterName: 'Hero collection' },
    profileConstraint: { profileConstraintType: 'none' },
  });
  assert.equal(norm.rankingType, 'static');
  assert.equal(norm.collectionName, 'Hero collection');
});

test('assessCatalogHealth flags expired offers and duplicate priorities', () => {
  const report = assessCatalogHealth({
    offers: [
      {
        id: 'o1',
        name: 'Old',
        endDate: '2020-01-01T00:00:00Z',
        lifecycleStatus: 'Expired',
        tags: [],
      },
      {
        id: 'o2',
        name: 'Future',
        startDate: '2099-01-01T00:00:00Z',
        lifecycleStatus: 'Scheduled',
        tags: ['a'],
      },
    ],
    collections: [{ id: 'c1', name: 'Empty', hasRules: false, constraintCount: 0 }],
    strategies: [
      { id: 's1', name: 'A', priority: 1, rankingType: null },
      { id: 's2', name: 'B', priority: 1, rankingType: 'static' },
    ],
  });

  assert.equal(report.findings.expiredOffers.length, 1);
  assert.equal(report.findings.scheduledOffers.length, 1);
  assert.equal(report.findings.emptyCollections.length, 1);
  assert.equal(report.findings.strategiesWithoutRanking.length, 1);
  assert.equal(report.findings.duplicateStrategyPriorities.length, 1);
  assert.ok(report.suggestions.length >= 4);
  assert.equal(report.summary.healthy, false);
});

test('assessCatalogHealth healthy when active offers and ranked strategies', () => {
  const report = assessCatalogHealth({
    offers: [{ id: 'o1', name: 'Live', lifecycleStatus: 'Active', tags: ['demo'] }],
    collections: [{ id: 'c1', name: 'All', hasRules: true, constraintCount: 1 }],
    strategies: [{ id: 's1', name: 'Main', priority: 1, rankingType: 'static' }],
  });
  assert.equal(report.summary.healthy, true);
  assert.equal(report.summary.issueCount, 0);
});
