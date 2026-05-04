/**
 * Durable Firestore-backed cache for the per-industry Profile-infra
 * status check (`runStatus(...)` from `profileInfraFactory.js`).
 *
 * Why Firestore instead of in-memory:
 *
 *   - Cloud Functions v2 spins up many parallel instances. The previous
 *     30s in-memory cache (in profileInfraStatusAll.js) was per-instance
 *     so two architects opening profile-generation at the same time
 *     would each pay full 7-industry AEP fan-out — no real reuse.
 *   - Once a sandbox+industry has been verified Profile-enabled, the
 *     state RARELY changes (architects provision once, stream events
 *     for weeks). Re-checking AEP every 30s is wasted budget + slower UX.
 *   - Status changes only on three events that THIS lab can observe
 *     directly: `runStep('createSchema' | 'attachFieldGroups' |
 *     'createDataset')` and `runEnableProfile`. Each of those call sites
 *     calls `invalidateStatusCache(...)` after success so the next read
 *     repopulates from AEP.
 *
 * Document layout:
 *
 *   - Collection: `profileInfraStatusCache`
 *   - Doc id:    `<sandbox>_<industry>` (e.g. `gerdos_fsi`,
 *                                         `kirkham_telecom`).
 *   - Fields:
 *     ```
 *     sandbox: string
 *     industry: string ('generic' | 'travel' | 'fsi' | 'telecom' |
 *                       'retail' | 'media' | 'sports')
 *     payload: object  // full runStatus payload (or projection)
 *     lastChecked: Firestore Timestamp
 *     cacheVersion: number  // CACHE_VERSION constant — bump in code to
 *                            // force a global cache busting on next read
 *     source: 'aep-fresh' | 'enable-write-through' |
 *             'provisioning-write-through'
 *     ```
 *
 * Safety net: a 7-day max-staleness threshold catches out-of-band changes
 * (e.g. an architect tweaks the schema directly in AEP UI) without
 * needing a manual refresh. Architects who notice drift sooner can use
 * the per-badge "Re-check AEP" refresh icon (see
 * web/profile-viewer/profile-generation-status-badges.js) which passes
 * `?refresh=1` to bypass the cache.
 */

const admin = require('firebase-admin');

const COLLECTION = 'profileInfraStatusCache';

/**
 * Bump this constant in code to force a global cache busting — every
 * cached doc with a lower version is treated as missing on next read.
 * Useful if a future change broadens the projection or fixes a bug in
 * the cached payload shape.
 */
const CACHE_VERSION = 1;

/**
 * Max staleness safety net. If `lastChecked` is older than this, we
 * treat the doc as missing and re-fetch from AEP. Architects MIGHT
 * make out-of-band changes via AEP UI — this catches those without
 * needing manual refresh.
 */
const MAX_STALENESS_MS = 7 * 24 * 60 * 60 * 1000;

let _db;
function getDb() {
  if (!_db) {
    if (!admin.apps.length) admin.initializeApp();
    _db = admin.firestore();
  }
  return _db;
}

/**
 * Document id = `<sandbox>_<industry>`. Sandbox names in this lab are
 * lowercase alphanumeric (gerdos, kirkham, apalmer, etc.); industry
 * keys come from a fixed allowlist (`generic` … `sports`). We still
 * sanitise both so any unexpected character (path separator, '.',
 * '#', '$', '[', ']' — all forbidden in Firestore doc ids) collapses
 * to underscore.
 */
function docId(sandbox, industry) {
  const s = String(sandbox || '').trim();
  const i = String(industry || '').trim();
  if (!s || !i) return '';
  const sane = (v) => v.replace(/[/\s.#$\[\]]/g, '_');
  return `${sane(s)}_${sane(i)}`.slice(0, 700);
}

function timestampToMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

/**
 * Read the cached status. Returns `null` if missing, stale, or written
 * by an older `cacheVersion`.
 *
 * @param {object} cfg
 * @param {string} cfg.sandbox
 * @param {string} cfg.industry
 * @param {number} [cfg.maxAgeMs=MAX_STALENESS_MS]
 * @returns {Promise<{
 *   sandbox: string,
 *   industry: string,
 *   payload: object,
 *   lastChecked: Date,
 *   cacheVersion: number,
 *   source: string
 * }|null>}
 */
async function readCachedStatus({ sandbox, industry, maxAgeMs } = {}) {
  const id = docId(sandbox, industry);
  if (!id) return null;
  const max = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : MAX_STALENESS_MS;
  let snap;
  try {
    snap = await getDb().collection(COLLECTION).doc(id).get();
  } catch (e) {
    // Firestore outage is non-fatal — caller will fall through to AEP.
    console.warn('[profileInfraStatusCache.read]', JSON.stringify({
      sandbox, industry, error: String(e && e.message ? e.message : e).slice(0, 240),
    }));
    return null;
  }
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data || typeof data !== 'object') return null;
  if (Number(data.cacheVersion) !== CACHE_VERSION) return null;
  const lastMs = timestampToMs(data.lastChecked);
  if (!lastMs || Date.now() - lastMs > max) return null;
  if (!data.payload || typeof data.payload !== 'object') return null;
  return {
    sandbox: String(data.sandbox || sandbox),
    industry: String(data.industry || industry),
    payload: data.payload,
    lastChecked: new Date(lastMs),
    cacheVersion: Number(data.cacheVersion) || CACHE_VERSION,
    source: String(data.source || 'aep-fresh'),
  };
}

/**
 * Write the cached status. `payload` should be the full runStatus
 * result so the per-industry status endpoint can return it unchanged.
 *
 * @param {object} cfg
 * @param {string} cfg.sandbox
 * @param {string} cfg.industry
 * @param {object} cfg.payload   full runStatus result
 * @param {string} [cfg.source='aep-fresh']
 */
async function writeStatusCacheEntry({ sandbox, industry, payload, source } = {}) {
  const id = docId(sandbox, industry);
  if (!id) return;
  if (!payload || typeof payload !== 'object') return;
  const doc = {
    sandbox: String(sandbox).trim(),
    industry: String(industry).trim(),
    payload,
    lastChecked: admin.firestore.FieldValue.serverTimestamp(),
    cacheVersion: CACHE_VERSION,
    source: String(source || 'aep-fresh').trim(),
  };
  try {
    await getDb().collection(COLLECTION).doc(id).set(doc, { merge: false });
  } catch (e) {
    console.warn('[profileInfraStatusCache.write]', JSON.stringify({
      sandbox, industry, error: String(e && e.message ? e.message : e).slice(0, 240),
    }));
  }
}

/**
 * Drop the cached entry for one (sandbox, industry). Called by every
 * provisioning + enable success path so the next status read
 * repopulates from AEP.
 *
 * @param {object} cfg
 * @param {string} cfg.sandbox
 * @param {string} cfg.industry
 */
async function invalidateStatusCache({ sandbox, industry } = {}) {
  const id = docId(sandbox, industry);
  if (!id) return;
  try {
    await getDb().collection(COLLECTION).doc(id).delete();
  } catch (e) {
    // Already-missing doc is fine; surface other errors as a warning so
    // they show up in Cloud Function logs without breaking the caller.
    const msg = String(e && e.message ? e.message : e);
    if (!/NOT_FOUND/i.test(msg)) {
      console.warn('[profileInfraStatusCache.invalidate]', JSON.stringify({
        sandbox, industry, error: msg.slice(0, 240),
      }));
    }
  }
}

const ALL_INDUSTRY_KEYS = ['generic', 'travel', 'fsi', 'telecom', 'retail', 'media', 'sports'];

/**
 * Batched delete of ALL 7 industries' entries for a sandbox. Used when
 * a sandbox-wide reset is needed (currently no automatic trigger; left
 * as an admin escape hatch).
 *
 * @param {object} cfg
 * @param {string} cfg.sandbox
 */
async function invalidateAllForSandbox({ sandbox } = {}) {
  const s = String(sandbox || '').trim();
  if (!s) return;
  const batch = getDb().batch();
  for (const ind of ALL_INDUSTRY_KEYS) {
    const id = docId(s, ind);
    if (id) batch.delete(getDb().collection(COLLECTION).doc(id));
  }
  try {
    await batch.commit();
  } catch (e) {
    console.warn('[profileInfraStatusCache.invalidateAllForSandbox]', JSON.stringify({
      sandbox: s, error: String(e && e.message ? e.message : e).slice(0, 240),
    }));
  }
}

module.exports = {
  COLLECTION,
  CACHE_VERSION,
  MAX_STALENESS_MS,
  ALL_INDUSTRY_KEYS,
  docId,
  readCachedStatus,
  writeStatusCacheEntry,
  invalidateStatusCache,
  invalidateAllForSandbox,
};
