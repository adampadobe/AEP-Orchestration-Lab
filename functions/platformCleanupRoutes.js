'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');
const { validateTarget } = require('./platformCleanupService');

function registerPlatformCleanupRoutes(deps) {
  const {
    onRequest, profileFnOpts, setCors, getAdobeAccessToken, ADOBE_CLIENT_ID, ADOBE_IMS_ORG,
    mcpApiKeyStore, platformCleanupService: service, platformCleanupStore: store,
  } = deps;
  const platformCleanupProxy = onRequest({ ...profileFnOpts, timeoutSeconds: 300 }, async (req, res) => {
    setCors(res, 'GET, DELETE, OPTIONS');
    res.set('Cache-Control', 'private, no-store');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!['GET', 'DELETE'].includes(req.method)) return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    try {
      const principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore, deps);
      if (!principal.ok) return res.status(principal.status).json(principal.body);
      const input = req.method === 'GET' ? (req.query || {}) : (req.body || {});
      const sandbox = String(input.sandbox || principal.sandbox).toLowerCase();
      if (sandbox !== String(principal.sandbox).toLowerCase()
          || (req.query?.sandbox && String(req.query.sandbox).toLowerCase() !== sandbox)) {
        return res.status(403).json({ ok: false, error: 'Sandbox does not match the authenticated principal scope.' });
      }
      const orgId = ADOBE_IMS_ORG.value();
      if (req.headers['x-gw-ims-org-id'] && req.headers['x-gw-ims-org-id'] !== orgId) {
        return res.status(403).json({ ok: false, error: 'Adobe organisation does not match the configured platform organisation.' });
      }
      const type = input.resource_type;
      if (!['dataset', 'schema'].includes(type)) {
        return res.status(400).json({ ok: false, error: 'resource_type must be dataset or schema.' });
      }
      const id = input.resource_id;
      if (id || req.method === 'DELETE') validateTarget(type, id);
      if (req.method === 'DELETE' && (input.confirmed !== true || input.usage_cleared !== true
          || typeof input.expected_name !== 'string' || !input.expected_name
          || !/^[a-f0-9-]{36}$/i.test(input.audit_id || ''))) {
        return res.status(400).json({ ok: false, error: 'Exact resource_id, expected_name, audit_id, confirmed=true and usage_cleared=true are required.' });
      }
      if (input.name !== undefined && (typeof input.name !== 'string' || input.name.length > 200)) {
        return res.status(400).json({ ok: false, error: 'name must be a string of at most 200 characters.' });
      }
      const auth = { token: await getAdobeAccessToken(), clientId: ADOBE_CLIENT_ID.value(), orgId, sandbox };
      const scope = { principalUid: principal.principalUid, orgId, sandbox, resource_type: type, resource_id: id };
      let payload;
      if (req.method === 'GET' && !id) {
        payload = await service.list(auth, input);
      } else if (req.method === 'GET') {
        const audit = await service.audit(auth, input);
        const ticket = audit.deleteReviewReady
          ? await store.saveAudit({ ...scope, expected_name: audit.resource.name, fingerprint: audit.fingerprint }) : null;
        const { fingerprint: _fingerprint, etag: _etag, ...review } = audit;
        payload = {
          ...review,
          confirmation: ticket ? { ...ticket, ...scope, principalUid: undefined, expected_name: audit.resource.name,
            instruction: 'Obtain explicit confirmation of this exact resource and independently clear downstream usage before deletion.' } : null,
        };
      } else {
        const approved = await store.consumeAudit(input.audit_id, { ...scope, expected_name: input.expected_name });
        payload = await service.remove(auth, input, approved);
      }
      console.info('[platformCleanup]', {
        principalUid: principal.principalUid, sandbox, orgId, type, id: id || null, method: req.method, result: 'ok',
      });
      return res.status(200).json({ ok: true, sandbox, orgId, ...payload });
    } catch (error) {
      console.error('[platformCleanup] failed', {
        method: req.method, status: error.status || 500, message: error.message,
        ...(error.detail?.reason ? {
          inventory: error.detail.inventory, page: error.detail.page, reason: error.detail.reason,
        } : {}),
      });
      const status = error.status >= 400 && error.status <= 599 ? error.status : 500;
      return res.status(status).json({ ok: false, error: error.message, detail: error.detail || null });
    }
  });
  return { platformCleanupProxy };
}

module.exports = { registerPlatformCleanupRoutes };
