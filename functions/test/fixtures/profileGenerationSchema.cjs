'use strict';

const text = { type: 'string' };
const object = properties => ({ type: 'object', properties });
const consent = object({
  val: { type: 'string', enum: ['y', 'n', 'p', 'u', 'dy', 'dn', 'LI', 'CT', 'CP', 'VI', 'PI'] },
  reason: text, time: text,
});

// Resolved-schema shape for the language/consent boundary; unrelated demo
// subtrees remain open so service tests can exercise their existing fixtures.
module.exports = object({
  identityMap: {
    type: 'object', additionalProperties: {
      type: 'array', items: object({ id: text, primary: { type: 'boolean' } }),
    },
  },
  _demoemea: object({
    identification: { type: 'object', additionalProperties: true },
    profilePlaceContext: { type: 'object', additionalProperties: true },
    individualCharacteristics: { type: 'object', additionalProperties: true },
    scoring: { type: 'object', additionalProperties: true },
    industryFsi: { type: 'object', additionalProperties: true },
  }),
  person: { type: 'object', additionalProperties: true },
  preferredLanguage: text,
  personalEmail: object({ address: text, primary: { type: 'boolean' } }),
  testProfile: { type: 'boolean' },
  consents: object({
    collect: consent, share: consent, personalize: object({ content: consent }),
    marketing: object({
      any: consent, preferred: { type: 'string', enum: ['email', 'push', 'sms', 'whatsApp', 'phone', 'unknown'] },
      email: consent, sms: consent, push: consent, whatsApp: consent,
      call: consent, fax: consent, postalMail: consent, commercialEmail: consent,
    }),
  }),
  optInOut: object({
    _channels: object(Object.fromEntries(
      ['email', 'sms', 'phone', 'directMail', 'facebookFeed', 'web', 'mobileApp', 'twitterFeed']
        .map(key => [key, { type: 'string', enum: ['in', 'out', 'not_provided'] }]),
    )),
  }),
});
