#!/usr/bin/env node
/**
 * Register a reward provider for AJO Loyalty Challenges via
 * POST https://platform.adobe.io/ajo/loyalty/metadata/config/rewards/providers
 *
 * Loads ~/.config/adobe-ims/credentials.env without overwriting non-empty env vars.
 *
 * Usage:
 *   export FAKE_LOYALTY_API_KEY='same-as-cloud-run'
 *   npm run ajo:loyalty-register-provider -- \
 *     --url https://fake-loyalty-provider-xxxxx-uc.a.run.app/v1/fulfill \
 *     --sandbox apalmer
 *
 *   npm run ajo:loyalty-register-provider -- --dry-run --url https://example.com/v1/fulfill
 *
 * Env: ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_SCOPES, ADOBE_IMS_ORG, FAKE_LOYALTY_API_KEY
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const credPath = join(homedir(), '.config', 'adobe-ims', 'credentials.env');
const PROVIDER_PATH = '/loyalty/metadata/config/rewards/providers';

function loadEnvFile(filePath) {
  const out = {};
  if (!filePath || !existsSync(filePath)) return out;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
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
  const fileEnv = loadEnvFile(filePath);
  for (const [k, v] of Object.entries(fileEnv)) {
    if (v == null || String(v).trim() === '') continue;
    if (process.env[k] == null || String(process.env[k]).trim() === '') process.env[k] = v;
  }
}

function parseArgs(argv) {
  const out = {
    url: '',
    name: 'AEP Lab Fake Loyalty',
    desc: 'Lab reward provider for apalmer sandbox',
    sandbox: '',
    rewardKey: 'points',
    rewardName: 'Program Points',
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--url' && argv[i + 1]) out.url = String(argv[++i]).trim();
    else if (a === '--name' && argv[i + 1]) out.name = String(argv[++i]).trim();
    else if (a === '--desc' && argv[i + 1]) out.desc = String(argv[++i]).trim();
    else if (a === '--sandbox' && argv[i + 1]) out.sandbox = String(argv[++i]).trim();
    else if (a === '--reward-key' && argv[i + 1]) out.rewardKey = String(argv[++i]).trim();
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

function buildProviderPayload({ name, desc, url, apiKey, rewardKey, rewardName }) {
  return {
    name,
    desc,
    enabled: true,
    url,
    additionalHeaders: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    rewardDefinition: {
      [rewardKey]: {
        name: rewardName,
        denomination: 'Points',
        enabled: true,
        isDefault: true,
        kvpCustom: {},
        rewardJsonata: '',
      },
    },
  };
}

async function main() {
  mergeCredentialsIntoEnv(credPath);
  const args = parseArgs(process.argv);

  if (!args.url) {
    console.error('Usage: npm run ajo:loyalty-register-provider -- --url https://host/v1/fulfill [--sandbox apalmer]');
    process.exit(1);
  }

  const apiKey = String(process.env.FAKE_LOYALTY_API_KEY || '').trim();
  if (!apiKey && !args.dryRun) {
    console.error('Set FAKE_LOYALTY_API_KEY (same value configured on Cloud Run and in AJO headers).');
    process.exit(1);
  }

  const sandbox = args.sandbox || process.env.ADOBE_SANDBOX_NAME || 'apalmer';
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  if (!clientId || !orgId) {
    throw new Error('Missing ADOBE_CLIENT_ID or ADOBE_IMS_ORG.');
  }

  const payload = buildProviderPayload({
    name: args.name,
    desc: args.desc,
    url: args.url,
    apiKey: apiKey || '<set-FAKE_LOYALTY_API_KEY>',
    rewardKey: args.rewardKey,
    rewardName: 'Program Points',
  });

  if (args.dryRun) {
    console.log('Dry run — would POST', PROVIDER_PATH);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const token = await imsToken();
  const auth = { token, clientId, orgId, sandbox };

  console.log(`Registering reward provider in sandbox "${sandbox}"…`);
  const { res, parsed, url } = await loyaltyFetch(auth, 'POST', PROVIDER_PATH, payload);

  if (res.status === 403 || res.status === 404) {
    console.warn('');
    console.warn(`AJO Loyalty metadata API returned ${res.status}.`);
    console.warn('Loyalty Challenges may be private beta — confirm entitlement and IMS scopes for /ajo/loyalty/metadata/*.');
    console.warn('You can still register manually in Loyalty admin → Reward providers.');
    console.warn('');
  }

  if (!res.ok) {
    console.error(`POST ${url} → ${res.status}`);
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }

  console.log(`Success (${res.status})`);
  console.log(JSON.stringify(parsed, null, 2));
  const providerGuid = parsed.guid || parsed.get_id;
  if (providerGuid) {
    console.log('');
    console.log('Provider guid:', providerGuid);
    console.log('Reward definition key:', args.rewardKey);
    console.log('Use these with npm run ajo:loyalty-create-challenge');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
