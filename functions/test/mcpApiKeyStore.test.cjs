'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSandboxList,
  normalizeSandboxName,
  deriveSandboxFromKeyData,
  workspaceSandboxCandidates,
  validateRequestedSandboxes,
  validateSingleSandbox,
  hashApiKey,
  keyIdFromApiKey,
  timingSafeEqual,
  pickKeyForSandbox,
} = require('../mcpApiKeyStore');

describe('mcpApiKeyStore', () => {
  it('normalizeSandboxList dedupes and lowercases', () => {
    assert.deepEqual(normalizeSandboxList(['Apalmer', 'apalmer', 'kirkham']), ['apalmer', 'kirkham']);
  });

  it('normalizeSandboxName returns single lowercase sandbox', () => {
    assert.equal(normalizeSandboxName('Kirkham'), 'kirkham');
    assert.equal(normalizeSandboxName(''), '');
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
});
