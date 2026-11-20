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
    const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, reducedMotion: 'reduce' });
    const errors = [], writes = [], reads = [], signupRequests = [];
    let quantity = 0, rejectState = false, missingState = false, unavailableState = false, namespace = 'Email', releaseState, stateStarted;
    let holdState = false, events = [], testProfile = true, eventRefreshes = 0, profileLoyaltyId;
    let consentGate, releaseConsent, consentRequests = 0, rejectConsent = false;
    let stateChallengeId = 'challenge-fixture', optedIn = false;
    let challengeListOverride, stateHasName = true, metadataMode = 'success', metadataGate;
    let signupMode = 'success', signupGate, releaseSignup;
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
        { name: 'kirkham', title: 'Kirkham fixture', type: 'development', state: 'active' },
        ] } };
      }
      else if (url.pathname === '/api/profile/table') data = { found: true, ecid: '12345678901234567890123456789012345678',
        profileEmail: url.searchParams.get('namespace') === 'ecid' ? 'fixture@example.invalid' : url.searchParams.get('identifier'), rows: [
          { path: 'person.name.firstName', value: 'Alex', valueType: 'string' },
          { path: 'testProfile', value: testProfile, valueType: 'boolean' },
          ...(profileLoyaltyId === undefined ? [] : [{
            path: (url.searchParams.get('sandbox') === 'kirkham' ? '_demoemea' : '_ownTenant') + '.identification.core.loyaltyId',
            value: profileLoyaltyId, valueType: 'string',
          }]),
          { path: 'loyalty.loyaltyID.0', value: 'different-program-array-id', valueType: 'string' },
          { path: '_ownTenant.loyaltyDetails.points', value: 0, valueType: 'number' },
          { path: '_ownTenant.loyaltyDetails.level', value: 'Gold', valueType: 'string' },
          { path: '_ownTenant.scoring.npsScore', value: 0, valueType: 'number' },
          { path: 'consents.marketing.email.val', value: 'n', valueType: 'string' },
        ] };
      else if (url.pathname === '/api/profile/consent') {
        consentRequests++;
        if (consentGate) await consentGate;
        if (rejectConsent) return route.fulfill({ status: 503, json: { error: 'Fixture: profile consent service unavailable' } });
        data = { found: true, firstName: 'Alex', email: 'fixture@example.invalid',
          ecid: '12345678901234567890123456789012345678', channels: { email: 'out', sms: null, push: null } };
      }
      else if (url.pathname === '/api/profile/events') { eventRefreshes++; data = { events }; }
      else if (url.pathname === '/api/profile/audiences') data = { realized: [], exited: [] };
      else if (url.pathname === '/api/env-bar-config') data = { config: null };
      else if (url.pathname === '/api/events/generator-targets') data = { targets: [] };
      else if (url.pathname === '/api/tags/reactor' || url.pathname === '/api/events/datastreams') data = { data: [] };
      else if (url.pathname === '/api/image-hosting/library') data = { items: [] };
      else if (url.pathname === '/api/ajo-loyalty') {
        assert.equal(request.headers().authorization, ['kirkham', 'apalmer'].includes(url.searchParams.get('sandbox')) ? undefined : 'Bearer offline-fixture',
          'Demo sandboxes omit Portal authentication; other sandboxes retain it');
        if (request.method() === 'POST') {
          const body = request.postDataJSON();
          signupRequests.push({ sandbox: url.searchParams.get('sandbox'), ...body });
          if (signupGate) await signupGate;
          if (signupMode === 'network') return route.abort('failed');
          if (signupMode === 'unknown') return route.fulfill({ status: 504, json: {
            ok: false, error: 'Fixture: response timed out', signup_submitted: true, signup_outcome_unknown: true, platform_status: null,
          } });
          if (signupMode === 'namespace') return route.fulfill({ status: 409, json: {
            ok: false, error: 'Fixture: configured namespace mismatch',
          } });
          if (signupMode === 'rejected') return route.fulfill({ status: 422, json: {
            ok: false, error: 'Fixture: personalization missing', signup_submitted: true, signup_outcome_unknown: false,
            platform_status: 422, platform_response: { title: 'Challenge personalization not found for profile' },
          } });
          if (signupMode === 'duplicate') return route.fulfill({ status: 409, json: {
            ok: false, error: 'Fixture: already joined', signup_submitted: true, signup_outcome_unknown: false,
            platform_status: 409, platform_response: { title: 'Profile has already joined the challenge' },
          } });
          return route.fulfill({ json: { ok: true, accepted: true, platform_status: 200, challenge_id: body.challenge_id } });
        }
        assert.equal(request.method(), 'GET');
        reads.push(Object.fromEntries(url.searchParams));
        if (unavailableState) return route.fulfill({ status: 404, contentType: 'text/html', body: 'Not Found' });
        if (url.searchParams.get('action') === 'config') data = { ok: true, data: { namespace } };
        else if (url.searchParams.get('action') === 'challenge_get') {
          if (metadataGate) await metadataGate;
          const id = url.searchParams.get('challenge_id');
          if (metadataMode === 'failure' && id === 'coffee-challenge-fixture') {
            return route.fulfill({ status: 404, json: { ok: false, error: 'Fixture: challenge metadata unavailable' } });
          }
          data = { ok: true, data: {
            [id === 'coffee-challenge-fixture' ? 'get_id' : '_id']: metadataMode === 'mismatch' ? 'different-challenge' : id,
            name: id === 'coffee-challenge-fixture' ? 'Coffee rewards (Adobe metadata fixture)  ' : '  Everyday rewards (Adobe metadata fixture)',
          } };
        }
        else {
          if (holdState) await new Promise(resolve => { releaseState = resolve; stateStarted(); });
          if (rejectState) return route.fulfill({ status: 403, json: { ok: false, error: 'Fixture: no active enrollment for this sandbox' } });
          data = { ok: true, data: missingState ? {} : { challengeList: challengeListOverride || [{
            challenge_id: stateChallengeId, ...(stateHasName ? { challengeName: 'Everyday rewards (offline fixture)' } : {}), state: 'active',
            optedIn, tasksToComplete: 2, challengeCompletions: [],
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
    const openConfiguration = async () => {
      if (!await page.locator('#customerEmail').isVisible()) await page.locator('#aepLabEnvMinimizeBtn').click();
    };
    const waitForProfile = () => page.waitForFunction(() =>
      !document.getElementById('queryProfileBtn').disabled && !document.getElementById('loyaltyAbandon').disabled);
    const changeIdentifier = async value => {
      // Isolate context invalidation from an independent lookup triggered by hovering the drawer.
      await page.mouse.move(0, 0);
      await page.locator('#profileHoverZone').dispatchEvent('mouseleave');
      await page.locator('#customerEmail').fill(value);
    };
    const openApiOptions = async () => {
      await openConfiguration();
      if (!await page.locator('.loyalty-settings').evaluate(element => element.open)) {
        await page.locator('.loyalty-settings summary').click();
      }
    };
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/profile-viewer/lloyds-loyalty-demo.html');
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('SDK injection is only needed'));
    await page.evaluate(() => {
      window.AepGlobalSandbox.setSelected('demo-one');
      window.AepLabSandboxSync.getAuthHeaders = async () => ({ Authorization: 'Bearer offline-fixture' });
    });
    assert.equal(await page.locator('#sandboxSelect').isDisabled(), false, 'Sandbox is never pinned to the page author');
    assert.equal(await page.locator('#ContentCardContainer').count(), 1);
    assert.equal(await page.locator('.loyalty-phone #ContentCardContainerLoyalty').count(), 1,
      'The journey placement is inside the mobile app, not the hero or desktop rail');
    assert.equal(await page.locator('#ContentCardContainerLoyalty article').count(), 0, 'No invented journey content before SDK response');
    assert.equal(await page.locator('main.loyalty-workspace .loyalty-settings').count(), 0, 'No duplicate body configuration panel');
    assert.equal(await page.locator('#aepDemoEnvSection #loyaltyRegion').count(), 1, 'API options live in the existing top bar');
    assert.equal(await page.locator('#loyaltyRefresh').textContent(), 'Get task status');
    assert.equal(await page.locator('#loyaltyAbandon').isDisabled(), true, 'Journey events require a loaded profile');
    assert.doesNotMatch(await page.locator('body').textContent(), /Independent lab demonstration\. Not a banking service\./,
      'The requested footer text has been removed');
    assert.doesNotMatch(await page.locator('body').textContent(),
      /Demonstration experience|Web SDK preview · live state, no simulated task completion/,
      'The requested demonstration badge and phone caption stay removed');
    assert.equal(await page.locator('#loyaltyAuto').isChecked(), false, 'Task polling requires explicit opt-in');
    const homeTab = page.locator('.loyalty-phone-nav [data-phone-view="home"]');
    const rewardsTab = page.locator('.loyalty-phone-nav [data-phone-view="rewards"]');
    assert.equal(await page.locator('#loyaltyViewHome').isVisible(), true, 'The mockup opens on Home');
    assert.equal(await page.locator('#loyaltyViewRewards').isVisible(), false);
    assert.equal(await homeTab.getAttribute('aria-current'), 'page');
    const readsBeforeNavigation = reads.length;
    await page.locator('.loyalty-rewards-teaser').click();
    assert.equal(await page.locator('#loyaltyViewHome').isVisible(), false);
    assert.equal(await page.locator('#loyaltyViewRewards').isVisible(), true);
    assert.equal(await rewardsTab.getAttribute('aria-current'), 'page');
    assert.equal(await homeTab.getAttribute('aria-current'), null);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'loyaltyMobileTitle', 'A hidden Home teaser does not retain keyboard focus');
    assert.equal(await page.locator('#loyaltyPrizeDraw').evaluate(element =>
      element.nextElementSibling.querySelector('#ContentCardContainerLoyalty') !== null), true,
    'The live challenge card sits immediately below the Win £1m promotion, before the carousel');
    await page.locator('#loyaltyBreakdownButton').click();
    assert.equal(await page.locator('#loyaltyBreakdown').isVisible(), true);
    assert.equal(await page.locator('#loyaltyBreakdownButton').getAttribute('aria-expanded'), 'true');
    await page.locator('#loyaltyBreakdownButton').click();
    assert.equal(await page.locator('#loyaltyBreakdown').isVisible(), false);
    const carousel = page.locator('#loyaltyOfferCarousel');
    assert.equal(await page.locator('#loyaltyFeaturedOffers [role="listitem"]').count(), 0,
      'Do not immediately render local mock offers');
    assert.match(await page.locator('#loyaltyFeaturedStatus').textContent(), /Loading personalised offers/);
    assert.equal(await carousel.locator('#loyaltyFeaturedStatus').count(), 1,
      'The loading state is inside the existing carousel, not a new surface-named container');
    await page.evaluate(() => {
      for (const offers of [undefined, [], [null, {}, { id: 'empty' }]]) {
        window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers } }));
      }
    });
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyFeaturedOffers [role="listitem"]').length === 6,
      null, { timeout: 10000 });
    assert.equal(await page.locator('#loyaltyFeaturedOffers [role="listitem"]').count(), 6);
    assert.match(await page.locator('#loyaltyFeaturedStatus').textContent(), /Preview offers/);
    assert.equal(await carousel.evaluate(element => element.scrollWidth > element.clientWidth), true, 'Offers swipe horizontally inside the phone');
    await page.locator('#loyaltyNextOffer').click();
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[1].getAttribute('aria-current') === 'true');
    await carousel.focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[5].getAttribute('aria-current') === 'true');
    assert.equal(await page.locator('#loyaltyNextOffer').isDisabled(), true);
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[0].getAttribute('aria-current') === 'true');
    assert.equal(await page.locator('#loyaltyPreviousOffer').isDisabled(), true);
    await page.locator('#loyaltyOfferDots button').nth(3).click();
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[3].getAttribute('aria-current') === 'true');
    await page.locator('#loyaltyOfferDots button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[0].getAttribute('aria-current') === 'true');
    await carousel.scrollIntoViewIfNeeded();
    const carouselBox = await carousel.boundingBox();
    await page.mouse.move(carouselBox.x + carouselBox.width - 40, carouselBox.y + 55);
    await page.mouse.down();
    await page.mouse.move(carouselBox.x + 30, carouselBox.y + 55, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[1].getAttribute('aria-current') === 'true');
    assert.equal(await page.locator('#loyaltySavedOffers .loyalty-merchant-logo').count(), 0, 'Dragging a card does not save it');
    await page.locator('#loyaltyOfferDots button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[0].getAttribute('aria-current') === 'true');
    await page.locator('[data-save-preview-offer="waitrose"]').click();
    assert.equal(await page.locator('[data-save-preview-offer="waitrose"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#loyaltySavedOffers [aria-label="Waitrose saved preview offer"]').count(), 1);
    assert.match(await page.locator('#loyaltyAppToast').textContent(), /preview only.*not activated/);
    assert.equal(signupRequests.length, 0, 'Preview offers and navigation never submit Loyalty signup');
    assert.equal(reads.length, readsBeforeNavigation, 'Navigating the app does not fetch or alter Loyalty state');
    await homeTab.click();
    await rewardsTab.click();
    assert.equal(await page.locator('[data-save-preview-offer="waitrose"]').getAttribute('aria-pressed'), 'true', 'Tab switches preserve preview selections');
    await page.locator('[data-save-preview-offer="waitrose"]').click();
    assert.equal(await page.locator('#loyaltySavedOffers .loyalty-merchant-logo').count(), 0);
    const ajoOffers = Array.from({ length: 6 }, (_, index) => ({
      id: 'ajo-offer-' + index, merchant: index ? 'Merchant ' + index : 'Waitrose', title: index ? 'Cashback ' + index : '15% cashback',
      priority: index * 100, channel: 'Online', expiry: '01 Dec 26', cta: 'Activate offer',
      image: index ? 'javascript:alert(1)' : 'https://example.invalid/offer.png',
      logo: index ? 'data:image/svg+xml,test' : 'https://example.invalid/logo.png',
      propositionId: 'original-proposition-' + index, propositionScope: 'featured-offers',
      propositionScopeDetails: { decisionProvider: 'AJO', activity: { id: 'fixture-activity-' + index } },
      endDate: '2026-12-01T23:59:59Z',
      propositionItemId: 'original-item-' + index, detailTitle: 'Original detail ' + index,
      detailSubtitle: 'Original subtitle', detailDescription: 'Original description',
      destination: 'https://example.invalid/offer', deepLink: 'app://offer/' + index,
    }));
    await page.evaluate(offers => window.dispatchEvent(new CustomEvent('ajo:featured-offers', {
      detail: { offers: [null, {}, { id: 'empty' }, ...offers] },
    })), ajoOffers);
    assert.deepEqual(await page.locator('.loyalty-featured-body h4').allTextContents(),
      ajoOffers.slice(0, 5).map(offer => offer.title), 'Filter invalid offers, cap at five and preserve AJO ranking rather than priority sorting');
    assert.deepEqual(await page.locator('.loyalty-featured-body').first().locator('span,h4,p').allTextContents(),
      ['Waitrose', '15% cashback', 'Channel: Online', 'Expires: 01 Dec 26']);
    assert.equal(await page.locator('[data-save-preview-offer="ajo-offer-0"]').getAttribute('title'), 'Activate offer (preview save only)',
      'The decision CTA is retained on the existing plus control without changing its preview behavior');
    assert.match(await page.locator('.loyalty-featured-art').first().getAttribute('style'), /https:\/\/example.invalid\/offer.png/);
    assert.equal(await page.locator('.loyalty-featured-art').nth(1).getAttribute('style'), null,
      'Unsafe incoming images never reach CSS URLs');
    assert.equal(await page.locator('.loyalty-featured-offer > .loyalty-merchant-logo').nth(1).getAttribute('style'), null,
      'Unsafe incoming logos never reach CSS URLs');
    const originalAjoCard = await page.locator('.loyalty-featured-offer').first().elementHandle();
    await page.locator('#loyaltyNextOffer').click();
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[1].getAttribute('aria-current') === 'true');
    await page.evaluate(offers => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers } })), ajoOffers);
    assert.equal(await originalAjoCard.evaluate(card => card.isConnected), true, 'Duplicate ID order does not recreate cards');
    assert.equal(await page.locator('#loyaltyOfferDots button').nth(1).getAttribute('aria-current'), 'true');
    await page.evaluate(() => {
      const set = Map.prototype.set;
      Map.prototype.set = function(key, value) {
        if (value?.propositionId) window.__selectedFeaturedOffer = value;
        return set.call(this, key, value);
      };
    });
    await page.locator('[data-save-preview-offer="ajo-offer-1"]').click();
    assert.deepEqual(await page.evaluate(() => window.__selectedFeaturedOffer), ajoOffers[1],
      'Existing activation/save behavior receives the complete offer including proposition IDs and detail fields');
    await page.evaluate(offers => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers } })),
      [ajoOffers[1], ajoOffers[0]]);
    assert.deepEqual(await page.locator('.loyalty-featured-body h4').allTextContents(), [ajoOffers[1].title, ajoOffers[0].title]);
    assert.equal(await originalAjoCard.evaluate(card => card.isConnected), false, 'Changed ID order rerenders');
    await page.evaluate(offer => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers: [offer] } })), ajoOffers[0]);
    assert.equal(await page.locator('#loyaltyNextOffer').isDisabled(), true);
    assert.equal(await page.locator('#loyaltyPreviousOffer').isDisabled(), true);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers: [] } })));
    assert.equal(await page.locator('.loyalty-featured-offer').count(), 1, 'Invalid later events do not discard valid offers');
    const envelope = { propositionId: 'envelope-proposition', propositionScope: 'featured-offers',
      propositionScopeDetails: { decisionProvider: 'AJO', activity: { id: 'envelope-activity' } } };
    const envelopeOffers = [{ ...ajoOffers[0], id: 'item-metadata-wins' },
      { id: 'envelope-metadata', merchant: 'TK Maxx', title: '10% cashback', cta: 'Activate offer',
        detailTitle: 'Get 10% cashback at TK Maxx', detailSubtitle: 'Your next shop',
        detailDescription: 'Fixture description', image: 'https://example.invalid/tk.png',
        endDate: '2026-12-14T23:59:59Z', propositionItemId: 'envelope-item' }];
    await page.evaluate(detail => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail })),
      { ...envelope, offers: envelopeOffers });
    assert.equal(await page.locator('.loyalty-featured-offer').count(), 2, 'One returned item produces one card');
    await page.locator('[data-save-preview-offer="item-metadata-wins"]').click();
    assert.deepEqual(await page.evaluate(() => window.__selectedFeaturedOffer), envelopeOffers[0],
      'Item-level proposition metadata takes precedence over envelope metadata');
    await page.locator('[data-save-preview-offer="envelope-metadata"]').click();
    assert.deepEqual(await page.evaluate(() => window.__selectedFeaturedOffer), { ...envelopeOffers[1], ...envelope },
      'Missing per-item attribution inherits the complete envelope without discarding detail fields');
    await page.locator('#loyaltyPrizeDraw button').click();
    assert.match(await page.locator('#loyaltyAppToast').textContent(), /No banking action or prize entry was submitted/);
    if (process.env.AEP_LOYALTY_SCREENSHOT) {
      await page.evaluate(() => { document.getElementById('loyaltyAppToast').hidden = true; });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
        await homeTab.click();
        await page.locator('.loyalty-phone').screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-home-' + theme + '.png') });
        await rewardsTab.click();
        await page.evaluate(() => { document.querySelector('.loyalty-phone-scroll').scrollTop = 0; });
        await page.locator('.loyalty-phone').screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-rewards-' + theme + '.png') });
      }
      await page.evaluate(() => document.documentElement.removeAttribute('data-aep-theme'));
    }
    await page.locator('[data-subgroup="demoLloyds"]').waitFor();
    assert.equal(await page.locator('[data-subgroup="demoLloyds"] a[href="lloyds-loyalty-demo.html"]').count(), 1);
    await openConfiguration();
    for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.ok(await page.locator('#customerEmail').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth;
      }), 'The email lookup is visible without scrolling the configuration panel at ' + viewport.width + 'px');
      assert.ok(await page.locator('#queryProfileBtn').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      }), 'The profile lookup button is visible without scrolling');
    }
    await page.setViewportSize({ width: 1500, height: 1100 });
    await changeIdentifier('fixture@example.invalid');
    consentGate = new Promise(resolve => { releaseConsent = resolve; });
    const firstConsent = page.waitForRequest(request => new URL(request.url()).pathname === '/api/profile/consent');
    await page.locator('#queryProfileBtn').click();
    await firstConsent;
    await page.locator('#profileHoverZone').dispatchEvent('mouseenter');
    releaseConsent(); consentGate = null;
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled &&
      window.DemoProfileDrawer.getLastLookedUpProfile()?.firstName === 'Alex');
    assert.equal(await page.locator('#loyaltyStatus').getAttribute('data-error'), 'false',
      'Opening the drawer during lookup must not report failure before its data arrives');
    assert.equal(consentRequests, 1, 'Same-profile hover and explicit lookups share one drawer request');
    await waitForProfile();
    assert.equal(await page.locator('#loyaltyHomeName').textContent(), 'Alex', 'Home greets the selected profile, not a hardcoded customer');
    assert.equal(await page.locator('#loyaltyHomeAvatar').textContent(), 'A');
    assert.equal(await page.locator('#tuiPhSignal-points').textContent(), '0',
      'The successful page lookup must publish its table signals alongside the basic drawer fields');
    await page.evaluate(() => {
      document.getElementById('customerEmail').dispatchEvent(new Event('input', { bubbles: true }));
      window.dispatchEvent(new CustomEvent('aep-global-sandbox-change', {
        detail: { name: window.AepGlobalSandbox.getSandboxName() },
      }));
    });
    assert.equal(await page.locator('#loyaltyAbandon').isDisabled(), false,
      'Same-value identity and sandbox notifications must not discard a loaded profile');
    await page.locator('#profileHoverZone').dispatchEvent('mouseleave');
    await page.waitForFunction(() => !document.body.classList.contains('mod-demo-page--profile-open'));
    rejectConsent = true;
    await page.locator('#queryProfileBtn').click();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.match(await page.locator('#loyaltyStatus').textContent(), /profile consent service unavailable/,
      'Preserve the actual drawer API failure rather than a generic lookup failed message');
    assert.equal(await page.locator('#loyaltyAbandon').isDisabled(), true,
      'A genuine drawer failure must not enable profile-dependent event actions');
    rejectConsent = false;
    const consentBeforeHandoff = consentRequests;
    await page.evaluate(() => window.DemoProfileDrawer.loadProfileDataForDrawer(
      document.getElementById('customerEmail').value, { updateMessage: false, sendApplicationLogin: false }));
    await waitForProfile();
    assert.equal(consentRequests, consentBeforeHandoff + 1,
      'A drawer-first load enables page actions without repeating the drawer request');
    await page.waitForFunction(() => document.getElementById('tuiPhSignal-points').textContent === '0');
    assert.equal(await page.locator('#tuiPhSignal-points').textContent(), '0',
      'Drawer-first lookup also loads the table signals needed by the Loyalty page');
    assert.equal(reads.length, 0, 'Profile lookup does not depend on the Loyalty backend or SDK');
    unavailableState = true;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Loyalty API is not deployed'));
    assert.equal(reads.length, 1, 'An unavailable backend is reported once, not hidden behind a missing-region prompt');
    assert.equal(reads[0].action, 'config');
    unavailableState = false;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.ok(reads.some(read => read.action === 'profile_state' && !Object.hasOwn(read, 'region')),
      'Without an override, use the backend documented va7 default instead of requiring setup or probing regions');
    assert.equal(JSON.parse(await page.locator('#loyaltyEvidence').textContent()).region, 'va7');
    challengeListOverride = ['challenge-fixture', 'coffee-challenge-fixture'].map(id => ({
      challenge_id: id, challengeName: id === 'challenge-fixture' ? id : '  ',
      state: 'active', optedIn: false, tasksToComplete: 1,
      tasks: [{ taskId: 'purchase', taskName: 'Make three purchases', taskState: 'incomplete' }],
    }));
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    const metadataNames = ['Everyday rewards (Adobe metadata fixture)', 'Coffee rewards (Adobe metadata fixture)'];
    assert.deepEqual(await page.locator('#loyaltyTasks .loyalty-progress-summary h3').allTextContents(), metadataNames,
      'All returned nameless challenges resolve metadata, without requiring a challenge filter');
    assert.deepEqual(await page.locator('#loyaltyPhoneTasks h4').allTextContents(), metadataNames);
    assert.match(await page.locator('#loyaltyTasks .loyalty-task-details').first().textContent(), /Challenge ID: challenge-fixture/,
      'Technical IDs remain available in API details');
    metadataMode = 'failure';
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.deepEqual(await page.locator('#loyaltyPhoneTasks h4').allTextContents(),
      [metadataNames[0], 'Challenge name unavailable']);
    assert.match(await page.locator('#loyaltyTasks').textContent(), /challenge metadata unavailable/);
    assert.equal(await page.locator('#loyaltyTasks .loyalty-task').count(), 2,
      'An individual metadata failure does not hide Adobe-reported task progress');
    metadataMode = 'mismatch';
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.deepEqual(await page.locator('#loyaltyPhoneTasks h4').allTextContents(),
      ['Challenge name unavailable', 'Challenge name unavailable'], 'Never apply another challenge identity\'s name');
    metadataMode = 'success';
    await openApiOptions();
    await page.locator('#loyaltyChallenge').fill('coffee-challenge-fixture');
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.deepEqual(await page.locator('#loyaltyPhoneTasks h4').allTextContents(), [metadataNames[1]]);
    await page.locator('[data-loyalty-participation="complete"]').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.deepEqual(await page.locator('#loyaltyPhoneTasks h4').allTextContents(), [metadataNames[1]],
      'Completed participation resolves the same exact challenge name');
    await page.locator('[data-loyalty-participation="active"]').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    let releaseMetadata;
    metadataGate = new Promise(resolve => { releaseMetadata = resolve; });
    const pendingMetadata = page.waitForRequest(request => new URL(request.url()).searchParams.get('action') === 'challenge_get');
    await page.locator('#loyaltyRefresh').click();
    await pendingMetadata;
    await openApiOptions();
    await page.locator('#loyaltyChallenge').fill('challenge-fixture');
    releaseMetadata(); metadataGate = undefined;
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await page.locator('#loyaltyTasks .loyalty-challenge').count(), 0,
      'Delayed metadata cannot refill progress after its challenge context changes');
    assert.equal(await page.locator('#loyaltyPhoneTasks h4').count(), 0);
    challengeListOverride = undefined;
    await openApiOptions();
    await page.locator('#loyaltyChallenge').fill('');
    await page.locator('#loyaltyRegion').selectOption('nld2');
    await page.locator('#loyaltyTenant').fill('_ownTenant');
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.match(await page.locator('#loyaltyTasks').textContent(), /Opted in: false/);
    assert.match(await page.locator('#loyaltyTasks').textContent(), /0 of 3/);
    assert.equal(await page.locator('.loyalty-task progress').count(), 1, 'Missing accumulator is never fabricated as zero');
    assert.equal(await page.locator('.loyalty-task[data-complete="true"]').count(), 0, 'Previous-cycle completions do not complete current tasks');
    assert.equal(await page.locator('.loyalty-progress-ring b').textContent(), '0 / 2');
    assert.equal(await page.locator('.loyalty-phone-count').textContent(), '0 / 2 tasks complete');
    assert.equal(await page.locator('.loyalty-phone-task[data-complete="true"]').count(), 0);
    assert.equal(await page.locator('.loyalty-phone-task button').count(), 0, 'Phone tasks cannot be completed by local simulation buttons');
    challengeListOverride = [{
      challenge_id: stateChallengeId, challengeName: 'Completed partner challenge', state: 'sent',
      optedIn: true, tasksToComplete: 3, completionDate: '2026-11-19T22:02:33.090Z',
      tasks: ['PureGym', 'TK Maxx', 'Waitrose'].map((name, index) => ({
        taskId: 'partner-' + index, taskName: name, taskState: 'sent',
        variables: { qtyMin: 1 },
        taskCompletions: [{ completionDate: '2026-11-19T22:02:30.767Z', accumulators: { qty: 1 } }],
      })),
    }];
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await page.locator('.loyalty-progress-ring b').textContent(), '3 / 3',
      'Adobe sent is the post-completion state, not an unfinished task');
    assert.equal(await page.locator('.loyalty-phone-count').textContent(), '3 / 3 tasks complete');
    assert.equal(await page.locator('.loyalty-phone-tick').count(), 3);
    assert.equal(await page.locator('.loyalty-task[data-current="true"]').count(), 0);
    assert.match(await page.locator('.loyalty-outcome').textContent(), /Challenge completed/);
    assert.match(await page.locator('.loyalty-outcome').textContent(), /Reward delivery is not verified/);
    assert.doesNotMatch(await page.locator('.loyalty-phone-task').first().textContent(), /sent/);
    assert.match(await page.locator('.loyalty-task-details').textContent(), /State: sent/,
      'Raw Adobe state remains available in API diagnostics');
    await page.locator('[data-loyalty-participation="complete"]').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await page.locator('.loyalty-phone-tick').count(), 3,
      'Completed participation renders Adobe sent tasks as complete too');
    await page.locator('[data-loyalty-participation="active"]').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    challengeListOverride[0].state = 'incomplete';
    challengeListOverride[0].tasks[1].taskState = 'incomplete';
    challengeListOverride[0].tasks[2].taskState = 'unrecognized';
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await page.locator('.loyalty-progress-ring b').textContent(), '1 / 3',
      'Historical completion receipts do not complete current incomplete or unknown task states');
    assert.doesNotMatch(await page.locator('.loyalty-outcome').textContent(), /Challenge completed/);
    challengeListOverride = undefined;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    await page.waitForFunction(() => document.getElementById('tuiPhSignal-points')?.textContent === '0');
    assert.equal(await page.locator('#tuiPhSignal-emailConsent').textContent(), 'n');
    assert.equal(await page.locator('#tuiPhSignal-tier').textContent(), 'Gold');
    assert.equal(await page.locator('#tuiPhSignal-nps').textContent(), '0');
    assert.equal(await page.locator('#tuiPhSignal-loyaltyId').textContent(), 'Not set',
      'A missing scalar Loyalty identity is not inferred from the separate loyalty.loyaltyID array');
    assert.equal(await page.locator('#tuiProfileHero').getAttribute('aria-label'), 'Loaded Loyalty profile');
    assert.ok(reads.some(read => read.action === 'profile_state' && read.profile_id === 'fixture@example.invalid' && read.region === 'nld2' && read.sandbox === 'demo-one'));
    await openApiOptions();
    await page.locator('#loyaltyAuto').check();
    await page.locator('#aepLabEnvMinimizeBtn').click();
    await page.evaluate(() => {
      const surface = document.getElementById('loyaltySurface').value;
      window.__sdkCalls = [];
      window.alloy = async (command, payload) => {
        window.__sdkCalls.push({ command, payload });
        if (command === 'getIdentity') {
          if (window.__pauseIdentity) await new Promise(resolve => { window.__releaseDecision = resolve; });
          return { identity: { ECID: window.__browserEcid ?? '12345678901234567890123456789012345678' } };
        }
        if (payload.xdm?.eventType === 'abandoned.search') {
          if (window.__rejectAbandon) throw new Error('Fixture: Edge response interrupted');
          return {};
        }
        if (payload.xdm?.eventType?.startsWith('decisioning.proposition')) return {};
        if (payload.personalization?.surfaces?.[0] === '#featured-offers') return { propositions: [] };
        if (window.__emptyCardResponse) return { propositions: [] };
        const proposition = (id, scope, rank) => ({ id, scope, scopeDetails: { decisionProvider: 'CJM', rank }, items: [{
          id: 'item-' + id, name: 'Loyalty offer fixture', itemSelection: { selectionDetail: { strategyID: 'strategy-fixture' } },
          data: { rules: [{ consequences: [{ id: 'consequence-' + id, detail: { data: {
            contentType: 'application/json', content: { title: { content: '<b>Your rewards</b>' }, body: { content: 'Synthetic browser fixture, not a live offer.' },
              buttons: [{ id: 'see-tasks', text: { content: 'See my tasks' }, actionUrl: '#loyalty-challenges' }] },
          } } }] }] },
        }] });
        return { propositions: [
          proposition('hero', surface.replace('ContentCardContainerLoyalty', 'hero-banner'), 999),
          proposition('legacy', surface.replace('ContentCardContainerLoyalty', 'ContentCardContainer'), 999),
          proposition('card', surface, 1),
        ] };
      };
      window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: 'reviewed-fixture-stream' } });
    });
    const abandonCalls = () => page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.xdm?.eventType === 'abandoned.search'));
    assert.equal((await abandonCalls()).length, 0, 'Lookup, task reads and SDK setup never send a journey event');
    const refreshesBefore = eventRefreshes;
    await page.locator('#loyaltyAbandon').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('abandoned.search accepted'));
    const abandoned = await abandonCalls();
    assert.equal(abandoned.length, 1, 'One explicit click sends one event');
    assert.equal(abandoned[0].payload.xdm.identityMap.loyaltyId, undefined, 'Missing Loyalty identity is not invented');
    assert.equal(abandoned[0].payload.xdm._ownTenant.identification.core.loyaltyId, undefined);
    assert.deepEqual(abandoned[0], { command: 'sendEvent', payload: {
      edgeConfigOverrides: { datastreamId: 'reviewed-fixture-stream' }, renderDecisions: false,
      personalization: { defaultPersonalizationEnabled: false },
      xdm: {
        eventType: 'abandoned.search',
        identityMap: {
          Email: [{ id: 'fixture@example.invalid', authenticatedState: 'authenticated', primary: true }],
          ECID: [{ id: '12345678901234567890123456789012345678', authenticatedState: 'ambiguous', primary: false }],
        },
        _ownTenant: { identification: { core: { ecid: '12345678901234567890123456789012345678', email: 'fixture@example.invalid' } } },
        web: { webPageDetails: { URL: origin + '/profile-viewer/lloyds-loyalty-demo.html', name: 'Lloyds Loyalty', viewName: 'Lloyds Loyalty' } },
      },
    } }, 'The TUI / Center Parcs event contract is preserved with the selected profile, tenant and datastream');
    assert.ok(eventRefreshes > refreshesBefore, 'Accepted events refresh the shared profile timeline');
    assert.match(await page.locator('#loyaltyStatus').textContent(), /Journey entry is not yet verified/);
    assert.equal(await page.locator('.loyalty-task[data-complete="true"]').count(), 0, 'Sending a journey event never completes a task locally');
    await page.evaluate(() => { window.__rejectAbandon = true; });
    await page.locator('#loyaltyAbandon').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('The event may already have been ingested'));
    assert.match(await page.locator('#loyaltyStatus').textContent(), /No automatic retry/);
    await page.evaluate(() => { window.__rejectAbandon = false; });
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await page.locator('#siteCloneDecisioningEnabledToggle').isChecked(), false,
      'Journey content does not require the Decisioning toggle');
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
    const decision = calls.find(call => call.payload?.personalization?.surfaces?.[0]?.endsWith('#ContentCardContainerLoyalty'))?.payload;
    const sharedCardSurface = origin.replace('http:', 'web:') + '/profile-viewer/content-decision-live-edge.html#ContentCardContainerLoyalty';
    assert.deepEqual(decision.personalization.surfaces, [sharedCardSurface],
      'Request the configured shared AJO channel, not the Lloyds document URL');
    assert.equal(await page.locator('#ContentCardContainerLoyalty h3').textContent(), '<b>Your rewards</b>');
    const originalCard = await page.locator('#ContentCardContainerLoyalty article').elementHandle();
    const sdkCallsBeforeTabs = await page.evaluate(() => window.__sdkCalls.length);
    await homeTab.click();
    await rewardsTab.click();
    assert.equal(await originalCard.evaluate(card => card.isConnected), true, 'Tab switches preserve the original live card and its handlers');
    assert.equal(await page.evaluate(() => window.__sdkCalls.length), sdkCallsBeforeTabs, 'Switching tabs does not resend a proposition, display or signup event');
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.match(await page.locator('#loyaltyStatus').textContent(), /unchanged/i,
      'An unchanged direct card response completes the loading state without collecting display again');
    assert.equal(await originalCard.evaluate(card => card.isConnected), true);
    await page.evaluate(() => { window.__emptyCardResponse = true; });
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('previous card was removed'));
    assert.equal(await page.locator('#ContentCardContainerLoyalty article').count(), 0,
      'An authoritative empty refresh cannot leave an obsolete challenge card visible');
    await page.evaluate(() => { window.__emptyCardResponse = false; });
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('original proposition display accepted'));
    if (process.env.AEP_LOYALTY_SCREENSHOT) {
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => {
          document.documentElement.setAttribute('data-aep-theme', theme);
          const scroll = document.querySelector('.loyalty-phone-scroll'), prize = document.getElementById('loyaltyPrizeDraw');
          scroll.scrollTop += prize.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12;
        }, theme);
        await page.locator('.loyalty-phone').screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-challenge-' + theme + '.png') });
        await page.evaluate(() => {
          const scroll = document.querySelector('.loyalty-phone-scroll'), featured = document.getElementById('loyaltyFeaturedTitle');
          scroll.scrollTop += featured.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12;
        });
        await page.locator('.loyalty-phone').screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-carousel-' + theme + '.png') });
      }
      await page.evaluate(() => document.documentElement.removeAttribute('data-aep-theme'));
    }
    await page.locator('#ContentCardContainer button').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Proposition interaction accepted'));
    assert.match(await page.locator('#loyaltyTasks').textContent(), /0 of 3/, 'A successful card interaction does not advance tasks locally');
    quantity = 3;
    await page.waitForFunction(() => document.querySelectorAll('.loyalty-task[data-complete="true"]').length === 1,
      null, { timeout: 35000 });
    assert.equal(await page.locator('.loyalty-progress-ring b').textContent(), '1 / 2');
    assert.equal(await page.locator('.loyalty-phone-count').textContent(), '1 / 2 tasks complete');
    assert.equal(await page.locator('.loyalty-phone-task[data-complete="true"]').count(), 1);
    const extent = await page.evaluate(() => ({
      height: document.scrollingElement.scrollHeight, viewport: innerHeight,
      bottom: document.querySelector('.loyalty-workspace').getBoundingClientRect().bottom + scrollY,
    }));
    assert.ok(extent.height - Math.max(extent.viewport, extent.bottom) < 100,
      'Navigation chrome must not add an extra empty viewport below the page: ' + JSON.stringify(extent));
    if (process.env.AEP_LOYALTY_SCREENSHOT) {
      await page.evaluate(() => {
        window.scrollTo(0, 0); document.querySelector('.loyalty-phone-scroll').scrollTop = 0;
        document.documentElement.removeAttribute('data-aep-theme');
      });
      await page.screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT });
      await page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
      await page.screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-dark.png') });
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
      assert.ok(await page.locator('.loyalty-hero').isVisible());
      assert.notEqual(await page.locator('.loyalty-phone').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('.loyalty-columns').evaluate(node => node.getBoundingClientRect().right <= innerWidth + 1), 'Cards fit a mobile viewport');
    assert.ok(await page.locator('#loyaltyRun,#loyaltyRefresh,#loyaltyAbandon').evaluateAll(nodes =>
      nodes.every(node => node.getBoundingClientRect().right <= innerWidth + 1)), 'Action buttons remain on screen on mobile');
    assert.ok(await page.locator('.loyalty-phone').evaluate(node => {
      const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1;
    }), 'The phone frame fits a narrow mobile viewport');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'The redesigned page must not introduce horizontal scrolling on mobile');
    await page.locator('#loyaltyOfferDots button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[0].getAttribute('aria-current') === 'true');
    assert.ok(await page.locator('#loyaltyOfferCarousel').evaluate(element => {
      const rect = element.getBoundingClientRect(), phone = document.querySelector('.loyalty-phone').getBoundingClientRect();
      return rect.left >= phone.left && rect.right <= phone.right;
    }), 'The swipeable carousel stays within the mobile phone instead of widening the page');
    assert.equal(await page.locator('.loyalty-featured-offer').first().evaluate(element =>
      element.getBoundingClientRect().width < document.getElementById('loyaltyOfferCarousel').clientWidth - 20), true,
    'The next offer peeks into view at mobile width');
    await openApiOptions();
    assert.ok(await page.locator('#loyaltyRegion').evaluate(node => {
      const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1;
    }), 'Top-bar API options remain accessible on mobile');
    await page.locator('#aepLabEnvMinimizeBtn').click();
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.locator('[data-loyalty-participation="complete"]').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await page.locator('#loyaltyParticipation').inputValue(), 'complete');
    assert.equal(await page.locator('[data-loyalty-participation="complete"]').getAttribute('aria-pressed'), 'true');
    assert.ok(reads.some(read => read.action === 'profile_challenges' && read.state === 'complete'));
    await page.locator('[data-loyalty-participation="active"]').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    rejectState = true;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('no active enrollment'));
    assert.match(await page.locator('#loyaltyUpdated').textContent(), /stale/);
    rejectState = false; unavailableState = true;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Loyalty API is not deployed'));
    assert.equal(await page.locator('#loyaltyRun').isDisabled(), false, 'Backend unavailability does not block the separately configured SDK content-card action');
    unavailableState = false; missingState = true;
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
    await changeIdentifier('other@example.invalid');
    holdState = false; releaseState?.();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await page.locator('#ContentCardContainer article').count(), 0);
    assert.equal(await page.locator('.loyalty-task').count(), 0, 'Stale response cannot refill a different identity');
    assert.equal(await page.locator('.loyalty-phone-task').count(), 0, 'Stale responses cannot refill the mobile preview either');
    assert.match(await page.locator('#tuiPhName').textContent(), /No profile loaded|Not loaded/);
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    const displayedBefore = await page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.xdm?.eventType === 'decisioning.propositionDisplay').length);
    const decisionsBefore = await page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.personalization?.surfaces).length);
    await page.evaluate(() => { window.__pauseIdentity = true; });
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => typeof window.__releaseDecision === 'function' ||
      document.getElementById('loyaltyStatus').dataset.error === 'true');
    assert.equal(await page.evaluate(() => typeof window.__releaseDecision), 'function', await page.locator('#loyaltyStatus').textContent());
    if (!await page.locator('#customerEmail').isVisible()) await page.locator('#aepLabEnvMinimizeBtn').click();
    await changeIdentifier('third@example.invalid');
    await page.evaluate(async () => {
      window.__heldAlloy = window.alloy;
      window.alloy = undefined;
      await window.DemoProfileDrawer.loadProfileDataForDrawer(
        document.getElementById('customerEmail').value, { updateMessage: false, sendApplicationLogin: false });
    });
    await waitForProfile();
    assert.equal(await page.locator('#queryProfileBtn').isDisabled(), false,
      'A new drawer profile is not blocked by an abandoned SDK promise from the previous identity');
    await page.evaluate(() => { window.__pauseIdentity = false; window.__releaseDecision(); });
    await waitForProfile();
    assert.equal(await page.locator('#loyaltyAbandon').isDisabled(), false,
      'A drawer-first load queued during a previous operation hydrates the current profile without another lookup');
    assert.equal(await page.locator('#ContentCardContainer article').count(), 0);
    assert.equal(await page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.xdm?.eventType === 'decisioning.propositionDisplay').length),
      displayedBefore, 'A stale SDK response must not render or send a display event for the new identity');
    assert.equal(await page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.personalization?.surfaces).length),
      decisionsBefore, 'Identity changes during SDK lookup must block the Edge decision before dispatch');
    await page.evaluate(() => { window.alloy = window.__heldAlloy; delete window.__heldAlloy; });
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('demo-two'));
    assert.equal(await page.locator('#loyaltyRegion').inputValue(), '');
    assert.equal(await page.locator('#loyaltyTenant').inputValue(), '');
    assert.equal(await page.locator('#loyaltySurface').inputValue(), sharedCardSurface,
      'Sandbox changes restore the shared channel surface rather than the Lloyds page URL');
    await openApiOptions();
    await page.locator('#loyaltyRegion').selectOption('va7');
    if (!await page.locator('#customerEmail').isVisible()) await page.locator('#aepLabEnvMinimizeBtn').click();
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.ok(reads.some(read => read.action === 'profile_state' && read.sandbox === 'demo-two' &&
      read.region === 'va7' && read.profile_id === 'third@example.invalid'));
    assert.equal((await abandonCalls()).length, 2, 'Content cards, state polling, errors and sandbox changes never retry journey events');
    await page.locator('#loyaltyAbandon').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Configure the reviewed event tenant'));
    assert.equal((await abandonCalls()).length, 2, 'A sandbox change clears the tenant; no guessed event XDM is sent');
    await openApiOptions();
    await page.locator('#loyaltyTenant').fill('_ownTenant');
    testProfile = false;
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    await page.locator('#loyaltyAbandon').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Only AEP test profiles'));
    assert.equal((await abandonCalls()).length, 2, 'The TUI test-profile mutation guard is retained');
    testProfile = true;
    await openConfiguration();
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    await page.evaluate(() => { window.__pauseIdentity = true; window.__releaseDecision = null; });
    await page.locator('#loyaltyAbandon').click();
    await page.waitForFunction(() => typeof window.__releaseDecision === 'function');
    assert.match(await page.locator('#loyaltyStatus').textContent(), /Preparing abandoned.search/,
      'Preparing the SDK is visibly acknowledged rather than looking like an inactive button');
    assert.equal(await page.locator('#loyaltyAbandon').isDisabled(), true, 'Double clicks are blocked while an event is being prepared');
    await openConfiguration();
    await changeIdentifier('changed@example.invalid');
    await page.evaluate(() => { window.__pauseIdentity = false; window.__releaseDecision(); });
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal((await abandonCalls()).length, 2, 'An identity change during getIdentity blocks event dispatch');
    assert.equal(await page.locator('#loyaltyAbandon').isDisabled(), true);
    await page.waitForFunction(() => document.getElementById('tuiPhSignal-loyaltyId').textContent === 'Not loaded');
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    await page.evaluate(() => { window.__pauseIdentity = true; window.__releaseDecision = null; });
    await page.locator('#loyaltyAbandon').click();
    await page.waitForFunction(() => typeof window.__releaseDecision === 'function');
    await page.evaluate(() => {
      window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: 'changed-stream' } });
      window.__pauseIdentity = false; window.__releaseDecision();
    });
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Event datastream changed'));
    assert.equal((await abandonCalls()).length, 2, 'A changed event destination blocks dispatch after asynchronous identity lookup');
    await openConfiguration();
    await page.locator('#lloydsLoyaltyNs').selectOption('ecid');
    await changeIdentifier('99999999999999999999999999999999999999');
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    await page.locator('#loyaltyAbandon').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('selected ECID differs'));
    assert.equal((await abandonCalls()).length, 2, 'Never associate a selected ECID with a different browser ECID');
    profileLoyaltyId = 'loyalty-fixture-123';
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('kirkham'));
    assert.equal(await page.locator('#loyaltyTenant').inputValue(), '_demoemea',
      'Kirkham gets the same reviewed default as TUI / Center Parcs, without manual tenant setup');
    await openConfiguration();
    await page.locator('#lloydsLoyaltyNs').selectOption('email');
    await changeIdentifier('kirkham-fixture@example.invalid');
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    await page.waitForFunction(() => document.getElementById('tuiPhSignal-loyaltyId').textContent === 'loyalty-fixture-123');
    assert.equal(await page.locator('#tuiPhSignal-loyaltyId').textContent(), 'loyalty-fixture-123',
      'The shared Loyalty drawer displays the scalar ID extracted from the supplied schema path');
    await page.locator('#loyaltyAbandon').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Journey entry is not yet verified'));
    const defaultTenantEvent = (await abandonCalls())[2].payload;
    assert.equal(defaultTenantEvent.xdm.eventType, 'abandoned.search');
    assert.deepEqual(defaultTenantEvent.xdm._demoemea.identification.core, {
      ecid: '12345678901234567890123456789012345678', email: 'kirkham-fixture@example.invalid',
      loyaltyId: 'loyalty-fixture-123',
    }, 'The TUI tenant identification fields are sent against the loaded profile');
    assert.deepEqual(defaultTenantEvent.xdm.identityMap.loyaltyId, [{
      id: 'loyalty-fixture-123', authenticatedState: 'authenticated', primary: false,
    }], 'The loaded Loyalty identity is authenticated and secondary');
    assert.equal(defaultTenantEvent.xdm.identityMap.Email[0].primary, true);
    assert.equal(defaultTenantEvent.xdm._ownTenant, undefined, 'The previous sandbox tenant is never reused');
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('demo-two'));
    assert.equal(await page.locator('#loyaltyTenant').inputValue(), '', 'The reviewed default is scoped to Kirkham only');
    await page.waitForFunction(() => document.getElementById('tuiPhSignal-loyaltyId').textContent === 'Not loaded',
      null, { timeout: 5000 });
    await page.evaluate(() => window.AepGlobalSandbox.setSelected('kirkham'));
    await page.reload();
    await page.waitForFunction(() => document.getElementById('loyaltyTenant')?.value === '_demoemea' &&
      !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await page.locator('#loyaltyTenant').inputValue(), '_demoemea',
      'The TUI-compatible tenant is also populated on initial page load, not only after a sandbox switch');
    await rewardsTab.click();
    await page.evaluate(() => {
      window.__journeySubscriptions = [];
      window.__journeyTracking = [];
      window.__journeyCommands = [];
      window.alloy = async (command, options) => {
        window.__journeyCommands.push(options?.personalization?.surfaces?.[0] === '#featured-offers' ? 'featured-sendEvent' : command);
        if (command === 'getIdentity') return { identity: { ECID: '12345678901234567890123456789012345678' } };
        if (command === 'sendEvent' && options.personalization?.surfaces?.[0] === '#featured-offers') return { propositions: [] };
        if (command === 'subscribeRulesetItems') { window.__journeySubscriptions.push(options); return; }
        if (command === 'sendEvent' && options.personalization?.surfaces) {
          if (options.renderDecisions !== true || options.personalization.schemas !== undefined) {
            throw new Error('Use SDK ruleset evaluation and default supported schemas, not the legacy decision-only schema list');
          }
          const subscription = window.__journeySubscriptions.at(-1);
          const propositions = [{ id: 'journey-card', scope: subscription.surfaces[0],
            scopeDetails: { decisionProvider: 'CJM' }, items: [{ id: 'native-card',
              schema: 'https://ns.adobe.com/personalization/message/content-card',
              data: { content: { title: window.__journeyTitle || 'Delivered by the journey', body: 'Native AJO card',
                actionUrl: '#loyalty-challenges' }, meta: { buttonLabel: 'View tasks' } } }] }];
          window.__deliverJourney = () => subscription.callback({ propositions: window.__emptyJourneySubscription ? [] : propositions }, async (type, selected) => {
            window.__journeyTracking.push({ type, selected });
          });
          window.__deliverJourney();
          if (window.__staleDirectResponse) {
            const stale = JSON.parse(JSON.stringify(propositions));
            stale[0].items[0].data.content.title = 'Obsolete direct-response card';
            return { propositions: stale };
          }
          return { propositions: [] };
        }
        return {};
      };
      window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: 'native-fixture-stream' } });
    });
    await openConfiguration();
    await changeIdentifier('journey-fixture@example.invalid');
    await page.locator('#queryProfileBtn').click();
    await page.waitForFunction(() => document.querySelector('#ContentCardContainerLoyalty h3')?.textContent === 'Delivered by the journey');
    assert.equal(await page.locator('#siteCloneDecisioningEnabledToggle').isChecked(), false);
    const journey = await page.evaluate(() => ({
      commands: window.__journeyCommands, tracking: window.__journeyTracking,
      schemas: window.__journeySubscriptions[0].schemas,
      surfaces: window.__journeySubscriptions[0].surfaces,
    }));
    assert.deepEqual(journey.surfaces, [sharedCardSurface],
      'Automatic ruleset subscription uses the shared channel while rendering in the Lloyds phone');
    assert.ok(journey.commands.indexOf('subscribeRulesetItems') < journey.commands.indexOf('sendEvent'),
      'Subscribe before requesting ruleset evaluation; sendEvent itself returns no cards');
    assert.deepEqual(journey.schemas, ['https://ns.adobe.com/personalization/message/content-card']);
    assert.equal(journey.tracking.length, 1);
    assert.equal(journey.tracking[0].type, 'display');
    assert.equal(journey.tracking[0].selected[0].items[0].id, 'native-card');
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.match(await page.locator('#loyaltyStatus').textContent(), /unchanged/i,
      'An unchanged subscription update completes the loading state');
    assert.equal(await page.evaluate(() => window.__journeyTracking.length), 1);
    await page.evaluate(() => window.__deliverJourney());
    assert.equal(await page.evaluate(() => window.__journeyTracking.length), 1,
      'Repeated ruleset callbacks cannot loop display collection');
    await page.evaluate(() => { window.__journeyTitle = 'Updated journey content'; window.__staleDirectResponse = true; });
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await page.locator('#ContentCardContainerLoyalty h3').textContent(), 'Updated journey content',
      'A current ruleset callback wins over an older direct sendEvent response, even with the same proposition IDs');
    await page.evaluate(() => { window.__journeyTitle = ''; window.__staleDirectResponse = false; });
    await page.evaluate(() => {
      window.__journeySubscriptions.at(-1).callback({ propositions: [] }, async () => {});
    });
    assert.equal(await page.locator('#ContentCardContainerLoyalty article').count(), 0,
      'A ruleset update with no eligible cards removes previously qualified content');
    await page.evaluate(() => { window.__emptyJourneySubscription = true; });
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.match(await page.locator('#loyaltyStatus').textContent(), /No eligible.*card/i,
      'An empty subscription update completes the loading state even when direct responses are suppressed');
    assert.doesNotMatch(await page.locator('#loyaltyEvidence').textContent(), /No response for this context/,
      'An empty successful response is recorded rather than appearing as a request that never returned');
    await page.evaluate(() => { window.__emptyJourneySubscription = false; });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('aep-demo-tags-injected')));
    await page.waitForFunction(() => window.__journeySubscriptions.length === 2 &&
      !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await page.locator('#ContentCardContainerLoyalty h3').textContent(), 'Delivered by the journey',
      'SDK injection after profile lookup automatically reestablishes the card subscription');
    await page.locator('#ContentCardContainerLoyalty button').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Proposition interaction accepted'));
    assert.equal(await page.evaluate(() => window.__journeyTracking.at(-1).type), 'interact');
    await page.evaluate(() => {
      window.__timeoutAlloy = window.alloy;
      window.alloy = (command, options) => command === 'getIdentity'
        ? new Promise(resolve => { window.__releaseStalledIdentity = resolve; })
        : window.__timeoutAlloy(command, options);
      window.__normalSetTimeout = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) =>
        window.__normalSetTimeout(callback, delay === 120000 ? 50 : delay, ...args);
    });
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Request timed out after 120 seconds'));
    assert.equal(await page.locator('#queryProfileBtn').isDisabled(), false,
      'A queued SDK promise cannot hold the page busy after the request deadline');
    assert.match(await page.locator('#loyaltyStatus').textContent(), /may still finish.*No automatic retry/);
    const commandsBeforeRelease = await page.evaluate(() => window.__journeyCommands.length);
    await page.evaluate(() => {
      window.setTimeout = window.__normalSetTimeout;
      window.alloy = window.__timeoutAlloy;
    });
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    await page.evaluate(async () => {
      window.__releaseStalledIdentity({ identity: { ECID: '12345678901234567890123456789012345678' } });
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    assert.equal(await page.evaluate(() => window.__journeyCommands.length), commandsBeforeRelease,
      'A late SDK resolution from a timed-out request cannot continue into a new request context');
    assert.match(await page.locator('#loyaltyStatus').textContent(), /Task state refreshed/,
      'Late timed-out work cannot overwrite the latest result');
    await openConfiguration();
    await changeIdentifier('another-fixture@example.invalid');
    await page.evaluate(() => window.__deliverJourney());
    assert.equal(await page.locator('#ContentCardContainerLoyalty article').count(), 0,
      'A previous profile subscription cannot render into the changed context');
    await page.evaluate(() => {
      window.__loyaltySends = [];
      window.__loyaltyErrors = [];
      const originalConsoleError = console.error;
      console.error = (...args) => { window.__loyaltyErrors.push(args); originalConsoleError(...args); };
      window.__legacyJoinClicks = 0;
      document.addEventListener('click', event => {
        if (event.target.closest('[data-interact-id="joinChallenge"]')) window.__legacyJoinClicks++;
      });
      window.AepLabSandboxSync.getAuthHeaders = async () => ({ Authorization: 'Bearer offline-fixture' });
      window.__cardChallengeId = 'challenge-one-fixture';
      window.alloy = async (command, options) => {
        if (command === 'getIdentity') {
          if (window.__holdLoyaltyIdentity) await new Promise(resolve => { window.__releaseLoyaltyIdentity = resolve; });
          return { identity: { ECID: '12345678901234567890123456789012345678' } };
        }
        if (command === 'subscribeRulesetItems') { window.__loyaltySubscription = options; return; }
        if (command !== 'sendEvent') throw new Error('Unexpected SDK command: ' + command);
        if (options.personalization?.surfaces?.[0] === '#featured-offers') return { propositions: [] };
        if (options.personalization?.surfaces) {
          window.__deliverSignupCard = () => window.__loyaltySubscription.callback({ propositions: [{
            id: 'signup-proposition', scope: window.__loyaltySubscription.surfaces[0],
            scopeDetails: { decisionProvider: 'AJO', activity: { id: 'activity-fixture' } },
            items: [{ id: 'signup-ruleset-item', schema: 'https://ns.adobe.com/personalization/ruleset-item',
              data: { rules: [{ consequences: [{ id: 'signup-consequence', detail: {
                schema: 'https://ns.adobe.com/personalization/message/content-card',
                data: { contentType: 'application/json',
                  meta: window.__cardChallengeId ? { challengeId: window.__cardChallengeId } : {},
                  content: { title: { content: 'FSI - Sign up challenge (fixture)' },
                    body: { content: 'Waitrose, TK Maxx and PureGym' },
                    buttons: [{ id: 'join-button', interactId: 'joinChallenge', actionUrl: '', text: { content: 'Join Challenge' } }] } },
              } }] }] } }],
          }] }, async () => {});
          window.__deliverSignupCard(); return {};
        }
        if (options.xdm?.eventType === 'loyalty.challenge.challenge_signup' ||
            options.xdm?._experience?.decisioning?.propositionAction?.id === 'joinChallenge' || options.xdm?.eventType === 'commerce.purchases') {
          window.__loyaltySends.push(options);
          if (window.__rejectLoyaltySend ||
              window.__rejectLoyaltyTracking && options.xdm?.eventType === 'decisioning.propositionInteract') {
            throw new Error('Fixture: interrupted loyalty send');
          }
        }
        return {};
      };
      window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: 'purchase-fixture-stream' } });
    });
    const loyaltySends = () => page.evaluate(() => window.__loyaltySends.filter(event =>
      event.xdm.eventType !== 'decisioning.propositionInteract'));
    const signupInteractions = () => page.evaluate(() => window.__loyaltySends.filter(event =>
      event.xdm.eventType === 'decisioning.propositionInteract'));
    profileLoyaltyId = undefined;
    await openApiOptions();
    await page.locator('#loyaltyRegion').selectOption('');
    unavailableState = true;
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    const joinButton = page.locator('#ContentCardContainerLoyalty button');
    assert.equal(await joinButton.textContent(), 'Join Challenge', 'Render the actual event-only button with an empty target');
    assert.equal(await page.locator('#loyaltyPartnerOffers').isVisible(), false, 'Partner actions appear only after signup');
    await joinButton.click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('no Loyalty ID'));
    assert.equal((await loyaltySends()).length, 0, 'Signup requires the real loaded scalar Loyalty ID');
    profileLoyaltyId = 'loyalty-fixture-123';
    await openConfiguration();
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    await page.evaluate(() => { window.__cardChallengeId = ''; window.__deliverSignupCard(); });
    await joinButton.click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('meta.challengeId'));
    assert.equal((await loyaltySends()).length, 0, 'Never substitute a proposition, item or hardcoded challenge ID');
    assert.equal(signupRequests.length, 0, 'Missing identity or metadata never submits signup');
    await page.evaluate(() => { window.__cardChallengeId = 'challenge-one-fixture'; window.__deliverSignupCard(); });
    assert.equal(await joinButton.getAttribute('data-interact-id'), 'joinChallenge');
    assert.equal(await joinButton.getAttribute('data-challenge-id'), 'challenge-one-fixture');
    await page.evaluate(() => { window.AepLabSandboxSync.getAuthHeaders = async () => ({}); });
    signupMode = 'namespace';
    const anonymousSignup = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/ajo-loyalty');
    await joinButton.click();
    assert.equal((await (await anonymousSignup).allHeaders()).authorization, undefined, 'Demo signup is triggered without Portal sign-in or a browser Adobe token');
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('configured namespace mismatch'));
    assert.equal(signupRequests.length, 1, 'No frontend sign-in check prevents the server-verified demo request');
    await page.evaluate(() => { window.AepLabSandboxSync.getAuthHeaders = async () => ({ Authorization: 'Bearer offline-fixture' }); });
    assert.equal(await joinButton.isDisabled(), false, 'A local proxy 409 is not Adobe already-joined enrollment');
    signupMode = 'rejected';
    await joinButton.click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Unable to join challenge'));
    assert.equal(await joinButton.isDisabled(), false, 'A definite Adobe rejection restores the button');
    assert.equal(await page.evaluate(() => window.__loyaltyErrors.some(([message, details]) =>
      message === 'Loyalty signup failed' && details.status === 422 &&
      details.body.platform_response.title === 'Challenge personalization not found for profile')), true,
    'Definite signup failures log the returned status and error body');
    assert.equal(await page.locator('#loyaltyPartnerOffers').isVisible(), false);
    signupMode = 'unknown';
    await joinButton.click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('outcome unknown'));
    assert.equal(await joinButton.isDisabled(), true);
    const uncertainCount = signupRequests.length;
    await joinButton.dispatchEvent('click');
    assert.equal(signupRequests.length, uncertainCount, 'An uncertain submission cannot be retried by another click');
    assert.equal((await signupInteractions()).length, 0);
    unavailableState = false; namespace = 'loyaltyId'; stateChallengeId = 'challenge-one-fixture'; quantity = 0;
    const anonymousState = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === '/api/ajo-loyalty' && url.searchParams.get('action') === 'profile_state';
    });
    await page.locator('#loyaltyRefresh').click();
    assert.equal((await (await anonymousState).allHeaders()).authorization, undefined, 'Test-member task reads do not need Portal sign-in');
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await joinButton.isDisabled(), false, 'Explicit Adobe optedIn:false permits a deliberate retry after reconciliation');
    signupMode = 'success';
    signupGate = new Promise(resolve => { releaseSignup = resolve; });
    const signupStarted = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/ajo-loyalty');
    await joinButton.click();
    await signupStarted;
    await joinButton.dispatchEvent('click');
    const countDuringSignup = signupRequests.length;
    unavailableState = true;
    releaseSignup(); signupGate = null;
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Challenge Joined.'));
    assert.equal(signupRequests.length, countDuringSignup, 'Rapid double clicks submit only one signup');
    assert.deepEqual(signupRequests.at(-1), {
      sandbox: 'kirkham', action: 'signup', profile_id: 'loyalty-fixture-123', challenge_id: 'challenge-one-fixture',
      region: 'va7', test: false, confirmed: true,
    }, 'Signup uses the current scalar member ID, delivered challenge ID, documented default region and test:false');
    assert.equal((await loyaltySends()).length, 0, 'No manually constructed Web SDK signup event is sent');
    assert.equal(await page.evaluate(() => window.__legacyJoinClicks), 0,
      'The API-owned action does not bubble into an old document-delegated Tags signup listener');
    assert.equal(await joinButton.textContent(), 'Challenge Joined');
    assert.equal(await joinButton.isDisabled(), true, 'Enrollment remains confirmed even when the subsequent state refresh fails');
    const interaction = (await signupInteractions())[0];
    assert.equal((await signupInteractions()).length, 1, 'Track one card interaction separately, not a second signup');
    assert.deepEqual(interaction.xdm._experience.decisioning.propositionAction, { id: 'joinChallenge', label: 'Join Challenge' });
    assert.equal(interaction.xdm._experience.decisioning.propositionEventType.interact, 1);
    assert.equal(interaction.xdm._experience.decisioning.propositions[0].id, 'signup-proposition');
    assert.equal(interaction.xdm._experience.decisioning.propositions[0].items[0].id, 'signup-ruleset-item');
    const signupEvidence = JSON.parse(await page.locator('#loyaltyEvidence').textContent());
    assert.equal(signupEvidence.signup.platform_status, 200);
    assert.equal(signupEvidence.enrollmentVerified, true);
    assert.equal(signupEvidence.journeyEntryVerified, false, 'API enrollment does not prove event-triggered journey entry');
    assert.equal(await page.locator('#loyaltyTasks .loyalty-task').count(), 2,
      'Signup preserves the previously reported tasks when its subsequent state refresh fails');
    assert.equal(await page.locator('#loyaltyTasks .loyalty-progress-ring b').textContent(), '0 / 2',
      'Enrollment does not change Adobe-reported task completion');
    assert.equal(await page.locator('#loyaltyPartnerOffers [data-loyalty-purchase]').count(), 3);
    assert.match(await page.locator('#loyaltyPartnerOffers').textContent(), /Participation confirmed by Adobe/);
    assert.equal(await page.locator('.loyalty-phone-tick').count(), 0, 'Signup does not fabricate completed tasks');
    await joinButton.dispatchEvent('click');
    assert.equal(signupRequests.length, countDuringSignup, 'The same delivered challenge is not signed up twice');
    assert.equal((await signupInteractions()).length, 1, 'Duplicate clicks do not resend tracking');
    await page.evaluate(() => { window.__rejectLoyaltySend = true; });
    await page.locator('[data-loyalty-purchase="waitrose"]').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('may already have been ingested'));
    assert.equal(await page.locator('#loyaltyOfferSheet').isVisible(), false, 'An unconfirmed send cannot show a success sheet');
    assert.equal((await loyaltySends()).length, 1, 'Uncertain purchase sends are not retried automatically');
    await page.evaluate(() => { window.__rejectLoyaltySend = false; });
    const purchaseIds = new Set();
    for (const [key, sku, name, amount] of [
      ['waitrose', 'WAITROSE-OFFER-001', 'Waitrose Offer', 10],
      ['tkmaxx', 'TKMAXX-OFFER-001', 'TK Maxx Offer', 20],
      ['puregym', 'PUREGYM-SIGNUP-001', 'PureGym Signup', 25],
    ]) {
      const beforePurchase = (await loyaltySends()).length;
      await page.locator('[data-loyalty-purchase="' + key + '"]').click();
      await page.waitForFunction(() => !document.getElementById('loyaltyOfferSheet').hidden &&
        !document.getElementById('queryProfileBtn').disabled);
      const sends = await loyaltySends(), purchase = sends.at(-1);
      assert.equal(sends.length, beforePurchase + 1, 'One offer view sends one purchase event');
      const purchaseID = purchase.xdm.commerce.order.purchaseID;
      assert.match(purchaseID, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal(purchaseIds.has(purchaseID), false); purchaseIds.add(purchaseID);
      assert.deepEqual(purchase, {
        edgeConfigOverrides: { datastreamId: 'purchase-fixture-stream' }, renderDecisions: false,
        personalization: { defaultPersonalizationEnabled: false },
        xdm: { eventType: 'commerce.purchases',
          identityMap: {
            Email: [{ id: 'another-fixture@example.invalid', authenticatedState: 'authenticated', primary: true }],
            ECID: [{ id: '12345678901234567890123456789012345678', authenticatedState: 'ambiguous', primary: false }],
            loyaltyId: [{ id: 'loyalty-fixture-123', primary: false }],
          },
          commerce: { purchases: { value: 1 }, order: { purchaseID, priceTotal: amount, currencyCode: 'GBP' } },
          productListItems: [{ SKU: sku, name, quantity: 1, priceTotal: amount, currencyCode: 'GBP' }],
          _demoemea: { identification: { core: { ecid: '12345678901234567890123456789012345678',
            email: 'another-fixture@example.invalid', loyaltyId: 'loyalty-fixture-123' } } },
        },
      }, 'Preserve the supplied ' + key + ' purchase contract exactly');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#loyaltyOfferSheet').isVisible(), false);
      assert.equal(await page.locator('[data-loyalty-purchase="' + key + '"]').evaluate(node => document.activeElement === node), true);
    }
    assert.equal(await page.locator('.loyalty-phone-tick').count(), 0, 'Purchase acceptance never marks Adobe tasks complete locally');
    await page.evaluate(() => { window.__cardChallengeId = 'challenge-two-fixture'; window.__deliverSignupCard(); window.__rejectLoyaltyTracking = true; });
    assert.equal(await page.locator('#loyaltyPartnerOffers').isVisible(), false, 'A new delivered challenge cannot reuse the previous signup');
    await joinButton.click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Do not join again to retry tracking'));
    assert.equal(signupRequests.at(-1).challenge_id, 'challenge-two-fixture',
      'A metadata-only card change updates the captured challenge ID');
    assert.equal(await page.locator('#loyaltyPartnerOffers').getAttribute('data-challenge-id'), 'challenge-two-fixture');
    assert.equal(await page.locator('#loyaltyPartnerOffers').isVisible(), true, 'An interaction failure does not undo API enrollment');
    assert.equal(JSON.parse(await page.locator('#loyaltyEvidence').textContent()).enrollmentVerified, true);
    const signupsAfterTrackingFailure = signupRequests.length;
    await joinButton.dispatchEvent('click');
    assert.equal(signupRequests.length, signupsAfterTrackingFailure, 'Never repeat accepted signup to retry tracking');
    assert.equal(await joinButton.isDisabled(), true);
    signupMode = 'duplicate';
    unavailableState = false; stateChallengeId = 'challenge-three-fixture'; stateHasName = false;
    await page.evaluate(() => { window.__cardChallengeId = 'challenge-three-fixture'; window.__deliverSignupCard(); });
    await joinButton.click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Challenge Already Joined.'));
    assert.equal(await joinButton.textContent(), 'Challenge Already Joined');
    assert.equal(await joinButton.isDisabled(), true);
    assert.equal(signupRequests.at(-1).challenge_id, 'challenge-three-fixture');
    assert.equal(reads.filter(read => read.action === 'profile_state').at(-1).test, 'false');
    assert.equal(reads.filter(read => read.action === 'profile_state').at(-1).profile_id, 'loyalty-fixture-123');
    assert.equal(await page.locator('#loyaltyTasks .loyalty-progress-summary h3').textContent(), metadataNames[0],
      'The automatic post-signup refresh also resolves the challenge name');
    stateHasName = true;
    assert.equal(await page.locator('.loyalty-phone-tick').count(), 0, 'Duplicate enrollment and task refresh do not complete tasks');
    signupMode = 'network';
    await page.evaluate(() => { window.__cardChallengeId = 'challenge-network-fixture'; window.__deliverSignupCard(); });
    await joinButton.click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('outcome unknown'));
    const signupsAfterNetworkFailure = signupRequests.length;
    await page.evaluate(() => window.__deliverSignupCard());
    assert.equal(await joinButton.isDisabled(), true, 'An unknown signup stays blocked across card callbacks');
    stateChallengeId = 'challenge-network-fixture'; optedIn = true;
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await joinButton.textContent(), 'Challenge Already Joined', 'Adobe state resolves a lost signup response');
    assert.equal(signupRequests.length, signupsAfterNetworkFailure, 'Reconciliation reads state without resubmitting signup');
    await page.evaluate(() => { window.__cardChallengeId = 'challenge-two-fixture'; window.__deliverSignupCard(); });
    await page.evaluate(() => { window.__rejectLoyaltyTracking = false; });
    unavailableState = false;
    stateChallengeId = 'challenge-two-fixture'; optedIn = true; namespace = 'loyaltyId';
    await openApiOptions();
    await page.locator('#loyaltyRegion').selectOption('nld2');
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    assert.equal(await page.locator('#loyaltyPartnerOffers').isVisible(), false, 'A lookup clears local signup receipts');
    await openApiOptions();
    await page.locator('#loyaltyMember').fill('other-member-fixture');
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await page.locator('#loyaltyPartnerOffers').isVisible(), false,
      'An explicit state read for another Loyalty member cannot authorize purchases for the loaded profile');
    await openApiOptions();
    await page.locator('#loyaltyMember').fill('');
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    await page.locator('#loyaltyRefresh').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(reads.filter(read => read.action === 'profile_state').at(-1).profile_id, 'loyalty-fixture-123');
    assert.match(await page.locator('#loyaltyPartnerOffers').textContent(), /Participation confirmed by Adobe/,
      'Matching Adobe optedIn state restores the fixed offers without another signup event');
    if (process.env.AEP_LOYALTY_SCREENSHOT) {
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => {
          document.documentElement.setAttribute('data-aep-theme', theme);
          document.querySelector('.loyalty-phone-scroll').scrollTop = 0;
        }, theme);
        await page.locator('.loyalty-phone').screenshot({
          path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-offers-' + theme + '.png'),
        });
      }
    }
    await page.evaluate(() => { window.__holdLoyaltyIdentity = true; window.__releaseLoyaltyIdentity = null; });
    const sendsBeforeStalePurchase = (await loyaltySends()).length;
    await page.locator('[data-loyalty-purchase="waitrose"]').click();
    await page.waitForFunction(() => typeof window.__releaseLoyaltyIdentity === 'function');
    await openConfiguration();
    await changeIdentifier('changed-purchase-fixture@example.invalid');
    await page.evaluate(() => { window.__holdLoyaltyIdentity = false; window.__releaseLoyaltyIdentity(); });
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal((await loyaltySends()).length, sendsBeforeStalePurchase, 'A changed profile during getIdentity blocks purchase dispatch');
    assert.equal(await page.locator('#loyaltyPartnerOffers').isVisible(), false, 'Partner actions never leak into another identity');
    assert.equal(await page.locator('#loyaltyOfferSheet').isVisible(), false);
    consentGate = new Promise(resolve => { releaseConsent = resolve; });
    const oldDrawerRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/profile/consent');
    await page.evaluate(() => {
      window.__oldDrawerLookup = window.DemoProfileDrawer.loadProfileDataForDrawer('another-fixture@example.invalid',
        { sendApplicationLogin: false });
    });
    await oldDrawerRequest;
    const newDrawerRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === '/api/profile/consent' && url.searchParams.get('sandbox') === 'demo-two';
    });
    await page.evaluate(() => {
      window.AepGlobalSandbox.setSelected('demo-two');
      window.__newDrawerLookup = window.DemoProfileDrawer.loadProfileDataForDrawer('another-fixture@example.invalid',
        { sendApplicationLogin: false });
    });
    await newDrawerRequest;
    releaseConsent(); consentGate = null;
    assert.deepEqual(await page.evaluate(() => Promise.all([window.__oldDrawerLookup, window.__newDrawerLookup])),
      [false, true], 'Same identifiers in different sandboxes never share an in-flight lookup; old responses remain discarded');
    rejectConsent = true;
    const beforeJoinedFailure = consentRequests;
    const joinedFailure = await page.evaluate(async () => {
      const messages = [];
      const first = window.DemoProfileDrawer.loadProfileDataForDrawer('error-fixture@example.invalid',
        { sendApplicationLogin: false });
      const second = window.DemoProfileDrawer.loadProfileDataForDrawer('error-fixture@example.invalid',
        { sendApplicationLogin: false, onUserMessage: (text, type) => { if (type === 'error') messages.push(text); } });
      return { results: await Promise.all([first, second]), messages };
    });
    assert.deepEqual(joinedFailure, { results: [false, false], messages: ['Fixture: profile consent service unavailable'] },
      'A visible caller joining a silent lookup still receives the actual failure');
    assert.equal(consentRequests, beforeJoinedFailure + 1, 'Failed joined requests are not retried automatically');
    rejectConsent = false;
    const earlyPage = await context.newPage();
    earlyPage.on('pageerror', error => errors.push(error.message));
    await earlyPage.addInitScript(() => {
      const add = window.addEventListener;
      window.addEventListener = function(type, listener, options) {
        add.call(this, type, listener, options);
        if (type !== 'ajo:featured-offers') return;
        window.addEventListener = add;
        window.dispatchEvent(new CustomEvent(type, { detail: { offers: [{
          id: 'early-ajo-offer', merchant: 'Early merchant', title: 'Early ranked offer',
          propositionId: 'early-proposition', propositionScope: 'hero-banner', propositionItemId: 'early-item',
        }] } }));
      };
    });
    await earlyPage.goto(origin + '/profile-viewer/lloyds-loyalty-demo.html');
    await earlyPage.waitForFunction(() => document.querySelector('.loyalty-featured-body h4')?.textContent === 'Early ranked offer');
    assert.equal(await earlyPage.locator('#loyaltyOfferCarousel').getAttribute('aria-busy'), 'false',
      'An event delivered immediately after listener registration survives asynchronous app initialization');
    await earlyPage.waitForTimeout(5500);
    assert.deepEqual(await earlyPage.locator('.loyalty-featured-body h4').allTextContents(), ['Early ranked offer'],
      'The five-second fallback cannot overwrite a valid early AJO delivery');
    await earlyPage.close();
    const requestPage = await context.newPage();
    const featuredLookup = async identifier => {
      if (!await requestPage.locator('#customerEmail').isVisible()) await requestPage.locator('#aepLabEnvMinimizeBtn').click();
      if (identifier) await requestPage.locator('#customerEmail').fill(identifier);
      await requestPage.locator('#queryProfileBtn').click();
    };
    requestPage.on('pageerror', error => errors.push(error.message));
    const featuredLogs = [];
    requestPage.on('console', entry => {
      if (entry.text().startsWith('[Rewards] featured-offers')) featuredLogs.push(entry.text());
    });
    await requestPage.goto(origin + '/profile-viewer/lloyds-loyalty-demo.html');
    await requestPage.waitForFunction(() => typeof window.requestFeaturedOffers === 'function');
    await requestPage.evaluate(() => {
      window.AepGlobalSandbox.setSelected('kirkham');
      window.__featuredCalls = [];
      window.__holdFeaturedResponse = true;
      window.__featuredStream = 'featured-fixture-stream';
      window.__featuredResult = { propositions: [{
        id: 'featured-response-fixture', scope: '#featured-offers', items: [{ id: 'returned-item-not-rendered-directly' }],
      }] };
      window.alloy = async (command, options) => {
        if (command === 'getIdentity') {
          if (window.__pauseFeaturedIdentity) await new Promise(resolve => { window.__releaseFeaturedIdentity = resolve; });
          return { identity: { ECID: '12345678901234567890123456789012345678' } };
        }
        if (command === 'sendEvent' && options.personalization?.surfaces?.[0] === '#featured-offers') {
          window.__featuredCalls.push(options);
          if (window.__holdFeaturedResponse) await new Promise(resolve => { window.__releaseFeaturedResponse = resolve; });
          if (window.__rejectFeaturedRequest) throw new Error('Fixture: interrupted featured-offers response');
          return window.__featuredResult;
        }
        return command === 'sendEvent' ? { propositions: [] } : undefined;
      };
      window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: window.__featuredStream } });
    });
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 0,
      'No Featured Offers decision request is sent before profile setup');
    await requestPage.evaluate(() => window.requestFeaturedOffers());
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 0, 'Manual requests also require a loaded profile');
    consentGate = new Promise(resolve => { releaseConsent = resolve; });
    const featuredConsent = requestPage.waitForRequest(request => new URL(request.url()).pathname === '/api/profile/consent');
    await featuredLookup('featured-first@example.invalid');
    await featuredConsent;
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 0,
      'Profile table data alone does not trigger decisioning while drawer/profile setup is pending');
    releaseConsent(); consentGate = null;
    await requestPage.waitForFunction(() => typeof window.__releaseFeaturedResponse === 'function');
    await requestPage.evaluate(() => {
      window.dispatchEvent(new CustomEvent('tui-profile-changed'));
      window.dispatchEvent(new CustomEvent('tui-profile-changed'));
      void window.requestFeaturedOffers();
    });
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 1,
      'Overlapping profile-ready and console requests coalesce while the SDK response is pending');
    await requestPage.evaluate(() => { window.__holdFeaturedResponse = false; window.__releaseFeaturedResponse(); });
    await requestPage.waitForFunction(() => window.__featuredCalls.length === 1 && !document.getElementById('queryProfileBtn').disabled);
    const featuredPayload = await requestPage.evaluate(() => window.__featuredCalls[0]);
    assert.equal(featuredPayload.renderDecisions, false);
    assert.deepEqual(featuredPayload.personalization, { surfaces: ['#featured-offers'] });
    assert.deepEqual(featuredPayload.edgeConfigOverrides, { datastreamId: 'featured-fixture-stream' });
    assert.equal(featuredPayload.xdm.identityMap.Email[0].id, 'featured-first@example.invalid');
    assert.equal(featuredPayload.xdm.identityMap.Email[0].primary, true);
    assert.equal(featuredPayload.xdm.identityMap.ECID[0].id, '12345678901234567890123456789012345678');
    assert.equal(featuredPayload.xdm._demoemea.identification.core.email, 'featured-first@example.invalid');
    assert.equal(await requestPage.locator('[data-art="returned-item-not-rendered-directly"]').count(), 0,
      'The request does not render returned propositions or dispatch the offers event itself');
    assert.ok(featuredLogs.some(line => line.startsWith('[Rewards] featured-offers Web SDK response')));
    assert.ok(featuredLogs.some(line => line.startsWith('[Rewards] featured-offers propositions')));
    await featuredLookup();
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 1,
      'Repeated lookup of the same selected profile does not resend the decision request');
    assert.deepEqual(await requestPage.evaluate(() => window.requestFeaturedOffers()),
      await requestPage.evaluate(() => window.__featuredResult), 'The manual console entry point returns the existing result without duplicating requests');
    await requestPage.evaluate(() => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers: [{
      id: 'rule-mapped-offer', merchant: 'Waitrose', title: 'Rule-mapped cashback',
    }] } })));
    assert.deepEqual(await requestPage.locator('.loyalty-featured-body h4').allTextContents(), ['Rule-mapped cashback'],
      'Only the existing Data Collection event bridge populates the carousel');
    await featuredLookup('featured-second@example.invalid');
    await requestPage.waitForFunction(() => window.__featuredCalls.length === 2 && !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.at(-1).xdm.identityMap.Email[0].id), 'featured-second@example.invalid');
    await requestPage.evaluate(() => { window.__heldFeaturedAlloy = window.alloy; window.alloy = undefined; });
    await featuredLookup('featured-delayed-sdk@example.invalid');
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 2);
    await requestPage.evaluate(() => {
      window.alloy = window.__heldFeaturedAlloy;
      window.dispatchEvent(new CustomEvent('aep-demo-tags-injected'));
    });
    await requestPage.waitForFunction(() => window.__featuredCalls.length === 3 && !document.getElementById('queryProfileBtn').disabled);
    await requestPage.evaluate(() => window.dispatchEvent(new CustomEvent('aep-demo-tags-injected')));
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 3,
      'Repeated SDK-ready notifications reuse the same profile/SDK/datastream request');
    await requestPage.evaluate(() => {
      window.__featuredStream = 'changed-featured-fixture-stream';
      window.dispatchEvent(new CustomEvent('aep-demo-tags-injected'));
    });
    await requestPage.waitForFunction(() => window.__featuredCalls.length === 4 && !document.getElementById('queryProfileBtn').disabled);
    await requestPage.evaluate(() => { window.__pauseFeaturedIdentity = true; });
    await featuredLookup('featured-stale@example.invalid');
    await requestPage.waitForFunction(() => typeof window.__releaseFeaturedIdentity === 'function');
    await requestPage.locator('#customerEmail').fill('featured-current@example.invalid');
    await requestPage.evaluate(async () => {
      window.__pauseFeaturedIdentity = false; window.__releaseFeaturedIdentity();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 4,
      'An identity change during SDK setup blocks stale decision dispatch');
    testProfile = false;
    await featuredLookup();
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 4, 'Only selected test profiles request decisions');
    testProfile = true;
    await requestPage.evaluate(() => { window.__rejectFeaturedRequest = true; });
    await featuredLookup();
    await requestPage.waitForFunction(() => window.__featuredCalls.length === 5 && !document.getElementById('queryProfileBtn').disabled);
    await featuredLookup();
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 5,
      'Repeated profile loads cannot automatically retry an uncertain submitted decision request');
    if (!await requestPage.locator('#customerEmail').isVisible()) await requestPage.locator('#aepLabEnvMinimizeBtn').click();
    await requestPage.locator('#lloydsLoyaltyNs').selectOption('ecid');
    await featuredLookup('99999999999999999999999999999999999999');
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 5,
      'A selected ECID different from the active SDK visitor cannot request Featured Offers');
    await requestPage.close();
    assert.deepEqual(errors, []);
    assert.ok(writes.every(path => path === '/api/lab/env-bar-preferences'),
      'Only shared personal display preferences may be saved; no profile, event-generator or Adobe mutations');
    console.log('Lloyds Loyalty browser checks passed (offline synthetic fixtures only).');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
