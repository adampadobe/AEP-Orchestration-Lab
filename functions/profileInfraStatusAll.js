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
 * Caching (May 2026 — durable Firestore cache):
 *
 *   The original implementation kept a 30s in-memory map keyed by
 *   sandbox. Cloud Functions v2 spins up many parallel instances so
 *   that cache barely helped — every architect cold-loaded their own
 *   copy. We now back the cache with Firestore via
 *   `profileInfraStatusCache.js` so all instances and architects share
 *   one cache per (sandbox, industry).
 *
 *   - Read flow per industry: Firestore GET first; on hit (and
 *     `lastChecked` younger than the 7-day max-staleness safety net)
 *     project flags from the cached payload. On miss/stale, call
 *     `runStatus(...)` against AEP and write the fresh result back.
 *   - `?refresh=1` (bypassCache=true) skips the cache for all 7
 *     industries.
 *   - Each per-industry result is annotated with `cached: boolean` and
 *     `lastChecked: ISO string` for diagnostics; the original flag
 *     fields (`schemaFound`, `schemaInUnion`, `datasetFound`,
 *     `datasetProfileEnabled`, `schemaId`, `datasetId`) keep their
 *     existing names — clients that don't know about the cache see no
 *     change.
 *
 *   The 30s in-memory cache has been removed: Firestore reads inside
 *   the same region land in single-digit milliseconds and the new
 *   write-through invalidation hooks (in `profileInfraFactory.js`)
 *   keep the durable cache fresh.
 *
 * Shape (response):
 * ```json
 * {
 *   "ok": true,
 *   "sandbox": "gerdos",
 *   "industries": {
 *     "generic":  { "schemaFound": true,  "schemaInUnion": true,  "datasetFound": true,  "datasetProfileEnabled": true,  "schemaId": "…", "datasetId": "…", "cached": true,  "lastChecked": "2026-05-04T19:42:00.000Z" },
 *     "fsi":      { "schemaFound": false, "schemaInUnion": false, "datasetFound": false, "datasetProfileEnabled": false, "cached": false, "lastChecked": "2026-05-04T19:50:01.000Z" },
 *     "telecom":  { "error": "Auth failed: …", "cached": false },
 *     ...
 *   },
 *   "fetchedAt": 1714836180000
 * }
 * ```
 */

const statusCache = require('./profileInfraStatusCache');

/**
 * Industry → infra-service module key. The keys here mirror the
 * `apiPathPrefix` used by the front-end's per-industry wizard so the
 * status-badge module can address each industry by its short name.
 */
const INDUSTRY_KEYS = ['generic', 'travel', 'fsi', 'telecom', 'retail', 'media', 'sports'];

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

/**
 * One per-industry resolution: Firestore cache first, then AEP fallback.
 * Returns the projected flag set with `cached` + `lastChecked`.
 */
async function resolveOneIndustry({ key, svc, sandbox, token, clientId, orgId, bypassCache }) {
  // 1. Cache fast-path.
  if (!bypassCache) {
    let cached = null;
    try {
      cached = await statusCache.readCachedStatus({ sandbox, industry: key });
    } catch (e) {
      // readCachedStatus already swallows + logs errors and returns null —
      // belt-and-braces try/catch in case the helper changes shape.
      cached = null;
    }
    if (cached && cached.payload) {
      const flags = projectStatusFlags(cached.payload);
      flags.cached = true;
      flags.lastChecked = cached.lastChecked instanceof Date ? cached.lastChecked.toISOString() : null;
      return flags;
    }
  }

  // 2. AEP fetch on miss / stale / bypassCache.
  const runStatus = resolveRunStatus(svc, key);
  if (!runStatus) {
    return { error: `service ${key} missing runStatus()`, cached: false };
  }

  let status;
  try {
    status = await runStatus(sandbox, token, clientId, orgId);
  } catch (e) {
    return {
      error: String(e && e.message ? e.message : e).slice(0, 240),
      cached: false,
    };
  }

  // 3. Write-through to Firestore on success. Never block the response
  //    on the write — fire-and-forget keeps the hot path snappy.
  if (status && typeof status === 'object' && status.ok !== false) {
    statusCache
      .writeStatusCacheEntry({ sandbox, industry: key, payload: status, source: 'aep-fresh' })
      .catch(() => { /* helper logs internally */ });
  }

  const flags = projectStatusFlags(status);
  flags.cached = false;
  flags.lastChecked = new Date().toISOString();
  return flags;
}

/**
 * Build the industries object via `Promise.allSettled`. Per-industry
 * failures collapse to `{ error: '<reason>' }`; successes project to
 * the trimmed flag set above.
 */
async function gatherIndustries(services, sandbox, token, clientId, orgId, bypassCache) {
  const tasks = INDUSTRY_KEYS.map((key) =>
    resolveOneIndustry({ key, svc: services[key], sandbox, token, clientId, orgId, bypassCache })
      .then((payload) => ({ key, payload }))
      .catch((err) => ({
        key,
        payload: {
          error: String(err && err.message ? err.message : err).slice(0, 240),
          cached: false,
        },
      })),
  );

  const settled = await Promise.allSettled(tasks);
  /** @type {Record<string, object>} */
  const industries = {};
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value && result.value.key) {
      industries[result.value.key] = result.value.payload;
    }
  }
  for (const key of INDUSTRY_KEYS) {
    if (!(key in industries)) industries[key] = { error: 'aggregator-internal', cached: false };
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
  const industries = await gatherIndustries(services, sandbox, token, clientId, orgId, !!bypassCache);
  return {
    ok: true,
    sandbox,
    industries,
    fetchedAt: Date.now(),
  };
}

module.exports = {
  runProfileInfraStatusAll,
  INDUSTRY_KEYS,
  projectStatusFlags,
};
