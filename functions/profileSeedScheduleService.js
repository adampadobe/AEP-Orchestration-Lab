'use strict';

const { createHash, randomBytes } = require('node:crypto');

const INDUSTRIES = Object.freeze(['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']);
const TIME_ZONE = 'Asia/Riyadh';
const DAILY_CAP = 50;
const MINUTE = 60_000;
const MAX_RUN_AGE_MS = 2 * 60 * MINUTE;
const MAX_ACTIVE_FLOW_WAIT_MS = 10 * MINUTE;
const IDLE_POLICY = 'verified_empty_snowflake_copy_v1';
const fail = (code) => Object.assign(new Error(code), { code });
const SLOT_FAILURE_STAGES = Object.freeze({
  flowSnapshot: 'flow_snapshot', flowHealth: 'flow_health', preflight: 'snowflake_preflight',
  preparation: 'preparation', validateIdentities: 'validate_prepared_identities',
  windowCheck: 'prewrite_window_check', persistPreparation: 'persist_preparation',
  sourceWrite: 'source_write', sourcePostCommit: 'source_post_commit',
  persistCommit: 'persist_commit', abandoned: 'abandoned_writer',
});
const SLOT_ERROR_CODES = [
  'SEED_INGESTION_NOT_HEALTHY', 'SEED_PREFERENCES_CHANGED', 'SEED_WINDOW_CLOSED',
  'SEED_PREPARED_IDENTITIES_INVALID', 'SEED_COMMITTED_NEEDS_INSPECTION', 'SEED_OUTCOME_UNKNOWN',
  'SEED_GENERATION_FAILED', 'SEED_FLOW_WAIT_EXPIRED',
];
const DISPATCHER_ERROR_CODES = [
  'SEED_HEALTH_POLICY_INVALID', 'SEED_SCHEDULE_CONFIG_INVALID', 'SEED_OWNER_MISMATCH',
  'SEED_CONFIGURATION_CHANGED', 'SEED_DAY_CONFIG_CHANGED', 'SEED_SCHEDULE_DAY_INVALID', 'SEED_CLAIM_LOST',
];
const safeErrorCode = (error, codes, fallback) => codes.includes(error?.code) ? error.code : fallback;
// Failures before identities are durably prepared cannot have written source rows, so they warn and continue.
const PREWRITE_FAILURE_STAGES = new Set([
  SLOT_FAILURE_STAGES.flowSnapshot, SLOT_FAILURE_STAGES.flowHealth, SLOT_FAILURE_STAGES.preflight,
  SLOT_FAILURE_STAGES.preparation, SLOT_FAILURE_STAGES.validateIdentities, SLOT_FAILURE_STAGES.windowCheck,
]);
const UNCERTAIN_WRITE_CODES = new Set(['SEED_OUTCOME_UNKNOWN', 'SEED_COMMITTED_NEEDS_INSPECTION']);
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30 * MINUTE;
const RECENT_EVENT_LIMIT = 50;
const isPrewriteFailure = ({ stage, errorCode, prepared }) => !prepared
  && PREWRITE_FAILURE_STAGES.has(stage) && !UNCERTAIN_WRITE_CODES.has(errorCode);

function slotLogFields(day, slot) {
  return {
    day: typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
    slot: typeof slot.id === 'string' && /^\d{2}$/.test(slot.id) ? slot.id : null,
    industry: INDUSTRIES.includes(slot.industry) ? slot.industry : null,
    count: Number.isInteger(slot.count) && slot.count >= 1 && slot.count <= 3 ? slot.count : null,
  };
}

function flowHealthLogFields(health) {
  const issues = health.issues.filter((issue) => !Object.hasOwn(issue, 'flowId')).map(({ code }) => code);
  return {
    healthy: health.healthy, complete: health.complete, observedAt: health.observedAt,
    maxRunAgeMs: health.maxRunAgeMs, flowCount: health.flowCount, snapshotIssues: issues,
    unhealthyFlows: health.flows.filter(({ healthy }) => !healthy).map((flow) => ({
      // Real snapshots bind flow IDs to reviewed AEP registry entries. Do not copy upstream objects.
      flowId: typeof flow.flowId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(flow.flowId)
        ? flow.flowId : null,
      reasons: flow.reasons,
      lastRunAgeMs: flow.lastRun?.ageMs ?? null,
    })),
  };
}

function healthPolicy(config) {
  if (config?.allowVerifiedIdleRuns === undefined || config.allowVerifiedIdleRuns === false) {
    return { allowVerifiedIdleRuns: false, healthPolicyFingerprint: 'strict' };
  }
  const review = config.verifiedIdleRunReview;
  if (config.allowVerifiedIdleRuns !== true || typeof config.ownerUid !== 'string'
    || !/^[^/]{1,128}$/.test(config.ownerUid) || review?.policy !== IDLE_POLICY
    || review.reviewedBy !== config.ownerUid
    || typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt))
    || new Date(review.reviewedAt).toISOString() !== review.reviewedAt
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(review.planId || '')) {
    throw fail('SEED_HEALTH_POLICY_INVALID');
  }
  const bounded = { policy: review.policy, reviewedBy: review.reviewedBy,
    reviewedAt: review.reviewedAt, planId: review.planId };
  return { allowVerifiedIdleRuns: true, verifiedIdleRunReview: bounded,
    healthPolicyFingerprint: createHash('sha256').update(JSON.stringify(bounded)).digest('hex') };
}

function businessTime(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    open: parts.weekday !== 'Sat' && Number(parts.hour) >= 8 && Number(parts.hour) < 18,
  };
}

function validateConfig(config) {
  if (!config || config.enabled !== true) return null;
  if (config.sandbox !== 'apalmer' || typeof config.ownerUid !== 'string'
    || !/^[^/]{1,128}$/.test(config.ownerUid)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.expectedBaseEmail || '')
    || !/^\+[1-9]\d{6,14}$/.test(config.expectedMobilePhone || '')
    || config.timeZone !== TIME_ZONE || config.startHour !== 8 || config.endHour !== 18
    || JSON.stringify(config.days) !== '[0,1,2,3,4,5]' || config.dailyCap !== DAILY_CAP
    || config.campaignIsolationReviewed !== true) {
    throw fail('SEED_SCHEDULE_CONFIG_INVALID');
  }
  const reviewed = {
    ownerUid: config.ownerUid, sandbox: config.sandbox,
    expectedBaseEmail: config.expectedBaseEmail, expectedMobilePhone: config.expectedMobilePhone,
    timeZone: TIME_ZONE, startHour: 8, endHour: 18, days: config.days, dailyCap: DAILY_CAP,
    campaignIsolationReviewed: true,
  };
  return { ...reviewed, ...healthPolicy(config),
    fingerprint: createHash('sha256').update(JSON.stringify(reviewed)).digest('hex') };
}

function buildDayPlan(day, fingerprint, seed = randomBytes(32).toString('hex')) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw fail('SEED_SCHEDULE_DAY_INVALID');
  let sequence = 0;
  const draw = (length) => createHash('sha256').update(`${seed}:${sequence++}`)
    .digest().readUInt32BE(0) % length;
  const slots = [];
  const counts = Object.fromEntries(INDUSTRIES.map((industry) => [industry, 0]));
  let minute = draw(15);
  let total = 0;
  let previous;
  while (minute < 600 && total < DAILY_CAP) {
    // Balance coverage without a fixed round-robin or simultaneous industry batches.
    const candidates = INDUSTRIES.filter((industry) => industry !== previous);
    const minimum = Math.min(...candidates.map((industry) => counts[industry]));
    const leastUsed = candidates.filter((industry) => counts[industry] === minimum);
    const industry = leastUsed[draw(leastUsed.length)];
    const count = Math.min(1 + draw(3), DAILY_CAP - total);
    slots.push({
      id: String(slots.length).padStart(2, '0'), industry, count,
      dueAt: new Date(Date.parse(`${day}T08:00:00+03:00`) + minute * MINUTE).toISOString(),
      state: 'pending', identities: [],
    });
    counts[industry] += count;
    total += count;
    previous = industry;
    minute += [15, 30, 60][draw(3)];
  }
  return { day, fingerprint, seed, plannedCount: total, attemptedCount: 0, slots };
}

function diagnoseFlowHealth(snapshot, now, policy = {}) {
  const reviewedPolicy = healthPolicy(policy);
  const flows = Array.isArray(snapshot?.flows) ? snapshot.flows : [];
  const observedAt = now.toISOString();
  const issues = [];
  if (snapshot?.complete !== true) issues.push({ code: 'snapshot_incomplete' });
  if (!flows.length) issues.push({ code: 'no_flows_available' });

  const checks = flows.map((rawFlow) => {
    const flow = rawFlow && typeof rawFlow === 'object' ? rawFlow : {};
    const reasons = [];
    if (flow.state !== 'enabled') reasons.push('flow_not_enabled');
    if (flow.schedule?.frequency !== 'minute' || flow.schedule.interval !== 15) {
      reasons.push('schedule_mismatch');
    }

    const completedAt = flow.lastRun?.completedAt;
    const completedAtMs = typeof completedAt === 'string' ? Date.parse(completedAt) : NaN;
    const runAgeMs = Number.isFinite(completedAtMs) ? now.getTime() - completedAtMs : null;
    if (flow.lastRun?.state !== 'success') reasons.push('last_run_not_success');
    if (!Number.isFinite(completedAtMs)) reasons.push('last_run_completion_missing');
    else if (completedAtMs > now.getTime()) reasons.push('last_run_in_future');
    else if (runAgeMs > MAX_RUN_AGE_MS) reasons.push('last_run_stale');
    const evidence = flow.lastRun?.verifiedIdleEvidence;
    const verifiedIdle = reviewedPolicy.allowVerifiedIdleRuns && evidence?.policy === IDLE_POLICY
      && evidence.runId === flow.lastRun?.id && typeof evidence.runId === 'string' && !!evidence.runId
      && evidence.activityId === '4f008a00-3a04-11eb-adc1-0242ac120002'
      && evidence.activityName === 'SnowFlake Copy Activity'
      && evidence.startedAt === flow.lastRun.startedAt && evidence.completedAt === completedAt
      && Number.isFinite(Date.parse(evidence.startedAt)) && Date.parse(evidence.startedAt) <= completedAtMs
      && evidence.inputRecordCount === 0 && evidence.inputBytes === 0
      && flow.lastRun.readCount === 0
      && [flow.lastRun.writtenCount, flow.lastRun.failedCount, evidence.outputRecordCount,
        evidence.failedRecordCount, evidence.skippedRecordCount].every((value) => value === null || value === 0);
    if (!Number.isFinite(flow.lastRun?.failedCount) && !verifiedIdle) reasons.push('failed_count_unknown');
    else if (Number.isFinite(flow.lastRun?.failedCount) && flow.lastRun.failedCount !== 0) reasons.push('failed_records_present');

    return {
      flowId: typeof flow.id === 'string' ? flow.id : null,
      sourceTables: Array.isArray(flow.sourceTables) ? flow.sourceTables.slice(0, 5) : [],
      state: flow.state ?? null,
      schedule: flow.schedule || null,
      lastRun: flow.lastRun ? {
        state: flow.lastRun.state ?? null,
        completedAt: completedAt ?? null,
        ageMs: runAgeMs,
        readCount: Number.isFinite(flow.lastRun.readCount) ? flow.lastRun.readCount : null,
        writtenCount: Number.isFinite(flow.lastRun.writtenCount) ? flow.lastRun.writtenCount : null,
        failedCount: Number.isFinite(flow.lastRun.failedCount) ? flow.lastRun.failedCount : null,
      } : null,
      healthy: reasons.length === 0,
      readinessBasis: reasons.length ? null : verifiedIdle ? IDLE_POLICY : 'explicit_zero_failed_records',
      verifiedIdleEvidence: verifiedIdle ? evidence : null,
      reasons,
    };
  });
  for (const check of checks) {
    for (const reason of check.reasons) issues.push({ code: reason, flowId: check.flowId });
  }
  return {
    healthy: issues.length === 0,
    complete: snapshot?.complete === true,
    observedAt,
    maxRunAgeMs: MAX_RUN_AGE_MS,
    flowCount: flows.length,
    issues,
    flows: checks,
  };
}

function assertFlowHealth(snapshot, now, policy) {
  const diagnostic = diagnoseFlowHealth(snapshot, now, policy);
  if (!diagnostic.healthy) {
    throw Object.assign(fail('SEED_INGESTION_NOT_HEALTHY'), { healthDiagnostic: diagnostic });
  }
}

function canWaitForActiveFlows(snapshot, diagnostic, now) {
  const allowedReasons = new Set(['last_run_not_success', 'last_run_completion_missing', 'failed_count_unknown']);
  if (!diagnostic.complete || !diagnostic.flows.length
    || diagnostic.issues.some((issue) => !issue.flowId || !allowedReasons.has(issue.code))) return false;
  const ids = new Set();
  return snapshot.flows.every((flow, index) => {
    if (typeof flow?.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(flow.id)
      || ids.has(flow.id)) return false;
    ids.add(flow.id);
    if (diagnostic.flows[index].healthy) return true;
    const run = flow.lastRun;
    const started = typeof run?.startedAt === 'string' ? Date.parse(run.startedAt) : NaN;
    return run?.state === 'inProgress' && typeof run.id === 'string' && !!run.id
      && Number.isFinite(started) && started <= +now && +now - started <= MAX_ACTIVE_FLOW_WAIT_MS
      && run.completedAt === null && (run.failedCount === null || run.failedCount === 0);
  });
}

function createProfileSeedScheduleService({
  store, snowflake, getOwner, flowSnapshot, now = () => new Date(), logger = console,
}) {
  const warn = (...args) => (typeof logger.warn === 'function' ? logger.warn(...args) : logger.info(...args));
  function logBreakerOpened(day, breaker) {
    if (!breaker?.breakerOpened) return;
    logger.error('[profile-seed-schedule] Circuit breaker opened; dispatch pauses until cooldown, then probes one slot.', {
      event: 'profile_seed_breaker_opened', day,
      consecutivePrewriteFailures: breaker.consecutivePrewriteFailures, openUntil: breaker.openUntil,
    });
  }
  async function tick() {
    let stage = 'read_config';
    let config, local, owner, slot;
    try {
      const clock = now();
      const savedConfig = await store.getConfig();
      stage = 'validate_config';
      config = validateConfig(savedConfig);
      if (!config) return { state: 'disabled' };
      stage = 'business_window';
      local = businessTime(clock);
      if (!local.open) return { state: 'outside_window' };
      stage = 'verify_owner';
      owner = await getOwner();
      if (owner.disabled || owner.uid !== config.ownerUid) throw fail('SEED_OWNER_MISMATCH');
      stage = 'ensure_day';
      await store.ensureDay(buildDayPlan(local.day, config.fingerprint), config);
      stage = 'claim_slot';
      slot = await store.claim(local.day, config, clock);
    } catch (error) {
      logger.error('[profile-seed-schedule] Dispatcher failed; inspect durable state before resuming.', {
        event: 'profile_seed_dispatcher_failed', stage, day: local?.day ?? null,
        errorCode: safeErrorCode(error, DISPATCHER_ERROR_CODES, 'SEED_DISPATCHER_FAILED'),
      });
      throw error;
    }
    if (!slot) return { state: 'idle' };
    if (slot.state === 'breaker_open') {
      logger.info('[profile-seed-schedule] Circuit breaker open after repeated prewrite failures; waiting for cooldown.', {
        event: 'profile_seed_breaker_open', day: local.day, openUntil: slot.openUntil,
        consecutivePrewriteFailures: slot.consecutivePrewriteFailures,
      });
      return { state: 'breaker_open', openUntil: slot.openUntil };
    }
    if (slot.state === 'skipped_prewrite') {
      warn('[profile-seed-schedule] Abandoned writer had no prepared identities; slot skipped, dispatch continues.', {
        event: 'profile_seed_prewrite_skipped', ...slotLogFields(slot.day, slot),
        stage: SLOT_FAILURE_STAGES.abandoned, errorCode: 'SEED_EXECUTION_INTERRUPTED',
        writerAgeMs: slot.writerAgeMs, maxWriterAgeMs: slot.maxWriterAgeMs, ...slot.breaker,
      });
      logBreakerOpened(slot.day, slot.breaker);
      return { state: 'skipped_prewrite', errorCode: 'SEED_EXECUTION_INTERRUPTED' };
    }
    if (slot.state === 'needs_attention') {
      logger.error('[profile-seed-schedule] Abandoned writer; generation blocked until inspection.', {
        event: 'profile_seed_writer_abandoned', ...slotLogFields(slot.day, slot),
        stage: SLOT_FAILURE_STAGES.abandoned, errorCode: 'SEED_EXECUTION_INTERRUPTED',
        writerAgeMs: slot.writerAgeMs, maxWriterAgeMs: slot.maxWriterAgeMs,
      });
      return { state: 'needs_attention' };
    }
    const logFields = slotLogFields(local.day, slot);
    let prepared = false;
    let flowHealthAtFailure;
    try {
      stage = SLOT_FAILURE_STAGES.flowSnapshot;
      const snapshot = await flowSnapshot(slot.industry);
      stage = SLOT_FAILURE_STAGES.flowHealth;
      const clock = now();
      const health = diagnoseFlowHealth(snapshot, clock, config);
      if (slot.healthWaitStartedAt
        && (!Number.isFinite(Date.parse(slot.healthWaitStartedAt))
          || +clock < Date.parse(slot.healthWaitStartedAt)
          || +clock - Date.parse(slot.healthWaitStartedAt) >= MAX_ACTIVE_FLOW_WAIT_MS)) {
        flowHealthAtFailure = health;
        throw fail('SEED_FLOW_WAIT_EXPIRED');
      }
      if (!health.healthy) {
        flowHealthAtFailure = health;
        if (canWaitForActiveFlows(snapshot, health, clock)) {
          await store.deferFlowHealth(local.day, slot.id, config, clock);
          logger.info('[profile-seed-schedule] Waiting for active ingestion before preparation', {
            event: 'profile_seed_flow_health_deferred', ...logFields,
            flowHealth: flowHealthLogFields(health),
          });
          return { state: 'waiting_flow_health' };
        }
        throw fail('SEED_INGESTION_NOT_HEALTHY');
      }
      if (!businessTime(clock).open || businessTime(clock).day !== local.day) throw fail('SEED_WINDOW_CLOSED');
      stage = SLOT_FAILURE_STAGES.preflight;
      const ready = await snowflake.preflight({ uid: owner.uid, industry: slot.industry });
      if (!ready?.ready || ready.baseEmail !== config.expectedBaseEmail
        || ready.mobilePhone !== config.expectedMobilePhone) throw fail('SEED_PREFERENCES_CHANGED');
      stage = SLOT_FAILURE_STAGES.preparation;
      const result = await snowflake.generate({
        uid: owner.uid, industry: slot.industry, count: slot.count, samplingMode: 'ongoing',
        eventTimeMode: slot.industry === 'travel' ? 'historical' : 'recent',
        expectedBaseEmail: config.expectedBaseEmail, expectedMobilePhone: config.expectedMobilePhone,
        onPrepared: async (plan) => {
          stage = SLOT_FAILURE_STAGES.validateIdentities;
          if (prepared || plan.profiles?.length !== slot.count
            || plan.profiles.some((profile) => ['email', 'ecid', 'crmId', 'recipientId']
              .some((key) => typeof profile[key] !== 'string' || !profile[key]))) {
            throw fail('SEED_PREPARED_IDENTITIES_INVALID');
          }
          // Recheck the window and kill switch immediately before source writes.
          stage = SLOT_FAILURE_STAGES.windowCheck;
          const current = now();
          if (!businessTime(current).open || businessTime(current).day !== local.day) {
            throw fail('SEED_WINDOW_CLOSED');
          }
          stage = SLOT_FAILURE_STAGES.persistPreparation;
          await store.prepared(local.day, slot.id, config, plan, current);
          prepared = true;
          stage = SLOT_FAILURE_STAGES.sourceWrite;
        },
      });
      if (!prepared || result?.ok !== true) {
        if (result?.committed) stage = SLOT_FAILURE_STAGES.sourcePostCommit;
        throw fail(result?.committed ? 'SEED_COMMITTED_NEEDS_INSPECTION'
          : result?.outcomeUnknown ? 'SEED_OUTCOME_UNKNOWN' : 'SEED_GENERATION_FAILED');
      }
      stage = SLOT_FAILURE_STAGES.persistCommit;
      await store.finish(local.day, slot.id, {
        state: 'committed', ingestion: 'pending', tableRowcounts: result.tableRowcounts || {},
      }, now());
    } catch (error) {
      // Failed slots are never replayed; pre-write failures skip the slot so later slots still run.
      const errorCode = safeErrorCode(error, SLOT_ERROR_CODES, 'SEED_EXECUTION_INTERRUPTED');
      const prewrite = isPrewriteFailure({ stage, errorCode, prepared });
      let breaker;
      try {
        breaker = await store.finish(local.day, slot.id, prewrite ? {
          state: 'skipped', reason: 'prewrite_failure', ingestion: 'not_started',
          errorCode, failureStage: stage,
          ...(flowHealthAtFailure ? { flowHealth: flowHealthAtFailure } : {}),
        } : {
          state: 'needs_attention', ingestion: 'unverified',
          errorCode, failureStage: stage,
          ...(flowHealthAtFailure ? { flowHealth: flowHealthAtFailure } : {}),
        }, now());
      } catch (finishError) {
        logger.error('[profile-seed-schedule] Could not confirm attention state; inspect durable state.', {
          event: 'profile_seed_attention_unconfirmed', ...logFields, stage: 'persist_attention',
          errorCode: safeErrorCode(finishError, DISPATCHER_ERROR_CODES, 'SEED_ATTENTION_PERSIST_FAILED'),
          failureStage: stage, failureCode: errorCode, prepared,
          flowHealthAtFailure: flowHealthAtFailure ? flowHealthLogFields(flowHealthAtFailure) : null,
        });
        throw finishError;
      }
      if (prewrite) {
        warn('[profile-seed-schedule] Prewrite failure; slot skipped, dispatch continues.', {
          event: 'profile_seed_prewrite_skipped', ...logFields, stage, errorCode, prepared,
          consecutivePrewriteFailures: breaker?.consecutivePrewriteFailures ?? null,
          flowHealthAtFailure: flowHealthAtFailure ? flowHealthLogFields(flowHealthAtFailure) : null,
        });
        logBreakerOpened(local.day, breaker);
        return { state: 'skipped_prewrite', errorCode, breakerOpened: !!breaker?.breakerOpened };
      }
      logger.error('[profile-seed-schedule] Paused for inspection', {
        event: 'profile_seed_needs_attention', ...logFields, stage, errorCode, prepared,
        flowHealthAtFailure: flowHealthAtFailure ? flowHealthLogFields(flowHealthAtFailure) : null,
      });
      return { state: 'needs_attention' };
    }
    logger.info('[profile-seed-schedule] Source committed; AEP arrival pending', {
      event: 'profile_seed_source_committed', ...logFields, ingestion: 'pending',
    });
    return { state: 'committed', count: slot.count };
  }
  return { tick };
}

module.exports = {
  INDUSTRIES, TIME_ZONE, DAILY_CAP, businessTime, validateConfig, buildDayPlan,
  diagnoseFlowHealth, assertFlowHealth, createProfileSeedScheduleService,
  healthPolicy, IDLE_POLICY, SLOT_FAILURE_STAGES,
  BREAKER_THRESHOLD, BREAKER_COOLDOWN_MS, RECENT_EVENT_LIMIT, isPrewriteFailure,
};
