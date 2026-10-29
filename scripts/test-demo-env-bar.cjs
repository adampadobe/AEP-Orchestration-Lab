'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../web');
const screenshotPages = new Set(['sky-demo.html', 'etihad-demo.html', 'riyadh-air-demo.html',
  'social/linkedin.html', 'etihad-mobile-demo.html', 'fnb-demo.html', 'call-center-demo.html', 'vuse-italia-demo.html']);

async function consumers(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await consumers(filename));
    else if (entry.name.endsWith('.html') && /<script[^>]*src=["'][^"']*shared\/env-bar\.js/.test(await fs.readFile(filename, 'utf8'))) files.push(filename);
  }
  return files;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'profile-viewer/shared/env-bar-versions.json'), 'utf8'));
  const files = await consumers(path.join(root, 'profile-viewer'));
  const server = http.createServer(async (req, res) => {
    const filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://fixture').pathname));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(filename);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(filename)];
      res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(body);
    } catch (error) {
      const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
      if (!missing) console.error(error);
      res.writeHead(missing ? 404 : 500).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const filename of files) {
      const relative = path.relative(path.join(root, 'profile-viewer'), filename).split(path.sep).join('/');
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) { await route.fulfill({ contentType: 'text/javascript', body: '' }); return; }
        if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
        let data = {};
        if (url.pathname === '/api/env-bar-config') data = { ok: true, found: false, config: null };
        else if (url.pathname === '/api/aep' || url.pathname === '/api/sandboxes') data = { sandboxes: [{ name: 'apalmer', title: 'apalmer' }] };
        else if (url.pathname === '/api/events/generator-targets') data = { targets: [{ id: 'lab-event-tool-edge', label: 'Lab Event tool Edge', transport: 'edge', dataStreamId: 'fixture-datastream' }] };
        else if (url.pathname === '/api/tags/reactor') data = { data: [] };
        else if (url.pathname === '/api/lab/user-sandbox-data') data = { keys: {} };
        await route.fulfill({ json: data });
      });
      await context.addInitScript(() => {
        localStorage.setItem('aepGlobalSandboxName', 'apalmer');
        window.firebase = { apps: [{}], auth: () => ({
          currentUser: null, onAuthStateChanged(fn) { fn(null); }, onIdTokenChanged() {},
          signInAnonymously: async () => ({ user: null }),
        }) };
      });
      const page = await context.newPage();
      try {
        await page.goto(origin + '/profile-viewer/' + relative, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.envBar && window.envBarConfig, null, { timeout: 10000 });
        await page.evaluate(() => window.envBar.ready());
        const config = await page.evaluate(() => window.envBar.getConfig());
        assert(config.prefix, relative + ': retained demo prefix');
        assert.equal(await page.evaluate(() => window.envBar.MANIFEST_VERSION), manifest.manifestVersion, relative);
        assert.equal(await page.locator('script[src*="shared/env-bar.js"]').count(), 1, relative + ': one loader');
        const mode = config.mode;
        assert.equal(await page.locator('#aepLabNewVisitorBtn').count(), 1, relative + ': shared visitor reset action');
        assert.equal(await page.evaluate(() => typeof window.AepDemoVisitorReset.reset), 'function', relative + ': one shared reset controller');
        assert.equal(await page.evaluate(() => typeof window.AepDemoVisitorAdapters.register), 'function', relative + ': cross-demo visitor cleanup loaded');
        assert.equal(await page.evaluate(() => typeof window.envBar.resetVisitor), 'function', relative + ': reset API');
        if (mode === 'shell' || mode === 'journey') {
          assert.equal(await page.locator('#aepDemoEnvSection').count(), 1, relative + ': one shared configuration');
          assert.equal(await page.locator('.lab-env-toolbar').count(), 1, relative + ': one toolbar');
          assert.equal(await page.locator('link[href*="shared/demo-env-bar-spectrum.css"]').count(), 1, relative + ': shared Spectrum styling');
          await page.evaluate(() => window.envBar.ready());
          assert.equal(await page.locator('#aepDemoEnvSection').count(), 1, relative + ': repeat ready is idempotent');
          assert.equal(await page.locator('.lab-env-menu-control button').count(), 1, relative + ': shared menu control');
          assert.equal(await page.evaluate(() => document.body.hasAttribute('data-lab-menu-user-open')), false, relative + ': menu initially closed');
        }
        if (screenshotPages.has(relative)) {
          for (const theme of ['light', 'dark']) {
            for (const width of [1440, 390]) {
              await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
              await page.evaluate((value) => {
                document.documentElement.setAttribute('data-aep-theme', value);
                if (window.EnvBarCompact) window.EnvBarCompact.closeOverlay({ force: true });
              }, theme);
              if ((mode === 'shell' || mode === 'journey') && !config.settingsButtonOnly) {
                const toolbar = page.locator('.lab-env-toolbar');
                await toolbar.waitFor({ state: 'visible' });
                const box = await toolbar.boundingBox();
                assert(box.width <= width + 1, relative + ': toolbar fits ' + width + 'px');
                assert(box.height > 0 && box.height < 200, relative + ': compact shared toolbar');
              }
              if (mode === 'shell' || mode === 'journey') {
                await page.waitForFunction(() => {
                  const sidebar = document.querySelector('.dashboard-sidebar');
                  return !sidebar || sidebar.getBoundingClientRect().right <= 1;
                }, null, { timeout: 2000 });
                const sidebar = await page.locator('.dashboard-sidebar').boundingBox();
                assert(sidebar === null || sidebar.x + sidebar.width <= 1, relative + ': closed menu stays offscreen');
              }
              if (process.env.ENV_BAR_SCREENSHOTS) {
                await fs.mkdir(process.env.ENV_BAR_SCREENSHOTS, { recursive: true });
                await page.screenshot({ path: path.join(process.env.ENV_BAR_SCREENSHOTS,
                  relative.replace(/[/.]/g, '-') + '-' + theme + '-' + width + '.png'), animations: 'disabled' });
              }
              if (relative === 'riyadh-air-demo.html') {
                await page.evaluate(() => window.EnvBarCompact.openOverlay({ force: true }));
                await page.locator('#aepLabMenuToggleBtn').click();
                assert.equal(await page.evaluate(() => document.body.hasAttribute('data-lab-menu-user-open')), true);
                await page.locator('#aepLabMenuToggleBtn').click();
                assert.equal(await page.evaluate(() => document.body.hasAttribute('data-lab-menu-user-open')), false);
                await page.evaluate(() => window.EnvBarCompact.closeOverlay({ force: true }));
              }
              if (relative === 'vuse-italia-demo.html') {
                const launcher = page.locator('#vusePresenterLauncher');
                const style = await launcher.evaluate((element) => {
                  const css = getComputedStyle(element), box = element.getBoundingClientRect();
                  return { radius: css.borderRadius, width: box.width, height: box.height, x: box.x, right: box.right };
                });
                assert.equal(style.radius, '50%', 'Vuse presenter matches circular midrail controls');
                assert.equal(style.width, style.height);
                assert(style.x >= 0 && style.right <= width, 'Vuse presenter fits viewport');
                assert.equal(await launcher.locator('svg').count(), 1, 'Same presentation icon as Riyadh Air');
              }
            }
          }
        }
        if (relative === 'vuse-italia-demo.html') {
          await page.evaluate(() => {
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'aep-demo-visitor-invalidated-v1',
              newValue: JSON.stringify({ id: 'fixture-other-tab', oldEcid: '1'.repeat(38), orgId: 'fixture' }),
            }));
          });
          await page.locator('#aepLabVisitorResetStatus').waitFor({ state: 'visible' });
          assert.equal(await page.evaluate(() => window.AepDemoVisitorReset.isBlocked()), true);
          assert.equal(await page.locator('iframe:not([inert])').count(), 0, 'Invalidated iframe cannot receive interaction');
          const submitted = await page.evaluate(() => {
            const form = document.createElement('form');
            document.body.appendChild(form);
            const event = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(event);
            form.remove();
            return !event.defaultPrevented;
          });
          assert.equal(submitted, false, 'Invalidated visitor cannot submit via keyboard');
          assert.equal(await page.locator('#aepLabVisitorResetStatus button').isVisible(), true, 'Reload recovery remains available');
        }
        console.log('OK ' + relative + ' (' + mode + ')');
      } catch (error) {
        throw new Error(relative + ': ' + error.message, { cause: error });
      } finally {
        await context.close();
      }
    }
    console.log('Shared environment bar initialized once on all ' + files.length + ' loader consumers; fixture-only desktop/mobile checks passed.');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
