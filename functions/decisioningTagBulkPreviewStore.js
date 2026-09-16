/**
 * Persist a resolved lab_decisioning_tag_bulk_preview plan, keyed by its own
 * preview_hash, so lab_decisioning_tag_bulk_apply can be called with just
 * {sandbox, preview_hash, confirmed, resume_token} — the potentially large
 * resolved_tags/matched_offers lists never need to be resent by the caller.
 * This is the one write pair in the Decisioning MCP that isn't fully
 * stateless; every per-item write still re-reads the live offer immediately
 * before patching it (see decisioningTagBulkService.applyTagChangeToOffer),
 * so a stale cached preview can only ever under-apply (no-op) or be rejected
 * as expired — never silently overwrite a concurrent change.
 */

const admin = require('firebase-admin');

const COLLECTION = 'decisioningTagBulkPreview';
const TTL_MS = 60 * 60 * 1000; // 1 hour

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

async function savePreview(previewHash, plan) {
  await getDb()
    .collection(COLLECTION)
    .doc(previewHash)
    .set({
      ...plan,
      preview_hash: previewHash,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    });
}

async function getPreview(previewHash) {
  const snap = await getDb().collection(COLLECTION).doc(String(previewHash || '')).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data) return null;
  if (typeof data.createdAtMs === 'number' && Date.now() - data.createdAtMs > TTL_MS) {
    return null;
  }
  return data;
}

module.exports = {
  COLLECTION,
  TTL_MS,
  savePreview,
  getPreview,
};
