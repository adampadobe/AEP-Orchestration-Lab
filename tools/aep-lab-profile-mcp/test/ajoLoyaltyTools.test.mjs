import test from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod';
import { registerAjoLoyaltyTools } from '../src/tools/ajoLoyaltyTools.mjs';
import { requestContext } from '../src/requestContext.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';

process.env.AEP_LAB_MCP_FIRESTORE = 'off';

function register() {
  const tools = new Map();
  registerAjoLoyaltyTools({
    registerTool(name, definition, handler) { tools.set(name, { definition, handler }); },
  });
  return tools;
}

const access = {
  allowedSandboxes: ['kirkham'],
  allowedSet: new Set(['kirkham']),
};

test('Loyalty tools accept only typed read inputs and are centrally annotated read-only', () => {
  const tools = register();
  assert.equal(tools.size, 5);
  for (const [name, { definition }] of tools) {
    assert.equal(annotationsForTool(name).readOnlyHint, true);
    assert.equal(annotationsForTool(name).destructiveHint, false);
    assert.equal(annotationsForTool(name).idempotentHint, true);
    assert.equal(definition.inputSchema.authorization, undefined);
    assert.equal(definition.inputSchema.path, undefined);
    assert.equal(definition.inputSchema.method, undefined);
  }
  const state = z.object(tools.get('lab_ajo_loyalty_profile_state').definition.inputSchema);
  assert.equal(state.safeParse({ sandbox: 'kirkham', profile_id: 'member-1', test: false }).success, true);
  for (const params of [
    { profile_id: '' }, { profile_id: ' ' }, { profile_id: 'member\nother' },
    { profile_id: 'member', region: 'https://evil.test' },
    { profile_id: 'member', challenge_id: '../config' },
    { profile_id: 'member', test: 'false' },
  ]) assert.equal(state.safeParse({ sandbox: 'kirkham', ...params }).success, false);
  const list = z.object(tools.get('lab_ajo_loyalty_challenge_list').definition.inputSchema);
  for (const limit of [0, 101, 2.5, '20']) assert.equal(list.safeParse({ sandbox: 'kirkham', limit }).success, false);
});

test('handlers forward both authentication modes, preserve explicit false and omit identities from audits', async (t) => {
  const tools = register();
  const audits = [];
  t.mock.method(console, 'log', (line) => audits.push(line));
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url: new URL(url), init });
    return new Response(JSON.stringify({
      ok: true, sandbox: 'kirkham', data: { challengeList: [] },
    }), { headers: { 'Content-Type': 'application/json' } });
  });
  for (const authentication of [
    { mcpApiKey: 'test-user-key' },
    { imsAuthHeaders: { authorization: 'Bearer test-ims', 'x-gw-ims-org-id': 'test-org' } },
  ]) {
    await requestContext.run({ ...authentication, principalAccess: access, keyId: 'test-key-id' }, async () => {
      for (const [name, params] of [
        ['lab_ajo_loyalty_config', {}],
        ['lab_ajo_loyalty_challenge_list', { limit: 50, start: 'cursor+1' }],
        ['lab_ajo_loyalty_challenge_get', { challenge_id: 'challenge-1' }],
        ['lab_ajo_loyalty_profile_state', { profile_id: 'private-member', region: 'nld2', test: false }],
        ['lab_ajo_loyalty_profile_challenges', { profile_id: 'private-member', state: 'complete' }],
      ]) {
        const result = await tools.get(name).handler({ sandbox: 'kirkham', ...params });
        assert.equal(result.isError, undefined);
        assert.equal(JSON.parse(result.content[0].text).lab.ok, true);
        const { url, init } = requests.at(-1);
        assert.equal(url.pathname, '/aepProxy/api/ajo-loyalty');
        assert.equal(url.searchParams.get('sandbox'), 'kirkham');
        assert.equal(init.method, 'GET');
        assert.equal(init.body, undefined);
        if (authentication.mcpApiKey) assert.equal(init.headers['X-AEP-Lab-Mcp-Key'], 'test-user-key');
        else assert.equal(init.headers.authorization, 'Bearer test-ims');
      }
    });
  }
  assert.equal(requests[3].url.searchParams.get('test'), 'false');
  assert.equal(requests[3].url.searchParams.get('region'), 'nld2');
  assert.equal(requests[4].url.searchParams.get('state'), 'complete');
  assert.doesNotMatch(audits.join('\n'), /private-member|test-user-key|test-ims|cursor\+1/);
});

test('sandbox refusal makes no request and Adobe failures are surfaced without retries', async (t) => {
  const tools = register();
  let calls = 0;
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({
      ok: false, error: 'Adobe Loyalty returned HTTP 403.',
      platform_status: 403, platform_response: { error_code: '403003' },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  });
  await requestContext.run({ principalAccess: access }, async () => {
    const handler = tools.get('lab_ajo_loyalty_config').handler;
    assert.equal((await handler({ sandbox: 'other' })).isError, true);
    assert.equal(calls, 0);
    const rejected = await handler({ sandbox: 'kirkham' });
    assert.equal(rejected.isError, true);
    assert.match(rejected.content[0].text, /403003/);
    assert.equal(calls, 1);
  });
});

test('backend 503 and malformed success envelopes remain errors after a single request', async (t) => {
  const handler = register().get('lab_ajo_loyalty_config').handler;
  t.mock.method(console, 'log', () => {});
  for (const [status, data] of [[503, { ok: false, error: 'Unavailable' }], [200, { ok: false }], [200, {}]]) {
    let calls = 0;
    const fetch = t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    });
    await requestContext.run({ principalAccess: access }, async () => {
      assert.equal((await handler({ sandbox: 'kirkham' })).isError, true);
    });
    assert.equal(calls, 1);
    fetch.mock.restore();
  }
});
