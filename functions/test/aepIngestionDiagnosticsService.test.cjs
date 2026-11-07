'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAepIngestionDiagnosticsService, summarizeRun, expandTags } = require('../aepIngestionDiagnosticsService');

const batchId = '01M6V7B06V42VSZNVEETR7K437';
const flowId = '11111111-2222-4333-8444-555555555555';
const runId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const auth = { sandbox: 'sandbox-a', token: 'fixture-token', clientId: 'fixture-client', orgId: 'fixture-org' };
const makeRun = (overrides = {}) => ({
  id: runId, flowId, sandboxName: auth.sandbox, createdAt: 1000,
  metrics: {
    durationSummary: { startedAtUTC: 1000 },
    recordSummary: { inputRecordCount: 22353 },
    statusSummary: { status: 'inProgress' },
  },
  activities: [{ statusSummary: { status: 'success' }, recordSummary: { outputRecordCount: 22353 } }],
  ...overrides,
});

function fixture({ batch = {}, handler } = {}) {
  const calls = [];
  const raw = {
    status: 'staging', metrics: { inputFileCount: 3 },
    tags: {
      flowId: [flowId], flowRunId: [runId], acp_enableErrorDiagnostics: ['true'],
      acp_stalled: ['2000'],
      acp_stallDetail: ['{"exception":"StallPromotionException","message":"Compaction ran into null pkey."}'],
      acp_siphon_attempts: ['{"i":2,"reason":{}}', '{"i":3,"reason":{}}'],
      'siphon/valve/ingest/status': ['{"status":"finished"}'],
    },
    ...batch,
  };
  const service = createAepIngestionDiagnosticsService({
    now: () => 5000,
    fetchImpl: async (input, init) => {
      const url = new URL(input);
      calls.push(url);
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers['x-sandbox-name'], auth.sandbox);
      assert.equal(init.headers.Authorization, `Bearer ${auth.token}`);
      if (handler) {
        const handled = await handler(url, calls);
        if (handled) return handled;
      }
      if (url.pathname.endsWith(`/catalog/batches/${batchId}`)) return Response.json({ [batchId]: raw });
      if (url.pathname.endsWith('/catalog/batches')) return Response.json({ [batchId]: raw });
      if (url.pathname.endsWith(`/runs/${runId}`)) return Response.json({ items: [makeRun()] });
      if (url.pathname.endsWith(`/flows/${flowId}`)) return Response.json({
        items: [{ id: flowId, sandboxName: auth.sandbox, targetConnectionIds: [flowId] }],
      });
      if (url.pathname.endsWith(`/targetConnections/${flowId}`)) return Response.json({
        items: [{ id: flowId, sandboxName: auth.sandbox, params: { dataSetId: 'aaaaaaaaaaaaaaaaaaaaaaaa' } }],
      });
      return Response.json({
        type: 'DTAC-4000', status: 400, title: 'Bad Request',
        detail: 'Batch is staging; expected success|active|failed|failure',
      }, { status: 400 });
    },
  });
  return { service, calls, raw };
}

test('staging diagnostics retains stall details, every attempt and exact unavailable export errors', async () => {
  const { service, raw } = fixture();
  const result = await service.batchDiagnose(auth, { batch_id: batchId });
  assert.equal(result.complete, false);
  const batch = result.batches[0];
  assert.deepEqual(batch.raw, raw);
  assert.equal(batch.stalled_flags.find((entry) => entry.tag === 'acp_stallDetail').value.message, 'Compaction ran into null pkey.');
  assert.equal(batch.processing_attempts.filter((entry) => entry.tag === 'acp_siphon_attempts').length, 2);
  assert.equal(batch.issues.length, 3);
  assert.equal(batch.issues[0].platform_response.type, 'DTAC-4000');
  assert.equal(batch.failed_files.available, false);
  assert.equal(result.flow_run.read_count, 22353);
  assert.equal(result.flow_run.written_count, null);
  assert.equal(result.flow_run.failed_count, null);
  assert.equal(result.flow_run.duration_ms, 4000);
  assert.equal(result.flow_run.state, 'inProgress');
});

test('flow/run lookup is verified against batch tags and the run before collecting exports', async () => {
  const { service, calls } = fixture();
  const result = await service.batchDiagnose(auth, { flow_id: flowId, run_id: runId, sample_limit: 0 });
  assert.equal(result.batches[0].batch_id, batchId);
  assert.equal(calls.find((url) => url.pathname.endsWith('/catalog/batches')).searchParams.get('property'), `tags.flowRunId==${runId}`);
  assert.equal(calls.find((url) => url.pathname.endsWith('/catalog/batches')).searchParams.get('dataSet'), 'aaaaaaaaaaaaaaaaaaaaaaaa');
});

test('missing batch lookup and ten-result lookup do not pretend to be complete', async () => {
  for (const count of [0, 10]) {
    const { service } = fixture({ handler: (url) => url.pathname.endsWith('/catalog/batches')
      ? Response.json(Object.fromEntries(Array.from({ length: count }, (_, i) => [`${batchId.slice(0, -1)}${i}`, {}]))) : null });
    await assert.rejects(service.batchDiagnose(auth, { flow_id: flowId, run_id: runId }),
      (error) => error.status === (count ? 409 : 404));
  }
});

test('batch run mismatch is rejected before exports', async () => {
  const { service, calls } = fixture({ batch: { tags: { flowRunId: ['another-run'] } } });
  await assert.rejects(service.batchDiagnose(auth, { batch_id: batchId, flow_id: flowId, run_id: runId }),
    (error) => error.status === 403);
  assert.equal(calls.some((url) => url.pathname.includes('/export/')), false);
});

test('Adobe authentication/permission errors stop optional collection and preserve the body', async () => {
  for (const status of [401, 403]) {
    const body = { type: 'Adobe-error', nested: { message: 'permission denied' } };
    const { service, calls } = fixture({ handler: (url) => url.pathname.endsWith('/failed') ? Response.json(body, { status }) : null });
    await assert.rejects(service.batchDiagnose(auth, { batch_id: batchId }), (error) => {
      assert.equal(error.status, status);
      assert.deepEqual(error.platformResponse, body);
      return true;
    });
    assert.equal(calls.length, 2);
  }
});

test('invalid selectors and sample bounds cause no network requests', async () => {
  const { service, calls } = fixture();
  for (const input of [
    {}, { flow_id: flowId }, { run_id: runId }, { batch_id: '../other' },
    { batch_id: batchId, sample_limit: 51 }, { batch_id: batchId, sample_limit: '3.5' },
  ]) {
    await assert.rejects(service.batchDiagnose(auth, input), (error) => error.status === 400);
  }
  assert.equal(calls.length, 0);
});

test('malformed JSON tags retain original values with visible parse issues', async () => {
  const original = '{"reason":';
  assert.deepEqual(expandTags({ acp_siphon_attempts: [original] }, /attempt/)[0],
    { tag: 'acp_siphon_attempts', index: 0, value: original, parse_error: 'Tag is not valid JSON.' });
  const { service } = fixture({ batch: { tags: { acp_siphon_attempts: [original] } } });
  const result = await service.batchDiagnose(auth, { batch_id: batchId });
  assert.equal(result.batches[0].issues[0].section, 'acp_siphon_attempts');
});

test('file pagination works without links and never omits full pages', async () => {
  const { service, calls } = fixture({ handler: (url) => {
    if (url.pathname.endsWith('/files')) {
      const start = Number(url.searchParams.get('start'));
      return Response.json({ data: Array.from({ length: start === 0 ? 100 : 1 }, (_, i) => ({ dataSetFileId: `file-${start + i}` })) });
    }
  } });
  const result = await service.batchDiagnose(auth, { batch_id: batchId, sample_limit: 0 });
  assert.equal(result.batches[0].files.data.files.length, 101);
  assert.equal(result.batches[0].files.data.complete, true);
  assert.deepEqual(calls.filter((url) => url.pathname.endsWith('/files')).map((url) => url.searchParams.get('start')), ['0', '100']);
});

test('file page cap and malicious continuation are explicit incomplete evidence', async () => {
  for (const malicious of [false, true]) {
    const { service, calls } = fixture({ handler: (url) => {
      if (url.pathname.endsWith('/files')) return Response.json({
        data: Array.from({ length: 100 }, (_, i) => ({ dataSetFileId: `file-${i}` })),
        ...(malicious ? { _links: { next: { href: 'https://attacker.example/steal?start=100' } } } : {}),
      });
    } });
    const result = await service.batchDiagnose(auth, { batch_id: batchId, sample_limit: 0 });
    const section = result.batches[0].files;
    assert.equal(result.complete, false);
    if (malicious) assert.equal(section.available, false);
    else {
      assert.equal(section.data.complete, false);
      assert.equal(section.data.next_start, 500);
    }
    assert.equal(calls.some((url) => url.hostname !== 'platform.adobe.io'), false);
  }
});

test('samples first N NDJSON rows and cancels the stream before later chunks', async () => {
  let cancelled = false;
  const { service } = fixture({ handler: (url) => {
    if (url.pathname.includes('/export/')) {
      if (url.searchParams.get('path') === 'row_errors/part.json') return new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('{"code":"one"}\n{"code":"two"}\n{"code":"three"}\n')); },
        cancel() { cancelled = true; },
      }));
      return Response.json({ data: url.searchParams.get('path') === 'row_errors' ? [{ name: 'part.json' }] : [] });
    }
  } });
  const result = await service.batchDiagnose(auth, { batch_id: batchId, sample_limit: 2 });
  assert.deepEqual(result.batches[0].diagnostics.rows, [{ code: 'one' }, { code: 'two' }]);
  assert.equal(cancelled, true);
  assert.equal(result.complete, true);
});

test('supports pretty JSON and JSON arrays, bounding samples across files', async () => {
  for (const contents of [JSON.stringify([{ code: 1 }, { code: 2 }]), JSON.stringify({ code: 1 }, null, 2)]) {
    const { service } = fixture({ handler: (url) => {
      if (!url.pathname.includes('/export/')) return null;
      if (url.searchParams.get('path')?.startsWith('row_errors/')) return new Response(contents);
      return Response.json({ data: url.searchParams.get('path') === 'row_errors' ? [{ name: 'part.json' }, { name: 'extra.json' }] : [] });
    } });
    const result = await service.batchDiagnose(auth, { batch_id: batchId, sample_limit: 1 });
    assert.deepEqual(result.batches[0].diagnostics.rows, [{ code: 1 }]);
  }
});

test('malformed and oversized samples are explicit failures, not empty success', async () => {
  for (const contents of ['{not-json}', 'x'.repeat(256 * 1024 + 1)]) {
    const { service } = fixture({ handler: (url) => {
      if (!url.pathname.includes('/export/')) return null;
      if (url.searchParams.get('path')?.startsWith('row_errors/')) return new Response(contents);
      return Response.json({ data: url.searchParams.get('path') === 'row_errors' ? [{ name: 'part.json' }] : [] });
    } });
    const result = await service.batchDiagnose(auth, { batch_id: batchId });
    assert.equal(result.complete, false);
    assert.equal(result.batches[0].issues[0].status, 502);
    assert.deepEqual(result.batches[0].diagnostics.rows, []);
  }
});

test('sample filenames cannot traverse paths or introduce a foreign fetch', async () => {
  const { service, calls } = fixture({ handler: (url) => url.pathname.endsWith('/meta')
    ? Response.json({ data: [{ name: '../../other.json' }] }) : null });
  const result = await service.batchDiagnose(auth, { batch_id: batchId });
  assert.equal(result.batches[0].issues.at(-1).error, 'Adobe diagnostic file name is invalid.');
  assert.equal(calls.some((url) => url.searchParams.get('path')?.includes('..')), false);
});

test('flow status applies since locally and preserves continuation on empty pages', async () => {
  const { service, calls } = fixture({ handler: (url) => url.pathname.endsWith('/runs') ? Response.json({
    items: [makeRun()],
    _links: { next: { href: '/runs?continuationToken=token-2' } },
  }) : null });
  const result = await service.flowRunStatus(auth, {
    flow_id: flowId, since: '2026-01-01T00:00:00Z', limit: 2, continuation_token: 'token-1',
  });
  assert.deepEqual(result.runs, []);
  assert.equal(result.continuation_token, 'token-2');
  assert.equal(result.since_filter.scanned, 1);
  assert.equal(calls[0].searchParams.get('property'), `flowId==${flowId}`);
  assert.equal(calls[0].searchParams.get('continuationToken'), 'token-1');
});

test('flow status rejects mismatched sandbox, flow and foreign continuation URLs', async () => {
  for (const data of [
    { items: [makeRun({ sandboxName: 'sandbox-b' })] },
    { items: [makeRun({ flowId: runId })] },
    { items: [makeRun()], _links: { next: { href: 'https://attacker.example/runs?continuationToken=secret' } } },
  ]) {
    const { service } = fixture({ handler: (url) => url.pathname.endsWith('/runs') ? Response.json(data) : null });
    await assert.rejects(service.flowRunStatus(auth, { flow_id: flowId }), (error) => [403, 502].includes(error.status));
  }
});

test('run summaries preserve explicit zeros, activity errors and completed duration', () => {
  const errors = [{ code: 'CONNECTOR', message: 'Promotion failed' }];
  const run = makeRun({
    metrics: {
      durationSummary: { startedAtUTC: 1000, completedAtUTC: 2000 },
      recordSummary: { inputRecordCount: 0, outputRecordCount: 0, failedRecordCount: 0, skippedRecordCount: 0 },
      statusSummary: { status: 'failed', errors },
    },
    activities: [{ statusSummary: { extensions: { errors: [{ code: 'MAPPER', recordCount: 1 }] } } }],
  });
  const summary = summarizeRun(run, 5000);
  assert.equal(summary.written_count, 0);
  assert.equal(summary.duration_ms, 1000);
  assert.equal(summary.duration_is_elapsed, false);
  assert.equal(summary.first_errors.length, 2);
  assert.deepEqual(summary.raw, run);
});

test('timeouts never retry and retain an explicit 504 error', async () => {
  let calls = 0;
  const service = createAepIngestionDiagnosticsService({ fetchImpl: async () => {
    calls++;
    throw Object.assign(new Error('deadline exceeded'), { name: 'TimeoutError' });
  } });
  await assert.rejects(service.flowRunStatus(auth, { flow_id: flowId }), (error) => error.status === 504);
  assert.equal(calls, 1);
});

test('returned batch org and sandbox must match even when requested through a scoped header', async () => {
  for (const batch of [{ imsOrg: 'other-org' }, { sandboxName: 'sandbox-b' }]) {
    const { service, calls } = fixture({ batch });
    await assert.rejects(service.batchDiagnose(auth, { batch_id: batchId }), (error) => error.status === 403);
    assert.equal(calls.length, 1);
  }
});

test('invalid run filters make no network requests', async () => {
  const { service, calls } = fixture();
  for (const input of [
    { flow_id: '../flow' }, { flow_id: flowId, limit: 51 },
    { flow_id: flowId, since: 'yesterday' }, { flow_id: flowId, continuation_token: '' },
  ]) {
    await assert.rejects(service.flowRunStatus(auth, input), (error) => error.status === 400);
  }
  assert.equal(calls.length, 0);
});

test('oversized Adobe authentication error retains HTTP 403 rather than continuing exports', async () => {
  const { service, calls } = fixture({ handler: (url) => url.pathname.endsWith('/failed')
    ? new Response('x'.repeat(2 * 1024 * 1024 + 1), { status: 403 }) : null });
  await assert.rejects(service.batchDiagnose(auth, { batch_id: batchId }), (error) => error.status === 403);
  assert.equal(calls.length, 2);
});

test('flow continuation without a token cannot silently hide remaining runs', async () => {
  const { service } = fixture({ handler: (url) => url.pathname.endsWith('/runs') ? Response.json({
    items: [makeRun()], _links: { next: { href: '/runs' } },
  }) : null });
  await assert.rejects(service.flowRunStatus(auth, { flow_id: flowId }), (error) => error.status === 502);
});

test('direct activity Batch references avoid querying current flow targets or broad Catalog lists', async () => {
  const { service, calls } = fixture({ handler: (url) => url.pathname.endsWith(`/runs/${runId}`) ? Response.json({
    items: [makeRun({ activities: [{ targetInfo: [{ reference: { type: 'Batch', ids: [batchId] } }] }] })],
  }) : null });
  const result = await service.batchDiagnose(auth, { flow_id: flowId, run_id: runId, sample_limit: 0 });
  assert.equal(result.batches[0].batch_id, batchId);
  assert.equal(calls.some((url) => url.pathname.endsWith('/catalog/batches') || url.pathname.includes('/flows/')), false);
});

test('ambiguous flow targets cannot produce an incomplete guessed run-to-batch mapping', async () => {
  const { service, calls } = fixture({ handler: (url) => url.pathname.endsWith(`/flows/${flowId}`) ? Response.json({
    items: [{ id: flowId, sandboxName: auth.sandbox, targetConnectionIds: [flowId, runId] }],
  }) : null });
  await assert.rejects(service.batchDiagnose(auth, { flow_id: flowId, run_id: runId }), (error) => error.status === 409);
  assert.equal(calls.some((url) => url.pathname.endsWith('/catalog/batches')), false);
});
