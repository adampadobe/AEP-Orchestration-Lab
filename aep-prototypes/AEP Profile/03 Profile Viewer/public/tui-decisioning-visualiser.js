(function () {
  'use strict';
  const model = window.TuiDecisioning;
  let state = { ...model.defaults };
  const $ = id => document.getElementById(id);
  const controls = new Map();
  const groups = new Map();
  let recipient = 'Alex', live = null, held = '', embedded = false, generation = 0;
  function changed(keys) {
    generation++; live = null; held = '';
    window.dispatchEvent(new CustomEvent('tui-signals-changed', { detail: { keys } }));
  }
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function image(src, alt, className) {
    const img = el('img', undefined, className);
    img.src = src;
    img.alt = alt;
    return img;
  }
  function buildSignals() {
    for (const field of model.fields) {
      if (!groups.has(field.group)) {
        const detail = el('details', undefined, 'signal-group');
        detail.dataset.group = field.group;
        detail.append(el('summary', field.group));
        groups.set(field.group, detail);
        $('signals').append(detail);
      }
      const label = el('label', undefined, 'signal-field');
      const id = 'signal-' + field.key;
      label.htmlFor = id;
      label.append(el('span', field.label));
      const input = el(field.type === 'number' ? 'input' : 'select');
      input.id = id;
      if (field.type === 'number') {
        input.type = 'number';
        input.min = field.min;
        input.max = field.max;
        input.step = field.step || 1;
      } else {
        const values = field.type === 'boolean' ? [true, false] : field.values;
        for (const value of values) {
          const option = el('option', field.type === 'boolean' ? (value ? 'Yes' : 'No') : value);
          option.value = String(value);
          input.append(option);
        }
      }
      input.value = String(state[field.key]);
      input.addEventListener(field.type === 'number' ? 'input' : 'change', () => {
        if (!input.checkValidity() || input.value === '') {
          input.setAttribute('aria-invalid', 'true');
          changed([field.key]);
          render();
          return;
        }
        input.removeAttribute('aria-invalid');
        state[field.key] = field.type === 'boolean' ? input.value === 'true' :
          field.type === 'number' ? Number(input.value) : input.value;
        changed([field.key]);
        $('scenario-label').textContent = 'Custom holiday signals';
        $('scenario-select').value = '';
        document.querySelectorAll('#scenario-pills button').forEach(button => button.setAttribute('aria-pressed', 'false'));
        render();
      });
      controls.set(field.key, input);
      label.append(input, el('code', field.path));
      groups.get(field.group).append(label);
    }
  }
  function useScenario(index) {
    const scenario = model.scenarios[index];
    const previous = state;
    state = { ...model.defaults, ...scenario.preset };
    changed([...new Set([...Object.keys(scenario.preset), ...model.fields.filter(f => previous[f.key] !== state[f.key]).map(f => f.key)])]);
    for (const [key, input] of controls) {
      input.value = String(state[key]);
      input.removeAttribute('aria-invalid');
    }
    groups.forEach(detail => { detail.open = false; });
    for (const key of Object.keys(scenario.preset)) {
      const field = model.fields.find(f => f.key === key);
      groups.get(field.group).open = true;
    }
    $('scenario-select').value = String(index);
    $('scenario-label').textContent = scenario.name;
    document.querySelectorAll('#scenario-pills button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.scenario === String(index)));
    });
    render(true);
  }
  function buildScenarios() {
    model.scenarios.forEach((scenario, index) => {
      const option = el('option', scenario.name);
      option.value = index;
      $('scenario-select').append(option);
      if (!scenario.featured) return;
      const button = el('button', scenario.name);
      button.type = 'button';
      button.dataset.scenario = index;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => useScenario(index));
      $('scenario-pills').append(button);
    });
    $('scenario-select').addEventListener('change', event => {
      if (event.target.value !== '') useScenario(Number(event.target.value));
    });
  }
  function renderLadder(result, scenarioChosen) {
    const open = new Set(Array.from(document.querySelectorAll('.objective[open]')).map(n => n.dataset.key));
    $('objectives').replaceChildren();
    for (const [index, o] of model.objectives.entries()) {
      const row = result.ladder[index];
      const winner = result.objective === o.key;
      const detail = el('details', undefined, 'objective');
      detail.dataset.key = o.key;
      detail.dataset.winner = String(winner);
      detail.open = scenarioChosen ? winner : open.has(o.key);
      const summary = el('summary');
      const title = el('span', o.label, 'objective-name');
      title.append(el('small', o.subtitle));
      const status = winner ? 'SELECTED' : row.eligible
        ? (row.offers.some(item => item.eligible) ? 'LOWER RANK' : 'NO ITEM') : 'HELD';
      summary.append(el('span', String(index + 1).padStart(2, '0'), 'rank'), title, el('span', status, 'objective-state'));
      const body = el('div', undefined, 'objective-body');
      body.append(el('p', model.describe(o.rule), 'rule-label'));
      o.offers.forEach((item, j) => {
        const card = el('div', undefined, 'nba-row');
        const heading = el('strong', item.name);
        heading.append(el('span', String(item.priority)));
        const eligibility = row.offers[j].eligible;
        card.append(heading, el('p', item.rule ? model.describe(item.rule) : 'Fallback within this eligible objective.'),
          el('p', eligibility ? (winner && result.offer === item.key ? 'Selected / highest eligible priority' : 'Eligible / lower objective or item priority')
            : 'Held / strategy, item rule or consent did not pass'));
        body.append(card);
      });
      detail.append(summary, body);
      $('objectives').append(detail);
    }
    if (scenarioChosen) $('eligible-details').open = !!result.offer;
    $('eligible-items').replaceChildren();
    result.ladder.forEach((o, i) => o.offers.filter(item => item.eligible).forEach(item => {
      const offer = model.objectives[i].offers.find(candidate => candidate.key === item.key);
      $('eligible-items').append(el('p', model.objectives[i].label + ' / ' + offer.name + ' / priority ' + offer.priority));
    }));
    if (!$('eligible-items').childElementCount) $('eligible-items').append(el('p', 'No eligible items.'));
  }
  function cta(text) {
    const button = el('button', text, 'preview-cta');
    button.type = 'button';
    button.setAttribute('aria-label', text + ' (simulated interaction)');
    button.addEventListener('click', () => {
      $('preview-feedback').textContent = 'Simulation only: "' + text + '". No booking, navigation or message send was performed.';
    });
    return button;
  }
  function email(offer) {
    const table = el('table', undefined, 'email-card');
    table.setAttribute('role', 'presentation');
    table.setAttribute('width', '600');
    const tbody = el('tbody');
    function row(content, className) {
      const tr = el('tr');
      const td = el('td', undefined, className);
      td.append(content);
      tr.append(td);
      tbody.append(tr);
    }
    row(image('tui-decisioning-assets/tui-logo.svg', 'TUI', 'email-logo'));
    row(image(offer.image, offer.imageAlt, 'email-photo'), 'email-photo-cell');
    row(el('span', 'Hi ' + recipient + ', here is your next holiday moment.', 'eyebrow'));
    row(el('div', offer.content.title), 'email-heading');
    row(el('div', offer.content.fullDescription), 'email-copy');
    row(cta(offer.content.fullCTA));
    row(el('p', 'Illustrative personalised preview. Generated from the supplied TUI capture; current terms and availability must be checked with TUI. Nothing has been sent.'), 'email-footer');
    table.append(tbody);
    return table;
  }
  function hold(reason) {
    const card = el('div', undefined, 'hold-card');
    card.append(el('span', 'A MOMENT OF PAUSE', 'eyebrow'), el('h3', 'No content selected'), el('p', reason));
    return card;
  }
  function renderPreview(result) {
    const objective = model.objectives.find(o => o.key === result.objective);
    let offer = objective && objective.offers.find(item => item.key === result.offer);
    if (live) offer = { image: live.url, imageAlt: 'Image returned by the configured live decision',
      content: { title: live.title || 'Live decision image', fullDescription: live.description || 'No copy was returned by the live decision.',
        fullCTA: 'Preview interaction' } };
    if (held) offer = null;
    $('preview-feedback').textContent = '';
    document.querySelectorAll('.subject-line').forEach(node => {
      node.textContent = offer ? 'Subject: ' + offer.content.title : 'Content held / no email';
    });
    if (!offer) {
      for (const id of ['email-preview', 'mobile-preview', 'web-preview']) $(id).replaceChildren(hold(held || result.reason));
      return;
    }
    $('email-preview').replaceChildren(email(offer));
    $('mobile-preview').replaceChildren(email(offer));
    const hero = el('div', undefined, 'web-hero');
    const copy = el('div', undefined, 'web-hero-copy');
    copy.append(el('span', 'A LITTLE MORE YOU / DEMO', 'eyebrow'), el('h3', offer.content.title),
      el('p', offer.content.fullDescription), cta(offer.content.fullCTA));
    hero.append(image(offer.image, offer.imageAlt), copy);
    $('web-preview').replaceChildren(hero);
  }
  function render(scenarioChosen) {
    const result = model.evaluate(state);
    const invalid = Array.from(controls.values()).some(input => input.getAttribute('aria-invalid') === 'true');
    if (invalid) {
      live = null;
      result.objective = null;
      result.offer = null;
      result.reason = 'Content held: enter valid values for the highlighted signals. Previous content has been removed.';
      result.ladder.forEach(row => {
        row.eligible = false;
        row.offers.forEach(item => { item.eligible = false; });
      });
    }
    renderLadder(result, scenarioChosen);
    renderPreview(result);
    const objective = model.objectives.find(o => o.key === result.objective);
    const offer = objective?.offers.find(item => item.key === result.offer);
    $('decision-status').textContent = held || (live ? 'Live policy preview / local objective ladder below is illustrative. ' : '') + (offer
      ? objective.label + ' / ' + offer.name + '. ' + result.reason
      : result.reason);
    $('fixture-summary').textContent = 'Holiday stage: ' + state.booking + '. Documents: ' + state.documents +
      '. Email consent: ' + state.emailConsent + '. Personalisation: ' + state.personalize +
      (embedded ? '. Staged signals, not confirmed profile facts.' : '. No data was loaded from AEP.');
    $('preview-feedback').textContent = live ? 'Live policy content. Objective ranking is still simulated.' :
      embedded ? 'Local simulation / staged signals. Run explicitly to request the configured live policy.' : '';
  }
  function setChannel(channel, push) {
    if (!['email', 'mobile', 'web'].includes(channel)) channel = 'email';
    document.querySelectorAll('[data-channel]').forEach(tab => {
      const active = tab.dataset.channel === channel;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      $('panel-' + tab.dataset.channel).hidden = !active;
    });
    $('preview-caption').textContent = { email: 'Responsive email / 600px', mobile: 'Same email / 390px phone frame', web: 'Reconstructed TUI website' }[channel];
    if (push || parent !== window) {
      const url = new URL(location.href);
      url.searchParams.set('channel', channel);
      if (parent !== window) {
        history.replaceState({}, '', url);
        if (push) parent.postMessage({ type: 'tui-channel', channel }, location.origin);
      } else history.pushState({}, '', url);
    }
  }
  function setupTabs() {
    const tabs = Array.from(document.querySelectorAll('[data-channel]'));
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => setChannel(tab.dataset.channel, true));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        tabs[next].focus();
        setChannel(tabs[next].dataset.channel, true);
      });
    });
    window.addEventListener('popstate', () => setChannel(new URLSearchParams(location.search).get('channel'), false));
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent || !event.data) return;
      if (event.data.type === 'tui-theme') {
        if (event.data.dark) document.documentElement.setAttribute('data-aep-theme', 'dark');
        else document.documentElement.removeAttribute('data-aep-theme');
      }
      if (event.data.type === 'tui-set-channel') setChannel(event.data.channel, false);
    });
    setChannel(new URLSearchParams(location.search).get('channel'), false);
  }
  function resizePanes() {
    document.querySelectorAll('.gutter').forEach(gutter => {
      const key = 'tuiDecisioningWidth-' + gutter.dataset.pane;
      const property = '--' + gutter.dataset.pane + '-width';
      const min = Number(gutter.getAttribute('aria-valuemin'));
      const max = Number(gutter.getAttribute('aria-valuemax'));
      function size(value) {
        const width = Math.max(min, Math.min(max, value));
        $('workspace').style.setProperty(property, width + 'px');
        gutter.setAttribute('aria-valuenow', width);
        try { localStorage.setItem(key, String(width)); } catch (error) { console.warn('Pane width could not be saved', error); }
      }
      try {
        const saved = localStorage.getItem(key);
        if (saved && Number.isFinite(Number(saved))) size(Number(saved));
      } catch (error) { console.warn('Pane width could not be read', error); }
      gutter.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        size(event.key === 'Home' ? min : event.key === 'End' ? max :
          Number(gutter.getAttribute('aria-valuenow')) + (event.key === 'ArrowRight' ? 10 : -10));
      });
      gutter.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        const start = event.clientX;
        const width = Number(gutter.getAttribute('aria-valuenow'));
        gutter.setPointerCapture(event.pointerId);
        const move = current => size(width + current.clientX - start);
        const done = () => {
          gutter.removeEventListener('pointermove', move);
          gutter.removeEventListener('pointerup', done);
          gutter.removeEventListener('pointercancel', done);
        };
        gutter.addEventListener('pointermove', move);
        gutter.addEventListener('pointerup', done);
        gutter.addEventListener('pointercancel', done);
      });
    });
  }
  $('reset').addEventListener('click', () => {
    state = { ...model.defaults };
    changed(model.fields.map(f => f.key));
    controls.forEach((input, key) => { input.value = String(state[key]); input.removeAttribute('aria-invalid'); });
    groups.forEach(group => { group.open = false; });
    document.querySelectorAll('.objective').forEach(detail => { detail.open = false; });
    document.querySelectorAll('#scenario-pills button').forEach(button => button.setAttribute('aria-pressed', 'false'));
    $('eligible-details').open = false;
    $('scenario-select').value = '';
    $('scenario-label').textContent = 'Illustrative starting profile';
    render();
  });
  $('expand').addEventListener('click', () => document.querySelectorAll('.objective').forEach(detail => { detail.open = true; }));
  $('collapse').addEventListener('click', () => document.querySelectorAll('.objective').forEach(detail => { detail.open = false; }));
  const rules = model.objectives.reduce((count, o) => count + 1 + o.offers.filter(item => item.rule).length, 0);
  $('catalog-stats').textContent = rules + ' eligibility rules / ' + model.scenarios.length +
    ' simulation scenarios (including consent holds). Priorities run from 730 to 110.';
  buildSignals();
  buildScenarios();
  setupTabs();
  resizePanes();
  window.TuiDecisioningVisualiser = {
    setBusy(busy) {
      document.querySelectorAll('#signals input,#signals select,#scenario-select,#scenario-pills button,#reset').forEach(input => { input.disabled = busy; });
    },
    getState() {
      if ([...controls.values()].some(input => input.value === '' || !input.checkValidity())) throw new Error('Enter valid profile signals before Apply.');
      return { ...state };
    },
    setEmbedded() {
      embedded = true; document.querySelector('.fictional-drawer').hidden = true;
      document.querySelector('.signals-pane > .microcopy').textContent = 'Local ranking uses staged signals. Only Apply writes profile changes; Run requests live content.';
      for (const input of controls.values()) if (input.type === 'number') {
        input.removeAttribute('min'); input.removeAttribute('max'); input.step = 'any';
      }
      this.setProfile(null);
    },
    setProfile(data) {
      generation++; live = null; held = ''; state = { ...model.defaults, ...data?.state };
      recipient = data?.firstName || 'traveller';
      document.querySelector('.avatar').textContent = data ? recipient.slice(0, 2).toUpperCase() : '--';
      document.querySelectorAll('.recipient-label').forEach(node => { node.textContent = data ? 'To: ' + recipient + (data.email ? ' <' + data.email + '>' : '') : 'Illustrative preview / no recipient selected'; });
      document.querySelector('.fictional-person strong').textContent = data ? recipient : 'No profile loaded';
      document.querySelector('.fictional-person small').textContent = data ? 'Loaded signals / missing values simulate defaults' : 'Local simulation only';
      document.querySelector('.fictional-person small + small').textContent = data ? 'See actual identity and consent in the shared drawer' : 'No live profile selected';
      document.querySelector('.simulation-badge').textContent = data ? 'Loaded profile / local ranking' : 'Local simulation';
      document.querySelector('.boundary-note').textContent = 'Local signals are staged. Apply validates test-profile updates; Run separately requests the configured live policy. No messages are sent.';
      for (const [key, input] of controls) {
        if (input.tagName === 'SELECT' && ![...input.options].some(option => option.value === String(state[key]))) {
          const option = el('option', String(state[key])); option.value = String(state[key]); input.append(option);
        }
        input.value = String(state[key]); input.removeAttribute('aria-invalid');
      }
      render();
    },
    hold(reason) { generation++; live = null; held = reason; render(); },
    async setDecision(decision) {
      const current = generation;
      await new Promise((resolve, reject) => {
        const img = new Image(); img.onload = resolve; img.onerror = () => reject(new Error('Live decision image could not load. Previous preview retained.')); img.src = decision.url;
      });
      if (current !== generation) throw new Error('Profile context changed while loading decision image.');
      live = decision; held = ''; render();
    },
  };
  render();
})();
