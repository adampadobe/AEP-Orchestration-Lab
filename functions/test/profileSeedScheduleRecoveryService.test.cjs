'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProfileSeedScheduleRecoveryService } = require('../profileSeedScheduleRecoveryService');
const { createProfileSeedScheduleStore, COLLECTION } = require('../profileSeedScheduleStore');
const { validateConfig } = require('../profileSeedScheduleService');
const { runSummary } = require('../myDataFlowsService');
const root = `${COLLECTION}/apalmer`;
const control = `${root}/state/dispatcher`;
const day = '2026-11-11';
const dayKey = `${root}/days/${day}`;
const scope = { principalUid: 'owner', sandbox: 'apalmer', orgId: 'BF9C27AA6464801C0A495FD0@AdobeOrg' };
const config = {
  enabled: true, ownerUid: 'owner', sandbox: 'apalmer', expectedBaseEmail: 'private@example.test',
  expectedMobilePhone: '+447700900111', timeZone: 'Asia/Riyadh', startHour: 8, endHour: 18,
  days: [0, 1, 2, 3, 4, 5], dailyCap: 50, campaignIsolationReviewed: true,
  unrelated: { retained: true, privateValue: 'never-output' },
};
function fixture(idle = false, media = false, travel = false, sports = false) {
  const day = sports ? '2026-11-17' : media || travel ? '2026-11-15' : '2026-11-11';
  const dayKey = `${root}/days/${day}`;
  const slotId = sports ? '14' : media ? '01' : '15';
  let clock = new Date(sports ? '2026-11-19T02:45:00Z' : media ? '2026-11-15T09:00:00Z'
    : travel ? '2026-11-15T14:00:00Z' : '2026-11-13T12:00:00Z');
  let owner = { uid: 'owner', disabled: false };
  const recoverySlot = sports ? {
    id: slotId, industry: 'sports', count: 3, state: 'needs_attention',
    dueAt: '2026-11-17T13:37:00.000Z', identities: [],
    startedAt: '2026-11-17T13:40:15.679Z', updatedAt: '2026-11-17T13:40:22.003Z',
    errorCode: 'SEED_INGESTION_NOT_HEALTHY', ingestion: 'unverified',
    flowHealth: {
      healthy: false, complete: true, observedAt: '2026-11-17T13:40:22.001Z',
      flowCount: 13,
      issues: ['last_run_not_success', 'last_run_completion_missing', 'failed_count_unknown']
        .map((code) => ({ code, flowId: '065f3b53-df40-43d1-9d91-c42f031996d6' })),
      flows: Array.from({ length: 13 }, (_, index) => index === 0 ? ({
        flowId: '065f3b53-df40-43d1-9d91-c42f031996d6', healthy: false, state: 'enabled',
        lastRun: { state: 'inProgress', completedAt: null, readCount: 2, writtenCount: null, failedCount: null },
        reasons: ['last_run_not_success', 'last_run_completion_missing', 'failed_count_unknown'],
      }) : ({ flowId: `flow-${index}`, healthy: true })),
    },
  } : travel ? {
    id: slotId, industry: 'travel', count: 1, state: 'needs_attention',
    dueAt: '2026-11-15T13:10:00.000Z', identities: [],
    startedAt: '2026-11-15T13:10:08.231Z', updatedAt: '2026-11-15T13:10:16.924Z',
    errorCode: 'SEED_EXECUTION_INTERRUPTED', ingestion: 'unverified',
  } : {
    id: slotId, industry: media ? 'media' : 'retail', count: media ? 1 : 2,
    state: 'needs_attention', identities: [], dueAt: '2026-11-11T12:54:00Z',
    startedAt: '2026-11-11T12:55:00Z',
    errorCode: media ? 'SEED_EXECUTION_INTERRUPTED' : 'SEED_INGESTION_NOT_HEALTHY',
    ingestion: 'unverified',
    ...(media ? { startedAt: '2026-11-15T06:10:08.193Z', updatedAt: '2026-11-15T06:10:21.029Z' } : {}),
    flowHealth: { healthy: false, issues: [{ code: 'failed_count_unknown' }] },
  };
  const data = new Map([
    [root, structuredClone(config)],
    [control, { blocked: true, active: null, attention: { day, id: slotId }, unrelated: 'retained' }],
    [dayKey, { day, fingerprint: validateConfig(config).fingerprint,
      attemptedCount: sports ? 31 : media ? 3 : travel ? 6 : 5, plannedCount: 35,
      seed: 'retain-seed', unrelated: 'retained', slots: [
        { id: sports ? '13' : '14', state: 'committed', identities: [{ email: 'old-private@example.test' }] },
        recoverySlot,
        { id: sports ? '15' : '16', state: 'pending', identities: [], dueAt: '2026-11-11T13:00:00Z' },
      ] }],
  ]);
  const snap = (key) => ({ exists: data.has(key), data: () => structuredClone(data.get(key)) });
  const doc = (key) => ({ key, get: async () => snap(key), collection: (name) => collection(`${key}/${name}`) });
  const collection = (key) => ({ doc: (name) => doc(`${key}/${name}`) });
  let queue = Promise.resolve();
  let writeCount = 0;
  let beforeTransaction = null;
  let onConflict = null;
  let onFlowRead = null;
  let flowReads = 0;
  const db = { collection, runTransaction(work) {
    const current = queue.then(async () => {
      if (beforeTransaction) { const action = beforeTransaction; beforeTransaction = null; action(); }
      async function attempt() {
        const writes = [];
        const result = await work({
          get: async (ref) => { assert.equal(writes.length, 0); return snap(ref.key); },
          set: (ref, value) => writes.push([ref.key, structuredClone(value)]),
        });
        return { writes, result };
      }
      let staged = await attempt();
      if (onConflict) {
        const action = onConflict;
        onConflict = null;
        // A concurrent same-content write advances the document version and discards all staged writes.
        data.set(dayKey, structuredClone(data.get(dayKey)));
        action();
        staged = await attempt();
      }
      for (const [key, value] of staged.writes) { data.set(key, value); writeCount++; }
      return staged.result;
    });
    queue = current.catch(() => {});
    return current;
  } };
  const metrics = { recordSummary: { inputRecordCount: 0 }, sizeSummary: { inputBytes: 0 },
    statusSummary: { status: 'success' }, durationSummary: {
      startedAtUTC: +clock - 120_000, completedAtUTC: +clock - 60_000,
    } };
  let snapshot = { complete: true, fetchedAt: clock.toISOString(), flows: [{
    id: 'flow-a', sourceTables: [travel ? 'REL.RECIPIENT' : sports ? 'REL.AGENTIC_SPORTS' : 'REL.RETAIL'],
    sourceConnectionId: 'source-a', targetConnectionId: 'target-a',
    state: 'enabled', schedule: { frequency: 'minute', interval: 15 },
    datasets: [{ id: 'dataset-a' }], mappings: [{ id: 'mapping-a', version: 1 }],
    lastRun: idle ? runSummary({ id: 'run-a', metrics, activities: [{
      ...structuredClone(metrics), id: '4f008a00-3a04-11eb-adc1-0242ac120002', name: 'SnowFlake Copy Activity',
    }] }) : { id: 'run-a', state: 'success', failedCount: 0, completedAt: new Date(+clock - 60_000).toISOString() },
  }] };
  const store = createProfileSeedScheduleStore(db);
  const service = createProfileSeedScheduleRecoveryService({
    store, now: () => clock, getOwner: async () => owner, flowSnapshot: async () => {
      flowReads++;
      if (onFlowRead) { const action = onFlowRead; onFlowRead = null; action(); }
      return structuredClone(snapshot);
    },
  });
  return { data, store, service, get writes() { return writeCount; },
    get flowReads() { return flowReads; },
    slot: () => data.get(dayKey).slots[1], clock: () => clock,
    advance: (ms) => { clock = new Date(+clock + ms); },
    snapshot: () => snapshot, setSnapshot: (next) => { snapshot = next; },
    setOwner: (next) => { owner = next; }, race: (action) => { beforeTransaction = action; },
    conflict: (action) => { onConflict = action; }, onFlowRead: (action) => { onFlowRead = action; },
    preview: (input = {}) => service.preview({ ...scope, input: { day, slot_id: slotId, ...input } }),
    apply: (preview, input = {}) => service.apply({ ...scope, input: {
      plan_id: preview.plan_id, manifest_digest: preview.manifest_digest, expected_count: preview.expected_count,
      confirmed: true, skip_only_acknowledged: true, confirmation_phrase: preview.confirmation_phrase, ...input,
    } }),
  };
}

test('exact reviewed media preparation failure skips once without changing its budget or other slots', async () => {
  const f = fixture(false, true);
  const key = `${root}/days/2026-11-15`;
  const original = structuredClone(f.data.get(key));
  const p = await f.preview();
  assert.equal(p.confirmation_phrase, 'SKIP ONLY 2026-11-15/01');
  assert.equal(p.target.attempted_count, 3);
  assert.equal(p.target.count, 1);
  const result = await f.apply(p);
  assert.equal(result.dispatcher_unblocked, true);
  assert.equal(f.slot().state, 'skipped');
  assert.equal(f.slot().errorCode, 'SEED_EXECUTION_INTERRUPTED');
  assert.deepEqual(f.slot().identities, []);
  assert.equal(f.data.get(key).attemptedCount, 3);
  assert.deepEqual(f.data.get(key).slots[0], original.slots[0]);
  assert.deepEqual(f.data.get(key).slots[2], original.slots[2]);
  assert.equal(f.slot().recovery.previousErrorCode, 'SEED_EXECUTION_INTERRUPTED');
  await assert.rejects(f.apply(p), { status: 409 });
});

test('exact reviewed travel interruption with zero prepared identities skips once without changing its budget', async () => {
  const f = fixture(false, false, true);
  const key = `${root}/days/2026-11-15`;
  const original = structuredClone(f.data.get(key));
  const p = await f.preview();
  assert.equal(p.status, 'ready');
  assert.equal(p.confirmation_phrase, 'SKIP ONLY 2026-11-15/15');
  assert.equal(p.target.attempted_count, 6);
  assert.equal(p.target.count, 1);
  const result = await f.apply(p);
  assert.equal(result.dispatcher_unblocked, true);
  assert.equal(f.slot().state, 'skipped');
  assert.equal(f.slot().errorCode, 'SEED_EXECUTION_INTERRUPTED');
  assert.deepEqual(f.slot().identities, []);
  assert.equal(Object.hasOwn(f.slot(), 'preparedIdentityCount'), false);
  assert.equal(f.data.get(key).attemptedCount, 6);
  assert.deepEqual(f.data.get(key).slots[0], original.slots[0]);
  assert.deepEqual(f.data.get(key).slots[2], original.slots[2]);
  await assert.rejects(f.apply(p), { status: 409 });
});

test('travel recovery rejects any change to the exact interrupted prewrite signature', async () => {
  for (const mutate of [
    (f) => { f.slot().startedAt = '2026-11-15T13:10:09.000Z'; },
    (f) => { f.slot().updatedAt = '2026-11-15T13:10:17.000Z'; },
    (f) => { f.slot().dueAt = '2026-11-15T13:11:00.000Z'; },
    (f) => { f.slot().preparedIdentityCount = 0; },
    (f) => { f.slot().identities = [{ email: 'private' }]; },
    (f) => { f.slot().flowHealth = null; },
    (f) => { f.slot().reason = null; },
    (f) => { delete f.slot().identities; },
    (f) => { f.data.get(`${root}/days/2026-11-15`).attemptedCount = 7; },
    (f) => { f.slot().sourceWrite = true; },
  ]) {
    const f = fixture(false, false, true);
    mutate(f);
    await assert.rejects(f.preview(), { status: 409 });
    assert.equal(f.writes, 0);
  }
  for (const input of [{ day: '2026-11-16' }, { slot_id: '02' }]) {
    const f = fixture(false, false, true);
    await assert.rejects(f.preview(input), { status: 403 });
    assert.equal(f.writes, 0);
  }
});

test('exact reviewed sports ingestion-health failure skips only the zero-identity slot and preserves its budget', async () => {
  const f = fixture(false, false, false, true);
  const key = `${root}/days/2026-11-17`;
  const original = structuredClone(f.data.get(key));
  const p = await f.preview();
  assert.equal(p.status, 'ready');
  assert.equal(p.confirmation_phrase, 'SKIP ONLY 2026-11-17/14');
  assert.equal(p.target.industry, 'sports');
  assert.equal(p.target.count, 3);
  assert.equal(p.target.attempted_count, 31);
  assert.equal(p.target.ingestion, 'not_started');
  const result = await f.apply(p);
  assert.equal(result.dispatcher_unblocked, true);
  assert.equal(result.slot_id, '14');
  assert.equal(f.slot().state, 'skipped');
  assert.equal(f.slot().errorCode, 'SEED_INGESTION_NOT_HEALTHY');
  assert.deepEqual(f.slot().identities, []);
  assert.deepEqual(f.slot().flowHealth, original.slots[1].flowHealth);
  assert.equal(f.data.get(key).attemptedCount, 31);
  assert.deepEqual(f.data.get(key).slots[0], original.slots[0]);
  assert.deepEqual(f.data.get(key).slots[2], original.slots[2]);
  await assert.rejects(f.apply(p), { status: 409 });
});

test('sports recovery rejects any drift in its exact prewrite slot or failed-flow snapshot', async () => {
  for (const mutate of [
    (f) => { f.slot().dueAt = '2026-11-17T13:38:00.000Z'; },
    (f) => { f.slot().startedAt = '2026-11-17T13:40:16.000Z'; },
    (f) => { f.slot().updatedAt = '2026-11-17T13:40:23.000Z'; },
    (f) => { f.slot().count = 2; },
    (f) => { f.slot().errorCode = 'SEED_EXECUTION_INTERRUPTED'; },
    (f) => { f.slot().identities = [{ email: 'private' }]; },
    (f) => { f.data.get(`${root}/days/2026-11-17`).attemptedCount = 32; },
    (f) => { f.slot().flowHealth.observedAt = '2026-11-17T13:40:23.001Z'; },
    (f) => { f.slot().flowHealth.issues.pop(); },
    (f) => { f.slot().flowHealth.flows.pop(); },
    (f) => { f.slot().flowHealth.flows[0].lastRun.state = 'success'; },
    (f) => { f.slot().flowHealth.flows[0].lastRun.failedCount = 0; },
    (f) => { f.slot().sourceWrites = {}; },
  ]) {
    const f = fixture(false, false, false, true);
    mutate(f);
    await assert.rejects(f.preview(), { status: 409 });
    assert.equal(f.writes, 0);
  }
  for (const input of [{ day: '2026-11-16' }, { slot_id: '13' }]) {
    const f = fixture(false, false, false, true);
    await assert.rejects(f.preview(input), { status: 403 });
    assert.equal(f.writes, 0);
  }
});

test('media recovery rejects a changed attempt, possible writes, active writers and unmatched incidents', async () => {
  for (const mutate of [
    (f) => { f.slot().startedAt = '2026-11-15T06:11:00Z'; },
    (f) => { delete f.slot().updatedAt; },
    (f) => { f.slot().updatedAt = '2026-11-15T06:10:22Z'; },
    (f) => { f.data.get(`${root}/days/2026-11-15`).attemptedCount = 4; },
    (f) => { f.slot().industry = 'retail'; },
    (f) => { f.slot().count = 2; },
    (f) => { f.slot().errorCode = 'SEED_OUTCOME_UNKNOWN'; },
    (f) => { f.slot().runStamp = null; },
    (f) => { f.slot().sourceWrites = {}; },
    (f) => { f.slot().identities = [{ email: 'private' }]; },
    (f) => { f.data.get(control).active = { day: '2026-11-15', id: '01' }; },
  ]) {
    const f = fixture(false, true);
    mutate(f);
    await assert.rejects(f.preview(), { status: 409 });
    assert.equal(f.writes, 0);
  }
  for (const input of [{ day: '2026-11-11' }, { day: '2026-11-16' }, { slot_id: '02' }]) {
    const f = fixture(false, true);
    await assert.rejects(f.preview(input), { status: 403 });
    assert.equal(f.writes, 0);
  }
  const f = fixture(false, true);
  const p = await f.preview();
  f.race(() => { f.slot().runStamp = 'possible-write'; });
  await assert.rejects(f.apply(p), { status: 409 });
  assert.equal(f.slot().state, 'needs_attention');
  assert.equal(f.writes, 1);
});

test('media skip retains explicit idle-policy acknowledgement and unknown counters', async () => {
  const f = fixture(true, true);
  assert.equal((await f.preview()).status, 'blocked');
  const p = await f.preview({ allow_verified_idle_runs: true });
  assert.equal(p.status, 'policy_review_required');
  assert.equal(p.proposedFlowHealth.flows[0].lastRun.failedCount, null);
  await assert.rejects(f.apply(p), { status: 409 });
  const result = await f.apply(p, { idle_readiness_acknowledged: true });
  assert.equal(result.flowHealth.flows[0].lastRun.failedCount, null);
  assert.equal(f.data.get(`${root}/days/2026-11-15`).attemptedCount, 3);
  assert.deepEqual(f.slot().identities, []);
});

test('skip-only recovery is atomic, auditable, consumes receipt and leaves old pending slots and budget intact', async () => {
  const f = fixture();
  const original = structuredClone(f.data.get(dayKey));
  const p = await f.preview();
  assert.equal(p.status, 'ready');
  assert.equal(f.writes, 1, 'preview only writes the receipt');
  for (const secret of ['private@example.test', '+447700900111', 'never-output', 'old-private@example.test']) {
    assert.equal(JSON.stringify(p).includes(secret), false);
    assert.equal(JSON.stringify(f.data.get(`${root}/recoveryReceipts/${p.plan_id}`)).includes(secret), false);
  }
  const results = await Promise.allSettled([f.apply(p), f.apply(p)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'fulfilled').value.ingestion, 'not_started');
  assert.equal(f.slot().state, 'skipped');
  assert.equal(f.slot().errorCode, original.slots[1].errorCode);
  assert.deepEqual(f.slot().flowHealth, original.slots[1].flowHealth);
  assert.deepEqual(f.data.get(dayKey).slots[0], original.slots[0]);
  assert.deepEqual(f.data.get(dayKey).slots[2], original.slots[2]);
  assert.equal(f.data.get(dayKey).attemptedCount, 5);
  assert.deepEqual(f.data.get(root), config);
  assert.deepEqual(f.data.get(control), { blocked: false, active: null, unrelated: 'retained' });
  const writes = f.writes;
  await assert.rejects(f.apply(p), { status: 409 });
  assert.equal(f.writes, writes, 'receipt reuse must not write even a status update');
});

test('empty-source opt-in requires explicit review and activates the separate policy in the skip transaction', async () => {
  const f = fixture(true);
  assert.equal((await f.preview()).status, 'blocked');
  const p = await f.preview({ allow_verified_idle_runs: true });
  assert.equal(p.status, 'policy_review_required');
  assert.equal(p.currentFlowHealth.healthy, false);
  assert.equal(p.proposedFlowHealth.healthy, true);
  assert.equal(p.proposedFlowHealth.flows[0].lastRun.failedCount, null);
  assert.equal(f.data.get(root).allowVerifiedIdleRuns, undefined);
  const writes = f.writes;
  await assert.rejects(f.apply(p), { status: 409 });
  await assert.rejects(f.apply(p, { idle_readiness_acknowledged: true, confirmation_phrase: 'SKIP' }), { status: 409 });
  assert.equal(f.writes, writes);
  const result = await f.apply(p, { idle_readiness_acknowledged: true });
  assert.equal(result.flowHealth.healthy, true);
  assert.equal(result.flowHealth.flows[0].lastRun.failedCount, null);
  assert.equal(f.data.get(root).verifiedIdleRunReview.planId, p.plan_id);
  assert.equal(validateConfig(f.data.get(root)).fingerprint, validateConfig(config).fingerprint);
  assert.equal(f.data.get(root).unrelated.privateValue, 'never-output');
});

test('preview rejects malformed, prepared, ambiguous, active-writer and unrelated-attention targets without writes', async () => {
  for (const mutate of [
    (f) => { f.slot().industry = 'fsi'; },
    (f) => { f.slot().count = 1; },
    (f) => { f.slot().count = 3; },
    (f) => { delete f.slot().identities; },
    (f) => { f.slot().identities = {}; },
    (f) => { f.slot().identities = [{ email: 'private' }]; },
    (f) => { f.slot().runStamp = null; },
    (f) => { f.slot().tableRowcounts = {}; },
    (f) => { f.slot().sourceWriteReceipt = {}; },
    (f) => { f.slot().errorCode = 'SEED_OUTCOME_UNKNOWN'; },
    (f) => { f.data.get(control).active = { day, id: '15' }; },
    (f) => { delete f.data.get(control).active; },
    (f) => { f.data.get(control).attention.id = '14'; },
    (f) => { f.data.get(root).enabled = false; },
    (f) => { f.data.get(dayKey).slots.push({ ...f.slot() }); },
    (f) => { f.data.get(dayKey).slots[2].state = 'needs_attention'; },
    (f) => { f.setOwner({ uid: 'owner', disabled: true }); },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.preview());
    assert.equal(f.writes, 0);
  }
  for (const input of [{ day: '2026-02-30' }, { slot_id: '../15' }, { allow_verified_idle_runs: 'true' }]) {
    await assert.rejects(fixture().preview(input), { status: 400 });
  }
  for (const input of [{ day: '2026-11-12' }, { slot_id: '16' }]) {
    const f = fixture();
    await assert.rejects(f.preview(input), { status: 403 });
    assert.equal(f.writes, 0);
  }
  await assert.rejects(fixture().service.preview({ ...scope, orgId: 'other', input: { day, slot_id: '15' } }), { status: 403 });
});

test('apply rejects config, day, dispatcher, topology, health, expiry and owner races before any writes', async () => {
  for (const mutate of [
    (f) => { f.data.get(root).enabled = false; },
    (f) => { f.data.get(root).unrelated.retained = false; },
    (f) => { f.slot().identities.push({ email: 'private' }); },
    (f) => { f.data.get(dayKey).attemptedCount++; },
    (f) => { f.data.get(control).active = { day, id: '16' }; },
    (f) => { f.data.get(control).attention.id = '16'; },
    (f) => { f.snapshot().flows[0].mappings[0].version++; },
    (f) => { f.snapshot().flows[0].sourceConnectionId = 'new-source'; },
    (f) => { f.snapshot().flows[0].lastRun.failedCount = null; },
    (f) => { f.snapshot().complete = false; },
    (f) => { f.advance(10 * 60_000); },
    (f) => { f.snapshot().flows[0].lastRun.completedAt = '2026-11-11T00:00:00Z'; },
    (f) => { f.setOwner({ uid: 'other', disabled: false }); },
    (f) => { f.race(() => { f.data.get(root).enabled = false; }); },
    (f) => { f.race(() => { f.slot().runStamp = 'prepared'; }); },
    (f) => { f.race(() => { f.advance(10 * 60_000); }); },
    (f) => { f.race(() => { f.advance(2 * 60 * 60_000); }); },
  ]) {
    const f = fixture();
    const p = await f.preview();
    mutate(f);
    const writes = f.writes;
    await assert.rejects(f.apply(p));
    assert.equal(f.writes, writes);
  }
});

test('new successful runs may advance without invalidating unchanged topology', async () => {
  const f = fixture();
  const p = await f.preview();
  f.snapshot().flows[0].lastRun = { id: 'run-new', state: 'success', failedCount: 0, completedAt: f.clock().toISOString() };
  assert.equal((await f.apply(p)).ok, true);
  const incomplete = fixture(true);
  incomplete.snapshot().complete = false;
  assert.equal((await incomplete.preview({ allow_verified_idle_runs: true })).status, 'blocked');
});

test('Firestore conflict retries freshly read Adobe health and topology and never commit an earlier observation', async () => {
  for (const mutate of [
    (f) => { f.snapshot().flows[0].lastRun.failedCount = null; },
    (f) => { f.snapshot().flows[0].mappings[0].version++; },
    (f) => { f.snapshot().complete = false; },
  ]) {
    const f = fixture();
    const p = await f.preview();
    f.conflict(() => mutate(f));
    const writes = f.writes;
    await assert.rejects(f.apply(p), { status: 409 });
    assert.equal(f.flowReads, 3, 'preview plus one fresh Adobe read on each transaction attempt');
    assert.equal(f.writes, writes, 'all writes from the conflicted attempt must be discarded');
    assert.equal(f.slot().state, 'needs_attention');
    assert.equal(f.data.get(dayKey).attemptedCount, 5);
    assert.equal(f.data.get(control).blocked, true);
    assert.equal(f.data.get(`${root}/recoveryReceipts/${p.plan_id}`).consumedAt, undefined);
  }
  const disabled = fixture();
  const p = await disabled.preview();
  disabled.conflict(() => disabled.setOwner({ uid: 'owner', disabled: true }));
  await assert.rejects(disabled.apply(p), { status: 403 });
  assert.equal(disabled.slot().state, 'needs_attention');
  assert.equal(disabled.writes, 1);
});

test('fresh observations cannot become stale while fetching Adobe or before transactional writes', async () => {
  for (const mutate of [
    (f) => { f.onFlowRead(() => f.advance(60_001)); },
    (f) => { f.snapshot().fetchedAt = new Date(+f.clock() - 60_001).toISOString(); },
    (f) => { f.snapshot().fetchedAt = 'invalid'; },
  ]) {
    const f = fixture();
    const p = await f.preview();
    mutate(f);
    await assert.rejects(f.apply(p), { status: 409, code: 'SEED_RECOVERY_OBSERVATION_STALE' });
    assert.equal(f.writes, 1);
    assert.equal(f.slot().state, 'needs_attention');
  }
  const f = fixture();
  const p = await f.preview();
  f.conflict(() => { f.snapshot().flows[0].lastRun.id = 'new-successful-run'; });
  assert.equal((await f.apply(p)).ok, true);
  assert.equal(f.flowReads, 3);
});
