import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { installUsageTelemetry, usageCollectionEnabled } from '../src/usageTelemetry.mjs';
import { requestContext } from '../src/requestContext.mjs';

async function fixture(t, options = {}) {
  const records = [];
  const warnings = [];
  const server = new McpServer({ name: 'usage-test', version: '1.0.0' });
  installUsageTelemetry(server, { path: '/mcp/profile', toolset: 'profile' }, {
    enabled: () => true,
    write: async (id, record) => records.push({ id, ...record }),
    logger: { warn: (message) => warnings.push(message) },
    ...options,
  });
  server.registerTool('fixture_result', { inputSchema: { sandbox: z.string() } }, async () => ({
    content: [{ type: 'text', text: '{"ok":false,"secret":"result-secret"}' }],
  }));
  server.registerTool('fixture_error', {}, async () => ({
    isError: true, content: [{ type: 'text', text: 'private failure' }],
  }));
  server.registerTool('fixture_throw', {}, async () => { throw new Error('private exception'); });
  server.registerTool('fixture_protocol', {}, async () => {
    throw new McpError(ErrorCode.UrlElicitationRequired, 'private elicitation', { elicitations: [] });
  });
  const disabled = server.registerTool('fixture_disabled', {}, async () => ({ content: [] }));
  disabled.disable();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'usage-client', version: '1.0.0' });
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  const call = (name, args = {}, context = {}) => requestContext.run({
    authSource: 'user', usagePrincipalUid: 'user-1',
    principalAccess: { allowedSet: new Set(['apalmer']) }, ...context,
  }, () => client.callTool({ name, arguments: args }));
  return { server, client, records, warnings, call };
}

test('exact server flag defaults off; discovery and disabled collection never write', async (t) => {
  const previous = process.env.AEP_LAB_MCP_USAGE_ENABLED;
  t.after(() => {
    if (previous === undefined) delete process.env.AEP_LAB_MCP_USAGE_ENABLED;
    else process.env.AEP_LAB_MCP_USAGE_ENABLED = previous;
  });
  for (const value of ['', 'false', 'TRUE', '1']) {
    process.env.AEP_LAB_MCP_USAGE_ENABLED = value;
    assert.equal(usageCollectionEnabled(), false);
  }
  process.env.AEP_LAB_MCP_USAGE_ENABLED = 'true';
  assert.equal(usageCollectionEnabled(), true);
  const f = await fixture(t, { enabled: () => false });
  await f.client.listTools();
  await f.call('fixture_result', { sandbox: 'apalmer' });
  assert.equal(f.records.length, 0);
});

test('real SDK dispatch records once, with safe actor/timing only; ordinary result is not business success', async (t) => {
  const f = await fixture(t);
  await f.client.listTools();
  assert.equal(f.records.length, 0);
  const result = await f.call('fixture_result', { sandbox: 'apalmer', email: 'private@example.com' }, {
    keyId: 'private-key-id', mcpApiKey: 'private-api-key', sessionId: 'private-session',
    imsAuthHeaders: { Authorization: 'private-token' },
  });
  assert.match(result.content[0].text, /result-secret/);
  assert.equal(f.records.length, 1);
  const record = f.records[0];
  assert.equal(record.outcome, 'result');
  assert.equal(record.protocolResponse, 'result');
  assert.equal(record.handlerStarted, true);
  assert.equal(record.principalUid, 'user-1');
  assert.equal(record.requestedSandbox, 'apalmer');
  assert.equal(record.endpoint, '/mcp/profile');
  assert.match(record.id, /^[a-f0-9-]{36}$/);
  assert.ok(record.durationMs >= 0 && Number.isFinite(record.durationMs));
  assert.ok(record.timestamp >= record.startedAt);
  assert.equal(record.expiresAt.getTime() - Date.parse(record.timestamp), 90 * 86400000);
  assert.doesNotMatch(JSON.stringify(record), /private|result-secret|ok":false/);
});

test('SDK validation, unknown/disabled tools, thrown handlers and protocol errors remain distinct', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('fixture_error')).isError, true);
  assert.equal((await f.call('fixture_throw')).isError, true);
  assert.equal((await f.call('fixture_result', { sandbox: 1 })).isError, true);
  assert.equal((await f.call('fixture_disabled')).isError, true);
  assert.equal((await f.call('private@example.com')).isError, true);
  await assert.rejects(f.call('fixture_protocol'));
  assert.deepEqual(f.records.map((record) => record.outcome),
    ['tool_error', 'tool_error', 'rejected', 'rejected', 'rejected', 'protocol_error']);
  assert.deepEqual(f.records.map((record) => record.handlerStarted), [true, true, false, false, false, true]);
  assert.equal(f.records[4].tool, null);
  assert.equal(f.records[5].protocolResponse, 'error');
  assert.doesNotMatch(JSON.stringify(f.records), /private/);
});

test('shared/unknown credentials cannot claim actors; IMS uses only unambiguous enrollment UID', async (t) => {
  const f = await fixture(t);
  await f.call('fixture_result', { sandbox: 'not-allowed' }, { authSource: 'env', usagePrincipalUid: 'user-1' });
  await f.call('fixture_result', { sandbox: 'apalmer' }, { authSource: 'ims', usagePrincipalUid: null, principalUid: 'claimed' });
  await f.call('fixture_result', { sandbox: 'apalmer' }, { authSource: 'ims', usagePrincipalUid: 'enrolled-user' });
  await f.call('fixture_result', { sandbox: 'apalmer' }, { authSource: 'unknown', usagePrincipalUid: 'user-1' });
  assert.deepEqual(f.records.map((record) => record.principalUid), [null, null, 'enrolled-user', null]);
  assert.equal(f.records[0].requestedSandbox, null);
});

test('concurrent and dynamically loaded tools retain the request-local actor', async (t) => {
  const f = await fixture(t);
  f.server.registerTool('fixture_dynamic', {}, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { content: [] };
  });
  await Promise.all([
    f.call('fixture_dynamic', {}, { usagePrincipalUid: 'first' }),
    f.call('fixture_dynamic', {}, { usagePrincipalUid: 'second' }),
  ]);
  assert.deepEqual(f.records.map((record) => record.principalUid).sort(), ['first', 'second']);
  assert.ok(f.records.every((record) => record.tool === 'fixture_dynamic' && record.handlerStarted));
  assert.equal(new Set(f.records.map((record) => record.id)).size, 2);
});

test('statistics storage failure is observable, sanitized and never changes SDK responses', async (t) => {
  const f = await fixture(t, { write: async () => { throw new Error('private database token'); } });
  assert.equal((await f.call('fixture_error')).isError, true);
  assert.equal((await f.call('fixture_result', { sandbox: 'apalmer' })).isError, undefined);
  await assert.rejects(f.call('fixture_protocol'));
  assert.equal(f.warnings.length, 3);
  assert.ok(f.warnings.every((message) => JSON.parse(message).code === 'USAGE_PERSISTENCE_FAILED'));
  assert.doesNotMatch(JSON.stringify(f.warnings), /private|token/);
});

test('stalled persistence has a bounded wait and an explicit sanitized timeout', async (t) => {
  const f = await fixture(t, { write: () => new Promise(() => {}), writeTimeoutMs: 5 });
  const started = Date.now();
  assert.equal((await f.call('fixture_result', { sandbox: 'apalmer' })).isError, undefined);
  assert.ok(Date.now() - started < 2000);
  assert.equal(JSON.parse(f.warnings[0]).code, 'USAGE_PERSISTENCE_TIMEOUT');
});

test('malformed protocol envelopes rejected before SDK dispatch do not become tool invocations', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.client.request({ method: 'tools/call', params: { name: 42 } }, CallToolResultSchema));
  assert.equal(f.records.length, 0);
});

test('request cancellation is recorded without claiming no side effects or job completion', async (t) => {
  let recordWritten;
  const written = new Promise((resolve) => { recordWritten = resolve; });
  const f = await fixture(t, { write: async (_id, record) => recordWritten(record) });
  let handlerStarted;
  let releaseHandler;
  const started = new Promise((resolve) => { handlerStarted = resolve; });
  const release = new Promise((resolve) => { releaseHandler = resolve; });
  f.server.registerTool('fixture_cancel', {}, async () => {
    handlerStarted();
    await release;
    return { content: [] };
  });
  const controller = new AbortController();
  const pending = f.client.callTool({ name: 'fixture_cancel', arguments: {} },
    CallToolResultSchema, { signal: controller.signal });
  const rejected = assert.rejects(pending);
  await started;
  controller.abort();
  await rejected;
  releaseHandler();
  const record = await written;
  assert.equal(record.outcome, 'cancelled');
  assert.equal(record.handlerStarted, true);
});
