'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractItems,
  normalizeOfferItem,
  normalizeItemCollection,
  normalizeSelectionStrategy,
  normalizeTag,
  isAllowedPath,
  clampLimit,
  resolveEntityIdOrName,
} = require('../decisioningCatalogService');
const { assessCatalogHealth } = require('../decisioningCatalogAssessService');

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

const AUTH = { sandbox: 'apalmer', accessToken: 'tok', clientId: 'cid', orgId: 'org@AdobeOrg' };

test('extractItems handles results, _embedded, and arrays', () => {
  assert.equal(extractItems({ results: [{ id: 'a' }] }).length, 1);
  assert.equal(extractItems({ _embedded: { results: [{ id: 'b' }] } }).length, 1);
  assert.equal(extractItems([{ id: 'c' }]).length, 1);
});

test('isAllowedPath rejects arbitrary platform paths', () => {
  assert.equal(isAllowedPath('/data/core/dps/offer-items'), true);
  assert.equal(isAllowedPath('/data/core/dps/offer-items/uuid'), true);
  assert.equal(isAllowedPath('/data/core/dps/tags'), true);
  assert.equal(isAllowedPath('/data/core/ups/segment/definitions/x'), false);
});

test('normalizeTag maps id/name/version — confirmed live shape (no separate raw UUID field)', () => {
  const norm = normalizeTag({ id: 'dps:tag:1ae3b5a203797a2b', name: 'Travel - Mobile App', etag: 1, created: '2025-06-24T19:21:39.534Z' });
  assert.equal(norm.id, 'dps:tag:1ae3b5a203797a2b');
  assert.equal(norm.name, 'Travel - Mobile App');
  assert.equal(norm.version, 1);
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

test('resolveEntityIdOrName resolves a literal id with a single lookup, no list call', async () => {
  const calls = [];
  await withFetch(
    async (url) => {
      calls.push(String(url));
      return response({ id: 'dps:ranking-function:rf-1', name: 'Weather boost' });
    },
    async () => {
      const resolved = await resolveEntityIdOrName({ ...AUTH, entityType: 'ranking-formulas', idOrName: 'dps:ranking-function:rf-1' });
      assert.equal(resolved.ok, true);
      assert.equal(resolved.resolvedFrom, 'id');
      assert.equal(resolved.id, 'dps:ranking-function:rf-1');
      assert.equal(calls.length, 1);
    },
  );
});

test('resolveEntityIdOrName falls back to an exact name match on 404', async () => {
  await withFetch(
    async (url) => {
      const href = String(url);
      if (href.endsWith('/ranking-formulas/Weather%20Boost')) return response({}, 404);
      if (href.includes('/ranking-formulas?')) return response({ results: [{ id: 'dps:ranking-function:rf-1', name: 'Weather Boost' }] });
      return response({ id: 'dps:ranking-function:rf-1', name: 'Weather Boost' });
    },
    async () => {
      const resolved = await resolveEntityIdOrName({ ...AUTH, entityType: 'ranking-formulas', idOrName: 'Weather Boost' });
      assert.equal(resolved.ok, true);
      assert.equal(resolved.resolvedFrom, 'name');
      assert.equal(resolved.id, 'dps:ranking-function:rf-1');
    },
  );
});

test('resolveEntityIdOrName also falls back on 400 — confirmed live that DPS rejects a spaced id-shaped path with 400, not 404', async () => {
  await withFetch(
    async (url) => {
      const href = String(url);
      if (href.endsWith('/offer-rules/High%20Churn%20Risk')) return response({}, 400);
      if (href.includes('/offer-rules?')) return response({ results: [{ id: 'dps:eligibility-rule:hcr-1', name: 'High Churn Risk' }] });
      return response({ id: 'dps:eligibility-rule:hcr-1', name: 'High Churn Risk' });
    },
    async () => {
      const resolved = await resolveEntityIdOrName({ ...AUTH, entityType: 'offer-rules', idOrName: 'High Churn Risk' });
      assert.equal(resolved.ok, true);
      assert.equal(resolved.resolvedFrom, 'name');
      assert.equal(resolved.id, 'dps:eligibility-rule:hcr-1');
    },
  );
});

test('resolveEntityIdOrName reports ambiguous name matches and not-found', async () => {
  await withFetch(
    async (url) => {
      const href = String(url);
      if (href.includes('?')) {
        return response({
          results: [
            { id: 'dps:ranking-function:rf-1', name: 'Weather Boost' },
            { id: 'dps:ranking-function:rf-2', name: 'Weather Boost' },
          ],
        });
      }
      return response({}, 404);
    },
    async () => {
      const ambiguous = await resolveEntityIdOrName({ ...AUTH, entityType: 'ranking-formulas', idOrName: 'Weather Boost' });
      assert.equal(ambiguous.ok, false);
      assert.equal(ambiguous.status, 409);
      assert.equal(ambiguous.matches.length, 2);

      const notFound = await resolveEntityIdOrName({ ...AUTH, entityType: 'ranking-formulas', idOrName: 'Nonexistent' });
      assert.equal(notFound.ok, false);
      assert.equal(notFound.status, 404);
    },
  );
});

test('resolveEntityIdOrName never masks a non-404 error (e.g. 403) as not-found', async () => {
  const calls = [];
  await withFetch(
    async (url) => {
      calls.push(String(url));
      return response({ error: 'forbidden' }, 403);
    },
    async () => {
      const resolved = await resolveEntityIdOrName({ ...AUTH, entityType: 'ranking-formulas', idOrName: 'anything' });
      assert.equal(resolved.ok, false);
      assert.equal(resolved.status, 403);
      assert.equal(calls.length, 1);
    },
  );
});
