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

describe('profileUpdateProxy place context (dryRun)', () => {
  const profileStreamingCore = require('../profileStreamingCore');
  const { encodeGeohash } = require('../profilePlaceContext');

  function makeUpdateHandler() {
    const onRequest = (_opts, handler) => handler;
    const routes = registerProfileRoutes({
      onRequest,
      REGION: 'us-central1',
      PROFILE_FN_SECRETS: [],
      RESOLVED_ADOBE_SANDBOX: 'apalmer',
      profileFnOpts: { region: 'us-central1' },
      setCors: () => {},
      resolveSandboxFromQuery: () => 'apalmer',
      resolveSandboxForProfileBody: () => 'apalmer',
      getAdobeAccessToken: async () => { throw new Error('dryRun must not fetch a token'); },
      ADOBE_CLIENT_ID: { value: () => 'client' },
      ADOBE_IMS_ORG: { value: () => 'org@AdobeOrg' },
      profileTableHelpers: { resolveConnectionGetter: () => null },
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
      profileStreamingCore,
      profileGenerateService: { handleProfileGenerate: async () => {} },
      consentManagerLegacy: {},
      consentInfraService: {},
      profileAudiences: {},
      profileConsentPayload: {},
      profileEventsService: {},
    });
    return routes.profileUpdateProxy;
  }

  async function post(updates) {
    const handler = makeUpdateHandler();
    const res = {
      statusCode: 0,
      body: null,
      set() { return this; },
      setHeader() {},
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
      send(b) { this.body = b; return this; },
    };
    await handler({
      method: 'POST',
      query: {},
      headers: {},
      body: {
        dryRun: true,
        email: 'place.test@example.com',
        updates,
        streaming: { datasetId: 'ds1', schemaId: 'https://ns.adobe.com/demoemea/schemas/x' },
      },
    }, res);
    return res;
  }

  function findTenant(envelope) {
    const entity = envelope && envelope.body && envelope.body.xdmEntity;
    return entity && entity._demoemea;
  }

  it('nests place context under _demoemea, derives geohash, keeps numbers typed', async () => {
    const res = await post([
      { path: 'profilePlaceContext.latitude', value: 24.7743, valueType: 'number' },
      { path: 'profilePlaceContext.longitude', value: 46.6384, valueType: 'number' },
      { path: 'profilePlaceContext.accuracyMeters', value: 150, valueType: 'number' },
      { path: '_demoemea.profilePlaceContext.city', value: 'Riyadh', valueType: 'string' },
      { path: 'profilePlaceContext.countryCode', value: 'SA', valueType: 'string' },
      { path: 'profilePlaceContext.regionCode', value: 'SA-01', valueType: 'string' },
      { path: 'profilePlaceContext.lastSeenAt', value: '2026-07-10T08:15:00Z', valueType: 'string' },
      { path: 'profilePlaceContext.source', value: 'ui-sample', valueType: 'string' },
    ]);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const place = findTenant(res.body.envelope).profilePlaceContext;
    assert.deepEqual(place, {
      latitude: 24.7743,
      longitude: 46.6384,
      accuracyMeters: 150,
      city: 'Riyadh',
      countryCode: 'SA',
      regionCode: 'SA-01',
      lastSeenAt: '2026-07-10T08:15:00Z',
      source: 'ui-sample',
      geohash: encodeGeohash(24.7743, 46.6384, 7),
    });
    assert.equal(res.body.envelope.body.xdmEntity.profilePlaceContext, undefined, 'not at root');
  });

  it('keeps an all-digit geohash as a string', async () => {
    const res = await post([
      { path: 'profilePlaceContext.latitude', value: -89.9999, valueType: 'number' },
      { path: 'profilePlaceContext.longitude', value: -179.9999, valueType: 'number' },
      { path: 'profilePlaceContext.geohash', value: '0000000' },
    ]);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const place = findTenant(res.body.envelope).profilePlaceContext;
    assert.equal(place.geohash, '0000000');
    assert.equal(place.source, 'profile-update');
  });

  it('400s with the offending path on invalid place context', async () => {
    const res = await post([
      { path: 'profilePlaceContext.latitude', value: 24.7743, valueType: 'number' },
      { path: 'profilePlaceContext.countryCode', value: 'sa', valueType: 'string' },
    ]);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /countryCode/);
    assert.equal(res.body.invalidPath, '_demoemea.profilePlaceContext.countryCode');
  });

  it('logs value-free request and result summaries with place row counts', async (t) => {
    const lines = [];
    t.mock.method(console, 'log', (...args) => { lines.push(args); });
    const res = await post([
      { path: 'person.name.firstName', value: 'SecretName', valueType: 'string' },
      { path: 'profilePlaceContext.latitude', value: 24.7743, valueType: 'number' },
      { path: 'profilePlaceContext.longitude', value: 46.6384, valueType: 'number' },
      { path: 'profilePlaceContext.city', value: 'Riyadh', valueType: 'string' },
    ]);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const byTag = (tag) => lines.filter((a) => a[0] === tag).map((a) => JSON.parse(a[1]));
    const [reqLog] = byTag('[profileUpdateProxy.request]');
    const [resultLog] = byTag('[profileUpdateProxy.result]');
    assert.ok(reqLog && resultLog, 'both log lines emitted');
    assert.equal(reqLog.updateCount, 4);
    assert.equal(reqLog.placeRowCount, 3);
    assert.deepEqual(reqLog.placeLeaves, ['latitude', 'longitude', 'city']);
    assert.equal(reqLog.dryRun, true);
    assert.equal(resultLog.outcome, 'dryRun');
    assert.equal(resultLog.placeInPayload, true);
    assert.ok(resultLog.placeLeavesInPayload.includes('geohash'));
    assert.equal(resultLog.emailHash, reqLog.emailHash);
    const logged = lines.map((a) => a.join(' ')).join('\n');
    assert.equal(logged.includes('SecretName'), false);
    assert.equal(logged.includes('Riyadh'), false);
    assert.equal(logged.includes('place.test@example.com'), false);
  });
});
