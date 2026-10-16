const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const model = require('../web/profile-viewer/natwest-decisioning-model');
const { getManifestForIndustry } = require('../functions/profileCoreV2Manifest');
const root = path.resolve(__dirname, '..', 'web');
const samples = path.resolve(__dirname, '..', '.github', 'skills', 'create-decisioning-demo', 'references');
const profileSample = JSON.parse(fs.readFileSync(path.join(samples, 'operational-profile-sample.json'), 'utf8'));
const eventSample = JSON.parse(fs.readFileSync(path.join(samples, 'operational-event-sample.json'), 'utf8'));
const { resolveIndustryForPath } = require('../functions/industryAttributeMap');
test('saved Registry exports identify separate operational profile and event schemas', () => {
  for (const [kind, className] of [['profile', 'profile'], ['event', 'experienceevent']]) {
    const resources = JSON.parse(fs.readFileSync(path.join(samples, 'operational-' + kind + '-schema-export.json'), 'utf8'));
    const schemas = resources.filter(resource => resource['meta:resourceType'] === 'schemas');
    assert.equal(schemas.length, 1);
    assert.equal(schemas[0]['meta:class'], 'https://ns.adobe.com/xdm/context/' + className);
    assert.ok(schemas[0].allOf.length > 0);
  }
});

function fixture() {
  return {
    found: true, profileEmail: 'natwest-fixture@example.invalid', ecid: '12345678901234567890123456789012345678',
    industries: { generic: { writable: true, schemaId: 'generic-schema' }, fsi: { writable: true, schemaId: 'fsi-schema' } },
    rows: [
      { path: 'testProfile', value: true, valueType: 'boolean', writable: true, industry: 'generic' },
      { path: 'person.name.firstName', value: 'Sam', valueType: 'string', writable: true, industry: 'generic' },
      { path: 'personalEmail.address', value: 'natwest-fixture@example.invalid', valueType: 'string', writable: true, industry: 'generic' },
      { path: '_demoemea.industryFsi.primaryBankingChannel', value: 'mobile', valueType: 'string', writable: true, industry: 'fsi' },
      { path: '_demoemea.industryFsi.financialProducts.checking', value: 'true', valueType: 'boolean', writable: true, industry: 'fsi' },
      ...Object.entries(model.defaults).map(([name, value]) => ({
        path: (model.pathFor(name).startsWith('consents.') ? '' : '_demoemea.') + model.pathFor(name), value, valueType: typeof value,
        writable: true, industry: model.industryFor(name),
      })),
    ],
  };
}
test('every control matches the supplied profile sample type, stream owner and manifest', () => {
  for (const [name, value] of Object.entries(model.defaults)) {
    const field = model.pathFor(name);
    const actual = field.split('.').reduce((obj, key) => obj[key], field.startsWith('consents.') ? profileSample : profileSample._demoemea);
    assert.equal(typeof actual, typeof value, field);
    assert.equal(resolveIndustryForPath('_otherTenant.' + field).industry, model.industryFor(name), field);
    if (!field.startsWith('consents.')) {
      const manifest = getManifestForIndustry(model.industryFor(name));
      assert.equal(manifest[field].type, typeof value, field);
    }
  }
  assert.ok(!Object.keys(getManifestForIndustry('fsi')).some(field => field.startsWith('natwestDecisioning.')));
});
test('complaint priority, explicit consent, holdings and exact score/offer boundaries', () => {
  const evaluate = state => model.evaluate({ ...model.defaults, ...state }).winner?.id || null;
  assert.equal(evaluate({ churn: 80, cases: 'open' }), 'service');
  for (const consent of ['n', 'p', 'unknown', '']) assert.equal(evaluate({ consent, cases: 'open' }), null);
  assert.equal(evaluate({ personalisation: 'n' }), null);
  assert.equal(evaluate({ churn: 65 }), 'protect');
  assert.equal(evaluate({ churn: 64, prop: 65 }), 'convert');
  assert.equal(evaluate({ prop: 64 }), 'engage');
  assert.equal(evaluate({ checking: false, product: 'current' }), 'prepare');
  assert.equal(evaluate({ savings: true }), 'complete');
  assert.equal(evaluate({ savings: true, product: 'investment', prop: 35 }), 'grow');
  assert.equal(evaluate({ savings: true, product: 'investment', prop: 34 }), 'engage');
  assert.equal(evaluate({ available: 0, prop: 80 }), 'engage');
  for (const product of ['current', 'savings', 'mortgage', 'loan', 'investment']) {
    const state = { product, [product === 'current' ? 'checking' : product]: true };
    assert.equal(evaluate(state), 'complete');
  }
  assert.equal(evaluate({ cases: 'Unrecognised status' }), 'service');
});
test('presets validate and NBA scores sum deterministically', () => {
  for (const [, preset] of model.scenarios) {
    const a = model.evaluate({ ...model.defaults, ...preset });
    assert.deepEqual(a, model.evaluate(a.state));
    for (const candidate of a.candidates) assert.equal(candidate.score, Object.values(candidate.parts).reduce((a, b) => a + b, 0));
  }
  assert.throws(() => model.validate({ available: 3.2 }), /Invalid/);
  assert.throws(() => model.validate({ checking: 'true' }), /Invalid/);
  assert.equal(model.validate({ account: 'Gold', prop: 85.25 }).account, 'Gold');
});
test('full industry snapshots preserve unrelated values and types, without cross-stream leakage', () => {
  const data = fixture(), next = { ...model.defaults, account: 'Savings-linked', prop: 85.25, savings: true };
  const batch = model.buildSnapshots(data, next, model.defaults);
  assert.equal(batch.snapshots.length, 2);
  const fsi = batch.snapshots.find(group => group.industry === 'fsi').updates;
  assert.ok(fsi.some(update => update.path === 'industryFsi.primaryBankingChannel' && update.value === 'mobile'));
  assert.ok(fsi.some(update => update.path === 'industryFsi.financialProducts.checking' && update.value === true));
  assert.ok(fsi.some(update => update.path === model.pathFor('account') && update.value === 'Savings-linked'));
  assert.ok(fsi.some(update => update.path === model.pathFor('savings') && update.value === true && update.valueType === 'boolean'));
  assert.ok(!fsi.some(update => update.path === 'scoring.core.propensityScore'));
  const generic = batch.snapshots.find(group => group.industry === 'generic').updates;
  assert.ok(generic.some(update => update.path === 'person.name.firstName' && update.value === 'Sam'));
  assert.ok(!generic.some(update => update.path.startsWith('natwestDecisioning.')));
  assert.equal(model.differences(data.rows, batch.expected).length, 3);
  assert.throws(() => model.buildSnapshots(data, model.defaults, model.defaults), /No profile/);
  data.industries.fsi.writable = false;
  assert.throws(() => model.buildSnapshots(data, next, model.defaults), /setup/);
});
test('Operational FSI snapshots preserve legacy unowned banking rows without requiring an existing writable row', () => {
  const data = fixture();
  for (const row of data.rows.filter(row => row.industry === 'fsi')) {
    row.industry = null; row.writable = false;
  }
  data.rows.push({
    path: '_demoemea.individualCharacteristics.fsi.financialDetails.accountBalance',
    value: 1234.5, valueType: 'number', industry: null, writable: false,
  });
  const next = { ...model.defaults, account: 'Premier' };
  const batch = model.buildSnapshots(data, next, model.defaults);
  const updates = batch.snapshots[0].updates;
  assert.equal(batch.snapshots[0].industry, 'fsi');
  assert.ok(updates.some(row => row.path === model.pathFor('account') && row.value === 'Premier'));
  assert.ok(updates.some(row => row.path === model.pathFor('checking') && row.value === true));
  assert.ok(updates.some(row => row.path === 'individualCharacteristics.fsi.financialDetails.accountBalance' && row.value === 1234.5));
  assert.ok(updates.some(row => row.path === 'industryFsi.primaryBankingChannel' && row.value === 'mobile'));
  assert.ok(!updates.some(row => row.path === 'person.name.firstName' || row.path.startsWith('scoring.')));
  data.industries.fsi.writable = false;
  assert.throws(() => model.buildSnapshots(data, next, model.defaults), /setup/);
});
test('configured writable dataflows accept first field population but missing configuration remains blocked', () => {
  const data = fixture();
  data.rows = data.rows.filter(row => row.industry !== 'fsi');
  const batch = model.buildSnapshots(data, model.defaults, model.defaults, ['checking']);
  assert.deepEqual(batch.snapshots, [{ industry: 'fsi', updates: [{
    path: model.pathFor('checking'), value: true, valueType: 'boolean',
  }] }]);
  delete data.industries.fsi.schemaId;
  assert.throws(() => model.buildSnapshots(data, model.defaults, model.defaults, ['checking']), /setup/);
});
test('Generic snapshots preserve unowned offers and complaint siblings, independently of delivery events', () => {
  const data = fixture();
  for (const row of data.rows.filter(row => /offersAndPromotions|complaint/.test(row.path))) {
    row.industry = null; row.writable = false;
  }
  data.rows.push({ path: '_demoemea.offersAndPromotions.eligibleOfferNames', value: 'Savings',
    valueType: 'string', industry: null, writable: false });
  data.rows.push({ path: '_demoemea.complaint.caseReference', value: 'fixture-case',
    valueType: 'string', industry: null, writable: false });
  const batch = model.buildSnapshots(data, { ...model.defaults, available: 3 }, model.defaults);
  const updates = batch.snapshots[0].updates;
  assert.equal(batch.snapshots[0].industry, 'generic');
  assert.ok(updates.some(row => row.path === model.pathFor('available') && row.value === 3));
  assert.ok(updates.some(row => row.path === 'offersAndPromotions.eligibleOfferNames' && row.value === 'Savings'));
  assert.ok(updates.some(row => row.path === 'complaint.caseReference' && row.value === 'fixture-case'));
  assert.ok(!updates.some(row => row.path.startsWith('individualCharacteristics.fsi.')));
});
test('explicit edits can initialise missing fields even when the selected value matches the illustrative default', () => {
  const data = fixture();
  data.rows = data.rows.filter(row => !row.path.endsWith(model.pathFor('checking')));
  const batch = model.buildSnapshots(data, model.defaults, model.defaults, ['checking']);
  assert.deepEqual(batch.expected, { [model.pathFor('checking')]: true });
  assert.ok(!Object.hasOwn(batch.expected, model.pathFor('consent')));
});
test('profile values retain exact generic values without score scaling or invented account types', () => {
  const data = fixture();
  data.rows = data.rows.filter(row => !row.path.endsWith(model.pathFor('account')));
  data.rows.find(row => row.path.endsWith('propensityScore')).value = '85';
  assert.equal(model.readState(data.rows).account, model.defaults.account);
  assert.equal(model.readState(data.rows).prop, 85);
  for (const score of [0, 1, 34.5, 35, 65, 12345.67]) {
    data.rows.find(row => row.path.endsWith('propensityScore')).value = score;
    assert.equal(model.readState(data.rows).prop, score);
  }
  assert.equal(model.scalar({ path: 'text', value: '123', valueType: 'string' }), '123');
  assert.throws(() => model.scalar({ path: 'number', value: 'oops', valueType: 'number' }), /Invalid/);
});
test('shared runtime manual-display mode never auto-renders; legacy callers retain behaviour', async () => {
  const calls = [], injections = [];
  const doc = { title: 'Fixture', getElementById: () => null };
  const context = {
    document: doc, console: { log() {} }, URL, URLSearchParams, setTimeout, clearTimeout,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    fetch: async () => ({ ok: true, json: async () => ({ found: true, rows: [] }) }),
    location: { href: 'http://fixture.invalid/profile-viewer/natwest-decisioning-demo.html' },
    dispatchEvent() {}, addEventListener() {},
    alloy: async (command, options) => { calls.push({ command, options }); return { propositions: [{ id: 'fixture', scope: 'web://fixture.invalid#hero-banner' }] }; },
    CdEdgeMounts: {
      buildIdentityMap: () => ({ Email: [{ id: 'natwest-fixture@example.invalid' }] }),
      buildSurfacesFromPageUrl: () => ['web://fixture.invalid#hero-banner'],
    },
    DecisioningEdgeInject: { ensureDecisioningMounts() {}, applyDecisioningPropositions: (...args) => injections.push(args) },
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'profile-viewer', 'decisioning-profile-module', 'decisioning-profile-runtime.js'), 'utf8'), context);
  const runtime = context.DecisioningProfileRuntime;
  runtime.init({ useParentDocument: true, autoRunDecisioning: false, getIdentifierValue: () => 'natwest-fixture@example.invalid' });
  assert.equal(await runtime.runProfileLookup(), true);
  const manual = await runtime.runContentDecision({ manualDisplay: true });
  assert.equal(calls[0].options.renderDecisions, false);
  assert.equal(calls.length, 1);
  assert.equal(injections.length, 0);
  assert.equal(typeof manual.manualDisplay.alloy, 'function');
  await runtime.runContentDecision();
  assert.equal(calls[1].options.renderDecisions, true);
  assert.equal(calls[2].command, 'applyPropositions');
  assert.equal(injections.length, 1);
});

test('browser: faithful panes, channels and fixture-only profile/decision lifecycle', { timeout: 120000 }, async t => {
  const { chromium } = require('playwright');
  let data = fixture(), missingSchema = false, lag = false, updateFailure = false, missingHero = false, mockLoader = true;
  let wrongSchemaType = false, maximumScore = null;
  let badImage = false, decisionGate = null, decisionsRequested = 0, updateFailureIndustry = '';
  const eventTime = Date.now() - 60000;
  let drawerEvents = [
    { eventType: 'web.webpagedetails.pageViews', eventName: 'Banking products', timestamp: eventTime - 10000, rows: [
      { path: 'web.webPageDetails.name', value: 'Banking products' },
    ] },
    { eventType: 'web.webpagedetails.pageViews', eventName: 'NatWest Decisioning', timestamp: eventTime, rows: [
      { path: 'web.webPageDetails.name', value: 'NatWest Decisioning' },
      { path: '_tenant.interactionDetails.core.channel', value: 'email' },
    ] },
    { eventType: 'decisioning.propositionDisplay', timestamp: eventTime + 1000, rows: [
      { path: '_experience.decisioning.propositions.0.items.0.name', value: 'Savings <offer>' },
      { path: '_experience.decisioning.propositions.0.items.0.itemSelection.selectionDetail.strategyName', value: 'Banking strategy' },
    ] },
  ];
  const writes = [];
  const schema = () => {
    const properties = {};
    for (const [name, value] of Object.entries(model.defaults)) {
      let current = properties;
      const parts = model.pathFor(name).split('.');
      for (const part of parts.slice(0, -1)) {
        current[part] ||= { type: 'object', properties: {} }; current = current[part].properties;
      }
      current[parts.at(-1)] = { type: typeof value };
      if (name === 'available') current[parts.at(-1)] = { type: 'integer', minimum: 0, maximum: 2147483647 };
      if (name === 'account' && wrongSchemaType) current[parts.at(-1)].type = 'boolean';
      if (name === 'prop' && maximumScore !== null) current[parts.at(-1)].maximum = maximumScore;
      if (name === 'consent' || name === 'personalisation') current[parts.at(-1)].enum = ['y', 'n', 'p'];
    }
    const consents = properties.consents; delete properties.consents;
    if (missingSchema) delete properties.individualCharacteristics.properties.fsi.properties.productOverview.properties.checkingAcctType;
    return { version: '1.5', properties: { consents, _demoemea: { properties } } };
  };
  const harness = `
    document.querySelector('[data-demo-env-strip-mount]').innerHTML =
      '<div class="spectrum-env-status-bar" style="height:48px">Fixture configuration</div><input id="customerEmail" value="natwest-fixture@example.invalid"><select id="nwDecisioningNs"><option>email</option></select><button id="queryProfileBtn">Look up profile</button><select id="generatorTarget"></select>';
    window.AepGlobalSandbox={getSandboxName:()=>window.__sandbox||'fixture'};
    window.AepIdentityPicker={init(){}};
    window.DemoProfileDrawer={init(){},loadProfileDataForDrawer:async()=>true,getLastLookedUpProfile:()=>({firstName:'Sam'})};
    window.DemoTagsInjection={init:()=>({stitchAfterProfileLookup:async()=>{}})};
    window.AepDemoGeneratorTargets={bindGeneratorTargetLifecycle:fn=>fn(),loadGeneratorTargetsIntoSelect:async()=>[]};
    window.postProfileUpdate=async body=>{const response=await fetch('/api/profile/update',{method:'POST',body:JSON.stringify(body)});return {ok:response.ok,data:await response.json()};};
    window.formatProfileUpdateError=data=>data.error||'Update failed';
    window.__decisions=0;window.__displays=[];window.__lookups=0;
    window.DecisioningProfileRuntime={supportsManualDisplay:true,runProfileLookup:async()=>{window.__lookups++;return true;},runContentDecision:async options=>{
      if(!options.manualDisplay)throw new Error('Missing manual display');
      window.__decisions++;const fixture=await (await fetch('/api/fixture-decision')).json();
      return {propositions:fixture.propositions,manualDisplay:{identityMap:{Email:[{id:document.getElementById('customerEmail').value}]},
      alloy:async(command,event)=>{window.__displays.push(event);}}};}};
    window.envBar={ready:()=>Promise.resolve(),registerTagsInjection(){}};
    const core=document.createElement('script');core.src=window.envBarConfig.labCoreScript;document.body.appendChild(core);
  `;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    if (url.pathname === '/api/profile/table') return json(data);
    if (url.pathname === '/api/profile/consent') return json({
      found: true, firstName: 'Sam', lastName: 'Fixture', gender: 'female', age: 36, city: 'London',
      email: data.profileEmail, phone: '+440000000000', ecid: data.ecid, propensityScore: 2,
      churnPrediction: 1, customerLifetimeValue: 12000, channels: { email: 'in', sms: 'out', push: 'in' },
      identities: [{ namespace: 'Email', value: data.profileEmail }, { namespace: 'ECID', value: data.ecid }],
    });
    if (url.pathname === '/api/profile/events') return json({ events: drawerEvents });
    if (url.pathname === '/api/aep') {
      let body = ''; for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      if (!String(request.path || '').includes('/schemaregistry/tenant/schemas/')) return json({
        platform_response: {}, status: 200,
      });
      const accept = request.platform_headers.Accept;
      if (accept === 'application/vnd.adobe.xed+json; version=1') return json({
        platform_response: { version: '1.5' }, status: 200,
      });
      if (accept !== 'application/vnd.adobe.xed-full+json; version=1.5') return json({
        platform_response: { version: '1.4', properties: {} }, status: 200,
      });
      return json({ platform_response: schema(), status: 200 });
    }
    if (url.pathname === '/api/profile/update') {
      let body = ''; for await (const chunk of req) body += chunk;
      const update = JSON.parse(body); writes.push(update);
      if (updateFailure || updateFailureIndustry === update.industry) { res.statusCode = 500; return json({ ok: false, error: 'Fixture update rejected' }); }
      if (!lag) for (const entry of update.updates) {
        const row = data.rows.find(row => model.relativePath(row.path) === entry.path && row.industry === update.industry);
        if (row) Object.assign(row, { value: entry.value, valueType: entry.valueType });
      }
      return json({ ok: true });
    }
    if (url.pathname === '/api/fixture-decision') {
      decisionsRequested++;
      if (decisionGate) await decisionGate;
      const image = badImage ? '/missing-fixture-image.png' : '/profile-viewer/natwest-decisioning-assets/mobile-app-customer.png';
      return json({ propositions: missingHero ? [] : [{
      id: 'fixture-hero', scope: 'web://fixture.invalid/profile-viewer/natwest-decisioning-visualiser.html#hero-banner',
      items: [{ id: 'fixture-item', schema: 'https://ns.adobe.com/personalization/html-content-item',
        name: 'Fixture savings offer',
        itemSelection: { selectionDetail: { strategyName: 'Fixture banking strategy', strategyID: 'fixture-strategy' } },
        data: { content: '<img src="' + image + '"><h2>Your live NatWest next step</h2><p>Fixture live banking content</p>' } }],
      scopeDetails: { activity: { id: 'fixture-activity' } }, title: 'Your live NatWest next step',
      image,
    }] });
    }
    if (mockLoader && url.pathname === '/profile-viewer/shared/env-bar.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(harness); }
    if (url.pathname.startsWith('/api/')) return json({ ok: true, items: [], targets: [], sandboxes: [] });
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname).split('/').join(path.sep));
    if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.statusCode = 404; return res.end(); }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
    fs.createReadStream(filename).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
    page.setDefaultTimeout(6000);
    await page.route('https://**', route => route.abort());
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/profile-viewer/natwest-decisioning-demo.html?channel=web');
    await page.addScriptTag({ url: base + '/profile-viewer/content-decision-edge-mounts.js' });
    await page.addScriptTag({ url: base + '/profile-viewer/decisioning-profile-module/decisioning-edge-inject.js' });
    await page.waitForFunction(() => window.NatwestDecisioningModel && document.getElementById('nwDecisioningFrame').contentWindow.NatwestDecisioningVisualiser && window.__decisions === 0);
    const visual = page.frames().find(frame => frame.url().includes('natwest-decisioning-visualiser'));
    await visual.locator('#webImage').waitFor({ state: 'visible' });
    await t.test('Apply looks up the selected profile on demand and preserves only explicitly edited fields', async () => {
      const firstApply = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
      await firstApply.route('https://**', route => route.abort());
      try {
        await firstApply.goto(base + '/profile-viewer/natwest-decisioning-demo.html');
        await firstApply.waitForFunction(() => document.getElementById('nwDecisioningFrame').contentDocument.documentElement.dataset.nwWired === 'true');
        const firstVisual = firstApply.frames().find(frame => frame.url().includes('natwest-decisioning-visualiser'));
        assert.equal(await firstApply.locator('#nwApplyProfile').isEnabled(), true);
        for (const row of data.rows.filter(row => row.industry === 'fsi')) {
          row.industry = null; row.writable = false;
        }
        data.rows.find(row => row.path.endsWith(model.pathFor('prop'))).value = 82.5;
        await firstVisual.locator('[data-group="profile"] .sig-head').click();
        await firstVisual.locator('#input-account').fill('Premier');
        assert.equal(await firstApply.locator('#nwApplyProfile').isEnabled(), true, 'Typing stages changes without requiring blur');
        const before = writes.length;
        await firstApply.locator('#nwApplyProfile').click();
        await firstApply.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Snapshots accepted'));
        assert.equal(writes.length, before + 1);
        assert.equal(writes.at(-1).industry, 'fsi');
        assert.ok(writes.at(-1).updates.some(update => update.path === model.pathFor('account') && update.value === 'Premier'));
        assert.ok(writes.at(-1).updates.some(update => update.path === 'industryFsi.primaryBankingChannel' && update.value === 'mobile'));
        assert.equal(data.rows.find(row => row.path.endsWith(model.pathFor('prop'))).value, 82.5, 'Unedited profile scores must not be overwritten by simulator defaults');
        assert.equal(await firstVisual.evaluate(() => window.NatwestDecisioningVisualiser.getState().prop), 82.5);
      } finally { await firstApply.close(); data = fixture(); writes.length = 0; }
    });
    await t.test('initial Apply without edits only loads; numeric input enables Apply immediately; on-demand lookup rejects non-test profiles', async () => {
      const firstApply = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
      await firstApply.route('https://**', route => route.abort());
      try {
        await firstApply.goto(base + '/profile-viewer/natwest-decisioning-demo.html');
        await firstApply.waitForFunction(() => document.getElementById('nwDecisioningFrame').contentDocument.documentElement.dataset.nwWired === 'true');
        await firstApply.locator('#nwApplyProfile').click();
        await firstApply.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Test profile loaded.'));
        assert.equal(writes.length, 0);
        assert.equal(await firstApply.locator('#nwApplyProfile').isDisabled(), true);
        const firstVisual = firstApply.frames().find(frame => frame.url().includes('natwest-decisioning-visualiser'));
        await firstVisual.locator('[data-group="scores"] .sig-head').click();
        await firstVisual.locator('#input-prop').fill('83.75');
        assert.equal(await firstApply.locator('#nwApplyProfile').isEnabled(), true);
        assert.equal(await firstVisual.evaluate(() => window.NatwestDecisioningVisualiser.getState().prop), 83.75);
        await firstApply.locator('#nwApplyProfile').click();
        await firstApply.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Snapshots accepted'));
        assert.ok(writes[0].updates.some(update => update.path === model.pathFor('prop') && update.value === 83.75 && update.valueType === 'number'));
        writes.length = 0;
        data.rows.find(row => row.path === 'testProfile').value = false;
        await firstApply.reload();
        await firstApply.waitForFunction(() => document.getElementById('nwDecisioningFrame').contentDocument.documentElement.dataset.nwWired === 'true');
        const nextVisual = firstApply.frames().find(frame => frame.url().includes('natwest-decisioning-visualiser'));
        await nextVisual.locator('[data-group="profile"] .sig-head').click();
        await nextVisual.locator('#input-account').fill('Premier');
        await firstApply.locator('#nwApplyProfile').click();
        await firstApply.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('Only AEP test profiles'));
        assert.equal(writes.length, 0);
        assert.equal(await firstApply.locator('#nwApplyProfile').isDisabled(), true);
      } finally { await firstApply.close(); data = fixture(); writes.length = 0; }
    });
    await t.test('three panes match BA geometry, initially collapsed, keyboard-resizable', async () => {
      assert.equal(await visual.locator('.sig.collapsed').count(), 6);
      assert.equal(await visual.locator('.obj').count(), 7);
      assert.equal(await visual.locator('.r-nba.collapsed').count(), 1);
      const bounds = await visual.evaluate(() => ['.p-sig', '.p-res', '.mail'].map(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect(); return { x: rect.x, width: rect.width, height: rect.height };
      }));
      assert.ok(bounds[0].width >= 360 && bounds[0].width <= 400);
      assert.ok(bounds[0].x < bounds[1].x && bounds[1].x < bounds[2].x);
      assert.equal(bounds[2].width, 620);
      const before = bounds[0].width;
      await visual.locator('#gut0').focus(); await page.keyboard.press('ArrowRight');
      assert.equal(await visual.locator('.p-sig').evaluate(el => el.getBoundingClientRect().width), before + 24);
      await visual.locator('#gut0').dblclick();
      await visual.getByRole('button', { name: 'Expand all', exact: true }).click();
      assert.equal(await visual.locator('.obj.open').count(), 7);
      await visual.getByRole('button', { name: 'Collapse all', exact: true }).click();
      if (process.env.AEP_DEMO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.AEP_DEMO_SCREENSHOT_DIR, 'natwest-web-desktop.png') });
    });
    await t.test('desktop/mobile are the same email; tabs, history and suppression work', async () => {
      await visual.getByRole('tab', { name: 'Email · Desktop', exact: true }).click();
      await page.waitForFunction(() => location.search === '?channel=email');
      await visual.locator('#mailFrame').waitFor({ state: 'visible' });
      await visual.getByRole('tab', { name: 'Email · Mobile', exact: true }).click();
      await page.waitForFunction(() => location.search === '?channel=mobile');
      const mobileWidth = await visual.locator('#mailFrame').evaluate(el => parseFloat(getComputedStyle(el).width));
      assert.equal(mobileWidth, 390);
      if (process.env.AEP_DEMO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.AEP_DEMO_SCREENSHOT_DIR, 'natwest-email-mobile.png') });
      await page.goBack();
      assert.equal(await visual.getByRole('tab', { name: 'Email · Desktop', exact: true }).getAttribute('aria-selected'), 'true');
      await visual.getByRole('button', { name: 'Contact hold', exact: true }).click();
      assert.equal(await visual.locator('#mailEmpty').isVisible(), true);
      assert.equal(await visual.locator('#mailFrame').isVisible(), false);
      await visual.getByRole('button', { name: 'Everyday banking', exact: true }).click();
      assert.equal(await visual.locator('#mailEmpty').isVisible(), false);
    });
    await t.test('lookup, schema refusal, full snapshots, readback lag and manual live display', async () => {
      await page.getByRole('button', { name: 'Look up profile', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Test profile loaded'));
      await visual.locator('[data-group="profile"] .sig-head').click();
      await visual.locator('#input-account').fill('Savings-linked'); await visual.locator('#input-account').blur();
      assert.equal(await page.locator('#nwApplyProfile').isEnabled(), true);
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      assert.match(await page.locator('#nwProfileStatus').textContent(), /Apply staged/);
      missingSchema = true;
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('Schema field missing'));
      assert.match(await page.locator('#nwProfileStatus').textContent(), /Sandbox: fixture; dataflow: fsi; schema: fsi-schema/);
      assert.equal(writes.length, 0);
      missingSchema = false; wrongSchemaType = true;
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('Schema type or allowed values'));
      assert.equal(writes.length, 0);
      wrongSchemaType = false; lag = true;
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Snapshots accepted'));
      assert.equal(writes.length, 1);
      assert.ok(writes[0].updates.some(update => update.path === 'industryFsi.primaryBankingChannel' && update.value === 'mobile'));
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('not yet visible'));
      assert.equal(await page.evaluate(() => window.__decisions), 0);
      data.rows.find(row => row.path.endsWith(model.pathFor('account'))).value = 'Savings-linked'; lag = false;
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      await page.waitForFunction(() => window.__displays.length === 1);
      assert.equal(await visual.evaluate(() => document.getElementById('mailFrame').contentDocument.querySelector('h1').textContent), 'Your live NatWest next step');
      assert.equal(await page.evaluate(() => window.__displays[0].xdm.eventType), 'decisioning.propositionDisplay');
      const display = await page.evaluate(() => window.__displays[0].xdm);
      assert.equal(display._experience.decisioning.propositionEventType.display, 1);
      assert.equal(typeof display._experience.decisioning.propositionEventType.display, typeof eventSample._experience.decisioning.propositionEventType.display);
      assert.equal(display._experience.decisioning.propositions[0].items[0].name, 'Fixture savings offer');
      assert.equal(display._experience.decisioning.propositions[0].items[0].itemSelection.selectionDetail.strategyName, 'Fixture banking strategy');
      await visual.getByRole('tab', { name: 'Web', exact: true }).click();
      assert.equal(await visual.locator('#webTitle').textContent(), 'Your live NatWest next step');
      assert.equal(await page.evaluate(() => window.__displays.length), 1);
      missingHero = true;
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('received 0'));
      assert.equal(await page.evaluate(() => window.__displays.length), 1);
      assert.equal(await visual.locator('#webTitle').textContent(), 'Your live NatWest next step');
      missingHero = false;
    });
    await t.test('failed images and superseded profile contexts never send a display', async () => {
      badImage = true;
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('decoded'));
      assert.equal(await page.evaluate(() => window.__displays.length), 1);
      assert.equal(await visual.locator('#webTitle').textContent(), 'Your live NatWest next step');
      badImage = false;
      await page.setViewportSize({ width: 390, height: 500 });
      await visual.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('not visible'));
      assert.equal(await page.evaluate(() => window.__displays.length), 1);
      await page.setViewportSize({ width: 1800, height: 1100 });
      let release;
      decisionGate = new Promise(resolve => { release = resolve; });
      const before = decisionsRequested;
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      try {
        const deadline = Date.now() + 6000;
        while (decisionsRequested === before && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
        assert.ok(decisionsRequested > before, 'Fixture decision was requested');
        await page.locator('#customerEmail').fill('new-context@example.invalid');
      } finally { release(); decisionGate = null; }
      await page.waitForFunction(() => !document.getElementById('nwRunDecision').disabled);
      assert.equal(await page.evaluate(() => window.__displays.length), 1);
      assert.notEqual(await visual.locator('#webTitle').textContent(), 'Your live NatWest next step');
      await page.locator('#customerEmail').fill('natwest-fixture@example.invalid');
      await page.getByRole('button', { name: 'Look up profile', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Test profile loaded'));
    });
    await t.test('write failures are explicit; non-test profiles cannot write or decide', async () => {
      updateFailure = true;
      await visual.locator('#input-account').fill('Premier'); await visual.locator('#input-account').blur();
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('Fixture update rejected'));
      updateFailure = false;
      data.rows.find(row => row.path === 'testProfile').value = false;
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('Only AEP test profiles'));
      assert.equal(writes.length, 2);
      await page.locator('#customerEmail').fill('different-fixture@example.invalid');
      await page.getByRole('button', { name: 'Look up profile', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('read-only'));
      assert.equal(await page.locator('#nwApplyProfile').isDisabled(), true);
      const before = await page.evaluate(() => window.__decisions);
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('Only AEP test profiles'));
      assert.equal(await page.evaluate(() => window.__decisions), before);
    });
    await t.test('partial multi-industry writes require readback and retry only remaining staged fields', async () => {
      data = fixture();
      await page.locator('#customerEmail').fill('natwest-fixture@example.invalid');
      await page.getByRole('button', { name: 'Look up profile', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Test profile loaded'));
      await visual.locator('#input-account').fill('Savings-linked'); await visual.locator('#input-account').blur();
      await visual.locator('[data-group="scores"] .sig-head').click();
      await visual.locator('#input-prop').fill('85.25'); await visual.locator('#input-prop').blur();
      updateFailureIndustry = 'generic';
      const before = writes.length;
      maximumScore = 80;
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('Schema type or allowed values'));
      assert.equal(writes.length, before);
      maximumScore = null;
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('update is partial'));
      assert.equal(writes.length, before + 2);
      assert.equal(await page.locator('#nwApplyProfile').isDisabled(), true);
      updateFailureIndustry = '';
      await page.getByRole('button', { name: 'Look up profile', exact: true }).click();
      await page.waitForFunction(() => !document.getElementById('nwApplyProfile').disabled);
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Snapshots accepted'));
      assert.equal(writes.length, before + 3);
      assert.equal(writes.at(-1).industry, 'generic');
    });
    await t.test('themes and narrow layouts have no horizontal overflow', async () => {
      for (const width of [1800, 1600, 390]) for (const dark of [false, true]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(dark => {
          if (dark) document.documentElement.setAttribute('data-aep-theme', 'dark'); else document.documentElement.removeAttribute('data-aep-theme');
        }, dark);
        await visual.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth);
        assert.equal(await visual.evaluate(() => document.documentElement.getAttribute('data-aep-theme')), dark ? 'dark' : null);
      }
    });
    await t.test('boolean holdings and root consent write with their real types and no tenant consent duplicate', async () => {
      await page.setViewportSize({ width: 1800, height: 1100 });
      await page.mouse.move(1000, 100);
      await page.getByRole('button', { name: 'Look up profile', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Test profile loaded'));
      await visual.locator('[data-group="holdings"] .sig-head').click();
      await visual.locator('[aria-labelledby="label-savings"]').getByRole('button', { name: 'Yes', exact: true }).click();
      const consentHead = visual.locator('[data-group="consent"] .sig-head');
      if (await consentHead.getAttribute('aria-expanded') === 'false') await consentHead.click();
      await visual.locator('#input-consent').fill('n'); await visual.locator('#input-consent').blur();
      const before = writes.length;
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Snapshots accepted'));
      const updates = writes.slice(before).flatMap(write => write.updates);
      assert.ok(updates.some(update => update.path === model.pathFor('savings') && update.value === true && update.valueType === 'boolean'));
      assert.ok(updates.some(update => update.path === 'consents.marketing.email.val' && update.value === 'n'));
      assert.ok(!updates.some(update => update.path.startsWith('_demoemea.consents.')));
      assert.equal(await visual.locator('#mailEmpty').isVisible(), true);
      const decisions = await page.evaluate(() => window.__decisions);
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('requires explicit y consent'));
      assert.equal(await page.evaluate(() => window.__decisions), decisions);
    });
    await t.test('actual shared environment loader initializes the complete shell without live services', async () => {
      mockLoader = false; data = fixture();
      drawerEvents = [...drawerEvents, ...[1, 2].map(index => ({
        eventType: index === 1 ? 'message.tracking' : 'web.webpagedetails.pageViews', eventName: index === 1 ? 'Message tracking' : 'Banking guidance ' + index,
        timestamp: eventTime - index * 20000,
        rows: [{ path: 'web.webPageDetails.name', value: 'Banking guidance ' + index }],
      }))];
      data.rows = data.rows.filter(row => !row.path.endsWith(model.pathFor('mortgage')));
      Object.assign(data.rows.find(row => row.path.endsWith(model.pathFor('loan'))), { value: '', valueType: 'null' });
      const smoke = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
      const smokeErrors = [];
      smoke.on('pageerror', error => smokeErrors.push(error.message));
      await smoke.route('https://**', route => route.abort());
      await smoke.goto(base + '/profile-viewer/natwest-decisioning-demo.html?channel=web');
      await smoke.waitForFunction(() => window.envBar && window.envBar.getConfig && window.DemoProfileDrawer);
      await smoke.waitForFunction(() => document.getElementById('nwDecisioningFrame').contentDocument.documentElement.dataset.nwWired === 'true');
      assert.ok(!await smoke.locator('#nwProfileStatus').textContent().then(text => text.startsWith('Demo initialization failed')));
      await smoke.waitForSelector('#nwProfileHero', { state: 'attached' });
      const drawerHeight = () => smoke.locator('#profileDrawer').evaluate(el => el.getBoundingClientRect().height);
      const unloadedHeight = await drawerHeight();
      assert.ok(unloadedHeight <= 561 && unloadedHeight >= 500, 'Unloaded drawer stays approximately five events tall');
      await smoke.evaluate(() => {
        const sandbox = document.getElementById('sandboxSelect');
        sandbox.add(new Option('Fixture sandbox', 'fixture'));
        sandbox.value = 'fixture';
        window.AepGlobalSandbox.setSelected('fixture');
      });
      await smoke.locator('#customerEmail').fill(data.profileEmail);
      await smoke.locator('#queryProfileBtn').click();
      await smoke.waitForFunction(() => !document.getElementById('nwProfileStatus').textContent.startsWith('Looking up'));
      assert.match(await smoke.locator('#nwProfileStatus').textContent(), /^Test profile loaded/);
      await smoke.waitForFunction(() => document.getElementById('nwPhName').textContent === 'Sam Fixture');
      await smoke.getByRole('button', { name: 'Hide environment bar', exact: true }).click();
      await smoke.evaluate(() => document.body.classList.add('mod-demo-page--profile-open'));
      assert.equal(await smoke.locator('#nwPhAccount').textContent(), 'Current account');
      assert.equal(await smoke.locator('#nwPhPhone').textContent(), '+440000000000');
      assert.equal(await smoke.locator('#nwProfileHero [data-kpi="offers"] [data-v]').textContent(), '2');
      assert.equal(await smoke.locator('#nwProfileHero [data-kpi="interest"] [data-v]').textContent(), 'Savings');
      assert.equal(await smoke.locator('#nwPhSignal-savings').textContent(), 'No');
      assert.equal(await smoke.locator('#nwPhSignal-mortgage').textContent(), 'Not set');
      assert.equal(await smoke.locator('#nwPhSignal-loan').textContent(), 'Not set');
      assert.equal(await smoke.locator('#nwPhCase').textContent(), 'None');
      assert.equal(await drawerHeight(), unloadedHeight, 'Loaded profile must not increase drawer height');
      assert.equal(await smoke.locator('#profileDrawerEvents .aep-profile-drawer-event-item').count(), 5);
      await smoke.getByRole('tab', { name: 'Banking', exact: true }).click();
      assert.equal(await smoke.locator('#nwPhPanel-1').isVisible(), true);
      assert.equal(await smoke.locator('#nwPhSignal-investment').isVisible(), true);
      if (process.env.AEP_DEMO_SCREENSHOT_DIR) await smoke.screenshot({
        path: path.join(process.env.AEP_DEMO_SCREENSHOT_DIR, 'natwest-compact-banking.png'),
      });
      await smoke.keyboard.press('ArrowRight');
      assert.equal(await smoke.getByRole('tab', { name: 'Identity', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await smoke.locator('#nwPhEcid').isVisible(), true);
      await smoke.keyboard.press('Home');
      assert.equal(await smoke.getByRole('tab', { name: 'Contact', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await smoke.locator('#nwPhPhone').isVisible(), true);
      assert.equal(await smoke.locator('#nwPhPanel-2').isVisible(), false);
      await smoke.evaluate(() => {
        const visual = document.getElementById('nwDecisioningFrame').contentWindow.NatwestDecisioningVisualiser;
        visual.setState({ ...visual.getState(), account: 'Staged only' });
        window.NatwestProfileHero.render();
      });
      assert.equal(await smoke.locator('#nwPhAccount').textContent(), 'Current account');
      assert.equal(await smoke.locator('.aep-profile-drawer-block--customer').isVisible(), false);
      assert.equal(await smoke.locator('#nwPhEcid').textContent(), data.ecid);
      assert.ok(await smoke.locator('#nwPhEcidReset button').count());
      assert.ok((await smoke.locator('#profileDrawerEvents').textContent()).includes('Offer: Savings <offer>'));
      assert.ok((await smoke.locator('#profileDrawerEvents').textContent()).includes('Strategy: Banking strategy'));
      assert.equal(await smoke.locator('#profileDrawerEvents .aep-profile-drawer-event-thumb--message-tracking svg').count(), 1);
      assert.equal(await smoke.locator('#profileDrawerEvents .aep-profile-drawer-event-thumb--message-tracking svg path').last().getAttribute('d'), 'm16 19 2 2 4-4');
      await smoke.locator('#profileDrawerEventsStoryOpen').click();
      await smoke.locator('.dpj-root').waitFor({ state: 'visible' });
      assert.equal(await smoke.locator('.dpj-node').count(), 5);
      await smoke.locator('[data-dpj-sel="4"]').click();
      assert.ok((await smoke.locator('.dpj-dbody').textContent()).includes('Savings <offer>'));
      assert.ok((await smoke.locator('.dpj-dbody').textContent()).includes('Banking strategy'));
      await smoke.evaluate(() => window.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile());
      assert.equal(await smoke.locator('.dpj-drawer').getAttribute('aria-hidden'), 'false');
      await smoke.locator('[data-dpj-view="B"]').click();
      assert.equal(await smoke.locator('.dpj-lane').count(), 4);
      await smoke.locator('[data-dpj-view="C"]').click();
      assert.equal(await smoke.locator('.dpj-dec').count(), 1);
      assert.ok((await smoke.locator('.dpj-dec').textContent()).includes('Email'));
      await smoke.getByRole('button', { name: 'Close journey', exact: true }).click();
      await smoke.locator('.aep-profile-drawer-identity-graph-heading-open').click();
      await smoke.locator('.aep-profile-drawer-identity-graph-modal-dialog').waitFor({ state: 'visible' });
      assert.ok(await smoke.locator('.aep-profile-drawer-identity-graph-modal-slider').count());
      await smoke.getByRole('button', { name: 'Close identity graph', exact: true }).click();
      if (process.env.AEP_DEMO_SCREENSHOT_DIR) await smoke.screenshot({ path: path.join(process.env.AEP_DEMO_SCREENSHOT_DIR, 'natwest-new-profile-drawer.png') });
      for (const width of [1800, 1280, 1024, 390]) for (const dark of [false, true]) {
        await smoke.setViewportSize({ width, height: width === 1800 ? 1100 : 740 });
        await smoke.evaluate(dark => {
          if (dark) document.documentElement.setAttribute('data-aep-theme', 'dark');
          else document.documentElement.removeAttribute('data-aep-theme');
        }, dark);
        assert.ok(await smoke.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok(await drawerHeight() <= 561, 'Drawer remains capped across themes and viewport sizes');
        for (const label of ['Banking', 'Identity', 'Contact']) {
          await smoke.getByRole('tab', { name: label, exact: true }).click();
          assert.ok(await smoke.locator('#nwProfileHero [role="tabpanel"]:not([hidden])').evaluate(el => {
            const panel = el.getBoundingClientRect(), hero = document.getElementById('nwProfileHero').getBoundingClientRect();
            return panel.right <= hero.right + 1 && panel.bottom <= hero.bottom + 1;
          }), 'Profile tab content stays within its bounded area');
        }
        if (process.env.AEP_DEMO_SCREENSHOT_DIR) await smoke.screenshot({
          path: path.join(process.env.AEP_DEMO_SCREENSHOT_DIR, 'natwest-compact-drawer-' + width + '-' + (dark ? 'dark' : 'light') + '.png'),
        });
        await smoke.locator('#profileDrawerEventsStoryOpen').click();
        await smoke.locator('.dpj-root').waitFor({ state: 'visible' });
        assert.ok(await smoke.locator('.dpj-root').evaluate(el => el.getBoundingClientRect().right <= innerWidth));
        await smoke.getByRole('button', { name: 'Close journey', exact: true }).click();
      }
      await smoke.setViewportSize({ width: 1800, height: 1100 });
      await smoke.getByRole('button', { name: 'Show environment bar', exact: true }).click();
      await smoke.getByRole('button', { name: 'Show environment configuration', exact: true }).click();
      await smoke.locator('#customerEmail').fill('different@example.invalid');
      await smoke.waitForFunction(() => document.getElementById('nwPhName').textContent === 'No profile loaded');
      assert.equal(await smoke.locator('#nwPhAccount').textContent(), 'Not loaded');
      assert.equal(await drawerHeight(), unloadedHeight, 'Clearing the profile keeps the drawer height stable');
      assert.ok(!(await smoke.locator('#profileDrawerEvents').textContent()).includes('Savings <offer>'));
      let releaseConsent, consentStarted;
      const consentGate = new Promise(resolve => { releaseConsent = resolve; });
      const consentSeen = new Promise(resolve => { consentStarted = resolve; });
      await smoke.route('**/api/profile/consent?**', async route => {
        consentStarted();
        await consentGate;
        await route.continue();
      });
      await smoke.evaluate(() => {
        window.pendingDrawerLookup = window.DemoProfileDrawer.loadProfileDataForDrawer('old@example.invalid', { sendApplicationLogin: false });
      });
      await consentSeen;
      await smoke.evaluate(() => window.DemoProfileDrawer.clearDrawerVisitorState());
      releaseConsent();
      assert.equal(await smoke.evaluate(() => window.pendingDrawerLookup), false);
      assert.equal(await smoke.locator('#nwPhName').textContent(), 'No profile loaded');
      await smoke.unroute('**/api/profile/consent?**');
      await smoke.goto(base + '/profile-viewer/natwest-decisioning-demo.html?nwDrawer=classic&journey=classic');
      await smoke.waitForFunction(() => document.getElementById('nwDecisioningFrame').contentDocument.documentElement.dataset.nwWired === 'true');
      assert.equal(await smoke.locator('#nwProfileHero').count(), 0);
      assert.equal(await smoke.locator('body.decisioning-journey-concepts').count(), 0);
      await smoke.evaluate(events => {
        window.DemoProfileDrawer.patchLastProfileOrUpdate({ firstName: 'Sam', events, eventsStory: events });
        document.body.classList.add('mod-demo-page--profile-open');
      }, drawerEvents);
      await smoke.getByRole('button', { name: 'Hide environment bar', exact: true }).first().click();
      await smoke.locator('#profileDrawerEventsStoryOpen').click();
      await smoke.locator('.aep-profile-drawer-events-story-track').waitFor({ state: 'visible' });
      assert.equal(await smoke.locator('.dpj-root').count(), 0);
      assert.ok((await smoke.locator('.aep-profile-drawer-events-story-track').textContent()).includes('Decisioning'));
      assert.deepEqual(smokeErrors, []);
      if (process.env.AEP_DEMO_SCREENSHOT_DIR) {
        const hide = smoke.getByRole('button', { name: 'Hide environment bar', exact: true });
        if (await hide.count()) await hide.first().click();
        await smoke.screenshot({ path: path.join(process.env.AEP_DEMO_SCREENSHOT_DIR, 'natwest-real-shell.png') });
      }
      await smoke.close();
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
