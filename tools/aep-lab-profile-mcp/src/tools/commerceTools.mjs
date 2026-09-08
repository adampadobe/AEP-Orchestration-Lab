import * as z from 'zod';
import {
  commerceAccessInfo,
  commerceCapabilities,
  commerceCatalogSummary,
  commerceCategoryTree,
  commerceGraphqlQuery,
  commerceInventoryStatus,
  commerceProductGet,
  commerceProductSearch,
  commerceStoreConfigs,
} from '../labApiClient.mjs';
import { fromLabApi } from './helpers.mjs';

function result(apiResult, extra = {}) {
  return fromLabApi(apiResult, extra);
}

/** Register the read-only Adobe Commerce as a Cloud Service demo-prep catalog. */
export function registerCommerceTools(mcpServer) {
  mcpServer.registerTool('commerce_access_info', {
    title: 'Verify Adobe Commerce access',
    description:
      'Verifies the configured Adobe Commerce as a Cloud Service organization and instance with a harmless store read. ' +
      'Returns the versionless SaaS release model, API version, region, environment, endpoints, IMS org, and accessible stores.',
    inputSchema: { store: z.string().optional().describe('Store code; default is default') },
  }, async (params) => result(await commerceAccessInfo(params)));

  mcpServer.registerTool('commerce_capabilities', {
    title: 'List Commerce demo-prep capabilities',
    description: 'Returns the configured ACCS instance, available read-only tools, and enforced guardrails.',
    inputSchema: {},
  }, async () => result(await commerceCapabilities()));

  mcpServer.registerTool('commerce_store_configs', {
    title: 'List Commerce store configurations',
    description: 'Lists accessible store views with locale, currency, timezone, and media configuration.',
    inputSchema: { store: z.string().optional() },
  }, async (params) => result(await commerceStoreConfigs(params)));

  mcpServer.registerTool('commerce_catalog_summary', {
    title: 'Summarize the Commerce catalog',
    description: 'Returns product count, a small product sample, and a bounded category tree.',
    inputSchema: {
      store: z.string().optional(),
      category_depth: z.number().int().min(1).max(4).optional().describe('Default 2'),
    },
  }, async (params) => result(await commerceCatalogSummary(params)));

  mcpServer.registerTool('commerce_product_search', {
    title: 'Search Commerce products',
    description: 'Searches the Commerce admin catalog by product name or exact SKU with bounded pagination.',
    inputSchema: {
      term: z.string().max(200).optional().describe('Omit to list products'),
      field: z.enum(['name', 'sku']).optional().describe('Default name'),
      page: z.number().int().min(1).optional().describe('Default 1'),
      page_size: z.number().int().min(1).max(50).optional().describe('Default 10, maximum 50'),
      store: z.string().optional(),
    },
  }, async (params) => result(await commerceProductSearch(params)));

  mcpServer.registerTool('commerce_product_get', {
    title: 'Get a Commerce product',
    description: 'Returns one Commerce catalog product by exact SKU.',
    inputSchema: { sku: z.string().min(1).max(200), store: z.string().optional() },
  }, async (params) => result(await commerceProductGet(params)));

  mcpServer.registerTool('commerce_category_tree', {
    title: 'Get the Commerce category tree',
    description: 'Returns a bounded Commerce category hierarchy.',
    inputSchema: {
      depth: z.number().int().min(1).max(6).optional().describe('Default 3'),
      root_category_id: z.number().int().positive().optional(),
      store: z.string().optional(),
    },
  }, async (params) => result(await commerceCategoryTree(params)));

  mcpServer.registerTool('commerce_inventory_status', {
    title: 'Get Commerce inventory status',
    description: 'Returns stock status for one exact product SKU.',
    inputSchema: { sku: z.string().min(1).max(200), store: z.string().optional() },
  }, async (params) => result(await commerceInventoryStatus(params)));

  mcpServer.registerTool('commerce_graphql_query', {
    title: 'Run a read-only Commerce GraphQL query',
    description:
      'Runs a storefront GraphQL query against the configured ACCS instance. Mutations and subscriptions are rejected.',
    inputSchema: {
      query: z.string().min(1).max(20_000),
      variables: z.record(z.unknown()).optional(),
      store: z.string().optional(),
    },
  }, async (params) => result(await commerceGraphqlQuery(params)));
}
