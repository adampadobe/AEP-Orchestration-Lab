/**
 * Persist decisioning catalog config (x-schema-id) per sandbox in Firestore.
 * Same pattern as eventConfigStore.js.
 */

const admin = require('firebase-admin');

const COLLECTION = 'catalogConfig';
const USER_COLLECTION = 'catalogConfigUser';

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

function userDocId(uid, sandbox) {
  const u = String(uid || '').trim().slice(0, 128);
  const d = docId(sandbox);
  return `${u}__${d}`.slice(0, 800);
}

function trim(val, max) {
  if (val == null) return '';
  return String(val).trim().slice(0, max);
}

async function getCatalogConfig(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return null;
  const snap = await getDb().collection(COLLECTION).doc(docId(name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

async function saveCatalogConfig(sandbox, patch) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');

  const ref = getDb().collection(COLLECTION).doc(docId(name));

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data() ? snap.data() : {};

    const merged = {
      sandbox: name,
      schemaId: trim(
        patch.schemaId !== undefined ? patch.schemaId : prev.schemaId,
        512
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

async function getUserCatalogConfig(uid, sandbox) {
  const name = String(sandbox || '').trim();
  const u = String(uid || '').trim();
  if (!name || !u) return null;
  const snap = await getDb().collection(USER_COLLECTION).doc(userDocId(u, name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

async function saveUserCatalogConfig(uid, sandbox, patch) {
  const name = String(sandbox || '').trim();
  const u = String(uid || '').trim();
  if (!name) throw new Error('sandbox is required');
  if (!u) throw new Error('uid is required');

  const ref = getDb().collection(USER_COLLECTION).doc(userDocId(u, name));

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data() ? snap.data() : {};

    const merged = {
      uid: u,
      sandbox: name,
      schemaId: trim(
        patch.schemaId !== undefined ? patch.schemaId : prev.schemaId,
        512,
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

async function getEffectiveCatalogConfig(sandbox, uid) {
  const u = String(uid || '').trim();
  if (u) {
    const userRec = await getUserCatalogConfig(u, sandbox);
    if (userRec) return userRec;
  }
  return getCatalogConfig(sandbox);
}

async function saveEffectiveCatalogConfig(sandbox, uid, patch) {
  const u = String(uid || '').trim();
  if (u) return saveUserCatalogConfig(u, sandbox, patch);
  return saveCatalogConfig(sandbox, patch);
}

module.exports = {
  COLLECTION,
  USER_COLLECTION,
  getCatalogConfig,
  saveCatalogConfig,
  getUserCatalogConfig,
  saveUserCatalogConfig,
  getEffectiveCatalogConfig,
  saveEffectiveCatalogConfig,
  docId,
};
