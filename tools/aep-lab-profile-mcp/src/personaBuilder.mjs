/**
 * Server-side persona attribute builder for lab_generate_profile.
 * Ports the spirit of Profile Viewer randomizers + generate-profiles.js defaults
 * into flat dot-path attributes accepted by POST /api/profile/generate.
 */

import { LAB_INDUSTRY_KEYS } from './industries.mjs';

const BIRTH_AGE_MIN = 18;
const BIRTH_AGE_MAX = 85;

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

/** Travel segment hints for hotel edge segments (see scripts/bulk-seed-travel-hotel-segment-profiles.mjs). */
export const TRAVEL_SEGMENT_HINTS = ['hotel_high_value', 'hotel_reactivation'];

const HOTEL_NAMES = ['Premier Inn Demo Central', 'Grand Plaza', 'Harbour Inn', 'Demo Hotel'];
const HOTEL_LOCATIONS = ['Manchester, UK', 'London, UK', 'Edinburgh, UK', 'Birmingham, UK'];

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomPick(arr) {
  if (!arr?.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedBool(probability) {
  return Math.random() < probability;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function randomBirthDateIso() {
  const now = new Date();
  const year = now.getFullYear() - randomBetween(BIRTH_AGE_MIN, BIRTH_AGE_MAX);
  const month = randomBetween(1, 12);
  const day = randomBetween(1, 28);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function computeAgeFromBirthDate(isoStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoStr || '').trim());
  if (!m) return null;
  const by = Number(m[1]);
  const bm = Number(m[2]);
  const bd = Number(m[3]);
  const today = new Date();
  let age = today.getFullYear() - by;
  const beforeBirthday =
    today.getMonth() + 1 < bm || (today.getMonth() + 1 === bm && today.getDate() < bd);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

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

function isoDateAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function isoDateFromMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function randomDecimal(min, max, decimals = 2) {
  const v = min + Math.random() * (max - min);
  return Math.round(v * 10 ** decimals) / 10 ** decimals;
}

/** @param {Record<string, unknown>} attrs */
function assign(attrs, path, value) {
  if (value === undefined || value === null || value === '') return;
  attrs[path] = value;
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

/** Default industry attributes (aligned with generate-profiles.js). */
function defaultIndustryAttributes(industry) {
  const attrs = {};
  switch (industry) {
    case 'retail':
      assign(attrs, 'individualCharacteristics.retail.favoriteColor', randomPick(['blue', 'black', 'red', 'green', 'white']));
      assign(attrs, 'individualCharacteristics.retail.favoriteStore', randomPick(['Demo Store', 'City Centre', 'Outlet Mall']));
      assign(attrs, 'individualCharacteristics.retail.favoriteFashionBrand', randomPick(['Demo Fashion', 'Urban Line', 'Classic Co']));
      assign(attrs, 'individualCharacteristics.retail.linkedStore', randomPick([
        ['Demo Mall', 'Demo Outlet'],
        ['Flagship', 'Airport'],
      ]));
      assign(attrs, 'individualCharacteristics.retail.cobrandedCreditCardHolder', weightedBool(0.3));
      assign(attrs, 'individualCharacteristics.retail.shirtSize', randomPick(['S', 'M', 'L', 'XL']));
      assign(attrs, 'individualCharacteristics.core.favouriteCategory', randomPick(['apparel', 'electronics', 'home', 'beauty']));
      assign(attrs, 'orderProfile.lifetimeValue', randomBetween(500, 15000));
      assign(attrs, 'orderProfile.lastOrderDate', isoDateAgo(randomBetween(1, 90)));
      break;
    case 'fsi':
      assign(attrs, 'individualCharacteristics.fsi.customerRelationship.currentTier', randomPick(['Bronze', 'Silver', 'Gold', 'Platinum']));
      assign(attrs, 'individualCharacteristics.fsi.financialDetails.creditClassification', randomPick(['good', 'fair', 'excellent']));
      assign(attrs, 'individualCharacteristics.fsi.financialDetails.customerBehavior.productInterest', randomPick(['mortgages', 'investments', 'savings', 'credit_cards']));
      assign(attrs, 'individualCharacteristics.fsi.financialDetails.customerBehavior.investingStyle', randomPick(['conservative', 'moderate', 'aggressive']));
      assign(attrs, 'individualCharacteristics.fsi.financialAdvisor', randomPick(['Demo Advisor', 'Jane Smith', 'Alex Rivera']));
      assign(attrs, 'individualCharacteristics.fsi.linkedBranch', randomPick(['Demo Branch', 'Downtown', 'Suburban']));
      assign(attrs, 'individualCharacteristics.fsi.hasAssignedBeneficiary', weightedBool(0.4));
      assign(attrs, 'individualCharacteristics.fsi.customerRelationship.csat', randomBetween(60, 99));
      assign(attrs, 'individualCharacteristics.fsi.customerRelationship.membershipStartDate', isoDateAgo(randomBetween(365, 3650)));
      assign(attrs, 'individualCharacteristics.fsi.financialDetails.balance', {
        checkingTotal: randomBetween(1000, 25000),
        creditCardsTotal: randomBetween(0, 8000),
        savingsTotal: randomBetween(5000, 100000),
      });
      assign(attrs, 'individualCharacteristics.fsi.financialDetails.creditScore', randomBetween(580, 820));
      assign(attrs, 'individualCharacteristics.fsi.productOverview.checkingAcct', true);
      assign(attrs, 'individualCharacteristics.fsi.productOverview.savingsAcct', weightedBool(0.85));
      assign(attrs, 'individualCharacteristics.core.creditScore', randomBetween(580, 820));
      assign(attrs, 'individualCharacteristics.core.employer', randomPick(['Acme Corp', 'Global Finance', 'Tech Solutions']));
      assign(attrs, 'individualCharacteristics.core.occupation', randomPick(['Engineer', 'Analyst', 'Manager', 'Consultant']));
      assign(attrs, 'personalFinances.creditScores', [{
        score: randomBetween(580, 820),
        provider: randomPick(['Experian', 'Equifax', 'TransUnion']),
        scoreDate: new Date().toISOString(),
      }]);
      break;
    case 'travel':
      assign(attrs, 'individualCharacteristics.travel.favouriteAirlineCompany', randomPick(['Demo Airlines', 'SkyJet', 'Global Air']));
      assign(attrs, 'individualCharacteristics.travel.primaryTravelClass', randomPick(['economy', 'premium_economy', 'business', 'first']));
      assign(attrs, 'individualCharacteristics.travel.primaryTravelerType', randomPick(['leisure', 'business', 'mixed']));
      assign(attrs, 'individualCharacteristics.travel.avgDaysBookingBeforeTrip', randomBetween(7, 90));
      assign(attrs, 'individualCharacteristics.travel.avgTripLength', randomBetween(2, 14));
      assign(attrs, 'individualCharacteristics.travel.cobrandedCreditCardHolder', weightedBool(0.25));
      assign(attrs, 'individualCharacteristics.travel.preferences', {
        hotel: {
          hotelRoomPreference: { pillowType: randomPick(['firm', 'soft']), hearingAccessible: false, mobilityAccessible: false },
          stayPreference: { highFloor: weightedBool(0.3), lateCheckOut: weightedBool(0.5), nearElevator: false },
        },
      });
      assign(attrs, 'individualCharacteristics.travel.recentStay', {
        hotelName: randomPick(HOTEL_NAMES),
        hotelRoomType: randomPick(['King', 'Twin', 'Suite']),
        hotelClass: randomPick(['3-star', '4-star', '5-star']),
        hotelLengthDays: randomBetween(1, 7),
        amountDailyAvg: randomBetween(120, 450),
        amountTotal: randomBetween(300, 2500),
      });
      break;
    case 'telecom':
      assign(attrs, 'telecomSubscription.bundleName', randomPick(['Demo Bundle', 'Family Plus', 'Gigabit Pro']));
      assign(attrs, 'telecomSubscription.mobileSubscription', [{
        planLevel: randomPick(['Basic', 'Standard', 'Premium']),
        earlyUpgradeEnrollment: weightedBool(0.2),
        portedNumber: weightedBool(0.4),
      }]);
      assign(attrs, 'telecomSubscription.internetSubscription', [{
        connectionType: randomPick(['fiber', 'cable', 'dsl']),
        dataCap: randomPick([500, 1000, 0]),
        downloadSpeed: randomPick([100, 300, 1000]),
        uploadSpeed: randomPick([20, 50, 100]),
        selfSetup: weightedBool(0.6),
      }]);
      break;
    case 'media':
      assign(attrs, 'media.accountType', randomPick(['basic', 'premium', 'family']));
      assign(attrs, 'media.contractStatus', 'active');
      assign(attrs, 'media.debtStatus', 'current');
      assign(attrs, 'media.productHolding', randomPick(['TV + broadband', 'Streaming only', 'TV + mobile']));
      assign(attrs, 'media.serviceRAGStatus', randomPick(['green', 'amber', 'green']));
      assign(attrs, 'media.packages', randomPick([['Entertainment'], ['Entertainment', 'Sports'], ['Kids', 'Sports']]));
      assign(attrs, 'individualCharacteristics.core.favouriteSubCategory', randomPick(['drama', 'comedy', 'documentary', 'sports']));
      assign(attrs, 'subscriptions', [{
        planName: randomPick(['Premium', 'Standard', 'Family']),
        status: 'active',
        type: 'subscription',
        category: 'streaming',
        billingPeriod: randomPick(['monthly', 'annual']),
        startDate: isoDateAgo(randomBetween(30, 730)),
      }]);
      break;
    case 'sports':
      assign(attrs, 'individualCharacteristics.favouriteTeam', randomPick(['Demo FC', 'City United', 'Metro Athletic']));
      assign(attrs, 'gym.ptSession', randomPick(['weekly', 'monthly', 'none']));
      assign(attrs, 'individualCharacteristics.core.favouriteCategory', 'sports');
      assign(attrs, 'individualCharacteristics.core.favouriteSubCategory', randomPick(['football', 'basketball', 'tennis', 'cricket']));
      assign(attrs, 'scoring.product.affinity', randomPick(['Demo FC', 'City United', 'Metro Athletic']));
      break;
    case 'generic':
    default:
      assign(attrs, 'individualCharacteristics.core.favouriteCategory', randomPick(['general', 'retail', 'travel', 'media']));
      break;
  }
  return attrs;
}

/**
 * Apply travel hotel segment persona overlays (hotel.bookingDetails + scoring paths).
 * @param {Record<string, unknown>} attrs
 * @param {string} segmentHint
 */
function applyTravelSegmentHint(attrs, segmentHint) {
  const hint = String(segmentHint || '').trim().toLowerCase();
  if (!hint || hint === 'default') return attrs;

  const bd = 'hotel.bookingDetails';

  if (hint === 'hotel_reactivation') {
    const checkoutDaysAgo = randomBetween(366, 500);
    const checkoutMs = Date.now() - checkoutDaysAgo * 86400000;
    const checkInMs = checkoutMs - 5 * 86400000;
    const nightsStay = 5;
    const totalNights = randomBetween(7, 28);

    assign(attrs, 'scoring.churn.churnPrediction', randomDecimal(0.55, 0.85));
    assign(attrs, 'scoring.core.propensityScore', randomDecimal(0.66, 0.92));
    assign(attrs, `${bd}.hotelName`, randomPick(HOTEL_NAMES));
    assign(attrs, `${bd}.hotelLocation`, randomPick(HOTEL_LOCATIONS));
    assign(attrs, `${bd}.hotelChain`, 'Lab Chain');
    assign(attrs, `${bd}.checkInDate`, isoDateFromMs(checkInMs));
    assign(attrs, `${bd}.checkOutDate`, isoDateFromMs(checkoutMs));
    assign(attrs, `${bd}.nightsStay`, nightsStay);
    assign(attrs, `${bd}.totalNights`, totalNights);
    assign(attrs, `${bd}.roomType`, randomPick(['Double', 'King', 'Twin']));
    assign(attrs, `${bd}.confirmationNumber`, `LAB-${randomBetween(100000, 999999)}`);
    return attrs;
  }

  if (hint === 'hotel_high_value') {
    const checkoutDaysAgo = randomBetween(14, 120);
    const checkoutMs = Date.now() - checkoutDaysAgo * 86400000;
    const nightsStay = randomBetween(3, 7);
    const checkInMs = checkoutMs - nightsStay * 86400000;
    const totalNights = randomBetween(20, 60);
    const roomCost = randomBetween(180, 420);

    assign(attrs, 'loyalty.tier', 'platinum');
    assign(attrs, 'loyaltyDetails.level', 'platinum');
    assign(attrs, 'loyalty.points', randomBetween(80_000, 200_000));
    assign(attrs, 'loyaltyDetails.points', randomBetween(80_000, 200_000));
    assign(attrs, 'scoring.churn.churnPrediction', randomDecimal(0.05, 0.25));
    assign(attrs, 'scoring.core.propensityScore', randomDecimal(0.75, 0.95));
    assign(attrs, 'scoring.npsScore', randomBetween(8, 10));
    assign(attrs, 'orderProfile.lifetimeValue', randomBetween(15_000, 45_000));
    assign(attrs, 'individualCharacteristics.travel.primaryTravelClass', randomPick(['business', 'first']));
    assign(attrs, `${bd}.hotelName`, randomPick(HOTEL_NAMES));
    assign(attrs, `${bd}.hotelLocation`, randomPick(HOTEL_LOCATIONS));
    assign(attrs, `${bd}.hotelChain`, 'Lab Chain');
    assign(attrs, `${bd}.checkInDate`, isoDateFromMs(checkInMs));
    assign(attrs, `${bd}.checkOutDate`, isoDateFromMs(checkoutMs));
    assign(attrs, `${bd}.nightsStay`, nightsStay);
    assign(attrs, `${bd}.totalNights`, totalNights);
    assign(attrs, `${bd}.roomType`, randomPick(['Suite', 'King', 'Executive King']));
    assign(attrs, `${bd}.roomCost`, roomCost);
    assign(attrs, `${bd}.totalCost`, roomCost * nightsStay);
    assign(attrs, `${bd}.rateCode`, randomPick(['CORP', 'FLEX', 'BAR']));
    assign(attrs, `${bd}.confirmationNumber`, `HV-${randomBetween(100000, 999999)}`);
    return attrs;
  }

  return attrs;
}

/**
 * Build randomized persona attributes for an industry + email.
 * @param {string} industry - canonical industry key
 * @param {string} email
 * @param {string} [segmentHint] - optional segment overlay (travel: hotel_high_value, hotel_reactivation)
 * @returns {Record<string, unknown>}
 */
export function buildPersonaAttributes(industry, email, segmentHint) {
  const key = LAB_INDUSTRY_KEYS.includes(industry) ? industry : 'generic';
  let attrs = {
    ...buildCommonPersonaAttributes(email),
    ...defaultIndustryAttributes(key),
  };

  if (key === 'travel' && segmentHint) {
    attrs = applyTravelSegmentHint(attrs, segmentHint);
  }

  return attrs;
}

/**
 * @param {string | undefined | null} segmentHint
 * @param {string} industry
 * @returns {string | null} normalized hint or validation error message
 */
export function normalizeSegmentHint(segmentHint, industry) {
  if (!segmentHint) return null;
  const hint = String(segmentHint).trim().toLowerCase();
  if (!hint) return null;

  if (industry === 'travel') {
    if (TRAVEL_SEGMENT_HINTS.includes(hint)) return hint;
    return `Unknown travel segment_hint "${segmentHint}". Supported: ${TRAVEL_SEGMENT_HINTS.join(', ')}.`;
  }

  return `segment_hint "${segmentHint}" is not supported for industry "${industry}" (travel only: ${TRAVEL_SEGMENT_HINTS.join(', ')}).`;
}

/**
 * Resolve email for batch item index (1-based).
 * @param {object} opts
 * @param {number} opts.index - 1-based index
 * @param {string} [opts.baseEmail]
 * @param {string} [opts.emailPattern]
 * @param {string} [opts.industry]
 */
export function resolveBatchEmail({ index, baseEmail, emailPattern, industry }) {
  const n = Number(index);
  const ind = String(industry || 'generic').toLowerCase();

  if (emailPattern) {
    return String(emailPattern)
      .replace(/\{n\}/gi, String(n))
      .replace(/\{index\}/gi, String(n))
      .replace(/\{industry\}/gi, ind);
  }

  const base = String(baseEmail || '').trim();
  if (!base) {
    return `lab+mcp-${ind}-${n}@adobetest.com`;
  }

  if (base.includes('@')) {
    const [local, domain] = base.split('@');
    const tag = local.includes('+') ? `${local}-${n}` : `${local}+${ind}-${n}`;
    return `${tag}@${domain}`;
  }

  return `${base}+${ind}-${n}@adobetest.com`;
}
