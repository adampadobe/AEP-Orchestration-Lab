import {
  assign,
  randomBetween,
  randomDecimal,
  randomPick,
  weightedBool,
} from './utils.mjs';

const HOTEL_NAMES = ['Premier Inn Demo Central', 'Grand Plaza', 'Harbour Inn', 'Demo Hotel'];
const HOTEL_LOCATIONS = ['Manchester, UK', 'London, UK', 'Edinburgh, UK', 'Birmingham, UK'];
const AIRLINES = ['Demo Airlines', 'SkyJet', 'Global Air', 'Emirates', 'Delta', 'United'];
const TRAVEL_CLASSES = ['economy', 'premium_economy', 'business', 'first'];
const TRAVELER_TYPES = ['leisure', 'business', 'mixed'];

function isoDateFromMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function isoDateAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Base travel persona aligned with Profile Viewer random fill.
 * @returns {Record<string, unknown>}
 */
export function buildTravelPersonaAttributes() {
  const attrs = {};
  const recentLength = randomBetween(2, 10);
  const dailyAvg = randomBetween(120, 450);

  assign(attrs, 'individualCharacteristics.travel.favouriteAirlineCompany', randomPick(AIRLINES));
  assign(attrs, 'individualCharacteristics.travel.primaryTravelClass', randomPick(TRAVEL_CLASSES));
  assign(attrs, 'individualCharacteristics.travel.primaryTravelerType', randomPick(TRAVELER_TYPES));
  assign(attrs, 'individualCharacteristics.travel.avgDaysBookingBeforeTrip', randomBetween(7, 90));
  assign(attrs, 'individualCharacteristics.travel.avgTripLength', randomBetween(2, 14));
  assign(attrs, 'individualCharacteristics.travel.cobrandedCreditCardHolder', weightedBool(0.25));
  assign(attrs, 'individualCharacteristics.travel.preferences', {
    hotel: {
      hotelRoomPreference: {
        pillowType: randomPick(['firm', 'soft', 'hypoallergenic']),
        hearingAccessible: false,
        mobilityAccessible: false,
      },
      stayPreference: {
        highFloor: weightedBool(0.3),
        lateCheckOut: weightedBool(0.5),
        nearElevator: false,
      },
    },
  });
  assign(attrs, 'individualCharacteristics.travel.recentStay', {
    hotelName: randomPick(HOTEL_NAMES),
    hotelRoomType: randomPick(['King', 'Twin', 'Suite', 'Double']),
    hotelClass: randomPick(['3-star', '4-star', '5-star']),
    hotelLengthDays: recentLength,
    amountDailyAvg: dailyAvg,
    amountTotal: dailyAvg * recentLength,
  });

  return attrs;
}

/**
 * Apply travel hotel segment overlays.
 * @param {Record<string, unknown>} attrs
 * @param {string} segmentHint
 */
export function applyTravelSegmentHint(attrs, segmentHint) {
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

export { HOTEL_NAMES, HOTEL_LOCATIONS };
