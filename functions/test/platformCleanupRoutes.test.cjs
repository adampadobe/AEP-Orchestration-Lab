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
      batchInventory: async (_auth, params) => ({ resources: params.targets, coverage: { complete: true } }),
      plan: async (_auth, { targets }) => ({
        status: 'blocked', state_fingerprint: 'a'.repeat(64), targets, expected_count: targets.length,
        blockers: ['Mutation adapter disabled'], mutation_adapters_enabled: false,
      }),
      revalidatePlan: async () => ({ ok: false, blockers: ['Mutation adapter disabled'] }),
      verify: async (_auth, plan) => ({ plan_id: plan.plan_id, status: 'not_verified', results: [] }),
    },
    platformCleanupStore: {
      saveAudit: async (plan) => { calls.push(plan); return { audit_id: auditId }; },
      consumeAudit: async (_id, expected) => { calls.push(expected); return { fingerprint: 'state' }; },
      savePlan: async (plan) => {
        calls.push(plan);
        return { plan_id: auditId, expiresAt: new Date().toISOString(), manifest_digest: 'a'.repeat(64), status: plan.status };
      },
      claimPlan: async (...args) => { calls.push(args); return { claimed: false, blocked: true, replayed: true, plan: { status: 'blocked', blockers: ['No adapter'] }, execution: { state: 'blocked' } }; },
      getExecution: async () => ({ plan: { plan_id: auditId }, execution: null }),
      finishExecution: async () => ({ blockers: [] }),
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

test('batch inventory and planning use authenticated exact IDs and persist a blocked plan receipt', async () => {
  const { request, calls } = fixture();
  const targets = [{ resource_type: 'flow', resource_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }];
  const inventory = await request('POST', { operation: 'inventory', sandbox: 'apalmer', targets });
  assert.equal(inventory.statusCode, 200);
  assert.deepEqual(inventory.body.resources, targets);
  const plan = await request('POST', { operation: 'plan', sandbox: 'apalmer', targets });
  assert.equal(plan.statusCode, 200);
  assert.equal(plan.body.status, 'blocked');
  assert.equal(plan.body.confirmation.manifest_digest, 'a'.repeat(64));
  assert.equal(calls.some((call) => call?.targets?.[0]?.resource_type === 'flow'), true);
});

test('batch apply requires explicit exact confirmation and reports durable blocked status without DELETE', async () => {
  const { request, calls } = fixture();
  const body = {
    operation: 'apply', sandbox: 'apalmer', plan_id: auditId,
    manifest_digest: 'a'.repeat(64), expected_count: 1, confirmed: true, usage_cleared: true,
    non_atomic_delete_acknowledged: true,
  };
  assert.equal((await request('POST', { ...body, confirmed: false })).statusCode, 400);
  const result = await request('POST', body);
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.status, 'blocked');
  assert.equal(result.body.replayed, true);
  assert.equal(calls.some((call) => Array.isArray(call) && call.some((entry) => entry?.method === 'DELETE')), false);
});

test('batch verification is a scoped readback and does not require the plan to remain unexpired', async () => {
  const { request } = fixture();
  const result = await request('POST', { operation: 'verify', sandbox: 'apalmer', plan_id: auditId });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'not_verified');
});

test('batch plan rejects duplicate, wildcard, oversized, and cross-sandbox targets', async () => {
  const { request, calls } = fixture();
  const target = { resource_type: 'flow', resource_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  assert.equal((await request('POST', { operation: 'plan', targets: [target, target] })).statusCode, 400);
  assert.equal((await request('POST', { operation: 'plan', targets: [{ ...target, resource_id: '*' }] })).statusCode, 400);
  assert.equal((await request('POST', { operation: 'plan', targets: Array(101).fill(target) })).statusCode, 400);
  assert.equal((await request('POST', { operation: 'plan', sandbox: 'other', targets: [target] })).statusCode, 403);
  assert.equal(calls.length, 0);
});

test('batch targets reject untrusted fields before a plan can be stored', async () => {
  const { request, calls } = fixture();
  const target = {
    resource_type: 'flow', resource_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    secret: 'fake-secret', override: true,
  };
  assert.equal((await request('POST', { operation: 'plan', targets: [target] })).statusCode, 400);
  assert.equal(calls.length, 0);
});

test('batch resource and plan IDs require canonical UUID structure', async () => {
  const { request, calls } = fixture();
  const body = {
    operation: 'apply', plan_id: auditId, manifest_digest: 'a'.repeat(64),
    expected_count: 1, confirmed: true, usage_cleared: true,
    non_atomic_delete_acknowledged: true,
  };
  for (const invalid of ['-'.repeat(36), 'aaaaaaaaaaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa-']) {
    assert.equal((await request('POST', { operation: 'plan', targets: [{ resource_type: 'flow', resource_id: invalid }] })).statusCode, 400);
    assert.equal((await request('POST', { ...body, plan_id: invalid })).statusCode, 400);
    assert.equal((await request('POST', { operation: 'verify', plan_id: invalid })).statusCode, 400);
  }
  assert.equal(calls.length, 0);
});

test('executable batch apply requires concurrency acknowledgment before claiming and calls the executor only once', async () => {
  let claims = 0;
  let executions = 0;
  const plan = { plan_id: auditId };
  const store = {
    claimPlan: async () => { claims++; return { claimed: true, plan }; },
  };
  const { request } = fixture({
    platformCleanupStore: store,
    platformCleanupService: {
      apply: async (auth, approved, passedStore) => {
        executions++;
        assert.equal(auth.sandbox, 'apalmer');
        assert.equal(approved, plan);
        assert.equal(passedStore, store);
        return { state: 'succeeded', delete_requests_issued: 1, items: {} };
      },
    },
  });
  const body = {
    operation: 'apply', plan_id: auditId, manifest_digest: 'a'.repeat(64),
    expected_count: 1, confirmed: true, usage_cleared: true,
  };
  for (const value of [undefined, false]) {
    assert.equal((await request('POST', { ...body, non_atomic_delete_acknowledged: value })).statusCode, 400);
  }
  assert.equal(claims, 0);
  const result = await request('POST', { ...body, non_atomic_delete_acknowledged: true });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'succeeded');
  assert.equal(result.body.delete_requests_issued, 1);
  assert.equal(claims, 1);
  assert.equal(executions, 1);
});

test('partial and uncertain executor outcomes never become successful HTTP responses', async () => {
  for (const state of ['blocked', 'failed', 'uncertain']) {
    const { request } = fixture({
      platformCleanupStore: { claimPlan: async () => ({ claimed: true, plan: {} }) },
      platformCleanupService: { apply: async () => ({ state, delete_requests_issued: 1, blockers: ['Stopped'] }) },
    });
    const result = await request('POST', {
      operation: 'apply', plan_id: auditId, manifest_digest: 'a'.repeat(64),
      expected_count: 1, confirmed: true, usage_cleared: true, non_atomic_delete_acknowledged: true,
    });
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.execution.state, state);
  }
});

test('replays retain failure status for blocked, failed, uncertain and expired executions', async () => {
  for (const state of ['blocked', 'failed', 'uncertain', 'expired']) {
    const { request } = fixture({
      platformCleanupStore: {
        claimPlan: async () => ({
          claimed: false, replayed: true, plan: { state }, execution: { state, blockers: ['durable result'] },
        }),
      },
    });
    const result = await request('POST', {
      operation: 'apply', plan_id: auditId, manifest_digest: 'a'.repeat(64),
      expected_count: 1, confirmed: true, usage_cleared: true, non_atomic_delete_acknowledged: true,
    });
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.status, state);
    assert.equal(result.body.execution.state, state);
    assert.equal(result.body.replayed, true);
  }
});
