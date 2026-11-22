const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const { createPreviewServer } = await import('./preview-cp-decisioning.mjs');
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--touch-events=enabled'] });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, reducedMotion: 'reduce' });
    const errors = [], writes = [], reads = [], signupRequests = [];
    let quantity = 0, rejectState = false, missingState = false, unavailableState = false, namespace = 'Email', releaseState, stateStarted;
    let holdState = false, events = [], testProfile = true, eventRefreshes = 0, profileLoyaltyId;
    let consentGate, releaseConsent, consentRequests = 0, rejectConsent = false;
    let stateChallengeId = 'challenge-fixture', optedIn = true;
    let challengeListOverride, stateHasName = true, metadataMode = 'success', metadataGate;
    let signupMode = 'success', signupGate, releaseSignup;
    let confirmAvailableSignup = false, spendDefinition;
    await context.addInitScript(() => { localStorage.setItem('aepDemoNavOwnerHandle', 'kirkham'); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) {
        if (url.hostname === 'example.invalid' && /\.(png|jpg)$/.test(url.pathname)) {
          return route.fulfill({ contentType: 'image/svg+xml', body:
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect width="600" height="300" fill="#d8e9dd"/><circle cx="410" cy="70" r="170" fill="#9ec7ac"/><circle cx="200" cy="270" r="130" fill="#729983"/><text x="28" y="65" fill="#173729" font-size="24" font-family="sans-serif">OFFLINE OFFER FIXTURE</text></svg>' });
        }
        return route.fulfill({ contentType: 'text/javascript', body: '' });
      }
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
          if (confirmAvailableSignup) challengeListOverride = challengeListOverride.map(challenge =>
            challenge.challenge_id === body.challenge_id ? { ...challenge, optedIn: true } : challenge);
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
            ...(id === 'spend-demo-fixture' && spendDefinition ? { tasks: [spendDefinition] } : {}),
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
    const waitForPrimary = async title => {
      try {
        await page.waitForFunction(title =>
          document.querySelector('#ContentCardContainerLoyalty article[data-primary="true"] h3')?.textContent === title, title);
      } catch (error) {
        console.error('Challenge navigation failed', await page.evaluate(expected => {
          const viewport = document.getElementById('loyaltyChallengeCarousel'), bounds = viewport?.getBoundingClientRect();
          return { expected, primary: viewport?.querySelector('[data-primary="true"] h3')?.textContent,
            left: viewport?.scrollLeft, width: viewport?.clientWidth, scrollWidth: viewport?.scrollWidth,
            hitTarget: bounds && document.elementFromPoint(bounds.x + bounds.width * .75, bounds.y + 20)?.outerHTML.slice(0, 300) };
        }, title));
        if (process.env.AEP_LOYALTY_SCREENSHOT) await page.screenshot({
          path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-navigation-failure.png'),
        });
        throw error;
      }
      await waitForProfile();
    };
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
    assert.equal(await page.locator('.ContentCardContainer, .ContentCardContainerLoyalty').count(), 0,
      'Neither selector used by the supplied Tags renderer can target this website-owned page');
    assert.equal(await page.locator('#loyaltyPromotionTitle').textContent(), 'Your challenges');
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
    assert.equal(await page.locator('[data-save-preview-offer="waitrose"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#loyaltySavedOffers .loyalty-merchant-logo').count(), 0);
    assert.match(await page.locator('#loyaltyAppToast').textContent(), /test profile/);
    assert.equal(signupRequests.length, 0, 'Preview offers and navigation never submit Loyalty signup');
    assert.equal(reads.length, readsBeforeNavigation, 'Navigating the app does not fetch or alter Loyalty state');
    await homeTab.click();
    await rewardsTab.click();
    assert.equal(await page.locator('[data-save-preview-offer="waitrose"]').getAttribute('aria-pressed'), 'false', 'No profile means no purchase receipt');
    await page.locator('[data-save-preview-offer="waitrose"]').click();
    assert.equal(await page.locator('#loyaltySavedOffers .loyalty-merchant-logo').count(), 0);
    const ajoOffers = Array.from({ length: 6 }, (_, index) => ({
      id: 'ajo-offer-' + index, merchant: index ? 'Merchant ' + index : 'Waitrose', title: index ? 'Cashback ' + index : '15% cashback',
      priority: index * 100, channel: 'Online', expiry: '01 Dec 26', cta: 'Activate offer', sku: 'DYNAMIC-SKU-' + index,
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
    assert.equal(await page.locator('[data-save-preview-offer="ajo-offer-0"]').getAttribute('title'), 'Send demo purchase for Waitrose');
    assert.match(await page.locator('.loyalty-featured-art').first().getAttribute('style'), /https:\/\/example.invalid\/offer.png/);
    assert.equal(await page.locator('.loyalty-featured-art').nth(1).getAttribute('style'), null,
      'Unsafe incoming images never reach CSS URLs');
    assert.equal(await page.locator('.loyalty-featured-offer > .loyalty-merchant-logo').nth(1).getAttribute('style'), null,
      'Unsafe incoming logos never reach CSS URLs');
    assert.deepEqual(await page.locator('#loyaltyReturnedOffers .loyalty-returned-offer').evaluateAll(cards =>
      cards.map(card => card.dataset.offerId)), ajoOffers.slice(0, 5).map(offer => offer.id),
    'The inspector below challenge progress shows only the ranked AJO items');
    assert.equal(await page.locator('#loyaltyReturnedOffers img').count(), 1, 'Offer inspector uses the same safe media policy');
    assert.deepEqual(JSON.parse(await page.locator('#loyaltyReturnedOffers pre').first().textContent()), ajoOffers[0],
      'Offer response details preserve item and proposition attribution without inventing priorities');
    const originalAjoCard = await page.locator('.loyalty-featured-offer').first().elementHandle();
    await page.locator('#loyaltyNextOffer').click();
    await page.waitForFunction(() => document.querySelectorAll('#loyaltyOfferDots button')[1].getAttribute('aria-current') === 'true');
    await page.evaluate(offers => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers } })), ajoOffers);
    assert.equal(await originalAjoCard.evaluate(card => card.isConnected), true, 'Duplicate ID order does not recreate cards');
    assert.equal(await page.locator('#loyaltyOfferDots button').nth(1).getAttribute('aria-current'), 'true');
    await page.locator('[data-save-preview-offer="ajo-offer-1"]').click();
    assert.equal(await page.locator('#loyaltyDecisionOfferSheet').isVisible(), false, '+ does not open detail dialog');
    await page.locator('.loyalty-featured-offer').nth(1).press('Enter');
    assert.equal(await page.locator('#loyaltyDecisionOfferTitle').textContent(), ajoOffers[1].detailTitle);
    assert.match(await page.locator('#loyaltyDecisionOfferSheet').textContent(), /Original subtitle.*Original description/s);
    await page.locator('#loyaltyDecisionOfferSheet').press('Escape');
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
    assert.deepEqual(JSON.parse(await page.locator('#loyaltyReturnedOffers pre').first().textContent()), envelopeOffers[0],
      'Item-level proposition metadata takes precedence over envelope metadata');
    assert.deepEqual(JSON.parse(await page.locator('#loyaltyReturnedOffers pre').nth(1).textContent()), { ...envelopeOffers[1], ...envelope },
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
      state: 'active', optedIn: true, tasksToComplete: 1,
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
    assert.match(await page.locator('#loyaltyTasks').textContent(), /Opted in: true/);
    assert.match(await page.locator('#loyaltyTasks').textContent(), /0 of 3/);
    assert.equal(await page.locator('.loyalty-task progress').count(), 1, 'Missing accumulator is never fabricated as zero');
    assert.equal(await page.locator('.loyalty-task[data-complete="true"]').count(), 0, 'Previous-cycle completions do not complete current tasks');
    assert.equal(await page.locator('.loyalty-progress-count').textContent(), '0 / 2');
    assert.equal(await page.locator('.loyalty-progress-ring').textContent(), '');
    assert.equal(await page.locator('.loyalty-progress-count').evaluate(count =>
      count.getBoundingClientRect().left > document.querySelector('.loyalty-progress-ring').getBoundingClientRect().right), true,
    'Count and task caption sit beside the ring, not inside it');
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
    assert.equal(await page.locator('.loyalty-progress-count').textContent(), '3 / 3',
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
    assert.equal(await page.locator('.loyalty-progress-count').textContent(), '1 / 3',
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
        if (payload.xdm?.eventType === 'rewards.interest') {
          if (window.__rejectAbandon) throw new Error('Fixture: Edge response interrupted');
          return {};
        }
        if (payload.xdm?.eventType?.startsWith('decisioning.proposition')) return {};
        if (payload.personalization?.surfaces?.[0] === 'web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers') return { propositions: [] };
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
    const abandonCalls = () => page.evaluate(() => window.__sdkCalls.filter(call => call.payload?.xdm?.eventType === 'rewards.interest'));
    assert.equal((await abandonCalls()).length, 0, 'Lookup, task reads and SDK setup never send a journey event');
    const refreshesBefore = eventRefreshes;
    await page.locator('#loyaltyAbandon').click();
    assert.equal(await page.locator('#loyaltyAbandon').textContent(), 'Show interest in Rewards');
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('audience membership is not yet verified'));
    const abandoned = await abandonCalls();
    assert.equal(abandoned.length, 1, 'One explicit click sends one event');
    assert.equal(abandoned[0].payload.xdm.identityMap.loyaltyId, undefined, 'Missing Loyalty identity is not invented');
    assert.equal(abandoned[0].payload.xdm._ownTenant.identification.core.loyaltyId, undefined);
    assert.deepEqual(abandoned[0], { command: 'sendEvent', payload: {
      edgeConfigOverrides: { datastreamId: 'reviewed-fixture-stream' }, renderDecisions: false,
      personalization: { defaultPersonalizationEnabled: false },
      xdm: {
        eventType: 'rewards.interest', timestamp: abandoned[0].payload.xdm.timestamp,
        identityMap: {
          Email: [{ id: 'fixture@example.invalid', authenticatedState: 'authenticated', primary: true }],
          ECID: [{ id: '12345678901234567890123456789012345678', authenticatedState: 'ambiguous', primary: false }],
        },
        _ownTenant: { identification: { core: { ecid: '12345678901234567890123456789012345678', email: 'fixture@example.invalid' } } },
        web: { webPageDetails: { URL: origin + '/profile-viewer/lloyds-loyalty-demo.html', name: 'Lloyds Loyalty', viewName: 'Lloyds Loyalty' } },
      },
    } }, 'The TUI / Center Parcs event contract is preserved with the selected profile, tenant and datastream');
    assert.ok(eventRefreshes > refreshesBefore, 'Accepted events refresh the shared profile timeline');
    assert.ok(Math.abs(Date.now() - Date.parse(abandoned[0].payload.xdm.timestamp)) < 30000, 'Interest event uses the current ISO timestamp');
    assert.equal(new Date(abandoned[0].payload.xdm.timestamp).toISOString(), abandoned[0].payload.xdm.timestamp);
    assert.equal(abandoned[0].payload.xdm._experience, undefined, 'Audience interest does not inject journey orchestration metadata');
    assert.ok(!JSON.stringify(abandoned[0].payload).includes('abandoned.search'), 'The old event type is absent from the entire new request');
    assert.match(await page.locator('#loyaltyStatus').textContent(), /audience membership is not yet verified/);
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
    const directDiagnostic = await page.evaluate(() => window.LloydsLoyaltyContentCardDebug.getLatest());
    assert.equal(directDiagnostic.responseSource, 'direct-response');
    assert.equal(directDiagnostic.evaluated, false, 'Direct responses are never described as evaluated subscription results');
    assert.equal(directDiagnostic.totalPropositions, 3);
    assert.equal(directDiagnostic.surfacePropositions, 1);
    assert.equal(directDiagnostic.totalContentCardCandidates, 1);
    assert.equal(directDiagnostic.selectedCandidate.propositionId, 'card');
    assert.equal(directDiagnostic.propositions[0].id, 'hero', 'Raw evidence retains the complete array, including nonmatching scopes');
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
    assert.equal(await page.locator('.loyalty-card-controls').count(), 0, 'A single Content Card needs no carousel controls');
    assert.equal(await page.locator('.loyalty-card-viewport').evaluate(viewport =>
      viewport.scrollWidth <= viewport.clientWidth + 1), true, 'Single-card presentation has no empty trailing carousel space');
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
    assert.equal(await page.locator('.loyalty-progress-count').textContent(), '1 / 2');
    assert.equal(await page.locator('.loyalty-phone-count').textContent(), '1 / 2 tasks complete');
    assert.equal(await page.locator('.loyalty-phone-task[data-complete="true"]').count(), 1);
    await page.evaluate(offers => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers } })), ajoOffers);
    const originalLiveMount = await page.locator('#ContentCardContainerLoyalty').elementHandle();
    const originalCarousel = await page.locator('#loyaltyOfferCarousel').elementHandle();
    const sdkCallsBeforeSwitch = await page.evaluate(() => window.__sdkCalls.length);
    await page.locator('[data-loyalty-preview="web"]').click();
    assert.ok(await page.locator('#loyaltyWebPreview').isVisible());
    assert.equal(await page.locator('#loyaltyMobilePreview').isVisible(), false);
    assert.equal(await page.locator('#loyaltyWebChallenge #ContentCardContainerLoyalty').count(), 1);
    assert.equal(await page.locator('#loyaltyWebOffers .loyalty-featured-offer').count(), 5);
    assert.equal(await originalLiveMount.evaluate(mount => mount === document.querySelector('#loyaltyWebChallenge #ContentCardContainerLoyalty')), true,
      'Web preview moves the original subscription mount instead of cloning or rebuilding its content');
    assert.equal(await originalCarousel.evaluate(mount => mount === document.querySelector('#loyaltyWebOffers #loyaltyOfferCarousel')), true);
    await page.locator('#loyaltyWebOffers .loyalty-featured-art').first().click();
    assert.equal(await page.locator('#loyaltyDecisionOfferSheet').isVisible(), true, 'The detail overlay works outside the hidden mobile frame');
    await page.keyboard.press('Escape');
    await page.locator('#loyaltyWebOffers [data-save-preview-offer="ajo-offer-0"]').click();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.match(await page.locator('#loyaltyWebNotice').textContent(), /no Loyalty ID/);
    assert.equal(await page.locator('[data-save-preview-offer="ajo-offer-0"]').getAttribute('aria-pressed'), 'false');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
      assert.ok(await page.locator('#loyaltyWebPreview').isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.AEP_LOYALTY_SCREENSHOT) {
        const style = '.mod-demo-top-anchor, .tui-live-actions, #profileDrawer, #profileHoverZone { visibility: hidden !important; }';
        await page.locator('#loyaltyWebPreview').screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-web-' + theme + '.png'), style });
        await page.locator('.loyalty-challenges').screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-progress-' + theme + '.png'), style });
        await page.locator('.loyalty-offer-inspector').screenshot({ path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-inspector-' + theme + '.png'), style });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Web preview also fits a narrow browser');
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.locator('[data-loyalty-preview="mobile"]').click();
    assert.equal(await originalLiveMount.evaluate(mount => mount === document.querySelector('#loyaltyViewRewards #ContentCardContainerLoyalty')), true);
    assert.equal(await originalCarousel.evaluate(mount => mount === document.querySelector('#loyaltyViewRewards #loyaltyOfferCarousel')), true);
    assert.equal(await page.locator('[data-save-preview-offer="ajo-offer-0"]').getAttribute('aria-pressed'), 'false',
      'Switching presentation cannot turn an invalid purchase into an accepted receipt');
    assert.equal(await page.evaluate(() => window.__sdkCalls.length), sdkCallsBeforeSwitch,
      'Switching channel and preview-saving never request decisions, track displays or send journey events');
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
    assert.match(await page.locator('#loyaltyStatus').textContent(), /Preparing rewards.interest/,
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
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('audience membership is not yet verified'));
    const defaultTenantEvent = (await abandonCalls())[2].payload;
    assert.equal(defaultTenantEvent.xdm.eventType, 'rewards.interest');
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
      window.__journeyInteractions = [];
      window.__journeyCommands = [];
      window.__diagnosticMultiCard = true;
      window.alloy = async (command, options) => {
        window.__journeyCommands.push(options?.personalization?.surfaces?.[0] === 'web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers' ? 'featured-sendEvent' : command);
        if (command === 'getIdentity') return { identity: { ECID: '12345678901234567890123456789012345678' } };
        if (command === 'sendEvent' && options.personalization?.surfaces?.[0] === 'web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers') return { propositions: [] };
        if (command === 'subscribeRulesetItems') { window.__journeySubscriptions.push(options); return; }
        if (options?.xdm?.eventType === 'decisioning.propositionInteract') window.__journeyInteractions.push(options);
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
          if (window.__diagnosticMultiCard) {
            propositions[0].scopeDetails = { decisionProvider: 'AJO', rank: 9, correlationID: 'synthetic-correlation',
              characteristics: { source: 'journey', eventToken: 'synthetic-event-token' },
              activity: { id: 'synthetic-activity', priority: 0 } };
            propositions[0].items.push({ id: 'second-native-card',
              schema: 'https://ns.adobe.com/personalization/message/content-card',
              data: { content: { title: 'Second eligible card', body: 'Separate native content',
                imageUrl: 'https://example.invalid/second-card.png', dismissBtn: { style: 'button' },
                buttons: [{ text: { content: 'Second reward CTA' }, interactId: 'secondReward' }] },
                meta: { rank: 1, challengeId: 'synthetic-second-challenge' } } });
            propositions.push({ id: 'rules-card', scope: subscription.surfaces[0],
              scopeDetails: { decisionProvider: 'AJO', rank: 2 }, items: [{ id: 'rules-item', data: { rules: [{
                consequences: [
                  { id: 'first-content', detail: { data: { contentType: 'application/json',
                    content: JSON.stringify({ title: { content: 'Rule card' }, body: { content: 'Rule body' },
                      buttons: [{ text: { content: 'Join' }, interactId: 'joinChallenge' }] }),
                    meta: { challengeId: 'synthetic-rule-challenge', rank: 3 } } } },
                  { id: 'second-content', detail: { data: { content: { title: { content: 'Another consequence' } } } } },
                  { id: 'empty-content', detail: { data: { content: {} } } },
                ],
              }] } }, { id: 'default-item', schema: 'https://ns.adobe.com/personalization/default-content-item' }] });
            propositions.push({ id: 'unrelated-surface', scope: subscription.surfaces[0] + '-different',
              scopeDetails: { decisionProvider: 'AJO', rank: 100 }, items: [] });
          }
          window.__lastEvaluatedPropositions = propositions;
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
    assert.equal(journey.tracking[0].selected[0].items.length, 1, 'Display attribution excludes hidden sibling items');
    const evaluatedDiagnostic = await page.evaluate(() => window.LloydsLoyaltyContentCardDebug.getEvaluated());
    assert.equal(evaluatedDiagnostic.evaluated, true);
    assert.equal(evaluatedDiagnostic.totalPropositions, 3);
    assert.equal(evaluatedDiagnostic.surfacePropositions, 2);
    assert.equal(evaluatedDiagnostic.totalContentCardCandidates, 4);
    assert.equal(evaluatedDiagnostic.inventory.length, 6, 'Inventory retains rejected consequences and default items too');
    assert.equal(evaluatedDiagnostic.selectedCandidate.itemId, 'native-card');
    assert.equal(evaluatedDiagnostic.selectedCandidate.provider, 'AJO');
    assert.equal(evaluatedDiagnostic.selectedCandidate.source, 'journey');
    assert.equal(evaluatedDiagnostic.selectedCandidate.eventToken, 'synthetic-event-token');
    assert.equal(evaluatedDiagnostic.selectedCandidate.correlationId, 'synthetic-correlation');
    assert.equal(evaluatedDiagnostic.selectedCandidate.activity.id, 'synthetic-activity');
    assert.equal(evaluatedDiagnostic.selectedCandidate.activityPriority, 0);
    assert.equal(evaluatedDiagnostic.inventory.find(entry => entry.consequenceId === 'first-content').ctas[0].interactId, 'joinChallenge');
    assert.deepEqual(evaluatedDiagnostic.inventory.find(entry => entry.consequenceId === 'first-content').ctas,
      [{ id: null, label: 'Join', interactId: 'joinChallenge', actionUrl: null }]);
    assert.equal(evaluatedDiagnostic.inventory.find(entry => entry.consequenceId === 'first-content').title, 'Rule card');
    assert.equal(evaluatedDiagnostic.inventory.find(entry => entry.consequenceId === 'first-content').body, 'Rule body');
    assert.equal(evaluatedDiagnostic.inventory.find(entry => entry.consequenceId === 'first-content').challengeId, 'synthetic-rule-challenge');
    assert.equal(evaluatedDiagnostic.inventory.find(entry => entry.consequenceId === 'first-content').rank, 3);
    assert.equal(await page.locator('#ContentCardContainerLoyalty article').count(), 4, 'Every valid candidate has its own Content Card');
    const visibleCard = page.locator('#ContentCardContainerLoyalty article[data-primary="true"]');
    const nextCard = page.getByRole('button', { name: 'Next challenge', exact: true });
    const previousCard = page.getByRole('button', { name: 'Previous challenge', exact: true });
    assert.equal(await visibleCard.count(), 1, 'One Content Card is primary while its neighbor peeks into view');
    assert.deepEqual(await page.locator('#ContentCardContainerLoyalty article h3').allTextContents(),
      ['Delivered by the journey', 'Rule card', 'Another consequence', 'Second eligible card'],
      'Descending effective Adobe rank determines the carousel order');
    assert.equal(await page.locator('.loyalty-card-dots button').count(), 4);
    await page.evaluate(offers => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers } })), ajoOffers);
    const stateBeforeCardNavigation = await page.locator('#loyaltyTasks').innerHTML();
    const featuredBeforeCardNavigation = await page.locator('#loyaltyFeaturedOffers').innerHTML();
    const apiReadsBeforeCardNavigation = reads.length, signupsBeforeCardNavigation = signupRequests.length;
    assert.equal(await page.evaluate(() => {
      const propositions = [...window.__lastEvaluatedPropositions, {
        scope: 'web://example.invalid/#ContentCardContainer', items: [{ data: { content: { title: { content: 'Generic' } } } }],
      }];
      let writes = 0;
      propositions.forEach(payload => {
        const scope = payload.scope || '';
        const selector = scope.includes('ContentCardContainerLoyalty') ? '.ContentCardContainerLoyalty' :
          scope.includes('ContentCardContainer') ? '.ContentCardContainer' : null;
        if (!selector) return;
        payload.items.forEach(item => {
          if (!item.data?.content || item.data.content === 'undefined') return;
          const container = document.querySelector(selector);
          if (container) { container.innerHTML = '<p>Tags overwrite fixture</p>'; container.style.height = '500px'; writes++; }
        });
      });
      return writes;
    }), 0, 'Executing the supplied Tags selector/write paths cannot overwrite either Loyalty mount');
    assert.equal(await visibleCard.locator('h3').textContent(), 'Delivered by the journey');
    await nextCard.click(); await waitForPrimary('Rule card');
    assert.equal(await visibleCard.locator('h3').textContent(), 'Rule card');
    assert.equal(await page.evaluate(() => window.__journeyTracking.at(-1).selected[0].items[0].id), 'rules-item');
    await nextCard.click(); await waitForPrimary('Another consequence');
    assert.equal(await visibleCard.getAttribute('data-consequence-id'), 'second-content');
    await nextCard.click(); await waitForPrimary('Second eligible card');
    assert.equal(await visibleCard.locator('h3').textContent(), 'Second eligible card');
    assert.equal(await visibleCard.locator('p').textContent(), 'Separate native content');
    assert.equal(await visibleCard.locator('img').getAttribute('src'), 'https://example.invalid/second-card.png');
    assert.equal(await visibleCard.getAttribute('data-challenge-id'), 'synthetic-second-challenge');
    const secondDisplay = await page.evaluate(() => window.__journeyTracking.at(-1));
    assert.equal(secondDisplay.type, 'display');
    assert.equal(secondDisplay.selected[0].id, 'journey-card');
    assert.deepEqual(secondDisplay.selected[0].items.map(item => item.id), ['second-native-card']);
    assert.equal(secondDisplay.selected[0].scopeDetails.characteristics.eventToken, 'synthetic-event-token');
    await visibleCard.getByRole('button', { name: 'Second reward CTA' }).click(); await waitForProfile();
    const secondInteraction = await page.evaluate(() => window.__journeyInteractions.at(-1));
    assert.equal(secondInteraction.xdm._experience.decisioning.propositionAction.id, 'secondReward');
    assert.deepEqual(secondInteraction.xdm._experience.decisioning.propositions[0].items.map(item => item.id), ['second-native-card']);
    assert.equal(secondInteraction.xdm._experience.decisioning.propositions[0].scopeDetails.correlationID, 'synthetic-correlation');
    assert.equal(secondInteraction.edgeConfigOverrides.datastreamId, 'native-fixture-stream');
    assert.equal(secondInteraction.xdm.identityMap.Email[0].id, 'journey-fixture@example.invalid');
    await page.evaluate(() => {
      window.__lastEvaluatedPropositions[0].scopeDetails.characteristics.eventToken = 'refreshed-synthetic-token';
      window.__deliverJourney();
    }); await waitForProfile();
    await visibleCard.getByRole('button', { name: 'Second reward CTA' }).click(); await waitForProfile();
    assert.equal(await page.evaluate(() => window.__journeyInteractions.at(-1).xdm._experience.decisioning
      .propositions[0].scopeDetails.characteristics.eventToken), 'refreshed-synthetic-token',
      'Refreshed attribution tokens update click context even when card content and IDs are unchanged');
    await page.evaluate(() => window.__deliverJourney()); await waitForProfile();
    assert.equal(await visibleCard.locator('h3').textContent(), 'Second eligible card', 'Duplicate callbacks preserve carousel position');
    const displaysBeforeRevisit = await page.evaluate(() => window.__journeyTracking.length);
    await previousCard.click(); await waitForPrimary('Another consequence');
    await nextCard.click(); await waitForPrimary('Second eligible card');
    assert.equal(await page.evaluate(() => window.__journeyTracking.length), displaysBeforeRevisit,
      'Revisiting unchanged slides does not repeat display collection');
    assert.equal(await nextCard.isDisabled(), true, 'The independent strip clamps at its end, like Featured Offers');
    const challengeViewport = page.locator('#loyaltyChallengeCarousel');
    await challengeViewport.focus(); await challengeViewport.press('Home'); await waitForPrimary('Delivered by the journey');
    assert.equal(await previousCard.isDisabled(), true);
    const dimensions = await page.evaluate(() => {
      const viewport = document.getElementById('loyaltyChallengeCarousel'), featured = document.getElementById('loyaltyOfferCarousel');
      const cards = viewport.querySelectorAll('article'), offers = document.querySelectorAll('.loyalty-featured-offer');
      const bounds = viewport.getBoundingClientRect(), first = cards[0].getBoundingClientRect(), second = cards[1].getBoundingClientRect();
      return { viewport: bounds.width, featuredViewport: featured.getBoundingClientRect().width,
        card: first.width, featuredCard: offers[0].getBoundingClientRect().width,
        gap: second.left - first.right, peek: bounds.right - second.left,
        radius: getComputedStyle(cards[0]).borderRadius, featuredRadius: getComputedStyle(offers[0]).borderRadius,
        controls: document.querySelector('.loyalty-card-controls').getBoundingClientRect().height,
        featuredControls: document.querySelector('.loyalty-carousel-controls').getBoundingClientRect().height };
    });
    assert.ok(Math.abs(dimensions.viewport - dimensions.featuredViewport) <= 1, 'Both independent strips have the same phone viewport width');
    assert.ok(Math.abs(dimensions.card - dimensions.featuredCard) <= 1, 'Challenge card width matches Featured Offers');
    assert.equal(dimensions.radius, dimensions.featuredRadius);
    assert.ok(dimensions.gap >= 11 && dimensions.gap <= 13);
    assert.ok(dimensions.peek >= 20 && dimensions.peek <= 45, 'The next card is visibly clipped at the right edge');
    assert.ok(dimensions.controls <= dimensions.featuredControls + 1, 'Navigation uses the same compact footprint');
    await challengeViewport.press('ArrowRight'); await waitForPrimary('Rule card');
    await challengeViewport.press('End'); await waitForPrimary('Second eligible card');
    await challengeViewport.press('Home'); await waitForPrimary('Delivered by the journey');
    await challengeViewport.scrollIntoViewIfNeeded();
    let challengeBox = await challengeViewport.boundingBox();
    await page.mouse.move(challengeBox.x + challengeBox.width / 2, challengeBox.y + 20);
    await page.mouse.wheel(dimensions.card + dimensions.gap, 0);
    await waitForPrimary('Rule card');
    await challengeViewport.focus(); await challengeViewport.press('Home'); await waitForPrimary('Delivered by the journey');
    await page.keyboard.down('Shift'); await page.mouse.wheel(0, dimensions.card + dimensions.gap); await page.keyboard.up('Shift');
    await waitForPrimary('Rule card');
    challengeBox = await challengeViewport.boundingBox();
    await page.mouse.move(challengeBox.x + challengeBox.width * .85, challengeBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(challengeBox.x + challengeBox.width * .15, challengeBox.y + 20, { steps: 10 });
    await page.mouse.up(); await waitForPrimary('Another consequence');
    const touchSession = await context.newCDPSession(page);
    await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    challengeBox = await challengeViewport.boundingBox();
    const swipe = async (dx, dy) => {
      const x = challengeBox.x + challengeBox.width * .85, y = challengeBox.y + 90;
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 12; step++) {
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove',
          touchPoints: [{ x: x + dx * step / 12, y: y + dy * step / 12 }] });
        await page.waitForTimeout(16);
      }
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe(-(dimensions.card + dimensions.gap), 0);
    await waitForPrimary('Second eligible card');
    await swipe(0, -60);
    await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await touchSession.detach();
    assert.equal(await visibleCard.locator('h3').textContent(), 'Second eligible card', 'Native vertical swipes leave the primary challenge unchanged');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await challengeViewport.focus(); await challengeViewport.press('Home'); await waitForPrimary('Delivered by the journey');
    await challengeViewport.press('ArrowRight'); await waitForPrimary('Rule card');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await challengeViewport.press('End'); await waitForPrimary('Second eligible card');
    assert.equal(await page.evaluate(() => window.__journeyTracking.length), displaysBeforeRevisit,
      'Native navigation still uses the unchanged per-card display deduplication');
    assert.equal(await page.locator('.loyalty-card-dots button[aria-current="true"]').count(), 1);
    assert.equal(await page.locator('#loyaltyTasks').innerHTML(), stateBeforeCardNavigation);
    assert.equal(await page.locator('#loyaltyFeaturedOffers').innerHTML(), featuredBeforeCardNavigation);
    assert.equal(reads.length, apiReadsBeforeCardNavigation, 'Content Card navigation never calls Loyalty APIs');
    assert.equal(signupRequests.length, signupsBeforeCardNavigation, 'Content Card navigation never enrols the member');
    await challengeViewport.focus(); await challengeViewport.press('Home'); await waitForPrimary('Delivered by the journey');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(() => {
        const viewport = document.getElementById('loyaltyChallengeCarousel');
        return viewport.clientWidth > 0 && viewport.scrollLeft < 1;
      });
      const mobile = await challengeViewport.evaluate(viewport => {
        const bounds = viewport.getBoundingClientRect(), cards = viewport.querySelectorAll('article');
        return { width: bounds.width, card: cards[0].getBoundingClientRect().width,
          peek: bounds.right - cards[1].getBoundingClientRect().left,
          leaked: viewport.parentElement.scrollWidth > viewport.parentElement.clientWidth + 1 };
      });
      assert.ok(mobile.width <= width && mobile.card < mobile.width && mobile.peek >= 20 && mobile.peek <= 45,
        'A primary card and next-card peek fit the ' + width + 'px mobile viewport');
      assert.equal(mobile.leaked, false, 'Horizontal scrolling remains inside the challenge viewport');
    }
    await page.setViewportSize({ width: 1500, height: 1100 });
    await challengeViewport.press('End'); await waitForPrimary('Second eligible card');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-aep-theme', theme), theme);
      assert.equal(await visibleCard.count(), 1);
      assert.equal(await page.evaluate(() => {
        const mount = document.getElementById('ContentCardContainerLoyalty');
        return mount.scrollWidth <= mount.clientWidth + 1;
      }), true, 'Content Cards fit the phone in ' + theme + ' mode');
      if (process.env.AEP_LOYALTY_SCREENSHOT) {
        await page.evaluate(() => {
          const section = document.querySelector('.loyalty-promotion'), scroll = document.querySelector('.loyalty-phone-scroll');
          scroll.scrollTop += section.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16;
        });
        await page.locator('.loyalty-phone').screenshot({
          path: process.env.AEP_LOYALTY_SCREENSHOT.replace(/\.png$/, '-content-cards-' + theme + '.png'),
        });
      }
    }
    await page.locator('[data-loyalty-preview="web"]').click();
    await waitForPrimary('Second eligible card');
    assert.equal(await visibleCard.count(), 1, 'The primary card remains selected when the independent strip moves to desktop');
    assert.equal(await page.locator('#loyaltyWebChallenge .loyalty-card-controls').count(), 1);
    await page.locator('[data-loyalty-preview="mobile"]').click();
    await page.evaluate(() => document.documentElement.removeAttribute('data-aep-theme'));
    await visibleCard.getByRole('button', { name: 'Dismiss', exact: true }).click(); await waitForProfile();
    assert.equal(await page.locator('#ContentCardContainerLoyalty article').count(), 3);
    assert.equal(await page.locator('.loyalty-card-dots button').count(), 3);
    const dismissal = await page.evaluate(() => window.__journeyTracking.find(event => event.type === 'dismiss'));
    assert.deepEqual(dismissal.selected[0].items.map(item => item.id), ['second-native-card']);
    await page.evaluate(() => window.__deliverJourney()); await waitForProfile();
    assert.equal(await page.locator('#ContentCardContainerLoyalty article').count(), 3, 'Duplicate delivery cannot resurrect a dismissed card');
    const eventsAfterCarousel = await page.evaluate(() => window.__journeyTracking.length);
    assert.equal(JSON.parse(await page.locator('#loyaltyCardPreselectionEvidence').textContent()).totalContentCardCandidates, 4);
    assert.equal(JSON.parse(await page.locator('#loyaltyEvidence').textContent()).proposition.id, 'journey-card',
      'Existing selected-card evidence remains unchanged');
    await page.evaluate(() => {
      const evidence = window.LloydsLoyaltyContentCardDebug.getEvaluated();
      if (JSON.stringify(evidence.propositions) !== JSON.stringify(window.__lastEvaluatedPropositions)) throw new Error('Incomplete or mutated raw evidence');
      evidence.propositions.length = 0;
      if (window.LloydsLoyaltyContentCardDebug.getEvaluated().propositions.length !== 3) throw new Error('Getter exposed mutable stored evidence');
      document.getElementById('loyaltyCardPreselectionEvidence').remove();
      window.__diagnosticMultiCard = false;
    });
    await page.locator('#loyaltyRun').click();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.match(await page.locator('#loyaltyStatus').textContent(), /unchanged/i,
      'An unchanged subscription update completes the loading state');
    assert.equal(await page.evaluate(() => window.__journeyTracking.length), eventsAfterCarousel);
    assert.equal(await page.locator('.loyalty-card-controls').count(), 0, 'Controls are removed when the delivery becomes single-card');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(() => document.getElementById('loyaltyChallengeCarousel').clientWidth > 0);
      assert.equal(await challengeViewport.evaluate(viewport => {
        const card = viewport.querySelector('article'), style = getComputedStyle(viewport);
        const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return viewport.scrollWidth <= viewport.clientWidth + 1 && Math.abs(card.getBoundingClientRect().width - available) <= 1;
      }), true, 'One card fills its available width without a blank next-card slot at ' + width + 'px');
    }
    await page.setViewportSize({ width: 1500, height: 1100 });
    assert.equal(await page.evaluate(() => window.LloydsLoyaltyContentCardDebug.getEvaluated().totalPropositions), 1,
      'A missing optional diagnostic panel cannot block capture or existing card rendering');
    await page.evaluate(() => window.__deliverJourney());
    assert.equal(await page.evaluate(() => window.__journeyTracking.length), eventsAfterCarousel,
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
    assert.equal(await page.evaluate(() => window.LloydsLoyaltyContentCardDebug.getEvaluated().totalContentCardCandidates), 0,
      'Empty callbacks replace previous diagnostic counts');
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
        if (options.personalization?.surfaces?.[0] === 'web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers') return { propositions: [] };
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
          if (options.xdm?.eventType === 'commerce.purchases' && window.__holdPurchase) {
            await new Promise(resolve => { window.__releasePurchase = resolve; });
          }
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
    unavailableState = false; namespace = 'loyaltyId'; stateChallengeId = 'challenge-one-fixture'; quantity = 0; optedIn = false;
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
    await page.evaluate(() => {
      const scroll = document.querySelector('.loyalty-phone-scroll');
      const original = scroll.scrollTo.bind(scroll);
      window.__signupScrolls = 0;
      scroll.scrollTo = (...args) => { window.__signupScrolls++; return original(...args); };
    });
    const signupStarted = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/ajo-loyalty');
    await joinButton.click();
    await signupStarted;
    await joinButton.dispatchEvent('click');
    const countDuringSignup = signupRequests.length;
    unavailableState = true;
    releaseSignup(); signupGate = null;
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Challenge Joined.'));
    assert.equal(await page.evaluate(() => window.__signupScrolls), 0, 'Joining does not scroll the phone to the static partner offers');
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
    assert.equal(await page.locator('#loyaltyTasks .loyalty-task').count(), 0,
      'An unconfirmed state refresh cannot move available tasks into progress');
    assert.equal(await page.locator('#loyaltyTasks .loyalty-progress-count').count(), 0,
      'Signup acceptance does not fabricate joined task progress');
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
        xdm: { _id: purchase.xdm._id, timestamp: purchase.xdm.timestamp, eventType: 'commerce.purchases',
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
    const purchaseOffers = [
      { ...ajoOffers[0], id: 'purchase-a', merchant: 'Waitrose', sku: 'WAITROSE-OFFER-001' },
      { ...ajoOffers[1], id: 'purchase-b', merchant: 'Tesco', sku: 'TESCO-OFFER-001' },
      { id: 'missing-sku', merchant: 'Other merchant', title: 'Other offer', image: 'javascript:alert(1)' },
    ];
    await page.evaluate(() => {
      const set = Map.prototype.set;
      Map.prototype.set = function(key, value) {
        if (value?.propositionId) window.__selectedFeaturedOffer = value;
        return set.call(this, key, value);
      };
    });
    await page.evaluate(offers => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers } })), purchaseOffers);
    const beforeDetails = (await loyaltySends()).length;
    await page.locator('.loyalty-featured-offer').first().click();
    assert.equal(await page.locator('#loyaltyDecisionOfferTitle').textContent(), purchaseOffers[0].detailTitle);
    assert.match(await page.locator('#loyaltyDecisionOfferSheet').textContent(), /Original subtitle.*Original description/s);
    assert.equal(await page.locator('#loyaltyDecisionOfferSheet img').getAttribute('src'), purchaseOffers[0].image);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#loyaltyDecisionOfferSheet .loyalty-offer-close').evaluate(button => button === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal((await loyaltySends()).length, beforeDetails, 'Opening and closing offer details never sends a purchase');
    const dragBox = await page.locator('.loyalty-featured-art').first().boundingBox();
    await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + dragBox.width / 2 - 70, dragBox.y + dragBox.height / 2, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator('#loyaltyDecisionOfferSheet').isVisible(), false, 'Dragging preserves swipe behavior without opening details');
    await page.locator('.loyalty-featured-offer').nth(2).press('Enter');
    assert.equal(await page.locator('#loyaltyDecisionOfferSheet img').count(), 0, 'Unsafe media is omitted');
    assert.equal(await page.locator('#loyaltyDecisionOfferTitle').textContent(), 'Other offer');
    await page.locator('#loyaltyDecisionOfferSheet').click({ position: { x: 2, y: 2 } });
    await page.locator('[data-save-preview-offer="missing-sku"]').click();
    assert.match(await page.locator('#loyaltyAppToast').textContent(), /no SKU/);
    assert.equal((await loyaltySends()).length, beforeDetails, 'Missing SKU cannot be inferred from merchant/title');
    await page.evaluate(() => { window.__rejectLoyaltySend = true; });
    const failedPurchase = page.locator('[data-save-preview-offer="purchase-b"]');
    await failedPurchase.click();
    await page.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await failedPurchase.textContent(), '+');
    assert.equal(await failedPurchase.isDisabled(), false);
    assert.equal(await failedPurchase.getAttribute('aria-busy'), null);
    assert.equal(await page.locator('#loyaltySavedOffers .loyalty-merchant-logo').count(), 0);
    await page.evaluate(() => { window.__rejectLoyaltySend = false; window.__holdPurchase = true; });
    for (const offer of purchaseOffers.slice(0, 2)) {
      const button = page.locator('[data-save-preview-offer="' + offer.id + '"]');
      const before = (await loyaltySends()).length;
      await button.click();
      await page.waitForFunction(() => !!window.__releasePurchase);
      assert.equal(await button.getAttribute('aria-busy'), 'true');
      assert.equal(await button.textContent(), '+', 'No green tick before acceptance');
      await button.dispatchEvent('click');
      assert.equal((await loyaltySends()).length, before + 1, 'In-flight double click sends one event');
      assert.equal(await page.locator('#loyaltyDecisionOfferSheet').isVisible(), false, '+ must stop the card detail click');
      const payload = (await loyaltySends()).at(-1);
      assert.deepEqual(payload.xdm.productListItems, [{ SKU: offer.sku, name: offer.merchant + ' Offer',
        quantity: 1, priceTotal: 10, currencyCode: 'GBP' }]);
      assert.deepEqual(payload.xdm.identityMap, {
        Email: [{ id: 'another-fixture@example.invalid', authenticatedState: 'authenticated', primary: true }],
        ECID: [{ id: '12345678901234567890123456789012345678', authenticatedState: 'ambiguous', primary: false }],
        loyaltyId: [{ id: 'loyalty-fixture-123', primary: false }],
      }, 'Reuse the successful challenge identity map without inventing a visitor');
      assert.equal(payload.edgeConfigOverrides.datastreamId, 'purchase-fixture-stream');
      assert.equal(payload.xdm.commerce.purchases.value, 1);
      assert.match(payload.xdm._id, /^[0-9a-f-]{36}$/);
      assert.ok(Number.isFinite(Date.parse(payload.xdm.timestamp)));
      await page.evaluate(() => { const release = window.__releasePurchase; delete window.__releasePurchase; release(); });
      await page.waitForFunction(id => document.querySelector('[data-save-preview-offer="' + id + '"]').classList.contains('done'), offer.id);
      assert.equal(await button.getAttribute('aria-busy'), null);
      assert.equal(await button.textContent(), '\u2713');
      assert.deepEqual(await page.evaluate(() => window.__selectedFeaturedOffer), offer, 'Retain the entire selected decision item after acceptance');
      await button.dispatchEvent('click');
      assert.equal((await loyaltySends()).length, before + 1, 'Accepted purchase button cannot replay the event');
    }
    await page.evaluate(() => { window.__holdPurchase = false; });
    assert.equal(await page.locator('#loyaltySavedOffers .loyalty-merchant-logo').count(), 2);
    assert.equal(await page.locator('#loyaltyPartnerOffers [data-loyalty-purchase]').count(), 3,
      'Static challenge offers remain until real ingestion and Loyalty evaluation have been verified');
    assert.equal(await page.locator('.loyalty-phone-tick').count(), 0);
    await page.evaluate(() => {
      const callback = window.__loyaltySubscription.callback;
      window.__loyaltySubscription.callback = (result, collect) => {
        if (window.__additionalSignupCard && result.propositions.length) {
          result.propositions[0].scopeDetails.rank = 2;
          const second = structuredClone(result.propositions[0]);
          second.id = 'signup-second-proposition'; second.scopeDetails.rank = 1;
          second.items[0].id = 'signup-second-item';
          const consequence = second.items[0].data.rules[0].consequences[0];
          consequence.id = 'signup-second-consequence';
          consequence.detail.data.meta.challengeId = 'carousel-second-fixture';
          consequence.detail.data.content.title.content = 'Second signup challenge';
          result.propositions.push(second);
        }
        return callback(result, collect);
      };
      window.__additionalSignupCard = true; window.__deliverSignupCard();
    });
    await waitForProfile();
    assert.equal(await page.locator('.loyalty-card-dots button').count(), 2, 'Two independent Journey propositions have two slides');
    const partnerStateBeforeNavigation = await page.locator('#loyaltyPartnerOffers').innerHTML();
    const sendsBeforeJoinedNavigation = (await loyaltySends()).length, signupsBeforeJoinedNavigation = signupRequests.length;
    await page.getByRole('button', { name: 'Next challenge', exact: true }).click(); await waitForPrimary('Second signup challenge');
    assert.equal(await page.locator('#ContentCardContainerLoyalty article[data-primary="true"] h3').textContent(), 'Second signup challenge');
    await page.getByRole('button', { name: 'Previous challenge', exact: true }).click(); await waitForPrimary('FSI - Sign up challenge (fixture)');
    assert.equal(await page.locator('#loyaltyPartnerOffers').innerHTML(), partnerStateBeforeNavigation,
      'Moving to an unjoined card and back leaves the joined challenge and purchase receipts intact');
    assert.equal((await loyaltySends()).length, sendsBeforeJoinedNavigation);
    assert.equal(signupRequests.length, signupsBeforeJoinedNavigation);
    await page.getByRole('button', { name: 'Next challenge', exact: true }).click(); await waitForPrimary('Second signup challenge');
    await page.locator('#ContentCardContainerLoyalty article[data-primary="true"] [data-interact-id="joinChallenge"]').click();
    await page.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Challenge Joined.'));
    assert.equal(signupRequests.length, signupsBeforeJoinedNavigation + 1);
    assert.equal(signupRequests.at(-1).challenge_id, 'carousel-second-fixture', 'The second CTA enrols only its own delivered challenge');
    const secondSignupTracking = (await signupInteractions()).at(-1);
    assert.equal(secondSignupTracking.xdm._experience.decisioning.propositions[0].id, 'signup-second-proposition');
    assert.deepEqual(secondSignupTracking.xdm._experience.decisioning.propositions[0].items.map(item => item.id), ['signup-second-item']);
    assert.equal(await page.locator('#loyaltyPartnerOffers').getAttribute('data-challenge-id'), 'carousel-second-fixture',
      'The clicked card retains its participation context through the existing post-signup state refresh');
    await page.evaluate(() => { window.__additionalSignupCard = false; window.__deliverSignupCard(); });
    await waitForProfile();
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
    assert.equal(await page.locator('#loyaltyAvailable h3').textContent(), metadataNames[0],
      'The post-signup refresh resolves the name but retains availability until Adobe reports optedIn true');
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
    stateChallengeId = 'challenge-two-fixture'; optedIn = false; namespace = 'loyaltyId';
    await openApiOptions();
    await page.locator('#loyaltyRegion').selectOption('nld2');
    await page.locator('#queryProfileBtn').click();
    await waitForProfile();
    assert.equal(await page.locator('#loyaltyPartnerOffers').isVisible(), false,
      'A lookup cannot restore participation when the automatic state read reports optedIn false');
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
    optedIn = true;
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
        id: 'featured-response-fixture', scope: 'web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers', items: [{ id: 'returned-item-not-rendered-directly' }],
      }] };
      window.__featuredResult.decisions = window.__featuredResult.propositions;
      window.__featuredResponses = [];
      window.addEventListener('ajo:featured-offers-response', event => {
        window.__featuredResponses.push(event.detail);
        window.__featuredResponseIsOriginal = event.detail === window.__featuredResult;
      });
      window.alloy = async (command, options) => {
        if (command === 'getIdentity') {
          if (window.__pauseFeaturedIdentity) await new Promise(resolve => { window.__releaseFeaturedIdentity = resolve; });
          return { identity: { ECID: '12345678901234567890123456789012345678' } };
        }
        if (command === 'sendEvent' && options.personalization?.surfaces?.[0] === 'web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers') {
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
    assert.equal(await requestPage.evaluate(() => window.__featuredResponses.length), 0,
      'No raw response event is dispatched before the SDK request succeeds');
    await requestPage.evaluate(() => { window.__holdFeaturedResponse = false; window.__releaseFeaturedResponse(); });
    await requestPage.waitForFunction(() => window.__featuredCalls.length === 1 && !document.getElementById('queryProfileBtn').disabled);
    assert.deepEqual(await requestPage.evaluate(() => window.__featuredResponses), [
      await requestPage.evaluate(() => window.__featuredResult),
    ], 'Tags receives the complete unmodified SDK result, including propositions and decisions');
    assert.equal(await requestPage.evaluate(() => window.__featuredResponseIsOriginal), true,
      'The bridge passes the original result object as event.detail');
    const featuredPayload = await requestPage.evaluate(() => window.__featuredCalls[0]);
    assert.equal(featuredPayload.renderDecisions, false);
    assert.deepEqual(featuredPayload.personalization, {
      surfaces: ['web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers'],
    }, 'Request the exact shared AJO surface, never a relative fragment or the Rewards document surface');
    assert.deepEqual(featuredPayload.edgeConfigOverrides, { datastreamId: 'featured-fixture-stream' });
    assert.equal(featuredPayload.xdm.identityMap.Email[0].id, 'featured-first@example.invalid');
    assert.equal(featuredPayload.xdm.identityMap.Email[0].primary, true);
    assert.equal(featuredPayload.xdm.identityMap.ECID[0].id, '12345678901234567890123456789012345678');
    assert.equal(featuredPayload.xdm._demoemea.identification.core.email, 'featured-first@example.invalid');
    assert.equal(await requestPage.locator('[data-art="returned-item-not-rendered-directly"]').count(), 0,
      'The request does not render returned propositions or dispatch the offers event itself');
    assert.ok(featuredLogs.some(line => line.startsWith('[Rewards] featured-offers Web SDK response')));
    assert.ok(featuredLogs.some(line => line.startsWith('[Rewards] featured-offers propositions')));
    assert.ok(featuredLogs.some(line => line.startsWith('[Rewards] featured-offers-response dispatched')));
    await featuredLookup();
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 1,
      'Repeated lookup of the same selected profile does not resend the decision request');
    assert.deepEqual(await requestPage.evaluate(() => window.requestFeaturedOffers()),
      await requestPage.evaluate(() => window.__featuredResult), 'The manual console entry point returns the existing result without duplicating requests');
    assert.equal(await requestPage.evaluate(() => window.__featuredResponses.length), 1,
      'Duplicate requests do not redispatch the cached raw response');
    await requestPage.evaluate(() => window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers: [{
      id: 'rule-mapped-offer', merchant: 'Waitrose', title: 'Rule-mapped cashback',
    }] } })));
    assert.deepEqual(await requestPage.locator('.loyalty-featured-body h4').allTextContents(), ['Rule-mapped cashback'],
      'Only the existing Data Collection event bridge populates the carousel');
    await featuredLookup('featured-second@example.invalid');
    await requestPage.waitForFunction(() => window.__featuredCalls.length === 2 && !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.at(-1).xdm.identityMap.Email[0].id), 'featured-second@example.invalid');
    assert.equal(await requestPage.locator('#loyaltyReturnedOffers .loyalty-returned-offer').count(), 0,
      'Changing profile clears the previous profile offer inspector; development fallback is not a live result');
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
    assert.equal(await requestPage.evaluate(() => window.__featuredResponses.length), 4,
      'A rejected SDK request does not dispatch a raw response event');
    if (!await requestPage.locator('#customerEmail').isVisible()) await requestPage.locator('#aepLabEnvMinimizeBtn').click();
    await requestPage.locator('#lloydsLoyaltyNs').selectOption('ecid');
    await featuredLookup('99999999999999999999999999999999999999');
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), 5,
      'A selected ECID different from the active SDK visitor cannot request Featured Offers');
    if (!await requestPage.locator('#customerEmail').isVisible()) await requestPage.locator('#aepLabEnvMinimizeBtn').click();
    await requestPage.locator('#lloydsLoyaltyNs').selectOption('email');
    await requestPage.evaluate(() => { window.__rejectFeaturedRequest = false; });
    await featuredLookup('combined-refresh@example.invalid');
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    await requestPage.evaluate(() => {
      window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers: [{
        id: 'refresh-preserved', merchant: 'Fixture merchant', title: 'Existing offer',
      }] } }));
      const original = window.alloy;
      window.__cardRefreshes = 0;
      window.alloy = async (command, options) => {
        if (command === 'sendEvent' && options.personalization?.surfaces?.[0]?.endsWith('#ContentCardContainerLoyalty')) {
          window.__cardRefreshes++;
        }
        return original(command, options);
      };
      window.__holdFeaturedResponse = true; delete window.__releaseFeaturedResponse;
    });
    const beforeRefresh = await requestPage.evaluate(() => window.__featuredCalls.length);
    const retainedOffer = await requestPage.locator('.loyalty-featured-offer').elementHandle();
    await requestPage.locator('#loyaltyRun').click();
    await requestPage.waitForFunction(() => typeof window.__releaseFeaturedResponse === 'function');
    assert.equal(await requestPage.locator('#loyaltyRun').isDisabled(), true);
    await requestPage.locator('#loyaltyRun').dispatchEvent('click');
    assert.equal(await requestPage.evaluate(() => window.__cardRefreshes), 1);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), beforeRefresh + 1);
    assert.equal(await retainedOffer.evaluate(card => card.isConnected), true, 'Refreshing does not clear the carousel while waiting');
    await requestPage.evaluate(() => { window.__holdFeaturedResponse = false; window.__releaseFeaturedResponse(); });
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.match(await requestPage.locator('#loyaltyStatus').textContent(), /Featured Offers response refreshed/);
    await requestPage.locator('#loyaltyRun').click();
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await requestPage.evaluate(() => window.__cardRefreshes), 2);
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), beforeRefresh + 2,
      'Each deliberate click refreshes both surfaces without requiring a profile change');
    await requestPage.evaluate(() => window.requestFeaturedOffers());
    assert.equal(await requestPage.evaluate(() => window.__featuredCalls.length), beforeRefresh + 2,
      'Automatic/manual-console requests remain deduplicated after explicit refresh');
    await requestPage.evaluate(() => { window.__rejectFeaturedRequest = true; });
    await requestPage.locator('#loyaltyRun').click();
    await requestPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.match(await requestPage.locator('#loyaltyStatus').textContent(), /interrupted featured-offers response.*No automatic retry/);
    assert.equal(await retainedOffer.evaluate(card => card.isConnected), true, 'An unsuccessful refresh retains existing offers');
    await requestPage.close();
    const progressPage = await context.newPage();
    namespace = 'loyaltyId'; profileLoyaltyId = 'automatic-member'; optedIn = true;
    quantity = 3; challengeListOverride = undefined; rejectState = false;
    const stateReads = () => reads.filter(read => read.action === 'profile_state').length;
    const beforeAutomaticReads = stateReads(), beforeAutomaticSignups = signupRequests.length;
    await progressPage.goto(origin + '/profile-viewer/lloyds-loyalty-demo.html');
    await progressPage.waitForFunction(() =>
      document.getElementById('loyaltyStatus')?.textContent.includes('SDK injection is only needed'));
    await progressPage.evaluate(() => { window.AepGlobalSandbox.setSelected('kirkham'); delete window.alloy; });
    await progressPage.locator('#customerEmail').fill('automatic-progress@example.invalid');
    await progressPage.locator('#queryProfileBtn').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('No signup was submitted'));
    assert.equal(stateReads(), beforeAutomaticReads + 1, 'Profile resolution loads state once without SDK or a card click');
    assert.equal(reads.filter(read => read.action === 'profile_state').at(-1).profile_id, 'automatic-member');
    assert.match(await progressPage.locator('#loyaltyPhoneTasks').textContent(), /Everyday rewards.*Make three purchases.*Completed/s);
    assert.equal(await progressPage.locator('#loyaltyTasks .loyalty-progress-count').textContent(), '1 / 2');
    await progressPage.evaluate(() => {
      window.dispatchEvent(new CustomEvent('tui-profile-changed'));
      window.dispatchEvent(new CustomEvent('tui-profile-changed'));
    });
    assert.equal(stateReads(), beforeAutomaticReads + 1, 'Duplicate profile-ready notifications do not repeat the read');
    await progressPage.locator('#queryProfileBtn').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('No signup was submitted'));
    assert.equal(stateReads(), beforeAutomaticReads + 2, 'Looking up the same profile again refreshes participation');
    optedIn = false;
    await progressPage.locator('#queryProfileBtn').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('No signup was submitted'));
    assert.equal(await progressPage.locator('#loyaltyTasks .loyalty-progress-count').count(), 0,
      'Available but non-opted-in challenges are not presented as joined progress');
    await progressPage.locator('#loyaltyRefresh').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await progressPage.locator('#loyaltyTasks .loyalty-progress-count').count(), 0,
      'Manual task status also excludes unjoined challenges from progress');
    assert.equal(await progressPage.locator('#loyaltyAvailable .loyalty-available-card').count(), 1,
      'Unjoined challenges remain inspectable under Available challenges');
    if (!await progressPage.locator('#customerEmail').isVisible()) await progressPage.locator('#aepLabEnvMinimizeBtn').click();
    if (!await progressPage.locator('.loyalty-settings').evaluate(element => element.open)) {
      await progressPage.locator('.loyalty-settings summary').click();
    }
    await progressPage.locator('#loyaltyMember').fill('debugging-other-member');
    await progressPage.locator('#queryProfileBtn').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('No signup was submitted'));
    assert.equal(reads.filter(read => read.action === 'profile_state').at(-1).profile_id, 'automatic-member',
      'Automatic reads resolve the loaded profile rather than a manual debugging member override');
    profileLoyaltyId = undefined;
    const beforeMissingMemberReads = stateReads();
    await progressPage.locator('#queryProfileBtn').click();
    await progressPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(stateReads(), beforeMissingMemberReads, 'No automatic state request without a resolved scalar Loyalty ID');
    profileLoyaltyId = 'automatic-member'; optedIn = true; holdState = true;
    const automaticStateStarted = new Promise(resolve => { stateStarted = resolve; });
    await progressPage.locator('#queryProfileBtn').click();
    await automaticStateStarted;
    await progressPage.locator('#customerEmail').fill('different-progress@example.invalid');
    holdState = false; releaseState();
    await progressPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    assert.equal(await progressPage.locator('#loyaltyTasks .loyalty-progress-count').count(), 0,
      'An old member response cannot restore progress after selected identity changes');
    rejectState = true;
    await progressPage.locator('#queryProfileBtn').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').dataset.error === 'true');
    assert.match(await progressPage.locator('#loyaltyStatus').textContent(), /no active enrollment.*No automatic retry/);
    assert.equal(signupRequests.length, beforeAutomaticSignups, 'Automatic reads never submit challenge signup');
    rejectState = false; signupMode = 'success';
    challengeListOverride = [
      { challenge_id: 'museum-fixture', name: 'Museum visits', optedIn: true, state: 'incomplete', accumSpend: 12,
        tasks: [{ taskId: 'visit-fixture', taskName: 'Visit a museum', taskState: 'incomplete' }] },
      { challenge_id: 'yoga-fixture', name: 'Yoga sessions', optedIn: true, state: 'incomplete', tasks: [] },
      { challenge_id: 'rail-fixture', name: 'Explore rail', optedIn: false, state: 'published',
        reward: { definition: 'points', rewardValue: '450' }, startDate: '2026-11-01T00:00:00Z',
        tasks: [{ taskId: 'rail-task', taskType: 'purchase', variables: { qtyMin: 4 }, accumulators: { qty: 2 } }] },
      { challenge_id: 'market-fixture', name: 'Weekly market', optedIn: 'false', state: 'published',
        tasks: [{ taskId: 'market-task', taskClass: 'spend', variables: { spendMin: 75 } }] },
      { challenge_id: 'unknown-fixture', name: 'Participation not reported' },
    ];
    await progressPage.locator('#loyaltyMember').fill('');
    await progressPage.locator('#queryProfileBtn').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('No signup was submitted'));
    assert.deepEqual(await progressPage.locator('#loyaltyTasks .loyalty-challenge h3').allTextContents(), ['Museum visits', 'Yoga sessions']);
    assert.match(await progressPage.locator('#loyaltyTasks [data-challenge-id="museum-fixture"] .loyalty-task-details').textContent(),
      /accumSpend: 12/, 'Reported challenge-level accumulators remain inspectable without new progress UI');
    assert.deepEqual(await progressPage.locator('#loyaltyAvailable .loyalty-available-card h3').allTextContents(), ['Explore rail', 'Weekly market']);
    assert.equal(await progressPage.locator('#loyaltyPhoneAvailable .loyalty-available-card').count(), 2);
    assert.equal(await progressPage.locator('#loyaltyAvailable progress, #loyaltyAvailable .loyalty-progress-count, #loyaltyAvailable [data-current]').count(), 0,
      'Available cards never display accumulated progress, completed counts or Up next states');
    assert.match(await progressPage.locator('#loyaltyAvailable').textContent(), /Qualifying spend target: 75/);
    assert.doesNotMatch(await progressPage.locator('#loyaltyAvailable .loyalty-available-facts').allTextContents().then(values => values.join(' ')), /GBP|£/,
      'Currency is not inferred from an unrelated banking demo');
    const railCard = progressPage.locator('#loyaltyAvailable [data-challenge-id="rail-fixture"]');
    const railDetails = await railCard.locator('.loyalty-task-details').textContent();
    assert.match(railDetails, /Opted in: false.*Task type: purchase.*qtyMin.*Accumulators/s);
    const stableCard = await railCard.elementHandle();
    await progressPage.locator('#loyaltyRefresh').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await stableCard.evaluate(card => card.isConnected), true, 'Available cards retain their challenge-ID key across refresh');
    assert.equal(await progressPage.locator('#loyaltyTasks .loyalty-challenge').count(), 2);
    await progressPage.locator('.loyalty-phone-nav [data-phone-view="rewards"]').click();
    await progressPage.locator('[data-loyalty-participation="complete"]').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    assert.equal(await progressPage.locator('#loyaltyTasks .loyalty-challenge').count(), 2, 'Participation-tab refresh uses the same classification');
    await progressPage.locator('[data-loyalty-participation="active"]').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('Task state refreshed'));
    if (process.env.AEP_LOYALTY_AVAILABLE_SCREENSHOT) {
      await railCard.scrollIntoViewIfNeeded();
      await progressPage.screenshot({ path: process.env.AEP_LOYALTY_AVAILABLE_SCREENSHOT + '-light.png' });
      await progressPage.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
      await progressPage.screenshot({ path: process.env.AEP_LOYALTY_AVAILABLE_SCREENSHOT + '-dark.png' });
    }
    const availableSignupStart = signupRequests.length;
    signupMode = 'rejected';
    await railCard.locator('button').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').dataset.error === 'true');
    assert.match(await railCard.locator('.loyalty-available-status').textContent(), /personalization missing/);
    assert.equal(await railCard.locator('button').isDisabled(), false, 'Definite rejection restores the available card action');
    assert.equal(challengeListOverride[2].optedIn, false, 'Failures never modify Adobe participation locally');
    signupMode = 'success';
    signupGate = new Promise(resolve => { releaseSignup = resolve; });
    const availableSignupStarted = progressPage.waitForRequest(request => request.method() === 'POST' && request.postDataJSON()?.challenge_id === 'rail-fixture');
    await railCard.locator('button').click(); await availableSignupStarted;
    assert.equal(await railCard.locator('button').isDisabled(), true);
    assert.equal(await railCard.locator('button').textContent(), 'Joining challenge...');
    await railCard.locator('button').dispatchEvent('click');
    releaseSignup(); signupGate = null;
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('not yet confirmed'));
    assert.equal(signupRequests.length, availableSignupStart + 2, 'A failed attempt and one accepted attempt, without a double submission');
    assert.equal(await progressPage.locator('#loyaltyAvailable .loyalty-available-card').count(), 2,
      'Accepted signup alone does not move a challenge into progress');
    assert.equal(await railCard.locator('button').textContent(), 'Check challenge status');
    assert.deepEqual(signupRequests.at(-1), { sandbox: 'kirkham', action: 'signup', profile_id: 'automatic-member',
      challenge_id: 'rail-fixture', region: 'va7', test: false, confirmed: true }, 'Reuse the existing scalar-member signup body with the selected ID');
    challengeListOverride[2] = { ...challengeListOverride[2], optedIn: true };
    await railCard.locator('button').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('participation confirmed by Adobe'));
    assert.equal(signupRequests.length, availableSignupStart + 2, 'Checking an accepted signup reads state instead of sending another signup');
    assert.equal(await progressPage.locator('#loyaltyTasks .loyalty-challenge').count(), 3);
    assert.equal(await progressPage.locator('#loyaltyAvailable .loyalty-available-card').count(), 1);
    confirmAvailableSignup = true;
    await progressPage.locator('#loyaltyAvailable [data-available-join="market-fixture"]').click();
    await progressPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('participation confirmed by Adobe'));
    assert.equal(signupRequests.at(-1).challenge_id, 'market-fixture', 'A completely different challenge uses the same signup action');
    assert.equal(await progressPage.locator('#loyaltyTasks .loyalty-challenge').count(), 4);
    assert.equal(await progressPage.locator('#loyaltyAvailable .loyalty-available-card').count(), 0);
    assert.equal(await progressPage.locator('#loyaltyTasks [data-challenge-id="market-fixture"] .loyalty-task progress').count(), 0,
      'Joining a raw Spend task does not fabricate an accumulator or Spend meter');
    confirmAvailableSignup = false;
    await progressPage.close();
    const spendPage = await context.newPage();
    spendPage.on('pageerror', error => errors.push(error.message));
    profileLoyaltyId = 'spend-demo-member'; namespace = 'loyaltyId';
    const spendChallenge = { challenge_id: 'spend-demo-fixture', challengeName: 'Generic Spend fixture',
      optedIn: true, state: 'active', tasks: [{ taskId: 'spend-task-fixture', taskName: 'Spend task fixture',
        taskType: 'purchase', taskClass: 'spend', taskState: 'incomplete',
        variables: { spendMin: 50, singleTrans: false, include: { valuesSet: ['*'] } } }] };
    challengeListOverride = [spendChallenge,
      { ...spendChallenge, challenge_id: 'unjoined-spend-fixture', optedIn: false },
      { ...spendChallenge, challenge_id: 'not-spend-fixture', tasks: [{ ...spendChallenge.tasks[0], taskClass: 'purchase' }] }];
    const spendTask = spendChallenge.tasks[0], beforeSpendSignups = signupRequests.length;
    await spendPage.goto(origin + '/profile-viewer/lloyds-loyalty-demo.html');
    await spendPage.waitForFunction(() => document.getElementById('loyaltyStatus')?.textContent.includes('SDK injection is only needed'));
    await spendPage.evaluate(() => window.AepGlobalSandbox.setSelected('kirkham'));
    await spendPage.locator('#customerEmail').fill('spend-demo@example.invalid');
    await spendPage.locator('#queryProfileBtn').click();
    await spendPage.waitForFunction(() => document.getElementById('loyaltyStatus').textContent.includes('No signup was submitted'));
    await spendPage.evaluate(() => {
      window.__spendEvents = []; window.__holdSpend = true;
      window.DemoLabEdgeConfig.edgeConfigOverrides = () => ({ edgeConfigOverrides: { datastreamId: 'spend-fixture-stream' } });
      window.alloy = async (command, payload) => {
        if (command === 'getIdentity') return { identity: { ECID: '12345678901234567890123456789012345678' } };
        if (command === 'sendEvent' && payload.xdm?.eventType === 'commerce.purchases') {
          window.__spendEvents.push(payload);
          if (window.__holdSpend) await new Promise(resolve => { window.__releaseSpend = resolve; });
          if (window.__rejectSpend) throw new Error('Fixture: purchase ingestion rejected');
          return { edgeTrace: 'spend-acceptance-fixture' };
        }
        return { propositions: [] };
      };
      window.dispatchEvent(new CustomEvent('ajo:featured-offers', { detail: { offers: [{
        id: 'spend-preserved-offer', merchant: 'Unchanged merchant', title: 'Unchanged Featured offer',
      }] } }));
    });
    const spendButton = spendPage.locator('#loyaltyTasks [data-spend-purchase]');
    const spendCard = spendPage.locator('#loyaltyTasks [data-challenge-id="spend-demo-fixture"] .loyalty-task');
    assert.equal(await spendButton.count(), 1, 'Only the opted-in, genuinely Spend-class task has a simulator');
    assert.equal(await spendPage.locator('#loyaltyPhone [data-spend-purchase]').count(), 0);
    assert.equal(await spendPage.locator('#loyaltyPhoneTasks [data-spend-purchase]').count(), 0);
    assert.match(await spendCard.textContent(), /Progress not yet reported/);
    assert.equal(await spendCard.locator('progress').count(), 0);
    const featuredBeforeSpend = await spendPage.locator('#loyaltyFeaturedOffers').innerHTML();
    await spendPage.mouse.move(0, 0);
    await spendPage.setViewportSize({ width: 390, height: 844 });
    for (const theme of ['dark', 'light']) {
      const fits = await spendPage.evaluate(theme => {
        document.documentElement.setAttribute('data-aep-theme', theme);
        const control = document.querySelector('.loyalty-spend-demo'), rect = control.getBoundingClientRect();
        const button = getComputedStyle(control.querySelector('button'));
        return rect.width <= innerWidth && rect.left >= 0 && rect.right <= innerWidth &&
          button.color !== button.backgroundColor;
      }, theme);
      assert.equal(fits, true, 'Spend control fits the mobile-width inspector with readable ' + theme + ' styling');
    }
    await spendPage.setViewportSize({ width: 1500, height: 1100 });
    await spendPage.locator('#profileHoverZone').dispatchEvent('mouseleave');
    if (await spendPage.locator('#customerEmail').isVisible()) await spendPage.locator('#aepLabEnvMinimizeBtn').click();
    await spendPage.mouse.move(0, 0);
    const storageBeforeSpend = await spendPage.evaluate(() => JSON.stringify(localStorage));
    const beforeSpendReads = stateReads();
    await spendButton.click();
    await spendPage.waitForFunction(() => typeof window.__releaseSpend === 'function');
    assert.equal(await spendButton.isDisabled(), true);
    assert.match(await spendButton.textContent(), /Sending £10/);
    await spendButton.dispatchEvent('click');
    assert.equal(await spendPage.evaluate(() => window.__spendEvents.length), 1, 'Double clicks never duplicate an in-flight transaction');
    const acceptedAt = Date.now();
    await spendPage.evaluate(() => { window.__holdSpend = false; window.__releaseSpend(); });
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest()?.sdkAccepted &&
      !document.querySelector('[data-spend-purchase]').disabled);
    assert.equal(stateReads(), beforeSpendReads, 'Acceptance does not immediately refresh or simulate progress');
    assert.match(await spendCard.textContent(), /Progress not yet reported/);
    assert.equal(await spendCard.locator('progress').count(), 0, 'SDK acceptance does not create a progress counter');
    assert.equal(await spendPage.evaluate(() => JSON.stringify(localStorage)), storageBeforeSpend);
    const event1 = await spendPage.evaluate(() => window.LloydsLoyaltySpendDebug.getLatest());
    assert.equal(event1.member, 'spend-demo-member');
    assert.equal(event1.event.edgeConfigOverrides.datastreamId, 'spend-fixture-stream');
    assert.equal(event1.event.renderDecisions, false);
    assert.equal(event1.event.xdm.eventType, 'commerce.purchases');
    assert.deepEqual(event1.event.xdm.commerce.purchases, { value: 1 });
    assert.equal(event1.event.xdm.commerce.order.priceTotal, 10);
    assert.equal(event1.event.xdm.commerce.order.currencyCode, 'GBP');
    assert.deepEqual(event1.event.xdm.productListItems, [{
      SKU: 'LOYALTY-SPEND-DEMO-10', name: 'Loyalty Spend demo purchase', quantity: 1, priceTotal: 10, currencyCode: 'GBP',
    }]);
    assert.equal(event1.event.xdm.identityMap.loyaltyId[0].id, 'spend-demo-member');
    assert.equal(event1.event.xdm.identityMap.Email[0].id, 'spend-demo@example.invalid');
    assert.equal(event1.event.xdm._demoemea.identification.core.loyaltyId, 'spend-demo-member');
    assert.equal(event1.event.xdm._demoemea.identification.core.ecid, event1.event.xdm.identityMap.ECID[0].id);
    assert.equal(event1.sdkResponse.edgeTrace, 'spend-acceptance-fixture');
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest().poll.responses.length === 1);
    assert.ok(Date.now() - acceptedAt >= 1800, 'The first real state read waits approximately two seconds');
    assert.match(await spendCard.textContent(), /Progress not yet reported/);
    spendTask.accumulators = { spend: 10 };
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest().poll.stopReason?.includes('updated Spend'));
    assert.match(await spendCard.textContent(), /£10 spent.*£40 to go.*20% of spend target/);
    assert.equal(await spendCard.locator('progress').getAttribute('value'), '10');
    assert.match(await spendPage.locator('#loyaltyTasks .loyalty-task-details').first().textContent(), /"accumulators".*"spend": 10/s);
    assert.equal(await spendCard.getAttribute('data-complete'), 'false');
    assert.equal(await spendPage.locator('#loyaltyFeaturedOffers').innerHTML(), featuredBeforeSpend);
    await spendButton.click();
    await spendPage.waitForFunction(() => window.__spendEvents.length === 2 && !document.querySelector('[data-spend-purchase]').disabled);
    assert.match(await spendCard.textContent(), /£10 spent.*£40 to go/, 'A second accepted purchase still leaves Adobe progress untouched');
    const event2 = await spendPage.evaluate(() => window.LloydsLoyaltySpendDebug.getLatest().event);
    assert.notEqual(event2.xdm._id, event1.event.xdm._id);
    assert.notEqual(event2.xdm.commerce.order.purchaseID, event1.event.xdm.commerce.order.purchaseID);
    spendTask.accumulators = { spend: 20 };
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest().poll.stopReason?.includes('updated Spend'));
    assert.match(await spendCard.textContent(), /£20 spent.*£30 to go.*40% of spend target/);
    delete spendTask.accumulators;
    await spendPage.locator('#loyaltyRefresh').click();
    await spendPage.waitForFunction(() => !document.getElementById('loyaltyRefresh').disabled);
    await spendButton.click();
    await spendPage.waitForFunction(() => window.__spendEvents.length === 3 && !document.querySelector('[data-spend-purchase]').disabled);
    spendTask.accumulators = { spend: 0 };
    await spendPage.waitForFunction(() => document.querySelector('[data-challenge-id="spend-demo-fixture"] .loyalty-task-copy small').textContent.includes('£0 spent'));
    assert.match(await spendCard.textContent(), /£0 spent.*£50 to go.*0% of spend target/, 'Returned zero is not confused with a missing accumulator');
    assert.equal(await spendPage.evaluate(() => window.LloydsLoyaltySpendDebug.getLatest().poll.stopReason), undefined,
      'First reporting zero is not treated as purchase progress; latency polling continues');
    await spendPage.waitForFunction(() => !document.querySelector('[data-spend-purchase]').disabled);
    await spendPage.evaluate(() => {
      window.__spendTimers = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) => window.__spendTimers(callback,
        delay === 2000 ? 100 : delay === 5000 ? 100 : delay, ...args);
    });
    const beforeBoundedReads = stateReads();
    await spendButton.click();
    await spendPage.waitForFunction(() => window.__spendEvents.length === 4 &&
      window.LloydsLoyaltySpendDebug.getLatest().sdkAccepted &&
      window.LloydsLoyaltySpendDebug.getLatest().event.xdm._id === window.__spendEvents.at(-1).xdm._id);
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest().poll.stopReason?.includes('retry window'));
    assert.equal(await spendPage.evaluate(() => window.LloydsLoyaltySpendDebug.getLatest().poll.responses.length), 6,
      'Unchanged Adobe Spend stops after six state reads for this transaction');
    assert.ok(stateReads() >= beforeBoundedReads + 6);
    const afterBoundedReads = stateReads();
    await spendPage.waitForTimeout(100);
    assert.equal(stateReads(), afterBoundedReads, 'No continuous polling after the retry limit');
    assert.equal(await spendButton.isDisabled(), false);
    assert.match(await spendCard.textContent(), /£0 spent/);
    await spendPage.evaluate(() => { window.__rejectSpend = true; });
    const beforeFailedSpendReads = stateReads();
    await spendButton.click();
    await spendPage.waitForFunction(() => document.querySelector('[data-spend-feedback]').textContent.includes('purchase ingestion rejected'));
    assert.equal(await spendButton.isDisabled(), false);
    assert.equal(await spendPage.evaluate(() => window.LloydsLoyaltySpendDebug.getLatest().sdkAccepted), false);
    assert.equal(stateReads(), beforeFailedSpendReads, 'A rejected purchase never starts progress polling');
    assert.match(await spendCard.textContent(), /£0 spent/);
    await spendPage.evaluate(() => { window.__rejectSpend = false; });
    rejectState = true;
    await spendButton.click();
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest().poll.stopReason?.includes('refresh failed'));
    assert.match(await spendCard.textContent(), /no active enrollment/);
    assert.equal(await spendButton.isDisabled(), false);
    rejectState = false;
    await spendButton.click();
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest()?.sdkAccepted &&
      !document.querySelector('[data-spend-purchase]').disabled);
    spendTask.accumulators = { spend: 50 };
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest().poll.stopReason?.includes('updated Spend'));
    assert.match(await spendCard.textContent(), /£50 spent.*£0 to go.*100% of spend target/);
    assert.equal(await spendCard.getAttribute('data-complete'), 'false', 'Reaching the spend target does not locally complete the task');
    assert.equal(await spendPage.locator('#loyaltyTasks .loyalty-progress-count').first().textContent(), '0 / 1');
    await spendButton.click();
    await spendPage.waitForFunction(() => !document.querySelector('[data-spend-purchase]').disabled);
    spendTask.taskState = 'completed'; spendChallenge.state = 'completed';
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest().poll.stopReason?.includes('reported the task'));
    assert.equal(await spendButton.count(), 0, 'Adobe completion removes the no-longer-appropriate simulator');
    assert.equal(await spendCard.getAttribute('data-complete'), 'true');
    assert.equal(signupRequests.length, beforeSpendSignups, 'Spend simulation never signs a member up');
    spendTask.taskState = 'incomplete'; spendChallenge.state = 'active';
    spendDefinition = structuredClone(spendTask);
    delete spendTask.taskClass; delete spendTask.variables;
    await spendPage.locator('#loyaltyRefresh').click();
    await spendPage.waitForFunction(() => !document.getElementById('loyaltyRefresh').disabled);
    assert.equal(await spendButton.count(), 1, 'Missing state classification/goals resolve through matching Adobe task metadata');
    await spendPage.evaluate(() => { window.setTimeout = window.__spendTimers; });
    await spendButton.click();
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest()?.sdkAccepted &&
      !document.querySelector('[data-spend-purchase]').disabled);
    const beforeCancelledSpendReads = stateReads();
    await spendPage.evaluate(() => {
      const input = document.getElementById('customerEmail');
      input.value = 'different-spend-member@example.invalid'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await spendPage.waitForTimeout(2200);
    assert.equal(stateReads(), beforeCancelledSpendReads, 'Identity changes cancel the old member polling timer');
    assert.equal(await spendPage.evaluate(() => window.LloydsLoyaltySpendDebug.getLatest()), null);
    assert.equal(await spendButton.count(), 0);
    await spendPage.locator('#queryProfileBtn').dispatchEvent('click');
    await spendPage.waitForFunction(() => document.querySelector('[data-spend-purchase]') &&
      !document.querySelector('[data-spend-purchase]').disabled);
    await spendPage.evaluate(() => { window.__holdSpend = true; delete window.__releaseSpend; });
    await spendButton.click();
    await spendPage.waitForFunction(() => typeof window.__releaseSpend === 'function');
    await spendPage.evaluate(() => {
      window.__oldSpendRelease = window.__releaseSpend;
      const input = document.getElementById('customerEmail');
      input.value = 'new-spend-profile@example.invalid'; input.dispatchEvent(new Event('input', { bubbles: true }));
      window.__holdSpend = false;
    });
    await spendPage.waitForFunction(() => !document.getElementById('queryProfileBtn').disabled);
    profileLoyaltyId = 'new-spend-member';
    await spendPage.locator('#queryProfileBtn').dispatchEvent('click');
    await spendPage.waitForFunction(() => document.querySelector('[data-spend-purchase]') &&
      !document.querySelector('[data-spend-purchase]').disabled);
    await spendButton.click();
    await spendPage.waitForFunction(() => window.LloydsLoyaltySpendDebug.getLatest()?.member === 'new-spend-member' &&
      window.LloydsLoyaltySpendDebug.getLatest().sdkAccepted);
    const newSpendEvidence = await spendPage.evaluate(() => window.LloydsLoyaltySpendDebug.getLatest());
    await spendPage.evaluate(async () => { window.__oldSpendRelease(); await new Promise(resolve => setTimeout(resolve, 30)); });
    assert.deepEqual(await spendPage.evaluate(() => window.LloydsLoyaltySpendDebug.getLatest()), newSpendEvidence,
      'A late old-profile SDK result/error cannot overwrite the newer purchase evidence');
    await spendPage.close();
    assert.deepEqual(errors, []);
    assert.ok(writes.every(path => path === '/api/lab/env-bar-preferences'),
      'Only shared personal display preferences may be saved; no profile, event-generator or Adobe mutations');
    console.log('Lloyds Loyalty browser checks passed (offline synthetic fixtures only).');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
