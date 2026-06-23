import { createHash } from 'node:crypto';
import { getFirestoreDb } from './firestoreAdmin.mjs';

const COLLECTION = 'mcpProfileAuditLog';

/**
 * Derive a non-secret key identifier for audit logs.
 * @param {string} apiKey
 */
export function keyIdFromApiKey(apiKey) {
  if (!apiKey) return 'anonymous';
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

/**
 * Structured audit log — stdout (Cloud Logging) + Firestore persistence.
 *
 * @param {object} entry
 * @param {string} [entry.keyId]
 * @param {string} [entry.tool]
 * @param {string} [entry.sandbox]
 * @param {string} [entry.industry]
 * @param {string} [entry.email]
 * @param {string} [entry.identifier]
 * @param {string} [entry.emailDomain]
 * @param {'ok'|'error'} [entry.result]
 * @param {number} [entry.durationMs]
 */
export function writeAuditLog(entry) {
  const payload = {
    type: 'aep-lab-profile-mcp-audit',
    timestamp: new Date().toISOString(),
    ...entry,
  };
  console.log(JSON.stringify(payload));

  persistAuditLog(payload).catch((err) => {
    console.warn('[aep-lab-profile-mcp] audit Firestore write failed:', err?.message || err);
  });
}

/**
 * @param {object} payload
 */
async function persistAuditLog(payload) {
  const db = await getFirestoreDb();
  if (!db) return;

  const doc = {
    timestamp: payload.timestamp,
    keyId: payload.keyId || null,
    tool: payload.tool || null,
    sandbox: payload.sandbox || null,
    industry: payload.industry || null,
    email: payload.email || payload.identifier || null,
    identifier: payload.identifier || payload.email || null,
    result: payload.result || (payload.error ? 'error' : 'ok'),
    durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : null,
    jobId: payload.jobId || null,
    count: payload.count ?? null,
    status: payload.status || null,
  };

  await db.collection(COLLECTION).add(doc);
}
