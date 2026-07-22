'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  MCP_KEY_HEADER,
  SNOWFLAKE_OPS_KEY_ERROR,
  SNOWFLAKE_ANONYMOUS_ERROR,
  resolveSnowflakePrincipal,
} = require('../snowflakePrincipalAuth');

function mockReq(headers = {}) {
  return {
    headers,
    get() {
      return '';
    },
  };
}

describe('snowflakePrincipalAuth', () => {
  it('exports MCP key header constant', () => {
    assert.equal(MCP_KEY_HEADER, 'x-aep-lab-mcp-key');
  });

  it('resolves principalUid from valid MCP user key', async () => {
    const req = mockReq({ [MCP_KEY_HEADER]: 'user-key-abc' });
    const principal = await resolveSnowflakePrincipal(req, {
      mcpApiKeyStore: {
        validateUserApiKey: async (key) => {
          assert.equal(key, 'user-key-abc');
          return {
            ok: true,
            principalUid: 'firebase-uid-123',
            principalEmail: 'a@b.com',
            sandbox: 'apalmer',
          };
        },
      },
      labWorkspaceAuthService: null,
    });
    assert.equal(principal.ok, true);
    assert.equal(principal.uid, 'firebase-uid-123');
    assert.equal(principal.authSource, 'mcp_key');
  });

  it('rejects MCP key without principalUid (ops / invalid key)', async () => {
    const req = mockReq({ [MCP_KEY_HEADER]: 'ops-shared-key' });
    const principal = await resolveSnowflakePrincipal(req, {
      mcpApiKeyStore: {
        validateUserApiKey: async () => ({ ok: false }),
      },
      labWorkspaceAuthService: null,
    });
    assert.equal(principal.ok, false);
    assert.equal(principal.status, 403);
    assert.equal(principal.body.code, 'MCP_USER_KEY_REQUIRED');
    assert.match(principal.body.error, /user-generated MCP API key/);
    assert.equal(SNOWFLAKE_OPS_KEY_ERROR.includes('user-generated'), true);
  });

  it('rejects key with ok but empty principalUid', async () => {
    const req = mockReq({ [MCP_KEY_HEADER]: 'broken-key' });
    const principal = await resolveSnowflakePrincipal(req, {
      mcpApiKeyStore: {
        validateUserApiKey: async () => ({ ok: true, principalUid: '' }),
      },
      labWorkspaceAuthService: null,
    });
    assert.equal(principal.ok, false);
    assert.equal(principal.status, 403);
    assert.equal(principal.body.code, 'MCP_USER_KEY_REQUIRED');
  });

  it('rejects anonymous Firebase token with AUTH_PORTAL_LOGIN_REQUIRED', async () => {
    const req = mockReq({ authorization: 'Bearer anon-token' });
    const principal = await resolveSnowflakePrincipal(req, {
      mcpApiKeyStore: null,
      labWorkspaceAuthService: null,
      labUserSandboxStore: {
        verifyIdTokenClaimsFromRequest: async () => ({
          uid: 'anon-uid-abc',
          email: null,
          name: null,
          isAnonymous: true,
          signInProvider: 'anonymous',
        }),
      },
    });
    assert.equal(principal.ok, false);
    assert.equal(principal.status, 403);
    assert.equal(principal.body.code, 'AUTH_PORTAL_LOGIN_REQUIRED');
    assert.match(principal.body.error, /Portal sign-in/);
    assert.equal(SNOWFLAKE_ANONYMOUS_ERROR.includes('Portal sign-in'), true);
  });

  it('accepts authenticated Portal Firebase token', async () => {
    const req = mockReq({ authorization: 'Bearer portal-token' });
    const principal = await resolveSnowflakePrincipal(req, {
      mcpApiKeyStore: null,
      labWorkspaceAuthService: {
        getLabAccessStatusFromIdTokenRequest: async () => ({ status: 'approved' }),
      },
      labUserSandboxStore: {
        verifyIdTokenClaimsFromRequest: async () => ({
          uid: 'auth-uid-999',
          email: 'apalmer@adobe.com',
          name: 'Adam Palmer',
          isAnonymous: false,
          signInProvider: 'password',
        }),
      },
    });
    assert.equal(principal.ok, true);
    assert.equal(principal.uid, 'auth-uid-999');
    assert.equal(principal.principalEmail, 'apalmer@adobe.com');
    assert.equal(principal.authSource, 'firebase');
  });
});
