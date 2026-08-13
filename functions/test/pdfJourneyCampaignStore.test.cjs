'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../pdfJourneyCampaignStore');
const action = require('../pdfJourneyActionService');

function harness() {
  const records = new Map();
  return {
    records,
    deps: {
      now: () => new Date('2026-08-13T06:00:00.000Z'),
      firestore: {
        collection() {
          return {
            doc(id) {
              return {
                async get() {
                  const value = records.get(id);
                  return { exists: !!value, data: () => structuredClone(value) };
                },
                async set(value) { records.set(id, structuredClone(value)); },
              };
            },
          };
        },
      },
    },
  };
}

test('returns the default campaign before a user saves a registry', async () => {
  const fixture = harness();
  const campaigns = await store.listCampaigns('user-1', 'apalmer', fixture.deps);
  assert.deepEqual(campaigns, [{
    name: 'Default PDF transactional campaign',
    campaignId: action.DEFAULT_CAMPAIGN_ID,
  }]);
});

test('stores a deduplicated campaign registry by owner and sandbox', async () => {
  const fixture = harness();
  const campaignId = '97b40686-ed37-4697-a137-10d18e4902f5';
  const saved = await store.saveCampaigns('user-1', 'apalmer', [
    { name: 'Riyadh booking confirmation', campaignId },
    { name: 'Duplicate', campaignId },
  ], fixture.deps);
  assert.equal(saved.length, 1);
  assert.deepEqual(await store.listCampaigns('user-1', 'apalmer', fixture.deps), saved);
  assert.deepEqual(await store.listCampaigns('user-1', 'different', fixture.deps), [{
    name: 'Default PDF transactional campaign',
    campaignId: action.DEFAULT_CAMPAIGN_ID,
  }]);
});

test('rejects malformed campaign IDs', () => {
  assert.throws(
    () => store.normaliseCampaigns([{ name: 'Broken', campaignId: 'not-a-uuid' }]),
    (error) => error.code === 'PDF_JOURNEY_CAMPAIGN_ID_INVALID',
  );
});
