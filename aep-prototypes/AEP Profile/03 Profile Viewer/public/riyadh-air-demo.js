(function (global) {
  'use strict';
  const byId = (id) => document.getElementById(id);
  let targets = [];
  let verified = null;
  let browserEcid = '';
  let tags = null;
  let ready = false;
  let sending = false;
  let targetGeneration = 0;
  let identityValidation = Promise.resolve();
  let previewTrip = null;
  const uncertainKey = 'riyadhAirUncertainDelivery';
  let uncertain = global.sessionStorage.getItem(uncertainKey);
  let signedInOwner = '';
  let signingIn = false;
  let sdkSandbox = '';
  let bookingIdentity = '';

  async function pageView() {
    try {
      if (!browserEcid || sdkSandbox !== sandbox() || !global.DemoTagsInjection.isAlloyReady() ||
        global.AepLabTagsInjectGuard.isInProgress('riyadhAirDemo')) {
        throw new Error('Page view not sent. Inject the selected sandbox’s Tags library before browsing.');
      }
      const ctx = context();
      const before = contextToken();
      const overrides = global.DemoLabEdgeConfig.edgeConfigOverrides();
      const url = new URL(global.location.href);
      const page = url.searchParams.get('step');
      url.search = '';
      url.hash = '';
      if (page) url.searchParams.set('step', page);
      const options = {
        ...overrides,
        xdm: {
          eventType: 'web.webPageDetails.pageViews',
          web: { webPageDetails: { name: document.title, URL: url.href, pageViews: { value: 1 } } },
          _demoemea: { identification: { core: { ecid: ctx.ecid } } },
          identityMap: { ECID: [{ id: ctx.ecid, authenticatedState: ctx.known ? 'authenticated' : 'ambiguous', primary: true }] },
        },
      };
      if (ctx.known) options.xdm.identityMap.Email = [{ id: ctx.email, authenticatedState: 'authenticated', primary: false }];
      await global.alloy('sendEvent', options);
      if (before !== contextToken() || JSON.stringify(overrides) !== JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides())) {
        throw new Error('Page view was submitted while the selected context changed. Check activity before another attempt.');
      }
      recordDelivery(options.xdm.web.webPageDetails.name + ' — SDK accepted');
    } catch (error) {
      message(error.message, true);
    }
  }

  function closeLabOverlays() {
    if (global.EnvBarCompact) global.EnvBarCompact.closeOverlay({ force: true });
    if (global.ProfileViewerModal) global.ProfileViewerModal.close();
    if (global.BrandConciergeMidrailPanel && global.BrandConciergeMidrailPanel._handle) global.BrandConciergeMidrailPanel._handle.setOpen(false);
    const decisionClose = byId('dpmPanelClose');
    if (decisionClose) decisionClose.click();
  }

  function trapDialogFocus(panel) {
    panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const controls = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
        .filter((element) => element.getClientRects().length);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function initAccount() {
    const panel = byId('raAccountDialog');
    const launcher = byId('raAccountButton');
    function show(view) {
      byId('raAccountWelcome').hidden = view !== 'welcome';
      byId('raAccountForm').hidden = view !== 'form';
      byId('raAccountSignedIn').hidden = view !== 'signedIn';
      panel.setAttribute('aria-labelledby', view === 'form' ? 'raAccountFormTitle' : view === 'signedIn' ? 'raAccountSignedInTitle' : 'raAccountTitle');
    }
    launcher.addEventListener('click', () => {
      show(signingIn ? 'form' : signedInOwner ? 'signedIn' : 'welcome');
      closeLabOverlays();
      panel.showModal();
      launcher.setAttribute('aria-expanded', 'true');
      (signingIn ? byId('raAccountClose') : signedInOwner ? byId('raAccountActivity') : byId('raJoinNow')).focus();
    });
    for (const [id, join] of [['raJoinNow', true], ['raLogIn', false]]) {
      byId(id).addEventListener('click', () => {
        show('form');
        byId('raAccountFormTitle').textContent = join ? 'Join Sfeer' : 'Log in to Sfeer';
        byId('raAccountFormHint').textContent = join
          ? 'Use your existing profile email to explore Sfeer. This website does not create an airline or loyalty account.'
          : 'Use your existing profile email. No password is required.';
        byId('raAccountEmail').value = verified ? verified.email : '';
        byId('raAccountError').hidden = true;
        byId('raAccountEmail').focus();
      });
    }
    byId('raAccountClose').addEventListener('click', () => panel.close());
    byId('raAccountBack').addEventListener('click', () => { show('welcome'); byId('raJoinNow').focus(); });
    panel.addEventListener('click', (event) => {
      const rect = panel.getBoundingClientRect();
      if (event.target === panel && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) panel.close();
    });
    panel.addEventListener('close', () => {
      launcher.setAttribute('aria-expanded', 'false');
      launcher.focus();
    });
    trapDialogFocus(panel);
    byId('raAccountActivity').addEventListener('click', () => {
      panel.close();
      void global.DemoProfileDrawer.openDrawerAndLoad().catch((error) => api.reportError(error));
    });
    byId('raAccountForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (signingIn) return;
      signingIn = true;
      const controls = [...byId('raAccountForm').querySelectorAll('input, button')];
      const email = byId('raAccountEmail').value.trim();
      const requestedSandbox = sandbox();
      controls.forEach((control) => { control.disabled = true; });
      byId('raAccountForm').setAttribute('aria-busy', 'true');
      byId('raAccountError').hidden = true;
      try {
        const profile = await lookup(email, { requireStitch: true });
        if (requestedSandbox !== sandbox() || !verified || profile !== verified) throw new Error('The selected environment changed during sign-in.');
        signedInOwner = ownerKey();
        byId('raAccountLabel').textContent = 'My Sfeer';
        launcher.setAttribute('aria-label', 'My Sfeer');
        byId('raAccountGreeting').textContent = profile.firstName ? 'Welcome, ' + profile.firstName + '.' : 'Welcome to your profile.';
        panel.close();
      } catch (error) {
        message(error.message, true);
        byId('raAccountError').textContent = 'We could not connect your profile. Check your email and ask the presenter to verify the selected environment and Adobe connection.';
        byId('raAccountError').hidden = false;
        if (!panel.open) {
          byId('raDeliveryStatus').textContent = byId('raAccountError').textContent;
          byId('raDeliveryStatus').hidden = false;
        }
      } finally {
        signingIn = false;
        controls.forEach((control) => { control.disabled = false; });
        byId('raAccountForm').removeAttribute('aria-busy');
        if (panel.open) byId('raAccountEmail').focus();
      }
    });
  }

  function message(text, error, customer) {
    const diagnostic = byId('raPresenterStatus');
    diagnostic.textContent = text;
    diagnostic.dataset.error = String(!!error);
    const status = byId('raDeliveryStatus');
    status.textContent = customer && error ? text : '';
    status.hidden = !(customer && error && text);
    status.dataset.error = String(!!error);
    const strip = byId('riyadhMessage');
    if (strip) {
      strip.textContent = '';
      strip.hidden = true;
    }
  }

  function recordDelivery(text) {
    const row = document.createElement('li');
    row.textContent = text;
    byId('raEventLog').prepend(row);
    while (byId('raEventLog').children.length > 12) byId('raEventLog').lastElementChild.remove();
  }

  function sandbox() {
    return global.AepDemoGeneratorTargets.getSandboxName();
  }

  function selectedTarget() {
    const select = byId('generatorTarget');
    return targets.find((target) => select && target.id === select.value) || null;
  }

  function identifier() {
    return String(byId('customerEmail') && byId('customerEmail').value || '').trim();
  }

  function namespace() {
    return String(global.AepIdentityPicker.getNamespace('customerEmail') || 'email').toLowerCase();
  }

  function context() {
    if (!ready) throw new Error('Lab controls are still loading.');
    const input = identifier();
    if (input && (!verified || verified.identifier !== input || verified.namespace !== namespace() || verified.sandbox !== sandbox())) {
      throw new Error('Look up the selected profile in the Lab bar before recording events. A typed identifier is not a verified profile.');
    }
    return {
      sandbox: sandbox(), target: selectedTarget(),
      email: input && verified ? verified.email : '',
      ecid: input && verified ? verified.ecid : browserEcid,
      known: !!input, url: global.location.href,
    };
  }

  function ownerKey() {
    const ctx = context();
    return [ctx.sandbox, ctx.email || 'anonymous', ctx.ecid || 'unresolved'].join('|');
  }

  function contextToken() {
    return ownerKey() + '|' + targetToken(selectedTarget()) + '|' + identifier() + '|' + namespace();
  }

  function targetToken(target) {
    return JSON.stringify(target ? [target.id, target.transport, target.dataStreamId, target.xdmStyle, target.streamingUrl] : null);
  }

  async function checkTarget(ctx) {
    const response = await global.AepDemoGeneratorTargets.labAuthFetch('/api/events/generator-targets?sandbox=' + encodeURIComponent(ctx.sandbox), { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not verify the current event target. No automatic retry was made.');
    const data = await response.json();
    if (data.sandbox !== ctx.sandbox) throw new Error('Event target verification returned a different sandbox. Reload and review the environment before continuing.');
    const current = (data.targets || []).find((target) => target.id === ctx.target.id);
    if (targetToken(current) !== targetToken(ctx.target)) throw new Error('Event tool configuration changed. Reload the page and review the target before continuing.');
  }

  function updatePreview(trip) {
    if (trip !== undefined) previewTrip = trip;
    updateCustomPreview();
    const output = byId('raPayloadPreview');
    try {
      const ctx = context();
      const body = global.RiyadhAirEvents.build(byId('raDisruptionKind').value, previewTrip || {}, ctx, {
        delayMinutes: Number(byId('raDelayMinutes').value), gate: byId('raNewGate').value.trim().toUpperCase(),
      });
      const { email, ecid, ...safeBody } = body;
      output.textContent = JSON.stringify({ ...safeBody, identity: { profile: email ? 'Verified email (hidden)' : 'Anonymous', ecid: ecid ? 'Resolved (hidden)' : 'Missing' }, datastreamId: ctx.target.dataStreamId }, null, 2);
    } catch (error) { output.textContent = error.message; }
  }

  function customEventOptions() {
    return {
      eventType: byId('raCustomEventType').value.trim(),
      trip: byId('raCustomIncludeTrip').checked ? previewTrip || {} : null,
    };
  }

  function updateCustomPreview() {
    try {
      const ctx = context();
      const options = customEventOptions();
      const body = global.RiyadhAirEvents.buildCustom(options.eventType, ctx, options);
      const { email, ecid, ...safeBody } = body;
      byId('raCustomEventPreview').textContent = JSON.stringify({
        ...safeBody, identity: email ? 'Verified email and ECID (hidden)' : 'Resolved anonymous ECID (hidden)',
        datastreamId: ctx.target.dataStreamId,
      }, null, 2);
    } catch (error) { byId('raCustomEventPreview').textContent = error.message; }
  }

  function initPresenter() {
    const panel = byId('raPresenter');
    const launcher = byId('raPresenterLauncher');
    let returnFocus = launcher;
    launcher.addEventListener('click', () => {
      returnFocus = document.activeElement;
      closeLabOverlays();
      updatePreview();
      panel.showModal();
      launcher.setAttribute('aria-expanded', 'true');
      byId('raPresenterClose').focus();
    });
    byId('raPresenterClose').addEventListener('click', () => panel.close());
    panel.addEventListener('click', (event) => {
      if (event.target !== panel) return;
      const rect = panel.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) panel.close();
    });
    panel.addEventListener('close', () => {
      launcher.setAttribute('aria-expanded', 'false');
      if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    });
    trapDialogFocus(panel);
    // Native modal dialogs provide Escape dismissal and inert siblings.
    panel.addEventListener('input', () => updatePreview());
    panel.addEventListener('change', () => updatePreview());
    byId('raResolvePresenterProfile').addEventListener('click', async () => {
      const button = byId('raResolvePresenterProfile');
      button.disabled = true;
      try { await lookup(); } catch (error) { message(error.message, true); }
      finally { button.disabled = false; }
    });
    const form = byId('raCustomEventForm');
    let customSending = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (customSending || !form.reportValidity()) return;
      const options = customEventOptions();
      customSending = true;
      const controls = [...form.querySelectorAll('input, button')];
      const disabled = controls.map((control) => control.disabled);
      controls.forEach((control) => { control.disabled = true; });
      form.setAttribute('aria-busy', 'true');
      try { await send('custom', null, options); }
      catch (error) { message(error.message, true); }
      finally {
        customSending = false;
        form.removeAttribute('aria-busy');
        controls.forEach((control, index) => { control.disabled = disabled[index]; });
      }
    });
    byId('raUncertainDelivery').hidden = !uncertain;
    if (uncertain) byId('raLastAttempt').textContent = uncertain;
    byId('raAllowRetry').addEventListener('click', () => {
      uncertain = null;
      global.sessionStorage.removeItem(uncertainKey);
      byId('raUncertainDelivery').hidden = true;
      message('Another explicit attempt is now allowed. The prior event may already exist; deduplication is not guaranteed.', false);
    });
  }

  function notifyContext() {
    const label = byId('raIdentityStatus');
    try {
      const ctx = context();
      label.textContent = (ctx.known ? 'Verified profile (identity hidden)' : 'Anonymous browser') +
        ' / ' + (ctx.sandbox || 'no sandbox') + ' / ' + (ctx.ecid ? 'ECID resolved' : 'inject Tags to resolve ECID');
    } catch (error) {
      label.textContent = error.message;
    }
    if (signedInOwner) {
      try { if (signedInOwner !== ownerKey()) signedInOwner = ''; }
      catch { signedInOwner = ''; }
      if (!signedInOwner) {
        byId('raAccountLabel').textContent = 'My profile';
        byId('raAccountButton').setAttribute('aria-label', 'My profile');
      }
    }
    global.dispatchEvent(new CustomEvent('riyadh-air-context-change'));
    updatePreview();
  }

  function invalidateIdentity() {
    bookingIdentity = '';
    verified = null;
    notifyContext();
  }

  async function reloadTargets() {
    const generation = ++targetGeneration;
    targets = [];
    const loaded = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(byId('generatorTarget'), { preferredId: 'lab-event-tool-edge' });
    if (generation !== targetGeneration) return;
    targets = loaded;
    if (!targets.length) message('No event targets loaded. Configure the selected sandbox in Event tool, then reload this page.', true);
    notifyContext();
  }

  async function lookup(value, options) {
    if (sending) throw new Error('Wait for the current event to finish before changing profiles.');
    const input = byId('customerEmail');
    if (value != null) {
      input.value = value;
      byId('riyadhNs').value = 'email';
      byId('riyadhNs').dispatchEvent(new Event('change', { bubbles: true }));
      // Namespace handlers may hydrate a previous identity; the explicit customer value wins.
      await new Promise((resolve) => global.requestAnimationFrame(resolve));
      input.value = value;
    }
    const requested = identifier();
    const requestedSandbox = sandbox();
    const requestedNamespace = namespace();
    if (!requested) throw new Error('Enter a customer identifier in the Lab bar.');
    verified = null;
    message('Looking up the selected profile...', false);
    const found = await global.DemoProfileDrawer.loadProfileDataForDrawer(requested, {
      updateMessage: true, sendApplicationLogin: false,
    });
    await identityValidation;
    if (!found || !verified || requested !== identifier() || requestedSandbox !== sandbox() || requestedNamespace !== namespace()) throw new Error('Profile lookup did not resolve a usable profile. Check the identifier, namespace and sandbox.');
    if (typeof global.setSessionIdentifier === 'function') global.setSessionIdentifier(requested, namespace());
    const resolved = verified;
    if (options && options.requireStitch && options.booking &&
      (!browserEcid || sdkSandbox !== requestedSandbox || !global.DemoTagsInjection.isAlloyReady() ||
        global.AepLabTagsInjectGuard.isInProgress('riyadhAirDemo'))) {
      throw new Error('Inject Tags for the selected environment before connecting the booking email.');
    }
    // The shared stitch prefers this display field: link the current browser, not a prior profile hint.
    if (options && options.booking) byId('infoEcid').textContent = browserEcid;
    const stitched = await tags.stitchAfterProfileLookup(resolved, resolved.email);
    if (requested !== identifier() || requestedSandbox !== sandbox() || requestedNamespace !== namespace() || resolved !== verified) throw new Error('The selected profile or environment changed during sign-in. Please try again.');
    if (options && options.requireStitch && !stitched) throw new Error('Adobe identity stitching did not confirm acceptance. Configure and inject Tags in the selected sandbox before signing in.');
    message(stitched
      ? 'Profile resolved. Tags identity stitch accepted; verify the graph in the drawer.'
      : 'Profile resolved for generator events. Tags identity stitch is not verified; inject the selected Tags library if needed.', false);
    return verified;
  }

  async function connectBookingEmail(value) {
    await api.ready;
    const email = String(value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid booking email address.');
    const beforeSandbox = sandbox();
    const beforeTarget = targetToken(selectedTarget());
    const beforeBrowserEcid = browserEcid;
    const beforeEdgeConfig = JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides());
    if (!browserEcid || sdkSandbox !== beforeSandbox || !global.DemoTagsInjection.isAlloyReady() ||
      global.AepLabTagsInjectGuard.isInProgress('riyadhAirDemo')) {
      throw new Error('Inject Tags for the selected environment before connecting the booking email.');
    }
    if (verified && bookingIdentity === contextToken() + '|' + browserEcid + '|' + beforeEdgeConfig && verified.email.toLowerCase() === email.toLowerCase()) return verified;
    const profile = await lookup(email, { requireStitch: true, booking: true });
    if (beforeSandbox !== sandbox() || beforeTarget !== targetToken(selectedTarget()) || beforeBrowserEcid !== browserEcid ||
      beforeEdgeConfig !== JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides())) {
      throw new Error('The booking environment changed while connecting your email. Review the selected profile before continuing.');
    }
    if (profile.email.toLowerCase() !== email.toLowerCase()) throw new Error('The resolved profile email does not match the booking email.');
    bookingIdentity = contextToken() + '|' + browserEcid + '|' + beforeEdgeConfig;
    return profile;
  }

  async function send(action, trip, options) {
    await api.ready;
    if (sending) throw new Error('An event is already in progress. Wait before sending another interaction.');
    if (uncertain) {
      const error = new Error('Previous delivery is uncertain. Reconcile profile activity in Presenter controls before explicitly allowing another attempt.');
      error.customerMessage = 'Your last action could not be confirmed. Please ask the presenter to check before trying again.';
      throw error;
    }
    let token, ctx, body;
    try {
      token = contextToken();
      ctx = context();
      body = action === 'custom'
        ? global.RiyadhAirEvents.buildCustom(options && options.eventType, ctx, options)
        : global.RiyadhAirEvents.build(action, trip, ctx, options);
    } catch (error) {
      error.customerMessage = 'We could not complete this action. Please ask the presenter to check the selected profile and environment.';
      message(error.message, true);
      throw error;
    }
    body._id = global.crypto.randomUUID();
    body.timestamp = new Date().toISOString();
    const { email, ecid, ...safeAttempt } = body;
    byId('raLastAttempt').textContent = JSON.stringify({ ...safeAttempt, identity: 'Identity values hidden; inspect the selected profile in the shared drawer.' }, null, 2);
    sending = true;
    let submitted = false;
    let accepted = false;
    let rejected = false;
    message('Recording ' + body.eventType + '...', false);
    try {
      await checkTarget(ctx);
      if (token !== contextToken()) throw new Error('Identity or environment changed before sending. No event was sent.');
      submitted = true;
      const response = await global.AepDemoGeneratorTargets.labAuthFetch('/api/events/generator', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      rejected = response.status >= 400 && response.status < 500;
      const data = await response.json();
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || data.message || 'Event API did not confirm acceptance.');
      }
      accepted = true;
      const receipt = data.requestId || data.eventId || body._id;
      recordDelivery(body.eventType + ' / ' + ctx.sandbox + ' / accepted / ' + receipt);
      if (token !== contextToken()) {
        throw new Error('Event was accepted for the previous identity/environment. Local journey was not advanced. Restore that environment to continue.');
      }
      await checkTarget(ctx);
      if (token !== contextToken()) throw new Error('Identity or environment changed during target verification. Local journey was not advanced.');
      message('Accepted: ' + body.eventType + '. Profile ingestion and AJO execution are not yet verified. Receipt: ' + receipt, false);
      void refreshActivity(ctx).catch((error) => {
        message('Event accepted, but profile activity could not be refreshed: ' + error.message, true);
      });
      return data;
    } catch (error) {
      if (submitted && !rejected) {
        uncertain = JSON.stringify({ id: body._id, eventType: body.eventType, sandbox: ctx.sandbox, targetId: body.targetId, timestamp: body.timestamp, accepted });
        global.sessionStorage.setItem(uncertainKey, uncertain);
        byId('raUncertainDelivery').hidden = false;
      }
      recordDelivery(body.eventType + ' / ' + ctx.sandbox + ' / ' +
        (accepted ? 'API accepted; local state not advanced' : rejected ? 'API rejected' : submitted ? 'delivery uncertain' : 'not sent') +
        ' / attempt ' + body._id + ' / ' + error.message);
      error.customerMessage = submitted && !rejected
        ? 'We could not confirm this action. Your trip is unchanged here; please ask the presenter to check before trying again.'
        : 'We could not complete this action. Your trip has not changed. Please check with the presenter and try again.';
      message(error.message || 'Event delivery failed. Check the connection and selected target.', true);
      throw error;
    } finally {
      sending = false;
    }
  }

  async function refreshActivity(suppliedContext) {
    const ctx = suppliedContext || context();
    if (!ctx.ecid) throw new Error('Resolve a profile or browser ECID before refreshing activity.');
    await global.DemoProfileDrawer.refreshDrawerEventsForIdentity(ctx.ecid, 'ecid');
  }

  async function validateIdentity(detail) {
    bookingIdentity = '';
    verified = null;
    const requestedSandbox = sandbox();
    const requestedNamespace = namespace();
    if (!detail.found || detail.identifier !== identifier() || detail.namespace !== requestedNamespace) {
      notifyContext();
      return;
    }
    // The drawer may merge a previous ECID for display. Resolve raw identity independently.
    const query = new URLSearchParams({ identifier: detail.identifier, namespace: requestedNamespace, sandbox: requestedSandbox });
    const response = await global.AepDemoGeneratorTargets.labAuthFetch('/api/profile/consent?' + query);
    const data = await response.json();
    if (!response.ok || !data.found) throw new Error(data.error || 'Selected profile was not found during identity verification.');
    if (requestedSandbox !== sandbox() || detail.identifier !== identifier() || requestedNamespace !== namespace()) return;
    const ecid = Array.isArray(data.ecid) ? String(data.ecid[0] || '') : String(data.ecid || '');
    if (!/^\d{10,}$/.test(ecid) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) {
      throw new Error('The selected profile must have its own email and ECID; a previous browser or profile identity will not be substituted.');
    }
    verified = {
      identifier: detail.identifier, namespace: requestedNamespace, sandbox: requestedSandbox,
      email: data.email.trim(), ecid, firstName: data.firstName || '', lastName: data.lastName || '',
    };
    notifyContext();
  }

  async function run() {
    initPresenter();
    initAccount();
    await global.envBar.ready();
    if (!byId('customerEmail') || !global.DemoTagsInjection || !global.DemoProfileDrawer) {
      throw new Error('Shared Lab components did not load. Reload the page and check the local asset server.');
    }
    global.AepIdentityPicker.init('customerEmail', 'riyadhNs');
    global.attachEmailDatalist('customerEmail', 'recentEmails', 'riyadhNs');
    global.hydrateIdentifierFromSession('customerEmail', 'riyadhNs');
    const toolbar = document.querySelector('#riyadhDemoTopAnchor .lab-env-toolbar');
    if (toolbar) {
      const reserveToolbarSpace = () => document.body.style.setProperty('--ra-lab-inset', Math.ceil(toolbar.getBoundingClientRect().height) + 'px');
      new ResizeObserver(reserveToolbarSpace).observe(toolbar);
      reserveToolbarSpace();
    }
    global.__siteCloneSuppressBcEnable = true;
    byId('riyadhInjectSdkBtn').addEventListener('click', () => { global.__siteCloneSuppressBcEnable = false; }, true);
    const webPushDesired = () => !!byId('riyadhWebPushOnInjectToggle').checked;
    tags = global.DemoTagsInjection.init({
      storagePrefix: 'riyadhAirDemo', identityEventType: 'riyadhAir.identity.stitch',
      identityStitchLabEdgeContext: true,
      messageSetter: (text, type) => message(text, type === 'error'),
      infoEcidId: 'infoEcid', tagsCompanyId: 'riyadhTagsCompany',
      tagsPropertyInputId: 'riyadhTagsProperty', tagsPropertyListId: 'riyadhTagsPropertyList',
      tagsEnvironmentId: 'riyadhTagsEnvironment', injectButtonId: 'riyadhInjectSdkBtn',
      selectedScriptId: 'riyadhSelectedScript', configFieldsId: 'riyadhSdkConfigFields',
      configSummaryId: 'riyadhSdkConfigSummary', configSummaryTextId: 'riyadhSdkConfigSummaryText',
      changeConfigButtonId: 'riyadhChangeSdkConfigBtn', hideTagsCompanyUi: true,
      iframeIds: [], getEmail: () => verified ? verified.email : '',
      // Do not give Tags a generator target: its anonymous page view must not be mirrored twice.
      onEcidResolved: (ecid) => { browserEcid = String(ecid); sdkSandbox = sandbox(); notifyContext(); },
      webPush: { enabled: true, subscribeAfterInject: webPushDesired, requestPermissionOnInject: webPushDesired },
      brandConcierge: {
        enabled: () => !!byId('riyadhBcOnInjectToggle').checked,
        styleKey: () => byId('riyadhBcStyleSelect').value,
        suppressEnable: () => !!global.__siteCloneSuppressBcEnable,
      },
    });
    global.envBar.registerTagsInjection(tags);
    global.DemoProfileDrawer.init({
      emailInputId: 'customerEmail', profileOpenClass: 'aep-profile-drawer-open',
      viewName: 'Riyadh Air', emailGetter: identifier,
      messageSetter: (text, type) => message(text, type === 'error'),
      getSelectedGeneratorTarget: selectedTarget, fetchBrowserEcidOnInit: false,
    });
    global.addEventListener('aep-profile-drawer-loaded', (event) => {
      identityValidation = validateIdentity(event.detail).catch((error) => {
        verified = null;
        notifyContext();
        message(error.message, true);
      });
    });
    byId('customerEmail').addEventListener('input', invalidateIdentity);
    byId('customerEmail').addEventListener('change', invalidateIdentity);
    byId('riyadhNs').addEventListener('change', invalidateIdentity);
    byId('generatorTarget').addEventListener('change', notifyContext);
    global.addEventListener('aep-global-sandbox-change', () => {
      browserEcid = '';
      invalidateIdentity();
    });
    byId('queryProfileBtn').addEventListener('click', () => { void lookup().catch((error) => message(error.message, true)); });
    byId('riyadhWebPushRetryBtn').addEventListener('click', () => {
      void global.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'riyadhAirDemo' })
        .then((ok) => message(ok ? 'Web push subscription submitted; AJO delivery is not verified.' : 'Web push registration did not complete. Check permission, Tags and your configured AJO surface.', !ok))
        .catch((error) => message(error.message, true));
    });
    byId('raRefreshProfile').addEventListener('click', () => {
      void refreshActivity().catch((error) => message(error.message, true));
    });
    ready = true;
    global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(reloadTargets);
    await reloadTargets();
  }

  const api = { send, lookup, connectBookingEmail, pageView, context, ownerKey,
    environmentKey: () => sandbox() + '|' + targetToken(selectedTarget()), previewTrip: updatePreview,
    reportError: (error) => {
      message(error.message, true);
      byId('raDeliveryStatus').textContent = error.customerMessage || error.message;
      byId('raDeliveryStatus').hidden = false;
    },
    message: (text, error) => message(text, error, !!error),
    profile: () => verified, ready: null };
  global.RiyadhAirLab = api;
  api.ready = run().catch((error) => { message(error.message, true); throw error; });
})(window);
