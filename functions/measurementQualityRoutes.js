'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');

function statusOf(error) {
  const status = Number(error?.status);
  return status >= 400 && status <= 599 ? status : 500;
}

function registerMeasurementQualityRoutes(deps) {
  const { onRequest, profileFnOpts, setCors, mcpApiKeyStore, measurementService } = deps;
  const measurementQualityProxy = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'GET') return res.status(405).set('Allow', 'GET').json({ ok: false, error: 'Use GET.' });

    let principal;
    try { principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore); }
    catch (_error) { return res.status(500).json({ ok: false, error: 'MCP principal validation failed.' }); }
    if (!principal.ok) return res.status(principal.status).json(principal.body);

    const sandbox = String(req.query.sandbox || principal.sandbox || '').trim().toLowerCase();
    if (sandbox !== String(principal.sandbox).trim().toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'The requested sandbox is outside this MCP principal.' });
    }

    const action = String(req.query.action || '').trim().toLowerCase();
    try {
      if (action === 'assurance_sessions') return res.status(200).json(await measurementService.listAssuranceSessions(req.query));
      if (action === 'assurance_events') return res.status(200).json(await measurementService.inspectAssuranceEvents(req.query));
      if (action === 'launch_property_audit') return res.status(200).json(await measurementService.auditLaunchProperties(req.query));
      if (action === 'launch_environments') return res.status(200).json(await measurementService.listLaunchEnvironments(req.query));
      if (action === 'status_incidents') {
        return res.status(200).json(await measurementService.correlateStatusIncidents({
          ...req.query,
          product_ids: req.query.product_ids ? String(req.query.product_ids).split(',') : [],
          keywords: req.query.keywords ? String(req.query.keywords).split(',') : [],
        }));
      }
      return res.status(400).json({ ok: false, error: 'Unknown measurement quality action.' });
    } catch (error) {
      return res.status(statusOf(error)).json({ ok: false, error: String(error.message || error) });
    }
  });
  return { measurementQualityProxy };
}

module.exports = { registerMeasurementQualityRoutes };
