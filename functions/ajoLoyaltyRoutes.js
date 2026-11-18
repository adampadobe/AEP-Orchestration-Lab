'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');
const { buildLoyaltyReadRequest, buildLoyaltySignupRequest } = require('./ajoLoyaltyService');
const labUserSandboxStore = require('./labUserSandboxStore');
const profileTableHelpers = require('./profileTableHelpers');
const { logFunctionEvent, requestCorrelationId } = require('./functionRequestLog');

async function resolveLoyaltyPrincipal(req, deps) {
  if (req.headers['x-aep-lab-mcp-key'] || req.headers['x-gw-ims-org-id']) {
    return resolveMcpAudiencePrincipal(req, deps.mcpApiKeyStore, deps);
  }
  const claims = await (deps.labUserSandboxStore || labUserSandboxStore).verifyIdTokenClaimsFromRequest(req);
  if (!claims) return { ok: false, status: 401, body: { ok: false, error: 'Sign in to the Portal before reading Loyalty state.' } };
  if (!claims.uid || claims.isAnonymous || typeof claims.email !== 'string' || !claims.email.endsWith('@adobe.com')) {
    return { ok: false, status: 403, body: { ok: false, error: 'Loyalty requires your signed-in Adobe Portal account.' } };
  }
  const sandbox = req.query?.sandbox;
  if (typeof sandbox !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(sandbox)) {
    return { ok: false, status: 400, body: { ok: false, error: 'Select a valid sandbox.' } };
  }
  const keys = await deps.mcpApiKeyStore.listKeysForUser(claims.uid);
  if (!keys.some(key => key.revoked === false && key.sandbox === sandbox)) {
    return { ok: false, status: 403, body: { ok: false,
      error: 'No active Portal enrollment for this sandbox. Create a sandbox-scoped key in MCP servers; do not paste it into this page.' } };
  }
  return { ok: true, sandbox, principalUid: claims.uid };
}

function registerAjoLoyaltyRoutes(deps) {
  const { onRequest, profileFnOpts, setCors, mcpApiKeyStore, getAdobeAccessToken, aepHeaders, ADOBE_IMS_ORG, loyaltyService } = deps;
  const ajoLoyaltyProxy = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'GET, POST, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).set('Allow', 'GET, POST, OPTIONS').json({ ok: false, error: 'Use GET for reads or POST for confirmed single-challenge signup.' });
    const signup = req.method === 'POST';
    if (signup && (req.headers['x-aep-lab-mcp-key'] || req.headers['x-gw-ims-org-id'])) {
      return res.status(403).json({ ok: false, error: 'Loyalty MCP access remains read-only. Signup requires your signed-in Portal account.' });
    }
    if (signup && String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      return res.status(415).json({ ok: false, error: 'Signup requires application/json.' });
    }

    let principal;
    try { principal = await resolveLoyaltyPrincipal(req, { ...deps, mcpApiKeyStore }); }
    catch { return res.status(500).json({ ok: false, error: 'Loyalty principal validation failed.' }); }
    if (!principal.ok) return res.status(principal.status).json(principal.body);

    const query = req.query || {};
    const sandbox = query.sandbox === undefined ? principal.sandbox : query.sandbox;
    if (typeof sandbox !== 'string' || sandbox !== String(principal.sandbox).toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'Sandbox does not match the authenticated principal scope.' });
    }
    if (req.headers['x-gw-ims-org-id'] && req.headers['x-gw-ims-org-id'] !== ADOBE_IMS_ORG.value()) {
      return res.status(403).json({ ok: false, error: 'Adobe organisation does not match the configured platform organisation.' });
    }
    const input = signup ? { ...req.body, sandbox } : { ...query, sandbox };
    try {
      if (signup) {
        if (Object.keys(query).some(key => key !== 'sandbox') || req.body?.sandbox !== undefined) throw new Error('Signup sandbox belongs in the scoped query only.');
        buildLoyaltySignupRequest(input);
      } else buildLoyaltyReadRequest(input);
    }
    catch (error) { return res.status(400).json({ ok: false, error: error.message }); }

    let headers, accessToken;
    try {
      accessToken = await getAdobeAccessToken();
      headers = { ...aepHeaders(accessToken), 'x-sandbox-name': sandbox };
    } catch {
      return res.status(502).json({ ok: false, error: 'Server-side Adobe authentication failed.' });
    }
    try {
      if (!signup) return res.status(200).json(await loyaltyService.read(headers, input));
      const config = await loyaltyService.read(headers, { action: 'config', sandbox });
      if (config.data.namespace?.toLowerCase() !== 'loyaltyid') {
        return res.status(409).json({ ok: false, error: 'This demo signup requires the configured Loyalty member namespace to be loyaltyId. No signup submitted.' });
      }
      const helpers = deps.profileTableHelpers || profileTableHelpers;
      const ups = await helpers.fetchUpsProfileEntities(input.profile_id, sandbox, accessToken,
        headers['x-api-key'], headers['x-gw-ims-org-id'], 'loyaltyid', { strictRead: true });
      const keys = Object.keys(ups || {}).filter(key => !key.startsWith('_'));
      const entity = keys.length === 1 ? (ups[keys[0]]?.entity || ups[keys[0]]) : null;
      const markers = entity && ['testProfile', 'xdm:testProfile'].filter(key => Object.hasOwn(entity, key)).map(key => entity[key]);
      const ids = entity && Object.entries(entity).filter(([key]) => /^_[A-Za-z]/.test(key))
        .map(([, value]) => value?.identification?.core?.loyaltyId).filter(value => typeof value === 'string' && value.trim());
      if (!markers?.length || markers.some(value => value !== true) || !ids?.length ||
          ids.some(id => id !== input.profile_id)) {
        return res.status(403).json({ ok: false, error: 'Signup requires one verified AEP test profile with the exact scalar Loyalty ID. No signup submitted.' });
      }
      const correlationId = requestCorrelationId(req);
      logFunctionEvent('INFO', 'loyalty.signup.submitting', { correlationId, sandbox, challengeId: input.challenge_id, principalUid: principal.principalUid });
      const result = await loyaltyService.signup(headers, input);
      logFunctionEvent('INFO', 'loyalty.signup.accepted', { correlationId, sandbox, challengeId: input.challenge_id });
      return res.status(200).json(result);
    } catch (error) {
      const status = Number(error.status);
      return res.status(status >= 400 && status <= 599 ? status : 502).json({
        ok: false,
        error: error.message || (signup ? 'Adobe Loyalty signup failed. Read member state before another attempt.' : 'Adobe Loyalty read failed.'),
        platform_status: error.platformStatus ?? null,
        platform_response: error.platformResponse ?? null,
      });
    }
  });
  return { ajoLoyaltyProxy };
}

module.exports = { registerAjoLoyaltyRoutes };
