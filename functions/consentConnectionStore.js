/**
 * Persist AEP Profile Viewer consent streaming + infra IDs per Adobe sandbox (Firestore).
 * Access only through Cloud Functions (Admin SDK); client SDK is denied by security rules.
 */

const admin = require('firebase-admin');

const COLLECTION = 'consentConnections';

const MAX = {
  url: 4096,
  flowId: 256,
  datasetId: 128,
  schemaId: 512,
  xdmKey: 64,
  apiKey: 256,
  schemaMetaAltId: 512,
  profileCoreMixinId: 512,
  datasetName: 256,
  imsOrg: 256,
};

let db;

function getDb() {
  if (!db) {
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    db = admin.firestore();
  }
  return db;
}

/** Firestore document id: sandbox technical names are usually safe; strip risky chars. */
function docIdForSandbox(sandbox) {
  const s = String(sandbox || 'default').trim() || 'default';
  return s.replace(/[/\s.#$\[\]]/g, '_').slice(0, 700);
}

function trimField(val, max) {
  if (val == null) return '';
  return String(val).trim().slice(0, max);
}

/**
 * @param {string} sandbox
 * @returns {Promise<null | Record<string, unknown>>}
 */
async function getConsentConnection(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return null;
  const snap = await getDb().collection(COLLECTION).doc(docIdForSandbox(name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

/**
 * Deep-merge streaming + infra; omit empty strings when merging from partial updates.
 * @param {string} sandbox
 * @param {{ streaming?: Record<string, string>, infra?: Record<string, string> }} patch
 */
async function saveConsentConnection(sandbox, patch) {
  const name = String(sandbox || '').trim();
  if (!name) {
    throw new Error('sandbox is required');
  }
  const ref = getDb().collection(COLLECTION).doc(docIdForSandbox(name));

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data() ? snap.data() : {};
    /** @type {Record<string, string>} */
    const streaming = { ...(prev.streaming && typeof prev.streaming === 'object' ? prev.streaming : {}) };
    /** @type {Record<string, string>} */
    const infra = { ...(prev.infra && typeof prev.infra === 'object' ? prev.infra : {}) };

    if (patch.streaming && typeof patch.streaming === 'object') {
      const s = patch.streaming;
      if (s.url !== undefined) streaming.url = trimField(s.url, MAX.url);
      if (s.flowId !== undefined) streaming.flowId = trimField(s.flowId, MAX.flowId);
      if (s.datasetId !== undefined) streaming.datasetId = trimField(s.datasetId, MAX.datasetId);
      if (s.schemaId !== undefined) streaming.schemaId = trimField(s.schemaId, MAX.schemaId);
      if (s.xdmKey !== undefined) streaming.xdmKey = trimField(s.xdmKey, MAX.xdmKey);
      if (s.apiKey !== undefined) streaming.apiKey = trimField(s.apiKey, MAX.apiKey);
    }

    if (patch.infra && typeof patch.infra === 'object') {
      const i = patch.infra;
      if (i.schemaMetaAltId !== undefined) infra.schemaMetaAltId = trimField(i.schemaMetaAltId, MAX.schemaMetaAltId);
      if (i.schemaId !== undefined) infra.schemaId = trimField(i.schemaId, MAX.schemaId);
      if (i.datasetId !== undefined) infra.datasetId = trimField(i.datasetId, MAX.datasetId);
      if (i.profileCoreMixinId !== undefined) {
        infra.profileCoreMixinId = trimField(i.profileCoreMixinId, MAX.profileCoreMixinId);
      }
      if (i.datasetName !== undefined) infra.datasetName = trimField(i.datasetName, MAX.datasetName);
      if (i.imsOrg !== undefined) infra.imsOrg = trimField(i.imsOrg, MAX.imsOrg);
    }

    tx.set(
      ref,
      {
        sandbox: name,
        streaming,
        infra,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

module.exports = {
  COLLECTION,
  getConsentConnection,
  saveConsentConnection,
  docIdForSandbox,
};
