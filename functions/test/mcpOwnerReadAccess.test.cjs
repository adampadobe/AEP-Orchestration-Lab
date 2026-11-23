'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ownerMayReadSandbox } = require('../mcpOwnerReadAccess');
const { registerAudienceManagementRoutes } = require('../audienceManagementRoutes');
const { registerAjoCleanupRoutes } = require('../ajoCleanupRoutes');
const { registerMeasurementQualityRoutes } = require('../measurementQualityRoutes');
const { createAjoLoyaltyHandler } = require('../ajoLoyaltyRoutes');

function response() {
  return {
    code: 200, body: null,
    set() { return this; }, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; },
  };
}

function fixture(uid = 'owner', disabled = false, ownerAuth = { getUserByEmail: async () => ({ uid: 'owner', disabled }) }) {
  const calls = [];
  const deps = {
    onRequest: (_opts, handler) => handler, profileFnOpts: {}, setCors() {},
    mcpApiKeyStore: { validateUserApiKey: async () => ({ ok: true, keyId: 'key', principalUid: uid, sandbox: 'apalmer' }) },
    ownerAuth,
    getAdobeAccessToken: async () => 'token',
    ADOBE_CLIENT_ID: { value: () => 'client' }, ADOBE_IMS_ORG: { value: () => 'org' },
    aepHeaders: () => ({}),
    audienceManagementService: { listAudiences: async (args) => { calls.push(args.sandbox); return {}; } },
    ajoCleanupService: { listJourneys: async (args) => { calls.push(args.sandbox); return {}; } },
    measurementService: { auditLaunchProperties: async (args) => { calls.push(args.sandbox); return {}; } },
    loyaltyService: { read: async (_headers, args) => { calls.push(args.sandbox); return { ok: true }; } },
  };
  return {
    calls,
    handlers: [
      [registerAudienceManagementRoutes(deps).audienceManagementProxy, {}],
      [registerAjoCleanupRoutes(deps).ajoCleanupProxy, { asset_type: 'journey' }],
      [registerMeasurementQualityRoutes(deps).measurementQualityProxy, { action: 'launch_property_audit' }],
      [createAjoLoyaltyHandler(deps), { action: 'config' }],
    ],
  };
}

test('only an enabled owner key permits valid cross-sandbox GETs', async () => {
  const principal = { keyId: 'key', principalUid: 'owner' };
  const ownerAuth = { getUserByEmail: async () => ({ uid: 'owner', disabled: false }) };
  assert.equal(await ownerMayReadSandbox(principal, 'kirkham', 'GET', { ownerAuth }), true);
  for (const [p, sandbox, method] of [
    [principal, 'kirkham', 'DELETE'], [principal, ['kirkham'], 'GET'],
    [{ ...principal, principalUid: 'other' }, 'kirkham', 'GET'],
    [{ principalUid: 'owner' }, 'kirkham', 'GET'],
    [principal, '../other', 'GET'],
  ]) assert.equal(await ownerMayReadSandbox(p, sandbox, method, { ownerAuth }), false);
  assert.equal(await ownerMayReadSandbox(principal, 'kirkham', 'GET', {
    ownerAuth: { getUserByEmail: async () => ({ uid: 'owner', disabled: true }) },
  }), false);
});

test('reviewed endpoints independently permit owner reads and reject other keys', async () => {
  for (const [uid, disabled, expected] of [['owner', false, 200], ['other', false, 403], ['owner', true, 403]]) {
    const { handlers, calls } = fixture(uid, disabled);
    for (const [handler, query] of handlers) {
      const res = response();
      await handler({ method: 'GET', headers: { 'x-aep-lab-mcp-key': 'key' },
        query: { ...query, sandbox: 'kirkham' }, body: {} }, res);
      assert.equal(res.code, expected);
    }
    assert.deepEqual(calls, expected === 200 ? Array(4).fill('kirkham') : []);
  }
});

test('cross-sandbox deletion and non-Tags measurement operations remain denied', async () => {
  const { handlers, calls } = fixture();
  for (const [handler, query] of handlers.slice(0, 2)) {
    const res = response();
    await handler({ method: 'DELETE', headers: { 'x-aep-lab-mcp-key': 'key' },
      query: { ...query, sandbox: 'kirkham' }, body: { confirmed: true } }, res);
    assert.equal(res.code, 403);
  }
  const res = response();
  await handlers[2][0]({ method: 'GET', headers: { 'x-aep-lab-mcp-key': 'key' },
    query: { action: 'assurance_sessions', sandbox: 'kirkham' } }, res);
  assert.equal(res.code, 403);
  const signup = response();
  await handlers[3][0]({ method: 'POST', headers: { 'x-aep-lab-mcp-key': 'key', 'content-type': 'application/json' },
    query: { sandbox: 'kirkham' }, body: { challenge_id: 'challenge' } }, signup);
  assert.equal(signup.code, 403);
  assert.deepEqual(calls, []);
});

test('authorization lookup failures do not reach any reviewed service', async () => {
  const { handlers, calls } = fixture('owner', false, {
    getUserByEmail: async () => { throw new Error('unavailable'); },
  });
  for (const [handler, query] of handlers) {
    const res = response();
    await handler({ method: 'GET', headers: { 'x-aep-lab-mcp-key': 'key' },
      query: { ...query, sandbox: 'kirkham' }, body: {} }, res);
    assert.equal(res.code, 503);
  }
  assert.deepEqual(calls, []);
});
