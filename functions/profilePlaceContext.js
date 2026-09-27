'use strict';

/**
 * Server-side validation for `_<tenant>.profilePlaceContext.*` (field group
 * "AEP Lab - Profile Place Context v1", see genericProfileInfraService.js).
 *
 * Explicit rejection, no silent coercion: the DCS HTTP API accepts a record
 * and only fails it asynchronously at ingestion, so bad leaves must 400 here.
 * The geohash is always derived from latitude/longitude so it can never drift.
 */

const PLACE_CONTEXT_LEAVES = Object.freeze([
  'latitude',
  'longitude',
  'geohash',
  'accuracyMeters',
  'neighborhood',
  'city',
  'regionCode',
  'countryCode',
  'lastSeenAt',
  'source',
]);

const PLACE_CONTEXT_SOURCES = ['ui-sample', 'ui-manual', 'profile-update', 'mcp-persona', 'mcp-seed', 'import'];

const GEOHASH_PRECISION = 7;
const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
const GEOHASH_RE = /^[0-9b-hjkmnp-z]{7}$/;
const REGION_CODE_RE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_TEXT_LENGTH = 100;
const MAX_ACCURACY_METERS = 100000;

function encodeGeohash(latitude, longitude, precision = GEOHASH_PRECISION) {
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError('encodeGeohash: latitude must be a finite number in [-90, 90]');
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError('encodeGeohash: longitude must be a finite number in [-180, 180]');
  }
  let latLo = -90;
  let latHi = 90;
  let lonLo = -180;
  let lonHi = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lonLo + lonHi) / 2;
      if (longitude >= mid) {
        ch = (ch << 1) | 1;
        lonLo = mid;
      } else {
        ch <<= 1;
        lonHi = mid;
      }
    } else {
      const mid = (latLo + latHi) / 2;
      if (latitude >= mid) {
        ch = (ch << 1) | 1;
        latLo = mid;
      } else {
        ch <<= 1;
        latHi = mid;
      }
    }
    even = !even;
    bit += 1;
    if (bit === 5) {
      hash += GEOHASH_ALPHABET[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

function fail(leaf, message) {
  return { ok: false, leaf, error: `profilePlaceContext.${leaf}: ${message}` };
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * @param {unknown} input - the object merged at `_<tenant>.profilePlaceContext`
 * @param {{ now?: Date, defaultSource?: string }} [opts]
 * @returns {{ ok: true, value: object } | { ok: false, leaf: string, error: string }}
 */
function normalizeProfilePlaceContext(input, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const defaultSource = opts.defaultSource || 'profile-update';
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('(object)', 'must be an object of place-context leaves');
  }
  const value = {};
  for (const [leaf, raw] of Object.entries(input)) {
    if (!PLACE_CONTEXT_LEAVES.includes(leaf)) {
      return fail(leaf, `unknown leaf; allowed: ${PLACE_CONTEXT_LEAVES.join(', ')}`);
    }
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      return fail(leaf, 'must not be empty; omit the field instead');
    }
    switch (leaf) {
      case 'latitude':
        if (!isFiniteNumber(raw) || raw < -90 || raw > 90) return fail(leaf, 'must be a number in [-90, 90]');
        value.latitude = raw;
        break;
      case 'longitude':
        if (!isFiniteNumber(raw) || raw < -180 || raw > 180) return fail(leaf, 'must be a number in [-180, 180]');
        value.longitude = raw;
        break;
      case 'accuracyMeters':
        if (!Number.isInteger(raw) || raw < 0 || raw > MAX_ACCURACY_METERS) {
          return fail(leaf, `must be an integer in [0, ${MAX_ACCURACY_METERS}]`);
        }
        value.accuracyMeters = raw;
        break;
      case 'neighborhood':
      case 'city': {
        if (typeof raw !== 'string') return fail(leaf, 'must be a string');
        const s = raw.trim();
        if (s.length > MAX_TEXT_LENGTH) return fail(leaf, `must be at most ${MAX_TEXT_LENGTH} characters`);
        value[leaf] = s;
        break;
      }
      case 'geohash':
        if (typeof raw !== 'string' || !GEOHASH_RE.test(raw)) return fail(leaf, 'must be a precision-7 geohash');
        value.geohash = raw;
        break;
      case 'regionCode':
        if (typeof raw !== 'string' || !REGION_CODE_RE.test(raw)) {
          return fail(leaf, 'must be an ISO 3166-2 code such as SA-01 (uppercase)');
        }
        value.regionCode = raw;
        break;
      case 'countryCode':
        if (typeof raw !== 'string' || !COUNTRY_CODE_RE.test(raw)) {
          return fail(leaf, 'must be an ISO 3166-1 alpha-2 code such as SA (uppercase)');
        }
        value.countryCode = raw;
        break;
      case 'lastSeenAt':
        if (typeof raw !== 'string' || !ISO_DATE_TIME_RE.test(raw) || !Number.isFinite(Date.parse(raw))) {
          return fail(leaf, 'must be an ISO 8601 date-time with a timezone, e.g. 2026-07-10T08:15:00Z');
        }
        value.lastSeenAt = raw;
        break;
      case 'source':
        if (!PLACE_CONTEXT_SOURCES.includes(raw)) {
          return fail(leaf, `must be one of ${PLACE_CONTEXT_SOURCES.join(', ')}`);
        }
        value.source = raw;
        break;
      default:
        return fail(leaf, 'unsupported leaf');
    }
  }

  const hasLat = value.latitude !== undefined;
  const hasLon = value.longitude !== undefined;
  if (hasLat !== hasLon) {
    return fail(hasLat ? 'longitude' : 'latitude', 'latitude and longitude must be sent together');
  }
  if (hasLat) {
    const derived = encodeGeohash(value.latitude, value.longitude, GEOHASH_PRECISION);
    if (value.geohash !== undefined && value.geohash !== derived) {
      return fail('geohash', `does not match latitude/longitude (expected ${derived}); omit it to derive server-side`);
    }
    value.geohash = derived;
    if (value.lastSeenAt === undefined) value.lastSeenAt = now.toISOString();
  }
  if (value.regionCode !== undefined && value.countryCode !== undefined
    && !value.regionCode.startsWith(`${value.countryCode}-`)) {
    return fail('regionCode', `must belong to countryCode ${value.countryCode}`);
  }
  if (value.source === undefined) value.source = defaultSource;
  return { ok: true, value };
}

module.exports = {
  PLACE_CONTEXT_LEAVES,
  PLACE_CONTEXT_SOURCES,
  GEOHASH_PRECISION,
  encodeGeohash,
  normalizeProfilePlaceContext,
};
