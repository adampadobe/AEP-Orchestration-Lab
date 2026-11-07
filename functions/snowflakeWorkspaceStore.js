'use strict';

const {scopeId, assert} = require('./snowflakeWorkspacePolicy');
const COLLECTIONS = Object.freeze({policies: 'snowflakeWorkspacePolicies',
  jobs: 'snowflakeWorkspaceJobs', previews: 'snowflakeWorkspacePreviews'});

// Administrators own policy documents. Configure Firestore TTL on expireAt for
// jobs/previews; previews contain SQL/bindings for ten minutes. Jobs retain only
// hashes, ownership, context, query IDs and audit state for 24 hours, never rows.
function createFirestoreStore(db) {
  const ref = (kind, id) => db.collection(COLLECTIONS[kind]).doc(id);
  const read = async (kind, id) => { const s = await ref(kind, id).get(); return s.exists ? s.data() : null; };
  return {
    getPolicy: (uid, sandbox) => read('policies', scopeId(uid, sandbox)),
    get: read,
    async create(kind, id, value) {
      return db.runTransaction(async tx => {
        const r = ref(kind, id), snapshot = await tx.get(r);
        if (snapshot.exists) return false;
        tx.create(r, value); return true;
      });
    },
    async update(kind, id, patch) { await ref(kind, id).update(patch); },
    async transition(kind, id, expected, patch) {
      return db.runTransaction(async tx => {
        const r = ref(kind, id), s = await tx.get(r);
        if (!s.exists || !expected.includes(s.data().state)) return false;
        tx.update(r, patch); return true;
      });
    },
    async claimChange(previewId, jobId, job) {
      return db.runTransaction(async tx => {
        const p = ref('previews', previewId), j = ref('jobs', jobId);
        const [ps, js] = await Promise.all([tx.get(p), tx.get(j)]);
        assert(ps.exists && ps.data().state === 'approved' && !js.exists,
          'ALREADY_CLAIMED', 'Approval has already been used or is not recorded.');
        tx.update(p, {state: 'applying', job_id: jobId});
        tx.create(j, job);
      });
    },
  };
}
module.exports = {COLLECTIONS, createFirestoreStore};
