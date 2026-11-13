'use strict';

const { businessTime, diagnoseFlowHealth, INDUSTRIES } = require('./profileSeedScheduleService');

const fail = (status, message) => Object.assign(new Error(message), { status });

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

function createProfileSeedScheduleDiagnosticsService({ store, flowSnapshot, now = () => new Date() }) {
  async function diagnose({ principalUid, sandbox }) {
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
    const days = [...new Set([currentDay, focusDay])];
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
    if (targetSlot) {
      if (!INDUSTRIES.includes(targetSlot.industry)) {
        throw fail(500, 'The saved profile schedule slot has an invalid industry.');
      }
      flowHealth = diagnoseFlowHealth(await flowSnapshot(targetSlot.industry), now());
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
      } : null,
      note: 'Live flow health is a fresh read and does not reconstruct the health snapshot from the original slot attempt.',
    };
  }

  return { diagnose };
}

module.exports = { createProfileSeedScheduleDiagnosticsService };
