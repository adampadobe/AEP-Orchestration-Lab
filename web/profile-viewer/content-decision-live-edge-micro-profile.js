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

  function refreshIdentityStrip() {
    var ns = getNamespace();
    var idVal = getIdentifierValue();
    var streamingEmail = resolveStreamingEmail(ns, idVal);
    var ecid = resolveEcid();
    var idLabel = $('cdMicroProfileIdLabel');
    var ecidLabel = $('cdMicroProfileEcid');
    var emailLabel = $('cdMicroProfileStreamingEmail');
    if (idLabel) idLabel.textContent = idVal ? (ns + '=' + idVal) : '—';
    if (ecidLabel) ecidLabel.textContent = ecid || '—';
    if (emailLabel) emailLabel.textContent = streamingEmail || '—';
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

  async function onApply() {
    var btn = $('cdMicroProfileApply');
    if (!btn) return;
    refreshIdentityStrip();
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
  }

  function wireIdentityWatchers() {
    var ns = $('cdNs');
    var em = $('cdLiveEmail');
    if (ns) ns.addEventListener('change', refreshIdentityStrip);
    if (em) {
      em.addEventListener('input', refreshIdentityStrip);
      em.addEventListener('change', refreshIdentityStrip);
    }
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.id) return;
      if (t.id === 'btnFetchProfile' || t.id === 'btnProfileAndEdge' || t.id === 'btnRunFullContentDecision') {
        setTimeout(refreshIdentityStrip, 1500);
        setTimeout(refreshIdentityStrip, 4000);
      }
    });
    window.addEventListener('aep-lab-sandbox-synced', function () {
      streamingCache = Object.create(null);
      refreshIdentityStrip();
    });
  }

  function boot() {
    if (!$('cdMicroProfilePanel')) return;
    wireRangeMirrors();
    wireIdentityWatchers();
    var btn = $('cdMicroProfileApply');
    if (btn) btn.addEventListener('click', onApply);
    refreshIdentityStrip();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
