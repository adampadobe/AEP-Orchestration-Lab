import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';

const records = new Map();
const scheduled = [];
let failWrite = false;
let prefsReady = true;
let writes = 0;
function assertDefined(value) {
  assert.notEqual(value, undefined, 'Firestore must never receive undefined');
  if (value && typeof value === 'object') Object.values(value).forEach(assertDefined);
}
const db = {
  collection() {
    return { async add(value) { assertDefined(value); }, doc(id) {
      return {
        async set(value, options) {
          writes++;
          assertDefined(value);
          if (failWrite) throw new Error('Fixture persistence unavailable');
          records.set(id, structuredClone(options?.merge ? { ...records.get(id), ...value } : value));
        },
        async get() { return { exists: records.has(id), data: () => records.get(id) }; },
      };
    } };
  },
};
mock.module('../src/firestoreAdmin.mjs', { namedExports: { getFirestoreDb: async () => db } });
mock.module('../src/batchProcessor.mjs', { namedExports: {
  async processBatchJob(id) { scheduled.push(id); },
} });
mock.module('../src/tools/generationPrefs.mjs', { namedExports: {
  async checkGenerationPrefsConfigured() { return prefsReady ? { ok: true } : { ok: false, error: 'Confirm email preferences' }; },
} });

const { createBatchJob, updateBatchJob, getBatchJob } = await import('../src/batchJobStore.mjs');
const { checkBatchJobRate } = await import('../src/rateLimiter.mjs');
const { requestContext } = await import('../src/requestContext.mjs');
const { registerGenerateProfilesBatchTool } = await import('../src/tools/generateProfilesBatch.mjs');
let callback;
registerGenerateProfilesBatchTool({ registerTool(_name, _definition, handler) { callback = handler; } });
async function invoke(key, params = {}) {
  const result = await requestContext.run({
    keyId: key, principalAccess: { allowedSandboxes: ['apalmer'], allowedSet: new Set(['apalmer']) },
  }, () => callback({ target: 'aep', sandbox: 'apalmer', industry: 'retail', count: 1, ...params }));
  await nextTurn();
  return { ...result, body: JSON.parse(result.content[0].text) };
}

test('job create/update omit undefined recursively while retaining false, zero, null and array positions', async () => {
  const params = { base_email: undefined, attributes: { absent: undefined, denied: false, count: 0, empty: '', clear: null },
    items: [{ absent: undefined, id: 'one' }, undefined, null] };
  const job = await createBatchJob({ count: 1, params });
  assert.equal(Object.hasOwn(job.params, 'base_email'), false);
  assert.deepEqual(job.params.attributes, { denied: false, count: 0, empty: '', clear: null });
  assert.deepEqual(job.params.items, [{ id: 'one' }, null, null]);
  assert.equal(Object.hasOwn(params, 'base_email'), true, 'Do not mutate caller parameters');
  await updateBatchJob(job.jobId, { results: [{ email: 'fixture@example.com', ecid: undefined, ok: true }], errors: undefined });
  const updated = await getBatchJob(job.jobId);
  assert.deepEqual(updated.results, [{ email: 'fixture@example.com', ok: true }]);
  assert.deepEqual(updated.errors, [], 'Omitted patch values must not erase stored fields');
});

test('required-only AEP batch and stored-prefs dual-load accept omitted optional parameters', async () => {
  const minimal = await invoke('minimal');
  assert.equal(minimal.body.ok, true);
  const dual = await invoke('dual', { count: 100, randomize: true, segment_hint: 'loyalty_vip',
    loyalty_member: true, last_order_details: true, place_mode: 'featured',
    dual_load_snowflake: true, use_stored_prefs: true });
  assert.equal(dual.body.ok, true);
  const job = await getBatchJob(dual.body.job_id);
  assert.equal(job.params.count, 100);
  assert.equal(job.params.use_stored_prefs, true);
  assert.equal(job.params.dual_load_snowflake, true);
  assert.equal(Object.hasOwn(job.params, 'base_email'), false);
  assert(scheduled.includes(job.jobId));
});

test('validation failures and missing preferences consume no batch slots', async () => {
  const before = writes;
  for (let i = 0; i < 4; i++) {
    assert.equal((await invoke('validation', { dual_load_snowflake: true, use_stored_prefs: false })).isError, true);
    prefsReady = false;
    try { assert.equal((await invoke('validation')).isError, true); } finally { prefsReady = true; }
  }
  assert.equal(writes, before);
  for (let i = 0; i < 3; i++) assert.equal((await invoke('validation')).body.ok, true);
  assert.equal((await invoke('validation')).isError, true, 'Only accepted jobs exhaust the quota');
});

test('persistence failures refund reservations and never schedule generation', async () => {
  const before = scheduled.length;
  failWrite = true;
  try {
    for (let i = 0; i < 4; i++) {
      const response = await invoke('write-failure');
      assert.equal(response.isError, true);
      assert.match(response.body.error, /No generation was started/);
    }
  } finally { failWrite = false; }
  assert.equal(scheduled.length, before);
  for (let i = 0; i < 3; i++) assert.equal((await invoke('write-failure')).body.ok, true);
  assert.equal((await invoke('write-failure')).isError, true);
});

test('batch reservations enforce concurrent admission and release is idempotent', () => {
  const reservations = Array.from({ length: 3 }, () => checkBatchJobRate('concurrent'));
  assert(reservations.every(result => result.ok));
  assert.equal(checkBatchJobRate('concurrent').ok, false);
  reservations[1].release();
  reservations[1].release();
  assert.equal(checkBatchJobRate('concurrent').ok, true);
  assert.equal(checkBatchJobRate('concurrent').ok, false, 'A double release cannot mint another slot');
});
