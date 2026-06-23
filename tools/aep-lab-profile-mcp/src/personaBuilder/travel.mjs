import {
  assign,
  isoDateFromMs,
  randomBetween,
  randomDecimal,
  randomPick,
  weightedBool,
} from './utils.mjs';

/** Segment overlay hotel names (hotel_reactivation / hotel_high_value). */
const HOTEL_NAMES = ['Premier Inn Demo Central', 'Grand Plaza', 'Harbour Inn', 'Demo Hotel'];
const HOTEL_LOCATIONS = ['Manchester, UK', 'London, UK', 'Edinburgh, UK', 'Birmingham, UK'];

const RANDOM_AIRLINES = [
  'British Airways', 'Air France', 'Lufthansa', 'KLM', 'Emirates',
  'Qatar Airways', 'Delta Air Lines', 'United Airlines', 'American Airlines',
  'Singapore Airlines', 'Cathay Pacific', 'ANA', 'Turkish Airlines', 'Iberia',
];

const AIRLINE_IATA = {
  'British Airways': 'BA', 'Air France': 'AF', 'Lufthansa': 'LH', 'KLM': 'KL',
  'Emirates': 'EK', 'Qatar Airways': 'QR', 'Delta Air Lines': 'DL',
  'United Airlines': 'UA', 'American Airlines': 'AA', 'Singapore Airlines': 'SQ',
  'Cathay Pacific': 'CX', 'ANA': 'NH', 'Turkish Airlines': 'TK', 'Iberia': 'IB',
};

/** @type {Array<{ code: string, city: string, country: string, isUSA: boolean }>} */
const AIRPORTS = [
  { code: 'LHR', city: 'London', country: 'United Kingdom', isUSA: false },
  { code: 'CDG', city: 'Paris', country: 'France', isUSA: false },
  { code: 'FRA', city: 'Frankfurt', country: 'Germany', isUSA: false },
  { code: 'MUC', city: 'Munich', country: 'Germany', isUSA: false },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands', isUSA: false },
  { code: 'MAD', city: 'Madrid', country: 'Spain', isUSA: false },
  { code: 'BCN', city: 'Barcelona', country: 'Spain', isUSA: false },
  { code: 'FCO', city: 'Rome', country: 'Italy', isUSA: false },
  { code: 'IST', city: 'Istanbul', country: 'Turkey', isUSA: false },
  { code: 'DUB', city: 'Dublin', country: 'Ireland', isUSA: false },
  { code: 'KEF', city: 'Reykjavik', country: 'Iceland', isUSA: false },
  { code: 'DXB', city: 'Dubai', country: 'United Arab Emirates', isUSA: false },
  { code: 'AUH', city: 'Abu Dhabi', country: 'United Arab Emirates', isUSA: false },
  { code: 'DOH', city: 'Doha', country: 'Qatar', isUSA: false },
  { code: 'SIN', city: 'Singapore', country: 'Singapore', isUSA: false },
  { code: 'HKG', city: 'Hong Kong', country: 'Hong Kong', isUSA: false },
  { code: 'BKK', city: 'Bangkok', country: 'Thailand', isUSA: false },
  { code: 'ICN', city: 'Seoul', country: 'South Korea', isUSA: false },
  { code: 'NRT', city: 'Tokyo', country: 'Japan', isUSA: false },
  { code: 'HND', city: 'Tokyo', country: 'Japan', isUSA: false },
  { code: 'SYD', city: 'Sydney', country: 'Australia', isUSA: false },
  { code: 'JNB', city: 'Johannesburg', country: 'South Africa', isUSA: false },
  { code: 'YYZ', city: 'Toronto', country: 'Canada', isUSA: false },
  { code: 'JFK', city: 'New York', country: 'United States', isUSA: true },
  { code: 'EWR', city: 'Newark', country: 'United States', isUSA: true },
  { code: 'BOS', city: 'Boston', country: 'United States', isUSA: true },
  { code: 'IAD', city: 'Washington', country: 'United States', isUSA: true },
  { code: 'ATL', city: 'Atlanta', country: 'United States', isUSA: true },
  { code: 'MIA', city: 'Miami', country: 'United States', isUSA: true },
  { code: 'ORD', city: 'Chicago', country: 'United States', isUSA: true },
  { code: 'DFW', city: 'Dallas', country: 'United States', isUSA: true },
  { code: 'DEN', city: 'Denver', country: 'United States', isUSA: true },
  { code: 'LAS', city: 'Las Vegas', country: 'United States', isUSA: true },
  { code: 'LAX', city: 'Los Angeles', country: 'United States', isUSA: true },
  { code: 'SFO', city: 'San Francisco', country: 'United States', isUSA: true },
  { code: 'SEA', city: 'Seattle', country: 'United States', isUSA: true },
];

const MEAL_OPTIONS = [
  'regularMeal', 'regularMeal', 'regularMeal',
  'vegetarian', 'vegetarian',
  'vegLactoOvo', 'kosherMeal', 'halalMeal', 'glutenFreeMeal',
  'diabeticMeal', 'lowCalorieMeal', 'lowSaltSodiumMeal',
  'nonLactoseMeal', 'peanutFreeMeal', 'seafoodMeal', 'fruitPlatter',
];
const SEAT_OPTIONS = ['window', 'aisle', 'middle', 'noPreference'];
const SEAT_SECTION = ['forward', 'rear', 'exitRow', 'bulkhead', 'noPreference'];
const ROOM_TYPES = ['king', 'queen', 'double', 'twin', 'single', 'noPreference'];
const VEHICLE_TYPES = [
  'compactCar', 'compactCar', 'economyCar', 'economyCar',
  'intermediateCar', 'standardCar', 'fullSizeCar',
  'intermediateSUV', 'standardSUV', 'fullSizeSUV',
  'miniVan', 'premiumCar', 'luxuryCar', 'compactCarHybrid', 'economyCarHybrid',
];
const TICKET_DELIVERY = ['eTicket', 'eTicket', 'eTicket', 'physical'];

export { buildPortalLoyaltyAttributes, buildTravelLoyaltyAttributes } from './loyalty.mjs';

function pickAirportPair() {
  const dep = randomPick(AIRPORTS);
  let arr = randomPick(AIRPORTS);
  let guard = 0;
  while (arr.code === dep.code && guard < 6) {
    arr = randomPick(AIRPORTS);
    guard += 1;
  }
  return { dep, arr };
}

function pickRealisticLayovers(departureAirport, arrivalAirport, count) {
  if (!departureAirport || !arrivalAirport || !count) return [];

  const HUBS_EUROPE = ['LHR', 'CDG', 'FRA', 'AMS', 'MUC', 'MAD', 'IST', 'DUB', 'BCN'];
  const HUBS_GULF = ['DXB', 'AUH', 'DOH'];
  const HUBS_ASIA = ['SIN', 'HKG', 'ICN', 'BKK', 'NRT', 'HND'];
  const HUBS_USA_E = ['JFK', 'EWR', 'BOS', 'IAD', 'ATL'];
  const HUBS_USA_W = ['LAX', 'SFO', 'SEA', 'LAS'];
  const HUBS_USA_C = ['ORD', 'DFW', 'DEN'];
  const HUBS_TRANSATLANTIC = ['JFK', 'EWR', 'BOS', 'IAD', 'LHR', 'DUB', 'KEF', 'CDG', 'AMS'];
  const HUBS_PACIFIC = ['NRT', 'HND', 'ICN', 'HKG', 'SIN', 'LAX', 'SFO'];
  const HUBS_FALLBACK = ['LHR', 'CDG', 'FRA', 'DXB', 'SIN', 'JFK', 'LAX', 'IST'];

  const EUR = new Set([
    'United Kingdom', 'France', 'Germany', 'Netherlands', 'Spain', 'Italy',
    'Turkey', 'Ireland', 'Iceland',
  ]);
  const ASIA = new Set([
    'Japan', 'Singapore', 'Hong Kong', 'South Korea', 'Thailand',
  ]);
  const ME = new Set(['United Arab Emirates', 'Qatar']);
  const OCEAN = new Set(['Australia', 'New Zealand']);
  const AFRICA = new Set(['South Africa']);

  const dCountry = departureAirport.country;
  const aCountry = arrivalAirport.country;
  const dUS = !!departureAirport.isUSA;
  const aUS = !!arrivalAirport.isUSA;
  const dCA = dCountry === 'Canada';
  const aCA = aCountry === 'Canada';
  const dNA = dUS || dCA;
  const aNA = aUS || aCA;
  const dEur = EUR.has(dCountry);
  const aEur = EUR.has(aCountry);
  const dAsia = ASIA.has(dCountry);
  const aAsia = ASIA.has(aCountry);
  const dME = ME.has(dCountry);
  const aME = ME.has(aCountry);
  const dOcean = OCEAN.has(dCountry);
  const aOcean = OCEAN.has(aCountry);
  const dAfr = AFRICA.has(dCountry);
  const aAfr = AFRICA.has(aCountry);

  let candidates;
  if (dUS && aUS) {
    candidates = HUBS_USA_E.concat(HUBS_USA_C, HUBS_USA_W);
  } else if (dEur && aEur) {
    candidates = HUBS_EUROPE;
  } else if ((dEur && aNA) || (dNA && aEur)) {
    candidates = HUBS_TRANSATLANTIC;
  } else if ((dAsia && aEur) || (dEur && aAsia)) {
    candidates = HUBS_GULF.concat(HUBS_ASIA);
  } else if ((dAsia && aNA) || (dNA && aAsia)) {
    candidates = HUBS_PACIFIC;
  } else if (dOcean || aOcean) {
    candidates = ['SIN', 'HKG', 'DXB', 'NRT'];
  } else if (dAfr || aAfr || dME || aME) {
    candidates = ['DXB', 'DOH', 'IST', 'FRA', 'CDG'];
  } else {
    candidates = HUBS_FALLBACK;
  }

  const pool = candidates
    .map((code) => AIRPORTS.find((a) => a.code === code))
    .filter((a) => a && a.code !== departureAirport.code && a.code !== arrivalAirport.code);

  const picks = [];
  const usedCodes = new Set();
  for (let i = 0; i < count; i += 1) {
    const remaining = pool.filter((a) => !usedCodes.has(a.code));
    if (!remaining.length) break;
    const pick = randomPick(remaining);
    picks.push(pick);
    usedCodes.add(pick.code);
  }
  return picks;
}

function pickLayoverDurationMinutes() {
  const r = Math.random();
  if (r < 0.20) return randomBetween(45, 90);
  if (r < 0.80) return randomBetween(90, 240);
  return randomBetween(240, 540);
}

function isoFutureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function isoPastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function randomFlightDateBiased() {
  if (Math.random() < 0.30) {
    return isoPastDate(randomBetween(1, 90));
  }
  return isoFutureDate(randomBetween(1, 180));
}

function randomConfirmationCode() {
  const ALPHA_NUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ALPHA_ONLY = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const chars = Math.random() < 0.5 ? ALPHA_NUMERIC : ALPHA_ONLY;
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function randomFlightNumber(airlineDisplay) {
  const code = AIRLINE_IATA[airlineDisplay] || randomPick(['BA', 'AF', 'LH', 'EK', 'QR']);
  return `${code}${String(randomBetween(100, 4999)).padStart(4, '0')}`;
}

function rCost(lo, hi) {
  return Math.round((Math.random() * (hi - lo) + lo) * 100) / 100;
}

/**
 * Flight reservation paths — mirrors portal buildUpdatesFromForm flight block.
 * @param {Record<string, unknown>} attrs
 * @param {{ dep: object, arr: object, airline: string }} route
 */
function assignFlightReservationAttributes(attrs, { dep, arr, airline }) {
  const fp = 'travelReservations.flightReservations';
  const passengers = randomBetween(1, 4);
  const childrenTravelling = passengers >= 2 && Math.random() < 0.3;
  const flightClassRaw = randomPick([
    'economy', 'economy', 'economy', 'premium_economy', 'business', 'business', 'first',
  ]);

  const r = Math.random();
  let isMultiLeg;
  let layovers;
  if (r < 0.60) { isMultiLeg = false; layovers = 0; }
  else if (r < 0.90) { isMultiLeg = true; layovers = 1; }
  else { isMultiLeg = true; layovers = 2; }

  const layoverPicks = isMultiLeg ? pickRealisticLayovers(dep, arr, layovers) : [];
  const layover1 = layoverPicks[0] || null;
  const layover2 = layoverPicks[1] || null;

  assign(attrs, `${fp}.departureAirportCode`, dep.code);
  assign(attrs, `${fp}.arrivalAirportCode`, arr.code);
  assign(attrs, `${fp}.flightNumber`, randomFlightNumber(airline));
  assign(attrs, `${fp}.flightDate`, randomFlightDateBiased());
  assign(attrs, `${fp}.flightClass`, flightClassRaw);
  assign(attrs, `${fp}.confirmationNumber`, randomConfirmationCode());
  assign(attrs, `${fp}.numberofPassengers`, passengers);
  assign(attrs, `${fp}.childrenTravelling`, childrenTravelling);
  assign(attrs, `${fp}.multiLeg.multiLeg`, isMultiLeg);
  assign(attrs, `${fp}.multiLeg.numberofLayovers`, layovers);
  assign(attrs, `${fp}.departureCountry`, dep.country);
  assign(attrs, `${fp}.arrivalCountry`, arr.country);
  assign(attrs, `${fp}.usaFlight`, dep.isUSA || arr.isUSA);

  if (isMultiLeg && layovers >= 1 && layover1) {
    assign(attrs, `${fp}.multiLeg.layoverAirport_1`, layover1.city);
    assign(attrs, `${fp}.multiLeg.layoverAirportCode_1`, layover1.code);
    assign(attrs, `${fp}.multiLeg.layoverDuration_1`, pickLayoverDurationMinutes());
    if (layovers >= 2 && layover2) {
      assign(attrs, `${fp}.multiLeg.layoverAiport_2`, layover2.city);
      assign(attrs, `${fp}.multiLeg.layoverAirportCode_2`, layover2.code);
      assign(attrs, `${fp}.multiLeg.layoverDuration_2`, pickLayoverDurationMinutes());
    }
  }

  return { passengers, childrenTravelling };
}

/**
 * Root-level travelPreferences.* — OOTB mixin enum values.
 * @param {Record<string, unknown>} attrs
 * @param {{ dep: object, childrenTravelling: boolean }} ctx
 */
function assignTravelPreferencesAttributes(attrs, { dep, childrenTravelling }) {
  const prefs = 'travelPreferences';

  assign(attrs, `${prefs}.meal`, randomPick(MEAL_OPTIONS));
  assign(attrs, `${prefs}.seat`, randomPick(SEAT_OPTIONS));
  assign(attrs, `${prefs}.seatSection`, randomPick(SEAT_SECTION));
  assign(attrs, `${prefs}.ticketDelivery`, randomPick(TICKET_DELIVERY));
  assign(attrs, `${prefs}.preferredDepartureAirportCode`, dep.code);
  assign(attrs, `${prefs}.roomType`, randomPick(ROOM_TYPES));
  assign(attrs, `${prefs}.vehicleType`, randomPick(VEHICLE_TYPES));

  if (Math.random() < 0.1) {
    assign(attrs, `${prefs}.medicalAlerts`, randomPick([
      'Peanut allergy', 'Diabetic', 'Asthmatic', 'Lactose intolerant',
    ]));
  }

  assign(attrs, `${prefs}.gym`, weightedBool(0.6));
  assign(attrs, `${prefs}.pool`, weightedBool(0.7));
  assign(attrs, `${prefs}.earlyCheckIn`, weightedBool(0.5));
  assign(attrs, `${prefs}.roomService`, weightedBool(0.4));
  assign(attrs, `${prefs}.hasRestaurant`, true);
  assign(attrs, `${prefs}.foamPillows`, weightedBool(0.3));
  assign(attrs, `${prefs}.crib`, childrenTravelling && weightedBool(0.5));
  assign(attrs, `${prefs}.rollAwayBed`, childrenTravelling && weightedBool(0.3));
  assign(attrs, `${prefs}.smokingRoom`, false);
  assign(attrs, `${prefs}.manualTransmission`, weightedBool(0.15));
  assign(attrs, `${prefs}.smokingVehicle`, false);
  assign(attrs, `${prefs}.visuallyImpairedAccessible`, false);
  assign(attrs, `${prefs}.wheelchairAccessible`, weightedBool(0.05));
}

/**
 * Full hotel.* subtree — mirrors portal Recent stay + buildUpdatesFromForm.
 * @param {Record<string, unknown>} attrs
 * @param {string} [arrivalCity]
 */
function assignHotelAttributes(attrs, arrivalCity) {
  const hotelChains = ['Marriott', 'Hilton', 'IHG', 'Accor', 'Hyatt', 'Radisson'];
  const roomTypes = ['standard', 'superior', 'deluxe', 'junior_suite', 'suite', 'executive'];
  const rateCodes = ['BAR', 'LOYALTY', 'CORPORATE', 'ADVANCE_PURCHASE'];
  const checkInMethods = ['front_desk', 'mobile_app', 'kiosk'];
  const checkOutMethods = ['front_desk', 'express', 'mobile_app'];
  const amenityTypes = ['gym', 'pool', 'spa', 'restaurant', 'bar'];
  const rsTypes = ['food_order', 'beverage', 'laundry'];

  const nightsRand = randomBetween(1, 7);
  const offsetDays = randomBetween(-40, 45);
  const ci = new Date();
  ci.setUTCDate(ci.getUTCDate() + offsetDays);
  const co = new Date(ci);
  co.setUTCDate(co.getUTCDate() + nightsRand);
  const checkIn = ci.toISOString().slice(0, 10);
  const checkOut = co.toISOString().slice(0, 10);
  const nightsStay = Math.max(0, Math.round((co - ci) / 86400000));
  const totalNights = randomBetween(14, 60);
  const roomCostRand = rCost(89, 499);
  const totalCost = Math.round(roomCostRand * nightsRand * 100) / 100;

  const bd = 'hotel.bookingDetails';
  assign(attrs, `${bd}.hotelName`, randomPick([
    'The Savoy', "Claridge's", 'Hotel Arts Barcelona', 'Park Hyatt Tokyo', 'Rosewood London',
  ]));
  assign(attrs, `${bd}.hotelLocation`, arrivalCity || randomPick(HOTEL_LOCATIONS));
  assign(attrs, `${bd}.hotelChain`, randomPick(hotelChains));
  assign(attrs, `${bd}.checkInDate`, checkIn);
  assign(attrs, `${bd}.checkOutDate`, checkOut);
  if (nightsStay > 0) assign(attrs, `${bd}.nightsStay`, nightsStay);
  assign(attrs, `${bd}.totalNights`, totalNights);
  assign(attrs, `${bd}.roomType`, randomPick(roomTypes));
  assign(attrs, `${bd}.rateCode`, randomPick(rateCodes));
  assign(attrs, `${bd}.roomNumber`, String(randomBetween(101, 1250)));
  assign(attrs, `${bd}.confirmationNumber`, `HE-${randomBetween(100000, 999999)}`);
  assign(attrs, `${bd}.roomCost`, roomCostRand);
  assign(attrs, `${bd}.totalCost`, totalCost);

  const ciPath = 'hotel.checkIn';
  assign(attrs, `${ciPath}.checkInMethod`, randomPick(checkInMethods));
  assign(attrs, `${ciPath}.queueTime`, randomBetween(0, 15));
  assign(attrs, `${ciPath}.earlyCheckIn`, Math.random() > 0.7);
  assign(attrs, `${ciPath}.roomReady`, Math.random() > 0.3);
  assign(attrs, `${ciPath}.upgradedRoom`, Math.random() > 0.6);
  assign(attrs, `${ciPath}.welcomeAmenities`, Math.random() > 0.5);

  const hk = 'hotel.housekeeping';
  assign(attrs, `${hk}.doNotDisturb`, Math.random() > 0.5);
  assign(attrs, `${hk}.extraTowels`, Math.random() > 0.6);
  assign(attrs, `${hk}.serviceRequested`, Math.random() > 0.4);
  assign(attrs, `${hk}.cleanlinessRating`, randomBetween(7, 10));

  const am = 'hotel.amenities';
  assign(attrs, `${am}.amenityType`, randomPick(amenityTypes));
  assign(attrs, `${am}.satisfactionRating`, randomBetween(6, 10));

  if (Math.random() > 0.5) {
    const rs = 'hotel.roomService';
    assign(attrs, `${rs}.interactionType`, randomPick(rsTypes));
    assign(attrs, `${rs}.orderTotal`, rCost(15, 95));
    assign(attrs, `${rs}.serviceRating`, randomBetween(6, 10));
  }

  const incidentalsRand = Math.random() > 0.4 ? rCost(10, 120) : 0;
  const coPath = 'hotel.checkOut';
  assign(attrs, `${coPath}.checkOutMethod`, randomPick(checkOutMethods));
  assign(attrs, `${coPath}.lateCheckOut`, Math.random() > 0.7);
  assign(attrs, `${coPath}.overallRating`, randomBetween(7, 10));
  assign(attrs, `${coPath}.finalBillAmount`, Math.round((roomCostRand * nightsRand + incidentalsRand) * 100) / 100);
  if (incidentalsRand > 0) assign(attrs, `${coPath}.incidentalCharges`, incidentalsRand);
}

/**
 * Portal-equivalent travel persona (paths actually streamed by Profile Viewer).
 * @param {object} [options]
 * @returns {Record<string, unknown>}
 */
export function buildTravelPersonaAttributes(_options = {}) {
  const attrs = {};
  const airline = randomPick(RANDOM_AIRLINES);
  const { dep, arr } = pickAirportPair();

  const { childrenTravelling } = assignFlightReservationAttributes(attrs, { dep, arr, airline });
  assignTravelPreferencesAttributes(attrs, { dep, childrenTravelling });
  assignHotelAttributes(attrs, arr.city);

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
