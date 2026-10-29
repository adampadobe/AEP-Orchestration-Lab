'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../profileStreamingCore');
const { registerProfileRoutes } = require('../profileRoutes');
const helpers = require('../profileTableHelpers');

function handler() {
  const store = {};
  return registerProfileRoutes({
    onRequest: (_, fn) => fn, REGION: 'us-central1', PROFILE_FN_SECRETS: [],
    RESOLVED_ADOBE_SANDBOX: 'apalmer', profileFnOpts: {}, CONSENT_STORE_FN_OPTS: {},
    setCors() {}, resolveSandboxFromQuery: () => 'apalmer', resolveSandboxForProfileBody: () => 'apalmer',
    getAdobeAccessToken: async () => 'mock-token',
    ADOBE_CLIENT_ID: { value: () => 'mock-client' }, ADOBE_IMS_ORG: { value: () => 'mock-org' },
    profileTableHelpers: { resolveConnectionGetter: () => null }, profileStreamingCore: core,
    genericProfileInfraService: {}, travelProfileInfraService: {}, fsiProfileInfraService: {},
    telecomProfileInfraService: {}, retailProfileInfraService: {}, mediaProfileInfraService: {}, sportsProfileInfraService: {},
    genericProfileConnectionStore: store, travelProfileConnectionStore: store, fsiProfileConnectionStore: store,
    telecomProfileConnectionStore: store, retailProfileConnectionStore: store, mediaProfileConnectionStore: store, sportsProfileConnectionStore: store
  }).profileUpdateProxy;
}
async function post(body) {
  const res = {
    statusCode: 0,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    send(data) { this.body = data; return this; }
  };
  const request = {
    dryRun: true, email: 'giulia@example.com', ecid: '12345678901234567890123456789012345678',
    streaming: { datasetId: 'mock-dataset', schemaId: 'https://ns.adobe.com/demoemea/schemas/mock' },
    updates: [{ path: 'person.name.firstName', value: 'Giulia', valueType: 'string' }],
    ...body
  };
  if (!request.updates.some((u) => ['testProfile', 'xdm:testProfile'].includes(u.path))) {
    request.updates.push({ path: 'testProfile', value: true, valueType: 'boolean' });
  }
  await handler()({ method: 'POST', query: {}, body: request }, res);
  return res;
}
test('safe mode never creates consent or channels and forces test profile; legacy keeps defaults', async (t) => {
  t.mock.method(console, 'log', () => {});
  const safe = await post({ consentMode: 'preserve' });
  assert.equal(safe.statusCode, 200);
  assert.equal(safe.body.accepted, undefined, 'dry run is not acceptance');
  const entity = safe.body.envelope.body.xdmEntity;
  assert.equal(entity.consents, undefined);
  assert.equal(entity.optInOut, undefined);
  assert.equal(entity.demoemea, undefined, 'safe mode does not invent a tenant mirror');
  assert.equal(entity.testProfile, true);
  assert.equal(entity['xdm:testProfile'], undefined, 'safe mode does not invent an undeclared sibling');
  assert.deepEqual(entity.identityMap.Email, [{ id: 'giulia@example.com', primary: true }]);
  assert.equal(entity.identityMap.ECID[0].primary, false);
  const legacy = await post({});
  assert.equal(legacy.body.envelope.body.xdmEntity.consents.marketing.email.val, 'y');
  assert.equal(legacy.body.envelope.body.xdmEntity.optInOut._channels.email, 'in');
});
test('explicit unknown/denied root and tenant fragments are preserved without default siblings', async (t) => {
  t.mock.method(console, 'log', () => {});
  const res = await post({ consentMode: 'preserve', updates: [
    { path: 'consents.marketing.email.val', value: 'n', valueType: 'string' },
    { path: '_demoemea.consents.marketing.sms.val', value: 'u', valueType: 'string' },
    { path: '_demoemea.optInOut._channels.email', value: 'out', valueType: 'string' },
    { path: 'testProfile', value: false, valueType: 'boolean' }
  ] });
  assert.equal(res.statusCode, 200);
  const entity = res.body.envelope.body.xdmEntity;
  assert.deepEqual(entity.consents, { marketing: { email: { val: 'n' } } });
  assert.deepEqual(entity._demoemea.consents, { marketing: { sms: { val: 'u' } } });
  assert.equal(entity._demoemea.optInOut._channels.email, 'out');
  assert.equal(entity.optInOut, undefined);
  assert.equal(entity.testProfile, true);
});
test('safe paths respect real tenant keys and root paths, retaining string IDs', async (t) => {
  t.mock.method(console, 'log', () => {});
  const res = await post({ consentMode: 'preserve', streaming: {
    datasetId: 'mock', schemaId: 'https://ns.adobe.com/tenant/schemas/mock', xdmKey: '_tenant'
  }, updates: [
    { path: '_tenant.preferences.brands.vuse.sms', value: false, valueType: 'boolean' },
    { path: 'homeAddress.postalCode', value: '00100', valueType: 'string' },
    { path: 'metadata.time', value: '2026-10-29T12:00:00Z', valueType: 'string' }
  ] });
  const entity = res.body.envelope.body.xdmEntity;
  assert.equal(entity._tenant.preferences.brands.vuse.sms, false);
  assert.equal(entity.homeAddress.postalCode, '00100');
  assert.equal(entity.metadata.time, '2026-10-29T12:00:00Z');
});
test('safe mode rejects legacy consent builder, operational shapes, unsafe paths and mode typos', async (t) => {
  t.mock.method(console, 'log', () => {});
  for (const extra of [
    { consentMode: 'typo' }, { consentMode: 'preserve', consent: {} },
    { consentMode: 'preserve', streamPayloadProfile: 'operational' },
    { consentMode: 'preserve', updates: [{ path: '__proto__.polluted', value: true }] }
  ]) {
    assert.equal((await post(extra)).statusCode, 400);
  }
  assert.equal({}.polluted, undefined);
});
test('bare safe payload does not synthesize defaults either', () => {
  const safe = core.buildProfileStreamPayload({ identification: { core: { email: 'g@example.com' } } }, 'g@example.com', null, '_demoemea', 'mock-org', 'test', {}, { useEnvelope: false, consentMode: 'preserve' });
  assert.equal(safe.payload.consents, undefined);
  assert.equal(safe.payload.optInOut, undefined);
});
test('mocked live receipt records inlet acceptance only and does not retry', async (t) => {
  t.mock.method(console, 'log', () => {});
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    return { ok: true, status: 200, text: async () => '{}' };
  });
  const res = await post({ dryRun: false, consentMode: 'preserve', streaming: {
    url: 'https://mock.invalid/inlet', flowId: 'mock-flow', datasetId: 'mock-dataset', schemaId: 'https://ns.adobe.com/demoemea/schemas/mock'
  } });
  assert.equal(calls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.accepted, true);
  assert.equal(res.body.upsVerified, false);
  assert.deepEqual(res.body.receipt, { stage: 'inlet-accepted', upsVerified: false, retrySafe: false });
});
test('strict notfound distinguishes empty success from a failed casing lookup', async (t) => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    return calls % 2 === 1
      ? { ok: true, status: 200, json: async () => ({}) }
      : { ok: false, status: 503, statusText: 'Unavailable', json: async () => ({ message: 'Unavailable' }) };
  });
  await assert.rejects(helpers.fetchUpsProfileEntities('g@example.com', 'apalmer', 'mock', 'mock', 'mock', 'email', { strictRead: true }), { code: 'UPS_FAILED' });
  assert.deepEqual(await helpers.fetchUpsProfileEntities('g@example.com', 'apalmer', 'mock', 'mock', 'mock'), {}, 'legacy fallback preserved');
});
test('strict notfound requires valid JSON and successful empty lookups without error containers', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
  assert.deepEqual(await helpers.fetchUpsProfileEntities('g@example.com', 'apalmer', 'mock', 'mock', 'mock', 'email', { strictRead: true }), {});
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }));
  await assert.rejects(helpers.fetchUpsProfileEntities('g@example.com', 'apalmer', 'mock', 'mock', 'mock', 'email', { strictRead: true }), /bad json/);
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ _errors: ['upstream failed'] }) }));
  await assert.rejects(helpers.fetchUpsProfileEntities('g@example.com', 'apalmer', 'mock', 'mock', 'mock', 'email', { strictRead: true }), /absence is not confirmed/);
});
test('strict reads recognize only the verified Adobe entity-absence signature, never arbitrary 404s', async (t) => {
  const missing = { title: 'Entity not found.', 'error-code': 'UPLIB-201001-404', status: 404 };
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 404, json: async () => missing }));
  assert.deepEqual(await helpers.fetchUpsProfileEntities('g@example.com', 'apalmer', 'mock', 'mock', 'mock', 'email', { strictRead: true }), {});
  for (const data of [{}, { ...missing, 'error-code': 'OTHER-404' }, { ...missing, status: 503 }]) {
    t.mock.method(global, 'fetch', async () => ({ ok: false, status: 404, json: async () => data }));
    await assert.rejects(helpers.fetchUpsProfileEntities('g@example.com', 'apalmer', 'mock', 'mock', 'mock', 'email', { strictRead: true }), { code: 'UPS_FAILED' });
  }
});
