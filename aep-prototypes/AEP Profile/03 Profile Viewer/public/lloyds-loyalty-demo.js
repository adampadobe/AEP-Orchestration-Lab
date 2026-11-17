(function (global) {
  'use strict';
  const $ = id => document.getElementById(id), model = global.LloydsLoyalty;
  const prefix = 'lloydsLoyalty', viewName = 'Lloyds Loyalty';
  let loaded = null, version = 0, busy = false, autoBlocked = false, targets = [], aborter;
  const context = () => ({
    sandbox: global.AepGlobalSandbox.getSandboxName(),
    namespace: $(prefix + 'Ns').value.toLowerCase(), identifier: $('customerEmail').value.trim(),
    region: $('loyaltyRegion').value, member: $('loyaltyMember').value.trim(),
    challenge: $('loyaltyChallenge').value.trim(), test: $('loyaltyTest').checked,
    participation: $('loyaltyParticipation').value, surface: $('loyaltySurface').value.trim(),
    tenant: $('loyaltyTenant').value.trim(), target: $('generatorTarget').value,
  });
  const same = (ctx, token) => {
    if (token !== version || JSON.stringify(ctx) !== JSON.stringify(context())) throw new Error('Demo context changed; previous response discarded.');
    if (aborter?.signal.aborted) throw new Error('Request expired or was cancelled; previous response discarded.');
  };
  function message(text, error) {
    $('loyaltyStatus').textContent = text; $('loyaltyStatus').dataset.error = String(!!error);
    $('loyaltyRun').disabled = busy || !loaded;
    $('loyaltyRefresh').disabled = busy || !loaded;
    if ($('queryProfileBtn')) $('queryProfileBtn').disabled = busy;
  }
  const publish = () => global.dispatchEvent(new CustomEvent('tui-profile-changed'));
  function clearResults() {
    $('ContentCardContainer').replaceChildren(); $('loyaltyTasks').replaceChildren(node('p', 'State not loaded for this context.', 'loyalty-empty'));
    $('loyaltyUpdated').textContent = 'Not loaded'; $('loyaltyNamespace').textContent = 'Loyalty namespace not yet read';
    $('loyaltyEvidence').textContent = 'No response for this context.';
    $('loyaltyCardHint').textContent = 'Request a content card for the current profile.';
  }
  function invalidate(clearProfile) {
    version++; aborter?.abort(); autoBlocked = true; clearResults();
    global.DecisioningProfileRuntime?.invalidateProfileLookupCache();
    if (clearProfile) {
      loaded = null; $('loyaltyMember').value = '';
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
  const repr = value => value === undefined || value === null ? 'Not reported' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  async function json(url, options) {
    const response = await fetch(url, { ...options, signal: aborter.signal });
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new Error('Expected the deployed lab JSON API; HTTP ' + response.status + '. Check the Functions release.');
    const data = await response.json();
    if (!response.ok || data.ok === false || data.error) throw new Error(typeof data.error === 'string' ? data.error : data.message || 'HTTP ' + response.status);
    return data;
  }
  async function loyalty(ctx, input) {
    const headers = await global.AepLabSandboxSync.getAuthHeaders();
    if (!headers.Authorization) throw new Error('Sign in to the Portal before reading Loyalty state. Anonymous sessions cannot access member state.');
    const result = await json('/api/ajo-loyalty?' + new URLSearchParams({ sandbox: ctx.sandbox, ...input }), { headers });
    return result.data;
  }
  function memberId(ctx, config) {
    if (!config || typeof config.namespace !== 'string' || !config.namespace.trim()) throw new Error('Adobe Loyalty has not reported its member namespace.');
    if (ctx.member) return ctx.member;
    if (config.namespace.toLowerCase() === ctx.namespace) return ctx.identifier;
    if (config.namespace.toLowerCase() === 'ecid' && typeof loaded.ecid === 'string' && loaded.ecid) return loaded.ecid;
    throw new Error('Loyalty uses namespace "' + config.namespace + '". Enter this profile\'s member identifier in that namespace; it cannot be inferred from ' + ctx.namespace + '.');
  }
  async function readTasks(ctx, token) {
    if (!ctx.region) throw new Error('Select the confirmed Loyalty state region. Regions are not probed automatically.');
    if (ctx.participation === 'complete' && ctx.test) throw new Error('Adobe\'s completed-challenges endpoint does not support State API test mode. Turn test mode off or select Active.');
    const config = await loyalty(ctx, { action: 'config' }); same(ctx, token);
    const member = memberId(ctx, config);
    $('loyaltyNamespace').textContent = 'State member: ' + config.namespace + ' / ' + member;
    const input = ctx.participation === 'complete'
      ? { action: 'profile_challenges', profile_id: member, region: ctx.region, state: 'complete' }
      : { action: 'profile_state', profile_id: member, region: ctx.region, ...(ctx.challenge ? { challenge_id: ctx.challenge } : {}), test: String(ctx.test) };
    const state = await loyalty(ctx, input); same(ctx, token);
    if (!Array.isArray(state?.challengeList)) throw new Error('Malformed Loyalty state: challengeList is missing. This is not an empty member-state response.');
    let metadata = null;
    if (ctx.challenge) { metadata = await loyalty(ctx, { action: 'challenge_get', challenge_id: ctx.challenge }); same(ctx, token); }
    renderTasks(state, metadata, ctx);
    $('loyaltyUpdated').textContent = 'Read ' + new Date().toLocaleTimeString();
    $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, namespace: config.namespace,
      member, region: ctx.region, state, metadata }, null, 2);
  }
  function renderTasks(state, metadata, ctx) {
    const fragment = document.createDocumentFragment();
    const challenges = state.challengeList.filter(challenge => !ctx.challenge || challenge.challenge_id === ctx.challenge);
    if (!challenges.length) fragment.append(node('p', 'No ' + ctx.participation + ' challenges returned for this member and filter.', 'loyalty-empty'));
    for (const challenge of challenges) {
      if (!challenge || typeof challenge !== 'object' || !Array.isArray(challenge.tasks)) throw new Error('Malformed challenge: tasks must be an array.');
      const definition = metadata?.challenge_id === challenge.challenge_id || (metadata?._id || metadata?.get_id) === challenge.challenge_id ? metadata : null;
      const section = node('article', undefined, 'loyalty-challenge');
      section.append(node('h3', challenge.challengeName || definition?.name || challenge.challenge_id || 'Unnamed challenge'),
        node('small', 'Challenge ID: ' + repr(challenge.challenge_id)));
      section.append(node('p', 'State: ' + repr(challenge.state) + ' / Opted in: ' + repr(challenge.optedIn) +
        ' / Required tasks: ' + repr(challenge.tasksToComplete)));
      if (Array.isArray(challenge.challengeCompletions)) section.append(node('small', 'Previous challenge completions: ' + challenge.challengeCompletions.length));
      for (const task of challenge.tasks) {
        if (!task || typeof task !== 'object') throw new Error('Malformed task in Loyalty state.');
        const definitionTask = definition?.tasks?.find(item => (item.taskId || item._id) === task.taskId);
        const card = node('div', undefined, 'loyalty-task'), heading = node('div', undefined, 'loyalty-task-heading');
        card.dataset.complete = String(/^(complete|completed)$/i.test(String(task.taskState)));
        heading.append(node('strong', task.taskName || definitionTask?.taskName || definitionTask?.name || task.taskId || 'Unnamed task'),
          node('span', repr(task.taskState), 'loyalty-task-state'));
        card.append(heading);
        const progress = model.progress(task);
        if (progress) {
          const meter = node('progress'); meter.max = progress.goal; meter.value = Math.max(0, Math.min(progress.value, progress.goal));
          meter.setAttribute('aria-label', (task.taskName || task.taskId) + ' progress');
          card.append(meter, node('p', progress.value + ' of ' + progress.goal + ' (' + progress.key + ')'));
        } else card.append(node('p', 'Goal: ' + repr(task.variables?.goal) + ' / Goal type: ' + repr(task.variables?.type)));
        card.append(node('small', 'Accumulators: ' + repr(task.accumulators)));
        if (Array.isArray(task.taskCompletions)) card.append(node('small', 'Previous task completions: ' + task.taskCompletions.length));
        card.append(node('small', 'Task ID: ' + repr(task.taskId))); section.append(card);
      }
      fragment.append(section);
    }
    if (state._links?.next) fragment.append(node('p', 'Adobe returned a next-page link. Showing only the challenges in this response; this is not the full history.'));
    $('loyaltyTasks').replaceChildren(fragment);
  }
  async function work(operation) {
    if (busy) return;
    busy = true; aborter = new AbortController();
    const timeout = setTimeout(() => aborter.abort(), 120000), ctx = context(), token = version;
    message('Loading...');
    try { await operation(ctx, token); }
    catch (error) {
      if (token === version) {
        autoBlocked = true; $('loyaltyUpdated').textContent = 'Refresh failed / previous state may be stale';
        message(error.message + ' No automatic retry.', true);
      }
    } finally { clearTimeout(timeout); busy = false; message($('loyaltyStatus').textContent, $('loyaltyStatus').dataset.error === 'true'); }
  }
  async function lookup(ctx, token) {
    loaded = null; clearResults(); global.DemoProfileDrawer.clearDrawerVisitorState(); publish();
    if (!ctx.sandbox || !ctx.identifier) throw new Error('Select a sandbox and enter a profile identifier.');
    const data = await json('/api/profile/table?' + new URLSearchParams({ sandbox: ctx.sandbox, namespace: ctx.namespace, identifier: ctx.identifier }));
    same(ctx, token);
    if (data.found !== true || !Array.isArray(data.rows)) throw new Error('No profile found.');
    if (!await global.DemoProfileDrawer.loadProfileDataForDrawer(ctx.identifier, { updateMessage: false, sendApplicationLogin: false })) throw new Error('Profile drawer lookup failed.');
    same(ctx, token); loaded = data; publish(); autoBlocked = false;
    await readTasks(ctx, token); message('Member task state loaded. Content-card requests are separate.');
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
          ...(button ? { propositionAction: { id: button.id || candidate.consequenceId, label: button.text?.content || 'Open reward' } } : {}),
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
      if (!url) continue;
      const control = node('button', button.text?.content || 'View reward'); control.type = 'button';
      control.addEventListener('click', () => void work(async (current, currentToken) => {
        same(ctx, token); same(current, currentToken); control.disabled = true;
        try {
          await captured.alloy('sendEvent', tracking(candidate, captured, ctx, 'interact', button)); same(ctx, token);
          message('Proposition interaction accepted. Task completion is determined by Adobe state.');
          if (new URL(url).origin === location.origin && new URL(url).pathname === location.pathname) {
            await readTasks(ctx, token); same(ctx, token); location.hash = new URL(url).hash;
          } else location.assign(url);
        } finally { control.disabled = false; }
      }));
      body.append(control);
    }
    if (content.dismissBtn?.style && content.dismissBtn.style !== 'none') {
      const dismiss = node('button', 'Dismiss'); dismiss.type = 'button';
      dismiss.addEventListener('click', () => { card.remove(); $('loyaltyCardHint').textContent = 'Card dismissed locally. Member challenge state is unchanged.'; });
      body.append(dismiss);
    }
    card.append(body); $('ContentCardContainer').replaceChildren(card);
  }
  async function run(ctx, token) {
    const runtime = global.DecisioningProfileRuntime;
    if (!runtime?.supportsCapturedEventContext || !runtime.supportsManualDisplay) throw new Error('Inject Tags with the current decisioning runtime first.');
    if (!await runtime.runProfileLookup({ skipHydrate: true, throwOnError: true })) throw new Error('Profile lookup for the decision failed.');
    same(ctx, token);
    const result = await runtime.runContentDecision({ manualDisplay: true, useBrowserEcid: true,
      eventTenantNamespace: ctx.tenant, surfaces: [ctx.surface], validateContext: () => same(ctx, token) });
    same(ctx, token);
    const candidate = model.selectCard(result.propositions, ctx.surface);
    if (!candidate) {
      $('ContentCardContainer').replaceChildren(); $('loyaltyCardHint').textContent = 'No renderable card returned for this surface. This does not mean the member has no active challenges.';
      message('No matching content-card proposition returned. No display event sent.'); return;
    }
    const captured = result.manualDisplay;
    if (!candidate.item.id || typeof captured?.alloy !== 'function' || !captured.identityMap ||
        !Object.values(captured.identityMap).some(ids => Array.isArray(ids) && ids.some(id => typeof id?.id === 'string' && id.id))) {
      throw new Error('Original proposition request identity is missing. No display event sent.');
    }
    renderCard(candidate, captured, ctx, token);
    $('loyaltyCardHint').textContent = 'Live AJO content-card proposition / ' + candidate.proposition.id;
    $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, proposition: candidate.proposition,
      renderedConsequence: candidate.consequenceId }, null, 2);
    await captured.alloy('sendEvent', tracking(candidate, captured, ctx, 'display')); same(ctx, token);
    await global.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile(); same(ctx, token);
    message('Content card displayed; original proposition display accepted. Task state refreshes independently.');
  }
  global.TuiDecisioningDrawer = { getSignals: () => loaded ? global.TuiDecisioningProfile.signals(loaded.rows) : null };
  async function init() {
    const email = $('customerEmail'), getTarget = () => targets.find(target => target.id === $('generatorTarget').value) || null;
    $('loyaltySurface').value = 'web://' + location.host + location.pathname + '#ContentCardContainer';
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
    email.addEventListener('input', () => invalidate(true)); $(prefix + 'Ns').addEventListener('change', () => invalidate(true));
    global.addEventListener('aep-global-sandbox-change', () => {
      $('loyaltyRegion').value = ''; $('loyaltyTenant').value = ''; $('loyaltyChallenge').value = '';
      $('loyaltySurface').value = 'web://' + location.host + location.pathname + '#ContentCardContainer';
      $('loyaltyParticipation').value = 'active'; $('loyaltyTest').checked = false;
      invalidate(true);
    });
    global.addEventListener('aep-demo-tags-injected', () => invalidate(false));
    global.addEventListener('aep-demo-visitor-reset-start', () => invalidate(true));
    global.addEventListener('aep-demo-visitor-invalidated', () => invalidate(true));
    for (const id of ['loyaltyRegion', 'loyaltyMember', 'loyaltyChallenge', 'loyaltyTenant', 'loyaltySurface', 'loyaltyParticipation', 'loyaltyTest', 'generatorTarget']) {
      $(id).addEventListener(id === 'loyaltyRegion' || id === 'loyaltyParticipation' || id === 'loyaltyTest' || id === 'generatorTarget' ? 'change' : 'input', () => invalidate(false));
    }
    $('loyaltyRefresh').addEventListener('click', () => void work(async (ctx, token) => {
      await readTasks(ctx, token); autoBlocked = false; message('Task state refreshed from Adobe.');
    }));
    $('loyaltyRun').addEventListener('click', () => void work(run));
    document.addEventListener('click', event => {
      if (event.target.closest('#cdMicroProfileRunBtn')) { event.preventDefault(); event.stopImmediatePropagation(); if (loaded) void work(run); }
    }, true);
    const anchor = document.querySelector('.mod-demo-top-anchor'), actions = document.querySelector('.tui-live-actions');
    const layout = () => {
      const hidden = anchor.classList.contains('lab-env-top-anchor--docked-hidden') || anchor.classList.contains('lab-env-top-anchor--presenter-strip-hidden');
      const top = hidden ? 0 : anchor.getBoundingClientRect().bottom;
      document.body.style.setProperty('--tui-toolbar-top', top + 'px');
      document.body.style.setProperty('--tui-content-top', (top + actions.getBoundingClientRect().height + 20) + 'px');
    };
    const observer = new ResizeObserver(layout); observer.observe(anchor); observer.observe(actions);
    new MutationObserver(layout).observe(anchor, { attributes: true, attributeFilter: ['class'] }); layout();
    const timer = setInterval(() => {
      if (!busy && loaded && !autoBlocked && $('loyaltyAuto').checked && !document.hidden && context().region) {
        void work(async (ctx, token) => { await readTasks(ctx, token); message('Task state refreshed from Adobe.'); });
      }
    }, 30000);
    global.addEventListener('pagehide', event => {
      version++; aborter?.abort();
      if (!event.persisted) { clearInterval(timer); observer.disconnect(); }
    });
    global.addEventListener('pageshow', event => { if (event.persisted) invalidate(true); });
    message('Select a confirmed state region, then look up a profile. No events are sent by task reads.');
  }
  global.envBar.ready().then(init).catch(error => message('Demo initialization failed: ' + error.message, true));
})(window);
