#!/usr/bin/env node
/**
 * Governed create + attach of "AEP Lab - Profile Place Context v1" on
 * "AEP Lab - Generic Profile - Schema" (Profile-enabled, union member).
 *
 * DRY-RUN BY DEFAULT: performs read-only Schema Registry GETs and prints the
 * exact POST / PATCH bodies it would send. Pass --apply to write.
 * Add --create-only to create the field group WITHOUT attaching it (so it can
 * be reviewed in the AEP UI first); re-run with --apply alone to attach.
 *
 * Attaching a field group to a Profile-enabled schema is irreversible (removal
 * is a breaking change). Only run --apply after reviewing the dry-run output.
 * Before the attach, a created-but-unattached FG can be removed with
 * DELETE /tenant/fieldgroups/{meta:altId}.
 *
 * Loads ~/.config/adobe-ims/credentials.env without overwriting non-empty env vars.
 *
 * Usage:
 *   node scripts/ensure-generic-place-context-fieldgroup.cjs --sandbox apalmer
 *   node scripts/ensure-generic-place-context-fieldgroup.cjs --sandbox apalmer --apply --create-only
 *   node scripts/ensure-generic-place-context-fieldgroup.cjs --sandbox apalmer --apply
 */

'use strict';

const fs = require('fs');
const path = require('path');
const generic = require('../functions/genericProfileInfraService');
const { buildTenantFieldGroupCreateBody } = require('../functions/profileInfraFactory');

const SR = 'https://platform.adobe.io/data/foundation/schemaregistry';
const ACCEPT_XED = 'application/vnd.adobe.xed+json; version=1';
const ACCEPT_XED_FULL = 'application/vnd.adobe.xed-full+json; version=1';
// The resolved `xed-full` view is cached after a PATCH; `xed-full-notext` refreshes sooner.
const ACCEPT_XED_FULL_NOTEXT = 'application/vnd.adobe.xed-full-notext+json; version=1';
const VERIFY_BACKOFF_MS = [2000, 4000, 8000, 15000, 30000];
const PROFILE_UNION_ALT_ID = '_xdm.context.profile__union';
const CREATED_ID_PLACEHOLDER = '<created field group $id>';
const LISTING_BACKOFF_MS = [1500, 3000, 4500, 6000, 7500, 9000];
const SUBTREE_KEY = 'profilePlaceContext';

function parseArgs(argv) {
  let sandbox = '';
  let apply = false;
  let createOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--create-only') createOnly = true;
    else if (arg === '--sandbox') sandbox = String(argv[++i] || '').trim();
    else if (arg.startsWith('--sandbox=')) sandbox = arg.slice('--sandbox='.length).trim();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!sandbox) throw new Error('--sandbox <name> is required (no default sandbox for a shared-schema change).');
  return { sandbox, apply, createOnly };
}

function tenantSubtree(resolved, tenantId) {
  const tenant = resolved && resolved.properties && resolved.properties[`_${tenantId}`];
  return (tenant && tenant.properties) || {};
}

function createRegistryClient({ fetchImpl, token, clientId, orgId, sandbox }) {
  const headers = (accept, extra = {}) => ({
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: accept,
    ...extra,
  });

  async function call(method, pathSuffix, { accept = ACCEPT_XED, body, extraHeaders } = {}) {
    const res = await fetchImpl(`${SR}${pathSuffix}`, {
      method,
      headers: headers(accept, body !== undefined ? { 'Content-Type': 'application/json', ...extraHeaders } : extraHeaders),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { raw: text.slice(0, 400) };
    }
    if (!res.ok) {
      const detail = data.title || data.detail || data.message || data.raw || res.statusText;
      throw new Error(`${method} ${pathSuffix} failed (HTTP ${res.status}): ${String(detail).slice(0, 400)}`);
    }
    return data;
  }

  return {
    get: (p, accept) => call('GET', p, { accept }),
    post: (p, body) => call('POST', p, { accept: 'application/vnd.adobe.xed+json', body }),
    patch: (p, body, ifMatch) => call('PATCH', p, { body, extraHeaders: { 'If-Match': ifMatch } }),
  };
}

async function findFieldGroupRow(client, title) {
  const q = `property=${encodeURIComponent(`title==${title}`)}&properties=title,$id,meta:altId,version`;
  const data = await client.get(`/tenant/fieldgroups?${q}`, 'application/vnd.adobe.xed-id+json');
  const rows = (data.results || []).filter((r) => String(r.title || '') === title);
  if (rows.length > 1) throw new Error(`expected at most one field group titled "${title}", found ${rows.length}.`);
  return rows[0] || null;
}

async function inspect(client, sandbox) {
  const stats = await client.get('/stats', 'application/json');
  const tenantId = String(stats.tenantId || '').trim();
  if (!tenantId) throw new Error('Schema Registry /stats did not return a tenantId.');

  const schemaTitle = generic.GENERIC_PROFILE_SCHEMA_TITLE;
  const sq = `property=${encodeURIComponent(`title==${schemaTitle}`)}&properties=title,$id,meta:altId,version`;
  const schemaList = await client.get(`/tenant/schemas?${sq}`, 'application/vnd.adobe.xed-id+json');
  const schemaRows = (schemaList.results || []).filter((r) => String(r.title || '') === schemaTitle);
  if (schemaRows.length !== 1) {
    throw new Error(`expected exactly one schema titled "${schemaTitle}" in sandbox ${sandbox}, found ${schemaRows.length}.`);
  }
  const metaAltId = String(schemaRows[0]['meta:altId']);
  const schemaPath = `/tenant/schemas/${encodeURIComponent(metaAltId)}`;
  const schema = await client.get(schemaPath, ACCEPT_XED);
  const refs = new Set([
    ...(schema['meta:extends'] || []),
    ...(schema.allOf || []).map((a) => a && a.$ref).filter(Boolean),
  ]);

  const fgRow = await findFieldGroupRow(client, generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_TITLE);
  if (fgRow) {
    const fg = await client.get(`/tenant/fieldgroups/${encodeURIComponent(fgRow['meta:altId'])}`, ACCEPT_XED);
    const custom = fg.definitions && fg.definitions.customFields;
    const subtree = custom && custom.properties && custom.properties[`_${tenantId}`];
    if (!subtree || !subtree.properties || !subtree.properties[SUBTREE_KEY]) {
      throw new Error(`existing field group "${fgRow.title}" (${fgRow.$id}) does not define _${tenantId}.${SUBTREE_KEY}; refusing to attach it.`);
    }
  }
  const attached = Boolean(fgRow && refs.has(String(fgRow.$id)));

  const union = await client.get(`/tenant/schemas/${encodeURIComponent(PROFILE_UNION_ALT_ID)}`, ACCEPT_XED_FULL);
  const unionHasPath = Object.prototype.hasOwnProperty.call(tenantSubtree(union, tenantId), SUBTREE_KEY);
  if (unionHasPath && !attached) {
    throw new Error(
      `Profile union already defines _${tenantId}.${SUBTREE_KEY} but "${generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_TITLE}" is not attached to "${schemaTitle}". Resolve the conflicting definition before continuing.`
    );
  }

  return {
    tenantId,
    schema: { title: schemaTitle, $id: schema.$id, metaAltId, version: String(schema.version), path: schemaPath },
    fieldGroup: fgRow ? { title: fgRow.title, $id: String(fgRow.$id), metaAltId: fgRow['meta:altId'], version: fgRow.version } : null,
    attached,
    unionHasPath,
  };
}

function attachOperations(fgId) {
  return [
    { op: 'add', path: '/meta:extends/-', value: fgId },
    { op: 'add', path: '/allOf/-', value: { $ref: fgId } },
  ];
}

async function waitForListing(client, fgId, sleep) {
  for (let attempt = 0; attempt <= LISTING_BACKOFF_MS.length; attempt++) {
    const row = await findFieldGroupRow(client, generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_TITLE);
    if (row && String(row.$id) === fgId) return row;
    if (attempt < LISTING_BACKOFF_MS.length) await sleep(LISTING_BACKOFF_MS[attempt]);
  }
  throw new Error(
    `created field group ${fgId} did not appear in the tenant listing. It is NOT attached; re-run to attach, or DELETE /tenant/fieldgroups/{meta:altId} to clean up.`
  );
}

async function verify(client, state, sleep) {
  const expected = generic.PROFILE_PLACE_CONTEXT_LEAF_PATHS.map((p) => p.slice(SUBTREE_KEY.length + 1));
  let resolved = null;
  let leaves = [];
  let missing = expected;
  for (let attempt = 0; attempt <= VERIFY_BACKOFF_MS.length; attempt++) {
    resolved = await client.get(state.schema.path, ACCEPT_XED_FULL_NOTEXT);
    const subtree = tenantSubtree(resolved, state.tenantId)[SUBTREE_KEY];
    leaves = Object.keys((subtree && subtree.properties) || {}).sort();
    missing = expected.filter((leaf) => !leaves.includes(leaf));
    if (!missing.length) break;
    if (attempt < VERIFY_BACKOFF_MS.length) await sleep(VERIFY_BACKOFF_MS[attempt]);
  }
  if (missing.length) {
    throw new Error(
      `verification failed: resolved schema is missing ${SUBTREE_KEY} leaves ${missing.join(', ')}. The PATCH succeeded; this is usually a stale Schema Registry cache — re-run (a no-op when attached) to re-verify.`
    );
  }
  const union = await client.get(`/tenant/schemas/${encodeURIComponent(PROFILE_UNION_ALT_ID)}`, ACCEPT_XED_FULL);
  const unionHasPath = Object.prototype.hasOwnProperty.call(tenantSubtree(union, state.tenantId), SUBTREE_KEY);
  if (!unionHasPath) throw new Error(`verification failed: Profile union does not yet expose _${state.tenantId}.${SUBTREE_KEY}.`);
  return { leaves, schemaVersion: String(resolved.version), unionHasPath };
}

async function runEnsure({ fetchImpl, token, clientId, orgId, sandbox, apply = false, createOnly = false, sleep, log = () => {} }) {
  if (!sandbox) throw new Error('sandbox is required.');
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const client = createRegistryClient({ fetchImpl, token, clientId, orgId, sandbox });
  const state = await inspect(client, sandbox);
  const mode = apply ? 'apply' : 'dry-run';
  const base = { ok: true, mode, sandbox, tenantId: state.tenantId, schema: state.schema, fieldGroup: state.fieldGroup, unionHasPath: state.unionHasPath };

  if (state.attached) return { ...base, action: 'none', note: 'Field group is already attached; nothing to do.' };
  if (createOnly && state.fieldGroup) {
    return { ...base, action: 'none', note: 'Field group already exists (not attached); nothing to create. Re-run with --apply alone to attach.' };
  }

  const action = createOnly ? 'create-only' : state.fieldGroup ? 'attach' : 'create-and-attach';
  const createBody = state.fieldGroup ? null : buildTenantFieldGroupCreateBody(state.tenantId, generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_SPEC);
  const planned = {
    createFieldGroup: createBody ? { method: 'POST', path: '/tenant/fieldgroups', body: createBody } : null,
    patchSchema: createOnly
      ? null
      : {
          method: 'PATCH',
          path: state.schema.path,
          ifMatch: state.schema.version,
          operations: attachOperations(state.fieldGroup ? state.fieldGroup.$id : CREATED_ID_PLACEHOLDER),
        },
  };
  if (!apply) return { ...base, action, planned };

  let fgId = state.fieldGroup && state.fieldGroup.$id;
  let created = null;
  if (!fgId) {
    const row = await client.post('/tenant/fieldgroups', createBody);
    if (!row || !row.$id) throw new Error('field group POST returned no $id.');
    created = { title: row.title, $id: String(row.$id), metaAltId: row['meta:altId'] };
    log('created', created);
    fgId = created.$id;
    await waitForListing(client, fgId, wait);
  }
  if (createOnly) {
    return {
      ...base,
      action,
      created,
      note: `Field group created and NOT attached. Review it in AEP, then re-run with --apply to attach, or DELETE /tenant/fieldgroups/${encodeURIComponent(created.metaAltId)} to remove it.`,
    };
  }
  const current = await client.get(state.schema.path, ACCEPT_XED);
  const operations = attachOperations(fgId);
  await client.patch(state.schema.path, operations, String(current.version));
  log('attached', { schema: state.schema.metaAltId, fieldGroup: fgId });
  const verified = await verify(client, state, wait);
  return { ...base, action, created, applied: { operations }, verified };
}

function loadEnvFile(filePath) {
  const out = {};
  if (!filePath || !fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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

async function imsToken() {
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  const clientSecret = process.env.ADOBE_CLIENT_SECRET;
  const scopes = process.env.ADOBE_SCOPES;
  if (!clientId || !clientSecret || !scopes) {
    throw new Error('Missing ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, or ADOBE_SCOPES in environment.');
  }
  const imsUrl = process.env.ADOBE_IMS_TOKEN_URL || 'https://ims-na1.adobelogin.com/ims/token/v3';
  const r = await fetch(imsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: scopes }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`IMS ${r.status}: ${data.error_description || data.error || r.statusText}`);
  return data.access_token;
}

async function main() {
  const { sandbox, apply, createOnly } = parseArgs(process.argv.slice(2));
  mergeCredentialsIntoEnv(path.join(process.env.HOME || '', '.config', 'adobe-ims', 'credentials.env'));
  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  if (!orgId) throw new Error('Set ADOBE_IMS_ORG or ADOBE_ORG_ID.');
  if (!clientId) throw new Error('Set ADOBE_CLIENT_ID.');
  const token = await imsToken();
  const result = await runEnsure({
    fetchImpl: fetch,
    token,
    clientId,
    orgId,
    sandbox,
    apply,
    createOnly,
    log: (phase, detail) => console.error(`[ensure-place-context] ${phase} ${JSON.stringify(detail)}`),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runEnsure,
  attachOperations,
  PROFILE_UNION_ALT_ID,
  createRegistryClient,
  mergeCredentialsIntoEnv,
  imsToken,
};
