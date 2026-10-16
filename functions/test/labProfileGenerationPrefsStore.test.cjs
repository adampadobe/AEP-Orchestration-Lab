'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const {
  scaleEmail,
  todayYmd,
  normalizePrefs,
  prefsWithPreview,
  isValidEmail,
  DEFAULT_MOBILE_PHONE,
} = require('../labProfileGenerationPrefsStore');

function storeFixture(initial = {}) {
  let data = { baseEmail: 'demo@example.com', counterN: 7, counterDate: todayYmd(), ...initial };
  let transactions = 0;
  let writes = 0;
  let queue = Promise.resolve();
  const snapshot = () => ({ exists: true, data: () => ({ ...data }) });
  const ref = { get: async () => snapshot() };
  const db = {
    collection: () => ({ doc: () => ref }),
    runTransaction(work) {
      const result = queue.then(async () => {
        transactions += 1;
        return work({
          get: async () => snapshot(),
          set(_ref, next) { writes += 1; data = { ...data, ...next }; },
        });
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  const firestore = Object.assign(() => db, { FieldValue: { serverTimestamp: () => null } });
  const module = { exports: {} };
  runInNewContext(readFileSync(require.resolve('../labProfileGenerationPrefsStore'), 'utf8'), {
    module, Date,
    require: () => ({ apps: [true], firestore }),
  });
  return { store: module.exports, data: () => data, transactions: () => transactions, writes: () => writes };
}

describe('labProfileGenerationPrefsStore', () => {
  it('formats dates in UTC even when the supplied date uses a different timezone', () => {
    const date = new Date('2026-10-16T00:30:00+02:00');
    assert.equal(todayYmd(date), '20261015');
    assert.equal(scaleEmail('demo@example.com', 1, date), 'demo+15102026-1@example.com');
  });

  it('reserves contiguous batches and single emails through the same atomic counter', async () => {
    const f = storeFixture();
    const [batch, single, other] = await Promise.all([
      f.store.reserveEmails('user', 'sandbox', 3, { expectedBaseEmail: 'demo@example.com' }),
      f.store.reserveNextEmail('user', 'sandbox'),
      f.store.reserveEmails('user', 'sandbox', 2),
    ]);
    assert.equal(batch.emails.map((email) => email.counterN).join(','), '7,8,9');
    assert.equal(single.counterN, 10);
    assert.equal(other.emails.map((email) => email.counterN).join(','), '11,12');
    assert.equal(f.data().counterN, 13);
    assert.equal(f.transactions(), 3);
    assert.equal(f.writes(), 3);
    assert.equal(single.emails, undefined, 'single reservation API stays compatible');
  });

  it('does not reserve on preview and retains the counter when changing base email', async () => {
    const f = storeFixture();
    await f.store.getPrefs('user', 'sandbox');
    assert.equal(f.writes(), 0);
    await f.store.updatePrefs('user', 'sandbox', { baseEmail: 'new@example.com' });
    assert.equal(f.data().counterN, 7);
    const batch = await f.store.reserveEmails('user', 'sandbox', 2);
    assert.ok(batch.emails.every((email) => email.scaledEmail.startsWith('new+')));
  });

  it('rejects changed or missing email settings, invalid counts and fractional overrides without writes', async () => {
    const f = storeFixture();
    await assert.rejects(f.store.reserveEmails('user', 'sandbox', 3, { expectedBaseEmail: 'old@example.com' }), /changed/);
    for (const n of [0, 1.5, 1001, NaN]) {
      await assert.rejects(f.store.reserveEmails('user', 'sandbox', n), /count/);
    }
    await assert.rejects(f.store.updatePrefs('user', 'sandbox', { counterN: 2.5 }), /integer/);
    for (const baseEmail of ['not an email', `${'a'.repeat(201)}@example.com`]) {
      await assert.rejects(f.store.updatePrefs('user', 'sandbox', { baseEmail }), /invalid/);
    }
    await assert.rejects(f.store.reserveNextEmail('user', 'sandbox', { expectedBaseEmail: 'old@example.com' }), /changed/);
    assert.equal(f.writes(), 0);
    const empty = storeFixture({ baseEmail: '' });
    await assert.rejects(empty.store.reserveEmails('user', 'sandbox', 2), /baseEmail/);
    assert.equal(empty.writes(), 0);
  });

  it('resets yesterday once for a batch and never wraps an exhausted counter', async () => {
    const f = storeFixture({ counterDate: '19990101', counterN: 50 });
    assert.equal((await f.store.reserveEmails('user', 'sandbox', 3)).counterN, 1);
    assert.equal(f.data().counterN, 4);
    const full = storeFixture({ counterN: Number.MAX_SAFE_INTEGER });
    await assert.rejects(full.store.reserveEmails('user', 'sandbox', 1), /limit/);
    assert.equal(full.writes(), 0);
  });

  it('scaleEmail appends DDMMYYYY-N plus tag', () => {
    const d = new Date('2026-06-23T12:00:00Z');
    assert.equal(scaleEmail('apalmer@adobetest.com', 2, d), 'apalmer+23062026-2@adobetest.com');
    assert.equal(
      scaleEmail('adamp.adobedemo+demo@gmail.com', 1, d),
      'adamp.adobedemo+demo-23062026-1@gmail.com',
    );
  });

  it('normalizePrefs resets counter when counterDate is not today', () => {
    const yesterday = '19990101';
    const out = normalizePrefs({
      baseEmail: 'a@b.com',
      counterN: 7,
      counterDate: yesterday,
      mobilePhone: '+1',
      testProfile: false,
    }, 'apalmer');
    assert.equal(out.counterN, 1);
    assert.equal(out.counterDate, todayYmd());
    assert.equal(out.testProfile, false);
    assert.equal(out.mobilePhone, '+1');
  });

  it('prefsWithPreview includes nextScaledEmail', () => {
    const prefs = prefsWithPreview(normalizePrefs({
      baseEmail: 'apalmer@adobetest.com',
      counterN: 3,
      counterDate: todayYmd(),
    }, 'apalmer'));
    assert.ok(prefs.nextScaledEmail.includes('+'));
    assert.ok(prefs.nextScaledEmail.endsWith('@adobetest.com'));
    assert.match(prefs.nextScaledEmail, /-\d+@/);
  });

  it('isValidEmail rejects invalid addresses', () => {
    assert.equal(isValidEmail(''), false);
    assert.equal(isValidEmail('not-an-email'), false);
    assert.equal(isValidEmail('user@example.com'), true);
  });

  it('defaults mobile phone when missing', () => {
    const prefs = normalizePrefs({}, 'sb');
    assert.equal(prefs.mobilePhone, DEFAULT_MOBILE_PHONE);
  });
});
