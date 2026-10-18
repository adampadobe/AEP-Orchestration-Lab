'use strict';

const admin = require('firebase-admin');
const { randomUUID } = require('node:crypto');

const TTL_MS = 15 * 60 * 1000;
function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function createPlatformCleanupStore({ db = getDb, now = Date.now } = {}) {
  async function saveAudit(plan) {
    const id = randomUUID();
    const expiresAtMs = now() + TTL_MS;
    await db().collection('platformCleanupAudits').doc(id).create({
      ...plan, expiresAtMs, used: false,
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
    });
    return { audit_id: id, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  async function consumeAudit(id, expected) {
    const database = db();
    const ref = database.collection('platformCleanupAudits').doc(id);
    return database.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const plan = snap.exists ? snap.data() : null;
      if (!plan || plan.used || !Number.isFinite(plan.expiresAtMs) || plan.expiresAtMs <= now()
          || Object.entries(expected).some(([key, value]) => plan[key] !== value)) {
        throw Object.assign(new Error('Audit is missing, expired, used, or belongs to a different principal/resource. Run a fresh audit.'), { status: 409 });
      }
      tx.update(ref, { used: true });
      return plan;
    });
  }
  return { saveAudit, consumeAudit };
}

module.exports = { createPlatformCleanupStore, ...createPlatformCleanupStore() };
