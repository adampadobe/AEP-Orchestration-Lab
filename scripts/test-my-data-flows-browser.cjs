const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { reference: realReference } = require('../functions/myDataFlowsReference.js');

const root = path.resolve(__dirname, '../web');
const owner = { uid: 'owner-fixture', email: 'apalmer@adobe.com', isAnonymous: false };
const other = { uid: 'other-fixture', email: 'other@example.invalid', isAnonymous: false };
const kinds = ['target', 'configured', 'observed', 'unknown'];
const fixture = {
  ok: true, sandbox: 'apalmer',
  reference: {
    title: 'Private fixture architecture', asOf: '2026-11-10', summary: 'Protected reference summary',
    nodes: ['lab', 'snowflake', 'aep', 'rel', 'profile', 'event'].map(id => ({
      id, label: 'Private ' + id, description: 'Protected explanation for ' + id,
      timing: { kind: 'target', label: 'Illustrative only' },
    })),
    edges: [{ from: 'lab', to: 'snowflake', label: 'Protected shared parent + CRM/events' },
      { from: 'lab', to: 'aep', label: 'Protected direct profiles/events' },
      { from: 'snowflake', to: 'aep', label: 'Protected XDM' },
      { from: 'snowflake', to: 'rel', label: 'Protected REL' }],
    scenarios: ['snowflake-first', 'direct-aep', 'dual-load', 'profile-update', 'event'].map(id => ({
      id, label: id, description: 'Private scenario ' + id,
      steps: kinds.map((kind, i) => ({
        title: id + ' step ' + (i + 1), description: 'Protected step ' + i,
        nodeIds: [['lab'], ['snowflake'], ['aep', 'rel'], ['profile', 'event']][i],
        timing: { kind, label: 'Protected ' + kind + ' timing' },
      })),
    })),
    industries: [{ id: 'fsi', label: 'Protected industry', sourceDescription: 'Shared parent + CRM + events',
      xdmDescription: 'Protected XDM projection', relDatasets: ['Protected ACCOUNT', 'Protected CRM'] }],
    evidence: [{ title: 'Protected evidence', verifiedAt: '2026-11-10', description: '<img src=x onerror=alert(1)>', level: 'observed' }],
    notes: ['Protected notes'],
  },
  live: null,
};
const live = {
  fetchedAt: '2026-11-10T11:00:00Z', complete: false, limitations: ['Fixture partial read'],
  flows: [{ id: 'flow-fixture', name: 'Protected source flow', state: 'enabled', sourceTables: ['PRIVATE_TABLE'], nodeIds: ['aep'],
    datasets: [{ id: 'dataset-fixture', name: 'Protected dataset', profileEnabled: null, schemaId: 'schema-fixture', ocStatus: null }],
    schedule: { frequency: 'minute', interval: 15, backfill: false }, mappings: [{ id: 'mapping-fixture', version: 2 }],
    lastRun: { id: 'run-fixture', state: 'success', startedAt: '2026-11-10T10:00:00Z', completedAt: null,
      readCount: 0, updatedCount: 1, failedCount: 0, deletedCount: 0 } }],
  streaming: [{ industry: 'Protected streaming', configured: true, datasetId: 'stream-fixture', flowId: null, profileEnabled: false }],
  event: { configured: false, datastreamId: null, schemaId: null, datasetName: null },
};
const traceFixture = {
  id: '98b10d61-c9aa-46c1-8c2c-b18a38000001', industry: 'fsi', sandbox: 'apalmer',
  createdAt: new Date(Date.now() - 65000).toISOString(), updatedAt: new Date().toISOString(), state: 'watching',
  identity: { email: 'trace.test.0042@example.invalid', ecid: '1000000042', crmId: 'CRM0042', recipientId: '42' },
  generation: { state: 'committed', detail: 'Source write committed; readback not implied.' },
  stages: ['source', 'rel', 'ingestion', 'aepProfile', 'aepXdm', 'aepRel'].map((id, i) => ({
    id, label: ['Source', 'Relational projection', 'Ingestion', 'AEP Profile', 'AEP XDM', 'AEP REL'][i],
    nodeIds: [['snowflake'], ['rel'], ['aep'], ['profile'], ['event'], ['rel']][i],
    state: i === 0 ? 'verified' : 'waiting', detail: i === 0 ? 'Committed source row read back.' : 'Not observed yet.',
    checkedAt: new Date().toISOString(), verifiedAt: i === 0 ? new Date().toISOString() : null,
    evidence: { count: i === 0 ? 1 : 0 }, queries: [{ label: 'Read ' + id, text: "SELECT '<img src=x onerror=alert(1)>' WHERE recipient_id = '42'" }],
    links: [{ label: 'Unsafe fixture link', href: 'javascript:alert(1)' }, { label: 'Open profile viewer', href: 'profile.html' }],
  })),
  limitations: ['Scheduled ingestion is not an ETA. No sends are performed.'],
};
live.flows.push({ id: 'failed-flow-fixture', name: 'Unavailable registry row', state: 'unknown', nodeIds: ['rel'],
  sourceTables: [], datasets: [], schedule: null, mappings: [], lastRun: null });
live.flows.push({ id: 'completed-flow-fixture', name: 'Completed registry row', state: 'enabled', nodeIds: ['rel'],
  sourceTables: ['REL.ACCOUNT'], datasets: [{ id: 'account-fixture', name: 'Account', profileEnabled: false,
    schemaId: 'account-schema-fixture', ocStatus: 'DDL_APPLIED' }], mappings: [{ id: 'account-mapping-fixture', version: 1 }],
  schedule: { frequency: 'minute', interval: 15, backfill: false },
  lastRun: { id: 'completed-run-fixture', state: 'success', startedAt: '2026-11-10T10:10:47.000Z',
    completedAt: '2026-11-10T10:14:00.662Z', updatedCount: 1 } });

async function main() {
  const server = http.createServer(async (req, res) => {
    try {
      const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const content = await fs.readFile(file);
      res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const errors = [];
    for (const theme of ['light', 'dark']) {
      const navContext = await browser.newContext();
      await navContext.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || url.pathname.endsWith('.js')) return route.fulfill({ body: '' });
        return route.continue();
      });
      await navContext.addInitScript(theme => {
        localStorage.setItem('aepTheme', theme);
        localStorage.setItem('aepMenuPalette', 'ocean');
        localStorage.setItem('aepBgPreset', 'default');
        localStorage.setItem('aepHomeDashboardSidebarTheme', 'light');
      }, theme);
      async function sidebarStyles(file) {
        const page = await navContext.newPage();
        await page.goto(origin + '/profile-viewer/' + file);
        const result = await page.evaluate(() => {
          const sidebar = document.querySelector('.dashboard-sidebar');
          sidebar.innerHTML = '<button class="dashboard-sidebar-toggle">Toggle</button>' +
            '<button class="dashboard-nav-group-toggle" aria-pressed="true">Group</button>' +
            '<button class="aep-theme-toggle-btn">Theme</button>';
          const properties = ['font', 'color', 'backgroundColor', 'border', 'borderRadius', 'padding', 'cursor'];
          return {
            attributes: ['data-aep-theme', 'data-aep-menu-palette', 'data-aep-bg-preset', 'data-ajo-sidebar']
              .map(name => document.documentElement.getAttribute(name)),
            buttons: Array.from(sidebar.querySelectorAll('button'), button => {
              const style = getComputedStyle(button);
              return properties.map(name => style[name]);
            }),
          };
        });
        await page.close();
        return result;
      }
      assert.deepEqual(await sidebarStyles('my-data-flows.html'), await sidebarStyles('consent.html'),
        `Sidebar styles and saved appearance preferences match in ${theme} mode`);
      await navContext.close();
    }
    async function open(user = owner, options = {}) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || (url.pathname.endsWith('.js') && !['my-data-flows.js', 'aep-theme.js'].includes(path.basename(url.pathname)))) {
          return route.fulfill({ contentType: 'text/javascript', body: '' });
        }
        return route.continue();
      });
      await context.addInitScript(({ user, fixture, live, traceFixture, options }) => {
        const listeners = [];
        const auth = { currentUser: null, onAuthStateChanged(callback) { listeners.push(callback); queueMicrotask(() => callback(auth.currentUser)); } };
        window.setFixtureUser = value => {
          auth.currentUser = value && { ...value, getIdToken: async () => {
            if (window.delayToken) await new Promise(resolve => { window.releaseToken = resolve; });
            return 'owner-fixture-token';
          } };
          listeners.forEach(callback => callback(auth.currentUser));
        };
        window.setFixtureUser(user);
        window.firebase = { apps: [{}], auth: () => auth };
        window.requests = [];
        window.fixtureStatus = options.status || 200;
        window.traceRequests = [];
        window.fixtureLive = structuredClone(live);
        window.fixtureTraceRun = options.run ? structuredClone(traceFixture) : null;
        if (options.manual && window.fixtureTraceRun) window.fixtureTraceRun.stages.forEach(stage => {
          if (['aepXdm', 'aepRel'].includes(stage.id)) { stage.state = 'unavailable'; stage.verification = 'manual'; }
          if (stage.id === 'aepProfile') stage.state = 'unavailable';
        });
        if (options.unchecked) window.fixtureTraceRun.stages.forEach(stage => {
          stage.state = 'waiting'; stage.checkedAt = null; stage.verifiedAt = null;
        });
        window.tracePostFailure = !!options.postFailure;
        const nativeFetch = window.fetch;
        window.fetch = async (url, init) => {
          if (String(url).startsWith('/api/architecture/my-data-flows/trace')) {
            const query = new URL(url, location.href).searchParams;
            window.traceRequests.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null,
              authorization: init.headers.Authorization, credentials: init.credentials, cache: init.cache });
            if (init.method === 'POST') {
              const { industry, requestId } = JSON.parse(init.body);
              window.fixtureTraceRun = { ...structuredClone(traceFixture), id: requestId, industry };
            }
            if (window.delayTraceResponse) await new Promise(resolve => { window.releaseTraceResponse = resolve; });
            if (init.method === 'POST' && window.tracePostFailure) throw new TypeError('Fixture unknown outcome');
            if (window.traceReadFailure && init.method === 'GET') throw new TypeError('Fixture receipt offline');
            if (window.traceMissing && init.method === 'GET') return { ok: true, status: 200, json: async () => ({ ok: true, run: null }) };
            if (query.get('refresh') === 'true' && window.fixtureTraceRun && window.traceStates) {
              window.fixtureTraceRun.stages.forEach((stage, i) => { stage.state = window.traceStates[i]; });
              window.fixtureTraceRun.state = window.traceRunState || 'watching';
              window.fixtureTraceRun.updatedAt = new Date().toISOString();
            }
            const response = { ok: true, run: structuredClone(window.fixtureTraceRun),
              ...(init.method === 'GET' ? { prefs: { ready: !options.notReady, settingsHref: 'profile-generation.html' } } : {}) };
            const status = window.traceStatus || 200;
            return { ok: status === 200, status, json: async () => response };
          }
          if (!String(url).startsWith('/api/architecture/my-data-flows?')) return nativeFetch(url, init);
          window.requests.push({ url, method: init.method, credentials: init.credentials, cache: init.cache,
            authorization: init.headers.Authorization, hasSignal: !!init.signal });
          if (window.delayResponse) await new Promise(resolve => { window.releaseResponse = resolve; });
          if (window.rejectRead) throw new TypeError('Fixture offline');
          const response = structuredClone(fixture);
          if (String(url).includes('refresh=true')) response.live = structuredClone(window.fixtureLive);
          if (window.invalidReference) response.reference = null;
          return { ok: window.fixtureStatus === 200, status: window.fixtureStatus, json: async () => response };
        };
      }, { user, fixture: options.real ? { ...fixture, reference: realReference } : fixture, live, traceFixture, options });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/profile-viewer/my-data-flows.html');
      await page.waitForFunction(() => !document.getElementById('flowsStatus').textContent.includes('Checking'));
      return { context, page };
    }
    const { context, page } = await open();
    await page.locator('#flowsResults').waitFor();
    assert.ok(await page.locator('#flowsOverview').isVisible(), 'The architecture opens on a readable aggregate overview');
    assert.equal(await page.locator('.flows-system').count(), 5);
    assert.equal(await page.locator('#flowsPlay').textContent(), 'Play simulation', 'The story never autoplays');
    assert.ok((await page.locator('.flows-system h3').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)))).every(size => size >= 14));
    await page.locator('#flowsScenarios button[data-scenario-id="snowflake-first"]').click();
    await page.locator('#flowsFocusView').click();
    assert.equal(await page.locator('.flows-node').count(), 6);
    assert.equal(await page.locator('.flows-node:not(.flows-concealed)').count(), 1, 'Flow view starts with the first step only');
    assert.equal(await page.locator('.flows-node.flows-concealed').first().evaluate(group => getComputedStyle(group).display), 'none');
    await page.locator('#flowsNext').click();
    assert.equal(await page.locator('.flows-node:not(.flows-concealed)').count(), 2, 'The next step retains the source and reveals its destination');
    assert.equal(await page.locator('.flows-edge:not(.flows-concealed)').count(), 1);
    const revealedPosition = await page.locator('.flows-node[data-node-id="snowflake"]').getAttribute('transform');
    await page.locator('#flowsFullView').click();
    assert.equal(await page.locator('.flows-node:not(.flows-concealed)').count(), 6);
    assert.equal(await page.locator('#flowsProgress').textContent(), 'Step 2 of 4');
    await page.locator('#flowsFocusView').click();
    assert.equal(await page.locator('.flows-node:not(.flows-concealed)').count(), 2);
    assert.equal(await page.locator('.flows-node[data-node-id="snowflake"]').getAttribute('transform'), revealedPosition);
    await page.locator('#flowsPrevious').click();
    assert.equal(await page.locator('#flowsScenarios button').count(), 6, 'The original five scenarios remain alongside the architecture introduction');
    assert.equal(await page.locator('#flowsEvidence img').count(), 0, 'API strings must never become HTML');
    let requests = await page.evaluate(() => window.requests);
    assert.deepEqual(requests[0], { url: '/api/architecture/my-data-flows?sandbox=apalmer', method: 'GET',
      credentials: 'omit', cache: 'no-store', authorization: 'Bearer owner-fixture-token', hasSignal: true });
    assert.equal(requests.length, 1, 'No automatic live request or polling');
    const firstNode = page.locator('.flows-node').first();
    await firstNode.focus(); await page.keyboard.press('Enter');
    assert.match(await page.locator('#flowsInspect').textContent(), /Protected explanation for lab/);
    await page.keyboard.press('Space');
    assert.match(await page.locator('#flowsInspect').textContent(), /Timing target/);
    for (const scenario of fixture.reference.scenarios) {
      await page.locator('#flowsScenarios button').filter({ hasText: scenario.label }).click();
      assert.equal(await page.locator('#flowsProgress').textContent(), 'Step 1 of 4');
      assert.ok(await page.locator('#flowsPrevious').isDisabled());
      for (let i = 0; i < 4; i++) {
        assert.match(await page.locator('#flowsStep').textContent(), new RegExp(scenario.id + ' step ' + (i + 1)));
        assert.equal(await page.locator('.flows-node[data-active=true]').count(), scenario.steps[i].nodeIds.length);
        if (i < 3) await page.locator('#flowsNext').click();
      }
      assert.ok(await page.locator('#flowsNext').isDisabled());
      await page.locator('#flowsPrevious').click();
      assert.equal(await page.locator('#flowsProgress').textContent(), 'Step 3 of 4');
    }
    assert.equal((await page.evaluate(() => window.requests)).length, 1, 'All simulations are local');
    await page.locator('#flowsPlay').click();
    assert.equal(await page.locator('#flowsPlay').textContent(), 'Pause simulation');
    await page.waitForFunction(() => document.getElementById('flowsProgress').textContent === 'Step 4 of 4', null, { timeout: 5000 });
    assert.equal(await page.locator('#flowsPlay').textContent(), 'Play simulation');
    await page.locator('#flowsPlay').click(); await page.locator('#flowsPlay').click();
    assert.equal(await page.locator('#flowsPlay').textContent(), 'Play simulation');
    const initialZoom = await page.locator('#flowsZoom').textContent();
    await page.locator('#flowsZoomIn').click();
    assert.notEqual(await page.locator('#flowsZoom').textContent(), initialZoom);
    await page.locator('#flowsZoomOut').click(); await page.locator('#flowsFit').click();
    await page.locator('#flowsExpand').click();
    assert.equal(await page.locator('#flowsExpand').getAttribute('aria-expanded'), 'true');
    await page.locator('#flowsFullscreen').click();
    assert.ok(await page.locator('#flowsDialog').evaluate(dialog => dialog.open));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'flowsCloseFullscreen');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#flowsDialog').evaluate(dialog => dialog.open), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'flowsFullscreen');
    const light = await page.locator('#flowsDiagramPanel').evaluate(n => getComputedStyle(n).backgroundColor);
    await page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    assert.notEqual(await page.locator('#flowsDiagramPanel').evaluate(n => getComputedStyle(n).backgroundColor), light);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile page must not overflow');
    assert.ok(await page.locator('#flowsMobileStages').isVisible(), 'Mobile uses readable stages, not a shrunken graph');
    await page.locator('#flowsMonitorMode').click();
    await page.locator('#flowsLive').click();
    await page.waitForFunction(() => document.getElementById('flowsLiveStatus').textContent.includes('Partial results'));
    assert.match(await page.locator('#flowsLiveResults').textContent(), /No observations match/, 'A selected unobserved component is not given invented metadata');
    await page.locator('#flowsClearSelection').click();
    assert.match(await page.locator('#flowsLiveResults').textContent(), /Fixture partial read/);
    assert.match(await page.locator('#flowsLiveResults').textContent(), /Configured schedule/);
    assert.match(await page.locator('#flowsLiveResults').textContent(), /Observed last run/);
    assert.match(await page.locator('#flowsLiveResults').textContent(), /Unknown/);
    assert.equal((await page.evaluate(() => window.requests))[1].url, '/api/architecture/my-data-flows?sandbox=apalmer&refresh=true');
    await page.locator('#flowsReload').click();
    await page.waitForFunction(() => document.getElementById('flowsLiveStatus').textContent.includes('not been requested'));
    assert.equal(await page.locator('#flowsMonitorMode').getAttribute('aria-pressed'), 'true', 'The task preference survives a reference reload');
    await page.locator('#flowsSimulationMode').click();
    await page.locator('#flowsPlay').click();
    assert.equal(await page.locator('#flowsPlay').textContent(), 'Pause simulation');
    await page.locator('#flowsFullscreen').click();
    await page.evaluate(() => window.setFixtureUser(null));
    assert.ok(await page.locator('#flowsResults').isHidden());
    assert.equal(await page.locator('#flowsDialog').evaluate(d => d.open), false);
    assert.equal(await page.locator('.flows-node').count(), 0);
    assert.equal(await page.locator('#flowsPlay').textContent(), 'Play simulation');
    assert.doesNotMatch(await page.locator('body').textContent(), /Protected|Private fixture|PRIVATE_TABLE/);
    const requestCount = await page.evaluate(() => window.requests.length);
    await page.evaluate(value => { window.delayToken = true; window.setFixtureUser(value); }, owner);
    await page.waitForFunction(() => !!window.releaseToken);
    await page.evaluate(value => window.setFixtureUser(value), other);
    await page.evaluate(() => { window.delayToken = false; window.releaseToken(); });
    assert.equal(await page.evaluate(() => window.requests.length), requestCount, 'Late token cannot initiate a privileged fetch');
    await page.evaluate(value => window.setFixtureUser(value), owner);
    await page.locator('#flowsResults').waitFor();
    await page.evaluate(() => { window.delayResponse = true; });
    await page.locator('#flowsMonitorMode').click();
    await page.locator('#flowsLive').click();
    await page.waitForFunction(() => !!window.releaseResponse);
    await page.evaluate(value => window.setFixtureUser(value), other);
    await page.evaluate(() => window.releaseResponse());
    assert.ok(await page.locator('#flowsResults').isHidden());
    assert.equal(await page.locator('.flows-node').count(), 0, 'Late ignored-abort response cannot repopulate');
    assert.match(await page.locator('#flowsStatus').textContent(), /restricted/);
    await context.close();
    const denied = await open(other);
    assert.equal((await denied.page.evaluate(() => window.requests)).length, 0);
    assert.ok(await denied.page.locator('#flowsControls').isHidden());
    await denied.context.close();
    const signedOut = await open(null);
    assert.ok(await signedOut.page.locator('#flowsSignIn').isVisible());
    assert.equal((await signedOut.page.evaluate(() => window.requests)).length, 0);
    await signedOut.context.close();
    for (const status of [401, 403, 500]) {
      const failure = await open(owner, { status });
      await failure.page.waitForFunction(() => document.getElementById('flowsStatus').dataset.error === 'true');
      assert.ok(await failure.page.locator('#flowsResults').isHidden());
      assert.equal(await failure.page.locator('.flows-node').count(), 0);
      assert.match(await failure.page.locator('#flowsStatus').textContent(), status === 401 ? /sign-in/ : status === 403 ? /Access denied/ : /HTTP 500/);
      if (status === 401) assert.ok(await failure.page.locator('#flowsSignIn').isVisible());
      await failure.context.close();
    }
    const motion = await open(owner, { reduced: true });
    await motion.page.locator('#flowsResults').waitFor();
    await motion.page.locator('#flowsPlay').click();
    assert.equal(await motion.page.locator('#flowsPlay').textContent(), 'Play simulation');
    assert.equal(await motion.page.locator('#flowsProgress').textContent(), 'Step 1 of 4');
    await motion.page.locator('#flowsNext').click();
    assert.equal(await motion.page.locator('#flowsProgress').textContent(), 'Step 2 of 4');
    await motion.page.evaluate(() => { window.invalidReference = true; });
    await motion.page.locator('#flowsReload').click();
    await motion.page.waitForFunction(() => document.getElementById('flowsStatus').dataset.error === 'true');
    assert.equal(await motion.page.locator('.flows-node').count(), 0);
    await motion.page.evaluate(() => { window.invalidReference = false; window.rejectRead = true; });
    await motion.page.locator('#flowsReload').click();
    await motion.page.waitForFunction(() => document.getElementById('flowsStatus').textContent.includes('Fixture offline'));
    assert.ok(await motion.page.locator('#flowsResults').isHidden());
    await motion.context.close();
    const real = await open(owner, { real: true });
    await real.page.locator('#flowsResults').waitFor();
    assert.equal(await real.page.locator('.flows-node').count(), 15);
    assert.equal(await real.page.locator('.flows-edge').count(), 21);
    assert.equal(await real.page.locator('#flowsIndustries article').count(), 6);
    assert.match(await real.page.locator('#flowsIndustries').textContent(), /rel_fsi_account/);
    if (process.env.MY_DATA_FLOWS_SCREENSHOTS) {
      await fs.mkdir(process.env.MY_DATA_FLOWS_SCREENSHOTS, { recursive: true });
      for (const width of [1440, 390]) {
        await real.page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
        for (const theme of ['light', 'dark']) {
          await real.page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
          await real.page.locator('.flows-intro').evaluate(element => element.scrollIntoView({ block: 'start' }));
          await real.page.screenshot({ path: path.join(process.env.MY_DATA_FLOWS_SCREENSHOTS, `flows-${width}-${theme}.png`), fullPage: true });
          if (width === 1440) {
            await real.page.locator('#flowsDiagramPanel').evaluate(element => element.scrollIntoView({ block: 'start' }));
            await real.page.screenshot({ path: path.join(process.env.MY_DATA_FLOWS_SCREENSHOTS, `flows-workspace-${theme}.png`) });
          }
        }
      }
      await real.page.setViewportSize({ width: 1440, height: 1100 });
      await real.page.evaluate(() => document.documentElement.removeAttribute('data-aep-theme'));
    }
    await real.page.locator('#flowsFocusView').click();
    for (const scenario of realReference.scenarios) {
      await real.page.locator('#flowsScenarios button').filter({ hasText: scenario.label }).click();
      const revealed = new Set(['lab']);
      for (let i = 0; i < scenario.steps.length; i++) {
        scenario.steps[i].nodeIds.forEach(id => revealed.add(id));
        assert.deepEqual((await real.page.locator('.flows-node:not(.flows-concealed)').evaluateAll(nodes => nodes.map(n => n.dataset.nodeId))).sort(),
          [...revealed].sort(), scenario.id + ' reveals only current and earlier steps');
        assert.deepEqual((await real.page.locator('.flows-node[data-active=true]').evaluateAll(nodes => nodes.map(n => n.dataset.nodeId))).sort(),
          [...scenario.steps[i].nodeIds].sort(), scenario.id + ' parallel highlights at step ' + i);
        assert.ok((await real.page.locator('#flowsStep').textContent()).includes(scenario.steps[i].timing.label));
        if (i < scenario.steps.length - 1) await real.page.locator('#flowsNext').click();
      }
    }
    const geometry = await real.page.locator('.flows-node').evaluateAll(nodes => nodes.map(n => {
      const rect = n.getBBox(), matrix = n.transform.baseVal.consolidate().matrix;
      return { x: matrix.e, y: matrix.f, width: rect.width, height: rect.height };
    }));
    geometry.forEach((a, i) => geometry.slice(i + 1).forEach(b =>
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
        'Real reference nodes must not overlap')));
    async function assertReadableDiagram(page) {
      const sizes = await page.locator('.flows-node:not(.flows-concealed) > text:not(.flows-node-status)').evaluateAll(elements =>
        elements.map(element => parseFloat(getComputedStyle(element).fontSize) * element.getScreenCTM().a));
      assert.ok(sizes.length && sizes.every(size => size >= 14), 'Detail labels must remain at least 14 CSS pixels; observed: ' + JSON.stringify(sizes));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Detail scrolling must stay inside the canvas');
    }
    await real.page.locator('#flowsFullView').click();
    await assertReadableDiagram(real.page);
    await real.page.setViewportSize({ width: 2000, height: 1000 });
    await assertReadableDiagram(real.page);
    await real.page.locator('#flowsZoomIn').click();
    const manualWidth = await real.page.locator('#flowsGraph svg').evaluate(svg => svg.getBoundingClientRect().width);
    assert.ok(await real.page.locator('#flowsGraph').evaluate(graph => graph.scrollWidth > graph.clientWidth),
      'Zoom must enlarge the flow beyond its viewport for scrolling');
    await real.page.setViewportSize({ width: 1800, height: 1000 });
    await real.page.waitForTimeout(100);
    assert.equal(await real.page.locator('#flowsGraph svg').evaluate(svg => svg.getBoundingClientRect().width), manualWidth,
      'Resizing must not discard manual zoom below 100%');
    await real.page.locator('#flowsFit').click();
    await assertReadableDiagram(real.page);
    await real.page.locator('#flowsExpand').click();
    await assertReadableDiagram(real.page);
    await real.page.locator('#flowsFullscreen').click();
    await real.page.locator('#flowsZoomIn').click();
    await real.page.locator('#flowsFit').click();
    await assertReadableDiagram(real.page);
    assert.equal(await real.page.locator('.flows-node').count(), 15);
    await real.page.keyboard.press('Escape');
    await real.page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await real.page.locator('#flowsMobileStages').isVisible());
    await real.page.locator('#flowsShowMap').click();
    await real.page.locator('#flowsFit').click();
    assert.ok(await real.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Real model must not overflow mobile page');
    await assertReadableDiagram(real.page);
    await real.page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    await real.page.locator('#flowsMonitorMode').click();
    await real.page.locator('#flowsLive').click();
    await real.page.waitForFunction(() => document.getElementById('flowsLiveStatus').textContent.includes('Partial results'));
    for (const name of ['Protected source flow', 'Completed registry row', 'Unavailable registry row']) {
      await real.page.locator('#flowsLiveResults > details').filter({ hasText: name }).locator('summary').click();
    }
    const liveText = await real.page.locator('#flowsLiveResults').innerText();
    for (const value of ['flow-fixture', 'mapping-fixture (version 2)', 'schema-fixture', 'backfill: false',
      'failed-flow-fixture', 'unknown', '193.662 seconds', 'execution only', 'DDL_APPLIED', 'account-schema-fixture']) {
      assert.ok(liveText.includes(value), 'Real live shape must visibly render ' + value);
    }
    const completed = real.page.locator('#flowsLiveResults > details').filter({ hasText: 'Completed registry row' });
    const counts = await completed.locator('dl').last().evaluate(dl => Object.fromEntries(
      Array.from(dl.querySelectorAll('dt')).map(dt => [dt.textContent, dt.nextElementSibling.textContent])));
    assert.equal(counts.Updated, '1');
    assert.equal(counts.Read, 'Unknown / not recorded');
    assert.equal(counts.Failed, 'Unknown / not recorded');
    assert.equal(counts.Deleted, 'Unknown / not recorded');
    assert.equal(await real.page.locator('#flowsExpand').getAttribute('aria-expanded'), 'true', 'Refreshing observations preserves the diagram viewport');
    await real.page.locator('#flowsExpand').click();
    assert.equal(await real.page.locator('#flowsExpand').getAttribute('aria-expanded'), 'false');
    await real.page.evaluate(() => { window.fixtureStatus = 500; });
    await real.page.locator('#flowsReload').click();
    await real.page.waitForFunction(() => document.getElementById('flowsStatus').dataset.error === 'true');
    assert.equal(await real.page.locator('.flows-node').count(), 0, 'Failure clears expanded real diagram');
    await real.page.evaluate(() => { window.fixtureStatus = 200; });
    await real.page.locator('#flowsReload').click();
    await real.page.locator('#flowsResults').waitFor();
    await real.page.locator('#flowsFullView').click();
    await real.page.locator('#flowsExpand').click();
    await real.page.locator('#flowsFullscreen').click();
    await real.page.evaluate(() => window.setFixtureUser(null));
    assert.equal(await real.page.locator('.flows-node').count(), 0, 'Signout clears expanded fullscreen real diagram');
    assert.equal(await real.page.locator('#flowsDialog').evaluate(d => d.open), false);
    assert.doesNotMatch(await real.page.locator('body').textContent(), /AGENTIC_|rel_fsi_|ACCOUNT end-to-end/);
    await real.context.close();
    const story = await open(owner, { real: true });
    await story.page.locator('#flowsResults').waitFor();
    const positions = await story.page.locator('.flows-node').evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')));
    await story.page.getByRole('button', { name: 'Explore Snowflake', exact: true }).click();
    await assertReadableDiagram(story.page);
    if (process.env.MY_DATA_FLOWS_SCREENSHOTS) {
      await story.page.locator('#flowsDiagramPanel').evaluate(element => element.scrollIntoView({ block: 'start' }));
      await story.page.screenshot({ path: path.join(process.env.MY_DATA_FLOWS_SCREENSHOTS, 'flows-subsystem.png') });
    }
    assert.equal(await story.page.locator('#flowsSubsystemName').textContent(), 'Detail: Snowflake');
    assert.deepEqual(await story.page.locator('.flows-node').evaluateAll(nodes => nodes.map(node => node.getAttribute('transform'))), positions, 'Subsystem detail preserves system geography');
    await story.page.locator('#flowsFullView').click();
    await story.page.locator('#flowsNext').click();
    await story.page.locator('#flowsPlay').click();
    assert.ok(await story.page.locator('.flows-packet').count() > 0, 'Directional packets illustrate the active route only during playback');
    assert.match(await story.page.locator('.flows-packet-label').allTextContents().then(labels => labels.join(' ')), /Relational record|Profile/);
    await story.page.locator('#flowsMotion').uncheck();
    assert.equal(await story.page.locator('.flows-packet').count(), 0, 'Motion can be disabled independently of chapters');
    await story.page.locator('#flowsMotion').check();
    await story.page.locator('#flowsFollow').check();
    await story.page.locator('#flowsZoomIn').click();
    assert.equal(await story.page.locator('#flowsFollow').isChecked(), false, 'Manual navigation disables camera following');
    await story.page.locator('#flowsSpeed').selectOption('2');
    await story.page.locator('#flowsMonitorMode').click();
    assert.equal(await story.page.locator('.flows-packet').count(), 0, 'Operational views never show illustrative packets');
    assert.equal(await story.page.evaluate(() => window.requests.length), 1, 'Changing task views does not refresh pipelines');
    await story.context.close();

    const observations = await open(owner, { run: true, manual: true });
    await observations.page.waitForFunction(() => document.getElementById('flowsTraceIdentity').textContent.includes('CRM0042'));
    await observations.page.locator('#flowsTraceMode').click();
    assert.match(await observations.page.locator('#flowsTraceStages').textContent(), /Manual verification required/);
    assert.match(await observations.page.locator('#flowsTraceStages').textContent(), /Read unavailable/);
    assert.ok(await observations.page.locator('#flowsTraceCreate').isDisabled(), 'Resume an existing identity rather than creating a replacement');
    await observations.page.locator('#flowsMonitorMode').click();
    await observations.page.clock.install();
    await observations.page.evaluate(() => { window.fixtureLive.fetchedAt = new Date().toISOString(); });
    await observations.page.locator('#flowsLive').click();
    await observations.page.waitForFunction(() => document.getElementById('flowsMonitorSummary').textContent.includes('Recent observation'));
    assert.match(await observations.page.locator('#flowsMonitorSummary').textContent(), /Partial snapshot/);
    assert.match(await observations.page.locator('#flowsLiveResults').textContent(), /Successful run · zero input/);
    assert.match(await observations.page.locator('#flowsLiveResults').textContent(), /Read unavailable/);
    assert.equal(await observations.page.locator('.flows-node[data-active=true]').count(), 0);
    await observations.page.locator('#flowsMonitorFilter').selectOption('zero');
    assert.equal(await observations.page.locator('.flows-run-table tbody tr').count(), 1);
    await observations.page.locator('#flowsMonitorFilter').selectOption('all');
    await observations.page.locator('#flowsOverview [data-system="ingestion"] .flows-observation').click();
    assert.equal(await observations.page.locator('.flows-run-table tbody tr').count(), 1, 'Selecting an overview observation filters its reviewed flows');
    await observations.page.locator('#flowsClearSelection').click();
    assert.equal(await observations.page.locator('.flows-run-table tbody tr').count(), 3);
    const countBeforeStale = await observations.page.evaluate(() => window.requests.length);
    await observations.page.clock.runFor(5 * 60000 + 1001);
    assert.match(await observations.page.locator('#flowsMonitorSummary').textContent(), /Stale observation/);
    assert.equal(await observations.page.evaluate(() => window.requests.length), countBeforeStale, 'Freshness expiry never polls');
    await observations.page.evaluate(() => { window.fixtureStatus = 503; });
    await observations.page.locator('#flowsLive').click();
    await observations.page.waitForFunction(() => document.getElementById('flowsStatus').dataset.error === 'true');
    assert.match(await observations.page.locator('#flowsMonitorSummary').textContent(), /Refresh failed.*previous observation/);
    assert.equal(await observations.page.locator('.flows-run-table tbody tr').count(), 3, 'A failed refresh retains, but explicitly marks, previous evidence');
    await observations.page.locator('#flowsTraceMode').click();
    assert.match(await observations.page.locator('#flowsTraceIdentity').textContent(), new RegExp(traceFixture.id), 'Snapshot refreshes never discard the durable identity');
    assert.equal(await observations.page.evaluate(() => window.traceRequests.filter(request => request.method === 'POST').length), 0);
    await observations.page.locator('#flowsMonitorMode').click();
    await observations.page.evaluate(() => { window.fixtureStatus = 403; });
    await observations.page.locator('#flowsLive').click();
    await observations.page.waitForFunction(() => document.getElementById('flowsResults').hidden);
    assert.equal(await observations.page.locator('#flowsOverview').textContent(), '', 'Denied metadata refresh clears every private representation');
    assert.equal(await observations.page.locator('#flowsTraceIdentity').textContent(), '');
    await observations.context.close();

    const trace = await open();
    await trace.page.locator('#flowsResults').waitFor();
    await trace.page.waitForFunction(() => window.traceRequests.length === 1);
    await trace.page.locator('#flowsTraceMode').click();
    assert.equal(await trace.page.locator('.flows-node:not(.flows-concealed)').count(), 1, 'Live without a receipt starts at the Lab');
    assert.ok(await trace.page.locator('#flowsSimulationPanel').isHidden());
    assert.equal(await trace.page.locator('#flowsTraceIndustry option').count(), 6);
    assert.ok(await trace.page.locator('#flowsTraceCreate').isDisabled(), 'Write requires explicit acknowledgement');
    await trace.page.locator('#flowsTraceIndustry').selectOption('retail');
    await trace.page.locator('#flowsTraceConfirm').check();
    await trace.page.locator('#flowsTraceCreate').click();
    await trace.page.waitForFunction(() => document.getElementById('flowsTraceWatch').textContent === 'Stop watching');
    let traceRequests = await trace.page.evaluate(() => window.traceRequests);
    const post = traceRequests.find(request => request.method === 'POST');
    assert.equal(post.body.industry, 'retail');
    assert.match(post.body.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(post.credentials, 'omit');
    assert.equal(post.cache, 'no-store');
    assert.equal(traceRequests.filter(request => request.method === 'POST').length, 1);
    assert.match(await trace.page.locator('#flowsTraceIdentity').textContent(), /trace.test.0042@example.invalid/);
    assert.match(await trace.page.locator('#flowsTraceIdentity').textContent(), /Source write committed; readback not implied/);
    assert.match(await trace.page.locator('#flowsTraceElapsed').textContent(), /Elapsed since creation: 1m/);
    assert.equal(await trace.page.locator('.flows-node[data-active=true]').count(), 0, 'No simulated highlights in Live');
    assert.equal(await trace.page.locator('.flows-node[data-live-state=verified]').count(), 1);
    assert.equal(await trace.page.locator('.flows-node[data-live-state=waiting]').count(), 4);
    await trace.page.locator('#flowsTraceStages details summary').first().click();
    assert.match(await trace.page.locator('#flowsTraceStages').textContent(), /Unexecuted templates and placeholders must be adapted/);
    assert.match(await trace.page.locator('#flowsTraceStages pre').first().textContent(), /"count": 1/);
    assert.equal(await trace.page.locator('#flowsTraceStages img').count(), 0);
    assert.equal(await trace.page.locator('#flowsTraceStages a[href^="javascript:"]').count(), 0);
    await trace.page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => { window.copiedQuery = value; },
    } }));
    await trace.page.locator('#flowsTraceStages button').first().click();
    assert.equal(await trace.page.evaluate(() => window.copiedQuery), traceFixture.stages[0].queries[0].text);
    const traceLight = await trace.page.locator('#flowsDiagramPanel').evaluate(n => getComputedStyle(n).backgroundColor);
    await trace.page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    assert.notEqual(await trace.page.locator('#flowsDiagramPanel').evaluate(n => getComputedStyle(n).backgroundColor), traceLight);
    await trace.page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await trace.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Live queries and controls must fit mobile');
    await trace.page.locator('#flowsTraceWatch').click();
    assert.match(await trace.page.locator('#flowsTraceStatus').textContent(), /Watching stopped/);
    const stoppedCount = await trace.page.evaluate(() => window.traceRequests.length);
    await trace.page.clock.install();
    await trace.page.clock.runFor(65000);
    assert.equal(await trace.page.evaluate(() => window.traceRequests.length), stoppedCount, 'Stop cancels read timers');
    await trace.page.evaluate(() => { window.traceStates = ['verified', 'verified', 'checking', 'unavailable', 'failed', 'not_applicable']; });
    await trace.page.locator('#flowsTraceCheck').click();
    await trace.page.waitForFunction(() => document.querySelectorAll('#flowsTraceStages [data-state=failed]').length === 1);
    assert.equal(await trace.page.locator('.flows-node[data-live-state=failed]').count(), 1);
    assert.equal(await trace.page.locator('.flows-node[data-live-state=checking]').count(), 1);
    assert.equal(await trace.page.locator('.flows-node[data-live-state=unavailable]').count(), 1);
    await trace.page.locator('#flowsTraceWatch').click();
    await trace.page.waitForFunction(() => window.traceRequests.length >= 4);
    await trace.page.clock.runFor(30001);
    assert.ok(await trace.page.evaluate(() => window.traceRequests.length >= 5), 'Watching polls by GET');
    await trace.page.locator('#flowsTraceWatch').click();
    assert.match(await trace.page.locator('#flowsTraceIdentity').textContent(), new RegExp(post.body.requestId));
    await trace.page.evaluate(() => { window.delayTraceResponse = true; });
    await trace.page.locator('#flowsTraceCheck').click();
    await trace.page.waitForFunction(() => !!window.releaseTraceResponse);
    await trace.page.evaluate(() => window.setFixtureUser(null));
    await trace.page.evaluate(() => window.releaseTraceResponse());
    assert.equal(await trace.page.locator('#flowsTraceStages').textContent(), '');
    assert.equal(await trace.page.locator('#flowsTraceIdentity').textContent(), '');
    assert.ok(await trace.page.locator('#flowsResults').isHidden());
    await trace.context.close();
    const progressiveLive = await open(owner, { run: true, unchecked: true });
    await progressiveLive.page.waitForFunction(() => document.getElementById('flowsTraceIdentity').textContent.includes('CRM0042'));
    await progressiveLive.page.locator('#flowsTraceMode').click();
    assert.equal(await progressiveLive.page.locator('.flows-node:not(.flows-concealed)').count(), 1);
    await progressiveLive.page.evaluate(() => {
      window.traceStates = ['verified', 'checking', 'waiting', 'waiting', 'unavailable', 'waiting'];
    });
    await progressiveLive.page.locator('#flowsTraceCheck').click();
    await progressiveLive.page.waitForFunction(() => document.querySelectorAll('#flowsTraceStages [data-state=checking]').length === 1);
    assert.deepEqual((await progressiveLive.page.locator('.flows-node:not(.flows-concealed)').evaluateAll(nodes => nodes.map(n => n.dataset.nodeId))).sort(),
      ['lab', 'snowflake', 'rel', 'event'].sort(), 'Live reveals checks and unavailable systems, not untouched waiting destinations');
    assert.equal(await progressiveLive.page.locator('.flows-node[data-node-id="event"]').getAttribute('data-live-state'), 'unavailable');
    await progressiveLive.page.evaluate(() => { window.traceStates = Array(6).fill('waiting'); });
    await progressiveLive.page.locator('#flowsTraceCheck').click();
    await progressiveLive.page.waitForFunction(() => document.querySelectorAll('#flowsTraceStages [data-state=waiting]').length === 6);
    assert.equal(await progressiveLive.page.locator('.flows-node:not(.flows-concealed)').count(), 4, 'Previously checked systems remain visible');
    await progressiveLive.context.close();
    const resumed = await open(owner, { run: true });
    await resumed.page.locator('#flowsResults').waitFor();
    await resumed.page.waitForFunction(() => document.getElementById('flowsTraceIdentity').textContent.includes('CRM0042'));
    await resumed.page.reload();
    await resumed.page.locator('#flowsResults').waitFor();
    await resumed.page.waitForFunction(() => document.getElementById('flowsTraceIdentity').textContent.includes('CRM0042'));
    await resumed.page.locator('#flowsTraceMode').click();
    assert.match(await resumed.page.locator('#flowsTraceIdentity').textContent(), new RegExp(traceFixture.id));
    assert.equal(await resumed.page.evaluate(() => window.traceRequests.filter(request => request.method === 'POST').length), 0);
    await resumed.page.clock.install();
    await resumed.page.evaluate(() => { window.delayTraceResponse = true; });
    await resumed.page.locator('#flowsTraceWatch').click();
    await resumed.page.waitForFunction(() => !!window.releaseTraceResponse);
    const blockedCount = await resumed.page.evaluate(() => window.traceRequests.length);
    await resumed.page.clock.runFor(65000);
    assert.equal(await resumed.page.evaluate(() => window.traceRequests.length), blockedCount, 'Polling must never overlap a pending read');
    await resumed.page.locator('#flowsTraceWatch').click();
    await resumed.page.evaluate(() => { window.delayTraceResponse = false; window.releaseTraceResponse(); });
    await resumed.page.locator('#flowsTraceWatch').click();
    await resumed.page.clock.runFor(30 * 60 * 1000 + 1000);
    assert.equal(await resumed.page.locator('#flowsTraceWatch').textContent(), 'Resume watching');
    assert.match(await resumed.page.locator('#flowsTraceStatus').textContent(), /30 minutes/);
    const boundedCount = await resumed.page.evaluate(() => window.traceRequests.length);
    await resumed.page.clock.runFor(65000);
    assert.equal(await resumed.page.evaluate(() => window.traceRequests.length), boundedCount, 'Thirty-minute limit must stop timers');
    assert.equal(await resumed.page.evaluate(() => window.traceRequests.filter(request => request.method === 'POST').length), 0);
    await resumed.context.close();

    for (const postFailure of [false, true]) {
      const recovery = await open(owner, { postFailure });
      await recovery.page.locator('#flowsResults').waitFor();
      await recovery.page.locator('#flowsTraceMode').click();
      await recovery.page.waitForFunction(() => window.traceRequests.length === 1);
      if (!postFailure) await recovery.page.evaluate(() => { window.delayTraceResponse = true; });
      await recovery.page.locator('#flowsTraceConfirm').check();
      await recovery.page.locator('#flowsTraceCreate').click();
      if (!postFailure) {
        await recovery.page.waitForFunction(() => !!window.releaseTraceResponse);
        await recovery.page.evaluate(value => window.setFixtureUser(value), other);
        await recovery.page.evaluate(() => window.releaseTraceResponse());
        assert.ok(await recovery.page.locator('#flowsResults').isHidden());
        assert.equal(await recovery.page.locator('#flowsTraceIdentity').textContent(), '', 'Late POST cannot restore identity after account switch');
      } else {
        await recovery.page.waitForFunction(() => document.getElementById('flowsTraceIdentity').textContent.includes('trace.test'));
        const requests = await recovery.page.evaluate(() => window.traceRequests);
        assert.equal(requests.filter(request => request.method === 'POST').length, 1, 'Unknown POST outcome must never repeat creation');
        const id = requests.find(request => request.method === 'POST').body.requestId;
        assert.ok(requests.some(request => request.method === 'GET' && request.url.endsWith('?runId=' + id)), 'Recover exact receipt by GET');
        assert.match(await recovery.page.locator('#flowsTraceIdentity').textContent(), /CRM0042/);
      }
      await recovery.context.close();
    }
    const unknown = await open(owner, { postFailure: true });
    await unknown.page.locator('#flowsResults').waitFor();
    await unknown.page.locator('#flowsTraceMode').click();
    await unknown.page.waitForFunction(() => window.traceRequests.length === 1);
    await unknown.page.evaluate(() => { window.traceMissing = true; });
    await unknown.page.locator('#flowsTraceConfirm').check();
    await unknown.page.locator('#flowsTraceCreate').click();
    await unknown.page.waitForFunction(() => document.getElementById('flowsTraceStatus').textContent.includes('No automatic retry. Check now'));
    assert.ok(await unknown.page.locator('#flowsTraceCreate').isDisabled());
    await unknown.page.evaluate(() => { window.traceMissing = false; });
    await unknown.page.locator('#flowsTraceCheck').click();
    await unknown.page.waitForFunction(() => document.getElementById('flowsTraceIdentity').textContent.includes('trace.test'));
    assert.equal(await unknown.page.evaluate(() => window.traceRequests.filter(request => request.method === 'POST').length), 1);
    await unknown.context.close();
    for (const status of [401, 403]) {
      const deniedTrace = await open(owner, { run: true });
      await deniedTrace.page.locator('#flowsResults').waitFor();
      await deniedTrace.page.locator('#flowsTraceMode').click();
      await deniedTrace.page.waitForFunction(() => document.getElementById('flowsTraceIdentity').textContent.includes('trace.test'));
      await deniedTrace.page.evaluate(value => { window.traceStatus = value; }, status);
      await deniedTrace.page.locator('#flowsTraceCheck').click();
      await deniedTrace.page.waitForFunction(() => /Sign in again|Access denied/.test(document.getElementById('flowsTraceStatus').textContent));
      assert.equal(await deniedTrace.page.locator('#flowsTraceIdentity').textContent(), '');
      assert.ok(await deniedTrace.page.locator('#flowsTraceCheck').isDisabled());
      await deniedTrace.context.close();
    }
    const notReady = await open(owner, { notReady: true });
    await notReady.page.locator('#flowsResults').waitFor();
    await notReady.page.locator('#flowsTraceMode').click();
    await notReady.page.locator('#flowsTraceSettings').waitFor();
    await notReady.page.locator('#flowsTraceConfirm').check();
    assert.ok(await notReady.page.locator('#flowsTraceCreate').isDisabled());
    await notReady.context.close();
    const nav = await fs.readFile(path.join(root, 'profile-viewer/aep-lab-nav.js'), 'utf8');
    assert.match(nav, /group: 'Architecture'[\s\S]*?label: 'My data flows',[\s\S]*?onlyUserEmails: \['apalmer@adobe.com'\]/);
    const navEntry = nav.slice(nav.indexOf("label: 'My data flows'"), nav.indexOf("label: 'AEP & Apps'"));
    assert.doesNotMatch(navEntry, /inDevelopment/);
    assert.deepEqual(errors, []);
    console.log('PASS My data flows: simulations/fullscreen/themes/mobile, owner auth, live create-once, evidence/query copy, readback states, polling/stop/resume, identity persistence, unknown outcome recovery and late GET/POST signout protection. All APIs mocked.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
