'use strict';

const { businessTime, DAILY_CAP, INDUSTRIES } = require('./profileSeedScheduleService');

const fail = (status, message) => Object.assign(new Error(message), { status });
const validDay = (day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
  && Number.isFinite(Date.parse(`${day}T00:00:00Z`))
  && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;

function savedProfiles(plan) {
  const profiles = [];
  for (const slot of plan?.slots || []) {
    if (!Array.isArray(slot.identities)) throw fail(503, 'Saved scheduled identities are unreadable.');
    if (slot.identities.length && (!INDUSTRIES.includes(slot.industry) || !/^\d{2}$/.test(slot.id))) {
      throw fail(503, 'Saved scheduled identity scope is invalid.');
    }
    slot.identities.forEach((identity, index) => {
      if (!identity || !['email', 'ecid', 'crmId', 'recipientId'].every((key) =>
        typeof identity[key] === 'string' && identity[key].trim() && identity[key].length <= 320)) {
        throw fail(503, 'A saved scheduled identity is incomplete.');
      }
      profiles.push({
        slotId: slot.id, index, industry: slot.industry,
        email: identity.email, ecid: identity.ecid, crmId: identity.crmId, recipientId: identity.recipientId,
        state: slot.state,
        sourceCommittedAt: slot.state === 'committed' ? slot.updatedAt || null : null,
        startedAt: slot.startedAt || null,
        preparedAt: null,
        errorCode: slot.errorCode || null,
      });
    });
    if (profiles.length > DAILY_CAP) throw fail(503, 'Saved scheduled identities exceed the daily bound.');
  }
  return profiles;
}

function createProfileSeedScheduleProfilesService({
  store, snowflake, aep, now = () => new Date(), logger = console,
}) {
  async function read({ principalUid, sandbox, day, slot, profile, verify = false }) {
    const config = await store.getConfig();
    if (config && (sandbox !== config.sandbox || principalUid !== config.ownerUid)) {
      throw fail(403, 'Scheduled profiles are restricted to the schedule owner and sandbox.');
    }
    const endDay = businessTime(now()).day;
    const startDay = new Date(Date.parse(`${endDay}T00:00:00Z`) - 6 * 86400_000).toISOString().slice(0, 10);
    const selectedDay = day === undefined ? endDay : day;
    if (!validDay(selectedDay) || selectedDay < startDay || selectedDay > endDay) {
      throw fail(400, 'Choose a date in the last seven calendar days in Asia/Riyadh.');
    }
    if (verify && (!/^\d{2}$/.test(slot) || !Number.isInteger(profile) || profile < 0 || profile >= DAILY_CAP)) {
      throw fail(400, 'Choose one saved scheduled profile to verify.');
    }
    const result = {
      ok: true, sandbox, configured: !!config, day: selectedDay,
      observedAt: now().toISOString(), range: { startDay, endDay }, limit: DAILY_CAP, total: 0, profiles: [],
    };
    if (!config) {
      if (verify) throw fail(404, 'The scheduled profile is not available.');
      return result;
    }
    const plan = await store.getDay(selectedDay);
    if (plan && (plan.day !== selectedDay || !Array.isArray(plan.slots))) {
      throw fail(503, 'The saved schedule day is unreadable.');
    }
    const profiles = savedProfiles(plan);
    if (!verify) return { ...result, total: profiles.length, profiles };
    const selected = profiles.find((entry) => entry.slotId === slot && entry.index === profile);
    if (!selected) throw fail(404, 'The scheduled profile is not available.');

    const identity = Object.fromEntries(['email', 'ecid', 'crmId', 'recipientId'].map((key) => [key, selected[key]]));
    const unavailable = (detail) => ({ state: 'unavailable', detail });
    const report = (stage, error) => logger.warn('[scheduled-profiles] Readback unavailable', {
      stage, code: error.code || 'unavailable',
    });
    const [warehouse, aepProfile] = await Promise.all([
      (async () => {
        try {
          return await snowflake.inspect({ uid: principalUid, industry: selected.industry, identity });
        } catch (error) {
          report('snowflake', error);
          return {
            source: unavailable('Snowflake source readback failed. A commit receipt is not a stored-row verification.'),
            rel: unavailable('Snowflake REL readback failed. No data was repaired.'),
          };
        }
      })(),
      (async () => {
        try {
          if (!config.expectedMobilePhone) throw fail(503, 'The saved schedule has no expected mobile.');
          return await aep.inspect(identity, { mobilePhone: config.expectedMobilePhone });
        } catch (error) {
          report('aepProfile', error);
          return unavailable('AEP Profile readback failed. Arrival and absence are both unconfirmed.');
        }
      })(),
    ]);
    selected.verification = {
      checkedAt: now().toISOString(), source: warehouse.source, rel: warehouse.rel, aepProfile,
      aepStorage: {
        state: 'manual',
        detail: 'AEP dataset and REL storage require separate dataset-level verification. Merged Profile visibility and Snowflake REL rows do not prove AEP REL arrival.',
      },
    };
    return { ...result, observedAt: now().toISOString(), total: 1, profiles: [selected] };
  }
  return { read };
}

module.exports = { createProfileSeedScheduleProfilesService };
