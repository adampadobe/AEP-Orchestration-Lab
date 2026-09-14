'use strict';

/**
 * Governed DPS write layer for the Decisioning MCP — create/update/delete for
 * offer-items, item-collections, selection-strategies, offer-rules (eligibility
 * rules), ranking-formulas, and placements. Stateless two-phase preview/apply,
 * mirroring functions/commerceOptimizerService.js's ingestion plan pattern:
 * the caller resubmits the same inputs on apply, and the server recomputes the
 * plan and compares preflightId/confirmation rather than persisting a pending
 * preview record.
 */

const crypto = require('node:crypto');
const decisioningCatalogService = require('./decisioningCatalogService');

const {
  ENTITY_TYPES,
  platformFetch,
  resolveCatalogSchema,
  normalizeEntity,
  listCatalogEntities,
  resolveEntityIdOrName,
  MAX_LIMIT,
} = decisioningCatalogService;

const JSON_PATCH_OPS = new Set(['add', 'replace', 'remove']);
const JSON_PATCH_CONTENT_TYPE = 'application/json-patch+json';

// update uses PATCH with an RFC 6902 JSON Patch body (array of {op,path,value}
// operations) — confirmed live against sandbox apalmer. A full-object PUT also
// works on DPS, but a JSON Patch is safer: it only touches the fields named in
// the patch, where a full-object PUT silently nulls out anything the caller
// omits.
const WRITE_ACTIONS = Object.freeze({
  create: { method: 'POST', destructive: false },
  update: { method: 'PATCH', destructive: false },
  delete: { method: 'DELETE', destructive: true },
});

function validatePatches(patches) {
  if (!Array.isArray(patches) || patches.length === 0) {
    throw badRequest('patches is required for update — a non-empty array of {op, path, value?}.');
  }
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw badRequest('Each patch must be an object with op and path.');
    }
    if (!JSON_PATCH_OPS.has(patch.op)) {
      throw badRequest(`patch.op must be one of: ${[...JSON_PATCH_OPS].join(', ')}`);
    }
    if (typeof patch.path !== 'string' || !patch.path.startsWith('/')) {
      throw badRequest('patch.path must be a string starting with "/".');
    }
  }
  return patches;
}

/** Best-effort reverse-reference scan using fields decisioningCatalogService already normalizes. */
const REFERENCE_CHECKS = Object.freeze([
  { targetType: 'item-collections', viaType: 'selection-strategies', refField: 'collectionId' },
  { targetType: 'ranking-formulas', viaType: 'selection-strategies', refField: 'rankingFunctionId' },
]);

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function requiredString(value, name, max = 200) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > max) throw badRequest(`${name} is required (maximum ${max} characters).`);
  return text;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function resolveEntityConfig(entityType) {
  const config = ENTITY_TYPES[String(entityType || '').trim()];
  if (!config) {
    throw badRequest(`entity_type must be one of: ${Object.keys(ENTITY_TYPES).join(', ')}`);
  }
  return config;
}

/**
 * Build a stateless write plan shared by preview and apply. `id` is the raw,
 * caller-supplied id-or-name — never the name-resolved DPS id. This keeps the
 * hash (and the human-facing confirmation phrase) identical between preview and
 * apply even when apply later resolves a display name to a real id; only the
 * actual network target uses the resolved id (see changeApply/deleteApply).
 * @param {object} opts
 * @param {string} opts.entityType
 * @param {'create'|'update'|'delete'} opts.action
 * @param {string} [opts.id] — required for update/delete; id or exact display name
 * @param {object} [opts.item] — required for create
 * @param {Array<{op:string,path:string,value?:unknown}>} [opts.patches] — required for update
 */
function buildPlan({ entityType, action, id, item, patches }) {
  const actionDef = WRITE_ACTIONS[action];
  if (!actionDef) throw badRequest(`action must be one of: ${Object.keys(WRITE_ACTIONS).join(', ')}`);
  const config = resolveEntityConfig(entityType);

  let targetId = null;
  let path;
  let body;
  if (action === 'create') {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length === 0) {
      throw badRequest('item is required for create.');
    }
    path = config.listPath;
    body = item;
  } else if (action === 'update') {
    targetId = requiredString(id, 'id');
    body = validatePatches(patches);
    path = `${config.singlePrefix}${encodeURIComponent(targetId)}`;
  } else {
    targetId = requiredString(id, 'id');
    path = `${config.singlePrefix}${encodeURIComponent(targetId)}`;
    body = undefined;
  }

  const snapshot = { entityType, action, path, method: actionDef.method, body: body ?? null };
  return {
    entityType,
    action,
    actionDef,
    id: targetId,
    path,
    body,
    requiresSchema: config.requiresSchema,
    preflightId: digest(snapshot),
  };
}

function confirmationPhrase(plan) {
  const verb = plan.actionDef.destructive ? 'DELETE' : plan.action.toUpperCase();
  const target = plan.id ? ` ${plan.id}` : '';
  return `${verb} DECISIONING ${plan.entityType.toUpperCase()}${target}`;
}

function previewResult(plan, phase, extra = {}) {
  return {
    ok: true,
    phase,
    entity_type: plan.entityType,
    action: plan.action,
    request: { method: plan.actionDef.method, path: plan.path },
    id: plan.id,
    proposed: plan.body ?? null,
    preflight_id: plan.preflightId,
    required_confirmation: confirmationPhrase(plan),
    warnings: [
      'This targets the live configured Experience Decisioning catalog for this sandbox.',
      ...(plan.actionDef.destructive ? ['Deletion is destructive and immediate; there is no undo.'] : []),
    ],
    ...extra,
  };
}

async function resolveSchemaHeaders(config, opts) {
  if (!config.requiresSchema) return {};
  const schema = await resolveCatalogSchema({
    sandbox: opts.sandbox,
    accessToken: opts.accessToken,
    clientId: opts.clientId,
    orgId: opts.orgId,
    schemaId: opts.schemaId,
    autoDetect: opts.autoDetect,
    getCatalogConfig: opts.getCatalogConfig,
  });
  if (!schema.ok || !schema.schemaId) {
    throw badRequest(schema.error || 'Missing x-schema-id for offer-items');
  }
  return { 'x-schema-id': schema.schemaId };
}

/** Best-effort dependency scan: who else references this entity, if we know how to check. */
async function findReferences(opts, entityType, id) {
  const checks = REFERENCE_CHECKS.filter((c) => c.targetType === entityType);
  if (!checks.length) return [];

  const referencedBy = [];
  for (const check of checks) {
    const listResult = await listCatalogEntities({
      sandbox: opts.sandbox,
      accessToken: opts.accessToken,
      clientId: opts.clientId,
      orgId: opts.orgId,
      entityType: check.viaType,
      limit: MAX_LIMIT,
    });
    if (!listResult.ok) continue;
    for (const referrer of listResult.items) {
      if (referrer[check.refField] === id) {
        referencedBy.push({ entityType: check.viaType, id: referrer.id, name: referrer.name, via: check.refField });
      }
    }
  }
  return referencedBy;
}

function changePreview(params) {
  const plan = buildPlan(params);
  if (plan.action === 'delete') throw badRequest('Use deleteAudit/deleteApply for delete actions.');
  return previewResult(plan, 'preview');
}

/** Resolve the raw id-or-name on `plan` to a real DPS id and its request path. */
async function resolvePlanPath(params, plan, config) {
  if (plan.action === 'create') return plan.path;
  const resolved = await resolveEntityIdOrName({
    sandbox: params.sandbox,
    accessToken: params.accessToken,
    clientId: params.clientId,
    orgId: params.orgId,
    schemaId: params.schemaId,
    autoDetect: params.autoDetect,
    getCatalogConfig: params.getCatalogConfig,
    entityType: plan.entityType,
    idOrName: plan.id,
  });
  if (!resolved.ok) throw Object.assign(new Error(resolved.error), { status: resolved.status || 404, matches: resolved.matches });
  return { path: `${config.singlePrefix}${encodeURIComponent(resolved.id)}`, resolvedId: resolved.id };
}

async function changeApply(params) {
  const plan = buildPlan(params);
  if (plan.action === 'delete') throw badRequest('Use deleteApply for delete actions.');
  if (String(params.preflight_id || '') !== plan.preflightId) {
    throw Object.assign(new Error('preflight_id is stale or invalid; run change_preview again.'), { status: 409 });
  }
  if (String(params.confirmation || '') !== confirmationPhrase(plan)) {
    throw badRequest(`confirmation must exactly equal: ${confirmationPhrase(plan)}`);
  }

  const config = resolveEntityConfig(plan.entityType);
  const extraHeaders = await resolveSchemaHeaders(config, params);
  if (plan.action === 'update') extraHeaders['Content-Type'] = JSON_PATCH_CONTENT_TYPE;

  let requestPath = plan.path;
  if (plan.action === 'update') {
    const resolved = await resolvePlanPath(params, plan, config);
    requestPath = resolved.path;
  }

  const fetchResult = await platformFetch({
    sandbox: params.sandbox,
    accessToken: params.accessToken,
    clientId: params.clientId,
    orgId: params.orgId,
    method: plan.actionDef.method,
    path: requestPath,
    body: plan.body,
    extraHeaders,
  });
  if (!fetchResult.ok) {
    return { ok: false, error: fetchResult.error, status: fetchResult.status, platform: fetchResult.platform, entity_type: plan.entityType };
  }

  const item = normalizeEntity(plan.entityType, fetchResult.data || plan.body);
  return {
    ok: true,
    phase: `${plan.action}_submitted`,
    entity_type: plan.entityType,
    action: plan.action,
    id: item.id || plan.id,
    item,
  };
}

async function deleteAudit(params) {
  const plan = buildPlan({ ...params, action: 'delete' });
  const config = resolveEntityConfig(plan.entityType);
  const extraHeaders = await resolveSchemaHeaders(config, params);
  const { path: requestPath, resolvedId } = await resolvePlanPath(params, plan, config);

  const currentResult = await platformFetch({
    sandbox: params.sandbox,
    accessToken: params.accessToken,
    clientId: params.clientId,
    orgId: params.orgId,
    method: 'GET',
    path: requestPath,
    extraHeaders,
  });
  if (!currentResult.ok) {
    return { ok: false, error: currentResult.error, status: currentResult.status, entity_type: plan.entityType, id: plan.id };
  }

  const current = normalizeEntity(plan.entityType, currentResult.data);
  const referencedBy = await findReferences(params, plan.entityType, resolvedId);

  return previewResult(plan, 'audit', {
    current,
    referencedBy,
    expected_name: current.name,
    warnings: [
      'DESTRUCTIVE AND IRREVERSIBLE. Confirm the exact id and expected_name with the colleague before calling deleteApply.',
      ...(referencedBy.length ? [`Referenced by ${referencedBy.length} other object(s) — deleting may break them.`] : []),
    ],
  });
}

async function deleteApply(params) {
  const plan = buildPlan({ ...params, action: 'delete' });
  if (String(params.preflight_id || '') !== plan.preflightId) {
    throw Object.assign(new Error('preflight_id is stale or invalid; run deleteAudit again.'), { status: 409 });
  }
  if (String(params.confirmation || '') !== confirmationPhrase(plan)) {
    throw badRequest(`confirmation must exactly equal: ${confirmationPhrase(plan)}`);
  }

  const config = resolveEntityConfig(plan.entityType);
  const extraHeaders = await resolveSchemaHeaders(config, params);
  const { path: requestPath } = await resolvePlanPath(params, plan, config);

  const currentResult = await platformFetch({
    sandbox: params.sandbox,
    accessToken: params.accessToken,
    clientId: params.clientId,
    orgId: params.orgId,
    method: 'GET',
    path: requestPath,
    extraHeaders,
  });
  if (!currentResult.ok) {
    return { ok: false, error: currentResult.error, status: currentResult.status, entity_type: plan.entityType, id: plan.id };
  }

  const current = normalizeEntity(plan.entityType, currentResult.data);
  const expectedName = String(params.expected_name || '').trim();
  if (!expectedName || current.name !== expectedName) {
    throw Object.assign(new Error('Entity name changed since audit; re-run deleteAudit before deleting.'), { status: 409 });
  }

  const deleteResult = await platformFetch({
    sandbox: params.sandbox,
    accessToken: params.accessToken,
    clientId: params.clientId,
    orgId: params.orgId,
    method: 'DELETE',
    path: requestPath,
    extraHeaders,
  });
  if (!deleteResult.ok) {
    return { ok: false, error: deleteResult.error, status: deleteResult.status, entity_type: plan.entityType, id: plan.id };
  }

  return {
    ok: true,
    phase: 'delete_submitted',
    entity_type: plan.entityType,
    id: plan.id,
    deletedName: current.name,
  };
}

module.exports = {
  WRITE_ACTIONS,
  REFERENCE_CHECKS,
  buildPlan,
  confirmationPhrase,
  findReferences,
  changePreview,
  changeApply,
  deleteAudit,
  deleteApply,
};
