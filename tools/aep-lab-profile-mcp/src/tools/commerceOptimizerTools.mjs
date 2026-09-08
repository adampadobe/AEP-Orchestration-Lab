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

/** Register the read-only Adobe Commerce Optimizer demo-preparation catalog. */
export function registerCommerceOptimizerTools(mcpServer) {
  mcpServer.registerTool('commerce_optimizer_access_info', {
    title: 'Verify Commerce Optimizer access',
    description: 'Authenticates with Adobe IMS and verifies access to the configured Commerce Optimizer organization and tenant without changing catalog data.',
    inputSchema: {},
  }, async () => result(await commerceOptimizerAccessInfo()));

  mcpServer.registerTool('commerce_optimizer_capabilities', {
    title: 'List Commerce Optimizer capabilities',
    description: 'Lists available read-only query families, endpoint readiness, catalog-view requirements, and enforced guardrails.',
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
}
