'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');
const { validateTarget, validateBatchTarget, MAX_BATCH_TARGETS, UUID } = require('./platformCleanupService');

function registerPlatformCleanupRoutes(deps) {
  const {
    onRequest, profileFnOpts, setCors, getAdobeAccessToken, ADOBE_CLIENT_ID, ADOBE_IMS_ORG,
    mcpApiKeyStore, platformCleanupService: service, platformCleanupStore: store,
  } = deps;
  const platformCleanupProxy = onRequest({ ...profileFnOpts, timeoutSeconds: 300 }, async (req, res) => {
    setCors(res, 'GET, POST, DELETE, OPTIONS');
    res.set('Cache-Control', 'private, no-store');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    try {
      const principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore, deps);
      if (!principal.ok) return res.status(principal.status).json(principal.body);
      const input = req.method === 'GET' ? (req.query || {}) : (req.body || {});
      const sandbox = String(input.sandbox || principal.sandbox).toLowerCase();
      if (sandbox !== String(principal.sandbox).toLowerCase()
          || (req.query?.sandbox && String(req.query.sandbox).toLowerCase() !== sandbox)) {
        return res.status(403).json({ ok: false, error: 'Sandbox does not match the authenticated principal scope.' });
      }
      const orgId = ADOBE_IMS_ORG.value();
      if (req.headers['x-gw-ims-org-id'] && req.headers['x-gw-ims-org-id'] !== orgId) {
        return res.status(403).json({ ok: false, error: 'Adobe organisation does not match the configured platform organisation.' });
      }
      const type = input.resource_type;
      const id = input.resource_id;
      if (req.method === 'POST' && !['inventory', 'plan', 'apply', 'verify'].includes(input.operation)) {
        return res.status(400).json({ ok: false, error: 'operation must be inventory, plan, apply, or verify.' });
      }
      if (req.method !== 'POST') {
        if (!['dataset', 'schema'].includes(type)) {
          return res.status(400).json({ ok: false, error: 'resource_type must be dataset or schema.' });
        }
        if (id || req.method === 'DELETE') validateTarget(type, id);
      }
      if (req.method === 'DELETE' && (input.confirmed !== true || input.usage_cleared !== true
          || typeof input.expected_name !== 'string' || !input.expected_name
          || !/^[a-f0-9-]{36}$/i.test(input.audit_id || ''))) {
        return res.status(400).json({ ok: false, error: 'Exact resource_id, expected_name, audit_id, confirmed=true and usage_cleared=true are required.' });
      }
      if (input.name !== undefined && (typeof input.name !== 'string' || input.name.length > 200)) {
        return res.status(400).json({ ok: false, error: 'name must be a string of at most 200 characters.' });
      }
      const auth = { token: await getAdobeAccessToken(), clientId: ADOBE_CLIENT_ID.value(), orgId, sandbox };
      if (req.method === 'POST') {
        const scope = { principalUid: principal.principalUid, orgId, sandbox };
        const targets = input.targets;
        if (['inventory', 'plan'].includes(input.operation)) {
          if (!Array.isArray(targets) || targets.length === 0 || targets.length > MAX_BATCH_TARGETS) {
            return res.status(400).json({ ok: false, error: `targets must contain 1-${MAX_BATCH_TARGETS} exact resources.` });
          }
          for (const target of targets) validateBatchTarget(target);
          const identities = targets.map((target) => target.resource_id);
          if (new Set(identities).size !== identities.length) {
            return res.status(400).json({ ok: false, error: 'Duplicate target IDs are not allowed, including across resource types.' });
          }
        }
        if (input.operation === 'inventory') {
          const payload = await service.batchInventory(auth, { targets });
          return res.status(200).json({ ok: true, sandbox, orgId, ...payload });
        }
        if (input.operation === 'plan') {
          const reviewed = await service.plan(auth, { targets });
          const safeTargets = targets.map(({ resource_type, resource_id }) => ({ resource_type, resource_id }));
          const ticket = await store.savePlan({ ...scope, ...reviewed, targets: safeTargets });
          const { state_fingerprint: _fingerprint, ...safePlan } = reviewed;
          return res.status(200).json({
            ok: true, sandbox, orgId, ...safePlan,
            confirmation: {
              ...ticket, expected_count: reviewed.expected_count,
              instruction: 'Review this exact manifest and all blockers. Apply is unavailable unless a fresh plan is unblocked and explicitly confirmed.',
            },
          });
        }
        if (input.operation === 'apply') {
          if (typeof input.plan_id !== 'string' || !UUID.test(input.plan_id)
              || typeof input.manifest_digest !== 'string' || !/^[a-f0-9]{64}$/i.test(input.manifest_digest)
              || input.confirmed !== true || input.usage_cleared !== true || input.non_atomic_delete_acknowledged !== true
              || !Number.isInteger(input.expected_count) || input.expected_count < 1 || input.expected_count > MAX_BATCH_TARGETS) {
            return res.status(400).json({
              ok: false,
              error: 'plan_id, manifest_digest, expected_count, confirmed=true, usage_cleared=true and non_atomic_delete_acknowledged=true are required.',
            });
          }
          const claimed = await store.claimPlan(input.plan_id, scope, {
            manifest_digest: input.manifest_digest, expected_count: input.expected_count,
          });
          if (claimed.expired) {
            return res.status(409).json({
              ok: false, status: 'expired', replayed: claimed.replayed,
              instruction: 'Plan expired before it could be claimed. Create a fresh plan; no DELETE was issued.',
            });
          }
          if (!claimed.claimed) {
            const state = claimed.execution?.state || claimed.plan.state;
            const succeeded = state === 'succeeded';
            return res.status(succeeded ? 200 : 409).json({
              ok: succeeded,
              status: state,
              replayed: claimed.replayed,
              blockers: claimed.execution?.blockers || claimed.plan.blockers || [],
              execution: claimed.execution,
            });
          }
          const execution = await service.apply(auth, claimed.plan, store);
          const succeeded = execution.state === 'succeeded';
          console.info('[platformCleanup] batch result', {
            principalUid: principal.principalUid, sandbox, plan_id: input.plan_id,
            state: execution.state, delete_requests_issued: execution.delete_requests_issued,
          });
          return res.status(succeeded ? 200 : 409).json({
            ok: succeeded, status: execution.state,
            delete_requests_issued: execution.delete_requests_issued,
            blockers: execution.blockers || [], execution,
            instruction: succeeded
              ? 'Every exact target has a durable successful result and GET 404 readback. Run verify for the protected metadata baseline.'
              : 'Execution stopped. Inspect per-target results and verify readback. Never replay; review and confirm a fresh plan for remaining targets.',
          });
        }
        if (input.operation === 'verify') {
          if (typeof input.plan_id !== 'string' || !UUID.test(input.plan_id)) {
            return res.status(400).json({ ok: false, error: 'An exact plan_id is required.' });
          }
          const { plan, execution } = await store.getExecution(input.plan_id, scope);
          const result = await service.verify(auth, plan, execution);
          return res.status(200).json({ ok: true, sandbox, orgId, ...result });
        }
        return res.status(400).json({ ok: false, error: 'operation must be inventory, plan, apply, or verify.' });
      }
      const scope = { principalUid: principal.principalUid, orgId, sandbox, resource_type: type, resource_id: id };
      let payload;
      if (req.method === 'GET' && !id) {
        payload = await service.list(auth, input);
      } else if (req.method === 'GET') {
        const audit = await service.audit(auth, input);
        const ticket = audit.deleteReviewReady
          ? await store.saveAudit({ ...scope, expected_name: audit.resource.name, fingerprint: audit.fingerprint }) : null;
        const { fingerprint: _fingerprint, etag: _etag, ...review } = audit;
        payload = {
          ...review,
          confirmation: ticket ? { ...ticket, ...scope, principalUid: undefined, expected_name: audit.resource.name,
            instruction: 'Obtain explicit confirmation of this exact resource and independently clear downstream usage before deletion.' } : null,
        };
      } else {
        const approved = await store.consumeAudit(input.audit_id, { ...scope, expected_name: input.expected_name });
        payload = await service.remove(auth, input, approved);
      }
      console.info('[platformCleanup]', {
        principalUid: principal.principalUid, sandbox, orgId, type, id: id || null, method: req.method, result: 'ok',
      });
      return res.status(200).json({ ok: true, sandbox, orgId, ...payload });
    } catch (error) {
      console.error('[platformCleanup] failed', {
        method: req.method, status: error.status || 500, message: error.message,
        ...(error.detail?.reason ? {
          inventory: error.detail.inventory, page: error.detail.page, reason: error.detail.reason,
        } : {}),
      });
      const status = error.status >= 400 && error.status <= 599 ? error.status : 500;
      return res.status(status).json({ ok: false, error: error.message, detail: error.detail || null });
    }
  });
  return { platformCleanupProxy };
}

module.exports = { registerPlatformCleanupRoutes };
