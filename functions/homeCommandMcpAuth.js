/**
 * Resolve Firebase uid + RTDB workspace slug for /api/home-command/mcp/* from
 * a Bearer ID token or an MCP API key (x-aep-lab-mcp-key) — lets an external
 * LLM read/update the caller's own Solutions Consultant Command Centre data
 * without going through the browser, using the same self-service MCP keys
 * issued at /api/lab/mcp-keys (see mcpApiKeyStore.js).
 */

const admin = require('firebase-admin');
const labUserSandboxStore = require('./labUserSandboxStore');
const { ldapSlugFromEmail, normalizeLdapSlug } = require('./labRtdbSlug');

const MCP_KEY_HEADER = 'x-aep-lab-mcp-key';

const OPS_KEY_ERROR =
  'Command Centre MCP access requires a user-generated MCP API key (Profile Viewer → MCP servers). ' +
  'Shared ops keys cannot resolve per-user workspace data.';

const ANONYMOUS_ERROR =
  'Command Centre MCP access requires Portal sign-in with your Adobe @adobe.com account. ' +
  'Anonymous browser auth cannot resolve your own workspace.';

function getRtdb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
}

/**
 * Mirrors the client's resolveWorkspaceSlug() priority order exactly (RTDB
 * owner record → Firestore workspace profile → deterministic email-derived
 * slug), so an MCP-driven write lands in the SAME bucket the browser reads.
 */
async function resolveWorkspaceSlugForUid(uid, email) {
  try {
    const snap = await getRtdb().ref('userWorkspaceOwners/' + uid).once('value');
    const fromOwner = normalizeLdapSlug(snap.val());
    if (fromOwner) return fromOwner;
  } catch (_e) {
    // fall through to the next source
  }

  try {
    const profile = await labUserSandboxStore.getWorkspaceProfile(uid);
    const fromProfile = normalizeLdapSlug(profile && profile.workspaceSlug);
    if (fromProfile) return fromProfile;
  } catch (_e) {
    // fall through to the next source
  }

  return ldapSlugFromEmail(email);
}

/**
 * @param {import('firebase-functions/v2/https').Request} req
 * @param {object} deps
 * @param {import('./mcpApiKeyStore')} deps.mcpApiKeyStore
 * @returns {Promise<{ ok: true, uid: string, workspaceSlug: string, authSource: 'firebase'|'mcp_key', principalEmail?: string | null } | { ok: false, status: number, body: object }>}
 */
async function resolveHomeCommandPrincipal(req, deps) {
  const { mcpApiKeyStore } = deps;
  const userStore = deps.labUserSandboxStore || labUserSandboxStore;

  const mcpKey = String(req.headers[MCP_KEY_HEADER] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();
  if (mcpKey) {
    const keyAuth = await mcpApiKeyStore.validateUserApiKey(mcpKey);
    if (!keyAuth.ok || !keyAuth.principalUid) {
      return {
        ok: false,
        status: 403,
        body: { ok: false, error: OPS_KEY_ERROR, code: 'MCP_USER_KEY_REQUIRED' },
      };
    }
    const workspaceSlug = await resolveWorkspaceSlugForUid(keyAuth.principalUid, keyAuth.principalEmail);
    return {
      ok: true,
      uid: keyAuth.principalUid,
      workspaceSlug,
      authSource: 'mcp_key',
      principalEmail: keyAuth.principalEmail || null,
    };
  }

  const claims = await userStore.verifyIdTokenClaimsFromRequest(req);
  if (!claims || !claims.uid) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: 'Firebase Auth or X-AEP-Lab-Mcp-Key required.', code: 'AUTH_REQUIRED' },
    };
  }
  if (claims.isAnonymous) {
    return {
      ok: false,
      status: 403,
      body: { ok: false, error: ANONYMOUS_ERROR, code: 'AUTH_PORTAL_LOGIN_REQUIRED' },
    };
  }

  const workspaceSlug = await resolveWorkspaceSlugForUid(claims.uid, claims.email);
  return {
    ok: true,
    uid: claims.uid,
    workspaceSlug,
    authSource: 'firebase',
    principalEmail: claims.email || null,
  };
}

module.exports = {
  MCP_KEY_HEADER,
  OPS_KEY_ERROR,
  ANONYMOUS_ERROR,
  resolveWorkspaceSlugForUid,
  resolveHomeCommandPrincipal,
};
