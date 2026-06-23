/**
 * Resolve Firebase uid for /api/lab/generation-prefs* from Bearer ID token or MCP API key.
 */

const labUserSandboxStore = require('./labUserSandboxStore');
const mcpApiKeyStore = require('./mcpApiKeyStore');

const MCP_KEY_HEADER = 'x-aep-lab-mcp-key';

/**
 * @param {import('firebase-functions/v2/https').Request} req
 * @param {object} deps
 * @param {import('./labWorkspaceAuthService')} deps.labWorkspaceAuthService
 * @returns {Promise<{ ok: true, uid: string, authSource: 'firebase'|'mcp_key' } | { ok: false, status: number, body: object }>}
 */
async function resolveGenerationPrefsPrincipal(req, deps) {
  const { labWorkspaceAuthService } = deps;

  const mcpKey = String(req.headers[MCP_KEY_HEADER] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();
  if (mcpKey) {
    const keyAuth = await mcpApiKeyStore.validateUserApiKey(mcpKey);
    if (!keyAuth.ok || !keyAuth.principalUid) {
      return {
        ok: false,
        status: 403,
        body: { ok: false, error: 'Invalid or revoked MCP API key.' },
      };
    }
    return { ok: true, uid: keyAuth.principalUid, authSource: 'mcp_key' };
  }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: 'Firebase Auth or X-AEP-Lab-Mcp-Key required.' },
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
            error: 'Lab access must be approved before using profile generation prefs.',
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
  resolveGenerationPrefsPrincipal,
};
