const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..', 'web', 'profile-viewer');
const source = fs.readFileSync(path.join(root, 'tui-decisioning-runtime.js'), 'utf8');

test('TUI campaign attribution preserves campaign identity and separates CBE from preview modes', () => {
  const attribution = require(path.join(root, 'tui-decisioning-attribution.js'));
  const prefix = '_experience.decisioning.propositions.0.';
  const rows = [
    { path: prefix + 'scopeDetails.activity.id', value: 'campaign-fixture' },
    { path: prefix + 'scopeDetails.decisionProvider', value: 'CJM' },
    { path: prefix + 'scope', value: 'web://example.test/#hero-banner' },
  ];
  assert.deepEqual(attribution.details({ rows }), [{
    campaignId: 'campaign-fixture', campaignName: '', delivery: 'Code-based experience (CBE)',
  }]);
  for (const demo of ['tui', 'cp']) for (const [channel, label] of [['email', 'Email'], ['mobile', 'App'], ['web', 'Web']]) {
    assert.equal(attribution.preview({ rows: [{
      path: 'web.webPageDetails.URL', value: 'https://example.test/profile-viewer/' + demo + '-decisioning-demo.html?channel=' + channel,
    }] }), label);
  }
  assert.deepEqual(attribution.details({ rows: [] }), []);
  assert.equal(attribution.preview({ rows: [] }), '');
  assert.equal(attribution.preview({ rows: [{ path: 'web.webPageDetails.URL', value: 'invalid' }] }), '');
  assert.equal(attribution.details({ rows: [
    ...rows.filter(row => !row.path.endsWith('decisionProvider')),
    { path: prefix + 'scopeDetails.decisionProvider', value: 'TGT' },
  ] })[0].delivery, '');
});

test('departure-day edits and scenarios read, write and confirm daysToDeparture', () => {
  const model = require(path.join(root, 'tui-decisioning-model.js'));
  const profile = require(path.join(root, 'tui-decisioning-profile.js'));
  const fullPath = '_demoemea.airlineCustomer.daysToDeparture';
  const relativePath = 'airlineCustomer.daysToDeparture';
  assert.equal(model.fields.find(field => field.key === 'days').path, fullPath);
  const data = {
    rows: [{ path: fullPath, value: 30, valueType: 'number', industry: 'travel', writable: true }],
    industries: { travel: { writable: true, schemaId: 'fixture-schema' } },
  };
  assert.equal(profile.signals(data.rows).days, 30);
  assert.equal(profile.signals([
    { path: '_demoemea.travelReservations.flightReservations.daysToDeparture', value: 99, valueType: 'number' },
    ...data.rows,
  ]).days, 30);
  for (const days of [0, 365, ...model.scenarios.filter(scenario => 'days' in scenario.preset).map(scenario => scenario.preset.days)]) {
    const batch = profile.snapshots(data, { ...model.defaults, days }, ['days']);
    assert.deepEqual(batch.expected, { [relativePath]: days });
    assert.deepEqual(batch.snapshots[0].updates, [{ path: relativePath, value: days, valueType: 'number' }]);
    assert.deepEqual(profile.differences([{ path: fullPath, value: days, valueType: 'number' }], batch.expected), []);
  }
  assert.ok(!JSON.stringify(model.objectives).includes('daysUntilDeparture'));
  for (const file of ['tui-decisioning-demo.html', 'tui-decisioning-visualiser.html']) {
    assert.ok(fs.readFileSync(path.join(root, file), 'utf8').includes('tui-decisioning-model.js?v=20261110-airline-disruption'));
  }
});

test('decision item attribution uses only displayed event metadata, including original IDs', () => {
  const { items } = require(path.join(root, 'tui-decisioning-attribution.js'));
  for (const prefix of ['_experience.decisioning.propositions.0.', 'xdm._experience.decisioning.proposition.0.']) {
    const event = { eventType: 'decisioning.propositionDisplay', eventName: 'Not an offer name', rows: [
      { path: prefix + 'items.1.id', value: 'second-offer' },
      { path: prefix + 'items.0.id', value: 'actual-offer-id' },
      { path: prefix + 'items.0.name', value: 'Actual delivered item' },
      { path: prefix + 'items.0.itemSelection.selectionDetail.strategyID', value: 'actual-strategy-id' },
      { path: prefix + 'items.0.itemSelection.selectionDetail.strategyName', value: 'Actual delivered strategy' },
      { path: prefix + 'items.0.itemSelection.rankingDetail.strategyID', value: 'not-the-selection-strategy' },
    ] };
    assert.deepEqual(items(event), [
      { proposition: 0, item: 0, offerId: 'actual-offer-id', offer: 'Actual delivered item',
        strategyId: 'actual-strategy-id', strategy: 'Actual delivered strategy' },
      { proposition: 0, item: 1, offerId: 'second-offer' },
    ]);
    assert.deepEqual(items({ ...event, eventType: 'web.webinteraction.linkClicks' }), []);
  }
  assert.deepEqual(items({ eventType: 'decisioning.propositionDisplay', eventName: 'Scenario seven', rows: [] }), []);
});

test('TUI disruption reads, writes and confirms the airlineCustomer field', () => {
  const model = require(path.join(root, 'tui-decisioning-model.js'));
  const profile = require(path.join(root, 'tui-decisioning-profile.js'));
  const fullPath = '_demoemea.airlineCustomer.flightDisruption.disruptionType';
  const relativePath = 'airlineCustomer.flightDisruption.disruptionType';
  const field = model.fields.find(field => field.key === 'disruption');
  assert.equal(field.path, fullPath);
  const data = {
    rows: [
      { path: '_demoemea.travelReservations.flightReservations.flightDisruption.disruptionType', value: 'cancelled', valueType: 'string' },
      { path: fullPath, value: 'delay', valueType: 'string', industry: 'travel', writable: true },
    ],
    industries: { travel: { writable: true, schemaId: 'fixture-schema' } },
  };
  assert.equal(profile.signals(data.rows).disruption, 'delay');
  for (const disruption of field.values) {
    const batch = profile.snapshots(data, { ...model.defaults, disruption }, ['disruption']);
    assert.deepEqual(batch.expected, { [relativePath]: disruption });
    assert.ok(batch.snapshots[0].updates.some(update => update.path === relativePath && update.value === disruption));
    assert.deepEqual(profile.differences([{ path: fullPath, value: disruption, valueType: 'string' }], batch.expected), []);
  }
});

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

test('TUI and CP opt into the compatible manual runtime; other demos retain the shared runtime', async () => {
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
  assert.match(fs.readFileSync(path.join(root, 'cp-decisioning-demo.html'), 'utf8'), /runtimeScript: 'tui-decisioning-runtime\.js'/);
  for (const file of fs.readdirSync(root).filter(file => file.endsWith('.html') && !['tui-decisioning-demo.html', 'cp-decisioning-demo.html'].includes(file))) {
    assert.ok(!fs.readFileSync(path.join(root, file), 'utf8').includes("runtimeScript: 'tui-decisioning-runtime.js'"), file);
  }
});

test('TUI and CP load the decisioning drawer with offer/strategy event cards', () => {
  const html = fs.readFileSync(path.join(root, 'tui-decisioning-demo.html'), 'utf8');
  assert.match(html, /<script src="tui-decisioning-drawer\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /href="tui-decisioning-drawer\.css\?v=[^"]+"/);
  assert.ok(!/aep-profile-drawer\.(js|css)/.test(html));
  const drawer = fs.readFileSync(path.join(root, 'tui-decisioning-drawer.js'), 'utf8');
  for (const marker of ['function renderCompactEventTimeline(', "'Won via '", "variant: 'decisioning'", 'setJourneyModalRenderer(fn)']) {
    assert.ok(drawer.includes(marker), marker);
  }
  assert.ok(fs.readFileSync(path.join(root, 'tui-decisioning-drawer.css'), 'utf8').includes('.aep-profile-drawer-event-decision-detail'));
  assert.match(fs.readFileSync(path.join(root, 'cp-decisioning-demo.html'), 'utf8'), /tui-decisioning-drawer\.js/);
  for (const file of fs.readdirSync(root).filter(file => file.endsWith('.html') && !['tui-decisioning-demo.html', 'cp-decisioning-demo.html'].includes(file))) {
    assert.ok(!fs.readFileSync(path.join(root, file), 'utf8').includes('tui-decisioning-drawer.'), file);
  }
});

test('TUI follows the selected sandbox instead of pinning kirkham', () => {
  const html = fs.readFileSync(path.join(root, 'tui-decisioning-demo.html'), 'utf8');
  const demo = fs.readFileSync(path.join(root, 'tui-decisioning-demo.js'), 'utf8');
  assert.ok(!/defaultSandbox|setSelected\(/.test(html));
  assert.ok(!demo.includes("'kirkham'"));
  assert.ok(demo.includes("Select a sandbox before Apply.") && demo.includes("Select a sandbox before Run."));
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
