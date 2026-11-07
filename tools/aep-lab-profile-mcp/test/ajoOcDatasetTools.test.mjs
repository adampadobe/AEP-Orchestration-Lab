import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod';
import { registerAjoOcDatasetTools } from '../src/tools/ajoOcDatasetTools.mjs';
import { ajoOcDatasetApply } from '../src/labApiClient.mjs';
import { requestContext } from '../src/requestContext.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';

test('registers five governed tools and a read-only focused subset', () => {
  const full = new Map();
  registerAjoOcDatasetTools({
    registerTool(name, definition, handler) { full.set(name, { definition, handler }); },
  });
  assert.deepEqual([...full.keys()], [
    'lab_ajo_oc_dataset_status',
    'lab_ajo_oc_dataset_validate',
    'lab_ajo_oc_dataset_preview',
    'lab_ajo_oc_dataset_apply',
    'lab_ajo_oc_dataset_job_status',
  ]);
  const apply = full.get('lab_ajo_oc_dataset_apply');
  assert.match(apply.definition.description, /never retries a write/i);
  assert.equal(annotationsForTool('lab_ajo_oc_dataset_apply').destructiveHint, true);
  assert.equal(annotationsForTool('lab_ajo_oc_dataset_apply').idempotentHint, false);
  const schema = z.object(apply.definition.inputSchema);
  const valid = {
    sandbox: 'apalmer',
    dataset_ids: ['69c38a17866d0ec0db681793'],
    preflight_id: '11111111-2222-4333-8444-555555555555',
    confirmation_phrase: 'ENABLE ORCHESTRATED CAMPAIGNS IN apalmer FOR 1 DATASETS',
    confirmed: true,
  };
  assert.equal(schema.safeParse(valid).success, true);
  assert.equal(schema.safeParse({ ...valid, confirmed: false }).success, false);
  assert.equal(schema.safeParse({ ...valid, dataset_ids: [] }).success, false);
  assert.equal(schema.safeParse({ ...valid, confirmation_phrase: undefined }).success, false);

  const focused = new Map();
  registerAjoOcDatasetTools({
    registerTool(name, definition) { focused.set(name, definition); },
  }, { readOnlyOnly: true });
  assert.deepEqual([...focused.keys()], [
    'lab_ajo_oc_dataset_status',
    'lab_ajo_oc_dataset_validate',
    'lab_ajo_oc_dataset_job_status',
  ]);
});

test('apply client makes one non-retried function request and preserves the confirmation payload', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(new URL(url).pathname, '/ajoOcDatasetProxy');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), {
      sandbox: 'apalmer',
      dataset_ids: ['69c38a17866d0ec0db681793'],
      preflight_id: '11111111-2222-4333-8444-555555555555',
      confirmation_phrase: 'ENABLE ORCHESTRATED CAMPAIGNS IN apalmer FOR 1 DATASETS',
      confirmed: true,
      action: 'apply',
    });
    return new Response(JSON.stringify({ ok: false, error: 'ambiguous' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await requestContext.run({ mcpApiKey: 'test-key' }, async () => {
      const result = await ajoOcDatasetApply({
        sandbox: 'apalmer',
        dataset_ids: ['69c38a17866d0ec0db681793'],
        preflight_id: '11111111-2222-4333-8444-555555555555',
        confirmation_phrase: 'ENABLE ORCHESTRATED CAMPAIGNS IN apalmer FOR 1 DATASETS',
        confirmed: true,
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 503);
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
