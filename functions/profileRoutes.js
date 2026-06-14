/**
 * Profile-related Cloud Function handlers extracted from index.js (Phase B).
 * Industry infra/status/connection routes use createProfileIndustryRoutes;
 * larger proxies (profileUpdateProxy, profileGenerateProxy, …) remain in
 * index.js until a follow-up pass.
 */

const { createProfileIndustryRoutes } = require('./createProfileIndustryRoutes');

/**
 * @param {object} deps Shared context from index.js
 * @returns {Record<string, import('firebase-functions/v2/https').HttpsFunction>}
 */
function registerProfileRoutes(deps) {
  const {
    onRequest,
    REGION,
    PROFILE_FN_SECRETS,
    RESOLVED_ADOBE_SANDBOX,
    profileFnOpts,
    setCors,
    resolveSandboxFromQuery,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    profileTableHelpers,
    ipadEventProxy,
    industryAttributeMap,
    profileInfraStatusAllSvc,
    genericProfileInfraService,
    travelProfileInfraService,
    fsiProfileInfraService,
    telecomProfileInfraService,
    retailProfileInfraService,
    mediaProfileInfraService,
    sportsProfileInfraService,
    genericProfileConnectionStore,
    travelProfileConnectionStore,
    fsiProfileConnectionStore,
    telecomProfileConnectionStore,
    retailProfileConnectionStore,
    mediaProfileConnectionStore,
    sportsProfileConnectionStore,
    consentFlowLookup,
    serializeFirestoreRecord,
    CONSENT_STORE_FN_OPTS,
  } = deps;

  const routes = {};

  routes.profileTableProxy = onRequest(
    {
      region: REGION,
      secrets: PROFILE_FN_SECRETS,
      environmentVariables: {
        ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
      },
      invoker: 'public',
      timeoutSeconds: 90,
      memory: '512MiB',
    },
    async (req, res) => {
      setCors(res);
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      const identifier = String(req.query.identifier || req.query.email || '').trim();
      const namespace = String(req.query.namespace || 'email').trim().toLowerCase();
      const sandbox = resolveSandboxFromQuery(req);
      if (!identifier) {
        res.status(400).json({ error: 'Missing identifier. Use ?identifier=…&namespace=email|ecid|crmId|loyaltyId|phone' });
        return;
      }
      let accessToken;
      try {
        accessToken = await getAdobeAccessToken();
      } catch (e) {
        res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
        return;
      }
      const clientId = ADOBE_CLIENT_ID.value();
      const orgId = ADOBE_IMS_ORG.value();
      try {
        const ups = await profileTableHelpers.fetchUpsProfileEntities(identifier, sandbox, accessToken, clientId, orgId, namespace);
        const payload = profileTableHelpers.buildProfileTablePayload(identifier, ups);
        try {
          const statusAllPayload = await profileInfraStatusAllSvc.runProfileInfraStatusAll({
            sandbox,
            token: accessToken,
            clientId,
            orgId,
            services: {
              generic: genericProfileInfraService,
              travel: travelProfileInfraService,
              fsi: fsiProfileInfraService,
              telecom: telecomProfileInfraService,
              retail: retailProfileInfraService,
              media: mediaProfileInfraService,
              sports: sportsProfileInfraService,
            },
          });
          const writability = await profileTableHelpers.buildIndustryWritabilityMap({
            statusAllPayload,
            sandbox,
            connectionStores: {
              generic: genericProfileConnectionStore,
              travel: travelProfileConnectionStore,
              fsi: fsiProfileConnectionStore,
              telecom: telecomProfileConnectionStore,
              retail: retailProfileConnectionStore,
              media: mediaProfileConnectionStore,
              sports: sportsProfileConnectionStore,
            },
          });
          profileTableHelpers.enrichProfileTablePayloadWithWritability(payload, writability);
        } catch (enrichErr) {
          console.warn(
            '[profileTableProxy.enrich]',
            JSON.stringify({ sandbox, error: String(enrichErr && enrichErr.message ? enrichErr.message : enrichErr).slice(0, 240) })
          );
        }
        res.status(200).json(payload);
      } catch (e) {
        res.status(500).json({ error: String(e.message || e) });
      }
    }
  );

  routes.ipadEventProxy = onRequest(
    {
      region: REGION,
      secrets: PROFILE_FN_SECRETS,
      environmentVariables: {
        ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
      },
      invoker: 'public',
      timeoutSeconds: 60,
      memory: '256MiB',
    },
    async (req, res) =>
      ipadEventProxy.handleIpadEventPost(req, res, {
        setCors,
        resolveSandboxFromQuery,
        getAdobeAccessToken,
        ADOBE_IMS_ORG,
      })
  );

  routes.profileAttributeOwnership = onRequest(
    { region: REGION, invoker: 'public', memory: '256MiB' },
    async (req, res) => {
      setCors(res, 'GET, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      try {
        res.status(200).json({ ok: true, ...industryAttributeMap.getAttributeOwnershipPayload() });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  const profileIndustryRoutesCtx = {
    onRequest,
    profileFnOpts,
    storeFnOpts: CONSENT_STORE_FN_OPTS,
    setCors,
    resolveSandboxFromQuery,
    getAdobeAccessToken,
    adobeClientIdValue: () => ADOBE_CLIENT_ID.value(),
    adobeImsOrgValue: () => ADOBE_IMS_ORG.value(),
    flowLookup: (...args) => consentFlowLookup.lookupConsentHttpFlow(...args),
    serializeFirestoreRecord,
  };

  const industryConfigs = [
    { key: 'generic', prefix: 'generic-profile', infra: genericProfileInfraService, store: genericProfileConnectionStore },
    { key: 'travel', prefix: 'travel-profile', infra: travelProfileInfraService, store: travelProfileConnectionStore },
    { key: 'fsi', prefix: 'fsi-profile', infra: fsiProfileInfraService, store: fsiProfileConnectionStore },
    { key: 'telecom', prefix: 'telecom-profile', infra: telecomProfileInfraService, store: telecomProfileConnectionStore },
    { key: 'retail', prefix: 'retail-profile', infra: retailProfileInfraService, store: retailProfileConnectionStore },
    { key: 'media', prefix: 'media-profile', infra: mediaProfileInfraService, store: mediaProfileConnectionStore },
    { key: 'sports', prefix: 'sports-profile', infra: sportsProfileInfraService, store: sportsProfileConnectionStore },
  ];

  for (const cfg of industryConfigs) {
    const industryRoutes = createProfileIndustryRoutes({
      industryKey: cfg.key,
      routePathPrefix: cfg.prefix,
      infraService: cfg.infra,
      connectionStore: cfg.store,
      ctx: profileIndustryRoutesCtx,
    });
    const exportPrefix = cfg.key === 'generic' ? 'generic' : cfg.key;
    routes[`${exportPrefix}ProfileInfraStatus`] = industryRoutes.statusHandler;
    routes[`${exportPrefix}ProfileInfraStep`] = industryRoutes.stepHandler;
    routes[`${exportPrefix}ProfileInfraEnableProfile`] = industryRoutes.enableProfileHandler;
    routes[`${exportPrefix}ProfileInfraFlowLookup`] = industryRoutes.flowLookupHandler;
    routes[`${exportPrefix}ProfileConnectionStore`] = industryRoutes.connectionStoreHandler;
  }

  routes.profileInfraStatusAll = onRequest(profileFnOpts, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const sandbox = resolveSandboxFromQuery(req);
    const bypassCache = String(req.query.refresh || '').trim() === '1';
    console.log(
      '[profileInfraStatusAll.http]',
      JSON.stringify({ route: 'GET /api/profile-infra/status-all', sandbox, bypassCache })
    );
    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), sandbox });
      return;
    }
    try {
      const payload = await profileInfraStatusAllSvc.runProfileInfraStatusAll({
        sandbox,
        token: accessToken,
        clientId: ADOBE_CLIENT_ID.value(),
        orgId: ADOBE_IMS_ORG.value(),
        bypassCache,
        services: {
          generic: genericProfileInfraService,
          travel: travelProfileInfraService,
          fsi: fsiProfileInfraService,
          telecom: telecomProfileInfraService,
          retail: retailProfileInfraService,
          media: mediaProfileInfraService,
          sports: sportsProfileInfraService,
        },
      });
      res.status(200).json(payload);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e), sandbox });
    }
  });

  return routes;
}

module.exports = { registerProfileRoutes };
