/**
 * Self-service MCP API key routes — POST/GET/DELETE /api/lab/mcp-keys
 */

/**
 * @param {object} deps
 * @returns {Record<string, import('firebase-functions/v2/https').HttpsFunction>}
 */
function registerMcpKeyRoutes(deps) {
  const {
    onRequest,
    CONSENT_STORE_FN_OPTS,
    setCors,
    labUserSandboxStore,
    mcpApiKeyStore,
    labWorkspaceAuthService,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    sandboxesList,
  } = deps;

  const routes = {};

  async function requireApprovedLabUser(req) {
    const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
    if (!uid) {
      return { error: { status: 401, body: { ok: false, error: 'Firebase Auth required (lab sign-in).' } } };
    }

    const authHeader = String(req.get('authorization') || req.get('Authorization') || '');
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = bearer ? String(bearer[1] || '').trim() : '';
    try {
      const access = await labWorkspaceAuthService.getLabAccessStatusFromIdTokenRequest({ idToken });
      const status = String(access && access.status || '');
      if (status !== 'approved' && status !== 'not_applicable') {
        return {
          error: {
            status: 403,
            body: {
              ok: false,
              error: 'Lab access must be approved before generating MCP API keys.',
              labAccessStatus: status,
            },
          },
        };
      }
    } catch (e) {
      return {
        error: {
          status: Number(e && e.status) || 401,
          body: { ok: false, error: String(e && e.message ? e.message : e) },
        },
      };
    }

    let email = '';
    let displayName = '';
    try {
      const admin = require('firebase-admin');
      if (!admin.apps.length) admin.initializeApp();
      const dec = await admin.auth().verifyIdToken(idToken);
      email = String(dec.email || '').trim();
      displayName = String(dec.name || dec.email || '').trim();
    } catch (_e) {
      /* optional */
    }

    return { uid, email, displayName };
  }

  async function fetchActiveSandboxNames() {
    if (!getAdobeAccessToken || !sandboxesList) return [];
    try {
      const token = await getAdobeAccessToken();
      const clientId = ADOBE_CLIENT_ID && typeof ADOBE_CLIENT_ID.value === 'function'
        ? ADOBE_CLIENT_ID.value()
        : '';
      const orgId = ADOBE_IMS_ORG && typeof ADOBE_IMS_ORG.value === 'function'
        ? ADOBE_IMS_ORG.value()
        : '';
      if (!token || !clientId || !orgId) return [];
      const list = await sandboxesList.listActiveSandboxes(token, clientId, orgId);
      return list.map((s) => String(s.name || '').toLowerCase()).filter(Boolean);
    } catch (_e) {
      return [];
    }
  }

  routes.labMcpKeys = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
    setCors(res, 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const authResult = await requireApprovedLabUser(req);
    if (authResult.error) {
      res.status(authResult.error.status).json(authResult.error.body);
      return;
    }
    const { uid, email, displayName } = authResult;

    if (req.method === 'GET') {
      try {
        const keys = await mcpApiKeyStore.listKeysForUser(uid);
        const currentKey = mcpApiKeyStore.pickCurrentKey(keys);
        const profile = await labUserSandboxStore.getWorkspaceProfile(uid);
        const allowedSandboxes = mcpApiKeyStore.workspaceSandboxCandidates(profile);
        res.status(200).json({
          ok: true,
          keys,
          currentKey,
          allowedSandboxes,
          maxActiveKeys: mcpApiKeyStore.MAX_ACTIVE_KEYS_PER_USER,
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e) });
      }
      return;
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rawPath = String(req.path || req.url || '').split('?')[0];
      const action = String(
        body.action ||
        (req.query && req.query.action) ||
        (rawPath.endsWith('/rotate') ? 'rotate' : ''),
      ).trim().toLowerCase();
      const rotateKeyId = String(
        body.keyId || (req.query && req.query.keyId) || '',
      ).trim();

      if (action === 'rotate') {
        if (!rotateKeyId) {
          res.status(400).json({ ok: false, error: 'keyId is required for rotate' });
          return;
        }
        try {
          const rotated = await mcpApiKeyStore.rotateKey(uid, rotateKeyId);
          res.status(200).json({
            ok: true,
            key: rotated.key,
            keyId: rotated.keyId,
            keyPrefix: rotated.keyPrefix,
            allowedSandboxes: rotated.allowedSandboxes,
            rotatedAt: rotated.rotatedAt,
            warning: 'Copy this key now. The previous key no longer works.',
          });
        } catch (e) {
          const status = Number(e && e.status) || 400;
          res.status(status).json({ ok: false, error: String(e.message || e) });
        }
        return;
      }

      const sandboxes = Array.isArray(body.sandboxes) ? body.sandboxes : [];
      try {
        const profile = await labUserSandboxStore.getWorkspaceProfile(uid);
        const activeSandboxNames = await fetchActiveSandboxNames();
        const created = await mcpApiKeyStore.createKey({
          uid,
          email,
          displayName,
          sandboxes,
          profile,
          activeSandboxNames,
        });
        res.status(201).json({
          ok: true,
          key: created.key,
          keyId: created.keyId,
          keyPrefix: created.keyPrefix,
          allowedSandboxes: created.allowedSandboxes,
          principalLabel: created.principalLabel,
          createdAt: created.createdAt,
          warning: 'Copy this key now. It will not be shown again.',
        });
      } catch (e) {
        const status = Number(e && e.status) || 400;
        res.status(status).json({ ok: false, error: String(e.message || e) });
      }
      return;
    }

    if (req.method === 'DELETE') {
      const keyId = String(
        (req.query && req.query.keyId) ||
        (req.body && req.body.keyId) ||
        '',
      ).trim();
      if (!keyId) {
        res.status(400).json({ ok: false, error: 'keyId query parameter or body field is required' });
        return;
      }
      try {
        const result = await mcpApiKeyStore.revokeKey(uid, keyId);
        res.status(200).json({ ok: true, ...result });
      } catch (e) {
        const status = Number(e && e.status) || 400;
        res.status(status).json({ ok: false, error: String(e.message || e) });
      }
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  });

  return routes;
}

module.exports = { registerMcpKeyRoutes };
