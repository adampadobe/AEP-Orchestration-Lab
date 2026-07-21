'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  MCP_KEY_HEADER,
  SNOWFLAKE_OPS_KEY_ERROR,
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
});
