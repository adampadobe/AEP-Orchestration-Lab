/**
 * Resolve Firebase uid for /api/snowflake/* from Bearer ID token or MCP API key.
 * Snowflake credentials are scoped per (labUserUid, sandbox) — MCP must map to principalUid.
 */

const labUserSandboxStore = require('./labUserSandboxStore');

const MCP_KEY_HEADER = 'x-aep-lab-mcp-key';

const SNOWFLAKE_OPS_KEY_ERROR =
  'Snowflake requires a user-generated MCP API key (Profile Viewer → MCP servers). ' +
  'Shared ops keys cannot resolve per-user Snowflake credentials.';

/**
 * @param {import('firebase-functions/v2/https').Request} req
 * @param {object} deps
 * @param {import('./mcpApiKeyStore')} deps.mcpApiKeyStore
 * @param {import('./labWorkspaceAuthService')} deps.labWorkspaceAuthService
 * @returns {Promise<{ ok: true, uid: string, authSource: 'firebase'|'mcp_key', principalEmail?: string | null, keySandbox?: string | null } | { ok: false, status: number, body: object }>}
 */
async function resolveSnowflakePrincipal(req, deps) {
  const { mcpApiKeyStore, labWorkspaceAuthService } = deps;

  const mcpKey = String(req.headers[MCP_KEY_HEADER] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();
  if (mcpKey) {
    const keyAuth = await mcpApiKeyStore.validateUserApiKey(mcpKey);
    if (!keyAuth.ok || !keyAuth.principalUid) {
      return {
        ok: false,
        status: 403,
        body: {
          ok: false,
          error: SNOWFLAKE_OPS_KEY_ERROR,
          code: 'MCP_USER_KEY_REQUIRED',
        },
      };
    }
    return {
      ok: true,
      uid: keyAuth.principalUid,
      authSource: 'mcp_key',
      principalEmail: keyAuth.principalEmail || null,
      keySandbox: keyAuth.sandbox || null,
    };
  }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        error: 'Firebase Auth or X-AEP-Lab-Mcp-Key required.',
        code: 'AUTH_REQUIRED',
      },
    };
  }

  const authHeader = String(req.get('authorization') || req.get('Authorization') || '');
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = bearer ? String(bearer[1] || '').trim() : '';
  if (idToken && labWorkspaceAuthService) {
    try {
      const access = await labWorkspaceAuthService.getLabAccessStatusFromIdTokenRequest({ idToken });
      const status = String(access && access.status || '');
      if (status !== 'approved' && status !== 'not_applicable') {
        return {
          ok: false,
          status: 403,
          body: {
            ok: false,
            error: 'Lab access must be approved before using Snowflake integration.',
            labAccessStatus: status,
          },
        };
      }
    } catch (e) {
      return {
        ok: false,
        status: Number(e && e.status) || 401,
        body: { ok: false, error: String(e && e.message ? e.message : e) },
      };
    }
  }

  return { ok: true, uid, authSource: 'firebase' };
}

module.exports = {
  MCP_KEY_HEADER,
  SNOWFLAKE_OPS_KEY_ERROR,
  resolveSnowflakePrincipal,
};
