import {
  assign,
  isoDateAgo,
  randomBetween,
  randomPick,
} from './utils.mjs';

const FAV_CATEGORIES = ['general', 'retail', 'travel', 'media', 'public_sector'];
const STREETS = ['123 Maple Ave', '456 Oak Street', '789 Pine Rd', '42 Cedar Ln'];
const CITIES = ['San Jose', 'Austin', 'Portland', 'Denver', 'Seattle', 'Boston'];
const STATES = ['CA', 'TX', 'OR', 'CO', 'WA', 'MA'];
const PUBLIC_EVENTS = ['Race for Life London', 'Race for Life 5k', 'Shine Night Walk', 'Dryathlon'];

/**
 * Generic / public-sector omnichannel persona (Profile Viewer fillRandomSampleData public case).
 * @returns {Record<string, unknown>}
 */
export function buildGenericPersonaAttributes() {
  const attrs = {};
  const favCategory = randomPick(FAV_CATEGORIES);

  assign(attrs, 'individualCharacteristics.core.favouriteCategory', favCategory);
  assign(attrs, 'homeAddress.street1', randomPick(STREETS));
  assign(attrs, 'homeAddress.city', randomPick(CITIES));
  assign(attrs, 'homeAddress.stateProvince', randomPick(STATES));
  assign(attrs, 'homeAddress.postalCode', String(randomBetween(10000, 99999)));
  assign(attrs, 'homeAddress.country', randomPick(['US', 'GB', 'CA']));

  if (favCategory === 'public_sector' || Math.random() < 0.25) {
    assign(attrs, 'individualCharacteristics.public.donatedAmount', randomBetween(25, 500));
    assign(attrs, 'individualCharacteristics.public.donationDate', isoDateAgo(randomBetween(1, 365)));
    assign(attrs, 'individualCharacteristics.public.eventRegistered', randomPick(PUBLIC_EVENTS));
  }

  return attrs;
}
