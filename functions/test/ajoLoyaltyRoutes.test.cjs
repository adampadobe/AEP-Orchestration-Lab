'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAjoLoyaltyHandler } = require('../ajoLoyaltyRoutes');

function sharedProxy(ajoLoyaltyHandler) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const start = source.indexOf('exports.aepProxy = onRequest(');
  const end = source.indexOf('\n);', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    exports: {}, onRequest: (_options, handler) => handler,
    REGION: 'us-central1', ADOBE_CLIENT_ID: {}, ADOBE_CLIENT_SECRET: {},
    ADOBE_IMS_ORG: {}, ADOBE_SCOPES: {}, RESOLVED_ADOBE_SANDBOX: 'kirkham',
    ajoLoyaltyHandler, setCors() {},
  };
  vm.runInNewContext(source.slice(start, end + 4), context);
  return context.exports.aepProxy;
}

function setup(overrides = {}) {
  let tokenCalls = 0;
  const reads = [];
  const dependencies = {
    setCors() {},
    mcpApiKeyStore: { validateUserApiKey: async () => ({ ok: true, principalUid: 'uid', sandbox: 'kirkham' }) },
    getAdobeAccessToken: async () => { tokenCalls++; return 'server-only-token'; },
    aepHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'x-api-key': 'server-client', 'x-gw-ims-org-id': 'test@AdobeOrg' }),
    ADOBE_IMS_ORG: { value: () => 'test@AdobeOrg' },
    loyaltyService: { read: async (headers, input) => { reads.push({ headers, input }); return { ok: true, data: {} }; } },
    ...overrides,
  };
  const handler = sharedProxy(createAjoLoyaltyHandler(dependencies));
  async function invoke(request = {}) {
    const state = { status: 200, headers: {} };
    const response = {
      set(name, value) { state.headers[name] = value; return this; },
      status(status) { state.status = status; return this; },
      json(body) { state.body = body; return this; },
      send(body) { state.body = body; return this; },
    };
    await handler({ path: '/api/ajo-loyalty', method: 'GET', headers: { 'x-aep-lab-mcp-key': 'user-key' }, query: { action: 'config' }, ...request }, response);
    return state;
  }
  return { invoke, reads, tokenCalls: () => tokenCalls };
}

test('Hosting routes Loyalty to the shared Function and unrelated paths retain generic proxy behavior', async () => {
  const config = require('../../firebase.json');
  const rewrite = config.hosting.flatMap(site => site.rewrites || [])
    .find(route => route.source === '/api/ajo-loyalty');
  assert.equal(rewrite.function.functionId, 'aepProxy');
  assert.equal(rewrite.function.region, 'us-central1');
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.doesNotMatch(source, /registerAjoLoyaltyRoutes|exports\.ajoLoyaltyProxy/);
  const app = setup();
  for (const route of ['/api/aep', '/api/ajo-loyalty/other', '/']) {
    assert.equal((await app.invoke({ path: route })).status, 405);
    assert.equal((await app.invoke({ path: route, method: 'OPTIONS' })).status, 204);
    assert.equal((await app.invoke({ path: route, method: 'POST', rawBody: '{' })).status, 400);
  }
  assert.equal(app.tokenCalls(), 0);
  assert.equal(app.reads.length, 0);
});

test('GET resolves a sandbox-scoped user and uses server-held Adobe headers only', async () => {
  const app = setup();
  const result = await app.invoke({ headers: { 'x-aep-lab-mcp-key': 'user-key', authorization: 'Bearer caller-token' } });
  assert.equal(result.status, 200);
  assert.match(result.headers['Cache-Control'], /private, no-store/);
  assert.deepEqual(app.reads[0], {
    headers: { Authorization: 'Bearer server-only-token', 'x-api-key': 'server-client', 'x-gw-ims-org-id': 'test@AdobeOrg', 'x-sandbox-name': 'kirkham' },
    input: { action: 'config', sandbox: 'kirkham' },
  });
  assert.doesNotMatch(JSON.stringify(result.body), /server-only-token|caller-token|server-client/);
});

test('rejects mutation verbs, invalid queries, foreign sandboxes/orgs and invalid keys before token access', async () => {
  for (const request of [
    { method: 'POST' }, { method: 'PATCH' }, { method: 'DELETE' },
    { query: { action: 'signup' } },
    { query: { action: 'config', sandbox: 'other' } },
    { query: { action: 'config', sandbox: ['kirkham'] } },
    { query: { action: 'config', path: '/ajo/loyalty/challenges/org' } },
    { headers: { 'x-aep-lab-mcp-key': 'key', 'x-gw-ims-org-id': 'other@AdobeOrg' } },
    { headers: {} },
  ]) {
    const app = setup();
    assert.ok((await app.invoke(request)).status >= 400);
    assert.equal(app.tokenCalls(), 0);
    assert.equal(app.reads.length, 0);
  }
  for (const auth of [{ ok: false }, { ok: true, sandbox: 'kirkham' }, { ok: true, principalUid: 'uid' }]) {
    const invalid = setup({ mcpApiKeyStore: { validateUserApiKey: async () => auth } });
    assert.equal((await invalid.invoke()).status, 403);
    assert.equal(invalid.tokenCalls(), 0);
  }
  const options = setup();
  assert.equal((await options.invoke({ method: 'OPTIONS' })).status, 204);
  assert.equal(options.tokenCalls(), 0);
});

test('supports independently validated IMS enrollment without accepting forwarded identity as proof', async () => {
  const app = setup({
    fetchImpl: async () => new Response(JSON.stringify({ email: 'member@adobe.com', email_verified: true })),
    db: { collection: () => ({ where: () => ({ get: async () => ({
      docs: [{ data: () => ({ revoked: false, principalUid: 'uid', sandbox: 'kirkham' }) }],
    }) }) }) },
  });
  const result = await app.invoke({
    headers: { authorization: 'Bearer ims-session', 'x-gw-ims-org-id': 'test@AdobeOrg' },
    query: { action: 'config', sandbox: 'kirkham' },
  });
  assert.equal(result.status, 200);
  assert.equal(app.reads[0].headers.Authorization, 'Bearer server-only-token');
  const mismatch = await app.invoke({
    headers: { authorization: 'Bearer ims-session', 'x-gw-ims-org-id': 'test@AdobeOrg', 'x-gw-ims-email': 'forged@adobe.com' },
    query: { action: 'config', sandbox: 'kirkham' },
  });
  assert.equal(mismatch.status, 403);
  assert.equal(app.reads.length, 1);
});

test('returns Adobe status/error evidence and sanitizes server authentication errors', async () => {
  const body = { error_code: '403003', message: 'Not entitled' };
  const app = setup({ loyaltyService: { read: async () => {
    throw Object.assign(new Error('Adobe Loyalty returned HTTP 403.'), { status: 403, platformStatus: 403, platformResponse: body });
  } } });
  const result = await app.invoke();
  assert.equal(result.status, 403);
  assert.deepEqual(result.body.platform_response, body);
  assert.equal(result.body.platform_status, 403);
  const auth = setup({ getAdobeAccessToken: async () => { throw new Error('secret-value'); } });
  const failed = await auth.invoke();
  assert.equal(failed.status, 502);
  assert.doesNotMatch(JSON.stringify(failed.body), /secret-value/);
});

test('Firebase browser reads require verified UID-bound active enrollment for the requested sandbox', async () => {
  const uids = [];
  const app = setup({
    labUserSandboxStore: { verifyIdTokenClaimsFromRequest: async () => ({ uid: 'verified-uid', email: 'demo@adobe.com', isAnonymous: false }) },
    mcpApiKeyStore: { listKeysForUser: async uid => { uids.push(uid); return [{ sandbox: 'own-sandbox', revoked: false }]; } },
  });
  const request = { headers: { authorization: 'Bearer firebase-session', 'x-user-id': 'forged' },
    query: { action: 'profile_state', sandbox: 'own-sandbox', profile_id: 'member-1', region: 'nld2' } };
  assert.equal((await app.invoke(request)).status, 200);
  assert.deepEqual(uids, ['verified-uid']);
  assert.equal(app.reads[0].headers['x-sandbox-name'], 'own-sandbox');
  assert.equal(app.reads[0].headers.Authorization, 'Bearer server-only-token');
  assert.equal((await app.invoke({ ...request, query: { ...request.query, sandbox: 'foreign' } })).status, 403);
  assert.equal(app.tokenCalls(), 1);
});

test('Firebase browser authentication cannot use anonymous, missing, revoked or ambiguous enrollment', async () => {
  const request = { headers: { authorization: 'Bearer firebase-session' }, query: { action: 'config', sandbox: 'own' } };
  for (const claims of [null, { uid: 'uid', email: 'demo@adobe.com', isAnonymous: true },
    { uid: 'uid', email: 'other@example.invalid' }, { email: 'demo@adobe.com' }]) {
    const app = setup({ labUserSandboxStore: { verifyIdTokenClaimsFromRequest: async () => claims } });
    assert.ok((await app.invoke(request)).status >= 400);
    assert.equal(app.tokenCalls(), 0);
  }
  for (const keys of [[], [{ sandbox: 'own', revoked: true }], [{ sandbox: 'other', revoked: false }],
    [{ allowedSandboxes: ['own', 'other'], revoked: false }]]) {
    const app = setup({
      labUserSandboxStore: { verifyIdTokenClaimsFromRequest: async () => ({ uid: 'uid', email: 'demo@adobe.com', isAnonymous: false }) },
      mcpApiKeyStore: { listKeysForUser: async () => keys },
    });

    assert.equal((await app.invoke(request)).status, 403);
    assert.equal(app.tokenCalls(), 0);
  }
});

test('outside demo sandboxes an enrolled Portal user can sign up only a server-verified test profile', async () => {
  const signups = [], profileReads = [];
  let entity = { testProfile: true, _demoemea: { identification: { core: { loyaltyId: 'member-1' } } } };
  let namespace = 'loyaltyId', entities, profileError;
  const app = setup({
    labUserSandboxStore: { verifyIdTokenClaimsFromRequest: async () => ({ uid: 'uid', email: 'demo@adobe.com', isAnonymous: false }) },
    mcpApiKeyStore: { listKeysForUser: async () => [{ sandbox: 'own', revoked: false }] },
    loyaltyService: {
      read: async () => ({ data: { namespace } }),
      signup: async (headers, input) => { signups.push({ headers, input }); return { ok: true, accepted: true }; },
    },
    profileTableHelpers: { fetchUpsProfileEntities: async (...args) => {
      profileReads.push(args);
      if (profileError) throw profileError;
      return entities || { profile: { entity } };
    } },
  });
  const request = { method: 'POST', headers: { authorization: 'Bearer firebase-session', 'content-type': 'application/json' },
    query: { sandbox: 'own' }, body: { action: 'signup', profile_id: 'member-1', challenge_id: 'challenge-1', region: 'nld2', test: false, confirmed: true } };
  assert.equal((await app.invoke(request)).status, 200);
  assert.equal(signups.length, 1);
  assert.deepEqual(profileReads[0], ['member-1', 'own', 'server-only-token', 'server-client', 'test@AdobeOrg', 'loyaltyid', { strictRead: true }]);
  assert.equal(signups[0].headers.Authorization, 'Bearer server-only-token');
  assert.deepEqual(signups[0].input, { ...request.body, sandbox: 'own' });
  for (const invalid of [
    { ...request, headers: { ...request.headers, 'x-aep-lab-mcp-key': 'key' } },
    { ...request, headers: { ...request.headers, 'x-gw-ims-org-id': 'test@AdobeOrg' } },
    { ...request, headers: { ...request.headers, 'content-type': 'text/plain' } },
    { ...request, query: { sandbox: 'foreign' } },
    { ...request, query: { sandbox: 'own', action: 'config' } },
    { ...request, body: { ...request.body, sandbox: 'foreign' } },
    { ...request, body: { ...request.body, confirmed: false } },
    { ...request, body: { ...request.body, data: {} } },
  ]) assert.ok((await app.invoke(invalid)).status >= 400);
  for (const invalid of [
    { testProfile: false }, { testProfile: 'true' }, {},
    { testProfile: true, 'xdm:testProfile': false },
    { testProfile: true, _demoemea: { identification: { core: { loyaltyId: 'different-member' } } } },
    { testProfile: true, _demoemea: { identification: { core: { loyaltyId: 'member-1' } } },
      _other: { identification: { core: { loyaltyId: 'different-member' } } } },
  ]) {
    entity = invalid;
    assert.equal((await app.invoke(request)).status, 403);
  }
  for (const invalid of [{}, { profile1: { entity }, profile2: { entity } }]) {
    entities = invalid;
    assert.equal((await app.invoke(request)).status, 403, 'Missing or ambiguous UPS members cannot authorize signup');
  }
  profileError = new Error('Fixture: strict profile read failed');
  assert.equal((await app.invoke(request)).status, 502);
  profileError = null;
  namespace = 'Email';
  assert.equal((await app.invoke(request)).status, 409);
  assert.equal(signups.length, 1, 'No unauthorized, unverified or malformed request reaches the mutation');
});

test('approved demo sandboxes need no Portal login for exact test-member reads and signup', async () => {
  for (const sandbox of ['kirkham', 'apalmer']) {
    const calls = [], profileReads = [];
    const app = setup({
      labUserSandboxStore: { verifyIdTokenClaimsFromRequest: async () => { throw new Error('Demo must not depend on Portal authentication'); } },
      mcpApiKeyStore: {
        listKeysForUser: async () => { throw new Error('Demo must not depend on MCP enrollment'); },
        validateUserApiKey: async () => ({ ok: false }),
      },
      profileTableHelpers: { fetchUpsProfileEntities: async (...args) => {
        profileReads.push(args);
        return { profile: { entity: {
          testProfile: true, 'xdm:testProfile': true,
          _demoemea: { identification: { core: { loyaltyId: 'member-1' } } },
        } } };
      } },
      loyaltyService: {
        read: async (headers, input) => {
          calls.push({ headers, input });
          return { ok: true, data: input.action === 'config' ? { namespace: 'loyaltyId' } : { challengeList: [] } };
        },
        signup: async (headers, input) => {
          calls.push({ headers, input });
          return { ok: true, accepted: true };
        },
      },
    });
    for (const query of [
      { sandbox, action: 'config' },
      { sandbox, action: 'challenge_get', challenge_id: 'challenge-1' },
    ]) assert.equal((await app.invoke({ headers: {}, query })).status, 200);
    assert.equal(profileReads.length, 0, 'Safe setup metadata does not require a selected member or Portal login');
    const query = { sandbox, profile_id: 'member-1' };
    for (const action of ['profile_state', 'profile_challenges']) {
      assert.equal((await app.invoke({ headers: {}, query: { ...query, action } })).status, 200);
      assert.equal(calls.at(-1).input.action, action);
    }
    assert.equal((await app.invoke({
      method: 'POST', headers: { 'content-type': 'application/json' }, query: { sandbox },
      body: { action: 'signup', profile_id: 'member-1', challenge_id: 'challenge-1', region: 'va7', test: false, confirmed: true },
    })).status, 200);
    assert.equal(profileReads.length, 3, 'Every member read and signup independently verifies UPS');
    assert.deepEqual(profileReads[0], ['member-1', sandbox, 'server-only-token', 'server-client', 'test@AdobeOrg', 'loyaltyid', { strictRead: true }]);
    assert.ok(calls.every(call => call.headers.Authorization === 'Bearer server-only-token' && call.headers['x-sandbox-name'] === sandbox));
    const before = app.tokenCalls();
    assert.equal((await app.invoke({ headers: {}, query: { sandbox, action: 'challenge_list' } })).status, 403);
    assert.equal((await app.invoke({ headers: {}, query: { ...query, action: 'profile_state', path: '/arbitrary' } })).status, 400);
    assert.equal((await app.invoke({ headers: { 'x-aep-lab-mcp-key': 'invalid' }, query: { sandbox, action: 'config' } })).status, 403,
      'Invalid MCP credentials never fall back to demo access');
    assert.equal((await app.invoke({ method: 'POST', headers: { 'x-aep-lab-mcp-key': 'invalid' }, query: { sandbox } })).status, 403);
    assert.equal(app.tokenCalls(), before, 'Demo catalogue and MCP mutations are rejected before Adobe access');
  }
});

test('no-login demo access rejects non-test, missing, ambiguous and mismatched members before member operations', async () => {
  let entities, namespace = 'loyaltyId', failProfileRead = false;
  const memberCalls = [];
  const app = setup({
    profileTableHelpers: { fetchUpsProfileEntities: async () => {
      if (failProfileRead) throw new Error('Strict UPS read failed');
      return entities;
    } },
    loyaltyService: {
      read: async (_headers, input) => {
        if (input.action === 'config') return { data: { namespace } };
        memberCalls.push(input);
        return { ok: true };
      },
      signup: async (_headers, input) => { memberCalls.push(input); return { ok: true }; },
    },
  });
  const requests = [
    { headers: {}, query: { sandbox: 'kirkham', action: 'profile_state', profile_id: 'member-1' } },
    { headers: {}, query: { sandbox: 'apalmer', action: 'profile_challenges', profile_id: 'member-1', state: 'complete' } },
    { method: 'POST', headers: { 'content-type': 'application/json' }, query: { sandbox: 'kirkham' },
      body: { action: 'signup', profile_id: 'member-1', challenge_id: 'challenge-1', region: 'va7', test: false, confirmed: true } },
  ];
  const valid = { testProfile: true, _demoemea: { identification: { core: { loyaltyId: 'member-1' } } } };
  for (const entity of [
    {}, { testProfile: true, loyalty: { loyaltyID: ['member-1'] } },
    { ...valid, testProfile: false }, { ...valid, testProfile: 'true' },
    { ...valid, 'xdm:testProfile': false },
    { ...valid, _demoemea: { identification: { core: { loyaltyId: 'another-member' } } } },
    { ...valid, _other: { identification: { core: { loyaltyId: 'another-member' } } } },
  ]) {
    entities = { profile: { entity } };
    for (const request of requests) assert.equal((await app.invoke(request)).status, 403);
  }
  for (const invalid of [{}, { profile1: { entity: valid }, profile2: { entity: valid } }]) {
    entities = invalid;
    for (const request of requests) assert.equal((await app.invoke(request)).status, 403);
  }
  entities = { profile: { entity: valid } };
  namespace = 'Email';
  for (const request of requests) assert.equal((await app.invoke(request)).status, 409);
  namespace = 'loyaltyId'; failProfileRead = true;
  for (const request of requests) assert.equal((await app.invoke(request)).status, 502);
  assert.equal(memberCalls.length, 0, 'No unverified identity can read Loyalty member state or enroll');
  const before = app.tokenCalls();
  for (const sandbox of ['foreign', 'Kirkham', 'kirkham-extra']) {
    assert.equal((await app.invoke({ headers: {}, query: { sandbox, action: 'config' } })).status >= 400, true);
  }
  assert.equal(app.tokenCalls(), before, 'No-login access cannot expand the exact sandbox allowlist');
});

test('signup errors distinguish Adobe signup conflicts, preflight conflicts and unknown submitted outcomes', async () => {
  const request = { method: 'POST', headers: { authorization: 'Bearer firebase-session', 'content-type': 'application/json' },
    query: { sandbox: 'own' }, body: { action: 'signup', profile_id: 'member-1', challenge_id: 'challenge-1', region: 'va7', test: false, confirmed: true } };
  let preflight = false;
  for (const [status, unknown] of [[409, false], [422, false], [504, true]]) {
    const app = setup({
      labUserSandboxStore: { verifyIdTokenClaimsFromRequest: async () => ({ uid: 'uid', email: 'demo@adobe.com', isAnonymous: false }) },
      mcpApiKeyStore: { listKeysForUser: async () => [{ sandbox: 'own', revoked: false }] },
      profileTableHelpers: { fetchUpsProfileEntities: async () => ({ profile: { entity: {
        testProfile: true, _demoemea: { identification: { core: { loyaltyId: 'member-1' } } },
      } } }) },
      loyaltyService: {
        read: async () => {
          if (preflight) throw Object.assign(new Error('Configuration conflict'), { status: 409, platformStatus: 409 });
          return { data: { namespace: 'loyaltyId' } };
        },
        signup: async () => { throw Object.assign(new Error('Signup failed'), {
          status, platformStatus: unknown ? null : status, signupOutcomeUnknown: unknown,
          platformResponse: { title: 'Adobe error' },
        }); },
      },
    });
    const result = await app.invoke(request);
    assert.equal(result.status, status);
    assert.equal(result.body.signup_submitted, true);
    assert.equal(result.body.signup_outcome_unknown, unknown);
    assert.equal(result.body.platform_status, unknown ? null : status);
    assert.deepEqual(result.body.platform_response, { title: 'Adobe error' });
    preflight = true;
    const rejected = await app.invoke(request);
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.signup_submitted, false, 'An Adobe configuration 409 is not a signup 409');
    assert.equal(rejected.body.signup_outcome_unknown, false);
    preflight = false;
  }
});
