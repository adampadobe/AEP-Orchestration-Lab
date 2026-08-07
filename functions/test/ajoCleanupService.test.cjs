'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  JOURNEY_READ_BASE, JOURNEY_AUTHORING_BASE, CAMPAIGN_BASE,
  normalizeJourney, normalizeCampaign, listJourneys, getJourney, deleteJourney,
  listCampaigns, getCampaign, deleteCampaign,
} = require('../ajoCleanupService');

const auth = { token: 'token', clientId: 'client', orgId: 'org', sandbox: 'apalmer' };

describe('AJO cleanup service', () => {
  it('normalizes journey and campaign identity, lifecycle, and audit metadata', () => {
    const journey = normalizeJourney({ journeyID: 'j-1', name: 'Journey one', status: 'finished', metadata: { createdAt: 1_700_000_000_000 } });
    const campaign = normalizeCampaign({ id: 'c-1', name: 'Campaign one', state: 'draft', audience: { id: 'aud-1' }, messages: [{ id: 'msg-1' }] });
    assert.equal(journey.status, 'FINISHED');
    assert.equal(journey.createdAt, '2023-11-14T22:13:20.000Z');
    assert.equal(campaign.status, 'DRAFT');
    assert.equal(campaign.audienceId, 'aud-1');
    assert.deepEqual(campaign.messageIds, ['msg-1']);
  });

  it('uses fixed Adobe endpoints, scoped headers, and one-at-a-time delete methods', async () => {
    const previousFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === 'DELETE' || init.method === 'PUT') return new Response(null, { status: 204 });
      if (String(url).includes('/journey/campaigns/')) {
        return new Response(JSON.stringify(String(url).endsWith('/c-1')
          ? { id: 'c-1', name: 'Campaign', status: 'DRAFT' }
          : { items: [{ id: 'c-1', name: 'Campaign', status: 'DRAFT' }] }), { status: 200 });
      }
      return new Response(JSON.stringify(String(url).endsWith('/j-1')
        ? { journeyID: 'j-1', name: 'Journey', status: 'FINISHED' }
        : { results: [{ journeyID: 'j-1', name: 'Journey', status: 'FINISHED' }] }), { status: 200 });
    };
    try {
      assert.equal((await listJourneys({ ...auth, name: 'Journey' })).count, 1);
      assert.equal((await getJourney({ ...auth, journeyId: 'j-1' })).id, 'j-1');
      await deleteJourney({ ...auth, journeyId: 'j-1' });
      assert.equal((await listCampaigns({ ...auth, name: 'Campaign' })).count, 1);
      assert.equal((await getCampaign({ ...auth, campaignId: 'c-1' })).id, 'c-1');
      await deleteCampaign({ ...auth, campaignId: 'c-1' });

      assert.equal(new URL(calls[0].url).origin + new URL(calls[0].url).pathname, JOURNEY_READ_BASE);
      assert.equal(calls[2].url, `${JOURNEY_AUTHORING_BASE}/j-1`);
      assert.equal(calls[2].init.method, 'DELETE');
      assert.equal(new URL(calls[3].url).origin + new URL(calls[3].url).pathname, CAMPAIGN_BASE);
      assert.equal(calls[5].url, `${CAMPAIGN_BASE}/c-1/delete`);
      assert.equal(calls[5].init.method, 'PUT');
      assert.ok(calls.every((call) => call.init.headers['x-sandbox-name'] === 'apalmer'));
    } finally { global.fetch = previousFetch; }
  });
});
