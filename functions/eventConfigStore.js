/**
 * Persist Edge event config (datastream ID) per Adobe sandbox in Firestore.
 * Same pattern as consentConnectionStore.js.
 */

const admin = require('firebase-admin');

const COLLECTION = 'eventEdgeConfig';

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

function trim(val, max) {
  if (val == null) return '';
  return String(val).trim().slice(0, max);
}

async function getEventConfig(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return null;
  const snap = await getDb().collection(COLLECTION).doc(docId(name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

async function saveEventConfig(sandbox, patch) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');

  const ref = getDb().collection(COLLECTION).doc(docId(name));

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data() ? snap.data() : {};

    const merged = {
      sandbox: name,
      datastreamId: trim(
        patch.datastreamId !== undefined ? patch.datastreamId : prev.datastreamId,
        256
      ),
      datastreamTitle: trim(
        patch.datastreamTitle !== undefined ? patch.datastreamTitle : prev.datastreamTitle,
        256
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

module.exports = { COLLECTION, getEventConfig, saveEventConfig, docId };
