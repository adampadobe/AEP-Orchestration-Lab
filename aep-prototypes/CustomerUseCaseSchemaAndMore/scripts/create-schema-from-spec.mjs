#!/usr/bin/env node
/**
 * Create a custom field group + tenant schema from a JSON spec (use case → XDM).
 *
 * Usage (from repo root):
 *   node scripts/create-schema-from-spec.mjs path/to/spec.json
 *   node scripts/create-schema-from-spec.mjs path/to/spec.json --dry-run
 *
 * Requires 00 Adobe Auth/.env (IMS + ADOBE_ORG_ID + ADOBE_SANDBOX_NAME) and ADOBE_TENANT_ID
 * (namespace without leading underscore, e.g. demoemea).
 *
 * For operational naming + dataset + audience, use provision-operational-from-spec.mjs.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { getAccessToken } from '../00 Adobe Auth/src/token.js';
import { getConfig } from '../00 Adobe Auth/src/config.js';
import {
  stripInternalKeys,
  buildFieldGroupPayload,
  buildSchemaPayload,
} from './xdm-spec-builders.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';

function usage() {
  console.error(`Usage: node scripts/create-schema-from-spec.mjs <spec.json> [--dry-run]`);
  process.exit(1);
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
  return (
    fgResponse.$id ||
    fgResponse.id ||
    fgResponse['meta:altId'] ||
    (fgResponse['repo:createdDate'] && fgResponse['@id']) ||
    null
  );
}

function resolveSchemaId(schemaResponse) {
  return schemaResponse.$id || schemaResponse.id || schemaResponse['meta:altId'] || null;
}

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
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
  if (!spec.schemaTitle && !spec.operationalUseCaseName) {
    console.error('spec.schemaTitle (or operationalUseCaseName in operational specs) is required');
    process.exit(1);
  }

  const titles = {
    schemaTitle: spec.schemaTitle || '',
    fieldGroupTitle: spec.fieldGroupTitle || `${spec.schemaTitle || 'Schema'} — field group`,
  };
  if (!titles.schemaTitle) {
    console.error('spec.schemaTitle is required unless using provision-operational-from-spec.mjs');
    process.exit(1);
  }

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

  const headersBase = {
    Accept: 'application/vnd.adobe.xed-full+json;version=1',
    Authorization: `Bearer ${token}`,
    'x-api-key': apiKey,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };

  if (dryRun) {
    const schemaDry = buildSchemaPayload(spec, 'https://ns.adobe.com/demoemea/mixins/placeholder123', titles);
    console.log(JSON.stringify({ fieldGroup: fgBody, schema: schemaDry }, null, 2));
    return;
  }

  const fgResponse = await registryPost('/tenant/fieldgroups', fgBody, token, headersBase);
  const fieldGroupId = resolveFieldGroupId(fgResponse);
  if (!fieldGroupId) {
    console.error('Field group created but could not resolve $id. Response:', JSON.stringify(fgResponse, null, 2));
    process.exit(1);
  }

  const schemaBody = buildSchemaPayload(spec, fieldGroupId, titles);
  const schemaResponse = await registryPost('/tenant/schemas', schemaBody, token, headersBase);
  const schemaId = resolveSchemaId(schemaResponse);

  const summary = {
    ok: true,
    sandbox,
    fieldGroupId,
    schemaId,
    metaAltId: schemaResponse['meta:altId'] ?? fgResponse['meta:altId'] ?? null,
    specPath: argv[0],
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
