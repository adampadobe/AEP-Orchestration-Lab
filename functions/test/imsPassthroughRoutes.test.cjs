'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAudienceManagementRoutes } = require('../audienceManagementRoutes');
const { registerAjoCleanupRoutes } = require('../ajoCleanupRoutes');
const { registerAdobeApiCapabilityRoutes } = require('../adobeApiCapabilityRoutes');
const { registerMeasurementQualityRoutes } = require('../measurementQualityRoutes');
const { registerCommerceRoutes } = require('../commerceRoutes');
const { registerCommerceOptimizerRoutes } = require('../commerceOptimizerRoutes');
const { registerHomeCommandMcpRoutes } = require('../homeCommandMcpRoutes');
const { registerSnowflakeRoutes } = require('../snowflakeRoutes');
const { registerLiveActivityRoutes } = require('../liveActivityRoutes');
const homeCommandMcpAuth = require('../homeCommandMcpAuth');
const snowflakePrincipalAuth = require('../snowflakePrincipalAuth');
const labGenerationPrefsAuth = require('../labGenerationPrefsAuth');

function request(overrides = {}) {
  return {
    method: 'GET',
    headers: {
      authorization: 'Bearer test-ims-session',
      'x-gw-ims-org-id': 'TEST@AdobeOrg',
      'x-gw-ims-email': 'tester@adobe.com',
      'x-aep-lab-principal-uid': 'spoofed-uid',
      'x-sandbox-name': 'apalmer',
    },
    query: { sandbox: 'apalmer' },
    body: {},
    url: '/api/home-command/mcp/state',
    ...overrides,
  };
}

function response() {
  return {
    code: 200,
    headers: {},
    status(code) { this.code = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

function harness() {
  const state = { entries: [{ principalUid: 'portal-uid', sandbox: 'apalmer', revoked: false }], calls: [], owner: 'owned-workspace' };
  const read = async (params) => { state.calls.push(params); return { ok: true }; };
  const deps = {
    onRequest: (_options, handler) => handler,
    setCors() {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ email: 'tester@adobe.com', email_verified: true }) }),
    db: {
      collection: (name) => {
        assert.equal(name, 'mcpApiKeys');
        return {
          where: (field, op, email) => {
            assert.deepEqual([field, op, email], ['principalEmail', '==', 'tester@adobe.com']);
            return { get: async () => ({ docs: state.entries.map((entry) => ({ data: () => entry })) }) };
          },
        };
      },
    },
    rtdb: { ref: (path) => {
      assert.equal(path, 'userWorkspaceOwners/portal-uid');
      return { once: async () => ({ val: () => state.owner }) };
    } },
    labUserSandboxStore: {
      getWorkspaceProfile: async (uid) => {
        assert.equal(uid, 'portal-uid');
        return { workspaceSlug: 'profile-workspace' };
      },
      verifyIdTokenClaimsFromRequest: async () => { throw new Error('IMS must not use Firebase token verification'); },
    },
    getAdobeAccessToken: async () => 'platform-token',
    ADOBE_CLIENT_ID: { value: () => 'client' },
    ADOBE_IMS_ORG: { value: () => 'org' },
    internalMcpKey: { value: () => 'ops-key' },
    mcpApiKeyStore: { validateUserApiKey: async () => ({ ok: false }) },
    audienceManagementService: { listAudiences: read },
    ajoCleanupService: { listJourneys: read },
    capabilityService: { listAjoAddresses: read },
    measurementService: { listAssuranceSessions: read },
    commerceService: { accessInfo: read },
    commerceOptimizerService: { accessInfo: () => read({}) },
    homeCommandMcpAuth,
    homeCommandMcpStore: { getState: (slug) => read({ slug }) },
    snowflakePrincipalAuth,
    resolveSandboxFromQuery: (req) => req.query.sandbox || 'apalmer',
    snowflakeService: { handleConfigGet: read },
    labGenerationPrefsAuth,
    liveActivityTemplateStore: { listTemplates: (uid, sandbox) => read({ uid, sandbox }) },
  };
  const cases = [
    [registerAudienceManagementRoutes(deps).audienceManagementProxy, {}],
    [registerAjoCleanupRoutes(deps).ajoCleanupProxy, { asset_type: 'journey' }],
    [registerAdobeApiCapabilityRoutes(deps).adobeApiCapabilitiesProxy, { action: 'ajo_addresses' }],
    [registerMeasurementQualityRoutes(deps).measurementQualityProxy, { action: 'assurance_sessions' }],
    [registerCommerceRoutes(deps).commercePrepProxy, { action: 'access' }],
    [registerCommerceOptimizerRoutes(deps).commerceOptimizerPrepProxy, { action: 'access' }],
    [registerHomeCommandMcpRoutes(deps).homeCommandMcp, {}],
    [registerSnowflakeRoutes(deps).snowflakeConfig, {}],
    [registerLiveActivityRoutes(deps).ajoLiveActivityTemplates, {}],
  ];
  return { state, deps, cases };
}

test('all key-only route families accept independently validated IMS enrollment', async () => {
  const { state, cases } = harness();
  for (const [handler, query] of cases) {
    const res = response();
    await handler(request({ query: { sandbox: 'apalmer', ...query } }), res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
  }
  assert.equal(state.calls.length, cases.length);
  assert.ok(state.calls.some((call) => call.labUser === 'portal-uid' && call.sandbox === 'apalmer'));
  assert.ok(state.calls.some((call) => call.slug === 'owned-workspace'));
});

test('all route families deny revoked, wrong-sandbox, absent and ambiguous IMS enrollment before service calls', async () => {
  const { state, cases } = harness();
  for (const entries of [
    [], [{ principalUid: 'portal-uid', sandbox: 'apalmer', revoked: true }],
    [{ principalUid: 'portal-uid', sandbox: 'other', revoked: false }],
    [{ principalUid: '', sandbox: 'apalmer', revoked: false }],
    [
      { principalUid: 'portal-uid', sandbox: 'apalmer', revoked: false },
      { principalUid: 'another-uid', sandbox: 'apalmer', revoked: false },
    ],
  ]) {
    state.entries = entries;
    for (const [handler, query] of cases) {
      const res = response();
      await handler(request({ query: { sandbox: 'apalmer', ...query } }), res);
      assert.equal(res.code, 403);
    }
  }
  assert.equal(state.calls.length, 0);
});

test('IMS never rescues an explicitly supplied invalid key', async () => {
  const { state, cases } = harness();
  for (const [handler, query] of cases) {
    const req = request({ query: { sandbox: 'apalmer', ...query } });
    req.headers['x-aep-lab-mcp-key'] = 'invalid-user-key';
    const res = response();
    await handler(req, res);
    assert.equal(res.code, 403);
  }
  assert.equal(state.calls.length, 0);
});

test('Command Centre preserves owner-record then workspace-profile priority for the enrolled UID', async () => {
  const { state, cases } = harness();
  const [handler] = cases[6];
  state.owner = null;
  await handler(request(), response());
  assert.deepEqual(state.calls, [{ slug: 'profile-workspace' }]);
});

test('workspace and Commerce routes can validate the forwarded enrolled sandbox without a tool sandbox argument', async () => {
  const { state, cases } = harness();
  for (const index of [4, 5, 6]) {
    const [handler, query] = cases[index];
    const res = response();
    await handler(request({ query }), res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
  }
  assert.equal(state.calls.length, 3);
});

test('Command Centre preserves valid user-key and Firebase auth, while rejecting anonymous browser auth', async () => {
  const { deps } = harness();
  deps.mcpApiKeyStore.validateUserApiKey = async () => ({
    ok: true, principalUid: 'portal-uid', principalEmail: 'tester@adobe.com',
  });
  const key = await homeCommandMcpAuth.resolveHomeCommandPrincipal(
    request({ headers: { 'x-aep-lab-mcp-key': 'valid-user-key' } }), deps,
  );
  assert.equal(key.authSource, 'mcp_key');
  assert.equal(key.workspaceSlug, 'owned-workspace');
  deps.labUserSandboxStore.verifyIdTokenClaimsFromRequest = async () => ({
    uid: 'portal-uid', email: 'tester@adobe.com', isAnonymous: false,
  });
  const firebase = await homeCommandMcpAuth.resolveHomeCommandPrincipal(request({ headers: {} }), deps);
  assert.equal(firebase.authSource, 'firebase');
  assert.equal(firebase.workspaceSlug, key.workspaceSlug);
  deps.labUserSandboxStore.verifyIdTokenClaimsFromRequest = async () => ({ uid: 'anonymous', isAnonymous: true });
  assert.equal((await homeCommandMcpAuth.resolveHomeCommandPrincipal(request({ headers: {} }), deps)).status, 403);
});

test('IMS audience deletion still requires exact confirmation and re-reads the audience', async () => {
  const { deps } = harness();
  let deletes = 0;
  deps.audienceManagementService = {
    getAudience: async () => ({ id: 'aud-1', name: 'Current name', dependencies: [], dependents: [] }),
    deleteAudience: async () => { deletes += 1; },
  };
  const handler = registerAudienceManagementRoutes(deps).audienceManagementProxy;
  for (const [confirmed, expected_name, code] of [[false, 'Current name', 400], [true, 'Stale name', 409]]) {
    const res = response();
    await handler(request({
      method: 'DELETE', body: { sandbox: 'apalmer', audience_id: 'aud-1', expected_name, confirmed },
    }), res);
    assert.equal(res.code, code);
  }
  assert.equal(deletes, 0);
});

test('IMS rejects conflicting body/query sandboxes and Snowflake GET-body scope tricks', async () => {
  const { state, cases } = harness();
  for (const [handler, query] of cases) {
    const res = response();
    await handler(request({ query: { sandbox: 'other', ...query }, body: { sandbox: 'apalmer' } }), res);
    assert.equal(res.code, 403);
  }
  const res = response();
  await cases[7][0](request({ query: {}, body: { sandbox: 'other' } }), res);
  assert.equal(res.code, 403);
  assert.equal(state.calls.length, 0);
});

test('Snowflake AEP dual-load returns structured errors with the matching correlation ID', async () => {
  const { deps } = harness();
  const snowflakeError = {
    message: 'SQL compilation error',
    code: '000904',
    sqlState: '42000',
    queryId: 'query-123',
    phase: 'insert_profile_transaction',
  };
  deps.snowflakeDataGeneratorService = {
    handleInsertProfileFromAep: async () => ({ ok: false, error: snowflakeError }),
  };
  const handler = registerSnowflakeRoutes(deps).snowflakeInsertProfileFromAep;
  const res = response();
  const correlationId = '11111111-1111-4111-8111-111111111111';
  await handler(request({
    method: 'POST',
    headers: {
      authorization: 'Bearer test-ims-token',
      'x-gw-ims-org-id': 'TEST@AdobeOrg',
      'x-gw-ims-email': 'tester@adobe.com',
      'x-aep-lab-correlation-id': correlationId,
    },
    body: {
      sandbox: 'apalmer',
      email: 'demo@example.com',
      ecid: '12345678901234567890123456789012345678',
      industry: 'fsi',
    },
  }), res);
  assert.equal(res.code, 400);
  assert.equal(res.headers['x-aep-lab-correlation-id'], correlationId);
  assert.equal(res.body.correlationId, correlationId);
  assert.deepEqual(res.body.error, snowflakeError);
});

test('IMS Live Activity sandboxName alias cannot override the validated enrollment scope', async () => {
  const { state, cases } = harness();
  const res = response();
  await cases[8][0](request({ query: {}, body: { sandboxName: 'other' } }), res);
  assert.equal(res.code, 403);
  assert.equal(state.calls.length, 0);
});
