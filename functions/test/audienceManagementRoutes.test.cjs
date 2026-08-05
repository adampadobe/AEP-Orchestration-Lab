'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildAudienceAudit, registerAudienceManagementRoutes } = require('../audienceManagementRoutes');

function responseRecorder() {
  return {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

function testDeps(service) {
  return {
    onRequest: (_opts, handler) => ({ __handler: handler }),
    profileFnOpts: {},
    setCors: () => {},
    getAdobeAccessToken: async () => 'token',
    ADOBE_CLIENT_ID: { value: () => 'client' },
    ADOBE_IMS_ORG: { value: () => 'org' },
    mcpApiKeyStore: {
      validateUserApiKey: async () => ({ ok: true, keyId: 'key-1', principalUid: 'uid-1', sandbox: 'apalmer' }),
    },
    audienceManagementService: service,
  };
}

describe('audience management route', () => {
  it('surfaces dependency risks and exact confirmation values', () => {
    const audit = buildAudienceAudit({
      id: 'aud-1', name: 'Delete me', originName: 'CUSTOM_UPLOAD', dependencies: ['base'], dependents: ['child'],
    }, 'apalmer');
    assert.equal(audit.review.deleteReviewReady, false);
    assert.equal(audit.confirmation.audience_id, 'aud-1');
    assert.equal(audit.confirmation.expected_name, 'Delete me');
    assert.ok(audit.review.warnings.some((warning) => warning.includes('source system')));
  });

  it('fails closed when confirmed name no longer matches', async () => {
    let deletes = 0;
    const routes = registerAudienceManagementRoutes(testDeps({
      getAudience: async () => ({
        id: 'aud-1', name: 'Current name', type: 'SegmentDefinition', originName: 'REAL_TIME_CUSTOMER_PROFILE', dependencies: [], dependents: [],
      }),
      deleteAudience: async () => { deletes += 1; },
    }));
    const req = {
      method: 'DELETE',
      headers: { 'x-aep-lab-mcp-key': 'secret' },
      query: {},
      body: { sandbox: 'apalmer', audience_id: 'aud-1', expected_name: 'Old name', confirmed: true },
    };
    const res = responseRecorder();
    await routes.audienceManagementProxy.__handler(req, res);
    assert.equal(res.statusCode, 409);
    assert.equal(deletes, 0);
  });

  it('rejects sandbox changes outside the key scope', async () => {
    const routes = registerAudienceManagementRoutes(testDeps({}));
    const req = {
      method: 'GET',
      headers: { 'x-aep-lab-mcp-key': 'secret' },
      query: { sandbox: 'other' },
      body: {},
    };
    const res = responseRecorder();
    await routes.audienceManagementProxy.__handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /scoped to sandbox/);
  });

  it('blocks deletion while dependent audiences remain', async () => {
    let deletes = 0;
    const routes = registerAudienceManagementRoutes(testDeps({
      getAudience: async () => ({
        id: 'aud-1', name: 'Parent', type: 'SegmentDefinition', originName: 'REAL_TIME_CUSTOMER_PROFILE', dependencies: [], dependents: ['child-1'],
      }),
      deleteAudience: async () => { deletes += 1; },
    }));
    const req = {
      method: 'DELETE',
      headers: { 'x-aep-lab-mcp-key': 'secret' },
      query: {},
      body: { sandbox: 'apalmer', audience_id: 'aud-1', expected_name: 'Parent', confirmed: true },
    };
    const res = responseRecorder();
    await routes.audienceManagementProxy.__handler(req, res);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body.dependents, ['child-1']);
    assert.equal(deletes, 0);
  });
});
