'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { deletionReview, registerAjoCleanupRoutes } = require('../ajoCleanupRoutes');

function responseRecorder() {
  return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
}

function deps(service) {
  return {
    onRequest: (_opts, handler) => ({ __handler: handler }), profileFnOpts: {}, setCors: () => {},
    getAdobeAccessToken: async () => 'token', ADOBE_CLIENT_ID: { value: () => 'client' }, ADOBE_IMS_ORG: { value: () => 'org' },
    mcpApiKeyStore: { validateUserApiKey: async () => ({ ok: true, principalUid: 'uid', sandbox: 'apalmer' }) },
    ajoCleanupService: service,
  };
}

async function callDelete(service, body) {
  const route = registerAjoCleanupRoutes(deps(service));
  const req = { method: 'DELETE', headers: { 'x-aep-lab-mcp-key': 'key' }, query: {}, body: { sandbox: 'apalmer', ...body } };
  const res = responseRecorder();
  await route.ajoCleanupProxy.__handler(req, res);
  return res;
}

describe('AJO cleanup route', () => {
  it('marks lifecycle blockers and returns exact confirmation fields', () => {
    const ready = deletionReview('journey', { id: 'j-1', name: 'Done', status: 'FINISHED' }, 'apalmer');
    const blocked = deletionReview('campaign', { id: 'c-1', name: 'Live', status: 'LIVE' }, 'apalmer');
    assert.equal(ready.review.deleteReviewReady, true);
    assert.equal(ready.confirmation.journey_id, 'j-1');
    assert.equal(blocked.review.deleteReviewReady, false);
    assert.match(blocked.review.blockers[0], /Draft/);
  });

  it('fails closed when the confirmed name or status changed', async () => {
    let deletes = 0;
    const res = await callDelete({
      getJourney: async () => ({ id: 'j-1', name: 'Current', status: 'FINISHED' }),
      deleteJourney: async () => { deletes += 1; },
    }, { asset_type: 'journey', asset_id: 'j-1', expected_name: 'Old', expected_status: 'FINISHED', confirmed: true });
    assert.equal(res.statusCode, 409);
    assert.equal(deletes, 0);
  });

  it('blocks non-draft campaign deletion even after confirmation', async () => {
    let deletes = 0;
    const res = await callDelete({
      getCampaign: async () => ({ id: 'c-1', name: 'Running', status: 'LIVE' }),
      deleteCampaign: async () => { deletes += 1; },
    }, { asset_type: 'campaign', asset_id: 'c-1', expected_name: 'Running', expected_status: 'LIVE', confirmed: true });
    assert.equal(res.statusCode, 409);
    assert.equal(deletes, 0);
  });

  it('deletes one exact eligible journey after re-read', async () => {
    let deletes = 0;
    const res = await callDelete({
      getJourney: async () => ({ id: 'j-1', name: 'Finished demo', status: 'FINISHED' }),
      deleteJourney: async () => { deletes += 1; },
    }, { asset_type: 'journey', asset_id: 'j-1', expected_name: 'Finished demo', expected_status: 'FINISHED', confirmed: true });
    assert.equal(res.statusCode, 200);
    assert.equal(deletes, 1);
  });
});
