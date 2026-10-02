/**
 * Persist the DPS-accepted itemTags write format per sandbox, once discovered
 * live (see decisioningTagBulkService.js). Same pattern as catalogConfigStore.js.
 */

const admin = require('firebase-admin');

const COLLECTION = 'decisioningTagFormat';

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function docId(sandbox) {
  const s = String(sandbox || 'default').trim() || 'default';
  return s.replace(/[/\s.#$\[\]]/g, '_').slice(0, 700);
}

async function getTagFormat(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return null;
  const snap = await getDb().collection(COLLECTION).doc(docId(name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return (data && data.format) || null;
}

async function saveTagFormat(sandbox, format) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  await getDb()
    .collection(COLLECTION)
    .doc(docId(name))
    .set(
      {
        sandbox: name,
        format: String(format || '').trim(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

module.exports = {
  COLLECTION,
  docId,
  getTagFormat,
  saveTagFormat,
};
