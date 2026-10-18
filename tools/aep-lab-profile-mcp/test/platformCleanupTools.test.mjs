import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod';
import { registerPlatformCleanupTools } from '../src/tools/platformCleanupTools.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';
import { platformAssetDelete } from '../src/labApiClient.mjs';
import { requestContext } from '../src/requestContext.mjs';

test('registers narrow inventory/audit/delete contracts and destructive annotations', () => {
  const tools = new Map();
  registerPlatformCleanupTools({ registerTool(name, definition) { tools.set(name, definition); } });
  assert.deepEqual([...tools.keys()], ['lab_platform_asset_list', 'lab_platform_asset_audit', 'lab_platform_asset_delete']);
  const definition = tools.get('lab_platform_asset_delete');
  assert.match(definition.description, /irreversible/i);
  assert.equal(annotationsForTool('lab_platform_asset_delete').destructiveHint, true);
  assert.equal(annotationsForTool('lab_platform_asset_delete').idempotentHint, false);
  assert.equal(annotationsForTool('lab_platform_asset_list').readOnlyHint, true);
  const schema = z.object(definition.inputSchema);
  const input = {
    sandbox: 'apalmer', resource_type: 'dataset', resource_id: '69c38a17866d0ec0db681793',
    audit_id: '11111111-2222-4333-8444-555555555555', expected_name: 'Exact name', confirmed: true, usage_cleared: true,
  };
  assert.equal(schema.safeParse(input).success, true);
  assert.equal(schema.safeParse({ ...input, confirmed: false }).success, false);
  assert.equal(schema.safeParse({ ...input, usage_cleared: false }).success, false);
  assert.equal(schema.safeParse({ ...input, resource_type: 'flow' }).success, false);
});

test('delete client sends scoped credentials and never retries mutations', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(new URL(url).pathname, '/platformCleanupProxy');
    assert.equal(init.method, 'DELETE');
    assert.equal(init.headers['X-AEP-Lab-Mcp-Key'] || init.headers['x-aep-lab-mcp-key'], 'test-key');
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await requestContext.run({ mcpApiKey: 'test-key' }, async () => {
      const result = await platformAssetDelete({ sandbox: 'apalmer', resource_type: 'dataset', resource_id: 'id' });
      assert.equal(result.ok, false);
      assert.equal(result.status, 503);
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
