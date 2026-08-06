/**
 * Lab config / workspace / auth routes — extracted from index.js (Phase B).
 */

const { normalizeLdapSlug, ldapSlugFromEmail } = require('./labRtdbSlug');

/**
 * @param {object} deps
 * @returns {Record<string, import('firebase-functions/v2/https').HttpsFunction>}
 */
function registerLabRoutes(deps) {
  const {
    onRequest,
    profileFnOpts,
    CONSENT_STORE_FN_OPTS,
    setCors,
    resolveSandboxFromQuery,
    labHostingOriginForFunctionConfig,
    EASTER_EGG_MAILGUN_API_KEY,
    EASTER_EGG_MAILGUN_DOMAIN,
    envBarConfigStore,
    labUserSandboxStore,
    envBarPreferencesStore,
    labRtdbProvisionService,
    labWorkspaceAuthService,
    labProfileGenerationPrefsStore,
    labProfileRecentGeneratedStore,
    labGenerationPrefsAuth,
    labMcpFirstRunService,
    labDemoConfigService,
    labDemoAssetService,
    brandScrapeStore,
    imageHostingLibrary,
    mcpApiKeyStore,
  } = deps;

  const routes = {};
  const LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT = 'apalmer@adobe.com,kirkham@adobe.com';

  function requestTargetsAdobeStock(req) {
    const raw = String(req.originalUrl || req.url || req.path || '');
    return raw.indexOf('adobe-stock') !== -1;
  }

  async function respondAdobeStockQuote(req, res) {
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
      const chartRes = await fetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/ADBE?interval=1d&range=1d',
        { headers: { 'User-Agent': 'AEP-Orchestration-Lab/1.0' } }
      );
      if (!chartRes.ok) throw new Error('Upstream HTTP ' + chartRes.status);
      const chart = await chartRes.json();
      const result = chart.chart && chart.chart.result && chart.chart.result[0];
      const meta = result && result.meta;
      if (!meta || meta.regularMarketPrice == null) {
        throw new Error('Invalid upstream response');
      }
      const price = Number(meta.regularMarketPrice);
      const prev = meta.chartPreviousClose != null ? Number(meta.chartPreviousClose) : Number(meta.previousClose);
      const change = prev != null && Number.isFinite(prev) ? price - prev : null;
      const changePct = change != null && prev ? (change / prev) * 100 : null;
      if (!Number.isFinite(price) || price < 80 || price > 2000) {
        throw new Error('Price out of expected range');
      }
      res.set('Cache-Control', 'public, max-age=120');
      res.status(200).json({
        ok: true,
        symbol: 'ADBE',
        price,
        currency: meta.currency || 'USD',
        change,
        changePct,
        source: 'yahoo',
        asOf: meta.regularMarketTime
          ? new Date(meta.regularMarketTime * 1000).toISOString()
          : null,
      });
    } catch (e) {
      res.status(502).json({ ok: false, error: String(e.message || e) });
    }
  }

  /** GET /api/env-bar-config?demoId=ksia — remote env bar defaults (Firestore envBarConfigs/{demoId}) */
  routes.envBarConfig = onRequest(profileFnOpts, async (req, res) => {
  if (requestTargetsAdobeStock(req)) {
    await respondAdobeStockQuote(req, res);
    return;
  }
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const demoId = String(req.query.demoId || req.query.prefix || '').trim();
  if (!demoId) {
    res.status(400).json({ ok: false, error: 'demoId query parameter is required' });
    return;
  }
  try {
    const config = await envBarConfigStore.getEnvBarConfig(demoId);
    if (!config) {
      res.status(200).json({ ok: true, demoId, config: null, found: false });
      return;
    }
    res.status(200).json({ ok: true, demoId, config, found: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), demoId });
  }
});

  /** GET/POST /api/lab/sandbox-state — per-user scope localStorage mirror (sandbox/workspace) */
  routes.labUserSandboxState = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'Firebase Auth required (anonymous sign-in is enough).' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const scopeType = String((body.scopeType || (req.query && req.query.scopeType) || '')).trim().toLowerCase();
  const scopeIdRaw = String((body.scopeId || (req.query && req.query.scopeId) || '')).trim();
  const sandbox = (req.method === 'POST' && body.sandbox)
    ? String(body.sandbox).trim()
    : String((req.query && req.query.sandbox) || '').trim();

  let scopeId = '';
  let resolvedScopeType = 'sandbox';
  if (scopeType === 'workspace') {
    scopeId = scopeIdRaw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    resolvedScopeType = 'workspace';
    if (!scopeId) {
      res.status(400).json({ ok: false, error: 'scopeId is required for workspace scope' });
      return;
    }
  } else {
    scopeId = sandbox;
    if (!scopeId) {
      res.status(400).json({ ok: false, error: 'sandbox is required' });
      return;
    }
  }

  const storageScope = resolvedScopeType + ':' + scopeId;
  if (!storageScope) {
    res.status(400).json({ ok: false, error: 'scope is required' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const keys = await labUserSandboxStore.getLabKeys(uid, storageScope);
      res.status(200).json({ ok: true, sandbox: scopeId, scopeType: resolvedScopeType, scopeId, keys });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox: scopeId, scopeType: resolvedScopeType, scopeId });
    }
    return;
  }

  if (req.method === 'POST') {
    const patch = body.keys && typeof body.keys === 'object' ? body.keys : {};
    const replace = !!body.replace;
    try {
      const keys = await labUserSandboxStore.mergeLabKeys(uid, storageScope, patch, { replace });
      res.status(200).json({ ok: true, sandbox: scopeId, scopeType: resolvedScopeType, scopeId, keys });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox: scopeId, scopeType: resolvedScopeType, scopeId });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

  /** GET/POST /api/lab/env-bar-preferences — per-user env bar prefs (sandbox, Tags, BC, generator) */
  routes.labEnvBarPreferences = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const uid = await envBarPreferencesStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'Firebase Auth required (anonymous sign-in is enough).' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const preferences = await envBarPreferencesStore.getPreferences(uid);
      res.status(200).json({ ok: true, preferences });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body && typeof body === 'object' ? body : {};
    try {
      const preferences = await envBarPreferencesStore.mergePreferences(uid, body);
      res.status(200).json({ ok: true, preferences });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

  /** GET/POST /api/lab/workspace-profile — per-user no-sandbox identity details */
  routes.labWorkspaceProfile = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'Firebase Auth required (anonymous sign-in is enough).' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const profile = await labUserSandboxStore.getWorkspaceProfile(uid);
      res.status(200).json({ ok: true, profile });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const profile = await labUserSandboxStore.upsertWorkspaceProfile(uid, {
        firstName: body.firstName,
        lastName: body.lastName,
        adobeEmail: body.adobeEmail,
        workspaceName: body.workspaceName,
        workspaceSlug: body.workspaceSlug,
      });
      res.status(200).json({ ok: true, profile });
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

  /** POST /api/lab/save-demo-config — Admin SDK RTDB save (customise panels; bypasses client rules) */
  routes.labSaveDemoConfig = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
    if (!uid) {
      res.status(401).json({ ok: false, error: 'Firebase Auth required (lab sign-in).' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const section = String(body.section || '').trim();
    const partial = body.partial;
    const sandboxSlug = String(body.sandboxSlug || '').trim();
    const workspaceSlug = String(body.workspaceSlug || '').trim();

    const workspaceRootSections = labRtdbProvisionService.WORKSPACE_ROOT_SECTIONS;
    if (!section) {
      res.status(400).json({ ok: false, error: 'section is required' });
      return;
    }
    if (!workspaceRootSections.has(section) && !labRtdbProvisionService.LEGACY_NESTED_SECTIONS.includes(section)) {
      res.status(400).json({ ok: false, error: `Unknown demo section: ${section}` });
      return;
    }
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
      res.status(400).json({ ok: false, error: 'partial must be a plain object' });
      return;
    }
    if (!labRtdbProvisionService.DEMO_SECTIONS.includes(section)) {
      res.status(400).json({ ok: false, error: `Unknown demo section: ${section}` });
      return;
    }

    try {
      const profile = await labUserSandboxStore.getWorkspaceProfile(uid);
      const adobeEmail = String((profile && profile.adobeEmail) || body.adobeEmail || '').trim().toLowerCase();
      if (!adobeEmail) {
        res.status(400).json({ ok: false, error: 'Workspace profile or adobeEmail required' });
        return;
      }

      let ldapSlug = normalizeLdapSlug(workspaceSlug);
      if (!ldapSlug && profile && profile.workspaceSlug) {
        ldapSlug = normalizeLdapSlug(profile.workspaceSlug);
      }
      if (!ldapSlug) {
        ldapSlug = ldapSlugFromEmail(adobeEmail, profile && profile.firstName, profile && profile.lastName);
      }

      const owns = ldapSlug ? await labRtdbProvisionService.userOwnsWorkspace(null, uid, ldapSlug) : false;
      if (!owns) {
        const provisioned = await labRtdbProvisionService.provisionUserRtdbWorkspace({
          uid,
          adobeEmail,
          firstName: profile && profile.firstName,
          lastName: profile && profile.lastName,
          workspaceSlug: workspaceSlug || (profile && profile.workspaceSlug) || ldapSlug,
          defaultSandbox: sandboxSlug,
        });
        ldapSlug = provisioned.ldapSlug;
      }

      const result = await labRtdbProvisionService.saveDemoSection(
        null,
        ldapSlug,
        sandboxSlug,
        section,
        partial,
      );
      res.status(200).json({ ok: true, ...result });
    } catch (e) {
      const status = e && e.code === 'slug_taken' ? 409 : 500;
      res.status(status).json({ ok: false, error: String(e.message || e), code: e && e.code ? String(e.code) : '' });
    }
  });

  /**
   * GET/POST /api/lab/demo-config — governed user-scoped RTDB discovery,
   * preview, apply and restore. Supports Firebase Auth or a user-generated MCP key.
   */
  routes.labDemoConfig = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
    setCors(res, 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const principal = await labGenerationPrefsAuth.resolveGenerationPrefsPrincipal(req, {
      labWorkspaceAuthService,
    });
    if (!principal.ok) {
      res.status(principal.status).json(principal.body);
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sandbox = String(
      body.sandbox || (req.query && req.query.sandbox) || principal.keySandbox || '',
    ).trim().toLowerCase();
    if (!sandbox) {
      res.status(400).json({ ok: false, error: 'sandbox is required (body, query, or MCP key scope)' });
      return;
    }
    if (principal.authSource === 'mcp_key' && principal.keySandbox && principal.keySandbox !== sandbox) {
      res.status(403).json({
        ok: false,
        error: `MCP key is scoped to sandbox "${principal.keySandbox}" — cannot manage demo configuration for "${sandbox}".`,
      });
      return;
    }

    try {
      const profile = await labUserSandboxStore.getWorkspaceProfile(principal.uid);
      const workspaceSlug = normalizeLdapSlug(profile && profile.workspaceSlug);
      if (!workspaceSlug) {
        res.status(409).json({
          ok: false,
          error: 'Workspace slug is not configured. Run lab_mcp_first_run_setup before managing demo configuration.',
          code: 'DEMO_CONFIG_FIRST_RUN_REQUIRED',
          sandbox,
        });
        return;
      }
      const ownsWorkspace = await labRtdbProvisionService.userOwnsWorkspace(
        null,
        principal.uid,
        workspaceSlug,
      );
      if (!ownsWorkspace) {
        res.status(403).json({
          ok: false,
          error: 'The authenticated user does not own the configured RTDB workspace.',
          code: 'DEMO_CONFIG_WORKSPACE_FORBIDDEN',
          sandbox,
        });
        return;
      }

      const context = {
        uid: principal.uid,
        workspaceSlug,
        sandbox,
      };
      if (req.method === 'GET') {
        const result = await labDemoConfigService.inspect(context);
        res.status(200).json({ ...result, authSource: principal.authSource });
        return;
      }

      const action = String(body.action || 'preview').trim().toLowerCase();
      let result;
      if (action === 'preview') {
        result = await labDemoConfigService.createPreview({
          ...context,
          changes: body.changes,
          source: body.source || 'manual',
        });
      } else if (action === 'apply') {
        result = await labDemoConfigService.applyPreview({
          ...context,
          preflightId: body.preflight_id || body.preflightId,
          confirmed: body.confirmed,
          idempotencyKey: body.idempotency_key || body.idempotencyKey,
        });
      } else if (action === 'restore-preview') {
        result = await labDemoConfigService.createRestorePreview({
          ...context,
          revisionId: body.revision_id || body.revisionId,
        });
      } else {
        res.status(400).json({ ok: false, error: `Unknown demo-config action: ${action}` });
        return;
      }
      res.status(200).json({ ...result, authSource: principal.authSource });
    } catch (e) {
      const status = Number(e && e.status) || 500;
      res.status(status).json({
        ok: false,
        error: String(e && e.message ? e.message : e),
        code: e && e.code ? String(e.code) : 'DEMO_CONFIG_ERROR',
        sandbox,
      });
    }
  });

  /**
   * GET/POST /api/lab/demo-assets — governed user-scoped customer asset
   * inventory, scrape preview, activation, and named revision restore.
   */
  routes.labDemoAssets = onRequest({ ...CONSENT_STORE_FN_OPTS, timeoutSeconds: 120, memory: '1GiB' }, async (req, res) => {
    setCors(res, 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const principal = await labGenerationPrefsAuth.resolveGenerationPrefsPrincipal(req, {
      labWorkspaceAuthService,
    });
    if (!principal.ok) {
      res.status(principal.status).json(principal.body);
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sandbox = String(body.sandbox || (req.query && req.query.sandbox) || principal.keySandbox || '')
      .trim().toLowerCase();
    if (!sandbox) {
      res.status(400).json({ ok: false, error: 'sandbox is required (body, query, or MCP key scope)' });
      return;
    }
    if (principal.authSource === 'mcp_key' && principal.keySandbox && principal.keySandbox !== sandbox) {
      res.status(403).json({
        ok: false,
        error: `MCP key is scoped to sandbox "${principal.keySandbox}" — cannot manage demo assets for "${sandbox}".`,
      });
      return;
    }

    try {
      const profile = await labUserSandboxStore.getWorkspaceProfile(principal.uid);
      const workspaceSlug = normalizeLdapSlug(profile && profile.workspaceSlug);
      if (!workspaceSlug) {
        res.status(409).json({
          ok: false,
          error: 'Workspace slug is not configured. Run lab_mcp_first_run_setup before managing demo assets.',
          code: 'DEMO_ASSET_FIRST_RUN_REQUIRED',
          sandbox,
        });
        return;
      }
      const ownsWorkspace = await labRtdbProvisionService.userOwnsWorkspace(null, principal.uid, workspaceSlug);
      if (!ownsWorkspace) {
        res.status(403).json({ ok: false, error: 'The authenticated user does not own the configured RTDB workspace.', code: 'DEMO_ASSET_WORKSPACE_FORBIDDEN', sandbox });
        return;
      }

      const config = await labDemoConfigService.inspect({ uid: principal.uid, workspaceSlug, sandbox });
      const core = (config.sections || []).find((section) => section.name === 'CoreDemoData');
      const nameField = core && (core.fields || []).find((field) => field.field === 'name');
      const currentCustomerName = nameField && typeof nameField.value === 'string' ? nameField.value : '';
      const context = { uid: principal.uid, workspaceSlug, sandbox };

      if (req.method === 'GET') {
        const result = await labDemoAssetService.inspect(context);
        res.status(200).json({ ...result, authSource: principal.authSource, rtdbCustomerName: currentCustomerName || null });
        return;
      }

      const action = String(body.action || 'preview').trim().toLowerCase();
      let result;
      if (action === 'preview') {
        const scrapeId = String(body.scrape_id || body.scrapeId || '').trim();
        if (!scrapeId) {
          res.status(400).json({ ok: false, error: 'scrape_id is required for an asset preview.' });
          return;
        }
        const record = await brandScrapeStore.getScrape(sandbox, scrapeId);
        if (!record) {
          res.status(404).json({ ok: false, error: 'Brand scrape not found.', scrapeId, sandbox });
          return;
        }
        result = await labDemoAssetService.createPreview({
          ...context,
          record,
          scrapeId,
          assetPack: body.asset_pack || body.assetPack,
          overrides: body.overrides,
          currentCustomerName,
        });
      } else if (action === 'apply') {
        result = await labDemoAssetService.applyPreview({
          ...context,
          preflightId: body.preflight_id || body.preflightId,
          confirmed: body.confirmed,
          idempotencyKey: body.idempotency_key || body.idempotencyKey,
          backupCustomerName: body.backup_customer_name || body.backupCustomerName,
          imageHostingLibrary,
        });
      } else if (action === 'restore-preview') {
        result = await labDemoAssetService.createRestorePreview({
          ...context,
          revisionId: body.revision_id || body.revisionId,
          currentCustomerName,
        });
      } else {
        res.status(400).json({ ok: false, error: `Unknown demo-assets action: ${action}` });
        return;
      }
      res.status(200).json({ ...result, authSource: principal.authSource });
    } catch (e) {
      const status = Number(e && e.status) || 500;
      res.status(status).json({
        ok: false,
        error: String(e && e.message ? e.message : e),
        code: e && e.code ? String(e.code) : 'DEMO_ASSET_ERROR',
        ...(e && e.rollback ? { rollback: e.rollback } : {}),
        sandbox,
      });
    }
  });

  /** POST /api/lab/provision-rtdb — idempotent RTDB workspace + sandbox demo stub for signed-in lab user */
  routes.labProvisionRtdb = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'Firebase Auth required (lab sign-in).' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    const profile = await labUserSandboxStore.getWorkspaceProfile(uid);
    const adobeEmail = String((profile && profile.adobeEmail) || body.adobeEmail || '').trim().toLowerCase();
    if (!adobeEmail) {
      res.status(400).json({ ok: false, error: 'Workspace profile or adobeEmail required' });
      return;
    }

    const result = await labRtdbProvisionService.provisionUserRtdbWorkspace({
      uid,
      adobeEmail,
      firstName: profile && profile.firstName,
      lastName: profile && profile.lastName,
      workspaceSlug: (profile && profile.workspaceSlug) || body.workspaceSlug,
    });

    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const status = e && e.code === 'slug_taken' ? 409 : 500;
    res.status(status).json({ ok: false, error: String(e.message || e), code: e && e.code ? String(e.code) : '' });
  }
});

  /** POST /api/lab/workspace-auth/register — signup request with admin approval gate. */
  routes.labWorkspaceAuthRegister = onRequest(
  {
    ...CONSENT_STORE_FN_OPTS,
    secrets: [EASTER_EGG_MAILGUN_API_KEY, EASTER_EGG_MAILGUN_DOMAIN],
    environmentVariables: {
      LAB_APPROVAL_NOTIFY_EMAIL: LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT,
      LAB_APPROVAL_MAILGUN_REGION: '',
      LAB_APPROVAL_BASE_URL: labHostingOriginForFunctionConfig(),
      LAB_APPROVAL_MAIL_FROM: '',
    },
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const mailgunDomain = String(EASTER_EGG_MAILGUN_DOMAIN.value() || '').trim();
    const fallbackFrom = mailgunDomain ? `postmaster@${mailgunDomain}` : '';
    try {
      const result = await labWorkspaceAuthService.registerWorkspaceAuthRequest(
        {
          firstName: body.firstName,
          lastName: body.lastName,
          adobeEmail: body.adobeEmail,
          password: body.password,
          origin: req.get('origin') || req.get('referer') || '',
        },
        {
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT).trim(),
          approvalBaseUrl: String(process.env.LAB_APPROVAL_BASE_URL || '').trim(),
          mailgunKey: EASTER_EGG_MAILGUN_API_KEY.value(),
          mailgunDomain,
          mailFrom: String(process.env.LAB_APPROVAL_MAIL_FROM || fallbackFrom).trim(),
          mailgunRegion: String(process.env.LAB_APPROVAL_MAILGUN_REGION || '').trim(),
        },
      );
      res.status(200).json(result);
    } catch (e) {
      const status = Number(e && e.status) || 400;
      res.status(status).json({ ok: false, code: e && e.code ? String(e.code) : '', error: String(e && e.message ? e.message : e) });
    }
  },
);

  /** POST /api/lab/lab-access/request-approval — Step 2 after approval (Adobe sandbox): upserts profile when approved; pending path 403 on repeat. */
  routes.labLabAccessRequestApproval = onRequest(
  {
    ...CONSENT_STORE_FN_OPTS,
    secrets: [EASTER_EGG_MAILGUN_API_KEY, EASTER_EGG_MAILGUN_DOMAIN],
    environmentVariables: {
      LAB_APPROVAL_NOTIFY_EMAIL: LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT,
      LAB_APPROVAL_MAILGUN_REGION: '',
      LAB_APPROVAL_BASE_URL: labHostingOriginForFunctionConfig(),
      LAB_APPROVAL_MAIL_FROM: '',
    },
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const authHeader = String(req.get('authorization') || req.get('Authorization') || '');
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = bearer ? String(bearer[1] || '').trim() : String(body.idToken || '').trim();

    const mailgunDomain = String(EASTER_EGG_MAILGUN_DOMAIN.value() || '').trim();
    const fallbackFrom = mailgunDomain ? `postmaster@${mailgunDomain}` : '';
    try {
      const result = await labWorkspaceAuthService.requestLabAccessApprovalAfterOnboardingRequest(
        {
          idToken,
          firstName: body.firstName,
          lastName: body.lastName,
          origin: req.get('origin') || req.get('referer') || '',
        },
        {
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT).trim(),
          approvalBaseUrl: String(process.env.LAB_APPROVAL_BASE_URL || '').trim(),
          mailgunKey: EASTER_EGG_MAILGUN_API_KEY.value(),
          mailgunDomain,
          mailFrom: String(process.env.LAB_APPROVAL_MAIL_FROM || fallbackFrom).trim(),
          mailgunRegion: String(process.env.LAB_APPROVAL_MAILGUN_REGION || '').trim(),
        },
      );
      res.status(200).json(result);
    } catch (e) {
      const status = Number(e && e.status) || 400;
      res.status(status).json({ ok: false, code: e && e.code ? String(e.code) : '', error: String(e && e.message ? e.message : e) });
    }
  },
);

  /** POST /api/lab/lab-access/request-approval-signup — immediately after Create account (email/password); pending + Mailgun + disable; dedupes pending email. */
  routes.labLabAccessRequestApprovalSignup = onRequest(
  {
    ...CONSENT_STORE_FN_OPTS,
    secrets: [EASTER_EGG_MAILGUN_API_KEY, EASTER_EGG_MAILGUN_DOMAIN],
    environmentVariables: {
      LAB_APPROVAL_NOTIFY_EMAIL: LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT,
      LAB_APPROVAL_MAILGUN_REGION: '',
      LAB_APPROVAL_BASE_URL: labHostingOriginForFunctionConfig(),
      LAB_APPROVAL_MAIL_FROM: '',
    },
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const authHeader = String(req.get('authorization') || req.get('Authorization') || '');
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = bearer ? String(bearer[1] || '').trim() : String(body.idToken || '').trim();

    const mailgunDomain = String(EASTER_EGG_MAILGUN_DOMAIN.value() || '').trim();
    const fallbackFrom = mailgunDomain ? `postmaster@${mailgunDomain}` : '';
    try {
      const result = await labWorkspaceAuthService.requestLabAccessApprovalOnSignupRequest(
        {
          idToken,
          origin: req.get('origin') || req.get('referer') || '',
        },
        {
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT).trim(),
          approvalBaseUrl: String(process.env.LAB_APPROVAL_BASE_URL || '').trim(),
          mailgunKey: EASTER_EGG_MAILGUN_API_KEY.value(),
          mailgunDomain,
          mailFrom: String(process.env.LAB_APPROVAL_MAIL_FROM || fallbackFrom).trim(),
          mailgunRegion: String(process.env.LAB_APPROVAL_MAILGUN_REGION || '').trim(),
        },
      );
      res.status(200).json(result);
    } catch (e) {
      const status = Number(e && e.status) || 400;
      res.status(status).json({ ok: false, code: e && e.code ? String(e.code) : '', error: String(e && e.message ? e.message : e) });
    }
  },
);

  /** GET /api/lab/lab-access/status — lab gate: pending | approved | missing (legacy) from Firestore + Auth. */
  routes.labLabAccessStatus = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const authHeader = String(req.get('authorization') || req.get('Authorization') || '');
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = bearer ? String(bearer[1] || '').trim() : '';
  try {
    const result = await labWorkspaceAuthService.getLabAccessStatusFromIdTokenRequest({ idToken });
    res.status(200).json(result);
  } catch (e) {
    const status = Number(e && e.status) || 400;
    res.status(status).json({ ok: false, code: e && e.code ? String(e.code) : '', error: String(e && e.message ? e.message : e) });
  }
});

  /** POST /api/lab/workspace-auth/register-from-id-token — existing Firebase user (e.g. email/password) + admin approval gate. */
  routes.labWorkspaceAuthRegisterFromIdToken = onRequest(
  {
    ...CONSENT_STORE_FN_OPTS,
    secrets: [EASTER_EGG_MAILGUN_API_KEY, EASTER_EGG_MAILGUN_DOMAIN],
    environmentVariables: {
      LAB_APPROVAL_NOTIFY_EMAIL: LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT,
      LAB_APPROVAL_MAILGUN_REGION: '',
      LAB_APPROVAL_BASE_URL: labHostingOriginForFunctionConfig(),
      LAB_APPROVAL_MAIL_FROM: '',
    },
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const mailgunDomain = String(EASTER_EGG_MAILGUN_DOMAIN.value() || '').trim();
    const fallbackFrom = mailgunDomain ? `postmaster@${mailgunDomain}` : '';
    try {
      const result = await labWorkspaceAuthService.registerWorkspaceLabSessionFromIdTokenRequest(
        {
          idToken: body.idToken,
          firstName: body.firstName,
          lastName: body.lastName,
          origin: req.get('origin') || req.get('referer') || '',
        },
        {
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT).trim(),
          approvalBaseUrl: String(process.env.LAB_APPROVAL_BASE_URL || '').trim(),
          mailgunKey: EASTER_EGG_MAILGUN_API_KEY.value(),
          mailgunDomain,
          mailFrom: String(process.env.LAB_APPROVAL_MAIL_FROM || fallbackFrom).trim(),
          mailgunRegion: String(process.env.LAB_APPROVAL_MAILGUN_REGION || '').trim(),
        },
      );
      res.status(200).json(result);
    } catch (e) {
      const status = Number(e && e.status) || 400;
      res.status(status).json({ ok: false, code: e && e.code ? String(e.code) : '', error: String(e && e.message ? e.message : e) });
    }
  },
);

  /** POST /api/lab/workspace-auth/register-google — Google-verified signup (idToken) + admin approval gate. */
  routes.labWorkspaceAuthRegisterGoogle = onRequest(
  {
    ...CONSENT_STORE_FN_OPTS,
    secrets: [EASTER_EGG_MAILGUN_API_KEY, EASTER_EGG_MAILGUN_DOMAIN],
    environmentVariables: {
      LAB_APPROVAL_NOTIFY_EMAIL: LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT,
      LAB_APPROVAL_MAILGUN_REGION: '',
      LAB_APPROVAL_BASE_URL: labHostingOriginForFunctionConfig(),
      LAB_APPROVAL_MAIL_FROM: '',
    },
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const mailgunDomain = String(EASTER_EGG_MAILGUN_DOMAIN.value() || '').trim();
    const fallbackFrom = mailgunDomain ? `postmaster@${mailgunDomain}` : '';
    try {
      const result = await labWorkspaceAuthService.registerWorkspaceGoogleAuthRequest(
        {
          idToken: body.idToken,
          firstName: body.firstName,
          lastName: body.lastName,
          origin: req.get('origin') || req.get('referer') || '',
        },
        {
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || LAB_APPROVAL_NOTIFY_EMAIL_DEFAULT).trim(),
          approvalBaseUrl: String(process.env.LAB_APPROVAL_BASE_URL || '').trim(),
          mailgunKey: EASTER_EGG_MAILGUN_API_KEY.value(),
          mailgunDomain,
          mailFrom: String(process.env.LAB_APPROVAL_MAIL_FROM || fallbackFrom).trim(),
          mailgunRegion: String(process.env.LAB_APPROVAL_MAILGUN_REGION || '').trim(),
        },
      );
      res.status(200).json(result);
    } catch (e) {
      const status = Number(e && e.status) || 400;
      res.status(status).json({ ok: false, code: e && e.code ? String(e.code) : '', error: String(e && e.message ? e.message : e) });
    }
  },
);

  /** GET/PUT/POST /api/lab/generation-prefs — shared Portal + MCP profile generation config */
  routes.labGenerationPrefs = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
    setCors(res, 'GET, PUT, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const principal = await labGenerationPrefsAuth.resolveGenerationPrefsPrincipal(req, {
      labWorkspaceAuthService,
    });
    if (!principal.ok) {
      res.status(principal.status).json(principal.body);
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sandbox = String(
      (req.method === 'GET' ? (req.query && req.query.sandbox) : body.sandbox) || '',
    ).trim();
    if (!sandbox) {
      res.status(400).json({ ok: false, error: 'sandbox is required' });
      return;
    }

    if (req.method === 'GET') {
      try {
        const prefs = await labProfileGenerationPrefsStore.getPrefs(principal.uid, sandbox);
        res.status(200).json({ ok: true, prefs, authSource: principal.authSource });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
      }
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      try {
        const prefs = await labProfileGenerationPrefsStore.updatePrefs(principal.uid, sandbox, {
          baseEmail: body.baseEmail,
          mobilePhone: body.mobilePhone,
          counterN: body.counterN,
          resetCounter: !!body.resetCounter,
          testProfile: body.testProfile,
        });
        res.status(200).json({ ok: true, prefs, authSource: principal.authSource });
      } catch (e) {
        const status = Number(e && e.status) || 400;
        res.status(status).json({ ok: false, error: String(e.message || e), sandbox });
      }
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  });

  /** POST /api/lab/generation-prefs/next-email — atomically reserve scaled email + advance counter */
  routes.labGenerationPrefsNextEmail = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const principal = await labGenerationPrefsAuth.resolveGenerationPrefsPrincipal(req, {
      labWorkspaceAuthService,
    });
    if (!principal.ok) {
      res.status(principal.status).json(principal.body);
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sandbox = String((body.sandbox || (req.query && req.query.sandbox)) || '').trim();
    if (!sandbox) {
      res.status(400).json({ ok: false, error: 'sandbox is required' });
      return;
    }

    try {
      const reserved = await labProfileGenerationPrefsStore.reserveNextEmail(principal.uid, sandbox);
      res.status(200).json({ ok: true, ...reserved, authSource: principal.authSource });
    } catch (e) {
      const status = Number(e && e.status) || 400;
      res.status(status).json({ ok: false, error: String(e.message || e), sandbox });
    }
  });

  /** GET/POST /api/lab/recent-profiles — shared Portal + MCP recently generated list */
  routes.labRecentProfiles = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
    setCors(res, 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const principal = await labGenerationPrefsAuth.resolveGenerationPrefsPrincipal(req, {
      labWorkspaceAuthService,
    });
    if (!principal.ok) {
      res.status(principal.status).json(principal.body);
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sandbox = String(
      (req.method === 'GET' ? (req.query && req.query.sandbox) : body.sandbox) || '',
    ).trim();
    if (!sandbox) {
      res.status(400).json({ ok: false, error: 'sandbox is required' });
      return;
    }

    if (req.method === 'GET') {
      try {
        const listed = await labProfileRecentGeneratedStore.listItems(principal.uid, sandbox);
        res.status(200).json({
          ok: true,
          items: listed.items,
          sandbox: listed.sandbox,
          authSource: principal.authSource,
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
      }
      return;
    }

    if (req.method === 'POST') {
      try {
        const items = Array.isArray(body.items) ? body.items : null;
        if (items && items.length) {
          const listed = await labProfileRecentGeneratedStore.appendMany(
            principal.uid,
            sandbox,
            items.map((row) => ({ ...row, sandbox, source: row.source || body.source || 'portal' })),
          );
          res.status(200).json({
            ok: true,
            items: listed.items,
            sandbox: listed.sandbox,
            migrated: items.length,
            authSource: principal.authSource,
          });
          return;
        }

        const appended = await labProfileRecentGeneratedStore.appendItem(principal.uid, sandbox, {
          email: body.email || body.scaledEmail,
          ecid: body.ecid,
          industry: body.industry,
          summaryLabel: body.summaryLabel,
          generatedAt: body.generatedAt,
          source: body.source || 'portal',
          personName: body.personName,
          mobilePhone: body.mobilePhone,
          snapshot: body.snapshot,
          attributes: body.attributes,
          n: body.n,
          sandbox,
        });
        res.status(200).json({
          ok: true,
          item: appended.item,
          items: appended.items,
          sandbox,
          authSource: principal.authSource,
        });
      } catch (e) {
        const status = Number(e && e.status) || 400;
        res.status(status).json({ ok: false, error: String(e.message || e), sandbox });
      }
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  });

  /** POST /api/lab/mcp-first-run-setup — Coworker first-run foundations (MCP key or Firebase Auth) */
  routes.labMcpFirstRunSetup = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const principal = await labGenerationPrefsAuth.resolveGenerationPrefsPrincipal(req, {
      labWorkspaceAuthService,
    });
    if (!principal.ok) {
      res.status(principal.status).json(principal.body);
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sandbox = String(body.sandbox || (req.query && req.query.sandbox) || principal.keySandbox || '').trim().toLowerCase();
    if (!sandbox) {
      res.status(400).json({ ok: false, error: 'sandbox is required (body, query, or MCP key scope)' });
      return;
    }

    if (principal.authSource === 'mcp_key' && principal.keySandbox && principal.keySandbox !== sandbox) {
      res.status(403).json({
        ok: false,
        error: `MCP key is scoped to sandbox "${principal.keySandbox}" — cannot run first-run for "${sandbox}".`,
      });
      return;
    }

    try {
      const result = await labMcpFirstRunService.runFirstRunSetup({
        uid: principal.uid,
        principalEmail: principal.principalEmail || body.adobe_email || body.adobeEmail,
        sandbox,
        body,
      });
      res.status(200).json({ ...result, authSource: principal.authSource });
    } catch (e) {
      const status = Number(e && e.status) || 500;
      res.status(status).json({ ok: false, error: String(e.message || e), sandbox });
    }
  });

  /** GET /api/lab/workspace-auth/approve?uid=...&token=... — one-click account approval. */
  routes.labWorkspaceAuthApprove = onRequest(
  {
    ...CONSENT_STORE_FN_OPTS,
    secrets: [EASTER_EGG_MAILGUN_API_KEY, EASTER_EGG_MAILGUN_DOMAIN],
    environmentVariables: {
      LAB_APPROVAL_MAILGUN_REGION: '',
      LAB_APPROVAL_BASE_URL: labHostingOriginForFunctionConfig(),
      LAB_APPROVAL_MAIL_FROM: '',
    },
  },
  async (req, res) => {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  function htmlPage(title, body, ok) {
    const tone = ok ? '#0f9d58' : '#d93025';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Inter,Arial,sans-serif;background:#f5f6fb;color:#121212;padding:24px;"><div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #e5e7ef;border-radius:14px;padding:20px;box-shadow:0 8px 28px rgba(20,25,40,.08);"><h1 style="margin:0 0 10px;font-size:24px;color:${tone};">${title}</h1><p style="margin:0 0 12px;line-height:1.5;">${body}</p><p style="margin:0;color:#61656f;font-size:13px;">AEP Orchestration Lab workspace approval</p></div></body></html>`;
  }

  const mailgunDomain = String(EASTER_EGG_MAILGUN_DOMAIN.value() || '').trim();
  const fallbackFrom = mailgunDomain ? `postmaster@${mailgunDomain}` : '';
  try {
    const result = await labWorkspaceAuthService.approveWorkspaceAuthRequest(
      {
        uid: req.query.uid,
        token: req.query.token,
        origin: req.get('origin') || req.get('referer') || '',
      },
      {
        approvalBaseUrl: String(process.env.LAB_APPROVAL_BASE_URL || '').trim(),
        mailgunKey: EASTER_EGG_MAILGUN_API_KEY.value(),
        mailgunDomain,
        mailFrom: String(process.env.LAB_APPROVAL_MAIL_FROM || fallbackFrom).trim(),
        mailgunRegion: String(process.env.LAB_APPROVAL_MAILGUN_REGION || '').trim(),
      },
    );
    if (result.status === 'already_approved') {
      res.status(200).send(htmlPage('Already approved', `This account is already approved${result.adobeEmail ? ` (${result.adobeEmail})` : ''}.`, true));
      return;
    }
    res.status(200).send(htmlPage('Approval successful', `The account${result.adobeEmail ? ` (${result.adobeEmail})` : ''} is now approved and can sign in.`, true));
  } catch (e) {
    const code = Number(e && e.status) || 400;
    res.status(code).send(htmlPage('Approval failed', String(e && e.message ? e.message : e), false));
  }
},
);

  return routes;
}

module.exports = { registerLabRoutes };
