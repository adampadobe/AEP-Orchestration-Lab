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

/** @type {Map<string, number[]>} */
const generateTimestamps = new Map();

/** @type {Map<string, number[]>} */
const edgeSendTimestamps = new Map();

/** @type {Map<string, number[]>} */
const batchJobTimestamps = new Map();

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
