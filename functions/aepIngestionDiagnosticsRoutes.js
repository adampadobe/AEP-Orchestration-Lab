'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');

function registerAepIngestionDiagnosticsRoutes(deps) {
  const {
    onRequest, profileFnOpts, setCors, mcpApiKeyStore, getAdobeAccessToken,
    ADOBE_CLIENT_ID, ADOBE_IMS_ORG, ingestionDiagnosticsService: service,
  } = deps;
  const aepIngestionDiagnosticsProxy = onRequest({ ...profileFnOpts, timeoutSeconds: 300 }, async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    res.set('Cache-Control', 'private, no-store');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'GET') return res.status(405).set('Allow', 'GET, OPTIONS').json({ ok: false, error: 'Use GET.' });
    try {
      const principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore, deps);
      if (!principal.ok) return res.status(principal.status).json(principal.body);
      const input = req.query || {};
      const sandbox = String(input.sandbox || principal.sandbox || '').trim().toLowerCase();
      if (!sandbox || sandbox !== String(principal.sandbox).trim().toLowerCase()) {
        return res.status(403).json({ ok: false, error: 'Sandbox does not match the authenticated principal scope.' });
      }
      const orgId = ADOBE_IMS_ORG.value();
      if (req.headers['x-gw-ims-org-id'] && req.headers['x-gw-ims-org-id'] !== orgId) {
        return res.status(403).json({ ok: false, error: 'Adobe organisation does not match the configured organisation.' });
      }
      if (!['batch_diagnose', 'flow_run_status'].includes(input.action)) {
        return res.status(400).json({ ok: false, error: 'Unsupported diagnostics action.' });
      }
      const auth = { token: await getAdobeAccessToken(), clientId: ADOBE_CLIENT_ID.value(), orgId, sandbox };
      const payload = input.action === 'batch_diagnose'
        ? await service.batchDiagnose(auth, input) : await service.flowRunStatus(auth, input);
      return res.status(200).json(payload);
    } catch (error) {
      const status = Number(error.status) >= 400 && Number(error.status) <= 599 ? Number(error.status) : 500;
      console.error('[aepIngestionDiagnostics] request failed', { status, action: req.query?.action });
      return res.status(status).json({ ok: false, error: String(error.message || error), platform_response: error.platformResponse ?? null });
    }
  });
  return { aepIngestionDiagnosticsProxy };
}

module.exports = { registerAepIngestionDiagnosticsRoutes };
