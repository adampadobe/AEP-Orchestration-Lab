const test = require('node:test');
const assert = require('node:assert/strict');

const { createAdobeAuth } = require('../adobeAuth');

test('aepHeaders includes server credentials and allows AJO API version', () => {
  const { aepHeaders } = createAdobeAuth({
    getClientId: () => 'client-id',
    getClientSecret: () => 'client-secret',
    getScopes: () => 'scope',
    getImsOrg: () => 'org@AdobeOrg',
  });

  const headers = aepHeaders('access-token', {
    'Content-Type': 'application/json',
    'x-api-version': '1',
    'x-not-allowed': 'no',
  });

  assert.equal(headers.Authorization, 'Bearer access-token');
  assert.equal(headers['x-api-key'], 'client-id');
  assert.equal(headers['x-gw-ims-org-id'], 'org@AdobeOrg');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['x-api-version'], '1');
  assert.equal(headers['x-not-allowed'], undefined);
});

test('getAdobeAccessToken caches tokens separately by effective scope set', async () => {
  const originalFetch = global.fetch;
  const requestedScopes = [];
  global.fetch = async (_url, init) => {
    const body = new URLSearchParams(init.body);
    requestedScopes.push(body.get('scope'));
    return new Response(JSON.stringify({ access_token: `token-${requestedScopes.length}`, expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const { getAdobeAccessToken } = createAdobeAuth({
      getClientId: () => 'client-id',
      getClientSecret: () => 'client-secret',
      getScopes: () => 'platform.scope',
      getImsOrg: () => 'org@AdobeOrg',
    });
    assert.equal(await getAdobeAccessToken(), 'token-1');
    assert.equal(await getAdobeAccessToken(), 'token-1');
    assert.equal(await getAdobeAccessToken('commerce.accs'), 'token-2');
    assert.deepEqual(requestedScopes, ['platform.scope', 'commerce.accs']);
  } finally {
    global.fetch = originalFetch;
  }
});
