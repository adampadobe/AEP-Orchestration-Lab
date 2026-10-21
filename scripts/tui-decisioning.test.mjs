import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { compilePlan, evaluateScenario } from './provision-decisioning-catalog.mjs';
import { buildTuiPlan } from './tui-decisioning-catalog-plan.mjs';
import { ruleModelRepair } from './repair-decisioning-rule-models.mjs';

const model = createRequire(import.meta.url)('../web/profile-viewer/tui-decisioning-model.js');
const profile = createRequire(import.meta.url)('../web/profile-viewer/tui-decisioning-profile.js');
const { getManifestForIndustry } = createRequire(import.meta.url)('../functions/profileCoreV2Manifest.js');
const { resolveIndustryForPath } = createRequire(import.meta.url)('../functions/industryAttributeMap.js');
test('Run uses one fresh runtime profile read and retains actual consent, test-profile and context gates', async () => {
  const source = await readFile(new URL('../web/profile-viewer/tui-decisioning-demo.js', import.meta.url), 'utf8');
  const runSource = source.slice(source.indexOf('  async function run()'), source.indexOf('  global.TuiDecisioningDrawer'));
  for (const scenario of ['valid', 'not-found', 'malformed', 'not-test', 'consent-held', 'context-changed', 'lookup-failed']) {
    const fresh = { found: true, rows: [
      ...model.fields.map(field => ({ path: field.path, value: model.defaults[field.key] })),
      { path: 'testProfile', value: scenario !== 'not-test' },
    ] };
    if (scenario === 'not-found') fresh.found = false;
    if (scenario === 'malformed') fresh.rows = null;
    if (scenario === 'consent-held') fresh.rows.find(row => row.path === 'consents.marketing.email.val').value = 'n';
    let lookups = 0, decisions = 0;
    const statuses = [], timings = [], holds = [];
    const ctx = { sandbox: 'kirkham', namespace: 'email', identifier: 'fixture@example.invalid' };
    const environment = {
      profile, loaded: { found: true, rows: [] }, version: 0, revision: 0, busy: false, pending: null, edited: new Set(),
      context: () => ctx,
      same: (_ctx, token) => { if (token !== environment.version) throw new Error('Identity or sandbox changed.'); },
      message: (text, error) => statuses.push({ text, error }),
      $: () => ({ textContent: statuses.at(-1).text, dataset: { error: String(!!statuses.at(-1).error) } }),
      table: () => { throw new Error('Redundant table lookup must not run.'); },
      isTest: data => data.rows.some(row => row.path === 'testProfile' && row.value === true),
      api: () => ({ hold: reason => holds.push(reason) }),
      console: { info: (...args) => timings.push(args) }, performance,
      global: { envBarConfig: { decisioning: { eventTenantNamespace: '_demoemea' } },
        DecisioningProfileRuntime: {
          supportsManualDisplay: true, supportsCapturedEventContext: true,
          runProfileLookup: async options => {
            assert.equal(options.skipHydrate, true); lookups++;
            if (scenario === 'context-changed') environment.version++;
            return scenario !== 'lookup-failed';
          },
          getApi: () => ({ getLastUpsClientData: () => fresh }),
          runContentDecision: async options => {
            decisions++;
            assert.equal(options.useBrowserEcid, true);
            assert.equal(options.manualDisplay, true);
            return { propositions: [] };
          },
        } },
    };
    await vm.runInNewContext(runSource + '; run;', environment)();
    assert.equal(lookups, 1, scenario + ': exactly one fresh profile lookup');
    assert.equal(decisions, scenario === 'valid' ? 1 : 0, scenario + ': unsafe/missing readback never requests content');
    assert.equal(holds.length, scenario === 'consent-held' ? 1 : 0);
    if (scenario === 'valid') {
      assert.deepEqual(timings.map(entry => entry[1].phase), ['profile-readback', 'edge-decision']);
      assert.match(statuses.at(-1).text, /Expected one hero image decision/);
    }
    assert.equal(environment.busy, false);
  }
});
test('runtime captures the SDK event identity and datastream without changing legacy callers', async () => {
  const source = await readFile(new URL('../web/profile-viewer/decisioning-profile-module/decisioning-profile-runtime.js', import.meta.url), 'utf8');
  let namespace = 'email', identifier = 'traveller@example.invalid', ecid = '12345678901234567890';
  let datastream = 'original-datastream';
  const commands = [];
  const alloy = async (command, options) => {
    commands.push({ command, options });
    return command === 'getIdentity' ? { identity: { ECID: ecid } } : { propositions: [] };
  };
  const global = {
    console: { log() {} }, URL, URLSearchParams, location: { href: 'https://example.invalid/demo' },
    document: { title: 'TUI Decisioning', readyState: 'loading', addEventListener() {} },
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
    fetch: async () => ({ ok: true, json: async () => ({ found: true }) }),
    DemoTagsInjection: { ensureAlloyReady: async () => alloy,
      edgeConfigOverrides: () => ({ edgeConfigOverrides: { datastreamId: datastream } }) },
    DecisioningProfileModule: { extractEntityFromUps: () => ({ identityMap: { ECID: [{ id: '99999999999999999999' }] } }) },
    CdEdgeMounts: { buildIdentityMap: profile => ({
      ...(namespace === 'email' ? { Email: [{ id: identifier, primary: true }] } : {}),
      ECID: [{ id: profile.ecid, primary: namespace === 'ecid' }],
    }) },
  };
  global.window = global;
  vm.runInNewContext(source, global);
  const runtime = global.DecisioningProfileRuntime;
  runtime.init({ useParentDocument: true, enabled: () => true, autoRunDecisioning: false,
    getIdentifierValue: () => identifier, getNamespace: () => namespace, getSandboxName: () => 'kirkham' });
  await runtime.runProfileLookup();
  const legacy = await runtime.runContentDecision({ manualDisplay: true });
  assert.equal(commands.some(call => call.command === 'getIdentity'), false);
  assert.equal(legacy.manualDisplay.identityMap.ECID[0].id, '99999999999999999999');
  assert.deepEqual(Object.keys(legacy.manualDisplay.eventXdm), []);
  const options = { manualDisplay: true, useBrowserEcid: true, eventTenantNamespace: '_demoemea' };
  const result = await runtime.runContentDecision(options);
  const request = commands.at(-1).options;
  assert.equal(request.xdm.identityMap.ECID[0].id, ecid);
  assert.equal(request.xdm.identityMap.Email[0].id, identifier);
  assert.equal(request.xdm._demoemea.identification.core.ecid, ecid);
  assert.equal(request.personalization.sendDisplayEvent, false);
  assert.equal(request.renderDecisions, false);
  assert.equal(result.manualDisplay.alloy, alloy);
  assert.equal(result.manualDisplay.identityMap, request.xdm.identityMap);
  assert.equal(result.manualDisplay.eventXdm._demoemea, request.xdm._demoemea);
  datastream = 'changed-during-image-load';
  assert.equal(result.manualDisplay.edgeOptions.edgeConfigOverrides.datastreamId, 'original-datastream');
  const before = commands.filter(call => call.command === 'sendEvent').length;
  for (const eventTenantNamespace of [null, '_repo', '_experience', 'invalid tenant']) {
    await assert.rejects(runtime.runContentDecision({ ...options, eventTenantNamespace }), /event schema tenant/);
  }
  ecid = '';
  await assert.rejects(runtime.runContentDecision(options), /browser ECID was not returned/);
  ecid = '12345678901234567890';
  namespace = 'ecid'; identifier = '99999999999999999999';
  await assert.rejects(runtime.runContentDecision(options), /selected ECID differs/);
  assert.equal(commands.filter(call => call.command === 'sendEvent').length, before, 'Failed preflight sends no decisions');
});
test('schema preflight distinguishes tenant fields from reserved XDM roots and fails closed on disagreement', () => {
  const tenant = { type: 'object', properties: { airlineCustomer: { properties: { journeyStage: { type: 'string' } } } } };
  const schema = { 'meta:tenantNamespace': 'demoemea', properties: {
    _id: { type: 'string' }, _repo: { properties: {} }, _experience: { properties: {} },
    _demoemea: tenant, consents: { properties: { marketing: { type: 'string' } } },
  } };
  assert.deepEqual(profile.schemaLeaf(schema, { xdmKey: '_demoemea' }, 'airlineCustomer.journeyStage'), { type: 'string' });
  assert.deepEqual(profile.schemaLeaf(schema, { xdmKey: 'demoemea' }, 'consents.marketing'), { type: 'string' });
  const fallback = { properties: schema.properties };
  assert.deepEqual(profile.schemaLeaf(fallback, {}, 'airlineCustomer.journeyStage'), { type: 'string' });
  assert.equal(profile.schemaLeaf(schema, {}, 'airlineCustomer.missing'), undefined);
  const arraySchema = { properties: { travelPreferences: { properties: { destinations: {
    type: ['array', 'null'], items: { properties: { city: { type: 'string' } } },
  } } } } };
  assert.deepEqual(profile.schemaLeaf(arraySchema, {}, 'travelPreferences.destinations.0.city'), { type: 'string' });
  assert.throws(() => profile.schemaLeaf(schema, { xdmKey: '_other' }, 'airlineCustomer.journeyStage'), /does not match/);
  assert.throws(() => profile.schemaLeaf(schema, { xdmKey: '_other' }, 'consents.marketing'), /does not match/);
  assert.throws(() => profile.schemaLeaf({ ...schema, 'meta:tenantNamespace': {} }, {}, 'airlineCustomer.journeyStage'), /Invalid/);
  assert.throws(() => profile.schemaLeaf(fallback, { xdmKey: '_missing' }, 'airlineCustomer.journeyStage'), /missing/);
  assert.throws(() => profile.schemaLeaf({ properties: { ...fallback.properties, _other: tenant } }, {}, 'airlineCustomer.journeyStage'), /one schema tenant/);
  assert.throws(() => profile.schemaLeaf({ properties: { _id: { type: 'string' }, _repo: { properties: {} } } }, {}, 'airlineCustomer.journeyStage'), /one schema tenant/);
});
const raw = model.tags.map(([id, name], i) => ({
  id: `dps:fixture:${i}`, _experience: { decisioning: { decisionitem: {
    itemCatalogID: 'xcore:decision-catalog:18c6b876319b00e4',
    itemTags: [id], itemTagDetails: [{ id, name }],
  } } },
}));

test('every TUI scenario selects its expected objective and offer, including consent holds', () => {
  assert.equal(model.objectives.length, 7);
  assert.equal(model.objectives.reduce((n, o) => n + o.offers.length, 0), 21);
  for (const scenario of model.scenarios) {
    const result = model.evaluate({ ...model.defaults, ...scenario.preset });
    assert.equal(result.objective, scenario.expectedObjective, scenario.name);
    assert.equal(result.offer, scenario.expectedOffer, scenario.name);
  }
});
test('exactly seven visible scenario presets independently select each ranked objective', () => {
  assert.equal(model.demoScenarios.length, 7);
  assert.deepEqual(model.demoScenarios.map(s => s.expectedObjective), model.objectives.map(o => o.key).reverse());
  assert.deepEqual(model.demoScenarios.map(s => s.rank), [7, 6, 5, 4, 3, 2, 1]);
  for (const scenario of model.demoScenarios) {
    assert.deepEqual(Object.keys(scenario.preset).sort(), model.fields.map(field => field.key).sort());
    assert.equal(model.evaluate(scenario.preset).objective, scenario.expectedObjective);
    assert(scenario.signalKeys.length > 0 && scenario.signalKeys.length < model.fields.length);
    assert(scenario.signalKeys.every(key => model.fields.some(field => field.key === key)));
  }
});

test('scenario 5 stages abandoned search Yes from the scenario 7 baseline', () => {
  const abandoned = model.demoScenarios.find(s => s.rank === 5);
  const inspiration = model.demoScenarios.find(s => s.rank === 7);
  assert.equal(abandoned.name, 'Abandoned search');
  assert.deepEqual(abandoned.preset, { ...inspiration.preset, abandoned: true });
  assert(abandoned.signalKeys.includes('abandoned'));
  assert.equal(model.fields.find(f => f.key === 'abandoned').path, '_demoemea.airlineCustomer.abandonedSearchFlag');
  assert.equal(model.fields.find(f => f.key === 'abandoned').type, 'boolean');
  assert.equal(model.evaluate(abandoned.preset).objective, 'convert');
  assert.equal(model.evaluate(abandoned.preset).offer, 'return-search');
  assert.equal(inspiration.preset.abandoned, false, 'Scenario 7 clears the abandoned-search flag');
  const data = { industries: { travel: { writable: true, schemaId: 'travel-schema', xdmKey: '_demoemea' } },
    rows: [{ path: '_demoemea.airlineCustomer.abandonedSearchFlag', value: false, valueType: 'boolean',
      industry: 'travel', writable: true }] };
  const batch = profile.snapshots(data, abandoned.preset, new Set(['abandoned']));
  assert.deepEqual(batch.snapshots[0].updates, [
    { path: 'airlineCustomer.abandonedSearchFlag', value: true, valueType: 'boolean' },
  ]);
});

test('website and compiled catalog agree on all non-consent scenarios', () => {
  const plan = buildTuiPlan(raw);
  const bundle = compilePlan(plan);
  assert.equal(bundle.assets.filter(a => a.entity_type === 'offer-items').length, 21);
  assert.equal(bundle.assets.filter(a => a.entity_type === 'selection-strategies').length, 7);
  assert.equal(bundle.assets.filter(a => a.entity_type === 'item-collections').length, 7);
  for (const scenario of plan.scenarios) {
    assert.deepEqual(evaluateScenario(plan, scenario.attributes),
      { objective: scenario.expectedObjective, offer: scenario.expectedOffer });
  }
  for (const a of bundle.assets.filter(a => a.entity_type === 'offer-items')) {
    assert.equal(a.item._experience.decisioning.offeritem.lifecycleStatus, 'draft');
    assert.ok(!a.item._demoemea.content.mediaAssets, 'Do not invent publicly hosted media URLs');
  }
});

test('all 21 items have a winning assertion and all controls affect actual decision logic', () => {
  const rulePaths = new Set();
  for (const o of model.objectives) {
    o.rule.conditions.forEach(c => rulePaths.add(c.path));
    for (const item of o.offers) {
      item.rule?.conditions.forEach(c => rulePaths.add(c.path));
      assert(model.scenarios.some(s => s.expectedObjective === o.key && s.expectedOffer === item.key));
    }
  }
  for (const f of model.fields) {
    assert(rulePaths.has(f.path) || f.group === 'Consent', f.key + ' must not be decorative');
    assert(!f.path.includes('tuiDecisioning') && !f.path.includes('britishAirwaysDecisioning'));
  }
});

test('service precedence, within-objective switching and exact numeric boundaries', () => {
  const choose = preset => model.evaluate({ ...model.defaults, ...preset });
  assert.equal(choose({ intent: 'High', disruption: 'cancelled' }).objective, 'protect');
  assert.equal(choose({ booking: 'Booked', days: 1 }).offer, 'checkin');
  assert.equal(choose({ booking: 'Booked', days: 2 }).offer, 'seats');
  assert.equal(choose({ booking: 'Booked', days: 14 }).objective, 'prepare');
  assert.equal(choose({ booking: 'Booked', days: 15 }).objective, 'grow');
  assert.equal(choose({ booking: 'Booked', score: 3 }).offer, 'experiences');
  assert.equal(choose({ booking: 'Booked', score: 2.99 }).offer, 'seat-options');
  assert.equal(choose({ booking: 'Booked', score: 2 }).offer, 'seat-options');
  assert.equal(choose({ booking: 'Booked', score: 1.99 }).offer, 'hotel-options');
  for (const value of ['n', 'u', '', undefined]) {
    assert.equal(choose({ emailConsent: value, disruption: 'cancelled' }).offer, null);
    assert.equal(choose({ personalize: value }).offer, null);
  }
});

test('missing verified tags fail closed rather than inventing UUIDs', () => {
  assert.throws(() => buildTuiPlan([]), /Missing live unified tag/);
  const bad = structuredClone(raw);
  bad[0]._experience.decisioning.decisionitem.itemTagDetails = [];
  assert.throws(() => buildTuiPlan(bad), /Missing live unified tag/);
});

test('every TUI rule has typed visual attributes matching the PQL source and safe repair patches', () => {
  const bundle = compilePlan(buildTuiPlan(raw));
  const sources = model.objectives.flatMap(o => [o.rule, ...o.offers.filter(i => i.rule).map(i => i.rule)]);
  const rules = bundle.assets.filter(a => a.entity_type === 'offer-rules');
  for (const [index, asset] of rules.entries()) {
    const visual = asset.item.segmentModel.expression.profileAttributesContainer;
    assert.equal(visual.logicalOperator, sources[index].operator);
    assert.equal(visual.items.length, sources[index].conditions.length);
    for (const [j, item] of visual.items.entries()) {
      const source = sources[index].conditions[j];
      assert.equal(item.component.id, 'profile.' + source.path);
      assert.deepEqual(item.value, source.op === 'eq' ? [source.value] : source.value);
      assert(asset.item.condition.value.includes(source.path));
      assert.equal(item.isCaseSensitive, false);
    }
    const before = { ...asset.item }; delete before.segmentModel;
    assert.equal(ruleModelRepair(asset, before)[0].path, '/segmentModel');
    assert.deepEqual(ruleModelRepair(asset, asset.item), []);
    assert.throws(() => ruleModelRepair(asset, { ...before, condition: {} }), /drift/);
    assert.throws(() => ruleModelRepair(asset, { ...before, segmentModel: {} }), /differs/);
  }
});

test('profile snapshots preserve typed industry siblings and write only explicitly edited fields', () => {
  const data = { industries: { travel: { writable: true, schemaId: 'travel-schema' }, generic: { writable: true, schemaId: 'generic-schema' } },
    rows: [
      { path: '_demoemea.airlineCustomer.journeyStage', value: 'Custom stage', valueType: 'string', writable: true, industry: 'travel' },
      { path: '_demoemea.airlineCustomer.mobileAppUser', value: 'false', valueType: 'boolean', writable: true, industry: 'travel' },
      { path: '_demoemea.scoring.core.propensityScore', value: '2.99', valueType: 'number', writable: true, industry: 'generic' },
    ] };
  assert.equal(profile.signals(data.rows).booking, 'Custom stage');
  assert.equal(profile.signals(data.rows).score, 2.99);
  assert.equal(profile.signals(data.rows).emailConsent, undefined);
  const batch = profile.snapshots(data, { ...model.defaults, booking: 'Booked' }, ['booking']);
  assert.deepEqual(batch.expected, { 'airlineCustomer.journeyStage': 'Booked' });
  assert.equal(batch.snapshots.length, 1);
  assert.deepEqual(batch.snapshots[0].updates.find(u => u.path.endsWith('mobileAppUser')).value, false);
  assert.equal(batch.snapshots[0].updates.some(u => u.path.startsWith('consents.')), false);
  assert.throws(() => profile.snapshots({ ...data, industries: {} }, model.defaults, ['booking']), /Configure/);
  const legacy = profile.snapshots({ ...data, rows: [
    ...data.rows.map(row => ({ ...row, industry: 'generic', writable: false })),
    { path: '_demoemea.airlineCustomer.savedSibling', value: 'Keep', valueType: 'string', writable: false },
    { path: '_demoemea.travelReservations.flightReservations.segments.0.airline', value: 'TUI', valueType: 'string', industry: null, writable: false },
    { path: '_demoemea.industryFsi.balance', value: '100', valueType: 'number', industry: 'fsi', writable: true },
  ] }, { ...model.defaults, booking: 'Booked' }, ['booking', 'score']);
  assert.equal(legacy.snapshots[0].updates.find(u => u.path.endsWith('savedSibling')).value, 'Keep');
  assert.equal(legacy.snapshots[0].updates.find(u => u.path.endsWith('segments.0.airline')).value, 'TUI');
  assert(legacy.snapshots[0].schemaPaths.includes('airlineCustomer.savedSibling'));
  assert.equal(legacy.snapshots[0].updates.some(u => u.path.startsWith('scoring.') || u.path.startsWith('industryFsi.')), false);
  assert.equal(legacy.snapshots[1].updates.some(u => u.path.startsWith('airlineCustomer.')), false);
  const first = profile.snapshots({ ...data, rows: [] }, { ...model.defaults, booking: 'Booked' }, ['booking']);
  assert.deepEqual(first.snapshots[0].updates, [{ path: 'airlineCustomer.journeyStage', value: 'Booked', valueType: 'string' }]);
  assert.throws(() => profile.snapshots({ ...data, industries: { travel: { writable: false, schemaId: 'travel-schema' } } }, model.defaults, ['booking']), /Configure/);
  assert.deepEqual(profile.differences(data.rows, { 'scoring.core.propensityScore': 2.99 }), []);
  assert.deepEqual(profile.differences(data.rows, { 'airlineCustomer.journeyStage': 'CUSTOM STAGE' }), []);
});

test('every streamed travel field is declared in the manifest and both ownership maps', async () => {
  const mcp = await import('../tools/aep-lab-profile-mcp/src/framework/attributeOwnership.mjs');
  const manifest = getManifestForIndustry('travel');
  for (const field of model.fields.filter(field => profile.industry(field) === 'travel')) {
    const path = profile.relative(field.path);
    let leaf = { properties: manifest };
    for (const part of path.split('.')) leaf = leaf?.properties?.[part];
    assert(leaf, path);
    assert.equal(leaf.type, field.type === 'number' ? 'integer' : field.type);
    assert.equal(resolveIndustryForPath('_otherTenant.' + path).industry, 'travel');
    assert.equal(mcp.resolveIndustryForPath('_otherTenant.' + path).industry, 'travel');
  }
});

test('captured analytics/scripts are not imported and presentation uses dashboard color tokens', async () => {
  const base = new URL('../web/profile-viewer/', import.meta.url);
  const html = await readFile(new URL('tui-decisioning-visualiser.html', base), 'utf8');
  const css = await readFile(new URL('tui-decisioning-demo.css', base), 'utf8');
  const controller = await readFile(new URL('tui-decisioning-visualiser.js', base), 'utf8');
  assert.doesNotMatch(html, /utag|alloy|gigya|datadog|https?:\/\//i);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|prefers-color-scheme/i);
  assert.doesNotMatch(controller, /innerHTML|fetch\(|XMLHttpRequest/);
  for (const f of ['tui-decisioning-demo.html', 'tui-decisioning-visualiser.html']) {
    const text = await readFile(new URL(f, base), 'utf8');
    const sheets = [...text.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]);
    assert(sheets.at(-1).startsWith('aep-theme.css'));
  }
});
