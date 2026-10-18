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
const bookingProfile = { ...profile, email: 'booking@example.test', ecid: '98765432109876543210987654321098765432' };
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
    assert(!/lab|customer website|riyadh air \//i.test(body.viewName), 'Business event titles use natural action labels');
    assert.equal(body.public.generic.ctaLabel, body.viewName);
    assert.equal(xdm.eventType, events.TYPES[action]);
    assert.equal(xdm.identityMap.ECID[0].id, ecid);
    assert.equal(xdm.identityMap.ECID[0].primary, true);
    assert.equal(xdm.identityMap.Email[0].id, profile.email);
    assert.equal(xdm.identityMap.Email[0].primary, false);
    assert.equal(xdm._demoemea.public.travel.confirmationNumber, trip.reference);
    assert.equal(body.eventID, undefined, 'Riyadh events do not forward orchestration IDs');
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
  assert.equal(events.TYPES.booking, 'flight.booked', 'Booking confirmation matches the requested AJO rule contract');
  assert.throws(() => events.build('booking', trip, { ...context, known: false }), /booking email/);
  const custom = events.buildCustom('  my.journey.trigger  ', context);
  assert.equal(custom.eventType, 'my.journey.trigger');
  assert.equal(custom.xdmStyle, 'minimal');
  assert.equal(custom.public, undefined, 'Simple manual events do not fabricate a booking');
  assert.equal(custom.email, profile.email);
  assert.equal(buildGeneratorEdgeInteractXdm(custom, target).eventType, 'my.journey.trigger');
  assert.equal(buildGeneratorEdgeInteractXdm(custom, target)._experience, undefined, 'Minimal manual events have no orchestration context');
  const boundCustom = events.buildCustom('flight.delayed', context, { eventID: 'my-ajo-event', trip: { ...trip, booked: true } });
  const boundXdm = buildGeneratorEdgeInteractXdm(boundCustom, target);
  assert.equal(boundCustom.eventID, undefined, 'Manual events do not forward orchestration IDs');
  assert.equal(boundXdm._demoemea.public.travel.confirmationNumber, trip.reference);
  assert.throws(() => events.buildCustom(' ', context), /event type/);
  assert.throws(() => events.buildCustom('x'.repeat(257), context), /event type/);
  assert.throws(() => events.buildCustom('bad\nevent', context), /event type/);
  assert.throws(() => events.buildCustom('my.event', context, { trip }), /Confirm a booking/);
  assert.throws(() => events.buildCustom('my.event', { ...context, ecid: '' }), /ECID/);
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
      res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[extension] || 'application/octet-stream' }).end(body);
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
    let abortNext = false;
    let currentTarget = target;
    let duringSend = '';
    await browserContext.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { await route.fulfill({ body: '', contentType: 'text/javascript' }); return; }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      let data = {};
      if (url.pathname === '/api/aep') data = { sandboxes: [{ name: 'apalmer', title: 'apalmer' }, { name: 'kirkham', title: 'kirkham' }] };
      else if (url.pathname === '/api/sandboxes') data = { sandboxes: [{ name: 'apalmer', title: 'apalmer' }, { name: 'kirkham', title: 'kirkham' }] };
      else if (url.pathname === '/api/events/generator-targets') data = { sandbox: url.searchParams.get('sandbox'), targets: [currentTarget] };
      else if (url.pathname === '/api/events/generator') {
        const body = route.request().postDataJSON();
        requests.push(body);
        if (duringSend === 'target') {
          duringSend = '';
          currentTarget = { ...target, dataStreamId: 'inflight-changed-datastream' };
        } else if (duringSend === 'identity') {
          duringSend = '';
          await page.evaluate(() => {
            const input = document.getElementById('customerEmail');
            input.value = 'changed@example.test';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
        }
        if (abortNext) { abortNext = false; await route.abort('failed'); return; }
        if (failNext) { failNext = false; await route.fulfill({ status: 400, json: { ok: false, error: 'Fixture ingestion rejection' } }); return; }
        data = { ok: true, transport: 'edge', requestId: 'fixture-' + requests.length };
      } else if (url.pathname === '/api/profile/consent') {
        const identifier = url.searchParams.get('identifier');
        const found = [profile, bookingProfile].find((candidate) => identifier === candidate.email || identifier === candidate.ecid);
        data = found ? { ...found, ecid: missingEcid ? null : found.ecid } : { found: false };
      } else if (url.pathname === '/api/profile/events') data = { events: [], eventsStory: [] };
      else if (url.pathname === '/api/env-bar-config') data = { config: null };
      else if (url.pathname === '/api/tags/reactor') data = { data: [] };
      else if (url.pathname === '/api/lab/user-sandbox-data') data = { keys: {} };
      await route.fulfill({ json: data });
    });
    await browserContext.addInitScript(() => {
      let tags;
      Object.defineProperty(window, 'DemoTagsInjection', {
        configurable: true,
        get() { return tags; },
        set(value) {
          const init = value.init;
          tags = { ...value, init(options) {
            window.raTagsOptions = options;
            window.raTagsInstance = init(options);
            return window.raTagsInstance;
          } };
        },
      });
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
    assert.equal(await page.title(), 'Web page view - Home page');
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    async function assertCustomerCopy(surface) {
      assert.doesNotMatch(await page.locator('#raCustomerSite').innerText(), /\bdemo(?:nstration)?\b/i,
        surface + ': customer copy must not use demo labels');
    }
    await assertCustomerCopy('Home page');
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
    assert.deepEqual(sequence, ['raTravelUpdates', 'raHero', 'raOffers', 'raSfeer', 'raExperience', 'raCargo', 'raSaudi', 'raNewsletter', 'raVisa', 'raContact', 'raFeatureDetail']);
    async function searchGeometry(name) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        assert(await page.locator('#raBooking').evaluate((booker) => {
          const header = document.getElementById('riyadh-air-header');
          return !header.contains(booker) && booker.getBoundingClientRect().top >= header.getBoundingClientRect().bottom &&
            getComputedStyle(booker).backgroundColor === 'rgb(255, 255, 255)' && header.querySelector('nav').checkVisibility();
        }), name + ': white search pill is separate below full navigation at ' + width);
        await page.locator('#raDestinationButton').click();
        assert(await page.locator('#raAirportPicker').evaluate((picker) => {
          const rect = picker.getBoundingClientRect();
          const header = document.getElementById('riyadh-air-header').getBoundingClientRect();
          const rail = document.getElementById('raPresenterLauncher').getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth && rect.top >= header.bottom &&
            (rect.right <= rail.left || rect.left >= rail.right || rect.bottom <= rail.top || rect.top >= rail.bottom);
        }), name + ': airport list avoids navigation and presenter rail at ' + width);
        await page.keyboard.press('Escape');
        await page.locator('#raDepartureButton').click();
        assert(await page.locator('#raCalendar').evaluate((calendar) => {
          const rect = calendar.getBoundingClientRect();
          const rail = document.getElementById('raPresenterLauncher').getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth &&
            (rect.right <= rail.left || rect.left >= rail.right || rect.bottom <= rail.top || rect.top >= rail.bottom);
        }), name + ': calendar stays clear of presenter rail at ' + width);
        await page.keyboard.press('Escape');
        if (process.env.RIYADH_SEARCH_SCREENSHOTS) {
          await fs.mkdir(process.env.RIYADH_SEARCH_SCREENSHOTS, { recursive: true });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(process.env.RIYADH_SEARCH_SCREENSHOTS, name + '-' + width + '.png'), animations: 'disabled' });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await searchGeometry('homepage');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const hiddenClass of ['lab-env-top-anchor--docked-hidden', 'lab-env-top-anchor--presenter-strip-hidden']) {
        await page.evaluate((className) => {
          document.getElementById('riyadhDemoTopAnchor').classList.add(className);
          window.scrollTo(0, 0);
        }, hiddenClass);
        assert(await page.locator('#riyadh-air-header').evaluate((header) => Math.abs(header.getBoundingClientRect().top) <= 1),
          'Hidden Lab bar leaves no blank strip: ' + hiddenClass + ' at ' + width);
        await page.evaluate((className) => document.getElementById('riyadhDemoTopAnchor').classList.remove(className), hiddenClass);
      }
      await page.waitForFunction(() => document.getElementById('riyadh-air-header').getBoundingClientRect().top >= document.querySelector('#riyadhDemoTopAnchor .lab-env-toolbar').getBoundingClientRect().bottom - 1);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
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
    await newsletter.getByText('Form completed locally.', { exact: false }).waitFor();
    await assertCustomerCopy('Newsletter result');
    assert.equal(requests.length, 0, 'Reference newsletter never sends customer data');

    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.waitForFunction(() => document.getElementById('raDeliveryStatus').textContent.includes('selected profile and environment'));
    assert.match(await page.locator('#raPresenterStatus').textContent(), /Resolve a valid ECID/);
    assert.equal(requests.length, 0, 'No silent fallback to another identity');
    await page.evaluate(() => {
      window.raIdentitySends = [];
      window.raRejectIdentity = false;
      window.alloy = async (command, options) => {
        if (command === 'sendEvent') {
          window.raIdentitySends.push(options);
          if (window.raRejectIdentity) throw new Error('Fixture Adobe identity rejection');
        }
        return {};
      };
    });
    await page.locator('#raAccountButton').click();
    assert(await page.getByRole('heading', { name: "Join Sfeer, Riyadh Air's lifestyle program" }).isVisible());
    await page.locator('#raLogIn').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'raAccountClose', 'Account focus wraps inside dialog');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'raLogIn');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.locator('#raAccountDialog').evaluate((dialog) => {
        const rect = dialog.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
      }), 'Sfeer menu fits desktop/mobile');
      await page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
      assert.equal(await page.locator('#raAccountTitle').evaluate((heading) => getComputedStyle(heading).color), 'rgb(255, 255, 255)', 'Sfeer text retains brand contrast in dark theme');
      await page.evaluate(() => document.documentElement.removeAttribute('data-aep-theme'));
      if (process.env.RIYADH_ACCOUNT_SCREENSHOTS) {
        await fs.mkdir(process.env.RIYADH_ACCOUNT_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.RIYADH_ACCOUNT_SCREENSHOTS, 'sfeer-menu-' + width + '.png'), animations: 'disabled' });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#raLogIn').click();
    await page.locator('#raAccountEmail').fill('missing@example.test');
    await page.locator('#raAccountSubmit').click();
    await page.locator('#raAccountError:not([hidden])').waitFor();
    assert.equal(await page.locator('#raAccountLabel').textContent(), 'My profile', 'Missing profile cannot sign in');
    await page.evaluate(() => { window.raRejectIdentity = true; });
    await page.locator('#raAccountEmail').fill(profile.email);
    await page.locator('#raAccountSubmit').click();
    await page.waitForFunction(() => !document.getElementById('raAccountForm').hasAttribute('aria-busy'));
    assert(await page.locator('#raAccountDialog').evaluate((dialog) => dialog.open), 'Adobe rejection keeps login open');
    assert.equal(await page.locator('#raAccountLabel').textContent(), 'My profile', 'No success when Adobe did not accept identity');
    await page.locator('#raAccountBack').click();
    await page.locator('#raJoinNow').click();
    assert.match(await page.locator('#raAccountFormHint').textContent(), /does not create/);
    assert.doesNotMatch(await page.locator('#raAccountDialog').innerText(), /\bdemo\b/i);
    for (const change of ['identity', 'sandbox']) {
      await page.evaluate(() => {
        window.raIdentitySends = [];
        window.alloy = async (command, options) => {
          if (command !== 'sendEvent') return {};
          window.raIdentitySends.push(options);
          await new Promise((resolve) => { window.raCompleteStitch = resolve; });
          return {};
        };
      });
      await page.locator('#raAccountEmail').fill(profile.email);
      await page.locator('#raAccountForm').evaluate((form) => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await page.waitForFunction(() => !!window.raCompleteStitch);
      await page.evaluate((mutation) => {
        if (mutation === 'sandbox') window.AepGlobalSandbox.setSelected('kirkham', { source: 'user' });
        else {
          document.getElementById('customerEmail').value = 'different@example.test';
          document.getElementById('customerEmail').dispatchEvent(new Event('input', { bubbles: true }));
        }
        window.raCompleteStitch();
        window.raCompleteStitch = null;
      }, change);
      await page.waitForFunction(() => !document.getElementById('raAccountForm').hasAttribute('aria-busy'));
      assert.equal(await page.locator('#raAccountLabel').textContent(), 'My profile', 'In-flight ' + change + ' change cannot sign in');
      assert.equal(await page.evaluate(() => window.raIdentitySends.length), 1, 'Rapid login submits do not duplicate stitching');
      assert(await page.locator('#raAccountError').isVisible());
      if (change === 'sandbox') await page.evaluate(() => window.AepGlobalSandbox.setSelected('apalmer', { source: 'user' }));
    }
    await page.evaluate(() => {
      window.raIdentitySends = [];
      window.alloy = async (command, options) => {
        if (command === 'sendEvent') window.raIdentitySends.push(options);
        return {};
      };
    });
    await page.locator('#raAccountEmail').fill(profile.email);
    await page.locator('#raAccountSubmit').click();
    await page.waitForFunction(() => !document.getElementById('raAccountDialog').open);
    assert.equal(await page.locator('#raAccountLabel').textContent(), 'My Sfeer');
    const identitySends = await page.evaluate(() => window.raIdentitySends);
    assert.equal(identitySends.length, 1, 'One shared Adobe identity stitch per explicit successful sign-in');
    assert.equal(identitySends[0].xdm.eventType, 'riyadhAir.identity.stitch');
    assert.equal(identitySends[0].xdm.identityMap.Email[0].id, profile.email);
    assert.equal(identitySends[0].xdm.identityMap.ECID[0].id, ecid);
    assert.equal(identitySends[0].xdm.identityMap.Email[0].authenticatedState, 'authenticated');
    assert.equal(requests.length, 0, 'Login does not duplicate a business event through generator');
    assert(!page.url().includes(profile.email), 'Login email never appears in URL');
    await page.locator('#raAccountButton').click();
    assert(await page.locator('#raAccountGreeting').isVisible());
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'raAccountButton');
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    const businessBeforeBrowse = requests.length;
    await page.locator('.ra-header [data-ra-page="plan"]').click();
    await page.locator('#raExploreTitle').filter({ hasText: 'Plan your next journey with ease' }).waitFor();
    assert.equal(await page.title(), 'Web page view - Plan & book');
    assert.equal(await page.evaluate(() => window.raIdentitySends.length), 1, 'No deferred page-view send without sandbox SDK identity');
    await page.evaluate((fixtureEcid) => {
      window.raTagsOptions.onEcidResolved(fixtureEcid);
      window.raPageViews = [];
      window.raFailPageView = false;
      window.alloy = async (command, options) => {
        if (command === 'sendEvent' && options.xdm.eventType === 'web.webPageDetails.pageViews') {
          window.raPageViews.push(options);
          if (window.raFailPageView) throw new Error('Fixture page-view transport failure');
        }
        return {};
      };
      localStorage.setItem('siteCloneBcDatastreamIdBySandbox', JSON.stringify({ apalmer: '11111111-2222-3333-4444-555555555555' }));
    }, ecid);
    for (const [route, title] of [['manage', 'We’re here to support your journey'], ['cancellation', 'Cancel your booking'], ['discover', 'Discover Riyadh'], ['diriyah', 'Diriyah'], ['edge-of-world', 'Edge of the World'], ['masmak', 'Al Masmak Palace'], ['kafd', 'King Abdullah Financial District'], ['boulevard-city', 'Boulevard City'], ['souq', 'Souq Al Zal'], ['destinations', 'Where we fly'], ['experience', 'The Riyadh Air experience'], ['plan', 'Plan your next journey with ease']]) {
      if (!await page.locator('[data-ra-page="' + route + '"]:visible').count()) {
        await page.locator('.ra-header [data-ra-page="discover"]').click();
        await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
      }
      await page.locator('[data-ra-page="' + route + '"]:visible').first().click();
      await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
      assert.equal(await page.locator('#raExploreTitle').textContent(), title);
      await assertCustomerCopy(route);
      assert.equal(new URL(page.url()).searchParams.get('step'), route);
      assert.equal(await page.locator('#raBooking').isVisible(), true, 'Shared search available while browsing');
      assert.equal(await page.locator('#raJourney').isVisible(), false, 'No booking progress on editorial pages');
      assert(await page.evaluate(() => ['TopRibbon', 'hero-banner', 'ContentCardContainer'].every((id) => !document.getElementById(id).closest('[hidden]'))), 'Personalisation mounts stay available beyond home');
      assert(await page.evaluate(() => document.querySelector(window.SiteCloneBcPage.injectedAnchorSelector).checkVisibility()), 'Brand Concierge anchors to the visible page');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'raExploreTitle', 'Navigation focuses page heading');
      assert.equal(await page.title(), 'Web page view - ' + await page.evaluate((key) => window.RiyadhAirExplore.title(key), route));
      assert.equal(await page.evaluate(() => window.raPageViews.at(-1).xdm.web.webPageDetails.name), await page.title(),
        'Customer timeline page-view name identifies the exact page clicked: ' + route);
      if (['manage', 'cancellation'].includes(route)) {
        assert.equal(await page.locator('.ra-header [aria-current="page"]').textContent(), 'Manage');
        for (const theme of ['dark', 'light']) {
          await page.evaluate((value) => document.documentElement.setAttribute('data-aep-theme', value), theme);
          assert.equal(await page.locator('#raExploreTitle').evaluate((heading) => getComputedStyle(heading).color), 'rgb(255, 255, 255)',
            'Manage hero keeps brand contrast in ' + theme);
        }
        if (route === 'manage') {
          await page.locator('.ra-manage-service[data-ra-action="manage"]').click();
          await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
          assert(await page.locator('#raDeliveryStatus').isVisible(), 'Missing booking has an explicit customer action failure');
          assert.match(await page.locator('#raPresenterStatus').textContent(), /no confirmed booking/i);
          assert.equal(requests.length, businessBeforeBrowse, 'Missing booking cannot generate a booking view');
        } else {
          assert.match(await page.locator('#raExplore').textContent(), /cannot cancel airline tickets or issue refunds/);
        }
      }
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ' has no horizontal overflow at ' + width);
        assert(await page.locator('.ra-search-button').evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const rail = document.getElementById('raPresenterLauncher').getBoundingClientRect();
          return rect.right <= rail.left || rect.left >= rail.right || rect.bottom <= rail.top || rect.top >= rail.bottom;
        }), 'Search button avoids presenter rail at ' + width);
        await page.evaluate(async () => {
          const images = [...document.querySelectorAll('#raExplore img')];
          images.forEach((image) => { image.loading = 'eager'; });
          await Promise.all(images.map((image) => image.decode()));
        });
        if (process.env.RIYADH_EXPLORE_SCREENSHOTS && ['plan', 'discover', 'manage', 'cancellation'].includes(route)) {
          await fs.mkdir(process.env.RIYADH_EXPLORE_SCREENSHOTS, { recursive: true });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(process.env.RIYADH_EXPLORE_SCREENSHOTS, route + '-' + width + '.png'), fullPage: true,
            animations: 'disabled', style: '#profileDrawer { visibility: hidden !important; }' });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    const pageViews = await page.evaluate(() => window.raPageViews);
    assert(pageViews.length >= 10);
    assert(pageViews.every((options) => options.edgeConfigOverrides.datastreamId === '11111111-2222-3333-4444-555555555555'));
    assert(pageViews.every((options) => options.xdm.identityMap.ECID[0].id === ecid && options.xdm.identityMap.Email[0].id === profile.email));
    assert(pageViews.every((options) => options.xdm._demoemea.identification.core.ecid === ecid));
    assert(pageViews.every((options) => !options.xdm.web.webPageDetails.URL.includes(profile.email) && options.xdm.web.webPageDetails.pageViews.value === 1));
    for (const label of ['Manage', 'Cancel your booking', 'Plan & book', 'Discover Riyadh']) {
      assert(pageViews.some((options) => options.xdm.web.webPageDetails.name === 'Web page view - ' + label),
        'Profile timeline receives natural page names: ' + label);
    }
    const viewCount = pageViews.length;
    await page.locator('.ra-header [data-ra-page="plan"]').click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(await page.evaluate(() => window.raPageViews.length), viewCount, 'Same-page click is not a second view');
    await page.goBack();
    await page.waitForFunction(() => document.title === 'Web page view - The Riyadh Air experience');
    await page.goForward();
    await page.waitForFunction(() => document.title === 'Web page view - Plan & book');
    assert.equal(await page.evaluate(() => window.raPageViews.length), viewCount + 2, 'History records one view per restored page, not business events');
    await page.evaluate(() => { window.raFailPageView = true; });
    await page.locator('.ra-header [data-ra-page="experience"]').click();
    await page.waitForFunction(() => document.getElementById('raPresenterStatus').textContent.includes('Fixture page-view transport failure'));
    assert.equal(await page.locator('#raExploreTitle').textContent(), 'The Riyadh Air experience', 'Tracking failure does not block browsing');
    await page.evaluate(() => { window.raFailPageView = false; });
    await page.locator('.ra-header [data-ra-page="plan"]').click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    await page.locator('#raExplore [data-ra-page="destinations"]').click();
    await page.locator('#raExplore [data-ra-book-destination="LHR"]').click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(await page.locator('#raOrigin').inputValue(), 'RUH');
    assert.equal(await page.locator('#raDestination').inputValue(), 'LHR', 'Destination CTA populates the existing booking bar');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'raDepartureButton');
    assert.equal(requests.length, businessBeforeBrowse, 'Browsing sends no generator duplicates or booking events');
    const beforeDrift = await page.evaluate(() => window.raPageViews.length);
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('kirkham', { source: 'user' }));
    await page.locator('.ra-header [data-ra-page="discover"]').click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(await page.evaluate(() => window.raPageViews.length), beforeDrift, 'Old SDK sandbox cannot send a virtual view');
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('apalmer', { source: 'user' }));
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.evaluate((fixtureEcid) => window.raTagsOptions.onEcidResolved(fixtureEcid), ecid);
    await page.locator('.ra-wordmark').click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(await page.evaluate(() => window.raPageViews.at(-1).xdm.web.webPageDetails.name), 'Web page view - Home page',
      'Returning home sends the natural customer timeline label');
    const direct = await browserContext.newPage();
    await direct.goto(origin + '/profile-viewer/riyadh-air-demo.html?step=diriyah&booking=unrelated&email=ignored');
    await direct.evaluate(() => window.RiyadhAirLab.ready);
    assert.equal(await direct.locator('#raExploreTitle').textContent(), 'Diriyah', 'Public deep links do not require a stored booking or resolved profile');
    assert.equal(await direct.title(), 'Web page view - Diriyah');
    await direct.reload();
    await direct.evaluate(() => window.RiyadhAirLab.ready);
    assert.equal(await direct.locator('#raExploreTitle').textContent(), 'Diriyah', 'Editorial route survives reload');
    assert.equal(requests.length, businessBeforeBrowse, 'Public deep links and reload do not ingest business events');
    for (const route of ['manage', 'cancellation']) {
      await direct.goto(origin + '/profile-viewer/riyadh-air-demo.html?step=' + route);
      await direct.evaluate(() => window.RiyadhAirLab.ready);
      assert.equal(await direct.title(), 'Web page view - ' + (route === 'manage' ? 'Manage' : 'Cancel your booking'));
      await direct.reload();
      await direct.evaluate(() => window.RiyadhAirLab.ready);
      assert.equal(new URL(direct.url()).searchParams.get('step'), route);
      assert(await direct.locator('#raExplore').isVisible());
      assert.equal(requests.length, businessBeforeBrowse, 'Manage deep links and reload never send booking/cancellation events');
    }
    await direct.close();
    await page.evaluate(() => {
      document.getElementById('raOrigin').value = 'LHR';
      document.getElementById('raDestination').value = 'RUH';
    });
    await page.locator('#raSwapAirports').click();
    await page.locator('#raSwapAirports').click();
    async function capture(name) {
      await assertCustomerCopy(name);
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
    await searchGeometry('results');
    assert.equal(new URL(page.url()).searchParams.get('step'), 'results');
    assert(await page.getByRole('button', { name: 'Select return Smart', exact: true }).isDisabled(), 'Return is locked until outbound is chosen');
    await capture('riyadh-outbound');
    failNext = true;
    await page.getByRole('button', { name: 'Select outbound Flex', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('raDeliveryStatus').textContent.includes('could not complete'));
    assert(await page.locator('#raPresenterStatus').textContent().then((text) => text.includes('Fixture ingestion rejection')));
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
    await page.waitForFunction(() => document.getElementById('raReturn').value === '2026-11-20');
    assert.equal(await page.locator('#raReturn').inputValue(), '2026-11-20', 'Return date strip changes retained search');
    assert.notEqual(await page.locator('.ra-bundle-heading strong').first().textContent(), originalReturnPrice, 'Changing dates changes fares');
    assert.equal('From ' + await page.locator('.ra-bundle-heading strong').first().textContent(), changedDatePrice, 'Date-strip quote matches selectable fare');
    await page.locator('[data-ra-action="flightDate"][data-date="2026-11-19"]').click();
    await page.waitForFunction(() => document.getElementById('raReturn').value === '2026-11-19');
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
    await page.locator('[name="contactEmail"]').fill(profile.email);
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
    assert.equal(await page.locator('#raAccountLabel').textContent(), 'My profile', 'Reload does not manufacture airline authentication');
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.getByRole('button', { name: 'Check out now' }).waitFor();
    assert.equal(requests.length, beforeReload, 'Reload retains completed cart without sending events');
    await page.getByRole('button', { name: 'Edit guest details', exact: true }).click();
    assert.equal(await page.locator('[name="dob"]').inputValue(), '1990-01-10');
    assert.equal(await page.locator('#raPassengerForm [name="firstName"]').inputValue(), 'Nour');
    await page.getByRole('button', { name: 'Continue to contact details' }).click();
    assert.equal(await page.locator('[name="contactEmail"]').inputValue(), profile.email);
    await page.evaluate((fixtureEcid) => {
      window.raTagsOptions.onEcidResolved(fixtureEcid);
      window.alloy = async () => ({});
    }, ecid);
    await page.getByRole('button', { name: 'Save guest details' }).click();
    assert.equal(requests.filter((body) => body.eventType === 'travel.booking.passengerDetails').length, 1, 'Guest editing is not duplicate ingestion');
    await capture('riyadh-cart-complete');
    await page.getByRole('button', { name: 'Check out now' }).click();
    assert.equal(new URL(page.url()).searchParams.get('step'), 'payment');
    assert.equal(requests.filter((body) => body.eventType.startsWith('travel.ancillary')).length, 0, 'No ancillary event before base-flight booking');
    await assertCustomerCopy('Booking review');
    assert.match(await page.locator('.ra-payment-consent').textContent(), /no payment is taken.*no ticket is issued/);
    const beforeUncheckedConfirm = requests.length;
    await page.getByRole('button', { name: 'Confirm booking', exact: false }).click();
    assert.equal(requests.length, beforeUncheckedConfirm, 'Acknowledgement remains required before confirmation');
    assert.equal(new URL(page.url()).searchParams.get('step'), 'payment');
    await page.locator('#raPaymentForm input').check();
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await page.getByRole('button', { name: 'Explore a cabin upgrade' }).waitFor();
    await assertCustomerCopy('Booking confirmation');
    assert.match(await page.locator('#raJourneyContent').textContent(), /Your booking is confirmed/);
    const booking = requests.find((body) => body.eventType === 'flight.booked');
    assert(booking.public.travel.confirmationNumber);
    const bookingRef = booking.public.travel.confirmationNumber;
    assert.equal(requests.filter((body) => body.eventType === 'flight.booked').length, 1);
    assert.equal(booking.email, profile.email);
    assert.equal(booking.ecid, ecid);
    assert.equal(new URL(booking.public.generic.linkUrl).searchParams.get('seat'), null, 'Base flight has no purchased seat');
    assert.equal(await page.locator('#raPaidAmount').textContent(), 'SAR 4,129');
    const beforeManage = requests.filter((body) => body.eventType === 'travel.booking.view').length;
    await page.locator('.ra-header [data-ra-page="manage"]').click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    await page.locator('#raExplore [data-ra-page="cancellation"]').click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(requests.filter((body) => body.eventType === 'travel.booking.view').length, beforeManage, 'Manage browsing does not send booking events');
    await page.locator('#raExplore [data-ra-action="manage"]').click();
    await page.getByRole('button', { name: 'Choose seats and extras' }).waitFor();
    assert.equal(requests.filter((body) => body.eventType === 'travel.booking.view').length, beforeManage + 1, 'View order retains the existing business contract');
    assert.equal(requests.at(-1).public.travel.confirmationNumber, bookingRef);
    assert.equal(await page.locator('#raPaidAmount').textContent(), 'SAR 4,129', 'Cancellation information never changes the confirmed trip');
    await page.getByRole('button', { name: 'Choose seats and extras' }).click();
    await page.getByRole('button', { name: 'Seat 14A', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-seat="14A"]').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('#raAncillarySubtotal').textContent(), 'Ancillary subtotal: SAR 180');
    const pendingUrl = page.url();
    assert.equal(new URL(pendingUrl).searchParams.get('booking'), bookingRef);
    assert.equal(new URL(pendingUrl).searchParams.get('offer'), 'extra-legroom-outbound');
    await capture('riyadh-paid-seat');
    await page.getByRole('button', { name: 'Save paid-seat interest' }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    const intent = requests.find((body) => body.eventType === 'travel.ancillary.intent');
    assert.equal(intent.public.travel.confirmationNumber, bookingRef);
    assert.equal(new URL(intent.viewUrl).searchParams.get('currency'), 'SAR');
    await page.getByRole('button', { name: 'Continue without paid seat or extras' }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
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
    await page.locator('#raPresenterLauncher').click();
    assert.equal(await page.locator('#raOrchestrationId, #raCustomEventId').count(), 0, 'Presenter has no orchestration ID fields');
    failNext = true;
    await page.getByRole('button', { name: 'Send trip update' }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(await page.getByRole('heading', { name: 'We are here for your journey.' }).count(), 0, 'Rejected disruption does not pivot to care');
    await page.getByRole('button', { name: 'Send trip update' }).click();
    await page.getByRole('heading', { name: 'We are here for your journey.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Explore a cabin upgrade' }).count(), 0);
    const delay = requests.find((body) => body.eventType === 'travel.flight.delay');
    assert.equal(delay.public.travel.confirmationNumber, bookingRef);
    assert.equal(delay.eventID, undefined);
    assert.equal(new URL(delay.viewUrl).searchParams.get('delayMinutes'), '90');
    await page.locator('#raDisruptionKind').selectOption('gate');
    await page.getByRole('button', { name: 'Send trip update' }).click();
    await page.waitForFunction(() => document.querySelector('.ra-care').textContent.includes('B12'));
    assert.equal(requests.find((body) => body.eventType === 'travel.flight.gateChange').public.travel.confirmationNumber, bookingRef);
    assert(await page.locator('#raDeliveryStatus').isHidden(), 'No technical success on customer surface');
    assert.equal(await page.locator('#riyadhMessage').textContent(), '');
    assert(!/Accepted:|Receipt:|ingestion|AJO channels|Not verified/.test(await page.locator('#raCustomerSite').innerText()), 'Customer journey has no technical delivery/channel status');
    assert(!(await page.locator('#raPayloadPreview').textContent()).includes(profile.email), 'Preview masks identity');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('raPresenter').open);
    await page.locator('#raPresenterLauncher').click();
    await page.keyboard.press('Shift+Tab');
    assert(await page.locator('#raPresenter').evaluate((dialog) => dialog.contains(document.activeElement)), 'Modal contains keyboard focus');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'raPresenterClose', 'Tab wraps to first control');
    await page.keyboard.press('Escape');
    await page.locator('#raPresenterLauncher').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement.id === 'raPresenterLauncher');
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
        assert(await page.locator('#raPresenterLauncher').evaluate((launcher) => {
          const own = launcher.getBoundingClientRect();
          return [...document.querySelectorAll('.env-bar-dock-btn, .dpm-panel-trigger, .bcp-panel-trigger, .aep-fullscreen-btn--midrail')].every((button) => {
            if (!button.checkVisibility()) return true;
            const rect = button.getBoundingClientRect();
            return own.right <= rect.left || own.left >= rect.right || own.bottom <= rect.top || own.top >= rect.bottom;
          });
        }), 'Presenter rail slot does not collide with shared controls');
        await page.locator('#raPresenterLauncher').click();
        assert(await page.locator('#raPresenter').evaluate((dialog) => {
          const rect = dialog.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
        }), 'Presenter fits viewport in both themes');
        if (process.env.RIYADH_PRESENTER_SCREENSHOTS) {
          await fs.mkdir(process.env.RIYADH_PRESENTER_SCREENSHOTS, { recursive: true });
          await page.screenshot({ path: path.join(process.env.RIYADH_PRESENTER_SCREENSHOTS, 'presenter-' + width + '-' + theme + '.png'), animations: 'disabled' });
        }
        await page.mouse.click(1, 1);
        await page.waitForFunction(() => !document.getElementById('raPresenter').open);
      }
    }
    await page.evaluate(() => {
      window.ProfileViewerModal.open();
      if (window.BrandConciergeMidrailPanel && window.BrandConciergeMidrailPanel._handle) window.BrandConciergeMidrailPanel._handle.setOpen(true);
    });
    await page.locator('#raPresenterLauncher').click();
    assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('aep-profile-drawer-open')), false, 'Presenter closes competing profile drawer');
    assert.equal(await page.locator('#bcpPanelShell.is-open').count(), 0, 'Presenter closes competing BC panel');
    await page.locator('#raPresenterClose').click();
    await page.reload();
    await page.evaluate(() => window.RiyadhAirLab.ready);
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.getByRole('heading', { name: 'We are here for your journey.' }).waitFor();
    assert.equal(requests.filter((body) => body.eventType === 'flight.booked').length, 1, 'Reload does not re-ingest the booking');
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
    assert.equal(await page.locator('#raAccountLabel').textContent(), 'My profile', 'Sandbox switch clears customer login display');
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
    await page.locator('#raPresenterLauncher').click();
    await page.getByRole('button', { name: 'Reset local trip', exact: true }).click();
    await page.locator('#raPresenterClose').click();
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
    await page.locator('[name="title"]').selectOption('Ms');
    await page.locator('[name="dob"]').fill('1990-01-10');
    await page.locator('[name="loyaltyEmail"]').fill(bookingProfile.email);
    const beforeBookingIdentity = requests.length;
    await page.getByRole('button', { name: 'Continue to contact details' }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(new URL(page.url()).searchParams.get('step'), 'passenger', 'Missing SDK cannot advance an identifying booking form');
    assert.equal(requests.length, beforeBookingIdentity);
    await page.evaluate((fixtureEcid) => {
      window.raTagsOptions.onEcidResolved(fixtureEcid);
      window.raBookingStitches = [];
      window.raStitchMode = 'reject';
      window.alloy = async (command, options) => {
        if (command === 'sendEvent' && options.xdm.eventType === 'riyadhAir.identity.stitch') {
          window.raBookingStitches.push(options);
          if (options.edgeConfigOverrides?.datastreamId !== '11111111-2222-3333-4444-555555555555' ||
            options.xdm._demoemea?.identification?.core?.ecid !== options.xdm.identityMap.ECID[0].id) {
            throw new Error('Fixture rejected missing datastream override or required tenant core.ecid');
          }
          if (window.raStitchMode === 'reject') throw new Error('Fixture rejected booking stitch');
          if (window.raStitchMode === 'hold') await new Promise((resolve) => { window.raReleaseBookingStitch = resolve; });
        }
        return {};
      };
    }, ecid);
    await page.locator('[name="loyaltyEmail"]').fill('unknown@example.test');
    await page.getByRole('button', { name: 'Continue to contact details' }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(new URL(page.url()).searchParams.get('step'), 'passenger', 'Unknown email cannot advance or create a booking profile');
    assert.equal(await page.evaluate(() => window.raBookingStitches.length), 0);
    await page.locator('[name="loyaltyEmail"]').fill(bookingProfile.email);
    missingEcid = true;
    await page.getByRole('button', { name: 'Continue to contact details' }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(new URL(page.url()).searchParams.get('step'), 'passenger', 'A profile without its own ECID cannot borrow the previous profile ECID');
    assert.equal(await page.evaluate(() => window.raBookingStitches.length), 0);
    missingEcid = false;
    await page.getByRole('button', { name: 'Continue to contact details' }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(new URL(page.url()).searchParams.get('step'), 'passenger', 'Rejected SDK stitch preserves the passenger form');
    assert.equal(await page.locator('[name="loyaltyEmail"]').inputValue(), bookingProfile.email);
    assert.equal(requests.length, beforeBookingIdentity, 'No business event after rejected identity stitch');
    await page.evaluate(() => { window.raStitchMode = 'hold'; });
    await page.locator('#raPassengerForm').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => !!window.raReleaseBookingStitch);
    assert(await page.locator('[name="loyaltyEmail"]').isDisabled(), 'Submitted identity cannot be edited during stitching');
    const heldCount = await page.evaluate(() => window.raBookingStitches.length);
    await page.evaluate(() => { window.raReleaseBookingStitch(); window.raReleaseBookingStitch = null; window.raStitchMode = 'accept'; });
    await page.locator('#raContactForm').waitFor();
    assert.equal(await page.evaluate(() => window.raBookingStitches.length), heldCount, 'Rapid submits perform one stitch');
    assert.equal(await page.evaluate(() => window.RiyadhAirLab.context().email), bookingProfile.email, 'Submitted Sfeer email becomes the selected event identity');
    assert.equal(await page.evaluate(() => window.RiyadhAirLab.context().ecid), bookingProfile.ecid, 'Canonical profile ECID is not borrowed from the previous profile');
    const stitchedBooking = await page.evaluate(() => window.raBookingStitches.at(-1));
    assert.equal(stitchedBooking.xdm.identityMap.Email[0].id, bookingProfile.email);
    assert.equal(stitchedBooking.xdm.identityMap.ECID[0].id, ecid, 'Shared stitch connects the resolved browser ECID to the submitted email');
    assert.equal(stitchedBooking.xdm._demoemea.identification.core.ecid, ecid, 'Identity stitch satisfies the same required tenant ECID as page views');
    assert.equal(stitchedBooking.edgeConfigOverrides.datastreamId, '11111111-2222-3333-4444-555555555555', 'Identity stitch uses the selected Lab datastream rather than the Tags default');
    await page.locator('[name="contactEmail"]').fill(profile.email);
    await page.locator('[name="phone"]').fill('+440000000000');
    await page.getByRole('button', { name: 'Save guest details' }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(new URL(page.url()).searchParams.get('step'), 'contact', 'Conflicting emails cannot silently stitch two people');
    await page.locator('[name="contactEmail"]').fill(bookingProfile.email);
    await page.getByRole('button', { name: 'Save guest details' }).click();
    await page.getByRole('button', { name: 'Check out now' }).waitFor();
    assert.equal(requests.at(-1).email, bookingProfile.email);
    for (const email of [profile.email, bookingProfile.email]) {
      await page.getByRole('button', { name: 'Edit guest details' }).click();
      await page.locator('[name="loyaltyEmail"]').fill('');
      await page.getByRole('button', { name: 'Continue to contact details' }).click();
      assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('riyadhAirJourneyV1')).guest.contactComplete), false, 'Passenger edits require contact confirmation again');
      await page.locator('[name="contactEmail"]').fill(email);
      await page.getByRole('button', { name: 'Save guest details' }).click();
      await page.getByRole('button', { name: 'Check out now' }).waitFor();
      assert.equal(requests.at(-1).email, email, 'Contact email alone can select a different existing profile without discarding the flight');
      assert.equal(requests.at(-1).eventType, 'travel.booking.passengerDetails', 'An identity change does not reuse a different profile’s passenger receipt');
    }
    await page.getByRole('button', { name: 'Check out now' }).click();
    await page.locator('#raPaymentForm input').check();
    const beforeBookingFailure = requests.filter((body) => body.eventType === 'flight.booked').length;
    failNext = true;
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
    assert.equal(new URL(page.url()).searchParams.get('step'), 'payment', 'API rejection cannot confirm the booking');
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('riyadhAirJourneyV1')).trip.booked), false);
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await page.getByRole('button', { name: 'Choose seats and extras' }).waitFor();
    assert.equal(requests.filter((body) => body.eventType === 'flight.booked').length, beforeBookingFailure + 2, 'Only explicit confirmation retries send flight.booked');
    assert.equal(requests.at(-1).email, bookingProfile.email);
    assert.equal(requests.at(-1).ecid, bookingProfile.ecid);
    assert(!requests.some((body) => body.eventType === 'travel.booking.confirm'), 'No legacy booking event duplicates the journey trigger');
    const afterBookingIdentity = requests.length;
    for (const mutation of ['identity', 'datastream']) {
      await page.evaluate((email) => {
        window.raStitchMode = 'hold';
        window.raDriftResult = null;
        window.raDriftPromise = window.RiyadhAirLab.connectBookingEmail(email).then(
          () => { window.raDriftResult = 'accepted'; },
          (error) => { window.raDriftResult = error.message; },
        );
      }, profile.email);
      await page.waitForFunction(() => !!window.raReleaseBookingStitch);
      await page.evaluate((kind) => {
        if (kind === 'identity') {
          const input = document.getElementById('customerEmail');
          input.value = 'changed-during-stitch@example.test';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          window.AepLabEnvBarPrefs.writeMapSilent('siteCloneBcDatastreamIdBySandbox', { apalmer: '22222222-2222-3333-4444-555555555555' });
        }
        window.raReleaseBookingStitch();
        window.raReleaseBookingStitch = null;
        window.raStitchMode = 'accept';
      }, mutation);
      await page.waitForFunction(() => window.raDriftResult !== null);
      assert.notEqual(await page.evaluate(() => window.raDriftResult), 'accepted', 'In-flight ' + mutation + ' change rejects local connection');
      assert.equal(requests.length, afterBookingIdentity, 'No business event after in-flight ' + mutation + ' drift');
    }
    await page.evaluate(() => window.AepLabEnvBarPrefs.writeMapSilent('siteCloneBcDatastreamIdBySandbox', { apalmer: '11111111-2222-3333-4444-555555555555' }));
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    for (const [destination, city, image, expectedTotal] of [
      ['LHR', 'London', 'london', 4129], ['CGK', 'Jakarta', 'jakarta', 3577],
      ['MXP', 'Milan', 'milan', 3877], ['BKK', 'Bangkok', 'bangkok', 3777],
      ['RUH', 'Riyadh', 'riyadh', 4082],
    ]) {
      await page.locator('#raPresenterLauncher').click();
      await page.getByRole('button', { name: 'Reset local trip', exact: true }).click();
      await page.locator('#raPresenterClose').click();
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
      await page.locator('[name="contactEmail"]').fill(profile.email);
      await page.locator('[name="phone"]').fill('+440000000000');
      await page.getByRole('button', { name: 'Save guest details' }).click();
      assert.equal(await page.locator('.ra-cart-total strong').textContent(), 'SAR ' + expectedTotal.toLocaleString('en-GB'), city + ' has route-specific round-trip total');
      assert.equal(await page.locator('.ra-cart-card > img').getAttribute('src'), 'riyadh-air-assets/' + image + '.avif');
      await page.getByRole('button', { name: 'Check out now' }).click();
      assert.equal(await page.locator('.ra-destination-summary img').getAttribute('src'), 'riyadh-air-assets/' + image + '.avif');
      assert((await page.locator('.ra-destination-summary').textContent()).includes(departure + ' → ' + destination));
      await page.locator('#raPaymentForm input').check();
      await page.getByRole('button', { name: 'Confirm booking' }).click();
      await page.getByRole('button', { name: 'Choose seats and extras' }).waitFor();
      assert.equal(await page.locator('.ra-destination-summary img').getAttribute('src'), 'riyadh-air-assets/' + image + '.avif');
      assert.equal(await page.locator('#raPaidAmount').textContent(), 'SAR ' + expectedTotal.toLocaleString('en-GB'));
      const baseBooking = requests.filter((body) => body.eventType === 'flight.booked').at(-1);
      const ref = baseBooking.public.travel.confirmationNumber;
      await page.getByRole('button', { name: 'Choose seats and extras' }).click();
      await page.getByRole('button', { name: 'Seat 14A', exact: true }).click();
      await page.getByRole('button', { name: 'Continue without paid seat or extras' }).click();
      await page.waitForFunction(() => !document.getElementById('raCustomerSite').hasAttribute('aria-busy'));
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
    const safetyStart = requests.length;
    currentTarget = { ...target, dataStreamId: 'changed-fixture-datastream' };
    const changed = await page.evaluate((fixture) => window.RiyadhAirLab.send('gate', fixture, { gate: 'C4' }).then(() => '', (error) => error.message), trip);
    assert.match(changed, /configuration changed/);
    assert.equal(requests.length, safetyStart, 'Same target ID with changed datastream is blocked before POST');
    currentTarget = target;
    const concurrent = await page.evaluate((fixture) => Promise.allSettled([
      window.RiyadhAirLab.send('gate', fixture, { gate: 'C4' }),
      window.RiyadhAirLab.send('gate', fixture, { gate: 'C4' }),
    ]).then((results) => results.map((result) => result.status)), trip);
    assert.deepEqual(concurrent.sort(), ['fulfilled', 'rejected']);
    assert.equal(requests.length, safetyStart + 1, 'Concurrent sender calls produce one POST');
    for (const mutation of ['target', 'identity']) {
      duringSend = mutation;
      const changedInflight = await page.evaluate((fixture) => window.RiyadhAirLab.send('gate', fixture, { gate: 'C4' }).catch((error) => error.customerMessage), trip);
      assert.match(changedInflight, /could not confirm/);
      await page.locator('#raPresenterLauncher').click();
      await page.locator('#raAllowRetry').click();
      await page.locator('#raPresenterClose').click();
      currentTarget = target;
      if (mutation === 'identity') await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
      await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    }
    abortNext = true;
    const ambiguous = await page.evaluate((fixture) => window.RiyadhAirLab.send('gate', fixture, { gate: 'C4' }).catch((error) => error.customerMessage), trip);
    assert.match(ambiguous, /could not confirm/);
    assert.equal(await page.locator('#raUncertainDelivery').getAttribute('hidden'), null);
    const afterAmbiguous = requests.length;
    await page.evaluate((fixture) => window.RiyadhAirLab.send('gate', fixture, { gate: 'C4' }).catch(() => {}), trip);
    assert.equal(requests.length, afterAmbiguous, 'No silent retry after ambiguous delivery');
    await page.reload();
    await page.evaluate(() => window.RiyadhAirLab.ready);
    await page.evaluate((email) => window.RiyadhAirLab.lookup(email), profile.email);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.evaluate((fixture) => window.RiyadhAirLab.send('gate', fixture, { gate: 'C4' }).catch(() => {}), trip);
    assert.equal(requests.length, afterAmbiguous, 'Uncertain attempt survives reload without resend');
    await page.evaluate(() => window.RiyadhAirLab.send('custom', null, { eventType: 'blocked.manual' }).catch(() => {}));
    assert.equal(requests.length, afterAmbiguous, 'Manual events share the uncertain-delivery block');
    await page.locator('#raPresenterLauncher').click();
    await page.locator('#raAllowRetry').click();
    await page.locator('#raPresenterClose').click();
    await page.locator('#raPresenterLauncher').click();
    await page.getByRole('button', { name: 'Reset local trip', exact: true }).click();
    await page.locator('#raPresenterClose').click();
    await page.locator('#raOriginButton').click();
    await page.locator('[data-ra-airport="CGK"]').click();
    await page.locator('#raDestinationButton').click();
    await page.locator('[data-ra-airport="MXP"]').click();
    const beforeUnavailable = requests.length;
    await page.getByRole('button', { name: 'Search flights' }).click();
    await page.waitForFunction(() => document.getElementById('raDeliveryStatus').textContent.includes('Flights are available between Riyadh'));
    assert.equal(requests.length, beforeUnavailable, 'Unsupported airport combinations give availability feedback, not invented flights');
    await page.locator('#raPresenterLauncher').click();
    await page.locator('#raCustomEventType').fill('my.journey.trigger');
    const beforeManual = requests.length;
    await page.locator('#raCustomIncludeTrip').check();
    await page.getByRole('button', { name: 'Send event', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomEventForm').hasAttribute('aria-busy'));
    assert.equal(requests.length, beforeManual, 'Including trip context fails explicitly without a booking');
    await page.locator('#raCustomIncludeTrip').uncheck();
    assert(!(await page.locator('#raCustomEventPreview').textContent()).includes(profile.email), 'Manual preview masks profile email');
    failNext = true;
    await page.getByRole('button', { name: 'Send event', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomEventForm').hasAttribute('aria-busy'));
    assert.match(await page.locator('#raPresenterStatus').textContent(), /Fixture ingestion rejection/);
    assert.equal(requests.length, beforeManual + 1, 'Rejected manual send is not retried automatically');
    await page.locator('#raCustomEventForm').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => !document.getElementById('raCustomEventForm').hasAttribute('aria-busy'));
    assert.equal(requests.length, beforeManual + 2, 'Double manual submit records only one explicit request');
    assert.equal(requests.at(-1).eventType, 'my.journey.trigger');
    assert.equal(requests.at(-1).eventID, undefined);
    assert.equal(requests.at(-1).xdmStyle, 'minimal');
    assert.equal(requests.at(-1).email, profile.email);
    assert.equal(requests.at(-1).ecid, ecid);
    assert.equal(requests.at(-1).targetId, target.id);
    assert.equal(requests.at(-1).public, undefined);
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('riyadhAirJourneyV1')).trip), null, 'Manual sends never manufacture a local booking');
    await page.evaluate(() => {
      const input = document.getElementById('customerEmail');
      input.value = 'unverified@example.test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Send event', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('raCustomEventForm').hasAttribute('aria-busy'));
    assert.equal(requests.length, beforeManual + 2, 'Typed but unverified profile cannot receive manual events');
    await page.evaluate((email) => {
      document.getElementById('customerEmail').value = email;
      window.alloy = async () => ({});
    }, profile.email);
    await page.getByRole('button', { name: 'Look up selected profile', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('raResolvePresenterProfile').disabled);
    assert.equal(await page.evaluate(() => window.RiyadhAirLab.context().email), profile.email, 'Presenter can resolve the selected profile without leaving controls');
    await page.locator('#raPresenterClose').click();
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    await page.goto(origin + '/profile-viewer/etihad-demo.html');
    await page.waitForFunction(() => !!window.DemoTagsInjection && !!window.SiteCloneBc);
    assert.equal(await page.locator('#etihadSiteFrame').count(), 1, 'Etihad keeps its existing iframe surface');
    assert.equal(await page.evaluate(() => !!window.SiteCloneBcPage.useParentDocument), false, 'Parent-document BC behavior is opt-in');
    await page.waitForFunction(() => !!window.raTagsInstance);
    const legacyStitch = await page.evaluate(async (fixture) => {
      let sent;
      window.alloy = async (_command, options) => { sent = options; };
      const accepted = await window.raTagsInstance.stitchAfterProfileLookup(fixture, fixture.email);
      window.alloy = async () => { throw new Error('Fixture rejection'); };
      const rejected = await window.raTagsInstance.stitchAfterProfileLookup(fixture, fixture.email);
      return { accepted, rejected, sent };
    }, profile);
    assert.equal(legacyStitch.accepted, true, 'Etihad keeps successful shared stitching');
    assert.equal(legacyStitch.rejected, false, 'Etihad keeps its existing boolean rejection contract');
    assert.equal(legacyStitch.sent.edgeConfigOverrides, undefined, 'Lab Edge stitch context remains opt-in for other demos');
    assert.equal(legacyStitch.sent.xdm._demoemea, undefined, 'Other demos do not acquire new tenant fields');
    console.log('Riyadh Air: reference-led browsing routes/deep links, natural SDK page views without generator duplication, sandbox/config safety, Sfeer identity stitching, booking/seat journeys, preserved event types/schema, accessible modals, responsive themes, sender rejection/uncertainty and history checks passed (fixture APIs only).');
    await browserContext.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

contractTests();
browserTests().catch((error) => { console.error(error); process.exitCode = 1; });
