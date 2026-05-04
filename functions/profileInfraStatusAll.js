/**
 * Aggregate `/api/profile-infra/status-all?sandbox=<name>` — fan-out the
 * existing per-industry `runStatus(...)` helpers in parallel and return
 * one consolidated object the front-end can use to render at-a-glance
 * "Profile enabled" indicators across all 7 industries (Generic, Travel,
 * FSI, Telecom, Retail, Media, Sports) with one round trip instead of
 * seven.
 *
 * Why a separate file: the per-industry endpoints in `index.js` each
 * call `infraService.runStatus(...)` directly. We keep that intact and
 * layer this aggregator on top so the existing wizards and the new
 * dropdown indicators read from the same source of truth.
 *
 * Tolerance: every per-industry call goes through `Promise.allSettled`
 * so one slow / failing industry never blocks the others. Failures are
 * surfaced as `{ error: '<reason>' }` for that single industry; the rest
 * of the response still rolls forward and the dropdown renders that
 * industry as "?" (see web/profile-viewer/profile-generation-status-badges.js).
 *
 * Cache: 30s in-memory cache keyed by `sandbox` so rapid renders
 * (industry-change → panel-show → after-enable refresh) don't re-hit
 * AEP. Cloud Functions v2 spins up multiple instances in parallel; the
 * cache is per-instance which is fine — staleness is bounded to 30s.
 *
 * Shape (response):
 * ```json
 * {
 *   "ok": true,
 *   "sandbox": "gerdos",
 *   "industries": {
 *     "generic":  { "schemaFound": true,  "schemaInUnion": true,  "datasetFound": true,  "datasetProfileEnabled": true,  "schemaId": "…", "datasetId": "…" },
 *     "fsi":      { "schemaFound": false, "schemaInUnion": false, "datasetFound": false, "datasetProfileEnabled": false },
 *     "telecom":  { "error": "Auth failed: …" },
 *     ...
 *   },
 *   "fetchedAt": 1714836180000,
 *   "cacheMs": 30000
 * }
 * ```
 */

const CACHE_TTL_MS = 30_000;

/**
 * Industry → infra-service module key. The keys here mirror the
 * `apiPathPrefix` used by the front-end's per-industry wizard so the
 * status-badge module can address each industry by its short name.
 */
const INDUSTRY_KEYS = ['generic', 'travel', 'fsi', 'telecom', 'retail', 'media', 'sports'];

/** @type {Map<string, { ts: number, payload: object }>} */
const cache = new Map();

/**
 * Strip the per-industry `runStatus` payload down to just the four
 * boolean flags + canonical ids the badges need. Avoids ballooning the
 * aggregate response with `prepSteps`, `nextSteps`, naming, etc.
 *
 * @param {object} status — full payload from `infraService.runStatus(...)`
 */
function projectStatusFlags(status) {
  if (!status || typeof status !== 'object') return { error: 'no status' };
  if (status.ok === false) {
    return {
      error: String(status.error || 'unknown').slice(0, 240),
      schemaFound: false,
      schemaInUnion: false,
      datasetFound: false,
      datasetProfileEnabled: false,
    };
  }
  return {
    schemaFound: !!status.schemaFound,
    // Prefer the May 2026 alias; fall back to the legacy field for safety.
    schemaInUnion: !!(status.schemaInUnion ?? status.schemaInProfileUnion),
    datasetFound: !!status.datasetFound,
    datasetProfileEnabled: !!status.datasetProfileEnabled,
    schemaId: status.schemaId || null,
    datasetId: status.datasetId || null,
  };
}

/**
 * Build the industries object via `Promise.allSettled`. Per-industry
 * failures collapse to `{ error: '<reason>' }`; successes project to
 * the trimmed flag set above.
 *
 * @param {object} services — { generic, travel, fsi, telecom, retail, media, sports }
 * @param {string} sandbox
 * @param {string} token
 * @param {string} clientId
 * @param {string} orgId
 */
/**
 * Resolve the per-industry status function. The newer industries (FSI,
 * Telecom, Retail, Media, Sports) all flow through `createProfileInfraService`
 * and export `runStatus` directly. The original Generic + Travel services
 * predate the factory and export named wrappers — `runGenericProfileInfraStatus`
 * / `runTravelProfileInfraStatus` — so we accept those too.
 */
function resolveRunStatus(svc, key) {
  if (!svc) return null;
  if (typeof svc.runStatus === 'function') return svc.runStatus.bind(svc);
  const named = `run${key.charAt(0).toUpperCase()}${key.slice(1)}ProfileInfraStatus`;
  if (typeof svc[named] === 'function') return svc[named].bind(svc);
  return null;
}

async function gatherIndustries(services, sandbox, token, clientId, orgId) {
  const tasks = INDUSTRY_KEYS.map((key) => {
    const svc = services[key];
    const runStatus = resolveRunStatus(svc, key);
    if (!runStatus) {
      return Promise.resolve({ key, payload: { error: `service ${key} missing runStatus()` } });
    }
    return runStatus(sandbox, token, clientId, orgId)
      .then((status) => ({ key, payload: projectStatusFlags(status) }))
      .catch((err) => ({ key, payload: { error: String(err && err.message ? err.message : err).slice(0, 240) } }));
  });

  const settled = await Promise.allSettled(tasks);
  /** @type {Record<string, object>} */
  const industries = {};
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value && result.value.key) {
      industries[result.value.key] = result.value.payload;
    }
  }
  for (const key of INDUSTRY_KEYS) {
    if (!(key in industries)) industries[key] = { error: 'aggregator-internal' };
  }
  return industries;
}

/**
 * Public entry — usually called from `exports.profileInfraStatusAll` in
 * `functions/index.js`. Inject the per-industry service modules so this
 * file stays free of `lazyRequire`/`defineSecret` plumbing.
 *
 * @param {object} cfg
 * @param {string} cfg.sandbox
 * @param {string} cfg.token
 * @param {string} cfg.clientId
 * @param {string} cfg.orgId
 * @param {object} cfg.services — { generic, travel, fsi, telecom, retail, media, sports }
 *   Each service exposes `runStatus(sandbox, token, clientId, orgId)`.
 * @param {boolean} [cfg.bypassCache=false]
 */
async function runProfileInfraStatusAll(cfg) {
  const { sandbox, token, clientId, orgId, services, bypassCache } = cfg;
  if (!sandbox) {
    return { ok: false, error: 'sandbox required', industries: {} };
  }
  const cacheKey = String(sandbox);
  const now = Date.now();
  if (!bypassCache) {
    const hit = cache.get(cacheKey);
    if (hit && now - hit.ts < CACHE_TTL_MS) {
      return { ...hit.payload, cached: true };
    }
  }

  const industries = await gatherIndustries(services, sandbox, token, clientId, orgId);
  const payload = {
    ok: true,
    sandbox,
    industries,
    fetchedAt: now,
    cacheMs: CACHE_TTL_MS,
  };
  cache.set(cacheKey, { ts: now, payload });
  // Keep the cache bounded — it grows by sandbox name, but if a long-lived
  // function instance ever fans out to dozens of sandboxes we'd rather drop
  // the oldest entries than grow indefinitely.
  if (cache.size > 64) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  return payload;
}

/** Test/diagnostic helper — wipe the in-memory cache. */
function _clearCache() {
  cache.clear();
}

module.exports = {
  runProfileInfraStatusAll,
  INDUSTRY_KEYS,
  projectStatusFlags,
  _clearCache,
  CACHE_TTL_MS,
};
