import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertReadOnlyGraphql,
  commerceGraphqlQuery,
  commerceRestGet,
  loadCommerceConfig,
  parseCommerceEndpoint,
  withCommerceScopes,
} from '../src/commerceClient.mjs';

const ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/testTenant';

test('parseCommerceEndpoint derives the ACCS instance metadata', () => {
  assert.deepEqual(parseCommerceEndpoint(`${ENDPOINT}/`), {
    restEndpoint: ENDPOINT,
    graphqlEndpoint: `${ENDPOINT}/graphql`,
    instanceId: 'testTenant',
    environment: 'sandbox',
    regionCode: 'na1',
    region: 'North America',
  });
});

test('parseCommerceEndpoint rejects non-Commerce hosts and extra paths', () => {
  assert.throws(() => parseCommerceEndpoint('https://example.com/tenant'), /Commerce endpoint/);
  assert.throws(() => parseCommerceEndpoint(`${ENDPOINT}/V1/products`), /exactly one/);
});

test('loadCommerceConfig validates an explicitly configured GraphQL endpoint', () => {
  assert.throws(() => loadCommerceConfig({
    ADOBE_COMMERCE_REST_ENDPOINT: ENDPOINT,
    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: `${ENDPOINT}/wrong`,
  }), /must match/);
});

test('withCommerceScopes adds required scopes without duplication', () => {
  const scopes = withCommerceScopes('openid AdobeID commerce.accs');
  assert.equal(scopes.split(' ').filter((scope) => scope === 'commerce.accs').length, 1);
  assert.match(scopes, /org\.read/);
});

test('GraphQL guard rejects mutations and subscriptions', () => {
  assert.equal(assertReadOnlyGraphql('{ storeConfig { store_code } }'), '{ storeConfig { store_code } }');
  assert.throws(() => assertReadOnlyGraphql('mutation { createEmptyCart }'), /read-only/);
  assert.throws(() => assertReadOnlyGraphql('subscription Demo { event }'), /read-only/);
});

test('commerceRestGet signs a GET with Commerce scopes and store context', async () => {
  let captured;
  const result = await commerceRestGet(
    { path: '/V1/store/storeConfigs', store: 'default' },
    {
      config: parseCommerceEndpoint(ENDPOINT),
      credentialsProvider: () => ({
        clientId: 'client-id',
        clientSecret: 'secret',
        orgId: 'org-id',
        scopes: 'openid',
      }),
      tokenProvider: async (credentials) => {
        assert.match(credentials.scopes, /commerce\.accs/);
        return 'access-token';
      },
      fetchImpl: async (url, init) => {
        captured = { url: url.toString(), init };
        return new Response(JSON.stringify([{ code: 'default' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  );
  assert.equal(captured.url, `${ENDPOINT}/V1/store/storeConfigs`);
  assert.equal(captured.init.method, 'GET');
  assert.equal(captured.init.headers.Store, 'default');
  assert.equal(captured.init.headers.Authorization, 'Bearer access-token');
  assert.deepEqual(result.data, [{ code: 'default' }]);
});

test('commerceGraphqlQuery does not forward an IMS bearer token', async () => {
  let captured;
  await commerceGraphqlQuery(
    { query: '{ storeConfig { store_code } }' },
    {
      config: { ...parseCommerceEndpoint(ENDPOINT), defaultStore: 'default' },
      fetchImpl: async (url, init) => {
        captured = { url, init };
        return new Response(JSON.stringify({ data: { storeConfig: { store_code: 'default' } } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  );
  assert.equal(captured.url, `${ENDPOINT}/graphql`);
  assert.equal(captured.init.headers.Authorization, undefined);
  assert.equal(captured.init.headers.Store, 'default');
});
