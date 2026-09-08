import * as z from 'zod';
import {
  commerceAccessInfo,
  commerceAdminChangeApply,
  commerceAdminChangePreview,
  commerceAdminDeleteApply,
  commerceAdminDeleteAudit,
  commerceCapabilities,
  commerceCatalogSummary,
  commerceCategoryProducts,
  commerceCategoryTree,
  commerceGraphqlQuery,
  commerceGraphqlSchema,
  commerceInventorySources,
  commerceInventoryStatus,
  commerceProductAttributes,
  commerceProductGet,
  commerceProductMedia,
  commerceProductSearch,
  commerceStoreConfigs,
} from '../labApiClient.mjs';
import { fromLabApi } from './helpers.mjs';

function result(apiResult, extra = {}) {
  return fromLabApi(apiResult, extra);
}

/** Register the governed Adobe Commerce as a Cloud Service demo-prep catalog. */
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

  mcpServer.registerTool('commerce_product_attributes', {
    title: 'List Commerce product attributes',
    description: 'Lists ACCS product attributes for planning product payloads, filters, variants, and storefront facets.',
    inputSchema: {
      page: z.number().int().min(1).optional(),
      page_size: z.number().int().min(1).max(100).optional().describe('Default 25'),
      store: z.string().optional(),
    },
  }, async (params) => result(await commerceProductAttributes(params)));

  mcpServer.registerTool('commerce_inventory_sources', {
    title: 'List Commerce inventory sources',
    description: 'Lists inventory sources and source codes available for demo stock preparation.',
    inputSchema: {
      page: z.number().int().min(1).optional(),
      page_size: z.number().int().min(1).max(100).optional().describe('Default 25'),
      store: z.string().optional(),
    },
  }, async (params) => result(await commerceInventorySources(params)));

  mcpServer.registerTool('commerce_product_media', {
    title: 'List Commerce product media',
    description: 'Lists media gallery entries for one exact product SKU, including entry IDs needed for governed removal.',
    inputSchema: { sku: z.string().min(1).max(200), store: z.string().optional() },
  }, async (params) => result(await commerceProductMedia(params)));

  mcpServer.registerTool('commerce_category_products', {
    title: 'List products assigned to a Commerce category',
    description: 'Lists the exact SKU and position assignments for one category.',
    inputSchema: { category_id: z.number().int().positive(), store: z.string().optional() },
  }, async (params) => result(await commerceCategoryProducts(params)));

  mcpServer.registerTool('commerce_graphql_schema', {
    title: 'Discover the live Commerce storefront schema',
    description: 'Uses harmless GraphQL introspection to list query and mutation roots available on this ACCS storefront. It never executes mutations.',
    inputSchema: { store: z.string().optional() },
  }, async (params) => result(await commerceGraphqlSchema(params)));

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

  const changeOperations = z.enum([
    'product_upsert', 'category_upsert', 'category_product_assign', 'inventory_source_items_upsert',
  ]);
  const deleteOperations = z.enum([
    'product_delete', 'category_delete', 'category_product_unassign', 'product_media_delete',
  ]);

  mcpServer.registerTool('commerce_admin_change_preview', {
    title: 'Preview a Commerce admin change',
    description:
      'Inspects current live state and previews one curated REST change without writing. Supported operations: product_upsert ' +
      '(input: sku, product), category_upsert (category_id optional, category), category_product_assign ' +
      '(category_id, sku, position), and inventory_source_items_upsert (source_items). Returns a preflight ID and exact confirmation.',
    inputSchema: {
      operation: changeOperations,
      input: z.record(z.unknown()),
      store: z.string().optional(),
    },
  }, async (params) => result(await commerceAdminChangePreview(params)));

  mcpServer.registerTool('commerce_admin_change_apply', {
    title: 'Apply a previewed Commerce admin change',
    description:
      'Applies exactly one curated REST change after a fresh state check. Requires the unchanged input, preflight_id, and exact confirmation returned by commerce_admin_change_preview. ' +
      'The call is never retried and returns a live readback.',
    inputSchema: {
      operation: changeOperations,
      input: z.record(z.unknown()),
      store: z.string().optional(),
      preflight_id: z.string().length(64),
      confirmation: z.string().min(1),
    },
  }, async (params) => result(await commerceAdminChangeApply(params)));

  mcpServer.registerTool('commerce_admin_delete_audit', {
    title: 'Audit a Commerce admin deletion',
    description:
      'Reads and returns the exact target before deletion. Supported operations: product_delete, category_delete, ' +
      'category_product_unassign, and product_media_delete. Returns a preflight ID and exact confirmation phrase.',
    inputSchema: { operation: deleteOperations, input: z.record(z.unknown()), store: z.string().optional() },
  }, async (params) => result(await commerceAdminDeleteAudit(params)));

  mcpServer.registerTool('commerce_admin_delete_apply', {
    title: 'Apply an audited Commerce admin deletion',
    description:
      'Deletes exactly one audited target after a fresh state check and exact confirmation. The call is never retried and verifies absence by readback.',
    inputSchema: {
      operation: deleteOperations,
      input: z.record(z.unknown()),
      store: z.string().optional(),
      preflight_id: z.string().length(64),
      confirmation: z.string().min(1),
    },
  }, async (params) => result(await commerceAdminDeleteApply(params)));
}
