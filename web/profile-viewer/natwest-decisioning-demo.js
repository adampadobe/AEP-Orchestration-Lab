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
  let ingestionToken = 0, ingestion = null, ingestionNote = '', decisionPaths = [];
  const ingestionTimeout = 'AEP is still processing the profile update. Try Run live image decision again in a moment.';
  function cancelIngestion() {
    ingestionToken++;
    if (ingestion) ingestion.controller.abort();
    ingestion = null; ingestionNote = '';
  }
  const displayAttempts = new Set();
  const stagedFields = new Set();
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
  function hasStagedChanges() {
    return !baseline || key(api().getState()) !== key(baseline) || [...stagedFields].some(name =>
      loaded && !loaded.rows.some(row => model.relativePath(row.path) === model.pathFor(name) && model.scalar(row) !== null));
  }
  function message(text, error) {
    status.textContent = text; status.title = text; status.dataset.error = String(!!error);
    apply.disabled = busy || !!pending || !!loaded && (!testProfile(loaded) || !dirty);
    apply.title = busy ? 'An operation is in progress.' : pending ? 'Accepted changes are being confirmed. Run waits for confirmation.' :
      loaded && !testProfile(loaded) ? 'Only AEP test profiles can be updated.' :
      loaded && !dirty ? 'Change a profile signal to enable Apply.' :
      !loaded ? 'Apply will first look up and validate the selected test profile.' : 'Send staged changes as full writable JSON profile snapshots.';
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
  async function table(ctx, version, signal) {
    if (!ctx.sandbox || !ctx.identifier) throw new Error('Select a sandbox and enter a profile identifier first.');
    const data = await jsonFetch('/api/profile/table?' + new URLSearchParams(ctx), { signal });
    current(ctx, version);
    if (data.found !== true || !Array.isArray(data.rows)) throw new Error('No profile found for this identifier.');
    return data;
  }
  function invalidate() {
    cancelIngestion();
    contextVersion++;
    loaded = null; baseline = null; loadedKey = ''; pending = null; dirty = false;
    stagedFields.clear();
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
    for (const [name, label] of model.groups.flatMap(group => group[2])) {
      const row = document.createElement('div'); row.className = 'aep-profile-drawer-identity-row';
      const title = document.createElement('strong'); title.textContent = label;
      const value = document.createElement('span');
      value.id = 'nwDrawerDetail-' + name;
      const present = loaded && loaded.rows.some(row => model.relativePath(row.path) === model.pathFor(name) && model.scalar(row) !== null);
      value.textContent = values && present ? model.labelFor(values[name]) : loaded ? 'Not set' : 'Not loaded';
      value.title = model.pathFor(name);
      row.append(title, value); section.appendChild(row);
    }
    global.dispatchEvent(new CustomEvent('natwest-drawer-signals-changed'));
  }
  global.NatwestDecisioningDrawer = {
    getSignals() {
      if (!loaded) return null;
      const state = model.readState(loaded.rows);
      return Object.fromEntries(Object.keys(model.fields).map(name => [
        name, loaded.rows.some(row => model.relativePath(row.path) === model.pathFor(name) && model.scalar(row) !== null) ? state[name] : null,
      ]));
    },
  };
  function adoptProfile(data, ctx) {
    loaded = data; loadedKey = key(ctx);
    const staged = dirty ? api().getState() : null;
    baseline = model.readState(data.rows);
    if (staged) {
      api().setState({ ...baseline, ...Object.fromEntries([...stagedFields].map(name => [name, staged[name]])) });
      dirty = hasStagedChanges();
    } else { api().setState(baseline); dirty = false; stagedFields.clear(); }
    const first = data.rows.find(row => model.relativePath(row.path) === 'person.name.firstName');
    api().setRecipientFirstName(first ? model.scalar(first) : null);
    return data;
  }
  async function readDecisionPaths(ctx, version) {
    const rules = [], cursors = new Set();
    let cursor = '';
    do {
      const result = await jsonFetch('/api/aep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'GET',
          path: '/data/core/dps/offer-rules?limit=50' + (cursor ? '&start=' + encodeURIComponent(cursor) : ''),
          platform_headers: { 'x-sandbox-name': ctx.sandbox, Accept: 'application/json' } }),
      });
      current(ctx, version);
      const page = result.platform_response;
      if (result.status >= 400 || !page || !Array.isArray(page.results)) throw new Error('Could not audit AJO eligibility rules. No profile updates were sent.');
      rules.push(...page.results);
      const next = page._links && page._links.next;
      cursor = next ? new URL(typeof next === 'string' ? next : next.href, global.location.origin).searchParams.get('start') : '';
      if (next && !cursor || cursor && cursors.has(cursor)) throw new Error('Invalid AJO eligibility-rule pagination. No profile updates were sent.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    const paths = model.decisionFields(rules);
    console.info('[NatWest] AJO control audit', { sandbox: ctx.sandbox, paths,
      simulationOnly: Object.entries(model.fields).filter(([, path]) => !paths.includes(path)).map(([name, path]) => ({ name, path })) });
    return paths;
  }
  function confirmIngestion(ctx) {
    const version = contextVersion, contextKey = key(ctx);
    if (ingestion && ingestion.key === contextKey && ingestion.token === ingestionToken) return ingestion.promise;
    const token = ingestionToken, controller = new AbortController(), started = Date.now();
    const active = () => token === ingestionToken && version === contextVersion && contextKey === key(context());
    const waiting = () => {
      if (active() && (!busy || ingestionNote)) message((ingestionNote ||
        'Snapshots accepted by AEP. Confirming the update in the profile...') + ' ' + Math.floor((Date.now() - started) / 1000) + 's');
    };
    const operation = { key: contextKey, token, controller, promise: null };
    ingestion = operation;
    operation.promise = (async () => {
      const ticker = setInterval(waiting, 1000);
      const deadline = setTimeout(() => controller.abort(), 120000);
      let delay = 1500;
      try {
        while (active() && !controller.signal.aborted && pending) {
          await new Promise(resolve => {
            const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, delay);
            controller.signal.addEventListener('abort', finish, { once: true });
          });
          if (!active() || controller.signal.aborted) break;
          const data = await table(ctx, version, controller.signal);
          if (!active()) return false;
          const differences = model.differences(data.rows, model.decisionExpected(pending, decisionPaths));
          if (!differences.length) {
            pending = null;
            adoptProfile(data, ctx); bankingDetails();
            const ok = await global.DemoProfileDrawer.loadProfileDataForDrawer(ctx.identifier, {
              updateMessage: false, sendApplicationLogin: false,
            });
            if (!active()) return false;
            if (!ok) console.warn('[NatWest] Confirmed profile; drawer refresh was unavailable.');
            bankingDetails();
            if (!busy) message('Snapshots accepted and confirmed in the profile. Ready to run live image decision.');
            return true;
          }
          console.info('[NatWest] Waiting for decision-relevant profile fields', differences);
          delay = Math.min(6000, delay * 1.5);
        }
      } catch (error) {
        if (active() && !controller.signal.aborted) {
          console.warn('[NatWest] Profile confirmation failed', error);
          message('Profile confirmation could not complete. Try Run live image decision again.', true);
          return false;
        }
      } finally {
        clearInterval(ticker); clearTimeout(deadline);
        if (ingestion === operation) ingestion = null;
      }
      if (active()) message(ingestionTimeout);
      return false;
    })();
    return operation.promise;
  }
  async function load(ctx, version) {
    if (pending && !await confirmIngestion(ctx)) return null;
    current(ctx, version);
    return adoptProfile(await table(ctx, version), ctx);
  }
  async function lookup() {
    if (busy) return;
    const ctx = context(), version = contextVersion;
    busy = true; message('Looking up profile...');
    try {
      if (!await load(ctx, version)) return;
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
      const missingSignals = Object.values(model.fields).some(path =>
        !loaded.rows.some(row => model.relativePath(row.path) === path && model.scalar(row) !== null));
      message(testProfile(loaded) ? 'Test profile loaded. ' + (missingSignals ?
        'Missing signals use illustrative defaults in the local simulation only; the drawer shows Not set. Apply checks the existing schema.' : 'Signal changes are staged until Apply.') :
        'Profile loaded read-only. Only AEP test profiles can be edited or used for this demo decision.');
    } catch (error) {
      if (version === contextVersion) { loaded = null; loadedKey = ''; bankingDetails(); message(error.message, true); }
    } finally { busy = false; message(status.textContent, status.dataset.error === 'true'); }
  }
  async function preflight(data, groups, ctx, version) {
    for (const group of groups) {
      const config = data.industries[group.industry];
      async function readSchema(accept) {
        const result = await jsonFetch('/api/aep', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'GET', path: '/data/foundation/schemaregistry/tenant/schemas/' + encodeURIComponent(config.schemaId),
            platform_headers: { Accept: accept, 'x-sandbox-name': ctx.sandbox },
          }),
        });
        current(ctx, version);
        if (result.status >= 400 || !result.platform_response) throw new Error('Could not read the ' + group.industry +
          ' profile schema in sandbox ' + ctx.sandbox + ': ' + config.schemaId + '.');
        return result.platform_response;
      }
      // Pin the resolved read: a major-only request can return an older cached minor.
      const metadata = await readSchema('application/vnd.adobe.xed+json; version=1');
      if (!/^\d+\.\d+$/.test(String(metadata.version || ''))) throw new Error('Could not determine the current ' +
        group.industry + ' schema version in sandbox ' + ctx.sandbox + '.');
      const schema = await readSchema('application/vnd.adobe.xed-full+json; version=' + metadata.version);
      current(ctx, version);
      if (schema.version !== metadata.version || !schema.properties) throw new Error('Could not read the current resolved ' +
        group.industry + ' profile schema version ' + metadata.version + ' in sandbox ' + ctx.sandbox + '.');
      const changed = group.updates.filter(update => Object.hasOwn(group.expected, update.path));
      for (const update of changed) {
        const rootField = update.path.startsWith('consents.');
        const tenant = Object.keys(schema.properties).filter(name =>
          /^_[a-zA-Z0-9]+$/.test(name) && schema.properties[name].properties &&
          schema.properties[name].properties[update.path.split('.')[0]]);
        if (!rootField && tenant.length > 1) throw new Error('Ambiguous schema tenant for ' + update.path + '.');
        let leaf = rootField ? schema : tenant.length === 1 && schema.properties[tenant[0]];
        for (const part of update.path.split('.')) leaf = leaf && leaf.properties && leaf.properties[part];
        if (!leaf) throw new Error('Schema field missing: ' + update.path +
          '. Sandbox: ' + ctx.sandbox + '; dataflow: ' + group.industry + '; schema: ' +
          (schema.title || config.schemaId) + ' (' + config.schemaId + '). The loaded profile can merge values from other datasets; ' +
          'this write schema must contain the field. An administrator must review any field-group attachment; Apply does not provision schemas.');
        const validType = typeof update.value === 'number' ?
          leaf.type === 'number' || leaf.type === 'integer' && Number.isInteger(update.value) : leaf.type === typeof update.value;
        const invalidRange = typeof update.value === 'number' &&
          (typeof leaf.minimum === 'number' && update.value < leaf.minimum ||
           typeof leaf.maximum === 'number' && update.value > leaf.maximum);
        if (!validType || invalidRange || Array.isArray(leaf.enum) && !leaf.enum.includes(update.value)) {
          throw new Error('Schema type or allowed values do not match ' + update.path + '.');
        }
      }
    }
  }
  async function save() {
    if (busy) return;
    if (pending) { message('Accepted changes are being confirmed. Run waits for confirmation.'); return; }
    cancelIngestion();
    const ctx = context(), version = contextVersion;
    busy = true; message('Checking schema and full writable snapshots...');
    let accepted = 0;
    try {
      const needsLookup = !loaded || loadedKey !== key(ctx) || !baseline;
      const latest = needsLookup ? await load(ctx, version) : await table(ctx, version);
      if (!testProfile(latest)) throw new Error('Only AEP test profiles can be edited by this demo.');
      if (needsLookup) {
        const ok = await global.DemoProfileDrawer.loadProfileDataForDrawer(ctx.identifier, {
          updateMessage: false, sendApplicationLogin: false,
        });
        current(ctx, version);
        if (!ok) {
          loaded = null; loadedKey = ''; bankingDetails();
          throw new Error('Profile signals loaded, but the profile drawer could not be refreshed. Look up again before applying.');
        }
      }
      bankingDetails();
      if (!dirty) { message('Test profile loaded. Change a signal, then Apply to send the JSON profile update.'); return; }
      const saved = api().getState();
      const batch = model.buildSnapshots(latest, saved, baseline, [...stagedFields]);
      const groups = batch.snapshots.map(group => ({ ...group, expected: batch.expected }));
      await preflight(latest, groups, ctx, version);
      decisionPaths = await readDecisionPaths(ctx, version);
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
      if (!dirty) stagedFields.clear();
      message('Snapshots accepted by AEP. Confirming the update in the profile... 0s');
      void confirmIngestion(ctx);
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
      if (pending) {
        ingestionNote = 'Waiting for AEP to confirm the profile update, then requesting the decision...';
        message(ingestionNote + ' 0s');
        if (!await confirmIngestion(ctx)) return;
        ingestionNote = '';
      }
      const data = await load(ctx, version);
      if (!data) return;
      if (revision !== signalRevision || dirty) throw new Error('Signals changed while waiting. Apply changes before running a live decision.');
      if (!testProfile(data)) throw new Error('Only AEP test profiles can be used for this demo decision.');
      for (const name of ['consent', 'personalisation']) {
        if (!data.rows.some(row => model.relativePath(row.path) === model.pathFor(name) && model.scalar(row) === 'y')) {
          throw new Error('Live preview requires explicit y consent in ' + model.pathFor(name) + '. Missing values and local defaults do not grant consent.');
        }
      }
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
              propositions: [{ id: hero.proposition.id, scope: hero.proposition.scope, scopeDetails: hero.proposition.scopeDetails,
                items: hero.proposition.items.map(item => ({
                  id: item.id, ...(item.name ? { name: item.name } : {}),
                  ...(item.itemSelection ? { itemSelection: item.itemSelection } : {}),
                })),
              }],
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
    } finally { ingestionNote = ''; busy = false; message(status.textContent, status.dataset.error === 'true'); }
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
    frame.contentWindow.addEventListener('natwest-signals-changed', event => {
      signalRevision++;
      for (const name of event.detail && event.detail.names || []) if (Object.hasOwn(model.fields, name)) stagedFields.add(name);
      dirty = hasStagedChanges();
      message(loaded ? 'Profile changes staged. Apply writes full snapshots to AEP.' :
        'Profile changes staged. Apply will look up the selected test profile, validate the schema and send full JSON snapshots.');
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
    layout(); bankingDetails(); message('Select a profile and edit signals, then Apply. Apply looks up and validates the test profile before sending JSON snapshots.');
  }
  global.addEventListener('natwest-preview-status', event => {
    document.getElementById('nwDecisionStatus').textContent = event.detail;
  });
  global.envBar.ready().then(init).catch(error => message('Demo initialization failed: ' + error.message, true));
})(window);
