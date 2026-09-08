'use strict';

const crypto = require('node:crypto');

const COMMERCE_REQUIRED_SCOPES = Object.freeze([
  'AdobeID',
  'openid',
  'email',
  'profile',
  'additional_info.roles',
  'additional_info.projectedProductContext',
  'commerce.accs',
  'org.read',
]);

const COMMERCE_HOST = /^[a-z0-9-]+\.api\.commerce\.adobe\.com$/i;
const REGION_LABELS = Object.freeze({ na1: 'North America', eu1: 'Europe' });

function withCommerceScopes(scopes) {
  const merged = new Set(String(scopes || '').split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean));
  for (const scope of COMMERCE_REQUIRED_SCOPES) merged.add(scope);
  return [...merged].join(' ');
}

function parseCommerceEndpoint(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) throw Object.assign(new Error('Adobe Commerce endpoint is not configured.'), { status: 503 });

  let url;
  try { url = new URL(raw); } catch {
    throw Object.assign(new Error('Adobe Commerce endpoint configuration is invalid.'), { status: 500 });
  }
  if (url.protocol !== 'https:' || !COMMERCE_HOST.test(url.hostname) || url.search || url.hash) {
    throw Object.assign(new Error('Adobe Commerce endpoint configuration is invalid.'), { status: 500 });
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 1) {
    throw Object.assign(new Error('Adobe Commerce endpoint configuration is invalid.'), { status: 500 });
  }

  const instanceId = parts[0];
  const hostPrefix = url.hostname.split('.')[0];
  const sandbox = hostPrefix.endsWith('-sandbox');
  const regionCode = hostPrefix.replace(/-sandbox$/, '');
  const restEndpoint = `${url.origin}/${instanceId}`;
  return {
    restEndpoint,
    graphqlEndpoint: `${restEndpoint}/graphql`,
    instanceId,
    environment: sandbox ? 'sandbox' : 'production',
    regionCode,
    region: REGION_LABELS[regionCode] || regionCode,
  };
}

function normalizeStore(value) {
  const store = String(value || 'default').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(store)) {
    throw Object.assign(new Error('store must be a valid Commerce store code.'), { status: 400 });
  }
  return store;
}

function appendParams(url, params) {
  for (const [key, value] of Object.entries(params || {})) {
    if (value == null || value === '') continue;
    url.searchParams.append(key, String(value));
  }
}

async function readResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('json')) return response.json().catch(() => ({}));
  return { raw: (await response.text()).slice(0, 50_000) };
}

function assertReadOnlyGraphql(query) {
  const text = String(query || '').trim();
  if (!text) throw Object.assign(new Error('GraphQL query is required.'), { status: 400 });
  if (text.length > 20_000) throw Object.assign(new Error('GraphQL query exceeds 20,000 characters.'), { status: 400 });
  const withoutComments = text.replace(/#[^\n\r]*/g, ' ');
  if (/\bmutation\b/i.test(withoutComments) || /\bsubscription\b/i.test(withoutComments)) {
    throw Object.assign(new Error('Only read-only GraphQL queries are allowed.'), { status: 400 });
  }
  return text;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function preflightId(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function requiredString(value, name, max = 200) {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw Object.assign(new Error(`${name} is required (maximum ${max} characters).`), { status: 400 });
  return text;
}

function requiredObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error(`${name} must be an object.`), { status: 400 });
  }
  return value;
}

function boundedInt(value, fallback, min, max, name) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`${name} must be an integer from ${min} to ${max}.`), { status: 400 });
  }
  return parsed;
}

function requiredInt(value, min, max, name) {
  if (value == null || value === '') throw Object.assign(new Error(`${name} is required.`), { status: 400 });
  return boundedInt(value, undefined, min, max, name);
}

function productSearchParams({ field, term, page, pageSize }) {
  const params = {
    'searchCriteria[currentPage]': page,
    'searchCriteria[pageSize]': pageSize,
    fields: 'items[id,sku,name,type_id,price,status,visibility,updated_at],search_criteria,total_count',
  };
  if (term) {
    params['searchCriteria[filter_groups][0][filters][0][field]'] = field;
    params['searchCriteria[filter_groups][0][filters][0][value]'] = field === 'sku' ? term : `%${term}%`;
    params['searchCriteria[filter_groups][0][filters][0][condition_type]'] = field === 'sku' ? 'eq' : 'like';
  }
  return params;
}

function createCommerceService(cfg) {
  const fetchImpl = cfg.fetchImpl || globalThis.fetch;

  function config() {
    return parseCommerceEndpoint(cfg.getRestEndpoint());
  }

  async function restRequest(method, path, { params, store, body, allowNotFound = false } = {}) {
    if (!String(path).startsWith('/V1/')) {
      throw Object.assign(new Error('Commerce REST path must start with /V1/.'), { status: 400 });
    }
    const endpoint = config();
    const url = new URL(`${endpoint.restEndpoint}${path}`);
    appendParams(url, params);
    const token = await cfg.getAccessToken(withCommerceScopes(cfg.getBaseScopes()));
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': cfg.getClientId(),
        'x-gw-ims-org-id': cfg.getImsOrg(),
        Accept: 'application/json',
        ...(body == null ? {} : { 'Content-Type': 'application/json' }),
        Store: normalizeStore(store),
      },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
    });
    const data = await readResponse(response);
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) {
      throw Object.assign(new Error(`Commerce REST request failed with HTTP ${response.status}.`), {
        status: response.status,
        platformResponse: data,
      });
    }
    return data;
  }

  const restGet = (path, options) => restRequest('GET', path, options);

  async function graphql({ query, variables, store }) {
    const endpoint = config();
    const response = await fetchImpl(endpoint.graphqlEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Store: normalizeStore(store) },
      body: JSON.stringify({ query: assertReadOnlyGraphql(query), variables: variables || {} }),
    });
    const data = await readResponse(response);
    if (!response.ok) {
      throw Object.assign(new Error(`Commerce GraphQL request failed with HTTP ${response.status}.`), {
        status: response.status,
        platformResponse: data,
      });
    }
    return data;
  }

  async function accessInfo({ store }) {
    const endpoint = config();
    return {
      ok: true,
      product: 'Adobe Commerce as a Cloud Service',
      releaseModel: 'versionless SaaS',
      apiVersion: 'V1',
      imsOrg: cfg.getImsOrg(),
      instance: endpoint,
      stores: await restGet('/V1/store/storeConfigs', { store }),
    };
  }

  async function capabilities() {
    return {
      ok: true,
      instance: config(),
      capabilities: {
        stores: ['commerce_store_configs'],
        catalog: ['commerce_catalog_summary', 'commerce_product_search', 'commerce_product_get', 'commerce_category_tree'],
        inventory: ['commerce_inventory_status', 'commerce_inventory_sources'],
        merchandising: ['commerce_product_attributes', 'commerce_product_media', 'commerce_category_products'],
        storefront: ['commerce_graphql_schema', 'commerce_graphql_query'],
        governedAdminChanges: ['commerce_admin_change_preview', 'commerce_admin_change_apply'],
        governedDeletes: ['commerce_admin_delete_audit', 'commerce_admin_delete_apply'],
      },
      guardrails: {
        graphqlMutationsAllowed: false,
        restMethodsAllowed: ['GET', 'POST', 'PUT', 'DELETE'],
        mutationPolicy: 'curated operations only; preview then exact confirmation; one request; readback',
      },
    };
  }

  async function storeConfigs({ store }) {
    return { ok: true, stores: await restGet('/V1/store/storeConfigs', { store }) };
  }

  async function catalogSummary({ store, categoryDepth, category_depth }) {
    const depth = boundedInt(categoryDepth ?? category_depth, 2, 1, 4, 'category_depth');
    const [products, categories] = await Promise.all([
      restGet('/V1/products', { params: productSearchParams({ page: 1, pageSize: 5 }), store }),
      restGet('/V1/categories', { params: { depth }, store }),
    ]);
    return {
      ok: true,
      productCount: products?.total_count ?? null,
      sampleProducts: products?.items || [],
      categories,
    };
  }

  async function productSearch({ term, field, page, pageSize, page_size, store }) {
    const safeTerm = String(term || '').trim().slice(0, 200);
    const safeField = String(field || 'name').toLowerCase();
    if (!['name', 'sku'].includes(safeField)) {
      throw Object.assign(new Error('field must be name or sku.'), { status: 400 });
    }
    return {
      ok: true,
      ...await restGet('/V1/products', {
        params: productSearchParams({
          field: safeField,
          term: safeTerm,
          page: boundedInt(page, 1, 1, 100_000, 'page'),
          pageSize: boundedInt(pageSize ?? page_size, 10, 1, 50, 'page_size'),
        }),
        store,
      }),
    };
  }

  async function productGet({ sku, store }) {
    const value = String(sku || '').trim();
    if (!value || value.length > 200) throw Object.assign(new Error('sku is required (maximum 200 characters).'), { status: 400 });
    return { ok: true, product: await restGet(`/V1/products/${encodeURIComponent(value)}`, { store }) };
  }

  async function categoryTree({ depth, rootCategoryId, root_category_id, store }) {
    const root = rootCategoryId ?? root_category_id;
    return {
      ok: true,
      categoryTree: await restGet('/V1/categories', {
        params: {
          depth: boundedInt(depth, 3, 1, 6, 'depth'),
          rootCategoryId: root == null || root === ''
            ? undefined
            : boundedInt(root, undefined, 1, Number.MAX_SAFE_INTEGER, 'root_category_id'),
        },
        store,
      }),
    };
  }

  async function inventoryStatus({ sku, store }) {
    const value = String(sku || '').trim();
    if (!value || value.length > 200) throw Object.assign(new Error('sku is required (maximum 200 characters).'), { status: 400 });
    return { ok: true, inventory: await restGet(`/V1/stockStatuses/${encodeURIComponent(value)}`, { store }) };
  }

  async function productAttributes({ page, pageSize, page_size, store }) {
    return { ok: true, ...await restGet('/V1/products/attributes', {
      params: {
        'searchCriteria[currentPage]': boundedInt(page, 1, 1, 100_000, 'page'),
        'searchCriteria[pageSize]': boundedInt(pageSize ?? page_size, 25, 1, 100, 'page_size'),
      }, store,
    }) };
  }

  async function inventorySources({ page, pageSize, page_size, store }) {
    return { ok: true, ...await restGet('/V1/inventory/sources', {
      params: {
        'searchCriteria[currentPage]': boundedInt(page, 1, 1, 100_000, 'page'),
        'searchCriteria[pageSize]': boundedInt(pageSize ?? page_size, 25, 1, 100, 'page_size'),
      }, store,
    }) };
  }

  async function productMedia({ sku, store }) {
    const value = requiredString(sku, 'sku');
    return { ok: true, media: await restGet(`/V1/products/${encodeURIComponent(value)}/media`, { store }) };
  }

  async function categoryProducts({ categoryId, category_id, store }) {
    const id = requiredInt(categoryId ?? category_id, 1, Number.MAX_SAFE_INTEGER, 'category_id');
    return { ok: true, products: await restGet(`/V1/categories/${id}/products`, { store }) };
  }

  async function graphqlSchema({ store }) {
    const query = 'query CommerceMcpSchema { __schema { queryType { fields { name } } mutationType { fields { name } } } }';
    const result = await graphql({ query, variables: {}, store });
    const schema = result?.data?.__schema || {};
    return {
      ok: true,
      queryFields: (schema.queryType?.fields || []).map((field) => field.name),
      mutationFields: (schema.mutationType?.fields || []).map((field) => field.name),
      note: 'GraphQL mutations are reported for storefront planning but are not executed by this MCP.',
    };
  }

  async function currentForChange(operation, input, store) {
    if (operation === 'product_upsert') {
      const sku = requiredString(input.sku || input.product?.sku, 'sku');
      return { target: { sku }, current: await restGet(`/V1/products/${encodeURIComponent(sku)}`, { store, allowNotFound: true }) };
    }
    if (operation === 'category_upsert') {
      const id = input.category_id == null ? null : requiredInt(input.category_id, 1, Number.MAX_SAFE_INTEGER, 'category_id');
      if (id) return { target: { category_id: id }, current: await restGet(`/V1/categories/${id}`, { store, allowNotFound: true }) };
      const category = requiredObject(input.category, 'input.category');
      const name = requiredString(category.name, 'input.category.name');
      const parentId = requiredInt(category.parent_id, 1, Number.MAX_SAFE_INTEGER, 'input.category.parent_id');
      const matches = await restGet('/V1/categories/list', { params: {
        'searchCriteria[filter_groups][0][filters][0][field]': 'name',
        'searchCriteria[filter_groups][0][filters][0][value]': name,
        'searchCriteria[filter_groups][0][filters][0][condition_type]': 'eq',
        'searchCriteria[filter_groups][1][filters][0][field]': 'parent_id',
        'searchCriteria[filter_groups][1][filters][0][value]': parentId,
        'searchCriteria[filter_groups][1][filters][0][condition_type]': 'eq',
        'searchCriteria[pageSize]': 2,
      }, store });
      const current = (matches?.items || [])[0] || null;
      return { target: { category_id: current?.id || null, requested_name: name, parent_id: parentId }, current };
    }
    if (operation === 'category_product_assign') {
      const id = requiredInt(input.category_id, 1, Number.MAX_SAFE_INTEGER, 'category_id');
      const sku = requiredString(input.sku, 'sku');
      const links = await restGet(`/V1/categories/${id}/products`, { store });
      return { target: { category_id: id, sku }, current: (Array.isArray(links) ? links : []).find((item) => item.sku === sku) || null };
    }
    if (operation === 'inventory_source_items_upsert') {
      const items = input.source_items;
      if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
        throw Object.assign(new Error('source_items must contain 1 to 50 items.'), { status: 400 });
      }
      const normalized = items.map((item) => ({
        sku: requiredString(item?.sku, 'source_items[].sku'),
        source_code: requiredString(item?.source_code, 'source_items[].source_code', 64),
        quantity: Number(item?.quantity), status: Number(item?.status),
      }));
      if (normalized.some((item) => !Number.isFinite(item.quantity) || ![0, 1].includes(item.status))) {
        throw Object.assign(new Error('Each source item needs a numeric quantity and status 0 or 1.'), { status: 400 });
      }
      const current = [];
      for (const item of normalized) {
        const found = await restGet('/V1/inventory/source-items', { params: {
          'searchCriteria[filter_groups][0][filters][0][field]': 'sku',
          'searchCriteria[filter_groups][0][filters][0][value]': item.sku,
          'searchCriteria[filter_groups][0][filters][0][condition_type]': 'eq',
          'searchCriteria[pageSize]': 100,
        }, store });
        current.push(...(found?.items || []).filter((entry) => entry.source_code === item.source_code));
      }
      return { target: { source_items: normalized }, current };
    }
    throw Object.assign(new Error('Unsupported admin change operation.'), { status: 400 });
  }

  function confirmationFor(operation, target) {
    if (operation === 'product_upsert') return `APPLY PRODUCT ${target.sku}`;
    if (operation === 'category_upsert') return `APPLY CATEGORY ${target.category_id || 'NEW'}`;
    if (operation === 'category_product_assign') return `ASSIGN ${target.sku} TO CATEGORY ${target.category_id}`;
    return `APPLY INVENTORY ${target.source_items.length} ITEMS`;
  }

  async function adminChangePreview({ operation, input, store }) {
    const op = requiredString(operation, 'operation', 80);
    const payload = requiredObject(input, 'input');
    const snapshot = await currentForChange(op, payload, store);
    const plan = { operation: op, input: payload, target: snapshot.target, current: snapshot.current, store: normalizeStore(store) };
    return {
      ok: true, phase: 'preview', operation: op, target: snapshot.target, current: snapshot.current,
      proposed: payload, preflight_id: preflightId(plan), required_confirmation: confirmationFor(op, snapshot.target),
      warnings: ['Applying changes the live Commerce sandbox.', 'Re-run preview if the current object changes.'],
    };
  }

  async function adminChangeApply({ operation, input, store, preflight_id, confirmation }) {
    const preview = await adminChangePreview({ operation, input, store });
    if (String(preflight_id || '') !== preview.preflight_id) {
      throw Object.assign(new Error('preflight_id is stale or invalid; run preview again.'), { status: 409 });
    }
    if (String(confirmation || '') !== preview.required_confirmation) {
      throw Object.assign(new Error(`confirmation must exactly equal: ${preview.required_confirmation}`), { status: 400 });
    }
    const op = preview.operation;
    const payload = requiredObject(input, 'input');
    let platformResult;
    let readback;
    if (op === 'product_upsert') {
      const sku = preview.target.sku;
      const product = { ...requiredObject(payload.product, 'input.product'), sku };
      platformResult = await restRequest(preview.current ? 'PUT' : 'POST', preview.current ? `/V1/products/${encodeURIComponent(sku)}` : '/V1/products', {
        store, body: { product, saveOptions: payload.save_options !== false },
      });
      readback = await restGet(`/V1/products/${encodeURIComponent(sku)}`, { store });
    } else if (op === 'category_upsert') {
      const category = requiredObject(payload.category, 'input.category');
      const id = preview.target.category_id;
      platformResult = await restRequest(id ? 'PUT' : 'POST', id ? `/V1/categories/${id}` : '/V1/categories', { store, body: { category } });
      const readbackId = id || platformResult?.id;
      readback = readbackId ? await restGet(`/V1/categories/${readbackId}`, { store }) : platformResult;
    } else if (op === 'category_product_assign') {
      const { category_id: id, sku } = preview.target;
      platformResult = await restRequest(preview.current ? 'PUT' : 'POST', `/V1/categories/${id}/products`, {
        store, body: { productLink: { sku, category_id: String(id), position: boundedInt(payload.position, 0, 0, Number.MAX_SAFE_INTEGER, 'position') } },
      });
      readback = (await restGet(`/V1/categories/${id}/products`, { store })).find((item) => item.sku === sku) || null;
    } else {
      platformResult = await restRequest('POST', '/V1/inventory/source-items', { store, body: { sourceItems: preview.target.source_items } });
      readback = (await currentForChange(op, payload, store)).current;
    }
    return { ok: true, phase: 'applied', operation: op, target: preview.target, platformResult, readback };
  }

  async function currentForDelete(operation, input, store) {
    if (operation === 'product_delete') {
      const sku = requiredString(input.sku, 'sku');
      return { target: { sku }, current: await restGet(`/V1/products/${encodeURIComponent(sku)}`, { store, allowNotFound: true }) };
    }
    if (operation === 'category_delete') {
      const id = requiredInt(input.category_id, 1, Number.MAX_SAFE_INTEGER, 'category_id');
      return { target: { category_id: id }, current: await restGet(`/V1/categories/${id}`, { store, allowNotFound: true }) };
    }
    if (operation === 'category_product_unassign') {
      const id = requiredInt(input.category_id, 1, Number.MAX_SAFE_INTEGER, 'category_id');
      const sku = requiredString(input.sku, 'sku');
      const links = await restGet(`/V1/categories/${id}/products`, { store });
      return { target: { category_id: id, sku }, current: links.find((item) => item.sku === sku) || null };
    }
    if (operation === 'product_media_delete') {
      const sku = requiredString(input.sku, 'sku');
      const entryId = requiredInt(input.entry_id, 1, Number.MAX_SAFE_INTEGER, 'entry_id');
      return { target: { sku, entry_id: entryId }, current: await restGet(`/V1/products/${encodeURIComponent(sku)}/media/${entryId}`, { store, allowNotFound: true }) };
    }
    throw Object.assign(new Error('Unsupported admin delete operation.'), { status: 400 });
  }

  function deleteConfirmation(operation, target) {
    if (operation === 'product_delete') return `DELETE PRODUCT ${target.sku}`;
    if (operation === 'category_delete') return `DELETE CATEGORY ${target.category_id}`;
    if (operation === 'category_product_unassign') return `UNASSIGN ${target.sku} FROM CATEGORY ${target.category_id}`;
    return `DELETE MEDIA ${target.entry_id} FROM ${target.sku}`;
  }

  async function adminDeleteAudit({ operation, input, store }) {
    const op = requiredString(operation, 'operation', 80);
    const payload = requiredObject(input, 'input');
    const snapshot = await currentForDelete(op, payload, store);
    const plan = { operation: op, target: snapshot.target, current: snapshot.current, store: normalizeStore(store) };
    return {
      ok: true, phase: 'audit', operation: op, target: snapshot.target, current: snapshot.current,
      exists: snapshot.current != null, preflight_id: preflightId(plan),
      required_confirmation: deleteConfirmation(op, snapshot.target),
      warnings: ['Deletion is destructive. Preserve the current snapshot if rollback may be needed.'],
    };
  }

  async function adminDeleteApply({ operation, input, store, preflight_id, confirmation }) {
    const audit = await adminDeleteAudit({ operation, input, store });
    if (String(preflight_id || '') !== audit.preflight_id) throw Object.assign(new Error('preflight_id is stale or invalid; run audit again.'), { status: 409 });
    if (String(confirmation || '') !== audit.required_confirmation) throw Object.assign(new Error(`confirmation must exactly equal: ${audit.required_confirmation}`), { status: 400 });
    if (!audit.exists) return { ok: true, phase: 'already_absent', operation: audit.operation, target: audit.target, readback: null };
    const target = audit.target;
    let path;
    if (audit.operation === 'product_delete') path = `/V1/products/${encodeURIComponent(target.sku)}`;
    else if (audit.operation === 'category_delete') path = `/V1/categories/${target.category_id}`;
    else if (audit.operation === 'category_product_unassign') path = `/V1/categories/${target.category_id}/products/${encodeURIComponent(target.sku)}`;
    else path = `/V1/products/${encodeURIComponent(target.sku)}/media/${target.entry_id}`;
    const platformResult = await restRequest('DELETE', path, { store });
    const readback = await currentForDelete(audit.operation, input, store);
    if (readback.current != null) throw Object.assign(new Error('Commerce accepted the delete but readback still finds the target.'), { status: 502 });
    return { ok: true, phase: 'deleted', operation: audit.operation, target, platformResult, readback: null };
  }

  return {
    accessInfo,
    capabilities,
    storeConfigs,
    catalogSummary,
    productSearch,
    productGet,
    categoryTree,
    inventoryStatus,
    productAttributes,
    inventorySources,
    productMedia,
    categoryProducts,
    graphqlSchema,
    adminChangePreview,
    adminChangeApply,
    adminDeleteAudit,
    adminDeleteApply,
    graphql: async (params) => ({ ok: true, graphql: await graphql(params) }),
  };
}

module.exports = {
  COMMERCE_REQUIRED_SCOPES,
  assertReadOnlyGraphql,
  createCommerceService,
  parseCommerceEndpoint,
  withCommerceScopes,
};
