'use strict';

const { createHash, randomBytes } = require('node:crypto');

const INDUSTRIES = Object.freeze(['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']);
const TIME_ZONE = 'Asia/Riyadh';
const DAILY_CAP = 50;
const MINUTE = 60_000;
const fail = (code) => Object.assign(new Error(code), { code });

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
  return { ...reviewed, fingerprint: createHash('sha256').update(JSON.stringify(reviewed)).digest('hex') };
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

function assertFlowHealth(snapshot, now) {
  if (!snapshot?.complete || !snapshot.flows?.length
    || snapshot.flows.some((flow) => flow.state !== 'enabled'
      || flow.schedule?.frequency !== 'minute' || flow.schedule.interval !== 15
      || flow.lastRun?.state !== 'success'
      || !Number.isFinite(Date.parse(flow.lastRun.completedAt))
      || now.getTime() - Date.parse(flow.lastRun.completedAt) > 2 * 60 * MINUTE
      || Date.parse(flow.lastRun.completedAt) > now.getTime()
      || !Number.isFinite(flow.lastRun.failedCount) || flow.lastRun.failedCount !== 0)) {
    throw fail('SEED_INGESTION_NOT_HEALTHY');
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
      assertFlowHealth(await flowSnapshot(slot.industry), now());
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
      logger.error('[profile-seed-schedule] Paused for inspection', {
        day: local.day, slot: slot.id, prepared,
      });
      await store.finish(local.day, slot.id, {
        state: 'needs_attention', ingestion: 'unverified',
        errorCode: ['SEED_INGESTION_NOT_HEALTHY', 'SEED_PREFERENCES_CHANGED', 'SEED_WINDOW_CLOSED',
          'SEED_PREPARED_IDENTITIES_INVALID', 'SEED_COMMITTED_NEEDS_INSPECTION', 'SEED_OUTCOME_UNKNOWN',
          'SEED_GENERATION_FAILED'].includes(error.code) ? error.code : 'SEED_EXECUTION_INTERRUPTED',
      }, now());
      return { state: 'needs_attention' };
    }
  }
  return { tick };
}

module.exports = {
  INDUSTRIES, TIME_ZONE, DAILY_CAP, businessTime, validateConfig, buildDayPlan,
  assertFlowHealth, createProfileSeedScheduleService,
};
