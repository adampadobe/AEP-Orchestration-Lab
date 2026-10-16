/**
 * NatWest Decisioning — "hero banner" layout for the first two profile drawer blocks.
 *
 * Presentation only: values are mirrored from the shared drawer fields (populated by
 * aep-profile-drawer.js from AEP), so the field-to-AEP mapping is unchanged.
 * The original Customer Profile / Identity blocks stay in the DOM, hidden by CSS.
 *
 * Rollback (no deploy): append ?nwDrawer=classic to the URL, or run
 * localStorage.setItem('nwProfileDrawerLayout', 'classic') and reload.
 * Rollback (code): remove this script + stylesheet from natwest-decisioning-demo.html.
 */
(function (global) {
  'use strict';
  const doc = global.document;
  const BODY_CLASS = 'decisioning-profile-hero';

  function classicRequested() {
    try {
      const param = new URLSearchParams(global.location.search).get('nwDrawer');
      if (param) {
        global.localStorage.setItem('nwProfileDrawerLayout', param === 'classic' ? 'classic' : 'hero');
        return param === 'classic';
      }
      return global.localStorage.getItem('nwProfileDrawerLayout') === 'classic';
    } catch (_err) {
      return false;
    }
  }

  const text = id => {
    const el = doc.getElementById(id);
    const value = el ? String(el.textContent || '').trim() : '';
    return value === '—' || value === 'Unknown' ? '' : value;
  };
  const checked = id => { const el = doc.getElementById(id); return !!(el && el.checked); };
  const pct = (value, max) => Math.max(0, Math.min(100, (value / max) * 100));

  function scoreKpi(raw) {
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) return { value: '—', width: 0 };
    return { value: raw, width: pct(n, 100) };
  }

  const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 2a1 1 0 0 0-1 1v1H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H5zm0 2h6v8H5V4zm-2 2h1v6a2 2 0 0 0 2 2h6v1H3V6z"/></svg>';

  function markup() {
    const kpi = (key, label) => '<div class="dph-card dph-kpi" data-kpi="' + key + '"><small>' + label + '</small><b data-v>—</b><div class="dph-bar"><i></i></div></div>';
    const signal = (label, id) => '<div class="dph-signal"><dt>' + label + '</dt><dd id="' + id + '">—</dd></div>';
    return (
      '<section class="dph dph--compact" id="nwProfileHero" aria-label="Customer profile">' +
      '<div class="dph-hero">' +
      '<img class="dph-avatar" id="nwPhAvatar" alt="Customer profile photo" width="88" height="88" />' +
      '<div class="dph-who"><h2 id="nwPhName">No profile loaded</h2><p id="nwPhMeta"></p><div class="dph-chips" id="nwPhChips"></div></div>' +
      '<div class="dph-clv"><small>Lifetime value</small><b id="nwPhLtv">—</b></div>' +
      '</div>' +
      '<div class="dph-kpis">' +
      kpi('prop', 'Propensity score') + kpi('churn', 'Churn prediction') + kpi('offers', 'Eligible offers') + kpi('interest', 'Product interest') +
      '</div>' +
      '<div class="dph-card dph-details">' +
      '<div class="dph-tabs" role="tablist" aria-label="Customer profile sections">' +
      ['Contact', 'Banking', 'Identity'].map((label, index) =>
        '<button type="button" role="tab" id="nwPhTab-' + index + '" aria-controls="nwPhPanel-' + index +
        '" aria-selected="' + (index === 0) + '" tabindex="' + (index === 0 ? '0' : '-1') + '">' + label + '</button>'
      ).join('') + '</div>' +
      '<div class="dph-panel" role="tabpanel" id="nwPhPanel-0" aria-labelledby="nwPhTab-0" tabindex="0"><dl>' +
      '<dt>Email</dt><dd id="nwPhEmail">—</dd><dt>Phone</dt><dd id="nwPhPhone">—</dd>' +
      '<dt>City</dt><dd id="nwPhCity">—</dd><dt>Personalisation</dt><dd id="nwPhSignal-personalisation">—</dd></dl>' +
      '<div class="dph-consent" aria-label="Marketing channel consent">' +
      ['Email', 'Sms', 'Push'].map(ch => '<span class="dph-tog" data-ch="' + ch + '"><span class="dph-box" aria-hidden="true"></span>' + (ch === 'Sms' ? 'SMS' : ch) + '</span>').join('') +
      '</div></div>' +
      '<div class="dph-panel" role="tabpanel" id="nwPhPanel-1" aria-labelledby="nwPhTab-1" tabindex="0" hidden><dl class="dph-signals">' +
      signal('Account Type (checking)', 'nwPhAccount') +
      signal('Product interest', 'nwPhProduct') +
      signal('Eligible offers', 'nwPhOffers') +
      signal('Complaint status', 'nwPhCase') +
      [['checking', 'Current account'], ['savings', 'Savings'], ['mortgage', 'Mortgage'], ['loan', 'Loan'], ['investment', 'Investments']].map(([key, label]) =>
        signal(label + ' held', 'nwPhSignal-' + key)
      ).join('') + '</dl></div>' +
      '<div class="dph-panel" role="tabpanel" id="nwPhPanel-2" aria-labelledby="nwPhTab-2" tabindex="0" hidden><small class="dph-label">ECID</small>' +
      '<div class="dph-ecid"><span id="nwPhEcid">—</span><button type="button" class="dph-copy" id="nwPhEcidCopy" aria-label="Copy ECID">' + COPY_ICON + 'Copy</button></div>' +
      '<div id="nwPhEcidReset"></div>' +
      '</div></div>' +
      '</section>'
    );
  }

  function setKpi(key, value, width, tone) {
    const card = doc.querySelector('#nwProfileHero [data-kpi="' + key + '"]');
    if (!card) return;
    card.querySelector('[data-v]').textContent = value;
    card.dataset.tone = tone || '';
    card.querySelector('.dph-bar i').style.width = width + '%';
  }

  function render() {
    if (!doc.getElementById('nwProfileHero')) return;
    const name = text('profileDrawerName');
    doc.getElementById('nwPhName').textContent = name || 'No profile loaded';
    const gender = text('profileDrawerGender');
    const age = text('profileDrawerAge');
    const city = text('profileDrawerCity');
    doc.getElementById('nwPhMeta').textContent = [gender, age, city].filter(Boolean).join(' · ');
    const avatar = doc.getElementById('profileDrawerAvatar');
    if (avatar && avatar.src) doc.getElementById('nwPhAvatar').src = avatar.src;
    doc.getElementById('nwPhLtv').textContent = text('profileDrawerLtv') || '—';

    const account = text('nwDrawerDetail-account');
    const product = text('nwDrawerDetail-product');
    const chips = [];
    if (account && account !== 'Not loaded') chips.push(account);
    if (product && !['Not loaded', 'Not set'].includes(product)) chips.push(product);
    const chipsEl = doc.getElementById('nwPhChips');
    chipsEl.textContent = '';
    chips.forEach(label => { const s = doc.createElement('span'); s.className = 'dph-chip'; s.textContent = label; chipsEl.appendChild(s); });

    const banking = global.NatwestDecisioningDrawer && global.NatwestDecisioningDrawer.getSignals();
    const prop = scoreKpi(banking && banking.prop !== null ? String(banking.prop) : '');
    setKpi('prop', prop.value, prop.width, 'good');
    const churn = scoreKpi(banking && banking.churn !== null ? String(banking.churn) : '');
    setKpi('churn', churn.value, churn.width, 'warn');
    const offers = banking && banking.available;
    setKpi('offers', offers === null || offers === undefined ? '—' : String(offers), offers > 0 ? 100 : 0, 'info');
    setKpi('interest', product && !['Not set', 'Not loaded'].includes(product) ? product : '—', banking && banking.product ? 100 : 0, 'info');

    doc.getElementById('nwPhEmail').textContent = text('profileDrawerEmail') || '—';
    doc.getElementById('nwPhPhone').textContent = text('profileDrawerPhone') || '—';
    doc.getElementById('nwPhCity').textContent = city || '—';
    doc.getElementById('nwPhAccount').textContent = account || '—';
    doc.getElementById('nwPhOffers').textContent = text('nwDrawerDetail-available') || '—';
    doc.getElementById('nwPhProduct').textContent = product || '—';
    doc.getElementById('nwPhCase').textContent = text('nwDrawerDetail-cases') || '—';
    ['checking', 'savings', 'mortgage', 'loan', 'investment', 'personalisation'].forEach(key => {
      doc.getElementById('nwPhSignal-' + key).textContent = text('nwDrawerDetail-' + key) || '—';
    });
    doc.querySelectorAll('#nwProfileHero .dph-tog').forEach(tog => {
      const on = tog.dataset.ch === 'Email' ? !!banking && banking.consent === 'y' : checked('profileDrawerConsent' + tog.dataset.ch);
      tog.classList.toggle('on', on);
      tog.setAttribute('aria-label', tog.textContent + (on ? ' consent: yes' : ' consent: no'));
    });
    const ecid = text('profileDrawerDesktopId');
    doc.getElementById('nwPhEcid').textContent = ecid || '—';
    doc.getElementById('nwPhEcidCopy').hidden = !ecid;
  }

  let queued = false;
  function selectTab(index, focus) {
    doc.querySelectorAll('#nwProfileHero [role="tab"]').forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      doc.getElementById(tab.getAttribute('aria-controls')).hidden = i !== index;
      if (focus && i === index) tab.focus();
    });
  }
  function schedule() {
    if (queued) return;
    queued = true;
    global.requestAnimationFrame(() => { queued = false; render(); });
  }

  function mount() {
    const inner = doc.querySelector('#profileDrawer .aep-profile-drawer-inner');
    if (!inner || doc.getElementById('nwProfileHero')) return !!inner;
    doc.body.classList.add(BODY_CLASS);
    inner.insertAdjacentHTML('afterbegin', markup());
    doc.querySelectorAll('#nwProfileHero [role="tab"]').forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(index, false));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % 3;
        else if (event.key === 'ArrowLeft') next = (index + 2) % 3;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = 2;
        else return;
        event.preventDefault(); selectTab(next, true);
      });
    });
    // Keep the shared "New anonymous visitor" control usable by moving it into the hero Identity card.
    const reset = doc.getElementById('profileDrawerEcidResetWrap');
    if (reset) doc.getElementById('nwPhEcidReset').appendChild(reset);
    doc.getElementById('nwPhEcidCopy').addEventListener('click', event => {
      const ecid = text('profileDrawerDesktopId');
      if (!ecid) return;
      const btn = event.currentTarget;
      if (!global.navigator.clipboard) {
        btn.lastChild.textContent = 'Copy unavailable';
        return;
      }
      global.navigator.clipboard.writeText(ecid).then(() => {
        btn.lastChild.textContent = 'Copied';
        global.setTimeout(() => { btn.lastChild.textContent = 'Copy'; }, 1500);
      }).catch(error => {
        console.warn('[natwest-profile-hero] Could not copy ECID', error);
        btn.lastChild.textContent = 'Copy failed';
      });
    });
    const observer = new MutationObserver(schedule);
    inner.querySelectorAll('.aep-profile-drawer-block--customer, .aep-profile-drawer-block--identity').forEach(block => {
      observer.observe(block, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'checked'] });
    });
    global.addEventListener('aep-profile-drawer-loaded', schedule);
    global.addEventListener('natwest-drawer-signals-changed', schedule);
    render();
    return true;
  }

  function start() {
    if (classicRequested()) return;
    if (mount()) return;
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(doc.body, { childList: true, subtree: true });
  }

  global.NatwestProfileHero = { render, classicRequested };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
