/**
 * Build the 5 HTTPS handlers a new industry's profile-generation pipeline needs:
 *   - GET  /api/<route>-infra/status         → infraService.runStatus
 *   - POST /api/<route>-infra/step           → infraService.runStep
 *   - POST /api/<route>-infra/enable-profile → infraService.runEnableProfile
 *   - GET  /api/<route>-infra/flow-lookup    → consentFlowLookup.lookupConsentHttpFlow
 *   - GET/POST /api/<route>-connection       → connectionStore.get / .save
 *
 * Generic and Travel keep their hand-rolled handlers in `functions/index.js`
 * (preserves the Phase 0 "behaviour-unchanged" guarantee for those two
 * already-shipped industries). Every NEW industry (FSI, Telecom, Retail,
 * Media, Sports) uses this factory so each industry adds ~10 LOC to
 * `index.js` instead of cloning ~140 LOC of route boilerplate.
 *
 * Design notes
 * ------------
 * `onRequest(...)` must be evaluated at module-load time so Firebase Functions
 * v2 can enumerate the exports during deploy. The factory therefore returns
 * already-wired handler objects — not lazy thunks — so the calling site can
 * assign them straight to `exports.<name>` in `index.js`.
 *
 * The helper takes a `ctx` of cross-cutting helpers from `index.js`
 * (`onRequest`, `setCors`, `resolveSandboxFromQuery`, `getAdobeAccessToken`,
 * `serializeFirestoreRecord`, `consentFlowLookup`, plus the secret value
 * accessors and function-options objects). This avoids importing the secret-
 * binding plumbing into the helper module itself, keeping the helper free
 * of `defineSecret` side-effects.
 */

/**
 * @param {object} cfg
 * @param {string} cfg.industryKey               e.g. 'fsi'
 * @param {string} cfg.routePathPrefix           e.g. 'fsi-profile' (used in log strings)
 * @param {object} cfg.infraService              Module returned by createProfileInfraService — exposes runStatus, runStep, HTTP_DATAFLOW_NAME
 * @param {object} cfg.connectionStore           Module returned by createProfileConnectionStore — exposes get, save
 * @param {object} cfg.ctx                       Cross-cutting helpers from index.js
 * @param {Function} cfg.ctx.onRequest           firebase-functions/v2/https onRequest
 * @param {object}  cfg.ctx.profileFnOpts        Function options for infra handlers (timeout, region, secrets, ...)
 * @param {object}  cfg.ctx.storeFnOpts          Function options for connection-store handler (no Adobe secrets needed)
 * @param {Function} cfg.ctx.setCors             setCors(res, methods?)
 * @param {Function} cfg.ctx.resolveSandboxFromQuery
 * @param {Function} cfg.ctx.getAdobeAccessToken
 * @param {Function} cfg.ctx.adobeClientIdValue  () => string
 * @param {Function} cfg.ctx.adobeImsOrgValue    () => string
 * @param {Function} cfg.ctx.flowLookup          consentFlowLookup.lookupConsentHttpFlow
 * @param {Function} cfg.ctx.serializeFirestoreRecord
 */
function createProfileIndustryRoutes(cfg) {
  if (!cfg || !cfg.industryKey || !cfg.infraService || !cfg.connectionStore || !cfg.ctx) {
    throw new Error('createProfileIndustryRoutes: industryKey, infraService, connectionStore, ctx all required');
  }
  const { industryKey, routePathPrefix, infraService, connectionStore, ctx } = cfg;
  const {
    onRequest,
    profileFnOpts,
    storeFnOpts,
    setCors,
    resolveSandboxFromQuery,
    getAdobeAccessToken,
    adobeClientIdValue,
    adobeImsOrgValue,
    flowLookup,
    serializeFirestoreRecord,
  } = ctx;

  if (!onRequest || !profileFnOpts || !storeFnOpts || !setCors || !resolveSandboxFromQuery || !getAdobeAccessToken) {
    throw new Error('createProfileIndustryRoutes.ctx is missing required helpers');
  }

  const httpLogTag = `[${industryKey}ProfileInfra.http]`;
  const connectionLogTag = `[${industryKey}ProfileConnection]`;
  const routePrefix = routePathPrefix || `${industryKey}-profile`;

  const statusHandler = onRequest(profileFnOpts, async (req, res) => {
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
    console.log(httpLogTag, JSON.stringify({ route: `GET /api/${routePrefix}-infra/status`, sandbox }));
    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }
    try {
      const payload = await infraService.runStatus(sandbox, accessToken, adobeClientIdValue(), adobeImsOrgValue());
      res.status(200).json(payload);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e), sandbox });
    }
  });

  const stepHandler = onRequest(profileFnOpts, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const sandbox = resolveSandboxFromQuery(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const step = String(body.step || '').trim();
    console.log(httpLogTag, JSON.stringify({ route: `POST /api/${routePrefix}-infra/step`, sandbox, step }));
    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }
    try {
      const payload = await infraService.runStep(sandbox, accessToken, adobeClientIdValue(), adobeImsOrgValue(), step);
      res.status(200).json(payload);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e), sandbox, step });
    }
  });

  const enableProfileHandler = onRequest(profileFnOpts, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const sandbox = resolveSandboxFromQuery(req);
    console.log(httpLogTag, JSON.stringify({ route: `POST /api/${routePrefix}-infra/enable-profile`, sandbox }));
    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }
    try {
      const payload = await infraService.runEnableProfile(sandbox, accessToken, adobeClientIdValue(), adobeImsOrgValue());
      res.status(200).json(payload);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e), sandbox });
    }
  });

  const flowLookupHandler = onRequest(profileFnOpts, async (req, res) => {
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
    const flowId = String(req.query.flowId || '').trim();
    const flowName = String(req.query.flowName || '').trim() || infraService.HTTP_DATAFLOW_NAME;
    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }
    try {
      const payload = await flowLookup(sandbox, accessToken, adobeClientIdValue(), adobeImsOrgValue(), {
        flowId: flowId || undefined,
        flowName,
      });
      res.status(200).json(payload);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e), sandbox });
    }
  });

  const connectionStoreHandler = onRequest(storeFnOpts, async (req, res) => {
    setCors(res, 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    const sandboxQ = resolveSandboxFromQuery(req);
    if (req.method === 'GET') {
      try {
        const record = await connectionStore.get(sandboxQ);
        res.status(200).json({ ok: true, sandbox: sandboxQ, record: serializeFirestoreRecord(record) });
      } catch (e) {
        console.log(connectionLogTag, JSON.stringify({ route: 'GET', sandbox: sandboxQ, error: String(e.message || e) }));
        res.status(500).json({ ok: false, error: String(e.message || e), sandbox: sandboxQ });
      }
      return;
    }
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sb = String(body.sandbox || sandboxQ).trim() || sandboxQ;
      try {
        const record = await connectionStore.save(sb, {
          streaming: body.streaming,
          infra: body.infra,
        });
        res.status(200).json({ ok: true, sandbox: sb, record: serializeFirestoreRecord(record) });
      } catch (e) {
        console.log(connectionLogTag, JSON.stringify({ route: 'POST', sandbox: sb, error: String(e.message || e) }));
        res.status(500).json({ ok: false, error: String(e.message || e), sandbox: sb });
      }
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  });

  return { statusHandler, stepHandler, flowLookupHandler, connectionStoreHandler, enableProfileHandler };
}

module.exports = { createProfileIndustryRoutes };
