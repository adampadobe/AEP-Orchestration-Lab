'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAjoOcDatasetService } = require('../ajoOcDatasetService');

const datasetId = '69c38a17866d0ec0db681793';
const catalogDataset = {
  name: 'rel_recipient',
  ingestionType: 'cdc',
  dataIngested: false,
  classification: { dataBehavior: 'record' },
  schemaRef: { id: 'https://ns.adobe.com/example/schemas/123' },
  extensions: {},
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

test('Adobe requests use fresh request IDs and the documented single-dataset enablement body', async () => {
  const calls = [];
  let requestNumber = 0;
  const service = createAjoOcDatasetService({
    requestId: () => `request-${++requestNumber}`,
    fetchImpl: async (url, init) => {
      calls.push({ url: new URL(url), init });
      if (new URL(url).pathname.endsWith('/extensions/validation')) {
        return jsonResponse({ datasetId, datasetName: 'rel_recipient', extensionSupported: true });
      }
      if (new URL(url).pathname.endsWith('/enablement')) {
        return jsonResponse([{ datasetId, datasetName: 'rel_recipient', jobId: 'job-1' }], 201);
      }
      if (new URL(url).pathname.endsWith('/jobs/job-1')) return jsonResponse({ jobId: 'job-1', jobStatus: 'IN_PROGRESS' });
      return jsonResponse({ [datasetId]: catalogDataset });
    },
  });
  const auth = { token: 'server-token', clientId: 'client', orgId: 'org@AdobeOrg', sandbox: 'apalmer' };

  await service.getDatasetStatus(auth, datasetId);
  const validation = await service.validateAndSummarize(auth, datasetId);
  const enabled = await service.enableDataset(auth, datasetId);
  const job = await service.getEnablementJob(auth, 'job-1');

  assert.equal(validation.extension_supported, true);
  assert.equal(enabled[0].jobId, 'job-1');
  assert.equal(job.jobStatus, 'IN_PROGRESS');
  assert.equal(new Set(calls.map((call) => call.init.headers['x-request-id'])).size, calls.length);
  for (const { init } of calls) {
    assert.equal(init.headers.Authorization, 'Bearer server-token');
    assert.equal(init.headers['x-api-key'], 'client');
    assert.equal(init.headers['x-gw-ims-org-id'], 'org@AdobeOrg');
    assert.equal(init.headers['x-sandbox-name'], 'apalmer');
  }
  const submit = calls.find((call) => call.init.method === 'POST');
  assert.equal(submit.url.pathname, '/ajo/relational/modeler/datasets/extensions/enablement');
  assert.deepEqual(JSON.parse(submit.init.body), { datasetIds: [datasetId] });
  assert.equal(submit.init.headers['Content-Type'], 'application/json');
});

test('Catalog prefix listing is bounded and server-filtered to rel_ datasets', async () => {
  let calledUrl;
  const service = createAjoOcDatasetService({
    fetchImpl: async (url) => {
      calledUrl = new URL(url);
      return jsonResponse({
        [datasetId]: catalogDataset,
        other: { name: 'unrelated_dataset' },
      });
    },
  });
  const rows = await service.listRelDatasets({ token: 't', clientId: 'c', orgId: 'o', sandbox: 'apalmer' });
  assert.equal(calledUrl.searchParams.get('property'), 'name~^rel_');
  assert.equal(calledUrl.searchParams.get('limit'), '100');
  assert.deepEqual(rows.map((row) => row.id), [datasetId]);
});

test('Adobe authorization failures retain their status and response body', async () => {
  const service = createAjoOcDatasetService({
    fetchImpl: async () => jsonResponse({ title: 'Forbidden', errorMessage: 'Missing permission' }, 403),
  });
  await assert.rejects(
    service.validateDataset({ token: 't', clientId: 'c', orgId: 'o', sandbox: 'apalmer' }, datasetId),
    (error) => error.status === 403
      && error.message === 'Missing permission'
      && error.platformResponse.errorMessage === 'Missing permission',
  );
});
