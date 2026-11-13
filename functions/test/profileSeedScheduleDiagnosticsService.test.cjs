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

function fixture() {
  let flowReads = 0;
  const savedPlan = {
    day, plannedCount: 30, attemptedCount: 2,
    slots: [{
      id: '15', industry: 'retail', count: 2, dueAt: '2026-11-11T12:54:00.000Z',
      startedAt: '2026-11-11T12:55:07.000Z', updatedAt: '2026-11-11T12:55:14.000Z',
      state: 'needs_attention', errorCode: 'SEED_INGESTION_NOT_HEALTHY', ingestion: 'unverified',
      identities: [{ email: privateEmail, ecid: 'private-ecid', crmId: 'private-crm', recipientId: 'private-recipient' }],
      flowHealth: { healthy: false, issues: [{ code: 'failed_count_unknown', flowId: 'flow-a' }] },
    }],
  };
  const service = createProfileSeedScheduleDiagnosticsService({
    now: () => new Date('2026-11-11T13:00:00.000Z'),
    store: {
      getConfig: async () => config,
      getDispatcher: async () => ({ blocked: true, active: null, attention: { day, id: '15' } }),
      getDay: async (requestedDay) => requestedDay === day ? savedPlan : null,
    },
    flowSnapshot: async (industry) => {
      flowReads++;
      assert.equal(industry, 'retail');
      return {
        complete: true,
        flows: [{
          id: 'flow-a', state: 'enabled', schedule: { frequency: 'minute', interval: 15 },
          lastRun: { state: 'success', completedAt: '2026-11-11T12:59:00.000Z', failedCount: null },
        }],
      };
    },
  });
  return { service, get flowReads() { return flowReads; } };
}

test('owner diagnostics return slot and live flow reasons without profile identity or schedule preferences', async () => {
  const f = fixture();
  const result = await f.service.diagnose({ principalUid: privateUid, sandbox: 'apalmer' });
  assert.equal(result.dispatcher.blocked, true);
  assert.equal(result.dispatcher.attention.id, '15');
  assert.equal(result.focus.slot.preparedIdentityCount, 1);
  assert.equal(result.focus.liveFlowHealth.issues[0].code, 'failed_count_unknown');
  assert.equal(result.focus.liveFlowHealth.flows[0].lastRun.failedCount, null);
  assert.equal(f.flowReads, 1);
  const serialized = JSON.stringify(result);
  for (const secret of [privateEmail, privatePhone, privateUid, 'private-ecid', 'private-crm', 'private-recipient']) {
    assert.equal(serialized.includes(secret), false);
  }
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
