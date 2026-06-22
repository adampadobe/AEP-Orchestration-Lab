import { createHash } from 'node:crypto';

/**
 * Derive a non-secret key identifier for audit logs.
 * @param {string} apiKey
 */
export function keyIdFromApiKey(apiKey) {
  if (!apiKey) return 'anonymous';
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

/**
 * Phase 1: structured JSON to stdout.
 * Phase 2 (optional): persist to Firestore — stub commented below.
 *
 * @param {object} entry
 */
export function writeAuditLog(entry) {
  const payload = {
    type: 'aep-lab-profile-mcp-audit',
    timestamp: new Date().toISOString(),
    ...entry,
  };
  console.log(JSON.stringify(payload));

  // Phase 2 — Firestore audit trail (uncomment when Admin SDK + collection rules exist):
  // import { getFirestore } from 'firebase-admin/firestore';
  // await getFirestore().collection('mcpProfileAuditLog').add(payload);
}
