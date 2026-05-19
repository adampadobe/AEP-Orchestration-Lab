#!/usr/bin/env node
/**
 * Create or upsert **edge** (synchronous) segment definitions on Real-Time CDP
 * via POST/PATCH https://platform.adobe.io/data/core/ups/segment/definitions
 *
 * PQL paths align with the Travel profile generator + Profile Core v2 tenant subtree:
 *   - `_<TENANT>.hotel.bookingDetails.*` (Travel - Hotel Experience v1 → streamed under tenant)
 *   - `_<TENANT>.scoring.*` (churn / propensity — not root-prefixed in profileStreamingCore)
 *   - `personalEmail.address` (root OOTB path)
 *
 * Names and descriptions stay **generic** (no vendor / client brand in titles or descriptions).
 *
 * Loads ~/.config/adobe-ims/credentials.env without overwriting non-empty env vars.
 *
 * Usage:
 *   node scripts/create-hotel-edge-segments.mjs --sandbox apalmer --tenant demoemea
 *   node scripts/create-hotel-edge-segments.mjs --sandbox apalmer --tenant demoemea --upsert
 *
 * Env: ADOBE_CLIENT_ID (or ADOBE_API_KEY), ADOBE_CLIENT_SECRET, ADOBE_SCOPES,
 *      ADOBE_IMS_ORG (or ADOBE_ORG_ID), and **tenant id** via --tenant or ADOBE_TENANT_ID
 *      (e.g. `demoemea` without leading underscore — same convention as other lab scripts).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const credPath = join(homedir(), '.config', 'adobe-ims', 'credentials.env');
const UPS_SEGMENT = 'https://platform.adobe.io/data/core/ups/segment/definitions';
const UPS_MERGE_POLICIES = 'https://platform.adobe.io/data/core/ups/config/mergePolicies';

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
  const out = { sandbox: '', tenant: '', upsert: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sandbox' && argv[i + 1]) out.sandbox = String(argv[++i]).trim();
    else if (a === '--tenant' && argv[i + 1]) out.tenant = String(argv[++i]).trim().replace(/^_/, '');
    else if (a === '--upsert') out.upsert = true;
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

function platformHeaders(token, clientId, orgId, sandbox) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function getDefaultProfileMergePolicyId(headers) {
  const url = `${UPS_MERGE_POLICIES}?limit=50`;
  const res = await fetch(url, { method: 'GET', headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`mergePolicies ${res.status}: ${data.message || JSON.stringify(data).slice(0, 500)}`);
  }
  const children = data.children || [];
  const profileDefault = children.find(
    (c) => c.default === true && c.schema?.name === '_xdm.context.profile',
  );
  if (profileDefault?.id) return profileDefault.id;
  const anyProfile = children.find((c) => c.schema?.name === '_xdm.context.profile');
  if (anyProfile?.id) return anyProfile.id;
  if (children[0]?.id) return children[0].id;
  throw new Error('No merge policy returned for sandbox');
}

function tenantKey(tenantId) {
  const id = String(tenantId || '').replace(/^_/, '');
  if (!id) throw new Error('Pass --tenant <id> or set ADOBE_TENANT_ID (e.g. demoemea, no underscore).');
  return `_${id}`;
}

/** @param {string} tk e.g. _demoemea — PQL uses dotted paths on the union profile (no chain() wrapper). */
function buildSegmentSpecs(tk) {
  const h = `${tk}.hotel.bookingDetails`;
  return [
    {
      name: 'Hotel - Last stay over 12 months ago',
      description:
        'Hospitality profiles whose last recorded checkout date is more than 365 days before today. Uses tenant hotel booking checkout from the lab Travel profile shape; validate in Segment Builder if your mixin path differs.',
      pql: `${h}.checkOutDate occurs > 365 days before today`,
    },
    {
      name: 'Hotel - Frequent stay night volume',
      description:
        'Hospitality profiles where total nights in the trailing attribution window meets or exceeds five. Proxies high stay frequency when discrete booking counts are not stored on the profile.',
      pql: `${h}.totalNights >= 5`,
    },
    {
      name: 'Hotel - Elevated modelled churn risk',
      description:
        'Profiles with modelled churn probability above 0.5 from lab-streamed scoring attributes under the tenant subtree.',
      pql: `${tk}.scoring.churn.churnPrediction > 0.5`,
    },
    {
      name: 'Hotel - High return-stay propensity',
      description:
        'Profiles with modelled return / repurchase propensity above 0.65 for prioritised hospitality journeys and offers.',
      pql: `${tk}.scoring.core.propensityScore > 0.65`,
    },
    {
      name: 'Hotel - Known email for orchestration',
      description:
        'Profiles with a personal email address on record for cross-channel hospitality orchestration entry points.',
      pql: 'not(personalEmail.address.isNull())',
    },
    {
      name: 'Hotel - Recorded destination context',
      description:
        'Hospitality profiles with a recorded hotel city or location string on the last booking snapshot (search and abandonment personalisation building block).',
      pql: `not(${h}.hotelLocation.isNull())`,
    },
  ];
}

function edgeEvaluationInfo() {
  return {
    batch: { enabled: false },
    continuous: { enabled: false },
    synchronous: { enabled: true },
  };
}

function buildCreateBody(spec, mergePolicyId) {
  return {
    name: spec.name,
    description: spec.description,
    profileInstanceId: 'ups',
    schema: { name: '_xdm.context.profile' },
    expression: { type: 'PQL', format: 'pql/text', value: spec.pql },
    evaluationInfo: edgeEvaluationInfo(),
    mergePolicyId,
    dataGovernancePolicy: { excludeOptOut: true },
  };
}

async function listAllSegmentNames(headers, maxPages = 80) {
  const byName = new Map();
  let start = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const url = `${UPS_SEGMENT}?limit=100&start=${start}&sort=name:asc`;
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`list segments ${res.status}: ${data.message || JSON.stringify(data).slice(0, 800)}`);
    }
    const children = data.children || data.segments || (Array.isArray(data) ? data : []);
    const arr = Array.isArray(children) ? children : [];
    if (arr.length === 0) break;
    for (const row of arr) {
      const n = typeof row.name === 'string' ? row.name.trim() : '';
      const id = row.id || row.segmentId;
      if (n && id) byName.set(n, { id: String(id), row });
    }
    if (arr.length < 100) break;
    const nextStart = data.nextStart ?? data._page?.nextStart;
    if (nextStart != null && Number.isFinite(Number(nextStart))) start = Number(nextStart);
    else start += arr.length;
  }
  return byName;
}

async function getSegmentById(headers, id) {
  const url = `${UPS_SEGMENT}/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'GET', headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GET segment ${res.status}: ${data.message || JSON.stringify(data).slice(0, 600)}`);
  }
  const body = data.platform_response || data;
  const etag = res.headers.get('etag') || res.headers.get('ETag') || '';
  return { body, etag };
}

async function patchSegment(headers, id, body, ifMatch) {
  const url = `${UPS_SEGMENT}/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...headers,
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (![200, 204].includes(res.status)) {
    throw new Error(`PATCH segment ${res.status}: ${data.message || JSON.stringify(data).slice(0, 1200)}`);
  }
  return data.platform_response || data;
}

async function postSegment(headers, body) {
  const res = await fetch(UPS_SEGMENT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (![200, 201].includes(res.status)) {
    throw new Error(`POST segment ${res.status}: ${data.message || JSON.stringify(data).slice(0, 1200)}`);
  }
  return data.platform_response || data;
}

async function main() {
  mergeCredentialsIntoEnv(credPath);
  const args = parseArgs(process.argv);
  const tenantArg = args.tenant || String(process.env.ADOBE_TENANT_ID || '').replace(/^_/, '').trim();
  const tk = tenantKey(tenantArg);
  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  const sandbox = args.sandbox || String(process.env.ADOBE_SANDBOX_NAME || '').trim();
  if (!orgId || !clientId) {
    console.error('Set ADOBE_IMS_ORG (or ADOBE_ORG_ID) and ADOBE_CLIENT_ID (or ADOBE_API_KEY).');
    process.exit(1);
  }
  if (!sandbox) {
    console.error('Pass --sandbox <name> or set ADOBE_SANDBOX_NAME.');
    process.exit(1);
  }

  const token = await imsToken();
  const headers = platformHeaders(token, clientId, orgId, sandbox);
  const mergePolicyId = await getDefaultProfileMergePolicyId(headers);
  const specs = buildSegmentSpecs(tk);

  const existingByName = args.upsert ? await listAllSegmentNames(headers) : new Map();

  const results = [];
  for (const spec of specs) {
    const body = buildCreateBody(spec, mergePolicyId);
    try {
      if (args.upsert) {
        const hit = existingByName.get(spec.name);
        if (hit) {
          const { etag } = await getSegmentById(headers, hit.id);
          const patchBody = {
            name: spec.name,
            description: spec.description,
            expression: body.expression,
            evaluationInfo: body.evaluationInfo,
            mergePolicyId: body.mergePolicyId,
            schema: body.schema,
            profileInstanceId: 'ups',
            dataGovernancePolicy: body.dataGovernancePolicy,
          };
          const patched = await patchSegment(headers, hit.id, patchBody, etag);
          results.push({ name: spec.name, action: 'updated', id: hit.id, ok: true, detail: patched });
          continue;
        }
      }
      const created = await postSegment(headers, body);
      const id = created.id || created.segmentId || null;
      results.push({ name: spec.name, action: 'created', id, ok: true });
    } catch (e) {
      results.push({
        name: spec.name,
        action: 'error',
        ok: false,
        error: String(e && e.message ? e.message : e),
      });
    }
  }

  console.log(JSON.stringify({ ok: results.every((r) => r.ok), sandbox, tenant: tenantArg, mergePolicyId, results }, null, 2));
  if (!results.every((r) => r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
});
