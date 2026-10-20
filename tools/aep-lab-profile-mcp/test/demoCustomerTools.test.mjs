import test from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod';
import { registerDemoAssetTools } from '../src/tools/demoAssets.mjs';
import { demoCustomerRequest } from '../src/labApiClient.mjs';
import { requestContext } from '../src/requestContext.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';

process.env.AEP_LAB_MCP_FIRESTORE = 'off';

function tools() {
  const registered = new Map();
  registerDemoAssetTools({ registerTool(name, definition, callback) { registered.set(name, { ...definition, callback }); } });
  return registered;
}

test('customer contracts expose scoped package save, attachment staging, unified restore and recovery', () => {
  const registered = tools();
  for (const name of ['lab_demo_customer_save', 'lab_demo_customer_upload', 'lab_demo_customer_operation']) {
    assert.ok(registered.has(name));
    assert.equal(annotationsForTool(name).readOnlyHint, false);
  }
  assert.equal(annotationsForTool('lab_demo_customer_switch').destructiveHint, true);
  assert.equal(annotationsForTool('lab_demo_customer_operation').destructiveHint, true);
  assert.equal(annotationsForTool('lab_demo_customer_upload').destructiveHint, false);
  assert.equal(annotationsForTool('lab_demo_assets_preview_from_scrape').readOnlyHint, false);
  const schema = z.object(registered.get('lab_demo_customer_switch').inputSchema);
  assert.equal(schema.safeParse({ sandbox: 'demo', revision_id: 'saved-customer', backup_customer_name: 'Outgoing' }).success, true);
  assert.equal(schema.safeParse({ sandbox: 'demo', changes: [{ path: 'CoreDemoData.slogan', value: null }] }).success, true);
});

test('customer client forwards principal credentials and never retries a failed mutation', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['X-AEP-Lab-Mcp-Key'] || init.headers['x-aep-lab-mcp-key'], 'fixture-key');
    assert.deepEqual(JSON.parse(init.body), { sandbox: 'demo', action: 'customer-apply', preflight_id: 'p', confirmed: true, idempotency_key: 'fixture-operation' });
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await requestContext.run({ mcpApiKey: 'fixture-key' }, async () => {
      const result = await demoCustomerRequest({ sandbox: 'demo', action: 'customer-apply', preflight_id: 'p', confirmed: true, idempotency_key: 'fixture-operation' });
      assert.equal(result.ok, false);
    });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('save/switch/status handlers route unified actions and never turn rollback into MCP success', async () => {
  const original = globalThis.fetch;
  const actions = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    actions.push(body.action);
    return new Response(JSON.stringify(body.action === 'customer-apply'
      ? { ok: false, status: 'rolled_back', operationId: 'operation', verified: false }
      : { ok: true, preflightId: 'preview' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await requestContext.run({ mcpApiKey: 'fixture-key', principalAccess: { allowedSandboxes: ['demo'], allowedSet: new Set(['demo']) } }, async () => {
      const registered = tools();
      await registered.get('lab_demo_customer_save').callback({ sandbox: 'demo', customer_name: 'A' });
      await registered.get('lab_demo_customer_switch').callback({ sandbox: 'demo', revision_id: 'revision' });
      const result = await registered.get('lab_demo_customer_switch').callback({
        sandbox: 'demo', preflight_id: 'preview', confirmed: true, idempotency_key: 'fixture-operation',
      });
      assert.equal(result.isError, true);
      await registered.get('lab_demo_customer_operation').callback({ sandbox: 'demo', operation_id: 'operation' });
      await registered.get('lab_demo_customer_operation').callback({ sandbox: 'demo', operation_id: 'operation', recover: true, confirmed: true });
    });
    assert.deepEqual(actions, ['customer-save-preview', 'customer-switch-preview', 'customer-apply', 'customer-status', 'customer-recover']);
  } finally { globalThis.fetch = original; }
});
