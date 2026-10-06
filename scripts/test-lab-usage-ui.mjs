import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { summarizeUsage } = require('../functions/labUsageService');
const { summarizeTelemetry } = require('../functions/labUsageTelemetry');
const { summarizeInvocations } = require('../functions/labUsageInvocations');
const { summarizeEngagement } = require('../functions/labUsageEngagement');
const root = resolve(import.meta.dirname, '../web');
const owner = { uid: 'owner-test', email: 'apalmer@adobe.com', isAnonymous: false };
const fixture = summarizeUsage({
  userRecords: [
    { uid: 'test-user', email: 'fixture@example.test', displayName: '<img src=x onerror=alert(1)>', metadata: { lastSignInTime: '2026-10-05T12:00:00Z' } },
    { uid: 'second-user', email: 'second@example.test' },
  ],
  keyRecords: [{ id: 'test-key', principalUid: 'test-user', revoked: false }],
  auditRecords: [{ keyId: 'test-key', timestamp: '2026-10-05T12:00:00Z', tool: 'lab_get_profile', result: 'ok', durationMs: 100 }],
  now: new Date('2026-10-06T09:00:00Z'), days: 30,
  truncated: { usersTruncated: false, keysTruncated: false, auditTruncated: false },
});
fixture.website = summarizeTelemetry({
  records: [
    { uid: 'test-user', type: 'page_view', route: '/profile-viewer/profile.html',
      timestamp: '2026-10-05T12:00:00.000Z', expiresAt: new Date('2026-12-01'), navigation: 'reload' },
    { uid: 'test-user', type: 'sign_in', route: '/profile-viewer/home-new.html',
      timestamp: '2026-10-05T11:00:00.000Z', expiresAt: new Date('2026-12-01') },
  ],
  users: fixture.users, now: new Date(fixture.generatedAt), days: 30, truncated: false, enabled: true,
});
fixture.invocations = summarizeInvocations({
  records: [{
    version: 1, principalUid: 'test-user', authSource: 'ims', endpoint: '/mcp/commerce',
    toolset: 'commerce', tool: 'commerce_capabilities', outcome: 'tool_error',
    timestamp: '2026-10-05T12:00:00.000Z', expiresAt: new Date('2026-12-01'), durationMs: 100,
    handlerStarted: true,
  }],
  users: fixture.users, now: new Date(fixture.generatedAt), days: 30, truncated: true,
});
fixture.engagement = summarizeEngagement({
  records: [
    { uid: 'test-user', type: 'heartbeat', route: '/profile-viewer/profile.html',
      timestamp: '2026-10-05T12:00:00.000Z', occurredAt: '2026-10-05T12:00:00.000Z',
      activeMs: 15000, expiresAt: new Date('2026-12-01') },
  ], users: fixture.users, now: new Date(fixture.generatedAt), days: 30, truncated: false,
});
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + pathname);
  if (!file.startsWith(root + '/') || !pathname.startsWith('/profile-viewer/')) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(file);
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' }[extname(file)];
    res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**/*', (route) => route.fulfill({ body: '' }));
  // Keep fixtures offline: the real shared onboarding/sync scripts call production APIs.
  await page.route('**/aep-access-onboarding.js*', (route) => route.fulfill({ body: '' }));
  await page.route('**/aep-lab-sandbox-sync.js*', (route) => route.fulfill({ body: '' }));
  await page.route('**/api/lab/usage/events', (route) => route.fulfill({
    json: { ok: true, enabled: false, version: 1, routes: [], notice: '' },
  }));
  let calls = 0;
  let lastExclusion = null;
  let responseMode = 'success';
  let releaseResponse;
  let delayedStarted;
  const delayReady = new Promise((done) => { delayedStarted = done; });
  await page.route(/\/api\/lab\/usage\?days=/, async (route) => {
    calls += 1;
    assert.equal(route.request().headers().authorization, 'Bearer fixture-token');
    assert.ok(['7', '30', '90'].includes(new URL(route.request().url()).searchParams.get('days')));
    lastExclusion = new URL(route.request().url()).searchParams.get('excludeOwner');
    assert.ok(['true', 'false'].includes(lastExclusion));
    if (responseMode === 'delayed') await new Promise((done) => { releaseResponse = done; delayedStarted(); });
    if (responseMode === 'error') {
      await route.fulfill({ status: 503, json: { ok: false, error: 'Usage statistics are temporarily unavailable. Retry shortly.' } });
    } else {
      const data = responseMode === 'empty'
        ? summarizeUsage({ userRecords: [], keyRecords: [], auditRecords: [], now: new Date(), days: 30, truncated: {} })
        : fixture;
      const days = Number(new URL(route.request().url()).searchParams.get('days'));
      const end = new Date(data.period.end);
      await route.fulfill({ json: { ok: true, ...data, period: {
        ...data.period, days, start: new Date(end.getTime() - days * 86400000).toISOString(),
      } } });
    }
  });
  await page.addInitScript((initialOwner) => {
    const callbacks = [];
    const auth = {
      currentUser: { ...initialOwner, getIdToken: async () => 'fixture-token' },
      onAuthStateChanged(callback) { callbacks.push(callback); queueMicrotask(() => callback(auth.currentUser)); return () => {}; },
    };
    window.firebase = { apps: [{}], auth: () => auth };
    localStorage.setItem('firebase:authUser:fixture', JSON.stringify({ email: initialOwner.email }));
    window.__usageAuth = {
      setUser(user) {
        auth.currentUser = user ? { ...user, getIdToken: async () => 'fixture-token' } : null;
        callbacks.forEach((callback) => callback(auth.currentUser));
      },
    };
  }, owner);
  const url = `http://127.0.0.1:${server.address().port}/profile-viewer/usage-statistics.html`;
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('usageStatus').dataset.error === 'true'
    || !document.getElementById('usageResults').hidden);
  assert.equal(await page.locator('#usageStatus').getAttribute('data-error'), 'false',
    await page.locator('#usageStatus').innerText());
  assert.equal(await page.locator('#usagePeople tr').count(), 2);
  assert.equal(await page.locator('#usagePeople img').count(), 0);
  assert.ok((await page.locator('#usagePeople').innerText()).includes('<img'));
  assert.equal(await page.locator('a[href="usage-statistics.html"]').count(), 1);
  assert.match(await page.locator('#usagePages').innerText(), /profile-viewer\/profile.html/);
  assert.match(await page.locator('#usageWebsiteSummary').innerText(), /Observed successful lab logins/);
  assert.match(await page.locator('#usageInvocationTools').innerText(), /commerce_capabilities/);
  assert.match(await page.locator('#usageInvocationTruncated').innerText(), /incomplete/);
  assert.match(await page.locator('#usageEngagementPeople').innerText(), /fixture@example.test/);
  assert.match(await page.locator('#usageEngagementSummary').innerText(), /Estimated active minutes/);
  assert.equal(lastExclusion, 'false');
  await page.locator('#usageExcludeOwner').check();
  await page.waitForFunction(() => !document.getElementById('usageRefresh').disabled);
  assert.equal(lastExclusion, 'true');
  await page.locator('#usageExcludeOwner').uncheck();
  await page.waitForFunction(() => !document.getElementById('usageRefresh').disabled);
  assert.equal(await page.locator('#usagePeople tr').first().locator('td').count(), 13);
  assert.equal(await page.locator('#usagePeople tr').first().locator('td').nth(11).innerText(), '1');
  await page.locator('#usagePeople details').first().locator('summary').click();
  assert.match(await page.locator('#usagePeople details').first().innerText(), /profile-viewer\/profile.html/);
  await page.locator('#usageSearch').fill('second');
  assert.equal(await page.locator('#usagePeople tr').count(), 1);
  await page.locator('#usageSearch').fill('');
  await page.locator('#usageDays').selectOption('90');
  await page.locator('#usageRefresh').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('usageRefresh').disabled);

  for (const [theme, width, height] of [['light', 1440, 1100], ['dark', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((themeValue) => {
      if (themeValue === 'dark') document.documentElement.setAttribute('data-aep-theme', 'dark');
      else document.documentElement.removeAttribute('data-aep-theme');
    }, theme);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      `${theme} viewport must not overflow`);
    const text = await page.locator('.usage-panel').first().evaluate((el) => ({
      color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor,
    }));
    assert.notEqual(text.color, text.background);
    if (process.env.USAGE_SCREENSHOT_DIR) {
      await page.screenshot({ path: resolve(process.env.USAGE_SCREENSHOT_DIR, `usage-${theme}.png`), fullPage: true });
    }
  }

  responseMode = 'error';
  await page.locator('#usageRefresh').click();
  await page.waitForFunction(() => document.getElementById('usageStatus').dataset.error === 'true');
  assert.equal(await page.locator('#usageResults').isVisible(), false);
  assert.equal(await page.locator('#usagePeople').innerText(), '');
  assert.equal(await page.locator('#usageInvocationTools').innerText(), '');
  responseMode = 'empty';
  await page.locator('#usageRefresh').click();
  await page.locator('#usageResults').waitFor({ state: 'visible' });
  assert.match(await page.locator('#usageTools').innerText(), /does not prove/);
  assert.match(await page.locator('#usageWebsiteSummary').innerText(), /Not collected/);
  assert.match(await page.locator('#usageInvocationSummary').innerText(), /Not recorded/);
  assert.match(await page.locator('#usageInvocationTools').innerText(), /does not prove/);

  const beforeNonOwner = calls;
  await page.evaluate(() => window.__usageAuth.setUser({ uid: 'other', email: 'other@example.test', isAnonymous: false }));
  assert.equal(await page.locator('#usageResults').isVisible(), false);
  assert.equal(await page.locator('#usagePeople').innerText(), '');
  assert.equal(await page.locator('a[href="usage-statistics.html"]').count(), 0);
  assert.equal(calls, beforeNonOwner);
  await page.evaluate(() => window.__usageAuth.setUser(null));
  assert.equal(await page.locator('#usageSignIn').isVisible(), true);
  assert.equal(calls, beforeNonOwner);

  responseMode = 'delayed';
  await page.evaluate((user) => window.__usageAuth.setUser(user), owner);
  await delayReady;
  await page.evaluate(() => window.__usageAuth.setUser(null));
  releaseResponse();
  await page.waitForFunction(() => document.getElementById('usageStatus').textContent.includes('Sign in'));
  assert.equal(await page.locator('#usageResults').isVisible(), false);
  assert.equal(await page.locator('#usagePeople').innerText(), '');
  assert.deepEqual(errors, []);
  console.log('OK: offline dashboard rendering, themes, mobile layout, filters, empty/error states, nav gating and sign-out data clearing');
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
