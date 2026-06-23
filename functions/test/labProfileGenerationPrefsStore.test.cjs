'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  scaleEmail,
  todayYmd,
  normalizePrefs,
  prefsWithPreview,
  isValidEmail,
  DEFAULT_MOBILE_PHONE,
} = require('../labProfileGenerationPrefsStore');

describe('labProfileGenerationPrefsStore', () => {
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
