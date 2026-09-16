'use strict';

/**
 * Add-only tenant field-group extension for the Decisioning offer-items schema
 * (Schema Registry PATCH). Stateless two-phase preview/apply, mirroring
 * decisioningCatalogWriteService.js's plan/hash approach: the caller resubmits
 * `fields` unchanged on apply and the server recomputes the plan rather than
 * persisting a pending preview record.
 *
 * The apply gate here is preview_hash + confirmed:true (the boolean idiom
 * lab_decisioning_catalog_bulk_apply already uses for whole-batch confirmation)
 * rather than the typed confirmation phrase lab_decisioning_catalog_change_apply
 * uses for a single entity — schema edits don't have a natural "entity name" to
 * echo back, and the field list itself is the thing to review.
 *
 * The hash embeds the field group's current meta:eTag, so any concurrent edit
 * to the field group changes the recomputed hash on apply; that mismatch is
 * reported as `schema_drifted` rather than the generic stale-hash message,
 * since the whole point of re-resolving the field group on apply is to catch
 * exactly this case.
 */

const decisioningCatalogService = require('./decisioningCatalogService');
const { stable, digest } = require('./decisioningCatalogWriteService');

const { platformFetch, resolveCatalogSchema } = decisioningCatalogService;

const XED_FULL_ACCEPT = 'application/vnd.adobe.xed-full+json';
const JSON_PATCH_CONTENT_TYPE = 'application/json-patch+json';
const MAX_FIELDS = 50;

const TYPE_BUILDERS = {
  string: () => ({ type: 'string' }),
  number: () => ({ type: 'number' }),
  integer: () => ({ type: 'integer' }),
  boolean: () => ({ type: 'boolean' }),
  date: () => ({ type: 'string', format: 'date' }),
  'date-time': () => ({ type: 'string', format: 'date-time' }),
  'string-array': () => ({ type: 'array', items: { type: 'string' } }),
  'number-array': () => ({ type: 'array', items: { type: 'number' } }),
};

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function validateFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > MAX_FIELDS) {
    throw badRequest(`fields is required — an array of 1-${MAX_FIELDS} {name, type, ...} objects.`);
  }
  for (const field of fields) {
    if (!field || typeof field !== 'object') throw badRequest('Each field must be an object.');
    if (!field.name || typeof field.name !== 'string') throw badRequest('Each field requires a name.');
    if (!TYPE_BUILDERS[field.type]) {
      throw badRequest(`field.type must be one of: ${Object.keys(TYPE_BUILDERS).join(', ')}`);
    }
  }
  return fields;
}

function fieldSchema(field) {
  const schema = TYPE_BUILDERS[field.type]();
  if (field.title) schema.title = field.title;
  if (field.description) schema.description = field.description;
  if (Array.isArray(field.enum) && field.enum.length) schema.enum = field.enum;
  return schema;
}

function fieldsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function extractTenantFromSchemaId(schemaId) {
  const match = /^https:\/\/ns\.adobe\.com\/([^/]+)\//.exec(String(schemaId || ''));
  if (!match) throw badRequest(`Could not derive tenant id from schema $id: ${schemaId}`);
  return match[1];
}

async function fetchXdm(opts, path) {
  return platformFetch({ ...opts, method: 'GET', path, extraHeaders: { Accept: XED_FULL_ACCEPT } });
}

/** Resolve the schema's tenant (custom) field group by walking its `allOf` composition. */
async function resolveFieldGroup(opts, schemaId, tenant, fieldGroupIdOverride) {
  if (fieldGroupIdOverride) {
    const fg = await fetchXdm(opts, `/data/foundation/schemaregistry/tenant/fieldgroups/${encodeURIComponent(fieldGroupIdOverride)}`);
    if (!fg.ok) return { ok: false, error: fg.error, status: fg.status };
    return { ok: true, fieldGroupId: fieldGroupIdOverride, fieldGroup: fg.data, etag: fg.data['meta:eTag'] || null };
  }

  const schemaResult = await fetchXdm(opts, `/data/foundation/schemaregistry/tenant/schemas/${encodeURIComponent(schemaId)}`);
  if (!schemaResult.ok) return { ok: false, error: schemaResult.error, status: schemaResult.status };

  const allOf = Array.isArray(schemaResult.data.allOf) ? schemaResult.data.allOf : [];
  const tenantPrefix = `https://ns.adobe.com/${tenant}/mixins/`;
  const candidates = allOf.filter((ref) => typeof ref['$ref'] === 'string' && ref['$ref'].startsWith(tenantPrefix));

  if (candidates.length === 0) {
    return { ok: false, status: 404, error: `No tenant field group found on schema ${schemaId}. Pass field_group_id explicitly.` };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      status: 409,
      error: `Schema ${schemaId} has ${candidates.length} tenant field groups — pass field_group_id explicitly.`,
      matches: candidates.map((c) => ({ id: c['$ref'] })),
    };
  }

  const fieldGroupId = candidates[0]['$ref'];
  const fg = await fetchXdm(opts, `/data/foundation/schemaregistry/tenant/fieldgroups/${encodeURIComponent(fieldGroupId)}`);
  if (!fg.ok) return { ok: false, error: fg.error, status: fg.status };
  return { ok: true, fieldGroupId, fieldGroup: fg.data, etag: fg.data['meta:eTag'] || null };
}

function diffFields(fieldGroup, tenant, fields) {
  const tenantObj = (fieldGroup.properties && fieldGroup.properties[tenant] && fieldGroup.properties[tenant].properties) || {};
  const alreadyPresent = [];
  const toAdd = [];
  const conflicts = [];

  for (const field of fields) {
    const proposed = fieldSchema(field);
    const existing = tenantObj[field.name];
    if (!existing) {
      toAdd.push({ name: field.name, type: field.type, xdm_path: `/properties/${tenant}/properties/${field.name}` });
    } else if (fieldsEqual(existing, proposed)) {
      alreadyPresent.push({ name: field.name, type: field.type });
    } else {
      conflicts.push({
        name: field.name,
        requested_type: field.type,
        existing_type: existing.type || existing.format || 'unknown',
        reason: 'Field already exists with a different shape — add-only, never retyped.',
      });
    }
  }
  return { alreadyPresent, toAdd, conflicts };
}

function buildJsonPatch(fieldGroup, tenant, toAdd, fields) {
  const ops = [];
  const hasTenantObject = Boolean(fieldGroup.properties && fieldGroup.properties[tenant]);
  if (!hasTenantObject && toAdd.length) {
    ops.push({ op: 'add', path: `/properties/${tenant}`, value: { type: 'object', properties: {} } });
  }
  for (const item of toAdd) {
    const field = fields.find((f) => f.name === item.name);
    ops.push({ op: 'add', path: item.xdm_path, value: fieldSchema(field) });
  }
  return ops;
}

async function resolvePlan(params) {
  const fields = validateFields(params.fields);
  const schema = await resolveCatalogSchema({
    sandbox: params.sandbox,
    accessToken: params.accessToken,
    clientId: params.clientId,
    orgId: params.orgId,
    schemaId: params.schema_id,
    autoDetect: true,
    getCatalogConfig: params.getCatalogConfig,
  });
  if (!schema.ok || !schema.schemaId) {
    return { ok: false, status: 404, error: schema.error || 'Could not resolve decisioning offer-items schema id' };
  }

  const tenant = extractTenantFromSchemaId(schema.schemaId);
  const fgResult = await resolveFieldGroup(params, schema.schemaId, tenant, params.field_group_id);
  if (!fgResult.ok) return fgResult;

  const { alreadyPresent, toAdd, conflicts } = diffFields(fgResult.fieldGroup, tenant, fields);
  const jsonPatch = buildJsonPatch(fgResult.fieldGroup, tenant, toAdd, fields);
  const preflightId = digest(stable({ schemaId: schema.schemaId, fieldGroupId: fgResult.fieldGroupId, jsonPatch, etag: fgResult.etag }));

  return {
    ok: true,
    schemaId: schema.schemaId,
    fieldGroupId: fgResult.fieldGroupId,
    fieldGroup: fgResult.fieldGroup,
    etag: fgResult.etag,
    alreadyPresent,
    toAdd,
    conflicts,
    jsonPatch,
    preflightId,
  };
}

async function schemaExtendPreview(params) {
  const plan = await resolvePlan(params);
  if (!plan.ok) return plan;

  return {
    ok: true,
    sandbox: params.sandbox,
    schema_id: plan.schemaId,
    field_group_id: plan.fieldGroupId,
    already_present: plan.alreadyPresent,
    to_add: plan.toAdd,
    conflicts: plan.conflicts,
    json_patch: plan.jsonPatch,
    preview_hash: plan.preflightId,
    confirm_instructions: plan.jsonPatch.length
      ? 'Call lab_decisioning_schema_extend_apply with the same fields, this preview_hash, and confirmed:true to add the listed fields.'
      : 'Nothing to add — every requested field is already present or in conflict.',
  };
}

async function schemaExtendApply(params) {
  if (params.confirmed !== true) {
    throw badRequest('confirmed must be true.');
  }

  const plan = await resolvePlan(params);
  if (!plan.ok) return plan;

  if (String(params.preview_hash || '') !== plan.preflightId) {
    // Recomputing the plan just re-read the field group fresh; if the caller's
    // fields are unchanged, a hash mismatch here can only mean the field group
    // (or its etag) changed since preview — i.e. schema drift.
    return { ok: false, status: 409, error: 'schema_drifted' };
  }

  if (!plan.jsonPatch.length) {
    return { ok: true, schema_id: plan.schemaId, field_group_id: plan.fieldGroupId, added: [], note: 'Nothing to add.' };
  }

  const extraHeaders = { 'Content-Type': JSON_PATCH_CONTENT_TYPE };
  if (plan.etag) extraHeaders['If-Match'] = plan.etag;

  const patchResult = await platformFetch({
    ...params,
    method: 'PATCH',
    path: `/data/foundation/schemaregistry/tenant/fieldgroups/${encodeURIComponent(plan.fieldGroupId)}`,
    body: plan.jsonPatch,
    extraHeaders,
  });
  if (!patchResult.ok) {
    if (patchResult.status === 412) return { ok: false, status: 409, error: 'schema_drifted' };
    return { ok: false, error: patchResult.error, status: patchResult.status, platform: patchResult.platform };
  }

  return {
    ok: true,
    schema_id: plan.schemaId,
    field_group_id: plan.fieldGroupId,
    added: plan.toAdd,
    new_version: patchResult.data && (patchResult.data['meta:eTag'] || patchResult.data.version || null),
  };
}

module.exports = {
  MAX_FIELDS,
  schemaExtendPreview,
  schemaExtendApply,
};
