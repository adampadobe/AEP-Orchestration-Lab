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
      let events = [], schemaSupported = true, registeredDatastream = 'fixture-stream';
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
        else if (url.pathname === '/api/profile/events') data = { events };
        else if (url.pathname === '/api/events/config') data = { record: { datastreamId: registeredDatastream, schemaId: 'fixture-schema' } };
        else if (url.pathname === '/api/schema-viewer/registry') data = { schema: { properties: schemaSupported ? {
          _experience: { properties: { ajo: { properties: { loyalty: { properties: { challenge: { properties: {
            id: { type: 'string' }, name: { type: 'string' },
            metadata: { type: 'object', additionalProperties: { type: 'string' } },
          } } } } } } } },
        } : {} } };
        else if (url.pathname === '/api/profile/audiences') data = { realized: [], exited: [] };
        else if (url.pathname === '/api/events/generator-targets') data = { targets: [] };
        else if (url.pathname === '/api/image-hosting/library') data = { items: [] };
        else if (url.pathname === '/api/tags/reactor' || url.pathname === '/api/events/datastreams') data = { data: [] };
        if (url.pathname === '/api/schema-viewer/registry' && schemaSupported) {
          data.schema.properties._experience.properties.decisioning = { properties: { propositions: { items: {
            properties: { items: { items: { properties: { id: { type: 'string' }, name: { type: 'string' },
              characteristics: { type: 'object', additionalProperties: { type: 'string' } } } } } },
          } } } };
        }
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
        window.__tracking = []; window.__interactions = []; window.__purchases = [];
        window.__featuredDisplays = [];
        window.__eventStream = 'fixture-stream';
        window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: window.__eventStream } });
        window.alloy = async (command, options) => {
          if (command === 'getIdentity') return { identity: { ECID: '12345678901234567890123456789012345678' } };
          if (command === 'subscribeRulesetItems') { window.__subscription = options; return; }
          if (command !== 'sendEvent') return {};
          if (options.xdm?.eventType === 'commerce.purchases') {
            window.__purchases.push(options);
            await new Promise(resolve => { window.__releasePurchase = resolve; });
            return { requestId: 'offline-purchase' };
          }
          if (options.xdm?.eventType === 'decisioning.propositionInteract') window.__interactions.push(options);
          if (options.xdm?.eventType === 'decisioning.propositionDisplay') {
            window.__featuredDisplays.push(options);
            if (window.__failFeaturedDisplay) throw new Error('Offline display acceptance unavailable');
            return { requestId: 'offline-display' };
          }
          if (options.personalization?.surfaces?.[0]?.endsWith('#featured-offers')) {
            return { propositions: window.__featuredFixture ? [window.__featuredFixture] : [] };
          }
          if (options.personalization?.surfaces && window.__subscription) {
            window.__cards = ['spend-fixture', 'non-spend-fixture', 'available-fixture', null].map((challengeId, index) => ({
              id: 'proposition-' + index, scope: window.__subscription.surfaces[0],
              scopeDetails: { decisionProvider: 'AJO', rank: 4 - index, correlationID: 'correlation-' + index + (window.__cardRevision || ''),
                activity: { id: 'journey-activity-' + index }, characteristics: { source: 'journey', eventToken: 'token-' + index } },
              items: [{ id: 'item-' + index, schema: 'https://ns.adobe.com/personalization/message/content-card',
                data: { content: { title: 'Identical title', body: 'Adobe body ' + index,
                  buttons: [{ text: { content: 'Join Challenge' }, interactId: 'joinChallenge' },
                    { text: { content: 'View tasks' }, interactId: 'viewTasks' }, { text: { content: 'View details' } }] },
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
      await card.locator('[data-interact-id="viewTasks"]').click();
      await page.waitForFunction(() => window.__interactions.length === 1 && !document.getElementById('queryProfileBtn').disabled);
      const interaction = await page.evaluate(() => window.__interactions[0]);
      assert.deepEqual(interaction.xdm._experience.ajo.loyalty.challenge, {
        id: 'spend-fixture', name: 'Unrelated title',
        metadata: { contextType: 'cardInteraction', consequenceId: 'item-0', cardTitle: 'Identical title', interactId: 'viewTasks' },
      });
      assert.deepEqual(interaction.xdm._experience.decisioning.propositions[0].scopeDetails,
        await page.evaluate(() => window.__cards[0].scopeDetails), 'Original Journey rank, attribution and tokens are unchanged');
      assert.deepEqual(interaction.xdm._experience.decisioning.propositions[0].items, [{ id: 'item-0' }]);
      await card.getByRole('button', { name: 'View details', exact: true }).click();
      await page.waitForFunction(() => window.__interactions.length === 2 && !document.getElementById('queryProfileBtn').disabled);
      assert.equal(await page.evaluate(() => window.__interactions[1].xdm._experience.ajo.loyalty.challenge.metadata.interactId), 'item-0');
      assert.equal(await page.evaluate(() => window.__tracking.filter(event => event.type === 'interact').length), 0,
        'An enriched explicit interaction does not also call native collection');
      const purchaseControl = page.locator('#loyaltyTasks [data-spend-purchase]').first();
      await purchaseControl.click();
      await page.waitForFunction(() => typeof window.__releasePurchase === 'function');
      const purchase = await page.evaluate(() => window.__purchases[0]);
      assert.deepEqual(purchase.xdm._experience.ajo.loyalty.challenge, {
        id: 'spend-fixture', name: 'Unrelated title',
        metadata: { contextType: 'spendDemoPurchase', taskId: task.taskId, taskName: task.taskName, qualification: 'notConfirmed' },
      });
      assert.equal(purchase.xdm._experience.decisioning, undefined, 'Inspector purchase does not borrow the visible card proposition');
      assert.equal(purchase.xdm.commerce.order.priceTotal, 10);
      task.accumulators = { spend: 10 };
      await page.evaluate(() => { window.__releasePurchase(); delete window.__releasePurchase; });
      await page.waitForFunction(() => window.LoyaltyDemoSpendDebug.getLatest()?.sdkAccepted === true);
      assert.equal(await card.locator('.loyalty-customer-spend').count(), 0, 'Context does not imply qualification or advance progress');
      await page.waitForFunction(() => window.LoyaltyDemoSpendDebug.getLatest()?.poll?.stopReason?.startsWith('Adobe returned updated Spend: 10.'));
      const toEvent = payload => {
        const rows = [];
        const flatten = (value, prefix) => {
          if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) flatten(child, prefix ? prefix + '.' + key : key);
          else rows.push({ path: prefix, value: String(value) });
        };
        flatten(payload.xdm, '');
        return { eventType: payload.xdm.eventType, timestamp: Date.now(), rows };
      };
      events = [toEvent(purchase), toEvent(interaction)];
      await page.evaluate(() => window.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile());
      assert.match(await page.locator('#profileDrawerEvents').textContent(), /Loyalty challenge: Unrelated title/);
      assert.match(await page.locator('#profileDrawerEvents').textContent(), /Task: Generic Spend/);
      assert.match(await page.locator('#profileDrawerEvents').textContent(), /qualification not confirmed/);
      assert.match(await page.locator('#profileDrawerEvents').textContent(), /Adobe activity ID: journey-activity-0/);
      schemaSupported = false; registeredDatastream = 'unsupported-stream';
      await page.evaluate(() => { window.__eventStream = 'unsupported-stream'; window.__cardRevision = '-unsupported'; });
      await page.locator('#loyaltyRun').click();
      await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Featured Offers response refreshed') &&
        !document.getElementById('queryProfileBtn').disabled);
      await card.locator('[data-interact-id="viewTasks"]').click();
      await page.waitForFunction(() => window.__interactions.length === 3 && !document.getElementById('queryProfileBtn').disabled);
      assert.equal(await page.evaluate(() => window.__interactions[2].xdm._experience.ajo), undefined, 'Unsupported schema never receives invented fields');
      assert.match(await page.evaluate(() => window.LoyaltyDemoEventContextDebug.getLatest().error), /does not support Loyalty/);
      assert.equal(await page.evaluate(() => window.LoyaltyDemoEventContextDebug.getLatest().supported), false);
      await card.getByRole('button', { name: 'View details', exact: true }).click();
      await page.waitForFunction(() => window.__tracking.filter(event => event.type === 'interact').length === 1 &&
        !document.getElementById('queryProfileBtn').disabled);
      assert.equal(await page.evaluate(() => window.__interactions.length), 3,
        'Unsupported enrichment preserves native collection without a second interaction');
      schemaSupported = true; registeredDatastream = 'fixture-stream';
      await page.evaluate(() => { window.__eventStream = 'mismatch-stream'; window.__cardRevision = '-mismatch'; });
      await page.locator('#loyaltyRun').click();
      await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Featured Offers response refreshed') &&
        !document.getElementById('queryProfileBtn').disabled);
      await card.locator('[data-interact-id="viewTasks"]').click();
      await page.waitForFunction(() => window.__interactions.length === 4 && !document.getElementById('queryProfileBtn').disabled);
      assert.equal(await page.evaluate(() => window.__interactions[3].xdm._experience.ajo), undefined, 'A mismatched schema cannot authorize enrichment');
      assert.match(await page.evaluate(() => window.LoyaltyDemoEventContextDebug.getLatest().error), /does not match/);
      await page.evaluate(() => { window.__eventStream = 'fixture-stream'; });
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
      await page.setViewportSize({ width: 1500, height: 1100 });
      await page.locator('.loyalty-phone-nav [data-phone-view="home"]').click();
      schemaSupported = true; registeredDatastream = 'featured-stream';
      const nativeBeforeFeatured = await page.evaluate(() => ({ tracking: __tracking.length, purchases: __purchases.length, interactions: __interactions.length }));
      await page.evaluate(async () => {
        window.__eventStream = 'featured-stream';
        window.__featuredFixture = {
          id: 'original-featured-proposition', scope: 'web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers',
          scopeDetails: { decisionProvider: 'AJO', correlationID: 'original-featured-correlation',
            activity: { id: 'original-featured-campaign' }, characteristics: { eventToken: 'original-featured-token' } },
          items: [{ id: 'original-wrapper-item', name: 'Original wrapper', trackingToken: 'original-item-token',
            characteristics: { originalValue: 'preserved' }, schema: 'https://ns.adobe.com/personalization/json-content-item',
            data: { content: [0, 1, 2].map(index => ({ id: 'dps:fixture-namespace:visible-' + index, merchant: 'Fixture merchant',
              title: 'Visible offer ' + index, sku: 'visible-' + index })) } }],
        };
        window.addEventListener('ajo:featured-offers-response', event => {
          const proposition = event.detail.propositions?.[0];
          if (!proposition || proposition.id !== __featuredFixture.id) return;
          const item = proposition.items[0];
          window.__emitFeatured = () => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: {
            offers: item.data.content.map(offer => ({ ...offer, propositionId: proposition.id, propositionItemId: item.id,
              propositionScope: proposition.scope, propositionScopeDetails: proposition.scopeDetails })),
          } }));
          window.__emitFeatured();
        });
        await window.requestFeaturedOffers();
      });
      await page.waitForTimeout(1300);
      assert.equal(await page.evaluate(() => __featuredDisplays.length), 0, 'Hidden Home offers are not impressions');
      await page.locator('.loyalty-phone-nav [data-phone-view="rewards"]').click();
      await page.locator('#loyaltyOfferCarousel').evaluate(element => element.scrollIntoView({ block: 'center' }));
      await page.waitForFunction(() => __featuredDisplays.length === 1);
      const firstDisplay = await page.evaluate(() => __featuredDisplays[0]);
      assert.equal(firstDisplay.xdm._experience.decisioning.propositionEventType.display, 1);
      assert.deepEqual(firstDisplay.personalization, { defaultPersonalizationEnabled: false });
      const attributed = firstDisplay.xdm._experience.decisioning.propositions[0];
      assert.equal(attributed.id, 'original-featured-proposition');
      assert.equal(attributed.items[0].id, 'original-wrapper-item');
      assert.equal(attributed.items[0].trackingToken, 'original-item-token');
      assert.equal(attributed.scopeDetails.characteristics.eventToken, 'original-featured-token');
      assert.deepEqual(attributed.items[0].characteristics, { originalValue: 'preserved',
        displayedOfferId: 'dps:fixture-namespace:visible-0', displayedOfferName: 'Fixture merchant: Visible offer 0' });
      events = [{ eventType: '', eventName: 'Fixture Loyalty', timestamp: Date.now(), rows: [
        { path: '_experience.decisioning.propositionEventType.send', value: '1' },
        { path: '_experience.decisioning.propositions.0.scope', value: attributed.scope },
        { path: '_experience.decisioning.propositions.0.items.0.id', value: 'delivery-wrapper-item' },
        { path: '_experience.decisioning.propositions.1.items.0.id', value: 'dps:fixture-namespace:waitrose' },
        { path: '_experience.decisioning.propositions.1.items.0.name', value: 'Rewards - Waitrose 15% Cashback' },
      ] }, { eventType: firstDisplay.xdm.eventType, timestamp: Date.parse(firstDisplay.xdm.timestamp), rows: [
        { path: '_experience.decisioning.propositions.0.id', value: attributed.id },
        { path: '_experience.decisioning.propositions.0.items.0.id', value: attributed.items[0].id },
        { path: '_experience.decisioning.propositions.0.items.0.characteristics.displayedOfferId', value: 'dps:fixture-namespace:visible-0' },
      ] }];
      await page.waitForFunction(() => LoyaltyDemoFeaturedDisplayDebug.getLatest()?.storedInProfile === true);
      await page.evaluate(() => DemoProfileDrawer.refreshDrawerEventsForLoadedProfile());
      const deliveryCard = page.locator('.aep-profile-drawer-event-item').filter({ hasText: 'PropositionDelivery (send)' });
      assert.equal(await deliveryCard.count(), 1, 'Delivery remains distinct from an impression');
      assert.match(await deliveryCard.textContent(), /Rewards - Waitrose 15% Cashback/, 'Actual namespaced DPS IDs appear on delivery cards');
      await page.evaluate(() => __emitFeatured());
      await page.locator('[data-loyalty-preview="web"]').click();
      await page.locator('#loyaltyOfferCarousel').evaluate(element => element.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(1300);
      assert.equal(await page.evaluate(() => __featuredDisplays.length), 1, 'Duplicate delivery and preview switches do not retrack');
      await page.locator('#loyaltyNextOffer').click();
      await page.waitForFunction(() => __featuredDisplays.length === 2);
      assert.equal(await page.evaluate(() => __featuredDisplays[1].xdm._experience.decisioning.propositions[0].items[0].characteristics.displayedOfferId),
        'dps:fixture-namespace:visible-1', 'Only the settled primary card, not its peek, is displayed');
      await page.locator('#loyaltyPreviousOffer').click();
      await page.waitForTimeout(1300);
      assert.equal(await page.evaluate(() => __featuredDisplays.length), 2, 'Returning to the same attributed offer is deduplicated');
      await page.evaluate(() => { window.__failFeaturedDisplay = true; });
      await page.locator('#loyaltyNextOffer').click();
      await page.locator('#loyaltyNextOffer').click();
      await page.waitForFunction(() => LoyaltyDemoFeaturedDisplayDebug.getLatest()?.error?.includes('Offline display'));
      await page.evaluate(() => __emitFeatured());
      await page.waitForTimeout(1300);
      assert.equal(await page.evaluate(() => __featuredDisplays.length), 3, 'Uncertain SDK display sends are never replayed');
      registeredDatastream = 'unrelated-stream';
      await page.evaluate(async () => { window.__eventStream = 'unregistered-featured-stream'; await requestFeaturedOffers(); });
      await page.waitForFunction(() => LoyaltyDemoFeaturedDisplayDebug.getLatest()?.error?.includes('does not match'));
      assert.equal(await page.evaluate(() => __featuredDisplays.length), 3, 'Unverified event schemas block tracking, not rendering');
      assert.equal(await page.locator('#loyaltyFeaturedOffers > article').count(), 3);
      const unchangedCards = await page.locator('#loyaltyFeaturedOffers').innerHTML();
      registeredDatastream = 'verified-new-featured-stream';
      await page.evaluate(async () => {
        window.__failFeaturedDisplay = false; window.__eventStream = 'verified-new-featured-stream';
        window.__featuredFixture.id = 'new-original-proposition-same-offers';
        await requestFeaturedOffers();
      });
      await page.waitForFunction(() => __featuredDisplays.length === 4);
      assert.equal(await page.locator('#loyaltyFeaturedOffers').innerHTML(), unchangedCards, 'Same offers preserve the rendered carousel');
      assert.equal(await page.evaluate(() => __featuredDisplays[3].xdm._experience.decisioning.propositions[0].id),
        'new-original-proposition-same-offers', 'Unchanged cards use the latest original attribution');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers: [{
        id: 'invented-not-in-adobe-content', merchant: 'Fixture', title: 'Not delivered by Adobe',
        propositionId: __featuredFixture.id, propositionItemId: 'original-wrapper-item',
      }] } })));
      await page.waitForFunction(() => LoyaltyDemoFeaturedDisplayDebug.getLatest()?.error?.includes('not present in original Adobe'));
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: {
        offers: __featuredFixture.items[0].data.content.map(offer => ({ ...offer,
          propositionId: 'stale-proposition', propositionItemId: 'original-wrapper-item' })),
      } })));
      await page.waitForFunction(() => LoyaltyDemoFeaturedDisplayDebug.getLatest()?.error?.includes('attribution is missing'));
      assert.equal(await page.evaluate(() => __featuredDisplays.length), 4, 'Invented IDs and stale wrapper attribution never send');
      assert.deepEqual(await page.evaluate(() => ({ tracking: __tracking.length, purchases: __purchases.length, interactions: __interactions.length })),
        nativeBeforeFeatured, 'Featured displays do not add Content Card events, purchases or interactions');
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
