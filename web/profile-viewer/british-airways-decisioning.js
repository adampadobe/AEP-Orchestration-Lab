(function (global) {
  'use strict';
  const prefix = 'baDecisioning';
  const frame = document.getElementById('baDecisioningFrame');
  const apply = document.getElementById('baApplyProfile');
  const run = document.getElementById('baRunDecision');
  const status = document.getElementById('baProfileStatus');
  const model = global.BaDecisioningModel;
  let loaded = null;
  let loadedKey = '';
  let controlBaseline = null;
  let dirty = false;
  let busy = false;
  let pendingVerification = null;
  let imageVersion = 0;
  const displayAttempts = new Set();
  const appliedOperations = new Map();
  let targets = [];
  let tags;
  function visualiser() { return frame.contentWindow && frame.contentWindow.BaDecisioningVisualiser; }
  function syncPreviewRecipient(profile) {
    const api = visualiser();
    if (api) api.setRecipientFirstName(profile && profile.firstName);
  }
  function context() {
    return {
      sandbox: global.AepGlobalSandbox.getSandboxName(),
      namespace: document.getElementById(prefix + 'Ns').value.toLowerCase(),
      identifier: document.getElementById('customerEmail').value.trim(),
    };
  }
  function key(ctx) { return JSON.stringify(ctx); }
  function message(text, error) {
    status.textContent = text;
    status.dataset.error = String(!!error);
    apply.disabled = busy || !loaded || !dirty;
    run.disabled = busy;
  }
  function current(ctx) {
    if (key(context()) !== key(ctx)) throw new Error('Sandbox or profile changed during the operation. Look up the selected profile again.');
  }
  async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok || data.error || data.ok === false) throw new Error(data.error || data.message || 'Request failed (HTTP ' + response.status + ').');
    return data;
  }
  async function table(ctx) {
    if (!ctx.sandbox || !ctx.identifier) throw new Error('Select a sandbox and enter a profile identifier first.');
    const data = await jsonFetch('/api/profile/table?' + new URLSearchParams(ctx));
    current(ctx);
    if (data.found !== true || !Array.isArray(data.rows)) throw new Error('No profile found for this identifier.');
    return data;
  }
  function invalidateDecision(text) {
    imageVersion++;
    const api = visualiser();
    if (api) api.setDecisionStatus(text);
  }
  function invalidate() {
    loaded = null; loadedKey = ''; controlBaseline = null; dirty = false; pendingVerification = null;
    syncPreviewRecipient(null);
    invalidateDecision('Profile or sandbox changed. Displayed hero is from the previous context; run a new live decision to replace it.');
    message('Look up the selected test profile before applying changes.');
  }
  function verified(data) {
    if (!pendingVerification) return true;
    const rows = new Map(data.rows.map(row => [model.relativePath(row.path), String(row.value)]));
    return pendingVerification.every(update => rows.get(update.path) === String(update.value));
  }
  async function lookup() {
    const ctx = context();
    busy = true; message('Looking up profile...');
    invalidateDecision('Profile lookup in progress. Run a new decision after lookup.');
    try {
      const data = await table(ctx);
      loaded = data; loadedKey = key(ctx);
      const ready = verified(data);
      if (ready) {
        const preserveStaged = pendingVerification && dirty;
        pendingVerification = null;
        const api = visualiser();
        if (api && !preserveStaged) api.setState(model.readState(data.rows));
        if (api && !preserveStaged) controlBaseline = api.getState();
        if (!preserveStaged) dirty = false;
      }
      const ok = await global.DemoProfileDrawer.loadProfileDataForDrawer(ctx.identifier, { updateMessage: false });
      current(ctx);
      if (!ok) throw new Error('Profile table loaded, but the profile drawer could not be refreshed.');
      syncPreviewRecipient(global.DemoProfileDrawer.getLastLookedUpProfile());
      if (tags) await tags.stitchAfterProfileLookup(global.DemoProfileDrawer.getLastLookedUpProfile(), ctx.identifier);
      message(ready ? 'Profile loaded. Control changes are staged until Apply.' : 'AEP readback is still pending. Click Run again after ingestion (typically 30-60 seconds).');
      return ready;
    } catch (error) {
      loaded = null; loadedKey = '';
      message(error.message, true);
      return false;
    } finally { busy = false; apply.disabled = !loaded || !dirty; run.disabled = false; }
  }
  async function preflightSchema(data, ctx, savedState) {
    const travel = data.industries && data.industries.travel;
    if (!travel || !travel.writable || !travel.schemaId) throw new Error('Travel profile dataflow is not ready. Complete Travel Profile Generation setup.');
    const result = await jsonFetch('/api/aep', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GET',
        path: '/data/foundation/schemaregistry/tenant/schemas/' + encodeURIComponent(travel.schemaId),
        platform_headers: { Accept: 'application/vnd.adobe.xed-full+json; version=1', 'x-sandbox-name': ctx.sandbox },
      }),
    });
    current(ctx);
    const schema = result.platform_response;
    if (!schema || result.status >= 400) throw new Error('Could not read the resolved Travel schema.');
    const props = schema.properties || {};
    const tenant = Object.keys(props).find(name => /^_[a-zA-Z0-9]+$/.test(name) && props[name].properties && props[name].properties.britishAirwaysDecisioning);
    const fields = tenant && props[tenant].properties.britishAirwaysDecisioning.properties;
    const missing = Object.values(model.fields).filter(name => !fields || !fields[name]);
    if (missing.length) throw new Error('BA schema fields are missing. After the Functions release, run Travel setup step 2 (Attach field groups / Profile Core v2 top-up), then retry. Missing: ' + missing.join(', '));
    const incompatible = Object.entries(model.fields).filter(([name, leaf]) =>
      ['days', 'recency', 'fatigue'].includes(name)
        ? !['integer', 'number'].includes(fields[leaf].type)
        : fields[leaf].type !== 'string');
    if (incompatible.length) throw new Error('BA schema has incompatible field types: ' + incompatible.map(([, leaf]) => leaf).join(', '));
    let disruptionField = props[tenant];
    model.disruptionPath.split('.').forEach(part => { disruptionField = disruptionField && disruptionField.properties && disruptionField.properties[part]; });
    if (!disruptionField || disruptionField.type !== 'string') throw new Error('Travel schema requires a text field at ' + model.disruptionPath);
    let bookingField = props[tenant];
    model.bookingPath.split('.').forEach(part => { bookingField = bookingField && bookingField.properties && bookingField.properties[part]; });
    if (!bookingField || bookingField.type !== 'string') throw new Error('Travel schema requires a text field at ' + model.bookingPath + '. Complete Travel setup step 2 after the Functions release before applying.');
    if (Array.isArray(bookingField.enum) && !bookingField.enum.includes(savedState.booking)) {
      throw new Error('Booking status "' + savedState.booking + '" is not allowed by this schema. Allowed values: ' + bookingField.enum.join(', '));
    }
    const airline = tenant && props[tenant].properties.airlineCustomer;
    if (!airline || !airline.properties || !airline.properties.loyaltyTier || airline.properties.loyaltyTier.type !== 'string') {
      throw new Error('Travel schema requires a text field at airlineCustomer.loyaltyTier. Complete Travel setup step 2 before applying.');
    }
    const tier = savedState.tier.charAt(0).toUpperCase() + savedState.tier.slice(1);
    const allowedTiers = airline.properties.loyaltyTier.enum;
    if (Array.isArray(allowedTiers) && !allowedTiers.includes(tier)) {
      throw new Error('Airline loyalty tier "' + tier + '" is not allowed by this schema. Select one of: ' + allowedTiers.join(', '));
    }
  }
  function disruptionEventXdm(data, operations, ecid) {
    const email = data.profileEmail;
    if (typeof email !== 'string' || !email.includes('@')) throw new Error('Selected profile email is missing.');
    if (typeof ecid !== 'string' || !/^\d{10,}$/.test(ecid)) throw new Error('Active Web SDK browser ECID was not returned; disruption event was not sent.');
    const disruptionType = { delay: 'DELAY', cancelled: 'CANCELLATION' }[operations];
    if (!disruptionType) throw new Error('Operations must be Delay or Cancelled for a disruption event.');
    const rows = new Map(data.rows.map(row => [model.relativePath(row.path), row.value]));
    const flight = 'travelReservations.flightReservations.';
    function value(paths, fallback) {
      for (const path of paths) {
        const v = rows.get(path);
        if (v != null && String(v).trim()) return String(v).trim();
      }
      return fallback;
    }
    const delayMinutes = Number(value(['flightDisruption.delayMinutes', flight + 'flightDisruption.delayMinutes'], '180'));
    if (!Number.isFinite(delayMinutes) || delayMinutes < 0) throw new Error('Profile delayMinutes must be a non-negative number.');
    return {
      identityMap: {
        Email: [{ id: email, authenticatedState: 'authenticated', primary: true }],
        ECID: [{ id: ecid, authenticatedState: 'ambiguous', primary: false }],
      },
      _demoemea: {
        identification: { core: { ecid, email } },
        flightDisruption: {
          disruptionType,
          flightNumber: value([flight + 'flightNumber'], 'BA117'),
          bookingReference: value([flight + 'confirmationNumber'], 'ABC123'),
          originAirport: value([flight + 'departureAirportCode'], 'LHR'),
          destinationAirport: value([flight + 'arrivalAirportCode'], 'JFK'),
          delayMinutes,
        },
      },
      eventType: 'flight.disruption',
      timestamp: new Date().toISOString(),
    };
  }
  async function prepareDisruptionEvent(data, operations, ctx) {
    if (!global.DemoTagsInjection || typeof global.DemoTagsInjection.ensureAlloyReady !== 'function') {
      throw new Error('Web SDK (Alloy) not ready - inject Tags first.');
    }
    const alloyFn = await global.DemoTagsInjection.ensureAlloyReady({ timeoutMs: 30000, storagePrefix: prefix });
    current(ctx);
    const identity = await alloyFn('getIdentity', { namespaces: ['ECID'] });
    current(ctx);
    return { alloyFn, xdm: disruptionEventXdm(data, operations, identity && identity.identity && identity.identity.ECID) };
  }
  async function save() {
    if (busy) return;
    const ctx = context();
    if (!loaded || loadedKey !== key(ctx) || !visualiser()) { message('Look up the selected profile first.', true); return; }
    busy = true; message('Checking schema and building full writable snapshots...');
    invalidateDecision('Profile update in progress. Displayed hero unchanged until a successful live decision.');
    let accepted = 0;
    try {
      const latest = await table(ctx);
      const isTest = latest.rows.some(row => /^(xdm:)?testProfile$/.test(row.path) && String(row.value) === 'true');
      if (!isTest) throw new Error('Only AEP test profiles can be edited by this demo.');
      const savedState = visualiser().getState();
      const previousOperations = appliedOperations.has(key(ctx))
        ? appliedOperations.get(key(ctx))
        : model.readState(latest.rows).disruption || (controlBaseline && controlBaseline.disruption) || 'none';
      await preflightSchema(latest, ctx, savedState);
      if (!latest.profileEmail || !latest.profileEmail.includes('@')) throw new Error('Loaded profile has no email identity for streaming.');
      const groups = model.buildSnapshots(latest.rows, savedState, latest.industries, controlBaseline);
      const expected = groups.flatMap(group => group.updates).filter(update =>
        update.path.startsWith('britishAirwaysDecisioning.') || update.path === 'airlineCustomer.loyaltyTier' ||
        update.path === model.disruptionPath || update.path === model.bookingPath || update.path === 'scoring.core.propensityScore');
      const shouldSendDisruption = savedState.disruption !== previousOperations && ['delay', 'cancelled'].includes(savedState.disruption);
      const disruptionEvent = shouldSendDisruption ? await prepareDisruptionEvent(latest, savedState.disruption, ctx) : null;
      for (const group of groups) {
        current(ctx);
        const result = await global.postProfileUpdate({
          sandbox: ctx.sandbox, industry: group.industry,
          email: latest.profileEmail, ecid: latest.ecid || undefined, updates: group.updates,
        });
        if (!result.ok || result.data.ok === false) throw new Error(global.formatProfileUpdateError(result.data));
        accepted++;
      }
      current(ctx);
      pendingVerification = expected;
      controlBaseline = savedState;
      appliedOperations.set(key(ctx), savedState.disruption);
      dirty = JSON.stringify(visualiser().getState()) !== JSON.stringify(savedState);
      loaded = latest;
      invalidateDecision('Profile update accepted. Displayed hero unchanged; Run will verify the saved profile before replacing it.');
      message('Snapshots accepted by AEP. Run live image decision will look up the profile and verify the saved values before evaluating.');
      if (disruptionEvent) {
        try {
          current(ctx);
          const payload = { renderDecisions: false, personalization: { defaultPersonalizationEnabled: false }, xdm: disruptionEvent.xdm };
          console.log('[flight-disruption] Outbound payload', payload);
          const response = await disruptionEvent.alloyFn('sendEvent', payload);
          console.log('[flight-disruption] Edge response', response);
          console.log('[flight-disruption] Disruption type sent', disruptionEvent.xdm._demoemea.flightDisruption.disruptionType);
          current(ctx);
          message('Snapshots accepted by AEP. Flight disruption event sent: ' + disruptionEvent.xdm._demoemea.flightDisruption.disruptionType + '. Profile timeline ingestion may take 30-60 seconds.');
        } catch (error) {
          console.error('[flight-disruption] Event send failed', error);
          message('Snapshots accepted by AEP, but flight disruption tracking failed: ' + error.message + '. No automatic retry.', true);
        }
      } else {
        console.log(savedState.disruption === previousOperations
          ? 'No disruption event sent - operations unchanged'
          : 'No disruption event sent - operations is Normal');
      }
    } catch (error) {
      message((accepted ? accepted + ' dataflow(s) accepted before failure; update is partial. ' : '') + error.message, true);
    } finally { busy = false; apply.disabled = !loaded || !dirty; run.disabled = false; }
  }
  function imageFromMount() {
    const doc = frame.contentDocument;
    const mount = doc && doc.getElementById('hero-banner');
    if (!mount) return '';
    const img = mount.querySelector('img');
    let raw = img && img.getAttribute('src');
    // AJO text-content can contain only the personalised sourceURL expression.
    if (!raw && !mount.children.length) raw = mount.textContent.trim().split(/\s/)[0];
    if (!raw) return '';
    const url = new URL(raw, global.location.href);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Decision image must be an HTTP(S) URL.');
    return url.href;
  }
  async function acceptDecision(detail) {
    const appliedHero = detail.appliedHero;
    const version = detail.requestVersion;
    function skipped(reason) {
      console.log('[decisioning-display] Display skipped', {
        reason, runId: detail.runId, propositionId: appliedHero && appliedHero.proposition.id,
      });
    }
    if (version !== imageVersion) { skipped('Run superseded before acceptance'); return; }
    const isCurrentHero = () => version === imageVersion && appliedHero &&
      appliedHero.target === frame.contentDocument.getElementById('hero-banner') &&
      appliedHero.target.dataset.cdAppliedRunId === detail.runId;
    const failedCondition = !appliedHero ? 'No fresh applied hero attribution' :
      !appliedHero.newlyApplied ? 'Hero was not newly applied' :
      appliedHero.fallback ? 'Default/fallback hero' :
      typeof detail.runId !== 'string' || !detail.runId ? 'Missing Run ID' :
      appliedHero.runId !== detail.runId ? 'Applied hero belongs to a different Run' :
      appliedHero.target !== frame.contentDocument.getElementById('hero-banner') ? 'Applied target is not the current hero mount' :
      appliedHero.target.dataset.cdAppliedRunId !== detail.runId ? 'Hero mount Run marker was overwritten' : '';
    const url = failedCondition ? '' : imageFromMount();
    if (!url) {
      skipped(failedCondition || 'Applied hero has no extractable image URL');
      invalidateDecision('No live hero image returned. Previous hero image and text kept unchanged.');
      message('No live hero image returned. Check the hero-banner surface and the decision item image content.', true);
      return;
    }
    await new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('Decision image did not load within 10 seconds.')); }, 10000);
      image.onload = () => { clearTimeout(timeout); resolve(); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error('Decision image could not be loaded. Check the decision item image URL.')); };
      image.src = url;
    }).catch(error => {
      if (version === imageVersion) throw error;
      skipped('Image preload failed after Run supersession');
    });
    if (!isCurrentHero()) {
      skipped(version !== imageVersion ? 'Run superseded during image preload' : 'Hero target or Run marker changed during image preload');
      return;
    }
    const mount = frame.contentDocument.getElementById('hero-banner');
    const title = mount.querySelector('.cd-slot-title, h1, h2, h3');
    const description = mount.querySelector('.cd-slot-desc, p');
    const previewReady = visualiser().setDecisionImage(url, undefined, {
      title: title ? title.textContent.trim() : '',
      description: description ? description.textContent.trim() : '',
    });
    if (!previewReady || typeof previewReady.then !== 'function') {
      throw new Error('Hero preview did not provide render confirmation; display tracking was not sent.');
    }
    await previewReady;
    if (!isCurrentHero()) {
      skipped(version !== imageVersion ? 'Run superseded during preview readiness' : 'Hero target or Run marker changed during preview readiness');
      return;
    }
    console.log('[decisioning-display] Preview confirmed visible', { runId: detail.runId, propositionId: appliedHero.proposition.id });
    message('Live hero image, title and description applied to the web/email/mobile previews. Ranking remains local simulation.');
    const proposition = appliedHero.proposition;
    const displayKey = JSON.stringify([detail.runId, proposition.id, appliedHero.itemId || appliedHero.itemIndex]);
    if (displayAttempts.has(displayKey)) {
      console.log('[decisioning-display] Duplicate display prevented', { runId: detail.runId, propositionId: proposition.id, itemId: appliedHero.itemId });
      return;
    }
    try {
      if (!proposition.id || !proposition.scope || !proposition.scopeDetails ||
        typeof proposition.scopeDetails !== 'object' || !detail.identityMap || typeof detail.alloy !== 'function') {
        throw new Error('Hero displayed, but original proposition metadata or request identity is missing; display tracking was not sent.');
      }
      // Reserve before sending: an uncertain network failure must not trigger a duplicate retry.
      displayAttempts.add(displayKey);
      const capturedIdentityMap = detail.identityMap;
      console.log('[decisioning-display] Sending display event', {
        runId: detail.runId,
        propositionId: appliedHero.proposition.id,
        scope: appliedHero.proposition.scope,
        itemId: appliedHero.itemId || null,
        identityMap: capturedIdentityMap,
      });
      await detail.alloy('sendEvent', {
        renderDecisions: false,
        personalization: { defaultPersonalizationEnabled: false },
        xdm: {
          eventType: 'decisioning.propositionDisplay',
          identityMap: detail.identityMap,
          ...(detail.browserEcid ? { _demoemea: { identification: { core: { ecid: detail.browserEcid } } } } : {}),
          _experience: {
            decisioning: {
              propositions: [{ id: proposition.id, scope: proposition.scope, scopeDetails: proposition.scopeDetails }],
              propositionEventType: { display: 1 },
            },
          },
        },
      });
      console.log('[decisioning-display] Display event sent', { runId: detail.runId, propositionId: proposition.id, itemId: appliedHero.itemId });
    } catch (error) {
      console.error('[decisioning-display] Display event failure', error.message);
      message('Hero displayed, but display tracking failed: ' + error.message, true);
    }
  }
  async function decide() {
    if (busy) return;
    if (dirty) { message('Apply staged changes before running a decision.', true); return; }
    const ctx = context();
    const previewChannel = visualiser().getPreviewChannel();
    if (!await lookup()) {
      if (pendingVerification && loaded) message('AEP still has the previous values. Wait for ingestion (typically 30-60 seconds), then click Run live image decision again.', true);
      return;
    }
    busy = true; message('Evaluating the live hero-banner surface...');
    invalidateDecision('Live decision in progress. Displayed hero unchanged until new content is ready.');
    const requestVersion = imageVersion;
    try {
      const result = await global.DecisioningProfileRuntime.runContentDecision({ manualHeroDisplay: true, useBrowserEcid: true, previewChannel });
      current(ctx);
      await acceptDecision({ ...result, requestVersion });
    } catch (error) {
      invalidateDecision('Live decision failed. Previous hero image and text kept unchanged.');
      message(error.message, true);
    } finally { busy = false; run.disabled = false; apply.disabled = !loaded || !dirty; }
  }
  function themeFrame() {
    const doc = frame.contentDocument;
    if (!doc) return;
    const styles = getComputedStyle(document.body);
    ['text', 'text-secondary', 'muted', 'border', 'bg', 'surface', 'surface-alt', 'blue'].forEach(name =>
      doc.documentElement.style.setProperty('--dash-' + name, styles.getPropertyValue('--dash-' + name)));
  }
  function wireFrame() {
    themeFrame();
    if (loaded && visualiser()) visualiser().setState(model.readState(loaded.rows));
    const doc = frame.contentDocument;
    if (!doc || doc.documentElement.dataset.baWired) return;
    doc.documentElement.dataset.baWired = '1';
    function changed() {
      dirty = true;
      invalidateDecision('Staged profile changes. Displayed hero unchanged until Apply and a successful live decision.');
      message(loaded ? 'Profile changes staged. Apply to write the full snapshot to AEP.' : 'Simulation changed. Look up a test profile before applying.');
    }
    doc.getElementById('signals').addEventListener('click', event => { if (event.target.closest('.toggle-opt')) changed(); });
    doc.getElementById('signals').addEventListener('input', changed);
    doc.getElementById('scenarios').addEventListener('click', event => { if (event.target.closest('.scn')) changed(); });
  }
  async function init() {
    document.addEventListener('click', event => {
      if (!event.target.closest('#cdMicroProfileRunBtn')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void decide();
    }, true);
    const email = document.getElementById('customerEmail');
    global.AepIdentityPicker.init('customerEmail', prefix + 'Ns');
    if (global.attachEmailDatalist) global.attachEmailDatalist('customerEmail', 'recentEmails', prefix + 'Ns');
    if (global.hydrateIdentifierFromSession) global.hydrateIdentifierFromSession('customerEmail', prefix + 'Ns');
    const getTarget = () => targets.find(target => target.id === document.getElementById('generatorTarget').value) || null;
    tags = global.DemoTagsInjection.init({
      storagePrefix: prefix, identityEventType: 'ba.decisioning.identity.stitch',
      messageSetter: (text, type) => message(text, type === 'error'), infoEcidId: 'infoEcid',
      tagsCompanyId: prefix + 'TagsCompany', tagsPropertyInputId: prefix + 'TagsProperty',
      tagsPropertyListId: prefix + 'TagsPropertyList', tagsEnvironmentId: prefix + 'TagsEnvironment',
      injectButtonId: prefix + 'InjectSdkBtn', selectedScriptId: prefix + 'SelectedScript',
      configFieldsId: prefix + 'SdkConfigFields', configSummaryId: prefix + 'SdkConfigSummary',
      configSummaryTextId: prefix + 'SdkConfigSummaryText', changeConfigButtonId: prefix + 'ChangeSdkConfigBtn',
      getSelectedGeneratorTarget: getTarget, getEmail: () => email.value,
      iframeIds: ['baDecisioningFrame'], hideTagsCompanyUi: true,
      webPush: { enabled: false }, brandConcierge: { enabled: false },
    });
    global.envBar.registerTagsInjection(tags);
    global.DemoProfileDrawer.init({
      emailInputId: 'customerEmail', profileOpenClass: 'mod-demo-page--profile-open',
      viewName: 'British Airways Decisioning', emailGetter: () => email.value,
      messageSetter: (text, type) => message(text, type === 'error'), getSelectedGeneratorTarget: getTarget,
      fetchBrowserEcidOnInit: true,
      profileDetailFields: [
        { key: 'bookingStatus', label: 'Booking status' },
        { key: 'flightClass', label: 'Flight class' },
      ],
      enrichProfile: async profile => {
        const data = await table(context());
        const values = model.readState(data.rows);
        const flightClass = data.rows.find(row => model.relativePath(row.path) === 'travelReservations.flightReservations.flightClass');
        return {
          ...profile,
          propensityScore: values.prop != null ? Number(values.prop) : null,
          loyaltyStatus: values.tier ? values.tier.charAt(0).toUpperCase() + values.tier.slice(1) : null,
          bookingStatus: values.booking || null,
          flightClass: flightClass ? flightClass.value : null,
        };
      },
    });
    global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(async () => {
      targets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(document.getElementById('generatorTarget'), {});
    });
    document.getElementById('queryProfileBtn').addEventListener('click', () => { if (!busy) void lookup(); });
    email.addEventListener('input', invalidate);
    document.getElementById(prefix + 'Ns').addEventListener('change', invalidate);
    global.addEventListener('aep-global-sandbox-change', invalidate);
    global.addEventListener('aep-profile-drawer-loaded', () => {
      syncPreviewRecipient(global.DemoProfileDrawer.getLastLookedUpProfile());
      if (busy || dirty || pendingVerification || !loaded || loadedKey !== key(context())) return;
      const profile = global.DemoProfileDrawer.getLastLookedUpProfile();
      if (!profile || !visualiser()) return;
      const values = {};
      if (profile.propensityScore != null) values.prop = model.readPropensity(profile.propensityScore);
      const airlineTier = model.readState(loaded.rows).tier;
      if (airlineTier != null) values.tier = airlineTier;
      visualiser().setState(values);
    });
    apply.addEventListener('click', () => { if (!busy) void save(); });
    run.addEventListener('click', () => { if (!busy) void decide(); });
    frame.addEventListener('load', wireFrame);
    wireFrame();
    const anchor = document.querySelector('.mod-demo-top-anchor');
    const toolbar = document.querySelector('.spectrum-env-status-bar');
    const actions = document.querySelector('.ba-decisioning-actions');
    function layout() {
      // Docking slides the shared bar off-screen with a transform, so size observers never fire.
      const hidden = anchor && (anchor.classList.contains('lab-env-top-anchor--docked-hidden') ||
        anchor.classList.contains('lab-env-top-anchor--presenter-strip-hidden'));
      const top = hidden ? 0 : toolbar && anchor
        ? toolbar.getBoundingClientRect().bottom - anchor.getBoundingClientRect().top + anchor.offsetTop
        : 48;
      document.body.classList.toggle('ba-decisioning-page--env-hidden', !!hidden);
      document.body.style.setProperty('--ba-toolbar-top', top + 'px');
      document.body.style.setProperty('--ba-content-top', (top + actions.getBoundingClientRect().height) + 'px');
    }
    const resize = new ResizeObserver(layout);
    if (toolbar) resize.observe(toolbar);
    resize.observe(actions);
    if (anchor) new MutationObserver(layout).observe(anchor, { attributes: true, attributeFilter: ['class'] });
    layout();
    new MutationObserver(themeFrame).observe(document.documentElement, { attributes: true, attributeFilter: ['data-aep-theme'] });
  }
  global.envBar.ready().then(init).catch(error => message('Demo initialization failed: ' + error.message, true));
})(window);
