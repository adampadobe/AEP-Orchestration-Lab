'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveLabImsPrincipal } = require('../labImsPrincipalAuth');
const { resolveGenerationPrefsPrincipal } = require('../labGenerationPrefsAuth');
const { registerLabRoutes } = require('../labRoutes');

const active = { principalUid: 'portal-uid', sandbox: 'apalmer', revoked: false };
function request(overrides = {}) {
  return {
    method: 'GET',
    headers: {
      authorization: 'Bearer test-ims-session',
      'x-gw-ims-org-id': 'TEST@AdobeOrg',
      'x-gw-ims-email': 'tester@adobe.com',
      'x-aep-lab-principal-uid': 'untrusted-uid',
    },
    query: { sandbox: 'apalmer' },
    body: {},
    ...overrides,
  };
}

function deps(entries = [active], identity = { email: 'tester@adobe.com', email_verified: true }) {
  return {
    fetchImpl: async () => ({ ok: true, json: async () => identity }),
    db: {
      collection(name) {
        assert.equal(name, 'mcpApiKeys');
        return {
          where(field, op, email) {
            assert.deepEqual([field, op, email], ['principalEmail', '==', 'tester@adobe.com']);
            return { get: async () => ({ docs: entries.map((entry) => ({ data: () => entry })) }) };
          },
        };
      },
    },
  };
}

test('IMS resolves the Portal UID from the requested sandbox, not forwarded UID or another enrollment', async () => {
  const result = await resolveLabImsPrincipal(request(), deps([
    { ...active, sandbox: 'another', principalUid: 'other-uid' },
    active,
    { ...active, principalUid: 'revoked-uid', revoked: true },
  ]));
  assert.equal(result.ok, true);
  assert.equal(result.uid, 'portal-uid');
  assert.equal(result.keySandbox, 'apalmer');
  assert.equal(result.authSource, 'ims');
});

test('IMS accepts duplicate active keys for one UID and legacy sandbox enrollment', async () => {
  const result = await resolveLabImsPrincipal(request(), deps([
    active, { ...active, sandbox: null, allowedSandboxes: ['apalmer', 'another'] },
  ]));
  assert.equal(result.ok, true);
  assert.equal(result.uid, active.principalUid);
});

test('IMS denies revoked, missing, wrong-sandbox, UID-less and ambiguous enrollments', async () => {
  for (const entries of [
    [], [{ ...active, revoked: true }], [{ ...active, revoked: undefined }],
    [{ ...active, sandbox: 'another' }], [{ ...active, principalUid: '' }],
    [active, { ...active, principalUid: 'conflicting-uid' }],
    [active, { ...active, principalUid: '' }],
  ]) {
    const result = await resolveLabImsPrincipal(request(), deps(entries));
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  }
});

test('IMS does not cache revoked enrollment between requests', async () => {
  const entries = [{ ...active }];
  const dependencies = deps(entries);
  assert.equal((await resolveLabImsPrincipal(request(), dependencies)).ok, true);
  entries[0].revoked = true;
  assert.equal((await resolveLabImsPrincipal(request(), dependencies)).status, 403);
});

test('IMS requires bearer, org and exact sandbox, and rejects inconsistent identity', async () => {
  for (const req of [
    request({ headers: {} }),
    request({ headers: { authorization: 'Bearer session' } }),
    request({ query: {} }),
    request({ query: { sandbox: '../another' } }),
    request({ headers: { ...request().headers, 'x-gw-ims-email': 'other@adobe.com' } }),
  ]) {
    assert.equal((await resolveLabImsPrincipal(req, deps())).ok, false);
  }
  for (const identity of [{ email: 'test@example.com' }, { email: 'tester@adobe.com', email_verified: false }, {}]) {
    assert.equal((await resolveLabImsPrincipal(request(), deps([], identity))).status, 403);
  }
});

test('IMS authenticated Profile fallback supplies missing UserInfo email', async () => {
  const dependencies = deps();
  let calls = 0;
  dependencies.fetchImpl = async (url, options) => {
    assert.equal(options.headers.authorization, 'Bearer test-ims-session');
    calls += 1;
    if (calls === 1) {
      assert.equal(options.method, 'GET');
      assert.ok(url.endsWith('/userinfo/v2'));
      return { ok: true, json: async () => ({ email_verified: true }) };
    }
    assert.equal(options.method, 'POST');
    assert.ok(url.endsWith('/profile/v1'));
    return { ok: true, json: async () => ({ profile: { email: 'tester@adobe.com' } }) };
  };
  assert.equal((await resolveLabImsPrincipal(request(), dependencies)).uid, active.principalUid);
  assert.equal(calls, 2);
});

test('IMS returns explicit errors for expired bearer, transport, malformed JSON and enrollment failures', async () => {
  for (const [fetchImpl, status] of [
    [async () => ({ ok: false, status: 401 }), 401],
    [async () => ({ ok: false, status: 503 }), 503],
    [async () => { throw new Error('transport'); }, 503],
    [async () => ({ ok: true, json: async () => { throw new Error('json'); } }), 502],
  ]) {
    assert.equal((await resolveLabImsPrincipal(request(), { ...deps(), fetchImpl })).status, status);
  }
  const result = await resolveLabImsPrincipal(request(), {
    ...deps(), db: { collection() { throw new Error('store unavailable'); } },
  });
  assert.equal(result.status, 503);
});

test('shared principal resolver keeps explicit key precedence and Firebase behavior', async () => {
  const dependencies = {
    ...deps(),
    mcpApiKeyStore: { validateUserApiKey: async () => ({ ok: false }) },
    labUserSandboxStore: { verifyIdTokenFromRequest: async () => 'firebase-uid' },
  };
  const opsReq = request({ headers: { ...request().headers, 'x-aep-lab-mcp-key': 'ops-key' } });
  assert.equal((await resolveGenerationPrefsPrincipal(opsReq, dependencies)).status, 403);
  assert.equal((await resolveGenerationPrefsPrincipal(request(), dependencies)).authSource, 'ims');
  const firebase = await resolveGenerationPrefsPrincipal(request({ headers: {}, get: () => '' }), dependencies);
  assert.equal(firebase.authSource, 'firebase');
  assert.equal(firebase.uid, 'firebase-uid');
  dependencies.mcpApiKeyStore.validateUserApiKey = async () => ({
    ok: true, principalUid: 'key-uid', sandbox: 'apalmer',
  });
  assert.equal((await resolveGenerationPrefsPrincipal(opsReq, dependencies)).uid, 'key-uid');
});

test('demo routes use IMS enrollment UID and preserve workspace ownership checks', async () => {
  let owns = true;
  const contexts = [];
  const dependencies = deps();
  const routes = registerLabRoutes({
    onRequest: (_opts, handler) => handler,
    labHostingOriginForFunctionConfig: () => 'https://lab.example.test',
    setCors() {},
    labGenerationPrefsAuth: {
      resolveGenerationPrefsPrincipal: (req) => resolveGenerationPrefsPrincipal(req, dependencies),
    },
    labUserSandboxStore: {
      getWorkspaceProfile: async (uid) => {
        assert.equal(uid, 'portal-uid');
        return { workspaceSlug: 'tester' };
      },
    },
    labRtdbProvisionService: {
      userOwnsWorkspace: async (_db, uid, slug) => {
        assert.equal(uid, 'portal-uid');
        assert.equal(slug, 'tester');
        return owns;
      },
    },
    labDemoConfigService: {
      inspect: async (context) => { contexts.push(context); return { ok: true, sections: [] }; },
    },
    labDemoAssetService: { inspect: async (context) => { contexts.push(context); return { ok: true }; } },
  });
  for (const handler of [routes.labDemoConfig, routes.labDemoAssets]) {
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler(request(), res);
    assert.equal(res.code, 200);
    assert.equal(res.body.authSource, 'ims');
    owns = false;
    await handler(request(), res);
    assert.equal(res.code, 403);
    assert.match(res.body.error, /does not own/);
    owns = true;
  }
  assert.ok(contexts.length);
  assert.ok(contexts.every((context) => context.uid === 'portal-uid' && context.sandbox === 'apalmer'));
});
