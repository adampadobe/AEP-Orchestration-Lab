#!/usr/bin/env node
/**
 * Seed Firestore mcpSandboxAllowlist/{keyId} for a colleague's MCP API key.
 *
 * Usage:
 *   node scripts/seed-mcp-sandbox-allowlist.mjs --key-id abc123def456 --sandboxes kirkham --label kirkham
 *   node scripts/seed-mcp-sandbox-allowlist.mjs --api-key "$AEP_LAB_MCP_API_KEY" --sandboxes kirkham --label kirkham
 *   node scripts/seed-mcp-sandbox-allowlist.mjs --dry-run --api-key test --sandboxes apalmer,kirkham --label shared
 *
 * Requires ADC (gcloud auth application-default login) or Cloud Run service account.
 * Project: GOOGLE_CLOUD_PROJECT or aep-orchestration-lab
 */

import { createHash } from 'node:crypto';

function parseArgs(argv) {
  const out = { keyId: '', apiKey: '', sandboxes: '', label: '', dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--key-id' && argv[i + 1]) out.keyId = String(argv[++i]).trim();
    else if (a === '--api-key' && argv[i + 1]) out.apiKey = String(argv[++i]).trim();
    else if (a === '--sandboxes' && argv[i + 1]) out.sandboxes = String(argv[++i]).trim();
    else if (a === '--label' && argv[i + 1]) out.label = String(argv[++i]).trim();
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function keyIdFromApiKey(apiKey) {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

async function main() {
  const args = parseArgs(process.argv);
  const keyId = args.keyId || (args.apiKey ? keyIdFromApiKey(args.apiKey) : '');
  if (!keyId) {
    throw new Error('Provide --key-id or --api-key');
  }
  const allowedSandboxes = args.sandboxes
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowedSandboxes.length === 0) {
    throw new Error('Provide --sandboxes (comma-separated, e.g. kirkham or apalmer,kirkham)');
  }

  const doc = {
    allowedSandboxes,
    principalLabel: args.label || null,
    updatedAt: new Date().toISOString(),
  };

  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, collection: 'mcpSandboxAllowlist', docId: keyId, doc }, null, 2));
    return;
  }

  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  if (!getApps().length) {
    initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'aep-orchestration-lab' });
  }
  const db = getFirestore();
  await db.collection('mcpSandboxAllowlist').doc(keyId).set({
    ...doc,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        collection: 'mcpSandboxAllowlist',
        docId: keyId,
        allowedSandboxes,
        principalLabel: args.label || null,
        note: 'Colleague can call lab_mcp_access_info to verify allowlist without redeploy.',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
