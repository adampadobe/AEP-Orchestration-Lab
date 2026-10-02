import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generationPrefsInternals,
  getGenerationPrefsForPrincipal,
  reserveGenerationEmailForPrincipal,
  updateGenerationPrefsForPrincipal,
} from '../src/generationPrefsStore.mjs';

function memoryDb(initial = {}) {
  const records = new Map(Object.entries(initial));
  const refFor = (id) => ({
    id,
    async get() {
      return {
        exists: records.has(id),
        data: () => records.get(id),
      };
    },
  });
  return {
    records,
    collection(name) {
      assert.equal(name, 'labProfileGenerationPrefs');
      return { doc: refFor };
    },
    async runTransaction(callback) {
      return callback({
        get: (ref) => ref.get(),
        set(ref, value) {
          records.set(ref.id, { ...(records.get(ref.id) || {}), ...value });
        },
      });
    },
  };
}

const NOW = new Date('2026-04-15T12:00:00Z');

test('principal preferences use the shared Firebase UID and sandbox document', async () => {
  const db = memoryDb();
  const updated = await updateGenerationPrefsForPrincipal(
    'firebase-user-1',
    'apalmer',
    {
      baseEmail: 'adam@example.com',
      mobilePhone: '+447700900123',
      counterN: 4,
    },
    { db, now: NOW },
  );

  assert.equal(updated.ok, true);
  assert.equal(updated.data.prefs.baseEmail, 'adam@example.com');
  assert.equal(updated.data.prefs.mobilePhone, '+447700900123');
  assert.equal(updated.data.prefs.counterN, 4);
  assert.ok(db.records.has('firebase-user-1__apalmer'));
});

test('principal reservation atomically advances the shared daily counter', async () => {
  const db = memoryDb({
    'firebase-user-1__apalmer': {
      uid: 'firebase-user-1',
      sandbox: 'apalmer',
      baseEmail: 'adam@example.com',
      mobilePhone: '+447700900123',
      counterN: 4,
      counterDate: '20260415',
      testProfile: true,
    },
  });

  const reserved = await reserveGenerationEmailForPrincipal(
    'firebase-user-1',
    'apalmer',
    { db, now: NOW },
  );

  assert.equal(reserved.ok, true);
  assert.equal(reserved.data.scaledEmail, 'adam+15042026-4@example.com');
  assert.equal(reserved.data.counterN, 4);
  assert.equal(reserved.data.nextCounterN, 5);
  assert.equal(db.records.get('firebase-user-1__apalmer').counterN, 5);
});

test('principal preferences reset stale counters and reject invalid email updates', async () => {
  const db = memoryDb({
    'firebase-user-1__apalmer': {
      baseEmail: 'adam+demo@example.com',
      counterN: 99,
      counterDate: '20260414',
    },
  });

  const read = await getGenerationPrefsForPrincipal(
    'firebase-user-1',
    'apalmer',
    { db, now: NOW },
  );
  assert.equal(read.data.prefs.counterN, 1);
  assert.equal(read.data.prefs.nextScaledEmail, 'adam+demo-15042026-1@example.com');

  const rejected = await updateGenerationPrefsForPrincipal(
    'firebase-user-1',
    'apalmer',
    { baseEmail: 'not-an-email' },
    { db, now: NOW },
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 400);
  assert.match(rejected.error, /baseEmail is invalid/);
});

test('email scaling matches the Profile Viewer plus-addressing convention', () => {
  assert.equal(
    generationPrefsInternals.scaleEmail('adam@example.com', 2, NOW),
    'adam+15042026-2@example.com',
  );
  assert.equal(
    generationPrefsInternals.scaleEmail('adam+demo@example.com', 2, NOW),
    'adam+demo-15042026-2@example.com',
  );
});
