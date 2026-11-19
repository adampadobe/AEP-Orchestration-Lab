'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProfileSeedScheduleProfilesService } = require('../profileSeedScheduleProfilesService');

const day = '2026-11-18';
const identity = { email: 'scheduled+18112026-1@example.test', ecid: '10000001', crmId: 'CRM0001', recipientId: 'R-0001' };
const input = { principalUid: 'owner', sandbox: 'apalmer', day };
const verifyInput = { ...input, slot: '00', profile: 0, verify: true };

function fixture(patch = {}) {
  const reads = [], warnings = [];
  const plan = patch.plan || {
    day, slots: [
      { id: '00', industry: 'retail', state: 'committed', startedAt: `${day}T08:00:00Z`,
        updatedAt: `${day}T08:00:12Z`, identities: [identity] },
      { id: '01', industry: 'sports', state: 'needs_attention', errorCode: 'SEED_EXECUTION_INTERRUPTED',
        identities: [{ ...identity, email: 'prepared@example.test' }] },
      { id: '02', industry: 'fsi', state: 'skipped', identities: [] },
    ],
  };
  const service = createProfileSeedScheduleProfilesService({
    now: () => new Date(patch.now || '2026-11-19T03:00:00Z'),
    store: {
      getConfig: async () => patch.noConfig ? null : {
        ownerUid: 'owner', sandbox: 'apalmer', expectedMobilePhone: '+447700900111',
        expectedBaseEmail: 'not-for-the-response@example.test', privateSetting: 'private-setting',
      },
      getDay: async (value) => { reads.push(['day', value]); return patch.missingDay ? null : plan; },
      finish() { throw new Error('No scheduler writes are allowed.'); },
    },
    snowflake: {
      inspect: async (args) => {
        reads.push(['snowflake', args]);
        if (patch.snowflakeFails) throw new Error('private snowflake credentials');
        return { source: { state: 'verified', detail: 'Exact identity matched.', evidence: [] },
          rel: { state: 'waiting', detail: 'REL projection not visible yet.', evidence: [] } };
      },
      generate() { throw new Error('No generation is allowed.'); },
    },
    aep: {
      inspect: async (saved, expected) => {
        reads.push(['aep', saved, expected]);
        if (patch.aepFails) throw new Error('private Adobe token');
        return { state: 'verified', detail: 'Identity and basic fields verified, not a full mapping audit.' };
      },
    },
    logger: { warn: (...args) => warnings.push(args) },
  });
  return { service, reads, plan, warnings };
}

test('list exposes only owner-scoped saved identities and separates preparation from a source commit', async () => {
  const f = fixture();
  const result = await f.service.read(input);
  assert.equal(result.total, 2);
  assert.equal(result.profiles[0].sourceCommittedAt, `${day}T08:00:12Z`);
  assert.equal(result.profiles[1].sourceCommittedAt, null);
  assert.equal(result.profiles[1].state, 'needs_attention');
  assert.equal(result.profiles[1].errorCode, 'SEED_EXECUTION_INTERRUPTED');
  assert.equal(result.profiles[0].verification, undefined);
  assert.deepEqual(f.reads, [['day', day]]);
  for (const secret of ['ownerUid', 'expectedMobilePhone', 'private-setting', 'not-for-the-response']) {
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test('configuration owner and sandbox mismatches fail before reading any identity or provider', async () => {
  for (const scope of [{ principalUid: 'not-owner' }, { sandbox: 'other' }]) {
    const f = fixture();
    await assert.rejects(f.service.read({ ...input, ...scope }), { status: 403 });
    assert.deepEqual(f.reads, []);
  }
});

test('read uses the Riyadh calendar boundary and rejects malformed, old and future dates', async () => {
  const f = fixture({ now: '2026-11-18T21:30:00Z', missingDay: true });
  const result = await f.service.read({ ...input, day: undefined });
  assert.equal(result.day, '2026-11-19');
  assert.deepEqual(result.range, { startDay: '2026-11-13', endDay: '2026-11-19' });
  assert.equal((await f.service.read({ ...input, day: '2026-11-13' })).total, 0);
  const reads = f.reads.length;
  for (const value of ['2026-11-12', '2026-11-20', '2026-11-31', '2026-1-19', ['2026-11-18']]) {
    await assert.rejects(f.service.read({ ...input, day: value }), { status: 400 });
  }
  assert.equal(f.reads.length, reads);
});

test('empty configuration or day is explicit rather than a synthetic profile', async () => {
  const absent = fixture({ noConfig: true });
  const result = await absent.service.read(input);
  assert.equal(result.configured, false);
  assert.deepEqual(result.profiles, []);
  assert.deepEqual(absent.reads, []);
  assert.equal((await fixture({ missingDay: true }).service.read(input)).total, 0);
  await assert.rejects(absent.service.read(verifyInput), { status: 404 });
});

test('the full daily bound is listed without hiding the final saved profile', async () => {
  const f = fixture({ plan: { day, slots: [{
    id: '00', industry: 'retail', state: 'committed',
    identities: Array.from({ length: 50 }, (_, index) => ({ ...identity, email: `scheduled-${index}@example.test` })),
  }] } });
  const result = await f.service.read(input);
  assert.equal(result.limit, 50);
  assert.equal(result.total, 50);
  assert.equal(result.profiles[49].index, 49);
  const checked = await f.service.read({ ...verifyInput, profile: 49 });
  assert.equal(checked.profiles[0].email, 'scheduled-49@example.test');
});

test('verification resolves the identity server-side for every industry without writes', async () => {
  for (const industry of ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']) {
    const f = fixture();
    f.plan.slots[0].industry = industry;
    const before = JSON.stringify(f.plan);
    const result = await f.service.read(verifyInput);
    assert.equal(result.total, 1);
    assert.deepEqual(f.reads[1], ['snowflake', { uid: 'owner', industry, identity }]);
    assert.deepEqual(f.reads[2], ['aep', identity, { mobilePhone: '+447700900111' }]);
    const check = result.profiles[0].verification;
    assert.equal(check.source.state, 'verified');
    assert.equal(check.rel.state, 'waiting');
    assert.equal(check.aepProfile.state, 'verified');
    assert.equal(check.aepStorage.state, 'manual');
    assert.equal(check.checkedAt, '2026-11-19T03:00:00.000Z');
    assert.equal(JSON.stringify(f.plan), before);
  }
});

test('provider failures stay independent and explicit without leaking raw errors or logging identities', async () => {
  for (const patch of [{ snowflakeFails: true }, { aepFails: true }, { snowflakeFails: true, aepFails: true }]) {
    const f = fixture(patch);
    const { verification } = (await f.service.read(verifyInput)).profiles[0];
    assert.equal(verification.source.state, patch.snowflakeFails ? 'unavailable' : 'verified');
    assert.equal(verification.aepProfile.state, patch.aepFails ? 'unavailable' : 'verified');
    assert.equal(verification.aepStorage.state, 'manual');
    assert.ok(f.warnings.length > 0);
    assert.equal(JSON.stringify(verification).includes('private'), false);
    assert.equal(JSON.stringify(f.warnings).includes(identity.email), false);
  }
});

test('unknown selectors and malformed saved identities cannot trigger provider readback or silent truncation', async () => {
  for (const [patch, status] of [
    [{ slot: '99' }, 404], [{ profile: 1 }, 404], [{ profile: -1 }, 400],
    [{ profile: 50 }, 400], [{ profile: '0' }, 400],
  ]) {
    const f = fixture();
    await assert.rejects(f.service.read({ ...verifyInput, ...patch }), { status });
    assert.ok(f.reads.every(([type]) => type === 'day'));
  }
  for (const mutate of [
    (plan) => { plan.day = '2026-11-17'; },
    (plan) => { plan.slots[0].identities[0] = { email: identity.email }; },
    (plan) => { plan.slots[0].industry = 'legacy'; },
    (plan) => { plan.slots[0].identities = Array.from({ length: 51 }, () => ({ ...identity })); },
  ]) {
    const f = fixture();
    f.plan.slots = structuredClone(f.plan.slots);
    mutate(f.plan);
    await assert.rejects(f.service.read(verifyInput), { status: 503 });
    assert.ok(f.reads.every(([type]) => type === 'day'));
  }
});
