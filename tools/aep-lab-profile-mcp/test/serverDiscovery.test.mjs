import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('HTTP discovery delivers tool changes over an authenticated same-session stream', { timeout: 20_000 }, async (t) => {
  const key = randomUUID();
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env, HOST: '127.0.0.1', PORT: '0',
      AEP_LAB_MCP_API_KEY: key, AEP_LAB_MCP_FIRESTORE: 'off', AEP_LAB_MCP_USAGE_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stopped = once(child, 'exit');
  const lines = createInterface({ input: child.stdout });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const streamAbort = new AbortController();
  t.after(async () => {
    streamAbort.abort();
    lines.close();
    child.kill();
    await stopped;
  });
  const origin = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(new Error(`Local MCP server exited: ${stderr}`)));
    lines.on('line', (line) => {
      if (!line.startsWith('{')) return;
      const event = JSON.parse(line);
      if (event.type === 'aep-lab-profile-mcp-start') resolve(`http://127.0.0.1:${event.port}`);
    });
    t.signal.addEventListener('abort', () => reject(new Error('Server startup timed out')), { once: true });
  });
  let id = 0;
  const headers = {
    'X-AEP-Lab-Mcp-Key': key, 'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  async function post(path, method, params, session) {
    return fetch(`${origin}${path}`, {
      method: 'POST', headers: { ...headers, ...(session ? { 'mcp-session-id': session } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: t.signal,
    });
  }
  const init = await post('/mcp/entry', 'initialize', {
    protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: { name: 'offline-discovery-test', version: '1' },
  });
  assert.equal(init.status, 200);
  assert.equal((await init.json()).result.capabilities.tools.listChanged, true);
  const session = init.headers.get('mcp-session-id');
  assert.ok(session);
  await fetch(`${origin}/mcp/entry`, {
    method: 'POST', headers: { ...headers, 'mcp-session-id': session },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), signal: t.signal,
  });
  assert.equal((await (await post('/mcp/entry', 'tools/list', {}, session)).json()).result.tools.length, 5);
  const streamHeaders = { ...headers, Accept: 'text/event-stream', 'mcp-session-id': session };
  assert.equal((await fetch(`${origin}/mcp/entry`, { headers: { Accept: 'text/event-stream' } })).status, 401);
  assert.equal((await fetch(`${origin}/mcp/entry`, { headers: { ...streamHeaders, 'mcp-session-id': 'unknown' } })).status, 404);
  assert.equal((await fetch(`${origin}/mcp/profile`, { headers: streamHeaders })).status, 404);
  assert.equal((await post('/mcp/profile', 'tools/list', {}, session)).status, 400);
  const stream = await fetch(`${origin}/mcp/entry`, { headers: streamHeaders, signal: streamAbort.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  const notification = (async () => {
    const decoder = new TextDecoder();
    let received = '';
    while (!received.includes('notifications/tools/list_changed')) {
      const { value, done } = await reader.read();
      assert.equal(done, false, 'Notification stream closed before announcing new tools');
      received += decoder.decode(value, { stream: true });
    }
    return received;
  })();
  const load = await post('/mcp/entry', 'tools/call', {
    name: 'lab_load_toolset', arguments: { category: 'platform-cleanup' },
  }, session);
  assert.equal(JSON.parse((await load.json()).result.content[0].text).ok, true);
  assert.match(await notification, /notifications\/tools\/list_changed/);
  const names = (await (await post('/mcp/entry', 'tools/list', {}, session)).json()).result.tools.map((tool) => tool.name);
  assert.equal(names.length, 8);
  for (const name of ['lab_platform_asset_list', 'lab_platform_asset_audit', 'lab_platform_asset_delete']) {
    assert.ok(names.includes(name));
  }
  streamAbort.abort();
  const full = await post('/mcp', 'initialize', {
    protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: { name: 'offline-static-discovery-test', version: '1' },
  });
  await full.json();
  const fullNames = (await (await post('/mcp', 'tools/list', {}, full.headers.get('mcp-session-id'))).json())
    .result.tools.map((tool) => tool.name);
  for (const name of names.filter((name) => name.startsWith('lab_platform_asset_'))) {
    assert.ok(fullNames.includes(name), 'Full endpoint must expose cleanup at initialization');
  }
});
