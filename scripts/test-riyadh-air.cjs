'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const events = require('../web/profile-viewer/riyadh-air-events');
const { buildGeneratorEdgeInteractXdm } = require('../functions/eventEdgeService');
const { EVENT_INDUSTRY_FIELD_GROUP_SPECS } = require('../functions/eventIndustryFieldGroups');
const { chromium } = require('playwright');

const ecid = '12345678901234567890123456789012345678';
const profile = { found: true, email: 'traveller@example.test', ecid, firstName: 'Nour', lastName: 'Alam', identities: [], audiences: [], events: [] };
const target = { id: 'lab-event-tool-edge', label: 'Lab Event tool Edge', transport: 'edge', dataStreamId: 'fixture-datastream', xdmStyle: 'minimal' };
const trip = { reference: 'RA123ABC', origin: 'LHR', destination: 'RUH', date: '2026-11-01', flight: 'RX100', cabin: 'Economy', seat: '14A', bag: true };
const context = { sandbox: 'apalmer', email: profile.email, ecid, known: true, target, url: 'https://example.test/profile-viewer/riyadh-air-demo.html' };

function contractTests() {
  for (const action of Object.keys(events.TYPES)) {
    const body = events.build(action, trip, context, { delayMinutes: 90, gate: 'B12', eventID: 'fixture-disruption-id' });
    const xdm = buildGeneratorEdgeInteractXdm(body, target);
    assert.equal(xdm.eventType, events.TYPES[action]);
    assert.equal(xdm.identityMap.ECID[0].id, ecid);
    assert.equal(xdm.identityMap.ECID[0].primary, true);
    assert.equal(xdm.identityMap.Email[0].id, profile.email);
    assert.equal(xdm.identityMap.Email[0].primary, false);
    assert.equal(xdm._demoemea.public.travel.confirmationNumber, trip.reference);
    assert.equal(xdm._experience.campaign.orchestration.eventID, 'fixture-disruption-id');
    for (const slice of ['travel', 'generic']) {
      const allowed = EVENT_INDUSTRY_FIELD_GROUP_SPECS.find((spec) => spec.industryId === slice).properties;
      assert(Object.keys(xdm._demoemea.public[slice]).every((key) => Object.hasOwn(allowed, key)), 'No undeclared schema leaves');
    }
    const url = new URL(xdm._demoemea.public.generic.linkUrl);
    assert.equal(url.searchParams.get('booking'), trip.reference);
    assert.equal(url.searchParams.get('flight'), trip.flight);
    assert(!url.href.includes(profile.email));
    if (action === 'delay') assert.equal(url.searchParams.get('delayMinutes'), '90');
    if (action === 'gate') assert.equal(url.searchParams.get('gate'), 'B12');
  }
  const anonymous = buildGeneratorEdgeInteractXdm(events.build('search', { origin: 'LHR', destination: 'RUH' }, { ...context, known: false }), target);
  assert(!anonymous.identityMap.Email);
  assert(!anonymous._demoemea.public.travel.confirmationNumber);
  assert.throws(() => events.build('delay', {}, context), /Select a flight/);
  assert.throws(() => events.build('search', trip, { ...context, ecid: '' }), /ECID/);
  assert.throws(() => events.build('search', trip, { ...context, email: '' }), /email and ECID/);
  assert.throws(() => events.build('search', trip, { ...context, sandbox: '' }), /sandbox/);
  assert.throws(() => events.build('search', trip, { ...context, target: { id: 'other' } }), /Lab Event tool/);
  assert.throws(() => events.build('delay', trip, context, { delayMinutes: 0 }), /15-720/);
  assert.throws(() => events.build('gate', trip, context, { gate: '<invalid>' }), /valid gate/);
}

async function browserTests() {
  const root = path.resolve(__dirname, '../web');
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://fixture').pathname);
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(filename);
      const extension = path.extname(filename);
      res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[extension] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const requests = [];
    const errors = [];
    let failNext = false;
    let missingEcid = false;
    await browserContext.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { await route.fulfill({ body: '', contentType: 'text/javascript' }); return; }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      let data = {};
      if (url.pathname === '/api/aep') data = { sandboxes: [{ name: 'apalmer', title: 'apalmer' }, { name: 'kirkham', title: 'kirkham' }] };
      else if (url.pathname === '/api/sandboxes') data = { sandboxes: [{ name: 'apalmer', title: 'apalmer' }, { name: 'kirkham', title: 'kirkham' }] };
      else if (url.pathname === '/api/events/generator-targets') data = { targets: [target] };
      else if (url.pathname === '/api/events/generator') {
        const body = route.request().postDataJSON();
        requests.push(body);
        if (failNext) { failNext = false; await route.fulfill({ status: 502, json: { ok: false, error: 'Fixture ingestion rejection' } }); return; }
        data = { ok: true, transport: 'edge', requestId: 'fixture-' + requests.length };
      } else if (url.pathname === '/api/profile/consent') {
        const identifier = url.searchParams.get('identifier');
        data = identifier === profile.email || identifier === ecid
          ? { ...profile, ecid: missingEcid ? null : ecid }
          : { found: false };
      } else if (url.pathname === '/api/profile/events') data = { events: [], eventsStory: [] };
      else if (url.pathname === '/api/env-bar-config') data = { config: null };
      else if (url.pathname === '/api/tags/reactor') data = { data: [] };
      else if (url.pathname === '/api/lab/user-sandbox-data') data = { keys: {} };
      await route.fulfill({ json: data });
    });
    await browserContext.addInitScript(() => {
      localStorage.setItem('aepGlobalSandboxName', 'apalmer');
      localStorage.setItem('aepShowInDevCapabilities_apalmer', 'true');
      localStorage.setItem('aepDemoNavVisibility', 'all');
      window.firebase = { apps: [{}], auth: () => ({
        currentUser: null, onAuthStateChanged(callback) { callback(null); },
        onIdTokenChanged() {}, signInAnonymously: async () => ({ user: null }),
      }) };
    });
    const page = await browserContext.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/profile-viewer/riyadh-air-demo.html');
    await page.evaluate(() => window.RiyadhAirLab.ready);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    assert.equal(await page.locator('#aepDemoEnvSection').count(), 1);
    assert.equal(await page.locator('#profileDrawer').count(), 1);
    assert.equal(await page.locator('#siteCloneDecisioningEnabledToggle').count(), 1);
    assert.equal(await page.locator('iframe').count(), 0, 'Customer website must be AJO-authorable in the top document');
    await page.locator('#raHero').click({ position: { x: 30, y: 30 } });
    await page.waitForFunction(() => document.getElementById('profileDrawer').getBoundingClientRect().top >= innerHeight - 30);
    assert(await page.evaluate(() => document.getElementById('riyadh-air-header').getBoundingClientRect().top < 180), 'No empty dashboard viewport before the customer site');
    if (process.env.RIYADH_SCREENSHOTS) {
      await fs.mkdir(process.env.RIYADH_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.RIYADH_SCREENSHOTS, 'riyadh-home-desktop.png'), animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(process.env.RIYADH_SCREENSHOTS, 'riyadh-home-mobile.png'), animations: 'disabled' });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }

    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.waitForFunction(() => document.getElementById('raDeliveryStatus').textContent.includes('Resolve a valid ECID'));
    assert.equal(requests.length, 0, 'No silent fallback to another identity');
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.getByRole('heading', { name: 'Choose your flight' }).waitFor();
    failNext = true;
    await page.getByRole('button', { name: 'Select flight' }).first().click();
    await page.waitForFunction(() => document.getElementById('raDeliveryStatus').textContent.includes('Fixture ingestion rejection'));
    assert(await page.getByRole('heading', { name: 'Choose your flight' }).isVisible());
    await page.getByRole('button', { name: 'Select flight' }).first().click();
    await page.getByRole('button', { name: 'Continue to extras' }).waitFor();
    await page.getByRole('button', { name: 'Continue to extras' }).click();
    await page.getByRole('button', { name: 'Seat 14A', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-seat="14A"]').getAttribute('aria-pressed') === 'true');
    await page.locator('#raBag').check();
    await page.getByRole('button', { name: 'Review booking' }).click();
    await page.locator('#raPaymentForm input').check();
    await page.getByRole('button', { name: 'Confirm demo booking' }).click();
    await page.getByRole('button', { name: 'Explore a cabin upgrade' }).waitFor();
    const booking = requests.find((body) => body.eventType === 'travel.booking.confirm');
    assert(booking.public.travel.confirmationNumber);
    const bookingRef = booking.public.travel.confirmationNumber;
    assert.equal(requests.filter((body) => body.eventType === 'travel.booking.confirm').length, 1);
    assert.equal(new URL(booking.public.generic.linkUrl).searchParams.get('seat'), '14A');
    assert.equal(new URL(booking.public.generic.linkUrl).searchParams.get('bag'), 'extra-23kg');
    await page.getByRole('button', { name: 'Explore a cabin upgrade' }).click();
    await page.getByRole('button', { name: 'I am interested' }).click();
    await page.waitForFunction(() => document.getElementById('raUpgradeNote').textContent.includes('Your interest was submitted'));
    await page.getByRole('button', { name: 'Not now' }).click();
    await page.getByRole('button', { name: 'Explore a cabin upgrade' }).waitFor();
    assert.equal(requests.filter((body) => body.eventType === 'travel.upgrade.abandon').length, 1);
    await page.locator('#raPresenter summary').click();
    await page.locator('#raOrchestrationId').fill('fixture-disruption-id');
    await page.getByRole('button', { name: 'Send trip update' }).click();
    await page.getByRole('heading', { name: 'We are here for your journey.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Explore a cabin upgrade' }).count(), 0);
    const delay = requests.find((body) => body.eventType === 'travel.flight.delay');
    assert.equal(delay.public.travel.confirmationNumber, bookingRef);
    assert.equal(delay.eventID, 'fixture-disruption-id');
    assert.equal(new URL(delay.viewUrl).searchParams.get('delayMinutes'), '90');
    await page.locator('#raDisruptionKind').selectOption('gate');
    await page.getByRole('button', { name: 'Send trip update' }).click();
    await page.waitForFunction(() => document.querySelector('.ra-care').textContent.includes('B12'));
    assert.equal(requests.find((body) => body.eventType === 'travel.flight.gateChange').public.travel.confirmationNumber, bookingRef);
    assert(requests.filter((body) => body.eventType.startsWith('travel.')).every((body) => body.email === profile.email && body.ecid === ecid && body.sandbox === 'apalmer'));
    assert(!requests.some((body) => /purchase|whatsapp/i.test(body.eventType)));

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((selected) => {
          if (selected === 'dark') document.documentElement.setAttribute('data-aep-theme', 'dark');
          else document.documentElement.removeAttribute('data-aep-theme');
        }, theme);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow at ' + width + ' / ' + theme);
        assert(await page.getByRole('heading', { name: 'We are here for your journey.' }).isVisible());
      }
    }
    await page.reload();
    await page.evaluate(() => window.RiyadhAirLab.ready);
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.getByRole('heading', { name: 'We are here for your journey.' }).waitFor();
    assert.equal(requests.filter((body) => body.eventType === 'travel.booking.confirm').length, 1, 'Reload does not re-ingest the booking');
    await page.evaluate(() => {
      document.getElementById('riyadhNs').value = 'ecid';
      document.getElementById('riyadhNs').dispatchEvent(new Event('change', { bubbles: true }));
    });
    const beforeNamespace = requests.length;
    await page.evaluate(() => window.RiyadhAirLab.send('search', { origin: 'LHR', destination: 'RUH' }).catch(() => {}));
    assert.equal(requests.length, beforeNamespace, 'Namespace change invalidates the old verification');
    await page.evaluate((id) => {
      document.getElementById('customerEmail').value = id;
      return window.RiyadhAirLab.lookup();
    }, ecid);
    assert.equal(await page.evaluate(() => window.RiyadhAirLab.context().email), profile.email, 'ECID lookup resolves canonical email');
    await page.evaluate(() => window.DemoProfileDrawer.openDrawerAndLoad());
    await page.waitForFunction(() => document.getElementById('profileDrawer').getBoundingClientRect().bottom <= innerHeight + 1);
    assert(await page.locator('body').evaluate((body) => body.classList.contains('aep-profile-drawer-open')), 'Shared profile drawer actually opens');
    await page.evaluate(() => document.body.classList.remove('aep-profile-drawer-open'));
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('kirkham', { source: 'user' }));
    assert.equal(await page.getByRole('heading', { name: 'We are here for your journey.' }).isVisible(), false, 'Different sandbox cannot inherit the trip');
    const beforeSandbox = requests.length;
    await page.evaluate(() => window.RiyadhAirLab.send('search', { origin: 'LHR', destination: 'RUH' }).catch(() => {}));
    assert.equal(requests.length, beforeSandbox, 'Sandbox change invalidates verified identity');
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('apalmer', { source: 'user' }));
    missingEcid = true;
    await assert.rejects(page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email), /usable profile/);
    const before = requests.length;
    await page.evaluate(() => window.RiyadhAirLab.send('search', { origin: 'LHR', destination: 'RUH' }).catch(() => {}));
    assert.equal(requests.length, before, 'Missing ECID is never substituted from the prior profile');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    await page.goto(origin + '/profile-viewer/etihad-demo.html');
    await page.waitForFunction(() => !!window.DemoTagsInjection && !!window.SiteCloneBc);
    assert.equal(await page.locator('#etihadSiteFrame').count(), 1, 'Etihad keeps its existing iframe surface');
    assert.equal(await page.evaluate(() => !!window.SiteCloneBcPage.useParentDocument), false, 'Parent-document BC behavior is opt-in');
    console.log('Riyadh Air: contract, real shared shell, rejection recovery, booking/upgrade/disruption, identity safety, reload, desktop/mobile and theme checks passed (fixture APIs only).');
    await browserContext.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

contractTests();
browserTests().catch((error) => { console.error(error); process.exitCode = 1; });
