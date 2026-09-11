'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');

function errorStatus(error) {
  const status = Number(error?.status);
  return status >= 400 && status <= 599 ? status : 500;
}

function registerAdobeApiCapabilityRoutes(deps) {
  const { onRequest, profileFnOpts, setCors, mcpApiKeyStore, capabilityService } = deps;
  const adobeApiCapabilitiesProxy = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'GET') return res.status(405).set('Allow', 'GET').json({ ok: false, error: 'Use GET.' });

    let principal;
    try { principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore); }
    catch (error) {
      return res.status(500).json({ ok: false, error: 'MCP key validation failed.', detail: String(error.message || error) });
    }
    if (!principal.ok) return res.status(principal.status).json(principal.body);

    const sandbox = String(req.query.sandbox || principal.sandbox || '').trim().toLowerCase();
    if (sandbox !== String(principal.sandbox).trim().toLowerCase()) {
      return res.status(403).json({ ok: false, error: `This MCP key is scoped to sandbox "${principal.sandbox}", not "${sandbox}".` });
    }

    const action = String(req.query.action || 'catalog').trim().toLowerCase();
    try {
      if (action === 'catalog') return res.status(200).json(capabilityService.catalog());
      if (action === 'ajo_addresses') {
        return res.status(200).json(await capabilityService.listAjoAddresses({
          sandbox, type: req.query.type, limit: req.query.limit,
        }));
      }
      if (action === 'genstudio_experiences') {
        return res.status(200).json(await capabilityService.listGenstudioExperiences({
          limit: req.query.limit, cursor: req.query.cursor, channel: req.query.channel, language: req.query.language,
        }));
      }
      return res.status(400).json({ ok: false, error: 'Unknown Adobe capability action.' });
    } catch (error) {
      return res.status(errorStatus(error)).json({
        ok: false,
        error: String(error.message || error),
        platformStatus: Number(error.status) || null,
        platformResponse: error.platformResponse || null,
      });
    }
  });
  return { adobeApiCapabilitiesProxy };
}

module.exports = { registerAdobeApiCapabilityRoutes };
