'use strict';

/**
 * Server-side validation + XDM placement for event place context
 * (field group "AEP Lab - Event Place Context v1", see eventPlaceContextFieldGroup.js).
 *
 * Coordinates, city, country and region go to the standard Environment Details
 * block (placeContext.geo); the lab-only leaves go to `_<tenant>.eventPlaceContext`.
 * Explicit rejection, no silent coercion: Edge accepts the request and only drops
 * bad leaves at ingestion, so invalid input must 400 before sending.
 */

const { encodeGeohash, GEOHASH_PRECISION } = require('./profilePlaceContext');
const { EVENT_PLACE_CONTEXT_SOURCES } = require('./eventPlaceContextFieldGroup');

const EVENT_PLACE_LEAVES = Object.freeze([
  'latitude',
  'longitude',
  'geohash',
  'accuracyMeters',
  'neighborhood',
  'city',
  'regionCode',
  'countryCode',
  'storeId',
  'poiId',
  'source',
]);
const EVENT_PLACE_SOURCES = EVENT_PLACE_CONTEXT_SOURCES;
const GEOHASH_RE = /^[0-9b-hjkmnp-z]{7}$/;
const REGION_CODE_RE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const MAX_TEXT_LENGTH = 100;
const MAX_ID_LENGTH = 64;
const MAX_ACCURACY_METERS = 100000;

function fail(leaf, message) {
  return { ok: false, leaf, error: `eventPlace.${leaf}: ${message}` };
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * @param {unknown} input - `body.eventPlace`
 * @param {{ defaultSource?: string }} [opts]
 * @returns {{ ok: true, value: object } | { ok: false, leaf: string, error: string }}
 */
function normalizeEventPlace(input, opts = {}) {
  const defaultSource = opts.defaultSource || 'event-tool';
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('(object)', 'must be an object of place leaves');
  }
  const value = {};
  for (const [leaf, raw] of Object.entries(input)) {
    if (!EVENT_PLACE_LEAVES.includes(leaf)) {
      return fail(leaf, `unknown leaf; allowed: ${EVENT_PLACE_LEAVES.join(', ')}`);
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
      case 'storeId':
      case 'poiId': {
        if (typeof raw !== 'string') return fail(leaf, 'must be a string');
        const s = raw.trim();
        if (s.length > MAX_ID_LENGTH) return fail(leaf, `must be at most ${MAX_ID_LENGTH} characters`);
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
      case 'source':
        if (!EVENT_PLACE_SOURCES.includes(raw)) return fail(leaf, `must be one of ${EVENT_PLACE_SOURCES.join(', ')}`);
        value.source = raw;
        break;
      default:
        return fail(leaf, 'unsupported leaf');
    }
  }

  if (value.latitude === undefined) return fail('latitude', 'is required (with longitude)');
  if (value.longitude === undefined) return fail('longitude', 'is required (with latitude)');
  const derived = encodeGeohash(value.latitude, value.longitude, GEOHASH_PRECISION);
  if (value.geohash !== undefined && value.geohash !== derived) {
    return fail('geohash', `does not match latitude/longitude (expected ${derived}); omit it to derive server-side`);
  }
  value.geohash = derived;
  if (value.regionCode !== undefined && value.countryCode !== undefined
    && !value.regionCode.startsWith(`${value.countryCode}-`)) {
    return fail('regionCode', `must belong to countryCode ${value.countryCode}`);
  }
  if (value.source === undefined) value.source = defaultSource;
  return { ok: true, value };
}

function plainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * Merge a normalized place (from normalizeEventPlace) into an Edge/XDM event in place.
 * @param {Record<string, any>} xdm
 * @param {Record<string, any>} place
 * @param {string} tenantKey - e.g. `_demoemea`
 */
function applyEventPlaceToXdm(xdm, place, tenantKey) {
  const geo = { _schema: { latitude: place.latitude, longitude: place.longitude } };
  if (place.city !== undefined) geo.city = place.city;
  if (place.countryCode !== undefined) geo.countryCode = place.countryCode;
  if (place.regionCode !== undefined) geo.stateProvince = place.regionCode;

  const placeContext = plainObject(xdm.placeContext);
  placeContext.geo = { ...plainObject(placeContext.geo), ...geo };
  if (place.poiId !== undefined) {
    const poi = plainObject(placeContext.POIinteraction);
    poi.poiDetail = { ...plainObject(poi.poiDetail), poiID: place.poiId };
    placeContext.POIinteraction = poi;
  }
  xdm.placeContext = placeContext;

  const supplement = { geohash: place.geohash };
  for (const leaf of ['accuracyMeters', 'neighborhood', 'regionCode', 'storeId', 'poiId', 'source']) {
    if (place[leaf] !== undefined) supplement[leaf] = place[leaf];
  }
  xdm[tenantKey] = { ...plainObject(xdm[tenantKey]), eventPlaceContext: supplement };
  const alias = tenantKey.startsWith('_') ? tenantKey.slice(1) : '';
  if (alias && xdm[alias] && typeof xdm[alias] === 'object') {
    xdm[alias] = { ...xdm[alias], eventPlaceContext: { ...supplement } };
  }
  return xdm;
}

module.exports = {
  EVENT_PLACE_LEAVES,
  EVENT_PLACE_SOURCES,
  normalizeEventPlace,
  applyEventPlaceToXdm,
};
