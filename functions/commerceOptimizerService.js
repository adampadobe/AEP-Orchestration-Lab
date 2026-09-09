'use strict';

const crypto = require('node:crypto');

const ACO_SCOPE = 'commerce.aco.ingestion';
const MAX_QUERY_LENGTH = 20_000;
const INGESTION_OPERATIONS = Object.freeze({
  product_create: { method: 'POST', path: '/v1/catalog/products', limit: 100, target: productTarget },
  product_update: { method: 'PATCH', path: '/v1/catalog/products', limit: 100, target: productTarget },
  product_delete: { method: 'POST', path: '/v1/catalog/products/delete', limit: 100, target: productTarget, destructive: true },
  product_metadata_create: { method: 'POST', path: '/v1/catalog/products/metadata', limit: 100, target: metadataTarget },
  product_metadata_update: { method: 'PATCH', path: '/v1/catalog/products/metadata', limit: 100, target: metadataTarget },
  product_metadata_delete: { method: 'POST', path: '/v1/catalog/products/metadata/delete', limit: 100, target: metadataTarget, destructive: true },
  category_create: { method: 'POST', path: '/v1/catalog/categories', limit: 100, target: categoryTarget },
  category_update: { method: 'PATCH', path: '/v1/catalog/categories', limit: 100, target: categoryTarget },
  category_delete: { method: 'POST', path: '/v1/catalog/categories/delete', limit: 100, target: categoryTarget, destructive: true },
  category_metadata_create: { method: 'POST', path: '/v1/catalog/categories/metadata', limit: 100, target: metadataTarget },
  category_metadata_update: { method: 'PATCH', path: '/v1/catalog/categories/metadata', limit: 100, target: metadataTarget },
  category_metadata_delete: { method: 'POST', path: '/v1/catalog/categories/metadata/delete', limit: 100, target: metadataTarget, destructive: true },
  price_book_create: { method: 'POST', path: '/v1/catalog/price-books', limit: 500, target: priceBookTarget },
  price_book_update: { method: 'PATCH', path: '/v1/catalog/price-books', limit: 500, target: priceBookTarget },
  price_book_delete: { method: 'POST', path: '/v1/catalog/price-books/delete', limit: 500, target: priceBookTarget, destructive: true },
  price_create: { method: 'POST', path: '/v1/catalog/products/prices', limit: 500, target: priceTarget },
  price_update: { method: 'PATCH', path: '/v1/catalog/products/prices', limit: 500, target: priceTarget },
  price_delete: { method: 'POST', path: '/v1/catalog/products/prices/delete', limit: 500, target: priceTarget, destructive: true },
  product_layer_create: { method: 'POST', path: '/v1/catalog/products/layers', limit: 100, target: productLayerTarget },
  product_layer_delete: { method: 'POST', path: '/v1/catalog/products/layers/delete', limit: 100, target: productLayerTarget, destructive: true },
});

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function requiredString(value, name, max = 200) {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw badRequest(`${name} is required (maximum ${max} characters).`);
  return text;
}

function sourceLocale(item) {
  if (!item.source || typeof item.source !== 'object' || Array.isArray(item.source)) throw badRequest('Each item requires source.locale.');
  return requiredString(item.source.locale, 'source.locale', 35);
}

function productTarget(item) { return { sku: requiredString(item.sku, 'sku'), locale: sourceLocale(item) }; }
function categoryTarget(item) { return { slug: requiredString(item.slug, 'slug', 500), locale: sourceLocale(item) }; }
function metadataTarget(item) { return { code: requiredString(item.code, 'code'), locale: sourceLocale(item) }; }
function priceBookTarget(item) { return { priceBookId: requiredString(item.priceBookId, 'priceBookId') }; }
function priceTarget(item) { return { sku: requiredString(item.sku, 'sku'), priceBookId: requiredString(item.priceBookId, 'priceBookId') }; }
function productLayerTarget(item) {
  const target = productTarget(item);
  return { ...target, layer: requiredString(item.source.layer, 'source.layer') };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function withOptimizerScopes(baseScopes = '') {
  const scopes = new Set(String(baseScopes).split(/[\s,]+/).filter(Boolean));
  for (const scope of ['openid', 'AdobeID', 'profile', 'email', ACO_SCOPE]) scopes.add(scope);
  return [...scopes].join(' ');
}

function parseOptimizerEndpoint(rawEndpoint) {
  const value = String(rawEndpoint || '').trim().replace(/\/+$/, '');
  let url;
  try { url = new URL(value); } catch { throw new Error('Adobe Commerce Optimizer endpoint is invalid.'); }
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.api.commerce.adobe.com') || parts.length !== 1) {
    throw new Error('Adobe Commerce Optimizer endpoint is invalid.');
  }
  const regionCode = url.hostname.split('-')[0];
  return {
    baseEndpoint: `${url.origin}/${parts[0]}`,
    graphqlEndpoint: `${url.origin}/${parts[0]}/graphql`,
    catalogEndpoint: `${url.origin}/${parts[0]}/v1/catalog`,
    instanceId: parts[0],
    environment: url.hostname.includes('-sandbox.') ? 'sandbox' : 'production',
    regionCode,
    region: regionCode === 'na1' ? 'North America' : regionCode,
  };
}

function assertReadOnlyGraphql(query) {
  const value = String(query || '').trim();
  if (!value || value.length > MAX_QUERY_LENGTH) throw new Error('GraphQL query must contain 1 to 20,000 characters.');
  const withoutComments = value.replace(/#[^\n\r]*/g, ' ');
  if (/\b(mutation|subscription)\b/i.test(withoutComments)) {
    throw new Error('Commerce Optimizer storefront GraphQL is read-only; mutations and subscriptions are rejected.');
  }
  return value;
}

function optimizerHeaders({ viewId, priceBookId, locale = 'en-US', policies, instanceId }) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const view = String(viewId || '').trim();
  if (!view) throw new Error('view_id is required for Commerce Optimizer catalog queries.');
  headers['AC-View-Id'] = view;
  headers['AC-Environment-Id'] = instanceId;
  headers['AC-Scope-Locale'] = String(locale || 'en-US').trim();
  if (priceBookId) headers['AC-Price-Book-ID'] = String(priceBookId).trim();
  for (const [name, rawValue] of Object.entries(policies || {})) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error(`Invalid policy header name: ${name}`);
    const value = String(rawValue);
    if (!value || value.length > 500) throw new Error(`Invalid policy value for ${name}.`);
    headers[`AC-Policy-${name}`] = value;
  }
  return headers;
}

function createCommerceOptimizerService(deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const endpoint = () => parseOptimizerEndpoint(deps.getEndpoint());

  async function jsonRequest(url, init) {
    const response = await fetchImpl(url, init);
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!response.ok) {
      const error = new Error(`Commerce Optimizer API returned HTTP ${response.status}.`);
      error.status = response.status;
      error.details = payload;
      throw error;
    }
    return payload;
  }

  async function ingestionRequest(operation, items) {
    const meta = endpoint();
    const token = await deps.getAccessToken(withOptimizerScopes(deps.getBaseScopes()));
    return jsonRequest(`${meta.baseEndpoint}${operation.path}`, {
      method: operation.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(items),
    });
  }

  async function accessInfo() {
    const meta = endpoint();
    const org = String(deps.getImsOrg()).trim();
    const token = await deps.getAccessToken(withOptimizerScopes(deps.getBaseScopes()));
    const ownerUrl = `https://ccm.api.commerce.adobe.com/api/v1/tenants/${encodeURIComponent(meta.instanceId)}/owner/${encodeURIComponent(org)}`;
    const tenant = await jsonRequest(ownerUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': String(deps.getClientId()).trim(),
        'x-gw-ims-org-id': org,
        Accept: 'application/json',
      },
    });
    return {
      ok: true,
      product: 'Adobe Commerce Optimizer',
      organization: org,
      instance: {
        id: meta.instanceId,
        name: tenant.name || null,
        product: tenant.product || null,
        state: tenant.state || null,
        userCanAccess: tenant.userCanAccess === true,
        userCanAdminister: tenant.userCanAdminister === true,
        environment: meta.environment,
        region: meta.region,
      },
      endpoints: { graphql: meta.graphqlEndpoint, catalog: meta.catalogEndpoint },
      catalogViewRequired: true,
      ingestion: {
        scope: ACO_SCOPE,
        scopeRequested: true,
        writeAccessVerified: false,
        note: 'The IMS token was obtained while requesting the Commerce Optimizer ingestion scope. Write entitlement is intentionally not claimed until a separately confirmed ingestion request is accepted.',
      },
    };
  }

  function capabilities() {
    const meta = endpoint();
    return {
      ok: true,
      product: 'Adobe Commerce Optimizer',
      instance: { id: meta.instanceId, environment: meta.environment, region: meta.region },
      endpoints: { graphql: meta.graphqlEndpoint, catalog: meta.catalogEndpoint },
      supportedQueries: ['commerceOptimizer', 'attributeMetadata', 'productSearch', 'products', 'categoryTree', 'navigation', 'recommendationsByUnitIds'],
      supportedIngestion: Object.fromEntries(Object.entries(INGESTION_OPERATIONS).map(([name, operation]) => [name, {
        method: operation.method,
        path: operation.path,
        batchLimit: operation.limit,
        destructive: operation.destructive === true,
      }])),
      requirements: [
        'Provide AC-View-Id as view_id for every storefront catalog query.',
        'The catalog view must be public; private access tokens are not accepted through MCP arguments.',
        'Product metadata must be ingested before products that use those attributes.',
      ],
      guardrails: [
        'Storefront GraphQL remains read-only.',
        'Ingestion is limited to the documented operation allowlist.',
        'Every write requires preview or delete audit, an unchanged preflight ID, and exact confirmation.',
        'A single ingestion request is sent without automatic retry; acceptance is asynchronous and must be verified through storefront reads after indexing.',
      ],
    };
  }

  async function graphql({ query, variables = {}, viewId, priceBookId, locale = 'en-US', policies = {} }) {
    const meta = endpoint();
    const payload = await jsonRequest(meta.graphqlEndpoint, {
      method: 'POST',
      headers: optimizerHeaders({ viewId, priceBookId, locale, policies, instanceId: meta.instanceId }),
      body: JSON.stringify({ query: assertReadOnlyGraphql(query), variables }),
    });
    return { ok: !payload.errors, data: payload.data || null, errors: payload.errors || [], viewId };
  }

  function ingestionPlan({ operation, items }, destructive) {
    const name = requiredString(operation, 'operation', 80);
    const definition = INGESTION_OPERATIONS[name];
    if (!definition || Boolean(definition.destructive) !== destructive) {
      throw badRequest(destructive ? 'Unsupported Commerce Optimizer delete operation.' : 'Unsupported Commerce Optimizer change operation.');
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > definition.limit) {
      throw badRequest(`items must contain 1 to ${definition.limit} records for ${name}.`);
    }
    const payload = items.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length === 0) {
        throw badRequest('Each ingestion item must be a non-empty object.');
      }
      return item;
    });
    const targets = payload.map(definition.target);
    const snapshot = { operation: name, method: definition.method, path: definition.path, targets, items: payload };
    return { name, definition, payload, targets, preflightId: digest(snapshot) };
  }

  function confirmation(plan) {
    const verb = plan.definition.destructive ? 'DELETE' : 'INGEST';
    return `${verb} ACO ${plan.name.toUpperCase()} ${plan.payload.length} RECORDS`;
  }

  function previewResult(plan, phase) {
    return {
      ok: true,
      phase,
      operation: plan.name,
      request: { method: plan.definition.method, path: plan.definition.path, recordCount: plan.payload.length },
      targets: plan.targets,
      proposed: plan.payload,
      preflight_id: plan.preflightId,
      required_confirmation: confirmation(plan),
      warnings: [
        'This targets the live configured Commerce Optimizer instance.',
        'Ingestion is asynchronous; an ACCEPTED response does not mean storefront indexing has completed.',
        ...(plan.definition.destructive ? ['Deletion is destructive; preserve source records if rollback may be needed.'] : []),
      ],
    };
  }

  function ingestionChangePreview(params) {
    return previewResult(ingestionPlan(params, false), 'preview');
  }

  function ingestionDeleteAudit(params) {
    return previewResult(ingestionPlan(params, true), 'audit');
  }

  async function applyIngestion(params, destructive) {
    const plan = ingestionPlan(params, destructive);
    if (String(params.preflight_id || '') !== plan.preflightId) throw Object.assign(new Error('preflight_id is stale or invalid; run preview or audit again.'), { status: 409 });
    if (String(params.confirmation || '') !== confirmation(plan)) throw badRequest(`confirmation must exactly equal: ${confirmation(plan)}`);
    const platformResult = await ingestionRequest(plan.definition, plan.payload);
    return {
      ok: true,
      phase: destructive ? 'delete_submitted' : 'change_submitted',
      operation: plan.name,
      targetCount: plan.targets.length,
      targets: plan.targets,
      platformResult,
      verification: {
        state: 'pending_indexing',
        note: 'Use the existing catalog-view GraphQL tools to verify shopper-visible state after Commerce Optimizer finishes asynchronous indexing.',
      },
    };
  }

  const ingestionChangeApply = (params) => applyIngestion(params, false);
  const ingestionDeleteApply = (params) => applyIngestion(params, true);

  return {
    accessInfo,
    capabilities,
    graphql,
    ingestionChangePreview,
    ingestionChangeApply,
    ingestionDeleteAudit,
    ingestionDeleteApply,
  };
}

module.exports = {
  ACO_SCOPE,
  INGESTION_OPERATIONS,
  assertReadOnlyGraphql,
  createCommerceOptimizerService,
  optimizerHeaders,
  parseOptimizerEndpoint,
  withOptimizerScopes,
};
