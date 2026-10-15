const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const model = require('../web/profile-viewer/natwest-decisioning-model');
const { getManifestForIndustry } = require('../functions/profileCoreV2Manifest');
const root = path.resolve(__dirname, '..', 'web');

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
        path: '_demoemea.' + model.pathFor(name), value, valueType: typeof value === 'number' ? 'number' : 'string',
        writable: true, industry: name === 'prop' ? 'generic' : 'fsi',
      })),
    ],
  };
}
test('all banking fields have typed FSI manifest leaves; propensity remains generic', () => {
  const manifest = getManifestForIndustry('fsi');
  for (const [name, value] of Object.entries(model.defaults)) {
    assert.equal(manifest[model.pathFor(name)].type, typeof value === 'number' ? name === 'prop' ? 'number' : 'integer' : 'string');
    assert.ok(manifest[model.pathFor(name)].title);
  }
});
test('priority, contact safety, service permissions and exact cap/recency boundaries', () => {
  const evaluate = state => model.evaluate({ ...model.defaults, ...state }).winner?.id || null;
  assert.equal(evaluate({ operations: 'fraud', cases: 'open' }), 'protect');
  assert.equal(evaluate({ safe: 'no', operations: 'fraud' }), null);
  assert.equal(evaluate({ consent: 'none', operations: 'fraud' }), null);
  assert.equal(evaluate({ consent: 'service', cases: 'open', fatigue: 6 }), 'service');
  assert.equal(evaluate({ consent: 'service' }), null);
  assert.equal(evaluate({ fatigue: 2 }), 'convert');
  assert.equal(evaluate({ fatigue: 3 }), null);
  assert.equal(evaluate({ account: 'none', recency: 48 }), 'convert');
  assert.equal(evaluate({ account: 'none', recency: 49 }), 'engage');
  assert.equal(evaluate({ application: 'started', documents: 'required' }), 'prepare');
  assert.equal(evaluate({ application: 'approved' }), 'complete');
  assert.equal(evaluate({ account: 'savings', product: 'savings' }), 'engage');
  assert.equal(evaluate({ available: 'no' }), 'engage');
});
test('presets validate and NBA scores sum deterministically', () => {
  for (const [, preset] of model.scenarios) {
    const a = model.evaluate({ ...model.defaults, ...preset });
    assert.deepEqual(a, model.evaluate(a.state));
    for (const candidate of a.candidates) assert.equal(candidate.score, Object.values(candidate.parts).reduce((a, b) => a + b, 0));
  }
  assert.throws(() => model.validate({ fatigue: 3.2 }), /Invalid/);
  assert.throws(() => model.validate({ account: 'Gold' }), /Invalid/);
});
test('full industry snapshots preserve unrelated values and types, without cross-stream leakage', () => {
  const data = fixture(), next = { ...model.defaults, account: 'savings', prop: 3 };
  const batch = model.buildSnapshots(data, next, model.defaults);
  assert.equal(batch.snapshots.length, 2);
  const fsi = batch.snapshots.find(group => group.industry === 'fsi').updates;
  assert.ok(fsi.some(update => update.path === 'industryFsi.primaryBankingChannel' && update.value === 'mobile'));
  assert.ok(fsi.some(update => update.path === 'industryFsi.financialProducts.checking' && update.value === true));
  assert.ok(fsi.some(update => update.path === 'natwestDecisioning.accountType' && update.value === 'savings'));
  assert.ok(!fsi.some(update => update.path === 'scoring.core.propensityScore'));
  const generic = batch.snapshots.find(group => group.industry === 'generic').updates;
  assert.ok(generic.some(update => update.path === 'person.name.firstName' && update.value === 'Sam'));
  assert.ok(!generic.some(update => update.path.startsWith('natwestDecisioning.')));
  assert.equal(model.differences(data.rows, batch.expected).length, 2);
  assert.throws(() => model.buildSnapshots(data, model.defaults, model.defaults), /No profile/);
  data.industries.fsi.writable = false;
  assert.throws(() => model.buildSnapshots(data, next, model.defaults), /setup/);
});
test('profile values are parsed by type, including legacy propensity and FSI account fallback', () => {
  const data = fixture();
  data.rows = data.rows.filter(row => !row.path.includes('natwestDecisioning.accountType'));
  data.rows.find(row => row.path.endsWith('propensityScore')).value = '85';
  assert.equal(model.readState(data.rows).account, 'current');
  assert.equal(model.readState(data.rows).prop, 3);
  for (const [score, expected] of [[0, 1], [34, 1], [35, 2], [65, 3]]) {
    data.rows.find(row => row.path.endsWith('propensityScore')).value = score;
    assert.equal(model.readState(data.rows).prop, expected);
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
  let badImage = false, decisionGate = null, decisionsRequested = 0, updateFailureIndustry = '';
  const writes = [];
  const schema = () => {
    const properties = {};
    for (const [name, value] of Object.entries(model.defaults)) {
      let current = properties;
      const parts = model.pathFor(name).split('.');
      for (const part of parts.slice(0, -1)) {
        current[part] ||= { type: 'object', properties: {} }; current = current[part].properties;
      }
      current[parts.at(-1)] = { type: typeof value === 'number' ? 'number' : 'string' };
    }
    if (missingSchema) delete properties.natwestDecisioning.properties.accountType;
    return { properties: { _demoemea: { properties } } };
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
    if (url.pathname === '/api/aep') return json({ platform_response: schema(), status: 200 });
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
      await visual.locator('[aria-labelledby="label-account"]').getByRole('button', { name: 'Savings', exact: true }).click();
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      assert.match(await page.locator('#nwProfileStatus').textContent(), /Apply staged/);
      missingSchema = true;
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('Schema field missing'));
      assert.equal(writes.length, 0);
      missingSchema = false; lag = true;
      await page.getByRole('button', { name: 'Apply profile changes', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.startsWith('Snapshots accepted'));
      assert.equal(writes.length, 1);
      assert.ok(writes[0].updates.some(update => update.path === 'industryFsi.primaryBankingChannel' && update.value === 'mobile'));
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('nwProfileStatus').textContent.includes('not yet visible'));
      assert.equal(await page.evaluate(() => window.__decisions), 0);
      data.rows.find(row => row.path.endsWith('natwestDecisioning.accountType')).value = 'savings'; lag = false;
      await page.getByRole('button', { name: 'Run live image decision', exact: true }).click();
      await page.waitForFunction(() => window.__displays.length === 1);
      assert.equal(await visual.evaluate(() => document.getElementById('mailFrame').contentDocument.querySelector('h1').textContent), 'Your live NatWest next step');
      assert.equal(await page.evaluate(() => window.__displays[0].xdm.eventType), 'decisioning.propositionDisplay');
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
      await visual.locator('[aria-labelledby="label-account"]').getByRole('button', { name: 'Mortgage', exact: true }).click();
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
      await visual.locator('[aria-labelledby="label-account"]').getByRole('button', { name: 'Savings', exact: true }).click();
      await visual.locator('[aria-labelledby="label-prop"]').getByRole('button', { name: 'High', exact: true }).click();
      updateFailureIndustry = 'generic';
      const before = writes.length;
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
    await t.test('actual shared environment loader initializes the complete shell without live services', async () => {
      mockLoader = false; data = fixture();
      const smoke = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
      const smokeErrors = [];
      smoke.on('pageerror', error => smokeErrors.push(error.message));
      await smoke.route('https://**', route => route.abort());
      await smoke.goto(base + '/profile-viewer/natwest-decisioning-demo.html?channel=web');
      await smoke.waitForFunction(() => window.envBar && window.envBar.getConfig && window.DemoProfileDrawer);
      await smoke.waitForFunction(() => document.getElementById('nwDecisioningFrame').contentDocument.documentElement.dataset.nwWired === 'true');
      assert.ok(!await smoke.locator('#nwProfileStatus').textContent().then(text => text.startsWith('Demo initialization failed')));
      assert.deepEqual(smokeErrors, []);
      if (process.env.AEP_DEMO_SCREENSHOT_DIR) {
        const hide = smoke.getByRole('button', { name: 'Hide environment bar', exact: true });
        if (await hide.count()) await hide.click();
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
