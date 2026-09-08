const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertReadOnlyGraphql,
  createCommerceService,
  parseCommerceEndpoint,
  withCommerceScopes,
} = require('../commerceService');

const ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/testTenant';

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('Commerce endpoint parser derives safe ACCS metadata', () => {
  assert.deepEqual(parseCommerceEndpoint(`${ENDPOINT}/`), {
    restEndpoint: ENDPOINT,
    graphqlEndpoint: `${ENDPOINT}/graphql`,
    instanceId: 'testTenant',
    environment: 'sandbox',
    regionCode: 'na1',
    region: 'North America',
  });
  assert.throws(() => parseCommerceEndpoint('https://example.com/tenant'), /invalid/);
  assert.throws(() => parseCommerceEndpoint(`${ENDPOINT}/V1/products`), /invalid/);
});

test('Commerce scope merge is additive and mutation guard fails closed', () => {
  const scopes = withCommerceScopes('openid AdobeID commerce.accs');
  assert.equal(scopes.split(' ').filter((scope) => scope === 'commerce.accs').length, 1);
  assert.match(scopes, /org\.read/);
  assert.equal(assertReadOnlyGraphql('{ storeConfig { store_code } }'), '{ storeConfig { store_code } }');
  assert.throws(() => assertReadOnlyGraphql('mutation { createEmptyCart }'), /read-only/);
  assert.throws(() => assertReadOnlyGraphql('subscription Demo { event }'), /read-only/);
});

test('Commerce REST calls are signed and storefront GraphQL omits bearer auth', async () => {
  const calls = [];
  const service = createCommerceService({
    getRestEndpoint: () => ENDPOINT,
    getClientId: () => 'client-id',
    getImsOrg: () => 'org@AdobeOrg',
    getBaseScopes: () => 'openid',
    getAccessToken: async (scopes) => {
      assert.match(scopes, /commerce\.accs/);
      return 'access-token';
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/graphql')) return response({ data: { storeConfig: { store_code: 'default' } } });
      return response([{ code: 'default' }]);
    },
  });

  const stores = await service.storeConfigs({ store: 'default' });
  assert.equal(stores.ok, true);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer access-token');
  assert.equal(calls[0].init.headers.Store, 'default');

  const graphql = await service.graphql({ query: '{ storeConfig { store_code } }' });
  assert.equal(graphql.ok, true);
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(calls[1].init.headers.Store, 'default');
});
