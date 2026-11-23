import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestoreDb } from '../src/firestoreAdmin.mjs';
import { requestContext } from '../src/requestContext.mjs';
import { registerAudienceTools } from '../src/tools/audienceTools.mjs';
import { registerAjoCleanupTools } from '../src/tools/ajoCleanupTools.mjs';
import { registerAjoLoyaltyTools } from '../src/tools/ajoLoyaltyTools.mjs';
import { registerMeasurementQualityTools } from '../src/tools/measurementQualityTools.mjs';

test('reviewed MCP tools allow owner reads but never foreign deletes', async (t) => {
  initializeApp({ projectId: 'owner-read-test' });
  const db = await getFirestoreDb();
  t.mock.method(db, 'collection', () => ({ add: async () => ({}) }));
  t.mock.method(console, 'log', () => {});
  let owner = { uid: 'owner', disabled: false };
  t.mock.method(getAuth(), 'getUserByEmail', async () => owner);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url: new URL(url), method: init.method });
    return new Response(JSON.stringify({ ok: true, sandbox: 'kirkham', data: {} }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const tools = new Map();
  const server = { registerTool(name, _definition, handler) { tools.set(name, handler); } };
  for (const register of [registerAudienceTools, registerAjoCleanupTools, registerAjoLoyaltyTools, registerMeasurementQualityTools]) register(server);
  const context = {
    authSource: 'user', principalUid: 'owner', keyId: 'key', mcpApiKey: 'test-key',
    principalAccess: { allowedSandboxes: ['apalmer'], allowedSet: new Set(['apalmer']) },
  };
  await requestContext.run(context, async () => {
    for (const [name, params] of [
      ['lab_audience_list', {}], ['lab_audience_audit', { audience_id: 'a' }],
      ['lab_ajo_journey_list', {}], ['lab_ajo_journey_audit', { journey_id: 'j' }],
      ['lab_ajo_campaign_list', {}], ['lab_ajo_campaign_audit', { campaign_id: 'c' }],
      ['lab_ajo_loyalty_config', {}], ['launch_property_audit', {}],
      ['launch_environment_list', { property_id: 'p' }],
    ]) {
      const result = await tools.get(name)({ sandbox: 'kirkham', ...params });
      assert.equal(result.isError, undefined, name);
      assert.equal(requests.at(-1).method, 'GET', name);
      assert.equal(requests.at(-1).url.searchParams.get('sandbox'), 'kirkham', name);
    }
    const count = requests.length;
    for (const name of ['lab_audience_delete', 'lab_ajo_journey_delete', 'lab_ajo_campaign_delete']) {
      assert.equal((await tools.get(name)({ sandbox: 'kirkham' })).isError, true, name);
    }
    owner = { uid: 'owner', disabled: true };
    assert.equal((await tools.get('lab_ajo_loyalty_config')({ sandbox: 'kirkham' })).isError, true);
    assert.equal(requests.length, count);
    assert.equal((await tools.get('launch_property_audit')({})).isError, undefined);
    assert.equal(requests.at(-1).url.searchParams.has('sandbox'), false);
  });
});
