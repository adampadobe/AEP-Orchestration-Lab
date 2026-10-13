import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestContext } from '../src/requestContext.mjs';
import * as api from '../src/labApiClient.mjs';
import { getExecutionFramework } from '../src/framework/labFramework.mjs';
import { registerSnowflakeTools } from '../src/tools/snowflakeTools.mjs';

process.env.AEP_LAB_MCP_FIRESTORE = 'off';

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

test('Snowflake setup preserves preview and confirmation fields for key and IMS principals', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  const handlers = {};
  registerSnowflakeTools({
    registerTool(name, config, handler) {
      handlers[name] = handler;
      if (name === 'lab_snowflake_provision') {
        assert.equal(config.inputSchema.dry_run.parse(undefined), undefined);
        assert.equal(config.inputSchema.confirmed.parse(true), true);
      }
    },
  });
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url: String(url), init, body });
    const result = String(url).endsWith('/validate-proposal') ? { validation: { errors: [] } } : {
      dry_run: body.dry_run !== false, executed: body.dry_run === false,
      requiresConfirmation: true, preview_fingerprint: 'confirmed-target',
      tables: ['COLLEAGUE_DB.LAB.AGENTIC_TRAVEL_PROFILE_CUSTOMER'],
    };
    return { ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => ({ ok: true, result }) };
  };
  try {
    for (const source of ['user', 'ims-enrollment']) {
      await requestContext.run({
        keyId: `setup-${source}`, principalUid: 'colleague-uid',
        principalAccess: { source, allowedSandboxes: ['colleague'] },
        ...(source === 'user' ? { mcpApiKey: 'test-user-key' } : { imsAuthHeaders }),
      }, async () => {
        const request = { sandbox: 'colleague', industry: 'travel', recipe_id: 'travel.all.v1' };
        const preview = JSON.parse((await handlers.lab_snowflake_provision(request)).content[0].text);
        assert.equal(preview.dry_run, true);
        assert.equal(preview.preview_fingerprint, 'confirmed-target');
        assert.equal(seen.at(-1).body.dry_run, undefined);
        await handlers.lab_snowflake_provision({ ...request, dry_run: false, confirmed: true, preview_fingerprint: preview.preview_fingerprint });
        assert.equal(seen.at(-1).body.confirmed, true);
        assert.equal(seen.at(-1).body.dry_run, false);
        assert.equal(seen.at(-1).body.preview_fingerprint, 'confirmed-target');
        const previous = seen.length;
        assert.equal((await handlers.lab_snowflake_provision({ ...request, sandbox: 'someone-else' })).isError, true);
        assert.equal(seen.length, previous);
      });
    }
    for (const { init, body } of seen) {
      assert.equal(body.sandbox, 'colleague');
      assert.equal(init.headers['X-AEP-Lab-Principal-Id'], undefined);
      assert.ok(init.headers.Authorization || init.headers['X-AEP-Lab-Mcp-Key']);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MCP industry batch generation uses the UI endpoint and returns identity selectors for enrichment', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  const handlers = {};
  registerSnowflakeTools({ registerTool(name, _config, handler) { handlers[name] = handler; } });
  const profiles = [{ email: 'demo+13102026-1@example.com', ecid: '123', crmId: 'CRM1', columns: { FIRSTNAME: 'Demo' } }];
  const profileResults = [{ ok: true, email: profiles[0].email, insertedRowCount: 12, tableResults: [{ eventType: 'order', rowCount: 4 }] }];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url: String(url), init, body });
    const result = String(url).endsWith('/validate-proposal') ? { validation: { errors: [] } } :
      String(url).endsWith('/enrich-profiles') ? { profileResults, insertedRowCount: 12 } :
      { industry: body.industry, rowcount: 1, profiles, table: 'COLLEAGUE_DB.LAB.CRM', sample: [] };
    return { ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => ({ ok: true, result }) };
  };
  try {
    for (const source of ['user', 'ims-enrollment']) await requestContext.run({
      keyId: `industry-batch-${source}`, principalUid: 'colleague-uid',
      ...(source === 'user' ? { mcpApiKey: 'test-user-key' } : { imsAuthHeaders }),
      principalAccess: { source, allowedSandboxes: ['colleague'] },
    }, async () => {
      for (const industry of ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']) {
        await requestContext.run({ ...requestContext.getStore(), keyId: `industry-batch-${source}-${industry}` }, async () => {
          const result = JSON.parse((await handlers.lab_snowflake_generate_base_profiles({
            sandbox: 'colleague', industry, count: 1,
          })).content[0].text);
          assert.equal(result.industry, industry);
          assert.deepEqual(result.profiles, [{ email: profiles[0].email, ecid: '123', crmId: 'CRM1' }]);
          assert.ok(seen.at(-1).url.endsWith('/api/snowflake/generate-industry-profiles'));
          assert.equal(seen.at(-1).body.industry, industry);
        });
      }
      await handlers.lab_snowflake_generate_base_profiles({ sandbox: 'colleague', count: 1 });
      assert.ok(seen.at(-1).url.endsWith('/api/snowflake/generate-base-profiles'));
      const previous = seen.length;
      assert.equal((await handlers.lab_snowflake_generate_base_profiles({
        sandbox: 'colleague', industry: 'retail', table: 'BASE_PROFILES',
      })).isError, true);
      assert.equal(seen.length, previous);
      assert.equal((await handlers.lab_snowflake_generate_base_profiles({
        sandbox: 'someone-else', industry: 'retail', count: 1,
      })).isError, true);
      assert.equal(seen.length, previous);
      const enriched = JSON.parse((await handlers.lab_snowflake_enrich_profiles({
        sandbox: 'colleague', industry: 'retail', profiles, event_types: ['order'],
      })).content[0].text);
      assert.deepEqual(enriched.profileResults, profileResults);
      assert.equal(enriched.insertedRowCount, 12);
    });
    for (const { init } of seen) {
      assert.ok(init.headers.Authorization || init.headers['X-AEP-Lab-Mcp-Key']);
      assert.equal(init.headers['X-AEP-Lab-Principal-Id'], undefined);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
