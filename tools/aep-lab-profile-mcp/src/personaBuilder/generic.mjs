import {
  assign,
  randomPick,
} from './utils.mjs';
import { randomPostalCodeString } from './xdmEnums.mjs';

const FAV_CATEGORIES = ['general', 'retail', 'travel', 'media', 'public_sector'];
const STREETS = ['123 Maple Ave', '456 Oak Street', '789 Pine Rd', '42 Cedar Ln'];
const CITIES = ['San Jose', 'Austin', 'Portland', 'Denver', 'Seattle', 'Boston'];
const STATES = ['CA', 'TX', 'OR', 'CO', 'WA', 'MA'];

/**
 * Generic omnichannel persona (Profile Viewer fillRandomSampleData public case).
 * Donation fields are omitted: the lab Generic schema declares no donation paths.
 * @returns {Record<string, unknown>}
 */
export function buildGenericPersonaAttributes() {
  const attrs = {};
  const favCategory = randomPick(FAV_CATEGORIES);

  assign(attrs, 'individualCharacteristics.core.favouriteCategory', favCategory);
  assign(attrs, 'homeAddress.street1', randomPick(STREETS));
  assign(attrs, 'homeAddress.city', randomPick(CITIES));
  assign(attrs, 'homeAddress.stateProvince', randomPick(STATES));
  assign(attrs, 'homeAddress.postalCode', randomPostalCodeString());
  assign(attrs, 'homeAddress.country', randomPick(['US', 'GB', 'CA']));

  return attrs;
}
