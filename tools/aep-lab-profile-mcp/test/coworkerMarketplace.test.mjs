import assert from 'node:assert/strict';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as registrations from '../src/tools/index.mjs';
import { listMcpContexts } from '../src/framework/mcpContextGuide.mjs';

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
  ['aep-lab-geo-insights', '/mcp/geo-insights'],
  ['aep-lab-commerce', '/mcp/commerce'],
  ['aep-lab-commerce-optimizer', '/mcp/commerce-optimizer'],
  ['aep-lab-firefly', '/mcp/firefly'],
  ['aep-lab-creativity', '/mcp/creativity'],
  ['aep-lab-adobe-capabilities', '/mcp/adobe-capabilities'],
  ['aep-lab-measurement-quality', '/mcp/measurement-quality'],
  ['aep-lab-figma', '/mcp/figma'],
]);

const coworkerNames = new Map([
  ['aep-lab-general', 'lab-all'],
  ['aep-lab-decisioning', 'lab-dps'],
  ['aep-lab-commerce-optimizer', 'lab-aco'],
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

  const remainingEndpoints = new Map([...expectedEndpoints].map(([name, endpoint]) => [
    coworkerNames.get(name) ?? name, endpoint,
  ]));
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

test('Coworker connection prefixes keep every catalog tool within the 64-character qualified-name budget', async () => {
  const config = await readJson(join(pluginRoot, '.mcp.json'));
  const registrars = new Map([
    ['/mcp', registrations.registerProfileTools],
    ['/mcp/entry', registrations.registerFocusedMcpGuideTools],
    ['/mcp/profile', registrations.registerFocusedProfileTools],
    ['/mcp/demo-prep', registrations.registerFocusedDemoPrepTools],
    ['/mcp/pdf', registrations.registerFocusedPdfTools],
    ['/mcp/audiences', registrations.registerFocusedAudienceTools],
    ['/mcp/decisioning', registrations.registerFocusedDecisioningTools],
    ['/mcp/ajo-cleanup', registrations.registerFocusedAjoCleanupTools],
    ['/mcp/command-centre', registrations.registerFocusedCommandCentreTools],
    ['/mcp/weather', registrations.registerFocusedWeatherTools],
    ['/mcp/geo-insights', registrations.registerFocusedGeoInsightsTools],
    ['/mcp/commerce', registrations.registerFocusedCommerceTools],
    ['/mcp/commerce-optimizer', registrations.registerFocusedCommerceOptimizerTools],
    ['/mcp/firefly', registrations.registerFocusedFireflyTools],
    ['/mcp/creativity', registrations.registerFocusedCreativityTools],
    ['/mcp/adobe-capabilities', registrations.registerFocusedAdobeCapabilityTools],
    ['/mcp/measurement-quality', registrations.registerFocusedMeasurementQualityTools],
    ['/mcp/figma', registrations.registerFocusedFigmaTools],
  ]);
  const contexts = listMcpContexts({ includeAdobe: false });
  const reportedOmissions = new Map([
    ['aep-lab-general', ['lab_decisioning_attach_offer_eligibility_preview']],
    ['aep-lab-decisioning', ['lab_decisioning_attach_offer_eligibility_preview']],
    ['aep-lab-commerce-optimizer', [
      'commerce_optimizer_attribute_metadata',
      'commerce_optimizer_ingestion_change_preview',
      'commerce_optimizer_ingestion_change_apply',
      'commerce_optimizer_ingestion_delete_audit',
      'commerce_optimizer_ingestion_delete_apply',
    ]],
  ]);
  for (const server of config.mcp_servers.servers) {
    const context = contexts.find((entry) => entry.url === server.source);
    assert.ok(context, server.source);
    assert.equal(server.name, context.coworkerConnectionName ?? context.id);
    const register = registrars.get(new URL(server.source).pathname);
    assert.equal(typeof register, 'function', server.source);
    const names = [];
    register({ registerTool: (name) => names.push(name) });
    assert.equal(names.length, context.toolCount, server.name);
    assert.equal(new Set(names).size, names.length, server.name);
    if (reportedOmissions.has(context.id)) {
      assert.deepEqual(
        names.filter((name) => `${context.id}__${name}`.length > 64).sort(),
        [...reportedOmissions.get(context.id)].sort(),
        `${context.id}: old-prefix overflows match the reported missing tools exactly`,
      );
    }
    for (const name of names) {
      const qualifiedName = `${server.name}__${name}`;
      assert.ok(qualifiedName.length <= 64, `${qualifiedName}: ${qualifiedName.length} > 64`);
      // Leave room for an additional mcp__ namespace on the renamed connections.
      if (coworkerNames.has(context.id)) {
        assert.ok(`mcp__${qualifiedName}`.length <= 64, qualifiedName);
      }
    }
  }
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

test('Claude and Coworker packages expose the same eighteen endpoints with runtime-specific names and auth', async () => {
  const coworker = await readJson(join(pluginRoot, '.mcp.json'));
  const claude = await readJson(join(claudePluginRoot, '.mcp.json'));
  const coworkerServers = new Map(coworker.mcp_servers.servers.map((server) => [server.name, server]));
  const claudeServers = claude.mcpServers;

  assert.equal(coworkerServers.size, expectedEndpoints.size);
  assert.equal(Object.keys(claudeServers).length, expectedEndpoints.size);

  for (const [name, endpoint] of expectedEndpoints) {
    const coworkerServer = coworkerServers.get(coworkerNames.get(name) ?? name);
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
