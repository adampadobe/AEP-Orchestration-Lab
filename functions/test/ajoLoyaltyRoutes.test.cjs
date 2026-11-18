'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAjoLoyaltyRoutes } = require('../ajoLoyaltyRoutes');

function setup(overrides = {}) {
  let handler;
  let tokenCalls = 0;
  const reads = [];
  const dependencies = {
    onRequest: (_opts, fn) => { handler = fn; return fn; },
    profileFnOpts: {}, setCors() {},
    mcpApiKeyStore: { validateUserApiKey: async () => ({ ok: true, principalUid: 'uid', sandbox: 'kirkham' }) },
    getAdobeAccessToken: async () => { tokenCalls++; return 'server-only-token'; },
    aepHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'x-api-key': 'server-client', 'x-gw-ims-org-id': 'test@AdobeOrg' }),
    ADOBE_IMS_ORG: { value: () => 'test@AdobeOrg' },
    loyaltyService: { read: async (headers, input) => { reads.push({ headers, input }); return { ok: true, data: {} }; } },
    ...overrides,
  };
  registerAjoLoyaltyRoutes(dependencies);
  async function invoke(request = {}) {
    const state = { status: 200, headers: {} };
    const response = {
      set(name, value) { state.headers[name] = value; return this; },
      status(status) { state.status = status; return this; },
      json(body) { state.body = body; return this; },
      send(body) { state.body = body; return this; },
    };
    await handler({ method: 'GET', headers: { 'x-aep-lab-mcp-key': 'user-key' }, query: { action: 'config' }, ...request }, response);
    return state;
  }
  return { invoke, reads, tokenCalls: () => tokenCalls };
}

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
