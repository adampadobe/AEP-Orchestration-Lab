import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '..', '..', 'coworker-marketplace', 'aep-lab');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const expectedEndpoints = new Map([
  ['aep-lab-entry', '/mcp/entry'],
  ['aep-lab-profiles', '/mcp/profile'],
  ['aep-lab-demo-prep', '/mcp/demo-prep'],
  ['aep-lab-pdf-prep', '/mcp/pdf'],
  ['aep-lab-audiences', '/mcp/audiences'],
  ['aep-lab-decisioning', '/mcp/decisioning'],
  ['aep-lab-ajo-cleanup', '/mcp/ajo-cleanup'],
  ['aep-lab-command-centre', '/mcp/command-centre'],
  ['aep-lab-weather', '/mcp/weather'],
]);

test('Coworker plugin manifest explicitly preserves the workflow skill', async () => {
  const manifest = await readJson(join(pluginRoot, '.claude-plugin', 'plugin.json'));

  assert.equal(manifest.name, 'aep-lab');
  assert.deepEqual(manifest.skills, ['./skills/aep-lab-profile-mcp/']);
  assert.equal(manifest.mcpServers, undefined);
});

test('Coworker MCP manifest uses Integration schema for all focused endpoints', async () => {
  const config = await readJson(join(pluginRoot, '.mcp.json'));
  const providers = config.auth_providers;
  const servers = config.mcp_servers?.servers;

  assert.ok(Array.isArray(providers));
  assert.deepEqual(providers, [
    {
      name: 'aep-lab-key-passthrough',
      provider: {
        type: 'passthrough',
        headers: { 'x-aep-lab-mcp-key': 'x-aep-lab-mcp-key' },
      },
    },
  ]);
  assert.ok(Array.isArray(servers));
  assert.equal(servers.length, expectedEndpoints.size);

  for (const server of servers) {
    const endpoint = expectedEndpoints.get(server.name);
    assert.ok(endpoint, `unexpected Coworker Integration ${server.name}`);
    assert.equal(
      server.source,
      `https://aep-lab-profile-mcp-109406613852.us-central1.run.app${endpoint}`,
    );
    assert.equal(server.transport, 'streamable_http');
    assert.equal(server.auth, 'aep-lab-key-passthrough');
    assert.ok(Number.isInteger(server.tool_timeout_seconds));
    expectedEndpoints.delete(server.name);
  }

  assert.deepEqual([...expectedEndpoints], []);
});
