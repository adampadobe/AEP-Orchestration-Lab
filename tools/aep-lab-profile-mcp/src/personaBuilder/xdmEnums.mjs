import { randomBetween } from './utils.mjs';

/** XDM Consent and Preference Details — `consents.marketing.preferred` (portal consent.js). */
export const PREFERRED_MARKETING_CHANNEL_VALUES = [
  'email',
  'push',
  'inApp',
  'sms',
  'whatsApp',
  'phone',
  'phyMail',
  'inVehicle',
  'inHome',
  'iot',
  'social',
  'other',
  'none',
  'unknown',
];

/** Random persona subset — portal randomizer skips `unknown` / `none`. */
export const PERSONA_RANDOM_PREFERRED_CHANNELS = ['email', 'sms', 'phone', 'phyMail'];

const PREFERRED_CHANNEL_ALIASES = {
  email: 'email',
  push: 'push',
  sms: 'sms',
  phone: 'phone',
  call: 'phone',
  inapp: 'inApp',
  whatsapp: 'whatsApp',
  postal: 'phyMail',
  postalmail: 'phyMail',
  directmail: 'phyMail',
  direct_mail: 'phyMail',
  phymail: 'phyMail',
  invehicle: 'inVehicle',
  inhome: 'inHome',
  iot: 'iot',
  social: 'social',
  other: 'other',
  none: 'none',
  unknown: 'unknown',
};

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidPreferredMarketingChannel(value) {
  return PREFERRED_MARKETING_CHANNEL_VALUES.includes(String(value || '').trim());
}

/**
 * Map legacy / scrape labels to a schema-valid `consents.marketing.preferred` enum.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizePreferredMarketingChannel(value) {
  const raw = String(value || '').trim();
  if (isValidPreferredMarketingChannel(raw)) return raw;
  const key = raw.toLowerCase().replace(/_/g, '');
  const mapped = PREFERRED_CHANNEL_ALIASES[key] || PREFERRED_CHANNEL_ALIASES[raw.toLowerCase()];
  if (mapped && isValidPreferredMarketingChannel(mapped)) return mapped;
  const ci = PREFERRED_MARKETING_CHANNEL_VALUES.find((x) => x.toLowerCase() === key);
  return ci || 'email';
}

/**
 * US-style numeric postal code as XDM string (schema type string, not integer).
 *
 * @returns {string}
 */
export function randomPostalCodeString() {
  return String(randomBetween(10000, 99999));
}
