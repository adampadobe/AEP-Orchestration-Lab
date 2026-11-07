import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const EMAIL = 'offline@example.com';
const ECID = '12345678901234567890123456789012345678';
const calls = [];
let generationResult;
let recentOk = true;
let snowflakeOk = true;
let job;

mock.module('../src/framework/dualStreamGenerate.mjs', { namedExports: {
  planDualStreamGenerate: params => ({ dualStream: true, steps: [], params }),
  executeGeneratePlan: async () => {
    calls.push({ stage: 'generate' });
    return generationResult;
  },
} });
mock.module('../src/batchJobStore.mjs', { namedExports: {
  getBatchJob: async () => job,
  updateBatchJob: async (_id, patch) => { job = { ...job, ...structuredClone(patch) }; },
} });
mock.module('../src/tools/generationPrefs.mjs', { namedExports: {
  resolveStoredPrefsEmail: async () => ({ ok: true, email: EMAIL }),
} });
mock.module('../src/framework/recordRecentProfile.mjs', { namedExports: {
  personHintsFromAttributes: () => ({}),
  recordRecentProfileGenerated: async params => {
    calls.push({ stage: 'recent', params });
    return recentOk ? { ok: true } : { ok: false, error: 'Recent store unavailable' };
  },
} });
mock.module('../src/labApiClient.mjs', { namedExports: {
  snowflakeInsertProfileFromAep: async params => {
    calls.push({ stage: 'snowflake', params });
    return snowflakeOk
      ? { ok: true, data: { result: { crmId: 'offline-crm' } } }
      : { ok: false, error: 'Snowflake unavailable' };
  },
  snowflakeEnrichProfiles: async () => { throw new Error('No enrichment requested'); },
  lookupProfile: async () => ({ ok: true, data: { found: true, rows: [] } }),
  snowflakeProfileBundle: async () => { throw new Error('No bundle requested'); },
} });
mock.module('../src/auditLog.mjs', { namedExports: { writeAuditLog: () => {} } });

const { processBatchJob } = await import('../src/batchProcessor.mjs');
const { processPlaybookJob } = await import('../src/playbookProcessor.mjs');
let run = 0;

async function invoke(worker, result, options = {}) {
  calls.length = 0;
  generationResult = result;
  recentOk = options.recentOk ?? true;
  snowflakeOk = options.snowflakeOk ?? true;
  job = { params: {
    sandbox: 'offline', industry: 'media', count: 1, use_stored_prefs: true,
    dual_load_snowflake: true, randomize: false, delay_ms: 0,
    attributes: { 'industryMedia.primaryGenre': 'Drama' },
  } };
  await worker('offline-job', { keyId: `offline-worker-${++run}` });
  return job;
}

for (const [name, worker] of [['batch', processBatchJob], ['playbook', processPlaybookJob]]) {
  test(`${name}: timeout preserves identity, attempts follow-ups once and remains failed/partial`, async () => {
    const result = await invoke(worker, {
      ok: false, partialSuccess: true, ecid: ECID,
      errorCode: 'GENERIC_PROFILE_PERSISTENCE_TIMEOUT',
      error: 'Generic accepted; overlay pending. Do not regenerate this identity.',
      stepResults: [{ step: 1, ok: true, persistence: { ready: false } }],
    });
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.progress, { completed: 1, total: 1, failed: 1, succeeded: 0 });
    assert.equal(result.results[0].ok, false);
    assert.equal(result.results[0].partial_success, true);
    assert.equal(result.results[0].retry_safe, false);
    assert.equal(result.results[0].ecid, ECID);
    assert.deepEqual(calls.map(call => call.stage), ['generate', 'recent', 'snowflake']);
    const recent = calls.find(call => call.stage === 'recent');
    const snowflake = calls.find(call => call.stage === 'snowflake');
    assert.equal(recent.params.generationStatus, 'overlay_pending');
    assert.equal(snowflake.params.email, EMAIL);
    assert.equal(snowflake.params.ecid, ECID);
    assert.deepEqual(recent.params.attributes, snowflake.params.attributes);
    assert.equal(result.results[0].recent_profiles_sync.ok, true);
    assert.equal((result.results[0].snowflake || result.results[0].snowflakeInsert).ok, true);
  });

  test(`${name}: rejected base makes no follow-up writes`, async () => {
    const result = await invoke(worker, { ok: false, error: 'Rejected', partialSuccess: false });
    assert.equal(result.status, 'failed');
    assert.deepEqual(calls.map(call => call.stage), ['generate']);
  });

  test(`${name}: recent-list failure does not suppress requested Snowflake or report completion`, async () => {
    const result = await invoke(worker, { ok: true, ecid: ECID }, { recentOk: false });
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.progress, { completed: 1, total: 1, failed: 1, succeeded: 0 });
    assert.deepEqual(calls.map(call => call.stage), ['generate', 'recent', 'snowflake']);
    assert.equal(result.results[0].recent_profiles_sync.ok, false);
  });

  test(`${name}: independent Snowflake failure is surfaced without retrying accepted generation`, async () => {
    const result = await invoke(worker, { ok: true, ecid: ECID }, { snowflakeOk: false });
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.progress, { completed: 1, total: 1, failed: 1, succeeded: 0 });
    assert.equal((result.results[0].snowflake || result.results[0].snowflakeInsert).ok, false);
    assert.deepEqual(calls.map(call => call.stage), ['generate', 'recent', 'snowflake']);
  });

  test(`${name}: missing ECID fails the requested Snowflake stage explicitly`, async () => {
    const result = await invoke(worker, { ok: true });
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.progress, { completed: 1, total: 1, failed: 1, succeeded: 0 });
    const row = result.results[0];
    assert.equal(row.partial_success, true);
    assert.equal(row.retry_safe, false);
    assert.equal((row.snowflake || row.snowflakeInsert).ok, false);
    assert.match((row.snowflake || row.snowflakeInsert).error, /requires the ECID/);
    assert.deepEqual(calls.map(call => call.stage), ['generate', 'recent']);
  });

  test(`${name}: overlay and Snowflake failures count one failed identity`, async () => {
    const result = await invoke(worker, {
      ok: false, partialSuccess: true, ecid: ECID,
      errorCode: 'GENERIC_PROFILE_PERSISTENCE_TIMEOUT', error: 'Overlay pending',
      stepResults: [{ step: 1, ok: true }],
    }, { snowflakeOk: false });
    assert.deepEqual(result.progress, { completed: 1, total: 1, failed: 1, succeeded: 0 });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].partial_success, true);
    assert.equal(result.results[0].retry_safe, false);
    assert.deepEqual(calls.map(call => call.stage), ['generate', 'recent', 'snowflake']);
  });
}
