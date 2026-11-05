import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { registerSnowflakeWorkspaceTools } from '../src/tools/snowflakeWorkspace.mjs';
import { registerFocusedSnowflakeTools, registerProfileTools } from '../src/tools/index.mjs';
import { requestContext } from '../src/requestContext.mjs';
import { listMcpContexts, recommendMcpContexts } from '../src/framework/mcpContextGuide.mjs';

process.env.AEP_LAB_MCP_FIRESTORE = 'off';

const tools = new Map();
registerSnowflakeWorkspaceTools({
  registerTool(name, config, callback) { tools.set(name, { config, callback }); },
});
const access = {
  keyId: 'offline-workspace', mcpApiKey: 'offline-key',
  principalAccess: { source: 'firestore', allowedSandboxes: ['test'] },
};
function invoke(action, input = {}, context = access) {
  const tool = tools.get(`lab_snowflake_${action}`);
  return requestContext.run(context, () => tool.callback(z.object(tool.config.inputSchema).parse({ sandbox: 'test', ...input })));
}

test('focused and complete catalog expose every workspace tool without an approval tool', () => {
  for (const [register, id] of [[registerFocusedSnowflakeTools, 'aep-lab-snowflake'], [registerProfileTools, 'aep-lab-general']]) {
    const names = [];
    register({ registerTool(name) { names.push(name); } });
    assert.equal(names.length, listMcpContexts().find((item) => item.id === id).toolCount);
    assert.equal(names.length, new Set(names).size);
    for (const name of tools.keys()) assert.ok(names.includes(name), name);
    assert.ok(!names.includes('lab_snowflake_change_approve'));
    assert.ok(!names.includes('lab_snowflake_change_get'));
  }
  assert.equal(recommendMcpContexts('run a Snowflake SQL query').primary.id, 'aep-lab-snowflake');
  assert.equal(recommendMcpContexts('ask a Cortex Agent').primary.id, 'aep-lab-snowflake');
});

test('workspace schema rejects broad mutations, unsafe identifiers and missing predicates', () => {
  const schema = z.object(tools.get('lab_snowflake_change_preview').config.inputSchema);
  for (const operation of [
    { kind: 'drop_table', table: 'T' },
    { kind: 'update', table: 'T', values: { FLAG: true }, where: {} },
    { kind: 'delete', table: 'T', where: {} },
    { kind: 'grant', table: 'T', role: 'R', privileges: ['OWNERSHIP'] },
    { kind: 'insert', table: 'DB.OTHER.T', values: { ID: 1 } },
    { kind: 'insert', table: 'T', values: { 'ID); DROP TABLE X': 1 } },
  ]) {
    assert.equal(schema.safeParse({ sandbox: 'test', operation }).success, false);
  }
  assert.equal(schema.safeParse({
    sandbox: 'test', operation: { kind: 'update', table: 'T', values: { FLAG: false }, where: { ID: 0 } },
  }).success, true);
});

test('workspace tools reject ops principals and out-of-scope sandboxes without transport', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call upstream'); });
  assert.equal((await invoke('capabilities', {}, {
    principalAccess: { source: 'env', allowedSandboxes: ['test'] },
  })).isError, true);
  assert.equal((await invoke('capabilities', { sandbox: 'other' })).isError, true);
  assert.equal((await invoke('agent_run', {
    agent: 'DB.SC.AGENT', message: 'Hello', request_id: 'a49dbe9d-9f4f-4f4f-9f4f-a49dbe9da49d', thread_id: 1,
  })).isError, true);
});

test('transport preserves jobs and provider errors and never retries ambiguous submits', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: new URL(url), body: JSON.parse(init.body), headers: init.headers });
    return Response.json({ ok: true, result: { ok: true, job_id: 'job-1', status: 'running' } });
  });
  const params = { sql: 'SELECT ? AS ID', bindings: [0], request_id: 'a49dbe9d-9f4f-4f4f-9f4f-a49dbe9da49d' };
  const result = await invoke('query_submit', params);
  assert.deepEqual(JSON.parse(result.content[0].text), { ok: true, job_id: 'job-1', status: 'running' });
  assert.equal(calls[0].url.pathname, '/snowflakeWorkspace');
  assert.deepEqual(calls[0].body, { ...params, sandbox: 'test', action: 'query_submit' });
  assert.equal(calls[0].headers['X-AEP-Lab-Mcp-Key'], 'offline-key');

  t.mock.method(globalThis, 'fetch', async () => {
    calls.push('failure');
    return Response.json({ ok: false, result: {
      ok: false, error: { code: 'OUTCOME_UNKNOWN', message: 'Reconcile job-1' }, job_id: 'job-1',
    } }, { status: 503 });
  });
  const failure = await invoke('query_submit', params);
  assert.equal(failure.isError, true);
  assert.equal(JSON.parse(failure.content[0].text).detail.error.code, 'OUTCOME_UNKNOWN');
  assert.equal(calls.filter((item) => item === 'failure').length, 1);
});

test('IMS uses the existing verified passthrough transport and preserves result pagination', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer offline-ims');
    assert.equal(init.headers['x-gw-ims-org-id'], 'offline-org');
    return Response.json({ ok: true, result: {
      ok: true, rows: [{ ID: 1 }], nextOffset: 1, truncated: true,
    } });
  });
  const result = await invoke('query_results', { job_id: 'job-1', limit: 1 }, {
    ...access, mcpApiKey: undefined, authSource: 'ims',
    imsAuthHeaders: { Authorization: 'Bearer offline-ims', 'x-gw-ims-org-id': 'offline-org' },
  });
  assert.equal(result.isError, undefined);
  assert.equal(JSON.parse(result.content[0].text).nextOffset, 1);
});

test('Cortex and change tools publish conservative non-read-only annotations', () => {
  for (const action of ['agent_run', 'change_apply', 'query_cancel']) {
    const annotations = tools.get(`lab_snowflake_${action}`).config.annotations;
    assert.equal(annotations.readOnlyHint, false);
    assert.equal(annotations.destructiveHint, true);
    assert.equal(annotations.idempotentHint, false);
  }
  assert.equal(tools.get('lab_snowflake_query_submit').config.annotations.readOnlyHint, false);
});
