#!/usr/bin/env node
/**
 * Governed ADD-only top-up of the British Airways Decisioning leaves
 * (`_<tenant>.britishAirwaysDecisioning.*`) on the sandbox's "Profile Core v2"
 * field group, using the Travel entries in functions/profileCoreV2Manifest.js
 * and the same pure diff / JSON-Patch helpers as the wizard top-up.
 *
 * DRY-RUN BY DEFAULT: read-only Schema Registry GETs, then prints the tenant,
 * field group, If-Match version, needsAdd, conflicts and the exact PATCH ops.
 * Pass --apply to write. Profile Core v2 is Profile-enabled, so additions are
 * permanent (additive-only); review the dry run first.
 *
 * Only `britishAirwaysDecisioning.*` paths are patched. Other missing Travel
 * manifest leaves are reported under `otherTravelNeedsAdd` but never written.
 *
 * Transports:
 *   default      local IMS client credentials (~/.config/adobe-ims/credentials.env)
 *   --via-proxy  the lab's /api/aep proxy (server-side credentials, same org)
 *
 * Usage:
 *   node scripts/ensure-ba-decisioning-profile-core-fields.cjs --sandbox kirkham [--via-proxy]
 *   node scripts/ensure-ba-decisioning-profile-core-fields.cjs --sandbox kirkham [--via-proxy] --apply
 */

'use strict';

const os = require('os');
const path = require('path');
const { getManifestForIndustry } = require('../functions/profileCoreV2Manifest');
const {
  walkResolvedMixinTenantTree,
  collectRefBlockedAncestorPaths,
  diffManifestAgainstMixin,
  buildTopUpJsonPatchOps,
} = require('../functions/profileInfraFactory');
const { mergeCredentialsIntoEnv, imsToken } = require('./ensure-generic-place-context-fieldgroup.cjs');

const SR_PATH = '/data/foundation/schemaregistry';
const PLATFORM = 'https://platform.adobe.io';
const DEFAULT_PROXY = 'https://aep-orchestration-lab.web.app/api/aep';
const ACCEPT_XED = 'application/vnd.adobe.xed+json;version=1';
const ACCEPT_XED_FULL = 'application/vnd.adobe.xed-full+json';
const ACCEPT_XED_FULL_NOTEXT = 'application/vnd.adobe.xed-full-notext+json;version=1';
const ACCEPT_XED_ID = 'application/vnd.adobe.xed-id+json';
const BA_PREFIX = 'britishAirwaysDecisioning';
const PROFILE_CORE_TITLE = 'profile core v2';
const VERIFY_BACKOFF_MS = [2000, 4000, 8000, 15000, 30000];
const CONFLICT_STATUSES = new Set([409, 412, 428]);

function parseArgs(argv) {
  const out = { sandbox: '', apply: false, viaProxy: false, proxyUrl: DEFAULT_PROXY };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--via-proxy') out.viaProxy = true;
    else if (arg === '--proxy-url') out.proxyUrl = String(argv[++i] || '').trim();
    else if (arg === '--sandbox') out.sandbox = String(argv[++i] || '').trim();
    else if (arg.startsWith('--sandbox=')) out.sandbox = arg.slice('--sandbox='.length).trim();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.sandbox) throw new Error('--sandbox <name> is required (no default sandbox for a shared-schema change).');
  return out;
}

class RegistryError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function detailOf(data, fallback) {
  const d = data || {};
  const extra = d.report && Array.isArray(d.report.additionalDetails)
    ? d.report.additionalDetails.map((x) => x && x.errorReason).filter(Boolean).join('; ')
    : '';
  return String(extra || d.title || d.detail || d.message || d.raw || fallback || '').slice(0, 500);
}

function createDirectTransport({ fetchImpl, token, clientId, orgId, sandbox }) {
  return async function call(method, suffix, { accept, body, ifMatch } = {}) {
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
      Accept: accept || 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (ifMatch) headers['If-Match'] = String(ifMatch);
    const res = await fetchImpl(`${PLATFORM}${SR_PATH}${suffix}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text.slice(0, 400) }; }
    if (!res.ok) throw new RegistryError(`${method} ${suffix} failed (HTTP ${res.status}): ${detailOf(data, res.statusText)}`, res.status, data);
    return data;
  };
}

function createProxyTransport({ fetchImpl, proxyUrl, sandbox }) {
  return async function call(method, suffix, { accept, body, ifMatch } = {}) {
    const platform_headers = { 'x-sandbox-name': sandbox, Accept: accept || 'application/json' };
    if (body !== undefined) platform_headers['Content-Type'] = 'application/json';
    if (ifMatch) platform_headers['If-Match'] = String(ifMatch);
    const res = await fetchImpl(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, path: `${SR_PATH}${suffix}`, platform_headers, json: body }),
    });
    const wrapper = await res.json().catch(() => ({}));
    const status = Number(wrapper.status || res.status);
    const data = wrapper.platform_response || {};
    if (status < 200 || status >= 300) {
      throw new RegistryError(`${method} ${suffix} failed (HTTP ${status}): ${detailOf(data, wrapper.error || res.statusText)}`, status, data);
    }
    return data;
  };
}

function baManifest(manifest) {
  const out = {};
  for (const [k, v] of Object.entries(manifest)) {
    if (k === BA_PREFIX || k.startsWith(`${BA_PREFIX}.`)) out[k] = v;
  }
  return out;
}

function flattenLeaves(manifest) {
  const out = {};
  function visit(node, dotPath) {
    if (node && node.type === 'object' && node.properties) {
      for (const [k, child] of Object.entries(node.properties)) visit(child, `${dotPath}.${k}`);
    } else {
      out[dotPath] = node;
    }
  }
  for (const [k, v] of Object.entries(manifest)) visit(v, k);
  return out;
}

async function findProfileCore(call) {
  const data = await call('GET', '/tenant/fieldgroups?limit=300&properties=title,$id,meta:altId,version', { accept: ACCEPT_XED_ID });
  const rows = (data.results || []).filter((r) => String(r.title || '').trim().toLowerCase() === PROFILE_CORE_TITLE);
  if (rows.length === 0) throw new Error('Profile Core v2 field group not found in this sandbox.');
  if (rows.length > 1) throw new Error(`Expected one "Profile Core v2" field group, found ${rows.length}.`);
  return rows[0];
}

async function plan(call) {
  const row = await findProfileCore(call);
  const altId = row['meta:altId'] || row.$id;
  const enc = encodeURIComponent(altId);
  const [authoring, resolved] = await Promise.all([
    call('GET', `/tenant/fieldgroups/${enc}`, { accept: ACCEPT_XED }),
    call('GET', `/tenant/fieldgroups/${enc}`, { accept: ACCEPT_XED_FULL }),
  ]);
  const { tenantKey, presentPathSet, presentNodeMap } = walkResolvedMixinTenantTree(resolved);
  if (!tenantKey) throw new Error('Profile Core v2 has no tenant object; refusing to patch.');
  const refBlocked = collectRefBlockedAncestorPaths(authoring);
  const travel = getManifestForIndustry('travel');
  const ba = baManifest(travel);
  if (Object.keys(ba).length === 0) throw new Error(`Travel manifest has no ${BA_PREFIX}.* entries.`);
  const baDiff = diffManifestAgainstMixin(ba, presentPathSet, presentNodeMap, refBlocked);
  const otherManifest = {};
  for (const [k, v] of Object.entries(travel)) if (!(k in ba)) otherManifest[k] = v;
  const otherDiff = diffManifestAgainstMixin(otherManifest, presentPathSet, presentNodeMap, refBlocked);
  const ops = buildTopUpJsonPatchOps(tenantKey, baDiff.needsAdd);
  return {
    fieldGroup: { title: row.title, $id: row.$id, altId, version: String(authoring.version || row.version || '') },
    tenantKey,
    baLeaves: Object.keys(flattenLeaves(ba)),
    needsAdd: baDiff.needsAdd.map((n) => n.path),
    alreadyPresent: baDiff.alreadyPresent,
    conflicts: baDiff.conflicts,
    otherTravelNeedsAdd: otherDiff.needsAdd.map((n) => n.path),
    otherTravelConflicts: otherDiff.conflicts,
    patch: { altId, ifMatch: String(authoring.version || row.version || '1'), ops },
  };
}

function leafAt(resolved, tenantKey, dotPath) {
  let node = resolved && resolved.properties && resolved.properties[tenantKey];
  for (const seg of dotPath.split('.')) {
    node = node && node.properties && node.properties[seg];
    if (!node) return null;
  }
  return node;
}

async function verify(call, altId, tenantKey, leaves, manifest, sleep) {
  const enc = encodeURIComponent(altId);
  let missing = leaves;
  for (let i = 0; i <= VERIFY_BACKOFF_MS.length; i++) {
    const resolved = await call('GET', `/tenant/fieldgroups/${enc}`, { accept: ACCEPT_XED_FULL_NOTEXT });
    missing = leaves.filter((p) => {
      const n = leafAt(resolved, tenantKey, p);
      return !n || (manifest[p] && manifest[p].type && n.type !== manifest[p].type);
    });
    if (missing.length === 0) return { ok: true, version: resolved.version || null };
    if (i < VERIFY_BACKOFF_MS.length) await sleep(VERIFY_BACKOFF_MS[i]);
  }
  return { ok: false, missing };
}

async function run({ call, apply = false, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  let state = await plan(call);
  if (state.conflicts.length) {
    return { applied: false, reason: 'conflicts must be resolved manually before patching', ...state };
  }
  if (!apply || state.patch.ops.length === 0) {
    return { applied: false, dryRun: !apply, upToDate: state.patch.ops.length === 0, ...state };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      log('patch', { altId: state.patch.altId, ifMatch: state.patch.ifMatch, ops: state.patch.ops.length });
      await call('PATCH', `/tenant/fieldgroups/${encodeURIComponent(state.patch.altId)}`, {
        accept: ACCEPT_XED,
        body: state.patch.ops,
        ifMatch: state.patch.ifMatch,
      });
      break;
    } catch (e) {
      if (!(e instanceof RegistryError) || !CONFLICT_STATUSES.has(e.status) || attempt === 2) throw e;
      log('patch.retry', { status: e.status });
      await sleep(1500 * (attempt + 1));
      state = await plan(call);
      if (state.conflicts.length) throw new Error('Conflicts appeared after concurrent change; aborting.');
      if (state.patch.ops.length === 0) return { applied: false, upToDate: true, concurrentlyAdded: true, ...state };
    }
  }
  const manifest = flattenLeaves(baManifest(getManifestForIndustry('travel')));
  const verification = await verify(call, state.patch.altId, state.tenantKey, state.baLeaves, manifest, sleep);
  return { applied: true, verification, ...state };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let call;
  if (args.viaProxy) {
    call = createProxyTransport({ fetchImpl: fetch, proxyUrl: args.proxyUrl, sandbox: args.sandbox });
  } else {
    mergeCredentialsIntoEnv(path.join(os.homedir(), '.config', 'adobe-ims', 'credentials.env'));
    const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
    const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
    if (!orgId || !clientId) throw new Error('Set ADOBE_IMS_ORG/ADOBE_ORG_ID and ADOBE_CLIENT_ID, or use --via-proxy.');
    const token = await imsToken();
    call = createDirectTransport({ fetchImpl: fetch, token, clientId, orgId, sandbox: args.sandbox });
  }
  const result = await run({
    call,
    apply: args.apply,
    log: (phase, detail) => console.error(`[ensure-ba-fields] ${phase} ${JSON.stringify(detail)}`),
  });
  console.log(JSON.stringify({ sandbox: args.sandbox, transport: args.viaProxy ? 'proxy' : 'direct', ...result }, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, plan, run, baManifest, flattenLeaves, createProxyTransport, createDirectTransport, RegistryError };
