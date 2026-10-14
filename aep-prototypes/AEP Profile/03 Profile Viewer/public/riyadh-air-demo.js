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
    const output = byId('raPayloadPreview');
    try {
      const ctx = context();
      const body = global.RiyadhAirEvents.build(byId('raDisruptionKind').value, previewTrip || {}, ctx, {
        delayMinutes: Number(byId('raDelayMinutes').value), gate: byId('raNewGate').value.trim().toUpperCase(),
        eventID: byId('raOrchestrationId').value.trim(),
      });
      const { email, ecid, ...safeBody } = body;
      output.textContent = JSON.stringify({ ...safeBody, identity: { profile: email ? 'Verified email (hidden)' : 'Anonymous', ecid: ecid ? 'Resolved (hidden)' : 'Missing' }, datastreamId: ctx.target.dataStreamId }, null, 2);
    } catch (error) { output.textContent = error.message; }
  }

  function initPresenter() {
    const panel = byId('raPresenter');
    const launcher = byId('raPresenterLauncher');
    let returnFocus = launcher;
    launcher.addEventListener('click', () => {
      returnFocus = document.activeElement;
      if (global.EnvBarCompact) global.EnvBarCompact.closeOverlay({ force: true });
      if (global.ProfileViewerModal) global.ProfileViewerModal.close();
      if (global.BrandConciergeMidrailPanel && global.BrandConciergeMidrailPanel._handle) global.BrandConciergeMidrailPanel._handle.setOpen(false);
      const decisionClose = byId('dpmPanelClose');
      if (decisionClose) decisionClose.click();
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
    // Native modal dialogs provide Escape dismissal and inert siblings.
    panel.addEventListener('input', () => updatePreview());
    panel.addEventListener('change', () => updatePreview());
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
    global.dispatchEvent(new CustomEvent('riyadh-air-context-change'));
    updatePreview();
  }

  function invalidateIdentity() {
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

  async function lookup(value) {
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
    if (!requested) throw new Error('Enter a customer identifier in the Lab bar.');
    verified = null;
    message('Looking up the selected profile...', false);
    const found = await global.DemoProfileDrawer.loadProfileDataForDrawer(requested, {
      updateMessage: true, sendApplicationLogin: false,
    });
    await identityValidation;
    if (!found || !verified) throw new Error('Profile lookup did not resolve a usable profile. Check the identifier, namespace and sandbox.');
    if (typeof global.setSessionIdentifier === 'function') global.setSessionIdentifier(requested, namespace());
    const stitched = await tags.stitchAfterProfileLookup(verified, verified.email);
    message(stitched
      ? 'Profile resolved. Tags identity stitch accepted; verify the graph in the drawer.'
      : 'Profile resolved for generator events. Tags identity stitch is not verified; inject the selected Tags library if needed.', false);
    return verified;
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
      body = global.RiyadhAirEvents.build(action, trip, ctx, options);
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
      messageSetter: (text, type) => message(text, type === 'error'),
      infoEcidId: 'infoEcid', tagsCompanyId: 'riyadhTagsCompany',
      tagsPropertyInputId: 'riyadhTagsProperty', tagsPropertyListId: 'riyadhTagsPropertyList',
      tagsEnvironmentId: 'riyadhTagsEnvironment', injectButtonId: 'riyadhInjectSdkBtn',
      selectedScriptId: 'riyadhSelectedScript', configFieldsId: 'riyadhSdkConfigFields',
      configSummaryId: 'riyadhSdkConfigSummary', configSummaryTextId: 'riyadhSdkConfigSummaryText',
      changeConfigButtonId: 'riyadhChangeSdkConfigBtn', hideTagsCompanyUi: true,
      iframeIds: [], getEmail: () => verified ? verified.email : '',
      // Do not give Tags a generator target: its anonymous page view must not be mirrored twice.
      onEcidResolved: (ecid) => { browserEcid = String(ecid); notifyContext(); },
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

  const api = { send, lookup, context, ownerKey, previewTrip: updatePreview,
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
