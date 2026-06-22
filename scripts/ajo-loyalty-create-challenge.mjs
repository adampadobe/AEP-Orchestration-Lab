#!/usr/bin/env node
/**
 * Create a minimal AJO Loyalty purchase task + Standard challenge (draft).
 *
 * POST /ajo/loyalty/metadata/tasks
 * POST /ajo/loyalty/metadata/challenges
 *
 * Gracefully exits with guidance if Loyalty Challenges beta APIs return 403/404.
 *
 * Usage:
 *   npm run ajo:loyalty-create-challenge -- \
 *     --sandbox apalmer \
 *     --audience-id <aep-segment-uuid> \
 *     --provider-guid <reward-provider-guid> \
 *     --reward-definition points
 *
 * Env: ADOBE_* from ~/.config/adobe-ims/credentials.env
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const credPath = join(homedir(), '.config', 'adobe-ims', 'credentials.env');

function loadEnvFile(filePath) {
  const out = {};
  if (!filePath || !existsSync(filePath)) return out;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function mergeCredentialsIntoEnv(filePath) {
  for (const [k, v] of Object.entries(loadEnvFile(filePath))) {
    if (v == null || String(v).trim() === '') continue;
    if (process.env[k] == null || String(process.env[k]).trim() === '') process.env[k] = v;
  }
}

function parseArgs(argv) {
  const out = {
    sandbox: '',
    audienceId: '',
    providerGuid: '',
    rewardDefinition: 'points',
    rewardValue: '100',
    taskId: `lab-purchase-${Date.now()}`,
    challengeName: 'AEP Lab Standard Challenge',
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sandbox' && argv[i + 1]) out.sandbox = String(argv[++i]).trim();
    else if (a === '--audience-id' && argv[i + 1]) out.audienceId = String(argv[++i]).trim();
    else if (a === '--provider-guid' && argv[i + 1]) out.providerGuid = String(argv[++i]).trim();
    else if (a === '--reward-definition' && argv[i + 1]) out.rewardDefinition = String(argv[++i]).trim();
    else if (a === '--reward-value' && argv[i + 1]) out.rewardValue = String(argv[++i]).trim();
    else if (a === '--task-id' && argv[i + 1]) out.taskId = String(argv[++i]).trim();
    else if (a === '--name' && argv[i + 1]) out.challengeName = String(argv[++i]).trim();
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function imsToken() {
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  const clientSecret = process.env.ADOBE_CLIENT_SECRET;
  const scopes = process.env.ADOBE_SCOPES;
  if (!clientId || !clientSecret || !scopes) {
    throw new Error('Missing ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, or ADOBE_SCOPES.');
  }
  const imsUrl = process.env.ADOBE_IMS_TOKEN_URL || 'https://ims-na1.adobelogin.com/ims/token/v3';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: scopes,
  });
  const r = await fetch(imsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`IMS ${r.status}: ${data.error_description || data.error || r.statusText}`);
  }
  return data.access_token;
}

async function loyaltyFetch(auth, method, path, json) {
  const url = `https://platform.adobe.io/ajo${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'x-api-key': auth.clientId,
    'x-gw-ims-org-id': auth.orgId,
    'x-sandbox-name': auth.sandbox,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const init = { method, headers };
  if (json != null && method !== 'GET') init.body = JSON.stringify(json);
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _raw: text.slice(0, 12000) };
  }
  return { res, url, parsed, text };
}

function isoDaysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function buildTask({ taskId, providerGuid, rewardDefinition, rewardValue }) {
  return {
    taskType: 'purchase',
    taskId,
    taskName: 'Lab purchase task',
    desc: 'Minimal purchase task for AEP Orchestration Lab',
    variables: {
      goal: 1,
      type: 'qty',
      include: { valuesSet: ['commerce.purchases.value'] },
      qtyMin: 1,
    },
    schedule: {
      duration: 'task',
      maxRepeat: 1,
    },
    reward: {
      endpoint: providerGuid,
      definition: rewardDefinition,
      rewardValue,
    },
  };
}

function buildChallenge({ name, audienceId, task, providerGuid, rewardDefinition, rewardValue }) {
  return {
    name,
    desc: 'Lab demo Standard loyalty challenge (API-created draft)',
    startDate: isoDaysFromNow(0),
    endDate: isoDaysFromNow(90),
    state: 'draft',
    audienceId,
    tasksToComplete: 1,
    tasks: [task],
    reward: {
      endpoint: providerGuid,
      definition: rewardDefinition,
      rewardValue,
    },
  };
}

function printBetaBlocked(status, parsed, context) {
  console.warn('');
  console.warn(`${context} returned HTTP ${status}.`);
  console.warn('Loyalty Challenges metadata APIs require private beta access on this org/sandbox.');
  console.warn('Create the challenge manually in Loyalty admin, or request beta from your Adobe admin.');
  if (parsed && Object.keys(parsed).length) {
    console.warn(JSON.stringify(parsed, null, 2));
  }
  console.warn('');
  process.exit(0);
}

async function main() {
  mergeCredentialsIntoEnv(credPath);
  const args = parseArgs(process.argv);

  if (!args.audienceId || !args.providerGuid) {
    console.error('Required: --audience-id <segment-uuid> --provider-guid <reward-provider-guid>');
    console.error('Optional: --sandbox apalmer --reward-definition points --reward-value 100');
    process.exit(1);
  }

  const sandbox = args.sandbox || process.env.ADOBE_SANDBOX_NAME || 'apalmer';
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  if (!clientId || !orgId) {
    throw new Error('Missing ADOBE_CLIENT_ID or ADOBE_IMS_ORG.');
  }

  const task = buildTask(args);
  const challenge = buildChallenge({ ...args, name: args.challengeName, task });

  if (args.dryRun) {
    console.log('Dry run — task payload:');
    console.log(JSON.stringify(task, null, 2));
    console.log('Dry run — challenge payload:');
    console.log(JSON.stringify(challenge, null, 2));
    return;
  }

  const token = await imsToken();
  const auth = { token, clientId, orgId, sandbox };

  console.log(`Creating purchase task in sandbox "${sandbox}"…`);
  const taskResult = await loyaltyFetch(auth, 'POST', '/loyalty/metadata/tasks', task);
  if (taskResult.res.status === 403 || taskResult.res.status === 404) {
    printBetaBlocked(taskResult.res.status, taskResult.parsed, 'POST /loyalty/metadata/tasks');
  }
  if (!taskResult.res.ok) {
    console.error(`POST ${taskResult.url} → ${taskResult.res.status}`);
    console.error(JSON.stringify(taskResult.parsed, null, 2));
    process.exit(1);
  }
  console.log('Task created:', taskResult.parsed.taskId || args.taskId);

  console.log(`Creating challenge "${args.challengeName}"…`);
  const challengeResult = await loyaltyFetch(auth, 'POST', '/loyalty/metadata/challenges', challenge);
  if (challengeResult.res.status === 403 || challengeResult.res.status === 404) {
    printBetaBlocked(challengeResult.res.status, challengeResult.parsed, 'POST /loyalty/metadata/challenges');
  }
  if (!challengeResult.res.ok) {
    console.error(`POST ${challengeResult.url} → ${challengeResult.res.status}`);
    console.error(JSON.stringify(challengeResult.parsed, null, 2));
    process.exit(1);
  }

  const challengeId = challengeResult.parsed.get_id || challengeResult.res.headers.get('x-resource-id');
  console.log('Challenge created (draft):', challengeId || '(see response)');
  console.log(JSON.stringify(challengeResult.parsed, null, 2));
  console.log('');
  console.log('Next: publish in Loyalty admin or POST /loyalty/metadata/challenges/{id}/publish');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
