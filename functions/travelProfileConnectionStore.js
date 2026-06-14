/**
 * Persist AEP Lab Travel Profile streaming + infra IDs per Adobe sandbox
 * (Firestore). Thin config wrapper around `profileConnectionStoreFactory`.
 *
 * Separate Firestore collection from `genericProfileConnections` and from
 * each other industry so the (schema, dataset, dataflow) triplets never
 * collide in a shared sandbox.
 *
 * Access only through Cloud Functions (Admin SDK); client SDK is denied by
 * security rules. Public surface preserved 1:1 from the pre-Phase-0
 * implementation (`getTravelProfileConnection`, `saveTravelProfileConnection`,
 * `docIdForSandbox`, `COLLECTION`).
 */

const { createProfileConnectionStore } = require('./profileConnectionStoreFactory');

const COLLECTION = 'travelProfileConnections';

const store = createProfileConnectionStore({ collection: COLLECTION });

module.exports = {
  ...store,
  COLLECTION,
  getTravelProfileConnection: (sandbox) => store.get(sandbox),
  saveTravelProfileConnection: (sandbox, patch) => store.save(sandbox, patch),
};
