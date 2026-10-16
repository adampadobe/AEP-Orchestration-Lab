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
    return !value || ['Unknown', '\u2014'].includes(value)
      ? (global.TuiDecisioningDrawer?.getSignals() ? 'Not set' : 'Not loaded') : value;
  };
  function el(tag, value, cls) {
    const node = doc.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (cls) node.className = cls;
    return node;
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
    const details = el('div', undefined, 'tui-profile-sections');
    ['Contact', 'Travel', 'Identity'].forEach((label, index) => {
      const panel = el('section', undefined, 'dph-card tui-profile-section'); panel.id = 'tuiPhPanel-' + index; panel.tabIndex = 0;
      const heading = el('h3', label); heading.id = 'tuiPhHeading-' + index;
      panel.setAttribute('aria-labelledby', heading.id); panel.append(heading);
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
          if (['Not loaded', 'Not set'].includes(id)) { copy.textContent = 'No ECID loaded'; return; }
          try { await navigator.clipboard.writeText(id); copy.textContent = 'Copied'; }
          catch (error) { console.warn('ECID copy failed', error); copy.textContent = 'Copy unavailable'; }
        });
        panel.append(copy);
        const reset = $('profileDrawerEcidResetWrap'); if (reset) panel.append(reset);
      }
      details.append(panel);
    });
    hero.append(head, kpis, details); inner.prepend(hero); doc.body.classList.add('decisioning-profile-hero');
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
