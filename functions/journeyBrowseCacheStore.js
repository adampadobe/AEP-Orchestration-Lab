/**
 * Firestore cache for GET /api/journeys/browse — per-sandbox journey lists.
 * Speeds up sandbox switching; TTL default 1h; manual refresh bypasses cache.
 */

const admin = require('firebase-admin');

const COLLECTION = 'journeyBrowseCache';

const DEFAULT_TTL_MS = 60 * 60 * 1000;

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function docId(sandbox) {
  const s = String(sandbox || 'default').trim() || 'default';
  return s.replace(/[/\s.#$\[\]]/g, '_').slice(0, 700);
}

function cacheTtlMs() {
  const n = parseInt(String(process.env.JOURNEY_BROWSE_CACHE_TTL_MS || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
}

/**
 * @param {FirebaseFirestore.Timestamp|Date|undefined} ts
 */
function timestampToMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

/**
 * @param {FirebaseFirestore.DocumentData} doc
 */
function isFresh(doc) {
  if (!doc || !doc.cachedAt) return false;
  const age = Date.now() - timestampToMs(doc.cachedAt);
  return age >= 0 && age < cacheTtlMs();
}

/**
 * @param {FirebaseFirestore.DocumentData} doc
 */
function toApiPayload(doc) {
  return {
    ok: doc.ok !== false,
    journeys: Array.isArray(doc.journeys) ? doc.journeys : [],
    start: doc.start != null ? doc.start : 0,
    limit: doc.limit != null ? doc.limit : 200,
    total: doc.total != null ? doc.total : 0,
    source: doc.source != null ? String(doc.source) : 'cache',
  };
}

/**
 * @param {string} sandbox
 * @returns {Promise<FirebaseFirestore.DocumentData|null>}
 */
async function getCachedDoc(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return null;
  const snap = await getDb().collection(COLLECTION).doc(docId(name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? data : null;
}

/** @param {Record<string, unknown>} payload */
async function saveJourneyBrowseCache(sandbox, payload) {
  const name = String(sandbox || '').trim();
  if (!name || !payload || typeof payload !== 'object') return;
  if (!payload.ok) return;

  const ref = getDb().collection(COLLECTION).doc(docId(name));
  await ref.set(
    {
      sandbox: name,
      ok: true,
      journeys: payload.journeys || [],
      start: payload.start != null ? payload.start : 0,
      limit: payload.limit != null ? payload.limit : 200,
      total: payload.total != null ? payload.total : 0,
      source: payload.source != null ? String(payload.source) : '',
      cachedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: false },
  );
}

/** Sandboxes that have ever been cached (for hourly refresh). */
async function listCachedSandboxNames() {
  const snap = await getDb().collection(COLLECTION).get();
  const names = [];
  snap.forEach((d) => {
    const s = d.data()?.sandbox;
    if (s && typeof s === 'string' && s.trim()) names.push(s.trim());
  });
  return [...new Set(names)];
}

module.exports = {
  COLLECTION,
  docId,
  cacheTtlMs,
  isFresh,
  toApiPayload,
  getCachedDoc,
  saveJourneyBrowseCache,
  listCachedSandboxNames,
};
