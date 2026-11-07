'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { confirmationPhrase, registerAjoOcDatasetRoutes } = require('../ajoOcDatasetRoutes');

const datasetIds = ['69c38a17866d0ec0db681793', '69c38a17866d0ec0db681794'];
const preflightId = '11111111-2222-4333-8444-555555555555';
const batchJobId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function responseRecorder() {
  return {
    statusCode: 0, body: null,
    set() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

function summary(datasetId, overrides = {}) {
  return {
    dataset_id: datasetId,
    dataset_name: `rel_recipient_${datasetId.slice(-1)}`,
    schema_id: 'https://ns.adobe.com/example/schemas/123',
    ingestion_type: 'cdc',
    data_behavior: 'record',
    data_ingested: true,
    profile_enabled: false,
    system_dataset: false,
    extension: null,
    extension_supported: true,
    validation: { extensionSupported: true },
    fingerprint: `fingerprint-${datasetId}`,
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const calls = [];
  let preflight;
  let batch;
  const audits = [];
  const service = {
    listRelDatasets: async () => datasetIds.map((id) => ({ id, name: `rel_recipient_${id.slice(-1)}` })),
    getDatasetStatus: async (_auth, id) => summary(id),
    validateAndSummarize: async (_auth, id) => {
      calls.push(['validate', id]);
      return summary(id);
    },
    enableDataset: async (_auth, id) => {
      calls.push(['enable', id]);
      return [{ datasetId: id, datasetName: `rel_recipient_${id.slice(-1)}`, jobId: `job-${id.slice(-1)}`, jobStatus: 'PENDING' }];
    },
    getEnablementJob: async (_auth, id) => ({ jobId: id, jobStatus: 'IN_PROGRESS' }),
    ...overrides.service,
  };
  const store = {
    savePreflight: async (plan) => {
      preflight = plan;
      return { preflight_id: preflightId, expires_at: '2027-01-01T00:15:00.000Z' };
    },
    consumePreflight: async (id, expected) => {
      assert.equal(id, preflightId);
      assert.deepEqual(expected.datasetIds, preflight.datasetIds);
      return preflight;
    },
    createBatch: async (record) => {
      batch = { ...record };
      return batchJobId;
    },
    updateBatch: async (_id, patch) => { batch = { ...patch }; },
    getBatch: async () => batch,
    findJobs: async () => [],
    writeAudit: async (entry) => { audits.push(entry); },
    ...overrides.store,
  };
  const registered = registerAjoOcDatasetRoutes({
    onRequest: (_opts, handler) => ({ __handler: handler }),
    profileFnOpts: {}, setCors() {},
    getAdobeAccessToken: async () => 'server-token',
    ADOBE_CLIENT_ID: { value: () => 'client' },
    ADOBE_IMS_ORG: { value: () => 'org@AdobeOrg' },
    mcpApiKeyStore: {
      validateUserApiKey: async () => ({ ok: true, principalUid: 'uid', sandbox: 'apalmer' }),
    },
    ajoOcDatasetService: service,
    ajoOcDatasetStore: store,
  });
  async function request(method, input, headers = { 'x-aep-lab-mcp-key': 'key' }) {
    const res = responseRecorder();
    await registered.ajoOcDatasetProxy.__handler({
      method,
      headers,
      query: method === 'GET' ? input : {},
      body: method === 'POST' ? input : {},
    }, res);
    return res;
  }
  return { request, calls, audits, get preflight() { return preflight; }, get batch() { return batch; } };
}

test('preview reports exact scope and data warning without submitting enablement', async () => {
  const context = fixture();
  const res = await context.request('POST', { action: 'preview', sandbox: 'apalmer', dataset_ids: datasetIds });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.selected_count, 2);
  assert.deepEqual(res.body.planned_dataset_ids, datasetIds);
  assert.equal(res.body.confirmation.preflight_id, preflightId);
  assert.equal(res.body.confirmation.confirmation_phrase, confirmationPhrase('apalmer', 2));
  assert.equal(res.body.warnings.length, 2);
  assert.equal(context.calls.some(([kind]) => kind === 'enable'), false);
});

test('apply requires exact phrase and sends one dataset per request serially', async () => {
  let active = 0;
  let maxActive = 0;
  const context = fixture({
    service: {
      enableDataset: async (_auth, id) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return [{ datasetId: id, jobId: `job-${id.slice(-1)}`, jobStatus: 'PENDING' }];
      },
    },
  });
  await context.request('POST', { action: 'preview', sandbox: 'apalmer', dataset_ids: datasetIds });
  const rejected = await context.request('POST', {
    action: 'apply', sandbox: 'apalmer', dataset_ids: datasetIds,
    preflight_id: preflightId, confirmation_phrase: 'wrong', confirmed: true,
  });
  assert.equal(rejected.statusCode, 400);
  assert.equal(context.calls.some(([kind]) => kind === 'enable'), false);
  assert.equal(context.audits.at(-1).result, 'rejected');

  const applied = await context.request('POST', {
    action: 'apply', sandbox: 'apalmer', dataset_ids: datasetIds,
    preflight_id: preflightId, confirmation_phrase: confirmationPhrase('apalmer', 2), confirmed: true,
  });
  assert.equal(applied.statusCode, 200);
  assert.equal(applied.body.ok, true);
  assert.equal(applied.body.batch_job_id, batchJobId);
  assert.deepEqual(applied.body.items.map((item) => item.job_id), ['job-3', 'job-4']);
  assert.equal(maxActive, 1);
});

test('apply skips changed datasets and stops at first ambiguous submission without retry', async () => {
  let submissions = 0;
  let validationCalls = 0;
  const context = fixture({
    service: {
      validateAndSummarize: async (_auth, id) => {
        validationCalls++;
        return summary(id, {
          fingerprint: validationCalls === 3 && id === datasetIds[0] ? 'changed' : `fingerprint-${id}`,
        });
      },
      enableDataset: async () => {
        submissions++;
        throw Object.assign(new Error('Adobe timed out'), { status: 504, platformResponse: { title: 'Timeout' } });
      },
    },
  });
  await context.request('POST', { action: 'preview', sandbox: 'apalmer', dataset_ids: datasetIds });
  const applied = await context.request('POST', {
    action: 'apply', sandbox: 'apalmer', dataset_ids: datasetIds,
    preflight_id: preflightId, confirmation_phrase: confirmationPhrase('apalmer', 2), confirmed: true,
  });
  assert.equal(applied.body.ok, false);
  assert.equal(applied.body.status, 'stopped_uncertain');
  assert.deepEqual(applied.body.items.map((item) => item.state), ['skipped_changed', 'submission_uncertain']);
  assert.equal(submissions, 1);
  assert.equal(context.audits.at(-1).result, 'partial_or_stopped');
});

test('batch job status returns skipped entries without querying an absent Adobe job ID', async () => {
  let validationCalls = 0;
  let jobLookups = 0;
  const context = fixture({
    service: {
      validateAndSummarize: async (_auth, id) => {
        validationCalls++;
        return summary(id, { fingerprint: validationCalls === 1 ? 'preview' : 'changed' });
      },
      getEnablementJob: async () => { jobLookups++; throw new Error('must not query missing job IDs'); },
    },
  });
  await context.request('POST', { action: 'preview', sandbox: 'apalmer', dataset_ids: [datasetIds[0]] });
  await context.request('POST', {
    action: 'apply', sandbox: 'apalmer', dataset_ids: [datasetIds[0]],
    preflight_id: preflightId, confirmation_phrase: confirmationPhrase('apalmer', 1), confirmed: true,
  });

  const status = await context.request('GET', { action: 'job_status', sandbox: 'apalmer', batch_job_id: batchJobId });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.results[0].state, 'skipped_changed');
  assert.equal(status.body.results[0].job, null);
  assert.equal(jobLookups, 0);
});

test('malformed job-status identifiers are rejected and audited', async () => {
  const context = fixture();
  const status = await context.request('GET', { action: 'job_status', sandbox: 'apalmer', batch_job_id: 'not-a-uuid' });
  assert.equal(status.statusCode, 400);
  assert.equal(context.audits.at(-1).result, 'rejected');
  assert.match(context.audits.at(-1).message, /must be a UUID/i);
});

test('Adobe 401/403 validation failures retain the status and stop before ticket creation', async () => {
  const context = fixture({
    service: {
      validateAndSummarize: async () => {
        throw Object.assign(new Error('Forbidden'), { status: 403, platformResponse: { title: 'Forbidden' } });
      },
    },
  });
  const res = await context.request('GET', { action: 'validate', sandbox: 'apalmer', dataset_ids: [datasetIds[0]] });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.platformResponse.title, 'Forbidden');
  assert.equal(context.preflight, undefined);
});
