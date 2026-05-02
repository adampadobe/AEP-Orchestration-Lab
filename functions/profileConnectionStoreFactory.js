/**
 * Factory for per-industry profile connection stores (Firestore-backed).
 *
 * Each call to `createProfileConnectionStore({ collection })` returns a small
 * `{ get, save, COLLECTION, docIdForSandbox }` object that is API-equivalent
 * to the hand-rolled `genericProfileConnectionStore.js` /
 * `travelProfileConnectionStore.js` modules from before the Phase 0 refactor.
 *
 * Why a factory rather than one shared collection
 * -----------------------------------------------
 * Each industry keeps its own (schema, dataset, dataflow) triplet; having one
 * Firestore collection per industry means a save against one industry can
 * never overwrite another industry's saved IDs in the same sandbox. Adding a
 * new industry is therefore safe-by-construction — bring up a new factory
 * instance with `collection: '<industry>ProfileConnections'` and you cannot
 * collide with any existing record.
 *
 * Field length caps below match the original modules byte-for-byte so the
 * Firestore schema does not drift between Phase 0 and pre-Phase-0 records.
 */

const admin = require('firebase-admin');

const MAX = {
  url: 4096,
  flowId: 256,
  flowName: 256,
  datasetId: 128,
  schemaId: 512,
  xdmKey: 64,
  apiKey: 256,
  schemaMetaAltId: 512,
  profileCoreMixinId: 512,
  analyticsFieldGroupId: 512,
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

function docIdForSandbox(sandbox) {
  const s = String(sandbox || 'default').trim() || 'default';
  return s.replace(/[/\s.#$\[\]]/g, '_').slice(0, 700);
}

function trimField(val, max) {
  if (val == null) return '';
  return String(val).trim().slice(0, max);
}

/**
 * @param {{ collection: string }} config
 */
function createProfileConnectionStore(config) {
  if (!config || !config.collection) {
    throw new Error('createProfileConnectionStore: config.collection is required');
  }
  const COLLECTION = String(config.collection);

  /**
   * @param {string} sandbox
   * @returns {Promise<null | Record<string, unknown>>}
   */
  async function get(sandbox) {
    const name = String(sandbox || '').trim();
    if (!name) return null;
    const snap = await getDb().collection(COLLECTION).doc(docIdForSandbox(name)).get();
    if (!snap.exists) return null;
    const data = snap.data();
    return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
  }

  /**
   * Deep-merge streaming + infra; omit empty strings when merging from partial
   * updates. Preserves the on-disk shape used by the legacy
   * `genericProfileConnectionStore` and `travelProfileConnectionStore` so a
   * Firestore record written before the Phase 0 refactor still round-trips.
   *
   * @param {string} sandbox
   * @param {{ streaming?: Record<string, string>, infra?: Record<string, string> }} patch
   */
  async function save(sandbox, patch) {
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
        if (s.flowName !== undefined) streaming.flowName = trimField(s.flowName, MAX.flowName);
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
        if (i.analyticsFieldGroupId !== undefined) {
          infra.analyticsFieldGroupId = trimField(i.analyticsFieldGroupId, MAX.analyticsFieldGroupId);
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

  return { get, save, COLLECTION, docIdForSandbox };
}

module.exports = {
  createProfileConnectionStore,
  docIdForSandbox,
};
