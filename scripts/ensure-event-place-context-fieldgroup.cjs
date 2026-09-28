#!/usr/bin/env node
/**
 * Governed create + attach of event-level place context on the AEP Lab
 * ExperienceEvent schemas ("AEP Lab - Event Generic - Schema" and
 * "AEP Event Tool - Schema - v1", both union/Profile-enabled):
 *   1. standard global "Environment Details" field group  → placeContext.geo.*
 *   2. tenant "AEP Lab - Event Place Context v1"           → _{tenant}.eventPlaceContext.*
 *
 * DRY-RUN BY DEFAULT: read-only Schema Registry GETs, prints the exact POST /
 * PATCH bodies. --apply writes. --apply --create-only creates the tenant field
 * group WITHOUT attaching it (review it in the AEP UI first); re-run with
 * --apply alone to attach. Only refs a schema is missing are added.
 *
 * Attaching to a union-enabled schema is irreversible (removal is a breaking
 * change). Before attach, a created-but-unattached FG can be removed with
 * DELETE /tenant/fieldgroups/{meta:altId}.
 *
 * Usage:
 *   node scripts/ensure-event-place-context-fieldgroup.cjs --sandbox apalmer
 *   node scripts/ensure-event-place-context-fieldgroup.cjs --sandbox apalmer --apply --create-only
 *   node scripts/ensure-event-place-context-fieldgroup.cjs --sandbox apalmer --apply
 */

'use strict';

const path = require('path');
const spec = require('../functions/eventPlaceContextFieldGroup');
const { parseArgs, createRegistryClient, mergeCredentialsIntoEnv, imsToken } = require('./ensure-generic-place-context-fieldgroup.cjs');

const ACCEPT_XED = 'application/vnd.adobe.xed+json; version=1';
const ACCEPT_XED_FULL = 'application/vnd.adobe.xed-full+json; version=1';
const ACCEPT_XED_FULL_NOTEXT = 'application/vnd.adobe.xed-full-notext+json; version=1';
const VERIFY_BACKOFF_MS = [2000, 4000, 8000, 15000, 30000];
const LISTING_BACKOFF_MS = [1500, 3000, 4500, 6000, 7500, 9000];
const CREATED_ID_PLACEHOLDER = '<created field group $id>';
const SUBTREE_KEY = 'eventPlaceContext';
const ENV_ID = spec.ENVIRONMENT_DETAILS_FIELD_GROUP_ID;

function refOperations(id) {
  return [
    { op: 'add', path: '/meta:extends/-', value: id },
    { op: 'add', path: '/allOf/-', value: { $ref: id } },
  ];
}

function tenantProps(resolved, tenantId) {
  const t = resolved && resolved.properties && resolved.properties[`_${tenantId}`];
  return (t && t.properties) || {};
}

function geoLatLon(resolved) {
  const geo = resolved && resolved.properties && resolved.properties.placeContext;
  const schema = geo && geo.properties && geo.properties.geo && geo.properties.geo.properties && geo.properties.geo.properties._schema;
  const p = (schema && schema.properties) || {};
  return Boolean(p.latitude && p.longitude);
}

async function findFieldGroupRow(client) {
  const title = spec.EVENT_PLACE_CONTEXT_FIELD_GROUP_TITLE;
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

  const fgRow = await findFieldGroupRow(client);
  if (fgRow) {
    const fg = await client.get(`/tenant/fieldgroups/${encodeURIComponent(fgRow['meta:altId'])}`, ACCEPT_XED);
    const custom = fg.definitions && fg.definitions.customFields;
    const sub = custom && custom.properties && custom.properties[`_${tenantId}`];
    if (!sub || !sub.properties || !sub.properties[SUBTREE_KEY]) {
      throw new Error(`existing field group "${fgRow.title}" (${fgRow.$id}) does not define _${tenantId}.${SUBTREE_KEY}; refusing to attach it.`);
    }
  }
  const fieldGroup = fgRow ? { title: fgRow.title, $id: String(fgRow.$id), metaAltId: fgRow['meta:altId'], version: fgRow.version } : null;

  const schemas = [];
  for (const title of spec.EVENT_PLACE_CONTEXT_TARGET_SCHEMA_TITLES) {
    const sq = `property=${encodeURIComponent(`title==${title}`)}&properties=title,$id,meta:altId,version`;
    const list = await client.get(`/tenant/schemas?${sq}`, 'application/vnd.adobe.xed-id+json');
    const rows = (list.results || []).filter((r) => String(r.title || '') === title);
    if (rows.length !== 1) throw new Error(`expected exactly one schema titled "${title}" in sandbox ${sandbox}, found ${rows.length}.`);
    const metaAltId = String(rows[0]['meta:altId']);
    const schemaPath = `/tenant/schemas/${encodeURIComponent(metaAltId)}`;
    const schema = await client.get(schemaPath, ACCEPT_XED);
    const refs = new Set([...(schema['meta:extends'] || []), ...(schema.allOf || []).map((a) => a && a.$ref).filter(Boolean)]);
    const envAttached = refs.has(ENV_ID);
    const fgAttached = Boolean(fieldGroup && refs.has(fieldGroup.$id));
    if (!envAttached) {
      const resolved = await client.get(schemaPath, ACCEPT_XED_FULL);
      if (resolved.properties && resolved.properties.placeContext) {
        throw new Error(
          `schema "${title}" already resolves placeContext from another field group without Environment Details attached; resolve that conflict before continuing.`
        );
      }
    }
    schemas.push({ title, $id: schema.$id, metaAltId, version: String(schema.version), path: schemaPath, envAttached, fgAttached });
  }

  const union = await client.get(`/tenant/schemas/${encodeURIComponent(spec.EXPERIENCE_EVENT_UNION_ALT_ID)}`, ACCEPT_XED_FULL);
  const unionHasPath = Object.prototype.hasOwnProperty.call(tenantProps(union, tenantId), SUBTREE_KEY);
  if (unionHasPath && !schemas.some((s) => s.fgAttached)) {
    throw new Error(
      `ExperienceEvent union already defines _${tenantId}.${SUBTREE_KEY} but "${spec.EVENT_PLACE_CONTEXT_FIELD_GROUP_TITLE}" is not attached to any target schema. Resolve the conflicting definition before continuing.`
    );
  }
  return { tenantId, fieldGroup, schemas, unionHasPath };
}

function missingOperations(s, fgId) {
  return [...(s.envAttached ? [] : refOperations(ENV_ID)), ...(s.fgAttached ? [] : refOperations(fgId))];
}

async function waitForListing(client, fgId, sleep) {
  for (let attempt = 0; attempt <= LISTING_BACKOFF_MS.length; attempt++) {
    const row = await findFieldGroupRow(client);
    if (row && String(row.$id) === fgId) return row;
    if (attempt < LISTING_BACKOFF_MS.length) await sleep(LISTING_BACKOFF_MS[attempt]);
  }
  throw new Error(`created field group ${fgId} did not appear in the tenant listing. It is NOT attached; re-run to attach, or DELETE it to clean up.`);
}

async function verifySchema(client, s, tenantId, sleep) {
  const expected = spec.EVENT_PLACE_CONTEXT_LEAF_PATHS.map((p) => p.slice(SUBTREE_KEY.length + 1));
  let resolved = null;
  let leaves = [];
  let hasGeoLatLon = false;
  for (let attempt = 0; attempt <= VERIFY_BACKOFF_MS.length; attempt++) {
    resolved = await client.get(s.path, ACCEPT_XED_FULL_NOTEXT);
    const sub = tenantProps(resolved, tenantId)[SUBTREE_KEY];
    leaves = Object.keys((sub && sub.properties) || {}).sort();
    hasGeoLatLon = geoLatLon(resolved);
    if (hasGeoLatLon && expected.every((l) => leaves.includes(l))) break;
    if (attempt < VERIFY_BACKOFF_MS.length) await sleep(VERIFY_BACKOFF_MS[attempt]);
  }
  const missing = expected.filter((l) => !leaves.includes(l));
  if (missing.length || !hasGeoLatLon) {
    throw new Error(
      `verification failed for "${s.title}": missing ${[...(hasGeoLatLon ? [] : ['placeContext.geo._schema.latitude/longitude']), ...missing.map((l) => `${SUBTREE_KEY}.${l}`)].join(', ')}. The PATCH succeeded; this is usually a stale Schema Registry cache — re-run (a no-op when attached) to re-verify.`
    );
  }
  return { title: s.title, schemaVersion: String(resolved.version), hasGeoLatLon, leaves };
}

async function runEnsure({ fetchImpl, token, clientId, orgId, sandbox, apply = false, createOnly = false, sleep, log = () => {} }) {
  if (!sandbox) throw new Error('sandbox is required.');
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const client = createRegistryClient({ fetchImpl, token, clientId, orgId, sandbox });
  const state = await inspect(client, sandbox);
  const mode = apply ? 'apply' : 'dry-run';
  const base = {
    ok: true,
    mode,
    sandbox,
    tenantId: state.tenantId,
    fieldGroup: state.fieldGroup,
    schemas: state.schemas.map(({ path: _p, ...rest }) => rest),
    unionHasPath: state.unionHasPath,
  };

  const needsAttach = state.schemas.some((s) => !s.envAttached || !s.fgAttached);
  if (!needsAttach) return { ...base, action: 'none', note: 'Environment Details and the event place-context FG are attached to every target schema.' };
  if (createOnly && state.fieldGroup) {
    return { ...base, action: 'none', note: 'Field group already exists (not attached everywhere); nothing to create. Re-run with --apply alone to attach.' };
  }

  const action = createOnly ? 'create-only' : state.fieldGroup ? 'attach' : 'create-and-attach';
  const createBody = state.fieldGroup ? null : spec.buildEventPlaceContextFieldGroupCreateBody(state.tenantId);
  const plannedId = state.fieldGroup ? state.fieldGroup.$id : CREATED_ID_PLACEHOLDER;
  const planned = {
    createFieldGroup: createBody ? { method: 'POST', path: '/tenant/fieldgroups', body: createBody } : null,
    patchSchemas: createOnly
      ? []
      : state.schemas
          .map((s) => ({ title: s.title, method: 'PATCH', path: s.path, ifMatch: s.version, operations: missingOperations(s, plannedId) }))
          .filter((p) => p.operations.length),
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

  const applied = [];
  for (const s of state.schemas) {
    const operations = missingOperations(s, fgId);
    if (!operations.length) continue;
    const current = await client.get(s.path, ACCEPT_XED);
    await client.patch(s.path, operations, String(current.version));
    log('attached', { schema: s.metaAltId, operations: operations.length });
    applied.push({ title: s.title, operations });
  }
  const verified = [];
  for (const s of state.schemas) verified.push(await verifySchema(client, s, state.tenantId, wait));
  const union = await client.get(`/tenant/schemas/${encodeURIComponent(spec.EXPERIENCE_EVENT_UNION_ALT_ID)}`, ACCEPT_XED_FULL);
  const unionVerified = Object.prototype.hasOwnProperty.call(tenantProps(union, state.tenantId), SUBTREE_KEY);
  if (!unionVerified) throw new Error(`verification failed: ExperienceEvent union does not yet expose _${state.tenantId}.${SUBTREE_KEY}.`);
  return { ...base, action, created, applied, verified, unionVerified };
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
    log: (phase, detail) => console.error(`[ensure-event-place-context] ${phase} ${JSON.stringify(detail)}`),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, runEnsure, refOperations };
