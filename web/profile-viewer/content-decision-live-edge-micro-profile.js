/**
 * Decisioning lab (Edge) — compact micro profile editor under the Run button.
 * Reuses /api/generic-profile-connection (sandbox streaming connection lookup)
 * and /api/profile/update via window.postProfileUpdate. No new endpoints.
 */
(function () {
  'use strict';

  var LOG_PREFIX = '[cd-edge-micro-profile]';

  function log() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.log.apply(console, args);
    } catch (e) {}
  }

  function $(id) { return document.getElementById(id); }

  function getNamespace() {
    var sel = $('cdNs');
    return sel && sel.value ? String(sel.value).trim().toLowerCase() : 'email';
  }

  function getIdentifierValue() {
    var el = $('cdLiveEmail');
    return el ? String(el.value || '').trim() : '';
  }

  function getSandboxName() {
    if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
      var sn = window.AepGlobalSandbox.getSandboxName();
      if (sn) return String(sn).trim();
    }
    try {
      var ls = localStorage.getItem('aepGlobalSandboxName');
      if (ls) return String(ls).trim();
    } catch (e) {}
    return '';
  }

  /**
   * Minimal UPS entity walker — mirrors content-decision-live-edge-inline.js's
   * `extractEntityFromUpsClientData` so this module stays decoupled from that
   * IIFE's internals.
   */
  function extractEntityFromUps(clientData) {
    if (!clientData || typeof clientData !== 'object') return null;
    var root = clientData.platform_response != null ? clientData.platform_response : clientData;
    if (!root || typeof root !== 'object') return null;
    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i++) {
      var v = root[keys[i]];
      if (v && typeof v === 'object' && v.entity && typeof v.entity === 'object') return v.entity;
    }
    if (root.entity && typeof root.entity === 'object') return root.entity;
    return null;
  }

  function extractEmailFromEntity(entity) {
    if (!entity || typeof entity !== 'object') return '';
    var im = entity.identityMap;
    if (im && typeof im === 'object') {
      for (var k in im) {
        if (!Object.prototype.hasOwnProperty.call(im, k)) continue;
        if (!/^email$/i.test(k)) continue;
        var arr = im[k];
        if (!Array.isArray(arr)) continue;
        for (var j = 0; j < arr.length; j++) {
          if (arr[j] && arr[j].id) return String(arr[j].id).trim();
        }
      }
    }
    if (entity.personalEmail && typeof entity.personalEmail.address === 'string') {
      return String(entity.personalEmail.address).trim();
    }
    if (entity.workEmail && typeof entity.workEmail.address === 'string') {
      return String(entity.workEmail.address).trim();
    }
    return '';
  }

  function resolveStreamingEmail(ns, idValue) {
    if (ns === 'email' && idValue) return idValue;
    var api = window.CdEdgeLive;
    if (api && typeof api.getLastUpsClientData === 'function') {
      var entity = extractEntityFromUps(api.getLastUpsClientData());
      var em = extractEmailFromEntity(entity);
      if (em) return em;
    }
    return '';
  }

  function resolveEcid() {
    var api = window.CdEdgeLive;
    if (api && typeof api.getLastProfileEcid === 'function') {
      var v = api.getLastProfileEcid();
      if (v) return String(v).trim();
    }
    return '';
  }

  function isProfileLoaded() {
    var api = window.CdEdgeLive;
    if (!api || typeof api.getLastUpsClientData !== 'function') return false;
    return !!api.getLastUpsClientData();
  }

  function refreshStateDot() {
    var el = $('cdMicroProfileState');
    if (!el) return;
    var loaded = isProfileLoaded();
    var labelEl = el.querySelector('.cd-micro-profile-state-label');
    el.setAttribute('data-loaded', loaded ? 'true' : 'false');
    el.setAttribute('aria-label', loaded ? 'Profile loaded' : 'No profile loaded');
    if (labelEl) labelEl.textContent = loaded ? 'Profile ready' : 'No profile loaded';
  }

  /** Cache the streaming connection per sandbox (one fetch per sandbox per page load). */
  var streamingCache = Object.create(null);

  async function fetchStreamingForSandbox(sandbox) {
    var key = sandbox || '__default__';
    if (Object.prototype.hasOwnProperty.call(streamingCache, key)) return streamingCache[key];
    var qs = sandbox ? ('?sandbox=' + encodeURIComponent(sandbox)) : '';
    var res, data;
    try {
      res = await fetch('/api/generic-profile-connection' + qs);
      data = await res.json().catch(function () { return {}; });
    } catch (e) {
      streamingCache[key] = { error: 'Network error loading streaming connection: ' + (e && e.message ? e.message : e) };
      return streamingCache[key];
    }
    if (!res.ok || data.ok === false) {
      streamingCache[key] = { error: data.error || ('Streaming connection lookup failed (HTTP ' + res.status + ').') };
      return streamingCache[key];
    }
    var rec = data.record;
    var streaming = rec && rec.streaming && typeof rec.streaming === 'object' ? rec.streaming : null;
    if (!streaming || !streaming.url || !streaming.flowId) {
      streamingCache[key] = {
        error: 'No saved streaming connection for sandbox "' + (sandbox || 'default') +
               '". Configure it on the Profile Generation page first.',
      };
      return streamingCache[key];
    }
    streamingCache[key] = { streaming: streaming };
    return streamingCache[key];
  }

  function buildUpdates(form) {
    var updates = [];
    var tier = form.tier;
    if (tier) {
      updates.push({ path: 'loyalty.tier', value: tier });
      updates.push({ path: 'loyaltyDetails.level', value: tier });
    }
    if (form.points != null && form.points !== '') {
      var pts = Number(form.points);
      if (!Number.isNaN(pts)) {
        updates.push({ path: 'loyalty.points', value: pts });
        updates.push({ path: 'loyaltyDetails.points', value: pts });
      }
    }
    if (form.channel) {
      updates.push({ path: 'consents.marketing.preferred', value: form.channel });
    }
    if (form.propensity != null && form.propensity !== '') {
      var pr = Number(form.propensity);
      if (!Number.isNaN(pr)) {
        updates.push({ path: 'scoring.core.propensityScore', value: pr });
      }
    }
    if (form.churn != null && form.churn !== '') {
      var ch = Number(form.churn);
      if (!Number.isNaN(ch)) {
        updates.push({ path: 'scoring.churn.churnPrediction', value: ch });
      }
    }
    if (form.orderValue != null && form.orderValue !== '') {
      var ov = Number(form.orderValue);
      if (!Number.isNaN(ov)) {
        updates.push({ path: 'orderProfile.avgOrderSize', value: ov });
      }
    }
    if (form.nps != null && form.nps !== '') {
      var np = parseInt(form.nps, 10);
      if (!Number.isNaN(np)) {
        updates.push({ path: 'scoring.npsScore', value: np });
      }
    }
    if (form.language) {
      updates.push({ path: 'personalEmail.language', value: form.language });
      updates.push({ path: 'preferences.preferredLanguage', value: form.language });
    }
    return updates;
  }

  function setStatus(msg, kind) {
    var el = $('cdMicroProfileStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('is-error', 'is-ok');
    if (kind === 'error') el.classList.add('is-error');
    else if (kind === 'ok') el.classList.add('is-ok');
  }

  function formatPropensity(v) {
    var n = Number(v);
    if (Number.isNaN(n)) return '0.00';
    return n.toFixed(2);
  }

  function formatPoints(v) {
    var n = parseInt(v, 10);
    if (Number.isNaN(n)) return '0';
    return String(n);
  }

  function formatMoney(v) {
    var n = Number(v);
    if (Number.isNaN(n)) return '$0';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  async function onApply() {
    var btn = $('cdMicroProfileApply');
    if (!btn) return;
    refreshStateDot();
    var ns = getNamespace();
    var idVal = getIdentifierValue();
    if (!idVal) {
      setStatus('Enter a profile identifier in step 5 first.', 'error');
      return;
    }
    var streamingEmail = resolveStreamingEmail(ns, idVal);
    if (!streamingEmail) {
      setStatus('No email available — run "Fetch profile only" or use Email namespace, then retry.', 'error');
      return;
    }
    var sandbox = getSandboxName();
    var ecid = resolveEcid();
    var form = {
      tier: ($('cdMicroProfileTier') || {}).value || '',
      points: ($('cdMicroProfilePoints') || {}).value || '',
      channel: ($('cdMicroProfileChannel') || {}).value || '',
      propensity: ($('cdMicroProfilePropensity') || {}).value || '',
      churn: ($('cdMicroProfileChurn') || {}).value || '',
      orderValue: ($('cdMicroProfileOrderValue') || {}).value || '',
      nps: ($('cdMicroProfileNps') || {}).value || '',
      language: ($('cdMicroProfileLanguage') || {}).value || '',
    };
    var updates = buildUpdates(form);
    if (!updates.length) {
      setStatus('Nothing to apply — adjust at least one control.', 'error');
      return;
    }
    if (typeof window.postProfileUpdate !== 'function') {
      setStatus('Profile streaming helper not loaded.', 'error');
      return;
    }

    btn.disabled = true;
    setStatus('Applying…');
    try {
      var streamingResolved = await fetchStreamingForSandbox(sandbox);
      if (streamingResolved.error) {
        setStatus(streamingResolved.error, 'error');
        return;
      }
      var body = {
        email: streamingEmail,
        ecid: ecid || undefined,
        updates: updates,
        sandbox: sandbox || undefined,
        streaming: streamingResolved.streaming,
      };
      log('POST /api/profile/update', { sandbox: sandbox, email: streamingEmail, ecid: ecid, updateCount: updates.length });
      var result = await window.postProfileUpdate(body);
      if (!result || !result.ok) {
        var msg = (typeof window.formatProfileUpdateError === 'function' && result && result.data)
          ? window.formatProfileUpdateError(result.data)
          : ((result && result.data && (result.data.error || result.data.message)) || 'Update failed.');
        setStatus(msg, 'error');
        return;
      }
      setStatus('Updated. Re-run decision to see new result.', 'ok');
    } catch (e) {
      setStatus(String((e && e.message) || e || 'Network error'), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  var SLIDER_TINT_CONFIG = [
    { id: 'cdMicroProfileChurn', reverse: true },
    { id: 'cdMicroProfilePropensity', reverse: false },
    { id: 'cdMicroProfileOrderValue', reverse: false },
    { id: 'cdMicroProfilePoints', reverse: false },
  ];

  function pickSliderToken(pct, reverse) {
    if (pct < 0.34) return reverse ? '--dash-success-border' : '--dash-error-border';
    if (pct < 0.67) return '--dash-warning-border';
    return reverse ? '--dash-error-border' : '--dash-success-border';
  }

  function applySliderTint(input, reverse) {
    if (!input) return;
    var min = Number(input.min);
    var max = Number(input.max);
    var val = Number(input.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(val)) return;
    var pct = Math.max(0, Math.min(1, (val - min) / (max - min)));
    var token = pickSliderToken(pct, !!reverse);
    input.style.setProperty('--cd-slider-fill', 'var(' + token + ')');
    input.style.setProperty('--cd-slider-pct', (pct * 100).toFixed(2) + '%');
  }

  function wireRangeMirrors() {
    var pts = $('cdMicroProfilePoints');
    var ptsLabel = $('cdMicroProfilePointsValue');
    if (pts && ptsLabel) {
      var syncPts = function () { ptsLabel.textContent = formatPoints(pts.value); };
      pts.addEventListener('input', syncPts);
      syncPts();
    }
    var pr = $('cdMicroProfilePropensity');
    var prLabel = $('cdMicroProfilePropensityValue');
    if (pr && prLabel) {
      var syncPr = function () { prLabel.textContent = formatPropensity(pr.value); };
      pr.addEventListener('input', syncPr);
      syncPr();
    }
    var ch = $('cdMicroProfileChurn');
    var chLabel = $('cdMicroProfileChurnValue');
    if (ch && chLabel) {
      var syncCh = function () { chLabel.textContent = formatPropensity(ch.value); };
      ch.addEventListener('input', syncCh);
      syncCh();
    }
    var ov = $('cdMicroProfileOrderValue');
    var ovLabel = $('cdMicroProfileOrderValueDisplay');
    if (ov && ovLabel) {
      var syncOv = function () { ovLabel.textContent = formatMoney(ov.value); };
      ov.addEventListener('input', syncOv);
      syncOv();
    }
    SLIDER_TINT_CONFIG.forEach(function (cfg) {
      var input = $(cfg.id);
      if (!input) return;
      var sync = function () { applySliderTint(input, cfg.reverse); };
      input.addEventListener('input', sync);
      sync();
    });
  }

  /** Coalesce auto-lookup attempts so identity-restored + sandbox-synced
   *  events that fire close together still result in a single fetch. */
  var autoLookupInFlight = false;
  var autoLookupLastKey = '';

  async function maybeAutoLookup(reason) {
    var api = window.CdEdgeLive;
    if (!api || typeof api.runProfileLookup !== 'function') return;
    var ns = getNamespace();
    var idVal = getIdentifierValue();
    if (!ns || !idVal) return;
    var key = (getSandboxName() || '') + '\u0001' + ns + '\u0001' + idVal;
    if (autoLookupInFlight) return;
    if (key === autoLookupLastKey && isProfileLoaded()) return;
    autoLookupInFlight = true;
    autoLookupLastKey = key;
    log('auto-lookup', reason, { ns: ns, sandbox: getSandboxName() });
    try {
      await api.runProfileLookup({ silent: true });
    } catch (e) {
      log('auto-lookup error', String((e && e.message) || e));
    } finally {
      autoLookupInFlight = false;
      refreshStateDot();
    }
  }

  function wireProfileStateWatchers() {
    window.addEventListener('cd-edge-profile-lookup', function () {
      refreshStateDot();
    });
    window.addEventListener('cd-edge-identity-restored', function () {
      maybeAutoLookup('identity-restored');
    });
    window.addEventListener('aep-lab-sandbox-synced', function () {
      streamingCache = Object.create(null);
      autoLookupLastKey = '';
      refreshStateDot();
      maybeAutoLookup('sandbox-synced');
    });
    var em = $('cdLiveEmail');
    var ns = $('cdNs');
    if (em) {
      em.addEventListener('change', function () {
        autoLookupLastKey = '';
        refreshStateDot();
      });
    }
    if (ns) {
      ns.addEventListener('change', function () {
        autoLookupLastKey = '';
        refreshStateDot();
      });
    }
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.id) return;
      if (t.id === 'btnFetchProfile' || t.id === 'btnProfileAndEdge' || t.id === 'btnRunFullContentDecision') {
        setTimeout(refreshStateDot, 1500);
        setTimeout(refreshStateDot, 4000);
      }
    });
  }

  function boot() {
    if (!$('cdMicroProfilePanel')) return;
    wireRangeMirrors();
    wireProfileStateWatchers();
    var btn = $('cdMicroProfileApply');
    if (btn) btn.addEventListener('click', onApply);
    refreshStateDot();
    if (getIdentifierValue()) {
      maybeAutoLookup('boot');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
