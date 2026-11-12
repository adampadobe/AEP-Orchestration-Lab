'use strict';

const admin = require('firebase-admin');
const { randomUUID, createHash } = require('node:crypto');

const TTL_MS = 15 * 60 * 1000;
const MAX_PLAN_BYTES = 700_000;
const EXECUTION_LEASE_MS = 360_000;
function lockId(scope) {
  return createHash('sha256').update(JSON.stringify([scope.orgId, scope.sandbox])).digest('hex');
}
function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function createPlatformCleanupStore({ db = getDb, now = Date.now } = {}) {
  async function saveAudit(plan) {
    const id = randomUUID();
    const expiresAtMs = now() + TTL_MS;
    await db().collection('platformCleanupAudits').doc(id).create({
      ...plan, expiresAtMs, used: false,
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
    });
    return { audit_id: id, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  async function consumeAudit(id, expected) {
    const database = db();
    const ref = database.collection('platformCleanupAudits').doc(id);
    return database.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const plan = snap.exists ? snap.data() : null;
      if (!plan || plan.used || !Number.isFinite(plan.expiresAtMs) || plan.expiresAtMs <= now()
          || Object.entries(expected).some(([key, value]) => plan[key] !== value)) {
        throw Object.assign(new Error('Audit is missing, expired, used, or belongs to a different principal/resource. Run a fresh audit.'), { status: 409 });
      }
      tx.update(ref, { used: true });
      return plan;
    });
  }

  async function savePlan(plan) {
    const id = randomUUID();
    const expiresAtMs = now() + TTL_MS;
    const stored = {
      ...plan,
      operation: plan.operation || 'delete',
      plan_id: id,
      state: 'planned',
      createdAtMs: now(),
      expiresAtMs,
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
    };
    if (Buffer.byteLength(JSON.stringify(stored)) > MAX_PLAN_BYTES) {
      throw Object.assign(new Error('Plan exceeds the durable storage limit; reduce the reviewed scope.'), { status: 413 });
    }
    await db().collection('platformCleanupPlans').doc(id).create(stored);
    return {
      plan_id: id,
      expiresAt: new Date(expiresAtMs).toISOString(),
      manifest_digest: plan.state_fingerprint,
      status: plan.status,
    };
  }

  async function getPlan(id, expected) {
    const ref = db().collection('platformCleanupPlans').doc(id);
    const snap = await ref.get();
    const plan = snap.exists ? snap.data() : null;
    if (!plan
        || Object.entries(expected).some(([key, value]) => plan[key] !== value)) {
      throw Object.assign(new Error('Plan is missing or belongs to a different principal, organisation, or sandbox.'), { status: 409 });
    }
    return plan;
  }

  async function claimPlan(id, expected, { manifest_digest, expected_count }) {
    const database = db();
    const planRef = database.collection('platformCleanupPlans').doc(id);
    const executionRef = database.collection('platformCleanupExecutions').doc(id);
    return database.runTransaction(async (tx) => {
      const snap = await tx.get(planRef);
      const plan = snap.exists ? snap.data() : null;
      if (!plan || (plan.operation || 'delete') !== (expected.operation || 'delete')
          || Object.entries(expected).some(([key, value]) => plan[key] !== value)
          || plan.state_fingerprint !== manifest_digest || plan.expected_count !== expected_count) {
        throw Object.assign(new Error('Plan is missing, expired, stale, or bound to a different scope/count.'), { status: 409 });
      }
      const existing = await tx.get(executionRef);
      if (existing.exists) {
        return { claimed: false, replayed: true, plan, execution: existing.data() };
      }
      if (!Number.isFinite(plan.expiresAtMs) || plan.expiresAtMs <= now() || plan.state === 'expired') {
        if (plan.state !== 'expired') tx.update(planRef, { state: 'expired', updatedAtMs: now() });
        return { claimed: false, expired: true, replayed: plan.state === 'expired', plan: { ...plan, state: 'expired' }, execution: null };
      }
      if (plan.state !== 'planned') {
        return { claimed: false, replayed: true, plan, execution: null };
      }
      const blocked = plan.status !== 'ready' || (Array.isArray(plan.blockers) && plan.blockers.length > 0);
      const lockRef = database.collection('platformCleanupLocks').doc(lockId(plan));
      const lockSnap = await tx.get(lockRef);
      if (!blocked && lockSnap.exists && lockSnap.data().active
          && (!Number.isFinite(lockSnap.data().expiresAtMs) || lockSnap.data().expiresAtMs > now())) {
        throw Object.assign(new Error('Another cleanup execution owns this organisation/sandbox. Verify its result before submitting a fresh plan.'), { status: 409 });
      }
      const items = Object.fromEntries(plan.targets.map((target) => [
        `${target.resource_type}:${target.resource_id}`,
        { resource_type: target.resource_type, resource_id: target.resource_id, status: 'not_attempted' },
      ]));
      const execution = {
        plan_id: id,
        principalUid: plan.principalUid,
        orgId: plan.orgId,
        sandbox: plan.sandbox,
        operation: plan.operation || 'delete',
        manifest_digest,
        state: blocked ? 'blocked' : 'applying',
        claimedAtMs: now(),
        updatedAtMs: now(),
        items,
        blockers: blocked ? plan.blockers : [],
      };
      tx.create(executionRef, execution);
      if (!blocked) {
        const lease = { plan_id: id, active: true, expiresAtMs: now() + EXECUTION_LEASE_MS };
        if (lockSnap.exists) tx.update(lockRef, lease);
        else tx.create(lockRef, lease);
      }
      tx.update(planRef, { state: execution.state });
      return { claimed: !blocked, blocked, replayed: false, plan, execution };
    });
  }

  async function recordItemIntent(id, identity, intent) {
    if (!intent || typeof intent !== 'object'
        || !['flow', 'dataset', 'schema', 'descriptor', 'sourceConnection', 'targetConnection', 'baseConnection', 'account'].includes(intent.resource_type)
        || typeof intent.resource_id !== 'string'
        || identity !== `${intent.resource_type}:${intent.resource_id}`
        || !['DELETE', 'DISABLE_FLOW'].includes(intent.operation)
        || (intent.operation === 'DISABLE_FLOW' && intent.resource_type !== 'flow')) {
      throw Object.assign(new Error('Invalid durable cleanup item intent.'), { status: 400 });
    }
    const safeIntent = {
      resource_type: intent.resource_type,
      resource_id: intent.resource_id,
      operation: intent.operation,
      ...(typeof intent.state_fingerprint === 'string' ? { state_fingerprint: intent.state_fingerprint } : {}),
    };
    const ref = db().collection('platformCleanupExecutions').doc(id);
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const execution = snap.exists ? snap.data() : null;
      const previous = execution?.items?.[identity];
      const planSnap = await tx.get(db().collection('platformCleanupPlans').doc(id));
      const plan = planSnap.exists ? planSnap.data() : null;
      const lockSnap = execution ? await tx.get(db().collection('platformCleanupLocks').doc(lockId(execution))) : null;
      const lease = lockSnap?.exists ? lockSnap.data() : null;
      if (!execution || execution.state !== 'applying' || !previous || previous.status !== 'not_attempted') {
        throw Object.assign(new Error('Execution is not claimable for a new item intent.'), { status: 409 });
      }
      if ((plan?.operation || 'delete') !== (intent.operation === 'DELETE' ? 'delete' : 'disable')
          || execution.operation !== (plan?.operation || 'delete')) {
        throw Object.assign(new Error('The item operation does not match the confirmed plan.'), { status: 409 });
      }
      if (!plan || !Number.isFinite(plan.expiresAtMs) || plan.expiresAtMs <= now()
          || !lease?.active || lease.plan_id !== id || !Number.isFinite(lease.expiresAtMs) || lease.expiresAtMs <= now()) {
        throw Object.assign(new Error('Plan or execution lease expired before the next mutation intent.'), { status: 409 });
      }
      const items = {
        ...execution.items,
        [identity]: { ...safeIntent, status: 'intent_recorded', intentAtMs: now() },
      };
      tx.update(ref, { items, updatedAtMs: now() });
      return items[identity];
    });
  }

  async function recordItemResult(id, identity, result) {
    if (!result || !['succeeded', 'failed', 'uncertain'].includes(result.status)) {
      throw Object.assign(new Error('Invalid durable cleanup item result status.'), { status: 400 });
    }
    const safeResult = {
      status: result.status,
      ...(Number.isInteger(result.http_status) && result.http_status >= 100 && result.http_status <= 599
        ? { http_status: result.http_status } : {}),
      ...(typeof result.request_id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(result.request_id)
        ? { request_id: result.request_id } : {}),
      ...(typeof result.error_code === 'string' && /^[A-Z0-9_-]{1,80}$/i.test(result.error_code)
        ? { error_code: result.error_code } : {}),
    };
    const ref = db().collection('platformCleanupExecutions').doc(id);
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const execution = snap.exists ? snap.data() : null;
      const previous = execution?.items?.[identity];
      if (!execution || execution.state !== 'applying' || !previous || previous.status !== 'intent_recorded') {
        throw Object.assign(new Error('A durable item intent is required before recording its result.'), { status: 409 });
      }
      const items = {
        ...execution.items,
        [identity]: { ...previous, ...safeResult, resultAtMs: now() },
      };
      tx.update(ref, { items, updatedAtMs: now() });
      return items[identity];
    });
  }

  async function finishExecution(id, state, detail = {}) {
    if (!['succeeded', 'failed', 'uncertain', 'blocked', 'expired', 'draining'].includes(state)) {
      throw Object.assign(new Error('Invalid terminal execution state.'), { status: 400 });
    }
    const database = db();
    const executionRef = database.collection('platformCleanupExecutions').doc(id);
    const planRef = database.collection('platformCleanupPlans').doc(id);
    return database.runTransaction(async (tx) => {
      const executionSnap = await tx.get(executionRef);
      const execution = executionSnap.exists ? executionSnap.data() : null;
      const planSnap = await tx.get(planRef);
      const plan = planSnap.exists ? planSnap.data() : null;
      const lockRef = execution ? database.collection('platformCleanupLocks').doc(lockId(execution)) : null;
      const lockSnap = lockRef ? await tx.get(lockRef) : null;
      if (!execution || !['applying', 'blocked'].includes(execution.state)) {
        throw Object.assign(new Error('Execution cannot transition to a terminal state.'), { status: 409 });
      }
      if (state === 'draining' && plan?.operation !== 'disable') {
        throw Object.assign(new Error('Only a disable execution can wait for draining runs.'), { status: 409 });
      }
      if (['succeeded', 'draining'].includes(state) && (!plan || !Array.isArray(plan.targets)
          || plan.targets.some((target) => execution.items?.[`${target.resource_type}:${target.resource_id}`]?.status !== 'succeeded')
          || Object.keys(execution.items || {}).length !== plan.targets.length)) {
        throw Object.assign(new Error('Execution cannot succeed without a durable successful result for every exact target.'), { status: 409 });
      }
      const safeDetail = {
        ...(Array.isArray(detail.blockers)
          ? { blockers: detail.blockers.filter((item) => typeof item === 'string').slice(0, 100).map((item) => item.slice(0, 500)) } : {}),
        ...(typeof detail.preflight_state_fingerprint === 'string' ? { preflight_state_fingerprint: detail.preflight_state_fingerprint } : {}),
        ...(Number.isInteger(detail.delete_requests_issued) ? { delete_requests_issued: detail.delete_requests_issued } : {}),
        ...(Number.isInteger(detail.disable_requests_issued) ? { disable_requests_issued: detail.disable_requests_issued } : {}),
        ...(typeof detail.safe_error_code === 'string' && /^[A-Z0-9_-]{1,80}$/i.test(detail.safe_error_code)
          ? { safe_error_code: detail.safe_error_code } : {}),
        ...(typeof detail.safe_request_id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(detail.safe_request_id)
          ? { safe_request_id: detail.safe_request_id } : {}),
      };
      const updated = { ...safeDetail, state, updatedAtMs: now() };
      tx.update(executionRef, updated);
      tx.update(planRef, { state, updatedAtMs: now() });
      if (lockSnap?.exists && lockSnap.data().plan_id === id) tx.update(lockRef, { active: false });
      return { ...execution, ...updated };
    });
  }

  async function getExecution(id, expected) {
    const plan = await getPlan(id, expected);
    const ref = db().collection('platformCleanupExecutions').doc(id);
    const snap = await ref.get();
    return { plan, execution: snap.exists ? snap.data() : null };
  }

  return {
    saveAudit, consumeAudit, savePlan, getPlan, claimPlan,
    recordItemIntent, recordItemResult, finishExecution, getExecution,
  };
}

module.exports = { createPlatformCleanupStore, ...createPlatformCleanupStore() };
