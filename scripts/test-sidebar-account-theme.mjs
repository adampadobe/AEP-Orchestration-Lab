import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const ui = new URL('../web/profile-viewer/', import.meta.url);
const files = new Map(await Promise.all(
  ['aep-lab-nav.js', 'aep-theme.js', 'style.css', 'home.css', 'aep-theme.css'].map(async (name) =>
    [name, await readFile(new URL(name, ui), 'utf8')]),
));
const user = {
  uid: 'theme-fixture',
  email: 'fixture@example.test',
  displayName: 'Test Person',
  isAnonymous: false,
};
const browser = await chromium.launch({ headless: true });
try {
  for (const order of [
    ['aep-lab-nav.js', 'aep-theme.js'],
    ['aep-theme.js', 'aep-lab-nav.js'],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((initialUser) => {
      const auth = {
        currentUser: { ...initialUser, getIdToken: async () => 'fixture-token' },
        onAuthStateChanged(callback) { window.fixtureAuthChanged = callback; },
      };
      window.firebase = { auth: () => auth };
    }, user);
    await page.route('**/*', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const name = pathname.split('/').pop();
      if (pathname === '/api/lab/workspace-profile') {
        await route.fulfill({ json: { profile: { firstName: 'Test', lastName: 'Person' } } });
      } else if (name === 'brand-scraper-demo-nav.json') {
        await route.fulfill({ json: { entries: [] } });
      } else if (files.has(name)) {
        await route.fulfill({
          contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript',
          body: files.get(name),
        });
      } else if (name === 'home.html') {
        await route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html><head>
            <link rel="stylesheet" href="style.css">
            <link rel="stylesheet" href="home.css">
            <link rel="stylesheet" href="aep-theme.css">
            <script id="aepLabUsageTelemetryScript"></script>
            </head><body class="home-dashboard-concierge">
            <div class="dashboard-shell"><aside class="dashboard-sidebar"></aside></div>
            ${order.map((script) => `<script src="${script}"></script>`).join('')}
            </body></html>`,
        });
      } else {
        await route.fulfill({ body: '' });
      }
    });
    await page.goto('http://aep.test/profile-viewer/home.html');
    const account = page.locator('.aep-lab-account-btn');
    const duplicate = page.locator('.dashboard-sidebar .aep-theme-toggle-btn');
    await account.waitFor({ state: 'visible' });
    assert.equal(await duplicate.count(), 0, 'signed-in sidebar has no duplicate');
    await page.evaluate(() => window.AepTheme.injectSidebarToggle());
    assert.equal(await duplicate.count(), 0, 'fallback injector respects account footer');

    for (const collapsed of [false, true]) {
      await page.evaluate((value) => {
        document.querySelector('.dashboard-sidebar').classList.toggle('dashboard-sidebar--collapsed', value);
      }, collapsed);
      await account.click();
      await page.getByRole('menuitem', { name: 'Switch to dark mode', exact: true }).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('aepTheme')), 'dark');
      assert.equal(await page.locator('html').getAttribute('data-aep-theme'), 'dark');
      await page.getByRole('menuitem', { name: 'Switch to light mode', exact: true }).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('aepTheme')), 'light');
      assert.equal(await page.locator('html').getAttribute('data-aep-theme'), null);
      await page.keyboard.press('Escape');
    }

    await page.evaluate(() => window.dispatchEvent(new Event('aep-access-scope-change')));
    assert.equal(await duplicate.count(), 0, 'sidebar rebuild retains account-only appearance');
    for (const visitor of [null, { uid: 'anonymous', isAnonymous: true }]) {
      await page.evaluate((currentUser) => {
        window.firebase.auth().currentUser = currentUser;
        window.fixtureAuthChanged();
      }, visitor);
      assert.equal(await duplicate.count(), 1, 'visitor retains exactly one fallback');
      await duplicate.click();
      assert.equal(await page.evaluate(() => window.AepTheme.getMode()), 'dark');
      await duplicate.click();
      assert.equal(await page.evaluate(() => window.AepTheme.getMode()), 'light');
    }
    await page.evaluate((initialUser) => {
      window.firebase.auth().currentUser = { ...initialUser, getIdToken: async () => 'fixture-token' };
      window.fixtureAuthChanged();
    }, user);
    await account.waitFor({ state: 'visible' });
    assert.equal(await duplicate.count(), 0, 'sign-in removes the visitor fallback');
    await account.click();
    await page.getByRole('menuitem', { name: 'Profile and preferences', exact: true }).click();
    for (const mode of ['light', 'dark']) {
      await page.evaluate((value) => window.AepTheme.setMode(value), mode);
      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const fontSize of ['16px', '20px']) {
          await page.evaluate((value) => { document.documentElement.style.fontSize = value; }, fontSize);
          const layout = await page.locator('#aepLabAccountDialog').evaluate((dialog) => {
            const grid = dialog.querySelector('.aep-lab-account-fields').getBoundingClientRect();
            const bounds = dialog.getBoundingClientRect();
            return {
              fitsViewport: bounds.left >= 0 && bounds.right <= innerWidth,
              noOverflow: dialog.scrollWidth <= dialog.clientWidth,
              fieldsFit: [...dialog.querySelectorAll('input')].every((input) => {
                const field = input.getBoundingClientRect();
                return field.left >= grid.left - 1 && field.right <= grid.right + 1;
              }),
            };
          });
          assert.deepEqual(layout, {
            fitsViewport: true, noOverflow: true, fieldsFit: true,
          }, `complete name fields at ${width}px / ${fontSize} / ${mode}`);
        }
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Sidebar account theme checks passed (both script orders, themes, collapsed state, rebuilds, and auth transitions).');
} finally {
  await browser.close();
}
