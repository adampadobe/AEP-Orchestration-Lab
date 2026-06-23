/**
 * Firestore eventEdgeConfig read/write for MCP (shared sandbox docs).
 * Mirrors functions/eventConfigStore.js shared collection path.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreDb } from './firestoreAdmin.mjs';

const COLLECTION = 'eventEdgeConfig';

/**
 * @param {string} sandbox
 * @returns {string}
 */
export function eventConfigDocId(sandbox) {
  const s = String(sandbox || 'default').trim() || 'default';
  return s.replace(/[/\s.#$\[\]]/g, '_').slice(0, 700);
}

function trim(val, max) {
  if (val == null) return '';
  return String(val).trim().slice(0, max);
}

/**
 * @param {string} sandbox
 * @returns {Promise<object | null>}
 */
export async function getSharedEventConfig(sandbox) {
  const db = await getFirestoreDb();
  if (!db) return null;
  const name = String(sandbox || '').trim();
  if (!name) return null;
  const snap = await db.collection(COLLECTION).doc(eventConfigDocId(name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

/**
 * Merge patch into shared sandbox eventEdgeConfig doc.
 * @param {string} sandbox
 * @param {object} patch
 * @returns {Promise<object | null>}
 */
export async function saveSharedEventConfig(sandbox, patch) {
  const db = await getFirestoreDb();
  if (!db) {
    throw new Error('Firestore unavailable — cannot save event config from MCP.');
  }
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');

  const ref = db.collection(COLLECTION).doc(eventConfigDocId(name));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data() ? snap.data() : {};

    const merged = {
      sandbox: name,
      datastreamId: trim(
        patch.datastreamId !== undefined ? patch.datastreamId : prev.datastreamId,
        256,
      ),
      datastreamTitle: trim(
        patch.datastreamTitle !== undefined ? patch.datastreamTitle : prev.datastreamTitle,
        256,
      ),
      schemaTitle: trim(
        patch.schemaTitle !== undefined ? patch.schemaTitle : prev.schemaTitle,
        256,
      ),
      schemaId: trim(patch.schemaId !== undefined ? patch.schemaId : prev.schemaId, 384),
      datasetName: trim(
        patch.datasetName !== undefined ? patch.datasetName : prev.datasetName,
        256,
      ),
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}
