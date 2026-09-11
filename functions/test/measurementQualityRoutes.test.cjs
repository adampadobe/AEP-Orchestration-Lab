'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerMeasurementQualityRoutes } = require('../measurementQualityRoutes');

function recorder() {
  const state = { status: 200, body: null };
  return {
    state,
    res: {
      set() { return this; }, status(code) { state.status = code; return this; },
      json(body) { state.body = body; return this; }, send(body) { state.body = body; return this; },
    },
  };
}

function setup() {
  let handler;
  const calls = [];
  const service = {};
  for (const name of ['listAssuranceSessions', 'inspectAssuranceEvents', 'auditLaunchProperties', 'listLaunchEnvironments', 'correlateStatusIncidents']) {
    service[name] = async (params) => { calls.push([name, params]); return { ok: true }; };
  }
  registerMeasurementQualityRoutes({
    onRequest: (_opts, fn) => { handler = fn; return fn; }, profileFnOpts: {}, setCors: () => {},
    mcpApiKeyStore: { validateUserApiKey: async () => ({ ok: true, principalUid: 'uid', sandbox: 'apalmer' }) },
    measurementService: service,
  });
  return { handler, calls };
}

test('measurement route enforces principal sandbox and dispatches only read actions', async () => {
  const { handler, calls } = setup();
  const headers = { 'x-aep-lab-mcp-key': 'key' };
  for (const query of [
    { action: 'assurance_sessions' },
    { action: 'assurance_events', session_uuid: 's-1' },
    { action: 'launch_property_audit' },
    { action: 'launch_environments', property_id: 'PR1' },
    { action: 'status_incidents', from: '2026-09-01', to: '2026-09-11', product_ids: '1,2', keywords: 'aep,edge' },
  ]) {
    const output = recorder();
    await handler({ method: 'GET', headers, query }, output.res);
    assert.equal(output.state.status, 200);
  }
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[4][1].product_ids, ['1', '2']);
  assert.deepEqual(calls[4][1].keywords, ['aep', 'edge']);

  const outside = recorder();
  await handler({ method: 'GET', headers, query: { action: 'assurance_sessions', sandbox: 'other' } }, outside.res);
  assert.equal(outside.state.status, 403);

  const post = recorder();
  await handler({ method: 'POST', headers, query: {} }, post.res);
  assert.equal(post.state.status, 405);
});

test('measurement route does not return upstream bodies from service errors', async () => {
  let handler;
  registerMeasurementQualityRoutes({
    onRequest: (_opts, fn) => { handler = fn; return fn; }, profileFnOpts: {}, setCors: () => {},
    mcpApiKeyStore: { validateUserApiKey: async () => ({ ok: true, principalUid: 'uid', sandbox: 'apalmer' }) },
    measurementService: { listAssuranceSessions: async () => { const error = new Error('Adobe Assurance read failed with HTTP 403.'); error.status = 403; error.platformResponse = 'secret'; throw error; } },
  });
  const output = recorder();
  await handler({ method: 'GET', headers: { 'x-aep-lab-mcp-key': 'key' }, query: { action: 'assurance_sessions' } }, output.res);
  assert.equal(output.state.status, 403);
  assert.equal(JSON.stringify(output.state.body).includes('secret'), false);
});
