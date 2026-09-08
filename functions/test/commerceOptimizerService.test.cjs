const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertReadOnlyGraphql,
  createCommerceOptimizerService,
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
  assert.equal(calls[0].init.headers.Authorization, 'Bearer access-token');
  const graphql = await service.graphql({ query: '{ commerceOptimizer { priceBookId } }', viewId: 'view-1' });
  assert.equal(graphql.ok, true);
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(calls[1].init.headers['AC-View-Id'], 'view-1');
});
