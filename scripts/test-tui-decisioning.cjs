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
    for (const [index, scenario] of model.scenarios.entries()) {
      await page.locator('#scenario-select').selectOption(String(index));
      if (scenario.expectedObjective) {
        assert.equal(await page.locator('.objective[data-winner="true"]').getAttribute('data-key'), scenario.expectedObjective, scenario.name);
        const objective = model.objectives.find(o => o.key === scenario.expectedObjective);
        const offer = objective.offers.find(o => o.key === scenario.expectedOffer);
        assert.equal(await page.locator('#email-preview .email-heading').textContent(), offer.content.title, scenario.name);
        assert.equal(await page.locator('#mobile-preview .email-heading').textContent(), offer.content.title);
        assert.equal(await page.locator('#web-preview h3').textContent(), offer.content.title);
      } else {
        assert.equal(await page.locator('.objective[data-winner="true"]').count(), 0);
        for (const id of ['email-preview', 'mobile-preview', 'web-preview']) {
          assert.equal(await page.locator('#' + id + ' img').count(), 0);
          assert.equal(await page.locator('#' + id + ' .preview-cta').count(), 0);
        }
      }
      const expectedGroups = [...new Set(Object.keys(scenario.preset)
        .map(key => model.fields.find(f => f.key === key).group))].sort();
      assert.deepEqual((await page.locator('.signal-group[open]').evaluateAll(nodes => nodes.map(n => n.dataset.group))).sort(), expectedGroups);
    }
    const holdIndex = model.scenarios.findIndex(s => s.name === 'No email consent');
    await page.locator('#scenario-select').selectOption(String(holdIndex));
    await page.locator('#signal-emailConsent').selectOption('y');
    assert.equal(await page.locator('#email-preview .email-card').count(), 1, 'Held content restores');
    await page.locator('#email-preview .preview-cta').click();
    assert.match(await page.locator('#preview-feedback').textContent(), /Simulation only/);
    const count = await page.locator('.signal-field').count();
    assert.equal(count, model.fields.length);
    await page.locator('details[data-group="Holiday"] summary').click();
    await page.locator('#signal-days').fill('-1');
    assert.equal(await page.locator('#email-preview .email-card').count(), 0, 'Invalid number removes stale content');
    await page.locator('#signal-days').fill('30');
    assert.equal(await page.locator('#email-preview .email-card').count(), 1);
    await page.locator('details[data-group="Preferences"] summary').click();
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
    await page.locator('.gutter').first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.gutter').first().getAttribute('aria-valuenow'), '280');
    await page.reload();
    assert.equal(await page.locator('.gutter').first().getAttribute('aria-valuenow'), '280');
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
    await shellContext.addInitScript(() => localStorage.setItem('aepGlobalSandboxName', 'kirkham'));
    const shellCalls = [];
    let rejectGeneric = false, delayNextLookup = false;
    const fixture = {
      found: true, profileEmail: 'traveller@example.invalid', ecid: '12345678901234567890123456789012345678',
      industries: { generic: { writable: true, schemaId: 'generic-schema' }, travel: { writable: true, schemaId: 'travel-schema' } },
      rows: [
        ...model.fields.map(field => ({ path: field.path, value: field.key === 'score' ? 2.99 : model.defaults[field.key], valueType: field.type,
          industry: profile.industry(field), writable: true })),
        { path: 'testProfile', value: true, valueType: 'boolean', industry: 'generic', writable: true },
        { path: 'person.name.firstName', value: 'Taylor', valueType: 'string', industry: 'generic', writable: true },
        { path: '_demoemea.airlineCustomer.preservedSibling', value: 'Keep exact value', valueType: 'string', industry: 'travel', writable: true },
      ],
    };
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
          const schema = { version: '1.11', properties: { _demoemea: { properties: {} }, consents: { properties: {} } } };
          for (const field of model.fields) {
            let at = schema;
            for (const part of field.path.split('.')) {
              at.properties ||= {}; at.properties[part] ||= {}; at = at.properties[part];
            }
            at.type = field.type;
          }
          json = { status: 200, platform_response: schema };
        }
        if (parsed.pathname === '/api/profile/update') {
          if (rejectGeneric && body.industry === 'generic') {
            await route.fulfill({ status: 400, json: { ok: false, error: 'Fixture rejected generic dataflow' } }); return;
          }
          for (const update of body.updates) {
            const row = fixture.rows.find(row => profile.relative(row.path) === update.path);
            assert(row, 'Fixture updates known paths only'); row.value = update.value;
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
    const minimize = shell.getByRole('button', { name: 'Minimize configuration panels', exact: true });
    if (await minimize.isVisible()) await minimize.click();
    const frame = shell.frameLocator('#tui-visualiser');
    await frame.locator('#panel-web').waitFor({ state: 'visible' });
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
    await shell.locator('#customerEmail').fill(fixture.profileEmail);
    await shell.locator('#queryProfileBtn').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Test profile loaded.'));
    assert.equal(await shell.locator('#tuiPhName').textContent(), 'Taylor Traveller');
    assert.equal(await shell.locator('#tuiPhKpi-score').textContent(), '2.99');
    assert.match(await shell.locator('#profileDrawerAudiences').textContent(), /Fixture holiday audience/);
    assert.equal(await shell.locator('#profileDrawerEvents .aep-profile-drawer-event-item').count(), 5);
    assert.equal(shellCalls.some(call => call.path === '/api/events/generator'), false, 'Read-only lookup sends no event');
    await shell.evaluate(() => document.body.classList.add('mod-demo-page--profile-open'));
    await shell.locator('#tuiPhTab-0').focus(); await shell.keyboard.press('End');
    assert.equal(await shell.locator('#tuiPhTab-2').getAttribute('aria-selected'), 'true');
    assert.equal(await shell.locator('#profileDrawerEcidResetWrap').count(), 1, 'Anonymous control moved, not cloned');
    await shell.locator('#tuiPhTab-1').click();
    assert.equal(await shell.locator('#tuiPhSignal-score').textContent(), '2.99');
    for (const dark of [false, true]) {
      await shell.evaluate(dark => document.documentElement.setAttribute('data-aep-theme', dark ? 'dark' : 'light'), dark);
      for (const width of [1440, 390]) {
        await shell.setViewportSize({ width, height: 844 });
        await shell.locator('#profileDrawer').evaluate(drawer => drawer.style.transition = 'none');
        const height = await shell.locator('#profileDrawer .aep-profile-drawer-inner').evaluate(n => n.getBoundingClientRect().height);
        assert(height <= Math.min(560, width < 1100 ? 844 * .55 : 844) + 1, 'Drawer obeys bounded five-card budget');
        assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (screenshotDir) await shell.screenshot({ path: path.join(screenshotDir, `shell-${dark ? 'dark' : 'light'}-${width}.png`) });
      }
    }
    await shell.setViewportSize({ width: 1440, height: 1000 });
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
    assert.equal(await frame.locator('#mobile-preview .email-heading').textContent(), 'Fixture live offer');
    assert.equal(await frame.locator('#web-preview h3').textContent(), 'Fixture live offer');
    assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), 1, 'One attributed display across three views');
    fixture.rows.find(row => row.path === 'consents.marketing.email.val').value = 'n';
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Actual loaded consent'));
    assert.equal(await frame.locator('#email-preview img').count(), 0, 'Missing consent removes stale live content');
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
    await shell.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    await shell.locator('#tui-visualiser').contentFrame().locator('html[data-aep-theme="dark"]').waitFor();
    assert.equal(await frame.locator('html').getAttribute('data-aep-theme'), 'dark');
    await shell.setViewportSize({ width: 390, height: 844 });
    assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert(shellCalls.filter(c => c.method !== 'GET').every(c => c.path === '/api/aep' || c.path === '/api/profile/update'),
      'Only explicit Apply writes a profile');
    assert.deepEqual(errors, []);
    await shellContext.close();
    console.log(`TUI browser checks passed: ${model.scenarios.length} scenarios, 3 channels, 2 themes, 2 viewport widths; shared configuration/drawer and history verified; no live requests.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
