/**
 * Shared place-context parameters for profile and event generation tools.
 * place_mode: featured (ten common areas) | global (anywhere on Earth) | area
 * (a featured area or any of 6,000+ catalog cities). Batches cluster places so
 * each cluster has >= k (10) profiles in one hotspot cell and stays visible on
 * the k-anonymous hotspot map.
 */
import * as z from 'zod';
import {
  DEFAULT_CLUSTER_SIZE,
  DEFAULT_K,
  FEATURED_AREA_KEYS,
  PLACE_MODES,
  planClusteredPlaces,
  resolveArea,
  samplePlace,
} from '../placeCatalog/index.mjs';

export const PLACE_PARAM_DESCRIPTIONS = Object.freeze({
  place_mode:
    `Place context mode: featured (default; random pick from the ten common areas ${FEATURED_AREA_KEYS.join(', ')}), ` +
    'global (a real city anywhere on Earth, weighted by population), or area (use place_area).',
  place_area:
    'Featured area key/name (e.g. riyadh, tokyo, "São Paulo") or any catalog city ("Nairobi", "Portland, US"). ' +
    'Implies place_mode area when place_mode is omitted.',
});

export const placeModeSchema = z.enum(/** @type {[string, ...string[]]} */ (PLACE_MODES));

export function placeInputSchema() {
  return {
    place_mode: placeModeSchema.optional().describe(PLACE_PARAM_DESCRIPTIONS.place_mode),
    place_area: z.string().max(120).optional().describe(PLACE_PARAM_DESCRIPTIONS.place_area),
  };
}

export function batchPlaceInputSchema() {
  return {
    ...placeInputSchema(),
    place_clustering: z
      .boolean()
      .optional()
      .describe(
        `When true (default for count >= ${DEFAULT_K}), group profiles into clusters of cluster_size that share one point, ` +
          `so every cluster clears the k=${DEFAULT_K} hotspot suppression and the map shows it. false = independent random places.`,
      ),
    cluster_size: z
      .number()
      .int()
      .min(DEFAULT_K)
      .max(100)
      .optional()
      .describe(`Profiles per place cluster (default ${DEFAULT_CLUSTER_SIZE}, minimum k=${DEFAULT_K}).`),
  };
}

/**
 * @param {{ place_mode?: string, place_area?: string }} params
 * @returns {{ ok: true, place_mode?: string, place_area?: string, resolved?: object | null } | { ok: false, error: string }}
 */
export function validatePlaceParams(params = {}) {
  const mode = params.place_mode;
  const area = typeof params.place_area === 'string' ? params.place_area.trim() : '';
  if (mode && !PLACE_MODES.includes(mode)) {
    return { ok: false, error: `Unknown place_mode "${mode}". Use one of: ${PLACE_MODES.join(', ')}.` };
  }
  if (mode === 'area' && !area) return { ok: false, error: 'place_area is required when place_mode is "area".' };
  if (mode === 'global' && area) {
    return { ok: false, error: 'place_area cannot be combined with place_mode "global"; use place_mode "area".' };
  }
  if (!area) return { ok: true, place_mode: mode || undefined };
  const resolved = resolveArea(area);
  if (!resolved) {
    return {
      ok: false,
      error: `Unknown place_area "${area}". Use a featured area (${FEATURED_AREA_KEYS.join(', ')}) or a city name, optionally with ", CC".`,
    };
  }
  if (mode === 'featured' && resolved.kind !== 'featured') {
    return { ok: false, error: `place_area "${area}" is not a featured area; use place_mode "area" for other cities.` };
  }
  return { ok: true, place_mode: mode || 'area', place_area: area, resolved };
}

/** True when the caller asked for specific place behaviour. */
export function hasPlaceParams(params = {}) {
  return Boolean(params.place_mode || (typeof params.place_area === 'string' && params.place_area.trim()));
}

/**
 * Plan clustered places for a batch (null when clustering is off or count < k with clustering unrequested).
 * @param {{ count: number, place_mode?: string, place_area?: string, place_clustering?: boolean, cluster_size?: number, rng?: () => number }} opts
 */
export function planBatchPlaces(opts) {
  const count = Number(opts.count);
  const clustering = opts.place_clustering ?? count >= DEFAULT_K;
  if (!clustering) return null;
  return planClusteredPlaces({
    count,
    k: DEFAULT_K,
    clusterSize: opts.cluster_size ?? DEFAULT_CLUSTER_SIZE,
    mode: opts.place_mode || (opts.place_area ? 'area' : 'featured'),
    area: opts.place_area || undefined,
    rng: opts.rng,
  });
}

/** Compact, response-safe cluster summary (no per-profile rows). */
export function summarizePlacePlan(plan) {
  if (!plan) return null;
  return {
    k: plan.k,
    cluster_size: plan.clusterSize,
    cluster_count: plan.clusters.length,
    clusters: plan.clusters.map((c) => ({
      id: c.id,
      size: c.size,
      latitude: c.latitude,
      longitude: c.longitude,
      city: c.city,
      countryCode: c.countryCode,
      ...(c.regionCode ? { regionCode: c.regionCode } : {}),
      ...(c.neighborhood ? { neighborhood: c.neighborhood } : {}),
    })),
    warnings: plan.warnings,
    hotspot_hint:
      'Each cluster shares one point, so lab_audience_geo_hotspots (radius covering the cluster, any cell_km) ' +
      `returns it once >= k=${plan.k} profiles have landed in the place mirror.`,
  };
}

/** Pre-planned place for 1-based batch item index, or undefined. */
export function plannedPlaceForIndex(placePlan, index) {
  const places = placePlan && Array.isArray(placePlan.places) ? placePlan.places : null;
  return places ? places[index - 1] : undefined;
}

/** Place context leaves from dotted persona attributes, for tool responses. */
export function summarizePlaceAttributes(attrs) {
  if (!attrs || typeof attrs !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(attrs)) {
    const m = /(?:^|\.)profilePlaceContext\.([A-Za-z]+)$/.exec(key);
    if (m && value !== undefined && value !== null && value !== '') out[m[1]] = value;
  }
  const nested = attrs.profilePlaceContext;
  if (nested && typeof nested === 'object') Object.assign(out, nested);
  return Object.keys(out).length ? out : null;
}

/** Leaves accepted by /api/events/generator body.eventPlace (geohash is derived server-side). */
export const EVENT_PLACE_INPUT_LEAVES = Object.freeze([
  'latitude',
  'longitude',
  'accuracyMeters',
  'neighborhood',
  'city',
  'regionCode',
  'countryCode',
  'storeId',
  'poiId',
  'source',
]);
export const EVENT_PLACE_SOURCES = Object.freeze([
  'ui-sample',
  'event-tool',
  'mcp-seed',
  'store-poi',
  'device-gps',
  'edge-ip',
  'import',
]);
const DEFAULT_EVENT_PLACE_SOURCE = 'event-tool';
const COUNTRY_RE = /^[A-Z]{2}$/;
const REGION_RE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

export const EVENT_PLACE_DESCRIPTION =
  'Optional explicit event place {latitude, longitude, city?, countryCode?, regionCode?, neighborhood?, accuracyMeters?, storeId?, poiId?, source?}. ' +
  'Sent as body.eventPlace (placeContext.geo + _tenant.eventPlaceContext; geohash derived server-side). ' +
  'Mutually exclusive with place_mode/place_area, which sample a place for you.';

export function eventPlaceInputSchema() {
  return {
    ...placeInputSchema(),
    event_place: z.record(z.unknown()).optional().describe(EVENT_PLACE_DESCRIPTION),
  };
}

function eventPlaceError(message) {
  return { ok: false, error: `event_place: ${message}` };
}

function validateExplicitEventPlace(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return eventPlaceError('must be an object.');
  const value = {};
  for (const [leaf, raw] of Object.entries(input)) {
    if (!EVENT_PLACE_INPUT_LEAVES.includes(leaf)) {
      return eventPlaceError(`unknown leaf "${leaf}"; allowed: ${EVENT_PLACE_INPUT_LEAVES.join(', ')}.`);
    }
    if (raw === undefined || raw === null || raw === '') continue;
    value[leaf] = typeof raw === 'string' ? raw.trim() : raw;
  }
  const { latitude, longitude } = value;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return eventPlaceError('latitude is required and must be a number in [-90, 90].');
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return eventPlaceError('longitude is required and must be a number in [-180, 180].');
  }
  if (value.countryCode !== undefined && !COUNTRY_RE.test(String(value.countryCode))) {
    return eventPlaceError('countryCode must be ISO 3166-1 alpha-2 uppercase (e.g. SA).');
  }
  if (value.regionCode !== undefined && !REGION_RE.test(String(value.regionCode))) {
    return eventPlaceError('regionCode must be ISO 3166-2 uppercase (e.g. SA-01).');
  }
  if (value.source !== undefined && !EVENT_PLACE_SOURCES.includes(value.source)) {
    return eventPlaceError(`source must be one of ${EVENT_PLACE_SOURCES.join(', ')}.`);
  }
  if (value.source === undefined) value.source = DEFAULT_EVENT_PLACE_SOURCE;
  return { ok: true, value };
}

/**
 * Resolve event place params into a body.eventPlace object (or null when none requested).
 * @param {{ place_mode?: string, place_area?: string, event_place?: Record<string, unknown> }} params
 * @param {{ rng?: () => number, source?: string }} [opts]
 * @returns {{ ok: true, value: Record<string, unknown> | null } | { ok: false, error: string }}
 */
export function resolveEventPlace(params = {}, opts = {}) {
  const explicit = params.event_place;
  const hasExplicit = explicit !== undefined && explicit !== null;
  if (hasExplicit && hasPlaceParams(params)) {
    return eventPlaceError('pass either event_place or place_mode/place_area, not both.');
  }
  if (hasExplicit) return validateExplicitEventPlace(explicit);
  if (!hasPlaceParams(params)) return { ok: true, value: null };
  const v = validatePlaceParams(params);
  if (!v.ok) return v;
  const sampled = samplePlace({
    mode: v.place_mode || 'featured',
    area: v.place_area,
    rng: opts.rng,
  });
  const value = {};
  for (const leaf of EVENT_PLACE_INPUT_LEAVES) {
    if (sampled[leaf] !== undefined && sampled[leaf] !== null && sampled[leaf] !== '') value[leaf] = sampled[leaf];
  }
  value.source = opts.source || DEFAULT_EVENT_PLACE_SOURCE;
  return { ok: true, value };
}
