import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod';
import { registerPlatformCleanupTools } from '../src/tools/platformCleanupTools.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';
import {
  platformAssetList, platformAssetAudit, platformAssetDelete, platformCleanupApply, platformFlowDisableApply, platformFlowDisablePlan,
} from '../src/labApiClient.mjs';
import { requestContext } from '../src/requestContext.mjs';
import { fromLabApi } from '../src/tools/helpers.mjs';

test('registers narrow inventory/audit/delete contracts and destructive annotations', () => {
  const tools = new Map();
  registerPlatformCleanupTools({ registerTool(name, definition) { tools.set(name, definition); } });
  assert.deepEqual([...tools.keys()], [
    'lab_platform_asset_list', 'lab_platform_asset_audit', 'lab_platform_asset_delete',
    'lab_platform_cleanup_inventory', 'lab_platform_cleanup_plan',
    'lab_platform_cleanup_apply', 'lab_platform_cleanup_verify',
    'lab_platform_flow_disable_plan', 'lab_platform_flow_disable_apply',
  ]);
  const definition = tools.get('lab_platform_asset_delete');
  assert.match(definition.description, /irreversible/i);
  assert.equal(annotationsForTool('lab_platform_asset_delete').destructiveHint, true);
  assert.equal(annotationsForTool('lab_platform_asset_delete').idempotentHint, false);
  assert.equal(annotationsForTool('lab_platform_asset_list').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_platform_cleanup_inventory').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_platform_cleanup_verify').readOnlyHint, true);
  assert.equal(annotationsForTool('lab_platform_cleanup_apply').destructiveHint, true);
  assert.equal(annotationsForTool('lab_platform_cleanup_apply').idempotentHint, false);
  assert.equal(annotationsForTool('lab_platform_flow_disable_apply').destructiveHint, true);
  assert.equal(annotationsForTool('lab_platform_flow_disable_apply').idempotentHint, false);
  const disableSchema = z.object(tools.get('lab_platform_flow_disable_plan').inputSchema);
  const flowId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal(disableSchema.safeParse({ sandbox: 'apalmer', flow_ids: [flowId] }).success, true);
  for (const ids of [[], ['*'], [flowId, flowId], Array(101).fill(flowId)]) {
    assert.equal(disableSchema.safeParse({ sandbox: 'apalmer', flow_ids: ids }).success, false);
  }
  assert.match(tools.get('lab_platform_cleanup_apply').description, /GET 404 readback/i);
  const planSchema = z.object(tools.get('lab_platform_cleanup_plan').inputSchema);
  const exactPlan = {
    sandbox: 'apalmer',
    targets: [{ resource_type: 'flow', resource_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
  };
  assert.equal(planSchema.safeParse(exactPlan).success, true);
  assert.equal(planSchema.safeParse({ ...exactPlan, targets: [{ ...exactPlan.targets[0], resource_id: '*' }] }).success, false);
  assert.equal(planSchema.safeParse({ ...exactPlan, targets: Array(101).fill(exactPlan.targets[0]) }).success, false);
  const applySchema = z.object(tools.get('lab_platform_cleanup_apply').inputSchema);
  const applyInput = {
    sandbox: 'apalmer', plan_id: '11111111-2222-4333-8444-555555555555',
    manifest_digest: 'a'.repeat(64), expected_count: 1, confirmed: true, usage_cleared: true, non_atomic_delete_acknowledged: true,
  };
  assert.equal(applySchema.safeParse(applyInput).success, true);
  for (const flag of ['confirmed', 'usage_cleared', 'non_atomic_delete_acknowledged']) {
    assert.equal(applySchema.safeParse({ ...applyInput, [flag]: undefined }).success, false);
    assert.equal(applySchema.safeParse({ ...applyInput, [flag]: false }).success, false);
  }
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

test('batch apply uses one scoped POST attempt and cannot opt into retries', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(new URL(url).pathname, '/platformCleanupProxy');
    assert.equal(init.method, 'POST');
    assert.equal(JSON.parse(init.body).operation, 'apply');
    assert.equal(JSON.parse(init.body).non_atomic_delete_acknowledged, true);
    return new Response(JSON.stringify({ error: 'blocked' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await requestContext.run({ mcpApiKey: 'test-key' }, async () => {
      const result = await platformCleanupApply({
        sandbox: 'apalmer', plan_id: '11111111-2222-4333-8444-555555555555',
        manifest_digest: 'a'.repeat(64), expected_count: 1, confirmed: true, usage_cleared: true, non_atomic_delete_acknowledged: true,
      });

      assert.equal(result.ok, false);
      assert.equal(result.status, 409);
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test('flow disable clients preserve exact scope and never retry actions', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: false, status: 'draining' }), {
      status: 202, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await requestContext.run({ mcpApiKey: 'test-key' }, async () => {
      const flowId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      await platformFlowDisablePlan({ sandbox: 'apalmer', flow_ids: [flowId] });
      assert.deepEqual(requests[0].targets, [{ resource_type: 'flow', resource_id: flowId }]);
      const input = {
        sandbox: 'apalmer', plan_id: '11111111-2222-4333-8444-555555555555',
        manifest_digest: 'a'.repeat(64), expected_count: 1, confirmed: true, usage_cleared: true, ingestion_pause_acknowledged: true,
      };
      const tools = new Map();
      registerPlatformCleanupTools({ registerTool(name, definition) { tools.set(name, definition); } });
      const schema = z.object(tools.get('lab_platform_flow_disable_apply').inputSchema);
      for (const flag of ['confirmed', 'usage_cleared', 'ingestion_pause_acknowledged']) {
        assert.equal(schema.safeParse({ ...input, [flag]: false }).success, false);
        assert.equal(schema.safeParse({ ...input, [flag]: undefined }).success, false);
      }
      const result = await platformFlowDisableApply(input);
      assert.equal(result.ok, false);
      assert.equal(result.status, 202);
      assert.equal(result.data.status, 'draining');
      assert.equal(fromLabApi(result).isError, true);
      assert.deepEqual(requests[1], { ...input, operation: 'flow_disable_apply' });
    });
    assert.equal(requests.length, 2);
    let failedCalls = 0;
    globalThis.fetch = async () => {
      failedCalls++;
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    };
    await requestContext.run({ mcpApiKey: 'test-key' }, async () => {
      assert.equal((await platformFlowDisableApply({ sandbox: 'apalmer', plan_id: 'test-id' })).ok, false);
    });
    assert.equal(failedCalls, 1);
  } finally { globalThis.fetch = original; }
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

test('cleanup inventory and audit never retry pagination failures or transient errors', async () => {
  const original = globalThis.fetch;
  try {
    for (const invoke of [platformAssetList, platformAssetAudit]) {
      for (const [status, message] of [
        [502, 'Incomplete or repeated Catalog page; cleanup audit stopped.'],
        [502, 'Unsafe or repeated pagination link; cleanup audit stopped.'],
        [503, 'unavailable'],
        [429, 'rate limited'],
      ]) {
        let calls = 0;
        globalThis.fetch = async () => {
          calls++;
          return new Response(JSON.stringify({ error: message }), {
            status, headers: { 'Content-Type': 'application/json' },
          });
        };
        const result = await invoke({ sandbox: 'apalmer', resource_type: 'dataset', resource_id: 'id' });
        assert.equal(result.ok, false);
        assert.equal(result.error, message);
        assert.equal(calls, 1);
      }
      let calls = 0;
      globalThis.fetch = async () => { calls++; throw new Error('network unavailable'); };
      assert.equal((await invoke({ sandbox: 'apalmer', resource_type: 'dataset' })).ok, false);
      assert.equal(calls, 1);
    }
  } finally {
    globalThis.fetch = original;
  }
});
