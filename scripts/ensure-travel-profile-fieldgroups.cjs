#!/usr/bin/env node
/**
 * Ensures the Travel Profile schema ("AEP Lab - Travel Profile - Schema") carries
 * the "Profile Travel v1" and "Profile Travel v2" field groups, which own
 * `_<tenant>.individualCharacteristics.travel.*` — including
 * `flightBookings.activeFlight` ("Yes" / "No").
 *
 * Default is a read-only dry run: reports whether each field group exists in the
 * sandbox, whether it is attached to the Travel schema, and any leaf whose type
 * differs from the lab spec (functions/travelProfileInfraService.js).
 *
 * --apply runs the Travel wizard's `attachFieldGroups` step, which creates any
 * missing group (createIfMissing) and attaches both to the schema. Attaching a
 * field group to a Profile-enabled schema cannot be undone.
 *
 * Loads ~/.config/adobe-ims/credentials.env without overwriting non-empty env vars.
 *
 * Usage:
 *   node scripts/ensure-travel-profile-fieldgroups.cjs <sandbox> [--apply]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const travelInfra = require('../functions/travelProfileInfraService');

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';
const TARGETS = [
  { title: 'Profile Travel v1', spec: travelInfra.TRAVEL_PROFILE_V1_PROPERTIES },
  { title: 'Profile Travel v2', spec: travelInfra.TRAVEL_PROFILE_V2_PROPERTIES },
];

function loadEnvFile(filePath) {
  const out = {};
  if (!filePath || !fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
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
  const r = await fetch(process.env.ADOBE_IMS_TOKEN_URL || 'https://ims-na1.adobelogin.com/ims/token/v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: scopes }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`IMS ${r.status}: ${data.error_description || data.error || r.statusText}`);
  return data.access_token;
}

async function registryGet(ctx, url, accept) {
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      'x-api-key': ctx.clientId,
      'x-gw-ims-org-id': ctx.orgId,
      'x-sandbox-name': ctx.sandbox,
      Accept: accept,
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function listAll(ctx, kind) {
  const out = [];
  let url = `${SCHEMA_REGISTRY}/tenant/${kind}?limit=300`;
  while (url) {
    const data = await registryGet(ctx, url, 'application/vnd.adobe.xed-id+json');
    out.push(...(data.results || []));
    const next = data._page && data._page.next;
    url = next ? `${SCHEMA_REGISTRY}/tenant/${kind}?limit=300&start=${encodeURIComponent(next)}` : null;
  }
  return out;
}

function flattenLeaves(props, prefix, out) {
  for (const [k, v] of Object.entries(props || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && v.type === 'object' && v.properties) flattenLeaves(v.properties, p, out);
    else if (v) out[p] = v.format ? `${v.type}:${v.format}` : v.type;
  }
  return out;
}

async function main() {
  mergeCredentialsIntoEnv(path.join(process.env.HOME || '', '.config', 'adobe-ims', 'credentials.env'));
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const sandbox = String(args.find((a) => !a.startsWith('--')) || process.env.ADOBE_SANDBOX_NAME || '').trim();
  if (!sandbox) throw new Error('Usage: node scripts/ensure-travel-profile-fieldgroups.cjs <sandbox> [--apply]');
  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  if (!orgId) throw new Error('Set ADOBE_IMS_ORG or ADOBE_ORG_ID.');
  const token = await imsToken();
  const ctx = { token, clientId, orgId, sandbox };

  const [fieldGroups, schemas] = await Promise.all([listAll(ctx, 'fieldgroups'), listAll(ctx, 'schemas')]);
  const schema = schemas.find((s) => s.title === travelInfra.TRAVEL_PROFILE_SCHEMA_TITLE);
  let schemaRefs = new Set();
  if (schema) {
    const full = await registryGet(
      ctx,
      `${SCHEMA_REGISTRY}/tenant/schemas/${encodeURIComponent(schema['meta:altId'])}`,
      'application/vnd.adobe.xed+json',
    );
    schemaRefs = new Set((full.allOf || []).map((x) => x.$ref).filter(Boolean));
  }

  const report = { sandbox, schema: schema ? schema.$id : null, fieldGroups: [] };
  for (const target of TARGETS) {
    const fg = fieldGroups.find((m) => String(m.title || '').toLowerCase() === target.title.toLowerCase());
    const row = { title: target.title, exists: !!fg, $id: fg ? fg.$id : null, attached: !!(fg && schemaRefs.has(fg.$id)) };
    if (fg) {
      const body = await registryGet(
        ctx,
        `${SCHEMA_REGISTRY}/tenant/fieldgroups/${encodeURIComponent(fg['meta:altId'])}`,
        'application/vnd.adobe.xed+json',
      );
      const tenantProps = Object.values(body.definitions || {})
        .map((d) => d && d.properties && Object.entries(d.properties).find(([k]) => k.startsWith('_')))
        .filter(Boolean)
        .map(([, v]) => v.properties)[0];
      const live = flattenLeaves(tenantProps, '', {});
      const want = flattenLeaves(target.spec, '', {});
      row.typeMismatches = Object.keys(want).filter((k) => live[k] && live[k] !== want[k]).map((k) => `${k}: live ${live[k]} ≠ spec ${want[k]}`);
      row.missingLeaves = Object.keys(want).filter((k) => !live[k]);
    }
    report.fieldGroups.push(row);
  }
  console.log(JSON.stringify(report, null, 2));

  if (!schema) {
    console.error(`Schema "${travelInfra.TRAVEL_PROFILE_SCHEMA_TITLE}" not found — run the Travel infra wizard first.`);
    process.exitCode = 1;
    return;
  }
  if (report.fieldGroups.every((r) => r.attached)) {
    console.log('Both field groups are already attached. Nothing to do.');
    return;
  }
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to create missing field groups and attach them (irreversible on a Profile-enabled schema).');
    return;
  }
  const result = await travelInfra.runTravelProfileInfraStep(sandbox, token, clientId, orgId, 'attachFieldGroups');
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exitCode = 1;
});
