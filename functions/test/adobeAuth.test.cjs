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
