import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as api from '../src/labApiClient.mjs';
import { requestContext } from '../src/requestContext.mjs';

const routes = [
  ['getSnowflakeConfig', '/api/snowflake/config', {}],
  ['snowflakeConnectionTest', '/api/snowflake/connection-test', {}],
  ['snowflakeGenerateBaseProfiles', '/api/snowflake/generate-base-profiles', { count: 1 }],
  ['snowflakeGenerateBaseProfiles', '/api/snowflake/generate-industry-profiles', { industry: 'fsi', count: 1 }],
  ['snowflakeInsertProfileFromAep', '/api/snowflake/insert-profile-from-aep', { email: 'demo@example.com', ecid: '123' }],
  ['snowflakeQueryProfiles', '/api/snowflake/agentic/query-profiles', { email: 'demo@example.com' }],
  ['snowflakeIndustryCatalog', '/api/snowflake/industry-catalog', { industry: 'fsi' }],
  ['snowflakeTableStructure', '/api/snowflake/agentic/table-structure', { phase: 'phase1' }],
  ['snowflakeValidateProposal', '/api/snowflake/industry-validate-proposal', { recipe_id: 'fsi.all.v1' }],
  ['snowflakeGenerateFull', '/api/snowflake/agentic/generate-full', { count: 1 }],
  ['snowflakeEnrichProfiles', '/api/snowflake/agentic/enrich-profiles', { industry: 'fsi', profiles: [] }],
  ['snowflakeProfileBundle', '/api/snowflake/agentic/profile-bundle', { industry: 'fsi', email: 'demo@example.com' }],
  ['snowflakeProvision', '/api/snowflake/provision', { industry: 'fsi', recipe_id: 'fsi.all.v1', dry_run: true }],
];
const firebase = JSON.parse(readFileSync(new URL('../../../firebase.json', import.meta.url), 'utf8'));
const hosting = Array.isArray(firebase.hosting) ? firebase.hosting[0] : firebase.hosting;
const rewrites = new Map(hosting.rewrites.map(route => [route.source, route.function]));
const invoke = (name, params = {}) => requestContext.run({
  keyId: 'offline-transport', mcpApiKey: 'offline-user-key',
}, () => api[name]({ sandbox: 'apalmer', ...params }));

test('every Snowflake MCP call targets the matching direct function with unchanged user auth and payload', async t => {
  const original = process.env.AEP_LAB_FUNCTIONS_ORIGIN;
  process.env.AEP_LAB_FUNCTIONS_ORIGIN = 'https://functions.example.test/';
  t.after(() => {
    if (original === undefined) delete process.env.AEP_LAB_FUNCTIONS_ORIGIN;
    else process.env.AEP_LAB_FUNCTIONS_ORIGIN = original;
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: new URL(url), init });
    return Response.json({ ok: true });
  });
  for (const [name, source, params] of routes) {
    const result = await invoke(name, params);
    assert.equal(result.ok, true, source);
    const { url, init } = calls.at(-1);
    assert.equal(url.origin, 'https://functions.example.test');
    assert.equal(url.pathname, '/' + rewrites.get(source).functionId, source);
    assert.equal(rewrites.get(source).region, 'us-central1');
    assert.equal(init.headers['X-AEP-Lab-Mcp-Key'], 'offline-user-key');
    assert.equal(init.method, name === 'getSnowflakeConfig' ? 'GET' : 'POST');
    if (init.body) assert.equal(JSON.parse(init.body).sandbox, 'apalmer');
    else assert.equal(url.searchParams.get('sandbox'), 'apalmer');
    if (params.industry) assert.equal(JSON.parse(init.body).industry, params.industry);
    if (params.count) assert.equal(JSON.parse(init.body).count, params.count);
    if (params.email) assert.equal(JSON.parse(init.body).email, params.email);
  }
  assert.equal(calls.length, routes.length);
});

test('a 115-second seed response survives the 60-second Hosting boundary', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  t.mock.method(globalThis, 'fetch', (url, init) => new Promise((resolve, reject) => {
    calls.push(new URL(url));
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    setTimeout(() => resolve(Response.json({ ok: true, result: { ok: true } })), 115_000);
  }));
  let settled = false;
  const pending = invoke('snowflakeGenerateBaseProfiles', { industry: 'fsi', count: 1 });
  pending.then(() => { settled = true; });
  t.mock.timers.tick(60_001);
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(54_999);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, '/snowflakeGenerateIndustryProfiles');
});

test('Snowflake mutations never retry a gateway error or timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let timeout = false;
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    calls++;
    if (!timeout) return Promise.resolve(new Response('Bad Gateway', { status: 502 }));
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  });
  for (const name of ['snowflakeGenerateBaseProfiles', 'snowflakeInsertProfileFromAep', 'snowflakeEnrichProfiles']) {
    for (timeout of [false, true]) {
      const before = calls;
      const pending = invoke(name, { industry: 'fsi', count: 1, email: 'demo@example.com', ecid: '123', profiles: [] });
      if (timeout) t.mock.timers.tick(600_000);
      const result = await pending;
      assert.equal(result.ok, false);
      assert.equal(result.status, timeout ? 0 : 502);
      assert.equal(calls - before, 1, name);
    }
  }
});
