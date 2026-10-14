/**
 * British Airways Decisioning — "hero banner" layout for the first two profile drawer blocks.
 *
 * Presentation only: values are mirrored from the shared drawer fields (populated by
 * aep-profile-drawer.js from AEP), so the field-to-AEP mapping is unchanged.
 * The original Customer Profile / Identity blocks stay in the DOM, hidden by CSS.
 *
 * Rollback (no deploy): append ?baDrawer=classic to the URL, or run
 * localStorage.setItem('baProfileDrawerLayout', 'classic') and reload.
 * Rollback (code): remove this script + stylesheet from british-airways-decisioning.html.
 */
(function (global) {
  'use strict';
  const doc = global.document;
  const BODY_CLASS = 'ba-profile-hero';

  function classicRequested() {
    try {
      const param = new URLSearchParams(global.location.search).get('baDrawer');
      if (param) {
        global.localStorage.setItem('baProfileDrawerLayout', param === 'classic' ? 'classic' : 'hero');
        return param === 'classic';
      }
      return global.localStorage.getItem('baProfileDrawerLayout') === 'classic';
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
  const title = value => (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : '');
  const pct = (value, max) => Math.max(0, Math.min(100, (value / max) * 100));

  function scoreKpi(raw) {
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) return { value: '—', width: 0 };
    const max = n <= 1 ? 1 : n <= 3 ? 3 : 100;
    return { value: raw, width: pct(n, max) };
  }
  const OPS = {
    none: { label: 'Normal', tone: 'good', width: 100 },
    delay: { label: 'Delay', tone: 'warn', width: 60 },
    cancelled: { label: 'Cancelled', tone: 'bad', width: 100 },
  };
  const INTENT = {
    none: { label: 'None', tone: 'mute', width: 0 },
    searched: { label: 'Searched', tone: 'info', width: 35 },
    abandoned: { label: 'Abandoned', tone: 'warn', width: 60 },
  };
  const BOOKING = { none: 'No trip', upcoming: 'Upcoming trip', travelling: 'Travelling', completed: 'Trip completed' };

  const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 2a1 1 0 0 0-1 1v1H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H5zm0 2h6v8H5V4zm-2 2h1v6a2 2 0 0 0 2 2h6v1H3V6z"/></svg>';

  function markup() {
    const kpi = (key, label) => '<div class="ba-ph-card ba-ph-kpi" data-kpi="' + key + '"><small>' + label + '</small><b data-v>—</b><div class="ba-ph-bar"><i></i></div></div>';
    return (
      '<section class="ba-ph" id="baProfileHero" aria-label="Customer profile">' +
      '<div class="ba-ph-hero">' +
      '<img class="ba-ph-avatar" id="baPhAvatar" alt="Customer profile photo" width="88" height="88" />' +
      '<div class="ba-ph-who"><h2 id="baPhName">No profile loaded</h2><p id="baPhMeta"></p><div class="ba-ph-chips" id="baPhChips"></div></div>' +
      '<div class="ba-ph-clv"><small>Lifetime value</small><b id="baPhLtv">—</b></div>' +
      '</div>' +
      '<div class="ba-ph-kpis">' +
      kpi('prop', 'Propensity') + kpi('churn', 'Churn risk') + kpi('ops', 'Operations') + kpi('intent', 'Shopping intent') +
      '</div>' +
      '<div class="ba-ph-cols">' +
      '<div class="ba-ph-card"><h3>Contact</h3><dl>' +
      '<dt>Email</dt><dd id="baPhEmail">—</dd><dt>Phone</dt><dd id="baPhPhone">—</dd>' +
      '<dt>City</dt><dd id="baPhCity">—</dd><dt>Flight class</dt><dd id="baPhClass">—</dd></dl>' +
      '<div class="ba-ph-consent" aria-label="Marketing channel consent">' +
      ['Email', 'Sms', 'Push'].map(ch => '<span class="ba-ph-tog" data-ch="' + ch + '"><span class="ba-ph-box" aria-hidden="true"></span>' + (ch === 'Sms' ? 'SMS' : ch) + '</span>').join('') +
      '</div></div>' +
      '<div class="ba-ph-card"><h3>Identity</h3><small class="ba-ph-label">ECID</small>' +
      '<div class="ba-ph-ecid"><span id="baPhEcid">—</span><button type="button" class="ba-ph-copy" id="baPhEcidCopy" aria-label="Copy ECID">' + COPY_ICON + 'Copy</button></div>' +
      '<div id="baPhEcidReset"></div>' +
      '</div>' +
      '</div>' +
      '</section>'
    );
  }

  function setKpi(key, value, width, tone) {
    const card = doc.querySelector('#baProfileHero [data-kpi="' + key + '"]');
    if (!card) return;
    card.querySelector('[data-v]').textContent = value;
    card.dataset.tone = tone || '';
    card.querySelector('.ba-ph-bar i').style.width = width + '%';
  }

  function render() {
    if (!doc.getElementById('baProfileHero')) return;
    const profile = (global.DemoProfileDrawer && global.DemoProfileDrawer.getLastLookedUpProfile && global.DemoProfileDrawer.getLastLookedUpProfile()) || {};
    const name = text('profileDrawerName');
    doc.getElementById('baPhName').textContent = name || 'No profile loaded';
    const gender = text('profileDrawerGender');
    const age = text('profileDrawerAge');
    const city = text('profileDrawerCity');
    doc.getElementById('baPhMeta').textContent = [gender, age, city].filter(Boolean).join(' · ');
    const avatar = doc.getElementById('profileDrawerAvatar');
    if (avatar && avatar.src) doc.getElementById('baPhAvatar').src = avatar.src;
    doc.getElementById('baPhLtv').textContent = text('profileDrawerLtv') || '—';

    const loyalty = text('profileDrawerLoyalty');
    const flightClass = text('profileDrawerDetail-flightClass');
    const booking = text('profileDrawerDetail-bookingStatus');
    const chips = [];
    if (loyalty) chips.push('★ ' + title(loyalty) + ' member');
    if (flightClass) chips.push(title(flightClass) + ' class');
    if (booking) chips.push(BOOKING[booking.toLowerCase()] || title(booking));
    const chipsEl = doc.getElementById('baPhChips');
    chipsEl.textContent = '';
    chips.forEach(label => { const s = doc.createElement('span'); s.className = 'ba-ph-chip'; s.textContent = label; chipsEl.appendChild(s); });

    const prop = scoreKpi(text('profileDrawerPropensityScore'));
    setKpi('prop', prop.value, prop.width, 'good');
    const churn = scoreKpi(text('profileDrawerChurnScore'));
    setKpi('churn', churn.value, churn.width, 'warn');
    const ops = profile.disruptionType ? (OPS[String(profile.disruptionType).toLowerCase()] || { label: title(profile.disruptionType), tone: 'mute', width: 0 }) : null;
    setKpi('ops', ops ? ops.label : '—', ops ? ops.width : 0, ops ? ops.tone : '');
    const intent = profile.shoppingIntent ? (INTENT[String(profile.shoppingIntent).toLowerCase()] || { label: title(profile.shoppingIntent), tone: 'mute', width: 0 }) : null;
    setKpi('intent', intent ? intent.label : '—', intent ? intent.width : 0, intent ? intent.tone : '');

    doc.getElementById('baPhEmail').textContent = text('profileDrawerEmail') || '—';
    doc.getElementById('baPhPhone').textContent = text('profileDrawerPhone') || '—';
    doc.getElementById('baPhCity').textContent = city || '—';
    doc.getElementById('baPhClass').textContent = flightClass ? title(flightClass) : '—';
    doc.querySelectorAll('#baProfileHero .ba-ph-tog').forEach(tog => {
      const on = checked('profileDrawerConsent' + tog.dataset.ch);
      tog.classList.toggle('on', on);
      tog.setAttribute('aria-label', tog.textContent + (on ? ' consent: yes' : ' consent: no'));
    });
    const ecid = text('profileDrawerDesktopId');
    doc.getElementById('baPhEcid').textContent = ecid || '—';
    doc.getElementById('baPhEcidCopy').hidden = !ecid;
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    global.requestAnimationFrame(() => { queued = false; render(); });
  }

  function mount() {
    const inner = doc.querySelector('#profileDrawer .aep-profile-drawer-inner');
    if (!inner || doc.getElementById('baProfileHero')) return !!inner;
    doc.body.classList.add(BODY_CLASS);
    inner.insertAdjacentHTML('afterbegin', markup());
    // Keep the shared "New anonymous visitor" control usable by moving it into the hero Identity card.
    const reset = doc.getElementById('profileDrawerEcidResetWrap');
    if (reset) doc.getElementById('baPhEcidReset').appendChild(reset);
    doc.getElementById('baPhEcidCopy').addEventListener('click', event => {
      const ecid = text('profileDrawerDesktopId');
      if (!ecid || !global.navigator.clipboard) return;
      global.navigator.clipboard.writeText(ecid).then(() => {
        const btn = event.currentTarget;
        btn.lastChild.textContent = 'Copied';
        global.setTimeout(() => { btn.lastChild.textContent = 'Copy'; }, 1500);
      }).catch(() => {});
    });
    const observer = new MutationObserver(schedule);
    inner.querySelectorAll('.aep-profile-drawer-block--customer, .aep-profile-drawer-block--identity').forEach(block => {
      observer.observe(block, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'checked'] });
    });
    global.addEventListener('aep-profile-drawer-loaded', schedule);
    render();
    return true;
  }

  function start() {
    if (classicRequested()) return;
    if (mount()) return;
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(doc.body, { childList: true, subtree: true });
  }

  global.BaProfileHero = { render, classicRequested };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
