'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const genericProfileConnectionStore = require('../genericProfileConnectionStore');
const { handleProfileGenerate } = require('../profileGenerateService');
const { encodeGeohash } = require('../profilePlaceContext');

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    set() { return this; },
    setHeader() {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
  };
}

function ctx(overrides = {}) {
  return {
    setCors: () => {},
    resolveSandboxForProfileBody: () => 'apalmer',
    getAdobeAccessToken: async () => 'token',
    clientId: 'client',
    orgId: 'org@AdobeOrg',
    ...overrides,
  };
}

const RIYADH = {
  'profilePlaceContext.latitude': 24.7743,
  'profilePlaceContext.longitude': 46.6384,
  'profilePlaceContext.accuracyMeters': 150,
  'profilePlaceContext.neighborhood': 'Al Nakheel',
  'profilePlaceContext.city': 'Riyadh',
  'profilePlaceContext.regionCode': 'SA-01',
  'profilePlaceContext.countryCode': 'SA',
  'profilePlaceContext.lastSeenAt': '2026-07-10T08:15:00Z',
  'profilePlaceContext.source': 'mcp-persona',
};

async function generate(body, context) {
  const res = makeRes();
  await handleProfileGenerate({ method: 'POST', query: {}, headers: {}, body }, res, context || ctx());
  return res;
}

describe('POST /api/profile/generate place context', () => {
  it('rejects place context for a non-generic industry before any AEP call', async () => {
    const res = await generate(
      { email: 'p@example.com', industry: 'retail', attributes: { ...RIYADH } },
      ctx({ getAdobeAccessToken: async () => { throw new Error('must not fetch a token'); } }),
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /generic/i);
    assert.equal(res.body.invalidPath, '_demoemea.profilePlaceContext');
  });

  it('400s with the offending leaf on invalid place context before any AEP call', async () => {
    const res = await generate(
      {
        email: 'p@example.com',
        industry: 'generic',
        attributes: { ...RIYADH, 'profilePlaceContext.countryCode': 'sa' },
      },
      ctx({ getAdobeAccessToken: async () => { throw new Error('must not fetch a token'); } }),
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /countryCode/);
    assert.equal(res.body.invalidPath, '_demoemea.profilePlaceContext.countryCode');
  });

  it('streams normalized place context under the tenant with a derived geohash', async (t) => {
    t.mock.method(genericProfileConnectionStore, 'get', async () => ({
      streaming: {
        url: 'https://dcs.adobedc.net/collection/abc',
        flowId: 'flow-1',
        datasetId: 'ds-1',
        schemaId: 'https://ns.adobe.com/demoemea/schemas/x',
        xdmKey: '_demoemea',
      },
    }));
    let sent = null;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200, text: async () => '{"inletId":"abc"}' };
    });
    const res = await generate({
      email: 'p@example.com',
      industry: 'generic',
      attributes: { ...RIYADH, 'person.name.firstName': 'Noura' },
    });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const entity = sent.body.xdmEntity;
    assert.deepEqual(entity._demoemea.profilePlaceContext, {
      latitude: 24.7743,
      longitude: 46.6384,
      accuracyMeters: 150,
      neighborhood: 'Al Nakheel',
      city: 'Riyadh',
      regionCode: 'SA-01',
      countryCode: 'SA',
      lastSeenAt: '2026-07-10T08:15:00Z',
      source: 'mcp-persona',
      geohash: encodeGeohash(24.7743, 46.6384, 7),
    });
    assert.equal(entity.profilePlaceContext, undefined, 'not at root');
  });

  it('defaults source to profile-update when the caller omits it', async (t) => {
    t.mock.method(genericProfileConnectionStore, 'get', async () => ({
      streaming: {
        url: 'https://dcs.adobedc.net/collection/abc',
        flowId: 'flow-1',
        datasetId: 'ds-1',
        schemaId: 'https://ns.adobe.com/demoemea/schemas/x',
      },
    }));
    let sent = null;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200, text: async () => '{}' };
    });
    const attrs = { ...RIYADH };
    delete attrs['profilePlaceContext.source'];
    const res = await generate({ email: 'p@example.com', industry: 'generic', attributes: attrs });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(sent.body.xdmEntity._demoemea.profilePlaceContext.source, 'profile-update');
  });

  it('leaves profiles without place context untouched', async (t) => {
    t.mock.method(genericProfileConnectionStore, 'get', async () => ({
      streaming: {
        url: 'https://dcs.adobedc.net/collection/abc',
        flowId: 'flow-1',
        datasetId: 'ds-1',
        schemaId: 'https://ns.adobe.com/demoemea/schemas/x',
      },
    }));
    let sent = null;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, status: 200, text: async () => '{}' };
    });
    const res = await generate({
      email: 'p@example.com',
      industry: 'generic',
      attributes: { 'person.name.firstName': 'Noura' },
    });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(sent.body.xdmEntity._demoemea.profilePlaceContext, undefined);
  });
});

describe('POST /api/profile/generate geo mirror', () => {
  const connection = async () => ({
    streaming: {
      url: 'https://dcs.adobedc.net/collection/abc',
      flowId: 'flow-1',
      datasetId: 'ds-1',
      schemaId: 'https://ns.adobe.com/demoemea/schemas/x',
    },
  });

  function recordingMirror(result = { written: true, collection: 'labGeoProfilePlaces', docId: 'apalmer__h' }) {
    const calls = [];
    return {
      calls,
      async recordProfilePlace(input) {
        calls.push(input);
        return result;
      },
    };
  }

  it('mirrors the normalized place after AEP accepts the profile and reports it', async (t) => {
    t.mock.method(genericProfileConnectionStore, 'get', connection);
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => '{}' }));
    const geoMirror = recordingMirror();
    const res = await generate(
      { email: 'p@example.com', industry: 'generic', attributes: { ...RIYADH } },
      ctx({ geoMirror }),
    );
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(geoMirror.calls.length, 1);
    const call = geoMirror.calls[0];
    assert.equal(call.sandbox, 'apalmer');
    assert.equal(call.email, 'p@example.com');
    assert.equal(call.ecid, res.body.ecid);
    assert.equal(call.place.latitude, 24.7743);
    assert.equal(call.place.geohash, encodeGeohash(24.7743, 46.6384, 7));
    assert.deepEqual(res.body.geoMirror, { written: true, collection: 'labGeoProfilePlaces', docId: 'apalmer__h' });
  });

  it('does not mirror when AEP rejects the profile', async (t) => {
    t.mock.method(genericProfileConnectionStore, 'get', connection);
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 400, text: async () => '{"message":"bad"}' }));
    const geoMirror = recordingMirror();
    const res = await generate(
      { email: 'p@example.com', industry: 'generic', attributes: { ...RIYADH } },
      ctx({ geoMirror }),
    );
    assert.equal(res.statusCode, 502);
    assert.equal(geoMirror.calls.length, 0);
    assert.equal(res.body.geoMirror, undefined);
  });

  it('surfaces a mirror failure in the response without failing the AEP generate', async (t) => {
    t.mock.method(genericProfileConnectionStore, 'get', connection);
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => '{}' }));
    const geoMirror = recordingMirror({ written: false, error: 'firestore down' });
    const res = await generate(
      { email: 'p@example.com', industry: 'generic', attributes: { ...RIYADH } },
      ctx({ geoMirror }),
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.geoMirror, { written: false, error: 'firestore down' });
  });
});
