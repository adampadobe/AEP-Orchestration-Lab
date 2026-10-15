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
    const max = n <= 1 ? 1 : n <= 3 ? 3 : 100;
    return { value: raw, width: pct(n, max) };
  }
  const OPS = {
    normal: { label: 'Normal', tone: 'good', width: 100 },
    restricted: { label: 'Restricted', tone: 'warn', width: 60 },
    fraud: { label: 'Fraud alert', tone: 'bad', width: 100 },
  };
  const INTENT = {
    none: { label: 'None', tone: 'mute', width: 0 },
    browsed: { label: 'Browsed', tone: 'info', width: 35 },
    abandoned: { label: 'Abandoned', tone: 'warn', width: 60 },
  };

  const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 2a1 1 0 0 0-1 1v1H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H5zm0 2h6v8H5V4zm-2 2h1v6a2 2 0 0 0 2 2h6v1H3V6z"/></svg>';

  function markup() {
    const kpi = (key, label) => '<div class="dph-card dph-kpi" data-kpi="' + key + '"><small>' + label + '</small><b data-v>—</b><div class="dph-bar"><i></i></div></div>';
    return (
      '<section class="dph" id="nwProfileHero" aria-label="Customer profile">' +
      '<div class="dph-hero">' +
      '<img class="dph-avatar" id="nwPhAvatar" alt="Customer profile photo" width="88" height="88" />' +
      '<div class="dph-who"><h2 id="nwPhName">No profile loaded</h2><p id="nwPhMeta"></p><div class="dph-chips" id="nwPhChips"></div></div>' +
      '<div class="dph-clv"><small>Lifetime value</small><b id="nwPhLtv">—</b></div>' +
      '</div>' +
      '<div class="dph-kpis">' +
      kpi('prop', 'Propensity') + kpi('churn', 'Churn risk') + kpi('ops', 'Operations') + kpi('intent', 'Shopping intent') +
      '</div>' +
      '<div class="dph-cols">' +
      '<div class="dph-card"><h3>Contact</h3><dl>' +
      '<dt>Email</dt><dd id="nwPhEmail">—</dd><dt>Phone</dt><dd id="nwPhPhone">—</dd>' +
      '<dt>City</dt><dd id="nwPhCity">—</dd><dt>Account Type</dt><dd id="nwPhAccount">—</dd>' +
      '<dt>Application</dt><dd id="nwPhApplication">—</dd><dt>Product intent</dt><dd id="nwPhProduct">—</dd>' +
      '<dt>Service case</dt><dd id="nwPhCase">—</dd></dl>' +
      '<div class="dph-consent" aria-label="Marketing channel consent">' +
      ['Email', 'Sms', 'Push'].map(ch => '<span class="dph-tog" data-ch="' + ch + '"><span class="dph-box" aria-hidden="true"></span>' + (ch === 'Sms' ? 'SMS' : ch) + '</span>').join('') +
      '</div></div>' +
      '<div class="dph-card"><h3>Identity</h3><small class="dph-label">ECID</small>' +
      '<div class="dph-ecid"><span id="nwPhEcid">—</span><button type="button" class="dph-copy" id="nwPhEcidCopy" aria-label="Copy ECID">' + COPY_ICON + 'Copy</button></div>' +
      '<div id="nwPhEcidReset"></div>' +
      '</div>' +
      '</div>' +
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
    const application = text('nwDrawerDetail-application');
    const product = text('nwDrawerDetail-product');
    const chips = [];
    if (account && account !== 'Not loaded') chips.push(account);
    if (application && !['Not loaded', 'Not set'].includes(application)) chips.push(application);
    if (product && !['Not loaded', 'Not set'].includes(product)) chips.push(product);
    const chipsEl = doc.getElementById('nwPhChips');
    chipsEl.textContent = '';
    chips.forEach(label => { const s = doc.createElement('span'); s.className = 'dph-chip'; s.textContent = label; chipsEl.appendChild(s); });

    const prop = scoreKpi(text('profileDrawerPropensityScore'));
    setKpi('prop', prop.value, prop.width, 'good');
    const churn = scoreKpi(text('profileDrawerChurnScore'));
    setKpi('churn', churn.value, churn.width, 'warn');
    const banking = global.NatwestDecisioningDrawer && global.NatwestDecisioningDrawer.getSignals();
    const ops = banking && banking.operations ? OPS[banking.operations] : null;
    setKpi('ops', ops ? ops.label : '—', ops ? ops.width : 0, ops ? ops.tone : '');
    const intent = banking && banking.intent ? INTENT[banking.intent] : null;
    setKpi('intent', intent ? intent.label : '—', intent ? intent.width : 0, intent ? intent.tone : '');

    doc.getElementById('nwPhEmail').textContent = text('profileDrawerEmail') || '—';
    doc.getElementById('nwPhPhone').textContent = text('profileDrawerPhone') || '—';
    doc.getElementById('nwPhCity').textContent = city || '—';
    doc.getElementById('nwPhAccount').textContent = account || '—';
    doc.getElementById('nwPhApplication').textContent = application || '—';
    doc.getElementById('nwPhProduct').textContent = product || '—';
    doc.getElementById('nwPhCase').textContent = text('nwDrawerDetail-cases') || '—';
    doc.querySelectorAll('#nwProfileHero .dph-tog').forEach(tog => {
      const on = checked('profileDrawerConsent' + tog.dataset.ch);
      tog.classList.toggle('on', on);
      tog.setAttribute('aria-label', tog.textContent + (on ? ' consent: yes' : ' consent: no'));
    });
    const ecid = text('profileDrawerDesktopId');
    doc.getElementById('nwPhEcid').textContent = ecid || '—';
    doc.getElementById('nwPhEcidCopy').hidden = !ecid;
  }

  let queued = false;
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
