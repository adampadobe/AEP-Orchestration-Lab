'use strict';

const { businessTime, diagnoseFlowHealth, INDUSTRIES, SLOT_FAILURE_STAGES } = require('./profileSeedScheduleService');

const fail = (status, message) => Object.assign(new Error(message), { status });
const failureStages = new Set(Object.values(SLOT_FAILURE_STAGES));

function slotSummary(slot) {
  return {
    id: slot.id,
    industry: slot.industry,
    count: slot.count,
    dueAt: slot.dueAt,
    startedAt: slot.startedAt || null,
    updatedAt: slot.updatedAt || null,
    state: slot.state,
    reason: slot.reason || null,
    errorCode: slot.errorCode || null,
    failureStage: failureStages.has(slot.failureStage) ? slot.failureStage : null,
    ingestion: slot.ingestion || null,
    preparedIdentityCount: Array.isArray(slot.identities) ? slot.identities.length : 0,
    flowHealthAtFailure: slot.flowHealth || null,
  };
}

function planSummary(plan) {
  if (!plan) return null;
  const slots = Array.isArray(plan.slots) ? plan.slots : [];
  return {
    day: plan.day,
    plannedCount: plan.plannedCount ?? null,
    attemptedCount: plan.attemptedCount ?? null,
    slots: slots.map(slotSummary),
  };
}

function recentBusinessDays(day, count = 7) {
  const [year, month, date] = day.split('-').map(Number);
  return Array.from({ length: count }, (_, offset) =>
    new Date(Date.UTC(year, month - 1, date - offset)).toISOString().slice(0, 10));
}

function createProfileSeedScheduleDiagnosticsService({ store, flowSnapshot, now = () => new Date() }) {
  async function diagnose({ principalUid, sandbox, historyDays = 2 }) {
    if (![2, 7].includes(historyDays)) throw fail(400, 'Profile schedule history window is invalid.');
    const config = await store.getConfig();
    if (!config) return { ok: true, sandbox, configured: false };
    if (sandbox !== config.sandbox || principalUid !== config.ownerUid) {
      throw fail(403, 'Profile schedule diagnostics are restricted to the schedule owner and sandbox.');
    }

    const clock = now();
    const currentDay = businessTime(clock).day;
    const dispatcher = await store.getDispatcher();
    const focus = dispatcher.attention || dispatcher.active || null;
    const focusDay = focus?.day || currentDay;
    const days = [...new Set([...recentBusinessDays(currentDay, historyDays), focusDay])];
    const plans = await Promise.all(days.map((day) => store.getDay(day)));
    const daySummaries = plans.filter(Boolean).map(planSummary);
    const focusedPlan = plans[days.indexOf(focusDay)];
    let targetSlot = focus?.id
      ? focusedPlan?.slots?.find((slot) => slot.id === focus.id)
      : null;
    if (!targetSlot && focusedPlan?.day === currentDay) {
      targetSlot = focusedPlan.slots?.find((slot) => slot.state === 'pending') || null;
    }

    let flowHealth = null;
    let liveFlowHealthError = null;
    if (targetSlot) {
      if (!INDUSTRIES.includes(targetSlot.industry)) {
        throw fail(500, 'The saved profile schedule slot has an invalid industry.');
      }
      let snapshot;
      try {
        snapshot = await flowSnapshot(targetSlot.industry);
      } catch {
        liveFlowHealthError = {
          code: 'SEED_FLOW_SNAPSHOT_UNAVAILABLE', stage: SLOT_FAILURE_STAGES.flowSnapshot,
          message: 'Current flow health is unknown. Check Adobe authentication and Flow Service access, then rerun diagnostics.',
        };
      }
      if (!liveFlowHealthError) {
        try {
          flowHealth = diagnoseFlowHealth(snapshot, now(), config);
        } catch (error) {
          if (error?.code !== 'SEED_HEALTH_POLICY_INVALID') throw error;
          liveFlowHealthError = {
            code: 'SEED_HEALTH_POLICY_INVALID', stage: SLOT_FAILURE_STAGES.flowHealth,
            message: 'Current flow health is unknown. Inspect the saved scheduler health policy and its review metadata.',
          };
        }
      }
    }

    return {
      ok: true,
      sandbox,
      configured: true,
      observedAt: now().toISOString(),
      schedule: {
        enabled: config.enabled === true,
        timeZone: config.timeZone || null,
        startHour: config.startHour ?? null,
        endHour: config.endHour ?? null,
        days: Array.isArray(config.days) ? config.days : [],
        dailyCap: config.dailyCap ?? null,
      },
      dispatcher: {
        blocked: dispatcher.blocked === true,
        active: dispatcher.active ? {
          day: dispatcher.active.day,
          id: dispatcher.active.id,
          startedAt: dispatcher.active.startedAt,
        } : null,
        attention: dispatcher.attention ? {
          day: dispatcher.attention.day,
          id: dispatcher.attention.id,
        } : null,
      },
      days: daySummaries,
      focus: targetSlot ? {
        day: focusDay,
        slot: slotSummary(targetSlot),
        liveFlowHealthObservedAt: flowHealth?.observedAt || null,
        liveFlowHealth: flowHealth,
        liveFlowHealthError,
      } : null,
      note: 'Saved failure evidence is historical. Live flow health is a separate read; it does not clear a dispatcher block or establish AEP arrival. Do not replay generation.',
    };
  }

  return { diagnose };
}

module.exports = { createProfileSeedScheduleDiagnosticsService };
