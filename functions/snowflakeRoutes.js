/**
 * Snowflake integration routes — extracted from index.js (Phase B).
 */

/**
 * @param {object} deps
 * @returns {Record<string, import('firebase-functions/v2/https').HttpsFunction>}
 */
function registerSnowflakeRoutes(deps) {
  const {
    onRequest,
    SNOWFLAKE_FN_OPTS,
    SNOWFLAKE_AGENTIC_FN_OPTS,
    setCors,
    resolveSandboxFromQuery,
    labUserSandboxStore,
    snowflakeService,
    snowflakeDataGeneratorService,
    snowflakeAgenticTravelService,
  } = deps;

  const routes = {};

  /**
   * GET /api/snowflake/config?sandbox=… — public projection of saved Snowflake
   * config for the signed-in lab user. Never returns the credential value.
 *
   * POST /api/snowflake/config — body { sandbox, account, user, role,
   * warehouse, database, schema, authMethod, credential?, keyPassphrase?,
   * clearCredential?, clearKeyPassphrase? }. Stores the credential in Secret
   * Manager (one secret per labUser+sandbox) and returns the public projection.
 */
  routes.snowflakeConfig = onRequest(SNOWFLAKE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({
      ok: false,
      error: 'Sign in required to manage Snowflake config (anonymous sign-in is enough).',
    });
    return;
  }

  const sandbox = (req.method === 'POST' && req.body?.sandbox)
    ? String(req.body.sandbox).trim()
    : resolveSandboxFromQuery(req);
  if (!sandbox) {
    res.status(400).json({ ok: false, error: 'sandbox is required' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const record = await snowflakeService.handleConfigGet({ labUser: uid, sandbox });
      res.status(200).json({ ok: true, sandbox, record });
    } catch (e) {
      console.error('[snowflakeConfig:get]', String(e && e.message || e));
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const record = await snowflakeService.handleConfigPut({ labUser: uid, sandbox, payload: body });
      res.status(200).json({ ok: true, sandbox, record });
    } catch (e) {
      console.error('[snowflakeConfig:post]', String(e && e.message || e));
      res.status(400).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
});

  /**
   * POST /api/snowflake/connection-test — opens a Snowflake connection using
   * the saved config + Secret Manager credential and runs a single
   * `SELECT CURRENT_VERSION()`. Bubbles up Snowflake errors verbatim so
   * the caller can see things like "IP not allowed by network policy" and
   * paste the lab's reserved static IP into Snowflake.
 */
  routes.snowflakeConnectionTest = onRequest(SNOWFLAKE_FN_OPTS, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({
      ok: false,
      error: 'Sign in required to test Snowflake connection (anonymous sign-in is enough).',
    });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);
  if (!sandbox) {
    res.status(400).json({ ok: false, error: 'sandbox is required' });
    return;
  }

  try {
    const result = await snowflakeService.handleConnectionTest({ labUser: uid, sandbox });
    res.status(result.ok ? 200 : 400).json({ ok: result.ok, sandbox, result });
  } catch (e) {
    console.error('[snowflakeConnectionTest]', String(e && e.message || e));
    res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
  }
});

  /**
   * POST /api/snowflake/generate-base-profiles — body { sandbox, count?, table?,
   * batchSize?, startIndex? }. Generates N base profiles using Faker (Phase 2
   * minimal port of AgenticAI Demo's data_generator.py) and INSERTs them into
   * the user's Snowflake target. Idempotent CREATE TABLE IF NOT EXISTS for
   * first-run targets. Returns rowcount + first 3 generated rows so the UI
   * can render a sample without a separate SELECT round-trip.
 */
  /**
   * POST /api/snowflake/agentic/query-profiles — body { sandbox, filterType?,
   * timePeriod?, limit? }. Same semantics as AgenticAI `/api/query-profiles`.
 */
  routes.snowflakeAgenticQueryProfiles = onRequest(SNOWFLAKE_FN_OPTS, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({
      ok: false,
      error: 'Sign in required (anonymous sign-in is enough).',
    });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);
  if (!sandbox) {
    res.status(400).json({ ok: false, error: 'sandbox is required' });
    return;
  }
  try {
    const result = await snowflakeAgenticTravelService.handleQueryProfiles({
      labUser: uid,
      sandbox,
      filterType: body.filterType,
      timePeriod: body.timePeriod,
      limit: body.limit,
    });
    res.status(result.ok ? 200 : 400).json({ ok: result.ok, sandbox, result });
  } catch (e) {
    console.error('[snowflakeAgenticQueryProfiles]', String(e && e.message || e));
    res.status(400).json({ ok: false, error: String(e.message || e), sandbox });
  }
});

  /**
   * POST /api/snowflake/agentic/table-structure — body { sandbox, phase }.
   * phase: phase1 | phase2 | phase3 (AgenticAI PHASE_TABLES).
 */
  routes.snowflakeAgenticTableStructure = onRequest(SNOWFLAKE_FN_OPTS, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({
      ok: false,
      error: 'Sign in required (anonymous sign-in is enough).',
    });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);
  if (!sandbox) {
    res.status(400).json({ ok: false, error: 'sandbox is required' });
    return;
  }
  try {
    const result = await snowflakeAgenticTravelService.handleTableStructure({
      labUser: uid,
      sandbox,
      phase: body.phase,
    });
    res.status(result.ok ? 200 : 400).json({ ok: result.ok, sandbox, result });
  } catch (e) {
    console.error('[snowflakeAgenticTableStructure]', String(e && e.message || e));
    res.status(400).json({ ok: false, error: String(e.message || e), sandbox });
  }
});

  /**
   * POST /api/snowflake/agentic/generate-full — body { sandbox, count }.
   * Forwards to Python runner when AGENTIC_TRAVEL_RUNNER_* env is set.
 */
  routes.snowflakeAgenticGenerateFull = onRequest(SNOWFLAKE_AGENTIC_FN_OPTS, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({
      ok: false,
      error: 'Sign in required (anonymous sign-in is enough).',
    });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);
  if (!sandbox) {
    res.status(400).json({ ok: false, error: 'sandbox is required' });
    return;
  }
  try {
    const result = await snowflakeAgenticTravelService.handleAgenticGenerateFull({
      labUser: uid,
      sandbox,
      count: body.count,
    });
    const httpStatus = result.ok
      ? 200
      : (result.error && result.error.code === 'RUNNER_NOT_CONFIGURED' ? 501 : 400);
    res.status(httpStatus).json({ ok: result.ok, sandbox, result });
  } catch (e) {
    console.error('[snowflakeAgenticGenerateFull]', String(e && e.message || e));
    res.status(400).json({ ok: false, error: String(e.message || e), sandbox });
  }
});

  /**
   * POST /api/snowflake/agentic/enrich-profiles — body { sandbox, profiles, eventTypes }.
   * Forwards to Python runner when AGENTIC_TRAVEL_RUNNER_* env is set.
 */
  routes.snowflakeAgenticEnrichProfiles = onRequest(SNOWFLAKE_AGENTIC_FN_OPTS, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({
      ok: false,
      error: 'Sign in required (anonymous sign-in is enough).',
    });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);
  if (!sandbox) {
    res.status(400).json({ ok: false, error: 'sandbox is required' });
    return;
  }
  try {
    const result = await snowflakeAgenticTravelService.handleAgenticEnrich({
      labUser: uid,
      sandbox,
      profiles: body.profiles,
      eventTypes: body.eventTypes,
    });
    const httpStatus = result.ok
      ? 200
      : (result.error && result.error.code === 'RUNNER_NOT_CONFIGURED' ? 501 : 400);
    res.status(httpStatus).json({ ok: result.ok, sandbox, result });
  } catch (e) {
    console.error('[snowflakeAgenticEnrichProfiles]', String(e && e.message || e));
    res.status(400).json({ ok: false, error: String(e.message || e), sandbox });
  }
});

  routes.snowflakeGenerateBaseProfiles = onRequest(
  { ...SNOWFLAKE_FN_OPTS, timeoutSeconds: 300, memory: '1GiB' },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

    const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
    if (!uid) {
      res.status(401).json({
        ok: false,
        error: 'Sign in required to generate Snowflake profiles (anonymous sign-in is enough).',
      });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);
    if (!sandbox) {
      res.status(400).json({ ok: false, error: 'sandbox is required' });
      return;
    }

    try {
      const result = await snowflakeDataGeneratorService.handleGenerateBaseProfiles({
        labUser: uid,
        sandbox,
        count: Number(body.count),
        table: body.table,
        batchSize: Number(body.batchSize) || undefined,
        startIndex: Number(body.startIndex) || undefined,
      });
      res.status(result.ok ? 200 : 400).json({ ok: result.ok, sandbox, result });
    } catch (e) {
      console.error('[snowflakeGenerateBaseProfiles]', String(e && e.message || e));
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
  }
);

  return routes;
}

module.exports = { registerSnowflakeRoutes };
