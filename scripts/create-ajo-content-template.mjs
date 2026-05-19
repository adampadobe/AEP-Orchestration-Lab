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
 * Confidentiality (AJO metadata vs HTML body): the email HTML **body** may use personalised or
 * brand-specific copy for demos. Defaults for **name**, **description**, and (for templateType
 * **content**) **subject** stay **generic** so template lists and outsider-visible titles do not
 * reveal which clients or competitors a sandbox is used for. Use `--name`, `--description`, and
 * `--subject` for private/local overrides.
 *
 * Loads ~/.config/adobe-ims/credentials.env without overwriting non-empty env vars.
 *
 * Usage:
 *   node scripts/create-ajo-content-template.mjs --html web/profile-viewer/premier-inn/hotel-hlv-reactivation-email.html
 *   node scripts/create-ajo-content-template.mjs --html ./tpl.html --name "HLV reactivation email (lab)" --sandbox apalmer
 *   node scripts/create-ajo-content-template.mjs --html ... --upsert
 *   node scripts/create-ajo-content-template.mjs --html ... --template-id <uuid>   # GET+PUT that resource (no name list)
 *   node scripts/create-ajo-content-template.mjs --html ... --template-type content --name "HLV reactivation email (content lab)"
 *   node scripts/create-ajo-content-template.mjs --html ... --template-type content --subject "HLV reactivation — lab demo"
 *   For --template-type content, the script sends only the first <body>…</body> inner HTML to
 *   template.html.body (full-document .html files are still OK on disk; use --template-type html to POST the whole file).
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
    subject: '',
    sandbox: '',
    upsert: false,
    templateId: '',
    templateType: 'html',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--html' && argv[i + 1]) out.html = String(argv[++i]).trim();
    else if (a === '--name' && argv[i + 1]) out.name = String(argv[++i]).trim();
    else if (a === '--description' && argv[i + 1]) out.description = String(argv[++i]).trim();
    else if (a === '--subject' && argv[i + 1]) out.subject = String(argv[++i]).trim();
    else if (a === '--sandbox' && argv[i + 1]) out.sandbox = String(argv[++i]).trim();
    else if (a === '--upsert') out.upsert = true;
    else if (a === '--template-id' && argv[i + 1]) out.templateId = String(argv[++i]).trim();
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

/**
 * For `templateType: "content"`, AJO expects `template.html.body` to be inner body markup (tables,
 * inline styles), not a full `<!DOCTYPE>…<html>…` document. Sending a complete document can break
 * simulation/rendering (e.g. CJMRT-130015-400). Full files are still correct for `templateType: "html"`.
 * @param {string} fullHtml
 * @returns {string}
 */
function extractBodyInnerHtmlForContentTemplate(fullHtml) {
  const raw = String(fullHtml ?? '');
  const open = raw.match(/<body\b[^>]*>/i);
  if (!open || open.index === undefined) return raw.trim();
  const start = open.index + open[0].length;
  const tail = raw.slice(start);
  const close = tail.match(/<\/body\b[^>]*>/i);
  if (!close || close.index === undefined) return raw.trim();
  return tail.slice(0, close.index).trim();
}

function buildPayload({ name, description, templateType, html, subject }) {
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
    const subj =
      subject && String(subject).trim()
        ? String(subject).trim()
        : 'HLV reactivation — lab demo';
    const bodyFragment = extractBodyInnerHtmlForContentTemplate(html);
    return {
      ...base,
      template: {
        subject: subj,
        html: { body: bodyFragment },
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

/**
 * GET template for ETag, then PUT full replacement payload.
 * @param {{ token: string, clientId: string, orgId: string, sandbox: string }} auth
 * @param {string} id
 * @param {unknown} payload
 */
async function putTemplateById(auth, id, payload) {
  const getPath = `/ajo/content/templates/${encodeURIComponent(id)}`;
  const got = await ajoFetch(auth, 'GET', getPath, { accept: MIME_TEMPLATE });
  if (!got.res.ok) {
    return {
      ok: false,
      step: 'GET template',
      status: got.res.status,
      body: got.parsed,
      templateId: id,
    };
  }
  const ifMatch = got.etag || got.res.headers.get('etag');
  if (!ifMatch) {
    return {
      ok: false,
      step: 'GET template',
      status: got.res.status,
      body: { error: 'Missing ETag on GET template; cannot PUT.' },
      templateId: id,
    };
  }
  const put = await ajoFetch(auth, 'PUT', getPath, {
    contentType: MIME_TEMPLATE,
    ifMatch,
    json: payload,
  });
  if (![200, 204].includes(put.res.status)) {
    return {
      ok: false,
      step: 'PUT template',
      status: put.res.status,
      body: put.parsed,
      templateId: id,
    };
  }
  return { ok: true, templateId: id, status: put.res.status };
}

/** @param {Headers} headers */
function templateIdFromLocationHeader(headers) {
  const raw =
    typeof headers.get === 'function'
      ? headers.get('location') || headers.get('Location') || ''
      : String((headers.location || headers.Location || '') ?? '');
  const loc = String(raw).trim();
  if (!loc) return '';
  const m = loc.match(/\/templates\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : '';
}

async function main() {
  mergeCredentialsIntoEnv(credPath);

  const args = parseArgs(process.argv);
  if (!args.html) {
    console.error(
      'Usage: node scripts/create-ajo-content-template.mjs --html <path> [--name "..."] [--description "..."] [--subject "..."] [--sandbox apalmer] [--upsert] [--template-id <uuid>] [--template-type html|content]',
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
  const name = args.name || 'HLV reactivation email (lab)';
  /**
   * Operational, generic copy only: no customer/brand names (defaults must stay demo-safe).
   * Do not put recipient names or other PII in `description`. Personalised copy belongs in the HTML body.
   */
  const description =
    args.description ||
    (args.templateType === 'content'
      ? 'Hospitality high-lapse-value reactivation email (AJO content-type channel template). AEP Orchestration Lab.'
      : 'Hospitality high-lapse-value reactivation email (AJO HTML template). AEP Orchestration Lab.');

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
  const payload = buildPayload({
    name,
    description,
    templateType: args.templateType,
    html,
    subject: args.subject,
  });

  const forceId = args.templateId && String(args.templateId).trim();
  if (forceId) {
    const result = await putTemplateById(auth, forceId, payload);
    if (!result.ok) {
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: 'updated (by --template-id)',
          templateId: result.templateId,
          name,
          templateType: args.templateType,
          status: result.status,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (args.upsert) {
    const found = await findTemplateIdByName(auth, name);
    if (found) {
      const result = await putTemplateById(auth, found.id, payload);
      if (!result.ok) {
        console.error(JSON.stringify(result, null, 2));
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
            status: result.status,
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

  const createdId =
    post.parsed.id ||
    post.parsed._id ||
    templateIdFromLocationHeader(post.res.headers) ||
    null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: args.upsert ? 'created (no prior match for upsert)' : 'created',
        status: post.res.status,
        templateId: createdId,
        name,
        templateType: args.templateType,
        responseBody: post.parsed,
        location: post.res.headers.get('location') || post.res.headers.get('Location') || null,
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
