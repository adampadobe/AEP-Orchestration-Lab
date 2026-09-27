/**
 * Persona place context — the person's last-known place at
 * `_<tenant>.profilePlaceContext.*` (field group "AEP Lab - Profile Place
 * Context v1", Generic Profile schema only; dual-stream generate routes it to
 * the generic step). Port of web/profile-viewer/profile-place-context.js
 * `generateSample`; test/profilePlaceContext.test.mjs guards preset drift.
 * No geohash: /api/profile/generate derives it from latitude/longitude.
 */

const SAMPLE_MAX_AGE_MS = 6 * 3600 * 1000;
const ACCURACY_MIN = 25;
const ACCURACY_MAX = 300;
const EARTH_RADIUS_M = 6371008.8;

export const PLACE_PRESETS = {
  riyadh: {
    label: 'Riyadh, Saudi Arabia',
    city: 'Riyadh',
    regionCode: 'SA-01',
    countryCode: 'SA',
    neighborhoods: [
      { name: 'Al Nakheel', lat: 24.7743, lon: 46.6384 },
      { name: 'Al Olaya', lat: 24.6958, lon: 46.685 },
      { name: 'Al Malqa', lat: 24.812, lon: 46.612 },
      { name: 'Al Yasmin', lat: 24.825, lon: 46.64 },
      { name: 'Al Murabba', lat: 24.644, lon: 46.711 },
    ],
  },
  dubai: {
    label: 'Dubai, UAE',
    city: 'Dubai',
    regionCode: 'AE-DU',
    countryCode: 'AE',
    neighborhoods: [
      { name: 'Downtown Dubai', lat: 25.1972, lon: 55.2744 },
      { name: 'Dubai Marina', lat: 25.0805, lon: 55.1403 },
      { name: 'Deira', lat: 25.2711, lon: 55.3075 },
      { name: 'Jumeirah', lat: 25.2048, lon: 55.2474 },
    ],
  },
  london: {
    label: 'London, United Kingdom',
    city: 'London',
    regionCode: 'GB-LND',
    countryCode: 'GB',
    neighborhoods: [
      { name: 'Shoreditch', lat: 51.5265, lon: -0.0786 },
      { name: 'Camden', lat: 51.539, lon: -0.1426 },
      { name: 'Canary Wharf', lat: 51.5054, lon: -0.0235 },
      { name: 'Kensington', lat: 51.4991, lon: -0.1938 },
    ],
  },
  newYork: {
    label: 'New York, United States',
    city: 'New York',
    regionCode: 'US-NY',
    countryCode: 'US',
    neighborhoods: [
      { name: 'Midtown Manhattan', lat: 40.7549, lon: -73.984 },
      { name: 'Williamsburg', lat: 40.7081, lon: -73.9571 },
      { name: 'SoHo', lat: 40.7233, lon: -74.003 },
      { name: 'Harlem', lat: 40.8116, lon: -73.9465 },
    ],
  },
};

export const PLACE_ATTRIBUTE_PREFIX = 'profilePlaceContext.';

function toRad(d) {
  return (d * Math.PI) / 180;
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function jitter(lat, lon, radiusM, rng) {
  const r = radiusM * Math.sqrt(rng());
  const theta = 2 * Math.PI * rng();
  const dLat = (r * Math.cos(theta)) / EARTH_RADIUS_M;
  const dLon = (r * Math.sin(theta)) / (EARTH_RADIUS_M * Math.cos(toRad(lat)));
  return { latitude: round6(lat + (dLat * 180) / Math.PI), longitude: round6(lon + (dLon * 180) / Math.PI) };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/**
 * @param {{ preset?: string, rng?: () => number, now?: Date }} [opts] - preset is a PLACE_PRESETS key or 'random' (default)
 * @returns {Record<string, string | number>} tenant-relative dotted place attributes
 */
export function buildPlaceContextPersonaAttributes(opts = {}) {
  const rng = opts.rng || Math.random;
  const now = opts.now || new Date();
  const presetKey = opts.preset || 'random';
  const key = presetKey === 'random' ? pick(Object.keys(PLACE_PRESETS), rng) : presetKey;
  const preset = PLACE_PRESETS[key];
  if (!preset) throw new Error(`Unknown place preset "${presetKey}"`);
  const hood = pick(preset.neighborhoods, rng);
  const accuracyMeters = ACCURACY_MIN + Math.floor(rng() * (ACCURACY_MAX - ACCURACY_MIN + 1));
  const pt = jitter(hood.lat, hood.lon, Math.max(0, accuracyMeters - 1), rng);
  const seenAt = new Date(now.getTime() - Math.floor(rng() * SAMPLE_MAX_AGE_MS));
  seenAt.setUTCMilliseconds(0);
  return {
    'profilePlaceContext.latitude': pt.latitude,
    'profilePlaceContext.longitude': pt.longitude,
    'profilePlaceContext.accuracyMeters': accuracyMeters,
    'profilePlaceContext.neighborhood': hood.name,
    'profilePlaceContext.city': preset.city,
    'profilePlaceContext.regionCode': preset.regionCode,
    'profilePlaceContext.countryCode': preset.countryCode,
    'profilePlaceContext.lastSeenAt': seenAt.toISOString().replace('.000Z', 'Z'),
    'profilePlaceContext.source': 'mcp-persona',
  };
}

/**
 * True when an attributes map carries any place context (dotted leaf, tenant-prefixed leaf, or nested object).
 * @param {Record<string, unknown>} attrs
 */
export function hasPlaceContextAttributes(attrs) {
  if (!attrs || typeof attrs !== 'object') return false;
  return Object.keys(attrs).some(isPlaceContextKey);
}

/** @param {string} key */
export function isPlaceContextKey(key) {
  const clean = String(key || '').replace(/^_[A-Za-z0-9]+\./, '');
  return clean === 'profilePlaceContext' || clean.startsWith(PLACE_ATTRIBUTE_PREFIX);
}
