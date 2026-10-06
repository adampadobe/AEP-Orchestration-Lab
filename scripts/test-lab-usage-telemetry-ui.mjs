import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ROUTES, NOTICE } = require('../functions/labUsageTelemetry');
const root = resolve(import.meta.dirname, '../web');
const html = `<!doctype html><html lang="en"><head><title>Offline telemetry fixture</title></head>
<body class="home-dashboard-concierge"><aside class="dashboard-sidebar"></aside>
<main class="dashboard-main"><h1>Lab fixture</h1></main>
<script src="/profile-viewer/aep-access-scope.js"></script>
<script src="/profile-viewer/aep-access-onboarding.js"></script>
<script src="/profile-viewer/aep-lab-nav.js"></script>
<script>if(window.__testOnboarding)window.AepAccessOnboarding.init();</script></body></html>`;
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + pathname);
  if (!file.startsWith(root + '/')) { res.writeHead(404).end(); return; }
  if (pathname.endsWith('.html')) { res.writeHead(200, { 'Content-Type': 'text/html' }).end(html); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : 'application/json' })
      .end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const user = { uid: 'fixture-user', email: 'fixture@adobe.com', isAnonymous: false, emailVerified: true };
  async function scenario({ enabled = true, signedIn = true, anonymous = false, onboarding = false,
    loseFirstReply = false, rejectStatus = 0, loginFails = false, version = 1 } = {}) {
    const page = await browser.newPage();
    const posts = [];
    const statuses = [];
    const errors = [];
    let configResolved;
    const configDone = new Promise((done) => { configResolved = done; });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://**/*', (route) => route.fulfill({ body: '' }));
    await page.route('**/api/**', (route) => route.fulfill({ json: { ok: true, status: 'approved' } }));
    await page.route('**/api/lab/usage/events', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { ok: true, enabled, version, routes: ROUTES, notice: NOTICE } });
        configResolved();
        return;
      }
      assert.equal(await page.locator('#aepLabUsageNotice').isVisible(), true, 'notice must precede collection');
      assert.equal(route.request().headers().authorization, 'Bearer fixture-token');
      assert.equal(route.request().headers().referer, undefined);
      const body = route.request().postDataJSON();
      assert.deepEqual(Object.keys(body).sort(), (body.type === 'page_view'
        ? ['id', 'navigation', 'occurredAt', 'route', 'type', 'version']
        : body.type === 'heartbeat' ? ['id', 'activeMs', 'occurredAt', 'route', 'type', 'version']
        : ['id', 'occurredAt', 'route', 'type', 'version']).sort());
      posts.push(body);
      await page.evaluate((count) => { window.__usagePostsReceived = count; }, posts.length);
      if (rejectStatus) await route.fulfill({ status: rejectStatus, json: { ok: false } });
      else if (loseFirstReply && posts.length === 1) await route.fulfill({ status: 503, json: { ok: false } });
      else await route.fulfill({ json: { ok: true, duplicate: posts.length > 1 && body.id === posts[0].id } });
    });
    await page.exposeFunction('__reportUsageStatus', (detail) => statuses.push(detail));
    await page.addInitScript(({ initialUser, isOnboarding, shouldRejectLogin }) => {
      window.__testOnboarding = isOnboarding;
      window.__usagePostsReceived = 0;
      window.firebaseDatabaseConfigIsComplete = () => true;
      window.firebaseDatabaseConfig = { apiKey: 'offline-fixture', appId: 'offline-fixture', projectId: 'offline-fixture' };
      window.addEventListener('aep-lab-usage-status', (event) => {
        window.__receivedUsageStatus = event.detail;
        void window.__reportUsageStatus(event.detail);
      });
      const callbacks = [];
      let resolveToken;
      let tokenDelayed = false;
      const makeUser = (value) => value ? {
        ...value, getIdToken: () => tokenDelayed
          ? new Promise((done) => { resolveToken = done; }) : Promise.resolve('fixture-token'),
        reload: async () => {},
      } : null;
      const auth = {
        currentUser: makeUser(initialUser),
        onAuthStateChanged(callback) {
          callbacks.push(callback);
          queueMicrotask(() => callback(auth.currentUser));
          return () => {};
        },
        signInWithEmailAndPassword: async (email) => {
          if (shouldRejectLogin) throw Object.assign(new Error('Fixture failed login'), { code: 'auth/wrong-password' });
          auth.currentUser = makeUser({ uid: 'fixture-user', email, isAnonymous: false, emailVerified: true });
          callbacks.forEach((callback) => callback(auth.currentUser));
          return { user: auth.currentUser };
        },
        signOut: async () => {
          auth.currentUser = null;
          callbacks.forEach((callback) => callback(null));
        },
      };
      window.firebase = { apps: [{}], auth: () => auth };
      window.__telemetryAuth = {
        repeat: () => callbacks.forEach((callback) => callback(auth.currentUser)),
        setUser(value) {
          auth.currentUser = makeUser(value);
          callbacks.forEach((callback) => callback(auth.currentUser));
        },
        delayToken: () => { tokenDelayed = true; },
        releaseToken: () => { tokenDelayed = false; resolveToken?.('fixture-token'); },
      };
    }, { initialUser: signedIn ? { ...user, isAnonymous: anonymous } : null,
      isOnboarding: onboarding, shouldRejectLogin: loginFails });
    return { page, posts, statuses, errors, configDone };
  }
  const disabled = await scenario({ enabled: false });
  await disabled.page.goto(origin + '/profile-viewer/profile.html');
  await disabled.configDone;
  assert.equal(disabled.posts.length, 0);
  assert.equal(await disabled.page.locator('#aepLabUsageNotice').count(), 0);
  await disabled.page.close();

  const engagement = await scenario({ version: 2 });
  await engagement.page.clock.install();
  await engagement.page.goto(origin + '/profile-viewer/profile.html');
  await engagement.page.waitForFunction(() => window.AepLabUsageTelemetry?.ready);
  await engagement.page.waitForFunction(() => window.__usagePostsReceived >= 1);
  await engagement.page.clock.runFor(30000);
  assert.equal(engagement.posts.filter((entry) => entry.type === 'heartbeat').length, 0, 'no interaction means no active time');
  await engagement.page.locator('h1').click();
  const heartbeatResponse = engagement.page.waitForResponse((response) => response.request().method() === 'POST'
    && response.request().postDataJSON()?.type === 'heartbeat');
  await engagement.page.clock.runFor(15000);
  await heartbeatResponse;
  assert.equal(engagement.posts.find((entry) => entry.type === 'heartbeat')?.activeMs, 15000,
    JSON.stringify(engagement.posts));
  await engagement.page.clock.runFor(60000);
  await engagement.page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
  await engagement.page.waitForFunction(() => window.__usagePostsReceived >= 5);
  const afterIdle = engagement.posts.filter((entry) => entry.type === 'heartbeat').length;
  await engagement.page.clock.runFor(60000);
  assert.equal(engagement.posts.filter((entry) => entry.type === 'heartbeat').length, afterIdle);
  await engagement.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'private' })));
  await engagement.page.clock.runFor(15000);
  assert.equal(engagement.posts.filter((entry) => entry.type === 'heartbeat').length, afterIdle,
    'scripted interactions must not establish activity');
  const resumedResponse = engagement.page.waitForResponse((response) => response.request().method() === 'POST'
    && response.request().postDataJSON()?.type === 'heartbeat');
  await engagement.page.locator('h1').click();
  await engagement.page.clock.runFor(15000);
  await resumedResponse;
  assert.ok(engagement.posts.at(-1).activeMs > 0 && engagement.posts.at(-1).activeMs <= 15000,
    'the next scheduled tick includes only time after resumed interaction');
  const resumedCount = afterIdle + 1;
  await engagement.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await engagement.page.clock.runFor(30000);
  assert.equal(engagement.posts.filter((entry) => entry.type === 'heartbeat').length, resumedCount, 'blur drops partial intervals');
  await engagement.page.locator('h1').click();
  await engagement.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await engagement.page.clock.runFor(30000);
  assert.equal(engagement.posts.filter((entry) => entry.type === 'heartbeat').length, resumedCount, 'hidden pages do not count');
  await engagement.page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await engagement.page.locator('h1').click();
  await engagement.page.clock.fastForward(120000);
  assert.equal(engagement.posts.filter((entry) => entry.type === 'heartbeat').length, resumedCount, 'timer suspension must not inflate time');
  await engagement.page.locator('h1').click();
  await engagement.page.evaluate(() => window.__telemetryAuth.setUser(null));
  await engagement.page.clock.runFor(30000);
  assert.equal(engagement.posts.filter((entry) => entry.type === 'heartbeat').length, resumedCount, 'sign-out stops active time');
  assert.deepEqual(engagement.errors, []);
  await engagement.page.close();

  const active = await scenario();
  await active.page.goto(origin + '/profile-viewer/profile.html?identifier=private-profile#private-fragment');
  await active.page.waitForFunction(() => window.AepLabUsageTelemetry?.ready);
  await active.page.waitForFunction(() => window.__usagePostsReceived === 1);
  assert.equal(active.posts.length, 1);
  assert.equal(active.posts[0].route, '/profile-viewer/profile.html');
  assert.equal(active.posts[0].type, 'page_view');
  assert.equal(JSON.stringify(active.posts).includes('private-profile'), false);
  await active.page.evaluate(() => { window.__telemetryAuth.repeat(); window.__telemetryAuth.repeat(); });
  assert.equal(active.posts.length, 1, 'restored auth and repeated auth callbacks are not logins or duplicate views');
  await active.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await active.page.waitForFunction(() => window.__usagePostsReceived === 2);
  assert.equal(active.posts.length, 2);
  assert.equal(active.posts[1].navigation, 'back_forward');
  assert.notEqual(active.posts[0].id, active.posts[1].id);
  await active.page.evaluate(() => window.__telemetryAuth.setUser(null));
  assert.equal(await active.page.locator('#aepLabUsageNotice').count(), 0);
  assert.deepEqual(active.errors, []);
  await active.page.close();

  for (const options of [{ signedIn: false }, { anonymous: true }]) {
    const denied = await scenario(options);
    await denied.page.goto(origin + '/profile-viewer/profile.html');
    await denied.page.waitForFunction(() => window.AepLabUsageTelemetry?.ready);
    assert.equal(denied.posts.length, 0);
    assert.equal(await denied.page.locator('#aepLabUsageNotice').count(), 0);
    await denied.page.close();
  }
  const excluded = await scenario();
  await excluded.page.goto(origin + '/profile-viewer/demos/fixture.html');
  await excluded.configDone;
  assert.equal(excluded.posts.length, 0);
  await excluded.page.close();

  const framed = await scenario({ enabled: false });
  await framed.page.goto(origin + '/profile-viewer/profile.html');
  await framed.configDone;
  let frameRequests = 0;
  framed.page.on('request', (req) => {
    if (req.url().endsWith('/api/lab/usage/events')) frameRequests += 1;
  });
  await framed.page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.src = '/profile-viewer/profile.html';
    document.body.appendChild(frame);
  });
  await framed.page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('.dashboard-sidebar-nav'));
  assert.equal(frameRequests, 0, 'embedded pages must not load or call telemetry');
  await framed.page.close();

  const race = await scenario({ signedIn: false });
  await race.page.goto(origin + '/profile-viewer/profile.html');
  await race.page.waitForFunction(() => window.AepLabUsageTelemetry?.ready);
  await race.page.evaluate((value) => {
    window.__telemetryAuth.delayToken();
    window.__telemetryAuth.setUser(value);
    window.__telemetryAuth.setUser(null);
    window.__telemetryAuth.releaseToken();
  }, user);
  assert.equal(race.posts.length, 0);
  assert.equal(await race.page.locator('#aepLabUsageNotice').count(), 0);
  await race.page.close();

  const retry = await scenario({ loseFirstReply: true });
  await retry.page.goto(origin + '/profile-viewer/profile.html');
  await retry.page.waitForFunction(() => window.__usagePostsReceived === 2);
  assert.equal(retry.posts.length, 2);
  assert.deepEqual(retry.posts[0], retry.posts[1], 'retry must preserve the full event and ID');
  assert.deepEqual(retry.statuses, []);
  await retry.page.close();

  const failure = await scenario({ rejectStatus: 429 });
  await failure.page.goto(origin + '/profile-viewer/profile.html');
  await failure.page.waitForFunction(() => window.__receivedUsageStatus?.code === 'http-429');
  assert.equal(failure.posts.length, 1);
  assert.equal(await failure.page.locator('h1').innerText(), 'Lab fixture');
  assert.deepEqual(failure.errors, []);
  await failure.page.close();

  const login = await scenario({ signedIn: false, onboarding: true });
  await login.page.goto(origin + '/profile-viewer/home-new.html');
  await login.page.waitForFunction(() => window.AepLabUsageTelemetry?.ready);
  assert.equal(await login.page.locator('#aepLabUsageSignInNotice').isVisible(), true,
    'onboarding must disclose collection before credentials are submitted');
  await login.page.locator('#aepAccessOnbSecondaryAuthBtn').click();
  await login.page.locator('#aepAccessOnbEmail').fill(user.email);
  await login.page.locator('#aepAccessOnbPassword').fill('offline-fixture-password');
  const loginResponse = login.page.waitForResponse((response) => response.request().method() === 'POST'
    && response.request().postDataJSON()?.type === 'sign_in');
  await login.page.locator('#aepAccessOnbPrimaryAuthBtn').click();
  await loginResponse;
  assert.equal(login.posts.filter((entry) => entry.type === 'sign_in').length, 1);
  assert.equal(login.posts.filter((entry) => entry.type === 'page_view').length, 1);
  await login.page.evaluate(() => window.__telemetryAuth.repeat());
  assert.equal(login.posts.length, 2);
  assert.deepEqual(login.errors, []);
  await login.page.close();
  const failedLogin = await scenario({ signedIn: false, onboarding: true, loginFails: true });
  await failedLogin.page.goto(origin + '/profile-viewer/home-new.html');
  await failedLogin.page.waitForFunction(() => window.AepLabUsageTelemetry?.ready);
  await failedLogin.page.locator('#aepAccessOnbSecondaryAuthBtn').click();
  await failedLogin.page.locator('#aepAccessOnbEmail').fill(user.email);
  await failedLogin.page.locator('#aepAccessOnbPassword').fill('offline-fixture-password');
  await failedLogin.page.locator('#aepAccessOnbPrimaryAuthBtn').click();
  await failedLogin.page.waitForFunction(() => !document.getElementById('aepAccessOnbPrimaryAuthBtn').disabled);
  assert.equal(failedLogin.posts.length, 0, 'failed password login must not generate telemetry');
  assert.equal(await failedLogin.page.locator('#aepLabUsageNotice').count(), 0);
  assert.deepEqual(failedLogin.errors, []);
  await failedLogin.page.close();
  console.log('OK: offline collection gate, notice, authenticated visits, actual login flow, privacy, retries, reload/BFCache, iframe exclusion and sign-out race');
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
