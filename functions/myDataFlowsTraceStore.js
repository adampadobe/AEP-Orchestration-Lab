'use strict';

const COLLECTION = 'myDataFlowsTraces';
const fail = (status, message) => Object.assign(new Error(message), { status, tracePublic: true });

function createMyDataFlowsTraceStore(db, now = () => new Date()) {
  const account = (uid) => db.collection(COLLECTION).doc(uid);
  const receipt = (uid, id) => account(uid).collection('runs').doc(id);
  async function get(uid, id) {
    let selected = id;
    if (!selected) selected = (await account(uid).get()).data()?.latestId;
    if (!selected) return null;
    const snapshot = await receipt(uid, selected).get();
    return snapshot.exists ? snapshot.data() : null;
  }
  async function reserve(uid, run) {
    return db.runTransaction(async (tx) => {
      const ref = receipt(uid, run.id);
      const [existing, owner] = await Promise.all([tx.get(ref), tx.get(account(uid))]);
      if (existing.exists) {
        const saved = existing.data();
        if (saved.industry !== run.industry) throw fail(409, 'This request belongs to a different industry.');
        return { created: false, run: saved };
      }
      const latestId = owner.data()?.latestId;
      const latest = latestId ? (await tx.get(receipt(uid, latestId))).data() : null;
      if (latest?.state === 'creating') {
        throw fail(409, 'A creation is already in progress or its outcome needs inspection. Resume that trace; do not generate again.');
      }
      if (latest && now().getTime() - Date.parse(latest.createdAt) < 60_000) {
        throw fail(429, 'Wait at least one minute before creating another test profile.');
      }
      tx.set(ref, run);
      tx.set(account(uid), { latestId: run.id }, { merge: true });
      return { created: true, run };
    });
  }
  async function update(uid, id, patch) {
    const ref = receipt(uid, id);
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw fail(404, 'Trace receipt not found.');
      tx.update(ref, { ...patch, updatedAt: now().toISOString() });
    });
    return get(uid, id);
  }
  async function claimCheck(uid, id) {
    const ref = receipt(uid, id);
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw fail(404, 'Trace receipt not found.');
      const run = snapshot.data();
      const stamp = now().getTime();
      if (run.state === 'creating' || !run.identity || stamp < (run.checkLeaseUntil || 0)) return null;
      // The lease outlives the bounded reads and also rate-limits manual refresh.
      tx.update(ref, { checkLeaseUntil: stamp + 120_000 });
      return run;
    });
  }
  return { get, reserve, update, claimCheck };
}

module.exports = { createMyDataFlowsTraceStore };
