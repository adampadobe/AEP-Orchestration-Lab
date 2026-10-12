import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestContext } from '../src/requestContext.mjs';
import * as api from '../src/labApiClient.mjs';
import { getExecutionFramework } from '../src/framework/labFramework.mjs';

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
