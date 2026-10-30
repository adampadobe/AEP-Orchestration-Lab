(function (global) {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const events = global.VuseItaliaEvents;
  const uncertainKey = 'vuseUncertainDelivery';
  let uncertain = global.sessionStorage.getItem(uncertainKey);
  let targets = [], verified = null, browserEcid = '', sdkSandbox = '', tags = null;
  let ready = false, sending = false, lookingUp = false, generation = 0, identityRevision = 0;
  let identityValidation = Promise.resolve(), queue = Promise.resolve();
  let currentPage = { page: 'home', title: 'Home', url: 'https://www.vuse.com/it/it/' };
  let lastInteraction = null;
  let routingRevision = 0, settingNamespace = false;
  let visitorRevision = 0;
  let customerBusy = false, frameReady = false;
  const completedRequests = new Map();
  const bindingKey = () => 'vuseBrowserCustomer:' + sandbox() + ':' + browserEcid;

  const visitorBlocked = () => !!global.AepDemoVisitorReset?.isBlocked();
  function requireVisitor() {
    if (visitorBlocked()) throw new Error('Visitor reset is pending or this tab is invalidated. Finish the reset before continuing.');
  }
  const sandbox = () => global.AepDemoGeneratorTargets.getSandboxName();
  const identifier = () => String(byId('customerEmail')?.value || '').trim();
  const namespace = () => String(global.AepIdentityPicker.getNamespace('customerEmail') || 'email').toLowerCase();
  const selectedTarget = () => targets.find((target) => target.id === byId('generatorTarget')?.value) || null;
  const targetToken = (target) => JSON.stringify(target ? [target.id, target.transport, target.dataStreamId, target.xdmStyle, target.streamingUrl] : null);
  function context() {
    requireVisitor();
    if (!ready) throw new Error('Lab controls are still loading.');
    const input = identifier();
    if (input && (!verified || verified.identifier !== input || verified.namespace !== namespace() || verified.sandbox !== sandbox() || !verified.stitched)) {
      throw new Error('Look up the selected profile before recording events. A typed email is not a verified identity.');
    }
    return { sandbox: sandbox(), target: selectedTarget(), known: !!input, email: input && verified ? verified.email : '',
      ecid: sdkSandbox === sandbox() ? browserEcid : '',
      page: currentPage.page, url: currentPage.url };
  }
  const routingToken = () => [sandbox(), targetToken(selectedTarget()), routingRevision].join('|');
  function contextToken() {
    return [sandbox(), targetToken(selectedTarget()), identifier(), namespace(), verified?.ecid || '', browserEcid, sdkSandbox, identityRevision].join('|');
  }
  function message(text, error) {
    byId('vusePresenterStatus').textContent = text;
    byId('vusePresenterStatus').dataset.error = String(!!error);
    const strip = byId('vuseMessage');
    if (strip) { strip.textContent = ''; strip.hidden = true; }
  }
  function record(text) {
    const row = document.createElement('li'); row.textContent = text;
    byId('vuseEventLog').prepend(row);
    while (byId('vuseEventLog').children.length > 12) byId('vuseEventLog').lastElementChild.remove();
  }
  function post(type, payload, requestId) {
    byId('vuseDemoSiteFrame').contentWindow.postMessage({ source: 'vuse-shell', type, payload, requestId }, global.location.origin);
  }
  function notifyIdentity() {
    post('identity', { email: verified?.stitched ? verified.email : '', firstName: verified?.stitched ? verified.firstName : '',
      lastName: verified?.stitched ? verified.lastName : '', signedIn: !!verified?.stitched });
  }
  function notifySiteContext() {
    if (!ready || !frameReady || !browserEcid || sdkSandbox !== sandbox() || visitorBlocked()) return;
    post('site.context', { sandbox: sandbox(), visitorKey: browserEcid });
  }
  function assertCustomerEmail(email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw new Error('Enter a valid email address.');
    const bound = global.localStorage.getItem(bindingKey());
    if (bound && bound.toLowerCase() !== email.toLowerCase()) throw new Error('This browser is already linked to another customer. Use New visitor before switching people.');
  }
  function bindCustomer(email) {
    global.localStorage.setItem(bindingKey(), email.toLowerCase());
  }
  function saveUncertain(detail) {
    uncertain = JSON.stringify(detail);
    global.sessionStorage.setItem(uncertainKey, uncertain);
    byId('vuseUncertainDelivery').hidden = false;
    byId('vuseLastAttempt').textContent = uncertain;
  }
  function logout() {
    if (customerBusy || sending || lookingUp) throw new Error('Wait for the current customer operation before signing out.');
    byId('customerEmail').value = '';
    if (typeof global.setSessionIdentifier === 'function') global.setSessionIdentifier('', 'email');
    invalidateIdentity();
    message('Signed out of the simulated account. The browser ECID and its AEP history are unchanged.', false);
  }
  function updatePreview(interaction) {
    if (interaction) lastInteraction = interaction;
    try {
      const ctx = context();
      const body = lastInteraction
        ? events.build(lastInteraction.type, lastInteraction.payload, ctx)
        : events.buildCustom(byId('vuseCustomEventType').value, ctx, JSON.parse(byId('vuseCustomPublic').value));
      byId('vusePayloadPreview').textContent = JSON.stringify(events.redact(body), null, 2);
    } catch (error) { byId('vusePayloadPreview').textContent = error.message; }
  }
  function notifyContext() {
    try {
      const ctx = context();
      byId('vuseIdentityStatus').textContent = (ctx.known ? 'Verified profile (identity hidden)' : 'Anonymous browser') + ' / ' + (ctx.sandbox || 'no sandbox') + ' / ' + (ctx.ecid ? 'ECID resolved' : 'inject Tags to resolve ECID');
    } catch (error) { byId('vuseIdentityStatus').textContent = error.message; }
    updatePreview();
  }
  function invalidateIdentity() {
    ++identityRevision;
    if (!settingNamespace) ++routingRevision;
    verified = null; notifyIdentity(); notifyContext();
  }
  async function checkTarget(ctx) {
    const response = await global.AepDemoGeneratorTargets.labAuthFetch('/api/events/generator-targets?sandbox=' + encodeURIComponent(ctx.sandbox), { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not verify the current event target. No event was sent.');
    const data = await response.json();
    if (data.sandbox !== ctx.sandbox) throw new Error('Event target returned a different sandbox.');
    const target = (data.targets || []).find((entry) => entry.id === ctx.target.id);
    if (targetToken(target) !== targetToken(ctx.target)) throw new Error('Event target configuration changed. Reload targets before continuing.');
  }
  function requireEdgeContext() {
    const target = selectedTarget();
    const overrides = global.DemoLabEdgeConfig.edgeConfigOverrides();
    if (!target?.dataStreamId || overrides.edgeConfigOverrides?.datastreamId !== target.dataStreamId) {
      throw new Error('Select the Lab Event tool datastream in the environment bar Adobe Target override so page views, identity and business events use the same sandbox dataflow.');
    }
    return overrides;
  }
  async function send(type, payload, expectedToken, customerOperation) {
    requireVisitor();
    await api.ready;
    requireVisitor();
    if (sending || lookingUp || (customerBusy && !customerOperation)) throw new Error('Wait for the current customer operation, identity lookup or event to finish.');
    if (uncertain) throw new Error('Previous delivery is uncertain. Check profile activity, then explicitly allow retry in Presenter controls.');
    const token = contextToken();
    if (expectedToken && expectedToken !== token) throw new Error('The identity or environment changed while this interaction was waiting. Nothing was sent.');
    const ctx = context();
    const body = type === 'custom' ? events.buildCustom(payload.eventType, ctx, payload.public) : events.build(type, payload, ctx);
    body._id = global.crypto.randomUUID(); body.timestamp = new Date().toISOString();
    byId('vuseLastAttempt').textContent = JSON.stringify(events.redact(body), null, 2);
    sending = true;
    let submitted = false, accepted = false, rejected = false;
    try {
      await checkTarget(ctx);
      requireVisitor();
      if (token !== contextToken()) throw new Error('Identity or environment changed before sending. Nothing was sent.');
      submitted = true;
      const response = await global.AepDemoGeneratorTargets.labAuthFetch('/api/events/generator', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      rejected = response.status >= 400 && response.status < 500;
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || data.message || 'Event API did not confirm acceptance.');
      accepted = true;
      if (token !== contextToken()) throw new Error('Event accepted for the previous context. Check its profile activity before continuing.');
      await checkTarget(ctx);
      if (token !== contextToken()) throw new Error('Context changed during final target verification.');
      const receipt = data.requestId || data.eventId || body._id;
      message('Accepted: ' + body.eventType + '. Receipt: ' + receipt + '. Profile ingestion and AJO execution are not yet verified.', false);
      record(body.eventType + ' / ' + ctx.sandbox + ' / accepted / ' + receipt);
      void refreshActivity(ctx).catch((error) => message('Event accepted; activity refresh failed: ' + error.message, true));
      return data;
    } catch (error) {
      if (submitted && !rejected) {
        saveUncertain({ id: body._id, eventType: body.eventType, sandbox: ctx.sandbox, timestamp: body.timestamp, accepted });
      }
      record(body.eventType + ' / ' + (accepted ? 'accepted; context changed' : rejected ? 'API rejected' : submitted ? 'uncertain delivery' : 'not sent') + ' / ' + body._id);
      message(error.message, true); throw error;
    } finally { sending = false; }
  }
  async function refreshActivity(ctx) {
    ctx = ctx || context();
    if (!ctx.ecid) throw new Error('Resolve an ECID before refreshing activity.');
    await global.DemoProfileDrawer.refreshDrawerEventsForIdentity(ctx.ecid, 'ecid');
  }
  async function validateIdentity(detail) {
    if (visitorBlocked()) return;
    const revision = ++identityRevision;
    verified = null;
    const requestedSandbox = sandbox(), requestedNamespace = namespace();
    if (!detail?.found || detail.identifier !== identifier() || detail.namespace !== requestedNamespace) { notifyContext(); return; }
    const query = new URLSearchParams({ identifier: detail.identifier, namespace: requestedNamespace, sandbox: requestedSandbox });
    const response = await global.AepDemoGeneratorTargets.labAuthFetch('/api/profile/consent?' + query);
    const data = await response.json();
    if (!response.ok || !data.found) throw new Error(data.error || 'Profile not found during identity verification.');
    if (visitorBlocked() || revision !== identityRevision || requestedSandbox !== sandbox() || detail.identifier !== identifier() || requestedNamespace !== namespace()) return;
    const ecid = browserEcid;
    if (!/^\d{10,}$/.test(ecid) || sdkSandbox !== requestedSandbox || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) throw new Error('Resolve the live browser ECID and a valid profile email before connecting.');
    verified = { identifier: detail.identifier, namespace: requestedNamespace, sandbox: requestedSandbox, ecid,
      email: data.email.trim(), firstName: data.firstName || '', lastName: data.lastName || '', stitched: false };
    notifyContext();
  }
  async function lookup(value, options) {
    requireVisitor();
    await api.ready;
    requireVisitor();
    if (sending || lookingUp || (customerBusy && !options?.customerOperation)) throw new Error('Wait for the current customer operation, event or profile lookup to finish.');
    lookingUp = true;
    try {
      if (value != null) {
        settingNamespace = true;
        try {
          byId('vuseNs').value = 'email';
          byId('vuseNs').dispatchEvent(new Event('change', { bubbles: true }));
        } finally { settingNamespace = false; }
        await new Promise((resolve) => global.requestAnimationFrame(resolve));
        byId('customerEmail').value = String(value).trim();
      }
      const requested = identifier(), requestedSandbox = sandbox(), requestedNamespace = namespace();
      const initialBrowser = browserEcid, initialSdkSandbox = sdkSandbox;
      const edgeOverrides = JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides());
      if (!requested) throw new Error('Enter a profile identifier in the Lab bar.');
      if (requestedNamespace === 'email') assertCustomerEmail(requested);
      verified = null; notifyIdentity();
      const found = await global.DemoProfileDrawer.loadProfileDataForDrawer(requested, { updateMessage: true, sendApplicationLogin: false });
      await identityValidation;
      if (!found || !verified || requested !== identifier() || requestedSandbox !== sandbox() || requestedNamespace !== namespace()) throw new Error('Profile lookup did not resolve a usable identity.');
      const resolved = verified;
      assertCustomerEmail(resolved.email);
      if (requestedNamespace === 'email' && resolved.email.toLowerCase() !== requested.toLowerCase()) throw new Error('The resolved email does not match the selected email.');
      if (options?.requireStitch && (!browserEcid || sdkSandbox !== requestedSandbox || !global.DemoTagsInjection.isAlloyReady() || global.AepLabTagsInjectGuard.isInProgress('vuse'))) throw new Error('Inject Tags for the selected sandbox before connecting an email.');
      requireEdgeContext();
      if (browserEcid && sdkSandbox === requestedSandbox) byId('infoEcid').textContent = browserEcid;
      // Bind before a network attempt: an uncertain stitch may already link the graph.
      bindCustomer(resolved.email);
      let stitched;
      try { stitched = await tags.stitchAfterProfileLookup(resolved, resolved.email); }
      catch (error) {
        saveUncertain({ id: global.crypto.randomUUID(), eventType: 'vuse.identity.stitch', sandbox: requestedSandbox, timestamp: new Date().toISOString() });
        error.uncertain = true; throw error;
      }
      if (resolved !== verified || requested !== identifier() || requestedSandbox !== sandbox() || requestedNamespace !== namespace() || initialBrowser !== browserEcid || initialSdkSandbox !== sdkSandbox || edgeOverrides !== JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides())) throw new Error('Identity or environment changed during stitching.');
      if (options?.requireStitch && !stitched) throw new Error('Adobe identity stitching did not confirm acceptance.');
      resolved.stitched = !!stitched;
      if (stitched && browserEcid) resolved.ecid = browserEcid;
      if (typeof global.setSessionIdentifier === 'function') global.setSessionIdentifier(requested, requestedNamespace);
      notifyIdentity(); notifyContext();
      message(stitched ? 'Profile resolved; identity stitch accepted. Verify the graph in the profile drawer.' : 'Profile resolved; Tags identity stitch is not verified.', false);
      return resolved;
    } finally { lookingUp = false; }
  }
  async function pageView(payload) {
    requireVisitor();
    if (!browserEcid || sdkSandbox !== sandbox() || !global.DemoTagsInjection.isAlloyReady() || global.AepLabTagsInjectGuard.isInProgress('vuse')) throw new Error('Inject the selected sandbox’s Tags library before recording a page view.');
    const ctx = context(), token = contextToken();
    const overrides = requireEdgeContext();
    await checkTarget(ctx);
    if (token !== contextToken()) throw new Error('Environment changed before the page view; no event was sent.');
    const xdm = {
      eventType: 'web.webPageDetails.pageViews',
      web: { webPageDetails: { name: 'Vuse IT – ' + (payload.title || payload.page || 'Home'), URL: events.build('pageView', payload, ctx).viewUrl, pageViews: { value: 1 } } },
      _demoemea: { identification: { core: { ecid: ctx.ecid } } },
      identityMap: { ECID: [{ id: ctx.ecid, authenticatedState: 'ambiguous', primary: true }] },
    };
    if (ctx.known) xdm.identityMap.Email = [{ id: ctx.email, authenticatedState: 'ambiguous', primary: false }];
    await global.alloy('sendEvent', { ...overrides, xdm });
    if (token !== contextToken() || JSON.stringify(overrides) !== JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides())) throw new Error('The context changed during the SDK page view. Check activity before another attempt.');
  }
  async function handleInteraction(type, payload, token, revision = visitorRevision) {
    requireVisitor();
    await api.ready;
    requireVisitor();
    if (revision !== visitorRevision) throw new Error('Interaction belongs to an earlier visitor; nothing was sent.');
    if (token && token !== routingToken()) throw new Error('Interaction belongs to an earlier identity or environment; no automatic replay was made.');
    if (type === 'login') {
      await lookup(payload.email, { requireStitch: true });
    }
    updatePreview({ type, payload });
    if (type === 'pageView') {
      currentPage = { page: String(payload.page || 'home'), title: String(payload.title || 'Home'), url: events.build('pageView', payload, context()).viewUrl };
      await pageView(payload);
      record('Page view / ' + currentPage.page + ' / Web SDK accepted');
      return { ok: true, via: 'web-sdk' };
    }
    return send(type, payload, contextToken());
  }
  async function submitCustomer(payload, requestId) {
    await api.ready;
    requireVisitor();
    if (customerBusy || sending || lookingUp) throw new Error('Wait for the current customer operation.');
    if (uncertain) throw new Error('A previous delivery needs reconciliation in Presenter controls before another submission.');
    if (!browserEcid || sdkSandbox !== sandbox() || !global.DemoTagsInjection.isAlloyReady()) throw new Error('Inject Tags for the selected sandbox before submitting customer details.');
    const email = String(payload.email || '').trim().toLowerCase();
    assertCustomerEmail(email);
    const action = payload.action;
    if (!['register', 'login', 'profile', 'checkout', 'resume'].includes(action)) throw new Error('Unsupported customer action.');
    const edgeContext = JSON.stringify(requireEdgeContext());
    const submissionContext = { sandbox: sandbox(), target: selectedTarget(), ecid: browserEcid, known: false };
    events.build('ageGate.verified', {}, submissionContext);
    customerBusy = true;
    const token = routingToken(), ecid = browserEcid, revision = visitorRevision, selectedSandbox = sandbox();
    const stillCurrent = () => {
      requireVisitor();
      if (token !== routingToken() || ecid !== browserEcid || revision !== visitorRevision || selectedSandbox !== sandbox()
        || edgeContext !== JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides())) throw new Error('Environment changed during customer submission. Check profile activity before continuing.');
    };
    let profileAccepted = false, stitchAttempted = false;
    try {
      await checkTarget(submissionContext);
      stillCurrent();
      if (action === 'login' || action === 'resume') {
        await lookup(email, { requireStitch: true, customerOperation: true });
      } else {
        if (!global.VuseItaliaProfile) throw new Error('The safe customer profile adapter is unavailable. Reload the page.');
        bindCustomer(email);
        const receipt = await global.VuseItaliaProfile.submit({
          sandbox: selectedSandbox, email, ecid, details: payload.details || {},
          preferences: payload.preferences, ...(action === 'checkout' ? {} : { isNew: action === 'register' }),
        });
        profileAccepted = true;
        stillCurrent();
        const identity = { email, ecid, firstName: receipt?.identity?.firstName || payload.details?.firstName || '',
          lastName: receipt?.identity?.lastName || payload.details?.lastName || '' };
        byId('infoEcid').textContent = ecid;
        stitchAttempted = true;
        const stitched = await tags.stitchAfterProfileLookup(identity, email);
        stillCurrent();
        if (!stitched) throw new Error('Profile write accepted, but identity stitching did not confirm acceptance.');
        settingNamespace = true;
        try {
          byId('vuseNs').value = 'email';
          byId('vuseNs').dispatchEvent(new Event('change', { bubbles: true }));
        } finally { settingNamespace = false; }
        byId('customerEmail').value = email;
        verified = { ...identity, identifier: email, namespace: 'email', sandbox: selectedSandbox, stitched: true };
        if (typeof global.setSessionIdentifier === 'function') global.setSessionIdentifier(email, 'email');
        record('Customer details / accepted for ingestion / ' + (receipt?.requestId || requestId));
        notifyIdentity(); notifyContext();
      }
      if (action !== 'resume' && action !== 'profile') {
        const type = action === 'checkout' ? 'commerce.purchases' : 'login';
        await send(type, action === 'checkout' ? payload : { ...payload.details, isNew: action === 'register' }, contextToken(), true);
      }
      if (payload.preferences && action !== 'resume' && action !== 'login') await send('consent.preferences', payload.preferences, contextToken(), true);
      message('Customer submission accepted. Authentication and checkout are simulated; verify profile attributes and identity links in AEP after ingestion.', false);
      return { ok: true, accepted: true, identity: { email: verified.email, firstName: verified.firstName, lastName: verified.lastName } };
    } catch (error) {
      if (error.uncertain || profileAccepted || stitchAttempted) {
        saveUncertain({ id: requestId, eventType: 'customer.' + action, sandbox: selectedSandbox, timestamp: new Date().toISOString(), profileAccepted });
        error.uncertain = true;
      }
      throw error;
    } finally { customerBusy = false; }
  }
  function onFrameMessage(event) {
    if (visitorBlocked()) return;
    const frame = byId('vuseDemoSiteFrame');
    if (event.source !== frame.contentWindow || event.origin !== global.location.origin || event.data?.source !== 'vuse-site') return;
    const { type, payload } = event.data;
    if (type === 'site.ready') { frameReady = true; notifySiteContext(); return; }
    if (type === 'customer.uncertain' && payload?.requestId) {
      saveUncertain({ id: String(payload.requestId), eventType: 'customer.' + String(payload.action || 'submission'),
        sandbox: sandbox(), timestamp: new Date().toISOString() });
      message('A storefront submission was interrupted. Check profile activity, then explicitly allow retry in Presenter controls.', true);
      return;
    }
    if (type === 'logout') {
      queue = queue.then(logout).catch((error) => { message(error.message, true); });
      return;
    }
    if (type === 'customer.submit') {
      const requestId = event.data.requestId;
      if (typeof requestId !== 'string' || requestId.length > 100 || !requestId || !payload || typeof payload !== 'object' || Array.isArray(payload)) return;
      if (completedRequests.has(requestId)) { post('customer.result', completedRequests.get(requestId), requestId); return; }
      const revision = visitorRevision, token = routingToken();
      queue = queue.then(async () => {
        if (completedRequests.has(requestId)) { post('customer.result', completedRequests.get(requestId), requestId); return; }
        let result;
        try {
          if (revision !== visitorRevision || token !== routingToken()) throw new Error('Customer submission belongs to an earlier environment.');
          result = await submitCustomer(payload, requestId);
        } catch (error) { result = { ok: false, error: error.message, uncertain: !!error.uncertain }; message(error.message, true); }
        completedRequests.set(requestId, result);
        if (completedRequests.size > 100) completedRequests.delete(completedRequests.keys().next().value);
        post('customer.result', result, requestId);
      }).catch((error) => message(error.message, true));
      return;
    }
    if (!Object.hasOwn(events.TYPES, type) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    const token = ready ? routingToken() : null;
    const revision = visitorRevision;
    queue = queue.then(() => handleInteraction(type, payload, token, revision)).catch((error) => { message(error.message, true); record(type + ' / ' + error.message); });
  }
  function beforeVisitorReset() {
    if (sending || lookingUp || customerBusy) throw new Error('Wait for the current operation before resetting the visitor.');
    if (uncertain) throw new Error('Previous delivery is uncertain. Reconcile it before resetting the visitor.');
  }
  function invalidateVisitor() {
    ++visitorRevision; ++identityRevision; ++routingRevision;
    verified = null; browserEcid = ''; sdkSandbox = '';
    byId('customerEmail').value = ''; byId('infoEcid').textContent = '—';
    byId('vusePersonaEmail').value = '';
    for (const key of ['vuseAgeGate', 'vuseCart', 'vuseIdentity', 'vuseAbandonSent', 'vuseConsent', 'vuseLoyalty']) {
      global.sessionStorage.removeItem(key);
    }
    for (const key of Object.keys(global.localStorage)) {
      if (key.startsWith('vuseShopper:') || key.startsWith('vuseBrowserCustomer:')) global.localStorage.removeItem(key);
    }
    completedRequests.clear();
    lastInteraction = null; currentPage = { page: 'home', title: 'Home', url: 'https://www.vuse.com/it/it/' };
    notifyContext();
  }
  async function resetVisitor() {
    await api.ready;
    if (!global.AepDemoVisitorReset) throw new Error('Shared visitor reset is unavailable. Reload the lab before trying again.');
    return global.AepDemoVisitorReset.reset();
  }
  function applyFreshVisitor(detail) {
    browserEcid = String(detail?.ecid || ''); sdkSandbox = browserEcid ? sandbox() : '';
    verified = null; byId('customerEmail').value = ''; byId('vusePersonaEmail').value = '';
    notifyContext(); notifySiteContext();
  }
  function initPresenter() {
    const panel = byId('vusePresenter'), launcher = byId('vusePresenterLauncher');
    const safely = (operation) => { void Promise.resolve().then(operation).catch((error) => message(error.message, true)); };
    launcher.addEventListener('click', () => {
      if (global.EnvBarCompact) global.EnvBarCompact.closeOverlay({ force: true });
      if (global.ProfileViewerModal) global.ProfileViewerModal.close();
      byId('dpmPanelClose')?.click();
      updatePreview(); panel.showModal(); launcher.setAttribute('aria-expanded', 'true'); byId('vusePresenterClose').focus();
    });
    byId('vusePresenterClose').addEventListener('click', () => panel.close());
    panel.addEventListener('close', () => { launcher.setAttribute('aria-expanded', 'false'); launcher.focus(); });
    panel.addEventListener('input', () => { lastInteraction = null; updatePreview(); });
    for (const step of events.STEPS) {
      const row = document.createElement('li'), label = document.createElement('span'), button = document.createElement('button');
      label.textContent = step.label; button.textContent = 'Send'; button.type = 'button'; button.setAttribute('aria-label', 'Send ' + step.label);
      button.addEventListener('click', () => safely(async () => {
        button.disabled = true;
        try {
          const payload = { ...step.payload };
          if (step.type === 'login') payload.email = byId('vusePersonaEmail').value.trim();
          await handleInteraction(step.type, payload);
        } finally { button.disabled = false; }
      }));
      row.append(label, button); byId('vuseScriptedSteps').append(row);
    }
    for (const [label, type, payload] of [
      ['Send subscription intent', 'subscription.intent', { sku: 'VUSE-PRO', name: 'Vuse PRO', frequency: 'monthly' }],
      ['Send underage result', 'ageGate.underage', {}],
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => safely(() => handleInteraction(type, payload)));
      byId('vuseScriptedSteps').after(button);
    }
    byId('vuseResolveProfile').addEventListener('click', () => safely(() => lookup(byId('vusePersonaEmail').value.trim(), { requireStitch: true })));
    byId('vuseCustomEventForm').addEventListener('submit', (event) => {
      event.preventDefault(); safely(() => send('custom', { eventType: byId('vuseCustomEventType').value, public: JSON.parse(byId('vuseCustomPublic').value) }));
    });
    byId('vuseRefreshProfile').addEventListener('click', () => safely(() => refreshActivity()));
    byId('vuseResetVisitor').addEventListener('click', () => safely(resetVisitor));
    byId('vuseUncertainDelivery').hidden = !uncertain;
    if (uncertain) byId('vuseLastAttempt').textContent = uncertain;
    byId('vuseAllowRetry').addEventListener('click', () => {
      if (sending || customerBusy || lookingUp) return;
      uncertain = null; global.sessionStorage.removeItem(uncertainKey); byId('vuseUncertainDelivery').hidden = true;
      post('customer.reconciled', {});
      message('Another explicit attempt is allowed. The previous event may already exist; deduplication is not guaranteed.', false);
    });
  }
  async function reloadTargets() {
    const current = ++generation; targets = [];
    const loaded = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(byId('generatorTarget'), { preferredId: 'lab-event-tool-edge' });
    if (current !== generation) return;
    targets = loaded; notifyContext();
    if (!targets.length) message('No event targets loaded. Configure Event tool for this sandbox.', true);
  }
  async function run() {
    initPresenter();
    global.addEventListener('message', onFrameMessage);
    byId('vuseDemoSiteFrame').addEventListener('load', () => { frameReady = false; post('site.requestContext', {}); });
    await global.envBar.ready();
    if (!byId('customerEmail') || !global.DemoTagsInjection || !global.DemoProfileDrawer) throw new Error('Shared Lab components did not load.');
    global.AepDemoVisitorReset?.registerAdapter({ beforeReset: beforeVisitorReset, invalidate: invalidateVisitor, afterReset: applyFreshVisitor });
    global.addEventListener('aep-demo-visitor-reset-complete', (event) => applyFreshVisitor(event.detail));
    global.AepIdentityPicker.init('customerEmail', 'vuseNs');
    global.attachEmailDatalist('customerEmail', 'recentEmails', 'vuseNs');
    global.attachEmailDatalist('vusePersonaEmail', 'vusePersonaRecentEmails', null);
    // Only the visitor-scoped storefront can restore a signed-in customer.
    byId('customerEmail').value = '';
    global.__siteCloneSuppressBcEnable = true;
    byId('vuseInjectSdkBtn').addEventListener('click', () => { global.__siteCloneSuppressBcEnable = false; }, true);
    const webPushDesired = () => !!byId('vuseWebPushOnInjectToggle').checked;
    tags = global.DemoTagsInjection.init({
      storagePrefix: 'vuse', identityEventType: 'vuse.identity.stitch', identityStitchLabEdgeContext: true,
      sendInitialPageView: false,
      simulatedAuthentication: true,
      infoEcidId: 'infoEcid', tagsCompanyId: 'vuseTagsCompany', tagsPropertyInputId: 'vuseTagsProperty',
      tagsPropertyListId: 'vuseTagsPropertyList', tagsEnvironmentId: 'vuseTagsEnvironment', injectButtonId: 'vuseInjectSdkBtn',
      selectedScriptId: 'vuseSelectedScript', configFieldsId: 'vuseSdkConfigFields', configSummaryId: 'vuseSdkConfigSummary',
      configSummaryTextId: 'vuseSdkConfigSummaryText', changeConfigButtonId: 'vuseChangeSdkConfigBtn', hideTagsCompanyUi: true,
      iframeIds: [], getEmail: () => verified?.stitched ? verified.email : '', messageSetter: (text, type) => message(text, type === 'error'),
      onEcidResolved: (ecid) => {
        if (visitorBlocked()) return;
        const changed = browserEcid !== String(ecid) || sdkSandbox !== sandbox();
        browserEcid = String(ecid); sdkSandbox = sandbox();
        if (changed) invalidateIdentity();
        notifySiteContext();
      },
      webPush: { enabled: true, subscribeAfterInject: webPushDesired, requestPermissionOnInject: webPushDesired },
      brandConcierge: { enabled: () => !!byId('vuseBcOnInjectToggle').checked, styleKey: () => byId('vuseBcStyleSelect').value, suppressEnable: () => !!global.__siteCloneSuppressBcEnable },
    });
    global.envBar.registerTagsInjection(tags);
    global.DemoProfileDrawer.init({ emailInputId: 'customerEmail', profileOpenClass: 'aep-profile-drawer-open',
      viewName: 'Vuse Italia', emailGetter: identifier, fetchBrowserEcidOnInit: false,
      messageSetter: (text, type) => message(text, type === 'error') });
    global.addEventListener('aep-profile-drawer-loaded', (event) => {
      identityValidation = validateIdentity(event.detail).catch((error) => { invalidateIdentity(); message(error.message, true); });
    });
    for (const type of ['input', 'change']) byId('customerEmail').addEventListener(type, invalidateIdentity);
    byId('vuseNs').addEventListener('change', invalidateIdentity);
    byId('generatorTarget').addEventListener('change', () => { ++routingRevision; notifyContext(); });
    global.addEventListener('aep-global-sandbox-change', () => { browserEcid = ''; sdkSandbox = ''; invalidateIdentity(); });
    byId('queryProfileBtn').addEventListener('click', () => { void lookup(null, { requireStitch: true }).catch((error) => message(error.message, true)); });
    byId('vuseWebPushRetryBtn').addEventListener('click', () => {
      void global.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'vuse' })
        .then((ok) => message(ok ? 'Web push subscription submitted; delivery not verified.' : 'Web push registration did not complete.', !ok)).catch((error) => message(error.message, true));
    });
    ready = true;
    global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(reloadTargets);
    await reloadTargets();
    post('site.requestContext', {}); notifySiteContext();
  }
  const api = { send, lookup, pageView, context, handleInteraction, resetVisitor, ready: null };
  global.VuseItaliaLab = api;
  api.ready = run();
  void api.ready.catch((error) => message(error.message, true));
})(window);
