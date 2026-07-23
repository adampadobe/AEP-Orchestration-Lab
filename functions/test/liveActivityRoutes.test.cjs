'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { registerLiveActivityRoutes } = require('../liveActivityRoutes');

function makeRoutes(overrides = {}) {
  return registerLiveActivityRoutes({
    onRequest: (_opts, handler) => ({ __handler: handler }),
    profileFnOpts: { region: 'us-central1' },
    setCors: () => {},
    labGenerationPrefsAuth: {
      resolveGenerationPrefsPrincipal: async () => ({
        ok: true,
        uid: 'uid-apalmer',
        authSource: 'mcp_key',
        principalEmail: 'apalmer@adobe.com',
        keySandbox: 'apalmer',
      }),
    },
    labWorkspaceAuthService: null,
    liveActivityTemplateStore: {
      listTemplates: async () => [],
      getTemplate: async () => null,
      upsertTemplate: async () => ({}),
      deleteTemplate: async () => ({ deleted: true }),
    },
    liveActivityService: {
      createPreflight: async () => ({ ready: false, missingFields: [] }),
      sendPreflight: async () => ({ ok: true }),
      listRuns: async () => [],
    },
    getAdobeAccessToken: async () => 'token',
    ADOBE_CLIENT_ID: { value: () => 'client' },
    ADOBE_IMS_ORG: { value: () => 'org' },
    ...overrides,
  });
}

function response() {
  return {
    code: null,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send() { return this; },
  };
}

describe('liveActivityRoutes', () => {
  it('registers template, preflight, send, and run handlers', () => {
    const routes = makeRoutes();
    for (const name of [
      'ajoLiveActivityTemplates',
      'ajoLiveActivityPreflight',
      'ajoLiveActivityProxy',
      'ajoLiveActivityRuns',
    ]) {
      assert.equal(typeof routes[name]?.__handler, 'function');
    }
  });

  it('rejects a sandbox outside the MCP key scope', async () => {
    const routes = makeRoutes();
    const res = response();
    await routes.ajoLiveActivityTemplates.__handler({
      method: 'GET',
      query: { sandbox: 'kirkham' },
      headers: { 'x-aep-lab-mcp-key': 'secret' },
    }, res);
    assert.equal(res.code, 403);
    assert.match(res.body.error, /scoped to sandbox/);
  });

  it('rejects legacy arbitrary raw payload sends', async () => {
    const routes = makeRoutes();
    const res = response();
    await routes.ajoLiveActivityProxy.__handler({
      method: 'POST',
      query: {},
      headers: { 'x-aep-lab-mcp-key': 'secret' },
      body: { sandbox: 'apalmer', payload: { recipients: [] } },
    }, res);
    assert.equal(res.code, 400);
    assert.equal(res.body.code, 'PREFLIGHT_REQUIRED');
  });
});
