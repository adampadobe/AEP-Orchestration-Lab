/**
 * Persist AEP Lab Generic Profile streaming + infra IDs per Adobe sandbox
 * (Firestore). Thin config wrapper around `profileConnectionStoreFactory`.
 *
 * Separate Firestore collection from `consentConnections` and from each
 * other industry's `*ProfileConnections` so the (schema, dataset, dataflow)
 * triplets never collide in a shared sandbox.
 *
 * Access only through Cloud Functions (Admin SDK); client SDK is denied by
 * security rules. Public surface preserved 1:1 from the pre-Phase-0
 * implementation (`getGenericProfileConnection`, `saveGenericProfileConnection`,
 * `docIdForSandbox`, `COLLECTION`).
 */

const { createProfileConnectionStore } = require('./profileConnectionStoreFactory');

const COLLECTION = 'genericProfileConnections';

const store = createProfileConnectionStore({ collection: COLLECTION });

async function getGenericProfileConnection(sandbox) {
  return store.get(sandbox);
}

async function saveGenericProfileConnection(sandbox, patch) {
  return store.save(sandbox, patch);
}

module.exports = {
  COLLECTION,
  getGenericProfileConnection,
  saveGenericProfileConnection,
  docIdForSandbox: store.docIdForSandbox,
};
