/**
 * In-memory per-keyId rate limits (per Cloud Run instance — not global).
 *
 * - lab_generate_profile + batch item generates: max 30 / minute
 * - lab_send_profile_event + lab_send_edge_event: max 30 / minute (shared bucket)
 * - lab_generate_profiles_batch job starts: max 3 / hour
 */

const GENERATE_MAX_PER_MINUTE = 30;
const EDGE_SEND_MAX_PER_MINUTE = 30;
const BATCH_JOBS_MAX_PER_HOUR = 3;
const SNOWFLAKE_TEST_MAX_PER_MINUTE = 10;
const SNOWFLAKE_GENERATE_MAX_PER_MINUTE = 5;
const GEO_HOTSPOTS_MAX_PER_MINUTE = 5;

/** @type {Map<string, number[]>} */
const generateTimestamps = new Map();

/** @type {Map<string, number[]>} */
const edgeSendTimestamps = new Map();

/** @type {Map<string, number[]>} */
const batchJobTimestamps = new Map();

/** @type {Map<string, number[]>} */
const snowflakeTestTimestamps = new Map();

/** @type {Map<string, number[]>} */
const snowflakeGenerateTimestamps = new Map();
const geoHotspotsTimestamps = new Map();

function pruneOld(timestamps, windowMs) {
  const cutoff = Date.now() - windowMs;
  while (timestamps.length && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

/**
 * @param {string} keyId
 * @returns {{ ok: true } | { ok: false, message: string, retryAfterSec: number }}
 */
export function checkGenerateRate(keyId) {
  const id = String(keyId || 'unknown');
  const now = Date.now();
  const windowMs = 60_000;
  const list = generateTimestamps.get(id) || [];
  pruneOld(list, windowMs);

  if (list.length >= GENERATE_MAX_PER_MINUTE) {
    const retryAfterSec = Math.ceil((list[0] + windowMs - now) / 1000);
    return {
      ok: false,
      message: `Rate limit exceeded: max ${GENERATE_MAX_PER_MINUTE} profile generate calls per minute per MCP key (in-memory, per instance).`,
      retryAfterSec: Math.max(1, retryAfterSec),
    };
  }

  list.push(now);
  generateTimestamps.set(id, list);
  return { ok: true };
}

/**
 * @param {string} keyId
 * @returns {{ ok: true } | { ok: false, message: string, retryAfterSec: number }}
 */
export function checkEdgeSendRate(keyId) {
  const id = String(keyId || 'unknown');
  const now = Date.now();
  const windowMs = 60_000;
  const list = edgeSendTimestamps.get(id) || [];
  pruneOld(list, windowMs);

  if (list.length >= EDGE_SEND_MAX_PER_MINUTE) {
    const retryAfterSec = Math.ceil((list[0] + windowMs - now) / 1000);
    return {
      ok: false,
      message: `Rate limit exceeded: max ${EDGE_SEND_MAX_PER_MINUTE} event send calls per minute per MCP key (in-memory, per instance).`,
      retryAfterSec: Math.max(1, retryAfterSec),
    };
  }

  list.push(now);
  edgeSendTimestamps.set(id, list);
  return { ok: true };
}

/**
 * @param {string} keyId
 * @returns {{ ok: true } | { ok: false, message: string, retryAfterSec: number }}
 */
export function checkBatchJobRate(keyId) {
  const id = String(keyId || 'unknown');
  const now = Date.now();
  const windowMs = 3_600_000;
  const list = batchJobTimestamps.get(id) || [];
  pruneOld(list, windowMs);

  if (list.length >= BATCH_JOBS_MAX_PER_HOUR) {
    const retryAfterSec = Math.ceil((list[0] + windowMs - now) / 1000);
    return {
      ok: false,
      message: `Rate limit exceeded: max ${BATCH_JOBS_MAX_PER_HOUR} batch jobs per hour per MCP key (in-memory, per instance).`,
      retryAfterSec: Math.max(1, retryAfterSec),
    };
  }

  list.push(now);
  batchJobTimestamps.set(id, list);
  return { ok: true };
}

function checkWindowRate(map, keyId, maxPerMinute, label) {
  const id = String(keyId || 'unknown');
  const now = Date.now();
  const windowMs = 60_000;
  const list = map.get(id) || [];
  pruneOld(list, windowMs);

  if (list.length >= maxPerMinute) {
    const retryAfterSec = Math.ceil((list[0] + windowMs - now) / 1000);
    return {
      ok: false,
      message: `Rate limit exceeded: max ${maxPerMinute} ${label} calls per minute per MCP key (in-memory, per instance).`,
      retryAfterSec: Math.max(1, retryAfterSec),
    };
  }

  list.push(now);
  map.set(id, list);
  return { ok: true };
}

/**
 * @param {string} keyId
 */
export function checkSnowflakeTestRate(keyId) {
  return checkWindowRate(snowflakeTestTimestamps, keyId, SNOWFLAKE_TEST_MAX_PER_MINUTE, 'Snowflake test');
}

/**
 * @param {string} keyId
 */
export function checkSnowflakeGenerateRate(keyId) {
  return checkWindowRate(
    snowflakeGenerateTimestamps,
    keyId,
    SNOWFLAKE_GENERATE_MAX_PER_MINUTE,
    'Snowflake generate/insert',
  );
}

/**
 * @param {string} keyId
 */
export function checkGeoHotspotsRate(keyId) {
  return checkWindowRate(
    geoHotspotsTimestamps,
    keyId,
    GEO_HOTSPOTS_MAX_PER_MINUTE,
    'geo-hotspot query',
  );
}

export function reserveGeoSeedRates(keyId, count) {
  if (!Number.isInteger(count) || count < 1 || count > GENERATE_MAX_PER_MINUTE) {
    return { ok: false, message: `Geo seed count must be between 1 and ${GENERATE_MAX_PER_MINUTE}.`, retryAfterSec: 60 };
  }

  const id = String(keyId || 'unknown');
  const now = Date.now();
  const windowMs = 60_000;
  const generateList = generateTimestamps.get(id) || [];
  const eventList = edgeSendTimestamps.get(id) || [];
  pruneOld(generateList, windowMs);
  pruneOld(eventList, windowMs);

  if (generateList.length + count > GENERATE_MAX_PER_MINUTE) {
    const retryAfterSec = generateList.length
      ? Math.ceil((generateList[0] + windowMs - now) / 1000)
      : 60;
    return {
      ok: false,
      message: `Rate limit exceeded: max ${GENERATE_MAX_PER_MINUTE} profile generate calls per minute per MCP key (in-memory, per instance).`,
      retryAfterSec: Math.max(1, retryAfterSec),
    };
  }
  if (eventList.length + count > EDGE_SEND_MAX_PER_MINUTE) {
    const retryAfterSec = eventList.length
      ? Math.ceil((eventList[0] + windowMs - now) / 1000)
      : 60;
    return {
      ok: false,
      message: `Rate limit exceeded: max ${EDGE_SEND_MAX_PER_MINUTE} event send calls per minute per MCP key (in-memory, per instance).`,
      retryAfterSec: Math.max(1, retryAfterSec),
    };
  }

  for (let index = 0; index < count; index += 1) {
    generateList.push(now);
    eventList.push(now);
  }
  generateTimestamps.set(id, generateList);
  edgeSendTimestamps.set(id, eventList);
  return { ok: true };
}
