'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProfileSeedScheduleDiagnosticsService } = require('../profileSeedScheduleDiagnosticsService');

const privateEmail = 'private-profile@example.test';
const privatePhone = '+447700900111';
const privateUid = 'owner-secret-uid';
const config = {
  enabled: true, ownerUid: privateUid, sandbox: 'apalmer',
  expectedBaseEmail: privateEmail, expectedMobilePhone: privatePhone,
  timeZone: 'Asia/Riyadh', startHour: 8, endHour: 18,
  days: [0, 1, 2, 3, 4, 5], dailyCap: 50,
};
const day = '2026-11-11';

function fixture(currentTime = '2026-11-11T13:00:00.000Z', { flowError, configPatch, dispatcherPatch } = {}) {
  let flowReads = 0;
  const dayReads = [];
  const savedPlan = {
    day, plannedCount: 30, attemptedCount: 2,
    slots: [{
      id: '15', industry: 'retail', count: 2, dueAt: '2026-11-11T12:54:00.000Z',
      startedAt: '2026-11-11T12:55:07.000Z', updatedAt: '2026-11-11T12:55:14.000Z',
      state: 'needs_attention', errorCode: 'SEED_INGESTION_NOT_HEALTHY', failureStage: 'flow_health',
      ingestion: 'unverified',
      identities: [{ email: privateEmail, ecid: 'private-ecid', crmId: 'private-crm', recipientId: 'private-recipient' }],
      flowHealth: { healthy: false, issues: [{ code: 'failed_count_unknown', flowId: 'flow-a' }] },
    }],
  };
  const service = createProfileSeedScheduleDiagnosticsService({
    now: () => new Date(currentTime),
    store: {
      getConfig: async () => ({ ...config, ...configPatch }),
      getDispatcher: async () => ({ blocked: true, active: null, attention: { day, id: '15' }, ...dispatcherPatch }),
      getDay: async (requestedDay) => {
        dayReads.push(requestedDay);
        return requestedDay === day ? savedPlan : null;
      },
    },
    flowSnapshot: async (industry) => {
      flowReads++;
      assert.equal(industry, 'retail');
      if (flowError) throw flowError;
      return {
        complete: true,
        flows: [{
          id: 'flow-a', state: 'enabled', schedule: { frequency: 'minute', interval: 15 },
          lastRun: { state: 'success', completedAt: '2026-11-11T12:59:00.000Z', failedCount: null },
        }],
      };
    },
  });
  return { service, get flowReads() { return flowReads; }, dayReads };
}

test('owner diagnostics return slot and live flow reasons without profile identity or schedule preferences', async () => {
  const f = fixture();
  const result = await f.service.diagnose({ principalUid: privateUid, sandbox: 'apalmer' });
  assert.equal(result.dispatcher.blocked, true);
  assert.equal(result.dispatcher.attention.id, '15');
  assert.equal(result.focus.slot.preparedIdentityCount, 1);
  assert.equal(result.focus.slot.failureStage, 'flow_health');
  assert.equal(result.focus.slot.flowHealthAtFailure.healthy, false);
  assert.equal(result.focus.liveFlowHealthError, null);
  assert.equal(result.focus.liveFlowHealth.issues[0].code, 'failed_count_unknown');
  assert.equal(result.focus.liveFlowHealth.flows[0].lastRun.failedCount, null);
  assert.equal(f.flowReads, 1);
  const serialized = JSON.stringify(result);
  for (const secret of [privateEmail, privatePhone, privateUid, 'private-ecid', 'private-crm', 'private-recipient']) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('unavailable current flow health does not erase the saved failure or expose provider errors', async () => {
  const f = fixture(undefined, { flowError: new Error('private credential material') });
  const result = await f.service.diagnose({ principalUid: privateUid, sandbox: 'apalmer' });
  assert.equal(result.dispatcher.blocked, true);
  assert.equal(result.focus.slot.flowHealthAtFailure.issues[0].code, 'failed_count_unknown');
  assert.equal(result.focus.liveFlowHealth, null);
  assert.equal(result.focus.liveFlowHealthObservedAt, null);
  assert.equal(result.focus.liveFlowHealthError.code, 'SEED_FLOW_SNAPSHOT_UNAVAILABLE');
  assert.equal(result.focus.liveFlowHealthError.stage, 'flow_snapshot');
  assert.doesNotMatch(JSON.stringify(result), /private credential material/);
});

test('invalid saved health policy leaves current health unknown rather than adopting the default', async () => {
  const f = fixture(undefined, { configPatch: { allowVerifiedIdleRuns: true } });
  const result = await f.service.diagnose({ principalUid: privateUid, sandbox: 'apalmer' });
  assert.equal(result.focus.liveFlowHealth, null);
  assert.equal(result.focus.liveFlowHealthError.code, 'SEED_HEALTH_POLICY_INVALID');
  assert.equal(result.focus.liveFlowHealthError.stage, 'flow_health');
  assert.equal(result.dispatcher.blocked, true);
});

test('diagnostics include seven recent business days and retain an older dispatcher focus', async () => {
  const f = fixture('2026-11-19T13:00:00.000Z');
  const result = await f.service.diagnose({ principalUid: privateUid, sandbox: 'apalmer', historyDays: 7 });
  assert.deepEqual(f.dayReads, [
    '2026-11-19', '2026-11-18', '2026-11-17', '2026-11-16',
    '2026-11-15', '2026-11-14', '2026-11-13', '2026-11-11',
  ]);
  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].day, day);
  assert.equal(result.focus.day, day);
  assert.equal(result.focus.liveFlowHealth.maxRunAgeMs, 120 * 60_000);
  assert.equal(result.focus.liveFlowHealth.flows[0].lastRun.ageMs, (8 * 24 * 60 + 1) * 60_000);
  assert.ok(result.focus.liveFlowHealth.issues.some(({ code, flowId }) =>
    code === 'last_run_stale' && flowId === 'flow-a'));
  assert.ok(result.focus.slot.flowHealthAtFailure.issues.every(({ code }) => code !== 'last_run_stale'));
});

test('non-owner or wrong-sandbox requests fail before querying Adobe flow health', async () => {
  for (const identity of [
    { principalUid: 'different-user', sandbox: 'apalmer' },
    { principalUid: privateUid, sandbox: 'other' },
  ]) {
    const f = fixture();
    await assert.rejects(f.service.diagnose(identity), { status: 403 });
    assert.equal(f.flowReads, 0);
  }
});

test('missing configuration returns a minimal read-only result', async () => {
  const f = fixture();
  f.service = createProfileSeedScheduleDiagnosticsService({
    store: { getConfig: async () => null },
    flowSnapshot: async () => { throw new Error('must not fetch'); },
  });
  assert.deepEqual(await f.service.diagnose({ principalUid: 'any-user', sandbox: 'sandbox-a' }), {
    ok: true, sandbox: 'sandbox-a', configured: false,
  });
});

test('diagnostics honor reviewed idle policy and preserve unknown failure counters', async () => {
  const { runSummary } = require('../myDataFlowsService');
  const metrics = { recordSummary: { inputRecordCount: 0 }, sizeSummary: { inputBytes: 0 },
    statusSummary: { status: 'success' }, durationSummary: {
      startedAtUTC: Date.parse('2026-11-11T12:58:00Z'), completedAtUTC: Date.parse('2026-11-11T12:59:00Z'),
    } };
  const lastRun = runSummary({ id: 'run-a', metrics, activities: [{
    ...structuredClone(metrics), id: '4f008a00-3a04-11eb-adc1-0242ac120002', name: 'SnowFlake Copy Activity',
  }] });
  const service = createProfileSeedScheduleDiagnosticsService({
    now: () => new Date('2026-11-11T13:00:00Z'),
    store: {
      getConfig: async () => ({ ...config, allowVerifiedIdleRuns: true, verifiedIdleRunReview: {
        policy: 'verified_empty_snowflake_copy_v1', reviewedBy: privateUid,
        reviewedAt: '2026-11-11T12:00:00.000Z', planId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      } }),
      getDispatcher: async () => ({ blocked: true, active: null, attention: { day, id: '15' } }),
      getDay: async () => ({ day, slots: [{ id: '15', industry: 'retail', identities: [] }] }),
    },
    flowSnapshot: async () => ({ complete: true, flows: [{ id: 'flow-a', state: 'enabled',
      schedule: { frequency: 'minute', interval: 15 }, lastRun }] }),
  });
  const result = await service.diagnose({ principalUid: privateUid, sandbox: 'apalmer' });
  assert.equal(result.focus.liveFlowHealth.healthy, true);
  assert.equal(result.focus.liveFlowHealth.flows[0].lastRun.failedCount, null);
});

test('diagnostics expose the prewrite breaker and sanitized recent events newest first', async () => {
  const events = Array.from({ length: 55 }, (_, index) => ({
    type: 'prewrite_skipped', at: new Date(Date.UTC(2026, 10, 11, 8, index)).toISOString(), day, id: '15',
    industry: 'retail', errorCode: 'SEED_EXECUTION_INTERRUPTED', failureStage: 'snowflake_preflight',
    consecutivePrewriteFailures: index + 1, message: 'private provider detail', email: privateEmail,
  }));
  events.push({ type: 'invented', errorCode: 'not a code', failureStage: 'nowhere', id: 'x' });
  const { service } = fixture(undefined, {
    dispatcherPatch: {
      blocked: false, attention: null,
      breaker: {
        consecutivePrewriteFailures: 3, openedAt: '2026-11-11T12:40:00.000Z',
        openUntil: '2026-11-11T13:10:00.000Z', lastFailureAt: '2026-11-11T12:40:00.000Z', secret: 'x',
      },
      recentEvents: events,
    },
  });
  const result = await service.diagnose({ principalUid: privateUid, sandbox: 'apalmer' });
  assert.deepEqual(result.dispatcher.breaker, {
    consecutivePrewriteFailures: 3, threshold: 3, open: true, openedAt: '2026-11-11T12:40:00.000Z',
    openUntil: '2026-11-11T13:10:00.000Z', lastFailureAt: '2026-11-11T12:40:00.000Z',
  });
  assert.equal(result.dispatcher.recentEvents.length, 50);
  assert.equal(result.dispatcher.recentEvents[0].type, 'unknown');
  assert.equal(result.dispatcher.recentEvents[0].errorCode, null);
  assert.equal(result.dispatcher.recentEvents[0].failureStage, null);
  assert.equal(result.dispatcher.recentEvents[1].consecutivePrewriteFailures, 55);
  assert.equal(result.dispatcher.recentEvents[1].failureStage, 'snowflake_preflight');
  assert.doesNotMatch(JSON.stringify(result), /private provider detail|private-profile|secret/);
});
