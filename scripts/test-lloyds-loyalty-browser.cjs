const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const { createPreviewServer } = await import('./preview-cp-decisioning.mjs');
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const errors = [], writes = [], reads = [];
    let quantity = 0, rejectState = false, missingState = false, namespace = 'Email', releaseState, stateStarted;
    let holdState = false, events = [];
    await context.addInitScript(() => { localStorage.setItem('aepDemoNavOwnerHandle', 'kirkham'); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data = { ok: true };
      if (url.pathname === '/api/aep') {
        assert.equal(request.postDataJSON().method, 'GET', 'Platform proxy requests remain read-only');
        data = { status: 200, platform_response: { sandboxes: [
        { name: 'demo-one', title: 'Demo one', type: 'development', state: 'active' },
        { name: 'demo-two', title: 'Demo two', type: 'development', state: 'active' },
        ] } };
      }
      else if (url.pathname === '/api/profile/table') data = { found: true, ecid: '12345678901234567890123456789012345678',
        profileEmail: url.searchParams.get('identifier'), rows: [
          { path: 'person.name.firstName', value: 'Alex', valueType: 'string' },
          { path: '_ownTenant.loyaltyDetails.points', value: 0, valueType: 'number' },
          { path: '_ownTenant.loyaltyDetails.level', value: 'Gold', valueType: 'string' },
          { path: '_ownTenant.scoring.npsScore', value: 0, valueType: 'number' },
          { path: 'consents.marketing.email.val', value: 'n', valueType: 'string' },
        ] };
      else if (url.pathname === '/api/profile/consent') data = { found: true, firstName: 'Alex', email: 'fixture@example.invalid',
        ecid: '12345678901234567890123456789012345678', channels: { email: 'out', sms: null, push: null } };
      else if (url.pathname === '/api/profile/events') data = { events };
      else if (url.pathname === '/api/profile/audiences') data = { realized: [], exited: [] };
      else if (url.pathname === '/api/env-bar-config') data = { config: null };
      else if (url.pathname === '/api/events/generator-targets') data = { targets: [] };
      else if (url.pathname === '/api/tags/reactor' || url.pathname === '/api/events/datastreams') data = { data: [] };
      else if (url.pathname === '/api/image-hosting/library') data = { items: [] };
      else if (url.pathname === '/api/ajo-loyalty') {
        assert.equal(request.method(), 'GET');
        assert.equal(request.headers().authorization, 'Bearer offline-fixture');
        reads.push(Object.fromEntries(url.searchParams));
        if (url.searchParams.get('action') === 'config') data = { ok: true, data: { namespace } };
        else {
          if (holdState) await new Promise(resolve => { releaseState = resolve; stateStarted(); });
          if (rejectState) return route.fulfill({ status: 403, json: { ok: false, error: 'Fixture: no active enrollment for this sandbox' } });
          data = { ok: true, data: missingState ? {} : { challengeList: [{
            challenge_id: 'challenge-fixture', challengeName: 'Everyday rewards (offline fixture)', state: 'active',
            optedIn: false, tasksToComplete: 2, challengeCompletions: [],
            tasks: [
              { taskId: 'purchase', taskName: 'Make three purchases', taskState: quantity === 3 ? 'completed' : 'incomplete',
                variables: { goal: 3, type: 'qty' }, accumulators: { qty: quantity }, taskCompletions: ['previous-cycle'] },
              { taskId: 'saving', taskName: 'Savings goal', taskState: 'incomplete',
                variables: { goal: 100, type: 'spend' }, accumulators: {} },
            ],
          }] } };
        }
      } else if (request.method() !== 'GET') writes.push(url.pathname);
      return route.fulfill({ json: data });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/profile-viewer/lloyds-loyalty-demo.html');
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Select a confirmed state region'));
    await page.evaluate(() => {
      window.AepGlobalSandbox.setSelected('demo-one');
      window.AepLabSandboxSync.getAuthHeaders = async () => ({ Authorization: 'Bearer offline-fixture' });
    });
    assert.equal(await page.locator('#sandboxSelect').isDisabled(), false, 'Sandbox is never pinned to the page author');
    assert.equal(await page.locator('#ContentCardContainer').count(), 1);
    await page.locator('[data-subgroup="demoLloyds"]').waitFor();
    assert.equal(await page.locator('[data-subgroup="demoLloyds"] a[href="lloyds-loyalty-demo.html"]').count(), 1);
    await page.locator('#loyaltyRegion').selectOption('nld2');
    await page.locator('#loyaltyTenant').fill('_ownTenant');
    await page.locator('#customerEmail').fill('fixture@example.invalid');
    await page.locator('#queryProfileBtn').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Member task state loaded'));
    assert.match(await page.locator('#loyaltyTasks').textContent(), /Opted in: false/);
    assert.match(await page.locator('#loyaltyTasks').textContent(), /0 of 3/);
    assert.equal(await page.locator('.loyalty-task progress').count(), 1, 'Missing accumulator is never fabricated as zero');
    assert.equal(await page.locator('.loyalty-task[data-complete="true"]').count(), 0, 'Previous-cycle completions do not complete current tasks');
    await page.waitForFunction(() => document.getElementById('tuiPhSignal-points')?.textContent === '0');
    assert.equal(await page.locator('#tuiPhSignal-emailConsent').textContent(), 'n');
    assert.equal(await page.locator('#tuiPhSignal-tier').textContent(), 'Gold');
    assert.equal(await page.locator('#tuiPhSignal-nps').textContent(), '0');
    assert.equal(await page.locator('#tuiProfileHero').getAttribute('aria-label'), 'Loaded Loyalty profile');
    assert.ok(reads.some(read => read.action === 'profile_state' && read.profile_id === 'fixture@example.invalid' && read.region === 'nld2' && read.sandbox === 'demo-one'));
    await page.evaluate(() => {
      const surface = document.getElementById('loyaltySurface').value;
      window.__sdkCalls = [];
      window.alloy = async (command, payload) => {
        window.__sdkCalls.push({ command, payload });
        if (command === 'getIdentity') {
          if (window.__pauseIdentity) await new Promise(resolve => { window.__releaseDecision = resolve; });
          return { identity: { ECID: '12345678901234567890123456789012345678' } };
        }
        if (payload.xdm?.eventType?.startsWith('decisioning.proposition')) return {};
        const proposition = (id, scope, rank) => ({ id, scope, scopeDetails: { decisionProvider: 'CJM', rank }, items: [{
          id: 'item-' + id, name: 'Loyalty offer fixture', itemSelection: { selectionDetail: { strategyID: 'strategy-fixture' } },
          data: { rules: [{ consequences: [{ id: 'consequence-' + id, detail: { data: {
            contentType: 'application/json', content: { title: { content: '<b>Your rewards</b>' }, body: { content: 'Synthetic browser fixture, not a live offer.' },
              buttons: [{ id: 'see-tasks', text: { content: 'See my tasks' }, actionUrl: '#loyalty-challenges' }] },
          } } }] }] },
        }] });
        return { propositions: [proposition('hero', surface.replace('ContentCardContainer', 'hero-banner'), 999), proposition('card', surface, 1)] };
      };
      window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: 'reviewed-fixture-stream' } });
      const toggle = document.getElementById('siteCloneDecisioningEnabledToggle');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('original proposition display accepted'));
    assert.equal(await page.locator('#ContentCardContainer h3').textContent(), '<b>Your rewards</b>');
    assert.equal(await page.locator('#ContentCardContainer h3 b').count(), 0, 'Incoming copy is text, never executable HTML');
    const calls = await page.evaluate(() => window.__sdkCalls);
    const display = calls.find(call => call.payload?.xdm?.eventType === 'decisioning.propositionDisplay').payload;
    assert.equal(display.xdm._experience.decisioning.propositions[0].id, 'card');
    assert.equal(display.xdm._experience.decisioning.propositions[0].items[0].id, 'item-card');
    assert.equal(display.xdm._experience.decisioning.propositions[0].items[0].itemSelection.selectionDetail.strategyID, 'strategy-fixture');
    assert.equal(display.edgeConfigOverrides.datastreamId, 'reviewed-fixture-stream');
    assert.equal(display.xdm.identityMap.Email[0].id, 'fixture@example.invalid');
    assert.equal(display.xdm._ownTenant.identification.core.ecid, display.xdm.identityMap.ECID[0].id);
    const decision = calls.find(call => call.payload?.personalization?.surfaces)?.payload;
    assert.deepEqual(decision.personalization.surfaces, [origin.replace('http:', 'web:') + '/profile-viewer/lloyds-loyalty-demo.html#ContentCardContainer']);
    await page.locator('#ContentCardContainer button').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Proposition interaction accepted'));
    assert.match(await page.locator('#loyaltyTasks').textContent(), /0 of 3/, 'A successful card interaction does not advance tasks locally');
    quantity = 3;
    await page.waitForFunction(() => document.querySelectorAll('.loyalty-task[data-complete="true"]').length === 1,
      null, { timeout: 35000 });
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollHeight -
      (document.querySelector('.loyalty-workspace').getBoundingClientRect().bottom + scrollY) < 100),
    'Navigation chrome must not add an extra empty viewport below the page');
    if (process.env.AEP_LOYALTY_SCREENSHOT) {
      await page.evaluate(() => { window.scrollTo(0, 0); document.documentElement.removeAttribute('data-aep-theme'); });
      await page.screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT });
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
      assert.ok(await page.locator('.loyalty-hero').isVisible());
      assert.notEqual(await page.locator('.loyalty-hero').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('.loyalty-columns').evaluate(node => node.getBoundingClientRect().right <= innerWidth + 1), 'Cards fit a mobile viewport');
    assert.ok(await page.locator('#loyaltyRun,#loyaltyRefresh').evaluateAll(nodes =>
      nodes.every(node => node.getBoundingClientRect().right <= innerWidth + 1)), 'Action buttons remain on screen on mobile');
    await page.setViewportSize({ width: 1500, height: 1100 });
    rejectState = true;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('no active enrollment'));
    assert.match(await page.locator('#loyaltyUpdated').textContent(), /stale/);
    rejectState = false; missingState = true;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Malformed Loyalty state'));
    missingState = false; namespace = 'LoyaltyMemberID';
    const before = reads.filter(read => read.action === 'profile_state').length;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('cannot be inferred'));
    assert.equal(reads.filter(read => read.action === 'profile_state').length, before, 'Namespace mismatch never sends a guessed member ID');
    namespace = 'Email'; holdState = true;
    const pendingState = new Promise(resolve => { stateStarted = resolve; });
    await page.locator('#loyaltyRefresh').click();
    await Promise.race([pendingState, new Promise((_, reject) => {
      const timeout = setTimeout(() => reject(new Error('Delayed state fixture was not requested')), 15000);
      pendingState.then(() => clearTimeout(timeout));
    })]);
    if (!await page.locator('#customerEmail').isVisible()) await page.locator('#aepLabEnvMinimizeBtn').click();
    await page.locator('#customerEmail').fill('other@example.invalid');
    holdState = false; releaseState?.();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await page.locator('#ContentCardContainer article').count(), 0);
    assert.equal(await page.locator('.loyalty-task').count(), 0, 'Stale response cannot refill a different identity');
    assert.match(await page.locator('#tuiPhName').textContent(), /No profile loaded|Not loaded/);
    await page.locator('#queryProfileBtn').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Member task state loaded'));
    const displayedBefore = await page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.xdm?.eventType === 'decisioning.propositionDisplay').length);
    const decisionsBefore = await page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.personalization?.surfaces).length);
    await page.evaluate(() => { window.__pauseIdentity = true; });
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => typeof window.__releaseDecision === 'function' ||
      document.getElementById('loyaltyStatus').dataset.error === 'true');
    assert.equal(await page.evaluate(() => typeof window.__releaseDecision), 'function', await page.locator('#loyaltyStatus').textContent());
    if (!await page.locator('#customerEmail').isVisible()) await page.locator('#aepLabEnvMinimizeBtn').click();
    await page.locator('#customerEmail').fill('third@example.invalid');
    await page.evaluate(() => { window.__pauseIdentity = false; window.__releaseDecision(); });
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await page.locator('#ContentCardContainer article').count(), 0);
    assert.equal(await page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.xdm?.eventType === 'decisioning.propositionDisplay').length),
      displayedBefore, 'A stale SDK response must not render or send a display event for the new identity');
    assert.equal(await page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.personalization?.surfaces).length),
      decisionsBefore, 'Identity changes during SDK lookup must block the Edge decision before dispatch');
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('demo-two'));
    assert.equal(await page.locator('#loyaltyRegion').inputValue(), '');
    assert.equal(await page.locator('#loyaltyTenant').inputValue(), '');
    await page.locator('#loyaltyRegion').selectOption('va7');
    if (!await page.locator('#customerEmail').isVisible()) await page.locator('#aepLabEnvMinimizeBtn').click();
    await page.locator('#queryProfileBtn').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Member task state loaded'));
    assert.ok(reads.some(read => read.action === 'profile_state' && read.sandbox === 'demo-two' &&
      read.region === 'va7' && read.profile_id === 'third@example.invalid'));
    assert.deepEqual(errors, []);
    assert.ok(writes.every(path => path === '/api/lab/env-bar-preferences'),
      'Only shared personal display preferences may be saved; no profile, event-generator or Adobe mutations');
    console.log('Lloyds Loyalty browser checks passed (offline synthetic fixtures only).');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
