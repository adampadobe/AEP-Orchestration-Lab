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
  } = deps;

  const routes = {};

  /** GET /api/env-bar-config?demoId=ksia — remote env bar defaults (Firestore envBarConfigs/{demoId}) */
  routes.envBarConfig = onRequest(profileFnOpts, async (req, res) => {
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
    const body = req.body && typeof req.body === 'object' ? req.body : {};
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
      LAB_APPROVAL_NOTIFY_EMAIL: 'apalmer@adobe.com',
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
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || 'apalmer@adobe.com').trim(),
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
      LAB_APPROVAL_NOTIFY_EMAIL: 'apalmer@adobe.com',
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
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || 'apalmer@adobe.com').trim(),
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
      LAB_APPROVAL_NOTIFY_EMAIL: 'apalmer@adobe.com',
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
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || 'apalmer@adobe.com').trim(),
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
      LAB_APPROVAL_NOTIFY_EMAIL: 'apalmer@adobe.com',
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
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || 'apalmer@adobe.com').trim(),
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
      LAB_APPROVAL_NOTIFY_EMAIL: 'apalmer@adobe.com',
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
          notifyEmail: String(process.env.LAB_APPROVAL_NOTIFY_EMAIL || 'apalmer@adobe.com').trim(),
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

  /** GET /api/lab/workspace-auth/approve?uid=...&token=... — one-click account approval. */
  routes.labWorkspaceAuthApprove = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
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

  try {
    const result = await labWorkspaceAuthService.approveWorkspaceAuthRequest({
      uid: req.query.uid,
      token: req.query.token,
    });
    if (result.status === 'already_approved') {
      res.status(200).send(htmlPage('Already approved', `This account is already approved${result.adobeEmail ? ` (${result.adobeEmail})` : ''}.`, true));
      return;
    }
    res.status(200).send(htmlPage('Approval successful', `The account${result.adobeEmail ? ` (${result.adobeEmail})` : ''} is now approved and can sign in.`, true));
  } catch (e) {
    const code = Number(e && e.status) || 400;
    res.status(code).send(htmlPage('Approval failed', String(e && e.message ? e.message : e), false));
  }
});

  return routes;
}

module.exports = { registerLabRoutes };
