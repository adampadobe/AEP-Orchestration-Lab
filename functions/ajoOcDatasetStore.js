'use strict';

const admin = require('firebase-admin');
const { randomUUID } = require('node:crypto');

const PREFLIGHT_TTL_MS = 15 * 60 * 1000;

function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function createAjoOcDatasetStore({ db = getDb, now = Date.now, randomId = randomUUID } = {}) {
  async function savePreflight(plan) {
    const id = randomId();
    const expiresAtMs = now() + PREFLIGHT_TTL_MS;
    await db().collection('ajoOcDatasetPreflights').doc(id).create({
      ...plan,
      preflightId: id,
      expiresAtMs,
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
      used: false,
      createdAt: admin.firestore.Timestamp.fromMillis(now()),
    });
    return { preflight_id: id, expires_at: new Date(expiresAtMs).toISOString() };
  }

  async function consumePreflight(id, expected) {
    const database = db();
    const ref = database.collection('ajoOcDatasetPreflights').doc(String(id || ''));
    return database.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const plan = snap.exists ? snap.data() : null;
      if (!plan || plan.used || !Number.isFinite(plan.expiresAtMs) || plan.expiresAtMs <= now()
          || Object.entries(expected).some(([key, value]) => JSON.stringify(plan[key]) !== JSON.stringify(value))) {
        throw Object.assign(
          new Error('Preflight is missing, expired, used, or changed. Run a fresh preview and confirm again.'),
          { status: 409 },
        );
      }
      tx.update(ref, { used: true, consumedAt: admin.firestore.Timestamp.fromMillis(now()) });
      return plan;
    });
  }

  async function createBatch(record) {
    const batchJobId = randomId();
    const timestamp = now();
    await db().collection('ajoOcDatasetBatches').doc(batchJobId).create({
      ...record,
      batchJobId,
      createdAtMs: timestamp,
      updatedAtMs: timestamp,
      createdAt: admin.firestore.Timestamp.fromMillis(timestamp),
      updatedAt: admin.firestore.Timestamp.fromMillis(timestamp),
    });
    return batchJobId;
  }

  async function updateBatch(id, patch) {
    const timestamp = now();
    await db().collection('ajoOcDatasetBatches').doc(String(id)).update({
      ...patch,
      updatedAtMs: timestamp,
      updatedAt: admin.firestore.Timestamp.fromMillis(timestamp),
    });
  }

  async function getBatch(id, expected) {
    const snap = await db().collection('ajoOcDatasetBatches').doc(String(id || '')).get();
    const batch = snap.exists ? snap.data() : null;
    if (!batch || Object.entries(expected).some(([key, value]) => batch[key] !== value)) {
      throw Object.assign(new Error('Batch job was not found in this principal, organisation, and sandbox scope.'), { status: 404 });
    }
    return batch;
  }

  async function findJobs(jobIds, expected) {
    const wanted = new Set(jobIds);
    const snapshot = await db().collection('ajoOcDatasetBatches')
      .where('principalUid', '==', expected.principalUid)
      .get();
    const matches = [];
    for (const doc of snapshot.docs) {
      const batch = doc.data();
      if (batch.orgId !== expected.orgId || batch.sandbox !== expected.sandbox) continue;
      for (const item of batch.items || []) {
        if (wanted.has(item.job_id)) matches.push({ batch_job_id: doc.id, ...item });
      }
    }
    return matches;
  }

  async function writeAudit(entry) {
    const timestamp = now();
    await db().collection('ajoOcDatasetAudit').add({
      ...entry,
      timestampMs: timestamp,
      timestamp: admin.firestore.Timestamp.fromMillis(timestamp),
    });
  }

  return { savePreflight, consumePreflight, createBatch, updateBatch, getBatch, findJobs, writeAudit };
}

module.exports = { PREFLIGHT_TTL_MS, createAjoOcDatasetStore, ...createAjoOcDatasetStore() };
