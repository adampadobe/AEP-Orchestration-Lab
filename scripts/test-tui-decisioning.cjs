'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const model = require('../web/profile-viewer/tui-decisioning-model.js');
const profile = require('../web/profile-viewer/tui-decisioning-profile.js');
const root = path.resolve(__dirname, '..', 'web');

async function main() {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.startsWith('/api/')) { res.writeHead(403).end('Local preview: APIs disabled'); return; }
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(filename);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' }[path.extname(filename)];
      res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(body);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') console.error(error);
      res.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  if (process.argv.includes('--serve')) {
    console.log(origin + '/profile-viewer/tui-decisioning-demo.html?channel=web');
    return;
  }
  let browser;
  const screenshotDir = process.env.TUI_SCREENSHOTS;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    const unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || url.pathname.startsWith('/api/')) {
        unexpected.push(url.href);
        await route.abort();
      } else await route.continue();
    });
    const url = origin + '/profile-viewer/tui-decisioning-visualiser.html';
    await page.goto(url);
    assert.equal(await page.locator('.objective').count(), 7);
    assert.equal(await page.locator('.objective[open]').count(), 0);
    assert.equal(await page.locator('.signal-group[open]').count(), 0);
    assert.equal(await page.locator('#scenario-select').count(), 0, 'No duplicate scenario dropdown');
    assert.equal(await page.locator('#scenario-pills button').count(), 7);
    assert.equal(await page.locator('.boundary-note,.simulation-badge,.app-disclaimer,.site-disclaimer,.email-footer').count(), 0,
      'Removed notices have no remaining elements or reserved rows');
    assert(await page.evaluate(() => {
      const header = document.querySelector('.tui-lab-header'), workspace = document.getElementById('workspace');
      return header.nextElementSibling === workspace && Math.abs(header.getBoundingClientRect().bottom - workspace.getBoundingClientRect().top) < 1;
    }), 'Workspace follows the header directly without the removed explanatory row');
    for (const [index, scenario] of model.demoScenarios.entries()) {
      await page.locator('#scenario-pills button').nth(index).click();
      assert.equal(await page.locator('.objective[data-winner="true"]').getAttribute('data-key'), scenario.expectedObjective);
      assert.equal(await page.locator('#eligible-details').getAttribute('open'), '');
      assert.equal(await page.locator('#eligible-items .nba-card--winner').getAttribute('data-offer'), scenario.expectedOffer);
      assert.deepEqual((await page.locator('.signal-group[open]').evaluateAll(nodes => nodes.map(n => n.dataset.group))).sort(),
        [...new Set(Object.keys(scenario.preset).map(key => model.fields.find(f => f.key === key).group))].sort());
      const objective = model.objectives[index], result = model.evaluate(scenario.preset);
      const expected = result.ladder[index].offers.filter(item => item.eligible).sort((a, b) => b.priority - a.priority);
      assert.deepEqual(await page.locator('#eligible-items .nba-card:not(.nba-card--off)').evaluateAll(cards => cards.map(card => card.dataset.offer)),
        expected.map(item => item.key), 'NBA panel ranks only the selected objective');
      assert.equal(await page.locator('#eligible-items .nba-card--off').count(), objective.offers.length - expected.length);
      for (const card of await page.locator('#eligible-items .nba-card:not(.nba-card--off)').all()) {
        const contributions = await card.locator('.nba-components b').allTextContents();
        assert.equal(contributions.map(Number).reduce((a, b) => a + b, 0), Number(await card.locator('.nba-score').textContent()),
          'Displayed priority contributions add to the actual unchanged catalog priority');
      }
    }
    for (const [index, scenario] of model.scenarios.entries()) {
      await page.evaluate(state => window.TuiDecisioningVisualiser.setProfile({ state, firstName: 'Alex' }),
        { ...model.defaults, ...scenario.preset });
      const presentation = await page.locator('body').innerText();
      assert.doesNotMatch(presentation, /simulat|app concept|illustrat/i,
        'No presentation caveats in scenario content: ' + presentation.match(/.{0,50}(?:simulat|app concept|illustrat).{0,100}/i)?.[0]);
      if (scenario.expectedObjective) {
        assert.equal(await page.locator('.objective[data-winner="true"]').getAttribute('data-key'), scenario.expectedObjective, scenario.name);
        const objective = model.objectives.find(o => o.key === scenario.expectedObjective);
        const offer = objective.offers.find(o => o.key === scenario.expectedOffer);
        assert.equal(await page.locator('#email-preview .email-heading').textContent(), offer.content.title, scenario.name);
        assert.equal(await page.locator('#mobile-preview .app-offer-title').textContent(), offer.content.title);
        assert.equal(await page.locator('#web-preview h3').textContent(), offer.content.title);
      } else {
        assert.equal(await page.locator('.objective[data-winner="true"]').count(), 0);
        for (const id of ['email-preview', 'mobile-preview', 'web-preview']) {
          assert.equal(await page.locator('#' + id + ' img').count(), 0);
          assert.equal(await page.locator('#' + id + ' .preview-cta').count(), 0);
        }
      }
    }
    await page.locator('#scenario-pills button').last().click();
    await page.locator('#signal-emailConsent').selectOption('n');
    assert.equal(await page.locator('#eligible-items .nba-card').count(), 0, 'Consent hold clears ranked NBA cards');
    await page.locator('#signal-emailConsent').selectOption('y');
    assert.equal(await page.locator('#email-preview .email-card').count(), 1, 'Held content restores');
    await page.locator('#email-preview .preview-cta').click();
    assert.match(await page.locator('#preview-feedback').textContent(), /not connected to a booking service/);
    const count = await page.locator('.signal-field').count();
    assert.equal(count, model.fields.length);
    await page.locator('#signal-days').fill('-1');
    assert.equal(await page.locator('#email-preview .email-card').count(), 0, 'Invalid number removes stale content');
    await page.locator('#signal-days').fill('30');
    assert.equal(await page.locator('#email-preview .email-card').count(), 1);
    await page.locator('#signal-score').fill('5.1');
    for (const id of ['email-preview', 'mobile-preview', 'web-preview']) {
      assert.equal(await page.locator('#' + id + ' img').count(), 0);
      assert.equal(await page.locator('#' + id + ' .preview-cta').count(), 0);
    }
    await page.locator('#signal-score').fill('2.99');
    assert.equal(await page.locator('#signal-score').evaluate(input => input.checkValidity()), true);
    assert.equal(await page.locator('#email-preview .email-card').count(), 1);
    await page.locator('#expand').click();
    assert.equal(await page.locator('.objective[open]').count(), 7);
    await page.locator('#collapse').click();
    assert.equal(await page.locator('.objective[open]').count(), 0);
    const signalWidth = Number(await page.locator('.gutter').first().getAttribute('aria-valuenow'));
    await page.locator('.gutter').first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(Number(await page.locator('.gutter').first().getAttribute('aria-valuenow')), signalWidth + 24);
    await page.reload();
    assert.equal(Number(await page.locator('.gutter').first().getAttribute('aria-valuenow')), signalWidth + 24);
    for (const width of [1600, 2400, 3200]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(60);
      const preview = await page.locator('.preview-pane').boundingBox();
      assert(preview.width / width < .5, 'Balanced columns do not force two-thirds preview at wide widths');
      const gutter = page.locator('[data-pane="preview"]'), bounds = await gutter.boundingBox();
      const before = Number(await gutter.getAttribute('aria-valuenow'));
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 80);
      await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 - 120, bounds.y + 80, { steps: 6 }); await page.mouse.up();
      assert(Math.abs(Number(await gutter.getAttribute('aria-valuenow')) - before - 120) <= 1, 'Preview divider moves freely');
      await gutter.dblclick();
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.locator('#tab-email').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tab-mobile').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#panel-mobile').isVisible(), true);
    await page.keyboard.press('End');
    assert.equal(await page.locator('#tab-web').getAttribute('aria-selected'), 'true');
    await page.goBack();
    assert.equal(await page.locator('#tab-mobile').getAttribute('aria-selected'), 'true');
    await page.goForward();
    assert.equal(await page.locator('#tab-web').getAttribute('aria-selected'), 'true');
    for (const channel of ['email', 'mobile', 'web']) {
      await page.goto(url + '?channel=' + channel);
      assert.equal(await page.locator('#panel-' + channel).isVisible(), true);
    }
    assert.deepEqual(await page.locator('.channel-tabs button').allTextContents(), ['Email · Desktop', 'Mobile App', 'Web']);
    assert.equal(await page.locator('#panel-mobile .email-card,#panel-mobile .subject-line,#panel-mobile .recipient-label').count(), 0,
      'Mobile is an app, not an email in a phone frame');
    await page.locator('#tab-mobile').click();
    assert.equal(await page.locator('#app-greeting').textContent(), 'Hi Alex');
    await page.locator('.app-shortcuts [data-app-action="My trips"]').click();
    assert.match(await page.locator('#preview-feedback').textContent(), /"My trips" is not connected to an app service/);
    await page.locator('.app-nav [data-app-action="Account"]').click();
    assert.match(await page.locator('#preview-feedback').textContent(), /"Account" is not connected to an app service/);
    const navBefore = await page.locator('.app-nav').boundingBox();
    await page.locator('.app-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
    assert((await page.locator('.app-scroll').evaluate(node => node.scrollTop)) > 0, 'App content scrolls independently');
    assert.equal((await page.locator('.app-nav').boundingBox()).y, navBefore.y, 'App navigation remains in place');
    await page.locator('.app-scroll').evaluate(node => { node.scrollTop = 0; });
    await page.locator('#tab-web').click();
    if (screenshotDir) await fs.mkdir(screenshotDir, { recursive: true });
    for (const width of [1100, 3200]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width > 1150) {
        await page.waitForFunction(() => Number(document.querySelector('[data-pane="preview"]').getAttribute('aria-valuemax')) > 1500);
        await page.locator('[data-pane="preview"]').focus();
        await page.keyboard.press('End');
      }
      await page.waitForTimeout(80);
      const dimensions = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const panel = document.getElementById('panel-web'), website = box('.website-preview');
        return { web: website.width, panel: panel.clientWidth, hero: box('.web-hero > img').height,
          title: box('#preview-title'), switcher: box('.channel-tabs'), header: box('.preview-header'),
          scrollable: panel.scrollHeight > panel.clientHeight, browserAddress: document.querySelector('.site-browser-address').textContent };
      });
      assert(dimensions.web > 760, 'Web is not capped to an email-sized stage');
      if (width > 1150) assert(dimensions.web > 1600, 'Expanded Web supports a full desktop website width');
      assert(Math.abs(dimensions.web - (dimensions.panel - 32)) <= 2, 'Website fills the stage except browser inset');
      assert(dimensions.hero > 300, 'Web hero scales with the preview container');
      assert(Math.abs(dimensions.title.y + dimensions.title.height / 2 - dimensions.switcher.y - dimensions.switcher.height / 2) < 2,
        'Compact switcher shares the preview title row');
      assert(dimensions.switcher.width < 340 && dimensions.switcher.height < 36, 'Channel switcher remains compact');
      assert(dimensions.scrollable, 'Full website scrolls within its stage');
      assert.equal(dimensions.browserAddress, 'tui.co.uk');
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `web-stage-${width}.png`), fullPage: true });
      const headerBefore = await page.locator('.preview-header').boundingBox();
      await page.locator('#panel-web').evaluate(node => { node.scrollTop = 500; });
      const headerAfter = await page.locator('.preview-header').boundingBox();
      assert.equal(headerAfter.y, headerBefore.y, 'Web scrolling leaves channel header in place');
      await page.locator('#tab-email').click();
      assert((await page.locator('.email-card').first().boundingBox()).width <= 601, 'Email keeps its own 600px cap');
      await page.locator('#tab-mobile').click();
      assert((await page.locator('.phone-frame').boundingBox()).width <= 391, 'Phone keeps its own 390px cap');
      await page.locator('#tab-web').click();
      await page.locator('#panel-web').evaluate(node => { node.scrollTop = 0; });
      if (width > 1150) await page.locator('[data-pane="preview"]').dblclick();
    }
    if (screenshotDir) await fs.mkdir(screenshotDir, { recursive: true });
    for (const dark of [false, true]) {
      await page.evaluate(dark => {
        localStorage.setItem('aepTheme', dark ? 'dark' : 'light');
        if (dark) document.documentElement.setAttribute('data-aep-theme', 'dark');
        else document.documentElement.removeAttribute('data-aep-theme');
      }, dark);
      for (const width of [1600, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const channel of ['email', 'mobile', 'web']) {
          await page.locator('#tab-' + channel).click();
          await page.locator('#reset').click();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width} ${channel}: no overflow`);
          await page.waitForFunction(() => [...document.images].every(img => img.complete));
          assert.equal(await page.evaluate(() => [...document.images].every(img => img.naturalWidth > 0)), true, 'All local assets load');
          if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${dark ? 'dark' : 'light'}-${width}-${channel}.png`), fullPage: true });
        }
        await page.locator('#scenario-pills button').nth(5).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Expanded NBA cards fit both themes and widths');
        assert.equal(await page.locator('#eligible-items .nba-card--winner').count(), 1);
        if (screenshotDir) {
          await page.locator('#objectives').screenshot({ path: path.join(screenshotDir, `objectives-${dark ? 'dark' : 'light'}-${width}.png`) });
          await page.locator('#eligible-details').evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
          await page.locator('#eligible-details').screenshot({ path: path.join(screenshotDir, `nba-${dark ? 'dark' : 'light'}-${width}.png`) });
        }
        await page.locator('.fictional-drawer summary').click();
        const height = await page.locator('.fictional-drawer').evaluate(node => node.getBoundingClientRect().height);
        assert(height <= 550, 'Fictional drawer stays within viewport budget');
        await page.locator('.fictional-drawer summary').click();
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, [], 'Simulation must make no external or API requests');
    await context.close();
    const shellContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const shellCalls = [];
    let rejectGeneric = false, delayNextLookup = false, mismatchTenant = false, missingRecoveredField = false;
    let recoveredSchemaField = { type: 'string' };
    const fixture = {
      found: true, profileEmail: 'traveller@example.invalid', ecid: '12345678901234567890123456789012345678',
      industries: { generic: { writable: true, schemaId: 'generic-schema', xdmKey: '_demoemea' },
        travel: { writable: true, schemaId: 'travel-schema', xdmKey: '_demoemea' } },
      rows: [
        ...model.fields.map(field => ({ path: field.path, value: field.key === 'score' ? 2.99 : model.defaults[field.key], valueType: field.type,
          industry: profile.industry(field), writable: true })),
        { path: 'testProfile', value: true, valueType: 'boolean', industry: 'generic', writable: true },
        { path: 'person.name.firstName', value: 'Taylor', valueType: 'string', industry: 'generic', writable: true },
        { path: '_demoemea.airlineCustomer.preservedSibling', value: 'Keep exact value', valueType: 'string', industry: 'travel', writable: true },
      ],
    };
    // Older deployed table maps labelled airlineCustomer as Generic; preserve its entire subtree.
    fixture.rows.filter(row => row.path.includes('.airlineCustomer.')).forEach(row => {
      row.industry = 'generic'; row.writable = false;
    });
    const events = Array.from({ length: 5 }, (_, i) => ({ id: 'fixture-' + i, timestamp: Date.now() - i * 60000,
      eventType: i === 0 ? 'decisioning.propositionDisplay' : 'web.webPageDetails.pageViews', channel: 'web',
      rows: [{ path: 'web.webPageDetails.name', value: 'TUI Decisioning' }] }));
    await shellContext.route('**/*', async route => {
      const request = route.request();
      const parsed = new URL(request.url());
      if (parsed.origin !== origin) {
        if (parsed.hostname === 'www.gstatic.com') await route.fulfill({ contentType: 'text/javascript', body: '' });
        else if (parsed.hostname === 'contenthosting.web.app') await route.fulfill({
          contentType: 'image/jpeg', body: await fs.readFile(path.join(root, 'profile-viewer', 'tui-decisioning-assets', 'crete.jpg')),
        });
        else await route.abort();
        return;
      }
      if (parsed.pathname.startsWith('/api/')) {
        const body = request.postDataJSON();
        shellCalls.push({ path: parsed.pathname, method: request.method(), body });
        let json = { ok: true, enabled: false, found: false, targets: [], sandboxes: [], companies: [] };
        if (parsed.pathname === '/api/profile/table') {
          if (delayNextLookup) { delayNextLookup = false; await new Promise(resolve => setTimeout(resolve, 500)); }
          json = fixture;
        }
        if (parsed.pathname === '/api/profile/consent') json = { found: true, firstName: 'Taylor', lastName: 'Traveller',
          email: fixture.profileEmail, phone: '+440000000000', city: 'Manchester', gender: 'female', age: 38, ecid: fixture.ecid,
          channels: { email: 'in', sms: 'out', push: 'not_provided' }, customerLifetimeValue: 12000,
          identities: [{ namespace: 'Email', value: fixture.profileEmail }, { namespace: 'ECID', value: fixture.ecid }] };
        if (parsed.pathname === '/api/profile/events') json = { events };
        if (parsed.pathname === '/api/profile/audiences') json = { realized: [{ id: 'test-audience', name: 'Fixture holiday audience' }], exited: [] };
        if (parsed.pathname === '/api/aep' && body?.path?.includes('schemaregistry')) {
          const schema = { version: '1.11', 'meta:tenantNamespace': mismatchTenant ? 'different' : 'demoemea',
            properties: { _id: { type: 'string' }, _repo: { properties: {} }, _experience: { properties: {} },
              _demoemea: { properties: {} }, consents: { properties: {} } } };
          for (const field of model.fields) {
            let at = schema;
            for (const part of field.path.split('.')) {
              at.properties ||= {}; at.properties[part] ||= {}; at = at.properties[part];
            }
            at.type = field.type;
          }
          if (!missingRecoveredField) schema.properties._demoemea.properties.airlineCustomer.properties.preservedSibling = recoveredSchemaField;
          json = { status: 200, platform_response: schema };
        }
        if (parsed.pathname === '/api/profile/update') {
          if (rejectGeneric && body.industry === 'generic') {
            await route.fulfill({ status: 400, json: { ok: false, error: 'Fixture rejected generic dataflow' } }); return;
          }
          for (const update of body.updates) {
            let row = fixture.rows.find(row => profile.relative(row.path) === update.path);
            if (!row) {
              const field = model.fields.find(field => profile.relative(field.path) === update.path);
              assert(field && field.type === update.valueType, 'New fixture rows must be declared typed signals');
              row = { path: field.path, valueType: field.type, industry: body.industry, writable: true };
              fixture.rows.push(row);
            }
            row.value = update.value;
          }
          json = { ok: true };
        }
        await route.fulfill({ json });
      } else await route.continue();
    });
    const shell = await shellContext.newPage();
    shell.on('pageerror', error => errors.push(error.message));
    await shell.goto(origin + '/profile-viewer/tui-decisioning-demo.html?channel=web');
    await shell.waitForFunction(() => !!window.TuiDecisioningDrawer, null, { timeout: 30000 });
    assert.equal(await shell.evaluate(() => window.AepGlobalSandbox.getSandboxName()), 'kirkham', 'A fresh TUI browser defaults to kirkham');
    const minimize = shell.getByRole('button', { name: 'Minimize configuration panels', exact: true });
    if (await minimize.isVisible()) await minimize.click();
    const frame = shell.frameLocator('#tui-visualiser');
    await frame.locator('#panel-web').waitFor({ state: 'visible' });
    const mountLayout = await shell.evaluate(() => {
      const doc = document.getElementById('tui-visualiser').contentDocument;
      const before = doc.querySelector('#workspace').getBoundingClientRect().top;
      window.DecisioningEdgeInject.ensureDecisioningMounts(doc, 'generic');
      return { before, after: doc.querySelector('#workspace').getBoundingClientRect().top,
        mounts: ['TopRibbon', 'hero-banner', 'ContentCardContainer'].map(id => doc.defaultView.getComputedStyle(doc.getElementById(id)).display) };
    });
    assert.equal(mountLayout.after, mountLayout.before, 'Runtime mounts add no grey spacer above content');
    assert.deepEqual(mountLayout.mounts, ['none', 'none', 'none']);
    assert.equal(await frame.locator('.boundary-note').count(), 0, 'Shared initialization does not recreate the removed row');
    assert.doesNotMatch(await frame.locator('body').innerText(), /simulat|app concept|illustrat/i);
    await shell.mouse.move(1000, 500);
    await shell.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await frame.locator('#tab-mobile').click();
    await shell.waitForURL('**/tui-decisioning-demo.html?channel=mobile');
    await frame.locator('#tab-email').click();
    await shell.waitForURL('**/tui-decisioning-demo.html?channel=email');
    await shell.goBack();
    await frame.locator('#panel-mobile').waitFor({ state: 'visible' });
    await shell.goBack();
    await frame.locator('#panel-web').waitFor({ state: 'visible' });
    await shell.goForward();
    await frame.locator('#panel-mobile').waitFor({ state: 'visible' });
    assert.equal(await shell.locator('[data-demo-env-strip-prefix="tuiDecisioning"]').count(), 1);
    assert.equal(await shell.locator('#customerEmail').count(), 1);
    assert.equal(await shell.locator('#tuiProfileHero').count(), 1);
    await shell.evaluate(() => window.EnvBarCompact.openOverlay());
    await shell.locator('#customerEmail').fill(fixture.profileEmail);
    await shell.locator('#queryProfileBtn').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Test profile loaded.'));
    assert.equal(await shell.locator('#tuiPhName').textContent(), 'Taylor Traveller');
    assert.equal(await shell.locator('#tuiPhKpi-score').textContent(), '2.99');
    assert.match(await shell.locator('#profileDrawerAudiences').textContent(), /Fixture holiday audience/);
    assert.equal(await shell.locator('#profileDrawerEvents .aep-profile-drawer-event-item').count(), 5);
    assert.equal(shellCalls.some(call => call.path === '/api/events/generator'), false, 'Read-only lookup sends no event');
    await shell.evaluate(() => document.body.classList.add('mod-demo-page--profile-open'));
    assert.equal(await shell.locator('#tuiProfileHero [role="tab"]').count(), 0, 'Profile sections have no tabs');
    for (const index of [0, 1, 2]) assert.equal(await shell.locator('#tuiPhPanel-' + index).isVisible(), true);
    assert.equal(await shell.locator('#profileDrawerEcidResetWrap').count(), 1, 'Anonymous control moved, not cloned');
    assert.equal(await shell.locator('#tuiPhSignal-score').textContent(), '2.99');
    for (const dark of [false, true]) {
      await shell.evaluate(dark => document.documentElement.setAttribute('data-aep-theme', dark ? 'dark' : 'light'), dark);
      for (const width of [1440, 390]) {
        await shell.setViewportSize({ width, height: 844 });
        await shell.locator('#profileDrawer').evaluate(drawer => drawer.style.transition = 'none');
        const height = await shell.locator('#profileDrawer .aep-profile-drawer-inner').evaluate(n => n.getBoundingClientRect().height);
        assert(height <= Math.min(560, width < 1100 ? 844 * .55 : 844) + 1, 'Drawer obeys bounded five-card budget');
        assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await shell.mouse.move(width / 2, 550);
        await shell.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
        await shell.locator('#tuiPhSignal-booking').scrollIntoViewIfNeeded();
        assert.equal(await shell.locator('#tuiPhSignal-booking').isVisible(), true, 'Travel values remain accessible without tabs');
        if (screenshotDir) await shell.screenshot({ path: path.join(screenshotDir, `shell-${dark ? 'dark' : 'light'}-${width}.png`) });
      }
    }
    await shell.setViewportSize({ width: 1440, height: 1000 });
    await shell.mouse.move(700, 500);
    if (await minimize.isVisible()) await minimize.click();
    await shell.locator('#profileDrawerEventsStoryOpen').click();
    await shell.locator('.dpj-root').waitFor();
    for (const view of ['A', 'B', 'C']) {
      await shell.locator('[data-dpj-view="' + view + '"]').click();
      const bounds = await shell.locator('#aepProfileDrawerEventsStoryDialog').boundingBox();
      assert(bounds.y >= 0 && bounds.y + bounds.height <= 1001, 'Journey view fits viewport');
    }
    await shell.evaluate(() => window.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile());
    assert.equal(await shell.locator('[data-dpj-view="C"]').getAttribute('aria-selected'), 'true', 'Polling retains selected journey view');
    await shell.keyboard.press('Escape');
    await shell.evaluate(() => document.body.classList.remove('mod-demo-page--profile-open'));
    await shell.mouse.move(700, 100);
    await frame.locator('details[data-group="Holiday"] summary').click();
    await frame.locator('#signal-booking').selectOption('Booked');
    mismatchTenant = true;
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('does not match'));
    assert.equal(shellCalls.filter(call => call.path === '/api/profile/update').length, 0, 'Tenant disagreement blocks every write');
    mismatchTenant = false;
    missingRecoveredField = true;
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('preservedSibling'));
    assert.equal(shellCalls.filter(call => call.path === '/api/profile/update').length, 0, 'Every recovered sibling is schema-checked before any write');
    missingRecoveredField = false;
    for (const incompatible of [{ type: 'number' }, { type: 'string', readOnly: true }]) {
      recoveredSchemaField = incompatible;
      await shell.locator('#tuiApplyProfile').click();
      await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('preservedSibling'));
      assert.equal(shellCalls.filter(call => call.path === '/api/profile/update').length, 0, 'Wrong types and readonly siblings block all writes');
    }
    recoveredSchemaField = { type: 'string' };
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Profile changes confirmed.'));
    const updates = shellCalls.filter(call => call.path === '/api/profile/update');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].body.updates.find(row => row.path.endsWith('preservedSibling')).value, 'Keep exact value');
    assert.equal(await shell.locator('#tuiPhSignal-booking').textContent(), 'Booked');
    await frame.locator('details[data-group="Preferences"] summary').click();
    await frame.locator('#signal-booking').selectOption('Dreaming');
    await frame.locator('#signal-score').fill('3.5');
    rejectGeneric = true;
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Fixture rejected generic dataflow'));
    rejectGeneric = false;
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Apply staged changes before Run.'));
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Profile changes confirmed.'));
    assert.deepEqual(shellCalls.filter(call => call.path === '/api/profile/update').map(call => call.body.industry),
      ['travel', 'travel', 'generic', 'generic'], 'Partial failure never resends the accepted travel snapshot');
    await shell.evaluate(() => {
      window.fixtureDisplayEvents = [];
      window.DecisioningProfileRuntime = {
        supportsManualDisplay: true, runProfileLookup: async () => true,
        runContentDecision: async options => {
          if (!options.manualDisplay) throw new Error('Manual display is required');
          return {
            propositions: [{ id: 'fixture-proposition', scope: location.origin + '/#hero-banner',
              scopeDetails: { activity: { id: 'fixture-policy' } },
              items: [{ id: 'fixture-item', schema: 'https://ns.adobe.com/personalization/json-content-item',
                data: { imageURL: location.origin + '/profile-viewer/tui-decisioning-assets/crete.jpg',
                  title: 'Fixture live offer', fullDescription: 'Actual returned fixture copy' } }] }],
            manualDisplay: { identityMap: { ECID: [{ id: '12345678901234567890', primary: true }] },
              alloy: async (command, options) => window.fixtureDisplayEvents.push({ command, options }) },
          };
        },
      };
    });
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Live hero displayed'));
    assert.equal(await frame.locator('#email-preview .email-heading').textContent(), 'Fixture live offer');
    assert.equal(await frame.locator('#mobile-preview .app-offer-title').textContent(), 'Fixture live offer');
    assert.doesNotMatch(await shell.locator('#tuiLiveStatus').textContent(), /simulat|app concept|illustrat/i);
    assert.doesNotMatch(await frame.locator('body').innerText(), /simulat|app concept|illustrat/i);
    assert.equal(await frame.locator('#web-preview h3').textContent(), 'Fixture live offer');
    assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), 1, 'One attributed display across three views');
    fixture.rows.find(row => row.path === 'consents.marketing.email.val').value = 'n';
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Actual loaded consent'));
    assert.equal(await frame.locator('#email-preview img').count(), 0, 'Missing consent removes stale live content');
    assert.equal(await frame.locator('#mobile-preview img,#mobile-preview .preview-cta').count(), 0, 'Consent removes stale app offer imagery and CTA');
    assert.equal(await frame.locator('.app-nav button').count(), 4, 'App shell survives the consent hold');
    assert.equal(await frame.locator('#eligible-items .nba-card').count(), 0, 'Actual consent hold clears stale eligible NBA cards');
    assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), 1, 'Consent hold sends no display');
    await shell.evaluate(() => window.EnvBarCompact.openOverlay());
    await shell.locator('#customerEmail').fill('another@example.invalid');
    await shell.waitForFunction(() => document.getElementById('tuiPhSignal-booking').textContent === 'Not loaded');
    assert.equal(await shell.locator('#profileDrawerEvents .aep-profile-drawer-event-item').count(), 0);
    delayNextLookup = true;
    const requested = shell.waitForRequest('**/api/profile/table?**');
    await shell.locator('#queryProfileBtn').click(); await requested;
    await shell.locator('#customerEmail').fill('third@example.invalid');
    await shell.waitForTimeout(750);
    assert.equal(await shell.locator('#tuiPhSignal-booking').textContent(), 'Not loaded', 'Late lookup cannot restore the previous profile');
    await shell.evaluate(() => window.AepGlobalSandbox.setSelected('apalmer'));
    await shell.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Select kirkham before Run'));
    await shell.evaluate(() => {
      window.AepGlobalSandbox.setSelected('kirkham');
      window.EnvBarCompact.openOverlay();
    });
    fixture.rows = fixture.rows.filter(row => !/^_demoemea\.(airlineCustomer|travelReservations)\./.test(row.path));
    await shell.locator('#queryProfileBtn').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Test profile loaded.'));
    await shell.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await shell.mouse.move(700, 100);
    await frame.locator('#signal-booking').selectOption('Booked');
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Profile changes confirmed.'));
    assert.deepEqual(shellCalls.filter(call => call.path === '/api/profile/update').at(-1).body.updates,
      [{ path: 'airlineCustomer.journeyStage', value: 'Booked', valueType: 'string' }],
      'Configured writable dataflow allows first-time Travel population with no existing rows');
    await shell.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    await shell.locator('#tui-visualiser').contentFrame().locator('html[data-aep-theme="dark"]').waitFor();
    assert.equal(await frame.locator('html').getAttribute('data-aep-theme'), 'dark');
    await shell.setViewportSize({ width: 390, height: 844 });
    assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert(shellCalls.filter(c => c.method !== 'GET').every(c => c.path === '/api/aep' || c.path === '/api/profile/update'),
      'Only explicit Apply writes a profile');
    assert.deepEqual(errors, []);
    await shellContext.close();
    console.log(`TUI browser checks passed: 7 scenario buttons, ${model.scenarios.length} regression cases, ranked NBA cards, 3 channels, 2 themes; legacy ownership and first-time snapshots verified; no live requests.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
