const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../web');

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {}),
  });
  try {
    for (const changePct of [0.75, -0.75, 0, 1.25]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/aep-access-onboarding.js')) {
          return route.fulfill({ contentType: 'application/javascript', body: 'window.AepAccessOnboarding={init:function(){}};' });
        }
        if (url.pathname.endsWith('/aep-lab-sandbox-sync.js')) {
          return route.fulfill({ contentType: 'application/javascript', body: 'window.AepLabSandboxSync={whenReady:Promise.resolve(),getAuthHeaders:function(){return Promise.resolve({});}};' });
        }
        if (url.pathname === '/api/lab/adobe-stock') {
          return route.fulfill({ json: { ok: true, price: 425.5, changePct } });
        }
        if (url.pathname === '/api/brand-scraper/scrapes') {
          return route.fulfill({ json: { items: [{ brandName: 'Example Brand', baseUrl: 'https://example.com', updatedAt: '2026-11-22T12:00:00Z' }] } });
        }
        if (url.hostname !== 'aep.test') return route.abort();
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: {} });
        const file = path.resolve(root, '.' + url.pathname);
        if (!file.startsWith(root + path.sep)) return route.abort();
        try {
          const ext = path.extname(file);
          const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' }[ext];
          return route.fulfill({ contentType: type, body: await fs.readFile(file) });
        } catch (error) {
          if (error.code === 'ENOENT') return route.fulfill({ status: 404, body: '' });
          throw error;
        }
      });
      await page.goto('http://aep.test/profile-viewer/home-new.html');
      await page.evaluate(() => {
        const template = document.getElementById('aepDeferredDashboardShell');
        document.getElementById('aepDashboardMount').replaceWith(template.content.cloneNode(true));
        template.remove();
        window.dispatchEvent(new Event('aep-deferred-dashboard-mounted'));
      });
      await page.waitForFunction(() => document.getElementById('homeGreetingStock').innerText.includes('%'));
      const stock = await page.locator('#homeGreetingStock').innerText();
      assert.match(stock, new RegExp(Math.abs(changePct).toFixed(2).replace('.', '\\.') + '%'));
      const foot = page.locator('#homeReleaseFootNote');
      await foot.waitFor();
      await page.waitForFunction(() => document.getElementById('homeReleaseFootNote').textContent.includes('highlights'));
      const count = (await foot.innerText()).match(/^Showing (\d+) of (\d+) highlights/);
      assert.ok(count && Number(count[1]) <= Number(count[2]), 'highlight count is internally consistent');
      const actions = page.locator('.home-release-panel__actions');
      const bounds = await actions.boundingBox();
      assert.ok(bounds.x + bounds.width <= 1280, 'release actions fit the viewport');
      const scrapeTitle = page.locator('.home-lab-compact-item__title');
      const scrapeUrl = page.locator('.home-lab-compact-item__url');
      await scrapeUrl.waitFor();
      const titleBounds = await scrapeTitle.boundingBox();
      const urlBounds = await scrapeUrl.boundingBox();
      assert.ok(urlBounds.y >= titleBounds.y + titleBounds.height, 'scrape details stack below the brand name');
      await page.close();
    }
    console.log('Home dashboard polish checks passed');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
