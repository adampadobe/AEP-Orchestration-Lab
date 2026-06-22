#!/usr/bin/env node
/**
 * Idempotent AJO Loyalty cleanup for a sandbox (default: apalmer).
 *
 * Deletes lab challenges, event definitions, and reward providers created by
 * prior lab setup runs. Safe to re-run.
 *
 * Usage:
 *   npm run ajo:loyalty-reset -- --sandbox apalmer
 *   npm run ajo:loyalty-reset -- --dry-run
 *
 * Env: ADOBE_* from ~/.config/adobe-ims/credentials.env
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const credPath = join(homedir(), '.config', 'adobe-ims', 'credentials.env');

const LEGACY_PROVIDER_GUID = '15b4d932-9d69-4c3a-b6bd-f8daa5656fdd';
const LEGACY_CHALLENGE_NAMES = [
  'AEP Lab Standard Challenge',
  'Buy 3 Coffees — Lab Challenge',
];
const LEGACY_EVENT_NAMES = [
  'AEP Lab Purchase Event',
  'AEP Lab Coffee Purchase Event',
];
const LEGACY_PROVIDER_NAMES = [
  'AEP Lab Fake Loyalty',
  'apalmer loyalty provider',
];

function labProviderNamesForSandbox(sandbox) {
  const sb = String(sandbox || 'apalmer').trim().toLowerCase();
  return [...LEGACY_PROVIDER_NAMES, `${sb} loyalty provider`];
}

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
    dryRun: false,
    keepConfig: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sandbox' && argv[i + 1]) out.sandbox = String(argv[++i]).trim();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--keep-config') out.keepConfig = true;
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
  return { token: data.access_token, clientId };
}

function platformHeaders(auth) {
  return {
    Authorization: `Bearer ${auth.token}`,
    'x-api-key': auth.clientId,
    'x-gw-ims-org-id': auth.orgId,
    'x-sandbox-name': auth.sandbox,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function loyaltyFetch(auth, method, path, json) {
  const url = `https://platform.adobe.io/ajo${path.startsWith('/') ? path : `/${path}`}`;
  const headers = platformHeaders(auth);
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

async function unpublishIfNeeded(auth, challengeId, dryRun) {
  const got = await loyaltyFetch(auth, 'GET', `/loyalty/metadata/challenges/${challengeId}`);
  if (!got.res.ok) return { ok: false, status: got.res.status, parsed: got.parsed };
  if (got.parsed.state !== 'published') return { ok: true, skipped: true };
  if (dryRun) return { ok: true, wouldUnpublish: true };
  const unpub = await loyaltyFetch(auth, 'POST', `/loyalty/metadata/challenges/${challengeId}/unpublish`);
  return { ok: unpub.res.ok, status: unpub.res.status, parsed: unpub.parsed };
}

async function deleteChallenge(auth, challenge, dryRun) {
  const id = challenge._id || challenge.id;
  if (!id) return { action: 'skip', reason: 'no id' };
  const unpub = await unpublishIfNeeded(auth, id, dryRun);
  if (!unpub.ok && !dryRun) {
    return { action: 'unpublish-failed', id, status: unpub.status, detail: unpub.parsed };
  }
  if (dryRun) return { action: 'would-delete-challenge', id, name: challenge.name };
  const del = await loyaltyFetch(auth, 'DELETE', `/loyalty/metadata/challenges/${id}`);
  return {
    action: del.res.ok ? 'deleted-challenge' : 'delete-challenge-failed',
    id,
    name: challenge.name,
    status: del.res.status,
    detail: del.res.ok ? null : del.parsed,
  };
}

async function deleteEvent(auth, event, dryRun) {
  const id = event.guid || event.id;
  if (!id) return { action: 'skip', reason: 'no guid' };
  if (dryRun) return { action: 'would-delete-event', id, name: event.name };
  const del = await loyaltyFetch(auth, 'DELETE', `/loyalty/metadata/config/events/${id}`);
  return {
    action: del.res.ok ? 'deleted-event' : 'delete-event-failed',
    id,
    name: event.name,
    status: del.res.status,
    detail: del.res.ok ? null : del.parsed,
  };
}

async function deleteProvider(auth, provider, dryRun) {
  const id = provider.guid || provider.name;
  if (!id) return { action: 'skip', reason: 'no guid' };
  if (dryRun) return { action: 'would-delete-provider', id, name: provider.name };
  const del = await loyaltyFetch(auth, 'DELETE', `/loyalty/metadata/config/rewards/providers/${id}`);
  return {
    action: del.res.ok ? 'deleted-provider' : 'delete-provider-failed',
    id,
    name: provider.name,
    status: del.res.status,
    detail: del.res.ok ? null : del.parsed,
  };
}

async function main() {
  mergeCredentialsIntoEnv(credPath);
  const args = parseArgs(process.argv);
  const sandbox = args.sandbox || process.env.ADOBE_SANDBOX_NAME || 'apalmer';
  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  if (!orgId) throw new Error('Missing ADOBE_IMS_ORG.');

  const { token, clientId } = await imsToken();
  const auth = { token, clientId, orgId, sandbox };

  console.log(`AJO Loyalty reset — sandbox "${sandbox}"${args.dryRun ? ' (dry run)' : ''}`);

  const report = {
    sandbox,
    dryRun: args.dryRun,
    challenges: [],
    events: [],
    providers: [],
    config: null,
  };

  const challengesList = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/challenges?limit=100');
  if (challengesList.res.ok) {
    const children = challengesList.parsed.children || [];
    for (const name of LEGACY_CHALLENGE_NAMES) {
      const match = children.find((c) => c.name === name);
      if (match) {
        report.challenges.push(await deleteChallenge(auth, match, args.dryRun));
      }
    }
  } else {
    console.warn(`List challenges ${challengesList.res.status}`);
  }

  const eventsList = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/config/events');
  if (eventsList.res.ok) {
    const events = Array.isArray(eventsList.parsed) ? eventsList.parsed : [];
    for (const name of LEGACY_EVENT_NAMES) {
      const match = events.find((e) => e.name === name);
      if (match) {
        report.events.push(await deleteEvent(auth, match, args.dryRun));
      }
    }
  } else {
    console.warn(`List events ${eventsList.res.status}`);
  }

  const providersList = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/config/rewards/providers');
  if (providersList.res.ok) {
    const providers = Array.isArray(providersList.parsed) ? providersList.parsed : [];
    const providerNames = labProviderNamesForSandbox(sandbox);
    const toDelete = providers.filter(
      (p) => p.guid === LEGACY_PROVIDER_GUID || providerNames.includes(p.name),
    );
    for (const provider of toDelete) {
      report.providers.push(await deleteProvider(auth, provider, args.dryRun));
    }
  } else {
    console.warn(`List providers ${providersList.res.status}`);
  }

  if (!args.keepConfig) {
    const configGot = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/config');
    if (configGot.res.ok) {
      report.config = {
        action: 'read',
        namespace: configGot.parsed.namespace,
        note: 'Global config retained; namespace left as-is (loyaltyId). Re-run setup to confirm.',
      };
    }
  }

  console.log('\n=== Reset report ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
