import {
  assign,
  computeAgeFromBirthDate,
  randomBetween,
  randomBirthDateIso,
  randomPick,
  weightedBool,
} from './utils.mjs';

const MALE_FIRST = [
  'James', 'Michael', 'Robert', 'David', 'Daniel', 'Matthew', 'Ryan', 'Kevin', 'Brian', 'Jason',
];
const FEMALE_FIRST = [
  'Emma', 'Olivia', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia', 'Harper', 'Evelyn', 'Luna',
];
const NEUTRAL_FIRST = [
  'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Quinn', 'Avery', 'Skyler',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Lee', 'Kim', 'Patel', 'Cohen', 'Okafor', 'Silva', 'Andersen', 'Nielsen', 'Kowalski', 'Tanaka',
];
const GENDERS = ['male', 'female', 'non_specific'];
const PREFERRED_CHANNELS = ['email', 'sms', 'phone', 'direct_mail'];
const LANGUAGES = ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES', 'ja-JP'];
const LOYALTY_TIERS = ['bronze', 'silver', 'gold', 'platinum'];

function randomFirstNameForGender(gender) {
  const g = String(gender || '').toLowerCase();
  if (g === 'male') return randomPick(MALE_FIRST);
  if (g === 'female') return randomPick(FEMALE_FIRST);
  return randomPick(NEUTRAL_FIRST);
}

function randomLoyaltyPointsForTier(tier) {
  switch (String(tier || '').toLowerCase()) {
    case 'platinum':
      return randomBetween(50_000, 200_000);
    case 'gold':
      return randomBetween(20_000, 60_000);
    case 'silver':
      return randomBetween(5_000, 25_000);
    case 'bronze':
      return randomBetween(500, 7_500);
    default:
      return randomBetween(500, 50_000);
  }
}

function randomMobilePhone() {
  const area = randomBetween(200, 999);
  const mid = randomBetween(200, 999);
  const last = randomBetween(1000, 9999);
  return `+1${area}${mid}${last}`;
}

/**
 * Shared demographics + analytics used across industries.
 * @param {string} email
 * @returns {Record<string, unknown>}
 */
export function buildCommonPersonaAttributes(email) {
  const attrs = {};
  const gender = randomPick(GENDERS);
  const firstName = randomFirstNameForGender(gender);
  const lastName = randomPick(LAST_NAMES);
  const birthDate = randomBirthDateIso();
  const age = computeAgeFromBirthDate(birthDate);
  const preferredChannel = randomPick(PREFERRED_CHANNELS);
  const language = randomPick(LANGUAGES);
  const loyaltyTier = randomPick(LOYALTY_TIERS);
  const loyaltyId = `LY-${randomBetween(100000, 999999)}`;
  const loyaltyPoints = randomLoyaltyPointsForTier(loyaltyTier);

  assign(attrs, 'personalEmail.address', email);
  assign(attrs, 'person.name.firstName', firstName);
  assign(attrs, 'person.name.lastName', lastName);
  assign(attrs, 'person.gender', gender);
  assign(attrs, 'person.birthDate', birthDate);
  if (age != null) assign(attrs, 'individualCharacteristics.core.age', age);
  assign(attrs, 'mobilePhone.number', randomMobilePhone());
  assign(attrs, 'consents.marketing.preferred', preferredChannel);
  assign(attrs, 'preferences.preferredLanguage', language);
  assign(attrs, 'personalEmail.language', language);
  assign(attrs, 'scoring.churn.churnPrediction', randomBetween(0, 100));
  assign(attrs, 'scoring.core.propensityScore', randomBetween(0, 100));
  assign(attrs, 'scoring.npsScore', randomBetween(0, 10));
  assign(attrs, 'orderProfile.avgOrderSize', randomBetween(25, 500));

  if (weightedBool(0.7)) {
    assign(attrs, 'identification.core.loyaltyId', loyaltyId);
    assign(attrs, 'loyalty.loyaltyID', [loyaltyId]);
    assign(attrs, 'loyalty.tier', loyaltyTier);
    assign(attrs, 'loyaltyDetails.level', loyaltyTier);
    assign(attrs, 'loyalty.points', loyaltyPoints);
    assign(attrs, 'loyaltyDetails.points', loyaltyPoints);
  }

  return attrs;
}
