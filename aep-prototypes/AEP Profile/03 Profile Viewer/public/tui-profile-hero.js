(function (global) {
  'use strict';
  const doc = document, $ = id => doc.getElementById(id);
  function classic() {
    try {
      const mode = new URLSearchParams(location.search).get('tuiDrawer');
      if (mode) localStorage.setItem('tuiProfileDrawerLayout', mode === 'classic' ? 'classic' : 'hero');
      return localStorage.getItem('tuiProfileDrawerLayout') === 'classic';
    } catch (error) { console.warn('Drawer preference unavailable', error); return false; }
  }
  const text = id => {
    const value = $(id)?.textContent?.trim();
    return !value || ['Unknown', '\u2014'].includes(value) ? 'Not loaded' : value;
  };
  function el(tag, value, cls) {
    const node = doc.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (cls) node.className = cls;
    return node;
  }
  function tab(index, focus) {
    doc.querySelectorAll('#tuiProfileHero [role="tab"]').forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1;
      $(button.getAttribute('aria-controls')).hidden = i !== index;
      if (focus && i === index) button.focus();
    });
  }
  function render() {
    const hero = $('tuiProfileHero');
    if (!hero) return;
    const values = global.TuiDecisioningDrawer?.getSignals();
    $('tuiPhName').textContent = text('profileDrawerName');
    $('tuiPhMeta').textContent = ['profileDrawerGender', 'profileDrawerAge', 'profileDrawerCity']
      .map(text).filter(value => value !== 'Not loaded').join(' / ');
    $('tuiPhLtv').textContent = text('profileDrawerLtv');
    const avatar = $('profileDrawerAvatar');
    $('tuiPhAvatar').hidden = !avatar?.getAttribute('src');
    if (avatar?.getAttribute('src')) $('tuiPhAvatar').src = avatar.src;
    ['Email', 'Phone', 'City', 'DesktopId'].forEach(name => { $('tuiPh' + name).textContent = text('profileDrawer' + name); });
    for (const field of global.TuiDecisioning.fields) {
      const value = values ? values[field.key] : undefined;
      $('tuiPhSignal-' + field.key).textContent = value === undefined ? (values ? 'Not set' : 'Not loaded') : String(value);
    }
    for (const [key, value] of [['score', values?.score], ['points', values?.points], ['booking', values?.booking], ['intent', values?.intent]]) {
      $('tuiPhKpi-' + key).textContent = value === undefined ? 'Unavailable' : String(value);
    }
    for (const name of ['Email', 'Sms', 'Push']) {
      const state = global.DemoProfileDrawer?.getLastLookedUpProfile()?.channels?.[name.toLowerCase()];
      $('tuiPhConsent-' + name).textContent = name + ': ' + (values ? name === 'Email'
        ? values.emailConsent === undefined ? 'Not set' : values.emailConsent
        : state === undefined || state === null ? 'Not set / not granted' : String(state) : 'Not loaded');
    }
  }
  function mount() {
    const inner = doc.querySelector('#profileDrawer .aep-profile-drawer-inner');
    if (!inner || $('tuiProfileHero')) return !!inner;
    const hero = el('section', undefined, 'dph dph--compact'); hero.id = 'tuiProfileHero';
    hero.setAttribute('aria-label', 'Loaded traveller profile');
    const head = el('div', undefined, 'dph-hero'), avatar = el('img', undefined, 'dph-avatar');
    avatar.id = 'tuiPhAvatar'; avatar.alt = 'Customer profile photo'; avatar.hidden = true;
    const who = el('div', undefined, 'dph-who'), name = el('h2', 'No profile loaded'), meta = el('p');
    name.id = 'tuiPhName'; meta.id = 'tuiPhMeta'; who.append(name, meta);
    const ltv = el('div', undefined, 'dph-clv'), amount = el('b'); amount.id = 'tuiPhLtv';
    ltv.append(el('small', 'Lifetime value'), amount); head.append(avatar, who, ltv);
    const kpis = el('div', undefined, 'dph-kpis');
    for (const [key, label] of [['score', 'Propensity'], ['points', 'Loyalty points'], ['booking', 'Journey stage'], ['intent', 'Shopping intent']]) {
      const card = el('div', undefined, 'dph-card dph-kpi'), value = el('b', 'Unavailable');
      value.id = 'tuiPhKpi-' + key; card.append(el('small', label), value); kpis.append(card);
    }
    const details = el('div', undefined, 'dph-card dph-details'), tabs = el('div', undefined, 'dph-tabs');
    tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Traveller profile sections'); details.append(tabs);
    ['Contact', 'Travel', 'Identity'].forEach((label, index) => {
      const button = el('button', label); button.type = 'button'; button.id = 'tuiPhTab-' + index;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'tuiPhPanel-' + index);
      button.addEventListener('click', () => tab(index));
      button.addEventListener('keydown', event => {
        const next = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 }[event.key];
        if (next !== undefined) { event.preventDefault(); tab(next, true); }
      });
      tabs.append(button);
      const panel = el('div', undefined, 'dph-panel'); panel.id = 'tuiPhPanel-' + index; panel.tabIndex = 0;
      panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id);
      const list = el('dl', undefined, index === 1 ? 'dph-signals' : '');
      const fields = index === 0 ? [['Email', 'Email'], ['Phone', 'Phone'], ['City', 'City']]
        : index === 1 ? global.TuiDecisioning.fields.map(f => [f.key, f.label]) : [['DesktopId', 'ECID']];
      for (const [key, title] of fields) {
        const value = el('dd', 'Not loaded'); value.id = index === 1 ? 'tuiPhSignal-' + key : 'tuiPh' + key;
        const pair = el(index === 1 ? 'div' : 'span', undefined, index === 1 ? 'dph-signal' : '');
        pair.append(el('dt', title), value);
        if (index === 1) list.append(pair); else list.append(...pair.childNodes);
      }
      panel.append(list);
      if (index === 0) for (const channel of ['Email', 'Sms', 'Push']) {
        const consent = el('span', channel + ': Not loaded', 'dph-tog'); consent.id = 'tuiPhConsent-' + channel; panel.append(consent);
      }
      if (index === 2) {
        const copy = el('button', 'Copy ECID'); copy.type = 'button';
        copy.addEventListener('click', async () => {
          const id = text('profileDrawerDesktopId');
          if (id === 'Not loaded') { copy.textContent = 'No ECID loaded'; return; }
          try { await navigator.clipboard.writeText(id); copy.textContent = 'Copied'; }
          catch (error) { console.warn('ECID copy failed', error); copy.textContent = 'Copy unavailable'; }
        });
        panel.append(copy);
        const reset = $('profileDrawerEcidResetWrap'); if (reset) panel.append(reset);
      }
      details.append(panel);
    });
    hero.append(head, kpis, details); inner.prepend(hero); doc.body.classList.add('decisioning-profile-hero'); tab(0);
    let scheduled = false;
    const schedule = () => {
      if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; render(); }); }
    };
    const observer = new MutationObserver(schedule);
    inner.querySelectorAll('.aep-profile-drawer-block--customer, .aep-profile-drawer-block--identity').forEach(block =>
      observer.observe(block, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['src', 'checked'] }));
    global.addEventListener('tui-profile-changed', schedule);
    global.addEventListener('aep-profile-drawer-loaded', schedule);
    render(); return true;
  }
  if (!classic()) {
    if (!mount()) {
      const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
      observer.observe(doc.body, { childList: true, subtree: true });
    }
  }
})(window);
