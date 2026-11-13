'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerMyDataFlowsRoutes } = require('../myDataFlowsRoutes');
const { createMyDataFlowsService, enabledTag, runSummary } = require('../myDataFlowsService');
const { reference } = require('../myDataFlowsReference');
const { bindings, retiredBindings } = require('../myDataFlowsRegistry');

test('active architecture bindings retain REL and XDM ingestion but omit orphaned legacy travel destinations', () => {
  const active = new Set(bindings.map((binding) => binding.id));
  assert.ok(retiredBindings.every((binding) => !active.has(binding.id)));
  assert.ok(active.has('f0cdb096-4568-46a6-8d5c-df38d9891716'));
  assert.ok(active.has('065f3b53-df40-43d1-9d91-c42f031996d6'));
  assert.ok(active.has('4faef7e2-8ad3-459c-b8b8-34c8be5e0ac1'));
  assert.ok(retiredBindings.every((binding) => binding.replacementTables.every((table) =>
    bindings.some((current) => current.table === table && current.nodeIds.includes('rel-flow')))));
});

const fid = 'e0e84239-9802-46fa-a777-e38c98f52429';
const sid = '5b38d9f4-8c1d-4ed2-a4fc-f62a625db251';
const tid = 'd4759099-cffc-4ee5-98f2-4341e4142de0';
const rid = 'f186ae78-1d1b-482b-9a0d-be5c3667d926';
const did = '6aeecbf4d64daf43b7a9e39b';
const auth = { accessToken: 'in-memory-test-only', clientId: 'test-client', orgId: 'BF9C27AA6464801C0A495FD0@AdobeOrg' };
const owner = { uid: 'owner', email: 'apalmer@adobe.com', disabled: false };
const claims = { uid: owner.uid, email: owner.email, firebase: { sign_in_provider: 'password' } };

function route(overrides = {}) {
  let apiCalls = 0;
  const handler = registerMyDataFlowsRoutes({
    onRequest: (_, h) => h, fnOpts: {}, setCors() {}, logger: { error() {}, warn() {} },
    getServices: () => ({
      auth: {
        verifyIdToken: async (_, revoked) => { assert.equal(revoked, true); return claims; },
        getUserByEmail: async () => owner, ...overrides.auth,
      },
      getAdobeAuth: async () => { apiCalls++; return auth; },
      service: { snapshot: overrides.snapshot || (async () => ({ complete: true, limitations: [], flows: [] })) },
    }),
  }).myDataFlows;
  async function invoke(patch = {}) {
    const req = { method: 'GET', headers: { authorization: 'Bearer test' }, query: {}, ...patch };
    const res = {
      headers: {}, statusCode: 200, body: undefined,
      set(k, v) { this.headers[k] = v; return this; },
      status(v) { this.statusCode = v; return this; },
      json(v) { this.body = v; return this; }, send(v) { this.body = v; return this; },
    };
    await handler(req, res);
    return res;
  }
  return { invoke, calls: () => apiCalls };
}

test('reference requires owner token and current enabled UID; no protected data on denial', async () => {
  const missing = await route().invoke({ headers: {} });
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.body.reference, undefined);
  for (const bad of [
    { ...claims, email: 'other@adobe.com' },
    { ...claims, uid: 'forged' },
    { ...claims, firebase: { sign_in_provider: 'anonymous' } },
  ]) {
    const r = route({ auth: { verifyIdToken: async () => bad } });
    const response = await r.invoke({ query: { refresh: 'true' } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.reference, undefined);
    assert.equal(r.calls(), 0);
  }
  const disabled = await route({ auth: { getUserByEmail: async () => ({ ...owner, disabled: true }) } }).invoke();
  assert.equal(disabled.statusCode, 403);
  for (const code of ['auth/id-token-expired', 'auth/id-token-revoked']) {
    const response = await route({ auth: { verifyIdToken: async () => { throw Object.assign(new Error('private token'), { code }); } } }).invoke();
    assert.equal(response.statusCode, 401);
    assert.ok(!JSON.stringify(response.body).includes('private token'));
  }
});

test('owner reference does not access Adobe, uses no-store, and accepts only fixed scope', async () => {
  const r = route();
  const response = await r.invoke();
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Vary, 'Authorization');
  assert.equal(response.body.live, null);
  assert.equal(response.body.reference.scenarios.length, 5);
  assert.equal(r.calls(), 0);
  for (const query of [
    { sandbox: 'other' }, { refresh: ['true'] }, { refresh: 'yes' },
    { sandbox: ['apalmer'] }, { url: 'https://attacker.example' },
  ]) assert.equal((await r.invoke({ query })).statusCode, 400);
  assert.equal((await r.invoke({ method: 'POST' })).statusCode, 405);
  assert.equal((await r.invoke({ method: 'OPTIONS', headers: {} })).statusCode, 204);
});

test('read-only refresh coalesces, caches complete metadata and still authenticates every request', async () => {
  let resolve;
  const r = route({ snapshot: () => new Promise((done) => { resolve = done; }) });
  const a = r.invoke({ query: { refresh: 'true' } });
  const b = r.invoke({ query: { refresh: 'true' } });
  await new Promise(setImmediate);
  resolve({ complete: true, limitations: [], fetchedAt: '2026-11-10T11:00:00Z' });
  const results = await Promise.all([a, b]);
  assert.equal(r.calls(), 1);
  assert.deepEqual(results[0].body.live, results[1].body.live);
  await r.invoke({ query: { refresh: 'true' } });
  assert.equal(r.calls(), 1);
  assert.equal((await r.invoke({ query: { refresh: 'true' }, headers: {} })).statusCode, 401);
});

test('partial refresh is explicit and not cached; failures never expose raw errors', async () => {
  const r = route({ snapshot: async () => ({ complete: false, limitations: ['missing'], flows: [] }) });
  assert.equal((await r.invoke({ query: { refresh: 'true' } })).body.live.complete, false);
  await r.invoke({ query: { refresh: 'true' } });
  assert.equal(r.calls(), 2);
  const broken = route({ snapshot: async () => { throw new Error('credentials and raw response'); } });
  const response = await broken.invoke({ query: { refresh: 'true' } });
  assert.equal(response.statusCode, 503);
  assert.ok(!JSON.stringify(response.body).includes('credentials'));
  assert.equal((await broken.invoke()).statusCode, 200);
});

function fixtures() {
  return {
    [`/flowservice/flows/${fid}`]: { items: [{
      id: fid, name: 'ACCOUNT', state: 'enabled', sandboxName: 'apalmer',
      sourceConnectionIds: [sid], targetConnectionIds: [tid],
      scheduleParams: { interval: 15, frequency: 'minute', backfill: true },
      transformations: [{ name: 'Mapping', params: { mappingId: 'mapping', mappingVersion: 1 } }],
      lastRunDetails: { id: rid },
    }] },
    [`/flowservice/sourceConnections/${sid}`]: { items: [{ id: sid, params: { tableName: 'REL.REL_FSI_ACCOUNT', cdcEnabled: true }, auth: { secret: 'never-output' } }] },
    [`/flowservice/targetConnections/${tid}`]: { items: [{ id: tid, params: { dataSetId: did } }] },
    [`/catalog/dataSets/${did}`]: { [did]: { name: 'rel_fsi_account', schemaRef: { id: 'schema' },
      tags: { unifiedProfile: ['enabled:false'] }, extensions: { adobe_journeyOptimizer: { status: 'COMPLETED', private: 'never-output' } } } },
    [`/flowservice/runs/${rid}`]: { items: [{
      id: rid, flowId: fid, sandboxName: 'apalmer',
      metrics: { recordSummary: { inputRecordCount: 1, updatedRecordCount: 1, failedRecordCount: 0, deletedRecordCount: 0 },
        durationSummary: { startedAtUTC: 1794305447098, completedAtUTC: 1794305640662 }, statusSummary: { status: 'success' } },
    }] },
  };
}

test('only exact completed empty Snowflake copy runs expose bounded idle evidence without inventing counters', () => {
  const metrics = {
    recordSummary: { inputRecordCount: 0 }, sizeSummary: { inputBytes: 0 },
    durationSummary: { startedAtUTC: 1794305447098, completedAtUTC: 1794305640662 },
    statusSummary: { status: 'success' },
  };
  const raw = { id: rid, metrics, activities: [{
    id: '4f008a00-3a04-11eb-adc1-0242ac120002', name: 'SnowFlake Copy Activity',
    ...structuredClone(metrics), internal: 'never-output',
  }] };
  const result = runSummary(raw);
  assert.equal(result.failedCount, null);
  assert.equal(result.writtenCount, null);
  assert.equal(result.verifiedIdleEvidence.inputBytes, 0);
  assert.equal(result.verifiedIdleEvidence.failedRecordCount, null);
  assert.equal(JSON.stringify(result).includes('never-output'), false);
  for (const mutate of [
    (r) => { r.activities = []; },
    (r) => { r.activities.push({ name: 'Promotion Activity' }); },
    (r) => { r.activities[0].id = 'unknown'; },
    (r) => { r.activities[0].name = 'Copy Activity'; },
    (r) => { r.state = 'failed'; r.activities[0].state = 'failed'; },
    (r) => { r.state = 'inProgress'; },
    (r) => { r.activities[0].state = 'unknown'; },
    (r) => { r.state = null; },
    (r) => { r.metrics.recordSummary.inputRecordCount = 1; },
    (r) => { delete r.activities[0].sizeSummary.inputBytes; },
    (r) => { r.activities[0].durationSummary.completedAtUTC++; },
    (r) => { r.metrics.durationSummary.startedAtUTC = '1794305447098'; },
    (r) => { r.activities[0].statusSummary.status = 'inProgress'; },
    (r) => { r.metrics.statusSummary.errors = [{ code: 'error' }]; },
    (r) => { r.errors = ['error']; },
    (r) => { r.metrics.recordSummary.outputRecordCount = -1; },
    (r) => { r.activities[0].recordSummary.skippedRecordCount = 1; },
    (r) => { r.metrics.recordSummary.failedRecordCount = '0'; },
    (r) => { r.activities[0].sizeSummary.outputBytes = null; },
  ]) {
    const changed = structuredClone(raw);
    mutate(changed);
    assert.equal(runSummary(changed).verifiedIdleEvidence, null);
  }
  const success = structuredClone(raw);
  success.state = 'success';
  success.activities[0].state = 'success';
  assert.ok(runSummary(success).verifiedIdleEvidence);
});

function service(overrides = {}) {
  const data = fixtures();
  const calls = [];
  const svc = createMyDataFlowsService({
    registry: [{ id: fid, table: 'REL.REL_FSI_ACCOUNT', nodeIds: ['rel-flow', 'rel-datasets'] }],
    getConnection: async () => null,
    getEventConfig: async () => ({ datastreamId: 'stream', schemaId: 'schema', url: 'never-output' }),
    now: () => new Date('2026-11-10T11:00:00Z'),
    fetchImpl: async (url, opts) => {
      calls.push(url);
      assert.equal(opts.method, 'GET');
      assert.equal(opts.redirect, 'error');
      assert.equal(opts.headers['x-sandbox-name'], 'apalmer');
      assert.equal(new URL(url).origin, 'https://platform.adobe.io');
      return Response.json(data[new URL(url).pathname.replace('/data/foundation', '')]);
    },
    ...overrides,
  });
  return { svc, calls, data };
}

test('snapshot verifies bindings and exposes only projected metadata, exact zeros and observed times', async () => {
  const { svc, calls } = service();
  const result = await svc.snapshot(auth);
  assert.equal(result.complete, true);
  const flow = result.flows[0];
  assert.equal(flow.lastRun.updatedCount, 1);
  assert.equal(flow.lastRun.failedCount, 0);
  assert.equal(flow.lastRun.completedAt, '2026-11-10T10:14:00.662Z');
  assert.equal(flow.datasets[0].profileEnabled, false);
  assert.equal(flow.datasets[0].ocStatus, 'COMPLETED');
  assert.equal(flow.cdcEnabled, true);
  assert.equal(flow.mappings[0].version, 1);
  assert.deepEqual(flow.nodeIds, ['rel-flow', 'rel-datasets']);
  assert.equal(flow.observationKind, 'scheduled');
  assert.equal(calls.length, 5);
  assert.ok(!JSON.stringify(result).includes('never-output'));
  assert.ok(!JSON.stringify(result).includes(auth.accessToken));
});

test('failed or mismatched bindings are unknown with explicit limitations, not success-shaped metadata', async () => {
  for (const mutation of [
    (d) => { d[`/flowservice/sourceConnections/${sid}`].items[0].params.tableName = 'REL.UNRELATED'; },
    (d) => { d[`/flowservice/runs/${rid}`].items[0].flowId = sid; },
    (d) => { d[`/flowservice/flows/${fid}`].items[0].sandboxName = 'other'; },
    (d) => { d[`/flowservice/flows/${fid}`].items[0].imsOrgId = 'other'; },
    (d) => { d[`/flowservice/flows/${fid}`].items[0].targetConnectionIds = [tid, sid]; },
  ]) {
    const { svc, data } = service();
    mutation(data);
    const result = await svc.snapshot(auth);
    assert.equal(result.complete, false);
    assert.equal(result.flows[0].state, 'unknown');
    assert.equal(result.flows[0].lastRun, null);
    assert.deepEqual(result.flows[0].nodeIds, ['rel-flow', 'rel-datasets'], 'Unavailable reads retain their reviewed component association');
    assert.ok(result.limitations.some((s) => s.includes('verification failed')));
  }
  const { svc } = service({ fetchImpl: async () => Response.json({ secret: 'hidden' }, { status: 403 }) });
  const result = await svc.snapshot(auth);
  assert.equal(result.complete, false);
  assert.ok(result.limitations.some((s) => s.includes('HTTP 403')));
  assert.ok(!JSON.stringify(result).includes('hidden'));
});

test('organization mismatches stop before any Adobe metadata access', async () => {
  const { svc, calls } = service();
  await assert.rejects(() => svc.snapshot({ ...auth, orgId: 'other' }), /organization/);
  assert.equal(calls.length, 0);
});

test('saved streaming flow target must match saved connection; inlet URLs never leave the server', async () => {
  const { svc } = service({
    getConnection: async () => ({ streaming: { flowId: fid, datasetId: did, url: 'secret-inlet' } }),
  });
  const result = await svc.snapshot(auth);
  assert.equal(result.streaming.length, 7);
  assert.ok(result.streaming.every((s) => s.configured));
  assert.ok(result.flows.filter((flow) => flow.observationKind === 'streaming_configuration')
    .every((flow) => flow.nodeIds.length === 1 && flow.nodeIds[0] === 'http'));
  assert.ok(!JSON.stringify(result).includes('secret-inlet'));
  const bad = service({ getConnection: async () => ({ streaming: { flowId: fid, datasetId: 'wrong' } }) });
  const rejected = await bad.svc.snapshot(auth);
  assert.equal(rejected.complete, false);
  assert.ok(rejected.streaming.every((s) => s.unavailable));
});

test('network errors and time budgets stay explicit without leaking exception messages', async () => {
  const broken = service({ fetchImpl: async () => { throw new Error('private network or signed URL'); } });
  const result = await broken.svc.snapshot(auth);
  assert.equal(result.complete, false);
  assert.ok(!JSON.stringify(result).includes('private network'));
  const timed = service({ budgetMs: 1, fetchImpl: async (_, { signal }) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    signal.throwIfAborted();
  } });
  const late = await timed.svc.snapshot(auth);
  assert.equal(late.complete, false);
  assert.ok(late.limitations.some((s) => s.includes('time budget')));
});

test('missing counts and Profile enablement remain unknown, not zero or enabled', () => {
  assert.equal(enabledTag(undefined), null);
  assert.equal(enabledTag(['enabledAt:yesterday']), null);
  assert.equal(enabledTag(['enabled:true', 'enabledAt:yesterday']), true);
  assert.equal(enabledTag(['enabled:false']), false);
  const r = runSummary({ id: rid, metrics: {} });
  assert.equal(r.readCount, null);
  assert.equal(r.updatedCount, null);
  assert.equal(r.failedCount, null);
  assert.equal(r.startedAt, null);
});

test('all five simulations and industry inventories are connected and bounded by truthful timing semantics', () => {
  const ids = new Set(reference.nodes.map((n) => n.id));
  for (const edge of reference.edges) assert.ok(ids.has(edge.from) && ids.has(edge.to));
  assert.equal(reference.scenarios.length, 5);
  for (const scenario of reference.scenarios) {
    assert.ok(scenario.steps.length >= 4);
    for (const step of scenario.steps) {
      assert.ok(step.nodeIds.every((id) => ids.has(id)));
      assert.ok(['simulation', 'unknown', 'target', 'configured', 'observed'].includes(step.timing.kind));
    }
  }
  assert.equal(reference.industries.flatMap((i) => i.relDatasets).length, 27);
  assert.equal(bindings.filter((b) => b.table.startsWith('REL.')).length, 28);
  assert.equal(new Set(bindings.map((b) => b.id)).size, bindings.length);
  for (const { id } of bindings) assert.match(id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
});

test('Hosting rewrite and deployed named function stay aligned', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const hosting = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
  const rewrite = hosting.flatMap((h) => h.rewrites || []).find((r) => r.source === '/api/architecture/my-data-flows');
  assert.deepEqual(rewrite.function, { functionId: 'myDataFlows', region: 'us-central1' });
  const index = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
  assert.match(index, /Object\.assign\(exports, registerMyDataFlowsRoutes\(\{/);
  assert.match(index, /fnOpts: profileFnOpts/);
});
