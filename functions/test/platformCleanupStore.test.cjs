'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPlatformCleanupStore } = require('../platformCleanupStore');

const scope = {
  principalUid: 'uid', orgId: 'org', sandbox: 'sandbox',
  resource_type: 'dataset', resource_id: 'id', expected_name: 'Exact',
};
function fixture() {
  const collections = new Map();
  const rowsFor = (name) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  };
  let time = 1000;
  let queue = Promise.resolve();
  const database = {
    collection(name) {
      return {
        doc: (id) => ({
          id,
          collectionName: name,
          get: async () => ({ exists: rowsFor(name).has(id), data: () => rowsFor(name).get(id) }),
          create: async (row) => {
            assert.equal(rowsFor(name).has(id), false);
            rowsFor(name).set(id, row);
          },
        }),
      };
    },
    runTransaction(callback) {
      const result = queue.then(() => callback({
        get: async (ref) => {
          const rows = rowsFor(ref.collectionName);
          const row = rows?.get(ref.id);
          return { exists: !!row, data: () => row && { ...row } };
        },
        create: (ref, value) => {
          const rows = rowsFor(ref.collectionName);
          if (rows.has(ref.id)) throw new Error('Already exists');
          rows.set(ref.id, value);
        },
        update: (ref, changes) => {
          const rows = rowsFor(ref.collectionName);
          if (!rows.has(ref.id)) throw new Error('Missing document');
          rows.set(ref.id, { ...rows.get(ref.id), ...changes });
        },
      }));
      queue = result.catch(() => {});
      return result;
    },
  };
  return {
    store: createPlatformCleanupStore({ db: () => database, now: () => time }),
    advance: (milliseconds) => { time += milliseconds; },
  };
}

test('audit receipt expires after 15 minutes and returns only an opaque ID', async () => {
  const { store, advance } = fixture();
  const ticket = await store.saveAudit({ ...scope, fingerprint: 'state' });
  assert.match(ticket.audit_id, /^[a-f0-9-]{36}$/);
  assert.equal(new Date(ticket.expiresAt).getTime(), 901000);
  advance(900000);
  await assert.rejects(store.consumeAudit(ticket.audit_id, scope), { status: 409 });
});

test('plan and durable intent bind disable/delete operations before consuming scope', async () => {
  for (const operation of ['delete', 'disable']) {
    const { store } = fixture();
    const scoped = { principalUid: 'uid', orgId: 'org', sandbox: 'sandbox' };
    const ticket = await store.savePlan({
      ...scoped, operation, status: 'ready', blockers: [], expected_count: 1,
      state_fingerprint: 'a'.repeat(64), targets: [{ resource_type: 'flow', resource_id: 'flow-id' }],
    });
    const confirmation = { manifest_digest: ticket.manifest_digest, expected_count: 1 };
    await assert.rejects(store.claimPlan(ticket.plan_id, { ...scoped, operation: operation === 'disable' ? 'delete' : 'disable' }, confirmation), { status: 409 });
    assert.equal((await store.getExecution(ticket.plan_id, scoped)).execution, null);
    await store.claimPlan(ticket.plan_id, { ...scoped, operation }, confirmation);
    const intent = { resource_type: 'flow', resource_id: 'flow-id', operation: operation === 'disable' ? 'DISABLE_FLOW' : 'DELETE' };
    await assert.rejects(store.recordItemIntent(ticket.plan_id, 'flow:flow-id', {
      ...intent, operation: operation === 'disable' ? 'DELETE' : 'DISABLE_FLOW',
    }), { status: 409 });
    await store.recordItemIntent(ticket.plan_id, 'flow:flow-id', intent);
    await assert.rejects(store.finishExecution(ticket.plan_id, 'draining'), { status: 409 });
    await store.recordItemResult(ticket.plan_id, 'flow:flow-id', { status: 'succeeded' });
    const finished = await store.finishExecution(ticket.plan_id, operation === 'disable' ? 'draining' : 'succeeded');
    assert.equal(finished.items['flow:flow-id'].operation, intent.operation);
    const replay = await store.claimPlan(ticket.plan_id, { ...scoped, operation }, confirmation);
    assert.equal(replay.claimed, false);
    assert.equal(replay.execution.state, finished.state);
  }
});

test('disable and delete coordinate through the same cross-principal lease', async () => {
  const { store } = fixture();
  const scoped = { principalUid: 'uid', orgId: 'org', sandbox: 'sandbox' };
  const base = { ...scoped, status: 'ready', blockers: [], expected_count: 1, state_fingerprint: 'a'.repeat(64),
    targets: [{ resource_type: 'flow', resource_id: 'flow-id' }] };
  const disabling = await store.savePlan({ ...base, operation: 'disable' });
  const deleting = await store.savePlan({ ...base, principalUid: 'other', operation: 'delete' });
  const confirmation = { manifest_digest: disabling.manifest_digest, expected_count: 1 };
  await store.claimPlan(disabling.plan_id, { ...scoped, operation: 'disable' }, confirmation);
  await assert.rejects(store.claimPlan(deleting.plan_id, { ...scoped, principalUid: 'other', operation: 'delete' }, confirmation), { status: 409 });
  await store.finishExecution(disabling.plan_id, 'blocked');
  assert.equal((await store.claimPlan(deleting.plan_id, { ...scoped, principalUid: 'other', operation: 'delete' }, confirmation)).claimed, true);
});
test('every scope field is bound; a mismatched request does not consume a receipt', async () => {
  for (const key of Object.keys(scope)) {
    const { store } = fixture();
    const ticket = await store.saveAudit({ ...scope, fingerprint: 'state' });
    await assert.rejects(store.consumeAudit(ticket.audit_id, { ...scope, [key]: 'different' }), { status: 409 });
    assert.equal((await store.consumeAudit(ticket.audit_id, scope)).fingerprint, 'state');
    await assert.rejects(store.consumeAudit(ticket.audit_id, scope), { status: 409 });
  }
});

test('transactional consumption admits only one competing delete', async () => {
  const { store } = fixture();
  const ticket = await store.saveAudit({ ...scope, fingerprint: 'state' });
  const results = await Promise.allSettled([
    store.consumeAudit(ticket.audit_id, scope),
    store.consumeAudit(ticket.audit_id, scope),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  await assert.rejects(store.consumeAudit('missing', scope), { status: 409 });
});

test('batch plans are scope-bound, expire for apply, and remain readable for recovery', async () => {
  const { store, advance } = fixture();
  const plan = {
    principalUid: 'uid', orgId: 'org', sandbox: 'sandbox',
    state_fingerprint: 'a'.repeat(64), status: 'blocked', expected_count: 1,
    targets: [{ resource_type: 'flow', resource_id: 'flow-id' }],
    blockers: ['adapter disabled'], mutation_adapters_enabled: false,
  };
  const ticket = await store.savePlan(plan);
  const scope = { principalUid: 'uid', orgId: 'org', sandbox: 'sandbox' };
  assert.equal(ticket.manifest_digest, plan.state_fingerprint);
  await assert.rejects(store.getPlan(ticket.plan_id, { ...scope, orgId: 'other' }), { status: 409 });
  advance(900000);
  assert.equal((await store.getPlan(ticket.plan_id, scope)).expected_count, 1);
  const expired = await store.claimPlan(ticket.plan_id, scope, {
    manifest_digest: plan.state_fingerprint, expected_count: 1,
  });
  assert.equal(expired.expired, true);
  assert.equal(expired.plan.state, 'expired');
  const replay = await store.claimPlan(ticket.plan_id, scope, {
    manifest_digest: plan.state_fingerprint, expected_count: 1,
  });
  assert.equal(replay.expired, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.plan.state, 'expired');
});

test('an atomic single claim prevents duplicate application and stores blocked recovery state', async () => {
  const { store } = fixture();
  const plan = {
    principalUid: 'uid', orgId: 'org', sandbox: 'sandbox',
    state_fingerprint: 'b'.repeat(64), status: 'blocked', expected_count: 1,
    targets: [{ resource_type: 'dataset', resource_id: 'dataset-id' }],
    blockers: ['unsupported contract'], mutation_adapters_enabled: false,
  };
  const ticket = await store.savePlan(plan);
  const expected = { principalUid: 'uid', orgId: 'org', sandbox: 'sandbox' };
  const results = await Promise.all([
    store.claimPlan(ticket.plan_id, expected, { manifest_digest: plan.state_fingerprint, expected_count: 1 }),
    store.claimPlan(ticket.plan_id, expected, { manifest_digest: plan.state_fingerprint, expected_count: 1 }),
  ]);
  assert.equal(results.filter((result) => result.blocked).length, 1);
  assert.equal(results.filter((result) => result.claimed).length, 0);
  assert.equal(results.find((result) => result.replayed).execution.state, 'blocked');
  const recovered = await store.getExecution(ticket.plan_id, expected);
  assert.equal(recovered.execution.state, 'blocked');
  assert.deepEqual(recovered.execution.blockers, plan.blockers);
  assert.equal(recovered.execution.items['dataset:dataset-id'].status, 'not_attempted');
});

test('durable per-object intent precedes its result and records one terminal outcome', async () => {
  const { store } = fixture();
  const plan = {
    principalUid: 'uid', orgId: 'org', sandbox: 'sandbox',
    state_fingerprint: 'c'.repeat(64), status: 'ready', expected_count: 1,
    targets: [{ resource_type: 'descriptor', resource_id: 'descriptor-id' }],
    blockers: [], mutation_adapters_enabled: true,
  };
  const ticket = await store.savePlan(plan);
  const scope = { principalUid: 'uid', orgId: 'org', sandbox: 'sandbox' };
  const claim = await store.claimPlan(ticket.plan_id, scope, {
    manifest_digest: plan.state_fingerprint, expected_count: 1,
  });
  assert.equal(claim.claimed, true);
  await assert.rejects(store.recordItemResult(ticket.plan_id, 'descriptor:descriptor-id', { status: 'succeeded' }), { status: 409 });
  await store.recordItemIntent(ticket.plan_id, 'descriptor:descriptor-id', {
    resource_type: 'descriptor', resource_id: 'descriptor-id', operation: 'DELETE',
  });
  const itemResult = await store.recordItemResult(ticket.plan_id, 'descriptor:descriptor-id', {
    status: 'succeeded', http_status: 204, raw_response: 'must not be persisted',
  });
  assert.equal(itemResult.raw_response, undefined);
  const result = await store.finishExecution(ticket.plan_id, 'succeeded', { delete_requests_issued: 1 });
  assert.equal(result.items['descriptor:descriptor-id'].status, 'succeeded');
  await assert.rejects(store.recordItemIntent(ticket.plan_id, 'descriptor:descriptor-id', {
    resource_type: 'descriptor', resource_id: 'descriptor-id', operation: 'DELETE',
  }), { status: 409 });
});

test('different ready plans cannot execute concurrently in the same org/sandbox, even for different principals', async () => {
    const { store } = fixture();
    const scope = { principalUid: 'uid', orgId: 'org', sandbox: 'sandbox' };
    const plan = {
      ...scope, state_fingerprint: 'd'.repeat(64), status: 'ready', expected_count: 1,
      targets: [{ resource_type: 'flow', resource_id: 'flow-id' }], blockers: [],
    };
    const first = await store.savePlan(plan);
    const second = await store.savePlan({ ...plan, principalUid: 'another-user' });
    const claim = { manifest_digest: plan.state_fingerprint, expected_count: 1 };
    assert.equal((await store.claimPlan(first.plan_id, scope, claim)).claimed, true);
    await assert.rejects(store.claimPlan(second.plan_id, { ...scope, principalUid: 'another-user' }, claim), /Another cleanup execution/);
    await store.finishExecution(first.plan_id, 'failed');
    assert.equal((await store.claimPlan(second.plan_id, { ...scope, principalUid: 'another-user' }, claim)).claimed, true);
    assert.equal((await store.claimPlan(first.plan_id, scope, claim)).replayed, true);
  });

test('item intents stop after execution lease expiry, and an expired owner cannot release a newer lease', async () => {
    const { store, advance } = fixture();
    const scope = { principalUid: 'uid', orgId: 'org', sandbox: 'sandbox' };
    const plan = {
      ...scope, state_fingerprint: 'e'.repeat(64), status: 'ready', expected_count: 1,
      targets: [{ resource_type: 'dataset', resource_id: 'dataset-id' }], blockers: [],
    };
    const claim = { manifest_digest: plan.state_fingerprint, expected_count: 1 };
    const first = await store.savePlan(plan);
    await store.claimPlan(first.plan_id, scope, claim);
    advance(360_000);
    await assert.rejects(store.recordItemIntent(first.plan_id, 'dataset:dataset-id', {
      resource_type: 'dataset', resource_id: 'dataset-id', operation: 'DELETE',
    }), /lease expired/);
    const second = await store.savePlan(plan);
    assert.equal((await store.claimPlan(second.plan_id, scope, claim)).claimed, true);
    await store.finishExecution(first.plan_id, 'uncertain');
    const third = await store.savePlan(plan);
    await assert.rejects(store.claimPlan(third.plan_id, scope, claim), /Another cleanup execution/);
});
