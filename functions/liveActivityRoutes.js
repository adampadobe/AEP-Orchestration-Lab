'use strict';

/**
 * Authenticated Portal + MCP Live Activity routes.
 */
function registerLiveActivityRoutes(deps) {
  const {
    onRequest,
    profileFnOpts,
    setCors,
    labGenerationPrefsAuth,
    labWorkspaceAuthService,
    liveActivityTemplateStore,
    liveActivityService,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
  } = deps;

  const routes = {};

  async function resolvePrincipal(req, res) {
    const principal = await labGenerationPrefsAuth.resolveGenerationPrefsPrincipal(req, {
      labWorkspaceAuthService,
    });
    if (!principal.ok) {
      res.status(principal.status).json(principal.body);
      return null;
    }
    return principal;
  }

  function sandboxFor(req, principal) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    return String(
      body.sandbox ||
      body.sandboxName ||
      req.query?.sandbox ||
      principal?.keySandbox ||
      '',
    ).trim().toLowerCase();
  }

  function enforceSandbox(principal, sandbox, res) {
    if (!sandbox) {
      res.status(400).json({ ok: false, error: 'sandbox is required' });
      return false;
    }
    if (
      principal.authSource === 'mcp_key' &&
      principal.keySandbox &&
      String(principal.keySandbox).toLowerCase() !== sandbox
    ) {
      res.status(403).json({
        ok: false,
        error: `MCP key is scoped to sandbox "${principal.keySandbox}".`,
      });
      return false;
    }
    return true;
  }

  routes.ajoLiveActivityTemplates = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    const principal = await resolvePrincipal(req, res);
    if (!principal) return;
    const sandbox = sandboxFor(req, principal);
    if (!enforceSandbox(principal, sandbox, res)) return;
    try {
      if (req.method === 'GET') {
        const templates = await liveActivityTemplateStore.listTemplates(principal.uid, sandbox);
        res.status(200).json({
          ok: true,
          sandbox,
          templates,
          principal: {
            uidPrefix: `${String(principal.uid).slice(0, 8)}…`,
            email: principal.principalEmail || null,
            authSource: principal.authSource,
          },
        });
        return;
      }
      if (req.method === 'POST') {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const template = await liveActivityTemplateStore.upsertTemplate(principal.uid, sandbox, {
          id: body.templateId || body.id,
          customer: body.customer,
          name: body.name,
          description: body.description,
          body: body.template || body.payload || body.json,
          variableDefinitions: body.variableDefinitions || body.requiredVariables,
          validateOnly: body.validateOnly === true,
          source: principal.authSource === 'mcp_key' ? 'mcp' : 'portal',
        });
        res.status(200).json({ ok: true, sandbox, template });
        return;
      }
      if (req.method === 'DELETE') {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const result = await liveActivityTemplateStore.deleteTemplate(
          principal.uid,
          sandbox,
          body.templateId || body.id || req.query?.templateId,
        );
        res.status(200).json({ ok: true, sandbox, ...result });
        return;
      }
      res.status(405).json({ ok: false, error: 'Method not allowed' });
    } catch (e) {
      res.status(Number(e?.status) || 500).json({ ok: false, error: String(e.message || e), sandbox });
    }
  });

  routes.ajoLiveActivityPreflight = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const principal = await resolvePrincipal(req, res);
    if (!principal) return;
    const sandbox = sandboxFor(req, principal);
    if (!enforceSandbox(principal, sandbox, res)) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const template = body.draftTemplate && principal.authSource === 'firebase'
        ? {
            id: 'portal-draft',
            name: 'Portal draft',
            customer: 'Portal',
            source: 'portal-draft',
            version: 1,
            body: body.draftTemplate,
            variableDefinitions: [],
          }
        : await liveActivityTemplateStore.getTemplate(
            principal.uid,
            sandbox,
            body.templateId,
          );
      if (!template) {
        res.status(404).json({ ok: false, error: 'template not found', sandbox });
        return;
      }
      const result = await liveActivityService.createPreflight({
        uid: principal.uid,
        sandbox,
        template,
        input: {
          campaignId: body.campaignId,
          ecid: body.ecid,
          liveActivityId: body.liveActivityId,
          event: body.event,
          variables: body.variables,
        },
        principalEmail: principal.principalEmail,
        keyId: principal.keyId || null,
      });
      res.status(200).json({ ok: true, ...result });
    } catch (e) {
      res.status(Number(e?.status) || 400).json({ ok: false, error: String(e.message || e), sandbox });
    }
  });

  routes.ajoLiveActivityProxy = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const principal = await resolvePrincipal(req, res);
    if (!principal) return;
    const sandbox = sandboxFor(req, principal);
    if (!enforceSandbox(principal, sandbox, res)) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.payload) {
      res.status(400).json({
        ok: false,
        code: 'PREFLIGHT_REQUIRED',
        error: 'Raw Live Activity payloads are no longer accepted. Create a template and run preflight first.',
      });
      return;
    }
    try {
      const result = await liveActivityService.sendPreflight({
        uid: principal.uid,
        sandbox,
        preflightId: body.preflightId,
        confirmed: body.confirmed,
        idempotencyKey: body.idempotencyKey,
        keyId: principal.keyId || null,
        getAdobeAccessToken,
        clientId: ADOBE_CLIENT_ID.value(),
        imsOrg: ADOBE_IMS_ORG.value(),
      });
      res.status(result.ok || result.duplicate ? 200 : Number(result.status) || 400).json(result);
    } catch (e) {
      res.status(Number(e?.status) || 500).json({
        ok: false,
        code: e?.code || null,
        error: String(e.message || e),
        sandbox,
      });
    }
  });

  routes.ajoLiveActivityRuns = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ ok: false, error: 'GET only' }); return; }
    const principal = await resolvePrincipal(req, res);
    if (!principal) return;
    const sandbox = sandboxFor(req, principal);
    if (!enforceSandbox(principal, sandbox, res)) return;
    try {
      const runs = await liveActivityService.listRuns(principal.uid, sandbox, req.query?.limit);
      res.status(200).json({ ok: true, sandbox, runs });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
  });

  return routes;
}

module.exports = { registerLiveActivityRoutes };
