'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMyDataFlowsTraceService, relevantBindings, publicRun } = require('../myDataFlowsTraceService');
const { createMyDataFlowsTraceStore } = require('../myDataFlowsTraceStore');
const { createMyDataFlowsTraceAep } = require('../myDataFlowsTraceAep');
const { registerMyDataFlowsTraceRoutes } = require('../myDataFlowsTraceRoutes');

test('legacy unsupported destination checks remain manual without mislabelling temporary failures', () => {
  const stages = publicRun({ stages: [
    { id: 'aepXdm', state: 'unavailable', detail: 'Automatic dataset row readback is not supported by the current AEP REST integration.' },
    { id: 'aepProfile', state: 'unavailable', detail: 'Read failed.' },
    { id: 'aepRel', state: 'unavailable', detail: 'Metadata read failed.' },
  ] }).stages;
  assert.equal(stages[0].verification, 'manual');
  assert.equal(stages[1].verification, undefined);
  assert.equal(stages[2].verification, undefined);
});

test('production trace wiring initializes the Admin app before requesting Auth on a cold start', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  const start = source.indexOf('Object.assign(exports, registerMyDataFlowsTraceRoutes({');
  const end = source.indexOf('\nconst commerceFnOpts', start);
  assert.ok(start >= 0 && end > start);
  let initialized = false;
  let getServices;
  const db = {};
  const auth = {};
  const modules = {
    './adminFirestore': { getAdminFirestore() { initialized = true; return db; } },
    'firebase-admin': { auth() {
      assert.equal(initialized, true, 'Auth must not run before Admin initialization');
      return auth;
    } },
    './myDataFlowsTraceStore': { createMyDataFlowsTraceStore(value) {
      assert.equal(value, db);
      return {};
    } },
    './myDataFlowsSnowflake': { createMyDataFlowsSnowflake: () => ({}) },
    './myDataFlowsTraceAep': { createMyDataFlowsTraceAep: () => ({}) },
    './labProfileGenerationPrefsStore': { getPrefs: async () => ({}) },
  };
  vm.runInNewContext(source.slice(start, end), {
    exports: {}, onRequest() {}, profileFnOpts: {}, SNOWFLAKE_VPC_OPTS: {}, setCors() {},
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unexpected service dependency: ${name}`);
      return modules[name];
    },
    registerMyDataFlowsTraceRoutes(options) { getServices = options.getServices; return {}; },
    createMyDataFlowsTraceService: (options) => options,
  });
  assert.equal(getServices().auth, auth);
});

const id = '71cc1a4c-3861-4abd-929f-344b30fd37dc';
const otherId = 'c0d933de-beca-433a-ade9-9b631258be81';
const identity = { email: 'demo+10112026-1@example.test', ecid: '12345678901234567890123456789012345678', crmId: 'CRM1000', recipientId: 'R-demo' };
const mobilePhone = '+447700900111';
const owner = { uid: 'owner', email: 'apalmer@adobe.com', disabled: false };
const claims = { uid: owner.uid, email: owner.email, firebase: { sign_in_provider: 'password' } };
const auth = { orgId: 'BF9C27AA6464801C0A495FD0@AdobeOrg', accessToken: 'test-only', clientId: 'test-only' };

function fakeFirestore() {
  const data = new Map();
  const snap = (key) => ({ exists: data.has(key), data: () => structuredClone(data.get(key)) });
  const doc = (key) => ({
    key, get: async () => snap(key), collection: (name) => collection(`${key}/${name}`),
  });
  const collection = (key) => ({ doc: (name) => doc(`${key}/${name}`) });
  let queue = Promise.resolve();
  return {
    collection, data,
    runTransaction(work) {
      const current = queue.then(() => work({
        get: async (ref) => snap(ref.key),
        set(ref, value, options) {
          data.set(ref.key, structuredClone(options?.merge ? { ...data.get(ref.key), ...value } : value));
        },
        update(ref, patch) { data.set(ref.key, structuredClone({ ...data.get(ref.key), ...patch })); },
      }));
      queue = current.catch(() => {});
      return current;
    },
  };
}
function fixture(overrides = {}) {
  let time = Date.parse('2026-11-10T12:00:00Z');
  const now = () => new Date(time);
  const db = fakeFirestore();
  const store = createMyDataFlowsTraceStore(db, now);
  const counts = { generate: 0, inspect: 0, preflight: 0 };
  const snowflake = {
    async preflight() { counts.preflight++; return { ready: true, mobilePhone, baseEmail: 'demo@example.test' }; },
    async generate({ onPrepared, expectedMobilePhone }) {
      counts.generate++;
      assert.equal(expectedMobilePhone, mobilePhone);
      await onPrepared({ profiles: [identity], mobilePhone });
      assert.deepEqual((await store.get('owner', id)).identity, identity, 'identity is durable before source writes');
      return { ok: true };
    },
    async inspect() {
      counts.inspect++;
      return {
        source: { state: 'verified', evidence: { count: 1 }, queries: [{
          table: 'TRAVEL_DATABASE.AEP_SCHEMA.TEST',
          sql: 'SELECT ECID FROM TRAVEL_DATABASE.AEP_SCHEMA.TEST WHERE EMAIL = ? AND ECID = ? LIMIT 10',
          parameters: ['identity.email', 'identity.ecid'],
        }] },
        rel: { state: 'waiting' },
      };
    },
    ...overrides.snowflake,
  };
  const service = createMyDataFlowsTraceService({
    now, store, snowflake,
    getPrefs: async () => ({ baseEmail: 'demo@example.test', mobilePhone }),
    aep: { inspect: async () => ({ state: 'verified', detail: 'Exact identity.' }), ...overrides.aep },
    flowSnapshot: async () => ({
      complete: true, limitations: [], flows: [{
        state: 'enabled', sourceTables: ['REL.RECIPIENT'], datasets: [{ id: 'dataset', name: 'rel_recipient' }],
        lastRun: { state: 'success', readCount: 1, failedCount: 0 },
      }],
    }),
    logger: { error() {}, warn() {} },
  });
  return { service, store, db, counts, advance: (ms) => { time += ms; } };
}

test('one durable creation per request, including concurrency and industry-conflict recovery', async () => {
  const { service, counts } = fixture();
  const runs = await Promise.all([service.create('owner', 'fsi', id), service.create('owner', 'fsi', id)]);
  assert.equal(counts.generate, 1);
  assert.equal(runs.some((run) => run.state === 'watching'), true);
  const recovered = await service.create('owner', 'fsi', id);
  assert.deepEqual(recovered.identity, identity);
  assert.equal(recovered.expected, undefined);
  assert.equal(counts.generate, 1);
  await assert.rejects(service.create('owner', 'travel', id), { status: 409 });
  await assert.rejects(service.create('owner', 'fsi', otherId), { status: 429 });
  await assert.rejects(service.create('owner', 'generic', otherId), { status: 400 });
  await assert.rejects(service.create('owner', 'fsi', '../../bad'), { status: 400 });
});

test('uncertain creation persists same identity; resume checks never replay the write', async () => {
  const { service, counts } = fixture({
    snowflake: { generate: async ({ onPrepared }) => {
      counts.generate++;
      await onPrepared({ profiles: [identity] });
      throw new Error('transport failed after possible commit');
    } },
  });
  const run = await service.create('owner', 'fsi', id);
  assert.equal(run.state, 'needs_attention');
  assert.equal(run.generation.state, 'unknown');
  await service.create('owner', 'fsi', id);
  const checked = await service.read('owner', id, true);
  assert.equal(counts.generate, 1);
  assert.deepEqual(checked.identity, identity);
  assert.equal((await service.read('someone-else', id)), null);
});

test('readiness failure never reserves a receipt or creates data', async () => {
  const { service, counts, store } = fixture({ snowflake: { preflight: async () => ({ ready: false }) } });
  await assert.rejects(service.create('owner', 'fsi', id), { status: 400 });
  assert.equal(counts.generate, 0);
  assert.equal(await store.get('owner', id), null);
});

test('a lost final receipt is uncertain and cannot replay a committed creation', async () => {
  const { service, store, counts } = fixture();
  const update = store.update;
  let writes = 0;
  store.update = async (...args) => {
    writes++;
    if (writes === 2) throw new Error('receipt transport failed');
    return update(...args);
  };
  const run = await service.create('owner', 'fsi', id);
  assert.equal(run.state, 'needs_attention');
  assert.deepEqual(run.identity, identity);
  await service.create('owner', 'fsi', id);
  assert.equal(counts.generate, 1);
});

test('flow success cannot verify dataset arrival; persisted readbacks have independent truthful stages', async () => {
  const { service, counts } = fixture();
  await service.create('owner', 'fsi', id);
  const run = await service.read('owner', id, true);
  const stages = Object.fromEntries(run.stages.map((s) => [s.id, s]));
  assert.equal(stages.source.state, 'verified');
  assert.match(stages.source.queries[0].text, /demo\+10112026-1@example\.test/);
  assert.ok(!stages.source.queries[0].text.includes('?'));
  assert.match(stages.source.queries[0].label, /identity-filtered/);
  assert.equal(stages.rel.state, 'waiting');
  assert.equal(stages.aepProfile.state, 'verified');
  assert.equal(stages.ingestion.state, 'waiting');
  assert.equal(stages.aepXdm.state, 'unavailable');
  assert.equal(stages.aepRel.state, 'unavailable');
  assert.equal(stages.aepXdm.verification, 'manual');
  assert.equal(stages.aepRel.verification, 'manual');
  assert.match(stages.aepRel.queries[0].text, /NOT been executed/);
  assert.match(stages.aepRel.queries[0].text, /R-demo/);
  assert.equal(run.checkLeaseUntil, undefined);
  await Promise.all([service.read('owner', id, true), service.read('owner', id, true)]);
  assert.equal(counts.inspect, 1, 'lease prevents overlapping or rapid checks');
});

test('partial read failures remain unavailable and do not erase successful independent evidence', async () => {
  const { service } = fixture({ aep: { inspect: async () => { throw new Error('private upstream body'); } } });
  await service.create('owner', 'fsi', id);
  const run = await service.read('owner', id, true);
  assert.equal(run.stages.find((s) => s.id === 'aepProfile').state, 'unavailable');
  assert.notEqual(run.stages.find((s) => s.id === 'aepProfile').verification, 'manual', 'Temporary read failures are not unsupported capabilities');
  assert.equal(run.stages.find((s) => s.id === 'source').state, 'verified');
  assert.ok(!JSON.stringify(run).includes('private upstream'));
});

test('stale creating receipt can be inspected without generating again; active receipt blocks another create', async () => {
  const { store, service, advance, counts } = fixture();
  await store.reserve('owner', {
    id, industry: 'fsi', createdAt: '2026-11-10T12:00:00Z', state: 'creating',
    identity, expected: { mobilePhone }, stages: [],
  });
  await assert.rejects(service.create('owner', 'fsi', otherId), { status: 409 });
  advance(361_000);
  const run = await service.read('owner', id, true);
  assert.equal(run.state, 'needs_attention');
  assert.equal(run.generation.state, 'unknown');
  assert.equal(counts.generate, 0);
  assert.equal(counts.inspect, 1);
});

function profileEntity(overrides = {}) {
  return { 'entity-1': { entity: {
    personalEmail: { address: identity.email }, identityMap: { ECID: [{ id: identity.ecid }] },
    mobilePhone: { number: mobilePhone }, testProfile: true, ...overrides,
  } } };
}
test('AEP readback verifies both identities and stored mobile/test flag; credentials stay server-side', async () => {
  const calls = [];
  const aep = createMyDataFlowsTraceAep({
    getAdobeAuth: async () => auth,
    fetchImpl: async (url, opts) => {
      calls.push(url);
      assert.equal(new URL(url).origin, 'https://platform.adobe.io');
      assert.equal(opts.method, 'GET');
      assert.equal(opts.redirect, 'error');
      assert.equal(opts.headers['x-sandbox-name'], 'apalmer');
      assert.ok(opts.signal);
      return Response.json(profileEntity());
    },
  });
  const result = await aep.inspect(identity, { mobilePhone });
  assert.equal(calls.length, 2);
  assert.equal(result.state, 'verified');
  assert.ok(!JSON.stringify(result).includes(auth.accessToken));
});

test('AEP missing, multiple, contradictory, malformed or failed reads never produce false green', async () => {
  for (const data of [
    profileEntity({ mobilePhone: { number: '+447700900999' } }),
    profileEntity({ personalEmail: { address: 'another@example.test' } }),
    profileEntity({ testProfile: false }),
    {},
  ]) {
    const aep = createMyDataFlowsTraceAep({ getAdobeAuth: async () => auth, fetchImpl: async () => Response.json(data) });
    assert.equal((await aep.inspect(identity, { mobilePhone })).state, 'waiting');
  }
  for (const data of [
    { ...profileEntity(), 'entity-2': { entity: {} } }, [],
    { error: 'private error' },
  ]) {
    const aep = createMyDataFlowsTraceAep({ getAdobeAuth: async () => auth, fetchImpl: async () => Response.json(data) });
    await assert.rejects(aep.inspect(identity, { mobilePhone }));
  }
  const notFound = createMyDataFlowsTraceAep({ getAdobeAuth: async () => auth, fetchImpl: async () => Response.json({
    'error-code': 'UPLIB-201001-404', title: 'Entity not found.', status: 404,
  }, { status: 404 }) });
  assert.equal((await notFound.inspect(identity, { mobilePhone })).state, 'waiting');
  const broken = createMyDataFlowsTraceAep({ getAdobeAuth: async () => ({ ...auth, orgId: 'wrong-org' }), fetchImpl: async () => assert.fail() });
  await assert.rejects(broken.inspect(identity, { mobilePhone }));
  const split = createMyDataFlowsTraceAep({
    getAdobeAuth: async () => auth,
    fetchImpl: async (url) => {
      const entity = profileEntity();
      return Response.json(new URL(url).searchParams.get('entityIdNS') === 'Email'
        ? entity : { 'other-entity': entity['entity-1'] });
    },
  });
  assert.equal((await split.inspect(identity, { mobilePhone })).state, 'waiting');
});

function route(overrides = {}) {
  let reads = 0;
  const handler = registerMyDataFlowsTraceRoutes({
    onRequest: (_, h) => h, fnOpts: {}, setCors() {}, logger: { error() {} },
    getServices: () => ({
      auth: {
        verifyIdToken: async (_, revoked) => { assert.equal(revoked, true); return claims; },
        getUserByEmail: async () => owner, ...overrides.auth,
      },
      trace: {
        prefs: async () => ({ ready: true }),
        read: async () => { reads++; return null; },
        create: async () => { throw Object.assign(new Error('upstream credentials'), { status: 400 }); },
      },
    }),
  }).myDataFlowsTrace;
  return {
    reads: () => reads,
    async invoke(patch = {}) {
      const req = { method: 'GET', query: {}, headers: { authorization: 'Bearer fixture' }, ...patch };
      const res = {
        headers: {}, statusCode: 200,
        set(k, v) { this.headers[k] = v; return this; },
        status(v) { this.statusCode = v; return this; },
        json(v) { this.body = v; return this; }, send() { return this; },
      };
      await handler(req, res);
      return res;
    },
  };
}
test('trace endpoints enforce owner, revocation, strict scope and no raw upstream errors', async () => {
  const api = route();
  assert.equal((await api.invoke({ headers: {} })).statusCode, 401);
  assert.equal(api.reads(), 0);
  const other = route({ auth: { verifyIdToken: async () => ({ ...claims, uid: 'another' }) } });
  assert.equal((await other.invoke({ method: 'POST', body: { industry: 'fsi', requestId: id } })).statusCode, 403);
  assert.equal(other.reads(), 0);
  const revoked = route({ auth: { verifyIdToken: async () => { throw Object.assign(new Error(), { code: 'auth/id-token-revoked' }); } } });
  assert.equal((await revoked.invoke()).statusCode, 401);
  assert.equal((await api.invoke({ query: { sandbox: 'other' } })).statusCode, 400);
  assert.equal((await api.invoke({ query: { refresh: ['true'] } })).statusCode, 400);
  assert.equal((await api.invoke({ method: 'POST', body: { industry: 'fsi', requestId: id, count: 10 } })).statusCode, 400);
  const failed = await api.invoke({ method: 'POST', body: { industry: 'fsi', requestId: id } });
  assert.ok(!failed.body.error.includes('credentials'));
  const read = await api.invoke();
  assert.equal(read.statusCode, 200);
  assert.equal(read.headers['Cache-Control'], 'private, no-store');
  assert.equal((await api.invoke({ method: 'DELETE' })).statusCode, 405);
});

test('flow registry selection includes shared parents, chosen industry only, and paired Hosting export', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const selected = relevantBindings('fsi');
  assert.ok(selected.some((entry) => entry.table === 'REL.RECIPIENT'));
  assert.ok(selected.some((entry) => entry.table.includes('BASE_PROFILE')));
  assert.ok(!selected.some((entry) => /RETAIL|MEDIA|TELECOM|SPORTS/.test(entry.table)));
  const root = path.join(__dirname, '../..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json')));
  assert.ok([config.hosting].flat().flatMap((hosting) => hosting.rewrites || []).some((rewrite) => rewrite.source === '/api/architecture/my-data-flows/trace'
    && rewrite.function.functionId === 'myDataFlowsTrace' && rewrite.function.region === 'us-central1'));
  assert.match(fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8'), /registerMyDataFlowsTraceRoutes\(/);
});
