'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const model = require('../web/profile-viewer/tui-decisioning-model.js');
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
    const shellCalls = [];
    await shellContext.route('**/*', async route => {
      const request = route.request();
      const parsed = new URL(request.url());
      assert.equal(parsed.origin, origin, 'Shell never calls external services');
      if (parsed.pathname.startsWith('/api/')) {
        shellCalls.push({ path: parsed.pathname, method: request.method() });
        await route.fulfill({ json: { ok: false, enabled: false, found: false } });
      } else await route.continue();
    });
    const shell = await shellContext.newPage();
    shell.on('pageerror', error => errors.push(error.message));
    await shell.goto(origin + '/profile-viewer/tui-decisioning-demo.html?channel=web');
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
    await shell.locator('#theme-toggle').click();
    await shell.locator('#tui-visualiser').contentFrame().locator('html[data-aep-theme="dark"]').waitFor();
    assert.equal(await frame.locator('html').getAttribute('data-aep-theme'), 'dark');
    await shell.locator('#menu-toggle').click();
    assert.equal(await shell.locator('#menu-toggle').getAttribute('aria-expanded'), 'true');
    await shell.keyboard.press('Escape');
    assert.equal(await shell.locator('#menu-toggle').getAttribute('aria-expanded'), 'false');
    await shell.setViewportSize({ width: 390, height: 844 });
    assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert(shellCalls.every(c => c.method === 'GET'), 'Shared navigation may read lab configuration, never write');
    assert.deepEqual(errors, []);
    await shellContext.close();
    console.log(`TUI browser checks passed: ${model.scenarios.length} scenarios, 3 channels, 2 themes, 2 viewport widths; shell history/theme/menu verified; no live requests.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
