import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestContext } from '../src/requestContext.mjs';
import * as api from '../src/labApiClient.mjs';
import { getExecutionFramework } from '../src/framework/labFramework.mjs';
import { registerSnowflakeTools } from '../src/tools/snowflakeTools.mjs';

const imsAuthHeaders = { Authorization: 'Bearer test-ims-session', 'x-gw-ims-org-id': 'TEST@AdobeOrg' };

test('governed adapters forward IMS without shared keys, with an enrolled sandbox for unscoped tools', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ ok: true }),
    };
  };
  try {
    await requestContext.run({
      imsAuthHeaders, mcpApiKey: 'shared-ops-key',
      principalAccess: { source: 'ims-enrollment', allowedSandboxes: ['apalmer'] },
    }, async () => {
      const params = { sandbox: 'apalmer', id: 'item-1', audience_id: 'aud-1', asset_id: 'asset-1', asset_type: 'journey' };
      for (const call of [
        api.audienceList, api.audienceAudit, api.audienceDelete,
        api.ajoAssetList, api.ajoAssetAudit, api.ajoAssetDelete,
        api.adobeCapabilityCatalog, api.ajoSuppressionAddresses, api.genstudioExperienceList,
        api.assuranceSessionList, api.assuranceEventInspect, api.launchPropertyAudit,
        api.launchEnvironmentList, api.statusIncidentCorrelate,
        api.commerceAccessInfo, api.commerceCapabilities, api.commerceStoreConfigs,
        api.commerceGraphqlSchema, api.commerceGraphqlQuery,
        api.commerceAdminChangePreview, api.commerceAdminChangeApply,
        api.commerceAdminDeleteAudit, api.commerceAdminDeleteApply,
        api.commerceOptimizerAccessInfo, api.commerceOptimizerCapabilities,
        (p) => api.commerceOptimizerQuery('view_check', p),
        (p) => api.commerceOptimizerQuery('ingestion_change_apply', p),
        api.homeCommandGetState, api.homeCommandAddCustomer, api.homeCommandUpdateCustomer, api.homeCommandDeleteCustomer,
        api.homeCommandAddTask, api.homeCommandUpdateTask, api.homeCommandDeleteTask,
        api.homeCommandAddMeeting, api.homeCommandUpdateMeeting, api.homeCommandDeleteMeeting,
        api.getSnowflakeConfig, api.snowflakeConnectionTest,
        api.liveActivityListRuns,
      ]) {
        assert.equal((await call(params)).ok, true);
      }
    });
    assert.equal(seen.length, 40);
    for (const { init } of seen) {
      assert.equal(init.headers.Authorization, imsAuthHeaders.Authorization);
      assert.equal(init.headers['x-gw-ims-org-id'], imsAuthHeaders['x-gw-ims-org-id']);
      assert.equal(init.headers['x-sandbox-name'], 'apalmer');
      assert.equal(init.headers['X-AEP-Lab-Mcp-Key'], undefined);
      assert.equal(init.headers['X-AEP-Lab-Principal-Id'], undefined);
    }
    await requestContext.run({ mcpApiKey: 'portal-user-key' }, () => api.audienceList({ sandbox: 'apalmer' }));
    assert.equal(seen.at(-1).init.headers['X-AEP-Lab-Mcp-Key'], 'portal-user-key');
    assert.equal(seen.at(-1).init.headers.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('execution framework version stays aligned with the MCP package', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(getExecutionFramework().version, pkg.version);
});

test('Snowflake schema export forwards opt-in and returns exact DDL under user-key and IMS auth', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  const tableDefinitions = [{
    table: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
    fqTable: 'DB.LAB.AGENTIC_TRAVEL_PROFILE_CUSTOMER',
    ddl: 'create or replace TABLE AGENTIC_TRAVEL_PROFILE_CUSTOMER (LIFETIMEVALUE NUMBER(18,2));',
  }];
  let handler;
  registerSnowflakeTools({
    registerTool(name, config, callback) {
      if (name === 'lab_snowflake_table_structure') {
        assert.equal(config.inputSchema.include_ddl.parse(undefined), undefined);
        handler = callback;
      }
    },
  });
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    const body = JSON.parse(init.body);
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        ok: true,
        result: {
          phase: 'phase1', table_count: 4, structure_text: '-- metadata',
          ...(body.include_ddl ? { table_definitions: tableDefinitions } : {}),
        },
      }),
    };
  };
  try {
    for (const source of ['user', 'ims-enrollment']) {
      await requestContext.run({
        principalUid: 'schema-reader',
        principalAccess: { source, allowedSandboxes: ['apalmer'] },
        ...(source === 'user' ? { mcpApiKey: 'test-user-key' } : { imsAuthHeaders }),
      }, async () => {
        const ordinary = await handler({ sandbox: 'apalmer', phase: 'phase1' });
        assert.equal(JSON.parse(ordinary.content[0].text).tableDefinitions, undefined);
        assert.equal(JSON.parse(seen.at(-1).init.body).include_ddl, undefined);
        const exported = await handler({ sandbox: 'apalmer', phase: 'phase1', include_ddl: true });
        assert.deepEqual(JSON.parse(exported.content[0].text).tableDefinitions, tableDefinitions);
        assert.equal(JSON.parse(seen.at(-1).init.body).include_ddl, true);
        const count = seen.length;
        const denied = await handler({ sandbox: 'someone-else', phase: 'phase1', include_ddl: true });
        assert.equal(denied.isError, true);
        assert.equal(seen.length, count);
      });
    }
    assert.equal(seen.length, 4);
    assert.equal(seen[0].init.headers['X-AEP-Lab-Mcp-Key'], 'test-user-key');
    assert.equal(seen[2].init.headers.Authorization, imsAuthHeaders.Authorization);
    assert.equal(seen[2].init.headers['X-AEP-Lab-Mcp-Key'], undefined);
    for (const call of seen) assert.ok(call.url.endsWith('/api/snowflake/agentic/table-structure'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
