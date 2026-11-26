const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const launchScriptUrl = 'https://assets.adobedtm.com/60e5fd51ad90/1e9ecb8bbc4a/launch-906acd0beab0-development.min.js';
const hosting = require('../firebase.json').hosting.find(site => site.target === 'app');
const article = 'https://www.bp.com/en-GB/press-and-publications/energy-in-focus-magazine/becoming-simpler-stronger-and-more-valuable';
const creatives = [
  { role: 'master', asset: 'BPCC-1234 Atlantis with words', heading: 'Putting simplicity to work',
    alt: 'Atlantis offshore platform campaign creative', href: article },
  { role: 'deck', asset: 'BPCC-1234 Atlantis-deck', heading: 'Making more of what we already have',
    alt: 'View across the Atlantis offshore platform deck',
    href: 'https://www.bp.com/en-US/press-and-publications/us-featured-stories/a-case-study-how-bp-atlantis-platform-is-preparing-for-the-future' },
  { role: 'banner', asset: 'BPCC-1234 Atlantis Here Banner', heading: 'The simpler we get, the more we deliver',
    alt: 'Atlantis offshore platform campaign banner', href: article },
];

async function main() {
  const { parseNav } = await import('./lab-nav-catalogue.mjs');
  const nav = parseNav(await readFile(path.join(web, 'profile-viewer', 'aep-lab-nav.js'), 'utf8'));
  const bp = nav.find(group => group.subgroups?.some(subgroup => subgroup.id === 'demoBp'))
    ?.subgroups.find(subgroup => subgroup.id === 'demoBp');
  assert.equal(bp?.label, 'BP');
  assert.equal(bp?.demoCustomer, true);
  const menuItem = bp.items.find(item => item.label === 'Content Analysis');
  assert.equal(menuItem?.href, '/atlantis');
  assert.equal(Array.from(menuItem.demoMeta.owners).includes('kirkham'), true);
  for (const route of ['/atlantis', '/atlantis/']) {
    assert.equal(hosting.rewrites.find(rewrite => rewrite.source === route)?.destination, '/atlantis.html');
  }
  const html = await readFile(path.join(web, 'atlantis.html'), 'utf8');
  assert.doesNotMatch(html, /alloy\s*\(|alloy(?:\.min)?\.js|<iframe|<button|<form|loading\s*=|onload\s*=/i);
  assert.doesNotMatch(html, /cdn\.demoemea|bp\.com[^"'\s]+\.(?:png|jpe?g)|rel=["']preload/i);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const rewrite = hosting.rewrites.find(rule => rule.source === url.pathname);
      const file = path.resolve(web, '.' + (rewrite?.destination || decodeURIComponent(url.pathname)));
      if (!file.startsWith(web + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const bytes = await readFile(file);
      const mime = { '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(bytes);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error(error);
      res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext();
      const errors = [], external = [], localFailures = [];
      let tagLoads = 0;
      await context.addInitScript(value => localStorage.setItem('aepTheme', value), theme);
      await context.route('**/*', route => {
        const request = route.request();
        if (request.url() === launchScriptUrl) {
          tagLoads++;
          return route.fulfill({ contentType: 'text/javascript', body: `
            if (!Array.isArray(window.dataLayer)) throw new Error('Existing Tags rules require dataLayer before loading.');
            window.dataLayer.partnerData = {};
            window.__alloyCommands = [];
            window._satellite = { property: { name: 'kirkham - Retail Demo (web)' } };
            window.alloy = function(command) { window.__alloyCommands.push(command); };
          ` });
        }
        if (new URL(request.url()).origin === origin) return route.continue();
        external.push(request.url());
        return route.fulfill({ contentType: 'text/html', body: '<title>Offline article destination</title>' });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('response', response => {
        if (response.url().startsWith(origin) && !response.ok()) localFailures.push(response.url());
      });
      await page.goto(origin + '/atlantis');
      await page.waitForFunction(() => typeof window.alloy === 'function');
      assert.equal(await page.title(), 'Atlantis | Creative Performance');
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('h1').textContent(), 'The simpler we get, the more we deliver');
      assert.equal(await page.locator('img').count(), 3);
      assert.equal(await page.locator('script[src]').count(), 1);
      assert.equal(await page.locator('script[src]').getAttribute('src'), launchScriptUrl);
      assert.deepEqual(await page.evaluate(() => window.__alloyCommands), [], 'Page never configures or commands Alloy');
      assert.equal(tagLoads, 1, 'Only the existing Tags library is loaded');
      assert.deepEqual(external, [], 'No external asset fallback, SDK copy or profile API');
      assert.equal(await page.locator('html').getAttribute('data-aep-theme'), theme === 'dark' ? 'dark' : null);
      const background = await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor);
      assert.equal(background, theme === 'dark' ? 'rgb(24, 27, 33)' : 'rgb(255, 255, 255)');

      for (const creative of creatives) {
        const image = page.locator(`img[data-content-role="${creative.role}"]`);
        assert.equal(await image.count(), 1);
        assert.equal(await page.locator(`#atlantis-${creative.role}`).count(), 1);
        assert.equal(await image.getAttribute('id'), `atlantis-${creative.role}`);
        assert.equal(await page.locator(`#atlantis-${creative.role}-link`).count(), 1);
        assert.equal(await image.locator('..').getAttribute('id'), `atlantis-${creative.role}-link`);
        assert.equal(await image.getAttribute('data-aem-asset'), creative.asset);
        assert.equal(await image.getAttribute('loading'), null);
        assert.equal(await image.evaluate(img => getComputedStyle(img).backgroundImage), 'none');
        assert.equal(await image.getAttribute('src'), `/assets/atlantis/atlantis-${creative.role}.png`);
        assert.equal(await image.getAttribute('alt'), creative.alt);
        assert.equal(await image.getAttribute('data-content-campaign'), 'atlantis');
        assert.equal(await image.getAttribute('data-content-source'), 'approved-creative');
        assert.equal(await image.getAttribute('data-aem-id'), creative.role === 'deck'
          ? 'urn:aaid:aem:8ed09c6b-a408-474f-ad05-370660f42be9' : null);
        assert.equal(await image.evaluate(img => img.complete && img.naturalWidth > 0), true);
        assert.equal(await image.evaluate(img =>
          Number(img.getAttribute('width')) === img.naturalWidth &&
          Number(img.getAttribute('height')) === img.naturalHeight), true, 'Intrinsic dimensions match the approved file');
        assert.equal(await image.locator('..').evaluate(link => link.tagName), 'A');
        assert.equal(await image.locator('..').getAttribute('href'), creative.href);
        assert.equal(await image.locator('..').getAttribute('target'), '_blank');
        assert.equal(await image.locator('..').getAttribute('rel'), 'noopener noreferrer');
        assert.equal(await image.locator('xpath=ancestor::section/h2').textContent(), creative.heading);
        const bytes = await readFile(path.join(web, 'assets', 'atlantis', `atlantis-${creative.role}.png`));
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Asset really is a PNG');
      }

      for (const viewport of [
        { width: 1440, height: 900 }, { width: 1024, height: 600 },
        { width: 320, height: 568 }, { width: 667, height: 320 },
      ]) {
        await page.setViewportSize(viewport);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => scrollTo(0, 0));
        assert.equal(await page.locator('img').last().evaluate(img => img.getBoundingClientRect().top >= innerHeight), true);
        for (const creative of creatives) {
          const image = page.locator(`img[data-content-role="${creative.role}"]`);
          await image.evaluate(img => img.scrollIntoView({ block: 'center' }));
          const geometry = await image.evaluate(img => {
            const rect = img.getBoundingClientRect();
            const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
            const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
            return { fraction: visibleHeight * visibleWidth / (rect.height * rect.width),
              ratio: rect.width / rect.height, naturalRatio: img.naturalWidth / img.naturalHeight,
              width: rect.width, display: getComputedStyle(img).display };
          });
          assert.ok(geometry.fraction >= 0.75, `${theme} ${viewport.width}x${viewport.height}: ${creative.role} >=75% visible`);
          assert.ok(Math.abs(geometry.ratio - geometry.naturalRatio) < 0.01, 'No cropping or distortion');
          assert.ok(geometry.width >= 270, 'Creative remains visually meaningful');
          assert.equal(geometry.display, 'block');
          assert.equal(await page.locator('img').evaluateAll(images => images.filter(img => {
            const r = img.getBoundingClientRect();
            return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height >= 0.75;
          }).length), 1, 'Successive creatives enter independently');
        }
      }

      await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
      for (const creative of creatives) {
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => ({
          role: document.activeElement.querySelector('img')?.dataset.contentRole,
          outline: getComputedStyle(document.activeElement).outlineStyle,
        }));
        assert.equal(focus.role, creative.role);
        assert.equal(focus.outline, 'solid');
        const popupPromise = context.waitForEvent('page');
        await page.keyboard.press('Enter');
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');
        assert.equal(popup.url(), creative.href, 'Keyboard opens the intended article');
        assert.equal(await popup.evaluate(() => window.opener), null);
        await popup.close();
      }
      for (const creative of creatives) {
        const popupPromise = context.waitForEvent('page');
        await page.locator(`img[data-content-role="${creative.role}"]`).click();
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');
        assert.equal(popup.url(), creative.href, 'Clicking the actual image opens the intended article');
        await popup.close();
      }
      assert.deepEqual(errors, [], 'No page or console errors');
      assert.deepEqual(localFailures, [], 'All local page resources load');
      await context.close();
    }
    console.log('Atlantis: route, three local PNGs, stable IDs, AEM provenance, links, one Tags loader, themes, focus and independent >=75% visibility passed; no console errors (offline Tags/article fixtures).');
    console.log('Launch URL: ' + launchScriptUrl);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
