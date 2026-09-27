'use strict';

const QUERY_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/query';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';
const EARTH_RADIUS_KM = 6371.0088;
const MAX_WAIT_MS = 100_000;
const POLL_INTERVAL_MS = 1500;
const K_THRESHOLD = 10;

// The live event schema carries no location fields and Query Service REST cannot return
// ad-hoc results to Cloud Run, so the query-service path cannot succeed today. Until the
// profile place-context mirror ships, the default data path reports that state explicitly
// instead of spending ~100 s on a query that is certain to fail.
const GEO_HOTSPOTS_DATA_PATHS = Object.freeze(['unavailable', 'query-service']);
const DEFAULT_GEO_HOTSPOTS_DATA_PATH = 'unavailable';
const GEO_DATA_UNAVAILABLE_REASON = 'geo_data_path_not_available';

function resolveGeoHotspotsDataPath(value) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (!normalized) return DEFAULT_GEO_HOTSPOTS_DATA_PATH;
  if (!GEO_HOTSPOTS_DATA_PATHS.includes(normalized)) {
    throw new Error(
      `GEO_HOTSPOTS_DATA_PATH must be one of ${GEO_HOTSPOTS_DATA_PATHS.join(', ')}; received "${normalized}".`,
    );
  }
  return normalized;
}

function buildGeoHotspotsHttpBody(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (result?.dataStatus === 'unavailable') {
    return { ok: true, rows: [], data_status: 'unavailable', reason: result.reason || GEO_DATA_UNAVAILABLE_REASON };
  }
  if (result?.dataStatus === 'available') {
    return { ok: true, rows, data_status: 'available' };
  }
  throw new Error(`Unknown geo-hotspot data status "${result?.dataStatus}".`);
}

// Query Service exposes datasets as lowercase snake_case tables, never by their display name.
function normalizeDatasetTableName(value) {
  const name = String(value || '').trim();
  if (!name || name.includes('\0')) throw new Error('The configured retail event dataset name is invalid.');
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) throw new Error('The configured retail event dataset name is invalid.');
  return normalized;
}

function quoteTableName(value) {
  return normalizeDatasetTableName(value);
}

function round(value, precision) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

// AEP Query Service substitutes `$name` parameters as raw text rather than as quoted
// literals, so an ISO timestamp arrived unquoted ("no viable alternative at input") and a
// string parameter could never have been trusted to stay inside its quotes. Every value is
// therefore quoted and inlined here: strings via stringLiteral (quotes and backslashes
// refused) and numerics via numericLiteral (non-finite input refused).
//
// Query Service runs Spark SQL, where a backslash escapes a quote character, so doubling
// the quote alone is not a safe guarantee. `interest` is first held to a strict allowlist
// that excludes quotes, backslashes, LIKE wildcards and control characters.
const INTEREST_PATTERN = /^[\p{L}\p{N} &,.\-]{1,64}$/u;

function assertSafeInterest(value) {
  const text = String(value == null ? '' : value).trim();
  if (!INTEREST_PATTERN.test(text)) {
    throw new Error(
      'The interest value must be 1-64 characters of letters, numbers, spaces or & , . - only.',
    );
  }
  return text;
}

function stringLiteral(value, label) {
  const text = String(value);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(`The ${label} value must not contain control characters.`);
  }
  if (text.includes("'") || text.includes('\\')) {
    throw new Error(`The ${label} value must not contain quote or backslash characters.`);
  }
  return `'${text}'`;
}

function timestampLiteral(epochMs, label) {
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) throw new Error(`The ${label} value must be a valid timestamp.`);
  return `TIMESTAMP ${stringLiteral(date.toISOString().slice(0, 19).replace('T', ' '), label)}`;
}

function numericLiteral(value, label) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (typeof value === 'boolean' || value === null || value === '' || !Number.isFinite(parsed)) {
    throw new Error(`The ${label} value must be a finite numeric input.`);
  }
  return String(parsed);
}

function buildGeoHotspotsQuery({
  datasetName,
  center,
  radiusKm,
  windowHours,
  interest,
  cellKm,
  now = Date.now,
}) {
  const centerLatSql = numericLiteral(center && center.lat, 'center latitude');
  const centerLonSql = numericLiteral(center && center.lon, 'center longitude');
  const radiusKmSql = numericLiteral(radiusKm, 'radius_km');
  const cellKmNumber = Number(numericLiteral(cellKm, 'cell_km'));
  const cellLatStep = round(cellKmNumber / 111.045, 6);
  const cellLonStep = round(
    cellKmNumber / (111.045 * Math.max(Math.abs(Math.cos((Number(centerLatSql) * Math.PI) / 180)), 0.01)),
    6,
  );
  const cellLatStepSql = numericLiteral(cellLatStep, 'cell latitude step');
  const cellLonStepSql = numericLiteral(cellLonStep, 'cell longitude step');
  const kThresholdSql = numericLiteral(K_THRESHOLD, 'k threshold');
  const timestampNow = now();
  const windowHoursNumber = Number(numericLiteral(windowHours, 'window_hours'));
  const windowStartSql = timestampLiteral(timestampNow - windowHoursNumber * 60 * 60 * 1000, 'window start');
  const windowEndSql = timestampLiteral(timestampNow, 'window end');
  const interestPatternSql = stringLiteral(`%${assertSafeInterest(interest)}%`, 'interest');
  const table = quoteTableName(datasetName);
  const sql = `
WITH filtered_events AS (
  SELECT
    identityMap['ECID'][0].id AS profile_id,
    timestamp AS event_timestamp,
    _id AS event_id,
    placeContext.geo._schema.latitude AS latitude,
    placeContext.geo._schema.longitude AS longitude,
    ROUND(placeContext.geo._schema.latitude / ${cellLatStepSql}) * ${cellLatStepSql} AS grid_lat,
    ROUND(placeContext.geo._schema.longitude / ${cellLonStepSql}) * ${cellLonStepSql} AS grid_lon
  FROM ${table}
  WHERE timestamp >= ${windowStartSql}
    AND timestamp <= ${windowEndSql}
    AND eventType = 'commerce.productViews'
    AND (
      LOWER(_demoemea.public.retail.productName) LIKE LOWER(${interestPatternSql})
      OR LOWER(_demoemea.public.retail.productCategory) LIKE LOWER(${interestPatternSql})
    )
    AND identityMap['ECID'][0].id IS NOT NULL
    AND placeContext.geo._schema.latitude IS NOT NULL
    AND placeContext.geo._schema.longitude IS NOT NULL
    AND 2 * ${EARTH_RADIUS_KM} * ASIN(SQRT(
      POWER(SIN(RADIANS(placeContext.geo._schema.latitude - ${centerLatSql}) / 2), 2)
      + COS(RADIANS(${centerLatSql})) * COS(RADIANS(placeContext.geo._schema.latitude))
      * POWER(SIN(RADIANS(placeContext.geo._schema.longitude - ${centerLonSql}) / 2), 2)
    )) <= ${radiusKmSql}
),
ranked_events AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY event_timestamp DESC, event_id DESC) AS profile_event_rank
  FROM filtered_events
),
audience AS (
  SELECT profile_id, grid_lat, grid_lon, latitude, longitude
  FROM ranked_events
  WHERE profile_event_rank = 1
),
cell_counts AS (
  SELECT
    grid_lat,
    grid_lon,
    ROUND(grid_lat, 4) AS cell_lat,
    ROUND(grid_lon, 4) AS cell_lon,
    COUNT(DISTINCT profile_id) AS profiles
  FROM audience
  GROUP BY grid_lat, grid_lon
),
summary AS (
  SELECT
    (SELECT COUNT(DISTINCT profile_id) FROM audience) AS total_profiles,
    (SELECT COUNT(DISTINCT a.profile_id)
      FROM audience a JOIN cell_counts c ON a.grid_lat = c.grid_lat AND a.grid_lon = c.grid_lon
      WHERE c.profiles < ${kThresholdSql}) AS suppressed_profiles
)
SELECT summary.total_profiles, summary.suppressed_profiles,
  cells.cell_lat, cells.cell_lon, cells.profiles
FROM summary
LEFT JOIN (
  SELECT cell_lat, cell_lon, profiles FROM cell_counts
  WHERE profiles >= ${kThresholdSql}
  ORDER BY profiles DESC
  LIMIT 50
) AS cells ON TRUE`;
  return {
    sql,
    queryParameters: {},
  };
}

function createGeoHotspotsService({
  getAccessToken,
  getClientId,
  getImsOrg,
  getEventConfig,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  maxWaitMs = MAX_WAIT_MS,
  pollIntervalMs = POLL_INTERVAL_MS,
  dataPath,
}) {
  const resolvedDataPath = resolveGeoHotspotsDataPath(dataPath);

  async function request(url, headers, init = {}, timeoutMs = 10_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, headers, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.error_description || data.title || `Adobe API returned ${response.status}.`);
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Geo-hotspot Query Service request timed out after ${timeoutMs} ms.`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    dataPath: resolvedDataPath,
    async run(input) {
      if (resolvedDataPath === 'unavailable') {
        return { rows: [], dataStatus: 'unavailable', reason: GEO_DATA_UNAVAILABLE_REASON };
      }
      const accessToken = await getAccessToken();
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': getClientId(),
        'x-gw-ims-org-id': getImsOrg(),
        'x-sandbox-name': input.sandbox,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      const eventConfig = await getEventConfig(input.sandbox);
      const dataset = String(eventConfig?.datasetName || '').trim();
      if (!dataset) throw new Error(`No event dataset is configured for sandbox "${input.sandbox}".`);

      let datasetName = dataset;
      if (/^[a-f\d]{24}$/i.test(dataset)) {
        const catalogUrl = new URL(`${CATALOG_BASE}/dataSets/${encodeURIComponent(dataset)}`);
        catalogUrl.searchParams.set('properties', 'qualifiedName,name');
        const catalog = await request(catalogUrl, headers);
        datasetName = catalog.qualifiedName || catalog.name || '';
      }
      const { sql, queryParameters } = buildGeoHotspotsQuery({
        ...input,
        datasetName,
        now,
      });
      const createUrl = `${QUERY_SERVICE_BASE}/queries`;
      let query = await request(createUrl, headers, {
        method: 'POST',
        body: JSON.stringify({
          dbName: `${input.sandbox}:all`,
          sql,
          ...(Object.keys(queryParameters).length ? { queryParameters } : {}),
          name: 'Governed audience geo-hotspots',
        }),
      }, Math.min(15_000, maxWaitMs));
      const queryId = query.id;
      if (!queryId) throw new Error('Query Service did not return an id for the geo-hotspot query.');

      const deadline = now() + maxWaitMs;
      const stateOf = (item) => String(item?.lastRunDetails?.state || item?.state || '').toUpperCase();
      while (!['SUCCESS', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(stateOf(query))) {
        if (now() >= deadline) throw new Error(`Geo-hotspot Query Service request timed out after ${maxWaitMs} ms.`);
        await sleep(Math.min(pollIntervalMs, Math.max(1, deadline - now())));
        query = await request(`${QUERY_SERVICE_BASE}/queries/${encodeURIComponent(queryId)}`, headers, {}, Math.min(10_000, deadline - now()));
      }
      if (stateOf(query) !== 'SUCCESS') throw new Error(`Geo-hotspot Query Service request ended in state ${stateOf(query)}.`);

      const runId = query.lastRunDetails?.id || query.lastRunDetails?.runId || query.runId || queryId;
      const rowsUrl = new URL(
        `${QUERY_SERVICE_BASE}/queries/${encodeURIComponent(queryId)}/runs/${encodeURIComponent(runId)}/rows`,
      );
      rowsUrl.searchParams.set('limit', '100');
      const result = await request(rowsUrl, headers, {}, Math.min(10_000, Math.max(1, deadline - now())));
      const rows = Array.isArray(result) ? result : result.rows || result._embedded?.data;
      if (!Array.isArray(rows)) throw new Error('Geo-hotspot Query Service returned an unexpected results shape.');
      return { rows: rows.slice(0, 100), dataStatus: 'available' };
    },
  };
}

module.exports = {
  GEO_DATA_UNAVAILABLE_REASON,
  GEO_HOTSPOTS_DATA_PATHS,
  buildGeoHotspotsHttpBody,
  buildGeoHotspotsQuery,
  resolveGeoHotspotsDataPath,
  createGeoHotspotsService,
  assertSafeInterest,
  normalizeDatasetTableName,
  stringLiteral,
  INTEREST_PATTERN,
};
