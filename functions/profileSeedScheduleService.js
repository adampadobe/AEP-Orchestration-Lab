'use strict';

const { createHash, randomBytes } = require('node:crypto');

const INDUSTRIES = Object.freeze(['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']);
const TIME_ZONE = 'Asia/Riyadh';
const DAILY_CAP = 50;
const MINUTE = 60_000;
const IDLE_POLICY = 'verified_empty_snowflake_copy_v1';
const fail = (code) => Object.assign(new Error(code), { code });

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
    if (flow.lastRun?.state !== 'success') reasons.push('last_run_not_success');
    if (!Number.isFinite(completedAtMs)) reasons.push('last_run_completion_missing');
    else if (completedAtMs > now.getTime()) reasons.push('last_run_in_future');
    else if (now.getTime() - completedAtMs > 2 * 60 * MINUTE) reasons.push('last_run_stale');
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
        ageMs: Number.isFinite(completedAtMs) ? now.getTime() - completedAtMs : null,
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

function createProfileSeedScheduleService({
  store, snowflake, getOwner, flowSnapshot, now = () => new Date(), logger = console,
}) {
  async function tick() {
    const clock = now();
    const config = validateConfig(await store.getConfig());
    if (!config) return { state: 'disabled' };
    const local = businessTime(clock);
    if (!local.open) return { state: 'outside_window' };
    const owner = await getOwner();
    if (owner.disabled || owner.uid !== config.ownerUid) throw fail('SEED_OWNER_MISMATCH');
    await store.ensureDay(buildDayPlan(local.day, config.fingerprint), config);
    const slot = await store.claim(local.day, config, clock);
    if (!slot) return { state: 'idle' };
    if (slot.state === 'needs_attention') {
      logger.error('[profile-seed-schedule] Abandoned writer; generation blocked until inspection.');
      return { state: 'needs_attention' };
    }
    let prepared = false;
    try {
      assertFlowHealth(await flowSnapshot(slot.industry), now(), config);
      const ready = await snowflake.preflight({ uid: owner.uid, industry: slot.industry });
      if (!ready?.ready || ready.baseEmail !== config.expectedBaseEmail
        || ready.mobilePhone !== config.expectedMobilePhone) throw fail('SEED_PREFERENCES_CHANGED');
      const result = await snowflake.generate({
        uid: owner.uid, industry: slot.industry, count: slot.count, samplingMode: 'ongoing',
        expectedBaseEmail: config.expectedBaseEmail, expectedMobilePhone: config.expectedMobilePhone,
        onPrepared: async (plan) => {
          if (prepared || plan.profiles?.length !== slot.count
            || plan.profiles.some((profile) => ['email', 'ecid', 'crmId', 'recipientId']
              .some((key) => typeof profile[key] !== 'string' || !profile[key]))) {
            throw fail('SEED_PREPARED_IDENTITIES_INVALID');
          }
          // Recheck the window and kill switch immediately before source writes.
          const current = now();
          if (!businessTime(current).open || businessTime(current).day !== local.day) {
            throw fail('SEED_WINDOW_CLOSED');
          }
          await store.prepared(local.day, slot.id, config, plan, current);
          prepared = true;
        },
      });
      if (!prepared || result?.ok !== true) {
        throw fail(result?.committed ? 'SEED_COMMITTED_NEEDS_INSPECTION'
          : result?.outcomeUnknown ? 'SEED_OUTCOME_UNKNOWN' : 'SEED_GENERATION_FAILED');
      }
      await store.finish(local.day, slot.id, {
        state: 'committed', ingestion: 'pending', tableRowcounts: result.tableRowcounts || {},
      }, now());
      logger.info('[profile-seed-schedule] Source committed; AEP arrival pending', {
        day: local.day, slot: slot.id, industry: slot.industry, count: slot.count,
      });
      return { state: 'committed', count: slot.count };
    } catch (error) {
      // Even a pre-write failure is not automatically replayed with fresh identities.
      const errorCode = ['SEED_INGESTION_NOT_HEALTHY', 'SEED_PREFERENCES_CHANGED', 'SEED_WINDOW_CLOSED',
        'SEED_PREPARED_IDENTITIES_INVALID', 'SEED_COMMITTED_NEEDS_INSPECTION', 'SEED_OUTCOME_UNKNOWN',
        'SEED_GENERATION_FAILED'].includes(error.code) ? error.code : 'SEED_EXECUTION_INTERRUPTED';
      const stage = error.healthDiagnostic ? 'flow_health' : prepared ? 'source_write' : 'preparation';
      logger.error('[profile-seed-schedule] Paused for inspection', {
        day: local.day, slot: slot.id, industry: slot.industry, count: slot.count,
        stage, errorCode, prepared, flowHealth: error.healthDiagnostic || null,
      });
      await store.finish(local.day, slot.id, {
        state: 'needs_attention', ingestion: 'unverified',
        errorCode,
        ...(error.healthDiagnostic ? { flowHealth: error.healthDiagnostic } : {}),
      }, now());
      return { state: 'needs_attention' };
    }
  }
  return { tick };
}

module.exports = {
  INDUSTRIES, TIME_ZONE, DAILY_CAP, businessTime, validateConfig, buildDayPlan,
  diagnoseFlowHealth, assertFlowHealth, createProfileSeedScheduleService,
  healthPolicy, IDLE_POLICY,
};
