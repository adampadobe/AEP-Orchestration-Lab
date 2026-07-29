'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listActiveSandboxes } = require('../sandboxesList');

test('lists active sandboxes from the documented sandboxes endpoint', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  let request;
  global.fetch = async (url, init) => {
    request = { url, init };
    return {
      ok: true,
      json: async () => ({
        sandboxes: [
          { name: 'emea-uk-sc', title: 'EMEA UK SC', state: 'active', type: 'production' },
          { name: 'retired', title: 'Retired', state: 'deleted', type: 'development' },
        ],
      }),
    };
  };

  const sandboxes = await listActiveSandboxes('token', 'client-id', 'org-id');

  assert.equal(
    request.url,
    'https://platform.adobe.io/data/foundation/sandbox-management/sandboxes?limit=100&offset=0',
  );
  assert.equal(request.init.headers.Authorization, 'Bearer token');
  assert.deepEqual(sandboxes, [
    { name: 'emea-uk-sc', title: 'EMEA UK SC', type: 'production' },
  ]);
});
