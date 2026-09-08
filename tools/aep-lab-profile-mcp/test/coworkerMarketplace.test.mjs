import assert from 'node:assert/strict';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '..', '..', 'coworker-marketplace', 'aep-lab');
const repoRoot = join(here, '..', '..', '..');
const claudePluginRoot = join(repoRoot, 'tools', 'claude-marketplace', 'aep-lab');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const expectedEndpoints = new Map([
  ['aep-lab-entry', '/mcp/entry'],
  ['aep-lab-general', '/mcp'],
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

test('Coworker MCP manifest uses Integration schema for General and all focused endpoints', async () => {
  const config = await readJson(join(pluginRoot, '.mcp.json'));
  const providers = config.auth_providers;
  const servers = config.mcp_servers?.servers;

  assert.ok(Array.isArray(providers));
  assert.deepEqual(providers, [
    {
      name: 'aep-lab-ims-passthrough',
      provider: {
        type: 'passthrough',
        headers: {
          authorization: 'authorization',
          'x-gw-ims-org-id': 'x-gw-ims-org-id',
          'x-gw-ims-user-id': 'x-gw-ims-user-id',
          'x-gw-ims-email': 'x-gw-ims-email',
          'x-gw-ims-first-name': 'x-gw-ims-first-name',
          'x-gw-ims-last-name': 'x-gw-ims-last-name',
          'x-gw-ims-display-name': 'x-gw-ims-display-name',
        },
      },
    },
  ]);
  assert.ok(Array.isArray(servers));
  assert.equal(servers.length, expectedEndpoints.size);

  const remainingEndpoints = new Map(expectedEndpoints);
  for (const server of servers) {
    const endpoint = remainingEndpoints.get(server.name);
    assert.ok(endpoint, `unexpected Coworker Integration ${server.name}`);
    assert.equal(
      server.source,
      `https://aep-lab-profile-mcp-109406613852.us-central1.run.app${endpoint}`,
    );
    assert.equal(server.transport, 'streamable_http');
    assert.equal(server.auth, 'aep-lab-ims-passthrough');
    assert.ok(Number.isInteger(server.tool_timeout_seconds));
    remainingEndpoints.delete(server.name);
  }

  assert.deepEqual([...remainingEndpoints], []);
});

test('repository root exposes a Claude marketplace with a runtime-specific plugin', async () => {
  const marketplace = await readJson(join(repoRoot, '.claude-plugin', 'marketplace.json'));

  assert.equal(marketplace.name, 'aep-orchestration-lab');
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, 'aep-lab');
  assert.equal(marketplace.plugins[0].source, './tools/claude-marketplace/aep-lab');
});

test('optional EDS source does not block recursive Claude marketplace clones', async () => {
  const gitmodules = await readFile(join(repoRoot, '.gitmodules'), 'utf8');
  const packageJson = await readJson(join(repoRoot, 'package.json'));

  assert.match(gitmodules, /\[submodule "tools\/eds-quickstart"\][\s\S]*?\n\s*update = none(?:\n|$)/);
  assert.match(
    packageJson.scripts?.['build:eds-quickstart'] ?? '',
    /submodule\.tools\/eds-quickstart\.update=checkout submodule update --init tools\/eds-quickstart/,
  );
});

test('Claude plugin prompts securely for one Portal key and preserves the workflow skill', async () => {
  const manifest = await readJson(join(claudePluginRoot, '.claude-plugin', 'plugin.json'));
  const keyConfig = manifest.userConfig?.aep_lab_mcp_key;

  assert.equal(manifest.name, 'aep-lab');
  assert.deepEqual(manifest.skills, ['./skills/aep-lab-profile-mcp/']);
  assert.equal(manifest.mcpServers, undefined);
  assert.equal(keyConfig?.type, 'string');
  assert.equal(keyConfig?.sensitive, true);
  assert.equal(keyConfig?.required, true);

  const skillLink = join(claudePluginRoot, 'skills', 'aep-lab-profile-mcp');
  assert.equal((await lstat(skillLink)).isSymbolicLink(), true);
  const target = await realpath(skillLink);
  assert.equal(relative(repoRoot, target).startsWith('..'), false);
  assert.equal(target, join(pluginRoot, 'skills', 'aep-lab-profile-mcp'));
});

test('Claude and Coworker packages expose the same ten endpoints with runtime-specific auth', async () => {
  const coworker = await readJson(join(pluginRoot, '.mcp.json'));
  const claude = await readJson(join(claudePluginRoot, '.mcp.json'));
  const coworkerServers = new Map(coworker.mcp_servers.servers.map((server) => [server.name, server]));
  const claudeServers = claude.mcpServers;

  assert.equal(coworkerServers.size, expectedEndpoints.size);
  assert.equal(Object.keys(claudeServers).length, expectedEndpoints.size);

  for (const [name, endpoint] of expectedEndpoints) {
    const coworkerServer = coworkerServers.get(name);
    const claudeServer = claudeServers[name];
    const url = `https://aep-lab-profile-mcp-109406613852.us-central1.run.app${endpoint}`;

    assert.equal(coworkerServer?.source, url);
    assert.equal(coworkerServer?.auth, 'aep-lab-ims-passthrough');
    assert.equal(claudeServer?.type, 'http');
    assert.equal(claudeServer?.url, url);
    assert.deepEqual(claudeServer?.headers, {
      'X-AEP-Lab-Mcp-Key': '${user_config.aep_lab_mcp_key}',
    });
    assert.equal(claudeServer?.timeout, coworkerServer.tool_timeout_seconds * 1000);
  }
});
