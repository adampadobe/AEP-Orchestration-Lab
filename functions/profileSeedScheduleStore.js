'use strict';

const {
  validateConfig, DAILY_CAP, businessTime, SLOT_FAILURE_STAGES,
  BREAKER_THRESHOLD, BREAKER_COOLDOWN_MS, RECENT_EVENT_LIMIT,
} = require('./profileSeedScheduleService');
const COLLECTION = 'labProfileSeedSchedules';
const MAX_WRITER_AGE_MS = 15 * 60_000;
const fail = (code) => Object.assign(new Error(code), { code });

// Breaker and diagnostic history survive every dispatcher rewrite; absent fields stay absent.
function carried(current) {
  return {
    ...(current?.breaker ? { breaker: current.breaker } : {}),
    ...(current?.recentEvents?.length ? { recentEvents: current.recentEvents } : {}),
  };
}
function withEvent(current, event) {
  return [...(Array.isArray(current?.recentEvents) ? current.recentEvents : []), event].slice(-RECENT_EVENT_LIMIT);
}
function failedBreaker(current, now) {
  const consecutivePrewriteFailures = (current?.breaker?.consecutivePrewriteFailures || 0) + 1;
  const breaker = { consecutivePrewriteFailures, lastFailureAt: now.toISOString() };
  const breakerOpened = consecutivePrewriteFailures >= BREAKER_THRESHOLD;
  if (breakerOpened) {
    breaker.openedAt = now.toISOString();
    breaker.openUntil = new Date(now.getTime() + BREAKER_COOLDOWN_MS).toISOString();
  }
  return { breaker, breakerOpened };
}
function skipEvents(current, now, { day, id, industry, errorCode, failureStage }, { breaker, breakerOpened }) {
  const at = now.toISOString();
  const base = { at, day, id, industry, errorCode, failureStage };
  let recentEvents = withEvent(current, { type: 'prewrite_skipped', ...base,
    consecutivePrewriteFailures: breaker.consecutivePrewriteFailures });
  if (breakerOpened) {
    recentEvents = withEvent({ recentEvents }, { type: 'breaker_opened', at, day, id,
      consecutivePrewriteFailures: breaker.consecutivePrewriteFailures, openUntil: breaker.openUntil });
  }
  return recentEvents;
}

function createProfileSeedScheduleStore(db) {
  const root = db.collection(COLLECTION).doc('apalmer');
  const control = root.collection('state').doc('dispatcher');
  const dayRef = (day) => root.collection('days').doc(day);
  const recoveryRef = (id) => root.collection('recoveryReceipts').doc(id);
  const getConfig = async () => (await root.get()).data();
  const getDispatcher = async () => (await control.get()).data() || {};
  const getDay = async (day) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw fail('SEED_SCHEDULE_DAY_INVALID');
    return (await dayRef(day).get()).data() || null;
  };
  function check(saved, expected) {
    const current = validateConfig(saved);
    if (!current || current.fingerprint !== expected.fingerprint
      || current.healthPolicyFingerprint !== expected.healthPolicyFingerprint) throw fail('SEED_CONFIGURATION_CHANGED');
  }
  async function ensureDay(plan, config) {
    await db.runTransaction(async (tx) => {
      const [settings, existing] = await Promise.all([tx.get(root), tx.get(dayRef(plan.day))]);
      check(settings.data(), config);
      if (existing.exists) {
        if (existing.data().fingerprint !== config.fingerprint) throw fail('SEED_DAY_CONFIG_CHANGED');
      } else tx.set(dayRef(plan.day), plan);
    });
  }
  async function claim(day, config, now) {
    return db.runTransaction(async (tx) => {
      const [settings, state, saved] = await Promise.all([tx.get(root), tx.get(control), tx.get(dayRef(day))]);
      check(settings.data(), config);
      if (day !== businessTime(now).day) throw fail('SEED_SCHEDULE_DAY_INVALID');
      const current = state.data() || {};
      if (current.blocked) return null;
      if (current.active) {
        const writerAgeMs = now.getTime() - Date.parse(current.active.startedAt);
        if (writerAgeMs > MAX_WRITER_AGE_MS) {
          // Never reclaim an abandoned writer: its commit may already have happened.
          const activeRef = dayRef(current.active.day);
          const activeDay = current.active.day === day ? saved : await tx.get(activeRef);
          const plan = activeDay.data();
          const slot = plan.slots.find(({ id }) => id === current.active.id);
          if (Array.isArray(slot.identities) && !slot.identities.length && !slot.runStamp) {
            // Identities persist transactionally before any source write, so none means nothing was written.
            Object.assign(slot, {
              state: 'skipped', reason: 'abandoned_prewrite', errorCode: 'SEED_EXECUTION_INTERRUPTED',
              failureStage: SLOT_FAILURE_STAGES.abandoned, ingestion: 'not_started', updatedAt: now.toISOString(),
            });
            tx.set(activeRef, plan);
            const result = failedBreaker(current, now);
            tx.set(control, { blocked: false, active: null, breaker: result.breaker,
              recentEvents: skipEvents(current, now, { day: current.active.day, id: slot.id, industry: slot.industry,
                errorCode: slot.errorCode, failureStage: slot.failureStage }, result) });
            return {
              state: 'skipped_prewrite', day: current.active.day, id: slot.id, industry: slot.industry,
              count: slot.count, writerAgeMs, maxWriterAgeMs: MAX_WRITER_AGE_MS,
              breaker: { ...result.breaker, breakerOpened: result.breakerOpened },
            };
          }
          slot.state = 'needs_attention';
          slot.errorCode = 'SEED_EXECUTION_INTERRUPTED';
          slot.failureStage = SLOT_FAILURE_STAGES.abandoned;
          slot.updatedAt = now.toISOString();
          tx.set(activeRef, plan);
          tx.set(control, { ...current, blocked: true, recentEvents: withEvent(current, {
            type: 'needs_attention', at: now.toISOString(), day: current.active.day, id: slot.id,
            industry: slot.industry, errorCode: slot.errorCode, failureStage: slot.failureStage }) });
          return {
            state: 'needs_attention', day: current.active.day, id: slot.id,
            industry: slot.industry, count: slot.count, writerAgeMs, maxWriterAgeMs: MAX_WRITER_AGE_MS,
          };
        }
        if (current.active.waitingFlowHealth === true && current.active.day === day) {
          const plan = saved.data();
          const slot = plan?.slots?.find((item) => item.id === current.active.id);
          if (slot?.state !== 'waiting_flow_health' || !Array.isArray(slot.identities)
            || slot.identities.length || typeof slot.healthWaitStartedAt !== 'string'
            || !Number.isFinite(Date.parse(slot.healthWaitStartedAt))
            || !Number.isFinite(Date.parse(slot.startedAt))
            || slot.startedAt !== current.active.startedAt
            || Date.parse(slot.healthWaitStartedAt) < Date.parse(slot.startedAt)
            || Date.parse(slot.healthWaitStartedAt) > now.getTime()
            || Object.keys(slot).some((key) => /(write|commit|prepar|stamp|outcome|rowcount|batch|receipt)/i.test(key))) {
            throw fail('SEED_CLAIM_LOST');
          }
          slot.state = 'running';
          tx.set(dayRef(day), plan);
          tx.set(control, { ...current, active: { ...current.active, waitingFlowHealth: false } });
          return slot;
        }
        return null;
      }
      const openUntil = Date.parse(current.breaker?.openUntil);
      if (Number.isFinite(openUntil) && openUntil > now.getTime()) {
        return { state: 'breaker_open', openUntil: current.breaker.openUntil,
          consecutivePrewriteFailures: current.breaker.consecutivePrewriteFailures };
      }
      const plan = saved.data();
      if (plan.fingerprint !== config.fingerprint) throw fail('SEED_DAY_CONFIG_CHANGED');
      for (const slot of plan.slots) {
        if (slot.state === 'pending' && now.getTime() - Date.parse(slot.dueAt) >= 10 * 60_000) {
          slot.state = 'skipped';
          slot.reason = 'missed_window';
        }
      }
      const slot = plan.slots.find((item) => item.state === 'pending' && Date.parse(item.dueAt) <= now.getTime());
      if (!slot || plan.attemptedCount + slot.count > DAILY_CAP) {
        tx.set(dayRef(day), plan);
        return null;
      }
      slot.state = 'running';
      slot.startedAt = now.toISOString();
      plan.attemptedCount += slot.count;
      tx.set(dayRef(day), plan);
      tx.set(control, { blocked: false, active: { day, id: slot.id, startedAt: slot.startedAt }, ...carried(current) });
      return slot;
    });
  }
  async function prepared(day, id, config, receipt, now) {
    await db.runTransaction(async (tx) => {
      const [settings, state, saved] = await Promise.all([tx.get(root), tx.get(control), tx.get(dayRef(day))]);
      check(settings.data(), config);
      const plan = saved.data();
      const slot = plan.slots.find((item) => item.id === id);
      const active = state.data();
      if (active?.blocked || active?.active?.day !== day || active?.active?.id !== id
        || slot?.state !== 'running' || slot.identities.length) throw fail('SEED_CLAIM_LOST');
      slot.identities = receipt.profiles.map(({ email, ecid, crmId, recipientId }) => ({ email, ecid, crmId, recipientId }));
      slot.runStamp = receipt.runStamp;
      slot.updatedAt = now.toISOString();
      tx.set(dayRef(day), plan);
    });
  }
  async function deferFlowHealth(day, id, config, now) {
    await db.runTransaction(async (tx) => {
      const [settings, state, saved] = await Promise.all([tx.get(root), tx.get(control), tx.get(dayRef(day))]);
      check(settings.data(), config);
      const plan = saved.data();
      const slot = plan?.slots?.find((item) => item.id === id);
      const current = state.data();
      if (current?.blocked || current?.active?.day !== day || current?.active?.id !== id
        || current.active.waitingFlowHealth === true || slot?.state !== 'running'
        || slot.startedAt !== current.active.startedAt || !Array.isArray(slot.identities) || slot.identities.length
        || Object.keys(slot).some((key) => /(write|commit|prepar|stamp|outcome|rowcount|batch|receipt)/i.test(key))) {
        throw fail('SEED_CLAIM_LOST');
      }
      slot.state = 'waiting_flow_health';
      slot.healthWaitStartedAt ||= now.toISOString();
      slot.updatedAt = now.toISOString();
      tx.set(dayRef(day), plan);
      tx.set(control, { ...current, active: { ...current.active, waitingFlowHealth: true } });
    });
  }
  async function finish(day, id, patch, now) {
    return db.runTransaction(async (tx) => {
      const [saved, state] = await Promise.all([tx.get(dayRef(day)), tx.get(control)]);
      const plan = saved.data();
      const current = state.data();
      const slot = plan.slots.find((item) => item.id === id);
      if (current?.active?.day !== day || current?.active?.id !== id
        || slot?.state !== 'running') throw fail('SEED_CLAIM_LOST');
      Object.assign(slot, patch, { updatedAt: now.toISOString() });
      tx.set(dayRef(day), plan);
      const at = now.toISOString();
      const event = { day, id, industry: slot.industry, errorCode: patch.errorCode, failureStage: patch.failureStage };
      if (patch.state === 'skipped') {
        const result = failedBreaker(current, now);
        tx.set(control, { blocked: false, active: null, breaker: result.breaker,
          recentEvents: skipEvents(current, now, event, result) });
        return { ...result.breaker, breakerOpened: result.breakerOpened };
      }
      if (patch.state === 'needs_attention') {
        tx.set(control, { blocked: true, active: null, attention: { day, id }, ...carried(current),
          recentEvents: withEvent(current, { type: 'needs_attention', at, ...event }) });
        return null;
      }
      const recovered = current?.breaker?.consecutivePrewriteFailures > 0;
      const { breaker, ...rest } = carried(current);
      tx.set(control, { blocked: false, active: null, ...rest,
        ...(recovered ? { recentEvents: withEvent(current, { type: 'breaker_reset', at, day, id,
          previousConsecutivePrewriteFailures: breaker.consecutivePrewriteFailures }) } : {}) });
      return null;
    });
  }
  async function createRecoveryReceipt(receipt, verify) {
    return db.runTransaction(async (tx) => {
      const [settings, state, day, existing] = await Promise.all([
        tx.get(root), tx.get(control), tx.get(dayRef(receipt.day)), tx.get(recoveryRef(receipt.planId)),
      ]);
      if (existing.exists) throw Object.assign(fail('SEED_RECOVERY_RECEIPT_EXISTS'), { status: 409 });
      verify({ config: settings.data(), dispatcher: state.data(), day: day.data() });
      tx.set(recoveryRef(receipt.planId), receipt);
    });
  }
  async function getRecoveryReceipt(id) {
    return (await recoveryRef(id).get()).data() || null;
  }
  async function applyRecovery(id, verify) {
    return db.runTransaction(async (tx) => {
      const receiptDoc = await tx.get(recoveryRef(id));
      const receipt = receiptDoc.data();
      if (!receipt) throw Object.assign(fail('SEED_RECOVERY_RECEIPT_MISSING'), { status: 409 });
      const [settings, state, day] = await Promise.all([
        tx.get(root), tx.get(control), tx.get(dayRef(receipt.day)),
      ]);
      const changes = await verify({ receipt, config: settings.data(), dispatcher: state.data(), day: day.data() });
      changes.assertFresh();
      tx.set(dayRef(receipt.day), changes.day);
      tx.set(control, changes.dispatcher);
      if (changes.config) tx.set(root, changes.config);
      tx.set(recoveryRef(id), { ...receipt, consumedAt: changes.audit.appliedAt, audit: changes.audit });
      return changes.result;
    });
  }
  return { getConfig, getDispatcher, getDay, ensureDay, claim, prepared, deferFlowHealth, finish,
    createRecoveryReceipt, getRecoveryReceipt, applyRecovery };
}

module.exports = { createProfileSeedScheduleStore, COLLECTION };
