import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function fixture(t) {
  const key = randomUUID();
  const requests = [];
  let target;
  let apiCalls = 0;
  const proxy = createServer((req, res) => {
    if (!req.url.startsWith('/mcp')) {
      apiCalls++;
      res.writeHead(500).end('Unexpected Lab API request in offline transport test');
      return;
    }
    const record = { method: req.method, session: req.headers['mcp-session-id'], body: '' };
    requests.push(record);
    req.on('data', (chunk) => { record.body += chunk; });
    const upstream = request(new URL(req.url, target), {
      method: req.method, headers: { ...req.headers, host: new URL(target).host },
    }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  t.after(async () => {
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
    assert.equal(apiCalls, 0, 'Transport/discovery tests must never reach a Lab backend');
  });

  async function start() {
    const child = spawn(process.execPath, ['src/server.mjs'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        ...process.env, HOST: '127.0.0.1', PORT: '0',
        AEP_LAB_MCP_API_KEY: key, AEP_LAB_MCP_FIRESTORE: 'off',
        AEP_LAB_MCP_USAGE_ENABLED: 'false', AEP_LAB_MCP_BATCH_STORE: 'memory',
        AEP_LAB_API_ORIGIN: origin, AEP_LAB_FUNCTIONS_ORIGIN: origin,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stopped = once(child, 'exit');
    const lines = createInterface({ input: child.stdout });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    let stopping;
    function stop() {
      stopping ??= (async () => {
        lines.close();
        if (child.exitCode === null && child.signalCode === null) child.kill();
        await stopped;
      })();
      return stopping;
    }
    t.after(stop);
    const address = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error(`Local MCP server exited: ${stderr}`)));
      lines.on('line', (line) => {
        if (!line.startsWith('{')) return;
        const event = JSON.parse(line);
        if (event.type === 'aep-lab-profile-mcp-start') resolve(`http://127.0.0.1:${event.port}`);
      });
      t.signal.addEventListener('abort', () => reject(new Error('Server startup timed out')), { once: true });
    });
    assert.equal((await fetch(`${address}/health`, { signal: t.signal })).status, 200);
    return { address, stop };
  }

  async function connect(path = '/mcp/entry') {
    const transport = new StreamableHTTPClientTransport(new URL(path, origin), {
      requestInit: { headers: { 'X-AEP-Lab-Mcp-Key': key } },
      reconnectionOptions: { initialReconnectionDelay: 10, maxReconnectionDelay: 10, maxRetries: 0 },
    });
    const client = new Client({ name: 'offline-session-recovery', version: '1' });
    t.after(() => client.close());
    await client.connect(transport);
    return { client, transport };
  }

  return { start, connect, requests, key, routeTo(address) { target = address; } };
}

async function loadProfile(client) {
  const loaded = await client.callTool({ name: 'lab_load_toolset', arguments: { category: 'profile' } });
  assert.equal(JSON.parse(loaded.content[0].text).ok, true);
  const { tools } = await client.listTools();
  const preflight = tools.find((tool) => tool.name === 'lab_preflight_profile_generate');
  assert.equal(preflight.inputSchema.properties.refresh.type, 'boolean');
  assert.equal(preflight.inputSchema.required?.includes('refresh') ?? false, false);
  return preflight.inputSchema;
}

test('real SDK requires explicit recovery after process restart and never replays a stale mutation',
  { timeout: 30_000 }, async (t) => {
    const f = await fixture(t);
    const first = await f.start();
    f.routeTo(first.address);
    const { client, transport } = await f.connect();
    const session = transport.sessionId;
    const schema = await loadProfile(client);
    await first.stop();
    const replacement = await f.start();
    f.routeTo(replacement.address);

    const before = f.requests.length;
    await assert.rejects(client.callTool({
      name: 'lab_generate_profile',
      arguments: { target: 'aep', sandbox: 'apalmer', industry: 'travel' },
    }), (error) => error.code === 404 && /Do not automatically replay mutating tool calls/.test(error.message));
    assert.equal(transport.sessionId, session, 'SDK 1.x surfaces 404; it does not clear or reinitialize the session');
    const posts = f.requests.slice(before).filter((entry) => entry.method === 'POST');
    assert.equal(posts.length, 1, 'No hidden initialize or replay after a rejected mutation');
    assert.equal(JSON.parse(posts[0].body).method, 'tools/call');

    await client.close();
    const recovered = await f.connect();
    assert.notEqual(recovered.transport.sessionId, session);
    assert.equal((await recovered.client.listTools()).tools.length, 5, 'Dynamic toolsets are session-local');
    const access = await recovered.client.callTool({ name: 'lab_mcp_access_info', arguments: {} });
    assert.equal(JSON.parse(access.content[0].text).ok, true);
    assert.deepEqual(await loadProfile(recovered.client), schema, 'Explicit discovery restores the refresh contract');
    for (const path of ['/mcp/profile', '/mcp']) {
      const focused = await f.connect(path);
      const preflight = (await focused.client.listTools()).tools
        .find((tool) => tool.name === 'lab_preflight_profile_generate');
      assert.deepEqual(preflight.inputSchema, schema, `${path} must expose the same preflight schema`);
    }
  });

test('routing to another process rejects an unknown session without adopting it or changing its owner endpoint',
  { timeout: 30_000 }, async (t) => {
    const f = await fixture(t);
    const first = await f.start();
    const second = await f.start();
    f.routeTo(first.address);
    const { client, transport } = await f.connect();
    await loadProfile(client);
    f.routeTo(second.address);
    await assert.rejects(client.listTools(), (error) => error.code === 404);
    const other = await f.connect();
    assert.notEqual(other.transport.sessionId, transport.sessionId);
    assert.equal((await other.client.listTools()).tools.length, 5);
    f.routeTo(first.address);
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === 'lab_preflight_profile_generate'),
      'Original process retains its own initialized, dynamically loaded session');
    const headers = {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      'mcp-session-id': transport.sessionId,
    };
    const unauthorized = await fetch(new URL('/mcp/profile', first.address), {
      method: 'POST',
      headers: {
        ...headers, 'X-AEP-Lab-Mcp-Key': 'invalid-key',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: t.signal,
    });
    assert.equal(unauthorized.status, 403, 'Session knowledge never bypasses authentication');
    const wrongEndpoint = await fetch(new URL('/mcp/profile', first.address), {
      method: 'POST', headers: { ...headers, 'X-AEP-Lab-Mcp-Key': f.key },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal: t.signal,
    });
    assert.equal(wrongEndpoint.status, 400, 'A valid session cannot cross endpoint boundaries');
  });
