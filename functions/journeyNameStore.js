/**
 * Firestore-backed lookup cache for AEP Journey Optimizer journey names.
 * Avoids repeated journey.adobe.io API calls for the same journey version ID.
 *
 * Collection: journeyNames
 * Document ID: {sandbox}_{journeyVersionId}  (sanitised)
 * Fields: sandbox, journeyVersionId, name, updatedAt
 */

const admin = require('firebase-admin');

const COLLECTION = 'journeyNames';

let db;

function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function docId(sandbox, journeyVersionId) {
  const s = String(sandbox || 'default').trim() || 'default';
  const j = String(journeyVersionId || '').trim();
  return `${s}_${j}`.replace(/[/\s.#$\[\]]/g, '_').slice(0, 700);
}

/**
 * Look up a cached journey name. Returns the name string or null if not cached.
 */
async function getCachedJourneyName(sandbox, journeyVersionId) {
  const id = docId(sandbox, journeyVersionId);
  const snap = await getDb().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return (data && data.name) || null;
}

/**
 * Store a journey name in Firestore for future lookups.
 */
async function setCachedJourneyName(sandbox, journeyVersionId, name) {
  const id = docId(sandbox, journeyVersionId);
  await getDb().collection(COLLECTION).doc(id).set(
    {
      sandbox: String(sandbox || 'default').trim(),
      journeyVersionId: String(journeyVersionId || '').trim(),
      name: name || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

module.exports = { COLLECTION, getCachedJourneyName, setCachedJourneyName };
