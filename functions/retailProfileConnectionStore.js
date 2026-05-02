/**
 * Persist AEP Lab Retail Profile streaming + infra IDs per Adobe sandbox
 * (Firestore). Thin config wrapper around `profileConnectionStoreFactory`.
 *
 * Separate Firestore collection from each other industry's
 * `*ProfileConnections` so the (schema, dataset, dataflow) triplets never
 * collide in a shared sandbox.
 *
 * Access only through Cloud Functions (Admin SDK); client SDK is denied by
 * security rules.
 */

const { createProfileConnectionStore } = require('./profileConnectionStoreFactory');

const COLLECTION = 'retailProfileConnections';

const store = createProfileConnectionStore({ collection: COLLECTION });

module.exports = {
  ...store,
  COLLECTION,
};
