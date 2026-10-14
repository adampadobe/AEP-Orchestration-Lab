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

  function message(text, error) {
    const status = byId('raDeliveryStatus');
    status.textContent = text;
    status.dataset.error = String(!!error);
    const strip = byId('riyadhMessage');
    if (strip) {
      strip.textContent = text;
      strip.hidden = !text;
    }
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
    return ownerKey() + '|' + String(selectedTarget() && selectedTarget().id || '') + '|' + identifier() + '|' + namespace();
  }

  function notifyContext() {
    const label = byId('raIdentityStatus');
    try {
      const ctx = context();
      label.textContent = (ctx.known ? 'Verified profile: ' + ctx.email : 'Anonymous browser') +
        ' / ' + (ctx.sandbox || 'no sandbox') + ' / ' + (ctx.ecid ? 'ECID resolved' : 'inject Tags to resolve ECID');
    } catch (error) {
      label.textContent = error.message;
    }
    global.dispatchEvent(new CustomEvent('riyadh-air-context-change'));
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
    const token = contextToken();
    const ctx = context();
    const body = global.RiyadhAirEvents.build(action, trip, ctx, options);
    body._id = global.crypto.randomUUID();
    body.timestamp = new Date().toISOString();
    sending = true;
    message('Recording ' + body.eventType + '...', false);
    try {
      const response = await global.AepDemoGeneratorTargets.labAuthFetch('/api/events/generator', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || data.message || 'Event API did not confirm acceptance.');
      const receipt = data.requestId || data.eventId || body._id;
      const row = document.createElement('li');
      row.textContent = body.eventType + ' / ' + ctx.sandbox + ' / accepted / ' + receipt;
      byId('raEventLog').prepend(row);
      while (byId('raEventLog').children.length > 12) byId('raEventLog').lastElementChild.remove();
      if (token !== contextToken()) {
        throw new Error('Event was accepted for the previous identity/environment. Local journey was not advanced. Restore that environment to continue.');
      }
      message('Accepted: ' + body.eventType + '. Profile ingestion and AJO execution are not yet verified. Receipt: ' + receipt, false);
      void refreshActivity(ctx).catch((error) => {
        message('Event accepted, but profile activity could not be refreshed: ' + error.message, true);
      });
      return data;
    } catch (error) {
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

  const api = { send, lookup, context, ownerKey, message, profile: () => verified, ready: null };
  global.RiyadhAirLab = api;
  api.ready = run().catch((error) => { message(error.message, true); throw error; });
})(window);
