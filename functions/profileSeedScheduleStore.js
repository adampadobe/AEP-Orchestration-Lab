'use strict';

const { validateConfig, DAILY_CAP } = require('./profileSeedScheduleService');
const COLLECTION = 'labProfileSeedSchedules';
const fail = (code) => Object.assign(new Error(code), { code });

function createProfileSeedScheduleStore(db) {
  const root = db.collection(COLLECTION).doc('apalmer');
  const control = root.collection('state').doc('dispatcher');
  const dayRef = (day) => root.collection('days').doc(day);
  const getConfig = async () => (await root.get()).data();
  function check(saved, expected) {
    const current = validateConfig(saved);
    if (!current || current.fingerprint !== expected.fingerprint) throw fail('SEED_CONFIGURATION_CHANGED');
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
      const current = state.data() || {};
      if (current.blocked) return null;
      if (current.active) {
        if (now.getTime() - Date.parse(current.active.startedAt) > 15 * 60_000) {
          // Never reclaim an abandoned writer: its commit may already have happened.
          const activeRef = dayRef(current.active.day);
          const activeDay = current.active.day === day ? saved : await tx.get(activeRef);
          const plan = activeDay.data();
          const slot = plan.slots.find(({ id }) => id === current.active.id);
          slot.state = 'needs_attention';
          slot.errorCode = 'SEED_EXECUTION_INTERRUPTED';
          slot.updatedAt = now.toISOString();
          tx.set(activeRef, plan);
          tx.set(control, { ...current, blocked: true });
          return { state: 'needs_attention' };
        }
        return null;
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
      tx.set(control, { blocked: false, active: { day, id: slot.id, startedAt: slot.startedAt } });
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
  async function finish(day, id, patch, now) {
    await db.runTransaction(async (tx) => {
      const [saved, state] = await Promise.all([tx.get(dayRef(day)), tx.get(control)]);
      const plan = saved.data();
      const current = state.data();
      const slot = plan.slots.find((item) => item.id === id);
      if (current?.active?.day !== day || current?.active?.id !== id
        || slot?.state !== 'running') throw fail('SEED_CLAIM_LOST');
      Object.assign(slot, patch, { updatedAt: now.toISOString() });
      tx.set(dayRef(day), plan);
      tx.set(control, { blocked: patch.state === 'needs_attention', active: null,
        ...(patch.state === 'needs_attention' ? { attention: { day, id } } : {}) });
    });
  }
  return { getConfig, ensureDay, claim, prepared, finish };
}

module.exports = { createProfileSeedScheduleStore, COLLECTION };
