const test = require('node:test');
const assert = require('node:assert/strict');

const { authorize, safeEqual } = require('../commerceRoutes');

function req(key) {
  return { headers: key ? { 'x-aep-lab-mcp-key': key } : {} };
}

test('Commerce internal auth uses timing-safe exact comparison', () => {
  assert.equal(safeEqual('same', 'same'), true);
  assert.equal(safeEqual('same', 'different'), false);
  assert.equal(safeEqual('', ''), false);
});

test('Commerce route accepts internal and user-generated MCP keys only', async () => {
  const deps = {
    internalMcpKey: { value: () => 'internal-key' },
    mcpApiKeyStore: {
      validateUserApiKey: async (key) => key === 'user-key'
        ? { ok: true, keyId: 'key-1', principalUid: 'uid-1' }
        : { ok: false },
    },
  };
  assert.equal((await authorize(req(), deps)).status, 401);
  assert.equal((await authorize(req('internal-key'), deps)).source, 'internal');
  assert.equal((await authorize(req('user-key'), deps)).source, 'user');
  assert.equal((await authorize(req('wrong'), deps)).status, 403);
});
