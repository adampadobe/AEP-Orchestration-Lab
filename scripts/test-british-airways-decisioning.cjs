const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const model = require('../web/profile-viewer/british-airways-decisioning-model');
const { getManifestForIndustry } = require('../functions/profileCoreV2Manifest');
const { resolveIndustryForPath } = require('../functions/industryAttributeMap');
const state = {
  tier: 'gold', prop: 'high', engage: 'dormant', booking: 'travelling', days: 2,
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
];
test('every BA control has a typed Travel schema leaf and ownership', () => {
  const schema = getManifestForIndustry('travel').britishAirwaysDecisioning.properties;
  assert.equal(Object.keys(schema).length, 13);
  Object.values(model.fields).forEach(leaf => {
    assert.ok(schema[leaf]);
    assert.equal(resolveIndustryForPath('_otherTenant.britishAirwaysDecisioning.' + leaf).industry, 'travel');
  });
  assert.equal(getManifestForIndustry('generic').britishAirwaysDecisioning, undefined);
});
test('full snapshots preserve siblings, industry groups and scalar types', () => {
  const snapshots = model.buildSnapshots(rows, state);
  const travel = snapshots.find(group => group.industry === 'travel').updates;
  assert.equal(travel.find(row => row.path === 'hotel.bookingDetails.roomNumber').value, '0012');
  assert.equal(travel.find(row => row.path.endsWith('messages7d')).value, 3);
  const generic = snapshots.find(group => group.industry === 'generic').updates;
  assert.equal(generic.find(row => row.path === 'scoring.core.propensityScore').value, 80);
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
test('unmodified propensity bands preserve the original numeric score', () => {
  const input = rows.map(row => row.path.endsWith('propensityScore') ? { ...row, value: '45' } : row);
  const generic = model.buildSnapshots(input, { ...state, prop: 'medium' }).find(group => group.industry === 'generic');
  assert.equal(generic.updates.find(row => row.path.endsWith('propensityScore')).value, 45);
  assert.throws(() => model.buildSnapshots([{ ...rows[2], value: 'invalid' }], state), /Invalid numeric/);
});
test('unchanged loyalty preserves exact casing and unsupported existing tiers', () => {
  const input = [...rows, { path: '_demoemea.loyaltyDetails.level', value: 'Platinum', valueType: 'string', writable: true, industry: 'generic' }];
  const generic = model.buildSnapshots(input, state, null, state).find(group => group.industry === 'generic');
  assert.equal(generic.updates.find(row => row.path === 'loyaltyDetails.level').value, 'Platinum');
  assert.equal(generic.updates.find(row => row.path === 'loyalty.tier').value, 'Platinum');
  const changed = model.buildSnapshots(input, { ...state, tier: 'silver' }, null, state).find(group => group.industry === 'generic');
  assert.equal(changed.updates.find(row => row.path === 'loyaltyDetails.level').value, 'Silver');
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
    const writes = [];
    let profileRows = structuredClone(rows);
    let schemaReady = true;
    await page.addInitScript(() => {
      localStorage.setItem('aepGlobalSandboxName', 'kirkham');
      localStorage.setItem('aepDemoNavVisibility', 'all');
    });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let data = { ok: true, record: {}, targets: [] };
      if (url.pathname === '/api/sandboxes') data = { sandboxes: [{ name: 'kirkham', title: 'Kirkham', state: 'active' }] };
      if (url.pathname === '/api/profile/table') data = {
        found: true, rows: profileRows, profileEmail: 'ba+09102026-1@adobetest.com', ecid: '12345678901234567890123456789012345678',
        industries: { generic: { writable: true }, travel: { writable: true, schemaId: 'test-schema' } },
      };
      if (url.pathname === '/api/profile/consent') data = {
        found: true, email: 'ba+09102026-1@adobetest.com', firstName: 'Marcus',
        ecid: '12345678901234567890123456789012345678',
      };
      if (url.pathname === '/api/aep') data = {
        status: 200, platform_response: { properties: { _demoemea: { properties: {
          britishAirwaysDecisioning: { properties: schemaReady ? getManifestForIndustry('travel').britishAirwaysDecisioning.properties : {} },
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
    await visual.locator('#signals .toggle-opt').first().waitFor();
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
    await visual.locator('.toggle-pill[aria-label="Executive Club tier"] [data-v="gold"]').click();
    assert.equal(writes.length, 0, 'control changes must not write automatically');
    schemaReady = false;
    await page.locator('#baApplyProfile').click();
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('schema fields are missing'));
    assert.equal(writes.length, 0, 'schema preflight must block missing leaves');
    schemaReady = true;
    await page.locator('#baApplyProfile').click();
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Snapshots accepted'));
    assert.equal(writes.length, 3);
    assert.equal(writes.find(body => body.industry === 'travel').updates.filter(row => row.path.startsWith('britishAirwaysDecisioning.')).length, 13);
    await page.locator('#baRunDecision').click();
    assert.ok((await page.locator('#baProfileStatus').innerText()).includes('verify AEP readback'));
    await page.evaluate(() => document.getElementById('queryProfileBtn').click());
    await page.waitForFunction(() => document.getElementById('baProfileStatus').textContent.includes('Profile loaded.'));
    await page.evaluate(() => {
      const toggle = document.getElementById('siteCloneDecisioningEnabledToggle');
      toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true }));
      const sdk = async command => command === 'sendEvent' ? { propositions: [{
        id: 'live-proposition', scope: document.getElementById('baDecisioningFrame').src.split('?')[0].replace(/^http:\/\//, 'web://') + '#hero-banner',
        items: [{ id: 'decision-item', schema: 'https://ns.adobe.com/personalization/json-content-item', data: { imageURL: 'https://example.test/decision.jpg' } }],
      }] } : {};
      window.alloy = sdk;
      window.DemoTagsInjection.ensureAlloyReady = async () => sdk;
    });
    await page.locator('#baRunDecision').click();
    await visual.locator('#baPreviewMode').filter({ hasText: 'Live Edge decision image' }).waitFor();
    const sources = await page.evaluate(() => {
      const doc = document.getElementById('baDecisioningFrame').contentDocument;
      return { web: doc.querySelector('.wb-bg').src, email: doc.getElementById('mailFrame').srcdoc };
    });
    assert.equal(sources.web, 'https://example.test/decision.jpg');
    assert.ok(sources.email.includes('https://example.test/decision.jpg'));
    await visual.locator('#dev [data-m="mobile"]').click();
    assert.ok(await visual.locator('#mailStage').evaluate(el => el.classList.contains('is-mobile')));
    await page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    await page.waitForTimeout(100);
    const colors = await page.evaluate(() => ({
      shell: getComputedStyle(document.body).getPropertyValue('--dash-surface').trim(),
      visual: document.getElementById('baDecisioningFrame').contentDocument.documentElement.style.getPropertyValue('--dash-surface').trim(),
    }));
    assert.equal(colors.shell, colors.visual);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('decisioning-profile-updated', { detail: { propositionCount: 0 } })));
    await visual.locator('#baPreviewMode').filter({ hasText: 'No live hero image returned' }).waitFor();
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
