/**
 * Map AEP persona dot-path attributes → AgenticAI BASE_PROFILES row (38 columns).
 * Used for dual-load (UPS + Snowflake mirror with shared email/ECID).
 */

'use strict';

const { createHash } = require('crypto');
const { COLUMNS } = require('./snowflakeBaseProfileSchema');
const { COLUMNS: TRAVEL_COLUMNS } = require('./snowflakeTravelProfileSchema');

const AGENTIC_MOBILE = '+447425627462';

/**
 * @param {Record<string, unknown> | null | undefined} attrs
 * @param {string} path
 * @returns {unknown}
 */
function getAttr(attrs, path) {
  if (!attrs || typeof attrs !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(attrs, path)) return attrs[path];
  return null;
}

function str(val, fallback = '') {
  if (val == null) return fallback;
  return String(val).trim();
}

function bool(val, fallback = true) {
  if (val === true || val === false) return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return fallback;
}

function sha256Email(email) {
  const e = str(email);
  if (!e) return null;
  return createHash('sha256').update(e.toLowerCase(), 'utf8').digest('hex');
}

/**
 * UTC timestamp string for AGENTIC_TRAVEL_PROFILE_CUSTOMER._RECORDCREATEDTIMESTAMP
 * (TIMESTAMP_NTZ). Matches Python agentic-travel-runner generate_timestamp_utc().
 *
 * @param {string | Date | undefined} input
 * @returns {string}
 */
function formatSnowflakeRecordTimestamp(input) {
  const d = input instanceof Date
    ? input
    : new Date(str(input) || Date.now());
  const when = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())} `
    + `${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}:${pad(when.getUTCSeconds())}.`
    + `${pad(when.getUTCMilliseconds(), 3)}`;
}

function parseBirthParts(attrs) {
  const birthDate = str(getAttr(attrs, 'person.birthDate') || getAttr(attrs, 'birthDate'));
  if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    const [y, m, d] = birthDate.split('-').map((x) => parseInt(x, 10));
    return {
      birthDate,
      birthDay: d,
      birthMonth: m,
      birthYear: y,
      birthDayMonth: `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    };
  }
  const day = getAttr(attrs, 'person.birthDay');
  const month = getAttr(attrs, 'person.birthMonth');
  const year = getAttr(attrs, 'person.birthYear');
  if (day != null && month != null && year != null) {
    const d = parseInt(String(day), 10);
    const m = parseInt(String(month), 10);
    const y = parseInt(String(year), 10);
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y)) {
      const birthDateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return {
        birthDate: birthDateStr,
        birthDay: d,
        birthMonth: m,
        birthYear: y,
        birthDayMonth: `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      };
    }
  }
  return {
    birthDate: null,
    birthDay: null,
    birthMonth: null,
    birthYear: null,
    birthDayMonth: null,
  };
}

/**
 * @param {object} input
 * @param {string} input.email
 * @param {string} input.ecid
 * @param {string} input.crmId — e.g. CRM1234
 * @param {Record<string, unknown>} [input.attributes]
 * @param {string} [input.runStamp] — ISO timestamp
 */
function mapAepAttributesToBaseProfileRow(input) {
  const email = str(input.email);
  const ecid = str(input.ecid);
  if (!email) throw new Error('email is required for Snowflake profile mapping');
  if (!ecid) throw new Error('ecid is required for Snowflake profile mapping');

  const attrs = input.attributes && typeof input.attributes === 'object' ? input.attributes : {};
  const runStamp = formatSnowflakeRecordTimestamp(str(input.runStamp) || undefined);
  const crmId = str(input.crmId) || 'CRM0';

  const firstName = str(getAttr(attrs, 'person.name.firstName') || getAttr(attrs, 'firstName'));
  const lastName = str(getAttr(attrs, 'person.name.lastName') || getAttr(attrs, 'lastName'));
  const courtesyTitle = str(getAttr(attrs, 'person.name.courtesyTitle'));
  const suffix = str(getAttr(attrs, 'person.name.suffix')) || null;
  const fullName =
    str(getAttr(attrs, 'person.name.fullName')) ||
    [firstName, lastName, suffix].filter(Boolean).join(' ') ||
    null;

  const genderRaw = str(getAttr(attrs, 'person.gender') || getAttr(attrs, 'gender')).toLowerCase();
  const gender = genderRaw === 'male' || genderRaw === 'female' ? genderRaw : null;

  const birth = parseBirthParts(attrs);

  const street = str(getAttr(attrs, 'homeAddress.street1') || getAttr(attrs, 'homeAddress.street'));
  const city = str(getAttr(attrs, 'homeAddress.city'));
  const stateProvince = str(getAttr(attrs, 'homeAddress.stateProvince'));
  const postalCode = str(getAttr(attrs, 'homeAddress.postalCode'));
  const country = str(getAttr(attrs, 'homeAddress.country'));

  const mobile =
    str(getAttr(attrs, 'mobilePhone.number') || getAttr(attrs, 'phoneNumber')) || AGENTIC_MOBILE;

  const loyaltyId =
    str(getAttr(attrs, 'loyalty.loyaltyId') || getAttr(attrs, 'loyaltyDetails.loyaltyId')) || null;

  const testProfile = bool(getAttr(attrs, 'testProfile'), true);

  const rowByCol = {
    CRMID: crmId,
    ECID: ecid,
    EMAIL: email,
    EMAILIDSHA256: sha256Email(email),
    GAID: null,
    LOYALTYID: loyaltyId || null,
    PASSPORTID: null,
    PHONENUMBER: mobile,
    PUSHTOKENS: null,
    STACKCHATID: null,
    FIRSTNAME: firstName || null,
    LASTNAME: lastName || null,
    BIRTHDATE: birth.birthDate,
    GENDER: gender,
    HOMEADDRESS_STREET1: street || null,
    HOMEADDRESS_CITY: city || null,
    HOMEADDRESS_STATEPROVINCE: stateProvince || null,
    HOMEADDRESS_POSTALCODE: postalCode || null,
    HOMEADDRESS_COUNTRY: country || null,
    PERSONALEMAIL_ADDRESS: email,
    PERSONALEMAIL_LABEL: 'Personal',
    PERSONALEMAIL_PRIMARY: true,
    PERSONALEMAIL_STATUS: 'Active',
    PERSONALEMAIL_STATUSREASON: 'Verified',
    PERSONALEMAIL_TYPE: 'Personal',
    MOBILEPHONE_NUMBER: mobile,
    MOBILEPHONE_STATUS: 'Active',
    MOBILEPHONE_PRIMARY: true,
    TESTPROFILE: testProfile,
    _RECORDCREATEDTIMESTAMP: runStamp,
    _RECORDUPDATEDTIMESTAMP: runStamp,
    PERSON_NAME_COURTESYTITLE: courtesyTitle || null,
    PERSON_NAME_SUFFIX: suffix,
    PERSON_NAME_FULLNAME: fullName,
    PERSON_BIRTHDAY: birth.birthDay,
    PERSON_BIRTHMONTH: birth.birthMonth,
    PERSON_BIRTHYEAR: birth.birthYear,
    PERSON_BIRTHDAYANDMONTH: birth.birthDayMonth,
  };

  const row = COLUMNS.map((col) => (Object.prototype.hasOwnProperty.call(rowByCol, col) ? rowByCol[col] : null));
  return { row, rowObject: rowByCol, columns: COLUMNS.slice() };
}

/**
 * Map AEP persona attributes → AGENTIC_TRAVEL_PROFILE_CUSTOMER row (39 columns).
 * Travel-specific fields use sensible defaults when absent from AEP UPS.
 *
 * @param {object} input — same shape as mapAepAttributesToBaseProfileRow
 */
function mapAepAttributesToTravelProfileRow(input) {
  const base = mapAepAttributesToBaseProfileRow(input);
  const attrs = input.attributes && typeof input.attributes === 'object' ? input.attributes : {};

  const nationality =
    str(getAttr(attrs, 'person.nationality') || getAttr(attrs, 'nationality')) || 'GB';
  const mobile = base.rowObject.MOBILEPHONE_NUMBER || base.rowObject.PHONENUMBER;

  const rowByCol = {
    CRMID: base.rowObject.CRMID,
    ECID: base.rowObject.ECID,
    EMAIL: base.rowObject.EMAIL,
    EMAILIDSHA256: base.rowObject.EMAILIDSHA256,
    GAID: base.rowObject.GAID,
    LOYALTYID: base.rowObject.LOYALTYID,
    PASSPORTID: base.rowObject.PASSPORTID,
    PHONENUMBER: mobile,
    PUSHTOKENS: base.rowObject.PUSHTOKENS,
    STACKCHATID: base.rowObject.STACKCHATID,
    FIRSTNAME: base.rowObject.FIRSTNAME,
    LASTNAME: base.rowObject.LASTNAME,
    DATEOFBIRTH: base.rowObject.BIRTHDATE,
    GENDER: base.rowObject.GENDER,
    NATIONALITY: nationality,
    PRIMARYEMAIL: base.rowObject.EMAIL,
    PRIMARYPHONE: mobile,
    ADDRESSSTREET: base.rowObject.HOMEADDRESS_STREET1,
    ADDRESSCITY: base.rowObject.HOMEADDRESS_CITY,
    ADDRESSPOSTALCODE: base.rowObject.HOMEADDRESS_POSTALCODE,
    ADDRESSCOUNTRY: base.rowObject.HOMEADDRESS_COUNTRY,
    LASTHOLIDAYDATE: null,
    LASTHOLIDAYDESTINATION: null,
    UPCOMINGHOLIDAYDATE: null,
    UPCOMINGHOLIDAYDESTINATION: null,
    TOTALFLIGHTSTAKEN: 0,
    TOTALDISTANCEFLOWN: 0,
    FAVORITEDESTINATIONS: null,
    PREFERREDCABINCLASS: null,
    PREFERREDSEATTYPE: null,
    MEALPREFERENCE: null,
    SPECIALASSISTANCE: null,
    LIFETIMEVALUE: 0,
    AVERAGEBOOKINGVALUE: 0,
    TOTALBOOKINGS: 0,
    CUSTOMERSEGMENT: 'bronze',
    TESTPROFILE: base.rowObject.TESTPROFILE,
    _RECORDCREATEDTIMESTAMP: base.rowObject._RECORDCREATEDTIMESTAMP,
    _RECORDUPDATEDTIMESTAMP: base.rowObject._RECORDUPDATEDTIMESTAMP,
  };

  const row = TRAVEL_COLUMNS.map((col) => (Object.prototype.hasOwnProperty.call(rowByCol, col) ? rowByCol[col] : null));
  return { row, rowObject: rowByCol, columns: TRAVEL_COLUMNS.slice() };
}

module.exports = {
  AGENTIC_MOBILE,
  formatSnowflakeRecordTimestamp,
  mapAepAttributesToBaseProfileRow,
  mapAepAttributesToTravelProfileRow,
  getAttr,
};
