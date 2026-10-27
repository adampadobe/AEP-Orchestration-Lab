'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const model = require('../web/profile-viewer/tui-decisioning-model.js');
const profile = require('../web/profile-viewer/tui-decisioning-profile.js');
const root = path.resolve(__dirname, '..', 'web');

async function chooseSignal(surface, key, value) {
  const field = surface.locator('.signal-field').filter({ has: surface.locator('#signal-' + key) });
  const group = surface.locator('.signal-group').filter({ has: field });
  if (!await group.evaluate(node => node.open)) await group.locator('summary').click();
  await field.locator('.signal-segments button').filter({ hasText: new RegExp('^' + value + '$') }).click();
}

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
    page.setDefaultTimeout(15000);
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
    assert.deepEqual(await page.locator('#scenario-pills button').evaluateAll(buttons => buttons.map(b => b.textContent.split(' / ')[0])),
      ['7', '6', '5', '4', '3', '2', '1']);
    assert.equal(await page.locator('#ranking-title').textContent(), 'Selection Strategies');
    assert(await page.locator('#eligible-details').evaluate(panel => {
      const previous = panel.previousElementSibling.getBoundingClientRect();
      return panel.getBoundingClientRect().top - previous.bottom >= 18;
    }), 'Eligible NBAs has a visible gap below Selection Strategies');
    assert.equal(await page.locator('#scenario-label,#decision-status,.decision-pane > .microcopy,.ranking-heading > span').count(), 0,
      'Removed scenario instructions and live/local summary leave no empty rows');
    assert.equal(await page.locator('.signal-group > summary .signal-icon,.signal-group > summary .signal-chevron').count(), 10);
    for (const id of ['expand', 'collapse']) {
      assert.equal(await page.locator('#' + id + ' svg').count(), 1);
      assert(await page.locator('#' + id).getAttribute('aria-label'));
    }
    assert.equal(await page.locator('.fictional-person,.signals-pane > .microcopy').count(), 0,
      'No redundant profile or instruction block above the signal groups');
    assert.equal(await page.locator('.preview-caption,#preview-caption,.site-search,.search-label').count(), 0,
      'Channel description and Web search rows are removed from the DOM');
    assert(await page.locator('.preview-header').evaluate(header =>
      header.nextElementSibling.id === 'panel-email'), 'Channel content immediately follows the switcher');
    assert(await page.locator('.site-nav').evaluate(nav =>
      nav.nextElementSibling.id === 'web-preview'), 'Web hero immediately follows navigation');
    assert.equal(await page.locator('.boundary-note,.simulation-badge,.app-disclaimer,.site-disclaimer,.email-footer').count(), 0,
      'Removed notices have no remaining elements or reserved rows');
    assert(await page.evaluate(() => {
      const header = document.querySelector('.tui-lab-header'), workspace = document.getElementById('workspace');
      return header.nextElementSibling === workspace && Math.abs(header.getBoundingClientRect().bottom - workspace.getBoundingClientRect().top) < 1;
    }), 'Workspace follows the header directly without the removed explanatory row');
    await page.evaluate(defaults => window.TuiDecisioningVisualiser.setProfile({
      state: { ...defaults, booking: 'Custom journey stage', score: 3.125, points: 1234.56 },
    }), model.defaults);
    assert.equal(await page.locator('.signal-field:has(#signal-booking) button[aria-pressed="true"]').textContent(), 'Custom journey stage',
      'Arbitrary schema-valid strings remain available after readback');
    assert.equal(await page.locator('#signal-score').inputValue(), '3.125');
    assert.equal(await page.locator('#signal-points').inputValue(), '1234.56', 'Numeric precision is not quantised by presentation');
    await page.evaluate(() => window.TuiDecisioningVisualiser.setBusy(true));
    assert.equal(await page.locator('#signals button:not(:disabled),#signals input:not(:disabled)').count(), 0,
      'Every segmented/numeric/slider control is disabled while busy');
    await page.evaluate(() => window.TuiDecisioningVisualiser.setBusy(false));
    await page.locator('#reset').click();
    await chooseSignal(page, 'abandoned', 'Yes');
    assert.equal(await page.evaluate(() => window.TuiDecisioningVisualiser.getState().abandoned), true,
      'Segmented Yes stages a Boolean, not a string');
    await page.locator('.signal-field:has(#signal-abandoned) button[data-value="false"]').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.TuiDecisioningVisualiser.getState().abandoned), false,
      'Keyboard activation stages Boolean No');
    await page.locator('#reset').click();
    let previousScenario = model.defaults;
    for (const [index, scenario] of model.demoScenarios.entries()) {
      await page.locator('#scenario-pills button').nth(index).click();
      assert.equal(await page.locator('.objective[data-winner="true"]').getAttribute('data-key'), scenario.expectedObjective);
      assert.equal(await page.locator('#eligible-details').getAttribute('open'), '');
      assert.equal(await page.locator('#eligible-items .nba-card--winner').getAttribute('data-offer'), scenario.expectedOffer);
      assert.deepEqual((await page.locator('.signal-group[open]').evaluateAll(nodes => nodes.map(n => n.dataset.group))).sort(),
        [...new Set([...scenario.signalKeys, ...model.fields.filter(f => previousScenario[f.key] !== scenario.preset[f.key]).map(f => f.key)]
          .map(key => model.fields.find(f => f.key === key).group))].sort(), 'Only groups participating in this update expand');
      previousScenario = scenario.preset;
      for (const field of model.fields.filter(field => field.type !== 'number')) {
        assert.equal(await page.locator('.signal-field:has(#signal-' + field.key + ') button[aria-pressed="true"]').getAttribute('data-value'),
          String(scenario.preset[field.key]), 'Scenario synchronises segmented choice: ' + field.key);
      }
      const objective = model.objectives.find(o => o.key === scenario.expectedObjective), result = model.evaluate(scenario.preset);
      const expected = result.ladder.find(o => o.key === scenario.expectedObjective).offers.filter(item => item.eligible).sort((a, b) => b.priority - a.priority);
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
    await chooseSignal(page, 'emailConsent', 'n');
    assert.equal(await page.locator('#eligible-items .nba-card').count(), 0, 'Consent hold clears ranked NBA cards');
    await chooseSignal(page, 'emailConsent', 'y');
    assert.equal(await page.locator('#email-preview .email-card').count(), 1, 'Held content restores');
    await page.locator('#email-preview .preview-cta').click();
    assert.match(await page.locator('#preview-feedback').textContent(), /not connected to a booking service/);
    const count = await page.locator('.signal-field').count();
    assert.equal(count, model.fields.length);
    await page.locator('details[data-group="Holiday"] summary').click();
    await page.locator('#signal-days').fill('-1');
    assert.equal(await page.locator('#email-preview .email-card').count(), 0, 'Invalid number removes stale content');
    await page.locator('#signal-days').fill('30');
    assert.equal(await page.locator('#email-preview .email-card').count(), 1);
    assert.equal(await page.getByRole('slider', { name: 'Days until departure slider' }).inputValue(), '30');
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
      eventType: i % 2 === 0 ? 'decisioning.propositionDisplay' : 'web.webPageDetails.pageViews', channel: 'web',
      rows: [{ path: 'web.webPageDetails.name', value: 'TUI Decisioning' }, ...(i % 2 === 0 ? [
        { path: '_experience.decisioning.propositions.0.items.0.name', value: i === 2 ? 'Return to holiday search' : 'Holiday inspiration' },
        { path: '_experience.decisioning.propositions.0.items.0.itemSelection.selectionDetail.strategyName',
          value: i === 2 ? 'NBA Strategy 5 - Find your getaway' : 'NBA Strategy 7 - Keep the smiles coming' },
      ] : [])] }));
    const pendingAbandonments = [];
    let audienceFixture = { realized: [{ segmentId: 'test-audience', name: 'Fixture holiday audience' }], exited: [] };
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
        shellCalls.push({ path: parsed.pathname, method: request.method(), body, query: Object.fromEntries(parsed.searchParams) });
        let json = { ok: true, enabled: false, found: false, targets: [], sandboxes: [], companies: [] };
        if (parsed.pathname === '/api/profile/table') {
          if (delayNextLookup) { delayNextLookup = false; await new Promise(resolve => setTimeout(resolve, 500)); }
          json = fixture;
        }
        if (parsed.pathname === '/api/profile/consent') json = { found: true, firstName: 'Taylor', lastName: 'Traveller',
          email: fixture.profileEmail, phone: '+440000000000', city: 'Manchester', gender: 'female', age: 38, ecid: fixture.ecid,
          channels: { email: 'in', sms: 'out', push: 'not_provided' }, customerLifetimeValue: 12000,
          identities: [{ namespace: 'Email', value: fixture.profileEmail }, { namespace: 'ECID', value: fixture.ecid }] };
        if (parsed.pathname === '/api/profile/events') {
          for (let i = pendingAbandonments.length - 1; i >= 0; i--) {
            if (pendingAbandonments[i].availableAt <= Date.now()) events.unshift(pendingAbandonments.splice(i, 1)[0].event);
          }
          json = { events };
        }
        if (parsed.pathname === '/api/profile/audiences') json = audienceFixture;
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
    await shellContext.addInitScript(() => {
      window.alloy = async command => {
        if (command === 'getIdentity') return { identity: { ECID: '12345678901234567890' } };
        throw new Error('Unexpected SDK command before explicit Run: ' + command);
      };
    });
    const shell = await shellContext.newPage();
    shell.setDefaultTimeout(15000);
    shell.on('pageerror', error => errors.push(error.message));
    await shell.goto(origin + '/profile-viewer/tui-decisioning-demo.html?channel=web', { timeout: 45000 });
    await shell.waitForFunction(() => !!window.TuiDecisioningDrawer, null, { timeout: 30000 });
    assert.equal(await shell.evaluate(() => window.AepGlobalSandbox.getSandboxName()), 'kirkham', 'A fresh TUI browser defaults to kirkham');
    const minimize = shell.getByRole('button', { name: 'Minimize configuration panels', exact: true });
    if (await minimize.isVisible()) await minimize.click();
    const frame = shell.frameLocator('#tui-visualiser');
    await frame.locator('#panel-web').waitFor({ state: 'visible' });
    assert.equal(await frame.locator('#email-preview img,#mobile-preview img,#web-preview img').count(), 0,
      'Embedded channels show no local offer imagery before the first live Run');
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
    assert.equal(await frame.locator('.tui-lab-header').isVisible(), false, 'Embedded page has no duplicate brand row');
    assert(await shell.locator('#tuiApplyProfile').evaluate(button => {
      const brand = document.querySelector('.tui-live-actions .tui-lab-brand').getBoundingClientRect();
      const actions = button.getBoundingClientRect();
      return actions.x > brand.right && actions.y < brand.bottom + 10;
    }), 'Apply and Run sit to the right of the branded title');
    assert(await shell.locator('#tuiLiveStatus').evaluate(status => {
      const apply = document.getElementById('tuiApplyProfile');
      return status.nextElementSibling === apply && status.getBoundingClientRect().right <= apply.getBoundingClientRect().left;
    }), 'Status sits immediately to the left of Apply, not in a row below');
    assert((await shell.locator('.tui-live-actions').boundingBox()).height <= 65, 'Normal desktop action header is compact');
    assert.equal(await frame.locator('.signal-group[open]').count(), 0, 'Embedded signals start collapsed after profile initialization');
    assert.doesNotMatch(await frame.locator('body').innerText(), /simulat|app concept|illustrat/i);
    if (process.argv.includes('--layout-only')) {
      for (const dark of [false, true]) {
        await shell.evaluate(dark => {
          if (dark) document.documentElement.setAttribute('data-aep-theme', 'dark');
          else document.documentElement.removeAttribute('data-aep-theme');
        }, dark);
        for (const width of [1600, 390]) {
          await shell.setViewportSize({ width, height: 1000 });
          assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
            'Compact action header fits desktop and phone in both themes');
        }
      }
      assert.deepEqual(errors, []);
      await shellContext.close();
      console.log('TUI layout checks passed: typed segmented signals, all scenarios, channels, themes and viewport sizes; compact shell actions.');
      return;
    }
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
    await shell.waitForFunction(() => document.getElementById('infoEcid').textContent === '12345678901234567890');
    await shell.evaluate(() => window.EnvBarCompact.openOverlay());
    await shell.locator('#customerEmail').fill(fixture.profileEmail);
    await shell.locator('#queryProfileBtn').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Test profile loaded.'));
    assert.equal(await shell.locator('#tuiPhName').textContent(), 'Taylor Traveller');
    assert.equal(await shell.locator('#tuiPhKpi-score').textContent(), '2.99');
    assert.match(await shell.locator('#profileDrawerAudiences').textContent(), /Fixture holiday audience/);
    assert.equal(await shell.locator('#profileDrawerEvents .aep-profile-drawer-event-item').count(), 5);
    assert.equal(shellCalls.some(call => call.path === '/api/events/generator'), false, 'Read-only lookup sends no event');
    await shell.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await shell.mouse.move(700, 500);
    await shell.evaluate(() => document.body.classList.add('mod-demo-page--profile-open'));
    assert.equal(await shell.locator('#tuiProfileHero [role="tab"]').count(), 7, 'Compact profile tabs split attributes into readable groups');
    assert.equal(await shell.locator('#tuiProfileHero [role="tabpanel"]:visible').count(), 1);
    await shell.getByRole('tab', { name: 'Identity', exact: true }).click();
    await shellContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    assert.equal(await shell.locator('#tuiCopyEcid').innerText(), '', 'Copy ECID uses an icon only');
    assert((await shell.locator('#tuiCopyEcid').boundingBox()).width <= 26);
    await shell.locator('#tuiCopyEcid').click();
    assert.equal(await shell.evaluate(() => navigator.clipboard.readText()), fixture.ecid);
    assert.equal(await shell.locator('.tui-copy-feedback').textContent(), 'ECID copied');
    await shell.getByRole('tab', { name: 'Identity', exact: true }).press('Home');
    assert.equal(await shell.getByRole('tab', { name: 'Contact', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await shell.locator('#profileDrawerEcidResetWrap').count(), 1, 'Anonymous control moved, not cloned');
    assert.equal(await shell.locator('#tuiPhSignal-score').textContent(), '2.99');
    for (const dark of [false, true]) {
      await shell.evaluate(dark => document.documentElement.setAttribute('data-aep-theme', dark ? 'dark' : 'light'), dark);
      for (const width of [1280, 1440, 1920, 390]) {
        await shell.setViewportSize({ width, height: 844 });
        await shell.locator('#profileDrawer').evaluate(drawer => drawer.style.transition = 'none');
        const height = await shell.locator('#profileDrawer .aep-profile-drawer-inner').evaluate(n => n.getBoundingClientRect().height);
        assert(height <= Math.min(560, width < 1100 ? 844 * .55 : 844) + 1, 'Drawer obeys bounded five-card budget');
        assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (width > 1100) {
          const columns = await shell.locator('#profileDrawer .aep-profile-drawer-inner').evaluate(inner => {
            const visible = [...inner.children].filter(child => getComputedStyle(child).display !== 'none');
            return { widths: visible.map(child => child.getBoundingClientRect().width),
              span: getComputedStyle(document.getElementById('tuiProfileHero')).gridColumn };
          });
          assert.equal(columns.widths.length, 4, 'Profile plus three supporting columns');
          assert.equal(columns.span, 'auto', 'Profile no longer spans two equal tracks');
          const eventsHeight = await shell.locator('#profileDrawer .aep-profile-drawer-inner > .aep-profile-drawer-col:last-child').evaluate(col => col.getBoundingClientRect().height);
          assert(columns.widths[3] < columns.widths[0] && columns.widths[3] > columns.widths[1],
            'Last Events is narrower than profile but wider than graph');
          assert(eventsHeight <= height, 'Last Events fills, but does not extend, the profile-sized drawer');
          assert(height < 500, `Drawer height ${height}px is reduced to the profile content`);
          assert(columns.widths[1] > columns.widths[2], 'Graph retains more width than audience/messages');
          assert(await shell.locator('#profileDrawerEvents').evaluate(node =>
            node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1),
          'Events fit at default zoom without horizontal or vertical scrolling');
        }
        await shell.mouse.move(width / 2, 550);
        await shell.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
        for (const label of ['Contact', 'Holiday', 'Support', 'Shopping', 'Preferences', 'Consent', 'Identity']) {
          await shell.getByRole('tab', { name: label, exact: true }).click();
          const panel = shell.locator('#tuiProfileHero [role="tabpanel"]:visible');
          if (label === 'Contact') {
            const consents = await panel.locator('.tui-channel-consents .dph-tog').evaluateAll(nodes =>
              nodes.map(node => { const box = node.getBoundingClientRect(); return { top: box.top, left: box.left, right: box.right }; }));
            assert.equal(consents.length, 3, 'Email, SMS and Push all remain visible');
            assert(Math.max(...consents.map(box => box.top)) - Math.min(...consents.map(box => box.top)) < 1,
              'Email, SMS and Push share one row at every viewport and theme');
            assert(consents[0].right <= consents[1].left && consents[1].right <= consents[2].left,
              'Consent indicators do not overlap');
            const consentRow = await panel.locator('.tui-channel-consents').evaluate(row => {
              const inner = document.querySelector('#profileDrawer .aep-profile-drawer-inner').getBoundingClientRect();
              const box = row.getBoundingClientRect();
              return { height: box.height, gap: inner.bottom - box.bottom };
            });
            assert(consentRow.height <= 30, `Consent row is compact (${consentRow.height}px)`);
            if (width > 1100) assert(consentRow.gap <= 40, `Drawer ends at the consent row (${consentRow.gap}px below it)`);
          }
          assert(await panel.evaluate(node => node.scrollHeight <= node.clientHeight + 1), 'All attributes in each tab fit without panel scrolling');
          assert(await panel.evaluate(node => {
            const hero = document.getElementById('tuiProfileHero').getBoundingClientRect(), box = node.getBoundingClientRect();
            return box.top >= hero.top && box.bottom <= hero.bottom + 1;
          }), 'Selected attribute panel fits inside the compact hero without clipping');
          const emptyTail = await panel.evaluate(node => {
            const rect = node.getBoundingClientRect();
            const children = [...node.children].map(child => child.getBoundingClientRect()).filter(box => box.height > 0);
            return rect.bottom - Math.max(...children.map(box => box.bottom));
          });
          assert(emptyTail < 28, `${label} at ${width}px: content-sized attribute card has ${emptyTail}px empty tail`);
          if (width > 1100) {
            assert(await panel.locator('dd').evaluateAll(nodes => nodes.every(node => parseFloat(getComputedStyle(node).fontSize) >= 16)),
              'Attribute values are readable at default desktop zoom');
            if (await panel.locator('.dph-signal dt').count()) {
              assert(await panel.locator('.dph-signal dt').evaluateAll(nodes => nodes.every(node => parseFloat(getComputedStyle(node).fontSize) >= 13)),
                'Signal labels are readable without browser zoom');
            }
          }
        }
        await shell.getByRole('tab', { name: 'Holiday', exact: true }).click();
        assert.equal(await shell.locator('#tuiPhSignal-booking').isVisible(), true, 'Travel values remain accessible via tabs');
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
    await chooseSignal(frame, 'booking', 'Booked');
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
    await chooseSignal(frame, 'booking', 'Dreaming');
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
    await shell.exposeFunction('ingestFixtureAbandonment', payload => {
      assert.equal(payload.renderDecisions, false);
      assert.equal(payload.personalization.defaultPersonalizationEnabled, false);
      const xdm = payload.xdm;
      assert.equal(xdm.eventType, 'abandoned.search');
      assert.equal(xdm.identityMap.Email[0].id, fixture.profileEmail);
      assert.equal(xdm.identityMap.ECID[0].id, '12345678901234567890');
      assert.equal(xdm._demoemea.identification.core.ecid, xdm.identityMap.ECID[0].id);
      assert.equal(xdm._demoemea.identification.core.email, fixture.profileEmail);
      assert.equal(xdm.web.webPageDetails.viewName, 'TUI Decisioning');
      assert.equal(xdm._demoemea.airlineCustomer, undefined, 'Profile flag is not sent as an event field');
      assert.equal(payload.edgeConfigOverrides.datastreamId, '46677fd7-9db0-4f16-898c-b424d0245c38');
      const rows = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
        const path = prefix ? prefix + '.' + key : key;
        return child && typeof child === 'object' ? rows(child, path) : [{ path, value: child }];
      });
      pendingAbandonments.push({ availableAt: Date.now() + 1500, event: {
        id: 'ingested-abandonment-' + Date.now(), timestamp: Date.now(), eventType: xdm.eventType, rows: rows(xdm),
      } });
    });
    await shell.evaluate(() => {
      window.fixtureAbandonments = [];
      window.DemoTagsInjection.ensureAlloyReady = async () => window.alloy;
      if (typeof window.DemoLabEdgeConfig.edgeConfigOverrides !== 'function' ||
          window.DemoTagsInjection.edgeConfigOverrides !== undefined) throw new Error('Unexpected shared Tags API contract');
      window.AepLabEnvBarPrefs.writeMap('siteCloneBcDatastreamIdBySandbox',
        { kirkham: '46677fd7-9db0-4f16-898c-b424d0245c38' });
      window.sendFixtureAbandonment = async options => {
        window.fixtureAbandonments.push(options);
        if (window.fixtureAbandonmentFailure) throw new Error('Fixture abandonment transport failed');
        await window.ingestFixtureAbandonment(options);
        return {};
      };
      window.alloy = async (command, options) => {
        if (command === 'getIdentity') return { identity: { ECID: '12345678901234567890' } };
        if (command === 'sendEvent' && options.xdm.eventType === 'abandoned.search') return window.sendFixtureAbandonment(options);
        throw new Error('Unexpected SDK command before explicit Run: ' + command);
      };
    });
    const applyScenario = async index => {
      await frame.locator('#scenario-pills button').nth(index).click();
      await shell.locator('#tuiApplyProfile').click();
      await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Profile changes confirmed.'));
    };
    await frame.locator('#scenario-pills button').nth(2).click();
    assert.equal(await shell.evaluate(() => window.fixtureAbandonments.length), 0, 'Scenario selection alone never sends an event');
    rejectGeneric = true;
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Fixture rejected generic dataflow'));
    assert.equal(await shell.evaluate(() => window.fixtureAbandonments.length), 0, 'Partial snapshot acceptance defers tracking');
    rejectGeneric = false;
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Apply staged changes before Run.'));
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Profile changes confirmed.'));
    assert.equal(await shell.evaluate(() => window.fixtureAbandonments.length), 1, 'Resuming partial Apply sends exactly one captured abandonment');
    await shell.waitForFunction(() => window.DemoProfileDrawer.getLastLookedUpProfile().events.some(event => event.eventType === 'abandoned.search'));
    assert.match(await shell.locator('#profileDrawerEvents').innerText(), /abandon/i, 'Delayed ingestion appears in the actual events list without refresh');
    const abandonmentIcon = shell.locator('#profileDrawerEvents .aep-profile-drawer-event-thumb--search-abandon');
    assert(await abandonmentIcon.locator('svg circle').count() > 0, 'Abandoned search renders its local circle-and-cross icon');
    assert.equal(await abandonmentIcon.first().evaluate(node => getComputedStyle(node).backgroundImage), 'none',
      'Abandoned-search icon has no external artwork dependency');
    await shell.evaluate(() => document.body.classList.add('mod-demo-page--profile-open'));
    await shell.locator('#profileDrawerEventsStoryOpen').click();
    for (const view of ['A', 'B', 'C']) {
      await shell.locator('[data-dpj-view="' + view + '"]').click();
      const card = shell.locator('.dpj-root button[data-dpj-sel]').filter({ hasText: /abandon/i });
      assert(await card.locator('.dpj-ico svg circle').count() > 0,
        'Journey ' + view + ' reuses the abandonment SVG: ' + await shell.locator('.dpj-root').innerText());
    }
    await shell.keyboard.press('Escape');
    await shell.evaluate(() => document.body.classList.remove('mod-demo-page--profile-open'));
    await shell.mouse.move(700, 100);
    assert.equal(await shell.evaluate(() => window.DemoProfileDrawer.getLastLookedUpProfile().emailSendsLast24h), 0);
    await applyScenario(2);
    assert.equal(await shell.evaluate(() => window.fixtureAbandonments.length), 1, 'Applying unchanged Yes does not duplicate the event');
    await applyScenario(0);
    assert.equal(await shell.evaluate(() => window.fixtureAbandonments.length), 1, 'Resetting abandoned search sends no event');
    await shell.evaluate(() => { window.fixtureAbandonmentFailure = true; });
    await frame.locator('#scenario-pills button').nth(2).click();
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('abandoned.search tracking failed'));
    assert.equal(await shell.evaluate(() => window.fixtureAbandonments.length), 2);
    await shell.waitForTimeout(1800);
    assert.equal(await shell.evaluate(() => window.fixtureAbandonments.length), 2, 'Uncertain send failure is never automatically retried');
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('No automatic retry.'));
    await shell.evaluate(() => { window.fixtureAbandonmentFailure = false; });
    await applyScenario(2);
    assert.equal(await shell.evaluate(() => window.fixtureAbandonments.length), 2, 'Explicit reapply of unchanged Yes does not retry an uncertain send');
    await applyScenario(0);
    await applyScenario(2);
    assert.equal(await shell.evaluate(() => window.fixtureAbandonments.length), 3, 'A new No-to-Yes transition can send a new event');
    await applyScenario(0);
    let receivedDisplay = 0;
    const pendingDisplays = [];
    await shell.exposeFunction('ingestFixtureDisplay', xdm => {
      const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
        const path = prefix ? prefix + '.' + key : key;
        return child && typeof child === 'object' ? flatten(child, path) : [{ path, value: child }];
      });
      pendingDisplays.push({ availableAt: Date.now() + 1500, event: {
        id: 'ingested-live-display-' + ++receivedDisplay, timestamp: Date.now(),
        eventType: xdm.eventType, rows: flatten(xdm),
      } });
    });
    await shell.route('**/api/profile/events?*', async route => {
      for (let i = pendingDisplays.length - 1; i >= 0; i--) {
        if (pendingDisplays[i].availableAt <= Date.now()) events.unshift(pendingDisplays.splice(i, 1)[0].event);
      }
      await route.fallback();
    });
    await shell.evaluate(() => {
      window.fixtureDisplayEvents = [];
      window.fixtureDecisionRequests = [];
      window.fixtureIdentityReads = 0;
      window.fixtureIdentityReadsAtRequest = 0;
      window.fixtureIdentityReadsAtDisplay = 0;
      window.fixtureDatastream = '46677fd7-9db0-4f16-898c-b424d0245c38';
      window.AepLabEnvBarPrefs.writeMap('siteCloneBcDatastreamIdBySandbox', { kirkham: window.fixtureDatastream });
      window.DemoTagsInjection.ensureAlloyReady = async () => window.alloy;
      window.alloy = async (command, options) => {
        if (command === 'getIdentity') {
          window.fixtureIdentityReads++;
          return { identity: { ECID: window.fixtureIdentityMode === 'missing' ? '' : '12345678901234567890' } };
        }
        if (command !== 'sendEvent') throw new Error('Unexpected SDK command: ' + command);
        if (options.xdm.eventType === 'abandoned.search') return window.sendFixtureAbandonment(options);
        if (options.xdm.eventType === 'decisioning.propositionDisplay') {
          window.fixtureIdentityReadsAtDisplay = window.fixtureIdentityReads;
          const request = window.fixtureDecisionRequests.at(-1);
          if (JSON.stringify(options.xdm.identityMap) !== JSON.stringify(request.xdm.identityMap) ||
            options.xdm._demoemea?.identification?.core?.ecid !== request.xdm.identityMap.ECID[0].id ||
            options.edgeConfigOverrides.datastreamId !== request.edgeConfigOverrides.datastreamId) {
            throw new Error('Display did not preserve the requested visitor and datastream');
          }
          window.fixtureDisplayEvents.push({ command, options });
          if (window.fixtureDisplayFailure) throw new Error('Fixture display transport failed');
          await window.ingestFixtureDisplay(options.xdm);
          return {};
        } else {
          if (options.renderDecisions !== false || options.personalization.sendDisplayEvent !== false) {
            throw new Error('Manual display is required');
          }
          if (!options.xdm._demoemea?.identification?.core?.ecid) throw new Error('Required event schema ECID missing');
          window.fixtureDecisionRequests.push(options);
          window.fixtureIdentityReadsAtRequest = window.fixtureIdentityReads;
          if (window.fixtureDecisionMode === 'empty') return { propositions: [] };
          if (window.fixtureDecisionMode === 'wait') {
            await new Promise(resolve => { window.releaseFixtureDecision = resolve; });
          }
          const next = window.fixtureDecisionMode === 'wait';
          return {
            propositions: [{ id: 'fixture-proposition', scope: location.origin + '/#hero-banner',
              scopeDetails: { activity: { id: 'fixture-policy' } },
              items: [{ id: 'fixture-item', name: 'Returned fixture offer',
                itemSelection: { selectionDetail: { strategyName: 'Returned fixture strategy' } },
                schema: 'https://ns.adobe.com/personalization/json-content-item',
                data: { imageURL: location.origin + '/profile-viewer/tui-decisioning-assets/' +
                  (window.fixtureDecisionMode === 'broken' ? 'missing.jpg' : next ? 'mexico.jpg?next-image=1' : 'crete.jpg'),
                  title: next ? 'Next live offer' : 'Fixture live offer',
                  fullDescription: next ? 'Next returned copy' : 'Actual returned fixture copy' } }] }],
          };
        }
      };
    });
    await shell.evaluate(() => {
      document.getElementById('siteCloneDecisioningEnabledToggle').checked = false;
    });
    const readsWhileDisabled = shellCalls.filter(call => call.path === '/api/profile/table').length;
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Decisioning is disabled.'));
    assert.match(await shell.locator('#tuiLiveStatus').textContent(), /enable Decisioning/);
    assert.equal(shellCalls.filter(call => call.path === '/api/profile/table').length, readsWhileDisabled,
      'Disabled Decisioning gives actionable feedback before any profile request');
    assert.equal(await shell.evaluate(() => window.fixtureDecisionRequests.length), 0);
    assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), 0);
    await shell.evaluate(() => {
      const enabled = document.getElementById('siteCloneDecisioningEnabledToggle');
      enabled.checked = true;
      enabled.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const tableReadsBeforeRun = shellCalls.filter(call => call.path === '/api/profile/table').length;
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Live hero displayed'))
      .catch(async error => { throw new Error('Live status: ' + await shell.locator('#tuiLiveStatus').textContent(), { cause: error }); });
    assert.equal(await frame.locator('#email-preview .email-heading').textContent(), 'Fixture live offer');
    assert.equal(await frame.locator('#mobile-preview .app-offer-title').textContent(), 'Fixture live offer');
    assert.doesNotMatch(await shell.locator('#tuiLiveStatus').textContent(), /simulat|app concept|illustrat/i);
    assert.doesNotMatch(await frame.locator('body').innerText(), /simulat|app concept|illustrat/i);
    assert.equal(await frame.locator('#web-preview h3').textContent(), 'Fixture live offer');
    assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), 1, 'One attributed display across three views');
    const display = await shell.evaluate(() => window.fixtureDisplayEvents[0].options.xdm);
    assert.equal(display._demoemea.identification.core.ecid, display.identityMap.ECID[0].id,
      'Tenant event identity matches the original decision request, not a newly read browser identity');
    assert.equal(display.web.webPageDetails.viewName, 'TUI Decisioning');
    assert.equal(display._experience.decisioning.propositions[0].items[0].name, 'Returned fixture offer');
    const decisionRequest = await shell.evaluate(() => window.fixtureDecisionRequests.at(-1));
    assert.deepEqual(display.identityMap, decisionRequest.xdm.identityMap);
    assert.equal(display.identityMap.Email[0].id, fixture.profileEmail, 'The selected profile remains linked to the active visitor');
    assert.equal(decisionRequest.xdm._demoemea.identification.core.ecid, display.identityMap.ECID[0].id);
    assert.equal(shellCalls.filter(call => call.path === '/api/profile/table').length - tableReadsBeforeRun, 1,
      'One fresh runtime profile read covers consent and identity without a duplicate serial table request');
    assert(await shell.evaluate(() => window.fixtureIdentityReadsAtRequest >= 1), 'Decision resolves the SDK identity');
    assert.equal(await shell.evaluate(() => window.fixtureIdentityReadsAtDisplay),
      await shell.evaluate(() => window.fixtureIdentityReadsAtRequest), 'Display reuses the captured identity without another SDK read');
    const readOnlyBeforePoll = shellCalls.filter(call => call.path === '/api/profile/consent').length;
    const eventReadsBeforePoll = shellCalls.filter(call => call.path === '/api/profile/events').length;
    await shell.waitForFunction(() => window.DemoProfileDrawer.getLastLookedUpProfile().events.length === 5);
    await shell.waitForFunction(() => document.getElementById('profileDrawerEvents').textContent.includes('Returned fixture offer'));
    assert.match(await shell.locator('#profileDrawerEvents').innerText(), /Returned fixture strategy/);
    assert.equal(await shell.evaluate(() => window.DemoProfileDrawer.getLastLookedUpProfile().eventsStory[0].id), 'ingested-live-display-1');
    assert.equal(await shell.evaluate(() => window.DemoProfileDrawer.getLastLookedUpProfile().emailSendsLast24h), 0,
      'A decision display does not increment Messages Sent');
    assert(shellCalls.filter(call => call.path === '/api/profile/events').length > eventReadsBeforePoll,
      'Shared polling discovers delayed decision ingestion without clicking refresh');
    assert.equal(shellCalls.filter(call => call.path === '/api/profile/consent').length, readOnlyBeforePoll,
      'Events update without a slow full profile lookup');
    assert(shellCalls.filter(call => call.path === '/api/profile/events').slice(-2).every(call =>
      call.query.identifier === fixture.profileEmail && call.query.namespace === 'email' && call.query.sandbox === 'kirkham'),
      'Polling retains the loaded namespace, identifier and sandbox: ' +
      JSON.stringify(shellCalls.filter(call => call.path === '/api/profile/events').slice(-2).map(call => call.query)));
    const refreshProbe = await shell.evaluate(async () => {
      await window.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
      const original = window.fetch, calls = [];
      window.fetch = (url, options) => {
        if (String(url).startsWith('/api/profile/events')) calls.push(options?.cache);
        return original(url, options);
      };
      try {
        await Promise.all(Array.from({ length: 3 }, () => window.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile()));
        const coalesced = calls.slice();
        window.dispatchEvent(new Event('focus'));
        await window.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
        return { coalesced, resumed: calls.slice(coalesced.length) };
      } finally { window.fetch = original; }
    });
    assert.deepEqual(refreshProbe.coalesced, ['no-store'], 'Concurrent refreshes share one uncached event request');
    assert.deepEqual(refreshProbe.resumed, ['no-store'], 'Focus resumes activity immediately using the same refresh path');
    const savedEvents = events.slice();
    events.unshift(...Array.from({ length: 12 }, (_, index) => ({
      id: 'timeline-layout-' + index, timestamp: Date.now() + 100 + index,
      eventType: 'decisioning.propositionDisplay', channel: 'web', rows: [
        { path: '_experience.decisioning.propositions.0.items.0.name', value: 'Fixture holiday offer ' + index },
        { path: '_experience.decisioning.propositions.0.items.0.itemSelection.selectionDetail.strategyName', value: 'Fixture selection strategy ' + index },
      ],
    })));
    await shell.evaluate(() => window.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile());
    await shell.evaluate(() => document.body.classList.add('mod-demo-page--profile-open'));
    assert.equal(await shell.locator('.aep-event-filters').count(), 0, 'Last Events has no filter options');
    assert.equal(await shell.locator('.aep-profile-drawer-events-heading-title').textContent(), 'Last Events');
    assert.equal(await shell.locator('.aep-event-pager').count(), 0, 'Timeline has no page numbers or navigation');
    assert.deepEqual(await shell.locator('#profileDrawerEvents .aep-profile-drawer-event-title').allTextContents(),
      [11, 10, 9, 8, 7].map(index => 'Fixture holiday offer ' + index), 'Only the five latest events render');
    assert(await shell.evaluate(() => window.DemoProfileDrawer.getLastLookedUpProfile().eventsStory.length > 5),
      'Full journey history remains available separately');
    assert(await shell.locator('#profileDrawerEvents').evaluate(node =>
      node.scrollHeight <= node.clientHeight + 1 && [...node.children].filter(card => !card.hidden).every(card =>
        card.getBoundingClientRect().bottom <= node.getBoundingClientRect().bottom + 1)),
    'All five decision cards fit completely without clipping or scrolling: ' +
      JSON.stringify(await shell.locator('#profileDrawerEvents').evaluate(node => ({
        height: node.clientHeight, scroll: node.scrollHeight,
        cards: [...node.children].map(card => card.getBoundingClientRect().height),
      }))));
    const consentReadsBeforeEmail = shellCalls.filter(call => call.path === '/api/profile/consent').length;
    const emailAvailableAt = Date.now();
    events.unshift({ id: 'timeline-email', timestamp: Math.max(Date.now(), ...events.map(event => event.timestamp)) + 1, eventType: 'message.feedback', rows: [
      { path: '_experience.customerJourneyManagement.emailChannelContext.namespace', value: 'email' },
      { path: '_experience.customerJourneyManagement.messageDeliveryFeedback.feedbackStatus', value: 'sent' },
    ] });
    await shell.waitForFunction(() => window.DemoProfileDrawer.getLastLookedUpProfile().emailSendsLast24h === 1,
      null, { timeout: 3000 });
    assert(Date.now() - emailAvailableAt < 3000, 'New email activity updates within the one-second poll plus fixture response time');
    await shell.waitForFunction(() => [...document.querySelectorAll('#profileDrawerEvents .aep-profile-drawer-event-sub')]
      .some(node => node.textContent.includes('message.feedback')));
    assert.equal(await shell.locator('#profileDrawerEvents .aep-profile-drawer-event-item').count(), 5);
    assert.equal(await shell.locator('#profileDrawerEvents .aep-event-decision').count(), 5,
      'Mixed event types share the decision-card design');
    assert.deepEqual((await shell.locator('#profileDrawerEvents .aep-profile-drawer-event-title').allTextContents()).slice(1),
      [11, 10, 9, 8].map(index => 'Fixture holiday offer ' + index),
      'New email joins the latest four decisions in timestamp order');
    assert.equal(await shell.locator('#profileDrawerEvents .aep-profile-drawer-event-item').first()
      .locator('.aep-profile-drawer-event-decision-detail').count(), 0, 'Email has no invented strategy metadata');
    assert(await shell.locator('#profileDrawerEvents').evaluate(node =>
      node.scrollHeight <= node.clientHeight + 1 && [...node.children].every(card =>
        card.getBoundingClientRect().bottom <= node.getBoundingClientRect().bottom + 1)),
    'Five mixed event cards fit without clipping or scrolling');
    assert.equal(shellCalls.filter(call => call.path === '/api/profile/consent').length, consentReadsBeforeEmail,
      'Email totals update from event polling without another profile lookup');
    audienceFixture = { realized: [{ segmentId: 'joined-audience', name: 'Fixture abandoned search audience' },
      ...audienceFixture.realized], exited: [] };
    const audienceReadsBeforeJoin = shellCalls.filter(call => call.path === '/api/profile/audiences').length;
    const audienceJoinedAt = Date.now();
    await shell.waitForFunction(() => [...document.querySelectorAll('#profileDrawerAudiences li')]
      .some(node => node.textContent === 'Fixture abandoned search audience'), null, { timeout: 8000 });
    const audienceWaitMs = Date.now() - audienceJoinedAt;
    assert(audienceWaitMs < 8000, 'A newly joined audience appears from polling');
    assert.equal(shellCalls.filter(call => call.path === '/api/profile/consent').length, consentReadsBeforeEmail,
      'Audience membership refreshes without another profile lookup');
    assert(shellCalls.filter(call => call.path === '/api/profile/audiences').length - audienceReadsBeforeJoin
      <= Math.ceil(audienceWaitMs / 5000) + 1, 'Audience polling is throttled below the one-second event cadence');
    await shell.route('**/api/profile/audiences?*', route => route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } }), { times: 1 });
    await shell.evaluate(() => window.dispatchEvent(new Event('focus')));
    await shell.waitForTimeout(300);
    assert.equal(await shell.locator('#profileDrawerAudiences li', { hasText: 'Fixture abandoned search audience' }).count(), 1,
      'A failed audience refresh retains the last successful membership');
    await shell.route('**/api/profile/events?*', route => route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } }), { times: 1 });
    await shell.evaluate(() => window.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile());
    assert.equal(await shell.evaluate(() => window.DemoProfileDrawer.getLastLookedUpProfile().emailSendsLast24h), 1,
      'A failed refresh retains last successful event data and totals');
    events.splice(0, events.length, ...savedEvents);
    await shell.evaluate(() => window.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile());
    assert.equal(await shell.locator('#profileDrawerEvents .aep-profile-drawer-event-item').count(), 5,
      'Last Events continues to show only the latest five events');
    await shell.evaluate(() => {
      document.activeElement?.blur();
      document.body.classList.remove('mod-demo-page--profile-open');
    });
    await shell.mouse.move(700, 100);
    const contentSnapshot = () => shell.evaluate(() => {
      const doc = document.getElementById('tui-visualiser').contentDocument;
      return ['email-preview', 'mobile-preview', 'web-preview'].map(id => doc.getElementById(id).innerHTML);
    });
    const firstContent = await contentSnapshot();
    await shell.evaluate(() => {
      const doc = document.getElementById('tui-visualiser').contentDocument;
      window.fixtureContentChanges = 0;
      window.fixtureContentObserver = new MutationObserver(() => window.fixtureContentChanges++);
      for (const id of ['email-preview', 'mobile-preview', 'web-preview']) {
        window.fixtureContentObserver.observe(doc.getElementById(id), { childList: true, subtree: true, attributes: true, characterData: true });
      }
    });
    for (let index = 0; index < 7; index++) {
      await frame.locator('#scenario-pills button').nth(index).click();
      assert.deepEqual(await contentSnapshot(), firstContent, 'Scenario preserves the displayed AEP image and text');
    }
    if (!await frame.locator('details[data-group="Holiday"]').evaluate(details => details.open)) {
      await frame.locator('details[data-group="Holiday"] summary').click();
    }
    await frame.locator('#signal-days').fill('');
    assert.deepEqual(await contentSnapshot(), firstContent, 'Invalid staged signals do not replace the last decision');
    await frame.locator('#signal-days').fill('30');
    await frame.locator('#reset').click();
    assert.deepEqual(await contentSnapshot(), firstContent, 'Reset only stages signals');
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Profile changes confirmed.'));
    assert.deepEqual(await contentSnapshot(), firstContent, 'Apply/readback preserves the last AEP content');
    for (const channel of ['email', 'mobile', 'web']) {
      await frame.locator('#tab-' + channel).click();
      assert.deepEqual(await contentSnapshot(), firstContent, 'Switching channels retains the same returned content');
    }
    await shell.evaluate(() => window.EnvBarCompact.openOverlay());
    await shell.locator('#queryProfileBtn').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Test profile loaded.'));
    await shell.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await shell.mouse.move(700, 100);
    assert.deepEqual(await contentSnapshot(), firstContent, 'Same-context lookup retains the displayed result');
    for (const mode of ['empty', 'broken']) {
      await shell.evaluate(mode => { window.fixtureDecisionMode = mode; }, mode);
      await shell.locator('#tuiRunDecision').click();
      await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('No automatic retry.'));
      assert.deepEqual(await contentSnapshot(), firstContent, 'Failed or empty Run retains the last AEP result');
      assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), 1, 'Failed Run sends no display');
    }
    let releaseImage;
    const imageReady = new Promise(resolve => { releaseImage = resolve; });
    await shellContext.route('**/*next-image=1', async route => {
      await imageReady;
      await route.fulfill({ contentType: 'image/jpeg',
        body: await fs.readFile(path.join(root, 'profile-viewer', 'tui-decisioning-assets', 'mexico.jpg')) });
    });
    await shell.evaluate(() => { window.fixtureDecisionMode = 'wait'; });
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => !!window.releaseFixtureDecision);
    assert.deepEqual(await contentSnapshot(), firstContent, 'Run preserves content while waiting for AEP');
    const imageRequest = shell.waitForRequest('**/*next-image=1');
    await shell.evaluate(() => window.releaseFixtureDecision());
    await imageRequest;
    assert.deepEqual(await contentSnapshot(), firstContent, 'Returned content is not mounted until its image loads');
    assert.equal(await shell.evaluate(() => window.fixtureContentChanges), 0, 'No intermediate fallback or DOM replacement during staging, Apply or pending Run');
    releaseImage();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Live hero displayed'));
    assert.equal(await frame.locator('#email-preview .email-heading').textContent(), 'Next live offer');
    assert.equal(await frame.locator('#mobile-preview .app-offer-title').textContent(), 'Next live offer');
    assert.equal(await frame.locator('#web-preview h3').textContent(), 'Next live offer');
    assert.equal(await frame.locator('.app-offer-copy p').textContent(), 'Next returned copy');
    assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), 2, 'Successful new result sends one new display');
    await shell.evaluate(() => window.fixtureContentObserver.disconnect());
    fixture.rows.find(row => row.path === 'consents.marketing.email.val').value = 'n';
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Actual loaded consent'));
    assert.equal(await frame.locator('#email-preview img').count(), 0, 'Missing consent removes stale live content');
    assert.equal(await frame.locator('#mobile-preview img,#mobile-preview .preview-cta').count(), 0, 'Consent removes stale app offer imagery and CTA');
    assert.equal(await frame.locator('.app-nav button').count(), 4, 'App shell survives the consent hold');
    assert.equal(await frame.locator('#eligible-items .nba-card').count(), 0, 'Actual consent hold clears stale eligible NBA cards');
    assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), 2, 'Consent hold sends no display');
    await frame.locator('#scenario-pills button').nth(6).click();
    assert.equal(await frame.locator('#email-preview img,#mobile-preview img,#web-preview img').count(), 0,
      'Staging a scenario cannot resurrect content after an actual consent hold');
    if (!await frame.locator('details[data-group="Consent"]').evaluate(details => details.open)) {
      await frame.locator('details[data-group="Consent"] summary').click();
    }
    await chooseSignal(frame, 'emailConsent', 'y');
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Profile changes confirmed.'));
    await shell.evaluate(() => { window.fixtureDecisionMode = ''; });
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Live hero displayed'));
    assert.equal(await frame.locator('#email-preview .email-heading').textContent(), 'Fixture live offer',
      'A successful fresh Run restores content after consent is confirmed again');
    let releaseStaleImage;
    const staleImageReady = new Promise(resolve => { releaseStaleImage = resolve; });
    await shellContext.route('**/*stale-image=1', async route => {
      await staleImageReady;
      await route.fulfill({ contentType: 'image/jpeg',
        body: await fs.readFile(path.join(root, 'profile-viewer', 'tui-decisioning-assets', 'crete.jpg')) });
    });
    const staleRequest = shell.waitForRequest('**/*stale-image=1');
    await shell.evaluate(() => {
      document.getElementById('tui-visualiser').contentWindow.TuiDecisioningVisualiser.setDecision({
        url: location.origin + '/profile-viewer/tui-decisioning-assets/crete.jpg?stale-image=1',
        title: 'Stale result', description: 'Must never appear',
      }).then(() => { window.fixtureStaleResult = 'accepted'; }, error => { window.fixtureStaleResult = error.message; });
    });
    await staleRequest;
    await shell.evaluate(() => window.EnvBarCompact.openOverlay());
    await shell.locator('#customerEmail').fill('another@example.invalid');
    await shell.waitForFunction(() => document.getElementById('tuiPhSignal-booking').textContent === 'Not loaded');
    assert.equal(await frame.locator('#email-preview img,#mobile-preview img,#web-preview img').count(), 0,
      'Identity changes clear the previous recipient content without a local fallback');
    releaseStaleImage();
    await shell.waitForFunction(() => !!window.fixtureStaleResult);
    assert.match(await shell.evaluate(() => window.fixtureStaleResult), /context changed/);
    assert.equal(await frame.locator('#email-preview img,#mobile-preview img,#web-preview img').count(), 0,
      'Late image load cannot restore a previous identity decision');
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
    await shell.evaluate(() => window.AepGlobalSandbox.setSelected('kirkham'));
    await shell.waitForTimeout(200);
    await shell.evaluate(() => window.EnvBarCompact.openOverlay());
    fixture.rows = fixture.rows.filter(row => !/^_demoemea\.(airlineCustomer|travelReservations)\./.test(row.path));
    await shell.locator('#queryProfileBtn').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Test profile loaded.'));
    await shell.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
    await shell.mouse.move(700, 100);
    if (!await frame.locator('details[data-group="Holiday"]').evaluate(details => details.open)) {
      await frame.locator('details[data-group="Holiday"] summary').click();
    }
    await chooseSignal(frame, 'booking', 'Booked');
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Profile changes confirmed.'));
    assert.deepEqual(shellCalls.filter(call => call.path === '/api/profile/update').at(-1).body.updates,
      [{ path: 'airlineCustomer.journeyStage', value: 'Booked', valueType: 'string' }],
      'Configured writable dataflow allows first-time Travel population with no existing rows');
    const configuredTenant = fixture.industries.generic.xdmKey;
    for (const tenant of [null, '_repo', 'invalid tenant']) {
      fixture.industries.generic.xdmKey = tenant;
      const before = await shell.evaluate(() => window.fixtureDisplayEvents.length);
      await shell.locator('#tuiRunDecision').click();
      await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.startsWith('Live hero displayed'));
      assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), before + 1,
        'Profile dataflow metadata is not used as the event schema tenant');
      const xdm = await shell.evaluate(() => window.fixtureDisplayEvents.at(-1).options.xdm);
      assert.equal(xdm._demoemea.identification.core.ecid, xdm.identityMap.ECID[0].id,
        'The reviewed event tenant is independent of missing or invalid Generic profile configuration');
      assert.equal(Object.hasOwn(xdm, '_repo'), false, 'Reserved XDM roots cannot receive tenant enrichment');
      assert.deepEqual(Object.keys(xdm.identityMap), ['Email', 'ECID'],
        'Display preserves the selected email plus the captured browser visitor');
      assert.equal(await frame.locator('#email-preview .email-heading').textContent(), 'Fixture live offer');
    }
    fixture.industries.generic.xdmKey = configuredTenant;
    await shell.evaluate(() => { window.fixtureIdentityMode = 'missing'; });
    const beforeMissingIdentity = await shell.evaluate(() => window.fixtureDisplayEvents.length);
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('browser ECID was not returned'));
    assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), beforeMissingIdentity,
      'Missing SDK identity blocks before requesting a decision, not after displaying content');
    await shell.evaluate(() => { window.fixtureIdentityMode = ''; window.fixtureDisplayFailure = true; });
    const beforeFailure = await shell.evaluate(() => window.fixtureDisplayEvents.length);
    await shell.locator('#tuiRunDecision').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Fixture display transport failed'));
    await shell.waitForTimeout(1200);
    assert.equal(await shell.evaluate(() => window.fixtureDisplayEvents.length), beforeFailure + 1,
      'An uncertain display send is attempted only once, never retried by polling');
    await shell.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    await shell.locator('#tui-visualiser').contentFrame().locator('html[data-aep-theme="dark"]').waitFor();
    assert.equal(await frame.locator('html').getAttribute('data-aep-theme'), 'dark');
    await shell.setViewportSize({ width: 390, height: 844 });
    assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert(shellCalls.filter(c => c.method !== 'GET').every(c => c.path === '/api/aep' || c.path === '/api/profile/update'),
      'Only explicit Apply writes a profile');
    assert.deepEqual(errors, []);
    await shellContext.close();
    console.log(`TUI browser checks passed: 7 scenario buttons, ${model.scenarios.length} regression cases, ranked NBA cards, 3 channels, 2 themes; abandonment Apply/event polling, legacy ownership and first-time snapshots verified; no live requests.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
