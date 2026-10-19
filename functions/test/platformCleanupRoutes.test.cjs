'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { registerPlatformCleanupRoutes } = require('../platformCleanupRoutes');

const id = '69c38a17866d0ec0db681793';
const auditId = '11111111-2222-4333-8444-555555555555';
function fixture(overrides = {}) {
  const calls = [];
  const deps = {
    onRequest: (_opts, handler) => handler,
    profileFnOpts: {}, setCors() {},
    getAdobeAccessToken: async () => 'server-token',
    ADOBE_CLIENT_ID: { value: () => 'client' }, ADOBE_IMS_ORG: { value: () => 'org@AdobeOrg' },
    mcpApiKeyStore: {
      validateUserApiKey: async () => ({ ok: true, principalUid: 'uid', sandbox: 'apalmer' }),
    },
    platformCleanupService: {
      list: async () => ({ resources: [] }),
      audit: async () => ({ resource: { id, name: 'Delete me' }, fingerprint: 'state', etag: 'etag', deleteReviewReady: true }),
      remove: async (...args) => { calls.push(args); return { verifiedAbsent: true }; },
    },
    platformCleanupStore: {
      saveAudit: async (plan) => { calls.push(plan); return { audit_id: auditId }; },
      consumeAudit: async (_id, expected) => { calls.push(expected); return { fingerprint: 'state' }; },
    },
    ...overrides,
  };
  const handler = registerPlatformCleanupRoutes(deps).platformCleanupProxy;
  async function request(method, input, headers = { 'x-aep-lab-mcp-key': 'test-key' }) {
    const res = {
      statusCode: 0, body: null,
      set() { return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      send(body) { this.body = body; return this; },
    };
    await handler({ method, body: method === 'GET' ? {} : input, query: method === 'GET' ? input : {}, headers }, res);
    return res;
  }
  return { request, calls };
}
const confirmed = {
  sandbox: 'apalmer', resource_type: 'dataset', resource_id: id,
  audit_id: auditId, expected_name: 'Delete me', confirmed: true, usage_cleared: true,
};

test('requires user key or independently verified IMS identity; ops keys cannot delete', async () => {
  const { request, calls } = fixture();
  assert.equal((await request('DELETE', confirmed, {})).statusCode, 401);
  assert.equal(calls.length, 0);
  const ops = fixture({ mcpApiKeyStore: { validateUserApiKey: async () => ({ ok: true }) } });
  assert.equal((await ops.request('DELETE', confirmed)).statusCode, 403);
});

test('rejects sandbox and org mismatches before calling the platform', async () => {
  const { request, calls } = fixture();
  assert.equal((await request('DELETE', { ...confirmed, sandbox: 'other' })).statusCode, 403);
  assert.equal((await request('DELETE', confirmed, { 'x-aep-lab-mcp-key': 'key', 'x-gw-ims-org-id': 'other@AdobeOrg' })).statusCode, 403);
  assert.equal(calls.length, 0);
});

test('requires exact confirmation and downstream usage clearance', async () => {
  const { request, calls } = fixture();
  for (const field of ['confirmed', 'usage_cleared', 'expected_name', 'audit_id', 'resource_id']) {
    const body = { ...confirmed };
    delete body[field];
    assert.equal((await request('DELETE', body)).statusCode, 400, field);
  }
  assert.equal(calls.length, 0);
});

test('binds audit to principal, organisation, sandbox, resource and name', async () => {
  const { request, calls } = fixture();
  const result = await request('GET', { sandbox: 'apalmer', resource_type: 'dataset', resource_id: id });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(calls[0], {
    principalUid: 'uid', orgId: 'org@AdobeOrg', sandbox: 'apalmer',
    resource_type: 'dataset', resource_id: id, expected_name: 'Delete me', fingerprint: 'state',
  });
  assert.equal(result.body.fingerprint, undefined);
  assert.equal(result.body.etag, undefined);
  assert.equal(result.body.confirmation.audit_id, auditId);
});

test('does not issue a deletion ticket for a blocked audit', async () => {
  const { request, calls } = fixture({
    platformCleanupService: { audit: async () => ({ deleteReviewReady: false, blockers: ['In use'] }) },
  });
  const result = await request('GET', { sandbox: 'apalmer', resource_type: 'dataset', resource_id: id });
  assert.equal(result.body.confirmation, null);
  assert.equal(calls.length, 0);
});

test('consumes audit before performing one exact deletion', async () => {
  const { request, calls } = fixture();
  const result = await request('DELETE', confirmed);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.verifiedAbsent, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].principalUid, 'uid');
  assert.equal(calls[1][1].resource_id, id);
  assert.equal(calls[1][2].fingerprint, 'state');
});

test('expired, used or mismatched audit never reaches deletion', async () => {
  const { request, calls } = fixture({
    platformCleanupStore: { consumeAudit: async () => { throw Object.assign(new Error('Expired'), { status: 409 }); } },
  });
  assert.equal((await request('DELETE', confirmed)).statusCode, 409);
  assert.equal(calls.length, 0);
});

test('validates IMS independently and ignores a spoofed caller UID', async () => {
  const { request, calls } = fixture({
    fetchImpl: async () => ({ ok: true, json: async () => ({ email: 'tester@adobe.com', email_verified: true }) }),
    db: {
      collection: () => ({
        where: () => ({
          get: async () => ({ docs: [{ data: () => ({ principalUid: 'enrolled-uid', sandbox: 'apalmer', revoked: false }) }] }),
        }),
      }),
    },
  });
  const result = await request('DELETE', confirmed, {
    authorization: 'Bearer test-session',
    'x-gw-ims-org-id': 'org@AdobeOrg',
    'x-aep-lab-principal-uid': 'spoofed-uid',
  });
  assert.equal(result.statusCode, 200);
  assert.equal(calls[0].principalUid, 'enrolled-uid');
});

test('Hosting routes the cleanup endpoint to the registered regional function', () => {
  const firebase = JSON.parse(readFileSync(path.join(__dirname, '../../firebase.json'), 'utf8'));
  const matches = firebase.hosting.find((site) => site.target === 'app').rewrites
    .filter((rewrite) => rewrite.source === '/api/platform-cleanup');
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].function, { functionId: 'platformCleanupProxy', region: 'us-central1' });
  assert.match(readFileSync(path.join(__dirname, '../index.js'), 'utf8'), /registerPlatformCleanupRoutes\(\{/);
});

test('surfaces partial failure instead of returning success', async () => {
  const { request } = fixture({
    platformCleanupService: {
      remove: async () => { throw Object.assign(new Error('Blocked'), { status: 409, detail: { deletedDescriptors: ['one'] } }); },
    },
  });
  const result = await request('DELETE', confirmed);
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.ok, false);
  assert.deepEqual(result.body.detail.deletedDescriptors, ['one']);
});
