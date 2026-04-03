/**
 * Tracks recently-accessed sandboxes in Firestore so the scheduled
 * pre-warm function knows which CDN URLs to hit.
 *
 * Collection: `schemaViewerCache`
 * Documents: `_recent:{sandbox}` with lastAccessedMs timestamp
 */

const admin = require('firebase-admin');

const COLLECTION = 'schemaViewerCache';

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

/**
 * Record that a sandbox was just accessed (for scheduled pre-warming).
 */
async function touchSandbox(sandbox) {
  try {
    await getDb().collection(COLLECTION).doc(`_recent:${String(sandbox).slice(0, 200)}`).set({
      sandbox: String(sandbox),
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAccessedMs: Date.now(),
    }, { merge: true });
  } catch { /* non-fatal */ }
}

/**
 * Get sandboxes accessed within the last 24 hours.
 */
async function getRecentSandboxes(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const cutoff = Date.now() - maxAgeMs;
    const snap = await getDb().collection(COLLECTION)
      .where('lastAccessedMs', '>', cutoff)
      .get();
    return snap.docs
      .map((d) => d.data()?.sandbox)
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim());
  } catch {
    return [];
  }
}

module.exports = { touchSandbox, getRecentSandboxes };
