'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAdobeApiCapabilityRoutes } = require('../adobeApiCapabilityRoutes');

function responseRecorder() {
  const state = { status: 200, headers: {}, body: null };
  return {
    state,
    res: {
      set(name, value) { state.headers[name] = value; return this; },
      status(code) { state.status = code; return this; },
      json(body) { state.body = body; return this; },
      send(body) { state.body = body; return this; },
    },
  };
}

function buildHandler({ valid = true } = {}) {
  let handler;
  const calls = [];
  const capabilityService = {
    catalog: () => ({ ok: true, services: [] }),
    listAjoAddresses: async (params) => { calls.push(['ajo', params]); return { ok: true }; },
    listGenstudioExperiences: async (params) => { calls.push(['genstudio', params]); return { ok: true }; },
  };
  registerAdobeApiCapabilityRoutes({
    onRequest: (_opts, fn) => { handler = fn; return fn; },
    profileFnOpts: {},
    setCors: () => {},
    mcpApiKeyStore: {
      validateUserApiKey: async () => valid
        ? { ok: true, principalUid: 'uid-1', sandbox: 'apalmer' }
        : { ok: false },
    },
    capabilityService,
  });
  return { handler, calls };
}

test('capability route requires a user key and enforces its sandbox', async () => {
  const { handler } = buildHandler();
  const missing = responseRecorder();
  await handler({ method: 'GET', headers: {}, query: {} }, missing.res);
  assert.equal(missing.state.status, 401);

  const wrongSandbox = responseRecorder();
  await handler({ method: 'GET', headers: { 'x-aep-lab-mcp-key': 'key' }, query: { sandbox: 'other' } }, wrongSandbox.res);
  assert.equal(wrongSandbox.state.status, 403);
});

test('capability route dispatches only bounded read actions', async () => {
  const { handler, calls } = buildHandler();
  for (const query of [
    { action: 'catalog' },
    { action: 'ajo_addresses', type: 'allowed', limit: '5' },
    { action: 'genstudio_experiences', limit: '4', channel: 'email' },
  ]) {
    const output = responseRecorder();
    await handler({ method: 'GET', headers: { 'x-aep-lab-mcp-key': 'key' }, query }, output.res);
    assert.equal(output.state.status, 200);
  }
  assert.deepEqual(calls, [
    ['ajo', { sandbox: 'apalmer', type: 'allowed', limit: '5' }],
    ['genstudio', { limit: '4', cursor: undefined, channel: 'email', language: undefined }],
  ]);

  const post = responseRecorder();
  await handler({ method: 'POST', headers: { 'x-aep-lab-mcp-key': 'key' }, query: {} }, post.res);
  assert.equal(post.state.status, 405);
});
