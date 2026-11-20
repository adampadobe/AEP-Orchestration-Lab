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
  const stateChallengeName = challenge => typeof challenge?.challengeName === 'string' &&
    challenge.challengeName.trim() !== challenge.challenge_id ? challenge.challengeName.trim() : '';
  const cardSchema = 'https://ns.adobe.com/personalization/message/content-card';
  let loaded = null, version = 0, busy = false, autoBlocked = true, targets = [], aborter, cardSubscription, pendingCard = false, displayedCard = '';
  let joinedChallenge = null, deliveredChallenge = null, memberChallenges = [], offerFocus = null, selectedProfileKey = '', pendingProfile = null;
  let featuredRequest = null, pendingFeaturedRequest = false;
  const purchaseReceipts = new Map();
  const signupReceipts = new Map();
  const savedPreviewOffers = new Map();
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
    lastAjoSignature = signature;
    $('loyaltyFeaturedStatus').textContent = 'Personalised offers';
  }
  function waitForFeaturedOffers() {
    clearTimeout(featuredFallbackTimer);
    $('loyaltyFeaturedOffers').replaceChildren(); $('loyaltyOfferDots').replaceChildren();
    currentItems = []; updateFeaturedCarousel();
    $('loyaltyFeaturedStatus').textContent = 'Loading personalised offers\u2026';
    $('loyaltyOfferCarousel').setAttribute('aria-busy', 'true');
    // Five-second development fallback; a later valid AJO delivery always replaces these previews.
    featuredFallbackTimer = setTimeout(() => {
      renderFeaturedOffers(decisionItems);
      $('loyaltyFeaturedStatus').textContent = 'Preview offers: no personalised offers received after 5 seconds.';
    }, 5000);
  }
  function activateOffer(offer) {
    // Add proposition interaction tracking here later, using the complete selected offer.
    if (savedPreviewOffers.has(offer.id)) savedPreviewOffers.delete(offer.id);
    else savedPreviewOffers.set(offer.id, offer);
    renderSavedOffers();
    phoneToast(savedPreviewOffers.has(offer.id) ? 'Saved for this preview only. Cashback is not activated.' : 'Preview offer removed.');
  }
  function renderFeaturedOffers(items) {
    currentItems = [...items];
    const carousel = $('loyaltyOfferCarousel'), track = $('loyaltyFeaturedOffers'), dots = $('loyaltyOfferDots');
    const cards = document.createDocumentFragment(), pagination = document.createDocumentFragment();
    currentItems.forEach((offer, index) => {
      const card = node('article', undefined, 'loyalty-featured-offer');
      card.dataset.art = offer.key || offer.id; card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', (index + 1) + ' of ' + currentItems.length + ': ' + offer.merchant);
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
      save.title = typeof offer.cta === 'string' && offer.cta.trim() ? offer.cta + ' (preview save only)' : 'Save preview offer';
      save.addEventListener('click', () => activateOffer(offer));
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
    savedPreviewOffers.clear(); renderSavedOffers();
    clearTimeout(toastTimer); $('loyaltyAppToast').hidden = true;
    $('loyaltyPartnerOffers').replaceChildren(); $('loyaltyPartnerOffers').hidden = true;
    displayedCard = '';
    cardMount().replaceChildren(); $('loyaltyTasks').replaceChildren(node('p', 'State not loaded for this context.', 'loyalty-empty'));
    $('loyaltyPhoneTasks').replaceChildren(node('p', 'State not loaded for this context.', 'loyalty-empty'));
    syncParticipation();
    $('loyaltyUpdated').textContent = 'Not loaded'; $('loyaltyNamespace').textContent = 'Loyalty namespace not yet read';
    $('loyaltyEvidence').textContent = 'No response for this context.';
    $('loyaltyCardHint').textContent = 'Your next challenge will appear here.';
  }
  function invalidate(clearProfile) {
    version++; aborter?.abort(); pendingProfile = null; autoBlocked = true; clearResults();
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
    showPhoneView('rewards');
    const scroll = document.querySelector('.loyalty-phone-scroll'), target = $(id);
    scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12,
      behavior: phoneMotion() });
    target.focus({ preventScroll: true });
  }
  function phoneToast(text) {
    clearTimeout(toastTimer);
    $('loyaltyAppToast').textContent = text; $('loyaltyAppToast').hidden = false;
    toastTimer = setTimeout(() => { $('loyaltyAppToast').hidden = true; }, 4000);
  }
  function renderSavedOffers() {
    const fragment = document.createDocumentFragment();
    for (const offer of savedPreviewOffers.values()) {
      const logo = node('span', offer.initials || offer.merchant.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join(''), 'loyalty-merchant-logo');
      logo.dataset.art = offer.key || offer.id; logo.setAttribute('role', 'img'); logo.setAttribute('aria-label', offer.merchant + ' saved preview offer');
      fragment.append(logo);
    }
    if (!savedPreviewOffers.size) fragment.append(node('span', undefined, 'loyalty-saved-empty'),
      node('span', undefined, 'loyalty-saved-empty'), node('small', 'Save a featured offer to see it here.'));
    $('loyaltySavedOffers').replaceChildren(fragment);
    document.querySelectorAll('[data-save-preview-offer]').forEach(button => {
      const saved = savedPreviewOffers.has(button.dataset.savePreviewOffer);
      button.setAttribute('aria-pressed', String(saved)); button.textContent = saved ? '\u2713' : '+';
      const offer = currentItems.find(item => item.id === button.dataset.savePreviewOffer);
      button.setAttribute('aria-label', (saved ? 'Unsave' : 'Save') + ' ' + offer.merchant + ' preview offer');
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
      carousel.setPointerCapture(event.pointerId);
    });
    carousel.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const distance = event.clientX - drag.x;
      if (Math.abs(distance) > 5) { suppressClick = true; carousel.style.scrollSnapType = 'none'; }
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
    return result.data;
  }
  function syncSignupButtons() {
    const ctx = context();
    cardMount().querySelectorAll('[data-interact-id="joinChallenge"]').forEach(button => {
      const receipt = signupReceipts.get(signupKey(ctx, loaded?.profileLoyaltyId, button.dataset.challengeId));
      button.disabled = busy || !!receipt;
      button.textContent = receipt?.state === 'joined' ? 'Challenge Joined' :
        receipt?.state === 'already' ? 'Challenge Already Joined' :
        receipt?.state === 'unknown' ? 'Check challenge status' :
        receipt?.state === 'pending' ? 'Joining Challenge...' : button.dataset.joinLabel;
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
      challenge_id: challengeId, region: ctx.region || 'va7', test: 'false' });
    same(ctx, token);
    if (!Array.isArray(state?.challengeList)) throw new Error('Malformed Loyalty state: challengeList is missing.');
    const stateContext = { ...ctx, challenge: challengeId, participation: 'active', test: false };
    reconcileSignupState(state, stateContext, member);
    if (!ctx.test && ctx.participation === 'active') {
      const metadata = await readChallengeMetadata(state, ctx, token, challengeId);
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
    joinedChallenge = { id: challengeId, title: candidate.content.title?.content || 'Your challenge', confirmed: true };
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
    scrollPhoneSection('loyaltyPhoneTitle');
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
  async function readTasks(ctx, token) {
    if (ctx.participation === 'complete' && ctx.test) throw new Error('Adobe\'s completed-challenges endpoint does not support State API test mode. Turn test mode off or select Active.');
    const config = await loyalty(ctx, { action: 'config' }); same(ctx, token);
    const member = memberId(ctx, config);
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
  }
  function renderTasks(state, metadata, ctx, selectedMember) {
    const fragment = document.createDocumentFragment(), phone = document.createDocumentFragment();
    const challenges = state.challengeList.filter(challenge => !ctx.challenge || challenge.challenge_id === ctx.challenge);
    if (!challenges.length) {
      const empty = node('p', 'No ' + ctx.participation + ' challenges returned for this member and filter.', 'loyalty-empty');
      phone.append(empty.cloneNode(true)); fragment.append(empty);
    }
    for (const challenge of challenges) {
      if (!challenge || typeof challenge !== 'object' || !Array.isArray(challenge.tasks)) throw new Error('Malformed challenge: tasks must be an array.');
      if (challenge.tasks.some(task => !task || typeof task !== 'object')) throw new Error('Malformed task in Loyalty state.');
      const { definition, error } = metadata.get(challenge.challenge_id) || {};
      const section = node('article', undefined, 'loyalty-challenge');
      const name = stateChallengeName(challenge) || definition?.name.trim() || 'Challenge name unavailable';
      const completed = challenge.tasks.filter(complete).length, total = challenge.tasks.length;
      const summary = node('div', undefined, 'loyalty-progress-summary');
      const ring = node('div', undefined, 'loyalty-progress-ring');
      ring.style.setProperty('--loyalty-progress', (total ? completed / total * 100 : 0) + '%');
      ring.append(node('b', completed + ' / ' + total), node('span', 'tasks complete'));
      const title = node('div');
      const remaining = challenge.tasks.find(task => !complete(task));
      title.append(node('p', 'CHALLENGE PROGRESS', 'loyalty-eyebrow'), node('h3', name),
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
      const diagnostic = node('details', undefined, 'loyalty-task-details');
      diagnostic.append(node('summary', 'Challenge API details'), node('small', 'Challenge ID: ' + repr(challenge.challenge_id)),
        node('p', 'State: ' + repr(challenge.state) + ' / Opted in: ' + repr(challenge.optedIn) +
        ' / Required tasks: ' + repr(challenge.tasksToComplete)));
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
        const taskDetails = node('div');
        taskDetails.append(node('b', taskName), node('small', 'Goal: ' + repr(task.variables?.goal) + ' / Goal type: ' + repr(task.variables?.type)),
          node('small', 'Accumulators: ' + repr(task.accumulators)));
        taskDetails.append(node('small', 'Task state: ' + repr(task.taskState)));
        if (Array.isArray(task.taskCompletions)) taskDetails.append(node('small', 'Reported task completions: ' + task.taskCompletions.length));
        taskDetails.append(node('small', 'Task ID: ' + repr(task.taskId))); diagnostic.append(taskDetails);
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
    if ($('loyaltyTasks').querySelector('.loyalty-challenge:not(.loyalty-pending-progress)')) return;
    const section = node('article', undefined, 'loyalty-challenge loyalty-pending-progress');
    const summary = node('div', undefined, 'loyalty-progress-summary');
    const ring = node('div', undefined, 'loyalty-progress-ring');
    ring.append(node('b', '\u2014'), node('span', 'Live status'));
    const title = node('div');
    title.append(node('p', 'YOUR CHALLENGE', 'loyalty-eyebrow'), node('h3', joinedChallenge.title),
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
    const payload = { ...captured.edgeOptions, renderDecisions: false,
      personalization: { defaultPersonalizationEnabled: false },
      xdm: { eventType: 'commerce.purchases', identityMap: captured.identityMap,
        commerce: { purchases: { value: 1 }, order: { purchaseID, priceTotal: offer.amount, currencyCode: 'GBP' } },
        productListItems: [{ SKU: offer.sku, name: offer.productName, quantity: 1, priceTotal: offer.amount, currencyCode: 'GBP' }],
        ...captured.eventXdm } };
    await dispatchProfileEvent(captured, payload, ctx, token);
    purchaseReceipts.set(offer.key, purchaseID);
    renderPartnerOffers();
    const currentButton = $('loyaltyPartnerOffers').querySelector('[data-loyalty-purchase="' + offer.key + '"]');
    openOffer(offer, currentButton || button, purchaseID);
    message(offer.brand + ' purchase event accepted by Web SDK. Get task status for Adobe-confirmed progress.');
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
        if (controller.signal.aborted) { version++; cardSubscription = null; pendingCard = false; pendingFeaturedRequest = false; }
      }
    } finally {
      controller.signal.removeEventListener('abort', onAbort);
      clearTimeout(timeout); busy = false; message($('loyaltyStatus').textContent, $('loyaltyStatus').dataset.error === 'true');
      if (pendingProfile) {
        const detail = pendingProfile; pendingProfile = null;
        adoptDrawerProfile(detail);
      }
      if (pendingFeaturedRequest) { pendingFeaturedRequest = false; void requestFeaturedOffers(); }
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
    return work(async (ctx, token) => {
      const captured = await prepareProfileEvent(ctx, token, 'featured-offers decision');
      same(ctx, token);
      if (global.alloy !== captured.alloy ||
          JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides()) !== captured.edgeSnapshot) {
        throw new Error('SDK or datastream changed while preparing Featured Offers. No request sent.');
      }
      const key = JSON.stringify([ctx.sandbox, ctx.namespace, ctx.identifier, ctx.tenant,
        captured.identityMap, captured.edgeOptions]);
      if (featuredRequest?.key === key && featuredRequest.alloy === captured.alloy) {
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
          personalization: { surfaces: ['#featured-offers'] },
          xdm: { ...captured.eventXdm, identityMap: captured.identityMap,
            web: { webPageDetails: { URL: location.origin + location.pathname, name: viewName, viewName } } },
        });
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
    });
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
    try { await captured.alloy('sendEvent', payload); }
    catch (error) {
      throw new Error(payload.xdm.eventType + ' send was not confirmed: ' + error.message +
        '. The event may already have been ingested; check profile events before sending again.');
    }
    same(ctx, token);
    $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, event: payload, sdkAccepted: true,
      journeyEntryVerified: false }, null, 2);
  }
  async function sendAbandonedSearch(ctx, token) {
    const captured = await prepareProfileEvent(ctx, token, 'abandoned.search');
    const payload = { ...captured.edgeOptions,
      renderDecisions: false, personalization: { defaultPersonalizationEnabled: false },
      xdm: { ...captured.eventXdm, eventType: 'abandoned.search', identityMap: captured.identityMap,
        web: { webPageDetails: { URL: location.origin + location.pathname, name: viewName, viewName } } } };
    await dispatchProfileEvent(captured, payload, ctx, token);
    message('abandoned.search accepted by Web SDK. Refreshing profile events...');
    try { await global.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile(); }
    catch (error) {
      throw new Error('abandoned.search was accepted by Web SDK, but the profile event refresh failed: ' +
        error.message + '. Do not resend to refresh the drawer. Journey entry is not verified.');
    }
    same(ctx, token);
    message('abandoned.search accepted by Web SDK for the selected profile. Journey entry is not yet verified.');
  }
  function tracking(candidate, captured, ctx, kind, button) {
    const proposition = candidate.proposition;
    return { ...captured.edgeOptions, renderDecisions: false, personalization: { defaultPersonalizationEnabled: false },
      xdm: { ...captured.eventXdm, identityMap: captured.identityMap,
        eventType: kind === 'display' ? 'decisioning.propositionDisplay' : 'decisioning.propositionInteract',
        web: { webPageDetails: { URL: location.origin + location.pathname, name: viewName, viewName } },
        _experience: { decisioning: {
          propositions: [{ id: proposition.id, scope: proposition.scope, scopeDetails: proposition.scopeDetails,
            items: proposition.items.map(item => ({ id: item.id, ...(item.name ? { name: item.name } : {}),
              ...(item.itemSelection ? { itemSelection: item.itemSelection } : {}) })) }],
          propositionEventType: { [kind]: 1 },
          ...(button ? { propositionAction: { id: button.interactId || button.id || candidate.consequenceId, label: button.text?.content || 'Open reward' } } : {}),
        } } } };
  }
  function renderCard(candidate, captured, ctx, token) {
    const content = candidate.content, card = node('article', undefined, 'loyalty-content-card');
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
            if (button.interactId) await captured.alloy('sendEvent', tracking(candidate, captured, ctx, 'interact', button));
            else if (captured.collectEvent) await captured.collectEvent('interact', [candidate.proposition]);
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
        if (captured.collectEvent) await captured.collectEvent('dismiss', [candidate.proposition]);
        same(ctx, token); card.remove(); $('loyaltyCardHint').textContent = 'Card dismissed. Member challenge state is unchanged.';
      }));
      body.append(dismiss);
    }
    card.append(body); cardMount().replaceChildren(card);
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
    const candidate = model.selectCard(propositions, ctx.surface);
    if (!candidate) {
      if (clearMissing) {
        cardMount().replaceChildren(); displayedCard = '';
        deliveredChallenge = null; restoreParticipation();
        $('loyaltyCardHint').textContent = 'No eligible renderable journey card returned for this surface.';
        $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, surface: ctx.surface, propositions }, null, 2);
        message('No eligible content card returned. The previous card was removed; refresh does not change Adobe eligibility.');
      }
      return;
    }
    const cardKey = JSON.stringify([token, candidate.proposition.id, candidate.item.id, candidate.content, candidate.meta]);
    if (displayedCard === cardKey) {
      message('Content card unchanged. Adobe returned the same card; no duplicate display event sent.'); return;
    }
    if (!candidate.item.id || typeof captured?.alloy !== 'function' || !captured.identityMap ||
        !Object.values(captured.identityMap).some(ids => Array.isArray(ids) && ids.some(id => typeof id?.id === 'string' && id.id))) {
      throw new Error('Original proposition request identity is missing. No display event sent.');
    }
    renderCard(candidate, captured, ctx, token);
    deliveredChallenge = typeof candidate.meta.challengeId === 'string' && candidate.meta.challengeId.trim()
      ? { id: candidate.meta.challengeId, title: candidate.content.title?.content || 'Your challenge' } : null;
    restoreParticipation();
    displayedCard = cardKey;
    $('loyaltyCardHint').textContent = 'Chosen for you';
    $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, proposition: candidate.proposition,
      renderedConsequence: candidate.consequenceId }, null, 2);
    message('Content card displayed; collecting the original proposition display...');
    if (captured.collectEvent) await captured.collectEvent('display', [candidate.proposition]);
    else await captured.alloy('sendEvent', tracking(candidate, captured, ctx, 'display'));
    same(ctx, token);
    message('Content card displayed; original proposition display accepted. Task state refreshes independently.');
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
    $('loyaltyRun').addEventListener('click', () => { scrollPhoneSection('loyaltyPromotionTitle'); void work(run); });
    $('loyaltyAbandon').addEventListener('click', () => { closeConfiguration(); void work(sendAbandonedSearch); });
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
