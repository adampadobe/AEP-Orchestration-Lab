const test = require('node:test');
const assert = require('node:assert/strict');

const { authorize, queryFor, safeEqual } = require('../commerceOptimizerRoutes');

function req(key) { return { headers: key ? { 'x-aep-lab-mcp-key': key } : {} }; }

test('Optimizer internal auth trims and compares timing-safely', async () => {
  assert.equal(safeEqual(' same ', 'same\n'), true);
  assert.equal(safeEqual('', ''), false);
  const deps = {
    internalMcpKey: { value: () => 'internal-key\n' },
    mcpApiKeyStore: { validateUserApiKey: async (key) => key === 'user-key' ? { ok: true, principalUid: 'uid-1' } : { ok: false } },
  };
  assert.equal((await authorize(req(), deps)).status, 401);
  assert.equal((await authorize(req('internal-key'), deps)).source, 'internal');
  assert.equal((await authorize(req('user-key'), deps)).source, 'user');
  assert.equal((await authorize(req('wrong'), deps)).status, 403);
});

test('Optimizer action catalog contains reads only and bounds arrays', () => {
  assert.match(queryFor('view_check', {}).query, /commerceOptimizer/);
  assert.equal(queryFor('navigation', { family: 'categories' }).variables.family, 'categories');
  assert.equal(queryFor('products', { skus: Array.from({ length: 30 }, (_, i) => `s${i}`) }).variables.skus.length, 20);
  assert.match(queryFor('graphql', { query: '{ products { sku } }' }).query, /products/);
  assert.equal(queryFor('ingest', {}), null);
});
