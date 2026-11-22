(function (global) {
  'use strict';
  const $ = id => document.getElementById(id), model = global.LloydsLoyalty;
  const prefix = 'lloydsLoyalty', viewName = 'Lloyds Loyalty';
  // Match the reviewed Kirkham event schema used by TUI / Center Parcs.
  const defaultEventTenant = () => global.AepGlobalSandbox.getSandboxName() === 'kirkham' ? '_demoemea' : '';
  const cardMount = () => $('ContentCardContainerLoyalty');
  const defaultCardSurface = () => {
    const page = new URL('content-decision-live-edge.html', location.href);
    return 'web://' + page.host + page.pathname + '#ContentCardContainerLoyalty';
  };
  const completedState = state => /^(complete|completed|sent)$/i.test(String(state));
  const complete = task => completedState(task.taskState);
  const stateChallengeName = challenge => [challenge?.challengeName, challenge?.name].find(value =>
    typeof value === 'string' && value.trim() && value.trim() !== challenge.challenge_id)?.trim() || '';
  const cardSchema = 'https://ns.adobe.com/personalization/message/content-card';
  let loaded = null, version = 0, busy = false, autoBlocked = true, targets = [], aborter, cardSubscription, pendingCard = false, contentCards = null;
  let joinedChallenge = null, deliveredChallenge = null, memberChallenges = [], offerFocus = null, selectedProfileKey = '', pendingProfile = null;
  let featuredRequest = null, pendingFeaturedRequest = false;
  let pendingTaskState = false, automaticTaskState = null;
  let contentCardEvidence = null, evaluatedContentCardEvidence = null;
  const readContentCardEvidence = evidence => evidence?.version === version ? structuredClone(evidence.snapshot) : null;
  global.LloydsLoyaltyContentCardDebug = Object.freeze({
    getLatest: () => readContentCardEvidence(contentCardEvidence),
    getEvaluated: () => readContentCardEvidence(evaluatedContentCardEvidence),
  });
  const availableMessages = new Map();
  const contentCardDisplays = new Set(), contentCardDismissals = new Set();
  const purchaseReceipts = new Map();
  const signupReceipts = new Map();
  const activatedOffers = new Map();
  const decisionItems = [
    { key: 'waitrose', merchant: 'Waitrose', initials: 'W', reward: '15% cashback', channel: 'Online', expiry: '01 Dec 26', badge: true },
    { key: 'tkmaxx', merchant: 'TK Maxx', initials: 'TK', reward: '10% cashback', channel: 'In store', expiry: '14 Dec 26' },
    { key: 'uber', merchant: 'Uber', initials: 'Uber', reward: '8% cashback', channel: 'Online', expiry: '31 Jan 27', badge: true },
    { key: 'ms', merchant: 'M&S', initials: 'M&S', reward: '12% cashback', channel: 'In store & online', expiry: '20 Dec 26' },
    { key: 'sky', merchant: 'Sky', initials: 'sky', reward: '15% cashback', channel: 'Online', expiry: '28 Feb 27', badge: true },
    { key: 'vue', merchant: 'Vue', initials: 'VUE', reward: '10% cashback', channel: 'In store', expiry: '01 Mar 27' },
  ].map(item => ({ ...item, id: item.key, title: item.reward }));
  let currentItems = [], pendingFeaturedOffers = null, lastAjoSignature = null, featuredFallbackTimer;
  let featuredReady = false, updateFeaturedCarousel = () => {}, moveFeaturedOffer = () => {};
  const safeUrl = raw => model.safeUrl(raw, location.href);
  const cssUrl = raw => {
    const url = safeUrl(raw);
    return url ? 'url("' + url.replace(/["\\\n\r\f]/g, character => '\\' + character.charCodeAt(0).toString(16) + ' ') + '")' : '';
  };
  // Data Collection owns the featured-offers Code-based Experience; consume its ranked items only.
  global.addEventListener('ajo:featured-offers', event => {
    const detail = event.detail, items = detail?.offers;
    if (!Array.isArray(items) || !items.length) {
      console.log('[Rewards App] No valid AJO Featured Offers received'); return;
    }
    const offers = items.filter(item => item && typeof item === 'object' && !Array.isArray(item) &&
      ['id', 'merchant', 'title'].every(key => typeof item[key] === 'string' && item[key].trim())).slice(0, 5).map(item => ({
        ...item,
        ...Object.fromEntries(['propositionId', 'propositionScope', 'propositionScopeDetails']
          .filter(key => item[key] == null && detail[key] != null).map(key => [key, detail[key]])),
      }));
    if (!offers.length) {
      console.log('[Rewards App] No valid AJO Featured Offers received'); return;
    }
    console.log('[Rewards App] Rendering AJO Featured Offers', offers);
    clearTimeout(featuredFallbackTimer);
    pendingFeaturedOffers = offers;
    if (featuredReady) renderAjoFeaturedOffers();
  });
  function renderAjoFeaturedOffers() {
    const signature = JSON.stringify(pendingFeaturedOffers.map(offer => offer.id));
    // ID order is the strategy ranking; duplicate deliveries must not reset carousel state.
    if (signature === lastAjoSignature) return;
    renderFeaturedOffers(pendingFeaturedOffers);
    renderReturnedOffers(pendingFeaturedOffers);
    lastAjoSignature = signature;
    $('loyaltyFeaturedStatus').textContent = 'Personalised offers';
  }
  function waitForFeaturedOffers() {
    clearTimeout(featuredFallbackTimer);
    $('loyaltyFeaturedOffers').replaceChildren(); $('loyaltyOfferDots').replaceChildren();
    currentItems = []; updateFeaturedCarousel();
    $('loyaltyReturnedCount').textContent = 'Waiting for AJO';
    $('loyaltyReturnedOffers').replaceChildren(node('p', 'No personalised offers received for this context.', 'loyalty-empty'));
    $('loyaltyFeaturedStatus').textContent = 'Loading personalised offers\u2026';
    $('loyaltyOfferCarousel').setAttribute('aria-busy', 'true');
    // Five-second development fallback; a later valid AJO delivery always replaces these previews.
    featuredFallbackTimer = setTimeout(() => {
      renderFeaturedOffers(decisionItems);
      $('loyaltyFeaturedStatus').textContent = 'Preview offers: no personalised offers received after 5 seconds.';
    }, 5000);
  }
  function renderFeaturedOffers(items) {
    currentItems = [...items];
    const carousel = $('loyaltyOfferCarousel'), track = $('loyaltyFeaturedOffers'), dots = $('loyaltyOfferDots');
    const cards = document.createDocumentFragment(), pagination = document.createDocumentFragment();
    currentItems.forEach((offer, index) => {
      const card = node('article', undefined, 'loyalty-featured-offer');
      card.dataset.art = offer.key || offer.id; card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', (index + 1) + ' of ' + currentItems.length + ': ' + offer.merchant);
      card.tabIndex = 0;
      card.addEventListener('click', () => openOfferDetail(offer));
      card.addEventListener('keydown', event => {
        if (event.target === card && ['Enter', ' '].includes(event.key)) {
          event.preventDefault(); openOfferDetail(offer);
        }
      });
      const art = node('div', undefined, 'loyalty-featured-art'); art.setAttribute('aria-hidden', 'true');
      const image = cssUrl(offer.image);
      if (image) { art.style.backgroundImage = image; art.style.backgroundSize = 'cover'; art.style.backgroundPosition = 'center'; }
      if (offer.badge) art.append(node('span', typeof offer.badge === 'string' ? offer.badge : 'NEW', 'loyalty-featured-badge'));
      const logo = node('span', offer.initials || offer.merchant.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join(''), 'loyalty-merchant-logo');
      logo.setAttribute('aria-hidden', 'true');
      const logoImage = cssUrl(offer.logo);
      if (logoImage) {
        logo.textContent = ''; logo.style.backgroundImage = logoImage;
        logo.style.backgroundSize = 'contain'; logo.style.backgroundPosition = 'center'; logo.style.backgroundRepeat = 'no-repeat';
      }
      const body = node('div', undefined, 'loyalty-featured-body');
      body.append(node('span', offer.merchant), node('h4', offer.title),
        node('p', 'Channel: ' + (offer.channel || 'Not specified')), node('p', 'Expires: ' + (offer.expiry || 'Not specified')));
      const save = node('button', '+', 'loyalty-featured-save'); save.type = 'button'; save.dataset.savePreviewOffer = offer.id;
      save.title = 'Send demo purchase for ' + offer.merchant;
      save.addEventListener('click', async event => {
        event.stopPropagation();
        await sendOfferPurchase(offer, save);
      });
      body.append(save); card.append(art, logo, body); cards.append(card);
      const dot = node('button'); dot.type = 'button';
      dot.setAttribute('aria-label', 'Show ' + offer.merchant + ' offer'); dot.setAttribute('aria-controls', carousel.id);
      dot.addEventListener('click', () => moveFeaturedOffer(index)); pagination.append(dot);
    });
    track.replaceChildren(cards); dots.replaceChildren(pagination);
    carousel.scrollTo({ left: 0, behavior: 'instant' }); carousel.setAttribute('aria-busy', 'false');
    renderSavedOffers(); updateFeaturedCarousel();
    // Add proposition display tracking here later; identifiers remain intact in currentItems.
  }
  let phoneView = 'home', toastTimer;
  let previewMode = 'mobile', previewMounts = [];
  const phoneScrollPositions = { home: 0, rewards: 0 };
  const signupScope = (ctx, member) => JSON.stringify([ctx.sandbox, ctx.region || 'va7', member]);
  const signupKey = (ctx, member, challenge) => JSON.stringify([signupScope(ctx, member), challenge]);
  const context = () => ({
    sandbox: global.AepGlobalSandbox.getSandboxName(),
    namespace: $(prefix + 'Ns').value.toLowerCase(), identifier: $('customerEmail').value.trim(),
    region: $('loyaltyRegion').value, member: $('loyaltyMember').value.trim(),
    challenge: $('loyaltyChallenge').value.trim(), test: $('loyaltyTest').checked,
    participation: $('loyaltyParticipation').value, surface: $('loyaltySurface').value.trim(),
    tenant: $('loyaltyTenant').value.trim(), target: $('generatorTarget').value,
  });
  const profileKey = () => JSON.stringify([global.AepGlobalSandbox.getSandboxName(),
    $(prefix + 'Ns').value.toLowerCase(), $('customerEmail').value.trim()]);
  const same = (ctx, token) => {
    if (token !== version || JSON.stringify(ctx) !== JSON.stringify(context())) throw new Error('Demo context changed; previous response discarded.');
    if (aborter?.signal.aborted) throw new Error('Request expired or was cancelled; previous response discarded.');
  };
  function message(text, error) {
    $('loyaltyStatus').textContent = text; $('loyaltyStatus').dataset.error = String(!!error);
    $('loyaltyRun').disabled = busy || !loaded;
    $('loyaltyRefresh').disabled = busy || !loaded;
    $('loyaltyAbandon').disabled = busy || !loaded;
    if ($('queryProfileBtn')) $('queryProfileBtn').disabled = busy;
    document.querySelectorAll('[data-loyalty-purchase]').forEach(button => { button.disabled = busy || !loaded; });
    cardMount().querySelectorAll('.loyalty-card-controls button').forEach(button => {
      button.disabled = busy || !loaded || button.dataset.boundaryDisabled === 'true';
    });
    syncSignupButtons();
  }
  function closeConfiguration() {
    if (!global.EnvBarCompact.isPinned()) global.EnvBarCompact.closeOverlay({ force: true });
  }
  const publish = () => {
    const first = loaded?.rows.find(row => row.path === 'person.name.firstName');
    const name = first ? global.TuiDecisioningProfile.scalar(first) : '';
    $('loyaltyHomeName').textContent = typeof name === 'string' && name.trim() ? name : 'Your banking';
    $('loyaltyHomeAvatar').textContent = typeof name === 'string' && name.trim() ? name.trim()[0].toUpperCase() : 'L';
    global.dispatchEvent(new CustomEvent('tui-profile-changed'));
  };
  function clearResults() {
    joinedChallenge = null; deliveredChallenge = null; memberChallenges = []; purchaseReceipts.clear(); closeOffer(false);
    activatedOffers.clear(); renderSavedOffers(); closeOfferDetail(false);
    clearTimeout(toastTimer); $('loyaltyAppToast').hidden = true;
    $('loyaltyWebNotice').textContent = '';
    $('loyaltyPartnerOffers').replaceChildren(); $('loyaltyPartnerOffers').hidden = true;
    contentCards?.cleanup?.(); contentCards = null; contentCardDisplays.clear(); contentCardDismissals.clear();
    cardMount().replaceChildren(); $('loyaltyTasks').replaceChildren(node('p', 'State not loaded for this context.', 'loyalty-empty'));
    $('loyaltyPhoneTasks').replaceChildren(node('p', 'State not loaded for this context.', 'loyalty-empty'));
    availableMessages.clear();
    $('loyaltyAvailable').replaceChildren(node('p', 'State not loaded for this context.', 'loyalty-empty'));
    $('loyaltyPhoneAvailable').replaceChildren();
    syncParticipation();
    $('loyaltyUpdated').textContent = 'Not loaded'; $('loyaltyNamespace').textContent = 'Loyalty namespace not yet read';
    $('loyaltyEvidence').textContent = 'No response for this context.';
    contentCardEvidence = evaluatedContentCardEvidence = null;
    const diagnosticPanel = $('loyaltyCardPreselectionEvidence');
    if (diagnosticPanel) diagnosticPanel.textContent = 'No Content Card response captured for this context.';
    $('loyaltyCardHint').textContent = 'Your challenges will appear here.';
  }
  function invalidate(clearProfile) {
    version++; aborter?.abort(); pendingProfile = null; pendingTaskState = false; automaticTaskState = null; autoBlocked = true; clearResults();
    global.DecisioningProfileRuntime?.invalidateProfileLookupCache();
    if (clearProfile) {
      loaded = null; $('loyaltyMember').value = '';
      featuredRequest = null; pendingFeaturedRequest = false;
      pendingFeaturedOffers = null; lastAjoSignature = null;
      if (featuredReady) waitForFeaturedOffers();
      global.DemoProfileDrawer.clearDrawerVisitorState(); publish();
    }
    message(clearProfile ? 'Context changed. Look up the selected profile.' : 'Configuration changed. Refresh tasks or request a new card.');
  }
  function node(tag, value, cls) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = String(value);
    if (cls) element.className = cls;
    return element;
  }
  function renderReturnedOffers(offers) {
    const fragment = document.createDocumentFragment();
    offers.forEach((offer, index) => {
      const card = node('article', undefined, 'loyalty-returned-offer');
      card.dataset.offerId = offer.id;
      const heading = node('div', undefined, 'loyalty-returned-heading');
      heading.append(node('span', 'Decision item ' + (index + 1)), node('b', offer.merchant));
      card.append(heading);
      const url = safeUrl(offer.image);
      if (url) {
        const image = node('img'); image.src = url; image.alt = offer.merchant + ' offer'; image.loading = 'lazy';
        card.append(image);
      }
      card.append(node('h3', offer.title));
      const fields = node('dl', undefined, 'loyalty-returned-fields');
      for (const [label, value] of [['Description', offer.detailDescription], ['Channel', offer.channel],
        ['Expires', offer.expiry || offer.endDate], ['Button label', offer.cta], ['Item priority', offer.priority]]) {
        if (value == null || value === '') continue;
        const row = node('div'); row.append(node('dt', label), node('dd', value)); fields.append(row);
      }
      card.append(fields);
      const details = node('details', undefined, 'loyalty-task-details');
      details.append(node('summary', 'Show response'), node('pre', JSON.stringify(offer, null, 2)));
      card.append(details); fragment.append(card);
    });
    $('loyaltyReturnedCount').textContent = offers.length + (offers.length === 1 ? ' returned item' : ' returned items');
    $('loyaltyReturnedOffers').replaceChildren(fragment);
  }
  function initPreviewMode() {
    // Reparent the live mounts, never clone them: subscriptions and card actions keep their original DOM.
    previewMounts = [
      { element: document.querySelector('.loyalty-promotion'), target: $('loyaltyWebChallenge') },
      ...[$('loyaltyFeaturedTitle'), $('loyaltyOfferCarousel'), document.querySelector('.loyalty-carousel-controls')]
        .map(element => ({ element, target: $('loyaltyWebOffers') })),
    ].map(mount => {
      const marker = document.createComment('Mobile preview mount');
      mount.element.before(marker);
      return { ...mount, marker };
    });
    document.querySelectorAll('[data-loyalty-preview]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.dataset.loyaltyPreview;
        if (mode === previewMode) return;
        previewMode = mode;
        for (const { element, target, marker } of previewMounts) {
          if (mode === 'web') target.append(element);
          else marker.after(element);
        }
        $('loyaltyMobilePreview').hidden = mode === 'web';
        $('loyaltyWebPreview').hidden = mode !== 'web';
        document.body.dataset.loyaltyPreview = mode;
        document.querySelectorAll('[data-loyalty-preview]').forEach(control => {
          control.setAttribute('aria-pressed', String(control.dataset.loyaltyPreview === mode));
        });
        updateFeaturedCarousel();
      });
    });
  }
  const phoneMotion = () => global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  function showPhoneView(name) {
    if (!['home', 'rewards'].includes(name) || name === phoneView) return;
    const scroll = document.querySelector('.loyalty-phone-scroll');
    const moveFocus = document.activeElement.closest('.loyalty-app-view');
    phoneScrollPositions[phoneView] = scroll.scrollTop;
    phoneView = name;
    $('loyaltyViewHome').hidden = name !== 'home'; $('loyaltyViewRewards').hidden = name !== 'rewards';
    document.querySelectorAll('.loyalty-phone-nav [data-phone-view]').forEach(button => {
      if (button.dataset.phoneView === name) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    scroll.scrollTo({ top: phoneScrollPositions[name], behavior: 'instant' });
    if (moveFocus) $(name === 'home' ? 'loyaltyHomeName' : 'loyaltyMobileTitle').focus({ preventScroll: true });
  }
  function scrollPhoneSection(id) {
    if (previewMode === 'web') { $(id).scrollIntoView({ behavior: phoneMotion(), block: 'center' }); $(id).focus({ preventScroll: true }); return; }
    showPhoneView('rewards');
    const scroll = document.querySelector('.loyalty-phone-scroll'), target = $(id);
    scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12,
      behavior: phoneMotion() });
    target.focus({ preventScroll: true });
  }
  function phoneToast(text) {
    clearTimeout(toastTimer);
    $('loyaltyAppToast').textContent = text; $('loyaltyAppToast').hidden = false;
    $('loyaltyWebNotice').textContent = text;
    toastTimer = setTimeout(() => { $('loyaltyAppToast').hidden = true; }, 4000);
  }
  function renderSavedOffers() {
    const fragment = document.createDocumentFragment();
    for (const offer of activatedOffers.values()) {
      const logo = node('span', offer.initials || offer.merchant.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join(''), 'loyalty-merchant-logo');
      logo.dataset.art = offer.key || offer.id; logo.setAttribute('role', 'img'); logo.setAttribute('aria-label', offer.merchant + ' purchase sent');
      fragment.append(logo);
    }
    if (!activatedOffers.size) fragment.append(node('span', undefined, 'loyalty-saved-empty'),
      node('span', undefined, 'loyalty-saved-empty'), node('small', 'Send a demo purchase with + to see it here.'));
    $('loyaltySavedOffers').replaceChildren(fragment);
    document.querySelectorAll('[data-save-preview-offer]').forEach(button => {
      const saved = activatedOffers.has(button.dataset.savePreviewOffer);
      button.setAttribute('aria-pressed', String(saved)); button.textContent = saved ? '\u2713' : '+';
      button.classList.toggle('done', saved);
      button.disabled = saved || button.getAttribute('aria-busy') === 'true';
      const offer = currentItems.find(item => item.id === button.dataset.savePreviewOffer);
      button.setAttribute('aria-label', (saved ? 'Purchase sent for ' : 'Send demo purchase for ') + offer.merchant);
    });
  }
  function initPhoneApp() {
    document.querySelectorAll('[data-phone-view]').forEach(button => {
      button.addEventListener('click', () => showPhoneView(button.dataset.phoneView));
    });
    document.querySelectorAll('[data-phone-section]').forEach(button => {
      button.addEventListener('click', () => scrollPhoneSection(button.dataset.phoneSection));
    });
    document.querySelectorAll('[data-phone-preview]').forEach(button => {
      button.addEventListener('click', () => phoneToast('Preview only: ' + button.dataset.phonePreview + '. No banking action or prize entry was submitted.'));
    });
    $('loyaltyBreakdownButton').addEventListener('click', () => {
      const open = $('loyaltyBreakdown').hidden;
      $('loyaltyBreakdown').hidden = !open;
      $('loyaltyBreakdownButton').setAttribute('aria-expanded', String(open));
      $('loyaltyBreakdownButton').firstChild.textContent = open ? 'Hide breakdown ' : 'Show breakdown ';
    });
    const carousel = $('loyaltyOfferCarousel'), track = $('loyaltyFeaturedOffers'), dots = $('loyaltyOfferDots');
    let active = 0;
    const updateCarousel = updateFeaturedCarousel = () => {
      if (!carousel.clientWidth) return;
      const cards = Array.from(track.children);
      const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0;
      const end = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 3;
      active = cards.length < 2 ? 0 : end ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, Math.round(carousel.scrollLeft / step)));
      Array.from(dots.children).forEach((dot, index) => {
        if (index === active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      $('loyaltyPreviousOffer').disabled = !cards.length || active === 0;
      $('loyaltyNextOffer').disabled = !cards.length || active === cards.length - 1;
    };
    const move = moveFeaturedOffer = index => {
      if (!currentItems.length) return;
      const target = Math.max(0, Math.min(currentItems.length - 1, index));
      carousel.scrollTo({ left: track.children[target].offsetLeft - track.children[0].offsetLeft, behavior: phoneMotion() });
    };
    $('loyaltyPreviousOffer').addEventListener('click', () => move(active - 1));
    $('loyaltyNextOffer').addEventListener('click', () => move(active + 1));
    carousel.addEventListener('scroll', updateCarousel, { passive: true });
    carousel.addEventListener('keydown', event => {
      if (event.target !== carousel || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      move(event.key === 'Home' ? 0 : event.key === 'End' ? currentItems.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1));
    });
    let drag = null, suppressClick = false;
    carousel.addEventListener('pointerdown', event => {
      suppressClick = false;
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button')) return;
      drag = { id: event.pointerId, x: event.clientX, scroll: carousel.scrollLeft };
    });
    carousel.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const distance = event.clientX - drag.x;
      if (Math.abs(distance) > 5) {
        suppressClick = true; carousel.style.scrollSnapType = 'none';
        // Capture only a real drag; capturing taps retargets card clicks to the carousel.
        carousel.setPointerCapture(event.pointerId);
      }
      if (suppressClick) { event.preventDefault(); carousel.scrollLeft = drag.scroll - distance; }
    });
    const endDrag = event => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null; carousel.style.scrollSnapType = '';
      updateCarousel();
      if (suppressClick) move(active);
    };
    carousel.addEventListener('pointerup', endDrag); carousel.addEventListener('pointercancel', endDrag);
    carousel.addEventListener('lostpointercapture', endDrag);
    carousel.addEventListener('click', event => {
      if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
    }, true);
    const resize = new ResizeObserver(updateCarousel); resize.observe(carousel);
    global.addEventListener('pagehide', event => {
      clearTimeout(toastTimer); clearTimeout(featuredFallbackTimer); if (!event.persisted) resize.disconnect();
    });
    featuredReady = true;
    if (pendingFeaturedOffers) renderAjoFeaturedOffers();
    else waitForFeaturedOffers();
    renderSavedOffers(); updateCarousel();
  }
  const repr = value => value === undefined || value === null ? 'Not reported' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  async function json(url, options) {
    const response = await fetch(url, { ...options, signal: aborter.signal });
    const type = response.headers.get('content-type') || '';
    if (url.startsWith('/api/ajo-loyalty?') && response.status === 404 && !type.includes('application/json')) {
      throw new Error('Loyalty API is not deployed. An authorized release owner must update aepProxy and the Hosting route; SDK injection does not enable task-status reads.');
    }
    if (!type.includes('application/json')) throw new Error('Expected the deployed lab JSON API; HTTP ' + response.status + '. Check the Functions release.');
    const data = await response.json();
    if (!response.ok || data.ok === false || data.error) throw new Error(typeof data.error === 'string' ? data.error : data.message || 'HTTP ' + response.status);
    return data;
  }
  function loyaltyAuthHeaders(ctx) {
    return ['kirkham', 'apalmer'].includes(ctx.sandbox) ? Promise.resolve({}) : global.AepLabSandboxSync.getAuthHeaders();
  }
  async function loyalty(ctx, input) {
    const headers = await loyaltyAuthHeaders(ctx);
    const result = await json('/api/ajo-loyalty?' + new URLSearchParams({ sandbox: ctx.sandbox, ...input }), { headers });
    return ['profile_state', 'profile_challenges'].includes(input.action) ? model.normaliseChallengeResponse(result.data) : result.data;
  }
  function syncSignupButtons() {
    const ctx = context();
    cardMount().querySelectorAll('[data-interact-id="joinChallenge"]').forEach(button => {
      const receipt = signupReceipts.get(signupKey(ctx, loaded?.profileLoyaltyId, button.dataset.challengeId));
      const alreadyJoined = memberChallenges.some(challenge =>
        challenge.challenge_id === button.dataset.challengeId && challenge.optedIn === true);
      button.disabled = busy || !!receipt || alreadyJoined;
      button.textContent = receipt?.state === 'joined' ? 'Challenge Joined' :
        receipt?.state === 'already' ? 'Challenge Already Joined' :
        receipt?.state === 'unknown' ? 'Check challenge status' :
        receipt?.state === 'pending' ? 'Joining Challenge...' :
        alreadyJoined ? 'Challenge Already Joined' : button.dataset.joinLabel;
    });
    document.querySelectorAll('[data-available-join]').forEach(button => {
      const receipt = signupReceipts.get(signupKey(ctx, loaded?.profileLoyaltyId, button.dataset.availableJoin));
      button.disabled = busy || button.dataset.selectedMember !== 'true' || !loaded?.profileLoyaltyId;
      button.textContent = receipt?.state === 'pending' ? 'Joining challenge...' :
        receipt ? 'Check challenge status' : 'Join challenge';
      button.setAttribute('aria-busy', String(receipt?.state === 'pending'));
    });
  }
  function reconcileSignupState(state, ctx, member) {
    if (ctx.test || ctx.participation !== 'active') return;
    for (const [key, receipt] of signupReceipts) {
      if (receipt.scope !== signupScope(ctx, member)) continue;
      const challenge = state.challengeList.find(value => value?.challenge_id === receipt.id);
      if (challenge?.optedIn === true && receipt.state === 'unknown') receipt.state = 'already';
      else if (challenge?.optedIn === false && receipt.state === 'unknown') signupReceipts.delete(key);
    }
    syncSignupButtons();
  }
  async function submitSignup(ctx, token, challengeId, member) {
    const headers = await loyaltyAuthHeaders(ctx);
    same(ctx, token);
    const key = signupKey(ctx, member, challengeId);
    const receipt = { id: challengeId, scope: signupScope(ctx, member), state: 'pending' };
    signupReceipts.set(key, receipt); syncSignupButtons();
    let response, body;
    try {
      response = await fetch('/api/ajo-loyalty?' + new URLSearchParams({ sandbox: ctx.sandbox }), {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, signal: aborter.signal,
        body: JSON.stringify({ action: 'signup', profile_id: member, challenge_id: challengeId,
          region: ctx.region || 'va7', test: false, confirmed: true }),
      });
      body = await response.json();
    } catch {
      receipt.state = 'unknown';
      console.error('Loyalty signup response not confirmed', { status: response?.status ?? null,
        error: 'Response unavailable or unreadable; read member state before another attempt.' });
      throw new Error('Unable to join challenge: outcome unknown. Get task status before another attempt; no automatic retry.');
    }
    const duplicate = response.status === 409 && body?.signup_submitted === true && body.platform_status === 409;
    if ((response.status === 200 && body?.ok === true && body.accepted === true &&
        body.platform_status === 200 && body.challenge_id === challengeId) || duplicate) {
      receipt.state = duplicate ? 'already' : 'joined';
      return { result: body, receipt };
    }
    const unknown = response.ok || body?.signup_outcome_unknown === true ||
      response.status >= 500 && body?.signup_submitted !== false && body?.signup_outcome_unknown !== false;
    if (unknown) receipt.state = 'unknown';
    else signupReceipts.delete(key);
    console.error('Loyalty signup failed', { status: response.status, body });
    throw new Error('Unable to join challenge' + (unknown ?
      ': outcome unknown. Get task status before another attempt; no automatic retry.' : '. ' + (body?.error || 'Adobe rejected the request.')));
  }
  async function refreshSignupState(ctx, token, challengeId, member) {
    const state = await loyalty(ctx, { action: 'profile_state', profile_id: member,
      region: ctx.region || 'va7', test: 'false' });
    same(ctx, token);
    if (!Array.isArray(state?.challengeList)) throw new Error('Malformed Loyalty state: challengeList is missing.');
    const stateContext = { ...ctx, participation: 'active', test: false };
    reconcileSignupState(state, stateContext, member);
    if (!ctx.test && ctx.participation === 'active') {
      const metadata = await readChallengeMetadata(state, ctx, token);
      renderTasks(state, metadata, stateContext, true);
    }
    $('loyaltyUpdated').textContent = 'Read ' + new Date().toLocaleTimeString();
    $('loyaltyNamespace').textContent = 'State member: loyaltyId / ' + member;
    return state;
  }
  async function joinChallenge(candidate, captured, button, ctx, token) {
    const contentCardMeta = candidate.meta, challengeId = contentCardMeta.challengeId;
    if (typeof challengeId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(challengeId)) {
      throw new Error('Unable to join challenge: the delivered card has no valid meta.challengeId. No signup submitted.');
    }
    if (!loaded.profileLoyaltyId) throw new Error('Unable to join challenge: the loaded profile has no Loyalty ID.');
    if (!loaded.rows.some(row => /^(xdm:)?testProfile$/.test(row.path) && global.TuiDecisioningProfile.scalar(row) === true)) {
      throw new Error('Unable to join challenge: only AEP test profiles can join.');
    }
    const member = loaded.profileLoyaltyId;
    if (signupReceipts.has(signupKey(ctx, member, challengeId))) {
      message('Signup already submitted. Get task status before another attempt.'); return;
    }
    const { result, receipt } = await submitSignup(ctx, token, challengeId, member);
    same(ctx, token);
    deliveredChallenge = { id: challengeId, title: candidate.content.title?.content || 'Your challenge' };
    joinedChallenge = { ...deliveredChallenge, confirmed: true };
    purchaseReceipts.clear(); renderPartnerOffers(); renderPendingChallenge(); syncSignupButtons();
    const evidence = { sandbox: ctx.sandbox, signup: result, enrollmentVerified: true,
      journeyEntryVerified: false, proposition: candidate.proposition,
      renderedConsequence: candidate.consequenceId, interactionAccepted: false };
    const warnings = [];
    try {
      if (global.alloy !== captured.alloy ||
          JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides()) !== JSON.stringify(captured.edgeOptions)) {
        throw new Error('Card tracking context changed.');
      }
      const interaction = tracking(candidate, captured, ctx, 'interact', button);
      await captured.alloy('sendEvent', interaction);
      same(ctx, token); evidence.interaction = interaction; evidence.interactionAccepted = true;
    } catch (error) {
      warnings.push('Card interaction tracking was not confirmed. Do not join again to retry tracking.');
      console.error('Loyalty card interaction tracking failed', { error: error.message });
    }
    same(ctx, token);
    try { evidence.state = await refreshSignupState(ctx, token, challengeId, member); }
    catch (error) { warnings.push('Task state could not be refreshed: ' + error.message); }
    same(ctx, token);
    $('loyaltyEvidence').textContent = JSON.stringify(evidence, null, 2);
    message((receipt.state === 'already' ? 'Challenge Already Joined.' : 'Challenge Joined.') +
      ' Journey entry is not verified. ' + warnings.join(' '), warnings.length > 0);
  }
  function memberId(ctx, config) {
    if (!config || typeof config.namespace !== 'string' || !config.namespace.trim()) throw new Error('Adobe Loyalty has not reported its member namespace.');
    if (ctx.member) return ctx.member;
    if (config.namespace.toLowerCase() === ctx.namespace) return ctx.identifier;
    if (config.namespace.toLowerCase() === 'ecid' && typeof loaded.ecid === 'string' && loaded.ecid) return loaded.ecid;
    if (config.namespace.toLowerCase() === 'loyaltyid' && loaded.profileLoyaltyId) return loaded.profileLoyaltyId;
    throw new Error('Loyalty uses namespace "' + config.namespace + '". Enter this profile\'s member identifier in that namespace; it cannot be inferred from ' + ctx.namespace + '.');
  }
  async function readChallengeMetadata(state, ctx, token, filter = ctx.challenge) {
    const ids = [...new Set(state.challengeList.filter(challenge => challenge &&
      (!filter || challenge.challenge_id === filter) && (filter || !stateChallengeName(challenge)))
      .map(challenge => challenge.challenge_id))];
    const entries = await Promise.all(ids.map(async id => {
      try {
        const definition = await loyalty(ctx, { action: 'challenge_get', challenge_id: id });
        const returnedIds = [definition?._id, definition?.get_id, definition?.challenge_id].filter(value => value != null);
        if (!returnedIds.length || returnedIds.some(value => value !== id)) {
          throw new Error('Adobe challenge metadata does not match the requested challenge.');
        }
        if (typeof definition.name !== 'string' || !definition.name.trim()) {
          throw new Error('Adobe challenge metadata has no challenge name.');
        }
        return [id, { definition }];
      } catch (error) {
        same(ctx, token);
        console.error('Loyalty challenge metadata lookup failed', { challenge_id: id, error: error.message });
        return [id, { error: error.message }];
      }
    }));
    same(ctx, token);
    return new Map(entries);
  }
  async function readTasks(ctx, token, resolvedMember = false) {
    if (ctx.participation === 'complete' && ctx.test) throw new Error('Adobe\'s completed-challenges endpoint does not support State API test mode. Turn test mode off or select Active.');
    const config = await loyalty(ctx, { action: 'config' }); same(ctx, token);
    const member = memberId(resolvedMember ? { ...ctx, member: '' } : ctx, config);
    $('loyaltyNamespace').textContent = 'State member: ' + config.namespace + ' / ' + member;
    const region = ctx.region ? { region: ctx.region } : {};
    const input = ctx.participation === 'complete'
      ? { action: 'profile_challenges', profile_id: member, ...region, state: 'complete' }
      : { action: 'profile_state', profile_id: member, ...region, ...(ctx.challenge ? { challenge_id: ctx.challenge } : {}), test: String(ctx.test) };
    const state = await loyalty(ctx, input); same(ctx, token);
    if (!Array.isArray(state?.challengeList)) throw new Error('Malformed Loyalty state: challengeList is missing. This is not an empty member-state response.');
    reconcileSignupState(state, ctx, member);
    const metadata = await readChallengeMetadata(state, ctx, token);
    renderTasks(state, metadata, ctx, config.namespace.toLowerCase() === 'loyaltyid' && member === loaded.profileLoyaltyId);
    $('loyaltyUpdated').textContent = 'Read ' + new Date().toLocaleTimeString();
    $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, namespace: config.namespace,
      member, region: ctx.region || 'va7', state, metadata: Object.fromEntries(metadata) }, null, 2);
    return state;
  }
  function renderTasks(state, metadata, ctx, selectedMember) {
    const fragment = document.createDocumentFragment(), phone = document.createDocumentFragment();
    const classified = model.classifyChallenges(state.challengeList.filter(challenge => !ctx.challenge || challenge.challenge_id === ctx.challenge));
    const challenges = classified.joinedChallenges;
    if (!challenges.length) {
      const empty = node('div', undefined, 'loyalty-empty');
      empty.append(node('b', 'No active challenges'), node('p', 'Join an available challenge to start tracking progress.'));
      phone.append(empty.cloneNode(true)); fragment.append(empty);
    }
    for (const challenge of challenges) {
      if (!challenge || typeof challenge !== 'object' || !Array.isArray(challenge.tasks)) throw new Error('Malformed challenge: tasks must be an array.');
      if (challenge.tasks.some(task => !task || typeof task !== 'object')) throw new Error('Malformed task in Loyalty state.');
      const { definition, error } = metadata.get(challenge.challenge_id) || {};
      const section = node('article', undefined, 'loyalty-challenge');
      section.dataset.challengeId = challenge.challenge_id;
      const name = stateChallengeName(challenge) || definition?.name.trim() || 'Challenge name unavailable';
      const completed = challenge.tasks.filter(complete).length, total = challenge.tasks.length;
      const summary = node('div', undefined, 'loyalty-progress-summary');
      const ring = node('div', undefined, 'loyalty-progress-ring');
      ring.setAttribute('role', 'img'); ring.setAttribute('aria-label', completed + ' of ' + total + ' tasks complete');
      ring.style.setProperty('--loyalty-progress', (total ? completed / total * 100 : 0) + '%');
      const title = node('div');
      const remaining = challenge.tasks.find(task => !complete(task));
      title.append(node('p', 'CHALLENGE PROGRESS', 'loyalty-eyebrow'),
        node('b', completed + ' / ' + total, 'loyalty-progress-count'),
        node('span', 'tasks complete', 'loyalty-progress-caption'), node('h3', name),
        node('p', !total ? 'No tasks reported' : remaining ? 'Remaining: ' + (remaining.taskName || remaining.taskId || 'Unnamed task') : 'All returned tasks complete', 'loyalty-next-task'));
      summary.append(ring, title); section.append(summary);
      const mobile = node('article', undefined, 'loyalty-phone-challenge');
      const mobileTop = node('div', undefined, 'loyalty-phone-challenge-top');
      mobileTop.append(node('h4', name), node('span', completedState(challenge.state) ? 'Completed' : repr(challenge.state), 'loyalty-task-state'));
      mobile.append(mobileTop, node('p', completed + ' / ' + total + ' tasks complete', 'loyalty-phone-count'));
      if (error) {
        const warning = node('p', 'Challenge details unavailable: ' + error, 'loyalty-empty');
        warning.setAttribute('role', 'status');
        section.append(warning); mobile.append(warning.cloneNode(true));
      }
      if (total) {
        const meter = node('progress'); meter.max = total; meter.value = completed;
        meter.setAttribute('aria-label', name + ' completed tasks'); mobile.append(meter);
      }
      const diagnostic = challengeDetails(challenge, name, definition);
      if (Array.isArray(challenge.challengeCompletions)) diagnostic.append(node('small', 'Previous challenge completions: ' + challenge.challengeCompletions.length));
      for (const [index, task] of challenge.tasks.entries()) {
        const definitionTask = definition?.tasks?.find(item => (item.taskId || item._id) === task.taskId);
        const card = node('div', undefined, 'loyalty-task'), heading = node('div', undefined, 'loyalty-task-heading');
        const taskName = task.taskName || definitionTask?.taskName || definitionTask?.name || task.taskId || 'Unnamed task';
        card.dataset.complete = String(complete(task));
        card.dataset.current = String(task === remaining);
        const step = node('span', complete(task) ? '\u2713' : index + 1, 'loyalty-step-number');
        step.setAttribute('aria-hidden', 'true');
        const initialsText = taskName.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
        const logo = node('span', initialsText, 'loyalty-task-logo'); logo.setAttribute('aria-hidden', 'true');
        const progress = model.progress(task), taskCopy = node('div', undefined, 'loyalty-task-copy');
        taskCopy.append(node('strong', taskName),
          node('small', progress ? progress.value + ' of ' + progress.goal :
            complete(task) ? 'Completion reported by Adobe' : 'Progress not yet reported'));
        heading.append(step, logo, taskCopy,
          node('span', complete(task) ? 'Completed' : task === remaining ? 'Up next' : 'To do', 'loyalty-task-state'));
        card.append(heading);
        if (progress) {
          const meter = node('progress'); meter.max = progress.goal; meter.value = Math.max(0, Math.min(progress.value, progress.goal));
          meter.setAttribute('aria-label', (task.taskName || task.taskId) + ' progress');
          card.append(meter);
        }
        section.append(card);
        const row = node('div', undefined, 'loyalty-phone-task');
        row.dataset.complete = String(complete(task));
        const initials = node('span', initialsText, 'loyalty-phone-task-icon');
        initials.setAttribute('aria-hidden', 'true');
        const text = node('div'); text.append(node('b', taskName), node('span', complete(task) ? 'Completed' : repr(task.taskState)));
        row.append(initials, text);
        if (complete(task)) row.append(node('span', '\u2713', 'loyalty-phone-tick'));
        mobile.append(row);
      }
      const outcome = node('div', undefined, 'loyalty-outcome');
      outcome.dataset.complete = String(completedState(challenge.state));
      const remainingCount = total - completed;
      outcome.append(node('b', completedState(challenge.state) ? 'Challenge completed' :
        !total ? 'No tasks reported' : remaining ? remainingCount + (remainingCount === 1 ? ' task remaining' : ' tasks remaining') : 'All returned tasks complete'),
        node('span', 'Task completion is reported by Adobe. Reward delivery is not verified by this page.'));
      section.append(outcome, diagnostic); phone.append(mobile);
      fragment.append(section);
    }
    memberChallenges = selectedMember ? challenges : [];
    restoreParticipation();
    if (state._links?.next) fragment.append(node('p', 'Adobe returned a next-page link. Showing only the challenges in this response; this is not the full history.'));
    $('loyaltyTasks').replaceChildren(fragment);
    if (state._links?.next) phone.append(node('p', 'More challenges are available. This response is not the full history.'));
    $('loyaltyPhoneTasks').replaceChildren(phone);
    renderAvailableChallenges(classified.availableChallenges, classified.unknownChallenges, metadata, ctx, selectedMember);
  }
  function challengeDetails(challenge, name, definition) {
    const details = node('details', undefined, 'loyalty-task-details');
    details.append(node('summary', 'Challenge API details'), node('small', 'Challenge ID: ' + challenge.challenge_id),
      node('small', 'Challenge name: ' + name), node('small', 'State: ' + repr(challenge.state)),
      node('small', 'Opted in: ' + repr(challenge.optedIn)), node('small', 'Required tasks: ' + repr(challenge.tasksToComplete)));
    for (const key of Object.keys(challenge).filter(key => key.startsWith('accum'))) {
      details.append(node('small', key + ': ' + repr(challenge[key])));
    }
    for (const task of challenge.tasks) {
      const definitionTask = definition?.tasks?.find(item => (item.taskId || item._id) === task.taskId);
      const entry = node('div');
      entry.append(node('b', task.taskName || task.taskId || 'Task name not reported'),
        node('small', 'Task ID: ' + repr(task.taskId)),
        node('small', 'Task type: ' + repr(task.taskType || task.taskClass || definitionTask?.taskType || definitionTask?.taskClass)),
        node('small', 'Task state: ' + repr(task.taskState)), node('small', 'Variables: ' + repr(task.variables)));
      if (task.accumulators != null) entry.append(node('small', 'Accumulators: ' + repr(task.accumulators)));
      if (Array.isArray(task.taskCompletions)) entry.append(node('small', 'Completion history: ' + repr(task.taskCompletions)));
      details.append(entry);
    }
    return details;
  }
  function renderAvailableChallenges(challenges, unknown, metadata, ctx, selectedMember) {
    for (const mount of [$('loyaltyAvailable'), $('loyaltyPhoneAvailable')]) {
      const previous = new Map([...mount.children].filter(card => card.dataset.challengeId)
        .map(card => [card.dataset.challengeId, card]));
      const fragment = document.createDocumentFragment();
      for (const challenge of challenges) {
        const card = previous.get(challenge.challenge_id) || node('article', undefined, 'loyalty-available-card');
        card.dataset.challengeId = challenge.challenge_id; card.replaceChildren();
        const { definition, error } = metadata.get(challenge.challenge_id) || {};
        const name = stateChallengeName(challenge) || definition?.name.trim() || 'Challenge name unavailable';
        card.append(node('p', 'AVAILABLE CHALLENGE', 'loyalty-eyebrow'), node('h3', name));
        const description = [challenge.desc, definition?.desc].find(value => typeof value === 'string' && value.trim())?.trim();
        if (description) card.append(node('p', description));
        const summary = model.getChallengeSummary(challenge);
        if (summary && summary !== description) card.append(node('p', summary));
        const facts = node('div', undefined, 'loyalty-available-facts');
        if (challenge.state) facts.append(node('span', 'State: ' + challenge.state));
        if (challenge.tasksReported) facts.append(node('span', challenge.tasks.length + (challenge.tasks.length === 1 ? ' task' : ' tasks')));
        for (const [key, label] of [['startDate', 'Available from'], ['endDate', 'Available until']]) {
          const value = challenge[key];
          if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
            facts.append(node('span', label + ': ' + new Date(value).toLocaleDateString('en-GB')));
          }
        }
        const reward = challenge.reward || definition?.reward;
        const denomination = reward?.rewardDefinition?.denomination || reward?.definition;
        if (['string', 'number'].includes(typeof reward?.rewardValue) && String(reward.rewardValue).trim() &&
            typeof denomination === 'string' && denomination.trim()) {
          facts.append(node('span', 'Reward: ' + reward.rewardValue + ' ' + denomination));
        }
        card.append(facts);
        const button = node('button', 'Join challenge', 'loyalty-available-join'); button.type = 'button';
        button.dataset.availableJoin = challenge.challenge_id;
        button.dataset.selectedMember = String(selectedMember);
        button.addEventListener('click', () => void work(async (current, token) => {
          same(ctx, token); await joinAvailableChallenge(challenge.challenge_id, current, token);
        }));
        const status = node('p', availableMessages.get(signupKey(ctx, loaded?.profileLoyaltyId, challenge.challenge_id)) ||
          (selectedMember ? '' : 'Resolve the current Loyalty member to join this challenge.'), 'loyalty-available-status');
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        if (error) status.textContent = 'Challenge details unavailable: ' + error;
        card.append(button, status, challengeDetails(challenge, name, definition)); fragment.append(card);
      }
      if (!challenges.length) fragment.append(node('p', 'No available challenges returned.', 'loyalty-empty'));
      if (unknown.length) {
        const warning = node('div', undefined, 'loyalty-empty');
        warning.append(node('p', 'Adobe did not report participation for ' + unknown.length +
          (unknown.length === 1 ? ' challenge. It is' : ' challenges. They are') + ' not classified as joined or available.'));
        unknown.forEach(challenge => warning.append(challengeDetails(challenge, stateChallengeName(challenge) || 'Not reported')));
        fragment.append(warning);
      }
      mount.replaceChildren(fragment);
    }
    syncSignupButtons();
  }
  async function joinAvailableChallenge(challengeId, ctx, token) {
    const member = loaded?.profileLoyaltyId, key = signupKey(ctx, member, challengeId);
    const report = text => {
      availableMessages.set(key, text);
      document.querySelectorAll('.loyalty-available-card').forEach(card => {
        if (card.dataset.challengeId === challengeId) card.querySelector('.loyalty-available-status').textContent = text;
      });
    };
    try {
      if (!member) throw new Error('Unable to join challenge: the loaded profile has no Loyalty ID.');
      if (!loaded.rows.some(row => /^(xdm:)?testProfile$/.test(row.path) && global.TuiDecisioningProfile.scalar(row) === true)) {
        throw new Error('Unable to join challenge: only AEP test profiles can join.');
      }
      const existing = signupReceipts.get(key);
      if (!existing) {
        report('Joining challenge...');
        await submitSignup(ctx, token, challengeId, member);
      }
      same(ctx, token);
      report('Checking participation with Adobe...');
      const state = await readTasks(ctx, token, true);
      same(ctx, token);
      if (model.classifyChallenges(state.challengeList).joinedChallenges.some(challenge => challenge.challenge_id === challengeId)) {
        availableMessages.delete(key);
        message('Challenge participation confirmed by Adobe.');
      } else {
        report('Adobe has not confirmed participation. Check challenge status before another signup.');
        message('Signup outcome not yet confirmed by Adobe state. No automatic retry.', true);
      }
    } catch (error) {
      same(ctx, token);
      console.error('Available challenge signup failed', error);
      report(error.message); throw error;
    } finally { syncSignupButtons(); }
  }
  function restoreParticipation() {
    const challenge = deliveredChallenge && memberChallenges.find(value =>
      value.challenge_id === deliveredChallenge.id && value.optedIn === true);
    const receipt = deliveredChallenge && signupReceipts.get(signupKey(context(), loaded?.profileLoyaltyId, deliveredChallenge.id));
    const confirmedSignup = receipt && ['joined', 'already'].includes(receipt.state);
    if (joinedChallenge && (joinedChallenge.id !== deliveredChallenge?.id || joinedChallenge.confirmed && !challenge && !confirmedSignup)) {
      joinedChallenge = null; purchaseReceipts.clear(); closeOffer(false);
      $('loyaltyPartnerOffers').replaceChildren(); $('loyaltyPartnerOffers').hidden = true;
      if ($('loyaltyTasks').querySelector('.loyalty-pending-progress')) {
        $('loyaltyTasks').replaceChildren(node('p', 'Join a challenge to see its offers.', 'loyalty-empty'));
      }
    }
    if (challenge || confirmedSignup) joinedChallenge = { ...deliveredChallenge, confirmed: true };
    if (challenge && !receipt) signupReceipts.set(signupKey(context(), loaded?.profileLoyaltyId, deliveredChallenge.id),
      { id: deliveredChallenge.id, scope: signupScope(context(), loaded?.profileLoyaltyId), state: 'already' });
    if (joinedChallenge) renderPartnerOffers();
    syncSignupButtons();
  }
  function renderPendingChallenge() {
    if (!memberChallenges.some(challenge => challenge.challenge_id === joinedChallenge?.id && challenge.optedIn === true)) return;
    if ($('loyaltyTasks').querySelector('.loyalty-challenge:not(.loyalty-pending-progress)')) return;
    const section = node('article', undefined, 'loyalty-challenge loyalty-pending-progress');
    const summary = node('div', undefined, 'loyalty-progress-summary');
    const ring = node('div', undefined, 'loyalty-progress-ring');
    ring.setAttribute('role', 'img'); ring.setAttribute('aria-label', 'Awaiting Adobe task progress');
    const title = node('div');
    title.append(node('p', 'YOUR CHALLENGE', 'loyalty-eyebrow'),
      node('b', '\u2014', 'loyalty-progress-count'),
      node('span', 'Live status', 'loyalty-progress-caption'), node('h3', joinedChallenge.title),
      node('p', 'Enrollment confirmed. Awaiting Adobe task progress.', 'loyalty-next-task'));
    summary.append(ring, title); section.append(summary);
    for (const [index, offer] of model.partnerOffers.entries()) {
      const row = node('div', undefined, 'loyalty-offer-step');
      row.dataset.partner = offer.key;
      const text = node('div');
      text.append(node('strong', offer.title), node('small', offer.description));
      row.append(node('span', index + 1, 'loyalty-step-number'),
        node('span', offer.initials, 'loyalty-task-logo'), text, node('span', 'Not verified', 'loyalty-task-state'));
      section.append(row);
    }
    const outcome = node('div', undefined, 'loyalty-outcome');
    outcome.append(node('b', 'Ready when you are'), node('span', 'View the offers on your phone. Get task status for live progress.'));
    section.append(outcome); $('loyaltyTasks').replaceChildren(section);
  }
  function renderPartnerOffers() {
    const section = $('loyaltyPartnerOffers');
    section.hidden = false; section.replaceChildren();
    section.dataset.challengeId = joinedChallenge.id;
    section.append(node('h4', joinedChallenge.title),
      node('p', joinedChallenge.confirmed ? 'Participation confirmed by Adobe.' :
        'Get task status to confirm enrollment.', 'loyalty-phone-count'));
    for (const offer of model.partnerOffers) {
      const row = node('div', undefined, 'loyalty-phone-task loyalty-partner-task');
      row.dataset.partner = offer.key;
      const text = node('div');
      text.append(node('b', offer.title), node('span', offer.description));
      if (purchaseReceipts.has(offer.key)) text.append(node('span', 'Event sent; progress not verified.'));
      const button = node('button', offer.label, 'loyalty-offer-button'); button.type = 'button';
      button.dataset.loyaltyPurchase = offer.key; button.disabled = busy || !loaded;
      button.setAttribute('aria-label', 'View ' + offer.brand + ' offer and send demo purchase');
      button.addEventListener('click', () => void work((ctx, token) => sendPurchase(offer, button, ctx, token)));
      row.append(node('span', offer.initials, 'loyalty-phone-task-icon'), text, button);
      section.append(row);
    }
    const details = node('details', undefined, 'loyalty-task-details');
    details.append(node('summary', 'About these offers'),
      node('small', 'Offer views send demo purchase events. Only Adobe task status confirms completion.'));
    section.append(details);
  }
  function closeOffer(restoreFocus = true) {
    $('loyaltyOfferSheet').hidden = true;
    if (restoreFocus && offerFocus?.isConnected) offerFocus.focus();
    offerFocus = null;
  }
  let detailFocus = null;
  function closeOfferDetail(restoreFocus = true) {
    $('loyaltyDecisionOfferSheet').hidden = true;
    if (restoreFocus && detailFocus?.isConnected) detailFocus.focus();
    detailFocus = null;
  }
  function openOfferDetail(offer) {
    if (!offer) return;
    const overlay = $('loyaltyDecisionOfferSheet'), sheet = node('div', undefined, 'loyalty-offer-sheet');
    detailFocus = document.activeElement;
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'loyaltyDecisionOfferTitle');
    const close = node('button', '\u00d7', 'loyalty-offer-close'); close.type = 'button';
    close.setAttribute('aria-label', 'Close offer'); close.addEventListener('click', () => closeOfferDetail());
    const hero = node('div', undefined, 'loyalty-offer-hero');
    const title = node('h3', offer.detailTitle || offer.title); title.id = 'loyaltyDecisionOfferTitle';
    hero.append(close, node('span', offer.merchant, 'loyalty-eyebrow'), title);
    const body = node('div', undefined, 'loyalty-offer-body');
    const imageUrl = safeUrl(offer.image);
    if (imageUrl) {
      const image = node('img'); image.src = imageUrl; image.alt = offer.merchant + ' offer';
      body.append(image);
    }
    for (const value of [offer.detailSubtitle, offer.detailDescription]) {
      if (typeof value === 'string' && value.trim()) body.append(node('p', value));
    }
    if (offer.expiry) body.append(node('p', 'Expires: ' + offer.expiry));
    if (offer.cta) body.append(node('small', offer.cta));
    body.append(node('p', 'Use + on the carousel to send a demo purchase. Viewing this offer sends no purchase event.'));
    sheet.append(hero, body); overlay.replaceChildren(sheet); overlay.hidden = false; close.focus();
    overlay.onclick = event => { if (event.target === overlay) closeOfferDetail(); };
    overlay.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeOfferDetail(); }
      if (event.key === 'Tab') { event.preventDefault(); close.focus(); }
    };
    // Future decisioning.propositionInteract integration uses this offer's original proposition metadata.
  }
  function openOffer(offer, button, purchaseId) {
    const overlay = $('loyaltyOfferSheet'), sheet = node('div', undefined, 'loyalty-offer-sheet');
    offerFocus = button;
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'loyaltyOfferTitle');
    const close = node('button', '\u00d7', 'loyalty-offer-close'); close.type = 'button';
    close.setAttribute('aria-label', 'Close offer'); close.addEventListener('click', () => closeOffer());
    const hero = node('div', undefined, 'loyalty-offer-hero');
    hero.append(close, node('span', offer.brand, 'loyalty-eyebrow'), node('h3', offer.headline));
    const body = node('div', undefined, 'loyalty-offer-body');
    const title = node('h4', offer.title); title.id = 'loyaltyOfferTitle';
    const done = node('button', 'Done', 'loyalty-offer-button'); done.type = 'button';
    done.addEventListener('click', () => closeOffer());
    body.append(title, node('p', offer.detail),
      node('p', 'Demo purchase event accepted. This does not activate a real offer, create a gym account or confirm challenge progress.'),
      node('small', 'Purchase ID: ' + purchaseId), done);
    sheet.append(hero, body); overlay.replaceChildren(sheet); overlay.hidden = false; close.focus();
    overlay.onclick = event => { if (event.target === overlay) closeOffer(); };
    overlay.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeOffer(); }
      if (event.key === 'Tab') {
        event.preventDefault(); (document.activeElement === close ? done : close).focus();
      }
    };
  }
  async function sendPurchase(offer, button, ctx, token) {
    closeConfiguration();
    if (!joinedChallenge) throw new Error('Join the delivered challenge before viewing its partner offers. No purchase event sent.');
    const captured = await prepareProfileEvent(ctx, token, 'commerce.purchases', true);
    const purchaseID = global.crypto.randomUUID();
    const payload = purchasePayload(captured, offer.sku, offer.productName, offer.amount, purchaseID);
    await dispatchProfileEvent(captured, payload, ctx, token);
    purchaseReceipts.set(offer.key, purchaseID);
    renderPartnerOffers();
    const currentButton = $('loyaltyPartnerOffers').querySelector('[data-loyalty-purchase="' + offer.key + '"]');
    openOffer(offer, currentButton || button, purchaseID);
    message(offer.brand + ' purchase event accepted by Web SDK. Get task status for Adobe-confirmed progress.');
  }
  function purchasePayload(captured, sku, name, amount, purchaseID = global.crypto.randomUUID()) {
    return { ...captured.edgeOptions, renderDecisions: false,
      personalization: { defaultPersonalizationEnabled: false },
      xdm: { _id: global.crypto.randomUUID(), timestamp: new Date().toISOString(),
        eventType: 'commerce.purchases', identityMap: captured.identityMap,
        commerce: { purchases: { value: 1 }, order: { purchaseID, priceTotal: amount, currencyCode: 'GBP' } },
        productListItems: [{ SKU: sku, name, quantity: 1, priceTotal: amount, currencyCode: 'GBP' }],
        ...captured.eventXdm } };
  }
  async function sendOfferPurchase(offer, button) {
    if (button.getAttribute('aria-busy') === 'true' || activatedOffers.has(offer?.id)) return;
    try {
      if (!loaded) throw new Error('Look up a test profile before sending a purchase.');
      if (!offer || typeof offer.sku !== 'string' || !offer.sku.trim()) {
        throw new Error('This decision item has no SKU. No purchase sent.');
      }
      if (busy) throw new Error('Another request is in progress. Wait before sending a purchase.');
      button.disabled = true; button.setAttribute('aria-busy', 'true');
      let accepted = false, failureReported = false;
      await work(async (ctx, token) => {
        try {
          closeConfiguration();
          const captured = await prepareProfileEvent(ctx, token, 'commerce.purchases', true);
          const payload = purchasePayload(captured, offer.sku, offer.merchant + ' Offer', 10);
          console.log('[Rewards] Sending challenge purchase event', {
            offerId: offer.id, merchant: offer.merchant, sku: offer.sku,
          });
          const result = await dispatchProfileEvent(captured, payload, ctx, token);
          console.log('[Rewards] Challenge purchase event sent', {
            offerId: offer.id, merchant: offer.merchant, sku: offer.sku, eventType: 'commerce.purchases', result,
          });
          accepted = true; activatedOffers.set(offer.id, offer); renderSavedOffers();
          phoneToast('Purchase sent for ' + offer.merchant + '. Accepted for processing; challenge progress is not verified.');
          message('Purchase accepted for processing. Get task status to check Adobe Loyalty progress.');
          // Future proposition interaction tracking is separate from this commerce event.
        } catch (error) {
          failureReported = true;
          console.error('[Rewards] Challenge purchase event failed', error);
          phoneToast('Purchase not confirmed. ' + error.message); throw error;
        }
      });
      if (!accepted && !failureReported) {
        const error = new Error($('loyaltyStatus').textContent);
        console.error('[Rewards] Challenge purchase event failed', error);
        phoneToast('Purchase not confirmed. ' + error.message);
      }
    } catch (error) {
      console.error('[Rewards] Challenge purchase event failed', error);
      phoneToast('Purchase not sent. ' + error.message); message(error.message, true);
    } finally {
      button.removeAttribute('aria-busy'); renderSavedOffers();
    }
  }
  async function work(operation) {
    if (busy) return;
    busy = true; aborter = new AbortController();
    const controller = aborter, ctx = context(), token = version;
    const timeout = setTimeout(() => controller.abort(new Error(
      'Request timed out after 120 seconds. Any submitted Adobe operation may still finish; inspect its state before retrying.'
    )), 120000);
    let onAbort;
    const cancelled = new Promise((resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    message('Loading...');
    // Aborting fetch alone cannot release queued SDK commands or shared drawer promises.
    try { return await Promise.race([operation(ctx, token), cancelled]); }
    catch (error) {
      if (token === version) {
        autoBlocked = true; $('loyaltyUpdated').textContent = 'Refresh failed / previous state may be stale';
        message(error.message + ' No automatic retry.', true);
        if (controller.signal.aborted) { version++; cardSubscription = null; pendingCard = false; pendingFeaturedRequest = false; pendingTaskState = false; }
      }
    } finally {
      controller.signal.removeEventListener('abort', onAbort);
      clearTimeout(timeout); busy = false; message($('loyaltyStatus').textContent, $('loyaltyStatus').dataset.error === 'true');
      if (pendingProfile) {
        const detail = pendingProfile; pendingProfile = null;
        adoptDrawerProfile(detail);
      }
      if (pendingTaskState) { pendingTaskState = false; requestAutomaticTaskState(); }
      else if (pendingFeaturedRequest) { pendingFeaturedRequest = false; void requestFeaturedOffers(); }
      else if (pendingCard) { pendingCard = false; requestAutomaticCard(); }
    }
  }
  function adoptDrawerProfile(detail) {
    const ctx = context();
    if (loaded || !detail?.found || !global.DemoProfileDrawer.getLastLookedUpProfile() ||
        detail.identifier !== ctx.identifier || String(detail.namespace).toLowerCase() !== ctx.namespace) return;
    if (busy) { pendingProfile = detail; return; }
    void work((current, token) => lookup(current, token, true));
  }
  function requestAutomaticTaskState() {
    if (!loaded?.profileLoyaltyId) return;
    if (automaticTaskState?.profile === loaded && automaticTaskState.token === version) return;
    if (busy) { pendingTaskState = true; return; }
    automaticTaskState = { profile: loaded, token: version };
    void work(async (ctx, token) => {
      await readTasks(ctx, token, true);
      autoBlocked = false;
      message('Existing challenge participation read from Adobe. No signup was submitted.');
    });
  }
  function requestAutomaticCard() {
    if (!loaded || typeof global.alloy !== 'function') return;
    if (busy) { pendingCard = true; return; }
    void work(run);
  }
  async function requestFeaturedOffers() {
    if (!loaded) {
      console.error('[Rewards] featured-offers request requires a loaded test profile');
      message('Look up a test profile before requesting Featured Offers.', true); return;
    }
    if (busy) { pendingFeaturedRequest = true; return; }
    return work((ctx, token) => fetchFeaturedOffers(ctx, token));
  }
  async function fetchFeaturedOffers(ctx, token, refresh = false) {
      const captured = await prepareProfileEvent(ctx, token, 'featured-offers decision');
      same(ctx, token);
      if (global.alloy !== captured.alloy ||
          JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides()) !== captured.edgeSnapshot) {
        throw new Error('SDK or datastream changed while preparing Featured Offers. No request sent.');
      }
      const key = JSON.stringify([ctx.sandbox, ctx.namespace, ctx.identifier, ctx.tenant,
        captured.identityMap, captured.edgeOptions]);
      if (!refresh && featuredRequest?.key === key && featuredRequest.alloy === captured.alloy) {
        console.log('[Rewards] featured-offers request already submitted for this profile context');
        message('Featured Offers already requested for this profile context. No duplicate request sent.');
        return featuredRequest.result;
      }
      // Reserve before submission: repeated profile-ready notifications cannot replay an uncertain request.
      const request = { key, alloy: captured.alloy };
      featuredRequest = request;
      message('Requesting Featured Offers from Adobe...');
      let result;
      try {
        result = await captured.alloy('sendEvent', {
          ...captured.edgeOptions, renderDecisions: false,
          personalization: { surfaces: ['web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers'] },
          xdm: { ...captured.eventXdm, identityMap: captured.identityMap,
            web: { webPageDetails: { URL: location.origin + location.pathname, name: viewName, viewName } } },
        });
        window.dispatchEvent(
          new CustomEvent("ajo:featured-offers-response", {
            detail: result
          })
        );
        console.log(
          "[Rewards] featured-offers-response dispatched",
          result
        );
      } catch (error) {
        console.error('[Rewards] featured-offers Web SDK request failed', error);
        throw error;
      }
      console.log('[Rewards] featured-offers Web SDK response', result);
      console.log('[Rewards] featured-offers propositions', result?.propositions);
      same(ctx, token);
      request.result = result;
      message('Featured Offers request completed. Data Collection processes the response and dispatches ajo:featured-offers.');
      return result;
  }
  async function refreshContentAndOffers(ctx, token) {
    await run(ctx, token);
    same(ctx, token);
    const cardStatus = $('loyaltyStatus').textContent;
    // Explicit refresh alone bypasses automatic same-profile request deduplication.
    await fetchFeaturedOffers(ctx, token, true);
    message(cardStatus + ' Featured Offers response refreshed; Data Collection processes the offers.');
  }
  global.requestFeaturedOffers = requestFeaturedOffers;
  async function lookup(ctx, token, drawerReady = false) {
    loaded = null; clearResults();
    if (!drawerReady) global.DemoProfileDrawer.clearDrawerVisitorState();
    publish();
    if (!ctx.sandbox || !ctx.identifier) throw new Error('Select a sandbox and enter a profile identifier.');
    const data = await json('/api/profile/table?' + new URLSearchParams({ sandbox: ctx.sandbox, namespace: ctx.namespace, identifier: ctx.identifier }));
    same(ctx, token);
    if (data.found !== true || !Array.isArray(data.rows)) throw new Error('No profile found.');
    data.profileLoyaltyId = global.TuiDecisioningProfile.signals(data.rows).loyaltyId;
    if (!drawerReady) {
      let drawerError = '';
      const drawerLoaded = await global.DemoProfileDrawer.loadProfileDataForDrawer(ctx.identifier, {
        updateMessage: false, sendApplicationLogin: false,
        onUserMessage: (text, type) => { if (type === 'error') drawerError = text; },
      });
      same(ctx, token);
      if (!drawerLoaded) throw new Error(drawerError || 'Profile drawer lookup was superseded or cancelled. Look up the current profile.');
    }
    loaded = data; publish(); autoBlocked = true;
    message('Profile loaded. Select Get task status to read Adobe Loyalty. SDK injection is only needed for content cards and journey events.');
    requestAutomaticCard();
  }
  async function prepareProfileEvent(ctx, token, eventType, requireLoyaltyId = false) {
    if (!loaded.rows.some(row => /^(xdm:)?testProfile$/.test(row.path) && global.TuiDecisioningProfile.scalar(row) === true)) {
      throw new Error('Only AEP test profiles can send ' + eventType + ', matching the TUI / Center Parcs demo.');
    }
    if (!/^_[A-Za-z][A-Za-z0-9]*$/.test(ctx.tenant) || ['_id', '_repo', '_experience', '_links'].includes(ctx.tenant)) {
      throw new Error('Configure the reviewed event tenant namespace in the top configuration bar before sending ' + eventType + '.');
    }
    if (typeof loaded.profileEmail !== 'string' || !loaded.profileEmail.includes('@')) {
      throw new Error('The loaded profile has no email identity for ' + eventType + '. No event sent.');
    }
    if (requireLoyaltyId && !loaded.profileLoyaltyId) throw new Error('The loaded profile has no Loyalty ID. No event sent.');
    if (!global.DemoTagsInjection?.ensureAlloyReady || !global.CdEdgeMounts?.buildIdentityMap ||
        typeof global.DemoLabEdgeConfig?.edgeConfigOverrides !== 'function') {
      throw new Error('Inject Tags with Web SDK and the lab datastream configuration before sending ' + eventType + '.');
    }
    const edgeOptions = global.DemoLabEdgeConfig.edgeConfigOverrides();
    const edgeSnapshot = JSON.stringify(edgeOptions), profileEmail = loaded.profileEmail,
      profileLoyaltyId = loaded.profileLoyaltyId;
    message('Preparing ' + eventType + ': connecting to Web SDK...');
    const alloy = await global.DemoTagsInjection.ensureAlloyReady({ timeoutMs: 30000, storagePrefix: prefix });
    same(ctx, token);
    const identity = await alloy('getIdentity', { namespaces: ['ECID'] });
    same(ctx, token);
    const ecid = identity?.identity?.ECID;
    if (typeof ecid !== 'string' || !/^\d{10,}$/.test(ecid)) {
      throw new Error('Active Web SDK browser ECID was not returned. No event sent.');
    }
    if (ctx.namespace === 'ecid' && ctx.identifier !== ecid) {
      throw new Error('The selected ECID differs from the active Web SDK visitor. No event sent.');
    }
    const identityMap = global.CdEdgeMounts.buildIdentityMap({ ecid }, ctx.identifier, ctx.namespace);
    if (requireLoyaltyId && !identityMap.Email) {
      identityMap.Email = [{ id: profileEmail, authenticatedState: 'authenticated', primary: false }];
    }
    if (profileLoyaltyId) {
      identityMap.loyaltyId = [{ id: profileLoyaltyId, ...(!requireLoyaltyId && { authenticatedState: 'authenticated' }), primary: false }];
    }
    return { alloy, identityMap, edgeOptions, edgeSnapshot,
      eventXdm: { [ctx.tenant]: { identification: { core: { ecid, email: profileEmail,
        ...(profileLoyaltyId && { loyaltyId: profileLoyaltyId }) } } } } };
  }
  async function dispatchProfileEvent(captured, payload, ctx, token) {
    same(ctx, token);
    if (JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides()) !== captured.edgeSnapshot) {
      throw new Error('Event datastream changed while preparing ' + payload.xdm.eventType + '. No event sent.');
    }
    message('Sending ' + payload.xdm.eventType + ' for the selected profile...');
    let result;
    try { result = await captured.alloy('sendEvent', payload); }
    catch (error) {
      throw new Error(payload.xdm.eventType + ' send was not confirmed: ' + error.message +
        '. The event may already have been ingested; check profile events before sending again.', { cause: error });
    }
    same(ctx, token);
    $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, event: payload, sdkAccepted: true,
      journeyEntryVerified: false }, null, 2);
    return result;
  }
  async function sendRewardsInterest(ctx, token) {
    try {
      if (!loaded) throw new Error('Look up a test profile before showing interest in Rewards.');
      const captured = await prepareProfileEvent(ctx, token, 'rewards.interest');
      const payload = { ...captured.edgeOptions,
        renderDecisions: false, personalization: { defaultPersonalizationEnabled: false },
        xdm: { ...captured.eventXdm, eventType: 'rewards.interest', timestamp: new Date().toISOString(),
          identityMap: captured.identityMap,
          web: { webPageDetails: { URL: location.origin + location.pathname, name: viewName, viewName } } } };
      await dispatchProfileEvent(captured, payload, ctx, token);
      console.log('[Rewards] rewards.interest event sent');
      message('rewards.interest accepted by Web SDK. Refreshing profile events...');
      try { await global.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile(); }
      catch (error) {
        throw new Error('rewards.interest was accepted by Web SDK, but the profile event refresh failed: ' +
          error.message + '. Do not resend to refresh the drawer. Audience membership is not verified.', { cause: error });
      }
      same(ctx, token);
      message('Rewards interest sent. Interested in Rewards audience membership is not yet verified.');
    } catch (error) {
      console.error('[Rewards] rewards.interest event failed', error);
      throw error;
    }
  }
  function tracking(candidate, captured, ctx, kind, button) {
    const proposition = candidate.proposition;
    return { ...captured.edgeOptions, renderDecisions: false, personalization: { defaultPersonalizationEnabled: false },
      xdm: { ...captured.eventXdm, identityMap: captured.identityMap,
        eventType: kind === 'display' ? 'decisioning.propositionDisplay' : 'decisioning.propositionInteract',
        web: { webPageDetails: { URL: location.origin + location.pathname, name: viewName, viewName } },
        _experience: { decisioning: {
          propositions: [{ id: proposition.id, scope: proposition.scope, scopeDetails: proposition.scopeDetails,
            items: [candidate.item].map(item => ({ id: item.id, ...(item.name ? { name: item.name } : {}),
              ...(item.itemSelection ? { itemSelection: item.itemSelection } : {}) })) }],
          propositionEventType: { [kind]: 1 },
          ...(button ? { propositionAction: { id: button.interactId || button.id || candidate.consequenceId, label: button.text?.content || 'Open reward' } } : {}),
        } } } };
  }
  function renderCard(candidate, captured, ctx, token) {
    const content = candidate.content, card = node('article', undefined, 'loyalty-content-card');
    card.tabIndex = -1;
    card.dataset.propositionId = candidate.proposition.id; card.dataset.itemId = candidate.item.id;
    card.dataset.consequenceId = candidate.consequenceId;
    if (typeof candidate.meta.challengeId === 'string') card.dataset.challengeId = candidate.meta.challengeId;
    const imageUrl = model.safeUrl(content.image?.url, location.href);
    if (imageUrl) { const image = node('img'); image.src = imageUrl; image.alt = content.image?.alt || ''; card.append(image); }
    const body = node('div', undefined, 'loyalty-content-card-body');
    body.append(node('h3', content.title?.content || 'Your reward'), node('p', content.body?.content || ''));
    const buttons = Array.isArray(content.buttons) ? content.buttons.slice() : [];
    if (!buttons.length && content.actionUrl) buttons.push({ actionUrl: content.actionUrl, text: { content: 'View reward' } });
    for (const button of buttons) {
      const url = model.safeUrl(button.actionUrl, location.href);
      const signup = button.interactId === 'joinChallenge';
      const control = node('button', button.text?.content || 'View reward'); control.type = 'button';
      if (button.interactId) control.dataset.interactId = button.interactId;
      if (signup) {
        control.dataset.joinLabel = control.textContent;
        if (typeof candidate.meta.challengeId === 'string') control.dataset.challengeId = candidate.meta.challengeId;
      }
      control.addEventListener('click', event => {
        if (signup) { event.preventDefault(); event.stopPropagation(); }
        void work(async (current, currentToken) => {
          same(ctx, token); same(current, currentToken); closeConfiguration(); control.disabled = true;
          try {
            if (signup) {
              await joinChallenge(candidate, captured, button, ctx, token);
              return;
            }
            if (button.actionUrl && !url) throw new Error('This card target is not an HTTP(S) URL supported by this web preview. No navigation performed.');
            if (button.interactId || button.id || candidate.consequenceId !== candidate.item.id) {
              await captured.alloy('sendEvent', tracking(candidate, captured, ctx, 'interact', button));
            } else if (captured.collectEvent) await captured.collectEvent('interact', [cardProposition(candidate)]);
            else await captured.alloy('sendEvent', tracking(candidate, captured, ctx, 'interact', button));
            same(ctx, token);
            message('Proposition interaction accepted. Task completion is determined by Adobe state.');
            if (!url) return;
            if (new URL(url).origin === location.origin && new URL(url).pathname === location.pathname) {
              if (ctx.region) await readTasks(ctx, token);
              same(ctx, token); location.hash = new URL(url).hash;
            } else location.assign(url);
          } finally { if (signup) syncSignupButtons(); else control.disabled = false; }
        });
      });
      body.append(control);
    }
    if (content.dismissBtn?.style && content.dismissBtn.style !== 'none') {
      const dismiss = node('button', 'Dismiss'); dismiss.type = 'button';
      dismiss.addEventListener('click', () => void work(async () => {
        same(ctx, token);
        if (captured.collectEvent) await captured.collectEvent('dismiss', [cardProposition(candidate)]);
        same(ctx, token);
        contentCardDismissals.add(contentCardKey(candidate, token));
        await showCard(contentCards?.propositions || [], captured, ctx, token, true);
        $('loyaltyCardHint').textContent = 'Card dismissed. Member challenge state is unchanged.';
      }));
      body.append(dismiss);
    }
    card.append(body); return card;
  }
  const cardProposition = candidate => ({ ...candidate.proposition, items: [candidate.item] });
  const contentCardId = candidate => JSON.stringify([candidate.proposition.id, candidate.item.id, candidate.consequenceId]);
  const contentCardKey = (candidate, token) => JSON.stringify([token, contentCardId(candidate), candidate.content, candidate.meta]);
  async function displayContentCard(presentation) {
    same(presentation.ctx, presentation.token);
    if (presentation !== contentCards || !presentation.cards.length) return;
    const candidate = presentation.cards[presentation.active], { captured, ctx, token } = presentation;
    $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, proposition: candidate.proposition,
      renderedConsequence: candidate.consequenceId, renderedItem: candidate.item.id,
      cardPosition: presentation.active + 1, totalCards: presentation.cards.length }, null, 2);
    const key = contentCardKey(candidate, token);
    if (contentCardDisplays.has(key)) {
      message('Content card unchanged. No duplicate display event sent.'); return;
    }
    // Reserve before collection: SDK reevaluation can synchronously deliver the same cards again.
    contentCardDisplays.add(key);
    message('Content card displayed; collecting the original proposition display...');
    try {
      if (captured.collectEvent) await captured.collectEvent('display', [cardProposition(candidate)]);
      else await captured.alloy('sendEvent', tracking(candidate, captured, ctx, 'display'));
    } catch (error) {
      console.error('[Loyalty] Content Card display collection failed', error);
      throw new Error('Content Card display was not confirmed. No automatic retry.', { cause: error });
    }
    same(ctx, token);
    if (presentation === contentCards) message('Content card displayed; original proposition display accepted. Task state refreshes independently.');
  }
  function renderContentCards(presentation) {
    const { cards, captured, ctx, token } = presentation, mount = cardMount();
    const viewport = node('div', undefined, 'loyalty-card-viewport');
    viewport.classList.toggle('loyalty-card-multiple', cards.length > 1);
    viewport.id = 'loyaltyChallengeCarousel';
    viewport.setAttribute('role', 'group');
    viewport.setAttribute('aria-label', 'Your challenges');
    const slides = node('div', undefined, 'loyalty-card-slides');
    const articles = cards.map(candidate => renderCard(candidate, captured, ctx, token));
    slides.append(...articles); viewport.append(slides);
    const dots = [], controls = node('div', undefined, 'loyalty-card-controls');
    let previous, next, scrollTimer, clickTimer, drag = null, suppressClick = false, lastWidth = 0;
    const update = () => {
      articles.forEach((article, index) => {
        article.dataset.primary = String(index === presentation.active);
        article.setAttribute('aria-label', (index + 1) + ' of ' + cards.length);
      });
      dots.forEach((dot, index) => dot.setAttribute('aria-current', String(index === presentation.active)));
      if (previous) { previous.dataset.boundaryDisabled = String(presentation.active === 0); previous.disabled = busy || !loaded || presentation.active === 0; }
      if (next) { next.dataset.boundaryDisabled = String(presentation.active === cards.length - 1); next.disabled = busy || !loaded || presentation.active === cards.length - 1; }
      $('loyaltyCardHint').textContent = cards.length > 1 ? 'Chosen for you \u00b7 ' + (presentation.active + 1) + ' of ' + cards.length : 'Chosen for you';
    };
    const nearest = () => {
      if (cards.length < 2) return 0;
      const step = articles[1].offsetLeft - articles[0].offsetLeft;
      if (!step) return presentation.active;
      return viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 3 ? cards.length - 1 :
        Math.max(0, Math.min(cards.length - 1, Math.round(viewport.scrollLeft / step)));
    };
    const move = (index, behavior = phoneMotion()) => {
      if (contentCards !== presentation) return;
      const target = Math.max(0, Math.min(cards.length - 1, index));
      viewport.scrollTo({ left: articles[target].offsetLeft - articles[0].offsetLeft, behavior });
    };
    const settle = () => {
      clearTimeout(scrollTimer);
      if (contentCards !== presentation || !viewport.clientWidth || drag) return;
      const active = nearest();
      if (active === presentation.active) { update(); return; }
      // Only the settled primary card uses the existing display collector, not the next-card peek.
      if (busy) { scrollTimer = setTimeout(settle, 120); return; }
      presentation.active = active; update();
      void work(async () => {
        same(ctx, token);
        if (contentCards === presentation) await displayContentCard(presentation);
      });
    };
    mount.removeAttribute('aria-roledescription');
    if (cards.length > 1) {
      mount.setAttribute('aria-roledescription', 'carousel');
      viewport.setAttribute('aria-roledescription', 'carousel'); viewport.tabIndex = 0;
      const pagination = node('div', undefined, 'loyalty-card-dots');
      cards.forEach((candidate, index) => {
        const dot = node('button'); dot.type = 'button';
        dot.setAttribute('aria-label', 'Show challenge ' + (index + 1) + ': ' + (candidate.content.title?.content || 'Your reward'));
        dot.setAttribute('aria-controls', viewport.id); dot.addEventListener('click', () => move(index));
        dots.push(dot); pagination.append(dot);
      });
      const arrow = (label, text, step) => {
        const button = node('button', text, 'loyalty-card-arrow'); button.type = 'button';
        button.setAttribute('aria-label', label); button.setAttribute('aria-controls', viewport.id);
        button.addEventListener('click', () => move(presentation.active + step)); return button;
      };
      previous = arrow('Previous challenge', '\u2190', -1); next = arrow('Next challenge', '\u2192', 1);
      controls.append(previous, pagination, next);
      viewport.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(settle, 120); }, { passive: true });
      viewport.addEventListener('scrollend', settle);
      viewport.addEventListener('keydown', event => {
        if (event.target !== viewport || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        move(event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 :
          presentation.active + (event.key === 'ArrowRight' ? 1 : -1));
      });
      viewport.addEventListener('focusin', event => {
        const index = articles.findIndex(article => article.contains(event.target));
        if (index >= 0 && index !== presentation.active) move(index);
      });
      viewport.addEventListener('wheel', event => {
        if (event.shiftKey && !event.deltaX) { event.preventDefault(); viewport.scrollLeft += event.deltaY; }
      }, { passive: false });
      viewport.addEventListener('pointerdown', event => {
        drag = null; suppressClick = false;
        if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button, a')) return;
        drag = { id: event.pointerId, x: event.clientX, scroll: viewport.scrollLeft };
      });
      viewport.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        const distance = event.clientX - drag.x;
        if (Math.abs(distance) > 5) {
          suppressClick = true; viewport.style.scrollSnapType = 'none';
          viewport.classList.add('loyalty-card-dragging'); viewport.setPointerCapture(event.pointerId);
        }
        if (suppressClick) { event.preventDefault(); viewport.scrollLeft = drag.scroll - distance; }
      });
      const endDrag = event => {
        if (!drag || drag.id !== event.pointerId) return;
        drag = null; viewport.style.scrollSnapType = ''; viewport.classList.remove('loyalty-card-dragging');
        if (suppressClick) {
          move(nearest());
          clickTimer = setTimeout(() => { suppressClick = false; }, 0);
        }
        settle();
      };
      viewport.addEventListener('pointerup', endDrag); viewport.addEventListener('pointercancel', endDrag);
      viewport.addEventListener('lostpointercapture', endDrag);
      viewport.addEventListener('pointerleave', () => { if (drag && !suppressClick) { drag = null; settle(); } });
      viewport.addEventListener('click', event => {
        if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
      }, true);
    }
    update();
    mount.replaceChildren(viewport, ...(cards.length > 1 ? [controls] : []));
    const resize = new ResizeObserver(() => {
      if (contentCards !== presentation || !viewport.clientWidth || viewport.clientWidth === lastWidth) return;
      lastWidth = viewport.clientWidth;
      move(presentation.active, 'instant');
    });
    resize.observe(viewport);
    presentation.cleanup = () => { clearTimeout(scrollTimer); clearTimeout(clickTimer); resize.disconnect(); };
  }
  function captureContentCardEvidence(propositions, ctx, token, responseSource) {
    const evaluated = responseSource === 'evaluated-subscription';
    const diagnosticPanel = $('loyaltyCardPreselectionEvidence');
    try {
      const rawPropositions = structuredClone(propositions ?? null);
      const inventory = [], text = value => typeof value === 'string' ? value :
        typeof value?.content === 'string' ? value.content : null;
      const describe = (proposition, item, consequenceId, data, candidate) => {
        let content = candidate?.content || data?.content, contentParseError = null;
        if (typeof content === 'string') {
          try { content = JSON.parse(content); }
          catch (error) { contentParseError = error.message; }
        }
        const meta = candidate?.meta || data?.meta || {};
        const buttons = Array.isArray(content?.buttons) ? content.buttons.slice() : [];
        if (!buttons.length && content?.actionUrl) buttons.push({ actionUrl: content.actionUrl, text: { content: 'View reward' } });
        return {
          propositionId: proposition.id, itemId: item.id, consequenceId,
          itemSchema: item.schema ?? null, contentType: data?.contentType ?? null, contentParseError,
          contentCardCandidate: Boolean(candidate), title: text(content?.title), body: text(content?.body),
          ctas: buttons.map(button => ({
            id: button.id ?? null, label: text(button.text), interactId: button.interactId ?? null,
            actionUrl: button.actionUrl ?? null,
          })),
          challengeId: meta.challengeId ?? null, metadata: meta,
          rank: Number.isFinite(candidate?.rank) ? candidate.rank : null,
          metadataRank: meta.rank ?? null, propositionRank: proposition.scopeDetails?.rank ?? null,
          activityPriority: proposition.scopeDetails?.activity?.priority ?? null,
          provider: proposition.scopeDetails?.decisionProvider ?? null,
          source: proposition.scopeDetails?.characteristics?.source ?? null,
          correlationId: proposition.scopeDetails?.correlationID ?? null,
          activity: proposition.scopeDetails?.activity ?? null,
          eventToken: proposition.scopeDetails?.characteristics?.eventToken ?? null,
        };
      };
      const matching = Array.isArray(propositions) ? propositions.filter(proposition => proposition.scope === ctx.surface) : [];
      for (const proposition of matching) {
        for (const item of proposition.items || []) {
          const consequences = (item.data?.rules || []).flatMap(rule => rule.consequences || [])
            .map(consequence => ({ consequence, direct: false }));
          if (item.data?.content !== undefined) consequences.push({
            consequence: { id: item.id, detail: { data: item.data } }, direct: true,
          });
          if (!consequences.length) inventory.push(describe(proposition, item, null, item.data, null));
          for (const { consequence, direct } of consequences) {
            const data = { ...item.data, rules: direct ? [] : [{ consequences: [consequence] }] };
            if (!direct) delete data.content;
            const candidate = model.selectCard([{ ...proposition, items: [{ ...item, data }] }], ctx.surface);
            inventory.push(describe(proposition, item, consequence.id || item.id, consequence.detail?.data, candidate));
          }
        }
      }
      const selected = Array.isArray(propositions) ? model.selectCard(propositions, ctx.surface) : null;
      const snapshot = structuredClone({
        capturedAt: new Date().toISOString(), sandbox: ctx.sandbox,
        profile: { namespace: ctx.namespace, identifier: ctx.identifier },
        surface: ctx.surface, responseSource, evaluated,
        propositionsReported: Array.isArray(propositions),
        propositions: rawPropositions,
        totalPropositions: Array.isArray(propositions) ? propositions.length : null,
        surfacePropositions: Array.isArray(propositions) ? matching.length : null,
        totalContentCardCandidates: Array.isArray(propositions) ? inventory.filter(entry => entry.contentCardCandidate).length : null,
        inventory,
        selectedCandidate: selected ? describe(selected.proposition, selected.item, selected.consequenceId,
          { content: selected.content, meta: selected.meta }, selected) : null,
      });
      contentCardEvidence = { version: token, snapshot };
      if (evaluated) evaluatedContentCardEvidence = contentCardEvidence;
      if (diagnosticPanel) diagnosticPanel.textContent = JSON.stringify(snapshot, null, 2);
    } catch (error) {
      console.error('[Loyalty] Content Card diagnostic capture failed', error);
      contentCardEvidence = { version: token, snapshot: { responseSource, evaluated, captureFailed: true, error: error.message } };
      if (evaluated) evaluatedContentCardEvidence = contentCardEvidence;
      if (diagnosticPanel) diagnosticPanel.textContent = 'Content Card diagnostic capture failed: ' + error.message;
    }
  }
  async function run(ctx, token) {
    closeConfiguration();
    if (!/^_[A-Za-z][A-Za-z0-9]*$/.test(ctx.tenant) || ['_id', '_repo', '_experience', '_links'].includes(ctx.tenant)) {
      throw new Error('Configure the reviewed event tenant namespace before requesting a content card.');
    }
    if (!/^web:\/\/[^?#\s]+#[A-Za-z][A-Za-z0-9_-]*$/.test(ctx.surface)) throw new Error('Provide one explicit web surface URI with a fragment.');
    message('Connecting to Web SDK for the content card...');
    const alloy = await global.DemoTagsInjection.ensureAlloyReady({ timeoutMs: 30000, storagePrefix: prefix });
    same(ctx, token);
    message('Reading the active Web SDK visitor identity...');
    const identity = await alloy('getIdentity', { namespaces: ['ECID'] });
    same(ctx, token);
    const ecid = identity?.identity?.ECID;
    if (typeof ecid !== 'string' || !/^\d{10,}$/.test(ecid)) throw new Error('Active Web SDK browser ECID was not returned. No card requested.');
    if (ctx.namespace === 'ecid' && ctx.identifier !== ecid) throw new Error('The selected ECID differs from the active Web SDK visitor. No card requested.');
    const identityMap = global.CdEdgeMounts.buildIdentityMap({ ecid }, ctx.identifier, ctx.namespace);
    if (loaded.profileLoyaltyId) identityMap.loyaltyId = [{ id: loaded.profileLoyaltyId, authenticatedState: 'authenticated', primary: false }];
    const captured = { alloy, identityMap, edgeOptions: global.DemoLabEdgeConfig.edgeConfigOverrides(),
      eventXdm: { [ctx.tenant]: { identification: { core: { ecid, email: loaded.profileEmail,
        ...(loaded.profileLoyaltyId && { loyaltyId: loaded.profileLoyaltyId }) } } } } };
    const current = () => token === version && JSON.stringify(ctx) === JSON.stringify(context()) &&
      JSON.stringify(captured.edgeOptions) === JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides());
    const subscriptionKey = JSON.stringify([token, ctx, captured.edgeOptions, identityMap]);
    if (!cardSubscription || cardSubscription.key !== subscriptionKey || cardSubscription.alloy !== alloy) {
      const subscription = { key: subscriptionKey, alloy, updates: 0 };
      cardSubscription = subscription;
      try {
        message('Subscribing to journey content cards...');
        await alloy('subscribeRulesetItems', { surfaces: [ctx.surface], schemas: [cardSchema],
          callback: (result, collectEvent) => {
            if (cardSubscription !== subscription || !current()) return;
            subscription.updates++;
            captureContentCardEvidence(result.propositions, ctx, token, 'evaluated-subscription');
            subscription.rendering = showCard(result.propositions, { ...captured, collectEvent }, ctx, token, true);
            void subscription.rendering.catch(error => {
              if (current()) message('Journey card rendering failed: ' + error.message + ' No automatic retry.', true);
            });
          } });
      } catch (error) { cardSubscription = null; throw error; }
    }
    same(ctx, token);
    if (!current()) throw new Error('Event datastream changed while preparing the card. No request sent.');
    const subscriptionUpdates = cardSubscription.updates;
    message('Requesting journey content from Adobe...');
    const result = await alloy('sendEvent', { ...captured.edgeOptions, renderDecisions: true,
      personalization: { surfaces: [ctx.surface], sendDisplayEvent: false },
      xdm: { ...captured.eventXdm, identityMap, web: { webPageDetails: {
        URL: location.origin + location.pathname, name: viewName, viewName } } } });
    same(ctx, token);
    if (!current()) throw new Error('Event datastream changed; previous card response discarded.');
    if (cardSubscription.updates !== subscriptionUpdates) {
      await cardSubscription.rendering; same(ctx, token); return;
    }
    captureContentCardEvidence(result?.propositions, ctx, token, 'direct-response');
    if (model.selectCard(result?.propositions, ctx.surface)) await showCard(result.propositions, captured, ctx, token);
    else if (Array.isArray(result?.propositions)) {
      await showCard(result.propositions, captured, ctx, token, true);
    }
    else {
      if (!cardMount().childElementCount) $('loyaltyCardHint').textContent = 'Waiting for a journey content-card proposition for this surface.';
      $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, surface: ctx.surface,
        response: result, note: 'No direct content-card propositions returned; journey subscription remains active.' }, null, 2);
      message('Card request accepted. No new direct content card returned; journey cards render through the active ruleset subscription.');
    }
  }
  async function showCard(propositions, captured, ctx, token, clearMissing) {
    same(ctx, token);
    const candidates = model.selectCards(propositions, ctx.surface);
    const availableKeys = new Set(candidates.map(candidate => contentCardKey(candidate, token)));
    for (const keys of [contentCardDisplays, contentCardDismissals]) {
      for (const key of keys) if (!availableKeys.has(key)) keys.delete(key);
    }
    const cards = candidates.filter(candidate => !contentCardDismissals.has(contentCardKey(candidate, token)));
    if (!cards.length) {
      if (clearMissing) {
        contentCards?.cleanup?.(); cardMount().replaceChildren(); contentCards = null; cardMount().removeAttribute('aria-roledescription');
        if (!candidates.length) { deliveredChallenge = null; restoreParticipation(); }
        $('loyaltyCardHint').textContent = candidates.length ? 'All returned cards dismissed.' :
          'No eligible renderable journey card returned for this surface.';
        $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, surface: ctx.surface, propositions }, null, 2);
        message(candidates.length ? 'All Content Cards dismissed. Member challenge state is unchanged.' :
          'No eligible content card returned. The previous card was removed; refresh does not change Adobe eligibility.');
      }
      return;
    }
    const key = JSON.stringify(cards.map(candidate => [contentCardKey(candidate, token), candidate.proposition]));
    if (contentCards?.key === key) {
      message('Content card unchanged. Adobe returned the same card; no duplicate display event sent.'); return;
    }
    if (cards.some(candidate => !candidate.item.id) || typeof captured?.alloy !== 'function' || !captured.identityMap ||
        !Object.values(captured.identityMap).some(ids => Array.isArray(ids) && ids.some(id => typeof id?.id === 'string' && id.id))) {
      throw new Error('Original proposition request identity is missing. No display event sent.');
    }
    const previous = contentCards && contentCardId(contentCards.cards[contentCards.active]);
    const active = cards.findIndex(candidate => contentCardId(candidate) === previous);
    const presentation = { key, propositions, cards, captured, ctx, token, active: Math.max(0, active) };
    contentCards?.cleanup?.(); contentCards = presentation; renderContentCards(presentation);
    // Navigation is presentation-only; retain the joined challenge independently of the visible slide.
    const participationCard = (joinedChallenge && candidates.find(candidate => candidate.meta.challengeId === joinedChallenge.id)) ||
      candidates.find(candidate => memberChallenges.some(challenge =>
        challenge.challenge_id === candidate.meta.challengeId && challenge.optedIn === true) ||
        ['joined', 'already'].includes(signupReceipts.get(signupKey(ctx, loaded?.profileLoyaltyId, candidate.meta.challengeId))?.state)) ||
      candidates[0];
    deliveredChallenge = typeof participationCard.meta.challengeId === 'string' && participationCard.meta.challengeId.trim()
      ? { id: participationCard.meta.challengeId, title: participationCard.content.title?.content || 'Your challenge' } : null;
    restoreParticipation();
    await displayContentCard(presentation);
  }
  global.TuiDecisioningDrawer = { getSignals: () => loaded ? global.TuiDecisioningProfile.signals(loaded.rows) : null };
  function syncParticipation() {
    const participation = $('loyaltyParticipation').value;
    document.querySelectorAll('[data-loyalty-participation]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.loyaltyParticipation === participation));
    });
    $('loyaltyPhoneTitle').textContent = participation === 'complete' ? 'Completed challenges' : 'In progress';
  }
  async function init() {
    initPhoneApp();
    initPreviewMode();
    $('aepDemoEnvSection').append($('loyaltyApiOptions').content.cloneNode(true));
    const panel = $('aepLabEnvOverlayPanel');
    panel.prepend($('aepDemoProfileSection'));
    $('loyaltyTenant').value = defaultEventTenant();
    selectedProfileKey = profileKey();
    const email = $('customerEmail'), getTarget = () => targets.find(target => target.id === $('generatorTarget').value) || null;
    $('loyaltySurface').value = defaultCardSurface();
    document.querySelectorAll('[data-loyalty-participation]').forEach(button => {
      button.addEventListener('click', () => {
        if (busy || $('loyaltyParticipation').value === button.dataset.loyaltyParticipation) return;
        $('loyaltyParticipation').value = button.dataset.loyaltyParticipation;
        invalidate(false);
        if (loaded) void work(async (ctx, token) => {
          await readTasks(ctx, token); autoBlocked = false; message('Task state refreshed from Adobe.');
        });
      });
    });
    global.AepIdentityPicker.init('customerEmail', prefix + 'Ns'); global.attachEmailDatalist?.('customerEmail', 'recentEmails', prefix + 'Ns');
    const tags = global.DemoTagsInjection.init({ storagePrefix: prefix, identityEventType: 'lloyds.loyalty.identity.stitch',
      messageSetter: (text, type) => message(text, type === 'error'), infoEcidId: 'infoEcid',
      tagsCompanyId: prefix + 'TagsCompany', tagsPropertyInputId: prefix + 'TagsProperty', tagsPropertyListId: prefix + 'TagsPropertyList',
      tagsEnvironmentId: prefix + 'TagsEnvironment', injectButtonId: prefix + 'InjectSdkBtn', selectedScriptId: prefix + 'SelectedScript',
      configFieldsId: prefix + 'SdkConfigFields', configSummaryId: prefix + 'SdkConfigSummary',
      configSummaryTextId: prefix + 'SdkConfigSummaryText', changeConfigButtonId: prefix + 'ChangeSdkConfigBtn',
      getSelectedGeneratorTarget: getTarget, getEmail: () => email.value, iframeIds: [], hideTagsCompanyUi: true,
      webPush: { enabled: false }, brandConcierge: { enabled: false } });
    global.envBar.registerTagsInjection(tags);
    global.DemoProfileDrawer.init({ emailInputId: 'customerEmail', profileOpenClass: 'mod-demo-page--profile-open',
      viewName, eventTimeline: 'compact', emailGetter: () => email.value, messageSetter: (text, type) => message(text, type === 'error'),
      getSelectedGeneratorTarget: getTarget, fetchBrowserEcidOnInit: true });
    global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(async () => {
      targets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect($('generatorTarget'), {});
    });
    $('queryProfileBtn').addEventListener('click', () => void work(lookup));
    const identityChanged = () => {
      const key = profileKey();
      if (key === selectedProfileKey) return;
      selectedProfileKey = key; invalidate(true);
    };
    email.addEventListener('input', identityChanged); email.addEventListener('change', identityChanged);
    $(prefix + 'Ns').addEventListener('change', identityChanged);
    global.addEventListener('aep-profile-drawer-loaded', event => adoptDrawerProfile(event.detail));
    global.addEventListener('tui-profile-changed', () => {
      requestAutomaticTaskState();
      if (loaded && typeof global.alloy === 'function') void requestFeaturedOffers();
    });
    global.addEventListener('aep-global-sandbox-change', () => {
      if (selectedProfileKey === profileKey()) return;
      selectedProfileKey = profileKey();
      $('loyaltyRegion').value = ''; $('loyaltyTenant').value = defaultEventTenant(); $('loyaltyChallenge').value = '';
      $('loyaltySurface').value = defaultCardSurface();
      $('loyaltyParticipation').value = 'active'; $('loyaltyTest').checked = false;
      invalidate(true);
    });
    global.addEventListener('aep-demo-tags-injected', () => {
      invalidate(false);
      if (loaded && typeof global.alloy === 'function') void requestFeaturedOffers();
      requestAutomaticCard();
    });
    global.addEventListener('aep-demo-visitor-reset-start', () => invalidate(true));
    global.addEventListener('aep-demo-visitor-invalidated', () => invalidate(true));
    for (const id of ['loyaltyRegion', 'loyaltyMember', 'loyaltyChallenge', 'loyaltyTenant', 'loyaltySurface', 'loyaltyParticipation', 'loyaltyTest', 'generatorTarget']) {
      $(id).addEventListener(id === 'loyaltyRegion' || id === 'loyaltyParticipation' || id === 'loyaltyTest' || id === 'generatorTarget' ? 'change' : 'input', () => invalidate(false));
    }
    $('loyaltyRefresh').addEventListener('click', () => void work(async (ctx, token) => {
      closeConfiguration();
      await readTasks(ctx, token); autoBlocked = false; message('Task state refreshed from Adobe.');
    }));
    $('loyaltyRun').addEventListener('click', () => { scrollPhoneSection('loyaltyPromotionTitle'); void work(refreshContentAndOffers); });
    $('loyaltyAbandon').addEventListener('click', () => { closeConfiguration(); void work(sendRewardsInterest); });
    document.addEventListener('click', event => {
      if (event.target.closest('#cdMicroProfileRunBtn')) { event.preventDefault(); event.stopImmediatePropagation(); if (loaded) void work(run); }
    }, true);
    const anchor = document.querySelector('.mod-demo-top-anchor'), actions = document.querySelector('.tui-live-actions');
    const layout = () => {
      const toolbarHeight = anchor.querySelector('.lab-env-toolbar').getBoundingClientRect().height;
      document.body.style.setProperty('--loyalty-config-chrome', (toolbarHeight + actions.getBoundingClientRect().height + 32) + 'px');
      const hidden = anchor.classList.contains('lab-env-top-anchor--docked-hidden') || anchor.classList.contains('lab-env-top-anchor--presenter-strip-hidden');
      const top = hidden ? 0 : anchor.getBoundingClientRect().bottom;
      document.body.style.setProperty('--tui-toolbar-top', top + 'px');
      document.body.style.setProperty('--tui-content-top', (top + actions.getBoundingClientRect().height + 20) + 'px');
    };
    const observer = new ResizeObserver(layout); observer.observe(anchor); observer.observe(actions);
    new MutationObserver(layout).observe(anchor, { attributes: true, attributeFilter: ['class'] }); layout();
    const timer = setInterval(() => {
      if (!busy && loaded && !autoBlocked && $('loyaltyAuto').checked && !document.hidden) {
        void work(async (ctx, token) => { await readTasks(ctx, token); message('Task state refreshed from Adobe.'); });
      }
    }, 30000);
    global.addEventListener('pagehide', event => {
      version++; aborter?.abort();
      if (!event.persisted) { clearInterval(timer); observer.disconnect(); }
    });
    global.addEventListener('pageshow', event => { if (event.persisted) invalidate(true); });
    message('Look up a profile in the top bar, then select Get task status. SDK injection is only needed for content cards and journey events.');
  }
  global.envBar.ready().then(init).catch(error => message('Demo initialization failed: ' + error.message, true));
})(window);
