(function (global) {
  'use strict';
  const prefix = 'tuiDecisioning', $ = id => document.getElementById(id);
  const frame = $('tui-visualiser'), model = global.TuiDecisioning, profile = global.TuiDecisioningProfile;
  const edited = new Set();
  let loaded = null, version = 0, revision = 0, busy = false, pending = null, targets = [], tags;
  const api = () => frame.contentWindow?.TuiDecisioningVisualiser;
  const context = () => ({ sandbox: global.AepGlobalSandbox.getSandboxName(),
    namespace: $(prefix + 'Ns').value.toLowerCase(), identifier: $('customerEmail').value.trim() });
  const same = (ctx, token) => {
    if (token !== version || JSON.stringify(ctx) !== JSON.stringify(context())) throw new Error('Identity or sandbox changed. Look up the current profile again.');
  };
  function message(text, error) {
    api()?.setBusy(busy);
    $('tuiLiveStatus').textContent = text; $('tuiLiveStatus').dataset.error = String(!!error);
    $('tuiApplyProfile').disabled = busy || !!pending || !edited.size;
    $('tuiRunDecision').disabled = busy;
  }
  function publish() { global.dispatchEvent(new CustomEvent('tui-profile-changed')); }
  function invalidate() {
    version++; revision++; loaded = null; pending = null; edited.clear();
    global.DemoProfileDrawer.clearDrawerVisitorState();
    api()?.setProfile(null); publish();
    message('Context changed. Look up the selected test profile.');
  }
  function isTest(data) { return data.rows.some(row => /^(xdm:)?testProfile$/.test(row.path) && profile.scalar(row) === true); }
  async function json(url, options) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(120000) });
    const data = await response.json();
    if (!response.ok || data.ok === false || data.error) throw new Error(typeof data.error === 'string' ? data.error : data.message || 'HTTP ' + response.status);
    return data;
  }
  async function table(ctx, token) {
    if (!ctx.sandbox || !ctx.identifier) throw new Error('Select a sandbox and enter a profile identifier.');
    const data = await json('/api/profile/table?' + new URLSearchParams(ctx)); same(ctx, token);
    if (data.found !== true || !Array.isArray(data.rows)) throw new Error('No profile found.');
    return data;
  }
  async function adopt(data, ctx, token) {
    same(ctx, token);
    const staged = api().getState();
    loaded = data;
    const values = profile.signals(data.rows, true);
    for (const key of edited) values[key] = staged[key];
    api().setProfile({ state: values, firstName: data.rows.find(row => profile.relative(row.path) === 'person.name.firstName')?.value,
      email: data.profileEmail || ctx.identifier });
    const ok = await global.DemoProfileDrawer.loadProfileDataForDrawer(ctx.identifier, { updateMessage: false, sendApplicationLogin: false });
    same(ctx, token);
    if (!ok) throw new Error('Signals loaded, but profile drawer lookup failed. Retry lookup before editing.');
    publish();
  }
  async function lookup() {
    if (busy) return;
    const ctx = context(), token = version; busy = true; message('Looking up profile...');
    try {
      const data = await table(ctx, token); await adopt(data, ctx, token);
      message(isTest(data) ? 'Test profile loaded. Changes are staged until Apply; missing values remain Not set in the drawer.' : 'Profile loaded read-only. Apply and Run require a test profile.');
    } catch (error) {
      if (token === version) { loaded = null; api()?.setProfile(null); global.DemoProfileDrawer.clearDrawerVisitorState(); publish(); message(error.message, true); }
    } finally { busy = false; message($('tuiLiveStatus').textContent, $('tuiLiveStatus').dataset.error === 'true'); }
  }
  async function preflight(data, batch, ctx, token) {
    for (const group of batch.snapshots) {
      const config = data.industries[group.industry];
      const read = async accept => {
        const result = await json('/api/aep', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'GET', path: '/data/foundation/schemaregistry/tenant/schemas/' + encodeURIComponent(config.schemaId),
            platform_headers: { Accept: accept, 'x-sandbox-name': ctx.sandbox } }) });
        same(ctx, token);
        if (result.status >= 400 || !result.platform_response) throw new Error('Cannot read ' + group.industry + ' write schema.');
        return result.platform_response;
      };
      const meta = await read('application/vnd.adobe.xed+json; version=1');
      if (!/^\d+\.\d+$/.test(meta.version || '')) throw new Error('Missing current schema version.');
      const schema = await read('application/vnd.adobe.xed-full+json; version=' + meta.version);
      if (schema.version !== meta.version || !schema.properties) throw new Error('Current resolved schema unavailable.');
      for (const update of group.updates.filter(update => Object.hasOwn(batch.expected, update.path))) {
        const tenants = Object.keys(schema.properties).filter(key => /^_[A-Za-z0-9]+$/.test(key));
        if (!update.path.startsWith('consents.') && tenants.length !== 1) throw new Error('Ambiguous schema tenant.');
        let leaf = update.path.startsWith('consents.') ? schema : schema.properties[tenants[0]];
        for (const part of update.path.split('.')) leaf = leaf?.properties?.[part];
        const type = typeof update.value;
        if (!leaf || !(leaf.type === type || leaf.type === 'integer' && Number.isInteger(update.value)) ||
          Array.isArray(leaf.enum) && !leaf.enum.includes(update.value) ||
          type === 'number' && (leaf.minimum !== undefined && update.value < leaf.minimum || leaf.maximum !== undefined && update.value > leaf.maximum)) {
          throw new Error('Write schema missing/incompatible field: ' + update.path + ' (' + group.industry + '). No automatic provisioning.');
        }
      }
    }
  }
  async function confirm(ctx, token) {
    const start = Date.now();
    while (pending && Date.now() - start < 120000) {
      same(ctx, token);
      message('Snapshots accepted. Waiting for profile readback... ' + Math.floor((Date.now() - start) / 1000) + 's');
      await new Promise(resolve => setTimeout(resolve, 1500)); same(ctx, token);
      const data = await table(ctx, token);
      if (!profile.differences(data.rows, pending).length) {
        const state = api().getState();
        for (const key of edited) {
          const path = profile.relative(model.fields.find(field => field.key === key).path);
          if (Object.hasOwn(pending, path) && state[key] === pending[path]) edited.delete(key);
        }
        pending = null; await adopt(data, ctx, token); return true;
      }
    }
    if (pending) throw new Error('AEP is still processing accepted changes. Run again to check readback; do not resend.');
    return true;
  }
  async function apply() {
    if (busy || !edited.size) return;
    const ctx = context(), token = version; busy = true;
    let accepted = 0;
    try {
      if (ctx.sandbox !== 'kirkham') throw new Error('This TUI catalog targets kirkham. Select kirkham before Apply.');
      if (pending) { await confirm(ctx, token); return; }
      message('Validating test profile and full writable snapshots...');
      const latest = await table(ctx, token);
      if (!isTest(latest)) throw new Error('Only AEP test profiles can be updated.');
      const batch = profile.snapshots(latest, api().getState(), [...edited]);
      await preflight(latest, batch, ctx, token);
      if (!latest.profileEmail?.includes('@')) throw new Error('Profile has no email identity for streaming.');
      for (const group of batch.snapshots) {
        same(ctx, token);
        const previousPending = pending;
        const expected = Object.fromEntries(group.updates.filter(row => Object.hasOwn(batch.expected, row.path)).map(row => [row.path, row.value]));
        // Reconcile interrupted responses by readback instead of resending.
        pending = { ...pending, ...expected };
        const response = await global.postProfileUpdate({ sandbox: ctx.sandbox, industry: group.industry,
          email: latest.profileEmail, ecid: latest.ecid || undefined, updates: group.updates });
        same(ctx, token);
        if (!response.ok || response.data.ok === false) {
          if (!response.res || response.res.status < 500) pending = previousPending;
          throw new Error(global.formatProfileUpdateError(response.data));
        }
        accepted++;
        for (const key of edited) {
          const field = model.fields.find(field => field.key === key);
          if (Object.hasOwn(expected, profile.relative(field.path))) edited.delete(key);
        }
      }
      await confirm(ctx, token); message('Profile changes confirmed. Run requests the configured live policy.');
    } catch (error) {
      if (token === version) message((accepted ? accepted + ' dataflow(s) accepted; ' : '') +
        (pending ? 'Run checks pending readback; do not resend. ' : '') + error.message, true);
    } finally { busy = false; message($('tuiLiveStatus').textContent, $('tuiLiveStatus').dataset.error === 'true'); }
  }
  async function run() {
    if (busy) return;
    const ctx = context(), token = version, changedAt = revision; busy = true;
    message('Checking profile and consent before live decision...');
    try {
      if (ctx.sandbox !== 'kirkham') throw new Error('This TUI catalog targets kirkham. Select kirkham before Run.');
      if (pending) await confirm(ctx, token);
      if (edited.size) throw new Error('Apply staged changes before Run.');
      if (!loaded) throw new Error('Look up the current test profile before Run.');
      const data = await table(ctx, token), values = profile.signals(data.rows);
      if (!isTest(data)) throw new Error('Only test profiles can run this demo.');
      if (values.emailConsent !== 'y' || values.personalize !== 'y') {
        api().hold('Live content held: loaded email and personalisation consent must both be y.');
        throw new Error('Actual loaded consent must be y; illustrative defaults do not grant permission.');
      }
      const runtime = global.DecisioningProfileRuntime;
      if (!runtime?.supportsManualDisplay) throw new Error('Configure and inject Tags with the current decisioning runtime first.');
      if (!await runtime.runProfileLookup({ skipHydrate: true })) throw new Error('Decision runtime lookup failed.');
      same(ctx, token);
      message('Evaluating the configured policy. TUI draft catalog is not automatically activated.');
      const result = await runtime.runContentDecision({ manualDisplay: true }); same(ctx, token);
      if (revision !== changedAt) throw new Error('Signals changed during Run. Apply and run again.');
      const matches = [];
      for (const proposition of result.propositions || []) {
        if (!/#hero-banner$/i.test(proposition.scope || '') || !proposition.id || !proposition.scopeDetails ||
          !proposition.items?.length || proposition.items.some(item => /default-content-item$/.test(item.schema || ''))) continue;
        const scratch = document.implementation.createHTMLDocument('Decision');
        for (const id of ['TopRibbon', 'hero-banner', 'ContentCardContainer']) { const div = scratch.createElement('div'); div.id = id; scratch.body.append(div); }
        global.CdEdgeMounts.applyPropositionsManually([proposition], { root: scratch });
        const hero = scratch.getElementById('hero-banner'), image = hero.querySelector('img');
        const src = image?.getAttribute('src') || (!hero.children.length && hero.textContent.trim());
        if (!src) continue;
        const url = new URL(src, location.href);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Live image URL must use HTTP(S).');
        matches.push({ proposition, url: url.href, title: hero.querySelector('.cd-slot-title,h1,h2,h3')?.textContent || '',
          description: hero.querySelector('.cd-slot-desc,p')?.textContent || '' });
      }
      if (matches.length !== 1) throw new Error('Expected one hero image decision; got ' + matches.length + '. Previous preview retained.');
      if (typeof result.manualDisplay?.alloy !== 'function') throw new Error('Decision display attribution missing.');
      await api().setDecision(matches[0]); same(ctx, token);
      if (revision !== changedAt) throw new Error('Signals changed during image loading. No display event sent.');
      const p = matches[0].proposition;
      await result.manualDisplay.alloy('sendEvent', { renderDecisions: false, personalization: { defaultPersonalizationEnabled: false },
        xdm: { eventType: 'decisioning.propositionDisplay', identityMap: result.manualDisplay.identityMap,
          _experience: { decisioning: { propositions: [{ id: p.id, scope: p.scope, scopeDetails: p.scopeDetails,
            items: p.items.map(item => ({ id: item.id, ...(item.name ? { name: item.name } : {}), ...(item.itemSelection ? { itemSelection: item.itemSelection } : {}) })) }],
            propositionEventType: { display: 1 } } } } });
      same(ctx, token); message('Live hero displayed across all three views. Objective ladder remains a local simulation.');
    } catch (error) { if (token === version) message(error.message + ' No automatic retry.', true); }
    finally { busy = false; message($('tuiLiveStatus').textContent, $('tuiLiveStatus').dataset.error === 'true'); }
  }
  global.TuiDecisioningDrawer = { getSignals: () => loaded ? profile.signals(loaded.rows) : null };
  function wire() {
    if (!api() || frame.contentDocument.documentElement.dataset.tuiWired) return;
    frame.contentDocument.documentElement.dataset.tuiWired = 'true';
    api().setEmbedded();
    frame.contentWindow.addEventListener('tui-signals-changed', event => {
      revision++;
      for (const key of event.detail.keys) edited.add(key);
      message('Signals staged. Apply validates and updates full test-profile snapshots.');
    });
  }
  async function init() {
    const email = $('customerEmail'), getTarget = () => targets.find(target => target.id === $('generatorTarget').value) || null;
    global.AepIdentityPicker.init('customerEmail', prefix + 'Ns');
    global.attachEmailDatalist?.('customerEmail', 'recentEmails', prefix + 'Ns');
    tags = global.DemoTagsInjection.init({
      storagePrefix: prefix, identityEventType: 'tui.decisioning.identity.stitch',
      messageSetter: (text, type) => message(text, type === 'error'), infoEcidId: 'infoEcid',
      tagsCompanyId: prefix + 'TagsCompany', tagsPropertyInputId: prefix + 'TagsProperty', tagsPropertyListId: prefix + 'TagsPropertyList',
      tagsEnvironmentId: prefix + 'TagsEnvironment', injectButtonId: prefix + 'InjectSdkBtn', selectedScriptId: prefix + 'SelectedScript',
      configFieldsId: prefix + 'SdkConfigFields', configSummaryId: prefix + 'SdkConfigSummary',
      configSummaryTextId: prefix + 'SdkConfigSummaryText', changeConfigButtonId: prefix + 'ChangeSdkConfigBtn',
      getSelectedGeneratorTarget: getTarget, getEmail: () => email.value, iframeIds: ['tui-visualiser'],
      hideTagsCompanyUi: true, webPush: { enabled: false }, brandConcierge: { enabled: false },
    });
    global.envBar.registerTagsInjection(tags);
    global.DemoProfileDrawer.init({ emailInputId: 'customerEmail', profileOpenClass: 'mod-demo-page--profile-open',
      viewName: 'TUI Decisioning', emailGetter: () => email.value, messageSetter: (text, type) => message(text, type === 'error'),
      getSelectedGeneratorTarget: getTarget, fetchBrowserEcidOnInit: true });
    global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(async () => {
      targets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect($('generatorTarget'), {});
    });
    $('queryProfileBtn').addEventListener('click', () => void lookup());
    email.addEventListener('input', invalidate); $(prefix + 'Ns').addEventListener('change', invalidate);
    global.addEventListener('aep-global-sandbox-change', invalidate);
    $('tuiApplyProfile').addEventListener('click', () => void apply()); $('tuiRunDecision').addEventListener('click', () => void run());
    document.addEventListener('click', event => {
      if (event.target.closest('#cdMicroProfileRunBtn')) { event.preventDefault(); event.stopImmediatePropagation(); void run(); }
    }, true);
    frame.addEventListener('load', wire); wire();
    const anchor = document.querySelector('.mod-demo-top-anchor'), actions = document.querySelector('.tui-live-actions');
    function layout() {
      const toolbar = document.querySelector('.spectrum-env-status-bar');
      const hidden = anchor.classList.contains('lab-env-top-anchor--docked-hidden') || anchor.classList.contains('lab-env-top-anchor--presenter-strip-hidden');
      const top = hidden ? 0 : toolbar ? toolbar.getBoundingClientRect().bottom : 48;
      document.body.style.setProperty('--tui-toolbar-top', top + 'px');
      document.body.style.setProperty('--tui-content-top', (top + actions.getBoundingClientRect().height) + 'px');
    }
    const observer = new ResizeObserver(layout); observer.observe(anchor); observer.observe(actions);
    new MutationObserver(layout).observe(anchor, { attributes: true, attributeFilter: ['class'] });
    layout(); message('Look up a test profile. Local ranking and live policy decisions are separate.');
  }
  global.envBar.ready().then(init).catch(error => message('Demo initialization failed: ' + error.message, true));
})(window);
