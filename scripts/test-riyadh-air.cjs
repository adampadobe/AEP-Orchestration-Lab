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
  const vm = require('node:vm');
  const fixtureWindow = {};
  vm.runInNewContext(require('node:fs').readFileSync(path.resolve(__dirname, '../web/profile-viewer/riyadh-air-booking.js'), 'utf8'),
    { window: fixtureWindow });
  const pricing = fixtureWindow.RiyadhAirBooking;
  for (const destination of ['LHR', 'CGK', 'MXP', 'BKK']) {
    const search = { origin: 'RUH', destination, date: '2026-11-01', returnDate: '2026-11-19', cabin: 'Economy' };
    for (const leg of ['outbound', 'return']) {
      const fares = [];
      for (let day = 1; day <= 28; day++) {
        const dated = { ...search, [leg === 'outbound' ? 'date' : 'returnDate']: '2026-11-' + String(day).padStart(2, '0') };
        const economy = pricing.fare(leg, 'Economy', 'Lite', dated);
        fares.push(economy);
        assert.equal(economy, pricing.fare(leg, 'Economy', 'Lite', dated), 'Prices are deterministic');
        assert(economy > 0 && Number.isInteger(economy));
        assert(pricing.fare(leg, 'Economy', 'Smart', dated) > economy);
        assert(pricing.fare(leg, 'Economy', 'Flex', dated) > pricing.fare(leg, 'Economy', 'Smart', dated));
        assert(pricing.fare(leg, 'Premium Economy', 'Lite', dated) > economy);
        assert(pricing.fare(leg, 'Business', 'Lite', dated) > pricing.fare(leg, 'Premium Economy', 'Lite', dated));
      }
      assert(new Set(fares).size > 10, 'Each route/direction has meaningful date variation');
    }
  }
  assert.throws(() => pricing.fare('outbound', 'Economy', 'Lite', { origin: 'RUH', destination: 'LHR', date: '2026-02-30' }), /valid travel date/);
  const nav = require('node:fs').readFileSync(path.resolve(__dirname, '../web/profile-viewer/aep-lab-nav.js'), 'utf8');
  const riyadhIcon = nav.match(/navHideKey: 'riyadhAirWebDemo',[\s\S]*?ico: '([^']+)'/);
  assert(riyadhIcon && riyadhIcon[1].startsWith('<svg '), 'Riyadh navigation uses an SVG, not a literal HTML entity');
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
      res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.png': 'image/png' }[extension] || 'application/octet-stream' }).end(body);
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
    await page.clock.install({ time: new Date('2026-10-14T12:00:00Z') });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/profile-viewer/riyadh-air-demo.html');
    await page.evaluate(() => window.RiyadhAirLab.ready);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    assert.equal(await page.locator('#aepDemoEnvSection').count(), 1);
    assert.equal(await page.locator('#profileDrawer').count(), 1);
    assert.equal(await page.locator('#siteCloneDecisioningEnabledToggle').count(), 1);
    assert.equal(await page.locator('iframe').count(), 0, 'Customer website must be AJO-authorable in the top document');
    await page.evaluate(async () => {
      document.activeElement.blur();
      const images = [...document.querySelectorAll('#raCustomerSite img')];
      images.forEach((image) => { image.loading = 'eager'; });
      await Promise.all(images.map((image) => image.decode()));
      window.EnvBarCompact.closeOverlay({ force: true });
      window.scrollTo(0, 0);
    });
    await page.waitForFunction(() => document.getElementById('profileDrawer').getBoundingClientRect().top >= innerHeight - 30);
    assert(await page.evaluate(() => document.getElementById('riyadh-air-header').getBoundingClientRect().top < 180), 'No empty dashboard viewport before the customer site');
    assert.equal(await page.locator('.ra-hero-art').count(), 0, 'Reference has no illustrated airplane hero');
    assert.equal(await page.locator('.ra-experience-cards .ra-photo-card').count(), 4);
    assert.equal(await page.locator('.ra-newsletter-form label').first().evaluate((label) => getComputedStyle(label).color), 'rgb(255, 255, 255)', 'Lab theme does not override newsletter label contrast');
    const sequence = await page.locator('#raHome > [id]').evaluateAll((sections) => sections.map((section) => section.id));
    assert.deepEqual(sequence, ['raBooking', 'raTravelUpdates', 'raHero', 'hero-banner', 'raOffers', 'raSfeer', 'raExperience', 'raCargo', 'raSaudi', 'raNewsletter', 'raVisa', 'raContact', 'raFeatureDetail', 'ContentCardContainer']);
    assert(await page.evaluate(() => [...document.querySelectorAll('#raCustomerSite img')].every((image) => image.complete && image.naturalWidth > 0)), 'All supplied images decode');
    if (process.env.RIYADH_SCREENSHOTS) {
      await fs.mkdir(process.env.RIYADH_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.RIYADH_SCREENSHOTS, 'riyadh-home-desktop.png'), animations: 'disabled' });
      // Full-page capture expands the viewport and exposes translated fixed drawers.
      const customerCaptureStyle = '#profileDrawer { visibility: hidden !important; }';
      await page.screenshot({ path: path.join(process.env.RIYADH_SCREENSHOTS, 'riyadh-reference-desktop-full.png'), fullPage: true, animations: 'disabled', style: customerCaptureStyle });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(process.env.RIYADH_SCREENSHOTS, 'riyadh-home-mobile.png'), animations: 'disabled' });
      await page.screenshot({ path: path.join(process.env.RIYADH_SCREENSHOTS, 'riyadh-reference-mobile-full.png'), fullPage: true, animations: 'disabled', style: customerCaptureStyle });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Photographic homepage has no mobile overflow');
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.locator('[data-ra-destination="MXP"]').click();
    assert.equal(await page.locator('#raOrigin').inputValue(), 'RUH');
    assert.equal(await page.locator('#raDestination').inputValue(), 'MXP');
    await page.locator('#raOriginButton').click();
    await page.locator('[data-ra-airport="LHR"]').click();
    await page.locator('#raDestinationButton').click();
    await page.locator('[data-ra-airport="RUH"]').click();
    await page.locator('.ra-experience-cards [data-ra-feature="cabin"]').click();
    await page.getByRole('heading', { name: 'Cabin interiors', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close details' }).click();
    const newsletter = page.locator('[data-ra-local-form]');
    await newsletter.locator('[name="firstName"]').fill('Nour');
    await newsletter.locator('[name="lastName"]').fill('Alam');
    await newsletter.locator('[name="email"]').fill('nour@example.test');
    await newsletter.locator('[type="checkbox"]').check();
    await newsletter.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await newsletter.getByText('Demo form completed locally.', { exact: false }).waitFor();
    assert.equal(requests.length, 0, 'Reference newsletter never sends customer data');

    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.waitForFunction(() => document.getElementById('raDeliveryStatus').textContent.includes('Resolve a valid ECID'));
    assert.equal(requests.length, 0, 'No silent fallback to another identity');
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    async function capture(name) {
      if (!process.env.RIYADH_SCREENSHOTS) return;
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => {
          window.EnvBarCompact.closeOverlay({ force: true });
          window.scrollTo(0, 0);
        });
        await page.screenshot({ path: path.join(process.env.RIYADH_SCREENSHOTS, name + '-' + width + '.png'), fullPage: true,
          animations: 'disabled', style: '#profileDrawer { visibility: hidden !important; }' });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' has no overflow at ' + width);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    assert.equal(await page.locator('#raOrigin').inputValue(), 'LHR', 'Original London-to-Riyadh story remains the default');
    await page.locator('#raOriginButton').click();
    await page.locator('#raAirportSearch').fill('riyadh');
    await page.locator('#raAirportSearch').press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#raOrigin').inputValue(), 'RUH');
    await page.locator('#raDestinationButton').click();
    await page.locator('#raAirportSearch').fill('United Kingdom');
    await page.locator('[data-ra-airport="LHR"]').click();
    await page.locator('#raDestinationButton').click();
    await page.keyboard.press('Escape');
    assert(await page.locator('#raAirportPicker').isHidden());
    assert.equal(await page.locator('#raDestinationButton').getAttribute('aria-expanded'), 'false');
    await page.locator('#raDepartureButton').click();
    assert(await page.locator('[data-ra-day="2026-10-13"]').isDisabled(), 'Past dates are disabled');
    await page.locator('[data-ra-day="2026-11-01"]').click();
    await page.locator('[data-ra-day="2026-11-19"]').click();
    assert.equal(await page.locator('#raDeparture').inputValue(), '2026-11-01');
    assert.equal(await page.locator('#raReturn').inputValue(), '2026-11-19');
    assert.equal(await page.locator('.ra-date-in-range').count(), 17);
    await capture('riyadh-calendar');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.getByRole('heading', { name: 'Choose your flight' }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('step'), 'results');
    assert(await page.getByRole('button', { name: 'Select return Smart', exact: true }).isDisabled(), 'Return is locked until outbound is chosen');
    await capture('riyadh-outbound');
    failNext = true;
    await page.getByRole('button', { name: 'Select outbound Flex', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('raDeliveryStatus').textContent.includes('Fixture ingestion rejection'));
    assert(await page.getByRole('heading', { name: 'Choose your flight' }).isVisible());
    await page.getByRole('button', { name: 'Select outbound Flex', exact: true }).click();
    await page.getByRole('heading', { name: 'Choose your return flight', exact: true }).waitFor();
    const beforeHistory = requests.length;
    await page.goBack();
    await page.getByRole('heading', { name: 'Choose your flight', exact: true }).waitFor();
    await page.goForward();
    await page.getByRole('heading', { name: 'Choose your return flight', exact: true }).waitFor();
    assert.equal(requests.length, beforeHistory, 'History does not re-ingest search/selection');
    await page.getByRole('button', { name: 'Premium Economy', exact: false }).last().click();
    assert(await page.getByRole('button', { name: 'Premium Economy', exact: false }).last().getAttribute('aria-pressed') === 'true');
    await page.getByRole('button', { name: /^Economy From/ }).click();
    const originalReturnPrice = await page.locator('.ra-bundle-heading strong').first().textContent();
    const changedDatePrice = await page.locator('[data-ra-action="flightDate"][data-date="2026-11-20"] small').textContent();
    await page.locator('[data-ra-action="flightDate"][data-date="2026-11-20"]').click();
    assert.equal(await page.locator('#raReturn').inputValue(), '2026-11-20', 'Return date strip changes retained search');
    assert.notEqual(await page.locator('.ra-bundle-heading strong').first().textContent(), originalReturnPrice, 'Changing dates changes fares');
    assert.equal('From ' + await page.locator('.ra-bundle-heading strong').first().textContent(), changedDatePrice, 'Date-strip quote matches selectable fare');
    await page.locator('[data-ra-action="flightDate"][data-date="2026-11-19"]').click();
    await capture('riyadh-return');
    await page.getByRole('button', { name: 'Select return Smart', exact: true }).click();
    await page.locator('#raPassengerForm').waitFor();
    await capture('riyadh-guests');
    await page.getByRole('button', { name: 'Shopping cart', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Check out now' }).isDisabled());
    assert.equal(await page.locator('.ra-cart-total strong').textContent(), 'SAR 4,129');
    await capture('riyadh-cart-incomplete');
    await page.getByRole('button', { name: 'Add guest details', exact: true }).click();
    await page.locator('[name="title"]').selectOption('Ms');
    await page.locator('[name="dob"]').fill('1990-01-10');
    await page.getByRole('button', { name: 'Continue to contact details' }).click();
    await page.locator('[name="contactEmail"]').fill('contact@example.test');
    await page.locator('[name="phone"]').fill('+440000000000');
    await page.getByRole('button', { name: 'Save guest details' }).click();
    await page.getByRole('button', { name: 'Check out now' }).waitFor();
    assert(await page.getByRole('button', { name: 'Check out now' }).isEnabled());
    assert.equal(await page.locator('.ra-cart-total strong').textContent(), 'SAR 4,129');
    await page.getByRole('button', { name: 'Edit guest details', exact: true }).click();
    await page.getByRole('button', { name: 'Change outbound flight', exact: true }).click();
    await page.getByRole('button', { name: 'Select outbound Smart', exact: true }).click();
    await page.getByRole('button', { name: 'Select return Smart', exact: true }).click();
    await page.getByRole('button', { name: 'Shopping cart', exact: true }).click();
    assert.equal(await page.locator('.ra-cart-total strong').textContent(), 'SAR 3,953', 'Fare editing recalculates the full round-trip basket');
    await page.getByRole('button', { name: 'Edit guest details', exact: true }).click();
    await page.getByRole('button', { name: 'Change outbound flight', exact: true }).click();
    await page.getByRole('button', { name: 'Select outbound Flex', exact: true }).click();
    await page.getByRole('button', { name: 'Select return Smart', exact: true }).click();
    await page.getByRole('button', { name: 'Shopping cart', exact: true }).click();
    assert.equal(await page.locator('.ra-cart-total strong').textContent(), 'SAR 4,129');
    const beforeReload = requests.length;
    await page.reload();
    await page.evaluate(() => window.RiyadhAirLab.ready);
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.getByRole('button', { name: 'Check out now' }).waitFor();
    assert.equal(requests.length, beforeReload, 'Reload retains completed cart without sending events');
    await page.getByRole('button', { name: 'Edit guest details', exact: true }).click();
    assert.equal(await page.locator('[name="dob"]').inputValue(), '1990-01-10');
    assert.equal(await page.locator('#raPassengerForm [name="firstName"]').inputValue(), 'Nour');
    await page.getByRole('button', { name: 'Continue to contact details' }).click();
    assert.equal(await page.locator('[name="contactEmail"]').inputValue(), 'contact@example.test');
    await page.getByRole('button', { name: 'Save guest details' }).click();
    assert.equal(requests.filter((body) => body.eventType === 'travel.booking.passengerDetails').length, 1, 'Guest editing is not duplicate ingestion');
    await capture('riyadh-cart-complete');
    await page.getByRole('button', { name: 'Check out now' }).click();
    assert.equal(new URL(page.url()).searchParams.get('step'), 'payment');
    assert.equal(requests.filter((body) => body.eventType.startsWith('travel.ancillary')).length, 0, 'No ancillary event before base-flight booking');
    await page.locator('#raPaymentForm input').check();
    await page.getByRole('button', { name: 'Confirm demo booking' }).click();
    await page.getByRole('button', { name: 'Explore a cabin upgrade' }).waitFor();
    const booking = requests.find((body) => body.eventType === 'travel.booking.confirm');
    assert(booking.public.travel.confirmationNumber);
    const bookingRef = booking.public.travel.confirmationNumber;
    assert.equal(requests.filter((body) => body.eventType === 'travel.booking.confirm').length, 1);
    assert.equal(new URL(booking.public.generic.linkUrl).searchParams.get('seat'), null, 'Base flight has no purchased seat');
    assert.equal(await page.locator('#raPaidAmount').textContent(), 'SAR 4,129');
    await page.getByRole('button', { name: 'Choose seats and extras' }).click();
    await page.getByRole('button', { name: 'Seat 14A', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-seat="14A"]').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('#raAncillarySubtotal').textContent(), 'Ancillary subtotal: SAR 180');
    const pendingUrl = page.url();
    assert.equal(new URL(pendingUrl).searchParams.get('booking'), bookingRef);
    assert.equal(new URL(pendingUrl).searchParams.get('offer'), 'extra-legroom-outbound');
    await capture('riyadh-paid-seat');
    await page.getByRole('button', { name: 'Save paid-seat interest' }).click();
    const intent = requests.find((body) => body.eventType === 'travel.ancillary.intent');
    assert.equal(intent.public.travel.confirmationNumber, bookingRef);
    assert.equal(new URL(intent.viewUrl).searchParams.get('currency'), 'SAR');
    await page.getByRole('button', { name: 'Continue without paid seat or extras' }).click();
    const abandonment = requests.find((body) => body.eventType === 'travel.ancillary.abandon');
    assert(abandonment, 'Declining an unpaid seat records ancillary abandonment');
    assert.equal(abandonment.public.travel.confirmationNumber, bookingRef);
    assert.equal(new URL(abandonment.viewUrl).searchParams.get('seat'), '14A');
    assert.equal(new URL(abandonment.viewUrl).searchParams.get('amount'), '180');
    assert.equal(await page.locator('#raPaidAmount').textContent(), 'SAR 4,129', 'Decline does not alter paid flight amount');
    assert(await page.getByText('Included with outbound Flex; not an assignment', { exact: true }).isVisible());
    assert(await page.getByText('No paid seat purchased or assigned', { exact: true }).isVisible());
    const beforeSeatHistory = requests.length;
    await page.goBack();
    await page.getByRole('button', { name: 'Continue without paid seat or extras' }).waitFor();
    assert.equal(requests.length, beforeSeatHistory, 'Back does not repeat ancillary events');
    await page.reload();
    await page.evaluate(() => window.RiyadhAirLab.ready);
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.getByRole('button', { name: 'Continue without paid seat or extras' }).waitFor();
    assert.equal(await page.locator('[data-seat="14A"]').getAttribute('aria-pressed'), 'true', 'Pending offer survives reload without assignment');
    await page.getByRole('button', { name: 'Continue without paid seat or extras' }).click();
    assert.equal(requests.filter((body) => body.eventType === 'travel.ancillary.abandon').length, 1, 'Same offer is not abandoned twice');
    const savedTrip = await page.evaluate(() => JSON.parse(sessionStorage.getItem('riyadhAirJourneyV1')).trip);
    assert.equal(savedTrip.paidAmount, 4129);
    assert.equal(savedTrip.booked, true);
    assert.equal(savedTrip.seat, '');
    assert(!JSON.stringify(requests).includes('1990-01-10'));
    assert(!JSON.stringify(requests).includes('contact@example.test'));
    assert(!JSON.stringify(requests).includes('+440000000000'));
    await page.goto(pendingUrl);
    await page.evaluate(() => window.RiyadhAirLab.ready);
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.getByRole('button', { name: 'Continue without paid seat or extras' }).waitFor();
    assert.equal(await page.locator('[data-seat="14A"]').getAttribute('aria-pressed'), 'true', 'Same-tab campaign URL restores confirmed booking and offer');
    await page.getByRole('button', { name: 'Continue without paid seat or extras' }).click();
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
    missingEcid = false;
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.goto(origin + '/profile-viewer/riyadh-air-demo.html?step=extras&booking=OTHER');
    await page.evaluate(() => window.RiyadhAirLab.ready);
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    assert(await page.locator('#raHome').isVisible(), 'A mismatched booking URL cannot expose a different stored offer');
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.locator('#raPresenter summary').click();
    await page.getByRole('button', { name: 'Reset local trip', exact: true }).click();
    await page.locator('#raPresenter summary').click();
    await page.locator('#raOriginButton').click();
    await page.locator('[data-ra-airport="LHR"]').click();
    await page.locator('#raDestinationButton').click();
    await page.locator('[data-ra-airport="RUH"]').click();
    await page.getByRole('button', { name: 'Clear return date' }).click();
    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.getByRole('button', { name: 'Select outbound Lite', exact: true }).click();
    await page.locator('#raPassengerForm').waitFor();
    assert.equal(await page.locator('.ra-selected-leg').count(), 1, 'Original direction also supports a one-way booking');
    assert.equal(new URL(page.url()).searchParams.get('step'), 'passenger');
    for (const [destination, city, image, expectedTotal] of [
      ['LHR', 'London', 'london', 4129], ['CGK', 'Jakarta', 'jakarta', 3577],
      ['MXP', 'Milan', 'milan', 3877], ['BKK', 'Bangkok', 'bangkok', 3777],
      ['RUH', 'Riyadh', 'riyadh', 4082],
    ]) {
      await page.evaluate(() => { document.getElementById('raPresenter').open = true; });
      await page.getByRole('button', { name: 'Reset local trip', exact: true }).click();
      await page.evaluate(() => { document.getElementById('raPresenter').open = false; });
      const departure = destination === 'RUH' ? 'LHR' : 'RUH';
      await page.locator('#raOriginButton').click();
      await page.locator('[data-ra-airport="' + departure + '"]').click();
      await page.locator('#raDestinationButton').click();
      await page.locator('[data-ra-airport="' + destination + '"]').click();
      await page.locator('#raDepartureButton').click();
      await page.locator('[data-ra-day="2026-11-01"]').click();
      await page.locator('[data-ra-day="2026-11-19"]').click();
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByRole('button', { name: 'Search flights' }).click();
      await page.getByRole('heading', { name: 'Flight to ' + city, exact: true }).waitFor();
      await page.getByRole('button', { name: 'Select outbound Flex', exact: true }).click();
      await page.getByRole('button', { name: 'Select return Smart', exact: true }).click();
      const legs = page.locator('.ra-selected-leg');
      assert((await legs.nth(0).textContent()).includes(departure + ' – ' + destination));
      assert((await legs.nth(1).textContent()).includes(destination + ' – ' + departure));
      const lastSelection = requests.filter((body) => body.eventType === 'travel.flight.select').at(-1);
      assert.equal(lastSelection.public.travel.departureAirport, destination, 'Return event reverses airport direction');
      assert.equal(lastSelection.public.travel.arrivalAirport, departure);
      await page.locator('[name="title"]').selectOption('Ms');
      await page.locator('[name="dob"]').fill('1990-01-10');
      await page.getByRole('button', { name: 'Continue to contact details' }).click();
      await page.locator('[name="contactEmail"]').fill('contact@example.test');
      await page.locator('[name="phone"]').fill('+440000000000');
      await page.getByRole('button', { name: 'Save guest details' }).click();
      assert.equal(await page.locator('.ra-cart-total strong').textContent(), 'SAR ' + expectedTotal.toLocaleString('en-GB'), city + ' has route-specific round-trip total');
      assert.equal(await page.locator('.ra-cart-card > img').getAttribute('src'), 'riyadh-air-assets/' + image + '.avif');
      await page.getByRole('button', { name: 'Check out now' }).click();
      assert.equal(await page.locator('.ra-destination-summary img').getAttribute('src'), 'riyadh-air-assets/' + image + '.avif');
      assert((await page.locator('.ra-destination-summary').textContent()).includes(departure + ' → ' + destination));
      await page.locator('#raPaymentForm input').check();
      await page.getByRole('button', { name: 'Confirm demo booking' }).click();
      await page.getByRole('button', { name: 'Choose seats and extras' }).waitFor();
      assert.equal(await page.locator('.ra-destination-summary img').getAttribute('src'), 'riyadh-air-assets/' + image + '.avif');
      assert.equal(await page.locator('#raPaidAmount').textContent(), 'SAR ' + expectedTotal.toLocaleString('en-GB'));
      const baseBooking = requests.filter((body) => body.eventType === 'travel.booking.confirm').at(-1);
      const ref = baseBooking.public.travel.confirmationNumber;
      await page.getByRole('button', { name: 'Choose seats and extras' }).click();
      await page.getByRole('button', { name: 'Seat 14A', exact: true }).click();
      await page.getByRole('button', { name: 'Continue without paid seat or extras' }).click();
      const abandon = requests.filter((body) => body.eventType === 'travel.ancillary.abandon').at(-1);
      assert.equal(abandon.public.travel.confirmationNumber, ref);
      assert.equal(abandon.public.travel.departureAirport, departure);
      assert.equal(abandon.public.travel.arrivalAirport, destination);
      assert.equal(new URL(abandon.viewUrl).searchParams.get('return'), '2026-11-19');
      assert.equal(await page.locator('#raPaidAmount').textContent(), 'SAR ' + expectedTotal.toLocaleString('en-GB'));
      await page.getByRole('button', { name: 'Back to home', exact: false }).click();
      const beforeSearchChange = requests.length;
      await page.getByRole('button', { name: 'Search flights' }).click();
      assert.equal(requests.length, beforeSearchChange, 'Searching cannot overwrite a confirmed booking');
    }
    await page.evaluate(() => { document.getElementById('raPresenter').open = true; });
    await page.getByRole('button', { name: 'Reset local trip', exact: true }).click();
    await page.evaluate(() => { document.getElementById('raPresenter').open = false; });
    await page.locator('#raOriginButton').click();
    await page.locator('[data-ra-airport="CGK"]').click();
    await page.locator('#raDestinationButton').click();
    await page.locator('[data-ra-airport="MXP"]').click();
    const beforeUnavailable = requests.length;
    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.waitForFunction(() => document.getElementById('raDeliveryStatus').textContent.includes('Demo flights are available between Riyadh'));
    assert.equal(requests.length, beforeUnavailable, 'Unsupported airport combinations give availability feedback, not invented flights');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    await page.goto(origin + '/profile-viewer/etihad-demo.html');
    await page.waitForFunction(() => !!window.DemoTagsInjection && !!window.SiteCloneBc);
    assert.equal(await page.locator('#etihadSiteFrame').count(), 1, 'Etihad keeps its existing iframe surface');
    assert.equal(await page.evaluate(() => !!window.SiteCloneBcPage.useParentDocument), false, 'Parent-document BC behavior is opt-in');
    console.log('Riyadh Air: round-trip fares, keyboard airport/calendar, URL history/reload, guest/cart gating, confirmed flight → unpaid-seat abandonment, upgrade/disruption, identity safety and responsive/theme checks passed (fixture APIs only).');
    await browserContext.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

contractTests();
browserTests().catch((error) => { console.error(error); process.exitCode = 1; });
