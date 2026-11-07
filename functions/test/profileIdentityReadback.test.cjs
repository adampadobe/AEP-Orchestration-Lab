'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('../profileTableHelpers');
const { registerProfileRoutes } = require('../profileRoutes');

const email = 'identity.test@example.com';
const ecid = '12345678901234567890123456789012345678';
const missing = { title: 'Entity not found.', 'error-code': 'UPLIB-201001-404', status: 404 };

function response(status, data) {
  return { ok: status === 200, status, json: async () => data };
}

test('ECID reads use namespace codes without truncating the identifier and return linked Email evidence', async (t) => {
  const entity = {
    identityMap: { email: [{ id: email }], ecid: [{ id: ecid }] },
    _demoemea: { identification: { core: { email, ecid } } },
  };
  const ups = { profile: { entity, sources: ['0123456789abcdef01234567', 'profile-streaming-segment'] } };
  const attempts = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.method, 'GET');
    const params = new URL(url).searchParams;
    attempts.push(params.get('entityIdNS'));
    assert.equal(params.get('entityId'), ecid);
    return response(200, ups);
  });
  const result = await helpers.fetchUpsProfileEntities(ecid, 'offline', 'token', 'client', 'org', 'ecid');
  const table = helpers.buildProfileTablePayload(ecid, result);
  assert.deepEqual(attempts, ['ECID']);
  assert.equal(table.profileEmail, email);
  assert.equal(table.ecid, ecid);
  assert.equal(table.profileAccessHints.identityMapHasEmail, true);
  assert.equal(table.profileAccessHints.identityMapHasEcid, true);
  assert.deepEqual(table.profileAccessHints.identityNamespaces, ['email', 'ecid']);
  assert.deepEqual(table.profileAccessHints.sourceDatasetIds, ['0123456789abcdef01234567']);
});

test('a tenant ECID alone never counts as stored identity-map evidence', () => {
  const table = helpers.buildProfileTablePayload(email, { profile: { entity: {
    identityMap: { Email: [{ id: email }], ECID: [] },
    _demoemea: { identification: { core: { email, ecid } } },
  } } });
  assert.equal(table.ecid, ecid);
  assert.equal(table.profileAccessHints.identityMapHasEmail, true);
  assert.equal(table.profileAccessHints.identityMapHasEcid, false);
});

test('all namespace aliases must confirm absence before classifying a read as not found', async (t) => {
  const attempts = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    attempts.push(new URL(url).searchParams.get('entityIdNS'));
    return response(404, missing);
  });
  await assert.rejects(helpers.fetchUpsProfileEntities(ecid, 'offline', 'token', 'client', 'org', 'ecid'), {
    code: 'UPS_ENTITY_NOT_FOUND',
  });
  assert.deepEqual(attempts, ['ECID', 'ecid']);
});

test('a later alias can still resolve after an earlier alias returned not found', async (t) => {
  let calls = 0;
  const ups = { profile: { entity: { identityMap: { ECID: [{ id: ecid }] } } } };
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? response(404, missing) : response(200, ups));
  assert.deepEqual(await helpers.fetchUpsProfileEntities(ecid, 'offline', 'token', 'client', 'org', 'ecid'), ups);
});

for (const failure of [response(404, { title: 'Unknown route' }), response(403, { title: 'Forbidden' })]) {
  test(`does not disguise an upstream ${failure.status} failure as pending indexing`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? response(404, missing) : failure);
    await assert.rejects(helpers.fetchUpsProfileEntities(ecid, 'offline', 'token', 'client', 'org', 'ecid'), {
      code: 'UPS_FAILED',
    });
  });
}

test('profile table endpoint returns structured 404 for confirmed absence, not HTTP 500', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response(404, missing));
  const handler = registerProfileRoutes({
    onRequest: (_options, fn) => fn,
    profileFnOpts: {},
    CONSENT_STORE_FN_OPTS: {},
    setCors() {},
    resolveSandboxFromQuery: () => 'offline',
    getAdobeAccessToken: async () => 'token',
    ADOBE_CLIENT_ID: { value: () => 'client' },
    ADOBE_IMS_ORG: { value: () => 'org' },
    profileTableHelpers: helpers,
    ...Object.fromEntries(['generic', 'travel', 'fsi', 'retail', 'telecom', 'media', 'sports']
      .flatMap((industry) => [
        [`${industry}ProfileInfraService`, {}],
        [`${industry}ProfileConnectionStore`, {}],
      ])),
  }).profileTableProxy;
  const res = {
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
  await handler({ method: 'GET', query: { namespace: 'ecid', identifier: ecid } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.body.code, 'UPS_ENTITY_NOT_FOUND');
  assert.equal(res.body.stage, 'profile_access');
  assert.match(res.body.error, /retry reads only, not profile generation/);
});
