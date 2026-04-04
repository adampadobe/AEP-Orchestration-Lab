#!/usr/bin/env node
/**
 * Operational naming: schema, dataset, and audience all use "Operational - <use case>".
 *
 * Creates: tenant field group → tenant schema → catalog dataset (not profile-enabled) → segment definition.
 *
 * Usage (repo root):
 *   node scripts/provision-operational-from-spec.mjs examples/operational-supporter-intelligence-spec.json
 *   node scripts/provision-operational-from-spec.mjs path/to/spec.json --dry-run
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { getAccessToken } from '../00 Adobe Auth/src/token.js';
import { getConfig } from '../00 Adobe Auth/src/config.js';
import {
  stripInternalKeys,
  resolveSpecTitles,
  buildFieldGroupPayload,
  buildSchemaPayload,
  tenantKey,
} from './xdm-spec-builders.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';
const UPS_SEGMENT = 'https://platform.adobe.io/data/core/ups/segment/definitions';
const UPS_MERGE_POLICIES = 'https://platform.adobe.io/data/core/ups/config/mergePolicies';

function usage() {
  console.error('Usage: node scripts/provision-operational-from-spec.mjs <spec.json> [--dry-run]');
  process.exit(1);
}

async function patchSchemaEnableUnion(metaAltId, headersBase) {
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${encodeURIComponent(metaAltId)}`;
  const body = [{ op: 'add', path: '/meta:immutableTags', value: ['union'] }];
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...headersBase,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.title || data.detail || res.statusText;
    const detail = data && Object.keys(data).length ? `\n${JSON.stringify(data, null, 2)}` : '';
    throw new Error(`schema union PATCH → ${res.status}: ${msg}${detail}`);
  }
  return data;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function registryPost(path, body, headersBase) {
  const url = `${SCHEMA_REGISTRY}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headersBase,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.message ||
      data.title ||
      data.detail ||
      (Array.isArray(data.errors) ? JSON.stringify(data.errors) : null) ||
      data.error_description ||
      res.statusText;
    const detail = data && Object.keys(data).length ? `\n${JSON.stringify(data, null, 2)}` : '';
    throw new Error(`${path} → ${res.status}: ${msg}${detail}`);
  }
  return data;
}

function resolveFieldGroupId(fgResponse) {
  return fgResponse.$id || fgResponse.id || fgResponse['meta:altId'] || null;
}

function resolveSchemaId(schemaResponse) {
  return schemaResponse.$id || schemaResponse.id || schemaResponse['meta:altId'] || null;
}

async function catalogPost(body, platformHeaders) {
  const url = `${CATALOG_BASE}/dataSets`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...platformHeaders,
      Accept: 'application/vnd.adobe.xdm+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.message || data.title || data.detail)) || res.statusText;
    const detail = data && typeof data === 'object' ? `\n${JSON.stringify(data, null, 2)}` : '';
    throw new Error(`catalog/dataSets → ${res.status}: ${msg}${detail}`);
  }
  /** Catalog often returns 201 with a JSON array of refs, e.g. `["@/dataSets/{id}"]`. */
  if (Array.isArray(data) && data[0] && typeof data[0] === 'string') {
    const m = data[0].match(/@\/dataSets\/([0-9a-fA-F]+)/);
    if (m) return { id: m[1], raw: data };
  }
  return data;
}

async function getDefaultProfileMergePolicyId(token, cfg, orgId, sandbox) {
  const apiKey = process.env.ADOBE_API_KEY || cfg.clientId;
  const url = `${UPS_MERGE_POLICIES}?limit=20`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': apiKey,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`mergePolicies → ${res.status}: ${data.message || res.statusText}`);
  }
  const children = data.children || [];
  const profileDefault = children.find(
    (c) => c.default === true && c.schema?.name === '_xdm.context.profile'
  );
  if (profileDefault?.id) return profileDefault.id;
  const anyProfile = children.find((c) => c.schema?.name === '_xdm.context.profile');
  if (anyProfile?.id) return anyProfile.id;
  if (children[0]?.id) return children[0].id;
  throw new Error('No merge policy returned for sandbox');
}

async function createSegmentDefinition(body, platformHeaders) {
  const res = await fetch(UPS_SEGMENT, {
    method: 'POST',
    headers: {
      ...platformHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.title || data.detail || res.statusText;
    const detail = data && Object.keys(data).length ? `\n${JSON.stringify(data, null, 2)}` : '';
    throw new Error(`segment/definitions → ${res.status}: ${msg}${detail}`);
  }
  return data;
}

function defaultPqlForSupporterRole(spec, tenantIdRaw) {
  const tk = tenantKey(tenantIdRaw);
  const obj = spec.tenantObjectKey || spec.objectKey || 'supporterIntelligence';
  /** Union profile PQL uses tenant-prefixed namespace, e.g. _demoemea.supporterIntelligence... */
  return `${tk}.${obj}.constituentRole.equals("supporter")`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const argv = process.argv.slice(2).filter((a) => a !== '--dry-run');
  if (argv.length < 1) usage();

  const specPath = resolve(REPO_ROOT, argv[0]);
  let spec;
  try {
    spec = JSON.parse(readFileSync(specPath, 'utf8'));
  } catch (e) {
    console.error(`Failed to read spec: ${specPath}`, e.message);
    process.exit(1);
  }
  spec = stripInternalKeys(spec);
  const titles = resolveSpecTitles(spec);

  const tenantId = process.env.ADOBE_TENANT_ID;
  const fgBody = buildFieldGroupPayload(spec, tenantId, titles);
  const token = await getAccessToken();
  const cfg = getConfig();
  const apiKey = process.env.ADOBE_API_KEY || cfg.clientId;
  const orgId = cfg.orgId;
  const sandbox = cfg.sandboxName;
  if (!orgId || !sandbox) {
    console.error('ADOBE_ORG_ID and ADOBE_SANDBOX_NAME must be set in 00 Adobe Auth/.env');
    process.exit(1);
  }

  const schemaHeaders = {
    Accept: 'application/vnd.adobe.xed-full+json;version=1',
    Authorization: `Bearer ${token}`,
    'x-api-key': apiKey,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };

  const platformHeaders = {
    Authorization: `Bearer ${token}`,
    'x-api-key': apiKey,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };

  const schemaVersion = '1.0';
  const datasetBodyPreview = {
    name: titles.datasetName,
    description: spec.datasetDescription || spec.schemaDescription || '',
    schemaRef: {
      id: '(resolved after schema create)',
      contentType: `application/vnd.adobe.xed+json;version=${schemaVersion}`,
    },
  };

  const pqlValue = spec.audiencePql || defaultPqlForSupporterRole(spec, tenantId);
  const mergePolicyIdPreview = '(resolved at runtime)';

  const segmentBodyPreview = {
    name: titles.audienceName,
    profileInstanceId: 'ups',
    description:
      spec.audienceDescription ||
      'Operational audience: profiles marked as supporters in supporter intelligence mixin.',
    schema: { name: '_xdm.context.profile' },
    expression: { type: 'PQL', format: 'pql/text', value: pqlValue },
    evaluationInfo: {
      batch: { enabled: true },
      continuous: { enabled: false },
      synchronous: { enabled: false },
    },
    mergePolicyId: mergePolicyIdPreview,
    dataGovernancePolicy: { excludeOptOut: true },
  };

  if (dryRun) {
    const schemaDry = buildSchemaPayload(
      spec,
      'https://ns.adobe.com/demoemea/mixins/placeholder',
      titles
    );
    console.log(
      JSON.stringify(
        {
          titles,
          fieldGroup: fgBody,
          schema: schemaDry,
          dataset: datasetBodyPreview,
          segment: segmentBodyPreview,
        },
        null,
        2
      )
    );
    return;
  }

  const fgResponse = await registryPost('/tenant/fieldgroups', fgBody, schemaHeaders);
  const fieldGroupId = resolveFieldGroupId(fgResponse);
  if (!fieldGroupId) {
    console.error('Field group created but missing $id:', JSON.stringify(fgResponse, null, 2));
    process.exit(1);
  }

  const schemaBody = buildSchemaPayload(spec, fieldGroupId, titles);
  const schemaResponse = await registryPost('/tenant/schemas', schemaBody, schemaHeaders);
  const schemaId = resolveSchemaId(schemaResponse);
  if (!schemaId) {
    console.error('Schema created but missing $id:', JSON.stringify(schemaResponse, null, 2));
    process.exit(1);
  }

  const schemaMetaAltId = schemaResponse['meta:altId'];
  if (spec.enableUnionForSegmentation !== false && schemaMetaAltId) {
    try {
      await patchSchemaEnableUnion(schemaMetaAltId, schemaHeaders);
    } catch (e) {
      console.error('WARNING: could not enable union tag on schema (segmentation may fail):', e.message);
    }
    await sleep(2500);
  }

  const datasetBody = {
    name: titles.datasetName,
    description: spec.datasetDescription || spec.schemaDescription || '',
    schemaRef: {
      id: schemaId,
      contentType: `application/vnd.adobe.xed+json;version=${schemaVersion}`,
    },
  };

  let datasetId = null;
  try {
    const dsRes = await catalogPost(datasetBody, platformHeaders);
    if (dsRes && typeof dsRes === 'object' && dsRes.id) datasetId = dsRes.id;
    else if (dsRes && typeof dsRes === 'object') {
      for (const v of Object.values(dsRes)) {
        if (v && typeof v === 'object' && v.id) {
          datasetId = v.id;
          break;
        }
      }
    }
  } catch (e) {
    console.error('Dataset creation failed:', e.message);
    console.log(
      JSON.stringify(
        {
          ok: false,
          sandbox,
          fieldGroupId,
          schemaId,
          metaAltId: schemaResponse['meta:altId'],
          datasetError: String(e.message),
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const mergePolicyId = await getDefaultProfileMergePolicyId(token, cfg, orgId, sandbox);
  const segmentBody = {
    name: titles.audienceName,
    profileInstanceId: 'ups',
    description:
      spec.audienceDescription ||
      'Operational audience: profiles marked as supporters in supporter intelligence mixin.',
    schema: { name: '_xdm.context.profile' },
    expression: { type: 'PQL', format: 'pql/text', value: pqlValue },
    evaluationInfo: {
      batch: { enabled: true },
      continuous: { enabled: false },
      synchronous: { enabled: false },
    },
    mergePolicyId,
    dataGovernancePolicy: { excludeOptOut: true },
  };

  let segmentResult = null;
  let segmentError = null;
  const segmentRetries = spec.segmentRetryCount ?? 4;
  for (let attempt = 0; attempt < segmentRetries; attempt++) {
    try {
      segmentResult = await createSegmentDefinition(segmentBody, platformHeaders);
      segmentError = null;
      break;
    } catch (e) {
      segmentError = e.message;
      if (attempt < segmentRetries - 1) await sleep(2000 * (attempt + 1));
    }
  }

  const summary = {
    ok: true,
    sandbox,
    titles,
    fieldGroupId,
    schemaId,
    schemaMetaAltId: schemaResponse['meta:altId'],
    datasetId,
    audience: segmentResult
      ? {
          id: segmentResult.id,
          name: segmentResult.name,
        }
      : null,
    audiencePqlUsed: segmentBody.expression.value,
    segmentError: segmentError || undefined,
    specPath: argv[0],
  };

  console.log(JSON.stringify(summary, null, 2));
  if (segmentError) process.exit(2);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
