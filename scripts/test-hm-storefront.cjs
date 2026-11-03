'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const events = require('../web/profile-viewer/hm-events.js');
const root = path.resolve(__dirname, '../web');
const target = { id: 'lab-event-tool-edge', transport: 'edge', dataStreamId: 'fixture-stream', xdmStyle: 'minimal', label: 'Lab Event tool Edge' };
const ecid = '12345678901234567890123456789012345678';
const screenshotStyle = '#profileDrawer, #profileHoverZone { visibility: hidden !important; }';
function schemaFixture() {
  const schema = { properties: {} };
  for (const required of events.REQUIRED_PATHS) {
    let node = schema;
    for (const key of required.split('.')) {
      node.properties ||= {};
      node.properties[key] ||= {};
      node = node.properties[key];
      if (key === 'productListItems') { node.type = 'array'; node.items ||= {}; node = node.items; }
    }
    node.type = /quantity|priceTotal|orderValue$/.test(required) ? 'number' : 'string';
  }
  return schema;
}
async function main() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': {
        '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
        '.svg': 'image/svg+xml', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
      }[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const posts = [], errors = [];
    let conciergeLoads = 0;
    let liveConcierge = false;
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (liveConcierge && (url.hostname === 'd3mey6isb8np59.cloudfront.net' ||
        route.request().frame().url().startsWith('https://d3mey6isb8np59.cloudfront.net/'))) {
        await route.continue();
        return;
      }
      if (url.hostname === 'd3mey6isb8np59.cloudfront.net') {
        conciergeLoads++;
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Concierge fixture</title><label>Message <input id="chat"></label><button onclick="document.getElementById(\'reply\').textContent=\'Fixture reply\'">Send</button><p id="reply"></p>' });
        return;
      }
      if (url.origin !== origin) { await route.fulfill({ body: '', contentType: 'text/javascript' }); return; }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      let data = {};
      if (url.pathname === '/api/aep' || url.pathname === '/api/sandboxes') data = { sandboxes: [{ name: 'fixture', title: 'Fixture' }] };
      else if (url.pathname === '/api/events/generator-targets') data = { sandbox: 'fixture', targets: [target] };
      else if (url.pathname === '/api/events/config') data = { ok: true, record: { datastreamId: target.dataStreamId, schemaId: 'fixture-schema' } };
      else if (url.pathname === '/api/schema-viewer/registry') data = { ok: true, schema: schemaFixture() };
      else if (url.pathname === '/api/events/generator') {
        posts.push(route.request().postDataJSON());
        data = { ok: true, requestId: 'fixture-' + posts.length };
      } else if (url.pathname === '/api/env-bar-config') data = { config: null };
      else if (url.pathname === '/api/tags/reactor') data = { data: [] };
      else if (url.pathname === '/api/lab/user-sandbox-data') data = { keys: {} };
      else if (url.pathname === '/api/profile/consent') data = { found: false };
      else if (url.pathname === '/api/profile/events') data = { events: [], eventsStory: [] };
      if (route.request().method() !== 'GET' && url.pathname !== '/api/events/generator') {
        // Reads such as the AEP sandbox proxy can use POST; no external request is allowed.
        assert(['/api/aep', '/api/tags/reactor', '/api/lab/user-sandbox-data'].includes(url.pathname),
          'Unexpected mutating API request: ' + url.pathname);
      }
      await route.fulfill({ json: data });
    });
    await context.addInitScript(() => {
      localStorage.setItem('aepGlobalSandboxName', 'fixture');
      localStorage.setItem('aepShowInDevCapabilities_fixture', 'true');
      localStorage.setItem('aepDemoNavVisibility', 'all');
      window.firebase = { apps: [{}], auth: () => ({
        currentUser: null, onAuthStateChanged(callback) { callback(null); },
        onIdTokenChanged() {}, signInAnonymously: async () => ({ user: null }),
      }) };
      let tags;
      Object.defineProperty(window, 'DemoTagsInjection', {
        configurable: true, get() { return tags; },
        set(value) {
          tags = { ...value, init(options) { window.hmTestTags = options; return value.init(options); } };
        },
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/profile-viewer/hm-demo.html');
    await page.waitForFunction(() => window.HmStore && window.HmLab && window.hmTestTags);
    await page.evaluate(() => window.HmLab.ready);
    async function closeEnvironment() {
      await page.waitForFunction(() => window.EnvBarCompact);
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.EnvBarCompact.closeOverlay({ force: true });
      });
      await page.waitForFunction(() => !document.getElementById('hmDemoTopAnchor').classList.contains('lab-env-top-anchor--expanded'));
    }
    await closeEnvironment();
    await page.mouse.move(700, 80);
    await page.waitForFunction(() => {
      const drawer = document.getElementById('profileDrawer');
      return drawer.getBoundingClientRect().top >= innerHeight - 24;
    });
    assert.equal(await page.locator('#hmCustomerSite iframe').count(), 0, 'AJO authoring stays in the top document');
    assert.equal(await page.locator('[data-demo-env-strip-mount="site-clone-shell"]').count(), 1);
    assert.equal(await page.locator('#hmConnected').isChecked(), false);
    await page.waitForFunction(() => [...document.querySelectorAll('#hmCustomerSite img')].every((img) => !img.complete || img.naturalWidth > 0));
    const dimensions = await page.evaluate(() => ({
      width: innerWidth, doc: document.documentElement.scrollWidth,
      images: [...document.querySelectorAll('#hmCustomerSite img')].filter((img) => img.complete && !img.naturalWidth).map((img) => img.src),
    }));
    assert(dimensions.doc <= dimensions.width, 'Desktop page must not overflow horizontally');
    assert.deepEqual(dimensions.images, []);
    if (process.env.HM_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.HM_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.HM_SCREENSHOT_DIR, 'hm-home-desktop.png'), fullPage: true, style: screenshotStyle });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(process.env.HM_SCREENSHOT_DIR, 'hm-home-mobile.png'), fullPage: true, style: screenshotStyle });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    assert.equal(posts.length, 0, 'Preview page load must not send business events');
    assert.equal(conciergeLoads, 0, 'Concierge does not load or contact its host until opened');
    const bubble = page.locator('#hmConciergeLauncher');
    assert.equal((await bubble.textContent()).trim(), '', 'Bubble has no unread count');
    await bubble.click();
    assert.equal(await bubble.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#hmConciergePanel').evaluate((node) => node.open), true);
    assert.equal(await page.locator('#hmConciergeFrame').getAttribute('referrerpolicy'), 'no-referrer');
    assert.equal(await page.locator('#hmConciergeFrame').getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-forms allow-popups');
    const chat = page.frameLocator('#hmConciergeFrame');
    await chat.getByLabel('Message').fill('Synthetic demo message');
    await chat.getByRole('button', { name: 'Send' }).click();
    assert.equal(await chat.locator('#reply').textContent(), 'Fixture reply', 'The iframe accepts real user interaction');
    const panel = page.locator('#hmConciergePanel');
    const modalMode = panel.getByRole('button', { name: 'Modal', exact: true });
    const dockedMode = panel.getByRole('button', { name: 'Docked', exact: true });
    const dockedBox = await panel.boundingBox();
    await page.evaluate(() => { window.hmTestConciergeFrame = document.getElementById('hmConciergeFrame'); });
    await modalMode.focus();
    await page.keyboard.press('Enter');
    assert.equal(await modalMode.getAttribute('aria-pressed'), 'true');
    assert.equal(await dockedMode.getAttribute('aria-pressed'), 'false');
    assert.equal(await panel.evaluate((node) => node.matches(':modal')), true, 'Expanded mode uses native modal focus/inert behavior');
    assert.equal(await panel.getAttribute('aria-modal'), 'true');
    assert.equal(await page.locator('html').evaluate((node) => getComputedStyle(node).overflow), 'hidden', 'Modal prevents background scrolling');
    const modalBox = await panel.boundingBox();
    assert(modalBox.width > dockedBox.width * 2 && modalBox.height > dockedBox.height, 'Modal provides substantially more room for image cards');
    assert(modalBox.x >= 0 && modalBox.y >= 0 && modalBox.x + modalBox.width <= 1440 && modalBox.y + modalBox.height <= 1000);
    await page.waitForTimeout(50); // Allow the mode switch's queued close event to fire.
    assert.equal(await bubble.getAttribute('aria-expanded'), 'true', 'Switching modes does not mark the open chat closed');
    assert.equal(await modalMode.evaluate((node) => node === document.activeElement), true);
    assert.equal(await chat.getByLabel('Message').inputValue(), 'Synthetic demo message');
    assert.equal(await chat.locator('#reply').textContent(), 'Fixture reply');
    if (process.env.HM_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.HM_SCREENSHOT_DIR, 'hm-concierge-modal-desktop.png'), style: screenshotStyle });
    }
    await dockedMode.click();
    assert.equal(await panel.evaluate((node) => node.matches(':modal')), false);
    assert.equal(await panel.getAttribute('aria-modal'), 'false');
    assert.notEqual(await page.locator('html').evaluate((node) => getComputedStyle(node).overflow), 'hidden');
    assert.equal(await page.evaluate(() => window.hmTestConciergeFrame === document.getElementById('hmConciergeFrame')), true, 'Mode switches retain the original iframe node');
    assert.equal(conciergeLoads, 1, 'Mode switches do not reload the hosted chat');
    await page.locator('#hmConciergeClose').click();
    await page.waitForFunction(() => document.getElementById('hmConciergeLauncher').getAttribute('aria-expanded') === 'false');
    assert.equal(await bubble.getAttribute('aria-expanded'), 'false');
    assert.equal(await bubble.evaluate((node) => node === document.activeElement), true);
    await bubble.click();
    assert.equal(await chat.getByLabel('Message').inputValue(), 'Synthetic demo message', 'Closing and reopening preserves the remote session');
    assert.equal(conciergeLoads, 1, 'Reopening does not reload the iframe');
    await page.locator('#hmConciergeClose').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#hmConciergePanel').evaluate((node) => node.open), false);
    await page.setViewportSize({ width: 390, height: 844 });
    await bubble.click();
    const panelBox = await page.locator('#hmConciergePanel').boundingBox();
    assert(panelBox.x >= 0 && panelBox.y >= 0 && panelBox.x + panelBox.width <= 390 && panelBox.y + panelBox.height <= 844, 'Mobile chat panel stays inside the viewport');
    await modalMode.click();
    const mobileModalBox = await panel.boundingBox();
    assert(mobileModalBox.x >= 0 && mobileModalBox.y >= 0 && mobileModalBox.x + mobileModalBox.width <= 390 && mobileModalBox.y + mobileModalBox.height <= 844, 'Mobile modal stays inside the viewport');
    assert(mobileModalBox.height > panelBox.height, 'Mobile modal uses the extra vertical space');
    await chat.getByLabel('Message').fill('Mobile conversation');
    await page.locator('#hmConciergeClose').click();
    await page.waitForFunction(() => document.getElementById('hmConciergeLauncher').getAttribute('aria-expanded') === 'false');
    assert.notEqual(await page.locator('html').evaluate((node) => getComputedStyle(node).overflow), 'hidden', 'Closing modal restores scrolling');
    assert.equal(await bubble.evaluate((node) => node === document.activeElement), true);
    await bubble.click();
    assert.equal(await panel.evaluate((node) => node.matches(':modal')), true, 'Reopening remembers the selected display mode');
    assert.equal(await chat.getByLabel('Message').inputValue(), 'Mobile conversation');
    await page.locator('#hmConciergeClose').focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('hmConciergeLauncher').getAttribute('aria-expanded') === 'false');
    assert.equal(await panel.evaluate((node) => node.open), false, 'Escape closes modal mode');
    await bubble.click();
    await dockedMode.click();
    const bubbleColour = await bubble.evaluate((node) => getComputedStyle(node).backgroundColor);
    await page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    assert.equal(await bubble.evaluate((node) => getComputedStyle(node).backgroundColor), bubbleColour, 'Bubble keeps its reference colour in both Lab themes');
    await page.evaluate(() => document.documentElement.removeAttribute('data-aep-theme'));
    if (process.env.HM_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.HM_SCREENSHOT_DIR, 'hm-concierge-mobile.png'), style: screenshotStyle });
    }
    await page.locator('#hmConciergeClose').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /presenter/i }).click();
    assert.equal(await page.locator('#hmPresenter').evaluate((node) => node.open), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#hmPresenter').evaluate((node) => node.open), false);
    const interactions = [];
    await page.exposeFunction('hmTestInteraction', (type, payload) => { interactions.push({ type, payload }); });
    await page.evaluate(() => {
      const interact = window.HmLab.interact;
      window.HmLab.interact = async (type, payload) => {
        await window.hmTestInteraction(type, payload);
        return interact(type, payload);
      };
    });
    await page.locator('.hm-departments a').click();
    await page.locator('#hmCategory .hm-card a').first().click();
    await page.locator('#hmAddForm button[type=submit]').click();
    await assert.equal(await page.locator('#hmSizeError').textContent(), 'Select a size.');
    await page.locator('#hmAddForm input[name=hmSize][value=M]').check();
    const lightProduct = await page.locator('#hmProduct h1').evaluate((node) => getComputedStyle(node).color);
    await page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    assert.equal(await page.locator('#hmProduct h1').evaluate((node) => getComputedStyle(node).color), lightProduct, 'Customer typography is stable under Lab dark mode');
    if (process.env.HM_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.HM_SCREENSHOT_DIR, 'hm-product-desktop.png'), fullPage: true, style: screenshotStyle });
    }
    await page.evaluate(() => document.documentElement.removeAttribute('data-aep-theme'));
    await page.locator('#hmAddForm button[type=submit]').click();
    await page.waitForFunction(() => window.HmStore.state().cart.length === 1 && !window.HmStore.isBusy());
    await page.locator('#hmBagLink').click();
    await page.locator('[data-hm-cart=inc]').click();
    await page.waitForFunction(() => window.HmStore.state().cart[0]?.qty === 2 && !window.HmStore.isBusy());
    await page.locator('[data-hm-cart=dec]').click();
    await page.waitForFunction(() => window.HmStore.state().cart[0]?.qty === 1 && !window.HmStore.isBusy());
    await page.reload();
    await page.evaluate(() => window.HmLab.ready);
    await closeEnvironment();
    assert.equal(await page.evaluate(() => window.HmStore.state().cart[0]?.qty), 1, 'Bag survives reload');
    await page.locator('[data-hm-cart=checkout]').click();
    await page.waitForURL('**/*page=checkout');
    await page.locator('#hmCheckoutEmail').fill('shopper@example.test');
    await page.locator('#hmCheckoutForm button[type=submit]').click();
    assert.match(await page.locator('#hmCheckoutStatus').textContent(), /Confirm/);
    await page.locator('#hmCheckoutAck').check();
    await page.locator('#hmCheckoutForm button[type=submit]').click();
    await page.waitForURL('**/*page=confirmation');
    assert.equal(await page.evaluate(() => window.HmStore.state().cart.length), 0);
    assert.match(await page.locator('#hmConfirmation').textContent(), /HM-/);
    assert.equal(posts.length, 0, 'Entire preview journey sends no business events');
    assert(await page.evaluate(() => !JSON.stringify(Object.entries(sessionStorage)).includes('shopper@example.test')), 'Checkout contact is not persisted');
    await page.goBack();
    await page.waitForURL('**/*page=checkout');
    await page.goForward();
    await page.waitForURL('**/*page=confirmation');
    await page.goto(origin + '/profile-viewer/hm-demo.html?page=product&product=HMD-1001');
    await page.evaluate(() => window.HmLab.ready);
    await closeEnvironment();
    await page.locator('#hmAddForm input[name=hmSize][value=M]').check();
    await page.evaluate(() => {
      window.HmLab.interact = async () => { throw new Error('Fixture rejection'); };
    });
    await page.locator('#hmAddForm button[type=submit]').click();
    await page.waitForFunction(() => document.getElementById('hmAddStatus').textContent.includes('Fixture rejection'));
    assert.equal(await page.evaluate(() => window.HmStore.state().cart.length), 0, 'Rejected action does not advance bag');
    await page.evaluate(() => {
      window.HmLab.interact = () => new Promise((resolve) => { window.hmTestResolve = resolve; });
    });
    await page.locator('#hmAddForm button[type=submit]').click();
    await page.waitForFunction(() => window.HmStore.isBusy());
    assert.equal(await page.evaluate(() => {
      try { window.HmStore.reset(); return false; } catch { return true; }
    }), true, 'Reset cannot discard an in-flight action');
    await page.evaluate(() => window.hmTestResolve({ preview: true }));
    await page.waitForFunction(() => window.HmStore.state().cart.length === 1 && !window.HmStore.isBusy());
    await page.evaluate(() => {
      window.HmLab.scope = () => 'preview:other:visitor';
      window.dispatchEvent(new CustomEvent('hm-context-change'));
    });
    assert.equal(await page.evaluate(() => window.HmStore.state().cart.length), 0, 'Context change isolates bag');
    await page.goto(origin + '/profile-viewer/hm-demo.html?page=product&product=unknown');
    await page.evaluate(() => window.HmLab.ready);
    await closeEnvironment();
    assert.equal(await page.locator('#hmNotFound').isVisible(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page must not overflow horizontally');
    assert.deepEqual(errors, [], 'No uncaught errors in the real Lab shell');
    assert(interactions.some((entry) => entry.type === 'add'));
    if (process.env.HM_LIVE_CONCIERGE === '1') {
      liveConcierge = true;
      await page.goto(origin + '/profile-viewer/hm-demo.html');
      await page.evaluate(() => window.HmLab.ready);
      await closeEnvironment();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator('#hmConciergeLauncher').click();
      const input = page.frameLocator('#hmConciergeFrame').getByPlaceholder('Search for women’s dresses, men’s shirts, or kids’ outfits');
      await input.waitFor({ timeout: 60000 });
      await input.fill('Synthetic demo');
      assert.equal(await input.inputValue(), 'Synthetic demo');
      if (process.env.HM_SCREENSHOT_DIR) {
        await page.screenshot({ path: path.join(process.env.HM_SCREENSHOT_DIR, 'hm-concierge-desktop-live.png'), style: screenshotStyle });
      }
      await modalMode.click();
      assert.equal(await input.inputValue(), 'Synthetic demo', 'Real hosted app retains its input when expanded');
      if (process.env.HM_SCREENSHOT_DIR) {
        await page.screenshot({ path: path.join(process.env.HM_SCREENSHOT_DIR, 'hm-concierge-modal-desktop-live.png'), style: screenshotStyle });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(process.env.HM_SCREENSHOT_DIR, 'hm-concierge-modal-mobile-live.png'), style: screenshotStyle });
      }
      await dockedMode.click();
      assert.equal(await input.inputValue(), 'Synthetic demo', 'Real hosted app retains its input when docked again');
      await input.fill('');
      console.log('Live hosted concierge renders and accepts input within the H&M page; no message was sent.');
    }
    console.log('H&M real-shell shopping, preview isolation, acknowledgement guards, history, semantic mounts and responsive checks passed.');
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
