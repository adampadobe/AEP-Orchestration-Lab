const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const model = require('../web/profile-viewer/british-airways-decisioning-model');
const { getManifestForIndustry } = require('../functions/profileCoreV2Manifest');
const { resolveIndustryForPath } = require('../functions/industryAttributeMap');
const state = {
  tier: 'gold', prop: '3', engage: 'dormant', booking: 'travelling', days: 2,
  docs: 'verified', anc: 'added', disruption: 'delay', caseState: 'claim',
  intent: 'abandoned', recency: 24, fare: 'unavailable', consent: 'service', safe: 'no', fatigue: 3,
};
const rows = [
  { path: 'testProfile', value: 'true', valueType: 'boolean', industry: 'generic', writable: true },
  { path: 'person.name.firstName', value: 'Marcus', valueType: 'string', industry: 'generic', writable: true },
  { path: '_demoemea.scoring.core.propensityScore', value: '50', valueType: 'number', industry: 'generic', writable: true },
  { path: '_demoemea.hotel.bookingDetails.roomNumber', value: '0012', valueType: 'string', industry: 'travel', writable: true },
  { path: '_demoemea.industryFsi.accountStatus', value: 'active', valueType: 'string', industry: 'fsi', writable: true },
  { path: '_id', value: 'do-not-stream', valueType: 'string', writable: false },
  { path: '_demoemea.airlineCustomer.loyaltyTier', value: 'Gold', valueType: 'string', industry: 'travel', writable: true },
  { path: '_demoemea.loyaltyDetails.level', value: 'Platinum', valueType: 'string', industry: 'generic', writable: true },
  { path: '_demoemea.britishAirwaysDecisioning.disruptionSeverity', value: 'delay', valueType: 'string', industry: 'travel', writable: true },
  { path: '_demoemea.travelReservations.flightReservations.flightClass', value: 'Business', valueType: 'string', industry: 'travel', writable: true },
];
test('every BA control has a typed Travel schema leaf and ownership', () => {
  const schema = getManifestForIndustry('travel').britishAirwaysDecisioning.properties;
  assert.equal(Object.keys(schema).length, 13);
  Object.values(model.fields).forEach(leaf => {
    assert.ok(schema[leaf]);
    assert.equal(resolveIndustryForPath('_otherTenant.britishAirwaysDecisioning.' + leaf).industry, 'travel');
  });
  assert.equal(getManifestForIndustry('generic').britishAirwaysDecisioning, undefined);
  assert.equal(getManifestForIndustry('travel')['airlineCustomer.loyaltyTier'].type, 'string');
  assert.equal(resolveIndustryForPath('_demoemea.airlineCustomer.loyaltyTier').industry, 'travel');
  assert.equal(getManifestForIndustry('travel').travelReservations.properties.flightReservations.properties.flightDisruption.properties.disruptionType.type, 'string');
  assert.equal(getManifestForIndustry('travel').travelReservations.properties.flightReservations.properties.bookingStatus.type, 'string');
  assert.equal(resolveIndustryForPath('_demoemea.' + model.bookingPath).industry, 'travel');
});
test('full snapshots preserve siblings, industry groups and scalar types', () => {
  const snapshots = model.buildSnapshots(rows, state);
  const travel = snapshots.find(group => group.industry === 'travel').updates;
  assert.equal(travel.find(row => row.path === 'hotel.bookingDetails.roomNumber').value, '0012');
  assert.equal(travel.find(row => row.path.endsWith('messages7d')).value, 3);
  assert.equal(travel.find(row => row.path === model.disruptionPath).value, state.disruption);
  assert.equal(travel.find(row => row.path === 'britishAirwaysDecisioning.disruptionSeverity').value, 'delay');
  const generic = snapshots.find(group => group.industry === 'generic').updates;
  assert.equal(generic.find(row => row.path === 'scoring.core.propensityScore').value, 3);
  assert.equal(generic.find(row => row.path === 'testProfile').value, true);
  assert.ok(generic.some(row => row.path === 'person.name.firstName'));
  assert.ok(snapshots.some(group => group.industry === 'fsi'));
  assert.ok(!snapshots.some(group => group.updates.some(row => row.path === '_id')));
  const readback = snapshots.flatMap(group => group.updates);
  assert.deepEqual(model.readState(readback), state);
});
test('missing dataflows fail; configured Travel supports a first BA write', () => {
  assert.throws(() => model.buildSnapshots([], state), /dataflow is missing/);
  assert.equal(model.buildSnapshots([], state, { generic: { writable: true }, travel: { writable: true } }).length, 2);
});
test('disruption readback accepts equivalent cancellation labels without accepting stale or missing values', () => {
  const expected = [{ path: model.disruptionPath, value: 'cancelled' }];
  for (const value of ['cancelled', 'canceled', 'CANCELLATION', ' Cancelled ']) {
    const input = [{ path: '_demoemea.' + model.disruptionPath, value, valueType: 'string' }];
    assert.equal(model.readState(input).disruption, 'cancelled');
    assert.deepEqual(model.verificationDifferences(input, expected), []);
  }
  for (const value of ['none', 'DELAY', 'unknown']) {
    assert.equal(model.verificationDifferences([{ path: model.disruptionPath, value }], expected).length, 1);
  }
  assert.deepEqual(model.verificationDifferences([], expected), [
    { path: model.disruptionPath, expected: 'cancelled', actual: undefined },
  ]);
  assert.deepEqual(model.verificationDifferences([{ path: model.disruptionPath, value: 'DELAY' }], [
    { path: model.disruptionPath, value: 'delay' },
  ]), []);
  assert.equal(model.verificationDifferences([{ path: model.bookingPath, value: 'UPCOMING' }], [
    { path: model.bookingPath, value: 'upcoming' },
  ]).length, 1, 'other fields still require exact saved values');
});
test('ingestion confirmation checks decision fields only', () => {
  assert.equal(model.isDecisionPath('britishAirwaysDecisioning.daysToDeparture'), true);
  assert.equal(model.isDecisionPath(model.bookingPath), true);
  assert.equal(model.isDecisionPath(model.disruptionPath), true);
  assert.equal(model.isDecisionPath('scoring.core.propensityScore'), true);
  assert.equal(model.isDecisionPath('airlineCustomer.loyaltyTier'), false);
  assert.equal(model.isDecisionPath('person.name.firstName'), false);
});
test('booking reads and writes the Travel field, preserves legacy journeyStage and excludes generic writes', () => {
  const legacy = { path: '_demoemea.britishAirwaysDecisioning.journeyStage', value: 'completed', valueType: 'string', industry: 'travel', writable: true };
  const booking = { path: '_demoemea.' + model.bookingPath, value: 'upcoming', valueType: 'string', industry: 'generic', writable: true };
  assert.equal(model.readState([legacy]).booking, undefined);
  assert.equal(model.readState([legacy, booking]).booking, 'upcoming');
  const snapshots = model.buildSnapshots([...rows, legacy, booking], state);
  const travel = snapshots.find(group => group.industry === 'travel').updates;
  assert.equal(travel.find(row => row.path === model.bookingPath).value, 'travelling');
  assert.equal(travel.find(row => row.path === 'britishAirwaysDecisioning.journeyStage').value, 'completed');
  assert.ok(!snapshots.find(group => group.industry === 'generic').updates.some(row => row.path === model.bookingPath));
  assert.ok(!model.buildSnapshots(rows, state).find(group => group.industry === 'travel').updates.some(row => row.path === 'britishAirwaysDecisioning.journeyStage'));
});
test('propensity writes exact 1-3 scores and converts legacy scores on Apply', () => {
  const input = rows.map(row => row.path.endsWith('propensityScore') ? { ...row, value: '45' } : row);
  assert.equal(model.readState(input).prop, '2');
  for (const score of [1, 2, 3]) {
    const generic = model.buildSnapshots(input, { ...state, prop: String(score) }).find(group => group.industry === 'generic');
    assert.equal(generic.updates.find(row => row.path.endsWith('propensityScore')).value, score);
    const updated = [{ ...input[2], value: String(score) }];
    assert.equal(model.readState(updated).prop, String(score));
  }
  assert.throws(() => model.buildSnapshots(input, { ...state, prop: 'medium' }), /Propensity must be/);
  assert.throws(() => model.buildSnapshots([{ ...rows[2], value: 'invalid' }], state), /Invalid numeric/);
});
test('airline Gold to Silver updates the exact Travel path without changing generic loyalty', () => {
  const input = rows;
  assert.equal(model.readState(input).tier, 'gold');
  const generic = model.buildSnapshots(input, state, null, state).find(group => group.industry === 'generic');
  assert.equal(generic.updates.find(row => row.path === 'loyaltyDetails.level').value, 'Platinum');
  assert.ok(!generic.updates.some(row => row.path === 'loyalty.tier'));
  const changed = model.buildSnapshots(input, { ...state, tier: 'silver' }, null, state);
  assert.equal(changed.find(group => group.industry === 'travel').updates.find(row => row.path === 'airlineCustomer.loyaltyTier').value, 'Silver');
  assert.equal(changed.find(group => group.industry === 'generic').updates.find(row => row.path === 'loyaltyDetails.level').value, 'Platinum');
});
test('BA rows mis-tagged generic (pre-release ownership) are written only via Travel', () => {
  const input = [...rows, { path: '_demoemea.britishAirwaysDecisioning.messages7d', value: '9', valueType: 'number', industry: 'generic', writable: true }];
  const snapshots = model.buildSnapshots(input, state);
  const generic = snapshots.find(group => group.industry === 'generic').updates;
  assert.ok(!generic.some(row => row.path.startsWith('britishAirwaysDecisioning.')));
  const travel = snapshots.find(group => group.industry === 'travel').updates;
  assert.equal(travel.find(row => row.path.endsWith('messages7d')).value, 3);
});
test('BA top-up script targets only BA leaves with typed schema', () => {
  const script = require('./ensure-ba-decisioning-profile-core-fields.cjs');
  const leaves = script.flattenLeaves(script.baManifest(getManifestForIndustry('travel')));
  assert.equal(Object.keys(leaves).length, 13);
  assert.ok(Object.keys(leaves).every(p => p.startsWith('britishAirwaysDecisioning.')));
  assert.equal(leaves['britishAirwaysDecisioning.daysToDeparture'].type, 'integer');
  assert.throws(() => script.parseArgs([]), /--sandbox/);
});
test('display acceptance: readiness, attribution, supersession and at-most-once attempts', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'profile-viewer', 'british-airways-decisioning.js'), 'utf8')
    .replace('global.envBar.ready().then(init).catch(error => message(\'Demo initialization failed: \' + error.message, true));',
      'global.testApi = { acceptDecision, invalidateDecision };');
  function fixture() {
    const calls = [];
    const logs = [];
    let imageFails = false;
    let renders = 0;
    let previewReady = async () => {};
    const mount = {
      dataset: { cdAppliedRunId: 'run-1' },
      querySelector: selector => selector === 'img'
        ? { getAttribute: () => 'https://example.test/hero.jpg' }
        : { textContent: selector.includes('title') ? 'Title' : 'Description' },
    };
    const api = {
      setDecisionStatus: () => {},
      setDecisionImage: async () => { renders++; await previewReady(); },
    };
    const elements = {
      baDecisioningFrame: { contentDocument: { getElementById: () => mount }, contentWindow: { BaDecisioningVisualiser: api } },
      baApplyProfile: {}, baRunDecision: {}, baProfileStatus: { dataset: {} },
    };
    const win = { location: { href: 'https://example.test/' } };
    const consoleMock = { log: (...args) => logs.push(args), error: (...args) => logs.push(args) };
    class TestImage {
      set src(value) { queueMicrotask(() => imageFails ? this.onerror() : this.onload()); }
    }
    vm.runInNewContext(source, { window: win, document: { getElementById: id => elements[id] }, console: consoleMock,
      Image: TestImage, URL, setTimeout, clearTimeout });
    const detail = {
      runId: 'run-1', requestVersion: 0,
      appliedHero: { runId: 'run-1', newlyApplied: true, target: mount, itemId: 'item-1',
        proposition: { id: 'proposition-1', scope: 'web://example.test#hero-banner', scopeDetails: { nested: { tokens: ['unchanged'] } } } },
      identityMap: { Email: [{ id: 'test@example.test', primary: true }] },
      alloy: async (command, options) => { calls.push({ command, options }); },
    };
    return { win, detail, calls, logs, api, elements,
      imageFails: () => { imageFails = true; },
      readiness: callback => { previewReady = callback; },
      renders: () => renders };
  }
  const successful = fixture();
  let finish;
  successful.readiness(() => new Promise(resolve => { finish = resolve; }));
  const accepting = successful.win.testApi.acceptDecision(successful.detail);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(successful.calls.length, 0, 'must wait for visible preview');
  finish();
  await accepting;
  assert.equal(successful.calls.length, 1);
  assert.ok(successful.logs.some(args => args[0] === '[decisioning-display] Sending display event'));
  assert.equal(successful.calls[0].options.xdm.identityMap, successful.detail.identityMap);
  assert.equal(successful.calls[0].options.xdm._experience.decisioning.propositions[0].scopeDetails,
    successful.detail.appliedHero.proposition.scopeDetails);
  successful.readiness(async () => {});
  await successful.win.testApi.acceptDecision(successful.detail);
  assert.equal(successful.calls.length, 1);
  assert.ok(successful.logs.some(args => String(args[0]).includes('Duplicate display prevented')));

  for (const mutate of [
    f => { f.detail.appliedHero = null; },
    f => { f.detail.appliedHero.newlyApplied = false; },
    f => { f.detail.appliedHero.fallback = true; },
    f => { f.detail.appliedHero.runId = 'previous-run'; },
    f => { delete f.detail.runId; },
    f => { f.detail.requestVersion = -1; },
  ]) {
    const f = fixture();
    mutate(f);
    await f.win.testApi.acceptDecision(f.detail);
    assert.equal(f.calls.length, 0);
    assert.equal(f.renders(), 0);
    assert.ok(f.logs.some(args => args[0] === '[decisioning-display] Display skipped'));
  }
  const badImage = fixture();
  badImage.imageFails();
  await assert.rejects(badImage.win.testApi.acceptDecision(badImage.detail), /could not be loaded/);
  assert.equal(badImage.calls.length, 0);
  assert.equal(badImage.renders(), 0);
  const badPreview = fixture();
  badPreview.readiness(async () => { throw new Error('Preview not ready'); });
  await assert.rejects(badPreview.win.testApi.acceptDecision(badPreview.detail), /Preview not ready/);
  assert.equal(badPreview.calls.length, 0);
  const noConfirmation = fixture();
  noConfirmation.api.setDecisionImage = () => undefined;
  await assert.rejects(noConfirmation.win.testApi.acceptDecision(noConfirmation.detail), /render confirmation/);
  assert.equal(noConfirmation.calls.length, 0);
  const superseded = fixture();
  superseded.readiness(async () => { superseded.win.testApi.invalidateDecision('changed'); });
  await superseded.win.testApi.acceptDecision(superseded.detail);
  assert.equal(superseded.calls.length, 0);
  const overwritten = fixture();
  overwritten.readiness(async () => { overwritten.detail.appliedHero.target.dataset.cdAppliedRunId = 'new-run'; });
  await overwritten.win.testApi.acceptDecision(overwritten.detail);
  assert.equal(overwritten.calls.length, 0);
  const missingMetadata = fixture();
  delete missingMetadata.detail.appliedHero.proposition.scopeDetails;
  await missingMetadata.win.testApi.acceptDecision(missingMetadata.detail);
  assert.equal(missingMetadata.calls.length, 0);
  assert.ok(missingMetadata.elements.baProfileStatus.textContent.includes('tracking failed'));
  const failedTracking = fixture();
  failedTracking.detail.alloy = async (...args) => { failedTracking.calls.push(args); throw new Error('Uncertain network result'); };
  await failedTracking.win.testApi.acceptDecision(failedTracking.detail);
  await failedTracking.win.testApi.acceptDecision(failedTracking.detail);
  assert.equal(failedTracking.calls.length, 1, 'uncertain send failure must not be retried');
  assert.ok(failedTracking.logs.some(args => String(args[0]).includes('Display event failure')));
});
test('browser: shared shell, staging, snapshots, readback, imagery and themes', async () => {
  const { chromium } = require('playwright');
  const root = path.resolve(__dirname, '..', 'web');
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end(); return;
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    await page.route('https://example.test/decision.jpg', route => route.fulfill({
      contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/british-airways-decisioning.js?*', route => route.fulfill({
      contentType: 'text/javascript',
      body: fs.readFileSync(path.join(root, 'profile-viewer', 'british-airways-decisioning.js'), 'utf8')
        .replace('global.envBar.ready().then(init)', 'global.__baTest = { acceptDecision, getVersion: () => imageVersion }; global.envBar.ready().then(init)'),
    }));
    const writes = [];
    let profileRows = structuredClone(rows);
    let staleReadback = false;
    let tableReads = 0;
    let schemaReady = true;
    await page.addInitScript(() => {
      localStorage.setItem('aepGlobalSandboxName', 'kirkham');
      localStorage.setItem('aepDemoNavVisibility', 'all');
    });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let data = { ok: true, record: {}, targets: [] };
      if (url.pathname === '/api/sandboxes') data = { sandboxes: [{ name: 'kirkham', title: 'Kirkham', state: 'active' }] };
      if (url.pathname === '/api/profile/table') {
        tableReads++;
        data = {
        found: true, rows: staleReadback ? rows : profileRows.map(row =>
          model.relativePath(row.path) === model.disruptionPath && row.value === 'cancelled'
            ? { ...row, value: 'CANCELLATION' } : row
        ), profileEmail: 'ba+09102026-1@adobetest.com', ecid: '12345678901234567890123456789012345678',
        industries: { generic: { writable: true }, travel: { writable: true, schemaId: 'test-schema' } },
        };
      }
      if (url.pathname === '/api/profile/consent') data = {
        found: true, email: 'ba+09102026-1@adobetest.com', firstName: 'Alex & Sam',
        ecid: '12345678901234567890123456789012345678',
      };
      if (url.pathname === '/api/aep') data = {
        status: 200, platform_response: { properties: { _demoemea: { properties: {
          britishAirwaysDecisioning: { properties: schemaReady ? getManifestForIndustry('travel').britishAirwaysDecisioning.properties : {} },
          airlineCustomer: { properties: { loyaltyTier: { type: 'string', enum: ['Blue', 'Bronze', 'Silver', 'Gold', 'Platinum'] } } },
          travelReservations: getManifestForIndustry('travel').travelReservations,
        } } } },
      };
      if (url.pathname === '/api/profile/update') {
        const body = route.request().postDataJSON();
        writes.push(body);
        for (const update of body.updates) {
          const existing = profileRows.find(row => model.relativePath(row.path) === update.path);
          if (existing) { existing.value = String(update.value); existing.valueType = update.valueType; }
          else profileRows.push({ ...update, value: String(update.value), writable: true, industry: body.industry });
        }
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/profile-viewer/british-airways-decisioning.html');
    await page.evaluate(() => window.envBar.ready());
    await page.waitForFunction(() => window.DemoTagsInjection && document.getElementById('baDecisioningInjectSdkBtn'));
    const visual = page.frameLocator('#baDecisioningFrame');
    await visual.locator('#signals .toggle-opt').first().waitFor({ state: 'attached' });
    const collapsedAtStart = await visual.locator('#signals .sig.collapsed').count();
    assert.ok(collapsedAtStart >= 5, 'groups start collapsed');
    await visual.locator('#signals .sig-head').evaluateAll((heads) => heads.forEach((h) => h.click()));
    assert.equal(await visual.locator('#signals .sig.collapsed').count(), 0, 'groups expand on click');
    const displayedHero = () => page.evaluate(() => {
      const doc = document.getElementById('baDecisioningFrame').contentDocument;
      return { image: doc.querySelector('.wb-bg.on').src, text: doc.getElementById('wbInner').innerHTML, email: doc.getElementById('mailFrame').srcdoc };
    });
    let defaultHero = await displayedHero();
    assert.ok(defaultHero.image.endsWith('/british-airways-decisioning-hero.png'));
    assert.equal(await page.locator('.spectrum-env-card--bc').count(), 0);
    assert.equal(await page.locator('#siteCloneBcDatastreamId').count(), 0);
    assert.equal(await page.locator('#siteCloneDecisioningEnabledToggle').count(), 1);
    assert.equal(await page.locator('#profileDrawer').count(), 1);
    assert.equal(await page.locator('#baDecisioningInjectSdkBtn').count(), 1);
    await page.evaluate(() => {
      document.getElementById('customerEmail').value = 'ba+09102026-1@adobetest.com';
      // Isolate SDK stitching; no external Edge event is sent by this test.
      window.DemoTagsInjection.ensureAlloyReady = async () => async () => ({ identity: { ECID: '12345678901234567890123456789012345678' } });
      document.getElementById('queryProfileBtn').click();
    });
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Profile loaded.'));
    await page.evaluate(() => { window.envBar.closeOverlay(); window.ProfileViewerModal.close(); });
    assert.equal(await visual.locator('#recipientPreviewHeading').textContent(), '③ What Alex & Sam sees');
    await visual.locator('#dev button[data-m="desktop"]').click();
    assert.ok((await visual.locator('#mailMeta').innerText()).includes('Alex & Sam'));
    assert.ok((await visual.frameLocator('#mailFrame').locator('body').innerText()).includes('Alex & Sam'));
    assert.equal(await visual.frameLocator('#mailFrame').locator('script').count(), 0);
    const personalisedHero = await displayedHero();
    assert.equal(personalisedHero.image, defaultHero.image, 'recipient lookup must not change the hero image');
    assert.equal(personalisedHero.text, defaultHero.text, 'recipient lookup must not change the live offer copy');
    defaultHero = personalisedHero;
    const propensityControl = visual.locator('.toggle-pill[aria-label="Propensity (ML)"]');
    assert.deepEqual(await propensityControl.locator('[data-v]').allTextContents(), ['1', '2', '3']);
    await propensityControl.locator('[data-v="3"]').click();
    await visual.locator('.toggle-pill[aria-label="Executive Club tier"] [data-v="silver"]').click();
    await page.evaluate(() => document.getElementById('cdMicroProfileRunBtn').click());
    assert.ok((await page.locator('#baProfileStatus').innerText()).includes('Apply staged changes'));
    assert.equal(writes.length, 0, 'control changes must not write automatically');
    schemaReady = false;
    await page.locator('#baApplyProfile').click();
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('schema fields are missing'));
    assert.equal(writes.length, 0, 'schema preflight must block missing leaves');
    schemaReady = true;
    staleReadback = true;
    await page.locator('#baApplyProfile').click();
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Confirming the update in the profile'));
    assert.equal(writes.length, 3);
    assert.equal(writes.find(body => body.industry === 'generic').updates.find(row => row.path === 'scoring.core.propensityScore').value, 3);
    assert.equal(writes.find(body => body.industry === 'travel').updates.find(row => row.path === 'airlineCustomer.loyaltyTier').value, 'Silver');
    assert.equal(writes.find(body => body.industry === 'travel').updates.filter(row => row.path.startsWith('britishAirwaysDecisioning.') && !row.path.endsWith('disruptionSeverity')).length, 11);
    assert.equal(writes.find(body => body.industry === 'travel').updates.find(row => row.path === model.bookingPath).value, 'upcoming');
    assert.equal(writes.find(body => body.industry === 'travel').updates.find(row => row.path === model.disruptionPath).value, 'none');
    const beforeReadback = tableReads;
    await page.locator('#baRunDecision').click();
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Waiting for AEP to confirm'));
    assert.equal(await page.locator('#baRunDecision').isDisabled(), true, 'Run waits instead of failing on stale readback');
    assert.ok(!(await page.locator('#baProfileStatus').innerText()).includes('readback does not match'));
    staleReadback = false;
    await page.waitForFunction(() => !document.getElementById('baProfileStatus').textContent.includes('Waiting for AEP') && !document.getElementById('baRunDecision').disabled, null, { timeout: 30000 });
    assert.ok(tableReads > beforeReadback, 'Run must poll fresh profile rows');
    await page.evaluate(() => document.getElementById('queryProfileBtn').click());
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Profile loaded.'));
    assert.equal(await propensityControl.locator('[data-v="3"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await visual.locator('.toggle-pill[aria-label="Executive Club tier"] [data-v="silver"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#profileDrawerLoyalty').textContent(), 'Silver');
    assert.equal(await page.locator('#profileDrawerPropensityScore').textContent(), '3');
    assert.equal(await page.locator('#profileDrawerDetail-flightClass').textContent(), 'Business');
    const scenarioButtons = visual.locator('#scenarios .scn');
    await page.evaluate(() => {
      window.DemoTagsInjection.ensureAlloyReady = async () => async command =>
        command === 'getIdentity' ? { identity: { ECID: '99999999999999999999999999999999999999' } } : {};
    });
    for (let i = 0; i < await scenarioButtons.count(); i++) {
      const before = writes.length;
      await scenarioButtons.nth(i).click();
      assert.deepEqual(await displayedHero(), defaultHero, 'scenario must preserve default hero before first decision');
      const staged = await page.evaluate(() => document.getElementById('baDecisioningFrame').contentWindow.BaDecisioningVisualiser.getState());
      assert.equal(writes.length, before, 'scenario must not save before Apply');
      await page.locator('#baRunDecision').click();
      assert.ok((await page.locator('#baProfileStatus').innerText()).includes('Apply staged changes'));
      await page.locator('#baApplyProfile').click();
      await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Snapshots accepted'));
      const saved = writes.slice(before);
      assert.deepEqual(model.readState(saved.flatMap(body => body.updates)), staged, 'scenario must save all 15 mapped fields');
      await page.evaluate(() => document.getElementById('queryProfileBtn').click());
      await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Profile loaded.'));
      const readback = await page.evaluate(() => document.getElementById('baDecisioningFrame').contentWindow.BaDecisioningVisualiser.getState());
      assert.deepEqual(readback, staged, 'scenario must survive profile re-lookup');
      assert.equal(await page.locator('#profileDrawerDetail-bookingStatus').textContent(), staged.booking);
      assert.equal(await page.locator('#profileDrawerLoyalty').textContent(), staged.tier.charAt(0).toUpperCase() + staged.tier.slice(1));
      assert.equal(await page.locator('#profileDrawerPropensityScore').textContent(), staged.prop);
      await page.evaluate(() => { window.envBar.closeOverlay(); window.ProfileViewerModal.close(); });
    }
    await scenarioButtons.filter({ hasText: 'Trip next week' }).click();
    await page.locator('#baApplyProfile').click();
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Snapshots accepted'));
    await page.evaluate(() => {
      const toggle = document.getElementById('siteCloneDecisioningEnabledToggle');
      toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true }));
      window.sdkCalls = [];
      const sdk = async (command, options) => {
        window.sdkCalls.push({ command, options });
        if (command === 'getIdentity') return { identity: { ECID: '99999999999999999999999999999999999999' } };
        if (command !== 'sendEvent' || !options.personalization?.surfaces) return {};
        return { propositions: [{
        id: 'earlier-proposition', scope: 'web://example.test#hero-banner', scopeDetails: { activity: { id: 'earlier' } },
        items: [{ id: 'earlier-item', data: { image: 'https://example.test/decision.jpg', title: 'Earlier offer' } }],
      }, {
        id: 'live-proposition', scope: document.getElementById('baDecisioningFrame').src.split('?')[0].replace(/^http:\/\//, 'web://') + '#hero-banner',
        scopeDetails: { activity: { id: 'campaign' }, characteristics: { arbitrary: ['preserve', { nested: true }] } },
        items: [{ id: 'decision-item', schema: 'https://ns.adobe.com/personalization/html-content-item',
          data: { content: '<img src="https://example.test/decision.jpg"><h2>Your next journey</h2><p>A personalised travel offer.</p>' } }],
      }] };
      };
      const originalRun = window.DecisioningProfileRuntime.runContentDecision;
      window.DecisioningProfileRuntime.runContentDecision = async options => {
        const result = await originalRun(options);
        window.lastRun = result;
        return result;
      };
      window.alloy = sdk;
      window.DemoTagsInjection.ensureAlloyReady = async () => sdk;
    });
    const readsBeforeDecision = tableReads;
    assert.equal(await page.locator('#dpmPanelAnchor').isVisible(), false, 'BA decisioning popout must stay hidden when enabled');
    await page.evaluate(() => document.getElementById('cdMicroProfileRunBtn').click());
    await visual.locator('#baPreviewMode').filter({ hasText: 'Live Edge decision image' }).waitFor();
    await page.waitForFunction(() => window.sdkCalls.some(call => call.options?.xdm?.eventType === 'decisioning.propositionDisplay'));
    const tracked = await page.evaluate(() => {
      const request = window.sdkCalls.find(call => call.options?.personalization?.surfaces).options;
      const displays = window.sdkCalls.filter(call => call.options?.xdm?.eventType === 'decisioning.propositionDisplay');
      return { request, displays, winner: window.lastRun.appliedHero.proposition, itemId: window.lastRun.appliedHero.itemId,
        metadataUnchanged: window.lastRun.appliedHero.proposition.scopeDetails === window.lastRun.propositions[1].scopeDetails };
    });
    assert.equal(tracked.displays.length, 1);
    assert.equal(tracked.request.xdm._demoemea.interactionDetails.core.channel, 'email');
    assert.equal(tracked.request.personalization.sendDisplayEvent, false);
    assert.equal(tracked.request.xdm.identityMap.Email[0].primary, true);
    assert.deepEqual(tracked.request.xdm.identityMap.ECID, [{
      id: '99999999999999999999999999999999999999', authenticatedState: 'ambiguous', primary: false,
    }]);
    assert.equal(tracked.request.xdm._demoemea.identification.core.ecid, '99999999999999999999999999999999999999');
    assert.equal(tracked.winner.id, 'live-proposition');
    assert.equal(tracked.itemId, 'decision-item');
    assert.equal(tracked.metadataUnchanged, true);
    assert.equal(await page.evaluate(() => window.lastRun.appliedHero.target.querySelector('.cd-banner')), null);
    assert.deepEqual(tracked.displays[0].options, {
      renderDecisions: false,
      personalization: { defaultPersonalizationEnabled: false },
      xdm: { eventType: 'decisioning.propositionDisplay', identityMap: tracked.request.xdm.identityMap,
        _demoemea: { identification: { core: { ecid: '99999999999999999999999999999999999999' } } },
        _experience: { decisioning: { propositions: [tracked.winner], propositionEventType: { display: 1 } } } },
    });
    assert.equal(await page.evaluate(() => window.sdkCalls.filter(call => call.options?.personalization?.surfaces).length), 1);
    const attribution = await page.evaluate(() => {
      const doc = document.implementation.createHTMLDocument('Attribution');
      doc.body.innerHTML = '<div id="hero-banner"></div><div id="TopRibbon"></div><div id="ContentCardContainer"></div>';
      const props = window.lastRun.propositions;
      const result = window.CdEdgeMounts.applyPropositionsManually([...props, {
        id: 'failed-writer', scope: props[1].scope, items: [{ data: {} }],
      }], { root: doc, runId: 'renderer-test' });
      const retained = window.CdEdgeMounts.applyPropositionsManually([], { root: doc, runId: 'empty-test' });
      const fallback = window.CdEdgeMounts.applyPropositionsManually([{
        id: 'default-writer', scope: props[1].scope,
        items: [{ id: 'default-item', schema: 'https://ns.adobe.com/personalization/default-content-item',
          data: { content: '<img src="https://example.test/decision.jpg">' } }],
      }], { root: doc, runId: 'default-test' });
      return { winner: result.appliedHero.proposition.id, runId: result.appliedHero.runId,
        sameMetadata: result.appliedHero.proposition.scopeDetails === props[1].scopeDetails,
        retained: retained.appliedHero, fallback: fallback.appliedHero.fallback };
    });
    assert.deepEqual(attribution, { winner: 'live-proposition', runId: 'renderer-test', sameMetadata: true, retained: null, fallback: true });
    const validation = await page.evaluate(() => {
      function render(content, runId, schema) {
        const doc = document.implementation.createHTMLDocument('Validation');
        doc.body.innerHTML = '<div id="hero-banner"></div><div id="TopRibbon"></div><div id="ContentCardContainer"></div>';
        const proposition = { id: runId, scope: 'web://example.test#hero-banner', scopeDetails: { activity: { id: 'test' } },
          items: [{ id: 'item', schema: schema || 'https://ns.adobe.com/personalization/html-content-item', data: { content } }] };
        const result = window.DecisioningEdgeInject.applyDecisioningPropositions([proposition], doc, { layout: 'generic', runId });
        const hero = doc.getElementById('hero-banner');
        const legacyRecognised = !!hero.querySelector('.cd-banner, .TopRibbon, .TopRibbon__content, .cd-edge-ajo-card-inner, iframe, .cd-edge-rendered-ribbon');
        const retained = window.DecisioningEdgeInject.applyDecisioningPropositions([], doc, { layout: 'generic', runId: 'retained' });
        return { survives: !!result.appliedHero, fallback: !!result.appliedHero?.fallback,
          exact: !!result.appliedHero && result.appliedHero.appliedNodes.every(node => doc.getElementById('hero-banner').contains(node)),
          legacyRecognised,
          retained: !!retained.appliedHero };
      }
      return {
        bare: render('<img src="https://example.test/decision.jpg"><h2>Title</h2><p>Description</p>', 'bare'),
        wrapper: render('<div class="cd-banner"><img src="https://example.test/decision.jpg"></div>', 'wrapper'),
        empty: render('', 'empty'),
        fallback: render('<img src="https://example.test/decision.jpg">', 'fallback', 'https://ns.adobe.com/personalization/default-content-item'),
      };
    });
    assert.deepEqual(validation.bare, { survives: true, fallback: false, exact: true, legacyRecognised: false, retained: false });
    assert.deepEqual(validation.wrapper, { survives: true, fallback: false, exact: true, legacyRecognised: true, retained: false });
    assert.equal(validation.empty.survives, false);
    assert.equal(validation.fallback.fallback, true);
    await page.evaluate(() => window.__baTest.acceptDecision({ ...window.lastRun, requestVersion: window.__baTest.getVersion() }));
    assert.equal(await page.evaluate(() => window.sdkCalls.filter(call => call.options?.xdm?.eventType === 'decisioning.propositionDisplay').length), 1);
    assert.ok(tableReads > readsBeforeDecision, 'popout Run must automatically look up and verify the saved profile');
    const sources = await page.evaluate(() => {
      const doc = document.getElementById('baDecisioningFrame').contentDocument;
      return { web: doc.querySelector('.wb-bg').src, email: doc.getElementById('mailFrame').srcdoc };
    });
    assert.equal(sources.web, 'https://example.test/decision.jpg');
    assert.ok(sources.email.includes('https://example.test/decision.jpg'));
    assert.ok(sources.email.includes('Your next journey'));
    assert.ok(sources.email.includes('A personalised travel offer.'));
    const emailDoc = await visual.locator('#mailFrame').contentFrame();
    const hero = emailDoc.locator('.email-hero');
    assert.equal(await hero.evaluate(el => getComputedStyle(el).objectFit), 'cover');
    assert.equal(await hero.evaluate(el => el.getBoundingClientRect().height), 277);
    assert.ok(!(await emailDoc.locator('img[alt="British Airways"]').getAttribute('src')).includes('decision.jpg'), 'decision must not replace logo');
    const originalHero = await displayedHero();
    assert.ok(originalHero.text.includes('Your next journey'));
    await scenarioButtons.filter({ hasText: 'Cancelled flight' }).click();
    assert.deepEqual(await displayedHero(), originalHero, 'scenario metadata must not replace the live hero');
    await visual.locator('#dev [data-m="desktop"]').click();
    let metadata = await visual.locator('#mailMeta').innerText();
    assert.ok(metadata.includes('Objective 1') && metadata.includes('Protect / Recover'));
    assert.ok(metadata.includes('NBA') && metadata.includes('Rebook / reroute'));
    assert.ok(metadata.includes('your flight to Los Angeles has been cancelled'));
    assert.ok(metadata.includes('Rebook free of charge'));
    await visual.locator('#dev [data-m="mobile"]').click();
    assert.equal(await page.evaluate(() => document.getElementById('baDecisioningFrame').contentWindow.BaDecisioningVisualiser.getPreviewChannel()), 'email');
    assert.equal(await visual.locator('#mailMeta').innerText(), metadata, 'mobile metadata must follow the same scenario');
    await visual.locator('#dev [data-m="web"]').click();
    metadata = await visual.locator('#mailMeta').innerText();
    assert.ok(metadata.includes('Objective 1') && metadata.includes('Protect / Recover'));
    assert.ok(metadata.includes('Rebook / reroute'));
    assert.deepEqual(await displayedHero(), originalHero, 'switching channels must preserve the hero');
    await visual.locator('#dev [data-m="desktop"]').click();
    for (let i = 0; i < await scenarioButtons.count(); i++) {
      await scenarioButtons.nth(i).click();
      assert.deepEqual(await displayedHero(), originalHero, 'scenario must not change displayed hero content');
    }
    await page.locator('#baApplyProfile').click();
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Snapshots accepted'));
    assert.deepEqual(await displayedHero(), originalHero, 'Apply must not change displayed hero content');
    assert.equal(await page.evaluate(() => window.sdkCalls.filter(call => call.options?.xdm?.eventType === 'decisioning.propositionDisplay').length), 1);
    await visual.locator('#dev [data-m="mobile"]').click();
    assert.ok(await visual.locator('#mailStage').evaluate(el => el.classList.contains('is-mobile')));
    await page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    await page.waitForTimeout(100);
    const colors = await page.evaluate(() => ({
      shell: getComputedStyle(document.body).getPropertyValue('--dash-surface').trim(),
      visual: document.getElementById('baDecisioningFrame').contentDocument.documentElement.style.getPropertyValue('--dash-surface').trim(),
    }));
    assert.equal(colors.shell, colors.visual);
    await page.evaluate(() => {
      const sdk = async command => command === 'getIdentity'
        ? { identity: { ECID: '99999999999999999999999999999999999999' } } : { propositions: [] };
      window.alloy = sdk;
      window.DemoTagsInjection.ensureAlloyReady = async () => sdk;
    });
    await page.locator('#baRunDecision').click();
    await visual.locator('#baPreviewMode').filter({ hasText: 'No live hero image returned' }).waitFor();
    assert.deepEqual(await displayedHero(), originalHero, 'empty decision must preserve previous hero');
    await page.evaluate(() => {
      const sdk = async () => { throw new Error('Test Edge failure'); };
      window.alloy = sdk;
      window.DemoTagsInjection.ensureAlloyReady = async () => sdk;
    });
    await page.locator('#baRunDecision').click();
    await visual.locator('#baPreviewMode').filter({ hasText: 'Live decision failed' }).waitFor();
    assert.deepEqual(await displayedHero(), originalHero, 'failed decision must preserve previous hero');
    await page.evaluate(() => {
      const sdk = async (command, options) => {
        window.sdkCalls.push({ command, options });
        if (command === 'getIdentity') return { identity: { ECID: '99999999999999999999999999999999999999' } };
        if (command !== 'sendEvent' || !options.personalization?.surfaces) return {};
        return { propositions: [{
        id: 'next-proposition', scope: document.getElementById('baDecisioningFrame').src.split('?')[0].replace(/^http:\/\//, 'web://') + '#hero-banner',
        scopeDetails: { activity: { id: 'next-campaign' } },
        items: [{ id: 'next-item', schema: 'https://ns.adobe.com/personalization/json-content-item', data: {
          image: 'https://example.test/decision.jpg?next', title: 'Next <journey>', text: 'New <description>',
        } }],
      }] };
      };
      window.alloy = sdk;
      window.DemoTagsInjection.ensureAlloyReady = async () => sdk;
    });
    await page.route('https://example.test/decision.jpg?next', route => route.fulfill({
      contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    }));
    await visual.locator('#dev [data-m="web"]').click();
    await page.locator('#baRunDecision').click();
    await visual.locator('#baPreviewMode').filter({ hasText: 'Live Edge decision image' }).waitFor();
    await page.waitForFunction(() => window.sdkCalls.filter(call => call.options?.xdm?.eventType === 'decisioning.propositionDisplay').length === 2);
    const nextHero = await displayedHero();
    assert.equal(nextHero.image, 'https://example.test/decision.jpg?next');
    assert.ok(nextHero.text.includes('Next &lt;journey&gt;'));
    assert.ok(nextHero.text.includes('New &lt;description&gt;'));
    assert.ok(nextHero.email.includes('Next &lt;journey&gt;'));
    assert.equal(await page.evaluate(() => window.sdkCalls.filter(call => call.options?.personalization?.surfaces).at(-1).options.xdm._demoemea.interactionDetails.core.channel), 'web');
    await visual.locator('#dev [data-m="web"]').click();
    await visual.locator('#dev [data-m="desktop"]').click();
    assert.equal(await page.evaluate(() => window.sdkCalls.filter(call => call.options?.personalization?.surfaces)[0].options.xdm._demoemea.interactionDetails.core.channel), 'email', 'tab changes must not alter the recorded request channel');
    assert.equal(await page.evaluate(() => window.sdkCalls.filter(call => call.options?.xdm?.eventType === 'decisioning.propositionDisplay').length), 2);
    const missingBrowserIdentity = await page.evaluate(async () => {
      const commands = [];
      const sdk = async command => { commands.push(command); return {}; };
      window.DemoTagsInjection.ensureAlloyReady = async () => sdk;
      try {
        await window.DecisioningProfileRuntime.runContentDecision({ useBrowserEcid: true });
        return { commands, error: '' };
      } catch (error) { return { commands, error: error.message }; }
    });
    assert.deepEqual(missingBrowserIdentity.commands, ['getIdentity']);
    assert.match(missingBrowserIdentity.error, /browser ECID was not returned/);
    const sharedDefault = await page.evaluate(async () => {
      const lastRunId = window.lastRun.runId;
      const sdk = async (command, options) => {
        window.sdkCalls.push({ command, options });
        return { propositions: [] };
      };
      window.alloy = sdk;
      window.DemoTagsInjection.ensureAlloyReady = async () => sdk;
      const result = await window.DecisioningProfileRuntime.runContentDecision();
      return { uniqueRun: result.runId !== lastRunId, appliedHero: result.appliedHero,
        suppressed: window.sdkCalls[window.sdkCalls.length - 1].options.personalization.sendDisplayEvent };
    });
    assert.equal(sharedDefault.uniqueRun, true);
    assert.equal(sharedDefault.appliedHero, null);
    assert.equal(sharedDefault.suppressed, undefined, 'other runtime callers retain automatic-display behavior');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const mobileLayout = await page.evaluate(() => ({
      toolbar: document.querySelector('.spectrum-env-status-bar').getBoundingClientRect().bottom,
      anchor: document.querySelector('.mod-demo-top-anchor').getBoundingClientRect().top,
      anchorOffset: document.querySelector('.mod-demo-top-anchor').offsetTop,
      cssTop: document.body.style.getPropertyValue('--ba-toolbar-top'),
      actionsTop: document.querySelector('.ba-decisioning-actions').getBoundingClientRect().top,
      actionsBottom: document.querySelector('.ba-decisioning-actions').getBoundingClientRect().bottom,
      frameTop: document.getElementById('baDecisioningFrame').getBoundingClientRect().top,
    }));
    assert.ok(mobileLayout.actionsTop >= mobileLayout.toolbar - 1, JSON.stringify(mobileLayout));
    assert.ok(mobileLayout.frameTop >= mobileLayout.actionsBottom);
    await page.evaluate(() => window.envBar.dock ? window.envBar.dock() : document.querySelector('.mod-demo-top-anchor').classList.add('lab-env-top-anchor--docked-hidden'));
    await page.waitForFunction(() => document.querySelector('.ba-decisioning-actions').getBoundingClientRect().top === 0);
    await page.evaluate(() => document.querySelector('.mod-demo-top-anchor').classList.remove('lab-env-top-anchor--docked-hidden'));
    await page.waitForFunction(() => document.querySelector('.ba-decisioning-actions').getBoundingClientRect().top >=
      document.querySelector('.spectrum-env-status-bar').getBoundingClientRect().bottom - 1);
    await page.route('**/british-airways-decisioning.html?featureRegression=1', route => route.fulfill({
      contentType: 'text/html',
      body: fs.readFileSync(path.join(root, 'profile-viewer', 'british-airways-decisioning.html'), 'utf8')
        .replace('features: { webPush: false, bc: false, target: false, decisioning: true }', 'features: { decisioning: true }'),
    }));
    await page.goto('http://127.0.0.1:' + server.address().port + '/profile-viewer/british-airways-decisioning.html?featureRegression=1');
    await page.waitForFunction(() => window.envBar && window.BaDecisioningModel && document.getElementById('siteCloneBcDatastreamId'));
    assert.equal(await page.locator('.spectrum-env-card--bc').count(), 1);
    assert.equal(await page.locator('#siteCloneBcDatastreamId').count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
