'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { handleProfileGenerate } = require('../profileGenerateService');
const { registerProfileRoutes } = require('../profileRoutes');
const fsiStore = require('../fsiProfileConnectionStore');
const core = require('../profileStreamingCore');
const CORRELATION = '12345678-1234-4234-8234-123456789abc';
const EMAIL = 'private@example.com';
const SECRET = 'NEVER_LOG_PRIVATE_TOKEN';
const ECID = '12345678901234567890123456789012345678';
const fields = {
  'industryFsi.primaryBankingChannel': 'SecretName',
  'industryFsi.creditScoreBand': 0,
  'industryFsi.financialProducts.checking': false,
  [`industryFsi.${SECRET}`]: SECRET,
};

function makeUpdateHandler() {
  return registerProfileRoutes({
    onRequest: (_, handler) => handler, REGION: 'us-central1', PROFILE_FN_SECRETS: [],
    profileFnOpts: {}, CONSENT_STORE_FN_OPTS: {}, setCors() {}, resolveSandboxFromQuery: () => SECRET,
    resolveSandboxForProfileBody: () => SECRET, getAdobeAccessToken: async () => SECRET,
    ADOBE_CLIENT_ID: { value: () => SECRET }, ADOBE_IMS_ORG: { value: () => SECRET },
    profileTableHelpers: { resolveConnectionGetter: () => null }, profileStreamingCore: core,
    genericProfileInfraService: {}, travelProfileInfraService: {}, fsiProfileInfraService: {},
    telecomProfileInfraService: {}, retailProfileInfraService: {}, mediaProfileInfraService: {}, sportsProfileInfraService: {},
    genericProfileConnectionStore: {}, travelProfileConnectionStore: {}, fsiProfileConnectionStore: {},
    telecomProfileConnectionStore: {}, retailProfileConnectionStore: {}, mediaProfileConnectionStore: {}, sportsProfileConnectionStore: {},
  }).profileUpdateProxy;
}

function response() {
  return {
    headers: {}, statusCode: 0,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

for (const route of ['generate', 'update']) {
  for (const envelope of [true, false]) {
    for (const scenario of ['accepted', 'rejected', 'http-rejected', 'nonjson-rejected', 'transport-failed']) {
      const outcome = scenario.endsWith('-rejected') ? 'rejected' : scenario;
      test(`${route} ${envelope ? 'envelope' : 'bare'} ${scenario}: exact wire correlation, no sensitive log values or retries`, async (t) => {
        const logs = [];
        t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
        t.mock.method(console, 'warn', (...args) => logs.push(args.join(' ')));
        const streaming = {
          url: `https://${envelope ? 'dcs.adobedc.net' : 'example.com'}/collection?token=${SECRET}`,
          flowId: CORRELATION, xdmKey: '_demoemea', apiKey: SECRET,
          ...(envelope ? {
            datasetId: '1234567890abcdef12345678',
            schemaId: 'https://ns.adobe.com/demoemea/schemas/1234567890abcdef12345678',
          } : {}),
        };
        t.mock.method(fsiStore, 'get', async () => ({ streaming }));
        let calls = 0;
        let wire;
        const upstream = {
          xactionId: '1700000000000:17:28061', inletId: CORRELATION, receivedTimeMs: 1700000000000,
          synchronousValidation: { status: 'passed' },
          warnings: [{ message: SECRET }],
          detail: SECRET, Authorization: SECRET, [SECRET]: EMAIL,
          ...(scenario === 'rejected' ? { errors: [{ message: SECRET, code: EMAIL }] } : {}),
        };
        t.mock.method(globalThis, 'fetch', async (_url, init) => {
          calls++;
          wire = init.body;
          if (outcome === 'transport-failed') throw Object.assign(new Error(SECRET), { code: SECRET, name: EMAIL });
          const ok = !scenario.endsWith('-rejected');
          return { ok, status: ok ? 200 : 400,
            text: async () => scenario === 'nonjson-rejected' ? SECRET : JSON.stringify(upstream) };
        });
        const req = {
          method: 'POST', query: {}, headers: { 'x-aep-lab-correlation-id': CORRELATION },
          body: {
            email: EMAIL, ecid: ECID, industry: 'fsi', streaming,
            ...(route === 'generate' ? { attributes: fields } : {
              updates: Object.entries(fields).map(([path, value]) => ({ path, value })),
            }),
          },
        };
        const res = response();
        if (route === 'generate') {
          await handleProfileGenerate(req, res, {
            setCors() {}, resolveSandboxForProfileBody: () => SECRET,
            getAdobeAccessToken: async () => SECRET, clientId: SECRET, orgId: SECRET,
          });
        } else {
          await makeUpdateHandler()(req, res);
        }
        assert.equal(res.statusCode, outcome === 'accepted' ? 200 : 502, JSON.stringify(res.body));
        assert.equal(calls, 1, 'no replay or retry');
        assert.equal(res.headers['x-aep-lab-correlation-id'], CORRELATION);
        assert.equal(res.body.correlationId, CORRELATION);
        const events = logs.filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
        const before = events.find((line) => line.message === `profile.${route}.stream_pre_send`);
        const after = events.find((line) => line.outcome === outcome);
        assert.ok(before);
        assert.ok(after);
        assert.equal(before.requestCorrelationId, CORRELATION);
        assert.equal(after.requestCorrelationId, CORRELATION);
        assert.equal(before.payloadSha256, createHash('sha256').update(wire).digest('hex'));
        assert.equal(after.payloadSha256, before.payloadSha256);
        assert.equal(before.payloadBytes, Buffer.byteLength(wire));
        assert.equal(before.payloadFormat, envelope ? 'envelope' : 'bare');
        assert.equal(before.tenant.fsiLeaves['financialProducts.checking'].type, 'boolean');
        assert.equal(before.tenant.fsiLeaves.creditScoreBand.type, 'number');
        assert.equal(before.tenant.industries.fsi.industryFsi.leafCount, 4);
        if (outcome !== 'transport-failed' && scenario !== 'nonjson-rejected') {
          assert.equal(after.xactionId, upstream.xactionId);
          assert.equal(after.inletId, CORRELATION);
          assert.equal(after.synchronousValidation.state, 'passed');
          assert.equal(after.responseWarningCount, 1);
        }
        if (outcome === 'accepted') assert.equal(after.upsVerified, false);
        for (const value of [EMAIL, SECRET, 'SecretName', ECID]) {
          assert.equal(logs.join('\n').includes(value), false, `log leaked ${value}`);
        }
        assert.equal(logs.join('\n').includes('profileUpdateProxy.payload'), false);
      });
    }
  }
}

for (const route of ['generate', 'update']) {
  test(`${route} serialization runs once even with a transforming payload toJSON`, async (t) => {
    const logs = [];
    t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
    let serializations = 0;
    t.mock.method(core, 'buildProfileStreamPayload', () => ({
      format: 'bare',
      payload: { toJSON() {
        serializations++;
        return { _demoemea: { industryFsi: { financialProducts: { checking: serializations === 1 } } } };
      } },
    }));
    let wire;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      wire = init.body;
      return { ok: true, status: 200, text: async () => '{}' };
    });
    const res = response();
    const streaming = { url: 'https://example.com', flowId: CORRELATION };
    t.mock.method(fsiStore, 'get', async () => ({ streaming }));
    const req = {
      method: 'POST', query: {}, body: {
        email: EMAIL, industry: 'fsi', attributes: fields,
        updates: [{ path: 'industryFsi.creditScoreBand', value: 0 }], streaming,
      },
    };
    if (route === 'generate') {
      await handleProfileGenerate(req, res, {
        setCors() {}, resolveSandboxForProfileBody: () => SECRET,
        getAdobeAccessToken: async () => SECRET, clientId: SECRET, orgId: SECRET,
      });
    } else {
      await makeUpdateHandler()(req, res);
    }
    assert.equal(res.statusCode, 200);
    assert.equal(serializations, 1);
    const before = logs.filter((line) => line.startsWith('{')).map(JSON.parse)
      .find((line) => line.message === `profile.${route}.stream_pre_send`);
    assert.equal(before.payloadSha256, createHash('sha256').update(wire).digest('hex'));
    assert.equal(before.tenant.fsiLeaves.creditScoreBand.present, false);
    assert.equal(before.tenant.fsiLeaves['financialProducts.checking'].present, true);
  });
  test(`${route} preserves serialization failure HTTP status without logging the thrown message`, async (t) => {
    const logs = [];
    t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
    t.mock.method(core, 'buildProfileStreamPayload', () => ({
      format: 'bare', payload: { toJSON() { throw new Error(SECRET); } },
    }));
    t.mock.method(globalThis, 'fetch', async () => assert.fail('must not send a failed serialization'));
    const streaming = { url: 'https://example.com', flowId: CORRELATION };
    t.mock.method(fsiStore, 'get', async () => ({ streaming }));
    const req = {
      method: 'POST', query: {}, headers: { 'x-aep-lab-correlation-id': CORRELATION },
      body: { email: EMAIL, industry: 'fsi', attributes: fields, streaming,
        updates: [{ path: 'industryFsi.creditScoreBand', value: 0 }] },
    };
    const res = response();
    if (route === 'generate') {
      await handleProfileGenerate(req, res, {
        setCors() {}, resolveSandboxForProfileBody: () => SECRET,
        getAdobeAccessToken: async () => SECRET, clientId: SECRET, orgId: SECRET,
      });
    } else {
      await makeUpdateHandler()(req, res);
    }
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, SECRET, 'existing HTTP error detail retained');
    assert.equal(res.body.correlationId, CORRELATION);
    assert.equal(logs.join('\n').includes(SECRET), false);
    const event = logs.filter((line) => line.startsWith('{')).map(JSON.parse)
      .find((line) => line.message === `profile.${route}.stream_request_failed`);
    assert.equal(event.errorCode, 'STREAM_SERIALIZATION_FAILED');
    assert.equal(event.requestCorrelationId, CORRELATION);
  });
}
