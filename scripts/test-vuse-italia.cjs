'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const events = require('../web/profile-viewer/vuse-italia-events');
const { buildGeneratorEdgeInteractXdm } = require('../functions/eventEdgeService');
const ecid = '12345678901234567890123456789012345678';
const target = { id: 'lab-event-tool-edge', transport: 'edge', dataStreamId: 'fixture-datastream', xdmStyle: 'minimal', label: 'Lab Event tool Edge' };
const profile = { found: true, email: 'giulia.rossi@example.com', ecid: '98765432109876543210987654321098765432', firstName: 'Giulia', lastName: 'Rossi', identities: [], audiences: [], events: [] };
const ctx = { sandbox: 'apalmer', known: true, email: profile.email, ecid, target, url: 'https://www.vuse.com/it/it/', page: 'home' };
function contractTests() {
  for (const [type] of Object.entries(events.TYPES)) {
    const body = events.build(type, {}, ctx);
    const xdm = buildGeneratorEdgeInteractXdm(body, target);
    assert.equal(xdm.eventType, events.TYPES[type]);
    assert.equal(xdm.identityMap.ECID[0].id, ecid);
    assert.equal(xdm.identityMap.Email[0].id, profile.email);
    assert.equal(xdm._demoemea.public.market, 'IT');
    assert.equal(xdm._demoemea.public.site, 'vuse.com/it/it');
    assert(!JSON.stringify(events.redact(body)).includes(ecid));
    assert(!JSON.stringify(events.redact(body)).includes(profile.email));
  }
  assert.equal(events.STEPS.length, 8);
  const consent = events.build('consent.preferences', { vuse: { email: true, sms: false, whatsapp: 'y' }, velo: { email: 'n' } }, ctx);
  assert.equal(consent.public.consent_email_vuse, 'y'); assert.equal(consent.public.consent_sms_vuse, 'n');
  assert.equal(consent.public.consent_whatsapp_vuse, 'y'); assert.equal(consent.public.consent_email_velo, 'n');
  assert.equal(consent.public.consent_email_glo, undefined, 'Unspecified consent is not invented');
  const registration = events.build('login', { isNew: true, firstName: 'Giulia', lastName: 'Rossi' }, ctx);
  const registerXdm = buildGeneratorEdgeInteractXdm(registration, target);
  assert.equal(registerXdm.eventType, 'userAccount.createProfile');
  assert.equal(registerXdm.person.name.firstName, 'Giulia'); assert.equal(registerXdm.personalEmail.address, profile.email);
  assert(!JSON.stringify(events.redact(registration)).includes('Giulia'));
  const product = events.build('commerce.productListAdds', { sku: 'PRO', name: 'Vuse PRO', qty: 2, price: 9.99 }, ctx);
  assert.equal(product.productListItems[0].quantity, 2);
  assert.deepEqual(buildGeneratorEdgeInteractXdm(product, target)._demoemea.message.productListItems, product.productListItems, 'Supported message mapping retains commerce items');
  assert.equal(events.build('ageGate.underage', {}, ctx).public.ageVerified, false);
  assert.equal(events.build('velo.view', { href: 'https://example.test/velo?email=private' }, ctx).public.linkUrl, 'https://example.test/velo');
  assert.throws(() => events.build('login', {}, { ...ctx, known: false }), /stitch/);
  assert.throws(() => events.build('pageView', {}, { ...ctx, ecid: '' }), /ECID/);
  assert.throws(() => events.build('pageView', {}, { ...ctx, target: { ...target, id: 'other' } }), /Lab Event/);
  assert.throws(() => events.buildCustom('bad\nevent', ctx, {}), /event type/);
  assert.throws(() => events.buildCustom('my.event', ctx, []), /JSON object/);
  assert.throws(() => events.buildCustom('my.event', ctx, { nested: {} }), /scalar/);
  assert.equal(events.buildCustom('my.event', ctx, { reward_points_balance: 0 }).xdmStyle, 'full');
}
async function browserTests() {
  const root = path.resolve(__dirname, '../web');
  const server = http.createServer(async (req, res) => {
    const filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://fixture').pathname));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(filename);
      res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(filename)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const requests = [], errors = [];
    let abortNext = false, rejectNext = false, missingEcid = false;
    let currentTarget = target;
    await browserContext.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { await route.fulfill({ body: '', contentType: 'text/javascript' }); return; }
      if (url.pathname === '/profile-viewer/vuse-italia-assets/index.html') {
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Vuse Italia</title><h1>Vuse Italia</h1><div id="TopRibbon"></div><div id="hero-banner"></div><div id="ContentCardContainer"></div>' }); return;
      }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      let data = {};
      if (['/api/aep', '/api/sandboxes'].includes(url.pathname)) data = { sandboxes: [{ name: 'apalmer', title: 'apalmer' }] };
      else if (url.pathname === '/api/events/generator-targets') data = { sandbox: url.searchParams.get('sandbox'), targets: [currentTarget] };
      else if (url.pathname === '/api/events/generator') {
        requests.push(route.request().postDataJSON());
        if (abortNext) { abortNext = false; await route.abort('failed'); return; }
        if (rejectNext) { rejectNext = false; await route.fulfill({ status: 400, json: { ok: false, error: 'Fixture rejection' } }); return; }
        data = { ok: true, requestId: 'fixture-' + requests.length };
      } else if (url.pathname === '/api/profile/consent') data = { ...profile, ecid: missingEcid ? null : profile.ecid };
      else if (url.pathname === '/api/profile/events') data = { events: [], eventsStory: [] };
      else if (url.pathname === '/api/env-bar-config') data = { config: null };
      else if (url.pathname === '/api/tags/reactor') data = { data: [] };
      else if (url.pathname === '/api/lab/user-sandbox-data') data = { keys: {} };
      await route.fulfill({ json: data });
    });
    await browserContext.addInitScript(() => {
      localStorage.setItem('aepGlobalSandboxName', 'apalmer');
      localStorage.setItem('aepDemoNavVisibility', 'all');
      window.firebase = { apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(callback) { callback(null); }, onIdTokenChanged() {}, signInAnonymously: async () => ({ user: null }) }) };
      let tags;
      Object.defineProperty(window, 'DemoTagsInjection', { configurable: true, get: () => tags, set(value) {
        tags = { ...value, init(options) { window.vuseTagsOptions = options; return { stitchAfterProfileLookup: async () => window.fixtureStitch !== false }; } };
      } });
      window.fixtureSdkEvents = [];
      window.alloy = async (command, options) => { if (command === 'sendEvent') window.fixtureSdkEvents.push(options); return {}; };
      window.alloy.getLibraryInfo = () => ({});
    });
    const page = await browserContext.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/profile-viewer/vuse-italia-demo.html');
    await page.evaluate(() => window.VuseItaliaLab.ready);
    assert.equal(await page.title(), 'Vuse Italia (web)');
    assert.equal(await page.locator('#aepDemoEnvSection').count(), 1);
    assert.equal(await page.locator('[data-demo-env-strip-disclaimer]').count(), 0);
    assert.equal(await page.locator('#profileDrawer').count(), 1);
    await page.evaluate((id) => { window.DemoTagsInjection.isAlloyReady = () => true; window.vuseTagsOptions.onEcidResolved(id); }, ecid);
    await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await page.locator('#vusePresenterLauncher').click();
    assert(await page.locator('#vusePresenter').evaluate((dialog) => dialog.open));
    assert.equal(await page.locator('#vuseScriptedSteps li').count(), 8);
    for (const theme of ['dark', 'light']) {
      await page.evaluate((value) => { document.documentElement.setAttribute('data-aep-theme', value); }, theme);
      const colors = await page.locator('#vusePresenter').evaluate((dialog) => ({ bg: getComputedStyle(dialog).backgroundColor, fg: getComputedStyle(dialog).color }));
      assert.notEqual(colors.bg, colors.fg);
    }
    const sendFrame = (type, payload) => page.locator('#vuseDemoSiteFrame').evaluate((frame, interaction) => {
      frame.contentWindow.eval('parent.postMessage(' + JSON.stringify({ source: 'vuse-site', ...interaction }) + ', location.origin)');
    }, { type, payload });
    await sendFrame('ageGate.verified', {});
    await page.waitForFunction(() => document.getElementById('vuseEventLog').textContent.includes('ageGate.verified / apalmer / accepted'));
    assert.equal(requests.at(-1).public.ageVerified, true);
    assert.equal(requests.at(-1).email, undefined);
    await page.evaluate(() => window.postMessage({ source: 'vuse-site', type: 'ageGate.underage', payload: {} }, location.origin));
    await page.waitForTimeout(100);
    assert.equal(requests.length, 1, 'A shell-originated forged iframe message is ignored');
    await sendFrame('login', { email: profile.email, firstName: 'Giulia', lastName: 'Rossi', isNew: true });
    await sendFrame('consent.preferences', { vuse: { email: true, sms: false, whatsapp: false } });
    await page.waitForFunction(() => document.getElementById('vuseEventLog').textContent.includes('consent.preferences / apalmer / accepted'));
    assert.equal(requests.at(-2).eventType, 'userAccount.createProfile');
    assert.equal(requests.at(-2).ecid, ecid, 'Stitch uses current browser ECID rather than an old profile ECID');
    assert.equal(requests.at(-1).public.consent_email_vuse, 'y');
    const beforePageView = requests.length;
    const sdkBefore = await page.evaluate(() => window.fixtureSdkEvents.length);
    await sendFrame('pageView', { page: 'dispositivi', title: 'Dispositivi', url: '/profile-viewer/vuse-italia-assets/dispositivi.html' });
    await page.waitForFunction((n) => window.fixtureSdkEvents.length > n, sdkBefore);
    assert.equal(await page.evaluate(() => window.fixtureSdkEvents.at(-1).xdm.eventType), 'web.webPageDetails.pageViews');
    await page.waitForTimeout(150);
    assert.equal(requests.length, beforePageView, 'A page view recorded by the Web SDK is not duplicated through the generator');
    await sendFrame('productView', { sku: 'PRO', name: 'Vuse PRO', price: 9.99, qty: 1 });
    await page.waitForFunction(() => document.getElementById('vuseLastAttempt').textContent.includes('productViews'));
    assert(!await page.locator('#vusePayloadPreview').innerText().then((text) => text.includes(profile.email) || text.includes(ecid)));
    await page.waitForFunction(() => document.getElementById('vuseEventLog').textContent.includes('commerce.productViews / apalmer / accepted'));
    rejectNext = true;
    await assert.rejects(page.evaluate(() => window.VuseItaliaLab.send('loyalty.join', {})), /Fixture rejection/);
    assert(await page.locator('#vuseUncertainDelivery').isHidden(), 'Definite rejection does not activate uncertain delivery');
    abortNext = true;
    await assert.rejects(page.evaluate(() => window.VuseItaliaLab.send('loyalty.join', {})));
    assert(await page.locator('#vuseUncertainDelivery').isVisible());
    const count = requests.length;
    await assert.rejects(page.evaluate(() => window.VuseItaliaLab.send('loyalty.join', {})), /uncertain/);
    assert.equal(requests.length, count);
    await page.locator('#vuseAllowRetry').click();
    currentTarget = { ...target, dataStreamId: 'changed-datastream' };
    await assert.rejects(page.evaluate(() => window.VuseItaliaLab.send('loyalty.join', {})), /configuration changed/);
    assert.equal(requests.length, count, 'Changed server target is rejected before POST');
    currentTarget = target;
    missingEcid = true;
    await assert.rejects(page.evaluate((email) => window.VuseItaliaLab.lookup(email, { requireStitch: true }), profile.email), /usable identity/);
    missingEcid = false;
    await page.evaluate(() => {
      window.AepLabEnvBarPrefs.writeMap('vuseLastResolvedEcidBySandbox', { apalmer: '12345678901234567890123456789012345678', other: '44444444444444444444444444444444444444' });
      window.VuseItaliaLab.resetVisitor();
    });
    assert.equal(await page.evaluate(() => window.AepLabEnvBarPrefs.readMap('vuseLastResolvedEcidBySandbox').apalmer), undefined);
    assert.equal(await page.evaluate(() => window.AepLabEnvBarPrefs.readMap('vuseLastResolvedEcidBySandbox').other), '44444444444444444444444444444444444444');
    assert.equal(await page.locator('#customerEmail').inputValue(), '');
    await assert.rejects(page.evaluate(() => window.VuseItaliaLab.send('ageGate.verified', {})), /ECID/);
    assert.deepEqual(errors, [], 'No uncaught browser errors with local API fixtures');
    console.log('Vuse Italia browser contracts: OK');
  } finally { if (browser) await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
(async () => { contractTests(); await browserTests(); console.log('Vuse Italia event contracts: OK'); })().catch((error) => { console.error(error); process.exitCode = 1; });
