'use strict';

const QUERY_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/query';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';
const EARTH_RADIUS_KM = 6371.0088;
const MAX_WAIT_MS = 100_000;
const POLL_INTERVAL_MS = 1500;

function escapeLikePattern(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function quoteTableName(value) {
  const name = String(value || '').trim();
  if (!name || name.includes('\0')) throw new Error('The configured retail event dataset name is invalid.');
  return `"${name.replaceAll('"', '""')}"`;
}

function round(value, precision) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
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
  const cellLatStep = round(cellKm / 111.045, 6);
  const cellLonStep = round(
    cellKm / (111.045 * Math.max(Math.abs(Math.cos((center.lat * Math.PI) / 180)), 0.01)),
    6,
  );
  const timestampNow = now();
  const table = quoteTableName(datasetName);
  const sql = `
WITH filtered_events AS (
  SELECT
    identityMap['ECID'][0].id AS profile_id,
    timestamp AS event_timestamp,
    _id AS event_id,
    placeContext.geo._schema.latitude AS latitude,
    placeContext.geo._schema.longitude AS longitude,
    ROUND(placeContext.geo._schema.latitude / $cellLatStep) * $cellLatStep AS grid_lat,
    ROUND(placeContext.geo._schema.longitude / $cellLonStep) * $cellLonStep AS grid_lon
  FROM ${table}
  WHERE timestamp >= $windowStart
    AND timestamp <= $windowEnd
    AND eventType = 'commerce.productViews'
    AND (
      LOWER(_demoemea.public.retail.productName) LIKE LOWER($interestPattern) ESCAPE '\\'
      OR LOWER(_demoemea.public.retail.productCategory) LIKE LOWER($interestPattern) ESCAPE '\\'
    )
    AND identityMap['ECID'][0].id IS NOT NULL
    AND placeContext.geo._schema.latitude IS NOT NULL
    AND placeContext.geo._schema.longitude IS NOT NULL
    AND 2 * ${EARTH_RADIUS_KM} * ASIN(SQRT(
      POWER(SIN(RADIANS(placeContext.geo._schema.latitude - $centerLat) / 2), 2)
      + COS(RADIANS($centerLat)) * COS(RADIANS(placeContext.geo._schema.latitude))
      * POWER(SIN(RADIANS(placeContext.geo._schema.longitude - $centerLon) / 2), 2)
    )) <= $radiusKm
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
      WHERE c.profiles < $kThreshold) AS suppressed_profiles
)
SELECT summary.total_profiles, summary.suppressed_profiles,
  cells.cell_lat, cells.cell_lon, cells.profiles
FROM summary
LEFT JOIN (
  SELECT cell_lat, cell_lon, profiles FROM cell_counts
  WHERE profiles >= $kThreshold
  ORDER BY profiles DESC
  LIMIT 50
) AS cells ON TRUE`;
  return {
    sql,
    queryParameters: {
      windowStart: new Date(timestampNow - windowHours * 60 * 60 * 1000).toISOString(),
      windowEnd: new Date(timestampNow).toISOString(),
      interestPattern: `%${escapeLikePattern(interest.trim())}%`,
      centerLat: center.lat,
      centerLon: center.lon,
      radiusKm,
      cellLatStep,
      cellLonStep,
      kThreshold: 10,
    },
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
}) {
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
    async run(input) {
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
          queryParameters,
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
      return { rows: rows.slice(0, 100) };
    },
  };
}

module.exports = { buildGeoHotspotsQuery, createGeoHotspotsService, escapeLikePattern };
