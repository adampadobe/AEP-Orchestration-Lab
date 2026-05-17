#!/usr/bin/env node
/**
 * One-off: attach Interaction Details Lite + Travel - Hotel Experience v1 to a tenant
 * ExperienceEvent schema (same logic as POST /api/events/infra/step attachRecommendedFieldGroups).
 *
 * Loads Adobe credentials from ~/.config/adobe-ims/credentials.env (merged into process.env).
 *
 * Usage:
 *   node scripts/attach-event-recommended-fgs.cjs "https://ns.adobe.com/demoemea/schemas/…" [sandboxName]
 *
 * Env: ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_SCOPES, ADOBE_IMS_ORG or ADOBE_ORG_ID,
 *      ADOBE_SANDBOX_NAME (defaults to prod).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const eventInfra = require('../functions/eventInfraService');

function loadEnvFile(filePath) {
  const out = {};
  if (!filePath || !fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, 'utf8');
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

async function imsToken() {
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  const clientSecret = process.env.ADOBE_CLIENT_SECRET;
  const scopes = process.env.ADOBE_SCOPES;
  if (!clientId || !clientSecret || !scopes) {
    throw new Error('Missing ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, or ADOBE_SCOPES in environment.');
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

async function main() {
  const home = process.env.HOME || '';
  const credPath = path.join(home, '.config', 'adobe-ims', 'credentials.env');
  mergeCredentialsIntoEnv(credPath);

  const defaultId =
    'https://ns.adobe.com/demoemea/schemas/be572a5774e5efd073564998ffc4893a356b4d6c44d4788';
  const schemaId = String(process.argv[2] || defaultId).trim();
  const sandboxArg = String(process.argv[3] || '').trim();
  const sandbox = sandboxArg || String(process.env.ADOBE_SANDBOX_NAME || 'prod').trim();

  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  if (!orgId) throw new Error('Set ADOBE_IMS_ORG or ADOBE_ORG_ID.');
  if (!clientId) throw new Error('Set ADOBE_CLIENT_ID.');

  const token = await imsToken();
  const result = await eventInfra.runEventInfraStep(sandbox, token, clientId, orgId, 'attachRecommendedFieldGroups', {
    schemaId,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exitCode = 1;
});
