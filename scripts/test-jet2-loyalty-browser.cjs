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
    const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, reducedMotion: 'reduce' });
    const errors = [], stateReads = [], writes = [], profileReads = [];
    let spend, qatarStateFail = false, qatarProfileFail = false;
    const task = { taskId: 'jet2-spend-task-fixture', taskName: 'Generic Spend fixture',
      taskType: 'purchase', taskClass: 'spend', taskState: 'incomplete',
      variables: { spendMin: 50, singleTrans: false, include: { valuesSet: ['*'] } } };
    await context.addInitScript(() => {
      localStorage.setItem('aepDemoNavOwnerHandle', 'kirkham');
      localStorage.setItem('lloydsLoyaltyNs', 'ecid');
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.fulfill({ contentType: 'text/javascript', body: '' });
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data = { ok: true };
      if (url.pathname === '/api/aep') {
        assert.equal(request.postDataJSON().method, 'GET');
        data = { status: 200, platform_response: { sandboxes: [
          { name: 'kirkham', title: 'Offline sandbox', type: 'development', state: 'active' },
          { name: 'apalmer', title: 'Offline sandbox', type: 'development', state: 'active' },
        ] } };
      } else if (request.method() !== 'GET') {
        writes.push(url.pathname);
      } else if (url.pathname === '/api/profile/table') {
        profileReads.push(Object.fromEntries(url.searchParams));
        if (qatarProfileFail) return route.fulfill({ status: 404, json: {
          code: 'UPS_ENTITY_NOT_FOUND',
          error: 'Entity not found. Ingestion or identity indexing may still be pending; retry reads only, not profile generation.',
        } });
        data = { found: true, ecid: '12345678901234567890123456789012345678',
          profileEmail: url.searchParams.get('identifier'), rows: [
            { path: 'person.name.firstName', value: 'Alex', valueType: 'string' },
            { path: 'testProfile', value: true, valueType: 'boolean' },
            { path: '_demoemea.identification.core.loyaltyId', value: 'jet2-member-fixture', valueType: 'string' },
          ] };
      } else if (url.pathname === '/api/profile/consent') {
        data = { found: true, firstName: 'Alex', email: 'jet2-fixture@example.invalid',
          ecid: '12345678901234567890123456789012345678', channels: { email: 'out', sms: null, push: null } };
      } else if (url.pathname === '/api/ajo-loyalty') {
        const action = url.searchParams.get('action');
        if (qatarStateFail && action === 'profile_state') {
          return route.fulfill({ status: 503, json: { ok: false, error: 'Offline Loyalty state unavailable' } });
        }
        if (action === 'config') data = { ok: true, data: { namespace: 'loyaltyId' } };
        else if (action === 'challenge_get') data = { ok: true, data: {
          _id: url.searchParams.get('challenge_id'), name: 'Adobe metadata fixture',
        } };
        else {
          stateReads.push(Object.fromEntries(url.searchParams));
          data = { ok: true, data: { challengeList: [
            { challenge_id: 'jet2-spend-fixture', challengeName: 'Adobe Spend challenge fixture', optedIn: true,
              state: 'active', tasks: [{ ...task, ...(spend === undefined ? {} : { accumulators: { spend } }) }] },
            { challenge_id: 'jet2-available-fixture', challengeName: 'Available challenge fixture', optedIn: false, tasks: [] },
          ] } };
        }
      } else if (url.pathname === '/api/env-bar-config') data = { config: null };
      else if (url.pathname === '/api/events/generator-targets') data = { targets: [] };
      else if (url.pathname === '/api/profile/events') data = { events: [] };
      else if (url.pathname === '/api/events/config') data = { record: { datastreamId: 'jet2-offline-stream', schemaId: 'fixture-schema' } };
      else if (url.pathname === '/api/schema-viewer/registry') data = { schema: { properties: {
        _experience: { properties: { ajo: { properties: { loyalty: { properties: { challenge: { properties: {
          id: { type: 'string' }, name: { type: 'string' },
          metadata: { type: 'object', additionalProperties: { type: 'string' } },
        } } } } } } } },
      } } };
      else if (url.pathname === '/api/profile/audiences') data = { realized: [], exited: [] };
      else if (url.pathname === '/api/image-hosting/library') data = { items: [] };
      else if (url.pathname === '/api/tags/reactor' || url.pathname === '/api/events/datastreams') data = { data: [] };
      return route.fulfill({ json: data });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/profile-viewer/jet2-loyalty-demo.html');
    await page.waitForFunction(() => document.getElementById('loyaltyTenant') && window.LoyaltyDemoSpendDebug);
    assert.equal(await page.title(), 'Jet2holidays | Loyalty');
    assert.equal(await page.locator('#jet2LoyaltyNs').count(), 1);
    assert.equal(await page.locator('#lloydsLoyaltyNs').count(), 0, 'Jet2 owns independent environment/identity controls');
    assert.notEqual(await page.locator('#jet2LoyaltyNs').inputValue(), 'ecid', 'Lloyds preferences are not inherited');
    assert.equal(await page.locator('.ContentCardContainer, .ContentCardContainerLoyalty').count(), 0);
    assert.equal(await page.locator('#loyaltyHomeName').textContent(), 'Your holidays');
    assert.equal(await page.locator('.jet2-logo').first().evaluate(image => image.complete && image.naturalWidth > 0), true);
    assert.equal(await page.locator('a[href="jet2-loyalty-demo.html"]').count() > 0, true, 'Jet2 Loyalty is in the menu');
    assert.equal(stateReads.length, 0, 'No member is guessed before profile resolution');
    await page.evaluate(() => {
      window.AepGlobalSandbox.setSelected('kirkham');
      window.__sdkPurchases = [];
      window.__cardInteractions = [];
      window.__tracking = [];
      window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: 'jet2-offline-stream' } });
      window.alloy = async (command, options) => {
        if (command === 'getIdentity') return { identity: { ECID: '12345678901234567890123456789012345678' } };
        if (command === 'subscribeRulesetItems') { window.__subscription = options; return; }
        if (command !== 'sendEvent') return {};
        if (options.xdm?.eventType === 'commerce.purchases') {
          window.__sdkPurchases.push(options);
          await new Promise(resolve => { window.__releasePurchase = resolve; });
          return { requestId: 'jet2-offline-accepted' };
        }
        if (options.xdm?.eventType === 'decisioning.propositionInteract') window.__cardInteractions.push(options);
        if (options.personalization?.surfaces?.[0]?.endsWith('#featured-offers')) return { propositions: [] };
        if (options.personalization?.surfaces && window.__subscription) {
          window.__cards = [1, 2].map(rank => ({
            id: 'jet2-proposition-' + rank, scope: window.__subscription.surfaces[0],
            scopeDetails: { decisionProvider: 'AJO', rank, correlationID: 'jet2-correlation-' + rank,
              characteristics: { source: 'journey', eventToken: 'jet2-event-' + rank } },
            items: [{ id: 'jet2-item-' + rank, schema: 'https://ns.adobe.com/personalization/message/content-card',
              data: { content: { title: 'Adobe card ' + rank, body: 'Adobe supplied body ' + rank,
                imageUrl: new URL('/profile-viewer/jet2-loyalty/beach.jpg', location.href).href,
                actionUrl: '#loyalty-challenges',
                buttons: [{ text: { content: 'View tasks ' + rank }, interactId: 'viewTasks' }] },
                meta: { challengeId: rank === 2 ? 'jet2-spend-fixture' : 'jet2-challenge-' + rank } } }],
          }));
          window.__subscription.callback({ propositions: window.__cards }, async (type, selected) => {
            window.__tracking.push({ type, selected });
          });
        }
        return { propositions: [] };
      };
    });
    await page.locator('#customerEmail').fill('jet2-fixture@example.invalid');
    await page.locator('#queryProfileBtn').click();
    await page.waitForFunction(() => document.querySelector('#ContentCardContainerLoyalty h3')?.textContent === 'Adobe card 2' &&
      document.querySelector('#loyaltyTasks [data-spend-purchase]') && !document.getElementById('queryProfileBtn').disabled);
    assert.equal(stateReads[0].profile_id, 'jet2-member-fixture', 'Automatic state read uses the resolved scalar Loyalty member');
    assert.equal(await page.locator('#loyaltyTasks .loyalty-challenge').count(), 1);
    assert.equal(await page.locator('#loyaltyAvailable .loyalty-available-card').count(), 1);
    assert.equal(await page.locator('#ContentCardContainerLoyalty article').count(), 2);
    assert.equal(await page.locator('#ContentCardContainerLoyalty article img').count(), 2, 'Each Adobe-supplied card image is preserved');
    assert.equal(await page.locator('.loyalty-card-dots button').count(), 2);
    assert.deepEqual(await page.evaluate(() => window.LoyaltyDemoContentCardDebug.getEvaluated().propositions.map(p => p.id)),
      ['jet2-proposition-1', 'jet2-proposition-2'], 'Raw Adobe response remains complete before ranking');
    await page.locator('.loyalty-phone-nav [data-phone-view="rewards"]').click();
    await page.locator('#ContentCardContainerLoyalty article[data-primary="true"] button').filter({ hasText: 'View tasks 2' }).click();
    await page.waitForFunction(() => window.__cardInteractions.length === 1 && !document.getElementById('queryProfileBtn').disabled);
    const interaction = await page.evaluate(() => window.__cardInteractions.at(-1));
    assert.equal(interaction.xdm._experience.decisioning.propositions[0].id, 'jet2-proposition-2');
    assert.equal(interaction.xdm._experience.decisioning.propositions[0].items[0].id, 'jet2-item-2');
    assert.equal(interaction.xdm._experience.decisioning.propositions[0].scopeDetails.correlationID, 'jet2-correlation-2');
    assert.equal(interaction.xdm._experience.ajo.loyalty.challenge.id, 'jet2-spend-fixture');
    assert.equal(interaction.xdm._experience.ajo.loyalty.challenge.metadata.consequenceId, 'jet2-item-2');
    const featuredOffers = Array.from({ length: 9 }, (_, index) => ({
      id: 'jet2-featured-fixture-' + index, merchant: 'Separate Adobe offer ' + index,
      title: 'Independent Decisioning fixture ' + index, propositionId: 'jet2-featured-proposition-' + index,
      propositionItemId: 'jet2-featured-item-' + index,
    }));
    await page.evaluate(offers => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers } })), featuredOffers);
    assert.deepEqual(await page.locator('.loyalty-featured-body h4').allTextContents(),
      featuredOffers.map(offer => offer.title), 'All returned offers retain Adobe order without a count cap');
    assert.deepEqual(await page.locator('#loyaltyReturnedOffers pre').evaluateAll(elements =>
      elements.map(element => JSON.parse(element.textContent))), featuredOffers, 'All items retain individual attribution in Profile offers');
    const featured = await page.locator('#loyaltyFeaturedOffers').innerHTML();
    for (const width of [1500, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const theme of ['light', 'dark']) {
        await page.mouse.move(0, 0);
        await page.locator('#profileHoverZone').dispatchEvent('mouseleave');
        await page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
        const bounds = await page.locator('#loyaltyChallengeCarousel').evaluate(element => {
          const first = element.querySelector('article'), a = first.getBoundingClientRect(), b = element.getBoundingClientRect();
          return { left: b.left, right: b.right, viewport: innerWidth, nextPeek: a.width < element.clientWidth,
            snap: getComputedStyle(element).scrollSnapType, accent: getComputedStyle(document.body).getPropertyValue('--dash-loyalty-accent').trim() };
        });
        assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport, 'Challenge viewport fits ' + width + '/' + theme);
        assert.equal(bounds.nextPeek, true, 'Multiple-card layout retains the next-card peek');
        assert.match(bounds.snap, /x/);
        assert.equal(bounds.accent, 'rgb(242, 140, 0)', 'Jet2 tokens survive the last-loaded dark stylesheet');
        if (process.env.AEP_JET2_SCREENSHOTS) await page.screenshot({
          path: path.join(process.env.AEP_JET2_SCREENSHOTS, `jet2-loyalty-${width}-${theme}.png`), fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.locator('#loyaltyChallengeCarousel').focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('#ContentCardContainerLoyalty article[data-primary="true"] h3')?.textContent === 'Adobe card 1');
    await page.evaluate(() => window.__subscription.callback({ propositions: [window.__cards[0]] }, async () => {}));
    await page.waitForFunction(() => document.querySelectorAll('#ContentCardContainerLoyalty article').length === 1);
    assert.equal(await page.locator('.loyalty-card-dots button').count(), 0, 'One card has no unnecessary carousel navigation');
    assert.equal(await page.locator('#loyaltyChallengeCarousel').evaluate(element =>
      Math.abs(element.scrollWidth - element.clientWidth) <= 1), true, 'Single card leaves no empty scroll space');
    await page.locator('[data-loyalty-preview="web"]').click();
    assert.equal(await page.locator('#loyaltyWebChallenge #ContentCardContainerLoyalty article').count(), 1);
    assert.equal(await page.locator('#loyaltyWebOffers .loyalty-featured-offer').count(), featuredOffers.length);
    for (const width of [1500, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const theme of ['light', 'dark']) {
        await page.mouse.move(0, 0);
        await page.locator('#profileHoverZone').dispatchEvent('mouseleave');
        await page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
        assert.equal(await page.locator('#loyaltyWebPreview').evaluate(element =>
          element.getBoundingClientRect().width <= innerWidth), true, 'Web preview fits ' + width + '/' + theme);
        if (process.env.AEP_JET2_SCREENSHOTS) await page.screenshot({
          path: path.join(process.env.AEP_JET2_SCREENSHOTS, `jet2-loyalty-web-${width}-${theme}.png`), fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.locator('[data-loyalty-preview="mobile"]').click();
    assert.equal(await page.locator('.loyalty-phone #ContentCardContainerLoyalty article').count(), 1);
    await page.evaluate(() => window.__subscription.callback({ propositions: window.__cards }, async () => {}));
    await page.waitForFunction(() => document.querySelectorAll('#ContentCardContainerLoyalty article').length === 2);
    const control = page.locator('#loyaltyTasks [data-spend-purchase]');
    assert.equal(await page.locator('.loyalty-phone [data-spend-purchase]').count(), 0);
    assert.match(await page.locator('#loyaltyTasks').textContent(), /Progress not yet reported/);
    for (let number = 1; number <= 2; number++) {
      await control.click();
      await page.waitForFunction(() => typeof window.__releasePurchase === 'function');
      assert.equal(await control.isDisabled(), true);
      assert.equal(await page.evaluate(() => window.__sdkPurchases.length), number);
      spend = number * 10;
      await page.evaluate(() => { window.__releasePurchase(); delete window.__releasePurchase; });
      await page.waitForFunction(() => window.LoyaltyDemoSpendDebug.getLatest()?.sdkAccepted === true);
      assert.equal(await page.evaluate(() => window.LoyaltyDemoSpendDebug.getLatest().poll.responses.length), 0);
      assert.doesNotMatch(await page.locator('#loyaltyTasks').textContent(), new RegExp('£' + spend + ' spent'),
        'SDK acceptance alone never adds local Spend progress');
      assert.doesNotMatch(await page.locator('#ContentCardContainerLoyalty').textContent(), new RegExp('£' + spend + ' spent'),
        'The customer card also waits for Adobe state, not purchase acceptance');
      await page.waitForFunction(spend => window.LoyaltyDemoSpendDebug.getLatest()?.poll?.stopReason
        ?.startsWith('Adobe returned updated Spend: ' + spend + '.'), spend);
      assert.match(await page.locator('#loyaltyTasks').textContent(), new RegExp('£' + spend + ' spent'));
      assert.match(await page.locator('#ContentCardContainerLoyalty .loyalty-customer-spend').textContent(), new RegExp('£' + spend + ' spent'));
    }
    const purchases = await page.evaluate(() => window.__sdkPurchases);
    assert.notEqual(purchases[0].xdm._id, purchases[1].xdm._id);
    assert.notEqual(purchases[0].xdm.commerce.order.purchaseID, purchases[1].xdm.commerce.order.purchaseID);
    for (const purchase of purchases) {
      assert.equal(purchase.xdm.commerce.order.priceTotal, 10);
      assert.equal(purchase.xdm.commerce.order.currencyCode, 'GBP');
      assert.equal(purchase.xdm.productListItems[0].quantity, 1);
      assert.equal(purchase.xdm._demoemea.identification.core.loyaltyId, 'jet2-member-fixture');
      assert.equal(purchase.xdm._experience.ajo.loyalty.challenge.id, 'jet2-spend-fixture');
      assert.equal(purchase.xdm._experience.ajo.loyalty.challenge.metadata.taskId, task.taskId);
      assert.equal(purchase.xdm._experience.ajo.loyalty.challenge.metadata.qualification, 'notConfirmed');
      assert.equal(purchase.xdm._experience.decisioning, undefined);
    }
    assert.equal(await page.locator('#loyaltyFeaturedOffers').innerHTML(), featured, 'Cards and Spend never replace Featured Offers');
    assert.deepEqual(writes, [], 'No automatic signup, provider write or production request');
    assert.deepEqual(errors, []);
    console.log('Jet2 Loyalty: isolated settings, real-state fixtures, ranked cards/attribution, mobile/themes, one-card layout and real purchase contract passed.');

    await page.goto(origin + '/profile-viewer/qatar-loyalty-demo.html');
    await page.waitForFunction(() => document.getElementById('loyaltyTenant') && window.LoyaltyDemoSpendDebug);
    assert.equal(await page.title(), 'Qatar Airways | Loyalty');
    assert.equal(await page.locator('#qatarLoyaltyNs').count(), 1);
    assert.equal(await page.locator('#jet2LoyaltyNs').count(), 0);
    assert.equal(await page.locator('#qatarProfileReadiness').textContent(), 'Not loaded');
    assert.equal(await page.locator('#qatarStateReadiness').textContent(), 'Not yet read');
    assert.equal(await page.locator('#qatarPurchaseReadiness').textContent(), 'No purchase sent');
    assert.equal(await page.locator('#loyaltySurface').inputValue(),
      'web://127.0.0.1:' + server.address().port + '/profile-viewer/content-decision-live-edge.html#ContentCardContainerLoyalty');
    const tenantInput = page.locator('#loyaltyTenant');
    const tenantOptions = () => page.locator('#loyaltyTenantHistory option').evaluateAll(options => options.map(option => option.value));
    const enterTenant = async value => {
      await page.evaluate(() => window.EnvBarCompact.openOverlay({ pinned: true }));
      if (!await page.locator('.loyalty-settings').evaluate(element => element.open)) {
        await page.locator('.loyalty-settings summary').click();
      }
      await tenantInput.fill(value);
      await tenantInput.press('Tab');
    };
    await page.evaluate(() => {
      window.AepGlobalSandbox.setSelected('kirkham');
      window.EnvBarCompact.openOverlay({ pinned: true });
    });
    assert.equal(await tenantInput.getAttribute('list'), 'loyaltyTenantHistory');
    for (const value of ['_travelFixture', '_demoemea', '_travelFixture', '_experience', 'not a tenant', '']) {
      await enterTenant(value);
    }
    assert.deepEqual(await tenantOptions(), ['_travelFixture', '_demoemea'],
      'Valid entries are deduplicated and ordered by most recently used; invalid/reserved entries are not cached');
    await page.reload();
    await page.waitForFunction(() => document.getElementById('loyaltyTenantHistory'));
    assert.equal(await tenantInput.inputValue(), '_travelFixture', 'The last namespace survives reload');
    assert.deepEqual(await tenantOptions(), ['_travelFixture', '_demoemea']);
    await page.evaluate(() => {
      window.EnvBarCompact.openOverlay({ pinned: true });
      window.AepGlobalSandbox.setSelected('apalmer');
    });
    assert.equal(await tenantInput.inputValue(), '', 'A different sandbox does not inherit the previous tenant');
    assert.deepEqual(await tenantOptions(), []);
    await enterTenant('_apalmerFixture');
    await enterTenant('_demoemea');
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('kirkham'));
    assert.equal(await tenantInput.inputValue(), '_travelFixture');
    assert.deepEqual(await tenantOptions(), ['_travelFixture', '_demoemea']);
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('apalmer'));
    assert.equal(await tenantInput.inputValue(), '_demoemea');
    assert.deepEqual(await tenantOptions(), ['_demoemea', '_apalmerFixture']);
    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('aep-loyalty-event-tenants-v1:')) throw new DOMException('Fixture: storage is disabled', 'SecurityError');
        return setItem.call(this, key, value);
      };
    });
    await enterTenant('_manualFixture');
    assert.equal(await tenantInput.inputValue(), '_manualFixture', 'Manual entry remains available if caching fails');
    assert.ok(await page.evaluate(() => window.LoyaltyDemoDiagnostics.getRecent().some(entry =>
      entry.event === 'tenant-history-unavailable' && entry.operation === 'write')),
      'Unavailable persistence is explicitly diagnosed');
    await page.reload();
    await page.waitForFunction(() => document.getElementById('loyaltyTenantHistory'));
    await page.evaluate(() => {
      window.EnvBarCompact.openOverlay({ pinned: true });
      window.AepGlobalSandbox.setSelected('apalmer');
    });
    assert.equal(await tenantInput.inputValue(), '_demoemea', 'A failed cache write never replaces the saved namespace');
    await page.evaluate(() => {
      window.EnvBarCompact.closeOverlay({ force: true });
      window.EnvBarCompact.openOverlay({ pinned: false });
    });
    await page.evaluate(() => {
      localStorage.setItem('aepDemoNavOwnerHandle', 'apalmer');
      window.AepGlobalSandbox.setSelected('apalmer');
      document.getElementById('loyaltyTenant').value = '_demoemea';
      window.__qatarPurchases = [];
      window.__qatarSdkEvents = [];
      window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: 'jet2-offline-stream' } });
      window.alloy = async (command, options) => {
        if (command === 'getIdentity') return { identity: { ECID: '12345678901234567890123456789012345678' } };
        if (command === 'subscribeRulesetItems') { window.__qatarSubscription = options; return; }
        if (command === 'sendEvent') window.__qatarSdkEvents.push(options);
        if (command === 'sendEvent' && options.xdm?.eventType === 'commerce.purchases') {
          window.__qatarPurchases.push(options);
          return { requestId: 'qatar-offline-accepted' };
        }
        if (command === 'sendEvent' && options.personalization?.surfaces?.[0]?.endsWith('#ContentCardContainerLoyalty') && window.__qatarSubscription) {
          const cards = [1, 2].map(rank => ({
            id: 'qatar-proposition-' + rank, scope: window.__qatarSubscription.surfaces[0],
            scopeDetails: { decisionProvider: 'AJO', rank, correlationID: 'qatar-correlation-' + rank },
            items: [{ id: 'qatar-item-' + rank, schema: 'https://ns.adobe.com/personalization/message/content-card',
              data: { content: { title: 'Adobe travel card ' + rank, body: 'Adobe supplied content' },
                meta: { challengeId: rank === 2 ? 'jet2-spend-fixture' : 'another-fixture' } } }],
          }));
          window.__qatarSubscription.callback({ propositions: cards }, async () => {});
        }
        return { propositions: [] };
      };
    });
    qatarProfileFail = true;
    await page.locator('#customerEmail').fill('qatar-fixture@example.invalid');
    await page.locator('#queryProfileBtn').click();
    await page.locator('#loyaltyRetryProfile').waitFor({ state: 'visible' });
    assert.match(await page.locator('#loyaltyStatus').textContent(), /Entity not found/);
    assert.equal(await page.locator('#loyaltyRun').isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.__qatarSdkEvents), []);
    const failureDiagnostics = await page.evaluate(() => window.LoyaltyDemoDiagnostics.getRecent());
    assert.ok(failureDiagnostics.some(entry => entry.event === 'request-failed' &&
      entry.endpoint === '/api/profile/table' && entry.status === 404 && entry.category === 'profile-not-indexed'));
    assert.ok(failureDiagnostics.some(entry => entry.event === 'operation-failed'));
    assert.equal(JSON.stringify(failureDiagnostics).includes('qatar-fixture@example.invalid'), false);
    assert.equal(JSON.stringify(failureDiagnostics).includes('identifier='), false);
    await page.locator('#loyaltyRetryProfile').click();
    await page.waitForFunction(() => !document.getElementById('loyaltyRetryProfile').disabled);
    assert.equal(await page.locator('#loyaltyRetryProfile').isVisible(), true, 'Failed explicit retry remains recoverable');
    qatarProfileFail = false;
    const beforeRetryStateReads = stateReads.length;
    await page.locator('#loyaltyRetryProfile').click();
    await page.waitForFunction(() => document.getElementById('qatarProfileReadiness').textContent === 'Profile resolved' &&
      !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await page.locator('#loyaltyRetryProfile').isHidden(), true);
    assert.equal(stateReads.length, beforeRetryStateReads, 'Lookup retry does not schedule other operations');
    assert.deepEqual(await page.evaluate(() => window.__qatarSdkEvents), [], 'Lookup retry never sends SDK events');
    assert.ok(profileReads.slice(-3).every(read => read.identifier === 'qatar-fixture@example.invalid'),
      'Read retries preserve the selected identity');
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => document.querySelectorAll('#ContentCardContainerLoyalty article').length === 2 &&
      !document.getElementById('queryProfileBtn').disabled);
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.querySelector('#loyaltyTasks [data-spend-purchase]') &&
      !document.getElementById('queryProfileBtn').disabled);
    assert.equal(stateReads.at(-1).profile_id, 'jet2-member-fixture');
    assert.equal(stateReads.at(-1).sandbox, 'apalmer');
    assert.match(await page.locator('#loyaltyTasks').textContent(), /QAR/);
    assert.ok((await page.evaluate(() => window.__qatarSubscription.surfaces[0])).includes('/content-decision-live-edge.html#ContentCardContainerLoyalty'));
    await page.waitForFunction(() => document.querySelectorAll('#ContentCardContainerLoyalty article').length === 2);
    await page.waitForFunction(() => document.getElementById('qatarCardReadiness').textContent === 'Adobe returned 2 cards');
    assert.equal(await page.locator('#qatarProfileReadiness').textContent(), 'Profile resolved');
    assert.equal(await page.locator('#qatarJoinReadiness').textContent(), 'Joined challenge reported by Adobe');
    assert.match(await page.locator('#qatarStateReadiness').textContent(), /^Read /);
    assert.equal(await page.locator('#ContentCardContainerLoyalty article').first().locator('h3').textContent(), 'Adobe travel card 2');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers:
      Array.from({ length: 9 }, (_, index) => ({ id: 'travel-' + index, merchant: 'Travel', title: 'Offer ' + index })),
    } })));
    assert.equal(await page.locator('#loyaltyFeaturedOffers .loyalty-featured-offer').count(), 9);
    await page.locator('[data-loyalty-preview="web"]').click();
    assert.equal(await page.locator('#loyaltyWebChallenge #ContentCardContainerLoyalty article').count(), 2);
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 390, height: 1100 });
      await page.evaluate(value => document.documentElement.setAttribute('data-aep-theme', value), theme);
      assert.equal(await page.locator('#loyaltyWebPreview').evaluate(element => element.getBoundingClientRect().width <= innerWidth), true);
      assert.equal(await page.locator('.qatar-presenter').evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth;
      }), true, 'Presenter guide fits small viewport in ' + theme + ' mode');
    }
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.locator('#loyaltyTasks [data-spend-purchase]').click();
    await page.waitForFunction(() => window.__qatarPurchases.length === 1);
    const qatarPurchase = await page.evaluate(() => window.__qatarPurchases[0]);
    assert.equal(qatarPurchase.xdm.commerce.order.currencyCode, 'QAR');
    assert.equal(qatarPurchase.xdm.productListItems[0].currencyCode, 'QAR');
    assert.equal(qatarPurchase.xdm.commerce.order.priceTotal, 10);
    await page.waitForFunction(() => document.getElementById('qatarPurchaseReadiness').textContent.includes('Accepted by Web SDK'));
    assert.match(await page.locator('#qatarPurchaseReadiness').textContent(), /qualification not confirmed/);
    assert.equal(await page.locator('#loyaltyPartnerOffers').isVisible(), false);
    qatarStateFail = true;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('qatarReadinessError').textContent.includes('Offline Loyalty state unavailable'));
    assert.equal(await page.locator('#qatarStateReadiness').textContent(), 'Last read unavailable or may be stale');
    assert.equal(await page.locator('#qatarJoinReadiness').textContent(), 'Participation not yet read');
    await page.evaluate(() => {
      const input = document.getElementById('customerEmail');
      input.value = 'another-fixture@example.invalid';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await page.locator('#qatarProfileReadiness').textContent(), 'Not loaded');
    assert.equal(await page.locator('#qatarPurchaseReadiness').textContent(), 'No purchase sent');
    assert.equal(await page.locator('#qatarCardReadiness').textContent(), 'Not requested or no response captured');
    assert.equal(await page.locator('#qatarReadinessError').isHidden(), true);
    assert.equal(await page.evaluate(() => window.__qatarPurchases.length), 1, 'No purchase replay on error or identity change');
    await page.evaluate(() => {
      const surface = document.getElementById('loyaltySurface');
      surface.value = 'web://example.invalid/other#ContentCardContainerLoyalty';
      surface.dispatchEvent(new Event('input', { bubbles: true }));
      window.AepGlobalSandbox.setSelected('kirkham');
    });
    assert.equal(await page.locator('#loyaltySurface').inputValue(),
      'web://127.0.0.1:' + server.address().port + '/profile-viewer/content-decision-live-edge.html#ContentCardContainerLoyalty',
      'Sandbox change restores the shared surface');
    const resetPage = await context.newPage();
    resetPage.on('pageerror', error => errors.push(error.message));
    await resetPage.addInitScript(() => {
      sessionStorage.setItem('aep-demo-visitor-reset-v1', JSON.stringify({
        version: 1, id: 'qatar-reset-fixture', oldEcid: '1'.repeat(38),
        status: 'error', orgId: 'fixture', prefix: 'qatarLoyalty', sandbox: 'apalmer',
      }));
      window.__resetEcid = '1'.repeat(38);
      window.__resetCommands = [];
      window.alloy = async command => {
        window.__resetCommands.push(command);
        return command === 'getIdentity' ? { identity: { ECID: window.__resetEcid } } : {};
      };
    });
    await resetPage.goto(origin + '/profile-viewer/qatar-loyalty-demo.html');
    await resetPage.locator('#aepLabRetryVisitorVerification').waitFor({ state: 'visible' });
    await resetPage.waitForFunction(() => window.LoyaltyDemoDiagnostics);
    assert.equal(await resetPage.locator('#queryProfileBtn').isDisabled(), true, 'Reset recovery comes before Profile lookup');
    assert.equal(await resetPage.locator('#aepLabRetryVisitorReset').isVisible(), true);
    resetPage.once('dialog', dialog => dialog.dismiss());
    await resetPage.locator('#aepLabRetryVisitorReset').click();
    assert.equal(await resetPage.evaluate(() => window.AepDemoVisitorReset.isBlocked()), true,
      'Cancelling a fresh reset cannot unblock a failed verification');
    await resetPage.locator('#aepLabRetryVisitorVerification').click();
    await resetPage.waitForFunction(() => window.AepDemoVisitorReset.getState().status === 'error');
    assert.equal(await resetPage.locator('#aepLabRetryVisitorVerification').isVisible(), true);
    assert.equal(await resetPage.locator('#queryProfileBtn').isDisabled(), true);
    for (const theme of ['light', 'dark']) {
      await resetPage.setViewportSize({ width: 390, height: 900 });
      await resetPage.evaluate(value => document.documentElement.setAttribute('data-aep-theme', value), theme);
      assert.equal(await resetPage.locator('#aepLabVisitorResetStatus').evaluate(element =>
        element.scrollWidth <= element.clientWidth), true, 'Recovery controls fit the mobile banner in ' + theme);
    }
    await resetPage.evaluate(() => { window.__resetEcid = '2'.repeat(38); });
    await resetPage.locator('#aepLabRetryVisitorVerification').click();
    await resetPage.locator('#aepLabVisitorResetStatus').waitFor({ state: 'hidden' });
    assert.equal(await resetPage.evaluate(() => window.AepDemoVisitorReset.isBlocked()), false);
    assert.equal(await resetPage.locator('#queryProfileBtn').isEnabled(), true);
    assert.equal(await resetPage.evaluate(() => sessionStorage.getItem('aep-demo-visitor-reset-v1')), null);
    assert.ok((await resetPage.evaluate(() => window.__resetCommands)).every(command => command === 'getIdentity'),
      'Verification recovery issues identity reads only');
    await resetPage.close();
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
