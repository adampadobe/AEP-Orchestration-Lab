'use strict';

function errorStatus(error, fallback = 500) {
  const status = Number(error && error.status);
  return status >= 400 && status <= 599 ? status : fallback;
}

async function resolveMcpAudiencePrincipal(req, mcpApiKeyStore) {
  const key = String(req.headers['x-aep-lab-mcp-key'] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();
  if (!key) {
    return { ok: false, status: 401, body: { ok: false, error: 'X-AEP-Lab-Mcp-Key is required.' } };
  }
  const auth = await mcpApiKeyStore.validateUserApiKey(key);
  if (!auth.ok || !auth.principalUid || !auth.sandbox) {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        error: 'A valid user-generated MCP key with a single sandbox scope is required.',
        code: 'MCP_USER_KEY_REQUIRED',
      },
    };
  }
  return { ok: true, ...auth };
}

function requestedSandbox(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return String(body.sandbox || req.query.sandbox || '').trim().toLowerCase();
}

function buildAudienceAudit(audience, sandbox) {
  const blockers = [];
  const warnings = [];
  if (audience.dependents.length) {
    blockers.push(`Referenced by ${audience.dependents.length} dependent audience(s).`);
  }
  if (audience.dependencies.length) {
    warnings.push(`Built from ${audience.dependencies.length} other audience(s).`);
  }
  if (audience.originName && audience.originName !== 'REAL_TIME_CUSTOMER_PROFILE') {
    warnings.push(`Origin is ${audience.originName}; confirm the source system will not recreate it.`);
  }
  warnings.push(
    'This audit cannot prove that the audience is unused by destinations, Account Audiences, or Adobe Journey Optimizer. Adobe may reject deletion while dependencies remain.',
  );
  return {
    ok: true,
    sandbox,
    audience,
    review: {
      blockers,
      warnings,
      deleteReviewReady: blockers.length === 0,
    },
    confirmation: {
      audience_id: audience.id,
      expected_name: audience.name,
      instruction: 'Show this exact ID and name to the colleague. Call delete only after they explicitly confirm this audience.',
    },
  };
}

function registerAudienceManagementRoutes(deps) {
  const {
    onRequest,
    profileFnOpts,
    setCors,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    mcpApiKeyStore,
    audienceManagementService,
  } = deps;

  const audienceManagementProxy = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'GET, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (!['GET', 'DELETE'].includes(req.method)) {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    let principal;
    try {
      principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore);
    } catch (error) {
      res.status(500).json({ ok: false, error: 'MCP key validation failed.', detail: String(error.message || error) });
      return;
    }
    if (!principal.ok) {
      res.status(principal.status).json(principal.body);
      return;
    }

    const sandbox = requestedSandbox(req) || String(principal.sandbox).toLowerCase();
    if (sandbox !== String(principal.sandbox).toLowerCase()) {
      res.status(403).json({
        ok: false,
        error: `This MCP key is scoped to sandbox "${principal.sandbox}", not "${sandbox}".`,
      });
      return;
    }

    let token;
    try {
      token = await getAdobeAccessToken();
    } catch (error) {
      res.status(500).json({ ok: false, error: 'Adobe authentication failed.', detail: String(error.message || error) });
      return;
    }
    const platformAuth = {
      token,
      clientId: ADOBE_CLIENT_ID.value(),
      orgId: ADOBE_IMS_ORG.value(),
      sandbox,
    };

    try {
      if (req.method === 'GET') {
        const audienceId = String(req.query.audience_id || '').trim();
        if (audienceId) {
          const audience = await audienceManagementService.getAudience({ ...platformAuth, audienceId });
          res.status(200).json(buildAudienceAudit(audience, sandbox));
          return;
        }
        const payload = await audienceManagementService.listAudiences({
          ...platformAuth,
          start: req.query.start,
          limit: req.query.limit,
          name: req.query.name,
          includeInactive: String(req.query.include_inactive || 'true').toLowerCase() !== 'false',
        });
        res.status(200).json({ ok: true, ...payload });
        return;
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const audienceId = String(body.audience_id || '').trim();
      const expectedName = String(body.expected_name || '');
      if (body.confirmed !== true || !audienceId || !expectedName) {
        res.status(400).json({
          ok: false,
          error: 'audience_id, exact expected_name, and confirmed=true are required after explicit colleague confirmation.',
        });
        return;
      }

      // Re-read immediately before deletion so a stale or mismatched confirmation fails closed.
      const audience = await audienceManagementService.getAudience({ ...platformAuth, audienceId });
      if (audience.id !== audienceId || audience.name !== expectedName) {
        res.status(409).json({
          ok: false,
          error: 'Audience identity changed or expected_name does not exactly match. Re-run lab_audience_audit.',
          current: { id: audience.id, name: audience.name },
        });
        return;
      }
      if (audience.dependents.length) {
        res.status(409).json({
          ok: false,
          error: 'Audience still has dependent audiences. Remove those references and re-run lab_audience_audit before deletion.',
          dependents: audience.dependents,
        });
        return;
      }
      await audienceManagementService.deleteAudience({ ...platformAuth, audienceId });
      res.status(200).json({
        ok: true,
        sandbox,
        deleted: { id: audience.id, name: audience.name, type: audience.type, originName: audience.originName },
        deletedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(errorStatus(error)).json({
        ok: false,
        error: String(error.message || error),
        platformStatus: Number(error.status) || null,
        platformResponse: error.platformResponse || null,
      });
    }
  });

  return { audienceManagementProxy };
}

module.exports = {
  buildAudienceAudit,
  resolveMcpAudiencePrincipal,
  registerAudienceManagementRoutes,
};
