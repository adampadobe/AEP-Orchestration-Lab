'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');
const { buildLoyaltyReadRequest } = require('./ajoLoyaltyService');

function registerAjoLoyaltyRoutes(deps) {
  const { onRequest, profileFnOpts, setCors, mcpApiKeyStore, getAdobeAccessToken, aepHeaders, ADOBE_IMS_ORG, loyaltyService } = deps;
  const ajoLoyaltyProxy = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'GET') return res.status(405).set('Allow', 'GET, OPTIONS').json({ ok: false, error: 'Use GET. Loyalty mutations are not supported.' });

    let principal;
    try { principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore, deps); }
    catch { return res.status(500).json({ ok: false, error: 'MCP principal validation failed.' }); }
    if (!principal.ok) return res.status(principal.status).json(principal.body);

    const query = req.query || {};
    const sandbox = query.sandbox === undefined ? principal.sandbox : query.sandbox;
    if (typeof sandbox !== 'string' || sandbox !== String(principal.sandbox).toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'Sandbox does not match the authenticated principal scope.' });
    }
    if (req.headers['x-gw-ims-org-id'] && req.headers['x-gw-ims-org-id'] !== ADOBE_IMS_ORG.value()) {
      return res.status(403).json({ ok: false, error: 'Adobe organisation does not match the configured platform organisation.' });
    }
    const input = { ...query, sandbox };
    try { buildLoyaltyReadRequest(input); }
    catch (error) { return res.status(400).json({ ok: false, error: error.message }); }

    let headers;
    try {
      headers = { ...aepHeaders(await getAdobeAccessToken()), 'x-sandbox-name': sandbox };
    } catch {
      return res.status(502).json({ ok: false, error: 'Server-side Adobe authentication failed.' });
    }
    try {
      return res.status(200).json(await loyaltyService.read(headers, input));
    } catch (error) {
      const status = Number(error.status);
      return res.status(status >= 400 && status <= 599 ? status : 502).json({
        ok: false,
        error: error.message || 'Adobe Loyalty read failed.',
        platform_status: error.platformStatus ?? null,
        platform_response: error.platformResponse ?? null,
      });
    }
  });
  return { ajoLoyaltyProxy };
}

module.exports = { registerAjoLoyaltyRoutes };
