#!/usr/bin/env node
/**
 * Deploy fake-loyalty-provider to Cloud Run (GCP project aep-orchestration-lab).
 *
 * Requires: gcloud CLI authenticated, FAKE_LOYALTY_API_KEY in env (never commit).
 *
 * Usage:
 *   FAKE_LOYALTY_API_KEY='your-secret' npm run fake-loyalty:deploy
 *   node tools/fake-loyalty-provider/deploy-cloud-run.mjs --project aep-orchestration-lab
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceRoot = __dirname;

function parseArgs(argv) {
  const out = {
    project: process.env.GCP_PROJECT || 'aep-orchestration-lab',
    region: process.env.GCP_REGION || 'us-central1',
    service: process.env.FAKE_LOYALTY_SERVICE_NAME || 'fake-loyalty-provider',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--project' && argv[i + 1]) out.project = String(argv[++i]).trim();
    else if (a === '--region' && argv[i + 1]) out.region = String(argv[++i]).trim();
    else if (a === '--service' && argv[i + 1]) out.service = String(argv[++i]).trim();
  }
  return out;
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

const apiKey = String(process.env.FAKE_LOYALTY_API_KEY || '').trim();
if (!apiKey) {
  console.error('Set FAKE_LOYALTY_API_KEY in the environment before deploy (never commit secrets).');
  process.exit(1);
}

const { project, region, service } = parseArgs(process.argv);

console.log(`Deploying ${service} to Cloud Run (${project}, ${region})…`);

run('gcloud', [
  'run', 'deploy', service,
  '--source', serviceRoot,
  '--project', project,
  '--region', region,
  '--platform', 'managed',
  '--allow-unauthenticated',
  '--set-env-vars', `FAKE_LOYALTY_API_KEY=${apiKey}`,
  '--quiet',
]);

const urlResult = spawnSync('gcloud', [
  'run', 'services', 'describe', service,
  '--project', project,
  '--region', region,
  '--format', 'value(status.url)',
], { encoding: 'utf8' });

const url = String(urlResult.stdout || '').trim();
if (url) {
  console.log('');
  console.log('Deployed URL:', url);
  console.log('Health check:', `${url}/health`);
  console.log('Fulfillment endpoint (register in AJO Loyalty admin):', `${url}/v1/fulfill`);
  console.log('');
  console.log('Register with: npm run ajo:loyalty-register-provider -- --url', `${url}/v1/fulfill`);
}
