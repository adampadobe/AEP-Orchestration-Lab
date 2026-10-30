'use strict';
// Real captured storefront, isolated shell acknowledgements, and no external network/API calls.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../web');
const shopperPrefix = 'vuseShopper:fixture:11111111111111111111111111111111111111:';
const demoPassword = 'Synthetic-fixture-only-not-a-real-password-742!';
const fixture = `<!doctype html><title>Storefront fixture</title><script>
window.messages = [];
window.fixtureContext = {sandbox:'fixture',visitorKey:'11111111111111111111111111111111111111'};
window.send = (type,payload,requestId) => document.querySelector('iframe').contentWindow.postMessage({source:'vuse-shell',type,payload,requestId},location.origin);
window.addEventListener('message',e=>{
  if(e.source!==document.querySelector('iframe').contentWindow||e.origin!==location.origin||e.data.source!=='vuse-site')return;
  messages.push(e.data);
  if(e.data.type==='site.ready'&&!location.search.includes('delay'))send('site.context',fixtureContext);
});
</script><iframe style="width:1440px;height:1100px" src="/profile-viewer/vuse-italia-assets/index.html"></iframe>`;

async function main() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture');
    if (url.pathname === '/fixture') { res.writeHead(200, { 'Content-Type': 'text/html' }).end(fixture); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) return route.fulfill({ body: '', contentType: 'text/javascript' });
      if (new URL(route.request().url()).pathname.startsWith('/api/')) throw new Error('Storefront must not call a live API');
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    async function child() {
      await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow.VuseSite);
      return page.frames().find(frame => frame.url().includes('/vuse-italia-assets/'));
    }
    const messages = type => page.evaluate(type => window.messages.filter(m => m.type === type), type);
    const lastSubmit = async () => (await messages('customer.submit')).at(-1);
    async function ack(payload, requestId) {
      const request = await lastSubmit();
      await page.evaluate(({ payload, requestId }) => window.send('customer.result', payload, requestId), { payload, requestId: requestId || request.requestId });
    }
    async function fill(frame, values, panel = '[data-vs-modal] form:visible') {
      for (const [name, value] of Object.entries(values)) await frame.locator(panel + ' [name="' + name + '"]').fill(value);
      if (values.demoPassword) await assertPasswordPrivate();
    }
    async function assertPasswordPrivate() {
      const state = await page.evaluate(() => ({
        messages: window.messages,
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage)
      }));
      for (const [name, value] of Object.entries(state)) {
        assert(!JSON.stringify(value).includes(demoPassword), 'Demo password must not appear in ' + name);
      }
    }
    async function assertAccountPanel(frame, active) {
      for (const panel of ['signin', 'register']) {
        const selected = panel === active;
        const form = frame.locator('[data-vs-panel="' + panel + '"]');
        assert.equal(await form.isVisible(), selected, panel + ' visibility follows the selected tab with real CSS');
        assert.equal(await form.evaluate(el => el.hidden), !selected);
        assert.equal(await form.evaluate(el => getComputedStyle(el).display), selected ? 'grid' : 'none');
        assert.equal(await frame.locator('[data-vs-tab="' + panel + '"]').getAttribute('aria-selected'), String(selected));
      }
    }
    async function register(frame, email = 'giulia.fixture@example.com') {
      await frame.evaluate(() => window.VuseSite.openAccount('register'));
      await fill(frame, {
        firstName: 'Giulia', lastName: 'Rossi', dateOfBirth: '1990-05-04', phone: '+393330001122',
        street1: 'Via Fixture 17', city: 'Milano', postalCode: '20100', countryCode: 'it', email
      }, '[data-vs-panel="register"]');
      await frame.locator('[data-vs-consent="vuse.email"]').check();
      await frame.locator('[data-vs-consent="velo.sms"]').check();
      await frame.locator('[data-vs-terms]').check();
    }
    async function waitCount(type, count) {
      await page.waitForFunction(({ type, count }) => window.messages.filter(m => m.type === type).length === count, { type, count });
      await assertPasswordPrivate();
    }
    async function stored(suffix) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), shopperPrefix + suffix); }

    await page.goto(origin + '/fixture?delay');
    let frame = await child();
    assert.equal((await messages('pageView')).length, 0, 'No pageview without a context');
    await page.evaluate(() => {
      sessionStorage.setItem('vuseIdentity', JSON.stringify({ email: 'unsafe@example.com', signedIn: true }));
      localStorage.setItem('vuseIdentity', JSON.stringify({ email: 'unsafe@example.com', signedIn: true }));
      window.send('site.requestContext', {});
    });
    await waitCount('site.ready', 2);
    await page.evaluate(() => window.send('site.context', fixtureContext));
    await frame.locator('.batcom-agegate__button-over-age .cmp-button').click();
    await waitCount('pageView', 1);
    assert.equal((await messages('pageView'))[0].payload.url, 'https://www.vuse.com/it/it/');
    assert.equal(await stored('vuseIdentity'), null, 'Unscoped identities are not migrated');
    await page.evaluate(() => window.send('site.context', fixtureContext));
    await page.waitForTimeout(80);
    assert.equal((await messages('pageView')).length, 1, 'Repeated context does not duplicate pageviews');

    const stylesheets = await frame.evaluate(() => Array.from(document.styleSheets, sheet => ({
      href: sheet.href && new URL(sheet.href).pathname,
      rules: sheet.cssRules.length
    })));
    for (const file of ['vuse-site.css', 'css/vuse-6f64419c.css', 'css/vuse-it-4d6d1c64.css']) {
      assert(stylesheets.some(sheet => sheet.href?.endsWith('/' + file) && sheet.rules > 0),
        'Fixture loads actual storefront stylesheet: ' + file);
    }
    await frame.evaluate(() => window.VuseSite.openAccount());
    await assertAccountPanel(frame, 'signin');
    const password = frame.locator('[data-vs-panel="signin"] [name="demoPassword"]');
    assert(await password.isVisible(), 'Sign-in shows a demo password field');
    assert.equal(await password.getAttribute('type'), 'password');
    assert.equal(await password.getAttribute('autocomplete'), 'off');
    assert(await password.evaluate(el => el.required));
    assert.match(await frame.locator('.vs-modal').innerText(), /do not enter a real password/i);
    await fill(frame, { email: 'giulia.fixture@example.com' }, '[data-vs-panel="signin"]');
    await frame.locator('[data-vs-panel="signin"] button[type="submit"]').click();
    assert.equal((await messages('customer.submit')).length, 0, 'Empty demo password prevents sign-in submission');
    await fill(frame, { demoPassword }, '[data-vs-panel="signin"]');
    await frame.locator('[data-vs-tab="register"]').click();
    await assertAccountPanel(frame, 'register');
    assert(!await password.isVisible(), 'Demo password is hidden on Create account');
    await frame.locator('[data-vs-tab="signin"]').click();
    await assertAccountPanel(frame, 'signin');
    await frame.locator('.vs-close').click();
    await assertPasswordPrivate();

    await frame.evaluate(() => {
      const link = document.createElement('a');
      link.dataset.vuseHref = '/it/it/customer/account/create';
      link.href = '#';
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
    assert(await frame.locator('[data-vs-panel="register"]').isVisible(), 'Create-account links select the registration tab');
    await frame.locator('.vs-close').click();
    await register(frame);
    await frame.locator('[data-vs-panel="register"] [name="email"]').fill('invalid');
    await frame.locator('[data-vs-panel="register"] button[type="submit"]').click();
    assert.equal((await messages('customer.submit')).length, 0);
    await frame.locator('[data-vs-panel="register"] [name="email"]').fill('giulia.fixture@example.com');
    await frame.locator('[data-vs-panel="register"] [name="dateOfBirth"]').fill('2020-01-01');
    await frame.locator('[data-vs-panel="register"] button[type="submit"]').click();
    assert.equal((await messages('customer.submit')).length, 0, 'Underage registration is rejected locally');
    await frame.locator('[data-vs-panel="register"] [name="dateOfBirth"]').fill('1990-05-04');
    await frame.locator('[data-vs-panel="register"] button[type="submit"]').click();
    await waitCount('customer.submit', 1);
    const registration = await lastSubmit();
    assert.equal(registration.payload.action, 'register');
    assert.deepEqual(registration.payload.details, {
      firstName: 'Giulia', lastName: 'Rossi', dateOfBirth: '1990-05-04', phone: '+393330001122',
      address: { street1: 'Via Fixture 17', city: 'Milano', postalCode: '20100', countryCode: 'IT' }
    });
    for (const brand of ['vuse', 'velo', 'glo']) for (const channel of ['email', 'sms', 'whatsapp']) {
      assert.equal(typeof registration.payload.preferences[brand][channel], 'boolean');
    }
    assert.equal(registration.payload.preferences.vuse.email, true);
    assert.equal(registration.payload.preferences.glo.email, false);
    assert(!JSON.stringify(registration).match(/password|cardNumber|paymentToken/));
    assert.equal(await stored('vuseIdentity'), null, 'No optimistic identity');
    assert(await frame.locator('[data-vs-panel="register"] button[type="submit"]').isDisabled());
    await frame.locator('.vs-close').click();
    assert(await frame.locator('[data-vs-panel="register"]').isVisible(), 'Pending submissions cannot be dismissed');
    const pendingUrl = frame.url();
    await frame.locator('a[href="vuse-pro.html"]').first().evaluate(link => link.click());
    assert.equal(frame.url(), pendingUrl, 'Navigation waits for the customer acknowledgement');
    await ack({ ok: true, identity: { email: registration.payload.email, firstName: 'Giulia', lastName: 'Rossi' } }, 'wrong-request');
    await page.waitForTimeout(50);
    assert.equal(await stored('vuseIdentity'), null, 'Unmatched acknowledgements are ignored');
    await ack({ ok: false, error: 'Fixture definite rejection', uncertain: false });
    await frame.waitForFunction(() => document.querySelector('[data-vs-panel="register"] [data-vs-error]').textContent.includes('Fixture definite rejection'));
    assert.equal(await stored('vuseIdentity'), null);
    assert(!await frame.locator('[data-vs-panel="register"] button[type="submit"]').isDisabled());
    await frame.locator('[data-vs-panel="register"] button[type="submit"]').click();
    await waitCount('customer.submit', 2);
    await ack({ ok: true, identity: { email: registration.payload.email, firstName: 'Giulia', lastName: 'Rossi' } });
    await frame.waitForFunction(() => !document.querySelector('[data-vs-modal]'));
    assert.equal((await stored('vuseIdentity')).lastName, 'Rossi');
    assert.equal((await stored('vuseConsent')).velo.sms, true);

    await frame.evaluate(() => window.VuseSite.openAccount());
    await fill(frame, { phone: '+393330009999' });
    await frame.locator('[data-vs-save]').click();
    await waitCount('customer.submit', 3);
    assert.equal((await lastSubmit()).payload.action, 'profile');
    assert.equal((await lastSubmit()).payload.details.phone, '+393330009999');
    assert.equal((await stored('vuseIdentity')).details.phone, '+393330001122');
    await ack({ ok: true, identity: { email: registration.payload.email, firstName: 'Giulia', lastName: 'Rossi' } });
    await frame.waitForFunction(() => !document.querySelector('[data-vs-modal]'));

    const card = frame.locator('.product-card').filter({ has: frame.locator('.product-card__price') });
    const purchasable = await card.evaluateAll(cards => cards.findIndex(c => /(?:^|\D)0\s*mg|zero/i.test(c.querySelector('.product-card__name')?.textContent || '')));
    assert(purchasable >= 0, 'Captured catalogue includes a purchasable zero-nicotine product');
    const productCard = card.nth(purchasable);
    await productCard.locator('.product-card__name').click({ force: true });
    assert.equal((await messages('pageView')).at(-1).payload.page, 'product');
    assert((await messages('pageView')).at(-1).payload.url.startsWith('https://www.vuse.com/it/it/products/'));
    await frame.locator('.vs-close').click();
    await frame.locator('.cmp-search__toggle').first().evaluate(button => button.click());
    await frame.locator('[data-vs-modal] [name="query"]').fill('Spearmint');
    await frame.locator('[data-vs-modal] form').dispatchEvent('submit');
    assert((await frame.locator('[data-vs-results]').innerText()).includes('Spearmint'));
    await frame.locator('[data-vs-result]').first().click();
    assert.equal((await messages('pageView')).at(-1).payload.page, 'product');
    await frame.locator('.vs-close').click();
    await productCard.locator('[data-key="increase-amount"]').click({ force: true });
    assert.equal(await productCard.locator('.product-card__buy-quantityInput').inputValue(), '2');
    await productCard.locator('.product-card__buy-button').click({ force: true });
    await frame.locator('.vs-drawer.vs-open').waitFor();
    assert.equal((await stored('vuseCart'))[0].qty, 2);
    let beforeViews = (await messages('pageView')).length;
    await frame.locator('[data-vs-line-qty]').fill('3');
    await frame.locator('[data-vs-line-qty]').dispatchEvent('change');
    assert.equal((await stored('vuseCart'))[0].qty, 3);
    assert.equal((await messages('pageView')).length, beforeViews, 'Cart quantity re-render is not a new view');
    await frame.locator('[data-vs-checkout]').click();
    const checkout = await frame.locator('[data-vs-modal] form:visible [name="street1"]').inputValue();
    assert.equal(checkout, 'Via Fixture 17', 'Only acknowledged submitted addresses prefill checkout');
    await frame.locator('[data-vs-modal] form:visible button[type="submit"]').click();
    await waitCount('customer.submit', 4);
    const order = await lastSubmit();
    assert.equal(order.payload.action, 'checkout');
    assert.equal(order.payload.details.address.city, 'Milano');
    assert.equal(order.payload.items[0].qty, 3);
    assert.equal(order.payload.currency, 'EUR');
    assert((await stored('vuseCart')).length, 'Cart remains pending acknowledgement');
    await ack({ ok: false, error: 'Checkout rejected' });
    await frame.waitForFunction(() => document.querySelector('[data-vs-error]').textContent.includes('Checkout rejected'));
    assert((await stored('vuseCart')).length);
    await frame.locator('[data-vs-modal] form:visible button[type="submit"]').click();
    await waitCount('customer.submit', 5);
    await ack({ ok: true, identity: { email: registration.payload.email, firstName: 'Giulia', lastName: 'Rossi' } });
    await frame.locator('[data-vs-done]').waitFor();
    assert.equal((await stored('vuseCart')).length, 0);
    assert((await frame.locator('.vs-modal').innerText()).includes('No charge, shipment or confirmation email'));
    assert.equal((await messages('pageView')).at(-1).payload.url, 'https://www.vuse.com/it/it/checkout/confirmation');
    await frame.locator('[data-vs-done]').click();

    // Reload the actual child and require a fresh read/stitch acknowledgement.
    await Promise.all([
      page.waitForEvent('framenavigated', { predicate: f => f.parentFrame() === page.mainFrame() }),
      page.evaluate(() => { document.querySelector('iframe').src = '/profile-viewer/vuse-italia-assets/index.html'; })
    ]);
    frame = await child();
    await page.evaluate(() => window.send('site.context', fixtureContext));
    await waitCount('customer.submit', 6);
    assert.deepEqual((await lastSubmit()).payload, { action: 'resume', email: registration.payload.email });
    await ack({ ok: true, identity: { email: registration.payload.email, firstName: 'Giulia', lastName: 'Rossi' } });
    await frame.waitForFunction(() => document.querySelector('.vs-account-name')?.textContent === 'Giulia');
    assert(!(await frame.locator('.cmp-batcom-agegate').getAttribute('class')).includes('vs-open'), 'Age gate survives page reload');
    await frame.evaluate(() => window.VuseSite.openAccount());
    await frame.locator('a.sign-out').first().evaluate(link => link.click());
    await waitCount('logout', 1);
    assert.equal((await stored('vuseIdentity')).signedIn, false);
    await frame.evaluate(() => window.VuseSite.openAccount());
    await fill(frame, { email: 'different.fixture@example.com', demoPassword }, '[data-vs-panel="signin"]');
    await frame.locator('[data-vs-panel="signin"] button[type="submit"]').click();
    await frame.waitForFunction(() => document.querySelector('[data-vs-panel="signin"] [data-vs-error]').textContent.includes('New visitor'));
    assert.equal((await messages('customer.submit')).length, 6);
    await fill(frame, { email: registration.payload.email, demoPassword }, '[data-vs-panel="signin"]');
    await frame.locator('[data-vs-panel="signin"] button[type="submit"]').click();
    await waitCount('customer.submit', 7);
    assert.deepEqual((await lastSubmit()).payload, { action: 'login', email: registration.payload.email });
    await ack({ ok: false, error: 'Fixture delivery uncertain', uncertain: true });
    await frame.waitForFunction(() => document.querySelector('[data-vs-error]').textContent.includes('Fixture delivery uncertain'));
    assert(await frame.locator('[data-vs-panel="signin"] button[type="submit"]').isDisabled());
    await frame.locator('.vs-close').click();
    await frame.evaluate(() => window.VuseSite.openAccount());
    await fill(frame, { email: registration.payload.email, demoPassword }, '[data-vs-panel="signin"]');
    await frame.locator('[data-vs-panel="signin"] button[type="submit"]').click();
    assert.equal((await messages('customer.submit')).length, 7, 'Uncertain delivery cannot be resubmitted through a new form');
    await Promise.all([
      page.waitForEvent('framenavigated', { predicate: f => f.parentFrame() === page.mainFrame() }),
      page.evaluate(() => { document.querySelector('iframe').src = '/profile-viewer/vuse-italia-assets/index.html'; })
    ]);
    frame = await child();
    await page.evaluate(() => window.send('site.context', fixtureContext));
    await frame.evaluate(() => window.VuseSite.openAccount());
    await fill(frame, { email: registration.payload.email, demoPassword }, '[data-vs-panel="signin"]');
    await frame.locator('[data-vs-panel="signin"] button[type="submit"]').click();
    assert.equal((await messages('customer.submit')).length, 7, 'Uncertain lock survives a page reload');
    await waitCount('customer.uncertain', 1);
    await page.evaluate(() => window.send('customer.reconciled', {}));
    await frame.waitForFunction(() => document.querySelector('[data-vs-error]').textContent.includes('Previous delivery checked'));
    assert.equal((await messages('customer.submit')).length, 7, 'Reconciliation never automatically retries');
    assert.equal(await stored('uncertain'), false);
    await frame.locator('[data-vs-panel="signin"] button[type="submit"]').click();
    await waitCount('customer.submit', 8);
    assert.deepEqual((await lastSubmit()).payload, { action: 'login', email: registration.payload.email });
    await ack({ ok: true, identity: { email: registration.payload.email, firstName: 'Giulia', lastName: 'Rossi' } });
    await frame.waitForFunction(() => !document.querySelector('[data-vs-modal]'));
    assert.equal((await stored('vuseIdentity')).signedIn, true, 'An explicit attempt works after reconciliation');
    assert.equal((await messages('cart.abandon')).length, 0, 'Closing/reloading is not cart abandonment');
    await assertPasswordPrivate();
    for (const event of await messages('pageView')) {
      assert.equal(new URL(event.payload.url).hostname, 'www.vuse.com');
      assert(!event.payload.url.includes('@') && !event.payload.url.includes('?'), 'Pageview URL contains no PII');
    }
    // New visitor scope must not inherit identity, consent, cart or gate.
    await Promise.all([
      page.waitForEvent('framenavigated', { predicate: f => f.parentFrame() === page.mainFrame() }),
      page.evaluate(() => {
        window.fixtureContext = { sandbox: 'fixture', visitorKey: '22222222222222222222222222222222222222' };
        document.querySelector('iframe').src = '/profile-viewer/vuse-italia-assets/index.html';
      })
    ]);
    frame = await child();
    await page.evaluate(() => window.send('site.context', fixtureContext));
    await frame.locator('.cmp-batcom-agegate.vs-open').waitFor();
    assert.equal(await frame.locator('.vs-account-name').count(), 0);
    await page.evaluate(() => window.send('reset', {}));
    await page.waitForFunction(() => !Object.keys(localStorage).some(k => k.startsWith('vuseShopper:')));
    assert.deepEqual(errors, []);
    console.log('Vuse storefront: real-CSS account tabs, demo-password privacy, acknowledgement, rejection, uncertainty, fields, preferences, checkout, scoped persistence, resume, logout and route fixtures passed.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
