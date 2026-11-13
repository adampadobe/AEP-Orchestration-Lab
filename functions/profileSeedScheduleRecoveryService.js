'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { validateConfig, healthPolicy, diagnoseFlowHealth, IDLE_POLICY } = require('./profileSeedScheduleService');

const ORG = 'BF9C27AA6464801C0A495FD0@AdobeOrg';
const INCIDENT_DAY = '2026-11-11';
const INCIDENT_SLOT = '15';
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

function targetState({ config, dispatcher, day }, target) {
  if (target.day !== INCIDENT_DAY || target.slotId !== INCIDENT_SLOT) reject(403, 'SEED_RECOVERY_INCIDENT_SCOPE_DENIED');
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
  if (slots.length !== 1 || slot.state !== 'needs_attention'
    || slot.errorCode !== 'SEED_INGESTION_NOT_HEALTHY'
    || !Array.isArray(slot.identities) || slot.identities.length !== 0
    || slot.industry !== 'retail' || slot.count !== 2 || day.attemptedCount < slot.count
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
    if (target.day !== INCIDENT_DAY || target.slotId !== INCIDENT_SLOT) reject(403, 'SEED_RECOVERY_INCIDENT_SCOPE_DENIED');
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
