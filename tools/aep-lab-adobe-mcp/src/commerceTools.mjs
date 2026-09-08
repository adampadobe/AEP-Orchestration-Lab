import * as z from 'zod';
import {
  commerceGraphqlQuery,
  commerceRestGet,
  loadCommerceConfig,
} from './commerceClient.mjs';
import { loadAdobeCredentials } from './imsAuth.mjs';

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

function jsonResult(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

function errorResult(error) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ok: false,
        error: String(error?.message || error),
        status: error?.status || null,
        detail: error?.detail || null,
      }, null, 2),
    }],
    isError: true,
  };
}

function registerReadTool(server, name, definition, handler) {
  server.registerTool(name, { ...definition, annotations: READ_ONLY }, async (input) => {
    try {
      return jsonResult(await handler(input || {}));
    } catch (error) {
      return errorResult(error);
    }
  });
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

export function registerCommerceTools(server) {
  registerReadTool(server, 'commerce_access_info', {
    title: 'Commerce access and instance information',
    description:
      'Verifies the configured Adobe Commerce as a Cloud Service instance with a harmless store configuration read. ' +
      'Returns region, environment, instance ID, endpoints, IMS org, and accessible stores without exposing credentials.',
    inputSchema: {
      store: z.string().optional().describe('Store code (default from ADOBE_COMMERCE_STORE)'),
    },
  }, async ({ store }) => {
    const config = loadCommerceConfig();
    const credentials = loadAdobeCredentials();
    const result = await commerceRestGet({ path: '/V1/store/storeConfigs', store });
    return {
      ok: true,
      product: 'Adobe Commerce as a Cloud Service',
      releaseModel: 'versionless SaaS',
      apiVersion: 'V1',
      imsOrg: credentials.orgId,
      instance: config,
      stores: result.data,
    };
  });

  registerReadTool(server, 'commerce_capabilities', {
    title: 'Commerce demo-prep capabilities',
    description:
      'Returns the safe Commerce demo-prep capability map and the configured ACCS instance. No upstream mutation is performed.',
    inputSchema: {},
  }, async () => ({
    ok: true,
    instance: loadCommerceConfig(),
    capabilities: {
      stores: ['commerce_store_configs'],
      catalog: ['commerce_catalog_summary', 'commerce_product_search', 'commerce_product_get', 'commerce_category_tree'],
      inventory: ['commerce_inventory_status'],
      storefront: ['commerce_graphql_query'],
    },
    guardrails: {
      phase: 'read_only',
      graphqlMutationsAllowed: false,
      restMethodsAllowed: ['GET'],
      nextPhase: 'preview and explicit confirmation gates before catalog writes or cleanup',
    },
  }));

  registerReadTool(server, 'commerce_store_configs', {
    title: 'List Commerce store configurations',
    description: 'Lists ACCS store views and their locale, currency, timezone, and media base URLs.',
    inputSchema: { store: z.string().optional() },
  }, async ({ store }) => {
    const result = await commerceRestGet({ path: '/V1/store/storeConfigs', store });
    return { ok: true, stores: result.data };
  });

  registerReadTool(server, 'commerce_catalog_summary', {
    title: 'Summarize the Commerce catalog',
    description: 'Returns product count, one small product sample, and the category tree at a bounded depth.',
    inputSchema: {
      store: z.string().optional(),
      category_depth: z.number().int().min(1).max(4).optional().describe('Category depth, default 2'),
    },
  }, async ({ store, category_depth = 2 }) => {
    const [products, categories] = await Promise.all([
      commerceRestGet({
        path: '/V1/products',
        store,
        params: productSearchParams({ page: 1, pageSize: 5 }),
      }),
      commerceRestGet({
        path: '/V1/categories',
        store,
        params: { depth: category_depth },
      }),
    ]);
    return {
      ok: true,
      productCount: products.data?.total_count ?? null,
      sampleProducts: products.data?.items || [],
      categories: categories.data,
    };
  });

  registerReadTool(server, 'commerce_product_search', {
    title: 'Search Commerce products',
    description: 'Searches the ACCS admin catalog by product name or exact SKU with bounded pagination.',
    inputSchema: {
      term: z.string().max(200).optional().describe('Search term; omit to list products'),
      field: z.enum(['name', 'sku']).optional().describe('Default name'),
      page: z.number().int().min(1).optional().describe('Default 1'),
      page_size: z.number().int().min(1).max(50).optional().describe('Default 10, max 50'),
      store: z.string().optional(),
    },
  }, async ({ term, field = 'name', page = 1, page_size = 10, store }) => {
    const result = await commerceRestGet({
      path: '/V1/products',
      store,
      params: productSearchParams({ field, term, page, pageSize: page_size }),
    });
    return { ok: true, ...result.data };
  });

  registerReadTool(server, 'commerce_product_get', {
    title: 'Get a Commerce product',
    description: 'Returns one ACCS catalog product by exact SKU.',
    inputSchema: {
      sku: z.string().min(1).max(200),
      store: z.string().optional(),
    },
  }, async ({ sku, store }) => {
    const result = await commerceRestGet({
      path: `/V1/products/${encodeURIComponent(sku)}`,
      store,
    });
    return { ok: true, product: result.data };
  });

  registerReadTool(server, 'commerce_category_tree', {
    title: 'Get the Commerce category tree',
    description: 'Returns the ACCS category tree with a bounded depth.',
    inputSchema: {
      depth: z.number().int().min(1).max(6).optional().describe('Default 3, max 6'),
      root_category_id: z.number().int().positive().optional(),
      store: z.string().optional(),
    },
  }, async ({ depth = 3, root_category_id, store }) => {
    const result = await commerceRestGet({
      path: '/V1/categories',
      store,
      params: { depth, rootCategoryId: root_category_id },
    });
    return { ok: true, categoryTree: result.data };
  });

  registerReadTool(server, 'commerce_inventory_status', {
    title: 'Get Commerce inventory status',
    description: 'Returns stock status for one exact product SKU.',
    inputSchema: {
      sku: z.string().min(1).max(200),
      store: z.string().optional(),
    },
  }, async ({ sku, store }) => {
    const result = await commerceRestGet({
      path: `/V1/stockStatuses/${encodeURIComponent(sku)}`,
      store,
    });
    return { ok: true, inventory: result.data };
  });

  registerReadTool(server, 'commerce_graphql_query', {
    title: 'Run a read-only Commerce GraphQL query',
    description:
      'Runs a storefront GraphQL query against the configured ACCS instance. Mutations and subscriptions are rejected.',
    inputSchema: {
      query: z.string().min(1).max(20000),
      variables: z.record(z.unknown()).optional(),
      store: z.string().optional(),
    },
  }, async ({ query, variables, store }) => {
    const result = await commerceGraphqlQuery({ query, variables, store });
    return { ok: true, graphql: result.data };
  });
}
