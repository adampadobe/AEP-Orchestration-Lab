const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertReadOnlyGraphql,
  createCommerceOptimizerService,
  INGESTION_OPERATIONS,
  optimizerHeaders,
  parseOptimizerEndpoint,
  withOptimizerScopes,
} = require('../commerceOptimizerService');

const ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/testTenant';

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

test('Optimizer endpoint parser derives safe tenant metadata', () => {
  assert.deepEqual(parseOptimizerEndpoint(`${ENDPOINT}/`), {
    baseEndpoint: ENDPOINT,
    graphqlEndpoint: `${ENDPOINT}/graphql`,
    catalogEndpoint: `${ENDPOINT}/v1/catalog`,
    instanceId: 'testTenant', environment: 'sandbox', regionCode: 'na1', region: 'North America',
  });
  assert.throws(() => parseOptimizerEndpoint('https://example.com/tenant'), /invalid/);
  assert.throws(() => parseOptimizerEndpoint(`${ENDPOINT}/graphql`), /invalid/);
});

test('Optimizer scope merge and GraphQL guard fail closed', () => {
  assert.equal(withOptimizerScopes('openid AdobeID').split(' ').filter((s) => s === 'commerce.aco.ingestion').length, 1);
  assert.equal(assertReadOnlyGraphql('query { categoryTree { name } }'), 'query { categoryTree { name } }');
  assert.throws(() => assertReadOnlyGraphql('mutation { ingest }'), /read-only/);
  assert.throws(() => assertReadOnlyGraphql('subscription { changes }'), /read-only/);
});

test('Optimizer headers require a view and constrain policy names', () => {
  assert.throws(() => optimizerHeaders({ instanceId: 'tenant' }), /view_id is required/);
  const headers = optimizerHeaders({ viewId: 'view-1', priceBookId: 'pb-1', policies: { customer_group: 'vip' }, instanceId: 'tenant' });
  assert.equal(headers['AC-View-Id'], 'view-1');
  assert.equal(headers['AC-Environment-Id'], 'tenant');
  assert.equal(headers['AC-Scope-Locale'], 'en-US');
  assert.equal(headers['AC-Price-Book-ID'], 'pb-1');
  assert.equal(headers['AC-Policy-customer_group'], 'vip');
  assert.throws(() => optimizerHeaders({ viewId: 'v', policies: { 'bad name': 'x' }, instanceId: 't' }), /Invalid policy/);
});

test('access check uses IMS while storefront GraphQL does not expose Adobe credentials', async () => {
  const calls = [];
  const service = createCommerceOptimizerService({
    getEndpoint: () => ENDPOINT,
    getClientId: () => 'client-id',
    getImsOrg: () => 'org@AdobeOrg',
    getBaseScopes: () => 'openid',
    getAccessToken: async (scopes) => { assert.match(scopes, /commerce\.aco\.ingestion/); return 'access-token'; },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('ccm.api')) return response({ name: 'Demo ACO', product: 'COMMERCE_OPTIMIZER', state: 'READY', userCanAccess: true, userCanAdminister: false });
      return response({ data: { commerceOptimizer: { priceBookId: 'pb' } } });
    },
  });
  const access = await service.accessInfo();
  assert.equal(access.instance.name, 'Demo ACO');
  assert.equal(access.ingestion.scopeRequested, true);
  assert.equal(access.ingestion.writeAccessVerified, false);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer access-token');
  const graphql = await service.graphql({ query: '{ commerceOptimizer { priceBookId } }', viewId: 'view-1' });
  assert.equal(graphql.ok, true);
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(calls[1].init.headers['AC-View-Id'], 'view-1');
});

test('Optimizer ingestion catalog covers documented resources and methods', () => {
  assert.deepEqual(
    { method: INGESTION_OPERATIONS.product_create.method, path: INGESTION_OPERATIONS.product_create.path },
    { method: 'POST', path: '/v1/catalog/products' },
  );
  assert.deepEqual(
    { method: INGESTION_OPERATIONS.price_update.method, path: INGESTION_OPERATIONS.price_update.path },
    { method: 'PATCH', path: '/v1/catalog/products/prices' },
  );
  assert.equal(INGESTION_OPERATIONS.product_layer_delete.destructive, true);
});

test('Optimizer ingestion requires preview and exact confirmation before one request', async () => {
  const calls = [];
  const service = createCommerceOptimizerService({
    getEndpoint: () => ENDPOINT,
    getClientId: () => 'client-id',
    getImsOrg: () => 'org@AdobeOrg',
    getBaseScopes: () => 'openid',
    getAccessToken: async () => 'access-token',
    fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return response({ status: 'ACCEPTED', acceptedCount: 1 }); },
  });
  const input = { operation: 'product_update', items: [{ sku: 'DEMO-1', source: { locale: 'en-US' }, name: 'Updated' }] };
  const preview = service.ingestionChangePreview(input);
  assert.equal(preview.phase, 'preview');
  assert.equal(preview.request.method, 'PATCH');
  assert.equal(preview.targets[0].sku, 'DEMO-1');
  assert.equal(calls.length, 0);
  await assert.rejects(() => service.ingestionChangeApply({ ...input, preflight_id: preview.preflight_id, confirmation: 'yes' }), /confirmation must exactly equal/);
  assert.equal(calls.length, 0);
  const applied = await service.ingestionChangeApply({
    ...input, preflight_id: preview.preflight_id, confirmation: preview.required_confirmation,
  });
  assert.equal(applied.phase, 'change_submitted');
  assert.equal(applied.platformResult.status, 'ACCEPTED');
  assert.equal(applied.verification.state, 'pending_indexing');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ENDPOINT}/v1/catalog/products`);
  assert.equal(calls[0].init.method, 'PATCH');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer access-token');
});

test('Optimizer delete audit validates identifiers, limits, and stale preflight', async () => {
  const service = createCommerceOptimizerService({
    getEndpoint: () => ENDPOINT,
    getBaseScopes: () => '',
    getAccessToken: async () => 'unused',
    fetchImpl: async () => response({ status: 'ACCEPTED' }),
  });
  const input = { operation: 'price_delete', items: [{ sku: 'DEMO-1', priceBookId: 'default' }] };
  const audit = service.ingestionDeleteAudit(input);
  assert.equal(audit.phase, 'audit');
  assert.match(audit.required_confirmation, /^DELETE ACO/);
  await assert.rejects(() => service.ingestionDeleteApply({
    ...input, preflight_id: '0'.repeat(64), confirmation: audit.required_confirmation,
  }), /stale or invalid/);
  assert.throws(() => service.ingestionDeleteAudit({ operation: 'product_delete', items: [{ sku: 'DEMO-1' }] }), /source\.locale/);
  assert.throws(() => service.ingestionChangePreview({ operation: 'product_delete', items: input.items }), /change operation/);
});
