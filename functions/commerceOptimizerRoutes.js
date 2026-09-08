'use strict';

const crypto = require('node:crypto');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || '').trim());
  const right = Buffer.from(String(b || '').trim());
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function authorize(req, { internalMcpKey, mcpApiKeyStore }) {
  const key = String(req.headers['x-aep-lab-mcp-key'] || '').trim();
  if (!key) return { ok: false, status: 401, error: 'Missing MCP API key.' };
  if (safeEqual(key, internalMcpKey.value())) return { ok: true, source: 'internal' };
  const result = await mcpApiKeyStore.validateUserApiKey(key);
  return result?.ok ? { ok: true, source: 'user', principalUid: result.principalUid } : { ok: false, status: 403, error: 'Invalid MCP API key.' };
}

function queryFor(action, body) {
  if (action === 'view_check') return { query: 'query CommerceOptimizerViewCheck { commerceOptimizer { priceBookId } }', variables: {} };
  if (action === 'attribute_metadata') return { query: 'query CommerceOptimizerAttributeMetadata { attributeMetadata { filterableInSearch { attribute frontendInput label numeric } sortable { attribute frontendInput label numeric } } }', variables: {} };
  if (action === 'product_search') return {
    query: 'query CommerceOptimizerProductSearch($phrase:String!, $pageSize:Int!, $currentPage:Int!) { productSearch(phrase:$phrase, page_size:$pageSize, current_page:$currentPage) { total_count page_info { current_page page_size total_pages } items { productView { __typename id sku name urlKey visibility } } } }',
    variables: { phrase: String(body.phrase || ''), pageSize: Number(body.page_size || 10), currentPage: Number(body.current_page || 1) },
  };
  if (action === 'products') return {
    query: 'query CommerceOptimizerProducts($skus:[String!]!) { products(skus:$skus) { __typename id sku name description shortDescription urlKey visibility lastModifiedAt metaTitle metaDescription metaKeyword images { url label roles } } }',
    variables: { skus: Array.isArray(body.skus) ? body.skus.slice(0, 20) : [] },
  };
  if (action === 'category_tree') return { query: 'query CommerceOptimizerCategoryTree { categoryTree { slug name description level parentSlug childrenSlugs } }', variables: {} };
  if (action === 'navigation') return { query: 'query CommerceOptimizerNavigation($family:String!) { navigation(family:$family) { slug name children { slug name } } }', variables: { family: String(body.family || '') } };
  if (action === 'recommendations') return { query: 'query CommerceOptimizerRecommendations($unitIds:[String!]!) { recommendationsByUnitIds(unitIds:$unitIds) { totalResults results { displayOrder pageType storefrontLabel totalProducts typeId unitId unitName label userError productsView { __typename id sku name urlKey } } } }', variables: { unitIds: Array.isArray(body.unit_ids) ? body.unit_ids.slice(0, 20) : [] } };
  if (action === 'graphql') return { query: body.query, variables: body.variables || {} };
  return null;
}

function registerCommerceOptimizerRoutes({ onRequest, optimizerFnOpts, setCors, internalMcpKey, mcpApiKeyStore, commerceOptimizerService }) {
  return {
    commerceOptimizerPrepProxy: onRequest(optimizerFnOpts, async (req, res) => {
      setCors(res);
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
      const auth = await authorize(req, { internalMcpKey, mcpApiKeyStore });
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      const action = String(req.query.action || '').trim();
      try {
        if (action === 'access') return res.json(await commerceOptimizerService.accessInfo());
        if (action === 'capabilities') return res.json(commerceOptimizerService.capabilities());
        if (req.method !== 'POST') return res.status(405).json({ error: 'Catalog queries require POST.' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const operation = queryFor(action, body);
        if (!operation) return res.status(400).json({ error: 'Unsupported Commerce Optimizer action.' });
        return res.json(await commerceOptimizerService.graphql({
          ...operation,
          viewId: body.view_id,
          priceBookId: body.price_book_id,
          locale: body.locale,
          policies: body.policies,
        }));
      } catch (error) {
        console.error('[commerceOptimizerPrepProxy]', error.message);
        return res.status(error.status >= 400 && error.status < 600 ? error.status : 502).json({ error: error.message, details: error.details || undefined });
      }
    }),
  };
}

module.exports = { authorize, queryFor, registerCommerceOptimizerRoutes, safeEqual };
