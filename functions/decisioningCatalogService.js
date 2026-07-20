/**
 * Allowlisted DPS catalog proxy for Decisioning MCP — offer-items, item-collections,
 * selection-strategies. Mirrors web/profile-viewer/decisioning-catalog.js extractors.
 */

const DPS_BASE = 'https://platform.adobe.io/data/core/dps';
const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';

const OFFER_SCHEMA_TITLE = 'Personalized Offer Items - Experience Decisioning';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

/** @type {Record<string, { listPath: string, singlePrefix: string, requiresSchema: boolean }>} */
const ENTITY_TYPES = {
  'offer-items': {
    listPath: '/data/core/dps/offer-items',
    singlePrefix: '/data/core/dps/offer-items/',
    requiresSchema: true,
  },
  'item-collections': {
    listPath: '/data/core/dps/item-collections',
    singlePrefix: '/data/core/dps/item-collections/',
    requiresSchema: false,
  },
  'selection-strategies': {
    listPath: '/data/core/dps/selection-strategies',
    singlePrefix: '/data/core/dps/selection-strategies/',
    requiresSchema: false,
  },
};

/** Paths permitted for outbound platform calls (list + single + schema auto-detect). */
const ALLOWED_PATH_PREFIXES = [
  '/data/core/dps/offer-items',
  '/data/core/dps/item-collections',
  '/data/core/dps/selection-strategies',
  '/data/foundation/schemaregistry/tenant/schemas',
];

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function isAllowedPath(path) {
  const p = String(path || '');
  return ALLOWED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function extractItems(data) {
  const pr = data && data.platform_response ? data.platform_response : data;
  const source = pr || data;
  if (!source) return [];
  if (Array.isArray(source.results)) return source.results;
  if (Array.isArray(source._embedded && source._embedded.results)) return source._embedded.results;
  if (source._embedded && typeof source._embedded === 'object') {
    for (const key of Object.keys(source._embedded)) {
      const v = source._embedded[key];
      if (Array.isArray(v)) return v;
    }
  }
  if (Array.isArray(source)) return source;
  return [];
}

function itemName(item) {
  return item.name || (item._instance && item._instance.internalName) || item.id || '(unnamed)';
}

function getDecisionItem(it) {
  return (it._experience && it._experience.decisioning && it._experience.decisioning.decisionitem) || {};
}

function dateStatusLabel(startIso, endIso) {
  const now = new Date();
  if (endIso) {
    const end = new Date(endIso);
    if (end < now) return 'Expired';
  }
  if (startIso) {
    const start = new Date(startIso);
    if (start > now) return 'Scheduled';
  }
  return 'Active';
}

function getTagNames(di) {
  const details = di.itemTagDetails;
  if (Array.isArray(details) && details.length) {
    return details.map((t) => t.name || t.tagName || t.id || '').filter(Boolean);
  }
  return [];
}

function normalizeOfferItem(item) {
  const di = getDecisionItem(item);
  const cal = di.itemCalendarConstraints || {};
  const startDate = cal.startDate || null;
  const endDate = cal.endDate || null;
  return {
    id: item.id || null,
    name: di.itemName || itemName(item),
    description: item.description || (item._instance && item._instance['repo:name']) || '',
    priority: di.itemPriority != null ? di.itemPriority : null,
    startDate,
    endDate,
    lifecycleStatus: dateStatusLabel(startDate || '', endDate || ''),
    tags: getTagNames(di),
    schemaId: item.schema || null,
  };
}

function normalizeItemCollection(item) {
  const constraints = Array.isArray(item.constraints) ? item.constraints : [];
  return {
    id: item.id || null,
    name: item.name || '(unnamed)',
    description: item.description || '',
    constraintCount: constraints.length,
    hasRules: constraints.length > 0,
    version: item.etag != null ? item.etag : null,
    created: item.created || null,
    modified: item.modified || null,
  };
}

function normalizeSelectionStrategy(item) {
  const rank = item.rank && typeof item.rank === 'object' ? item.rank : {};
  const order = rank.order && typeof rank.order === 'object' ? rank.order : {};
  const pc = item.profileConstraint && typeof item.profileConstraint === 'object' ? item.profileConstraint : null;
  return {
    id: item.id || null,
    name: item.name || '(unnamed)',
    priority: rank.priority != null ? rank.priority : null,
    rankingType: order.orderEvaluationType || null,
    rankingFunctionId: order.function || null,
    profileConstraintType: pc ? pc.profileConstraintType || 'none' : 'none',
    collectionName: (item.optionSelection && item.optionSelection.filterName) || null,
    collectionId: (item.optionSelection && item.optionSelection.filter) || null,
    version: item.etag != null ? item.etag : null,
    created: item.created || null,
    modified: item.modified || null,
  };
}

function normalizeEntity(entityType, item) {
  switch (entityType) {
    case 'offer-items':
      return normalizeOfferItem(item);
    case 'item-collections':
      return normalizeItemCollection(item);
    case 'selection-strategies':
      return normalizeSelectionStrategy(item);
    default:
      return { id: item.id || null, raw: item };
  }
}

/**
 * @param {object} opts
 * @param {string} opts.method
 * @param {string} opts.path
 * @param {Record<string, unknown>} [opts.params]
 * @param {Record<string, string>} [opts.extraHeaders]
 * @param {string} opts.sandbox
 * @param {string} opts.accessToken
 * @param {string} opts.clientId
 * @param {string} opts.orgId
 */
async function platformFetch(opts) {
  const path = String(opts.path || '');
  if (!isAllowedPath(path)) {
    return { ok: false, status: 400, error: `Path not allowlisted for decisioning catalog: ${path}` };
  }

  const qs = new URLSearchParams();
  if (opts.params && typeof opts.params === 'object') {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v == null) continue;
      if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)));
      else qs.append(k, String(v));
    }
  }

  let url;
  if (path.startsWith('http')) {
    url = path;
  } else if (path.startsWith('/data/core/dps/')) {
    url = `${DPS_BASE}${path.replace(/^\/data\/core\/dps/, '')}`;
  } else if (path.startsWith('/data/foundation/schemaregistry/')) {
    url = `${SCHEMA_REGISTRY}${path.replace(/^\/data\/foundation\/schemaregistry/, '')}`;
  } else {
    url = `https://platform.adobe.io${path.startsWith('/') ? path : `/${path}`}`;
  }

  const q = qs.toString();
  if (q) url += (url.includes('?') ? '&' : '?') + q;

  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${opts.accessToken}`,
    'x-api-key': opts.clientId,
    'x-gw-ims-org-id': opts.orgId,
    'x-sandbox-name': opts.sandbox,
  };
  if (opts.extraHeaders && typeof opts.extraHeaders === 'object') {
    for (const [k, v] of Object.entries(opts.extraHeaders)) {
      if (v != null && String(v).trim()) headers[k] = String(v).trim();
    }
  }

  const res = await fetch(url, { method: opts.method || 'GET', headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: data.title || data.detail || data.message || `Platform HTTP ${res.status}`,
      platform: data,
    };
  }
  return { ok: true, status: res.status, data };
}

async function autoDetectSchemaId(opts) {
  const result = await platformFetch({
    ...opts,
    method: 'GET',
    path: '/data/foundation/schemaregistry/tenant/schemas',
    params: {
      limit: 100,
      orderby: 'title',
      property: `title==${OFFER_SCHEMA_TITLE}`,
    },
    extraHeaders: { Accept: 'application/vnd.adobe.xed-id+json' },
  });
  if (!result.ok) return { ok: false, error: result.error, schemaId: null };

  const schemas = extractItems(result.data);
  for (const s of schemas) {
    if (s.title === OFFER_SCHEMA_TITLE) {
      const schemaId = s['$id'] || s['meta:altId'] || '';
      if (schemaId) return { ok: true, schemaId, source: 'auto-detect' };
    }
  }
  return { ok: false, error: `Schema "${OFFER_SCHEMA_TITLE}" not found`, schemaId: null };
}

/**
 * Resolve offer-items x-schema-id from Firestore config or auto-detect.
 * @param {object} opts
 * @param {Function} opts.getCatalogConfig — catalogConfigStore.getCatalogConfig
 */
async function resolveCatalogSchema(opts) {
  const override = opts.schemaId != null ? String(opts.schemaId).trim() : '';
  if (override) {
    return { ok: true, schemaId: override, source: 'override' };
  }

  let record = null;
  if (typeof opts.getCatalogConfig === 'function') {
    try {
      record = await opts.getCatalogConfig(opts.sandbox);
    } catch {
      record = null;
    }
  }
  const fromStore = record && record.schemaId ? String(record.schemaId).trim() : '';
  if (fromStore) {
    return { ok: true, schemaId: fromStore, source: 'firestore', record };
  }

  if (opts.autoDetect === false) {
    return {
      ok: false,
      error: 'x-schema-id required for offer-items — set schema via GET/POST /api/catalog/config or pass schema_id',
      schemaId: null,
    };
  }

  const detected = await autoDetectSchemaId(opts);
  if (detected.ok && detected.schemaId) {
    return { ok: true, schemaId: detected.schemaId, source: 'auto-detect' };
  }
  return {
    ok: false,
    error: detected.error || 'Could not resolve offer-items schema id',
    schemaId: null,
  };
}

function resolveEntityType(raw) {
  const key = String(raw || '').trim();
  if (!key || !ENTITY_TYPES[key]) {
    return { ok: false, error: `entity_type must be one of: ${Object.keys(ENTITY_TYPES).join(', ')}` };
  }
  return { ok: true, entityType: key, config: ENTITY_TYPES[key] };
}

async function listCatalogEntities(opts) {
  const resolved = resolveEntityType(opts.entityType);
  if (!resolved.ok) return resolved;

  const limit = clampLimit(opts.limit);
  /** @type {Record<string, string>} */
  const extraHeaders = {};
  let schemaMeta = null;

  if (resolved.config.requiresSchema) {
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
      return { ok: false, error: schema.error || 'Missing x-schema-id for offer-items' };
    }
    extraHeaders['x-schema-id'] = schema.schemaId;
    schemaMeta = { schemaId: schema.schemaId, source: schema.source };
  }

  const fetchResult = await platformFetch({
    sandbox: opts.sandbox,
    accessToken: opts.accessToken,
    clientId: opts.clientId,
    orgId: opts.orgId,
    method: 'GET',
    path: resolved.config.listPath,
    params: { limit, ...(opts.params && typeof opts.params === 'object' ? opts.params : {}) },
    extraHeaders,
  });

  if (!fetchResult.ok) {
    return {
      ok: false,
      error: fetchResult.error,
      entityType: resolved.entityType,
      status: fetchResult.status,
      platform: fetchResult.platform,
    };
  }

  const rawItems = extractItems(fetchResult.data);
  const items = rawItems.map((item) => normalizeEntity(resolved.entityType, item));

  return {
    ok: true,
    entityType: resolved.entityType,
    count: items.length,
    limit,
    schema: schemaMeta,
    items,
  };
}

async function getCatalogEntity(opts) {
  const resolved = resolveEntityType(opts.entityType);
  if (!resolved.ok) return resolved;

  const id = String(opts.id || '').trim();
  if (!id) return { ok: false, error: 'id is required' };

  /** @type {Record<string, string>} */
  const extraHeaders = {};
  let schemaMeta = null;

  if (resolved.config.requiresSchema) {
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
      return { ok: false, error: schema.error || 'Missing x-schema-id for offer-items' };
    }
    extraHeaders['x-schema-id'] = schema.schemaId;
    schemaMeta = { schemaId: schema.schemaId, source: schema.source };
  }

  const path = `${resolved.config.singlePrefix}${encodeURIComponent(id)}`;
  const fetchResult = await platformFetch({
    sandbox: opts.sandbox,
    accessToken: opts.accessToken,
    clientId: opts.clientId,
    orgId: opts.orgId,
    method: 'GET',
    path,
    extraHeaders,
  });

  if (!fetchResult.ok) {
    return {
      ok: false,
      error: fetchResult.error,
      entityType: resolved.entityType,
      id,
      status: fetchResult.status,
      platform: fetchResult.platform,
    };
  }

  const raw = fetchResult.data;
  const item = normalizeEntity(resolved.entityType, raw);

  return {
    ok: true,
    entityType: resolved.entityType,
    id,
    schema: schemaMeta,
    item,
    raw,
  };
}

module.exports = {
  OFFER_SCHEMA_TITLE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ENTITY_TYPES,
  ALLOWED_PATH_PREFIXES,
  clampLimit,
  isAllowedPath,
  extractItems,
  normalizeOfferItem,
  normalizeItemCollection,
  normalizeSelectionStrategy,
  normalizeEntity,
  resolveCatalogSchema,
  autoDetectSchemaId,
  listCatalogEntities,
  getCatalogEntity,
  platformFetch,
};
