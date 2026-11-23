const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const { createPreviewServer } = await import('./preview-cp-decisioning.mjs');
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const customer of ['lloyds', 'jet2']) {
      const context = await browser.newContext({ viewport: { width: 1800, height: 1100 }, reducedMotion: 'reduce' });
      const errors = [], writes = [];
      const task = { taskId: 'generic-spend-task', taskName: 'Generic Spend', taskType: 'purchase', taskClass: 'spend',
        taskState: 'incomplete', variables: { spendMin: 50, include: { valuesSet: ['*'] } } };
      const spendChallenge = { challenge_id: 'spend-fixture', challengeName: 'Unrelated title', state: 'active', optedIn: true, tasks: [task] };
      const nonSpend = { challenge_id: 'non-spend-fixture', challengeName: 'Unrelated title', state: 'active', optedIn: true,
        tasks: [{ ...task, taskClass: 'purchase', accumulators: { spend: 40 } }] };
      const available = { ...spendChallenge, challenge_id: 'available-fixture', optedIn: false,
        tasks: [{ ...task, accumulators: { spend: 30 } }] };
      let state = [spendChallenge, nonSpend, available], definition = task;
      await context.addInitScript(() => localStorage.setItem('aepDemoNavOwnerHandle', 'kirkham'));
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.fulfill({ contentType: 'text/javascript', body: '' });
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = { ok: true };
        if (url.pathname === '/api/aep') data = { status: 200, platform_response: { sandboxes: [
          { name: 'kirkham', title: 'Fixture', type: 'development', state: 'active' },
        ] } };
        else if (request.method() !== 'GET') writes.push(url.pathname);
        else if (url.pathname === '/api/profile/table') data = { found: true, profileEmail: url.searchParams.get('identifier'),
          ecid: '12345678901234567890123456789012345678', rows: [
            { path: 'testProfile', value: true, valueType: 'boolean' },
            { path: '_demoemea.identification.core.loyaltyId', value: 'presentation-member', valueType: 'string' },
          ] };
        else if (url.pathname === '/api/ajo-loyalty') {
          const action = url.searchParams.get('action');
          data = { ok: true, data: action === 'config' ? { namespace: 'loyaltyId' } : action === 'challenge_get'
            ? { _id: url.searchParams.get('challenge_id'), name: 'Definition', tasks: [definition] } : { challengeList: state } };
        } else if (url.pathname === '/api/env-bar-config') data = { config: null };
        else if (url.pathname === '/api/profile/consent') data = { found: true, channels: {} };
        else if (url.pathname === '/api/profile/events') data = { events: [] };
        else if (url.pathname === '/api/profile/audiences') data = { realized: [], exited: [] };
        else if (url.pathname === '/api/events/generator-targets') data = { targets: [] };
        else if (url.pathname === '/api/image-hosting/library') data = { items: [] };
        else if (url.pathname === '/api/tags/reactor' || url.pathname === '/api/events/datastreams') data = { data: [] };
        return route.fulfill({ json: data });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/profile-viewer/' + customer + '-loyalty-demo.html');
      await page.waitForFunction(() => document.getElementById('loyaltyStatus')?.textContent.includes('SDK injection is only needed'));
      assert.equal(await page.locator('.loyalty-offer-inspector').evaluate(element => element.open), false);
      await page.locator('.loyalty-offer-inspector > summary').press('Enter');
      assert.equal(await page.locator('#loyaltyReturnedOffers').isVisible(), true);
      await page.locator('.loyalty-offer-inspector > summary').press('Enter');
      assert.equal(await page.locator('#loyaltyReturnedOffers').isVisible(), false);
      await page.evaluate(() => {
        window.AepGlobalSandbox.setSelected('kirkham');
        window.__tracking = []; window.__interactions = [];
        window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: 'fixture-stream' } });
        window.alloy = async (command, options) => {
          if (command === 'getIdentity') return { identity: { ECID: '12345678901234567890123456789012345678' } };
          if (command === 'subscribeRulesetItems') { window.__subscription = options; return; }
          if (command !== 'sendEvent') return {};
          if (options.xdm?.eventType === 'decisioning.propositionInteract') window.__interactions.push(options);
          if (options.personalization?.surfaces?.[0]?.endsWith('#featured-offers')) return { propositions: [] };
          if (options.personalization?.surfaces && window.__subscription) {
            window.__cards = ['spend-fixture', 'non-spend-fixture', 'available-fixture', null].map((challengeId, index) => ({
              id: 'proposition-' + index, scope: window.__subscription.surfaces[0],
              scopeDetails: { decisionProvider: 'AJO', rank: 4 - index, correlationID: 'correlation-' + index },
              items: [{ id: 'item-' + index, schema: 'https://ns.adobe.com/personalization/message/content-card',
                data: { content: { title: 'Identical title', body: 'Adobe body ' + index,
                  buttons: [{ text: { content: 'Join Challenge' }, interactId: 'joinChallenge' }] },
                  meta: challengeId ? { challengeId } : {} } }],
            }));
            window.__subscription.callback({ propositions: window.__cards }, async (type, selected) => window.__tracking.push({ type, selected }));
          }
          return { propositions: [] };
        };
      });
      if (!await page.locator('#customerEmail').isVisible()) await page.locator('#aepLabEnvMinimizeBtn').click();
      await page.locator('#customerEmail').fill('presentation@example.invalid');
      await page.locator('#queryProfileBtn').click();
      await page.waitForFunction(() => document.querySelectorAll('#ContentCardContainerLoyalty article').length === 4 &&
        !document.getElementById('queryProfileBtn').disabled);
      await page.mouse.move(0, 0);
      await page.locator('#profileHoverZone').dispatchEvent('mouseleave');
      if (await page.locator('#customerEmail').isVisible()) await page.locator('#aepLabEnvMinimizeBtn').click();
      await page.locator('.loyalty-phone-nav [data-phone-view="rewards"]').click();
      const card = page.locator('#ContentCardContainerLoyalty [data-proposition-id="proposition-0"]');
      const refresh = async () => {
        await page.locator('#loyaltyRefresh').click();
        await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed') &&
          !document.getElementById('queryProfileBtn').disabled);
      };
      assert.equal(await card.locator('.loyalty-customer-spend').count(), 0, 'Missing accumulator is not zero');
      assert.equal(await card.locator('[data-interact-id="joinChallenge"]').textContent(), 'Challenge Already Joined');
      await page.evaluate(() => {
        window.__originalViewport = document.getElementById('loyaltyChallengeCarousel');
        window.__originalCard = document.querySelector('[data-proposition-id="proposition-0"]');
        window.__displayCount = window.__tracking.length;
      });
      for (const value of [0, 20, 30, 40, 50]) {
        task.accumulators = { spend: value };
        await refresh();
        assert.equal(await card.locator('.loyalty-customer-spend b').textContent(), `£${value} spent · £${50 - value} to go`);
        assert.equal(await card.locator('.loyalty-customer-spend progress').evaluate(meter => meter.value), value * 2);
        assert.match(await page.locator('#loyaltyTasks [data-challenge-id="spend-fixture"]').textContent(), new RegExp('£' + value + ' spent'));
        assert.equal(await card.locator('[data-interact-id="joinChallenge"]').isVisible(), false);
        assert.equal(await card.locator('.loyalty-customer-spend').getAttribute('data-complete'), 'false',
          'Reaching £50 alone does not complete the challenge');
        assert.equal(await page.locator('#ContentCardContainerLoyalty .loyalty-customer-spend').count(), 1,
          'No progress on non-Spend, available or unmapped cards with identical titles');
        if (value === 20) {
          await page.setViewportSize({ width: 390, height: 844 });
          for (const theme of ['light', 'dark']) {
            await page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
            assert.ok(await card.locator('.loyalty-customer-spend').evaluate(element =>
              element.getBoundingClientRect().width <= element.closest('article').getBoundingClientRect().width),
            'Compact active progress fits the mobile card');
            if (process.env.AEP_LOYALTY_SPEND_SCREENSHOTS) await card.screenshot({
              path: path.join(process.env.AEP_LOYALTY_SPEND_SCREENSHOTS, customer + '-spend-20-' + theme + '.png'),
            });
          }
          await page.setViewportSize({ width: 1800, height: 1100 });
        }
      }
      assert.equal(await page.evaluate(() => window.__originalViewport === document.getElementById('loyaltyChallengeCarousel') &&
        window.__originalCard === document.querySelector('[data-proposition-id="proposition-0"]') &&
        window.__displayCount === window.__tracking.length), true, 'State refresh never rebuilds the carousel or retracks display');
      delete task.accumulators;
      await refresh();
      assert.equal(await card.locator('.loyalty-customer-spend').count(), 0, 'Missing refreshed accumulator removes stale progress');
      assert.equal(await card.locator('[data-interact-id="joinChallenge"]').isVisible(), true);
      task.accumulators = { spend: 20 };
      task.taskClass = 'purchase';
      await refresh();
      assert.equal(await card.locator('.loyalty-customer-spend').count(), 0, 'Explicit non-Spend class is authoritative');
      delete task.taskClass; delete task.variables;
      definition = { taskId: task.taskId, taskClass: 'spend', variables: { spendMin: 50 } };
      await refresh();
      assert.equal(await card.locator('.loyalty-customer-spend b').textContent(), '£20 spent · £30 to go',
        'Definitions are matched by task ID, just like the inspector');
      task.taskState = 'completed'; task.accumulators.spend = 50;
      await refresh();
      assert.match(await card.locator('.loyalty-customer-spend').textContent(), /Spending task complete/);
      assert.equal(await card.locator('.loyalty-customer-spend progress').count(), 0);
      spendChallenge.state = 'complete';
      await refresh();
      assert.match(await card.locator('.loyalty-customer-spend').textContent(), /Challenge complete/);
      assert.doesNotMatch(await card.textContent(), /points earned|500 points|reward issued/i);
      await page.locator('[data-loyalty-preview="web"]').click();
      assert.match(await page.locator('#loyaltyWebChallenge .loyalty-customer-spend').textContent(), /Challenge complete/);
      const measure = async () => page.evaluate(() => ({
        web: document.getElementById('loyaltyWebPreview').getBoundingClientRect().width,
        inspector: document.querySelector('.loyalty-inspector').getBoundingClientRect().width,
      }));
      const before = await measure();
      await page.locator('#loyaltyWebWidth').press('Home');
      for (let step = 0; step < 24; step++) await page.locator('#loyaltyWebWidth').press('ArrowRight');
      await page.locator('#loyaltyInspectorWidth').press('Home');
      for (let step = 0; step < 4; step++) await page.locator('#loyaltyInspectorWidth').press('ArrowRight');
      const after = await measure();
      assert.ok(after.web < before.web && after.inspector < before.inspector, 'Both columns have independent width controls');
      assert.ok(Math.abs(after.web - 600) < 2 && Math.abs(after.inspector - 320) < 2);
      assert.equal(await page.locator('#loyaltyWebWidthValue').textContent(), '600px');
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(await page.locator('#loyaltyWebPreview').evaluate(element => element.getBoundingClientRect().right <= innerWidth));
        const colours = await card.locator('.loyalty-customer-spend').evaluate(element => {
          const styles = getComputedStyle(element);
          return { text: styles.color, background: styles.backgroundImage };
        });
        assert.ok(colours.text && colours.background !== 'none', 'Native brand treatment in ' + theme);
      }
      await page.locator('[data-loyalty-preview="mobile"]').click();
      assert.equal(await page.locator('#loyaltyPreviewSizing').isVisible(), false);
      assert.equal(await page.locator('.loyalty-phone [data-spend-purchase]').count(), 0);
      spendChallenge.optedIn = false;
      await refresh();
      assert.equal(await card.locator('.loyalty-customer-spend').count(), 0, 'State, not signup receipts, authorizes progress');
      assert.deepEqual(writes, []);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(customer + ': shared real Spend, exact card mapping, completion, no carousel retracking, width controls and collapsed offers passed.');
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
