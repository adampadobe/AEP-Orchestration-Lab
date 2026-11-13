'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerAepIngestionDiagnosticsRoutes } = require('../aepIngestionDiagnosticsRoutes');

function fixture({ entries, failure, keyResult, scheduleDiagnostic } = {}) {
  const calls = [];
  let tokens = 0;
  const service = {
    async batchDiagnose(auth, input) {
      calls.push({ auth, input });
      if (failure) throw failure;
      return { ok: true, complete: false, batches: [] };
    },
    async flowRunStatus(auth, input) {
      calls.push({ auth, input });
      return { ok: true, runs: [] };
    },
  };
  const { aepIngestionDiagnosticsProxy: handler } = registerAepIngestionDiagnosticsRoutes({
    onRequest: (_options, callback) => callback,
    profileFnOpts: {}, setCors() {},
    mcpApiKeyStore: { validateUserApiKey: async () => keyResult || { ok: true, principalUid: 'fixture-uid', sandbox: 'sandbox-a' } },
    fetchImpl: async () => ({ ok: true, json: async () => ({ email: 'fixture@adobe.com', email_verified: true }) }),
    db: { collection: () => ({ where: () => ({ get: async () => ({
      docs: (entries || [{ principalUid: 'fixture-uid', sandbox: 'sandbox-a', revoked: false }]).map((entry) => ({ data: () => entry })),
    }) }) }) },
    getAdobeAccessToken: async () => { tokens++; return 'fixture-server-token'; },
    ADOBE_CLIENT_ID: { value: () => 'fixture-client' },
    ADOBE_IMS_ORG: { value: () => 'TEST@AdobeOrg' },
    ingestionDiagnosticsService: service,
    profileSeedScheduleDiagnose: async ({ principal, auth }) => {
      calls.push({ principal, auth, scheduleDiagnostic: true });
      return scheduleDiagnostic || { ok: true, configured: false };
    },
  });
  async function request(query, headers = { 'x-aep-lab-mcp-key': 'fixture-key' }, method = 'GET') {
    const res = {
      statusCode: 0, body: null, headers: {},
      set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      send(body) { this.body = body; return this; },
    };
    await handler({ query, headers, method }, res);
    return res;
  }
  return { request, calls, get tokens() { return tokens; } };
}

test('user-key route forwards only server credentials and principal sandbox', async () => {
  const ctx = fixture();
  const res = await ctx.request({ action: 'batch_diagnose', sandbox: 'sandbox-a', batch_id: 'fixture-batch' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.complete, false);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(ctx.calls[0].auth, {
    token: 'fixture-server-token', clientId: 'fixture-client', orgId: 'TEST@AdobeOrg', sandbox: 'sandbox-a',
  });
});

test('IMS route independently validates the active Portal enrollment', async () => {
  const headers = { authorization: 'Bearer fixture-session', 'x-gw-ims-org-id': 'TEST@AdobeOrg', 'x-aep-lab-principal-uid': 'spoofed-uid' };
  const ctx = fixture();
  assert.equal((await ctx.request({ action: 'flow_run_status', sandbox: 'sandbox-a' }, headers)).statusCode, 200);
  assert.equal(ctx.calls.length, 1);
  const revoked = fixture({ entries: [{ principalUid: 'fixture-uid', sandbox: 'sandbox-a', revoked: true }] });
  assert.equal((await revoked.request({ action: 'flow_run_status', sandbox: 'sandbox-a' }, headers)).statusCode, 403);
  assert.equal(revoked.tokens, 0);
});

test('scheduled profile diagnostic is routed through principal-scoped read-only access', async () => {
  const ctx = fixture({ scheduleDiagnostic: { ok: true, configured: true, dispatcher: { blocked: true } } });
  const res = await ctx.request({ action: 'profile_seed_schedule_diagnose', sandbox: 'sandbox-a' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, configured: true, dispatcher: { blocked: true } });
  assert.equal(ctx.calls[0].scheduleDiagnostic, true);
  assert.equal(ctx.calls[0].principal.principalUid, 'fixture-uid');
  assert.equal(ctx.calls[0].auth.sandbox, 'sandbox-a');
  assert.equal(ctx.tokens, 1);
});

test('missing auth, unscoped keys, sandbox/org mismatch and unsupported actions stop before server token access', async () => {
  const cases = [
    [{ action: 'batch_diagnose' }, {}, 401],
    [{ action: 'batch_diagnose', sandbox: 'sandbox-b' }, undefined, 403],
    [{ action: 'batch_diagnose' }, { 'x-aep-lab-mcp-key': 'fixture-key', 'x-gw-ims-org-id': 'OTHER@AdobeOrg' }, 403],
    [{ action: 'apply' }, undefined, 400],
  ];
  for (const [query, headers, status] of cases) {
    const ctx = fixture();
    assert.equal((await ctx.request(query, headers)).statusCode, status);
    assert.equal(ctx.tokens, 0);
  }
  const invalid = fixture({ keyResult: { ok: true, sandbox: 'sandbox-a' } });
  assert.equal((await invalid.request({ action: 'batch_diagnose' })).statusCode, 403);
  assert.equal(invalid.tokens, 0);
});

test('GET/OPTIONS-only route rejects mutations without authentication or platform access', async () => {
  const ctx = fixture();
  assert.equal((await ctx.request({}, {}, 'OPTIONS')).statusCode, 204);
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.equal((await ctx.request({}, {}, method)).statusCode, 405);
  }
  assert.equal(ctx.tokens, 0);
});

test('route preserves raw Adobe permission error status/body without logging source payloads', async () => {
  const raw = { type: 'permission', errors: [{ code: 'ADOBE-403', message: 'fixture row content' }] };
  const ctx = fixture({ failure: Object.assign(new Error('Adobe request rejected.'), { status: 403, platformResponse: raw }) });
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const res = await ctx.request({ action: 'batch_diagnose' });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body.platform_response, raw);
    assert.equal(JSON.stringify(logged).includes('fixture row content'), false);
    assert.equal(JSON.stringify(logged).includes('fixture-server-token'), false);
  } finally { console.error = original; }
});

test('Firebase hosting rewrite points at the registered region', () => {
  const config = require('../../firebase.json');
  const rewrite = config.hosting.flatMap((hosting) => hosting.rewrites || []).find((entry) => entry.source === '/api/aep-ingestion-diagnostics');
  assert.deepEqual(rewrite.function, { functionId: 'aepIngestionDiagnosticsProxy', region: 'us-central1' });
});
