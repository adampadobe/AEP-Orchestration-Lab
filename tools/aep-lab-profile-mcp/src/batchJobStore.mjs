/**
 * Batch / onboard job persistence — Firestore (Cloud Run ADC) with in-memory fallback.
 */

import { randomUUID } from 'node:crypto';
import { getFirestoreDb } from './firestoreAdmin.mjs';

const COLLECTION = 'mcpProfileBatchJobs';

/** @type {Map<string, object>} */
const memoryStore = new Map();

let firestore = null;
let storeMode = 'memory';
let initAttempted = false;

async function initStore() {
  if (initAttempted) return firestore;
  initAttempted = true;

  if (String(process.env.AEP_LAB_MCP_BATCH_STORE || '').toLowerCase() === 'memory') {
    console.warn('[aep-lab-profile-mcp] Batch job store: in-memory (AEP_LAB_MCP_BATCH_STORE=memory). Jobs lost on restart.');
    return null;
  }

  firestore = await getFirestoreDb();
  if (firestore) {
    storeMode = 'firestore';
    console.log(JSON.stringify({ type: 'aep-lab-profile-mcp-batch-store', mode: 'firestore', collection: COLLECTION }));
  } else {
    console.warn('[aep-lab-profile-mcp] Firestore unavailable; using in-memory batch store.');
    storeMode = 'memory';
  }
  return firestore;
}

export function getBatchStoreMode() {
  return storeMode;
}

/**
 * @param {object} job
 * @param {string} [job.jobType]
 */
export async function createBatchJob(job) {
  await initStore();
  const id = randomUUID();
  const jobType = job.jobType || 'profile_batch';
  const record = {
    jobId: id,
    jobType,
    status: 'queued',
    progress: job.progress || { completed: 0, total: job.count || 0, failed: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    results: [],
    errors: [],
    params: job.params,
    storeMode,
  };

  if (firestore) {
    await firestore.collection(COLLECTION).doc(id).set(record);
  } else {
    memoryStore.set(id, { ...record });
  }
  return record;
}

/**
 * @param {string} jobId
 */
export async function getBatchJob(jobId) {
  await initStore();
  const id = String(jobId || '').trim();
  if (!id) return null;

  if (firestore) {
    const snap = await firestore.collection(COLLECTION).doc(id).get();
    return snap.exists ? snap.data() : null;
  }
  return memoryStore.get(id) || null;
}

/**
 * @param {string} jobId
 * @param {object} patch
 */
export async function updateBatchJob(jobId, patch) {
  await initStore();
  const id = String(jobId || '').trim();
  const updatedAt = new Date().toISOString();
  const payload = { ...patch, updatedAt };

  if (firestore) {
    await firestore.collection(COLLECTION).doc(id).set(payload, { merge: true });
    const snap = await firestore.collection(COLLECTION).doc(id).get();
    return snap.exists ? snap.data() : null;
  }

  const prev = memoryStore.get(id);
  if (!prev) return null;
  const next = { ...prev, ...payload };
  memoryStore.set(id, next);
  return next;
}
