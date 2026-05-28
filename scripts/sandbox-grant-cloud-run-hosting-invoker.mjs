#!/usr/bin/env node
/**
 * Grant roles/run.invoker to sc-demo-sbx-host-invoker on every Cloud Run
 * service in the sandbox project (Gen2 Firebase Functions).
 *
 * This does NOT replace allUsers for browser /api/* via Firebase Hosting — Hosting
 * does not invoke backends with this SA (see docs/FIREBASE_MULTI_PROJECT_DEPLOY.md).
 * Use this script when:
 * - Prototyping a single public apiGateway that calls other services with ADC/impersonation
 * - Server-to-server callers that act as this SA
 *
 * Usage:
 *   node scripts/sandbox-grant-cloud-run-hosting-invoker.mjs
 *   node scripts/sandbox-grant-cloud-run-hosting-invoker.mjs --dry-run
 */
import { spawnSync } from 'node:child_process';

const PROJECT = process.env.SANDBOX_GCP_PROJECT || 'adbe-gcp0819';
const REGION = process.env.CLOUD_FUNCTIONS_REGION || 'us-east4';
const HOSTING_INVOKER_SA =
  process.env.HOSTING_INVOKER_SA ||
  `sc-demo-sbx-host-invoker@${PROJECT}.iam.gserviceaccount.com`;
const dryRun = process.argv.includes('--dry-run');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim(), status: r.status };
}

const list = run('gcloud', [
  'run',
  'services',
  'list',
  '--project',
  PROJECT,
  '--region',
  REGION,
  '--format',
  'value(metadata.name)',
]);
if (!list.ok) {
  console.error(list.stderr || list.stdout);
  process.exit(1);
}

const names = list.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
console.log(
  `Project ${PROJECT} region ${REGION}: ${names.length} Cloud Run service(s) → ${HOSTING_INVOKER_SA}`,
);

let ok = 0;
let fail = 0;
for (const name of names) {
  if (dryRun) {
    console.log(`[dry-run] would bind ${HOSTING_INVOKER_SA} → ${name}`);
    ok += 1;
    continue;
  }
  const bind = run('gcloud', [
    'run',
    'services',
    'add-iam-policy-binding',
    name,
    '--project',
    PROJECT,
    '--region',
    REGION,
    '--member',
    `serviceAccount:${HOSTING_INVOKER_SA}`,
    '--role',
    'roles/run.invoker',
  ]);
  if (bind.ok) {
    console.log(`✓ ${name}`);
    ok += 1;
  } else {
    console.error(`✗ ${name}: ${(bind.stderr || bind.stdout).split('\n')[0]}`);
    fail += 1;
  }
}

console.log(`Done: ${ok} ok, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
