'use strict';

const { createHash } = require('crypto');

const INDUSTRY_CODES = Object.freeze({
  travel: 'TRV',
  fsi: 'FSI',
  retail: 'RTL',
  telecom: 'TEL',
  media: 'MED',
  sports: 'SPT',
});

const CONSENT_CHANNELS = Object.freeze([
  { key: 'CONSENT_EMAIL', channel: 'email', rate: 0.85 },
  { key: 'CONSENT_SMS', channel: 'sms', rate: 0.6 },
  { key: 'CONSENT_WHATSAPP', channel: 'whatsapp', rate: 0.55 },
  { key: 'CONSENT_PUSH', channel: 'push', rate: 0.5 },
]);

function hashFraction(value) {
  const hex = createHash('sha256').update(String(value)).digest('hex').slice(0, 13);
  return Number.parseInt(hex, 16) / 0x10000000000000;
}

function getRecipientId(industry, crmId, ecid) {
  const normalizedIndustry = String(industry || '').trim().toLowerCase();
  const code = INDUSTRY_CODES[normalizedIndustry];
  if (!code) throw new Error(`Unsupported recipient industry "${industry}"`);
  const suffix = String(crmId || '').match(/(\d+)$/)?.[1];
  if (!suffix) throw new Error(`CRMID "${crmId}" must end in a numeric identifier`);
  const identity = String(ecid || crmId).trim();
  return `R-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}

function createRecipient({ industry, crmId, ecid, email, index, hero = false } = {}) {
  const recipientId = getRecipientId(industry, crmId, ecid);
  const seed = recipientId;
  const consents = Object.fromEntries(
    CONSENT_CHANNELS.map(({ key, rate }) => [key, hashFraction(`${seed}:${key}`) < rate ? 'y' : 'n']),
  );
  if (hero) consents.CONSENT_WHATSAPP = 'y';

  const preferred = CONSENT_CHANNELS
    .filter(({ key }) => consents[key] === 'y')
    .map(({ channel }) => channel);
  const preferredChannel = preferred.length
    ? preferred[Math.floor(hashFraction(`${seed}:preferred`) * preferred.length)]
    : null;
  const pushToken = `demo-fcm-${createHash('sha256').update(`${seed}:push`).digest('hex').slice(0, 32)}`;

  return Object.freeze({
    recipientId,
    industry: String(industry).trim().toLowerCase(),
    crmId: String(crmId),
    email: String(email || ''),
    index: Number(index),
    preferredLanguage: 'en-GB',
    timezone: 'Europe/London',
    pushToken,
    pushTokens: [pushToken],
    preferredChannel,
    consentEmail: consents.CONSENT_EMAIL,
    consentSms: consents.CONSENT_SMS,
    consentWhatsapp: consents.CONSENT_WHATSAPP,
    consentPush: consents.CONSENT_PUSH,
  });
}

function getCountryCode(country) {
  const normalized = String(country || '').trim().toUpperCase();
  if (['UNITED KINGDOM', 'UK', 'GB'].includes(normalized)) return 'GB';
  if (['UNITED STATES', 'USA', 'US'].includes(normalized)) return 'US';
  if (['CANADA', 'CA'].includes(normalized)) return 'CA';
  if (['AUSTRALIA', 'AU'].includes(normalized)) return 'AU';
  return null;
}

function recipientRow(recipient, profile, timestamp, testProfile = true) {
  const row = {
    RECIPIENT_ID: recipient.recipientId,
    INDUSTRY: recipient.industry,
    CRMID: profile.CRMID || recipient.crmId,
    ECID: profile.ECID || null,
    EMAIL: profile.EMAIL || recipient.email || null,
    EMAILIDSHA256: profile.EMAILIDSHA256 || null,
    GAID: profile.GAID || null,
    LOYALTYID: profile.LOYALTYID || null,
    PASSPORTID: profile.PASSPORTID || null,
    PHONENUMBER: profile.PHONENUMBER || null,
    PUSHTOKENS: recipient.pushTokens,
    STACKCHATID: profile.STACKCHATID || null,
    FIRSTNAME: profile.FIRSTNAME || null,
    LASTNAME: profile.LASTNAME || null,
    DATEOFBIRTH: profile.DATEOFBIRTH || null,
    GENDER: profile.GENDER || null,
    NATIONALITY: profile.NATIONALITY || null,
    PRIMARYEMAIL: profile.PRIMARYEMAIL || profile.EMAIL || recipient.email || null,
    PRIMARYPHONE: profile.PRIMARYPHONE || profile.PHONENUMBER || null,
    ADDRESSSTREET: profile.ADDRESSSTREET || null,
    ADDRESSCITY: profile.ADDRESSCITY || null,
    ADDRESSPOSTALCODE: profile.ADDRESSPOSTALCODE || null,
    ADDRESSCOUNTRY: profile.ADDRESSCOUNTRY || null,
    COUNTRYCODE: getCountryCode(profile.ADDRESSCOUNTRY),
    PREFERREDLANGUAGE: recipient.preferredLanguage,
    TIMEZONE: recipient.timezone,
    CUSTOMERSEGMENT: profile.CUSTOMERSEGMENT || null,
    LIFETIMEVALUE: profile.LIFETIMEVALUE ?? null,
    UPCOMINGHOLIDAYDATE: profile.UPCOMINGHOLIDAYDATE || null,
    UPCOMINGHOLIDAYDESTINATION: profile.UPCOMINGHOLIDAYDESTINATION || null,
    PREFERREDSEATTYPE: profile.PREFERREDSEATTYPE || null,
    CONSENT_EMAIL: recipient.consentEmail,
    CONSENT_SMS: recipient.consentSms,
    CONSENT_WHATSAPP: recipient.consentWhatsapp,
    CONSENT_PUSH: recipient.consentPush,
    PREFERREDCHANNEL: recipient.preferredChannel,
    VERSION_TS: timestamp,
    _RECORDCREATEDTIMESTAMP: profile._RECORDCREATEDTIMESTAMP || timestamp,
    _RECORDUPDATEDTIMESTAMP: timestamp,
    TESTPROFILE: testProfile,
  };
  if (recipient.industry !== 'travel') {
    for (const column of ['PASSPORTID', 'UPCOMINGHOLIDAYDATE', 'UPCOMINGHOLIDAYDESTINATION', 'PREFERREDSEATTYPE']) {
      if (!Object.hasOwn(profile, column) || profile[column] === undefined) delete row[column];
    }
  }
  return row;
}

module.exports = {
  INDUSTRY_CODES,
  createRecipient,
  getCountryCode,
  getRecipientId,
  recipientRow,
};
