'use strict';

/**
 * Serialize Firestore Admin SDK document payloads for JSON HTTP responses.
 * Converts Timestamp fields (e.g. updatedAt) to ISO strings.
 *
 * @param {Record<string, unknown> | null | undefined} doc
 * @returns {Record<string, unknown> | null}
 */
function serializeFirestoreRecord(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const o = { ...doc };
  if (o.updatedAt && typeof o.updatedAt.toDate === 'function') {
    o.updatedAt = o.updatedAt.toDate().toISOString();
  }
  return o;
}

module.exports = { serializeFirestoreRecord };
