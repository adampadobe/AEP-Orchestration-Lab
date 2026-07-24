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
    labUserSandboxStore: {
      getLiveActivityExecutionFields: async () => ({
        campaignId: '',
        liveActivityId: '',
        campaignIds: [],
        liveActivityIds: [],
      }),
      mergeLiveActivityExecutionFields: async (_uid, _sandbox, patch) => ({
        campaignId: patch.campaignId || '',
        liveActivityId: patch.liveActivityId || '',
        campaignIds: patch.campaignId ? [patch.campaignId] : [],
        liveActivityIds: patch.liveActivityId ? [patch.liveActivityId] : [],
      }),
    },
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
  it('registers template, shared state, preflight, send, and run handlers', () => {
    const routes = makeRoutes();
    for (const name of [
      'ajoLiveActivityTemplates',
      'ajoLiveActivityExecutionState',
      'ajoLiveActivityPreflight',
      'ajoLiveActivityProxy',
      'ajoLiveActivityRuns',
    ]) {
      assert.equal(typeof routes[name]?.__handler, 'function');
    }
  });

  it('saves execution state for the MCP principal and scoped sandbox', async () => {
    let saved = null;
    const routes = makeRoutes({
      labUserSandboxStore: {
        getLiveActivityExecutionFields: async () => ({}),
        mergeLiveActivityExecutionFields: async (uid, sandbox, patch) => {
          saved = { uid, sandbox, patch };
          return {
            campaignId: patch.campaignId,
            liveActivityId: '',
            campaignIds: [patch.campaignId],
            liveActivityIds: [],
          };
        },
      },
    });
    const res = response();
    await routes.ajoLiveActivityExecutionState.__handler({
      method: 'POST',
      query: {},
      headers: { 'x-aep-lab-mcp-key': 'secret' },
      body: { sandbox: 'apalmer', campaignId: 'campaign-123' },
    }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(saved, {
      uid: 'uid-apalmer',
      sandbox: 'apalmer',
      patch: { campaignId: 'campaign-123' },
    });
    assert.equal(res.body.executionFields.campaignId, 'campaign-123');
  });

  it('persists supplied execution IDs when preflight succeeds', async () => {
    let saved = null;
    const routes = makeRoutes({
      liveActivityTemplateStore: {
        listTemplates: async () => [],
        getTemplate: async () => ({ id: 'template-1', body: {} }),
        upsertTemplate: async () => ({}),
        deleteTemplate: async () => ({ deleted: true }),
      },
      labUserSandboxStore: {
        getLiveActivityExecutionFields: async () => ({}),
        mergeLiveActivityExecutionFields: async (uid, sandbox, patch) => {
          saved = { uid, sandbox, patch };
          return { ...patch, campaignIds: [patch.campaignId], liveActivityIds: [patch.liveActivityId] };
        },
      },
    });
    const res = response();
    await routes.ajoLiveActivityPreflight.__handler({
      method: 'POST',
      query: {},
      headers: { 'x-aep-lab-mcp-key': 'secret' },
      body: {
        sandbox: 'apalmer',
        templateId: 'template-1',
        campaignId: 'campaign-123',
        liveActivityId: 'activity-123',
      },
    }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(saved.patch, {
      campaignId: 'campaign-123',
      liveActivityId: 'activity-123',
    });
    assert.match(res.body.uiSync, /Portal UI/);
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
