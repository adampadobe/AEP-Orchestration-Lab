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

test('Commerce admin product change is previewed, confirmation-gated, applied once, and read back', async () => {
  const calls = [];
  let product = { sku: 'demo-1', name: 'Before', price: 10 };
  const service = createCommerceService({
    getRestEndpoint: () => ENDPOINT,
    getClientId: () => 'client-id',
    getImsOrg: () => 'org@AdobeOrg',
    getBaseScopes: () => 'openid',
    getAccessToken: async () => 'access-token',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init.method, body: init.body });
      if (init.method === 'PUT') {
        product = JSON.parse(init.body).product;
        return response(product);
      }
      return response(product);
    },
  });
  const input = { sku: 'demo-1', product: { name: 'After', price: 12 } };
  const preview = await service.adminChangePreview({ operation: 'product_upsert', input });
  assert.equal(preview.phase, 'preview');
  assert.equal(preview.required_confirmation, 'APPLY PRODUCT demo-1');
  assert.equal(calls.every((call) => call.method === 'GET'), true);
  await assert.rejects(
    service.adminChangeApply({ operation: 'product_upsert', input, preflight_id: preview.preflight_id, confirmation: 'yes' }),
    /confirmation must exactly equal/,
  );
  assert.equal(calls.every((call) => call.method === 'GET'), true);
  const applied = await service.adminChangeApply({
    operation: 'product_upsert', input, preflight_id: preview.preflight_id, confirmation: preview.required_confirmation,
  });
  assert.equal(applied.phase, 'applied');
  assert.equal(applied.readback.name, 'After');
  assert.equal(calls.filter((call) => call.method === 'PUT').length, 1);
});

test('Commerce delete audit never mutates and stale targets fail closed', async () => {
  let product = { sku: 'demo-delete', name: 'Delete me' };
  const calls = [];
  const service = createCommerceService({
    getRestEndpoint: () => ENDPOINT,
    getClientId: () => 'client-id',
    getImsOrg: () => 'org@AdobeOrg',
    getBaseScopes: () => 'openid',
    getAccessToken: async () => 'access-token',
    fetchImpl: async (_url, init) => {
      calls.push(init.method);
      if (init.method === 'DELETE') { product = null; return response(true); }
      return product ? response(product) : response({ message: 'missing' }, 404);
    },
  });
  const audit = await service.adminDeleteAudit({ operation: 'product_delete', input: { sku: 'demo-delete' } });
  assert.equal(audit.exists, true);
  assert.deepEqual(calls, ['GET']);
  product = { sku: 'demo-delete', name: 'Changed after audit' };
  await assert.rejects(service.adminDeleteApply({
    operation: 'product_delete', input: { sku: 'demo-delete' }, preflight_id: audit.preflight_id,
    confirmation: audit.required_confirmation,
  }), /stale or invalid/);
  assert.equal(calls.includes('DELETE'), false);
});
