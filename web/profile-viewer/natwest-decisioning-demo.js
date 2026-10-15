(function (global) {
  'use strict';
  const prefix = 'nwDecisioning';
  const frame = document.getElementById('nwDecisioningFrame');
  const apply = document.getElementById('nwApplyProfile');
  const run = document.getElementById('nwRunDecision');
  const model = global.NatwestDecisioningModel;
  const status = document.getElementById('nwProfileStatus');
  let loaded = null, baseline = null, loadedKey = '', pending = null;
  let busy = false, dirty = false, contextVersion = 0, signalRevision = 0, decisionRun = 0;
  let targets = [], tags;
  const displayAttempts = new Set();
  const api = () => frame.contentWindow && frame.contentWindow.NatwestDecisioningVisualiser;
  function context() {
    return {
      sandbox: global.AepGlobalSandbox.getSandboxName(),
      namespace: document.getElementById(prefix + 'Ns').value.toLowerCase(),
      identifier: document.getElementById('customerEmail').value.trim(),
    };
  }
  const key = value => JSON.stringify(value);
  function testProfile(data) {
    return data.rows.some(row => /^(xdm:)?testProfile$/.test(row.path) && model.scalar(row) === true);
  }
  function message(text, error) {
    status.textContent = text; status.title = text; status.dataset.error = String(!!error);
    apply.disabled = busy || !loaded || !testProfile(loaded) || !dirty || !!pending;
    run.disabled = busy;
  }
  function current(ctx, version) {
    if (key(context()) !== key(ctx) || version !== contextVersion) {
      throw new Error('Profile or sandbox changed during the operation. Look up the selected profile again.');
    }
  }
  async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok || data.error || data.ok === false) throw new Error(
      typeof data.error === 'string' ? data.error : data.message || 'Request failed (HTTP ' + response.status + ').');
    return data;
  }
  async function table(ctx, version) {
    if (!ctx.sandbox || !ctx.identifier) throw new Error('Select a sandbox and enter a profile identifier first.');
    const data = await jsonFetch('/api/profile/table?' + new URLSearchParams(ctx));
    current(ctx, version);
    if (data.found !== true || !Array.isArray(data.rows)) throw new Error('No profile found for this identifier.');
    return data;
  }
  function invalidate() {
    contextVersion++;
    loaded = null; baseline = null; loadedKey = ''; pending = null; dirty = false;
    if (global.DemoProfileDrawer.clearDrawerVisitorState) global.DemoProfileDrawer.clearDrawerVisitorState();
    if (api()) { api().setRecipientFirstName(null); api().clearDecision(); }
    document.getElementById('nwDecisionStatus').textContent = 'New context - no live decision applied.';
    message('Look up the selected test profile before applying changes.');
    bankingDetails();
  }
  function bankingDetails() {
    const loyalty = document.getElementById('profileDrawerLoyalty');
    if (!loyalty) return;
    loyalty.closest('.aep-profile-drawer-identity-row').hidden = true;
    let section = document.getElementById('nwBankingDetails');
    if (!section) {
      section = document.createElement('div'); section.id = 'nwBankingDetails';
      loyalty.closest('.aep-profile-drawer-col').appendChild(section);
    }
    section.replaceChildren();
    const values = loaded && model.readState(loaded.rows);
    for (const [name, label] of [['account', 'Account Type'], ['application', 'Application status'], ['product', 'Product intent'], ['cases', 'Service case']]) {
      const row = document.createElement('div'); row.className = 'aep-profile-drawer-identity-row';
      const title = document.createElement('strong'); title.textContent = label;
      const value = document.createElement('span');
      value.id = 'nwDrawerDetail-' + name;
      const present = loaded && loaded.rows.some(row => model.relativePath(row.path) === model.pathFor(name) ||
        name === 'account' && /^industryFsi\.financialProducts\./.test(model.relativePath(row.path)) && model.scalar(row) === true);
      value.textContent = values && present ? model.labels[values[name]] : loaded ? 'Not set' : 'Not loaded';
      row.append(title, value); section.appendChild(row);
    }
    global.dispatchEvent(new CustomEvent('natwest-drawer-signals-changed'));
  }
  global.NatwestDecisioningDrawer = {
    getSignals() {
      if (!loaded) return null;
      const state = model.readState(loaded.rows);
      return Object.fromEntries(['operations', 'intent'].map(name => [
        name, loaded.rows.some(row => model.relativePath(row.path) === model.pathFor(name)) ? state[name] : null,
      ]));
    },
  };
  async function load(ctx, version) {
    const data = await table(ctx, version);
    if (pending) {
      const differences = model.differences(data.rows, pending);
      if (differences.length) throw new Error('Saved values are not yet visible in AEP: ' +
        differences.map(item => item.path).join(', ') + '. Allow time for ingestion, then look up again. No decision was requested.');
      pending = null;
    }
    loaded = data; loadedKey = key(ctx);
    const preserve = dirty && baseline;
    baseline = model.readState(data.rows);
    if (!preserve) { api().setState(baseline); dirty = false; }
    else dirty = key(api().getState()) !== key(baseline);
    const first = data.rows.find(row => model.relativePath(row.path) === 'person.name.firstName');
    api().setRecipientFirstName(first ? model.scalar(first) : null);
    return data;
  }
  async function lookup() {
    if (busy) return;
    const ctx = context(), version = contextVersion;
    busy = true; message('Looking up profile...');
    try {
      await load(ctx, version);
      const ok = await global.DemoProfileDrawer.loadProfileDataForDrawer(ctx.identifier, {
        updateMessage: false, sendApplicationLogin: false,
      });
      current(ctx, version);
      if (!ok) throw new Error('Profile signals loaded, but the profile drawer could not be refreshed.');
      bankingDetails();
      if (testProfile(loaded) && tags) {
        await tags.stitchAfterProfileLookup(global.DemoProfileDrawer.getLastLookedUpProfile(), ctx.identifier);
        current(ctx, version);
      }
      const missingSignals = Object.values(model.fields).some(leaf =>
        !loaded.rows.some(row => model.relativePath(row.path) === 'natwestDecisioning.' + leaf));
      message(testProfile(loaded) ? 'Test profile loaded. ' + (missingSignals ?
        'Missing NatWest signals use illustrative defaults; Apply requires the FSI schema top-up.' : 'Signal changes are staged until Apply.') :
        'Profile loaded read-only. Only AEP test profiles can be edited or used for this demo decision.');
    } catch (error) {
      if (version === contextVersion) { loaded = null; loadedKey = ''; message(error.message, true); }
    } finally { busy = false; message(status.textContent, status.dataset.error === 'true'); }
  }
  async function preflight(data, groups, ctx, version) {
    for (const group of groups) {
      const config = data.industries[group.industry];
      const result = await jsonFetch('/api/aep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET', path: '/data/foundation/schemaregistry/tenant/schemas/' + encodeURIComponent(config.schemaId),
          platform_headers: { Accept: 'application/vnd.adobe.xed-full+json; version=1', 'x-sandbox-name': ctx.sandbox },
        }),
      });
      current(ctx, version);
      const schema = result.platform_response;
      if (!schema || result.status >= 400 || !schema.properties) throw new Error('Could not read the resolved ' + group.industry + ' profile schema.');
      const tenant = Object.keys(schema.properties).find(name =>
        /^_[a-zA-Z0-9]+$/.test(name) && schema.properties[name].properties &&
        schema.properties[name].properties[group.industry === 'fsi' ? 'natwestDecisioning' : 'scoring']);
      const changed = group.updates.filter(update => Object.hasOwn(group.expected, update.path));
      for (const update of changed) {
        let leaf = tenant && schema.properties[tenant];
        for (const part of update.path.split('.')) leaf = leaf && leaf.properties && leaf.properties[part];
        if (!leaf) throw new Error('Schema field missing: ' + update.path +
          '. After the Functions manifest release, run FSI setup step 2 (Attach field groups / Profile Core v2 top-up). This demo does not provision schemas.');
        const validType = typeof update.value === 'number' ? ['number', 'integer'].includes(leaf.type) : leaf.type === 'string';
        if (!validType || Array.isArray(leaf.enum) && !leaf.enum.includes(update.value)) throw new Error('Schema type or allowed values do not match ' + update.path + '.');
      }
    }
  }
  async function save() {
    if (busy) return;
    if (pending) { message('Verify the accepted update by lookup before applying more changes.', true); return; }
    const ctx = context(), version = contextVersion;
    if (!loaded || loadedKey !== key(ctx) || !baseline) { message('Look up the selected test profile first.', true); return; }
    busy = true; message('Checking schema and full writable snapshots...');
    let accepted = 0;
    try {
      const latest = await table(ctx, version);
      if (!testProfile(latest)) throw new Error('Only AEP test profiles can be edited by this demo.');
      const saved = api().getState();
      const batch = model.buildSnapshots(latest, saved, baseline);
      const groups = batch.snapshots.map(group => ({ ...group, expected: batch.expected }));
      await preflight(latest, groups, ctx, version);
      if (!latest.profileEmail || !latest.profileEmail.includes('@')) throw new Error('The selected profile has no email identity for streaming.');
      const acceptedExpected = {};
      for (const group of groups) {
        current(ctx, version);
        const response = await global.postProfileUpdate({
          sandbox: ctx.sandbox, industry: group.industry, email: latest.profileEmail,
          ecid: latest.ecid || undefined, updates: group.updates,
        });
        if (!response.ok || response.data.ok === false) throw new Error(global.formatProfileUpdateError(response.data));
        accepted++;
        for (const update of group.updates) if (Object.hasOwn(batch.expected, update.path)) acceptedExpected[update.path] = update.value;
        if (version === contextVersion) pending = { ...acceptedExpected };
      }
      current(ctx, version);
      baseline = saved; dirty = key(api().getState()) !== key(saved); loaded = latest;
      message('Snapshots accepted. Run will verify AEP readback before evaluating; ingestion may take time.');
    } catch (error) {
      if (version === contextVersion) message((accepted ? accepted + ' dataflow(s) accepted before failure; update is partial. Verify by lookup before retrying. ' : '') + error.message, true);
    } finally { busy = false; message(status.textContent, status.dataset.error === 'true'); }
  }
  function heroFromResult(result) {
    const matches = [];
    for (const proposition of result.propositions || []) {
      // Never attribute an unrouted/fallback item to the hero.
      const scopes = [proposition.scope, proposition.scopeDetails && proposition.scopeDetails.scope];
      if (!scopes.some(scope => /#hero-banner$/i.test(String(scope || '')))) continue;
      if (!proposition.id || !proposition.scope || !proposition.scopeDetails) continue;
      if (!Array.isArray(proposition.items) || !proposition.items.length ||
        proposition.items.some(item => /default-content-item$/.test(item.schema || ''))) continue;
      const scratch = document.implementation.createHTMLDocument('Decision image');
      scratch.body.innerHTML = '<div id="TopRibbon"></div><div id="hero-banner"></div><div id="ContentCardContainer"></div>';
      global.CdEdgeMounts.applyPropositionsManually([proposition], { root: scratch });
      const mount = scratch.getElementById('hero-banner');
      const image = mount.querySelector('img');
      const raw = image && image.getAttribute('src') || (!mount.children.length && mount.textContent.trim());
      if (!raw) continue;
      const url = new URL(raw, global.location.href);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The live decision image must use HTTP(S).');
      const title = mount.querySelector('.cd-slot-title,h1,h2,h3');
      const description = mount.querySelector('.cd-slot-desc,p');
      matches.push({ proposition, url: url.href, copy: {
        title: title ? title.textContent.trim() : '', description: description ? description.textContent.trim() : '',
      } });
    }
    if (matches.length !== 1) throw new Error('Expected one fresh hero-banner image decision; received ' + matches.length + '. Check the configured surface and decision content. Previous preview retained.');
    return matches[0];
  }
  async function decide() {
    if (busy) return;
    if (dirty) { message('Apply staged profile changes before running a live decision.', true); return; }
    const ctx = context(), version = contextVersion;
    const revision = signalRevision, runId = ++decisionRun;
    busy = true; message('Verifying profile readback before live decision...');
    try {
      const data = await load(ctx, version);
      if (!testProfile(data)) throw new Error('Only AEP test profiles can be used for this demo decision.');
      const runtime = global.DecisioningProfileRuntime;
      if (!runtime || !runtime.supportsManualDisplay) throw new Error('The live decision runtime is not ready. Reload to load the updated shared runtime.');
      if (!await runtime.runProfileLookup({ skipHydrate: true })) throw new Error('Decision runtime profile lookup failed.');
      current(ctx, version);
      message('Evaluating the live hero-banner surface...');
      const result = await runtime.runContentDecision({ manualDisplay: true });
      current(ctx, version);
      if (revision !== signalRevision) throw new Error('Signals changed during the live decision. Apply changes and run again.');
      const hero = heroFromResult(result);
      if (!result.manualDisplay || typeof result.manualDisplay.alloy !== 'function') throw new Error('Decision attribution is missing. Display tracking was not sent.');
      await api().setDecisionImage(hero.url, hero.copy);
      current(ctx, version);
      if (revision !== signalRevision) throw new Error('Signals changed while rendering the decision. Display tracking was not sent.');
      message('Live image and copy applied. Objective ranking remains a local simulation.');
      const displayKey = key([version, runId, hero.proposition.id, hero.proposition.items]);
      if (displayAttempts.has(displayKey)) return;
      // Reserve before send; an uncertain network failure must not cause a duplicate retry.
      displayAttempts.add(displayKey);
      try {
        await result.manualDisplay.alloy('sendEvent', {
          renderDecisions: false, personalization: { defaultPersonalizationEnabled: false },
          xdm: { eventType: 'decisioning.propositionDisplay', identityMap: result.manualDisplay.identityMap,
            _experience: { decisioning: {
              propositions: [{ id: hero.proposition.id, scope: hero.proposition.scope, scopeDetails: hero.proposition.scopeDetails }],
              propositionEventType: { display: 1 },
            } } },
        });
        current(ctx, version);
        document.getElementById('nwDecisionStatus').textContent = 'Live decision applied to Web / Email / Email Mobile.';
      } catch (error) {
        if (version === contextVersion) message('Hero displayed, but display tracking failed: ' + error.message + '. No automatic retry.', true);
      }
    } catch (error) {
      if (version === contextVersion) message(error.message, true);
    } finally { busy = false; message(status.textContent, status.dataset.error === 'true'); }
  }
  function themeFrame() {
    const doc = frame.contentDocument;
    if (!doc) return;
    const theme = document.documentElement.getAttribute('data-aep-theme');
    if (theme) doc.documentElement.setAttribute('data-aep-theme', theme); else doc.documentElement.removeAttribute('data-aep-theme');
    if (api()) api().setRecipientFirstName(loaded && loaded.rows.find(row => model.relativePath(row.path) === 'person.name.firstName')?.value);
  }
  function wireFrame() {
    if (!api() || frame.contentDocument.documentElement.dataset.nwWired) return;
    frame.contentDocument.documentElement.dataset.nwWired = 'true';
    themeFrame();
    if (baseline) api().setState(baseline);
    frame.contentWindow.addEventListener('natwest-signals-changed', () => {
      signalRevision++;
      dirty = !baseline || key(api().getState()) !== key(baseline);
      message(loaded ? 'Profile changes staged. Apply writes full snapshots to AEP.' : 'Simulation changed. Look up a test profile before applying.');
    });
    frame.contentWindow.addEventListener('natwest-channel-changed', event => {
      const url = new URL(global.location.href);
      url.searchParams.set('channel', event.detail === 'desktop' ? 'email' : event.detail);
      global.history.pushState({}, '', url);
    });
  }
  async function init() {
    const email = document.getElementById('customerEmail');
    global.AepIdentityPicker.init('customerEmail', prefix + 'Ns');
    if (global.attachEmailDatalist) global.attachEmailDatalist('customerEmail', 'recentEmails', prefix + 'Ns');
    if (global.hydrateIdentifierFromSession) global.hydrateIdentifierFromSession('customerEmail', prefix + 'Ns');
    const getTarget = () => targets.find(target => target.id === document.getElementById('generatorTarget').value) || null;
    tags = global.DemoTagsInjection.init({
      storagePrefix: prefix, identityEventType: 'natwest.decisioning.identity.stitch',
      messageSetter: (text, type) => message(text, type === 'error'), infoEcidId: 'infoEcid',
      tagsCompanyId: prefix + 'TagsCompany', tagsPropertyInputId: prefix + 'TagsProperty',
      tagsPropertyListId: prefix + 'TagsPropertyList', tagsEnvironmentId: prefix + 'TagsEnvironment',
      injectButtonId: prefix + 'InjectSdkBtn', selectedScriptId: prefix + 'SelectedScript',
      configFieldsId: prefix + 'SdkConfigFields', configSummaryId: prefix + 'SdkConfigSummary',
      configSummaryTextId: prefix + 'SdkConfigSummaryText', changeConfigButtonId: prefix + 'ChangeSdkConfigBtn',
      getSelectedGeneratorTarget: getTarget, getEmail: () => email.value, iframeIds: ['nwDecisioningFrame'],
      hideTagsCompanyUi: true, webPush: { enabled: false }, brandConcierge: { enabled: false },
    });
    global.envBar.registerTagsInjection(tags);
    global.DemoProfileDrawer.init({
      emailInputId: 'customerEmail', profileOpenClass: 'mod-demo-page--profile-open',
      viewName: 'NatWest Decisioning', emailGetter: () => email.value,
      messageSetter: (text, type) => message(text, type === 'error'), getSelectedGeneratorTarget: getTarget,
      fetchBrowserEcidOnInit: true,
    });
    global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(async () => {
      targets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(document.getElementById('generatorTarget'), {});
    });
    document.getElementById('queryProfileBtn').addEventListener('click', () => void lookup());
    email.addEventListener('input', invalidate);
    document.getElementById(prefix + 'Ns').addEventListener('change', invalidate);
    global.addEventListener('aep-global-sandbox-change', invalidate);
    global.addEventListener('aep-profile-drawer-loaded', bankingDetails);
    document.addEventListener('click', event => {
      if (!event.target.closest('#cdMicroProfileRunBtn')) return;
      event.preventDefault(); event.stopImmediatePropagation(); void decide();
    }, true);
    apply.addEventListener('click', () => void save()); run.addEventListener('click', () => void decide());
    frame.addEventListener('load', wireFrame); wireFrame();
    global.addEventListener('popstate', () => {
      const channel = new URLSearchParams(global.location.search).get('channel');
      api().setMode(channel === 'email' ? 'desktop' : channel, false);
    });
    const anchor = document.querySelector('.mod-demo-top-anchor');
    const toolbar = document.querySelector('.spectrum-env-status-bar');
    const actions = document.querySelector('.nw-decisioning-actions');
    function layout() {
      const hidden = anchor && (anchor.classList.contains('lab-env-top-anchor--docked-hidden') || anchor.classList.contains('lab-env-top-anchor--presenter-strip-hidden'));
      const top = hidden ? 0 : toolbar && anchor ? toolbar.getBoundingClientRect().bottom - anchor.getBoundingClientRect().top + anchor.offsetTop : 48;
      document.body.style.setProperty('--nw-toolbar-top', top + 'px');
      document.body.style.setProperty('--nw-content-top', (top + actions.getBoundingClientRect().height) + 'px');
    }
    const resize = new ResizeObserver(layout);
    if (toolbar) resize.observe(toolbar);
    resize.observe(actions);
    if (anchor) new MutationObserver(layout).observe(anchor, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(themeFrame).observe(document.documentElement, { attributes: true, attributeFilter: ['data-aep-theme'] });
    layout(); bankingDetails();
  }
  global.addEventListener('natwest-preview-status', event => {
    document.getElementById('nwDecisionStatus').textContent = event.detail;
  });
  global.envBar.ready().then(init).catch(error => message('Demo initialization failed: ' + error.message, true));
})(window);
