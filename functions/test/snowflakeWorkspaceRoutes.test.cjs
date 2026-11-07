'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerSnowflakeRoutes } = require('../snowflakeRoutes');

function fixture(principal = { ok: true, uid: 'user-a', authSource: 'mcp_key', keySandbox: 'test' }, service) {
  const calls = [];
  const routes = registerSnowflakeRoutes({
    onRequest: (_options, handler) => handler,
    setCors() {},
    resolveSandboxFromQuery: () => '',
    snowflakePrincipalAuth: { resolveSnowflakePrincipal: async () => principal },
    snowflakeWorkspaceService: service || {
      handleWorkspace: async (input) => { calls.push(input); return { ok: true, status: 'ready' }; },
    },
  });
  return {
    calls,
    async invoke(body, method = 'POST') {
      const response = {
        statusCode: 200, headers: {},
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
        send(data) { this.body = data; return this; },
        setHeader(key, value) { this.headers[key] = value; },
      };
      await routes.snowflakeWorkspace({ method, body, headers: {} }, response);
      return response;
    },
  };
}

test('workspace route rejects missing auth and sandbox mismatch before invoking the service', async () => {
  const missing = fixture({ ok: false, status: 401, body: { ok: false, code: 'AUTH_REQUIRED' } });
  assert.equal((await missing.invoke({ sandbox: 'test', action: 'capabilities' })).statusCode, 401);
  const scoped = fixture();
  assert.equal((await scoped.invoke({ sandbox: 'other', action: 'capabilities' })).statusCode, 403);
  assert.equal(scoped.calls.length, 0);
});

test('workspace route derives the principal exclusively from authenticated context', async () => {
  const f = fixture();
  const response = await f.invoke({
    sandbox: 'test', action: 'capabilities', principal: { uid: 'forged', authSource: 'firebase' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(f.calls[0].principal.uid, 'user-a');
  assert.equal(f.calls[0].principal.authSource, 'mcp_key');
  assert.deepEqual(Object.keys(f.calls[0].principal).sort(), ['authSource', 'uid']);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('only direct Portal authentication reaches the approval action', async () => {
  for (const authSource of ['mcp_key', 'ims']) {
    const f = fixture({ ok: true, uid: 'user-a', authSource });
    assert.equal((await f.invoke({ sandbox: 'test', action: 'change_approve', preview_id: 'p' })).statusCode, 403);
    assert.equal((await f.invoke({ sandbox: 'test', action: 'change_get', preview_id: 'p' })).statusCode, 403);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture({ ok: true, uid: 'user-a', authSource: 'firebase' });
  assert.equal((await f.invoke({ sandbox: 'test', action: 'change_approve', preview_id: 'p' })).statusCode, 200);
  assert.equal((await f.invoke({ sandbox: 'test', action: 'change_get', preview_id: 'p' })).statusCode, 200);
});

test('real workspace service accepts the authenticated route principal projection', async () => {
  const { createWorkspaceService } = require('../snowflakeWorkspaceService');
  const service = createWorkspaceService({
    store: { getPolicy: async () => null }, resolveConnection() {}, provider: {},
  });
  const f = fixture({
    ok: true, uid: 'user-a', authSource: 'ims', keySandbox: 'test',
    principalEmail: 'not-forwarded@example.invalid', principalDisplayName: 'Not forwarded',
  }, service);
  const response = await f.invoke({ sandbox: 'test', action: 'capabilities' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.available, false);
});

test('invalid input and non-POST requests do not reach workspace service', async () => {
  const f = fixture({ ok: true, uid: 'user-a', authSource: 'firebase' });
  for (const body of [null, [], {}, { action: 'capabilities', sandbox: 1 }]) {
    assert.equal((await f.invoke(body)).statusCode, 400);
  }
  assert.equal((await f.invoke({}, 'GET')).statusCode, 405);
  assert.equal((await f.invoke({}, 'OPTIONS')).statusCode, 204);
  assert.equal(f.calls.length, 0);
});
