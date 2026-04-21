/**
 * Persist Edge event config (datastream ID) per Adobe sandbox in Firestore.
 * Same pattern as consentConnectionStore.js.
 */

const admin = require('firebase-admin');

const COLLECTION = 'eventEdgeConfig';
/** When a Firebase user is present, config is stored here instead of shared sandbox docs. */
const USER_COLLECTION = 'eventEdgeConfigUser';

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

    const customTriggers = patch.customTriggers !== undefined
      ? (Array.isArray(patch.customTriggers) ? patch.customTriggers.slice(0, 200) : [])
      : (Array.isArray(prev.customTriggers) ? prev.customTriggers : []);

    const quickMenuTriggers = patch.quickMenuTriggers !== undefined
      ? (Array.isArray(patch.quickMenuTriggers) ? patch.quickMenuTriggers.slice(0, 200) : [])
      : (Array.isArray(prev.quickMenuTriggers) ? prev.quickMenuTriggers : []);

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
      schemaTitle: trim(
        patch.schemaTitle !== undefined ? patch.schemaTitle : prev.schemaTitle,
        256
      ),
      datasetName: trim(
        patch.datasetName !== undefined ? patch.datasetName : prev.datasetName,
        256
      ),
      customTriggers,
      quickMenuTriggers,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

async function getUserEventConfig(uid, sandbox) {
  const name = String(sandbox || '').trim();
  const u = String(uid || '').trim();
  if (!name || !u) return null;
  const snap = await getDb().collection(USER_COLLECTION).doc(userDocId(u, name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

async function saveUserEventConfig(uid, sandbox, patch) {
  const name = String(sandbox || '').trim();
  const u = String(uid || '').trim();
  if (!name) throw new Error('sandbox is required');
  if (!u) throw new Error('uid is required');

  const ref = getDb().collection(USER_COLLECTION).doc(userDocId(u, name));

  // First-save seed: if the user has no prior user-scoped record yet,
  // inherit field values from the shared sandbox record so a partial
  // patch (e.g. saveConfigField({customTriggers})) doesn't blank out
  // datastreamId / schemaTitle / datasetName.
  const sharedFallback = await getEventConfig(name);

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data()
      ? snap.data()
      : (sharedFallback || {});

    const customTriggers = patch.customTriggers !== undefined
      ? (Array.isArray(patch.customTriggers) ? patch.customTriggers.slice(0, 200) : [])
      : (Array.isArray(prev.customTriggers) ? prev.customTriggers : []);

    const quickMenuTriggers = patch.quickMenuTriggers !== undefined
      ? (Array.isArray(patch.quickMenuTriggers) ? patch.quickMenuTriggers.slice(0, 200) : [])
      : (Array.isArray(prev.quickMenuTriggers) ? prev.quickMenuTriggers : []);

    const merged = {
      uid: u,
      sandbox: name,
      datastreamId: trim(
        patch.datastreamId !== undefined ? patch.datastreamId : prev.datastreamId,
        256,
      ),
      datastreamTitle: trim(
        patch.datastreamTitle !== undefined ? patch.datastreamTitle : prev.datastreamTitle,
        256,
      ),
      schemaTitle: trim(
        patch.schemaTitle !== undefined ? patch.schemaTitle : prev.schemaTitle,
        256,
      ),
      datasetName: trim(
        patch.datasetName !== undefined ? patch.datasetName : prev.datasetName,
        256,
      ),
      customTriggers,
      quickMenuTriggers,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

/** Prefer user doc when present; otherwise shared sandbox doc (legacy / team default). */
async function getEffectiveEventConfig(sandbox, uid) {
  const u = String(uid || '').trim();
  if (u) {
    const userRec = await getUserEventConfig(u, sandbox);
    if (userRec) return userRec;
  }
  return getEventConfig(sandbox);
}

async function saveEffectiveEventConfig(sandbox, uid, patch) {
  const u = String(uid || '').trim();
  if (u) return saveUserEventConfig(u, sandbox, patch);
  return saveEventConfig(sandbox, patch);
}

module.exports = {
  COLLECTION,
  USER_COLLECTION,
  getEventConfig,
  saveEventConfig,
  getUserEventConfig,
  saveUserEventConfig,
  getEffectiveEventConfig,
  saveEffectiveEventConfig,
  docId,
};
