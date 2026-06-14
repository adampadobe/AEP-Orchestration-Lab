'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createProfileIndustryRoutes } = require('../createProfileIndustryRoutes');

describe('createProfileIndustryRoutes', () => {
  it('returns five wired handlers for a minimal industry config', () => {
    const calls = [];
    const onRequest = (_opts, handler) => {
      calls.push(handler);
      return { __handler: handler };
    };
    const infraService = {
      runStatus: async () => ({ ok: true }),
      runStep: async () => ({ ok: true }),
      runEnableProfile: async () => ({ ok: true }),
      HTTP_DATAFLOW_NAME: 'Test Dataflow',
    };
    const connectionStore = {
      get: async () => ({}),
      save: async () => ({}),
    };
    const routes = createProfileIndustryRoutes({
      industryKey: 'generic',
      routePathPrefix: 'generic-profile',
      infraService,
      connectionStore,
      ctx: {
        onRequest,
        profileFnOpts: { region: 'us-central1' },
        storeFnOpts: { region: 'us-central1' },
        setCors: () => {},
        resolveSandboxFromQuery: () => 'apalmer',
        getAdobeAccessToken: async () => 'token',
        adobeClientIdValue: () => 'client',
        adobeImsOrgValue: () => 'org',
        flowLookup: async () => ({ ok: true }),
        serializeFirestoreRecord: (r) => r,
      },
    });

    assert.equal(typeof routes.statusHandler, 'object');
    assert.equal(typeof routes.stepHandler, 'object');
    assert.equal(typeof routes.enableProfileHandler, 'object');
    assert.equal(typeof routes.flowLookupHandler, 'object');
    assert.equal(typeof routes.connectionStoreHandler, 'object');
    assert.equal(calls.length, 5);
  });
});
