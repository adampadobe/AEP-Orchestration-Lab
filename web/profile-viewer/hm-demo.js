(function (global) {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const events = global.HmEvents;
  const uncertainKey = 'hmUncertainDelivery';
  let targets = [], verified = null, browserEcid = '', sdkSandbox = '', tags;
  let sending = false, lookingUp = false, enabling = false, connected = false;
  let identityRevision = 0, targetRevision = 0, pageRevision = 0, contextRevision = 0;
  let identityValidation = Promise.resolve();
  let currentPage = { page: 'home', title: 'Home' };
  let uncertain = global.sessionStorage.getItem(uncertainKey);
  let sdkUsable = false;
  const sandbox = () => global.AepDemoGeneratorTargets?.getSandboxName() || '';
  const identifier = () => String(byId('customerEmail')?.value || '').trim();
  const namespace = () => String(global.AepIdentityPicker?.getNamespace('customerEmail') || 'email').toLowerCase();
  const selectedTarget = () => targets.find((target) => target.id === byId('generatorTarget')?.value) || null;
  const targetToken = (target) => JSON.stringify(target ? [target.id, target.transport, target.dataStreamId, target.xdmStyle] : null);
  const overrides = () => global.DemoLabEdgeConfig?.edgeConfigOverrides() || {};
  function requireVisitor() {
    if (global.AepDemoVisitorReset?.isBlocked()) throw new Error('Visitor reset is unverified. Complete New visitor before continuing.');
  }
  function scope() {
    return (connected ? 'connected:' : 'preview:') + sandbox() + ':' + (sdkUsable && sdkSandbox === sandbox() ? browserEcid : 'local');
  }
  function token() {
    return JSON.stringify([scope(), targetToken(selectedTarget()), identifier(), namespace(), identityRevision, contextRevision, overrides()]);
  }
  function context() {
    requireVisitor();
    if (!connected) throw new Error('Preview mode: enable Record interactions to Adobe in Presenter controls.');
    if (!sdkUsable || sdkSandbox !== sandbox() || !global.DemoTagsInjection.isAlloyReady() ||
      global.AepLabTagsInjectGuard?.isInProgress('hmDemo')) {
      throw new Error('Inject Tags for the selected sandbox before connecting tracking.');
    }
    if (identifier() && (!verified?.stitched || verified.identifier !== identifier() ||
      verified.namespace !== namespace() || verified.sandbox !== sandbox())) {
      throw new Error('Look up and stitch the selected profile, or clear the identifier for anonymous browsing.');
    }
    const target = selectedTarget();
    if (!target?.dataStreamId || overrides().edgeConfigOverrides?.datastreamId !== target.dataStreamId) {
      throw new Error('Select the Event tool datastream in the Lab Adobe Target override so all transports use the same context.');
    }
    return { sandbox: sandbox(), ecid: browserEcid, known: !!identifier(), email: verified?.stitched ? verified.email : '', target, page: currentPage.page };
  }
  function message(text, error) {
    const output = byId('hmPresenterStatus');
    if (output) { output.textContent = text; output.dataset.error = String(!!error); }
  }
  function reportError(error) {
    message(error.message, true);
    const output = byId('hmSiteStatus');
    if (output) { output.hidden = false; output.textContent = error.message; }
  }
  function record(text) {
    const row = document.createElement('li');
    row.textContent = text;
    byId('hmEventLog').prepend(row);
    while (byId('hmEventLog').children.length > 15) byId('hmEventLog').lastElementChild.remove();
  }
  function notify() {
    byId('hmIdentityStatus').textContent = (connected ? 'Connected mode' : 'Preview: no shopping events sent') +
      ' / ' + (sandbox() || 'no sandbox') + ' / ' + (verified?.stitched ? 'verified customer' : 'anonymous visitor');
    global.dispatchEvent(new CustomEvent('hm-context-change'));
  }
  function invalidateIdentity() {
    ++identityRevision;
    verified = null;
    notify();
  }
  async function getJson(url) {
    const response = await global.AepDemoGeneratorTargets.labAuthFetch(url, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Could not verify the selected Lab configuration.');
    return data;
  }
  async function checkTarget(ctx) {
    const data = await getJson('/api/events/generator-targets?sandbox=' + encodeURIComponent(ctx.sandbox));
    if (data.sandbox !== ctx.sandbox ||
      targetToken((data.targets || []).find((target) => target.id === ctx.target.id)) !== targetToken(ctx.target)) {
      throw new Error('Event configuration changed. Review the current sandbox and target before continuing.');
    }
  }
  async function checkSchema(ctx) {
    const config = await getJson('/api/events/config?sandbox=' + encodeURIComponent(ctx.sandbox));
    if (!config.record?.schemaId || config.record.datastreamId !== ctx.target.dataStreamId) {
      throw new Error('Save the matching datastream and schema in Event tool before recording H&M events.');
    }
    const query = new URLSearchParams({ sandbox: ctx.sandbox, schemaId: config.record.schemaId });
    const data = await getJson('/api/schema-viewer/registry?' + query);
    const missing = events.missingSchemaPaths(data.schema);
    if (missing.length) {
      throw new Error('The selected event schema is missing H&M measurement fields or their required types: ' + missing.join(', ') +
        '. No schema was changed. Use preview until the schema is reviewed.');
    }
  }
  async function refreshActivity() {
    const ctx = context();
    await global.DemoProfileDrawer.refreshDrawerEventsForIdentity(ctx.ecid, 'ecid');
  }
  function setUncertain(detail) {
    uncertain = JSON.stringify(detail);
    global.sessionStorage.setItem(uncertainKey, uncertain);
    byId('hmUncertainDelivery').hidden = false;
  }
  async function interact(type, payload) {
    requireVisitor();
    if (uncertain) throw new Error('Previous delivery is uncertain. Check profile activity and explicitly allow another attempt in Presenter controls.');
    if (sending || lookingUp || enabling) throw new Error('Wait for the current Lab operation.');
    if (!connected) {
      const preview = events.build(type, payload, {
        sandbox: sandbox() || 'preview', ecid: '00000000000000000000000000000000000000', known: false,
        target: { id: 'lab-event-tool-edge', transport: 'edge', dataStreamId: 'preview-only' }, page: currentPage.page,
      });
      byId('hmPayloadPreview').textContent = 'PREVIEW ONLY - not sent\n' + JSON.stringify(events.redact(preview), null, 2);
      message('Preview only: this action stays in the local storefront. Nothing was sent to Adobe.', false);
      return { preview: true };
    }
    const before = token();
    await api.ready;
    if (sending || lookingUp || enabling || before !== token()) throw new Error('The Lab operation or context changed while waiting. Nothing was sent.');
    const ctx = context();
    const body = events.build(type, payload, ctx);
    body._id = global.crypto.randomUUID();
    body.timestamp = new Date().toISOString();
    const redacted = JSON.stringify(events.redact(body), null, 2);
    byId('hmPayloadPreview').textContent = redacted;
    byId('hmLastAttempt').textContent = redacted;
    let submitted = false, accepted = false, rejected = false;
    sending = true;
    try {
      await checkTarget(ctx);
      await checkSchema(ctx);
      requireVisitor();
      if (before !== token()) throw new Error('Identity or environment changed before delivery. Nothing was sent.');
      submitted = true;
      const response = await global.AepDemoGeneratorTargets.labAuthFetch('/api/events/generator', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      rejected = response.status >= 400 && response.status < 500;
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'The event service did not confirm acceptance.');
      accepted = true;
      await checkTarget(ctx);
      if (before !== token()) throw new Error('The event was accepted for the previous context. Reconcile activity before continuing.');
      record(body.eventType + ' / ' + ctx.sandbox + ' / accepted / ' + (data.requestId || body._id));
      message('Event accepted. Profile ingestion, audience membership and AJO execution are not yet verified.', false);
      return data;
    } catch (error) {
      if (submitted && !rejected) setUncertain({ id: body._id, eventType: body.eventType, sandbox: ctx.sandbox, timestamp: body.timestamp, accepted });
      record(body.eventType + ' / ' + (accepted ? 'accepted, local state not advanced' : rejected ? 'rejected' : submitted ? 'uncertain' : 'not sent'));
      reportError(error);
      throw error;
    } finally { sending = false; }
  }
  async function pageView(page) {
    currentPage = page;
    if (!connected || enabling || uncertain) return;
    const revision = ++pageRevision;
    try {
      await api.ready;
      const ctx = context(), before = token();
      const xdm = {
        eventType: 'web.webPageDetails.pageViews',
        web: { webPageDetails: { name: 'Web page view - ' + page.title, URL: events.canonicalUrl(page.page), pageViews: { value: 1 } } },
        identityMap: { ECID: [{ id: ctx.ecid, primary: true, authenticatedState: ctx.known ? 'authenticated' : 'ambiguous' }] },
        _demoemea: { identification: { core: { ecid: ctx.ecid } } },
      };
      if (ctx.known) xdm.identityMap.Email = [{ id: ctx.email, primary: false, authenticatedState: 'authenticated' }];
      if (revision !== pageRevision) return;
      await global.alloy('sendEvent', { ...overrides(), xdm });
      if (before !== token()) throw new Error('Page view submitted for the previous context. Check activity; it was not retried.');
      record('Page view / SDK accepted / ' + page.title);
    } catch (error) { message('Page view not confirmed: ' + error.message, true); }
  }
  function bindingKey() { return 'hmBrowserCustomer:' + sandbox() + ':' + browserEcid; }
  function assertCustomer(email) {
    const bound = global.localStorage.getItem(bindingKey());
    if (bound && bound !== email.toLowerCase()) {
      throw new Error('This browser is already linked to another customer. Use New visitor before switching people.');
    }
  }
  async function validateIdentity(detail) {
    const revision = ++identityRevision;
    verified = null;
    if (!detail?.found || detail.identifier !== identifier() || detail.namespace !== namespace()) return;
    const requestedSandbox = sandbox(), requested = identifier(), requestedNamespace = namespace();
    const query = new URLSearchParams({ sandbox: requestedSandbox, identifier: requested, namespace: requestedNamespace });
    const data = await getJson('/api/profile/consent?' + query);
    if (!data.found || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) throw new Error('Profile lookup did not resolve a valid email.');
    if (revision !== identityRevision || requestedSandbox !== sandbox() || requested !== identifier() || requestedNamespace !== namespace()) {
      throw new Error('Identity changed during lookup.');
    }
    requireVisitor();
    verified = { identifier: requested, namespace: requestedNamespace, sandbox: requestedSandbox, email: data.email.trim(),
      firstName: String(data.firstName || ''), lastName: String(data.lastName || ''), ecid: browserEcid, stitched: false };
  }
  async function connect(email) {
    await api.ready;
    requireVisitor();
    if (sending || lookingUp || enabling) throw new Error('Wait for the current Lab operation before connecting a customer.');
    if (!sdkUsable || sdkSandbox !== sandbox() || !global.DemoTagsInjection.isAlloyReady()) throw new Error('Inject Tags for this sandbox before connecting an existing synthetic profile.');
    if (uncertain) throw new Error('Reconcile uncertain delivery before connecting a customer.');
    lookingUp = true;
    let stitchAttempted = false;
    try {
      if (email !== undefined) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) throw new Error('Enter a valid synthetic profile email.');
        byId('hmNs').value = 'email';
        byId('hmNs').dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => global.requestAnimationFrame(resolve));
        byId('customerEmail').value = email.trim();
      }
      const requested = identifier(), requestedSandbox = sandbox(), requestedNamespace = namespace();
      const initialBrowser = browserEcid, initialOverrides = JSON.stringify(overrides());
      const target = selectedTarget();
      if (!requested) throw new Error('Enter an existing synthetic profile identifier.');
      if (!target?.dataStreamId || overrides().edgeConfigOverrides?.datastreamId !== target.dataStreamId) throw new Error('Select the matching Event tool Adobe Target datastream override before identity stitching.');
      if (requestedNamespace === 'email') assertCustomer(requested);
      verified = null;
      const found = await global.DemoProfileDrawer.loadProfileDataForDrawer(requested, { updateMessage: true, sendApplicationLogin: false });
      await identityValidation;
      const resolved = verified;
      if (!found || !resolved || requested !== identifier() || requestedSandbox !== sandbox() || requestedNamespace !== namespace()) throw new Error('Profile lookup did not resolve the selected identity.');
      if (requestedNamespace === 'email' && resolved.email.toLowerCase() !== requested.toLowerCase()) throw new Error('The resolved email does not match the selected email.');
      assertCustomer(resolved.email);
      if (initialBrowser !== browserEcid || !sdkUsable || sdkSandbox !== requestedSandbox ||
        initialOverrides !== JSON.stringify(overrides()) || global.AepLabTagsInjectGuard?.isInProgress('hmDemo')) {
        throw new Error('SDK or datastream changed during profile lookup. Nothing was stitched.');
      }
      // Bind before the stitch: a lost response cannot undo an identity link already sent.
      global.localStorage.setItem(bindingKey(), resolved.email.toLowerCase());
      byId('infoEcid').textContent = browserEcid;
      stitchAttempted = true;
      const stitched = await tags.stitchAfterProfileLookup(resolved, resolved.email);
      requireVisitor();
      if (!stitched || resolved !== verified || initialBrowser !== browserEcid || requestedSandbox !== sandbox() ||
        requested !== identifier() || requestedNamespace !== namespace() || initialOverrides !== JSON.stringify(overrides())) {
        throw new Error('Identity stitching was not confirmed for the current context. Check activity before another attempt.');
      }
      resolved.stitched = true;
      notify();
      message('Existing profile connected to this browser. Check Profile activity to verify ingestion.', false);
      return resolved;
    } catch (error) {
      if (stitchAttempted) setUncertain({ eventType: 'hm.identity.stitch', sandbox: sdkSandbox, timestamp: new Date().toISOString() });
      throw error;
    } finally { lookingUp = false; }
  }
  async function reloadTargets() {
    const revision = ++targetRevision;
    const loaded = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(byId('generatorTarget'), { preferredId: 'lab-event-tool-edge' });
    if (revision !== targetRevision) return;
    targets = loaded;
    if (!targets.length) message('No event targets loaded. Preview shopping is available; configure Event tool before recording.', true);
  }
  function initPresenter() {
    const dialog = byId('hmPresenter'), launcher = byId('hmPresenterLauncher');
    launcher.addEventListener('click', () => {
      global.EnvBarCompact?.closeOverlay({ force: true });
      global.ProfileViewerModal?.close();
      dialog.showModal();
      launcher.setAttribute('aria-expanded', 'true');
    });
    byId('hmPresenterClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { launcher.setAttribute('aria-expanded', 'false'); launcher.focus(); });
    byId('hmConnected').addEventListener('change', async (event) => {
      if (sending || lookingUp || enabling || uncertain) {
        event.target.checked = connected;
        reportError(new Error('Finish or reconcile the current operation before changing tracking mode.'));
        return;
      }
      if (!event.target.checked) { connected = false; ++contextRevision; notify(); return; }
      enabling = true;
      ++contextRevision;
      connected = true;
      try {
        await api.ready;
        const before = token(), ctx = context();
        await checkTarget(ctx);
        await checkSchema(ctx);
        if (before !== token()) throw new Error('The environment changed while enabling tracking.');
        message('Tracking enabled for subsequent actions. Preview activity is not replayed.', false);
      } catch (error) {
        connected = false;
        event.target.checked = false;
        reportError(error);
      } finally { enabling = false; notify(); }
    });
    byId('hmUncertainDelivery').hidden = !uncertain;
    if (uncertain) byId('hmLastAttempt').textContent = uncertain;
    byId('hmAllowRetry').addEventListener('click', () => {
      if (sending || lookingUp || enabling) { reportError(new Error('Wait for the current operation.')); return; }
      uncertain = null;
      global.sessionStorage.removeItem(uncertainKey);
      byId('hmUncertainDelivery').hidden = true;
      message('Another explicit attempt is allowed. The previous event may already exist; nothing was replayed.', false);
    });
    byId('hmRefreshProfile').addEventListener('click', () => void refreshActivity().catch(reportError));
    byId('hmResetVisitor')?.addEventListener('click', () => {
      void global.AepDemoVisitorReset.reset().catch(reportError);
    });
  }
  async function run() {
    initPresenter();
    await global.envBar.ready();
    global.AepIdentityPicker.init('customerEmail', 'hmNs');
    global.attachEmailDatalist('customerEmail', 'recentEmails', 'hmNs');
    const webPushDesired = () => !!byId('hmWebPushOnInjectToggle')?.checked;
    global.__siteCloneSuppressBcEnable = true;
    byId('hmInjectSdkBtn').addEventListener('click', () => { global.__siteCloneSuppressBcEnable = false; }, true);
    tags = global.DemoTagsInjection.init({
      storagePrefix: 'hmDemo', identityEventType: 'hm.identity.stitch', identityStitchLabEdgeContext: true,
      messageSetter: (text, type) => message(text, type === 'error'),
      infoEcidId: 'infoEcid', tagsCompanyId: 'hmTagsCompany',
      tagsPropertyInputId: 'hmTagsProperty', tagsPropertyListId: 'hmTagsPropertyList',
      tagsEnvironmentId: 'hmTagsEnvironment', injectButtonId: 'hmInjectSdkBtn',
      selectedScriptId: 'hmSelectedScript', configFieldsId: 'hmSdkConfigFields',
      configSummaryId: 'hmSdkConfigSummary', configSummaryTextId: 'hmSdkConfigSummaryText',
      changeConfigButtonId: 'hmChangeSdkConfigBtn', hideTagsCompanyUi: true,
      iframeIds: [], getEmail: () => verified?.stitched ? verified.email : '',
      onEcidResolved(ecid) {
        if (global.AepDemoVisitorReset?.isBlocked()) return;
        if (browserEcid && browserEcid !== String(ecid)) verified = null;
        browserEcid = String(ecid); sdkSandbox = sandbox(); sdkUsable = true; notify();
      },
      webPush: { enabled: true, subscribeAfterInject: webPushDesired, requestPermissionOnInject: webPushDesired },
      brandConcierge: {
        enabled: () => !!byId('hmBcOnInjectToggle')?.checked,
        styleKey: () => byId('hmBcStyleSelect')?.value || 'generic',
        suppressEnable: () => !!global.__siteCloneSuppressBcEnable,
      },
    });
    global.envBar.registerTagsInjection(tags);
    global.DemoProfileDrawer.init({
      emailInputId: 'customerEmail', profileOpenClass: 'aep-profile-drawer-open', viewName: 'H&M UAE',
      emailGetter: identifier, messageSetter: (text, type) => message(text, type === 'error'),
      getSelectedGeneratorTarget: selectedTarget, fetchBrowserEcidOnInit: false,
    });
    global.addEventListener('aep-profile-drawer-loaded', (event) => {
      identityValidation = validateIdentity(event.detail).catch((error) => { verified = null; reportError(error); });
    });
    byId('customerEmail').addEventListener('input', invalidateIdentity);
    byId('customerEmail').addEventListener('change', invalidateIdentity);
    byId('hmNs').addEventListener('change', invalidateIdentity);
    byId('queryProfileBtn').addEventListener('click', () => void connect().catch(reportError));
    byId('generatorTarget').addEventListener('change', () => {
      ++contextRevision;
      connected = false; byId('hmConnected').checked = false; invalidateIdentity();
    });
    global.addEventListener('aep-global-sandbox-change', () => {
      ++contextRevision;
      sdkUsable = false; browserEcid = ''; sdkSandbox = ''; connected = false;
      byId('hmConnected').checked = false;
      invalidateIdentity();
    });
    byId('hmWebPushRetryBtn').addEventListener('click', () => {
      void global.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'hmDemo' })
        .then((ok) => { if (!ok) throw new Error('Web push registration did not complete. Check permission and Tags.'); message('Web push registration accepted; AJO delivery is not verified.', false); })
        .catch(reportError);
    });
    global.AepDemoVisitorReset.registerAdapter({
      beforeReset() {
        if (sending || lookingUp || enabling || global.HmStore?.isBusy?.()) throw new Error('Wait for the current H&M operation before resetting.');
        if (uncertain) throw new Error('Reconcile uncertain delivery before resetting the visitor.');
      },
      invalidate() {
        global.HmStore?.reset();
        sdkUsable = false; browserEcid = ''; sdkSandbox = ''; verified = null;
        ++identityRevision;
        byId('customerEmail').value = '';
        connected = false; byId('hmConnected').checked = false;
        notify();
      },
      afterReset({ ecid }) {
        browserEcid = String(ecid || ''); sdkSandbox = browserEcid ? sandbox() : '';
        sdkUsable = !!browserEcid; notify();
      },
    });
    global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(() => void reloadTargets().catch(reportError));
    await reloadTargets();
    notify();
  }
  const api = { ready: null, interact, pageView, connect, context, scope, profile: () => verified?.stitched ? verified : null,
    connected: () => connected, reportError };
  global.HmLab = api;
  api.ready = run();
  void api.ready.catch((error) => { reportError(new Error('Lab controls unavailable; preview shopping still works. ' + error.message)); });
})(window);
