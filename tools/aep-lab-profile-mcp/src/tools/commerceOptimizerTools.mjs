import * as z from 'zod';
import {
  commerceOptimizerAccessInfo,
  commerceOptimizerCapabilities,
  commerceOptimizerQuery,
} from '../labApiClient.mjs';
import { fromLabApi } from './helpers.mjs';

const contextSchema = {
  view_id: z.string().min(1).max(200).describe('Commerce Optimizer catalog view ID (AC-View-Id)'),
  price_book_id: z.string().min(1).max(200).optional(),
  locale: z.string().min(2).max(35).optional().describe('AC-Scope-Locale; default en-US'),
  policies: z.record(z.string().max(500)).optional().describe('Optional AC-Policy-* values keyed by policy name'),
};

function result(value) { return fromLabApi(value); }
function run(action, params) { return commerceOptimizerQuery(action, params).then(result); }

/** Register the governed Adobe Commerce Optimizer demo-preparation catalog. */
export function registerCommerceOptimizerTools(mcpServer) {
  mcpServer.registerTool('commerce_optimizer_access_info', {
    title: 'Verify Commerce Optimizer access',
    description: 'Authenticates with Adobe IMS and verifies access to the configured Commerce Optimizer organization and tenant without changing catalog data.',
    inputSchema: {},
  }, async () => result(await commerceOptimizerAccessInfo()));

  mcpServer.registerTool('commerce_optimizer_capabilities', {
    title: 'List Commerce Optimizer capabilities',
    description: 'Lists storefront query families, documented ingestion operations and limits, endpoint readiness, catalog-view requirements, and enforced guardrails.',
    inputSchema: {},
  }, async () => result(await commerceOptimizerCapabilities()));

  mcpServer.registerTool('commerce_optimizer_view_check', {
    title: 'Check a Commerce Optimizer catalog view',
    description: 'Checks that a public catalog view resolves and returns its effective price-book context.',
    inputSchema: contextSchema,
  }, async (params) => run('view_check', params));

  mcpServer.registerTool('commerce_optimizer_attribute_metadata', {
    title: 'Get Commerce Optimizer attribute metadata',
    description: 'Returns attributes exposed for storefront filtering and sorting in the selected catalog view.',
    inputSchema: contextSchema,
  }, async (params) => run('attribute_metadata', params));

  mcpServer.registerTool('commerce_optimizer_product_search', {
    title: 'Search Commerce Optimizer products',
    description: 'Searches shopper-visible products in one catalog view with bounded pagination.',
    inputSchema: {
      ...contextSchema,
      phrase: z.string().max(200).default(''),
      page_size: z.number().int().min(1).max(50).optional().describe('Default 10'),
      current_page: z.number().int().min(1).max(1000).optional().describe('Default 1'),
    },
  }, async (params) => run('product_search', params));

  mcpServer.registerTool('commerce_optimizer_product_get', {
    title: 'Get Commerce Optimizer products',
    description: 'Gets up to 20 shopper-visible products by exact SKU.',
    inputSchema: { ...contextSchema, skus: z.array(z.string().min(1).max(200)).min(1).max(20) },
  }, async (params) => run('products', params));

  mcpServer.registerTool('commerce_optimizer_category_tree', {
    title: 'Get Commerce Optimizer category tree',
    description: 'Returns the category tree visible through the selected public catalog view.',
    inputSchema: contextSchema,
  }, async (params) => run('category_tree', params));

  mcpServer.registerTool('commerce_optimizer_navigation', {
    title: 'Inspect Commerce Optimizer navigation',
    description: 'Runs a bounded navigation lookup for a search phrase in the selected catalog view.',
    inputSchema: { ...contextSchema, family: z.string().min(1).max(200).describe('Category navigation family code') },
  }, async (params) => run('navigation', params));

  mcpServer.registerTool('commerce_optimizer_recommendations', {
    title: 'Get Commerce Optimizer recommendations',
    description: 'Requests recommendation results for up to 20 configured recommendation unit IDs.',
    inputSchema: { ...contextSchema, unit_ids: z.array(z.string().min(1).max(200)).min(1).max(20) },
  }, async (params) => run('recommendations', params));

  mcpServer.registerTool('commerce_optimizer_graphql_query', {
    title: 'Run read-only Commerce Optimizer GraphQL',
    description: 'Runs a custom read-only storefront GraphQL query. Mutations and subscriptions are rejected; private-view access tokens are not accepted.',
    inputSchema: {
      ...contextSchema,
      query: z.string().min(1).max(20_000),
      variables: z.record(z.unknown()).optional(),
    },
  }, async (params) => run('graphql', params));

  const changeOperations = z.enum([
    'product_create', 'product_update',
    'product_metadata_create', 'product_metadata_update',
    'category_create', 'category_update',
    'category_metadata_create', 'category_metadata_update',
    'price_book_create', 'price_book_update',
    'price_create', 'price_update',
    'product_layer_create',
  ]);
  const deleteOperations = z.enum([
    'product_delete', 'product_metadata_delete', 'category_delete', 'category_metadata_delete',
    'price_book_delete', 'price_delete', 'product_layer_delete',
  ]);
  const records = z.array(z.record(z.unknown())).min(1).max(500);

  mcpServer.registerTool('commerce_optimizer_ingestion_change_preview', {
    title: 'Preview a Commerce Optimizer catalog change',
    description:
      'Validates and previews one allowlisted Data Ingestion API create or update batch without writing. Covers products, ' +
      'product/category metadata, categories, price books, prices, and product layers. Returns exact targets, preflight ID, and confirmation.',
    inputSchema: { operation: changeOperations, items: records },
  }, async (params) => run('ingestion_change_preview', params));

  mcpServer.registerTool('commerce_optimizer_ingestion_change_apply', {
    title: 'Submit a previewed Commerce Optimizer catalog change',
    description:
      'Submits exactly one previewed ingestion batch with no automatic retry. Requires unchanged items, preflight_id, and exact confirmation. ' +
      'Returns Adobe acceptance and explicitly marks storefront verification as pending asynchronous indexing.',
    inputSchema: {
      operation: changeOperations,
      items: records,
      preflight_id: z.string().length(64),
      confirmation: z.string().min(1),
    },
  }, async (params) => run('ingestion_change_apply', params));

  mcpServer.registerTool('commerce_optimizer_ingestion_delete_audit', {
    title: 'Audit a Commerce Optimizer catalog deletion',
    description:
      'Validates and displays exact identifiers for one allowlisted Data Ingestion API delete batch without writing. ' +
      'Covers products, metadata, categories, price books, prices, and product layers and returns a preflight ID and exact confirmation.',
    inputSchema: { operation: deleteOperations, items: records },
  }, async (params) => run('ingestion_delete_audit', params));

  mcpServer.registerTool('commerce_optimizer_ingestion_delete_apply', {
    title: 'Submit an audited Commerce Optimizer catalog deletion',
    description:
      'Submits exactly one audited delete batch with no automatic retry after matching the unchanged identifiers, preflight_id, ' +
      'and exact confirmation. Adobe processes accepted deletions asynchronously.',
    inputSchema: {
      operation: deleteOperations,
      items: records,
      preflight_id: z.string().length(64),
      confirmation: z.string().min(1),
    },
  }, async (params) => run('ingestion_delete_apply', params));
}
