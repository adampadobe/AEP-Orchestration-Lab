import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import test from 'node:test';

test('HTTP diagnostics correlate authentication and parser failures without credentials', { timeout: 20_000 }, async () => {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, [new URL('../src/server.mjs', import.meta.url).pathname], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      AEP_LAB_MCP_API_KEY: 'local-request-logging-test-key',
      AEP_LAB_MCP_FIRESTORE: 'off',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = once(child, 'exit');
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (output.includes('"type":"aep-lab-profile-mcp-start"')) {
        ready = true;
        break;
      }
      assert.equal(child.exitCode, null, 'server must stay running during startup');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, 'server must become ready');
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const rejected = await fetch(`${base}/mcp/profile`, { method: 'POST' });
    assert.equal(rejected.status, 401);
    const requestId = rejected.headers.get('x-aep-lab-request-id');
    assert.match(requestId, /^[a-f0-9-]{36}$/);
    const deniedDelete = await fetch(`${base}/mcp/profile`, { method: 'DELETE' });
    assert.equal(deniedDelete.status, 401);
    assert.equal(typeof (await deniedDelete.json()).error, 'string');
    const malformed = await fetch(`${base}/mcp/profile`, {
      method: 'POST',
      headers: {
        'X-AEP-Lab-Mcp-Key': 'local-request-logging-test-key',
        'Content-Type': 'application/json',
      },
      body: '{',
    });
    assert.equal(malformed.status, 400);
    await malformed.text();
    child.kill('SIGTERM');
    await exited;
    const rows = output.split('\n').filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line))
      .filter((row) => row.type === 'aep-lab-mcp-request');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].requestId, requestId);
    assert.equal(rows[0].authSource, 'unverified');
    assert.equal(rows[0].httpStatus, 401);
    assert.equal(rows[0].endpoint, '/mcp/profile');
    assert.equal(rows[0].principalEmailHash, undefined);
    assert.equal(rows[2].httpStatus, 400);
    assert.equal(rows[2].authSource, 'env');
    assert.ok(output.includes(`"requestId":"${requestId}"`));
    assert.ok(output.includes('missing-or-malformed-bearer'));
    assert.ok(!output.includes('local-request-logging-test-key'));
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await exited;
    }
  }
});
