'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { validateConfig, healthPolicy, diagnoseFlowHealth, IDLE_POLICY } = require('./profileSeedScheduleService');

const ORG = 'BF9C27AA6464801C0A495FD0@AdobeOrg';
const INCIDENTS = Object.freeze([
  { day: '2026-11-11', slotId: '15', industry: 'retail', count: 2,
    errorCode: 'SEED_INGESTION_NOT_HEALTHY' },
  { day: '2026-11-15', slotId: '01', industry: 'media', count: 1,
    errorCode: 'SEED_EXECUTION_INTERRUPTED', attemptedCount: 3,
    startedAt: '2026-11-15T06:10:08.193Z', updatedAt: '2026-11-15T06:10:21.029Z' },
  { day: '2026-11-15', slotId: '15', industry: 'travel', count: 1,
    errorCode: 'SEED_EXECUTION_INTERRUPTED', attemptedCount: 6,
    dueAt: '2026-11-15T13:10:00.000Z', startedAt: '2026-11-15T13:10:08.231Z',
    updatedAt: '2026-11-15T13:10:16.924Z',
    slotKeys: ['count', 'dueAt', 'errorCode', 'id', 'identities', 'industry',
      'ingestion', 'startedAt', 'state', 'updatedAt'] },
  { day: '2026-11-17', slotId: '14', industry: 'sports', count: 3,
    errorCode: 'SEED_INGESTION_NOT_HEALTHY', attemptedCount: 31,
    dueAt: '2026-11-17T13:37:00.000Z', startedAt: '2026-11-17T13:40:15.679Z',
    updatedAt: '2026-11-17T13:40:22.003Z',
    failureSnapshot: {
      observedAt: '2026-11-17T13:40:22.001Z',
      flowCount: 13,
      flowId: '065f3b53-df40-43d1-9d91-c42f031996d6',
      issueCodes: ['last_run_not_success', 'last_run_completion_missing', 'failed_count_unknown'],
      lastRun: { state: 'inProgress', completedAt: null, readCount: 2, writtenCount: null, failedCount: null },
    } },
  { day: '2026-11-19', slotId: '01', industry: 'retail', count: 3,
    errorCode: 'SEED_INGESTION_NOT_HEALTHY', attemptedCount: 4,
    dueAt: '2026-11-19T05:29:00.000Z', startedAt: '2026-11-19T05:30:19.585Z',
    updatedAt: '2026-11-19T05:30:25.871Z',
    failureSnapshot: {
      observedAt: '2026-11-19T05:30:25.869Z', flowCount: 13,
      flowId: 'e51db6ee-70ef-4705-a913-f6f8eba4fb96', issueCodes: ['last_run_stale'],
      lastRun: { state: 'success', completedAt: '2026-11-19T02:07:17.320Z',
        ageMs: 12188549, readCount: 0, writtenCount: null, failedCount: null },
      idleRunId: '5b126cfe-7691-4d41-b046-b6590022f234',
    } },
  { day: '2026-11-22', slotId: '07', industry: 'telecom', count: 2,
    errorCode: 'SEED_INGESTION_NOT_HEALTHY', failureStage: 'flow_health', attemptedCount: 18,
    dueAt: '2026-11-22T08:44:00.000Z', startedAt: '2026-11-22T08:45:14.070Z',
    updatedAt: '2026-11-22T08:45:18.804Z',
    failureSnapshot: {
      observedAt: '2026-11-22T08:45:18.804Z', flowCount: 11,
      flowId: '065f3b53-df40-43d1-9d91-c42f031996d6',
      issueCodes: ['last_run_not_success', 'last_run_completion_missing', 'failed_count_unknown'],
      lastRun: { state: 'inProgress', completedAt: null, readCount: 3, writtenCount: null, failedCount: null },
    } },
]);
const OBSERVATION_MAX_AGE_MS = 60_000;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const reject = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
const digest = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function matchesFailureSnapshot(slot, expected) {
  const health = slot.flowHealth;
  const flow = health?.flows?.find((item) => item.flowId === expected.flowId);
  const issueCodes = (health?.issues || []).map((issue) => issue.code).sort();
  const expectedIssueCodes = [...expected.issueCodes].sort();
  return health?.healthy === false && health.complete === true
    && health.observedAt === expected.observedAt && health.flowCount === expected.flowCount
    && health.flows?.length === expected.flowCount
    && health.flows.filter((item) => item.healthy === false).length === 1
    && JSON.stringify(issueCodes) === JSON.stringify(expectedIssueCodes)
    && health.issues.every((issue) => issue.flowId === expected.flowId)
    && flow?.healthy === false && flow.state === 'enabled'
    && Object.entries(expected.lastRun).every(([key, value]) => flow.lastRun?.[key] === value)
    && (!expected.idleRunId || (flow.verifiedIdleEvidence?.runId === expected.idleRunId
      && flow.verifiedIdleEvidence.policy === IDLE_POLICY
      && flow.verifiedIdleEvidence.inputRecordCount === 0 && flow.verifiedIdleEvidence.inputBytes === 0))
    && JSON.stringify([...(flow.reasons || [])].sort()) === JSON.stringify(expectedIssueCodes);
}

function reviewedIncident(target) {
  const incident = INCIDENTS.find(({ day, slotId }) => day === target.day && slotId === target.slotId);
  if (!incident) reject(403, 'SEED_RECOVERY_INCIDENT_SCOPE_DENIED');
  return incident;
}

function targetState({ config, dispatcher, day }, target) {
  const incident = reviewedIncident(target);
  let validated;
  try { validated = validateConfig(config); } catch { reject(409, 'SEED_RECOVERY_CONFIG_INVALID'); }
  if (!validated || validated.ownerUid !== target.principalUid || validated.sandbox !== target.sandbox) {
    reject(403, 'SEED_RECOVERY_OWNER_OR_CONFIG_CHANGED');
  }
  if (day?.day !== target.day || day.fingerprint !== validated.fingerprint
    || !Array.isArray(day.slots) || !Number.isInteger(day.attemptedCount)
    || day.attemptedCount < 0 || day.attemptedCount > 50
    || dispatcher?.blocked !== true || dispatcher.active !== null
    || dispatcher.attention?.day !== target.day || dispatcher.attention?.id !== target.slotId) {
    reject(409, 'SEED_RECOVERY_STATE_NOT_ELIGIBLE');
  }
  if (day.slots.some((slot) => !slot || typeof slot !== 'object')) reject(409, 'SEED_RECOVERY_DAY_MALFORMED');
  const slots = day.slots.filter((slot) => slot.id === target.slotId);
  const slot = slots[0];
  const hasNoPreparedIdentities = slots.length === 1
    && Array.isArray(slot.identities) && slot.identities.length === 0
    && (!incident.slotKeys || JSON.stringify(Object.keys(slot).sort()) === JSON.stringify(incident.slotKeys));
  if (!hasNoPreparedIdentities || slot.state !== 'needs_attention'
    || slot.errorCode !== incident.errorCode
    || (incident.failureStage && slot.failureStage !== incident.failureStage)
    || (incident.dueAt && slot.dueAt !== incident.dueAt)
    || slot.industry !== incident.industry || slot.count !== incident.count || day.attemptedCount < slot.count
    || (incident.attemptedCount !== undefined && day.attemptedCount !== incident.attemptedCount)
    || (incident.startedAt && (slot.startedAt !== incident.startedAt || slot.updatedAt !== incident.updatedAt
      || day.attemptedCount !== incident.attemptedCount))
    || (incident.failureSnapshot && !matchesFailureSnapshot(slot, incident.failureSnapshot))
    || !['unverified', 'not_started', undefined].includes(slot.ingestion)
    || ['runStamp', 'tableRowcounts', 'committed', 'outcomeUnknown', 'writeEvidence',
      'sourceWrite', 'sourceWrites', 'preparedAt', 'committedAt', 'recovery'].some((key) => Object.hasOwn(slot, key))
    || Object.keys(slot).some((key) => /(write|commit|prepar|stamp|outcome|rowcount|batch|receipt)/i.test(key))
    || day.slots.some((item) => item.state === 'running'
      || (item !== slot && item.state === 'needs_attention'))) {
    reject(409, 'SEED_RECOVERY_SLOT_NOT_PREWRITE_FAILURE');
  }
  return { validated, slot, configDigest: digest(config), dispatcherDigest: digest(dispatcher), dayDigest: digest(day) };
}

function topology(snapshot) {
  if (snapshot?.complete !== true || !Array.isArray(snapshot.flows) || !snapshot.flows.length
    || snapshot.flows.some((flow) => !flow || typeof flow.id !== 'string' || !flow.id)
    || new Set(snapshot.flows.map((flow) => flow.id)).size !== snapshot.flows.length) {
    return null;
  }
  return digest(snapshot.flows.map(({ lastRun, ...flow }) => flow).sort((a, b) => a.id.localeCompare(b.id)));
}

function createProfileSeedScheduleRecoveryService({ store, flowSnapshot, getOwner, now = () => new Date() }) {
  async function authorize({ principalUid, sandbox, orgId }) {
    if (sandbox !== 'apalmer' || orgId !== ORG || typeof principalUid !== 'string' || !principalUid) {
      reject(403, 'SEED_RECOVERY_SCOPE_DENIED');
    }
    const owner = await getOwner();
    if (!owner || owner.disabled || owner.uid !== principalUid) reject(403, 'SEED_RECOVERY_OWNER_DISABLED_OR_MISMATCH');
  }
  async function readState(day) {
    const [config, dispatcher, plan] = await Promise.all([store.getConfig(), store.getDispatcher(), store.getDay(day)]);
    return { config, dispatcher, day: plan };
  }
  function unchanged(state, receipt) {
    const current = targetState(state, receipt);
    if (['configDigest', 'dispatcherDigest', 'dayDigest'].some((key) => current[key] !== receipt[key])) {
      reject(409, 'SEED_RECOVERY_STATE_CHANGED');
    }
    return current;
  }
  async function preview({ principalUid, sandbox, orgId, input = {} }) {
    await authorize({ principalUid, sandbox, orgId });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day || '')
      || !Number.isFinite(Date.parse(`${input.day}T00:00:00Z`))
      || new Date(`${input.day}T00:00:00Z`).toISOString().slice(0, 10) !== input.day
      || !/^\d{2}$/.test(input.slot_id || '')
      || (input.allow_verified_idle_runs !== undefined && typeof input.allow_verified_idle_runs !== 'boolean')) {
      reject(400, 'SEED_RECOVERY_TARGET_INVALID');
    }
    const target = { principalUid, sandbox, orgId, day: input.day, slotId: input.slot_id };
    reviewedIncident(target);
    const state = await readState(target.day);
    const current = targetState(state, target);
    const clock = now();
    const planId = randomUUID();
    const change = input.allow_verified_idle_runs === true && !current.validated.allowVerifiedIdleRuns;
    const proposedPolicy = change ? { ...state.config, allowVerifiedIdleRuns: true,
      verifiedIdleRunReview: { policy: IDLE_POLICY, reviewedBy: principalUid,
        reviewedAt: clock.toISOString(), planId } } : state.config;
    const snapshot = await flowSnapshot(current.slot.industry);
    const currentFlowHealth = diagnoseFlowHealth(snapshot, now(), state.config);
    const proposedFlowHealth = diagnoseFlowHealth(snapshot, now(), proposedPolicy);
    const topologyDigest = topology(snapshot);
    const status = !proposedFlowHealth.healthy || !topologyDigest ? 'blocked' : change ? 'policy_review_required' : 'ready';
    const receipt = {
      ...target, planId, configDigest: current.configDigest, dayDigest: current.dayDigest,
      dispatcherDigest: current.dispatcherDigest, topologyDigest,
      industry: current.slot.industry, expectedCount: 1, slotCount: current.slot.count,
      healthPolicyChangeRequired: change, status,
      proposedReview: change ? proposedPolicy.verifiedIdleRunReview : null,
      createdAt: clock.toISOString(), expiresAt: new Date(+clock + 10 * 60_000).toISOString(),
      confirmationPhrase: `SKIP ONLY ${target.day}/${target.slotId}${change ? ' AND APPROVE VERIFIED EMPTY SNOWFLAKE COPY V1' : ''}`,
    };
    receipt.manifestDigest = digest(receipt);
    await store.createRecoveryReceipt(receipt, (live) => unchanged(live, receipt));
    return { plan_id: planId, manifest_digest: receipt.manifestDigest, expected_count: 1,
      expires_at: receipt.expiresAt, status, confirmation_phrase: receipt.confirmationPhrase,
      health_policy_change_required: change, currentFlowHealth, proposedFlowHealth,
      target: { day: target.day, slot_id: target.slotId, industry: current.slot.industry,
        count: current.slot.count, attempted_count: state.day.attemptedCount, ingestion: 'not_started' } };
  }
  async function apply({ principalUid, sandbox, orgId, input = {} }) {
    await authorize({ principalUid, sandbox, orgId });
    if (!UUID.test(input.plan_id || '') || !/^[a-f0-9]{64}$/.test(input.manifest_digest || '')
      || input.expected_count !== 1 || input.confirmed !== true || input.skip_only_acknowledged !== true) {
      reject(400, 'SEED_RECOVERY_CONFIRMATION_REQUIRED');
    }
    const receipt = await store.getRecoveryReceipt(input.plan_id);
    function checkReceipt(saved) {
      if (!saved || saved.principalUid !== principalUid || saved.sandbox !== sandbox || saved.orgId !== orgId) {
        reject(403, 'SEED_RECOVERY_RECEIPT_SCOPE_DENIED');
      }
      if (saved.planId !== input.plan_id || saved.consumedAt || !['ready', 'policy_review_required'].includes(saved.status)
        || Date.parse(saved.expiresAt) <= +now() || !Number.isFinite(Date.parse(saved.expiresAt))
        || saved.manifestDigest !== input.manifest_digest || saved.expectedCount !== input.expected_count
        || saved.confirmationPhrase !== input.confirmation_phrase
        || (saved.healthPolicyChangeRequired && input.idle_readiness_acknowledged !== true)) {
        reject(409, 'SEED_RECOVERY_RECEIPT_NOT_APPLICABLE');
      }
      const { manifestDigest, ...manifest } = saved;
      if (digest(manifest) !== manifestDigest) reject(409, 'SEED_RECOVERY_RECEIPT_CHANGED');
    }
    checkReceipt(receipt);
    const state = await readState(receipt.day);
    unchanged(state, receipt);
    return store.applyRecovery(receipt.planId, async (live) => {
      await authorize({ principalUid, sandbox, orgId });
      checkReceipt(live.receipt);
      const current = unchanged(live, live.receipt);
      // Firestore can rerun this callback after contention. Never reuse the previous attempt's Adobe observation.
      const observationStartedAt = +now();
      const snapshot = await flowSnapshot(current.slot.industry);
      await authorize({ principalUid, sandbox, orgId });
      if (!topology(snapshot) || topology(snapshot) !== live.receipt.topologyDigest) {
        reject(409, 'SEED_RECOVERY_FLOW_TOPOLOGY_CHANGED');
      }
      const policy = receipt.healthPolicyChangeRequired ? { ...live.config, allowVerifiedIdleRuns: true,
        verifiedIdleRunReview: receipt.proposedReview } : live.config;
      function assertFresh() {
        const clock = now();
        const fetchedAt = snapshot.fetchedAt === undefined ? observationStartedAt : Date.parse(snapshot.fetchedAt);
        if (!Number.isFinite(fetchedAt) || fetchedAt > +clock
          || +clock - fetchedAt > OBSERVATION_MAX_AGE_MS
          || +clock < observationStartedAt || +clock - observationStartedAt > OBSERVATION_MAX_AGE_MS) {
          reject(409, 'SEED_RECOVERY_OBSERVATION_STALE');
        }
        checkReceipt(live.receipt);
        if (!diagnoseFlowHealth(snapshot, clock, policy).healthy) reject(409, 'SEED_RECOVERY_FLOW_NOT_HEALTHY');
      }
      assertFresh();
      const clock = now();
      const flowHealth = diagnoseFlowHealth(snapshot, clock, policy);
      if (!flowHealth.healthy) reject(409, 'SEED_RECOVERY_FLOW_NOT_HEALTHY');
      const audit = { planId: receipt.planId, manifestDigest: receipt.manifestDigest,
        appliedAt: clock.toISOString(), appliedBy: principalUid, orgId, sandbox,
        day: receipt.day, slotId: receipt.slotId, action: 'skip_only',
        previousState: current.slot.state, previousErrorCode: current.slot.errorCode,
        attemptedCount: live.day.attemptedCount, healthPolicy: healthPolicy(policy).healthPolicyFingerprint,
        topologyDigest: receipt.topologyDigest, flowHealth };
      const day = { ...live.day, slots: live.day.slots.map((slot) => slot.id === receipt.slotId
        ? { ...slot, state: 'skipped', reason: 'reviewed_prewrite_failure_skip_only',
          updatedAt: clock.toISOString(), recovery: audit } : slot) };
      const dispatcher = { ...live.dispatcher, blocked: false, active: null };
      delete dispatcher.attention;
      return { day, dispatcher, config: receipt.healthPolicyChangeRequired ? policy : null, audit, assertFresh,
        result: { ok: true, skipped: true, dispatcher_unblocked: true, day: receipt.day,
          slot_id: receipt.slotId, health_policy: healthPolicy(policy), flowHealth, ingestion: 'not_started' } };
    });
  }
  return { preview, apply };
}

module.exports = { createProfileSeedScheduleRecoveryService };
