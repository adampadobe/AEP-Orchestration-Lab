'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createRecipient,
  getCountryCode,
  getRecipientId,
  recipientRow,
} = require('../snowflakeRecipientFactory');

describe('snowflakeRecipientFactory', () => {
  it('builds an industry-independent deterministic recipient id', () => {
    const expected = getRecipientId('retail', 'CRM1001');
    assert.match(expected, /^R-[a-f0-9]{32}$/);
    assert.equal(
      createRecipient({ industry: 'travel', crmId: 'CRM1001', email: 'a@example.com' }).recipientId,
      expected,
    );
  });

  it('shares a person across industries by ECID without conflating reused CRM suffixes', () => {
    assert.equal(getRecipientId('travel', 'CRM1', 'ecid-a'), getRecipientId('retail', 'CRM8', 'ecid-a'));
    assert.notEqual(getRecipientId('travel', 'CRM1', 'ecid-a'), getRecipientId('retail', 'CRM1', 'ecid-b'));
  });

  it('keeps the preferred channel within granted consent', () => {
    const recipient = createRecipient({ industry: 'fsi', crmId: 'CRM42', email: 'a@example.com' });
    const consent = {
      email: recipient.consentEmail,
      sms: recipient.consentSms,
      whatsapp: recipient.consentWhatsapp,
      push: recipient.consentPush,
    };
    if (recipient.preferredChannel) {
      assert.equal(consent[recipient.preferredChannel], 'y');
    }
    assert.deepEqual(
      recipient,
      createRecipient({ industry: 'fsi', crmId: 'CRM42', email: 'a@example.com' }),
    );
  });

  it('forces WhatsApp consent and emits a stable demo push token for heroes', () => {
    const first = createRecipient({ industry: 'travel', crmId: 'CRM1001', hero: true });
    const second = createRecipient({ industry: 'travel', crmId: 'CRM1001', hero: true });
    assert.equal(first.consentWhatsapp, 'y');
    assert.deepEqual(first.pushTokens, [first.pushToken]);
    assert.equal(first.pushToken, second.pushToken);
  });

  it('maps profile identity and consent for the shared base recipient parent', () => {
    const recipient = createRecipient({ industry: 'media', crmId: 'CRM3' });
    const row = recipientRow(recipient, {
      CRMID: 'CRM3',
      ECID: 'ecid-3',
      EMAIL: 'media@example.com',
      ADDRESSCOUNTRY: 'United Kingdom',
      TESTPROFILE: true,
    }, '2026-10-15 12:00:00.000');
    assert.equal(row.RECIPIENT_ID, recipient.recipientId);
    assert.equal(row.INDUSTRY, 'media');
    assert.equal(row.ECID, 'ecid-3');
    assert.equal(row.VERSION_TS, '2026-10-15 12:00:00.000');
    assert.equal(row.CONSENT_EMAIL, recipient.consentEmail);
    assert.deepEqual(row.PUSHTOKENS, recipient.pushTokens);
    assert.equal(row.COUNTRYCODE, 'GB');
    assert.equal(getCountryCode('Canada'), 'CA');
  });

  it('rejects unsupported industries and nonnumeric CRM identifiers', () => {
    assert.throws(() => getRecipientId('unknown', 'CRM1'), /Unsupported recipient industry/);
    assert.throws(() => getRecipientId('travel', 'guest'), /must end in a numeric identifier/);
  });
});
