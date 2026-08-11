'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../pdfJourneyApiKeyStore');

function firestoreHarness() {
  const records = new Map();
  const collection = {
    doc(id) {
      return {
        async set(value) { records.set(id, structuredClone(value)); },
        async get() {
          const value = records.get(id);
          return { exists: !!value, data: () => structuredClone(value) };
        },
        async update(value) { records.set(id, { ...records.get(id), ...structuredClone(value) }); },
      };
    },
    where(field, _operator, expected) {
      const query = {
        limit() { return query; },
        async get() {
          const docs = Array.from(records.entries())
            .filter(([, value]) => value[field] === expected)
            .map(([id, value]) => ({
              id,
              data: () => structuredClone(value),
              ref: { async update(patch) { records.set(id, { ...records.get(id), ...structuredClone(patch) }); } },
            }));
          return { docs, empty: docs.length === 0 };
        },
      };
      return query;
    },
  };
  return {
    records,
    deps: {
      firestore: { collection: () => collection },
      nowValue: () => new Date('2026-08-11T18:00:00.000Z'),
    },
  };
}

test('generates a prefixed one-time key while storing only its hash', async () => {
  const harness = firestoreHarness();
  const created = await store.createKey({
    uid: 'user-1',
    email: 'apalmer@adobe.com',
    keyLabel: 'Booking journey',
  }, harness.deps);
  assert.match(created.key, /^pdf_[A-Za-z0-9_-]{40,}$/);
  assert.equal(created.keyLabel, 'Booking journey');
  const saved = harness.records.get(created.keyId);
  assert.equal(saved.key, undefined);
  assert.notEqual(saved.keyHash, created.key);
  assert.equal(saved.keyHash, store.hashApiKey(created.key));
  assert.equal(saved.scope, 'pdf:journey-action');
});

test('lists redacted user-owned metadata and validates the generated key', async () => {
  const harness = firestoreHarness();
  const created = await store.createKey({ uid: 'user-1', keyLabel: 'AJO' }, harness.deps);
  await store.createKey({ uid: 'user-2', keyLabel: 'Other user' }, harness.deps);
  const keys = await store.listKeysForUser('user-1', harness.deps);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].keyId, created.keyId);
  assert.equal(keys[0].key, undefined);
  assert.equal(keys[0].keyHash, undefined);
  const valid = await store.validateApiKey(created.key, harness.deps);
  assert.equal(valid.ok, true);
  assert.equal(valid.principalUid, 'user-1');
  assert.deepEqual(await store.validateApiKey('pdf_not-a-real-key'), { ok: false });
});

test('revocation is owner-scoped and invalidates the key immediately', async () => {
  const harness = firestoreHarness();
  const created = await store.createKey({ uid: 'user-1' }, harness.deps);
  await assert.rejects(
    store.revokeKey('user-2', created.keyId, harness.deps),
    (error) => error.status === 403,
  );
  const revoked = await store.revokeKey('user-1', created.keyId, harness.deps);
  assert.equal(revoked.revoked, true);
  assert.deepEqual(await store.validateApiKey(created.key, harness.deps), { ok: false });
  assert.equal((await store.listKeysForUser('user-1', harness.deps)).length, 0);
});
