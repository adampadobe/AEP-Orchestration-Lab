'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { registerLabRoutes } = require('../labRoutes');

function fixture({ principal = { ok: true, uid: 'user', keySandbox: 'demo' }, owns = true, assetReplay = false } = {}) {
  const calls = [];
  const restores = [];
  const routes = registerLabRoutes({
    onRequest: (_options, handler) => handler, setCors() {},
    labHostingOriginForFunctionConfig: () => 'https://lab.example',
    labGenerationPrefsAuth: { resolveGenerationPrefsPrincipal: async () => principal },
    labUserSandboxStore: { getWorkspaceProfile: async () => ({ workspaceSlug: 'owner' }) },
    labRtdbProvisionService: { userOwnsWorkspace: async () => owns },
    labDemoConfigService: {
      inspect: async () => ({ sections: [] }),
      applyPreview: async () => { throw new Error('configuration replay is no longer active'); },
    },
    labDemoAssetService: {
      DemoAssetError: Error,
      applyPreview: async () => ({ verified: true, idempotentReplay: assetReplay, backupRevisionId: 'old-backup' }),
      restoreRevisionDirect: async () => { restores.push('assets'); return { ok: true }; },
    },
    labDemoCustomerService: {
      CustomerError: Error,
      digest: (value) => createHash('sha256').update(value).digest('hex'),
      handle: async (...args) => { calls.push(args); return { ok: true }; },
      withResourceLocks: async (_context, work) => work(),
    },
  });
  const response = {
    statusCode: 0,
    set() {},
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  return {
    calls, response, restores,
    invoke: (body = {}) => routes.labDemoAssets({
      method: 'POST', body: { sandbox: 'demo', action: 'customer-inspect', ...body }, query: {},
    }, response),
  };
}

test('complete-customer routes reject unauthenticated, wrong-sandbox and unowned workspaces before dispatch', async () => {
  for (const [options, status] of [
    [{ principal: { ok: false, status: 401, body: { error: 'sign in' } } }, 401],
    [{ principal: { ok: true, uid: 'user', keySandbox: 'different' } }, 403],
    [{ owns: false }, 403],
  ]) {
    const f = fixture(options); await f.invoke();
    assert.equal(f.response.statusCode, status);
    assert.equal(f.calls.length, 0);
  }
});

test('legacy combined failures never roll back an asset result replayed from an earlier successful request', async () => {
  for (const replay of [true, false]) {
    const f = fixture({ assetReplay: replay });
    await f.invoke({
      action: 'switch-apply', confirmed: true, asset_preflight_id: 'assets',
      config_preflight_id: 'config', idempotency_key: 'fixture-key',
    });
    assert.equal(f.response.statusCode, 500);
    assert.deepEqual(f.restores, replay ? [] : ['assets']);
  }
});

test('owned routes use the principal workspace and fixed-origin public byte/deletion verification', async () => {
  const f = fixture(); await f.invoke();
  assert.equal(f.response.statusCode, 200, JSON.stringify(f.response.body));
  assert.deepEqual(f.calls[0][0], { uid: 'user', workspaceSlug: 'owner', sandbox: 'demo' });
  const verify = f.calls[0][2].verifyPublicFile;
  const original = global.fetch;
  try {
    global.fetch = async (url) => {
      assert.equal(url.origin, 'https://lab.example');
      assert.equal(url.pathname, '/cdn/demo/logo.png');
      return new Response('bytes');
    };
    await verify('/cdn/demo/logo.png', { sha256: createHash('sha256').update('bytes').digest('hex') });
    await assert.rejects(verify('/cdn/demo/logo.png', { sha256: 'wrong' }), /CDN verification failed/);
    await assert.rejects(verify('/cdn/demo/logo.png', null), /still resolves/);
    global.fetch = async () => new Response('', { status: 404 });
    await verify('/cdn/demo/logo.png', null);
  } finally { global.fetch = original; }
});
