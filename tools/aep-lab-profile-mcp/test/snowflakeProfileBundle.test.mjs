import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { requestContext } from '../src/requestContext.mjs';
import { registerSnowflakeTools } from '../src/tools/snowflakeTools.mjs';

const tools = new Map();
registerSnowflakeTools({
  registerTool: (name, config, callback) => tools.set(name, { config, callback }),
}, { include: new Set(['lab_snowflake_get_profile_bundle']) });
const { config, callback } = tools.get('lab_snowflake_get_profile_bundle');
const schema = z.object(config.inputSchema);
const base = { sandbox: 'test', industry: 'telecom', ecid: 'offline-ecid' };
const invoke = (params) => requestContext.run({
  keyId: 'offline-bundle', mcpApiKey: 'offline-user-key',
  principalAccess: { source: 'firestore', allowedSandboxes: ['test'] },
}, () => callback(schema.parse(params)));

test('bundle schema preserves legacy defaults and validates safe nonnegative integer offsets', () => {
  assert.equal(schema.parse(base).event_limit, 25);
  assert.equal(schema.parse(base).event_offset, undefined);
  assert.equal(schema.parse({ ...base, event_offset: 0 }).event_offset, 0);
  for (const event_offset of [-1, 0.5, '1', null, true, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(schema.safeParse({ ...base, event_offset }).success, false);
  }
  for (const table_key of ['', null, 1]) {
    assert.equal(schema.safeParse({ ...base, table_key }).success, false);
  }
  assert.equal(schema.safeParse({ ...base, industry: 'travel' }).success, false);
});

test('MCP callback and transport propagate selected-table pagination and retain complete continuation metadata', async t => {
  const calls = [];
  const page = {
    table: 'AGENTIC_TELECOM_EVENT_USAGE', kind: 'event',
    count: 5, totalCount: 125, offset: 120, hasMore: false, nextOffset: null,
    rows: [{ EVENTID: 'last-page' }],
  };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ path: new URL(url).pathname, body: JSON.parse(init.body), headers: init.headers });
    return Response.json({ ok: true, result: {
      ok: true, profile: { ECID: base.ecid }, eventLimit: 10, eventOffset: 120,
      tables: { usage: page }, totalReturnedRows: 5,
    } });
  });
  const result = await invoke({ ...base, table_key: 'usage', event_offset: 120, event_limit: 10 });
  assert.equal(result.isError, undefined);
  assert.deepEqual(calls[0].body, { sandbox: 'test', industry: 'telecom', ecid: base.ecid, tableKey: 'usage', eventOffset: 120, eventLimit: 10 });
  assert.equal(calls[0].path, '/snowflakeAgenticProfileBundle');
  assert.equal(calls[0].headers['X-AEP-Lab-Mcp-Key'], 'offline-user-key');
  const decoded = JSON.parse(result.content[0].text);
  assert.deepEqual(decoded.tables, { usage: page });
  assert.equal(decoded.totalReturnedRows, 5);
  assert.equal(decoded.lab.result.eventOffset, 120);

  await invoke({ ...base, table_key: 'usage', event_offset: 0, event_limit: 1 });
  assert.equal(calls[1].body.eventOffset, 0);
  await invoke(base);
  assert.deepEqual(calls[2].body, { sandbox: 'test', industry: 'telecom', ecid: base.ecid, eventLimit: 25 });
});

test('an unregistered or wrong-industry selector returns a tool error, not an empty successful bundle', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    assert.ok(['not-registered', 'watchlist'].includes(JSON.parse(init.body).tableKey));
    return Response.json({ ok: false, error: 'tableKey must be a registered telecom table key' }, { status: 400 });
  });
  for (const table_key of ['not-registered', 'watchlist']) {
    const result = await invoke({ ...base, table_key });
    assert.equal(result.isError, true);
    const decoded = JSON.parse(result.content[0].text);
    assert.equal(decoded.ok, false);
    assert.equal(decoded.detail.status, 400);
    assert.match(decoded.error, /tableKey must/);
  }
  assert.equal(calls, 2);
});
