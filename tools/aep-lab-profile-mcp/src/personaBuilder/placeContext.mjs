/**
 * Persona place context — the person's last-known place at
 * `_<tenant>.profilePlaceContext.*` (field group "AEP Lab - Profile Place
 * Context v1", Generic Profile schema only; dual-stream generate routes it to
 * the generic step). Sampling comes from the shared global place catalog
 * (src/placeCatalog, a byte-identical copy of web/profile-viewer/place-catalog.js):
 * ten featured areas plus 6,000+ cities worldwide. test/profilePlaceContext.test.mjs
 * guards drift against the web generator.
 * No geohash: /api/profile/generate derives it from latitude/longitude.
 */
import { FEATURED_AREAS, FEATURED_AREA_KEYS, PLACE_MODES, samplePlace } from '../placeCatalog/index.mjs';

const SAMPLE_MAX_AGE_MS = 6 * 3600 * 1000;
const PLACE_LEAVES = ['latitude', 'longitude', 'accuracyMeters', 'neighborhood', 'city', 'regionCode', 'countryCode'];

/** Featured areas in the historical preset shape (no centre) — equals web PRESETS. */
export const PLACE_PRESETS = Object.freeze(Object.fromEntries(FEATURED_AREA_KEYS.map((key) => {
  const { label, city, regionCode, countryCode, neighborhoods } = FEATURED_AREAS[key];
  return [key, Object.freeze({ label, city, regionCode, countryCode, neighborhoods })];
})));

export { PLACE_MODES };

export const PLACE_ATTRIBUTE_PREFIX = 'profilePlaceContext.';

/**
 * Normalise preset/mode/area inputs into a samplePlace request.
 * preset: a featured key, 'random' (any featured area) or 'global' (anywhere on Earth).
 * mode: 'featured' | 'global' | 'area' (area = featured key or any catalog city name).
 * @param {{ preset?: string, mode?: string, area?: string }} opts
 * @returns {{ mode: string, area?: string }}
 */
export function resolvePlaceRequest(opts = {}) {
  if (opts.mode) {
    const mode = String(opts.mode);
    if (!PLACE_MODES.includes(mode)) {
      throw new Error(`Unknown place mode "${mode}". Use one of: ${PLACE_MODES.join(', ')}.`);
    }
    return opts.area ? { mode, area: String(opts.area) } : { mode };
  }
  if (opts.area) return { mode: 'area', area: String(opts.area) };
  const preset = opts.preset || 'random';
  if (preset === 'global') return { mode: 'global' };
  if (preset !== 'random' && !PLACE_PRESETS[preset]) throw new Error(`Unknown place preset "${preset}"`);
  return { mode: 'featured', area: preset };
}

/**
 * @param {{ preset?: string, mode?: string, area?: string, place?: Record<string, unknown>, source?: string, rng?: () => number, now?: Date }} [opts]
 *   place: a pre-planned place (e.g. from planClusteredPlaces) — only lastSeenAt/source are added.
 * @returns {Record<string, string | number>} tenant-relative dotted place attributes
 */
export function buildPlaceContextPersonaAttributes(opts = {}) {
  const rng = opts.rng || Math.random;
  const now = opts.now || new Date();
  const place = opts.place || samplePlace({ ...resolvePlaceRequest(opts), rng });
  const seenAt = new Date(now.getTime() - Math.floor(rng() * SAMPLE_MAX_AGE_MS));
  seenAt.setUTCMilliseconds(0);
  /** @type {Record<string, string | number>} */
  const out = {};
  for (const leaf of PLACE_LEAVES) {
    if (place[leaf] !== undefined && place[leaf] !== null && place[leaf] !== '') {
      out[`${PLACE_ATTRIBUTE_PREFIX}${leaf}`] = /** @type {string | number} */ (place[leaf]);
    }
  }
  out['profilePlaceContext.lastSeenAt'] = seenAt.toISOString().replace('.000Z', 'Z');
  out['profilePlaceContext.source'] = opts.source || 'mcp-persona';
  return out;
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
