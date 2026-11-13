'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
  INDUSTRIES, businessTime, validateConfig, buildDayPlan, diagnoseFlowHealth, assertFlowHealth,
  createProfileSeedScheduleService,
} = require('../profileSeedScheduleService');
const { createProfileSeedScheduleStore, COLLECTION } = require('../profileSeedScheduleStore');
const { relevantBindings } = require('../myDataFlowsTraceService');
const { retiredBindings } = require('../myDataFlowsRegistry');

test('scheduler scopes exclude retired travel destinations without replacing current REL or XDM dependencies', () => {
  for (const industry of INDUSTRIES) {
    const scoped = relevantBindings(industry);
    assert.ok(retiredBindings.every((retired) => !scoped.some((binding) => binding.id === retired.id)));
    assert.ok(scoped.some((binding) => binding.id === 'f0cdb096-4568-46a6-8d5c-df38d9891716'));
    assert.ok(scoped.some((binding) => binding.id === '065f3b53-df40-43d1-9d91-c42f031996d6'));
  }
  assert.ok(relevantBindings('travel').some((binding) => binding.id === '4faef7e2-8ad3-459c-b8b8-34c8be5e0ac1'));
});

const settings = {
  enabled: true, ownerUid: 'owner', sandbox: 'apalmer',
  expectedBaseEmail: 'demo@example.test', expectedMobilePhone: '+447700900111',
  timeZone: 'Asia/Riyadh', startHour: 8, endHour: 18, days: [0, 1, 2, 3, 4, 5],
  dailyCap: 50, campaignIsolationReviewed: true,
};
const config = validateConfig(settings);
const day = '2026-11-11';
const root = `${COLLECTION}/apalmer`;
const controlKey = `${root}/state/dispatcher`;
const dayKey = (date = day) => `${root}/days/${date}`;

function fakeFirestore() {
  const data = new Map([[root, structuredClone(settings)]]);
  const snapshot = (key) => ({ exists: data.has(key), data: () => structuredClone(data.get(key)) });
  const doc = (key) => ({ key, get: async () => snapshot(key), collection: (name) => collection(`${key}/${name}`) });
  const collection = (key) => ({ doc: (name) => doc(`${key}/${name}`) });
  let queue = Promise.resolve();
  return {
    data, collection,
    runTransaction(work) {
      const current = queue.then(async () => {
        const writes = [];
        const result = await work({
          get: async (ref) => {
            assert.equal(writes.length, 0, 'Firestore reads must precede all writes');
            return snapshot(ref.key);
          },
          set: (ref, value) => writes.push([ref.key, structuredClone(value)]),
        });
        for (const [key, value] of writes) data.set(key, value);
        return result;
      });
      queue = current.catch(() => {});
      return current;
    },
  };
}

function fixture(overrides = {}) {
  let time = new Date(`${day}T08:05:00+03:00`);
  const db = fakeFirestore();
  const store = createProfileSeedScheduleStore(db);
  const slots = [{
    id: '00', industry: 'retail', count: 2, dueAt: time.toISOString(), state: 'pending', identities: [],
  }, {
    id: '01', industry: 'fsi', count: 1, dueAt: new Date(+time + 15 * 60_000).toISOString(),
    state: 'pending', identities: [],
  }];
  const plan = { ...buildDayPlan(day, config.fingerprint, 'fixed'), slots, plannedCount: 3 };
  db.data.set(dayKey(), plan);
  const logs = [];
  const calls = { generate: 0, preflight: 0, flow: 0, owner: 0 };
  const snowflake = {
    async preflight({ uid }) {
      calls.preflight++;
      assert.equal(uid, 'owner');
      return { ready: true, baseEmail: settings.expectedBaseEmail, mobilePhone: settings.expectedMobilePhone };
    },
    async generate(input) {
      calls.generate++;
      assert.equal(input.count, 2);
      assert.equal(input.samplingMode, 'ongoing');
      assert.equal(input.expectedBaseEmail, settings.expectedBaseEmail);
      assert.equal(input.expectedMobilePhone, settings.expectedMobilePhone);
      const profiles = Array.from({ length: input.count }, (_, index) => ({
        email: `demo+11112026-${index + 1}@example.test`,
        ecid: String(index + 1).repeat(38), crmId: `CRM${1000 + index}`, recipientId: `R-${index}`,
      }));
      await input.onPrepared({ profiles, runStamp: time.toISOString() });
      assert.deepEqual(db.data.get(dayKey()).slots[0].identities, profiles);
      return { ok: true, tableRowcounts: { SOURCE: 2 } };
    },
    ...overrides.snowflake,
  };
  const health = () => ({
    complete: true, flows: [{
      state: 'enabled', schedule: { frequency: 'minute', interval: 15 },
      lastRun: { state: 'success', completedAt: new Date(+time - 60_000).toISOString(), failedCount: 0 },
    }],
  });
  const service = createProfileSeedScheduleService({
    store, snowflake, now: () => time,
    getOwner: async () => { calls.owner++; return { uid: 'owner', disabled: false, ...overrides.owner }; },
    flowSnapshot: async () => { calls.flow++; return overrides.health || health(); },
    logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  return { db, store, service, calls, snowflake, logs, health,
    advance: (ms) => { time = new Date(+time + ms); },
    setTime: (value) => { time = new Date(value); }, now: () => time };
}

test('Sunday-Friday uses Riyadh 08:00 inclusive to 18:00 exclusive, independent of host timezone', () => {
  for (const date of ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) {
    assert.equal(businessTime(new Date(`${date}T05:00:00Z`)).open, true);
    assert.equal(businessTime(new Date(`${date}T14:59:59Z`)).open, true);
    assert.equal(businessTime(new Date(`${date}T04:59:59Z`)).open, false);
    assert.equal(businessTime(new Date(`${date}T15:00:00Z`)).open, false);
  }
  assert.equal(businessTime(new Date('2026-11-14T09:00:00+03:00')).open, false);
  assert.equal(businessTime(new Date('2026-03-29T05:00:00Z')).open, true);
  assert.equal(businessTime(new Date('2026-10-25T05:00:00Z')).open, true);
});

test('plans have bounded counts, all industries, 15/30/60-minute gaps and stable seeded diversity', () => {
  const totals = [];
  const gaps = new Set();
  for (let index = 0; index < 200; index++) {
    const seed = `seed-${index}`;
    const plan = buildDayPlan(day, config.fingerprint, seed);
    assert.deepEqual(plan, buildDayPlan(day, config.fingerprint, seed));
    assert.ok(plan.plannedCount <= 50);
    assert.equal(plan.plannedCount, plan.slots.reduce((total, slot) => total + slot.count, 0));
    assert.equal(new Set(plan.slots.map((slot) => slot.industry)).size, INDUSTRIES.length);
    plan.slots.forEach((slot, position) => {
      assert.ok(slot.count >= 1 && slot.count <= 3);
      assert.equal(businessTime(new Date(slot.dueAt)).open, true);
      if (position) {
        const prior = plan.slots[position - 1];
        const gap = (Date.parse(slot.dueAt) - Date.parse(prior.dueAt)) / 60_000;
        assert.ok([15, 30, 60].includes(gap));
        gaps.add(gap);
        assert.notEqual(slot.industry, prior.industry);
      }
    });
    totals.push(plan.plannedCount);
  }
  assert.deepEqual([...gaps].sort((a, b) => a - b), [15, 30, 60]);
  const average = totals.reduce((a, b) => a + b) / totals.length;
  assert.ok(average >= 30 && average <= 40, `Average count ${average}`);
  assert.notDeepEqual(buildDayPlan(day, config.fingerprint), buildDayPlan(day, config.fingerprint));
});

test('missing/disabled configuration is inert; malformed enabled policy fails closed', () => {
  assert.equal(validateConfig(undefined), null);
  assert.equal(validateConfig({ enabled: false }), null);
  for (const patch of [
    { sandbox: 'other' }, { ownerUid: '../owner' }, { dailyCap: 51 }, { timeZone: 'UTC' },
    { startHour: 7 }, { endHour: 19 }, { days: [1, 2, 3, 4, 5] },
    { expectedBaseEmail: '' }, { expectedMobilePhone: '07700' }, { campaignIsolationReviewed: false },
  ]) assert.throws(() => validateConfig({ ...settings, ...patch }), { code: 'SEED_SCHEDULE_CONFIG_INVALID' });
});

test('diagnostic store accessors read dispatcher and validated day plans without creating state', async () => {
  const db = fakeFirestore();
  const store = createProfileSeedScheduleStore(db);
  assert.deepEqual(await store.getDispatcher(), {});
  assert.equal(await store.getDay(day), null);
  assert.deepEqual([...db.data.keys()], [root]);
  await assert.rejects(store.getDay('../invalid'), { code: 'SEED_SCHEDULE_DAY_INVALID' });
});

test('only one plan and writer survive duplicate and concurrent ticks', async () => {
  const f = fixture();
  await Promise.all([f.service.tick(), f.service.tick(), f.service.tick()]);
  assert.equal(f.calls.generate, 1);
  const saved = f.db.data.get(dayKey());
  assert.equal(saved.seed, 'fixed', 'a new invocation must not replace the daily randomized plan');
  assert.equal(saved.attemptedCount, 2);
  assert.equal(saved.slots[0].state, 'committed');
  assert.equal(saved.slots[0].ingestion, 'pending', 'source success is not AEP storage proof');
  assert.deepEqual(f.db.data.get(controlKey), { blocked: false, active: null });
  await f.service.tick();
  assert.equal(f.calls.generate, 1);
  assert.equal(JSON.stringify(f.logs).includes(settings.expectedBaseEmail), false);
  assert.equal(JSON.stringify(f.logs).includes(settings.expectedMobilePhone), false);
});

test('disabled, out-of-hours, Saturday, and changed owner never invoke the generator', async () => {
  const f = fixture();
  f.db.data.set(root, { ...settings, enabled: false });
  assert.equal((await f.service.tick()).state, 'disabled');
  f.db.data.set(root, settings);
  f.setTime('2026-11-14T09:00:00+03:00');
  assert.equal((await f.service.tick()).state, 'outside_window');
  f.setTime(`${day}T18:00:00+03:00`);
  assert.equal((await f.service.tick()).state, 'outside_window');
  const wrongOwner = fixture({ owner: { uid: 'different' } });
  await assert.rejects(wrongOwner.service.tick(), { code: 'SEED_OWNER_MISMATCH' });
  const disabledOwner = fixture({ owner: { disabled: true } });
  await assert.rejects(disabledOwner.service.tick(), { code: 'SEED_OWNER_MISMATCH' });
  assert.equal(f.calls.generate + wrongOwner.calls.generate + disabledOwner.calls.generate, 0);
});

test('late slots expire rather than causing catch-up bursts', async () => {
  const f = fixture();
  f.advance(30 * 60_000);
  assert.equal((await f.service.tick()).state, 'idle');
  assert.ok(f.db.data.get(dayKey()).slots.every((slot) => slot.state === 'skipped'));
  assert.equal(f.calls.generate, 0);
});

test('reservation budget includes failed attempts and cannot exceed fifty', async () => {
  const f = fixture();
  f.db.data.get(dayKey()).attemptedCount = 49;
  assert.equal((await f.service.tick()).state, 'idle');
  assert.equal(f.calls.generate, 0);
});

test('preflight, identity callback, and ambiguous commit errors pause all future creation', async () => {
  for (const outcome of ['preflight', 'preferences', 'missing_callback', 'throw', 'partial', 'unknown']) {
    const f = fixture();
    if (outcome === 'preflight') f.snowflake.preflight = async () => { throw new Error('credential provider failure'); };
    if (outcome === 'preferences') f.snowflake.preflight = async () => ({
      ready: true, baseEmail: 'changed@example.test', mobilePhone: settings.expectedMobilePhone,
    });
    if (outcome === 'missing_callback') f.snowflake.generate = async () => ({ ok: true });
    if (['throw', 'partial', 'unknown'].includes(outcome)) {
      const original = f.snowflake.generate;
      f.snowflake.generate = async (input) => {
        await original(input);
        if (outcome === 'throw') throw new Error('secret upstream text');
        return { ok: false, committed: outcome === 'partial', outcomeUnknown: outcome === 'unknown' };
      };
    }
    assert.equal((await f.service.tick()).state, 'needs_attention', outcome);
    assert.equal(f.db.data.get(controlKey).blocked, true);
    assert.equal(f.db.data.get(dayKey()).slots[0].state, 'needs_attention');
    const generated = f.calls.generate;
    f.advance(15 * 60_000);
    await f.service.tick();
    assert.equal(f.calls.generate, generated);
    assert.equal(JSON.stringify(f.logs).includes('secret upstream text'), false);
  }
});

test('flow readiness rejects incomplete, stale, failed and changed ingestion without seeding', async () => {
  const f = fixture();
  const good = f.health();
  assert.doesNotThrow(() => assertFlowHealth(good, f.now()));
  assert.doesNotThrow(() => assertFlowHealth({
    ...good,
    flows: [{ ...good.flows[0], lastRun: {
      ...good.flows[0].lastRun, completedAt: new Date(+f.now() - 119 * 60_000).toISOString(),
    } }],
  }, f.now()));
  assert.equal(diagnoseFlowHealth({
    ...good,
    flows: [{ ...good.flows[0], lastRun: {
      ...good.flows[0].lastRun, completedAt: new Date(+f.now() - 121 * 60_000).toISOString(),
    } }],
  }, f.now()).issues[0].code, 'last_run_stale');
  const missingMetric = diagnoseFlowHealth({
    ...good,
    flows: [{ ...good.flows[0], id: 'flow-a', lastRun: { ...good.flows[0].lastRun, failedCount: null } }],
  }, f.now());
  assert.equal(missingMetric.healthy, false);
  assert.deepEqual(missingMetric.issues, [{ code: 'failed_count_unknown', flowId: 'flow-a' }]);
  for (const patch of [
    { state: 'disabled' }, { schedule: { frequency: 'once' } },
    { lastRun: { ...good.flows[0].lastRun, failedCount: 1 } },
    { lastRun: { ...good.flows[0].lastRun, failedCount: null } },
    { lastRun: { ...good.flows[0].lastRun, completedAt: '2026-11-10T00:00:00Z' } },
    { lastRun: { ...good.flows[0].lastRun, completedAt: '2026-11-12T00:00:00Z' } },
  ]) assert.throws(() => assertFlowHealth({ ...good, flows: [{ ...good.flows[0], ...patch }] }, f.now()));
  for (const health of [{ complete: false, flows: good.flows }, { complete: true, flows: [] }]) {
    const blocked = fixture({ health });
    assert.equal((await blocked.service.tick()).state, 'needs_attention');
    assert.equal(blocked.calls.generate, 0);
  }
});

test('flow-health failure persists safe per-flow evidence and never reaches Snowflake', async () => {
  const health = {
    complete: true,
    flows: [{
      id: 'flow-a', sourceTables: ['REL.RECIPIENT'], state: 'enabled',
      schedule: { frequency: 'minute', interval: 15 },
      lastRun: { state: 'success', completedAt: '2026-11-10T05:00:00.000Z', failedCount: null },
    }],
  };
  const f = fixture({ health });
  assert.equal((await f.service.tick()).state, 'needs_attention');
  assert.equal(f.calls.preflight, 0);
  assert.equal(f.calls.generate, 0);
  const slot = f.db.data.get(dayKey()).slots[0];
  assert.equal(slot.errorCode, 'SEED_INGESTION_NOT_HEALTHY');
  assert.equal(slot.flowHealth.issues[0].code, 'last_run_stale');
  assert.equal(slot.flowHealth.issues[1].code, 'failed_count_unknown');
  const failureLog = f.logs.find(([message]) => message.includes('Paused for inspection'));
  assert.equal(failureLog[1].stage, 'flow_health');
  assert.equal(failureLog[1].flowHealth.healthy, false);
});

test('pause or close of business between preparation and write prevents the write', async () => {
  for (const change of ['pause', 'window', 'config']) {
    const f = fixture();
    const original = f.snowflake.generate;
    f.snowflake.generate = async (input) => {
      if (change === 'pause') f.db.data.set(root, { ...settings, enabled: false });
      if (change === 'config') f.db.data.set(root, { ...settings, expectedBaseEmail: 'new@example.test' });
      if (change === 'window') f.setTime(`${day}T18:00:00+03:00`);
      return original(input);
    };
    assert.equal((await f.service.tick()).state, 'needs_attention');
    assert.deepEqual(f.db.data.get(dayKey()).slots[0].identities, []);
  }
});

test('a crashed writer remains blocked even across midnight and is never reclaimed', async () => {
  const f = fixture();
  await f.store.claim(day, config, f.now());
  f.advance(16 * 60_000);
  await f.service.tick();
  assert.equal(f.db.data.get(controlKey).blocked, true);
  assert.equal(f.db.data.get(dayKey()).slots[0].errorCode, 'SEED_EXECUTION_INTERRUPTED');
  assert.equal(f.calls.generate, 0);

  const overnight = fixture();
  await overnight.store.claim(day, config, overnight.now());
  overnight.setTime('2026-11-12T08:05:00+03:00');
  await overnight.service.tick();
  assert.equal(overnight.db.data.get(controlKey).blocked, true);
  assert.equal(overnight.db.data.get(dayKey()).slots[0].state, 'needs_attention');
  assert.equal(overnight.calls.generate, 0);
});

test('lost final receipt cannot replay a committed source write', async () => {
  const f = fixture();
  const finish = f.store.finish;
  let writes = 0;
  f.store.finish = async (...args) => {
    if (++writes === 1) throw new Error('lost receipt');
    return finish(...args);
  };
  assert.equal((await f.service.tick()).state, 'needs_attention');
  await f.service.tick();
  assert.equal(f.calls.generate, 1);
  assert.equal(f.db.data.get(dayKey()).slots[0].identities.length, 2);
});

test('lost durable preparation prevents writes and cannot reserve fresh identities on redelivery', async () => {
  const f = fixture();
  f.store.prepared = async () => { throw new Error('Firestore unavailable'); };
  await f.service.tick();
  await f.service.tick();
  assert.equal(f.calls.generate, 1);
  assert.equal(f.db.data.get(controlKey).blocked, true);
});

test('same-day configuration changes cannot silently replace a saved plan', async () => {
  const f = fixture();
  const changed = { ...settings, expectedBaseEmail: 'new@example.test' };
  f.db.data.set(root, changed);
  await assert.rejects(f.service.tick(), { code: 'SEED_DAY_CONFIG_CHANGED' });
  assert.equal(f.calls.generate, 0);
});

test('scheduled export is private, Riyadh-scoped, bounded and logs only safe dispatcher error metadata', async () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  const start = source.indexOf('exports.profileSeedSchedule = onSchedule(');
  const end = source.indexOf('\nconst commerceOptimizerFnOpts', start);
  let handler;
  let options;
  let initialized = false;
  let dispatchError;
  const logs = [];
  const db = {};
  vm.runInNewContext(source.slice(start, end), {
    exports: {}, REGION: 'us-central1', PROFILE_FN_SECRETS: ['adobe'],
    SNOWFLAKE_VPC_OPTS: { vpcConnector: 'snowflake-egress', vpcConnectorEgressSettings: 'ALL_TRAFFIC' },
    consentStoreRuntimeEnv: () => ({}), console: { error: (...args) => logs.push(args) },
    onSchedule(opts, fn) { options = opts; handler = fn; },
    require(name) {
      if (name === './adminFirestore') return { getAdminFirestore() { initialized = true; return db; } };
      if (name === 'firebase-admin') return { auth() { assert.equal(initialized, true); return {}; } };
      if (name === './profileSeedScheduleRuntime') return {
        createProfileSeedScheduleRuntime(input) {
          assert.equal(input.db, db);
          return { tick: async () => {
            if (dispatchError) throw dispatchError;
            return { state: 'disabled' };
          } };
        },
      };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  assert.equal(options.schedule, '*/5 8-17 * * 0-5');
  assert.equal(options.timeZone, 'Asia/Riyadh');
  assert.equal(options.maxInstances, 1);
  assert.equal(options.concurrency, 1);
  assert.equal(options.retryCount, 0);
  assert.equal(options.timeoutSeconds, 540);
  assert.equal(options.vpcConnector, 'snowflake-egress');
  assert.equal(options.vpcConnectorEgressSettings, 'ALL_TRAFFIC');
  assert.equal(options.invoker, undefined);
  await handler();
  dispatchError = Object.assign(new Error('sensitive upstream message'), {
    code: 'SEED_OWNER_MISMATCH', name: 'sensitive upstream name',
  });
  await assert.rejects(handler, /Profile seed dispatcher failed/);
  assert.deepEqual(JSON.parse(JSON.stringify(logs)), [[
    '[profile-seed-schedule] Dispatcher failed; inspect durable state before resuming.',
    { errorCode: 'SEED_OWNER_MISMATCH', errorName: 'Error' },
  ]]);
  assert.equal(JSON.stringify(logs).includes('sensitive upstream'), false);
});
