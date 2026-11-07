import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod';
import { registerAepIngestionDiagnosticsTools } from '../src/tools/aepIngestionDiagnosticsTools.mjs';
import { aepBatchDiagnose, aepFlowRunStatus } from '../src/labApiClient.mjs';
import { requestContext } from '../src/requestContext.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createAepIngestionDiagnosticsService } = require('../../../functions/aepIngestionDiagnosticsService');
const { registerAepIngestionDiagnosticsRoutes } = require('../../../functions/aepIngestionDiagnosticsRoutes');

test('registers both read-only diagnostics tools with bounded input schemas', () => {
  const tools = new Map();
  registerAepIngestionDiagnosticsTools({ registerTool(name, definition, handler) { tools.set(name, { definition, handler }); } });
  assert.deepEqual([...tools.keys()], ['lab_aep_batch_diagnose', 'lab_aep_flow_run_status']);
  for (const name of tools.keys()) {
    assert.equal(annotationsForTool(name).readOnlyHint, true);
    assert.equal(annotationsForTool(name).destructiveHint, false);
  }
  const batch = z.object(tools.get('lab_aep_batch_diagnose').definition.inputSchema);
  assert.equal(batch.safeParse({ sandbox: 'sandbox-a', batch_id: '01M6V7B06V42VSZNVEETR7K437', sample_limit: 50 }).success, true);
  assert.equal(batch.safeParse({ sandbox: 'sandbox-a', batch_id: '../bad' }).success, false);
  assert.equal(batch.safeParse({ sandbox: 'sandbox-a', sample_limit: 51 }).success, false);
  const flow = z.object(tools.get('lab_aep_flow_run_status').definition.inputSchema);
  assert.equal(flow.safeParse({ sandbox: 'sandbox-a', flow_id: '11111111-2222-4333-8444-555555555555', limit: 0 }).success, false);
});

test('clients forward principal auth, use GET and preserve errors without retries', async () => {
  const original = globalThis.fetch;
  const calls = [];
  const body = { ok: false, platform_response: { status: 403, title: 'Adobe permission denied' } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return Response.json(body, { status: 503 });
  };
  try {
    await requestContext.run({ mcpApiKey: 'fixture-key' }, async () => {
      for (const read of [aepBatchDiagnose, aepFlowRunStatus]) {
        const result = await read({ sandbox: 'sandbox-a', limit: 2 });
        assert.equal(result.ok, false);
        assert.equal(result.status, 503);
      }
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.url.searchParams.get('action')), ['batch_diagnose', 'flow_run_status']);
    for (const call of calls) {
      assert.equal(call.url.pathname, '/aepIngestionDiagnosticsProxy');
      assert.equal(call.init.method, 'GET');
      assert.equal(call.init.headers['X-AEP-Lab-Mcp-Key'], 'fixture-key');
      assert.equal(call.url.searchParams.get('sandbox'), 'sandbox-a');
    }
  } finally { globalThis.fetch = original; }
});

test('diagnostic clients prefer independently validated IMS context over shared keys', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init);
    return Response.json({ ok: true });
  };
  const imsHeaders = { Authorization: 'Bearer fixture-ims', 'x-gw-ims-org-id': 'TEST@AdobeOrg' };
  try {
    await requestContext.run({
      imsAuthHeaders: imsHeaders,
      mcpApiKey: 'shared-key',
      principalAccess: { allowedSandboxes: ['sandbox-a'] },
    }, async () => {
      await aepBatchDiagnose({ sandbox: 'sandbox-a', batch_id: '01M6V7B06V42VSZNVEETR7K437' });
      await aepFlowRunStatus({ sandbox: 'sandbox-a', flow_id: '11111111-2222-4333-8444-555555555555' });
    });
    for (const call of calls) {
      assert.equal(call.headers.Authorization, imsHeaders.Authorization);
      assert.equal(call.headers['X-AEP-Lab-Mcp-Key'], undefined);
      assert.equal(call.headers['x-sandbox-name'], 'sandbox-a');
    }
  } finally { globalThis.fetch = original; }
});

test('end-to-end tool → principal-scoped proxy → Adobe fixture returns stall evidence and run counts', async () => {
  const original = globalThis.fetch;
  const batchId = '01M6V7B06V42VSZNVEETR7K437';
  const flowId = '11111111-2222-4333-8444-555555555555';
  const runId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const run = {
    id: runId, flowId, sandboxName: 'sandbox-a',
    metrics: { recordSummary: { inputRecordCount: 22353 }, statusSummary: { status: 'inProgress' } },
    activities: [{ statusSummary: { status: 'success' } }],
  };
  const adobeCalls = [];
  let denyExports = false;
  const service = createAepIngestionDiagnosticsService({ fetchImpl: async (url, init) => {
    adobeCalls.push(String(url));
    assert.equal(init.headers['x-sandbox-name'], 'sandbox-a');
    if (new URL(url).pathname.includes('/catalog/')) return Response.json({
      [batchId]: {
        status: 'staging',
        tags: { flowId: [flowId], flowRunId: [runId], acp_stallDetail: ['{"message":"Compaction ran into null pkey."}'] },
      },
    });
    if (new URL(url).pathname.includes('/flowservice/')) return Response.json({ items: [run] });
    return Response.json({ type: denyExports ? 'ADOBE-403' : 'DTAC-4000', detail: 'staging batch exports are unavailable' }, { status: denyExports ? 403 : 400 });
  } });
  const { aepIngestionDiagnosticsProxy: route } = registerAepIngestionDiagnosticsRoutes({
    onRequest: (_options, handler) => handler, profileFnOpts: {}, setCors() {},
    mcpApiKeyStore: { validateUserApiKey: async (key) => {
      assert.equal(key, 'fixture-key');
      return { ok: true, principalUid: 'fixture-uid', sandbox: 'sandbox-a' };
    } },
    getAdobeAccessToken: async () => 'fixture-server-token',
    ADOBE_CLIENT_ID: { value: () => 'fixture-client' },
    ADOBE_IMS_ORG: { value: () => 'TEST@AdobeOrg' },
    ingestionDiagnosticsService: service,
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    let status = 200;
    let body;
    const response = {
      set() { return this; },
      status(code) { status = code; return this; },
      json(data) { body = data; return this; },
    };
    await route({
      method: init.method,
      headers: Object.fromEntries(new Headers(init.headers)),
      query: Object.fromEntries(url.searchParams),
    }, response);
    return Response.json(body, { status });
  };
  const tools = new Map();
  registerAepIngestionDiagnosticsTools({ registerTool(name, definition, handler) { tools.set(name, { definition, handler }); } });
  try {
    await requestContext.run({
      mcpApiKey: 'fixture-key',
      principalAccess: { allowedSandboxes: ['sandbox-a'], source: 'user-key' },
    }, async () => {
      const result = await tools.get('lab_aep_batch_diagnose').handler({ sandbox: 'sandbox-a', batch_id: batchId, sample_limit: 0 });
      const output = JSON.parse(result.content[0].text);
      assert.equal(output.lab.batches[0].stalled_flags[0].value.message, 'Compaction ran into null pkey.');
      assert.equal(output.lab.complete, false);
      assert.equal(output.lab.batches[0].issues[0].platform_response.type, 'DTAC-4000');
      const status = await tools.get('lab_aep_flow_run_status').handler({ sandbox: 'sandbox-a', flow_id: flowId });
      const statusOutput = JSON.parse(status.content[0].text);
      assert.equal(statusOutput.lab.runs[0].read_count, 22353);
      assert.equal(statusOutput.lab.runs[0].written_count, null);
      const previous = adobeCalls.length;
      const rejected = await tools.get('lab_aep_flow_run_status').handler({ sandbox: 'sandbox-b', flow_id: flowId });
      assert.equal(rejected.isError, true);
      assert.equal(adobeCalls.length, previous);
      denyExports = true;
      const permission = await tools.get('lab_aep_batch_diagnose').handler({ sandbox: 'sandbox-a', batch_id: batchId });
      assert.equal(permission.isError, true);
      const denied = JSON.parse(permission.content[0].text);
      assert.equal(denied.detail.status, 403);
      assert.equal(denied.detail.response.platform_response.type, 'ADOBE-403');
    });
  } finally { globalThis.fetch = original; }
});
