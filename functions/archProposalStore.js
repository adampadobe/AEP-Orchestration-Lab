/**
 * Per-sandbox Architecture Diagram proposal snapshots + shared baseline ("master").
 * All reads/writes go through Admin SDK; client rules deny all.
 *
 * Collections:
 *   architectureMasters/default                         — shared baseline snapshot
 *   architectureProposals/{sandbox__proposalId}         — per-sandbox named snapshot
 */

const admin = require('firebase-admin');

const PROPOSAL_COLLECTION = 'architectureProposals';
const MASTER_COLLECTION = 'architectureMasters';
const MASTER_DOC_ID = 'default';
/** Only this sandbox may write to the shared master baseline. */
const MASTER_OWNER_SANDBOX = 'apalmer';
const MAX_SNAPSHOT_CHARS = 1_500_000;
const MAX_NAME_CHARS = 120;

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function safeSlug(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

function proposalDocId(sandbox, id) {
  return `${safeSlug(sandbox || 'default')}__${safeSlug(id)}`.slice(0, 400);
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('snapshot must be an object');
  }
  const encoded = JSON.stringify(snapshot);
  if (encoded.length > MAX_SNAPSHOT_CHARS) {
    throw new Error(`snapshot too large (${encoded.length} chars, max ${MAX_SNAPSHOT_CHARS})`);
  }
  return snapshot;
}

function stripForSummary(record) {
  if (!record) return null;
  const { snapshot, ...rest } = record;
  return { ...rest, hasSnapshot: !!snapshot };
}

async function listProposals(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return [];
  const snap = await getDb()
    .collection(PROPOSAL_COLLECTION)
    .where('sandbox', '==', name)
    .get();
  const items = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    items.push(stripForSummary({ id: data.proposalId || d.id, ...data }));
  });
  items.sort((a, b) => {
    const at = (a.updatedAt && a.updatedAt.toMillis && a.updatedAt.toMillis()) || 0;
    const bt = (b.updatedAt && b.updatedAt.toMillis && b.updatedAt.toMillis()) || 0;
    return bt - at;
  });
  return items;
}

async function getProposal(sandbox, id) {
  const name = String(sandbox || '').trim();
  const pid = String(id || '').trim();
  if (!name || !pid) return null;
  const ref = getDb().collection(PROPOSAL_COLLECTION).doc(proposalDocId(name, pid));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.sandbox && data.sandbox !== name) return null;
  return { id: data.proposalId || snap.id, ...data };
}

async function saveProposal(sandbox, payload) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const label = String((payload && payload.name) || '').trim().slice(0, MAX_NAME_CHARS);
  if (!label) throw new Error('name is required');
  const snapshot = validateSnapshot(payload && payload.snapshot);
  const pid = String((payload && payload.id) || '').trim() || genId();
  const ref = getDb().collection(PROPOSAL_COLLECTION).doc(proposalDocId(name, pid));

  await getDb().runTransaction(async (tx) => {
    const prev = await tx.get(ref);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const base = prev.exists ? prev.data() : {};
    tx.set(
      ref,
      {
        sandbox: name,
        proposalId: pid,
        name: label,
        snapshot,
        createdAt: base.createdAt || now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  const after = await ref.get();
  return after.exists ? { id: pid, ...after.data() } : null;
}

async function deleteProposal(sandbox, id) {
  const name = String(sandbox || '').trim();
  const pid = String(id || '').trim();
  if (!name || !pid) return false;
  const ref = getDb().collection(PROPOSAL_COLLECTION).doc(proposalDocId(name, pid));
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  if (data.sandbox && data.sandbox !== name) return false;
  await ref.delete();
  return true;
}

async function getMaster() {
  const ref = getDb().collection(MASTER_COLLECTION).doc(MASTER_DOC_ID);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function saveMaster(sandbox, payload) {
  const name = String(sandbox || '').trim();
  if (name !== MASTER_OWNER_SANDBOX) {
    const err = new Error(`Only sandbox "${MASTER_OWNER_SANDBOX}" may save the master.`);
    err.code = 'master-forbidden';
    throw err;
  }
  const snapshot = validateSnapshot(payload && payload.snapshot);
  const ref = getDb().collection(MASTER_COLLECTION).doc(MASTER_DOC_ID);
  await getDb().runTransaction(async (tx) => {
    const prev = await tx.get(ref);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const base = prev.exists ? prev.data() : {};
    tx.set(
      ref,
      {
        snapshot,
        savedBySandbox: name,
        createdAt: base.createdAt || now,
        updatedAt: now,
      },
      { merge: true }
    );
  });
  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

module.exports = {
  listProposals,
  getProposal,
  saveProposal,
  deleteProposal,
  getMaster,
  saveMaster,
  MASTER_OWNER_SANDBOX,
};
