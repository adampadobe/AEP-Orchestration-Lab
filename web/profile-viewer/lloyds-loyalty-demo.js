(function (global) {
  'use strict';
  const $ = id => document.getElementById(id), model = global.LloydsLoyalty;
  const prefix = 'lloydsLoyalty', viewName = 'Lloyds Loyalty';
  // Match the reviewed Kirkham event schema used by TUI / Center Parcs.
  const defaultEventTenant = () => global.AepGlobalSandbox.getSandboxName() === 'kirkham' ? '_demoemea' : '';
  const cardMount = () => $('ContentCardContainerLoyalty');
  const complete = task => /^(complete|completed)$/i.test(String(task.taskState));
  const cardSchema = 'https://ns.adobe.com/personalization/message/content-card';
  let loaded = null, version = 0, busy = false, autoBlocked = true, targets = [], aborter, cardSubscription, pendingCard = false, displayedCard = '';
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
    $('loyaltyAbandon').disabled = busy || !loaded;
    if ($('queryProfileBtn')) $('queryProfileBtn').disabled = busy;
  }
  const publish = () => global.dispatchEvent(new CustomEvent('tui-profile-changed'));
  function clearResults() {
    displayedCard = '';
    cardMount().replaceChildren(); $('loyaltyTasks').replaceChildren(node('p', 'State not loaded for this context.', 'loyalty-empty'));
    $('loyaltyPhoneTasks').replaceChildren(node('p', 'State not loaded for this context.', 'loyalty-empty'));
    syncParticipation();
    $('loyaltyUpdated').textContent = 'Not loaded'; $('loyaltyNamespace').textContent = 'Loyalty namespace not yet read';
    $('loyaltyEvidence').textContent = 'No response for this context.';
    $('loyaltyCardHint').textContent = 'Journey content appears automatically after SDK injection and profile lookup.';
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
    if (url.startsWith('/api/ajo-loyalty?') && response.status === 404 && !type.includes('application/json')) {
      throw new Error('Loyalty API is not deployed. An authorized release owner must deploy ajoLoyaltyProxy; SDK injection does not enable task-status reads.');
    }
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
    if (!ctx.region) throw new Error('Choose the confirmed state region in the top configuration bar > Loyalty API options. Regions are not probed automatically.');
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
    const fragment = document.createDocumentFragment(), phone = document.createDocumentFragment();
    const challenges = state.challengeList.filter(challenge => !ctx.challenge || challenge.challenge_id === ctx.challenge);
    if (!challenges.length) {
      const empty = node('p', 'No ' + ctx.participation + ' challenges returned for this member and filter.', 'loyalty-empty');
      phone.append(empty.cloneNode(true)); fragment.append(empty);
    }
    for (const challenge of challenges) {
      if (!challenge || typeof challenge !== 'object' || !Array.isArray(challenge.tasks)) throw new Error('Malformed challenge: tasks must be an array.');
      if (challenge.tasks.some(task => !task || typeof task !== 'object')) throw new Error('Malformed task in Loyalty state.');
      const definition = metadata?.challenge_id === challenge.challenge_id || (metadata?._id || metadata?.get_id) === challenge.challenge_id ? metadata : null;
      const section = node('article', undefined, 'loyalty-challenge');
      const name = challenge.challengeName || definition?.name || challenge.challenge_id || 'Unnamed challenge';
      const completed = challenge.tasks.filter(complete).length, total = challenge.tasks.length;
      const summary = node('div', undefined, 'loyalty-progress-summary');
      const ring = node('div', undefined, 'loyalty-progress-ring');
      ring.style.setProperty('--loyalty-progress', (total ? completed / total * 100 : 0) + '%');
      ring.append(node('b', completed + ' / ' + total), node('span', 'tasks complete'));
      const title = node('div');
      const remaining = challenge.tasks.find(task => !complete(task));
      title.append(node('p', 'CHALLENGE PROGRESS', 'loyalty-eyebrow'), node('h3', name),
        node('p', !total ? 'No tasks reported' : remaining ? 'Remaining: ' + (remaining.taskName || remaining.taskId || 'Unnamed task') : 'All returned tasks complete', 'loyalty-next-task'));
      summary.append(ring, title); section.append(summary);
      const mobile = node('article', undefined, 'loyalty-phone-challenge');
      const mobileTop = node('div', undefined, 'loyalty-phone-challenge-top');
      mobileTop.append(node('h4', name), node('span', repr(challenge.state), 'loyalty-task-state'));
      mobile.append(mobileTop, node('p', completed + ' / ' + total + ' tasks complete', 'loyalty-phone-count'));
      if (total) {
        const meter = node('progress'); meter.max = total; meter.value = completed;
        meter.setAttribute('aria-label', name + ' completed tasks'); mobile.append(meter);
      }
      const diagnostic = node('details', undefined, 'loyalty-task-details');
      diagnostic.append(node('summary', 'Challenge API details'), node('small', 'Challenge ID: ' + repr(challenge.challenge_id)),
        node('p', 'State: ' + repr(challenge.state) + ' / Opted in: ' + repr(challenge.optedIn) +
        ' / Required tasks: ' + repr(challenge.tasksToComplete)));
      if (Array.isArray(challenge.challengeCompletions)) diagnostic.append(node('small', 'Previous challenge completions: ' + challenge.challengeCompletions.length));
      for (const [index, task] of challenge.tasks.entries()) {
        const definitionTask = definition?.tasks?.find(item => (item.taskId || item._id) === task.taskId);
        const card = node('div', undefined, 'loyalty-task'), heading = node('div', undefined, 'loyalty-task-heading');
        const taskName = task.taskName || definitionTask?.taskName || definitionTask?.name || task.taskId || 'Unnamed task';
        card.dataset.complete = String(complete(task));
        card.dataset.current = String(task === remaining);
        const step = node('span', complete(task) ? '\u2713' : index + 1, 'loyalty-step-number');
        step.setAttribute('aria-hidden', 'true');
        const initialsText = taskName.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
        const logo = node('span', initialsText, 'loyalty-task-logo'); logo.setAttribute('aria-hidden', 'true');
        heading.append(step, logo, node('strong', taskName),
          node('span', repr(task.taskState), 'loyalty-task-state'));
        card.append(heading);
        const progress = model.progress(task);
        if (progress) {
          const meter = node('progress'); meter.max = progress.goal; meter.value = Math.max(0, Math.min(progress.value, progress.goal));
          meter.setAttribute('aria-label', (task.taskName || task.taskId) + ' progress');
          card.append(meter, node('p', progress.value + ' of ' + progress.goal + ' (' + progress.key + ')'));
        } else card.append(node('p', 'Goal: ' + repr(task.variables?.goal) + ' / Goal type: ' + repr(task.variables?.type)));
        const taskDetails = node('div');
        taskDetails.append(node('b', taskName), node('small', 'Accumulators: ' + repr(task.accumulators)));
        if (Array.isArray(task.taskCompletions)) taskDetails.append(node('small', 'Previous task completions: ' + task.taskCompletions.length));
        taskDetails.append(node('small', 'Task ID: ' + repr(task.taskId))); diagnostic.append(taskDetails);
        section.append(card);
        const row = node('div', undefined, 'loyalty-phone-task');
        row.dataset.complete = String(complete(task));
        const initials = node('span', initialsText, 'loyalty-phone-task-icon');
        initials.setAttribute('aria-hidden', 'true');
        const text = node('div'); text.append(node('b', taskName), node('span', repr(task.taskState)));
        row.append(initials, text);
        if (complete(task)) row.append(node('span', '\u2713', 'loyalty-phone-tick'));
        mobile.append(row);
      }
      const outcome = node('div', undefined, 'loyalty-outcome');
      const remainingCount = total - completed;
      outcome.append(node('b', !total ? 'No tasks reported' : remaining ? remainingCount + (remainingCount === 1 ? ' task remaining' : ' tasks remaining') : 'All returned tasks complete'),
        node('span', 'Task completion is reported by Adobe. Reward delivery is not verified by this page.'));
      section.append(outcome, diagnostic); phone.append(mobile);
      fragment.append(section);
    }
    if (state._links?.next) fragment.append(node('p', 'Adobe returned a next-page link. Showing only the challenges in this response; this is not the full history.'));
    $('loyaltyTasks').replaceChildren(fragment);
    if (state._links?.next) phone.append(node('p', 'More challenges are available. This response is not the full history.'));
    $('loyaltyPhoneTasks').replaceChildren(phone);
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
    } finally {
      clearTimeout(timeout); busy = false; message($('loyaltyStatus').textContent, $('loyaltyStatus').dataset.error === 'true');
      if (pendingCard) { pendingCard = false; requestAutomaticCard(); }
    }
  }
  function requestAutomaticCard() {
    if (!loaded || typeof global.alloy !== 'function') return;
    if (busy) { pendingCard = true; return; }
    void work(run);
  }
  async function lookup(ctx, token) {
    loaded = null; clearResults(); global.DemoProfileDrawer.clearDrawerVisitorState(); publish();
    if (!ctx.sandbox || !ctx.identifier) throw new Error('Select a sandbox and enter a profile identifier.');
    const data = await json('/api/profile/table?' + new URLSearchParams({ sandbox: ctx.sandbox, namespace: ctx.namespace, identifier: ctx.identifier }));
    same(ctx, token);
    if (data.found !== true || !Array.isArray(data.rows)) throw new Error('No profile found.');
    data.profileLoyaltyId = global.TuiDecisioningProfile.signals(data.rows).loyaltyId;
    if (!await global.DemoProfileDrawer.loadProfileDataForDrawer(ctx.identifier, { updateMessage: false, sendApplicationLogin: false })) throw new Error('Profile drawer lookup failed.');
    same(ctx, token); loaded = data; publish(); autoBlocked = true;
    message('Profile loaded. Select Get task status to read Adobe Loyalty. SDK injection is only needed for content cards and journey events.');
    requestAutomaticCard();
  }
  async function sendAbandonedSearch(ctx, token) {
    if (!loaded.rows.some(row => /^(xdm:)?testProfile$/.test(row.path) && global.TuiDecisioningProfile.scalar(row) === true)) {
      throw new Error('Only AEP test profiles can send abandoned.search, matching the TUI / Center Parcs demo.');
    }
    if (!/^_[A-Za-z][A-Za-z0-9]*$/.test(ctx.tenant) || ['_id', '_repo', '_experience', '_links'].includes(ctx.tenant)) {
      throw new Error('Configure the reviewed event tenant namespace in the top configuration bar before sending abandoned.search.');
    }
    if (typeof loaded.profileEmail !== 'string' || !loaded.profileEmail.includes('@')) {
      throw new Error('The loaded profile has no email identity for abandoned.search. No event sent.');
    }
    if (!global.DemoTagsInjection?.ensureAlloyReady || !global.CdEdgeMounts?.buildIdentityMap ||
        typeof global.DemoLabEdgeConfig?.edgeConfigOverrides !== 'function') {
      throw new Error('Inject Tags with Web SDK and the lab datastream configuration before sending abandoned.search.');
    }
    const edgeOptions = global.DemoLabEdgeConfig.edgeConfigOverrides();
    const edgeSnapshot = JSON.stringify(edgeOptions), profileEmail = loaded.profileEmail,
      profileLoyaltyId = loaded.profileLoyaltyId;
    message('Preparing abandoned.search: connecting to Web SDK...');
    const alloy = await global.DemoTagsInjection.ensureAlloyReady({ timeoutMs: 30000, storagePrefix: prefix });
    same(ctx, token);
    const identity = await alloy('getIdentity', { namespaces: ['ECID'] });
    same(ctx, token);
    const ecid = identity?.identity?.ECID;
    if (typeof ecid !== 'string' || !/^\d{10,}$/.test(ecid)) {
      throw new Error('Active Web SDK browser ECID was not returned. No event sent.');
    }
    if (ctx.namespace === 'ecid' && ctx.identifier !== ecid) {
      throw new Error('The selected ECID differs from the active Web SDK visitor. No event sent.');
    }
    const identityMap = global.CdEdgeMounts.buildIdentityMap({ ecid }, ctx.identifier, ctx.namespace);
    if (profileLoyaltyId) {
      identityMap.loyaltyId = [{ id: profileLoyaltyId, authenticatedState: 'authenticated', primary: false }];
    }
    const payload = { ...edgeOptions,
      renderDecisions: false, personalization: { defaultPersonalizationEnabled: false },
      xdm: {
        eventType: 'abandoned.search',
        identityMap,
        [ctx.tenant]: { identification: { core: { ecid, email: profileEmail,
          ...(profileLoyaltyId && { loyaltyId: profileLoyaltyId }) } } },
        web: { webPageDetails: { URL: location.origin + location.pathname, name: viewName, viewName } },
      },
    };
    same(ctx, token);
    if (JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides()) !== edgeSnapshot) {
      throw new Error('Event datastream changed while preparing abandoned.search. No event sent.');
    }
    message('Sending abandoned.search for the selected profile...');
    try { await alloy('sendEvent', payload); }
    catch (error) {
      throw new Error('abandoned.search send was not confirmed: ' + error.message +
        '. The event may already have been ingested; check profile events before sending again.');
    }
    same(ctx, token);
    $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, event: payload, sdkAccepted: true,
      journeyEntryVerified: false }, null, 2);
    message('abandoned.search accepted by Web SDK. Refreshing profile events...');
    try { await global.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile(); }
    catch (error) {
      throw new Error('abandoned.search was accepted by Web SDK, but the profile event refresh failed: ' +
        error.message + '. Do not resend to refresh the drawer. Journey entry is not verified.');
    }
    same(ctx, token);
    message('abandoned.search accepted by Web SDK for the selected profile. Journey entry is not yet verified.');
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
          if (captured.collectEvent) await captured.collectEvent('interact', [candidate.proposition]);
          else await captured.alloy('sendEvent', tracking(candidate, captured, ctx, 'interact', button));
          same(ctx, token);
          message('Proposition interaction accepted. Task completion is determined by Adobe state.');
          if (new URL(url).origin === location.origin && new URL(url).pathname === location.pathname) {
            if (ctx.region) await readTasks(ctx, token);
            same(ctx, token); location.hash = new URL(url).hash;
          } else location.assign(url);
        } finally { control.disabled = false; }
      }));
      body.append(control);
    }
    if (content.dismissBtn?.style && content.dismissBtn.style !== 'none') {
      const dismiss = node('button', 'Dismiss'); dismiss.type = 'button';
      dismiss.addEventListener('click', () => void work(async () => {
        same(ctx, token);
        if (captured.collectEvent) await captured.collectEvent('dismiss', [candidate.proposition]);
        same(ctx, token); card.remove(); $('loyaltyCardHint').textContent = 'Card dismissed. Member challenge state is unchanged.';
      }));
      body.append(dismiss);
    }
    card.append(body); cardMount().replaceChildren(card);
  }
  async function run(ctx, token) {
    if (!/^_[A-Za-z][A-Za-z0-9]*$/.test(ctx.tenant) || ['_id', '_repo', '_experience', '_links'].includes(ctx.tenant)) {
      throw new Error('Configure the reviewed event tenant namespace before requesting a content card.');
    }
    if (!/^web:\/\/[^?#\s]+#[A-Za-z][A-Za-z0-9_-]*$/.test(ctx.surface)) throw new Error('Provide one explicit web surface URI with a fragment.');
    const alloy = await global.DemoTagsInjection.ensureAlloyReady({ timeoutMs: 30000, storagePrefix: prefix });
    same(ctx, token);
    const identity = await alloy('getIdentity', { namespaces: ['ECID'] });
    same(ctx, token);
    const ecid = identity?.identity?.ECID;
    if (typeof ecid !== 'string' || !/^\d{10,}$/.test(ecid)) throw new Error('Active Web SDK browser ECID was not returned. No card requested.');
    if (ctx.namespace === 'ecid' && ctx.identifier !== ecid) throw new Error('The selected ECID differs from the active Web SDK visitor. No card requested.');
    const identityMap = global.CdEdgeMounts.buildIdentityMap({ ecid }, ctx.identifier, ctx.namespace);
    if (loaded.profileLoyaltyId) identityMap.loyaltyId = [{ id: loaded.profileLoyaltyId, authenticatedState: 'authenticated', primary: false }];
    const captured = { alloy, identityMap, edgeOptions: global.DemoLabEdgeConfig.edgeConfigOverrides(),
      eventXdm: { [ctx.tenant]: { identification: { core: { ecid, email: loaded.profileEmail,
        ...(loaded.profileLoyaltyId && { loyaltyId: loaded.profileLoyaltyId }) } } } } };
    const current = () => token === version && JSON.stringify(ctx) === JSON.stringify(context()) &&
      JSON.stringify(captured.edgeOptions) === JSON.stringify(global.DemoLabEdgeConfig.edgeConfigOverrides());
    const subscriptionKey = JSON.stringify([token, ctx, captured.edgeOptions, identityMap]);
    if (!cardSubscription || cardSubscription.key !== subscriptionKey || cardSubscription.alloy !== alloy) {
      const subscription = { key: subscriptionKey, alloy };
      cardSubscription = subscription;
      try {
        await alloy('subscribeRulesetItems', { surfaces: [ctx.surface], schemas: [cardSchema],
          callback: (result, collectEvent) => {
            if (cardSubscription !== subscription || !current()) return;
            void showCard(result.propositions, { ...captured, collectEvent }, ctx, token, true).catch(error => {
              if (current()) message('Journey card rendering failed: ' + error.message + ' No automatic retry.', true);
            });
          } });
      } catch (error) { cardSubscription = null; throw error; }
    }
    same(ctx, token);
    if (!current()) throw new Error('Event datastream changed while preparing the card. No request sent.');
    const result = await alloy('sendEvent', { ...captured.edgeOptions, renderDecisions: true,
      personalization: { surfaces: [ctx.surface], sendDisplayEvent: false },
      xdm: { ...captured.eventXdm, identityMap, web: { webPageDetails: {
        URL: location.origin + location.pathname, name: viewName, viewName } } } });
    same(ctx, token);
    if (!current()) throw new Error('Event datastream changed; previous card response discarded.');
    if (model.selectCard(result?.propositions, ctx.surface)) await showCard(result.propositions, captured, ctx, token);
    else if (!cardMount().childElementCount) {
      $('loyaltyCardHint').textContent = 'Waiting for a journey content-card proposition for this surface.';
      message('Card request accepted. Journey cards render through the active ruleset subscription.');
    }
  }
  async function showCard(propositions, captured, ctx, token, clearMissing) {
    same(ctx, token);
    const candidate = model.selectCard(propositions, ctx.surface);
    if (!candidate) {
      if (clearMissing) {
        cardMount().replaceChildren(); displayedCard = '';
        $('loyaltyCardHint').textContent = 'No eligible renderable journey card returned for this surface.';
      }
      return;
    }
    const cardKey = JSON.stringify([token, candidate.proposition.id, candidate.item.id, candidate.content]);
    if (displayedCard === cardKey) return;
    if (!candidate.item.id || typeof captured?.alloy !== 'function' || !captured.identityMap ||
        !Object.values(captured.identityMap).some(ids => Array.isArray(ids) && ids.some(id => typeof id?.id === 'string' && id.id))) {
      throw new Error('Original proposition request identity is missing. No display event sent.');
    }
    renderCard(candidate, captured, ctx, token);
    displayedCard = cardKey;
    $('loyaltyCardHint').textContent = 'Live AJO content-card proposition / ' + candidate.proposition.id;
    $('loyaltyEvidence').textContent = JSON.stringify({ sandbox: ctx.sandbox, proposition: candidate.proposition,
      renderedConsequence: candidate.consequenceId }, null, 2);
    if (captured.collectEvent) await captured.collectEvent('display', [candidate.proposition]);
    else await captured.alloy('sendEvent', tracking(candidate, captured, ctx, 'display'));
    same(ctx, token);
    message('Content card displayed; original proposition display accepted. Task state refreshes independently.');
  }
  global.TuiDecisioningDrawer = { getSignals: () => loaded ? global.TuiDecisioningProfile.signals(loaded.rows) : null };
  function syncParticipation() {
    const participation = $('loyaltyParticipation').value;
    document.querySelectorAll('[data-loyalty-participation]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.loyaltyParticipation === participation));
    });
    $('loyaltyPhoneTitle').textContent = participation === 'complete' ? 'Completed challenges' : 'In progress';
  }
  async function init() {
    $('aepDemoEnvSection').append($('loyaltyApiOptions').content.cloneNode(true));
    $('loyaltyTenant').value = defaultEventTenant();
    const email = $('customerEmail'), getTarget = () => targets.find(target => target.id === $('generatorTarget').value) || null;
    $('loyaltySurface').value = 'web://' + location.host + location.pathname + '#ContentCardContainerLoyalty';
    document.querySelectorAll('[data-loyalty-participation]').forEach(button => {
      button.addEventListener('click', () => {
        if (busy || $('loyaltyParticipation').value === button.dataset.loyaltyParticipation) return;
        $('loyaltyParticipation').value = button.dataset.loyaltyParticipation;
        invalidate(false);
        if (loaded) void work(async (ctx, token) => {
          await readTasks(ctx, token); autoBlocked = false; message('Task state refreshed from Adobe.');
        });
      });
    });
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
      $('loyaltyRegion').value = ''; $('loyaltyTenant').value = defaultEventTenant(); $('loyaltyChallenge').value = '';
      $('loyaltySurface').value = 'web://' + location.host + location.pathname + '#ContentCardContainerLoyalty';
      $('loyaltyParticipation').value = 'active'; $('loyaltyTest').checked = false;
      invalidate(true);
    });
    global.addEventListener('aep-demo-tags-injected', () => { invalidate(false); requestAutomaticCard(); });
    global.addEventListener('aep-demo-visitor-reset-start', () => invalidate(true));
    global.addEventListener('aep-demo-visitor-invalidated', () => invalidate(true));
    for (const id of ['loyaltyRegion', 'loyaltyMember', 'loyaltyChallenge', 'loyaltyTenant', 'loyaltySurface', 'loyaltyParticipation', 'loyaltyTest', 'generatorTarget']) {
      $(id).addEventListener(id === 'loyaltyRegion' || id === 'loyaltyParticipation' || id === 'loyaltyTest' || id === 'generatorTarget' ? 'change' : 'input', () => invalidate(false));
    }
    $('loyaltyRefresh').addEventListener('click', () => void work(async (ctx, token) => {
      await readTasks(ctx, token); autoBlocked = false; message('Task state refreshed from Adobe.');
    }));
    $('loyaltyRun').addEventListener('click', () => void work(run));
    $('loyaltyAbandon').addEventListener('click', () => void work(sendAbandonedSearch));
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
    message('Look up a profile in the top bar, then select Get task status. SDK injection is only needed for content cards and journey events.');
  }
  global.envBar.ready().then(init).catch(error => message('Demo initialization failed: ' + error.message, true));
})(window);
