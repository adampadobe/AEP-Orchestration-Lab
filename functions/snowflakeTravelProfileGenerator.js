/**
 * AGENTIC_TRAVEL_PROFILE_CUSTOMER row generator — Phase 1 parity with
 * services/agentic-travel-runner/py/data_generator.py `generate_profiles`.
 *
 * Dual-load binds shared join keys (EMAIL, ECID, CRMID; optional FIRSTNAME/LASTNAME)
 * from AEP generate; all travel CRM columns are generated independently here.
 */

'use strict';

const { createHash } = require('crypto');
const { COLUMNS: TRAVEL_COLUMNS } = require('./snowflakeTravelProfileSchema');
const {
  formatSnowflakeRecordTimestamp,
  getAttr,
  normalizeAepAttributesForSnowflake,
} = require('./snowflakeProfileMapper');
const { createRecipient } = require('./snowflakeRecipientFactory');

const AGENTIC_MOBILE = '+447425627462';
const LOYALTY_ENROLLMENT_RATE = 0.6;

const FIRST_NAMES_MALE = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
  'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Andrew', 'Paul', 'Joshua', 'Kenneth',
];
const FIRST_NAMES_FEMALE = [
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen',
  'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
];
const CITIES = [
  'London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Liverpool', 'Edinburgh', 'Bristol',
  'Cardiff', 'Belfast', 'Newcastle', 'Sheffield', 'Nottingham', 'Leicester', 'Southampton',
];
const DESTINATIONS = [
  'Paris', 'Barcelona', 'Amsterdam', 'Rome', 'Berlin', 'Madrid', 'Lisbon', 'Vienna', 'Prague', 'Budapest',
  'New York', 'Los Angeles', 'Miami', 'Toronto', 'Vancouver', 'Dubai', 'Singapore', 'Hong Kong', 'Tokyo',
  'Bangkok', 'Sydney', 'Melbourne', 'Cape Town', 'Marrakech',
];
const CABIN_CLASSES = ['economy', 'premium_economy', 'business', 'first'];
const SEAT_TYPES = ['window', 'aisle', 'middle'];
const MEAL_PREFS = ['standard', 'vegetarian', 'vegan', 'gluten_free', 'halal', 'kosher', 'diabetic', 'low_sodium'];
const SEGMENTS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDateYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sha256Email(email) {
  const e = String(email || '').trim();
  if (!e) return null;
  return createHash('sha256').update(e.toLowerCase(), 'utf8').digest('hex');
}

/** Mirrors Python `generate_landline(idx)`. */
function generateLandline(idx) {
  const areaCodes = ['20', '121', '131', '161'];
  const areaCode = areaCodes[idx % areaCodes.length];
  const subscriberLength = areaCode === '20' ? 8 : 7;
  const subscriber = String(1000000 + (idx % 9000000)).padStart(subscriberLength, '0');
  return `+44${areaCode}${subscriber}`;
}

function resolveNameOverrides(input, attrs) {
  const firstName =
    String(input.firstName || getAttr(attrs, 'person.name.firstName') || getAttr(attrs, 'firstName') || '').trim()
    || null;
  const lastName =
    String(input.lastName || getAttr(attrs, 'person.name.lastName') || getAttr(attrs, 'lastName') || '').trim()
    || null;
  return { firstName, lastName };
}

function resolveGenderAndNames(input, attrs) {
  const overrides = resolveNameOverrides(input, attrs);
  if (overrides.firstName && overrides.lastName) {
    const genderRaw = String(getAttr(attrs, 'person.gender') || getAttr(attrs, 'gender') || '').toLowerCase();
    const gender = genderRaw === 'male' || genderRaw === 'female' ? genderRaw : pickRandom(['male', 'female']);
    return { ...overrides, gender };
  }
  const gender = pickRandom(['male', 'female']);
  return {
    firstName: overrides.firstName || pickRandom(gender === 'male' ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE),
    lastName: overrides.lastName || pickRandom(LAST_NAMES),
    gender,
  };
}

function resolveDateOfBirth(attrs, asOfDate) {
  const birthDate = String(getAttr(attrs, 'person.birthDate') || getAttr(attrs, 'birthDate') || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return new Date(`${birthDate}T12:00:00.000Z`);
  }
  const ageYears = 21 + Math.floor(Math.random() * 55);
  const jitterDays = Math.floor(Math.random() * 366);
  return new Date(new Date(asOfDate || Date.now()).getTime() - (ageYears * 365 + jitterDays) * 86400000);
}

function segmentEconomics(segment) {
  if (segment === 'diamond') {
    return {
      avgBooking: round2(1200 + Math.random() * 2300),
      totalBookings: randInt(15, 50),
    };
  }
  if (segment === 'platinum') {
    return {
      avgBooking: round2(800 + Math.random() * 1200),
      totalBookings: randInt(10, 30),
    };
  }
  if (segment === 'gold') {
    return {
      avgBooking: round2(500 + Math.random() * 700),
      totalBookings: randInt(6, 20),
    };
  }
  if (segment === 'silver') {
    return {
      avgBooking: round2(350 + Math.random() * 450),
      totalBookings: randInt(3, 12),
    };
  }
  return {
    avgBooking: round2(250 + Math.random() * 350),
    totalBookings: randInt(1, 8),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomDaysAgo(minDays, maxDays, asOfDate) {
  return new Date(new Date(asOfDate || Date.now()).getTime() - randInt(minDays, maxDays) * 86400000);
}

function randomDaysAhead(minDays, maxDays, asOfDate) {
  return new Date(new Date(asOfDate || Date.now()).getTime() + randInt(minDays, maxDays) * 86400000);
}

/**
 * Build one AGENTIC_TRAVEL_PROFILE_CUSTOMER row with CRM fields populated.
 *
 * @param {{
 *   idx: number,
 *   email: string,
 *   ecid: string,
 *   crmId: string,
 *   runStamp?: string | Date,
 *   attributes?: Record<string, unknown>,
 *   firstName?: string,
 *   lastName?: string,
 *   testProfile?: boolean,
 * }} input
 */
function generateTravelProfileRow(input) {
  const idx = Number(input.idx);
  if (!Number.isFinite(idx) || idx <= 0) throw new Error('idx must be a positive integer');

  const email = String(input.email || '').trim();
  const ecid = String(input.ecid || '').trim();
  const crmId = String(input.crmId || `CRM${idx}`).trim();
  if (!email) throw new Error('email is required for travel CRM profile generation');
  if (!ecid) throw new Error('ecid is required for travel CRM profile generation');

  const attrs = normalizeAepAttributesForSnowflake(input.attributes);
  const { firstName, lastName, gender } = resolveGenderAndNames(input, attrs);
  const dob = resolveDateOfBirth(attrs, input.asOfDate);
  const runStamp = formatSnowflakeRecordTimestamp(input.runStamp);
  const recipient = input.recipient || createRecipient({
    industry: 'travel',
    crmId,
    ecid,
    email,
    index: idx,
    hero: input.hero === true,
  });

  const lastHoliday = randomDaysAgo(14, 730, input.asOfDate);
  const upcomingHoliday = input.upcomingTripDate
    ? new Date(input.upcomingTripDate)
    : randomDaysAhead(input.hero ? 150 : 14, input.hero ? 200 : 365, input.asOfDate);
  const totalFlights = randInt(1, 100);
  const totalDistance = round2(totalFlights * (400 + Math.random() * 4600));

  const segment = input.hero === true ? 'gold' : pickRandom(SEGMENTS);
  const { avgBooking, totalBookings } = segmentEconomics(segment);
  const lifetimeValue = round2(avgBooking * totalBookings);

  const loyaltyFromAep = String(
    getAttr(attrs, 'loyalty.loyaltyId') || getAttr(attrs, 'loyaltyDetails.loyaltyId') || '',
  ).trim();
  const loyaltyId = loyaltyFromAep
    || (Math.random() < LOYALTY_ENROLLMENT_RATE ? `LOYALTY${idx + 2000}` : null);

  const testProfile = input.testProfile === false ? false : true;

  const rowByCol = {
    RECIPIENT_ID: recipient.recipientId,
    CRMID: crmId,
    ECID: ecid,
    EMAIL: email,
    EMAILIDSHA256: sha256Email(email),
    GAID: `GAID${idx}`,
    LOYALTYID: loyaltyId,
    PASSPORTID: `PASS${idx}`,
    PHONENUMBER: AGENTIC_MOBILE,
    PUSHTOKENS: recipient.pushTokens,
    STACKCHATID: `STACK${idx}`,
    FIRSTNAME: firstName,
    LASTNAME: lastName,
    DATEOFBIRTH: formatDateYmd(dob),
    GENDER: gender,
    NATIONALITY: 'GB',
    PRIMARYEMAIL: email,
    PRIMARYPHONE: generateLandline(idx),
    ADDRESSSTREET: `${idx} High Street`,
    ADDRESSCITY: CITIES[idx % CITIES.length],
    ADDRESSPOSTALCODE: [
      'SW1A 1AA', 'M1 1AE', 'B1 1AA', 'LS1 1UR', 'G1 1AA',
      'L1 1AA', 'EH1 1AA', 'BS1 1AA', 'CF10 1AA', 'BT1 1AA',
      'NE1 1AA', 'S1 1AA', 'NG1 1AA', 'LE1 1AA', 'SO14 1AA',
    ][idx % CITIES.length],
    ADDRESSCOUNTRY: 'United Kingdom',
    LASTHOLIDAYDATE: formatDateYmd(lastHoliday),
    LASTHOLIDAYDESTINATION: pickRandom(DESTINATIONS),
    UPCOMINGHOLIDAYDATE: formatDateYmd(upcomingHoliday),
    UPCOMINGHOLIDAYDESTINATION: input.upcomingDestination || pickRandom(DESTINATIONS),
    TOTALFLIGHTSTAKEN: totalFlights,
    TOTALDISTANCEFLOWN: totalDistance,
    FAVORITEDESTINATIONS: null,
    PREFERREDCABINCLASS: pickRandom(CABIN_CLASSES),
    PREFERREDSEATTYPE: input.hero === true ? 'window' : pickRandom(SEAT_TYPES),
    MEALPREFERENCE: pickRandom(MEAL_PREFS),
    SPECIALASSISTANCE: null,
    LIFETIMEVALUE: lifetimeValue,
    AVERAGEBOOKINGVALUE: avgBooking,
    TOTALBOOKINGS: totalBookings,
    CUSTOMERSEGMENT: segment,
    TESTPROFILE: testProfile,
    _RECORDCREATEDTIMESTAMP: runStamp,
    _RECORDUPDATEDTIMESTAMP: runStamp,
  };

  const row = TRAVEL_COLUMNS.map((col) => (
    Object.prototype.hasOwnProperty.call(rowByCol, col) ? rowByCol[col] : null
  ));
  return { row, rowObject: rowByCol, columns: TRAVEL_COLUMNS.slice() };
}

module.exports = {
  AGENTIC_MOBILE,
  generateTravelProfileRow,
  generateLandline,
  segmentEconomics,
};
