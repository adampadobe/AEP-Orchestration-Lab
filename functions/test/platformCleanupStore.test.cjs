'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPlatformCleanupStore } = require('../platformCleanupStore');

const scope = {
  principalUid: 'uid', orgId: 'org', sandbox: 'sandbox',
  resource_type: 'dataset', resource_id: 'id', expected_name: 'Exact',
};
function fixture() {
  const rows = new Map();
  let time = 1000;
  let queue = Promise.resolve();
  const database = {
    collection(name) {
      assert.equal(name, 'platformCleanupAudits');
      return { doc: (id) => ({ id, create: async (row) => { assert.equal(rows.has(id), false); rows.set(id, row); } }) };
    },
    runTransaction(callback) {
      const result = queue.then(() => callback({
        get: async (ref) => ({ exists: rows.has(ref.id), data: () => ({ ...rows.get(ref.id) }) }),
        update: (ref, changes) => rows.set(ref.id, { ...rows.get(ref.id), ...changes }),
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
