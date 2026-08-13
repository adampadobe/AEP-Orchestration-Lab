'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSandboxList,
  normalizeSandboxName,
  normalizeKeyLabel,
  deriveSandboxFromKeyData,
  workspaceSandboxCandidates,
  validateRequestedSandboxes,
  validateSingleSandbox,
  hashApiKey,
  keyIdFromApiKey,
  timingSafeEqual,
  pickKeyForSandbox,
  countActiveKeysForSandbox,
  MAX_ACTIVE_KEYS_PER_SANDBOX,
  MAX_KEYS_RETURNED_PER_USER,
} = require('../mcpApiKeyStore');

describe('mcpApiKeyStore', () => {
  it('allows a larger bounded set of active keys per sandbox', () => {
    assert.equal(MAX_ACTIVE_KEYS_PER_SANDBOX, 25);
    assert.equal(MAX_KEYS_RETURNED_PER_USER, 250);
  });

  it('normalizeSandboxList dedupes and lowercases', () => {
    assert.deepEqual(normalizeSandboxList(['Apalmer', 'apalmer', 'kirkham']), ['apalmer', 'kirkham']);
  });

  it('normalizeSandboxName returns single lowercase sandbox', () => {
    assert.equal(normalizeSandboxName('Kirkham'), 'kirkham');
    assert.equal(normalizeSandboxName(''), '');
  });

  it('normalizeKeyLabel trims whitespace, strips controls, and limits length', () => {
    assert.equal(normalizeKeyLabel('  ChatGPT\n desktop  '), 'ChatGPT desktop');
    assert.equal(normalizeKeyLabel('x'.repeat(80)).length, 60);
  });

  it('deriveSandboxFromKeyData prefers sandbox field over legacy allowedSandboxes', () => {
    assert.equal(deriveSandboxFromKeyData({ sandbox: 'kirkham', allowedSandboxes: ['apalmer'] }), 'kirkham');
    assert.equal(deriveSandboxFromKeyData({ allowedSandboxes: ['apalmer'] }), 'apalmer');
  });

  it('workspaceSandboxCandidates uses profile slug and email', () => {
    const list = workspaceSandboxCandidates({
      workspaceSlug: 'kirkham',
      adobeEmail: 'kirkham@adobe.com',
      firstName: 'K',
      lastName: 'H',
    });
    assert.ok(list.includes('kirkham'));
  });

  it('validateRequestedSandboxes rejects sandboxes outside active Adobe list', () => {
    assert.throws(
      () => validateRequestedSandboxes(['other'], ['apalmer'], ['apalmer', 'kirkham']),
      /not an active Adobe sandbox/,
    );
  });

  it('validateRequestedSandboxes accepts any active sandbox when Adobe list present', () => {
    const out = validateRequestedSandboxes(['kirkham'], ['apalmer'], ['apalmer', 'kirkham']);
    assert.deepEqual(out, ['kirkham']);
  });

  it('validateSingleSandbox requires one sandbox', () => {
    const out = validateSingleSandbox('kirkham', ['apalmer'], ['apalmer', 'kirkham']);
    assert.equal(out, 'kirkham');
    assert.throws(() => validateSingleSandbox('', ['apalmer'], []), /sandbox is required/);
  });

  it('hashApiKey is stable sha256 hex', () => {
    const h = hashApiKey('test-key-material');
    assert.equal(h.length, 64);
    assert.equal(h, hashApiKey('test-key-material'));
  });

  it('keyIdFromApiKey matches MCP audit prefix', () => {
    const kid = keyIdFromApiKey('phase2-test-key');
    assert.equal(kid.length, 12);
  });

  it('timingSafeEqual compares strings', () => {
    assert.equal(timingSafeEqual('abc', 'abc'), true);
    assert.equal(timingSafeEqual('abc', 'abd'), false);
  });

  it('pickCurrentKey returns newest active key', () => {
    const { pickCurrentKey } = require('../mcpApiKeyStore');
    const current = pickCurrentKey([
      { keyId: 'a', revoked: false, createdAt: '2026-01-01T00:00:00.000Z' },
      { keyId: 'b', revoked: false, createdAt: '2026-06-01T00:00:00.000Z' },
      { keyId: 'c', revoked: true, createdAt: '2026-12-01T00:00:00.000Z' },
    ]);
    assert.equal(current.keyId, 'b');
  });

  it('pickKeyForSandbox returns key for matching sandbox only', () => {
    const keys = [
      { keyId: 'a', revoked: false, sandbox: 'apalmer', createdAt: '2026-01-01T00:00:00.000Z' },
      { keyId: 'b', revoked: false, sandbox: 'kirkham', createdAt: '2026-06-01T00:00:00.000Z' },
    ];
    assert.equal(pickKeyForSandbox(keys, 'kirkham').keyId, 'b');
    assert.equal(pickKeyForSandbox(keys, 'apalmer').keyId, 'a');
    assert.equal(pickKeyForSandbox(keys, 'other'), null);
  });

  it('pickKeyForSandbox returns the newest of multiple active keys in one sandbox', () => {
    const keys = [
      { keyId: 'older', revoked: false, sandbox: 'apalmer', createdAt: '2026-01-01T00:00:00.000Z' },
      { keyId: 'newer', revoked: false, sandbox: 'apalmer', createdAt: '2026-06-01T00:00:00.000Z' },
      { keyId: 'revoked', revoked: true, sandbox: 'apalmer', createdAt: '2026-12-01T00:00:00.000Z' },
    ];
    assert.equal(pickKeyForSandbox(keys, 'apalmer').keyId, 'newer');
  });

  it('countActiveKeysForSandbox counts only active keys in the requested sandbox', () => {
    const keys = [
      { revoked: false, sandbox: 'apalmer' },
      { revoked: false, allowedSandboxes: ['apalmer'] },
      { revoked: true, sandbox: 'apalmer' },
      { revoked: false, sandbox: 'kirkham' },
    ];
    assert.equal(countActiveKeysForSandbox(keys, 'apalmer'), 2);
    assert.equal(countActiveKeysForSandbox(keys, 'kirkham'), 1);
  });

  it('validateRequestedSandboxes accepts any sandbox for trusted lab user when no Adobe list', () => {
    const out = validateRequestedSandboxes(['prisacar'], [], null, { trustedLabUser: true });
    assert.deepEqual(out, ['prisacar']);
  });

  it('workspaceSandboxCandidates falls back to auth email', () => {
    const list = workspaceSandboxCandidates(null, { email: 'prisacar@adobe.com' });
    assert.ok(list.includes('prisacar'));
  });

  it('pickKeyForSandbox matches legacy allowedSandboxes', () => {
    const keys = [
      { keyId: 'legacy', revoked: false, allowedSandboxes: ['apalmer'], createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    assert.equal(pickKeyForSandbox(keys, 'apalmer').keyId, 'legacy');
  });
});

describe('registerMcpKeyRoutes', () => {
  it('registers labMcpKeys handler', () => {
    const { registerMcpKeyRoutes } = require('../mcpKeyRoutes');
    const onRequest = (_opts, handler) => ({ __handler: handler });
    const routes = registerMcpKeyRoutes({
      onRequest,
      CONSENT_STORE_FN_OPTS: { region: 'us-central1' },
      setCors: () => {},
      labUserSandboxStore: { verifyIdTokenFromRequest: async () => null },
      mcpApiKeyStore: require('../mcpApiKeyStore'),
      labWorkspaceAuthService: {},
      getAdobeAccessToken: async () => '',
      ADOBE_CLIENT_ID: { value: () => '' },
      ADOBE_IMS_ORG: { value: () => '' },
      sandboxesList: {},
    });
    assert.equal(typeof routes.labMcpKeys, 'object');
  });

  it('passes a key label through additional-key creation', async () => {
    const { registerMcpKeyRoutes } = require('../mcpKeyRoutes');
    const realStore = require('../mcpApiKeyStore');
    let createInput = null;
    const routes = registerMcpKeyRoutes({
      onRequest: (_opts, handler) => ({ __handler: handler }),
      CONSENT_STORE_FN_OPTS: { region: 'us-central1' },
      setCors: () => {},
      labUserSandboxStore: {
        verifyIdTokenFromRequest: async () => 'uid-1',
        getWorkspaceProfile: async () => ({ workspaceSlug: 'apalmer' }),
      },
      mcpApiKeyStore: {
        ...realStore,
        createKey: async (input) => {
          createInput = input;
          return {
            key: 'plaintext',
            keyId: '0123456789ab',
            keyPrefix: '01234567',
            sandbox: input.sandbox,
            allowedSandboxes: [input.sandbox],
            keyLabel: input.keyLabel,
            principalLabel: 'Test user',
            createdAt: '2026-07-23T00:00:00.000Z',
          };
        },
      },
      labWorkspaceAuthService: {
        getLabAccessStatusFromIdTokenRequest: async () => ({ status: 'approved' }),
      },
      getAdobeAccessToken: async () => '',
      ADOBE_CLIENT_ID: { value: () => '' },
      ADOBE_IMS_ORG: { value: () => '' },
      sandboxesList: {},
    });
    const response = { statusCode: 0, body: null };
    const res = {
      status(code) {
        response.statusCode = code;
        return this;
      },
      json(body) {
        response.body = body;
        return this;
      },
      send() {
        return this;
      },
    };
    await routes.labMcpKeys.__handler(
      {
        method: 'POST',
        path: '/api/lab/mcp-keys',
        url: '/api/lab/mcp-keys?sandbox=apalmer',
        query: { sandbox: 'apalmer' },
        body: { sandbox: 'apalmer', keyLabel: 'ChatGPT' },
        get: () => 'Bearer invalid-test-token',
      },
      res,
    );

    assert.equal(response.statusCode, 201);
    assert.equal(createInput.keyLabel, 'ChatGPT');
    assert.equal(response.body.keyLabel, 'ChatGPT');
  });
});
