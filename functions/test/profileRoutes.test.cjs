'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { registerProfileRoutes } = require('../profileRoutes');

describe('registerProfileRoutes', () => {
  it('registers B2 remainder profile proxy handlers', () => {
    const onRequest = (_opts, handler) => ({ __handler: handler });
    const routes = registerProfileRoutes({
      onRequest,
      REGION: 'us-central1',
      PROFILE_FN_SECRETS: [],
      RESOLVED_ADOBE_SANDBOX: 'apalmer',
      profileFnOpts: { region: 'us-central1' },
      setCors: () => {},
      resolveSandboxFromQuery: () => 'apalmer',
      resolveSandboxForProfileBody: () => 'apalmer',
      getAdobeAccessToken: async () => 'token',
      ADOBE_CLIENT_ID: { value: () => 'client' },
      ADOBE_IMS_ORG: { value: () => 'org' },
      profileTableHelpers: {},
      ipadEventProxy: { handleIpadEventPost: async () => {} },
      industryAttributeMap: { getAttributeOwnershipPayload: () => ({}) },
      profileInfraStatusAllSvc: { runProfileInfraStatusAll: async () => ({}) },
      genericProfileInfraService: {},
      travelProfileInfraService: {},
      fsiProfileInfraService: {},
      telecomProfileInfraService: {},
      retailProfileInfraService: {},
      mediaProfileInfraService: {},
      sportsProfileInfraService: {},
      genericProfileConnectionStore: {},
      travelProfileConnectionStore: {},
      fsiProfileConnectionStore: {},
      telecomProfileConnectionStore: {},
      retailProfileConnectionStore: {},
      mediaProfileConnectionStore: {},
      sportsProfileConnectionStore: {},
      consentFlowLookup: { lookupConsentHttpFlow: async () => ({}) },
      serializeFirestoreRecord: (r) => r,
      CONSENT_STORE_FN_OPTS: { region: 'us-central1' },
      profileStreamingCore: {},
      profileGenerateService: { handleProfileGenerate: async () => {} },
      consentManagerLegacy: {},
      consentInfraService: {},
      profileAudiences: {},
      profileConsentPayload: {},
      profileEventsService: {},
    });

    for (const name of [
      'profileUpdateProxy',
      'profileGenerateProxy',
      'consentManagerLegacyUpdate',
      'profileAudiencesProxy',
      'profileConsentProxy',
      'profileEventsProxy',
      'profileTableProxy',
      'profileInfraStatusAll',
    ]) {
      assert.equal(typeof routes[name], 'object', `missing ${name}`);
    }
  });
});
