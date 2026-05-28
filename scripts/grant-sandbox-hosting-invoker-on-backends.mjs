#!/usr/bin/env node
/**
 * Grant roles/run.invoker to sc-demo-sandbox-hosting-invoker on every Cloud Run
 * service in the sandbox project EXCEPT the public API gateway (sandboxapigateway).
 *
 * Usage:
 *   node scripts/grant-sandbox-hosting-invoker-on-backends.mjs
 *   node scripts/grant-sandbox-hosting-invoker-on-backends.mjs --dry-run
 */
import { spawnSync } from 'node:child_process';

const PROJECT = process.env.SANDBOX_GCP_PROJECT || 'adbe-gcp0819';
const REGION = process.env.CLOUD_FUNCTIONS_REGION || 'us-east4';
const HOSTING_INVOKER_SA =
  process.env.HOSTING_INVOKER_SA ||
  `sc-demo-sandbox-hosting-invoker@${PROJECT}.iam.gserviceaccount.com`;
/** Cloud Run service id for exports.sandboxApiGateway (Gen2 lowercase name). */
const GATEWAY_SERVICE_NAMES = new Set(
  (process.env.GATEWAY_RUN_SERVICE_NAMES || 'sandboxapigateway')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const dryRun = process.argv.includes('--dry-run');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
    status: r.status,
  };
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

const allNames = list.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
const names = allNames.filter((name) => !GATEWAY_SERVICE_NAMES.has(name.toLowerCase()));

console.log(
  `Project ${PROJECT} region ${REGION}: grant ${HOSTING_INVOKER_SA} on ${names.length} backend(s) (skip gateway: ${[...GATEWAY_SERVICE_NAMES].join(', ')})`,
);

let ok = 0;
let fail = 0;
let skipped = 0;
for (const name of allNames) {
  if (GATEWAY_SERVICE_NAMES.has(name.toLowerCase())) {
    console.log(`⊘ skip gateway ${name}`);
    skipped += 1;
    continue;
  }
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

console.log(`Done: ${ok} ok, ${fail} failed, ${skipped} gateway skipped`);
process.exit(fail > 0 ? 1 : 0);
