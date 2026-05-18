#!/usr/bin/env node
/**
 * Create an Adobe Journey Optimizer HTML content template via
 * POST https://platform.adobe.io/ajo/content/templates
 *
 * Same approach as Campaign Orchestration:
 *   AI Projects/Campaign Orchestration/07_AEP_Content_Fragments_Templates/
 *   2025-11-06_AJO_Content_Templates/create_content_templates.py
 * (IMS client_credentials + Content-Type: application/vnd.adobe.ajo.template.v1+json only).
 *
 * Loads ~/.config/adobe-ims/credentials.env without overwriting non-empty env vars.
 *
 * Usage:
 *   node scripts/create-ajo-content-template.mjs --html web/profile-viewer/premier-inn/hotel-hlv-reactivation-email.html
 *   node scripts/create-ajo-content-template.mjs --html ./tpl.html --name "Hotel - HLV - Reactivation" --sandbox apalmer
 *
 * Env: ADOBE_CLIENT_ID (or ADOBE_API_KEY), ADOBE_CLIENT_SECRET, ADOBE_SCOPES,
 *      ADOBE_IMS_ORG (or ADOBE_ORG_ID), ADOBE_SANDBOX_NAME (optional if --sandbox)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const credPath = join(homedir(), '.config', 'adobe-ims', 'credentials.env');

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
  const out = { html: '', name: '', description: '', sandbox: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--html' && argv[i + 1]) out.html = String(argv[++i]).trim();
    else if (a === '--name' && argv[i + 1]) out.name = String(argv[++i]).trim();
    else if (a === '--description' && argv[i + 1]) out.description = String(argv[++i]).trim();
    else if (a === '--sandbox' && argv[i + 1]) out.sandbox = String(argv[++i]).trim();
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

async function main() {
  const credPath = join(homedir(), '.config', 'adobe-ims', 'credentials.env');
  mergeCredentialsIntoEnv(credPath);

  const args = parseArgs(process.argv);
  if (!args.html) {
    console.error(
      'Usage: node scripts/create-ajo-content-template.mjs --html <path-to.html> [--name "..."] [--description "..."] [--sandbox technicalName]',
    );
    process.exit(1);
  }

  const htmlPath = resolve(process.cwd(), args.html);
  if (!existsSync(htmlPath)) {
    console.error(`File not found: ${htmlPath}`);
    process.exit(1);
  }

  const html = readFileSync(htmlPath, 'utf8');
  const name =
    args.name ||
    'Hotel - HLV - Reactivation';
  const description =
    args.description ||
    'Premier Inn HLV reactivation HTML email (created via scripts/create-ajo-content-template.mjs).';

  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  const sandbox =
    args.sandbox ||
    String(process.env.ADOBE_SANDBOX_NAME || 'prod').trim();

  if (!orgId) {
    console.error('Set ADOBE_IMS_ORG or ADOBE_ORG_ID.');
    process.exit(1);
  }
  if (!clientId) {
    console.error('Set ADOBE_CLIENT_ID or ADOBE_API_KEY.');
    process.exit(1);
  }

  const token = await imsToken();

  const payload = {
    name,
    description,
    templateType: 'html',
    channels: ['email'],
    source: {
      origin: 'ajo',
      metadata: { createdWith: 'aep-orchestration-lab/scripts/create-ajo-content-template.mjs' },
    },
    template: {
      html,
      editorContext: {},
    },
  };

  const url = 'https://platform.adobe.io/ajo/content/templates';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
      'Content-Type': 'application/vnd.adobe.ajo.template.v1+json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let bodyOut;
  try {
    bodyOut = text ? JSON.parse(text) : {};
  } catch {
    bodyOut = { raw: text.slice(0, 8000) };
  }

  if (!res.ok) {
    console.error(JSON.stringify({ ok: false, status: res.status, body: bodyOut }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, status: res.status, body: bodyOut }, null, 2));
}

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
});
