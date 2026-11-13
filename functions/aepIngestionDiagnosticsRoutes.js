'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');

const SKIP_ACTIONS = new Set(['profile_seed_schedule_skip_preview', 'profile_seed_schedule_skip_apply']);

function validateSkipInput(body, query = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !SKIP_ACTIONS.has(body.action)) return false;
  if (Object.keys(query).some((key) => key !== 'action') || (query.action !== undefined && query.action !== body.action)) return false;
  const preview = body.action === 'profile_seed_schedule_skip_preview';
  const keys = preview
    ? ['action', 'sandbox', 'day', 'slot_id', 'allow_verified_idle_runs']
    : ['action', 'sandbox', 'plan_id', 'manifest_digest', 'expected_count', 'confirmed', 'skip_only_acknowledged', 'idle_readiness_acknowledged', 'confirmation_phrase'];
  if (Object.keys(body).some((key) => !keys.includes(key))) return false;
  if (body.sandbox !== undefined && (typeof body.sandbox !== 'string' || !body.sandbox.trim())) return false;
  if (preview) {
    return typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
      && Number.isFinite(Date.parse(`${body.day}T00:00:00Z`))
      && new Date(`${body.day}T00:00:00Z`).toISOString().slice(0, 10) === body.day
      && body.slot_id === '15'
      && (body.allow_verified_idle_runs === undefined || typeof body.allow_verified_idle_runs === 'boolean');
  }
  return typeof body.plan_id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.plan_id)
    && typeof body.manifest_digest === 'string' && /^[a-f0-9]{64}$/i.test(body.manifest_digest)
    && Number.isInteger(body.expected_count) && body.expected_count >= 1 && body.expected_count <= 3
    && body.confirmed === true && body.skip_only_acknowledged === true
    && (body.idle_readiness_acknowledged === undefined || body.idle_readiness_acknowledged === true)
    && typeof body.confirmation_phrase === 'string' && body.confirmation_phrase.length >= 1 && body.confirmation_phrase.length <= 512;
}

function registerAepIngestionDiagnosticsRoutes(deps) {
  const {
    onRequest, profileFnOpts, setCors, mcpApiKeyStore, getAdobeAccessToken,
    ADOBE_CLIENT_ID, ADOBE_IMS_ORG, ingestionDiagnosticsService: service,
    profileSeedScheduleDiagnose, profileSeedScheduleSkipPreview, profileSeedScheduleSkipApply,
  } = deps;
  const aepIngestionDiagnosticsProxy = onRequest({ ...profileFnOpts, timeoutSeconds: 300 }, async (req, res) => {
    setCors(res, 'GET, POST, OPTIONS');
    res.set('Cache-Control', 'private, no-store');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).set('Allow', 'GET, POST, OPTIONS').json({ ok: false, error: 'Use GET for diagnostics or POST for reviewed schedule recovery.' });
    const mutation = req.method === 'POST';
    if (mutation && !validateSkipInput(req.body, req.query)) {
      return res.status(400).json({ ok: false, error: 'Invalid schedule recovery action or input.' });
    }
    if (!mutation && SKIP_ACTIONS.has(req.query?.action)) {
      return res.status(405).set('Allow', 'POST, OPTIONS').json({ ok: false, error: 'Schedule recovery requires POST.' });
    }
    try {
      const principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore, deps);
      if (!principal.ok) return res.status(principal.status).json(principal.body);
      const input = mutation ? req.body : req.query || {};
      const sandbox = String(input.sandbox || principal.sandbox || '').trim().toLowerCase();
      if (!sandbox || sandbox !== String(principal.sandbox).trim().toLowerCase()) {
        return res.status(403).json({ ok: false, error: 'Sandbox does not match the authenticated principal scope.' });
      }
      const orgId = ADOBE_IMS_ORG.value();
      if (req.headers['x-gw-ims-org-id'] && req.headers['x-gw-ims-org-id'] !== orgId) {
        return res.status(403).json({ ok: false, error: 'Adobe organisation does not match the configured organisation.' });
      }
      if (!mutation && !['batch_diagnose', 'flow_run_status', 'profile_seed_schedule_diagnose'].includes(input.action)) {
        return res.status(400).json({ ok: false, error: 'Unsupported diagnostics action.' });
      }
      const auth = { token: await getAdobeAccessToken(), clientId: ADOBE_CLIENT_ID.value(), orgId, sandbox };
      if (mutation) {
        const { action, sandbox: _sandbox, ...recoveryInput } = input;
        const recover = action === 'profile_seed_schedule_skip_preview' ? profileSeedScheduleSkipPreview : profileSeedScheduleSkipApply;
        return res.status(200).json(await recover({ principal, auth, input: recoveryInput }));
      }
      const payload = input.action === 'batch_diagnose'
        ? await service.batchDiagnose(auth, input)
        : input.action === 'flow_run_status'
          ? await service.flowRunStatus(auth, input)
          : await profileSeedScheduleDiagnose({ principal, auth });
      return res.status(200).json(payload);
    } catch (error) {
      const status = Number(error.status) >= 400 && Number(error.status) <= 599 ? Number(error.status) : 500;
      console.error('[aepIngestionDiagnostics] request failed', { status, action: mutation ? req.body.action : req.query?.action });
      return res.status(status).json({ ok: false, error: String(error.message || error), platform_response: error.platformResponse ?? null });
    }
  });
  return { aepIngestionDiagnosticsProxy };
}

module.exports = { registerAepIngestionDiagnosticsRoutes };
