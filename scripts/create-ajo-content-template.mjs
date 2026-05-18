#!/usr/bin/env node
/**
 * Create or upsert an Adobe Journey Optimizer content template via
 * POST / PUT https://platform.adobe.io/ajo/content/templates
 *
 * Same approach as Campaign Orchestration:
 *   AI Projects/Campaign Orchestration/07_AEP_Content_Fragments_Templates/
 *   2025-11-06_AJO_Content_Templates/create_content_templates.py
 * (IMS client_credentials + Content-Type: application/vnd.adobe.ajo.template.v1+json only).
 *
 * Lab policy: create/update AJO content templates by calling platform.adobe.io from the terminal
 * (this script or curl) — not via Firebase. See docs/AJO_CONTENT_TEMPLATE_API.md.
 *
 * Loads ~/.config/adobe-ims/credentials.env without overwriting non-empty env vars.
 *
 * Usage:
 *   node scripts/create-ajo-content-template.mjs --html web/profile-viewer/premier-inn/hotel-hlv-reactivation-email.html
 *   node scripts/create-ajo-content-template.mjs --html ./tpl.html --name "Hotel - HLV - Reactivation" --sandbox apalmer
 *   node scripts/create-ajo-content-template.mjs --html ... --upsert
 *   node scripts/create-ajo-content-template.mjs --html ... --template-type content --name "Hotel - HLV - Reactivation (content lab)"
 *
 * Env: ADOBE_CLIENT_ID (or ADOBE_API_KEY), ADOBE_CLIENT_SECRET, ADOBE_SCOPES,
 *      ADOBE_IMS_ORG (or ADOBE_ORG_ID), ADOBE_SANDBOX_NAME (optional if --sandbox)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const credPath = join(homedir(), '.config', 'adobe-ims', 'credentials.env');

const MIME_TEMPLATE = 'application/vnd.adobe.ajo.template.v1+json';
const MIME_TEMPLATE_LIST = 'application/vnd.adobe.ajo.template-list.v1+json';

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
    html: '',
    name: '',
    description: '',
    sandbox: '',
    upsert: false,
    templateType: 'html',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--html' && argv[i + 1]) out.html = String(argv[++i]).trim();
    else if (a === '--name' && argv[i + 1]) out.name = String(argv[++i]).trim();
    else if (a === '--description' && argv[i + 1]) out.description = String(argv[++i]).trim();
    else if (a === '--sandbox' && argv[i + 1]) out.sandbox = String(argv[++i]).trim();
    else if (a === '--upsert') out.upsert = true;
    else if (a === '--template-type' && argv[i + 1]) out.templateType = String(argv[++i]).trim().toLowerCase();
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

/**
 * @param {{ token: string, clientId: string, orgId: string, sandbox: string }} auth
 * @param {string} method
 * @param {string} pathWithQuery e.g. /ajo/content/templates?limit=50
 * @param {{ json?: unknown, accept?: string, contentType?: string, ifMatch?: string }} opts
 */
async function ajoFetch(auth, method, pathWithQuery, opts = {}) {
  const url = `https://platform.adobe.io${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'x-api-key': auth.clientId,
    'x-gw-ims-org-id': auth.orgId,
    'x-sandbox-name': auth.sandbox,
  };
  if (opts.accept) headers.Accept = opts.accept;
  if (opts.contentType) headers['Content-Type'] = opts.contentType;
  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;

  const init = { method, headers };
  if (opts.json != null && ['POST', 'PUT', 'PATCH'].includes(method)) {
    init.body = JSON.stringify(opts.json);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _raw: text.slice(0, 12000) };
  }
  const etag = res.headers.get('etag') || res.headers.get('ETag') || '';
  return { res, url, parsed, etag, text };
}

function buildPayload({ name, description, templateType, html }) {
  const base = {
    name,
    description,
    templateType,
    channels: ['email'],
    source: {
      origin: 'ajo',
      metadata: { createdWith: 'aep-orchestration-lab/scripts/create-ajo-content-template.mjs' },
    },
  };

  if (templateType === 'html') {
    return {
      ...base,
      template: {
        html,
        editorContext: {},
      },
    };
  }

  if (templateType === 'content') {
    /** @see Adobe content.yaml — email-variant-detail */
    return {
      ...base,
      template: {
        subject: 'Premier Inn — we would love to see you again',
        html: { body: html },
        editorContext: {},
      },
    };
  }

  throw new Error(`Unsupported --template-type "${templateType}" (use html or content).`);
}

/** Walk list pages until a template with exact `name` is found (or not). */
async function findTemplateIdByName(auth, wantName) {
  let listPath = '/ajo/content/templates?limit=50&orderBy=-modifiedAt';
  for (let page = 0; page < 40; page += 1) {
    const { res, parsed } = await ajoFetch(auth, 'GET', listPath, { accept: MIME_TEMPLATE_LIST });
    if (!res.ok) {
      throw new Error(`List templates ${res.status}: ${JSON.stringify(parsed).slice(0, 2000)}`);
    }
    const items = parsed.items || [];
    const hit = items.find((it) => String(it.name || '').trim() === wantName);
    if (hit && hit.id) return { id: String(hit.id), summary: hit };

    const next = parsed._links && parsed._links.next && parsed._links.next.href;
    if (!next) return null;
    /** Relative to https://platform.adobe.io/ajo/content — e.g. /templates?start=… */
    listPath = next.startsWith('/ajo/') ? next : `/ajo/content${next.startsWith('/') ? '' : '/'}${next}`;
  }
  return null;
}

async function main() {
  mergeCredentialsIntoEnv(credPath);

  const args = parseArgs(process.argv);
  if (!args.html) {
    console.error(
      'Usage: node scripts/create-ajo-content-template.mjs --html <path> [--name "..."] [--description "..."] [--sandbox apalmer] [--upsert] [--template-type html|content]',
    );
    process.exit(1);
  }

  if (args.templateType !== 'html' && args.templateType !== 'content') {
    console.error('Only --template-type html or content is supported.');
    process.exit(1);
  }

  const htmlPath = resolve(process.cwd(), args.html);
  if (!existsSync(htmlPath)) {
    console.error(`File not found: ${htmlPath}`);
    process.exit(1);
  }

  const html = readFileSync(htmlPath, 'utf8');
  const name = args.name || 'Hotel - HLV - Reactivation';
  const description =
    args.description ||
    (args.templateType === 'content'
      ? 'Premier Inn HLV reactivation — channel template (content + email). Lab script.'
      : 'Premier Inn HLV reactivation HTML email (lab script).');

  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  const sandbox = args.sandbox || String(process.env.ADOBE_SANDBOX_NAME || 'prod').trim();

  if (!orgId) {
    console.error('Set ADOBE_IMS_ORG or ADOBE_ORG_ID.');
    process.exit(1);
  }
  if (!clientId) {
    console.error('Set ADOBE_CLIENT_ID or ADOBE_API_KEY.');
    process.exit(1);
  }

  const token = await imsToken();
  const auth = { token, clientId, orgId, sandbox };
  const payload = buildPayload({ name, description, templateType: args.templateType, html });

  if (args.upsert) {
    const found = await findTemplateIdByName(auth, name);
    if (found) {
      const getPath = `/ajo/content/templates/${encodeURIComponent(found.id)}`;
      const got = await ajoFetch(auth, 'GET', getPath, { accept: MIME_TEMPLATE });
      if (!got.res.ok) {
        console.error(JSON.stringify({ step: 'GET template', status: got.res.status, body: got.parsed }, null, 2));
        process.exit(1);
      }
      const ifMatch = got.etag || got.res.headers.get('etag');
      if (!ifMatch) {
        console.error('Missing ETag on GET template; cannot PUT. Response headers may omit etag in this environment.');
        process.exit(1);
      }
      const put = await ajoFetch(auth, 'PUT', getPath, {
        contentType: MIME_TEMPLATE,
        ifMatch,
        json: payload,
      });
      if (![200, 204].includes(put.res.status)) {
        console.error(JSON.stringify({ step: 'PUT template', status: put.res.status, body: put.parsed }, null, 2));
        process.exit(1);
      }
      console.log(
        JSON.stringify(
          {
            ok: true,
            action: 'updated',
            templateId: found.id,
            name,
            templateType: args.templateType,
            status: put.res.status,
          },
          null,
          2,
        ),
      );
      return;
    }
  }

  const post = await ajoFetch(auth, 'POST', '/ajo/content/templates', {
    contentType: MIME_TEMPLATE,
    json: payload,
  });

  if (!post.res.ok) {
    console.error(JSON.stringify({ ok: false, status: post.res.status, body: post.parsed }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: args.upsert ? 'created (no prior match for upsert)' : 'created',
        status: post.res.status,
        templateId: post.parsed.id || post.parsed._id || null,
        name,
        templateType: args.templateType,
        body: post.parsed,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
});
