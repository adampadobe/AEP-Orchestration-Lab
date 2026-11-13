'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerAepIngestionDiagnosticsRoutes } = require('../aepIngestionDiagnosticsRoutes');

function fixture({ entries, failure, keyResult, scheduleDiagnostic, recoveryFailure } = {}) {
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
    profileSeedScheduleSkipPreview: async (context) => {
      calls.push({ ...context, recovery: 'preview' });
      if (recoveryFailure) throw recoveryFailure;
      return { status: 'policy_review_required', plan_id: 'fixture-plan', health_policy_change_required: true };
    },
    profileSeedScheduleSkipApply: async (context) => {
      calls.push({ ...context, recovery: 'apply' });
      if (recoveryFailure) throw recoveryFailure;
      return { ok: true, skipped: true, dispatcher_unblocked: true, ingestion: 'not_started' };
    },
  });
  async function request(query, headers = { 'x-aep-lab-mcp-key': 'fixture-key' }, method = 'GET', body) {
    const res = {
      statusCode: 0, body: null, headers: {},
      set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      send(body) { this.body = body; return this; },
    };
    await handler({ query, headers, method, body }, res);
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

test('GET/POST/OPTIONS route rejects unsupported methods without authentication or platform access', async () => {
  const ctx = fixture();
  assert.equal((await ctx.request({}, {}, 'OPTIONS')).statusCode, 204);
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await ctx.request({}, {}, method)).statusCode, 405);
  }
  assert.equal(ctx.tokens, 0);
});

const previewBody = { action: 'profile_seed_schedule_skip_preview', sandbox: 'sandbox-a', day: '2026-11-13', slot_id: '15', allow_verified_idle_runs: true };
const applyBody = {
  action: 'profile_seed_schedule_skip_apply', sandbox: 'sandbox-a',
  plan_id: '11111111-2222-4333-8444-555555555555', manifest_digest: 'a'.repeat(64), expected_count: 3,
  confirmed: true, skip_only_acknowledged: true, idle_readiness_acknowledged: true, confirmation_phrase: 'EXACT REVIEWED PHRASE',
};

test('POST recovery forwards only validated input and verified identity to distinct callbacks', async () => {
  const ctx = fixture();
  const preview = await ctx.request({}, undefined, 'POST', previewBody);
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.body.status, 'policy_review_required');
  assert.equal(ctx.calls[0].recovery, 'preview');
  assert.equal(ctx.calls[0].principal.principalUid, 'fixture-uid');
  assert.equal(ctx.calls[0].auth.sandbox, 'sandbox-a');
  assert.deepEqual(ctx.calls[0].input, { day: '2026-11-13', slot_id: '15', allow_verified_idle_runs: true });
  const apply = await ctx.request({ action: applyBody.action }, undefined, 'POST', applyBody);
  assert.equal(apply.statusCode, 200);
  assert.equal(apply.body.ingestion, 'not_started');
  assert.equal(ctx.calls[1].recovery, 'apply');
  assert.equal(ctx.calls[1].input.confirmation_phrase, applyBody.confirmation_phrase);
  assert.equal(ctx.calls[1].input.expected_count, 3);
});

test('method isolation and malformed recovery inputs fail before token or service access', async () => {
  const cases = [
    [{ action: previewBody.action }, 'GET', undefined, 405],
    [{ action: applyBody.action }, 'GET', undefined, 405],
    [{ action: previewBody.action }, 'POST', undefined, 400],
    [{}, 'POST', [], 400],
    [{}, 'POST', 'json text', 400],
    [{}, 'POST', { action: 'batch_diagnose' }, 400],
    [{ action: applyBody.action }, 'POST', previewBody, 400],
    [{ sandbox: 'sandbox-a' }, 'POST', previewBody, 400],
    [{}, 'POST', { ...previewBody, principalUid: 'spoofed' }, 400],
    [{}, 'POST', { ...previewBody, day: '2026-02-30' }, 400],
    [{}, 'POST', { ...previewBody, slot_id: '16' }, 400],
    [{}, 'POST', { ...previewBody, allow_verified_idle_runs: 'true' }, 400],
    [{}, 'POST', { ...applyBody, expected_count: '3' }, 400],
    [{}, 'POST', { ...applyBody, expected_count: 4 }, 400],
    [{}, 'POST', { ...applyBody, confirmed: false }, 400],
    [{}, 'POST', { ...applyBody, skip_only_acknowledged: false }, 400],
    [{}, 'POST', { ...applyBody, idle_readiness_acknowledged: false }, 400],
    [{}, 'POST', { ...applyBody, manifest_digest: 'invalid' }, 400],
    [{}, 'POST', { ...applyBody, plan_id: 'invalid' }, 400],
    [{}, 'POST', { ...applyBody, confirmation_phrase: '' }, 400],
  ];
  for (const [query, method, body, status] of cases) {
    const ctx = fixture();
    assert.equal((await ctx.request(query, undefined, method, body)).statusCode, status);
    assert.equal(ctx.tokens, 0);
    assert.equal(ctx.calls.length, 0);
  }
});

test('POST recovery enforces authentication sandbox and org before server credentials', async () => {
  for (const [body, headers, status] of [
    [previewBody, {}, 401],
    [{ ...previewBody, sandbox: 'sandbox-b' }, undefined, 403],
    [applyBody, { 'x-aep-lab-mcp-key': 'fixture-key', 'x-gw-ims-org-id': 'OTHER@AdobeOrg' }, 403],
  ]) {
    const ctx = fixture();
    assert.equal((await ctx.request({}, headers, 'POST', body)).statusCode, status);
    assert.equal(ctx.tokens, 0);
    assert.equal(ctx.calls.length, 0);
  }
  const ctx = fixture();
  const headers = { authorization: 'Bearer fixture-session', 'x-gw-ims-org-id': 'TEST@AdobeOrg', 'x-aep-lab-principal-uid': 'spoofed' };
  assert.equal((await ctx.request({}, headers, 'POST', previewBody)).statusCode, 200);
  assert.equal(ctx.calls[0].principal.principalUid, 'fixture-uid');
  const revoked = fixture({ entries: [{ principalUid: 'fixture-uid', sandbox: 'sandbox-a', revoked: true }] });
  assert.equal((await revoked.request({}, headers, 'POST', previewBody)).statusCode, 403);
  assert.equal(revoked.tokens, 0);
});

test('recovery preserves owner denial and stale receipt conflicts without diagnostic fallback', async () => {
  for (const status of [400, 403, 409]) {
    const ctx = fixture({ recoveryFailure: Object.assign(new Error('Reviewed recovery rejected.'), { status }) });
    const res = await ctx.request({}, undefined, 'POST', applyBody);
    assert.equal(res.statusCode, status);
    assert.equal(res.body.error, 'Reviewed recovery rejected.');
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].recovery, 'apply');
  }
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
