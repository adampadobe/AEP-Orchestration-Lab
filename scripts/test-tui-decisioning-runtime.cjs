const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..', 'web', 'profile-viewer');
const source = fs.readFileSync(path.join(root, 'tui-decisioning-runtime.js'), 'utf8');

function fixture(options = {}) {
  const calls = [];
  const browserEcid = '12345678901234567890123456789012345678';
  const propositions = [{ id: 'hero', scope: 'web://example.test/#hero-banner', items: [{ id: 'image' }] }];
  const alloy = async (command, payload) => {
    calls.push({ command, payload });
    if (command === 'getIdentity') return { identity: { ECID: options.browserEcid ?? browserEcid } };
    if (command === 'sendEvent') return { propositions };
    throw new Error('Unexpected SDK command: ' + command);
  };
  const context = {
    console: { log() {} },
    URL, URLSearchParams, setTimeout,
    document: { title: 'TUI', getElementById: () => null },
    location: { href: 'https://example.test/tui-decisioning-demo.html' },
    dispatchEvent() {}, addEventListener() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    fetch: async () => ({
      ok: !options.lookupFailure, status: options.lookupFailure ? 503 : 200,
      json: async () => options.lookupFailure ? { error: 'Unavailable' } : { found: true, rows: [] },
    }),
    alloy,
    CdEdgeMounts: {
      buildIdentityMap: () => ({ Email: [{ id: 'fixture@example.test', primary: true }] }),
      buildSurfacesFromPageUrl: () => ['web://example.test/#hero-banner'],
    },
    DemoLabEdgeConfig: { edgeConfigOverrides: () => ({ edgeConfigOverrides: { datastreamId: 'fixture' } }) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const runtime = context.DecisioningProfileRuntime;
  runtime.init({
    autoRunDecisioning: false,
    enabled: () => options.enabled !== false,
    getIdentifierValue: () => options.identifier || 'fixture@example.test',
    getNamespace: () => options.namespace || 'email',
    getSandboxName: () => 'kirkham',
  });
  return { runtime, calls, alloy, browserEcid, propositions };
}

test('only TUI opts into its compatible runtime; other demos retain the shared runtime', async () => {
  const env = fs.readFileSync(path.join(root, 'shared', 'env-bar.js'), 'utf8');
  const start = env.indexOf('function loadDecisioningScripts(');
  const end = env.indexOf('\n  /**', start);
  assert.ok(start > 0 && end > start);
  const chain = [];
  const context = {
    state: {}, isFullShellMode: () => true, isDecisioningFeatureEnabled: () => true,
    assetUrl: (file) => file, loadScript: async (src) => chain.push(src), log() {},
  };
  vm.createContext(context);
  vm.runInContext(env.slice(start, end), context);
  await context.loadDecisioningScripts({ assets: {} }, {});
  assert.ok(chain.includes('decisioning-profile-module/decisioning-profile-runtime.js'));
  chain.length = 0;
  const html = fs.readFileSync(path.join(root, 'tui-decisioning-demo.html'), 'utf8');
  const runtimeScript = html.match(/runtimeScript: '([^']+)'/)[1];
  await context.loadDecisioningScripts({ assets: {} }, { decisioning: { runtimeScript } });
  assert.ok(chain.includes('tui-decisioning-runtime.js'));
  assert.ok(!chain.includes('decisioning-profile-module/decisioning-profile-runtime.js'));
  for (const file of fs.readdirSync(root).filter(file => file.endsWith('.html') && file !== 'tui-decisioning-demo.html')) {
    assert.ok(!fs.readFileSync(path.join(root, file), 'utf8').includes("runtimeScript: 'tui-decisioning-runtime.js'"), file);
  }
});

test('manual decisions capture the original SDK, browser identity and datastream without rendering or premature display events', async () => {
  const f = fixture();
  assert.equal(f.runtime.supportsManualDisplay, true);
  assert.equal(f.runtime.supportsCapturedEventContext, true);
  assert.equal(await f.runtime.runProfileLookup({ skipHydrate: true, throwOnError: true }), true);
  const result = await f.runtime.runContentDecision({
    manualDisplay: true, useBrowserEcid: true, eventTenantNamespace: '_demoemea',
  });
  assert.deepEqual(f.calls.map(call => call.command), ['getIdentity', 'sendEvent']);
  const payload = f.calls[1].payload;
  assert.equal(payload.renderDecisions, false);
  assert.equal(payload.personalization.sendDisplayEvent, false);
  assert.equal(payload.xdm.identityMap.ECID[0].id, f.browserEcid);
  assert.equal(payload.xdm._demoemea.identification.core.ecid, f.browserEcid);
  assert.equal(payload.edgeConfigOverrides.datastreamId, 'fixture');
  assert.equal(result.manualDisplay.alloy, f.alloy);
  assert.equal(result.manualDisplay.identityMap, payload.xdm.identityMap);
  assert.equal(result.manualDisplay.eventXdm._demoemea, payload.xdm._demoemea);
  assert.equal(result.propositions, f.propositions);
});

test('missing browser identity or a conflicting selected ECID blocks sending a decision', async () => {
  for (const options of [{ browserEcid: '' }, { namespace: 'ecid', identifier: '99999999999999999999' }]) {
    const f = fixture(options);
    await f.runtime.runProfileLookup({ throwOnError: true });
    await assert.rejects(f.runtime.runContentDecision({
      manualDisplay: true, useBrowserEcid: true, eventTenantNamespace: '_demoemea',
    }), /ECID/);
    assert.ok(!f.calls.some(call => call.command === 'sendEvent'));
  }
});

test('disabled decisioning and failed profile lookup surface errors and clear cached profiles', async () => {
  for (const options of [{ enabled: false }, { lookupFailure: true }]) {
    const f = fixture(options);
    await assert.rejects(f.runtime.runProfileLookup({ throwOnError: true }), /disabled|503/);
    assert.equal(f.runtime.getApi().getLastUpsClientData(), null);
    assert.equal(f.calls.length, 0);
  }
});
