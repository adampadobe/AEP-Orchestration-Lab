import test from 'node:test';
import assert from 'node:assert/strict';
import { requestContext } from '../src/requestContext.mjs';
import { registerMcpFirstRunSetupTool } from '../src/tools/mcpFirstRunSetup.mjs';
import {
  inspectDemoConfig, previewDemoConfig, applyDemoConfig, previewDemoConfigRestore,
  inspectDemoAssets, previewDemoAssets, applyDemoAssets, previewDemoAssetsRestore,
  applyDemoCustomerSwitch, demoAuthHeaders, principalAuthHeaders,
} from '../src/labApiClient.mjs';

test('every governed demo adapter forwards request-local IMS, never the shared ops key', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return { ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => ({ ok: true }) };
  };
  const imsAuthHeaders = {
    Authorization: 'Bearer test-ims-session',
    'x-gw-ims-org-id': 'TEST@AdobeOrg',
    'x-gw-ims-email': 'tester@adobe.com',
  };
  try {
    await requestContext.run({ keyId: 'ims-test', mcpApiKey: 'server-ops-key', imsAuthHeaders }, async () => {
      const params = { sandbox: 'apalmer', confirmed: false };
      for (const call of [
        inspectDemoConfig, previewDemoConfig, applyDemoConfig, previewDemoConfigRestore,
        inspectDemoAssets, previewDemoAssets, applyDemoAssets, previewDemoAssetsRestore, applyDemoCustomerSwitch,
      ]) {
        assert.equal((await call(params)).ok, true);
      }
      assert.deepEqual(demoAuthHeaders(), imsAuthHeaders);
      // Routes not yet supporting IMS retain their existing authentication contract.
      assert.deepEqual(principalAuthHeaders(), { 'X-AEP-Lab-Mcp-Key': 'server-ops-key' });
    });
    assert.equal(seen.length, 9);
    for (const { init } of seen) {
      assert.equal(init.headers.Authorization, imsAuthHeaders.Authorization);
      assert.equal(init.headers['x-gw-ims-org-id'], imsAuthHeaders['x-gw-ims-org-id']);
      assert.equal(init.headers['X-AEP-Lab-Mcp-Key'], undefined);
    }
    await requestContext.run({ mcpApiKey: 'portal-user-key' }, async () => {
      await inspectDemoConfig({ sandbox: 'apalmer' });
    });
    assert.equal(seen.at(-1).init.headers['X-AEP-Lab-Mcp-Key'], 'portal-user-key');
    assert.equal(seen.at(-1).init.headers.Authorization, undefined);
    assert.deepEqual(demoAuthHeaders(), {});
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('IMS headers do not leak between concurrent request contexts', async () => {
  const headers = await Promise.all(['first', 'second'].map((identity) => requestContext.run({
    imsAuthHeaders: { Authorization: `Bearer ${identity}` },
  }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return demoAuthHeaders();
  })));
  assert.deepEqual(headers, [{ Authorization: 'Bearer first' }, { Authorization: 'Bearer second' }]);
});

test('first-run setup uses IMS headers rather than the shared ops credential', async () => {
  process.env.AEP_LAB_MCP_FIRESTORE = 'off';
  let callback;
  registerMcpFirstRunSetupTool({ registerTool: (_name, _metadata, handler) => { callback = handler; } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(url.endsWith('/api/lab/mcp-first-run-setup'));
    assert.equal(init.headers.Authorization, 'Bearer test-first-run');
    assert.equal(init.headers['X-AEP-Lab-Mcp-Key'], undefined);
    assert.equal(JSON.parse(init.body).sandbox, 'apalmer');
    return { ok: true, json: async () => ({ ok: true, foundationsReady: true }) };
  };
  try {
    const result = await requestContext.run({
      keyId: 'ims-test',
      mcpApiKey: 'server-ops-key',
      imsAuthHeaders: { Authorization: 'Bearer test-first-run', 'x-gw-ims-org-id': 'TEST@AdobeOrg' },
      principalAccess: { allowedSandboxes: ['apalmer'], allowedSet: new Set(['apalmer']) },
    }, () => callback({ sandbox: 'apalmer', include_sandbox_readiness: false }));
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content[0].text).ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
