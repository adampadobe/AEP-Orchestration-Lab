const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../web');
const screenshotDir = process.env.IMAGE_HOSTING_SCREENSHOTS;
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64');

async function fixture(browser, { theme = 'light', width = 1280, anonymous = false, signedOut = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const calls = [];
  let polls = 0;
  let failure = false;
  const drive = [
    { name: 'Campaigns', path: 'Campaigns', kind: 'folder' },
    { name: 'logo.png', path: 'logo.png', kind: 'file', size: 12000, contentType: 'image/png', previewUrl: 'https://images.test/logo.png', updatedAt: '2026-11-22T11:00:00Z' }
  ];
  const backup = { id: 'snapshot', status: 'completed', sandboxes: ['demo', 'retail'], fileCount: 3, bytes: 34000, createdAt: '2026-11-22T10:00:00Z' };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ theme, anonymous, signedOut }) => {
    localStorage.setItem('aepTheme', theme);
    window.__fixtureAnonymous = anonymous;
    window.__fixtureSignedOut = signedOut;
    window.__fixtureUid = 'owner-one';
  }, { theme, anonymous, signedOut });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'images.test') {
      assert.equal(request.headers().authorization, undefined, 'signed previews/downloads must not receive lab tokens');
      return route.fulfill({ contentType: url.pathname.endsWith('.zip') ? 'application/zip' : 'image/png', body: image });
    }
    if (url.pathname.endsWith('/aep-global-sandbox.js')) {
      return route.fulfill({ contentType: 'application/javascript', body: `window.AepGlobalSandbox={
        getSandboxName:()=> 'demo', loadSandboxesIntoSelect:async (select)=>{select.innerHTML='<option value="demo">demo</option><option value="retail">retail</option>';},
        onSandboxSelectChange:()=>{},attachStorageSync:()=>{}
      };` });
    }
    if (url.pathname.endsWith('/aep-lab-sandbox-sync.js')) {
      return route.fulfill({ contentType: 'application/javascript', body: `window.AepLabSandboxSync={
        whenReady:Promise.resolve(),
        getAuthHeaders:async()=>window.__fixtureSignedOut?{}:{Authorization:'Bearer fixture'}
      }; window.firebase={apps:[{}],auth:()=>({
        currentUser:window.__fixtureSignedOut?null:{isAnonymous:window.__fixtureAnonymous,uid:window.__fixtureUid},
        onAuthStateChanged:callback=>{window.__fixtureAuthChange=callback;}
      })};` });
    }
    if (url.pathname.endsWith('/aep-lab-nav.js') || url.pathname.endsWith('/aep-theme-prefs.js')) {
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    }
    if (url.hostname !== 'aep.test') return route.abort();
    if (url.pathname.startsWith('/api/')) {
      calls.push({ path: url.pathname, query: url.searchParams, method: request.method(), body: request.postDataJSON() });
      assert.equal(request.headers().authorization, 'Bearer fixture', 'every API request is authenticated');
      if (failure && url.pathname.endsWith('/drive')) return route.fulfill({ status: 500, json: { ok: false, error: 'Storage unavailable' } });
      let result = { ok: true };
      if (url.pathname.endsWith('/sandboxes-used')) result.sandboxes = [{ name: 'demo', fileCount: 2 }, { name: 'retail', fileCount: 1 }];
      else if (url.pathname.endsWith('/library') && request.method() === 'GET') {
        assert.equal(url.searchParams.get('limit'), '100');
        result.items = url.searchParams.has('cursor') ?
          [{ relPath: 'hero.png', file: 'hero.png', size: 22000, contentType: 'image/png', cdnUrl: '/cdn/demo/hero.png' }] :
          [{ relPath: 'logo/logo.png', file: 'logo.png', folder: 'logo', size: 12000, contentType: 'image/png', cdnUrl: '/cdn/demo/logo/logo.png' }];
        if (!url.searchParams.has('cursor')) result.nextCursor = 'page-two';
      } else if (url.pathname.endsWith('/library/upload')) result.uploaded = [{ relPath: 'upload.png', file: 'upload.png' }];
      else if (url.pathname.endsWith('/drive') && request.method() === 'GET') {
        result.items = url.searchParams.get('path') ? [] : drive;
      } else if (url.pathname.endsWith('/drive/upload')) result.uploaded = [{ name: 'upload.png', path: 'upload.png', kind: 'file' }];
      else if (url.pathname.endsWith('/drive/folder')) drive.push({ name: request.postDataJSON().path, path: request.postDataJSON().path, kind: 'folder' });
      else if (url.pathname.endsWith('/backups') && request.method() === 'GET') Object.assign(result, { backups: [backup], totalBytes: 34000 });
      else if (url.pathname.endsWith('/backups') && request.method() === 'POST') result.backupId = 'new-snapshot';
      else if (url.pathname.endsWith('/new-snapshot')) {
        polls++;
        result.backup = { ...backup, id: 'new-snapshot', status: polls === 1 ? 'running' : 'completed', progress: { done: polls === 1 ? 1 : 3, total: 3 } };
      } else if (url.pathname.endsWith('/files')) {
        result.items = [
          { sandbox: 'demo', relPath: 'logo/logo.png', size: 12000, contentType: 'image/png', previewUrl: 'https://images.test/logo.png' },
          { sandbox: 'retail', relPath: 'hero.png', size: 22000, contentType: 'image/png', previewUrl: 'https://images.test/hero.png' }
        ];
      } else if (url.pathname.endsWith('/restore/preview')) {
        result.items = [
          { sandbox: 'demo', relPath: 'logo/logo.png', action: 'overwrite' },
          { sandbox: 'retail', relPath: 'hero.png', action: 'add' },
          { sandbox: 'demo', relPath: 'unchanged.png', action: 'unchanged' }
        ];
        result.counts = { add: 1, overwrite: 1, unchanged: 1 };
      } else if (url.pathname.endsWith('/restore')) Object.assign(result, { restored: 1, skipped: 1 });
      else if (url.pathname.endsWith('/download')) result.url = 'https://images.test/backup.zip';
      else if (url.pathname.endsWith('/scrapes')) result.items = [{ scrapeId: 'scrape', brandName: 'Demo' }];
      else if (url.pathname.endsWith('/scrapes/scrape')) result = { scrapeId: 'scrape', brandName: 'Demo', crawlSummary: { assets: { images: [{}], imagesV2: [] } } };
      return route.fulfill({ json: result });
    }
    if (url.pathname.startsWith('/cdn/')) return route.fulfill({ contentType: 'image/png', body: image });
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) return route.abort();
    try {
      return route.fulfill({ contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' }[path.extname(file)], body: await fs.readFile(file) });
    } catch (error) {
      if (error.code === 'ENOENT') return route.fulfill({ status: 404, body: '' });
      throw error;
    }
  });
  await page.goto('http://aep.test/profile-viewer/image-hosting.html');
  return { page, calls, errors, setFailure: value => { failure = value; } };
}

async function ready(page) {
  await page.waitForFunction(() => document.getElementById('imageHostingStatus').textContent === 'Image folders ready.');
}
async function settled(page) {
  await page.waitForFunction(() => document.getElementById('ihFiles').getAttribute('aria-busy') !== 'true');
}
async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {}) });
  try {
    const { page, calls, errors, setFailure } = await fixture(browser);
    await ready(page);
    assert.ok(calls.some(call => call.query.get('cursor') === 'page-two'), 'published library fetches every page');
    assert.equal(await page.locator('#ihItems .ih-item').count(), 2, 'root contains one folder and one file');
    await page.locator('#ihItems').getByRole('button', { name: 'logo', exact: true }).click();
    await settled(page);
    await page.getByRole('button', { name: 'logo.png', exact: true }).click();
    assert.ok((await page.locator('#ihDetails').innerText()).includes('/cdn/demo/logo/logo.png'));
    await page.locator('#ihUploadInput').setInputFiles({ name: 'upload.png', mimeType: 'image/png', buffer: image });
    await settled(page);
    assert.ok(calls.some(call => call.path.endsWith('/library/rename') && call.body.newRelPath === 'logo/upload.png'), 'published folder upload uses upload then rename');
    await page.locator('#ihTree').getByRole('button', { name: 'My drive', exact: true }).click();
    await settled(page);
    await page.getByRole('button', { name: 'logo.png', exact: true }).click();
    assert.ok(!(await page.locator('#ihDetails').innerText()).includes('CDN URL'), 'drive preview has no CDN action');
    await page.getByRole('checkbox', { name: 'Select logo.png', exact: true }).check();
    assert.equal(await page.locator('#ihCopy').isVisible(), false);
    assert.equal(await page.locator('#ihRename').isEnabled(), true);
    await page.locator('#ihListView').click();
    assert.equal(await page.locator('.ih-items--list').count(), 1);
    page.once('dialog', dialog => dialog.accept('Renamed.png'));
    await page.locator('#ihRename').click();
    await settled(page);
    assert.ok(calls.some(call => call.path.endsWith('/drive/rename') && call.body.newName === 'Renamed.png'));
    await page.locator('#ihUploadInput').setInputFiles({ name: 'upload.png', mimeType: 'image/png', buffer: image });
    await settled(page);
    assert.ok(calls.some(call => call.path.endsWith('/drive/upload') && call.body.path === '' && call.body.keepFilename && !call.body.convertToPng), 'private uploads retain original bytes and names');
    await page.getByRole('checkbox', { name: 'Select logo.png', exact: true }).check();
    page.once('dialog', dialog => dialog.accept('Campaigns'));
    await page.locator('#ihMove').click();
    await settled(page);
    assert.ok(calls.some(call => call.path.endsWith('/drive/move') && call.body.from === 'logo.png' && call.body.to === 'Campaigns/logo.png'));
    await page.getByRole('checkbox', { name: 'Select logo.png', exact: true }).check();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#ihDelete').click();
    await settled(page);
    assert.deepEqual(calls.find(call => call.path.endsWith('/drive') && call.method === 'DELETE').body.paths, ['logo.png']);
    page.once('dialog', dialog => dialog.accept('New folder'));
    await page.locator('#ihNewFolder').click();
    await settled(page);
    assert.ok(calls.some(call => call.path.endsWith('/drive/folder') && call.body.path === 'New folder'));
    await page.locator('#ihBackupNow').click();
    await page.locator('#ihBackupDialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ihBackupSandboxes input:checked').count(), 2, 'used sandboxes are preselected');
    await page.locator('#ihBackupStart').click();
    await page.waitForFunction(() => document.getElementById('imageHostingStatus').textContent.startsWith('Backup complete'));
    assert.ok(calls.filter(call => call.path.endsWith('/new-snapshot')).length >= 2, 'backup document is polled');
    await page.locator('#ihBackupClose').click();
    await page.getByRole('button', { name: 'Restore…', exact: true }).click();
    await page.locator('#ihRestoreDialog').waitFor({ state: 'visible' });
    assert.match(await page.locator('#ihRestoreCounts').innerText(), /1 add · 1 overwrite · 1 unchanged/);
    assert.equal(await page.locator('#ihRestoreApply').isEnabled(), false, 'restore is gated by confirmation');
    await page.locator('#ihRestoreAll').uncheck();
    await page.locator('#ihRestoreDiff input').nth(1).uncheck();
    await page.locator('#ihRestoreConfirm').check();
    await page.locator('#ihRestoreApply').click();
    await page.locator('#ihRestoreDialog').waitFor({ state: 'hidden' });
    assert.deepEqual(calls.find(call => call.path.endsWith('/restore')).body.paths, ['demo/logo/logo.png']);
    await settled(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download ZIP', exact: true }).click();
    await downloadPromise;
    await settled(page);
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await settled(page);
    assert.ok(!calls.some(call => call.path.endsWith('/snapshot') && call.method === 'DELETE'), 'cancelled deletion makes no request');
    await page.locator('#ihTabScrapes').click();
    await page.getByRole('button', { name: 'Classify images', exact: true }).waitFor();
    await settled(page);
    await page.getByRole('button', { name: 'Classify images', exact: true }).click();
    await settled(page);
    assert.ok(calls.some(call => call.path.endsWith('/scrapes/classify')), 'classification uses authenticated API');
    await page.locator('#ihTabFiles').click();
    await page.locator('#ihTree').getByRole('button', { name: 'My drive', exact: true }).click();
    await settled(page);
    setFailure(true);
    await page.locator('#ihTree').getByRole('button', { name: 'My drive', exact: true }).click();
    await settled(page);
    assert.match(await page.locator('#imageHostingStatus').innerText(), /Storage unavailable/);
    setFailure(false);
    await page.evaluate(() => { window.__fixtureUid = 'owner-two'; window.__fixtureAuthChange({ uid: 'owner-two', isAnonymous: false }); });
    await ready(page);
    assert.ok(!(await page.locator('#ihTree').innerText()).includes('New folder'), 'account changes clear the previous private folder tree');
    assert.ok(!(await page.locator('#ihDetails').innerText()).includes('logo.png'), 'account changes clear previous private preview');
    await page.evaluate(() => { window.__fixtureSignedOut = true; window.__fixtureAuthChange(null); });
    await page.locator('#imageHostingSignIn').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ihTree').innerText(), '', 'sign-out clears private folder metadata');
    assert.equal(await page.locator('#ihDetails').innerText(), '', 'sign-out clears private preview details');
    assert.deepEqual(errors, []);
    await page.close();

    for (const options of [{ signedOut: true }, { anonymous: true }]) {
      const f = await fixture(browser, options);
      await f.page.locator('#imageHostingSignIn').waitFor({ state: 'visible' });
      assert.equal(f.calls.length, 0, 'anonymous and signed-out users never call private APIs');
      assert.deepEqual(f.errors, []);
      await f.page.close();
    }
    for (const theme of ['light', 'dark']) {
      for (const width of [1600, 1280, 900, 390]) {
        const f = await fixture(browser, { theme, width });
        await ready(f.page);
        await f.page.locator('#ihListView').click();
        await f.page.getByRole('button', { name: 'hero.png', exact: true }).click();
        const overflow = await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false, `${theme}/${width} fits viewport`);
        assert.ok(await f.page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].at(-1).href.includes('aep-theme.css')));
        if (screenshotDir && width !== 390) {
          await fs.mkdir(screenshotDir, { recursive: true });
          await f.page.screenshot({ path: path.join(screenshotDir, `image-hosting-${theme}-${width}.png`), fullPage: true });
        }
        assert.deepEqual(f.errors, []);
        await f.page.close();
      }
    }
    console.log('Image hosting explorer browser checks passed');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
