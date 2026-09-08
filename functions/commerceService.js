'use strict';

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

function boundedInt(value, fallback, min, max, name) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`${name} must be an integer from ${min} to ${max}.`), { status: 400 });
  }
  return parsed;
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

  async function restGet(path, { params, store } = {}) {
    if (!String(path).startsWith('/V1/')) {
      throw Object.assign(new Error('Commerce REST path must start with /V1/.'), { status: 400 });
    }
    const endpoint = config();
    const url = new URL(`${endpoint.restEndpoint}${path}`);
    appendParams(url, params);
    const token = await cfg.getAccessToken(withCommerceScopes(cfg.getBaseScopes()));
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': cfg.getClientId(),
        'x-gw-ims-org-id': cfg.getImsOrg(),
        Accept: 'application/json',
        Store: normalizeStore(store),
      },
    });
    const data = await readResponse(response);
    if (!response.ok) {
      throw Object.assign(new Error(`Commerce REST request failed with HTTP ${response.status}.`), {
        status: response.status,
        platformResponse: data,
      });
    }
    return data;
  }

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
        inventory: ['commerce_inventory_status'],
        storefront: ['commerce_graphql_query'],
      },
      guardrails: { phase: 'read_only', graphqlMutationsAllowed: false, restMethodsAllowed: ['GET'] },
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

  return {
    accessInfo,
    capabilities,
    storeConfigs,
    catalogSummary,
    productSearch,
    productGet,
    categoryTree,
    inventoryStatus,
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
