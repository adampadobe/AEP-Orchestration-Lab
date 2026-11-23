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
    const errors = [], stateReads = [], writes = [];
    let spend;
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
        ] } };
      } else if (request.method() !== 'GET') {
        writes.push(url.pathname);
      } else if (url.pathname === '/api/profile/table') {
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
      else if (url.pathname === '/api/profile/audiences') data = { realized: [], exited: [] };
      else if (url.pathname === '/api/image-hosting/library') data = { items: [] };
      else if (url.pathname === '/api/tags/reactor' || url.pathname === '/api/events/datastreams') data = { data: [] };
      return route.fulfill({ json: data });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/profile-viewer/jet2-loyalty-demo.html');
    await page.waitForFunction(() => document.getElementById('loyaltyStatus')?.textContent.includes('SDK injection is only needed'));
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
    const interaction = await page.evaluate(() => window.__cardInteractions.at(-1));
    assert.equal(interaction.xdm._experience.decisioning.propositions[0].id, 'jet2-proposition-2');
    assert.equal(interaction.xdm._experience.decisioning.propositions[0].items[0].id, 'jet2-item-2');
    assert.equal(interaction.xdm._experience.decisioning.propositions[0].scopeDetails.correlationID, 'jet2-correlation-2');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers: [
      { id: 'jet2-featured-fixture', merchant: 'Separate Adobe offer', title: 'Independent Decisioning fixture' },
    ] } })));
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
    }
    assert.equal(await page.locator('#loyaltyFeaturedOffers').innerHTML(), featured, 'Cards and Spend never replace Featured Offers');
    assert.deepEqual(writes, [], 'No automatic signup, provider write or production request');
    assert.deepEqual(errors, []);
    console.log('Jet2 Loyalty: isolated settings, real-state fixtures, ranked cards/attribution, mobile/themes, one-card layout and real purchase contract passed.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
