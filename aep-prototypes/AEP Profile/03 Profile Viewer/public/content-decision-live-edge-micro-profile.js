/**
 * Decisioning lab (Edge) — compact micro profile editor under the Run button.
 * Reuses /api/generic-profile-connection (sandbox streaming connection lookup)
 * and /api/profile/update via window.postProfileUpdate. No new endpoints.
 */
(function () {
  'use strict';

  var LOG_PREFIX = '[cd-edge-micro-profile]';
  var SESSION_EXPANDED_KEY = 'cdEdgeMicroProfileExpanded';

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

  /** Snapshot of micro form used for Apply diffing — set at boot and after UPS hydrate. */
  var microBaseline = null;

  function snapshotMicroForm() {
    var tierMetal = '';
    if (microLoyaltyInScheme) {
      var tEl = $('cdMicroProfileTier');
      tierMetal = tEl ? metalFromTierIndex(tEl.value) : '';
    }
    return {
      tier: tierMetal,
      points: microLoyaltyInScheme ? (($('cdMicroProfilePoints') || {}).value || '') : '',
      channel: ($('cdMicroProfileChannel') || {}).value || '',
      propensity: ($('cdMicroProfilePropensity') || {}).value || '',
      churn: ($('cdMicroProfileChurn') || {}).value || '',
      orderValue: ($('cdMicroProfileOrderValue') || {}).value || '',
      nps: ($('cdMicroProfileNps') || {}).value || '',
      language: ($('cdMicroProfileLanguage') || {}).value || '',
    };
  }

  function setMicroBaselineFromDom() {
    microBaseline = snapshotMicroForm();
  }

  /**
   * Walk the merged profile entity plus Profile-Core-v2 tenant slices (`_*` keys)
   * so reads match UPS shapes without hard-coding a tenant id.
   */
  function eachProfileSlice(entity, fn) {
    if (!entity || typeof entity !== 'object') return;
    fn(entity);
    for (var k in entity) {
      if (!Object.prototype.hasOwnProperty.call(entity, k)) continue;
      if (k.length < 2 || k.charAt(0) !== '_') continue;
      if (k === '_id') continue;
      var v = entity[k];
      if (v && typeof v === 'object') fn(v);
    }
  }

  function readNpsFromEntity(entity) {
    var out = null;
    eachProfileSlice(entity, function (sl) {
      if (out != null) return;
      var s = sl.scoring;
      if (!s || typeof s !== 'object') return;
      if (s.npsScore != null && s.npsScore !== '') {
        var n = Number(s.npsScore);
        if (!Number.isNaN(n)) out = Math.round(n);
      } else if (s.nps != null && s.nps !== '') {
        var n2 = Number(s.nps);
        if (!Number.isNaN(n2)) out = Math.round(n2);
      }
    });
    return out;
  }

  /**
   * Normalize UPS language values (string, array, or small object shapes) to a
   * single BCP-47-ish tag string — mirrors resilience in profile-generation-generic.js.
   */
  function coerceLanguageScalar(raw) {
    if (raw == null || raw === '') return '';
    if (typeof raw === 'string') return String(raw).trim();
    if (typeof raw === 'number' && !Number.isNaN(raw)) return String(raw).trim();
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        var x = coerceLanguageScalar(raw[i]);
        if (x) return x;
      }
      return '';
    }
    if (typeof raw === 'object') {
      var keys = ['language', 'code', 'locale', 'preferredLanguage', 'primary', 'value'];
      for (var k = 0; k < keys.length; k++) {
        if (!Object.prototype.hasOwnProperty.call(raw, keys[k])) continue;
        var y = coerceLanguageScalar(raw[keys[k]]);
        if (y) return y;
      }
      return '';
    }
    return '';
  }

  /** Underscore locale tags (en_US) → hyphen (en-US) so <option value="en-US"> matches. */
  function normalizeLanguageTagForSelect(s) {
    var t = String(s || '').trim();
    if (!t) return '';
    return t.replace(/_/g, '-');
  }

  /** One merged profile slice / sub-object — all paths we read for language. */
  function readLanguageFromSlice(sl) {
    if (!sl || typeof sl !== 'object') return '';
    var pe = sl.personalEmail;
    if (pe && typeof pe === 'object') {
      var fromPe = coerceLanguageScalar(pe.language);
      if (fromPe) return fromPe;
    }
    var pr = sl.preferences;
    if (pr && typeof pr === 'object') {
      var fromPr = coerceLanguageScalar(pr.preferredLanguage);
      if (fromPr) return fromPr;
    }
    var rootPref = coerceLanguageScalar(sl.preferredLanguage);
    if (rootPref) return rootPref;
    var m = sl.consents && sl.consents.marketing;
    if (m && typeof m === 'object') {
      var fromM = coerceLanguageScalar(m.preferredLanguage);
      if (fromM) return fromM;
    }
    return '';
  }

  function readLanguageFromEntity(entity) {
    var out = '';
    eachProfileSlice(entity, function (sl) {
      if (out) return;
      var t = readLanguageFromSlice(sl);
      if (t) out = t;
    });
    if (!out && entity && entity.attributes && typeof entity.attributes === 'object') {
      for (var ak in entity.attributes) {
        if (!Object.prototype.hasOwnProperty.call(entity.attributes, ak)) continue;
        var att = entity.attributes[ak];
        var t2 = readLanguageFromSlice(att);
        if (t2) {
          out = t2;
          break;
        }
      }
    }
    return normalizeLanguageTagForSelect(out);
  }

  function readPreferredChannelFromEntity(entity) {
    var out = '';
    eachProfileSlice(entity, function (sl) {
      if (out) return;
      var c = sl.consents;
      if (!c || typeof c !== 'object') return;
      var m = c.marketing;
      if (!m || typeof m !== 'object') return;
      if (m.preferred != null && m.preferred !== '') {
        out = String(m.preferred).trim();
      }
    });
    return out;
  }

  function readTierFromEntity(entity) {
    var out = '';
    eachProfileSlice(entity, function (sl) {
      if (out) return;
      var lo = sl.loyalty;
      if (lo && typeof lo === 'object' && lo.tier) {
        var t = String(lo.tier).trim();
        if (t) {
          out = t;
          return;
        }
      }
      var ld = sl.loyaltyDetails;
      if (ld && typeof ld === 'object' && ld.level) {
        var lv = String(ld.level).trim();
        if (lv) out = lv;
      }
    });
    return out;
  }

  function readPointsFromEntity(entity) {
    var out = null;
    eachProfileSlice(entity, function (sl) {
      if (out != null) return;
      var lo = sl.loyalty;
      if (lo && lo.points != null && lo.points !== '') {
        var n = Number(lo.points);
        if (!Number.isNaN(n)) {
          out = Math.round(n);
          return;
        }
      }
      var ld = sl.loyaltyDetails;
      if (ld && ld.points != null && ld.points !== '') {
        var n2 = Number(ld.points);
        if (!Number.isNaN(n2)) out = Math.round(n2);
      }
    });
    return out;
  }

  /** Same slice walk as readTierFromEntity / readPointsFromEntity: in loyalty program when tier/level text and/or loyalty points exist on profile. */
  function profileInLoyaltyScheme(entity) {
    if (!entity || typeof entity !== 'object') return false;
    var t = readTierFromEntity(entity);
    if (t && String(t).trim()) return true;
    var p = readPointsFromEntity(entity);
    return p != null && !Number.isNaN(p);
  }

  var LOYALTY_METAL_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];

  function metalFromTierIndex(ix) {
    var i = Math.round(Number(ix));
    if (!Number.isFinite(i)) return LOYALTY_METAL_TIERS[0];
    return LOYALTY_METAL_TIERS[clamp(i, 0, LOYALTY_METAL_TIERS.length - 1)];
  }

  function tierIndexFromMetalName(raw) {
    if (raw == null || raw === '') return 0;
    var s = String(raw).trim().toLowerCase();
    for (var i = 0; i < LOYALTY_METAL_TIERS.length; i++) {
      if (LOYALTY_METAL_TIERS[i].toLowerCase() === s) return i;
    }
    return 0;
  }

  /** Whether UPS-backed loyalty controls may emit profile updates (hydrated from last UPS entity). */
  var microLoyaltyInScheme = false;

  function syncTierDisplayFromSlider() {
    var tierEl = $('cdMicroProfileTier');
    var tierLabel = $('cdMicroProfileTierValue');
    if (!tierEl || !tierLabel) return;
    var metal = metalFromTierIndex(tierEl.value);
    tierLabel.textContent = metal;
    tierEl.setAttribute('aria-valuenow', String(tierEl.value));
    tierEl.setAttribute('aria-valuetext', metal);
  }

  function setLoyaltyUiEnabled(inScheme) {
    microLoyaltyInScheme = !!inScheme;
    var panel = $('cdMicroProfilePanel');
    var tierEl = $('cdMicroProfileTier');
    var ptsEl = $('cdMicroProfilePoints');
    var tierLabel = $('cdMicroProfileTierValue');
    if (panel) panel.classList.toggle('is-loyalty-disabled', !inScheme);
    if (tierEl) {
      tierEl.disabled = !inScheme;
      tierEl.setAttribute('aria-disabled', inScheme ? 'false' : 'true');
    }
    if (ptsEl) {
      ptsEl.disabled = !inScheme;
      ptsEl.setAttribute('aria-disabled', inScheme ? 'false' : 'true');
    }
    if (tierLabel) {
      tierLabel.classList.toggle('cd-micro-profile-tier-label--na', !inScheme);
      if (!inScheme) {
        tierLabel.textContent = 'N/A';
        if (tierEl) tierEl.setAttribute('aria-valuetext', 'N/A');
      } else {
        syncTierDisplayFromSlider();
      }
    }
    if (tierEl) applyLoyaltyTierSliderTint(tierEl);
  }

  function readPropensityFromEntity(entity) {
    var out = null;
    eachProfileSlice(entity, function (sl) {
      if (out != null) return;
      var s = sl.scoring;
      if (!s || typeof s !== 'object') return;
      var core = s.core;
      if (!core || typeof core !== 'object') return;
      if (core.propensityScore == null || core.propensityScore === '') return;
      var n = Number(core.propensityScore);
      if (!Number.isNaN(n)) out = Math.round(n);
    });
    return out;
  }

  function readChurnFromEntity(entity) {
    var out = null;
    eachProfileSlice(entity, function (sl) {
      if (out != null) return;
      var s = sl.scoring;
      if (!s || typeof s !== 'object') return;
      var ch = s.churn;
      if (!ch || typeof ch !== 'object') return;
      if (ch.churnPrediction == null && ch.churnScore == null) return;
      var raw = ch.churnPrediction != null ? ch.churnPrediction : ch.churnScore;
      if (raw === '' || raw == null) return;
      var n = Number(raw);
      if (!Number.isNaN(n)) out = Math.round(n);
    });
    return out;
  }

  function readAvgOrderFromEntity(entity) {
    var out = null;
    eachProfileSlice(entity, function (sl) {
      if (out != null) return;
      var op = sl.orderProfile;
      if (!op || typeof op !== 'object') return;
      if (op.avgOrderSize == null || op.avgOrderSize === '') return;
      var n = Number(op.avgOrderSize);
      if (!Number.isNaN(n)) out = n;
    });
    return out;
  }

  var UPS_OPTION_ATTR = 'data-cd-micro-profile-from-ups';

  function stripUpsInjectedOptions(select) {
    if (!select) return;
    var opts = select.querySelectorAll('option[' + UPS_OPTION_ATTR + ']');
    for (var i = 0; i < opts.length; i++) opts[i].parentNode.removeChild(opts[i]);
  }

  function injectUpsOption(select, value, labelText) {
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = labelText;
    opt.setAttribute(UPS_OPTION_ATTR, '1');
    select.appendChild(opt);
  }

  /** Match an existing option by value (case-insensitive for tier). */
  function findOptionValueCaseInsensitive(select, raw) {
    if (!select || raw == null || raw === '') return '';
    var want = String(raw).trim();
    if (!want) return '';
    var o = select.options;
    for (var i = 0; i < o.length; i++) {
      if (!o[i].value) continue;
      if (o[i].value === want) return o[i].value;
    }
    for (var j = 0; j < o.length; j++) {
      if (!o[j].value) continue;
      if (String(o[j].value).toLowerCase() === want.toLowerCase()) return o[j].value;
    }
    return '';
  }

  function setSelectFromProfileValue(select, raw, labelPrefix) {
    stripUpsInjectedOptions(select);
    if (!select) return;
    if (raw == null || raw === '') {
      select.value = '';
      return;
    }
    var str = typeof raw === 'number' && !Number.isNaN(raw) ? String(Math.round(raw)) : String(raw).trim();
    if (str === '') {
      select.value = '';
      return;
    }
    var matched = findOptionValueCaseInsensitive(select, str);
    if (matched) {
      select.value = matched;
      return;
    }
    injectUpsOption(select, str, (labelPrefix || str) + ' (from profile)');
    select.value = str;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function dispatchRangeRefresh(id) {
    var el = $(id);
    if (!el) return;
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) {}
  }

  /** Matches initial markup defaults when UPS is cleared or lookup fails. */
  var MICRO_RANGE_DEFAULTS = {
    cdMicroProfilePoints: '3000',
    cdMicroProfileChurn: '50',
    cdMicroProfilePropensity: '50',
    cdMicroProfileOrderValue: '500',
    cdMicroProfileNps: '5',
  };

  function resetMicroProfilePanelDefaults() {
    if (!$('cdMicroProfilePanel')) return;
    setSelectFromProfileValue($('cdMicroProfileLanguage'), '', '');
    setSelectFromProfileValue($('cdMicroProfileChannel'), '', '');
    var tierEl = $('cdMicroProfileTier');
    if (tierEl) tierEl.value = '0';
    setLoyaltyUiEnabled(false);
    for (var id in MICRO_RANGE_DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(MICRO_RANGE_DEFAULTS, id)) continue;
      var el = $(id);
      if (el) el.value = MICRO_RANGE_DEFAULTS[id];
    }
    dispatchRangeRefresh('cdMicroProfileTier');
    dispatchRangeRefresh('cdMicroProfilePoints');
    dispatchRangeRefresh('cdMicroProfilePropensity');
    dispatchRangeRefresh('cdMicroProfileChurn');
    dispatchRangeRefresh('cdMicroProfileOrderValue');
    dispatchRangeRefresh('cdMicroProfileNps');
    setMicroBaselineFromDom();
  }

  function hydrateMicroProfileFromUps() {
    if (!$('cdMicroProfilePanel')) return;
    var api = window.CdEdgeLive;
    if (!api || typeof api.getLastUpsClientData !== 'function') return;
    var clientData = api.getLastUpsClientData();
    var entity = extractEntityFromUps(clientData);
    if (!entity) return;

    var nps = readNpsFromEntity(entity);
    var npsEl = $('cdMicroProfileNps');
    if (npsEl) {
      if (nps != null && nps >= 0 && nps <= 10) {
        npsEl.value = String(clamp(Math.round(nps), 0, 10));
      } else {
        npsEl.value = MICRO_RANGE_DEFAULTS.cdMicroProfileNps;
      }
    }

    var lang = readLanguageFromEntity(entity);
    var langEl = $('cdMicroProfileLanguage');
    setSelectFromProfileValue(langEl, lang, lang);
    if (langEl && String(lang || '').trim() && !String(langEl.value || '').trim()) {
      var lq = String(lang).trim();
      stripUpsInjectedOptions(langEl);
      injectUpsOption(langEl, lq, lq + ' (from profile)');
      langEl.value = lq;
    }

    var chPref = readPreferredChannelFromEntity(entity);
    setSelectFromProfileValue($('cdMicroProfileChannel'), chPref, chPref);

    var inLoyalty = profileInLoyaltyScheme(entity);
    setLoyaltyUiEnabled(inLoyalty);

    var tierStr = readTierFromEntity(entity);
    var tierEl = $('cdMicroProfileTier');
    if (tierEl && inLoyalty) {
      tierEl.value = String(tierIndexFromMetalName(tierStr));
      syncTierDisplayFromSlider();
    }

    var pts = readPointsFromEntity(entity);
    var ptsEl = $('cdMicroProfilePoints');
    if (ptsEl) {
      if (inLoyalty) {
        if (pts != null && !Number.isNaN(pts)) {
          var pClamped = clamp(pts, Number(ptsEl.min) || 0, Number(ptsEl.max) || 10000);
          ptsEl.value = String(pClamped);
        } else {
          ptsEl.value = MICRO_RANGE_DEFAULTS.cdMicroProfilePoints;
        }
      } else {
        ptsEl.value = MICRO_RANGE_DEFAULTS.cdMicroProfilePoints;
      }
    }

    var pr = readPropensityFromEntity(entity);
    var prEl = $('cdMicroProfilePropensity');
    if (prEl) {
      if (pr != null && !Number.isNaN(pr)) {
        prEl.value = String(clamp(pr, Number(prEl.min) || 0, Number(prEl.max) || 100));
      } else {
        prEl.value = MICRO_RANGE_DEFAULTS.cdMicroProfilePropensity;
      }
    }

    var ch = readChurnFromEntity(entity);
    var chEl = $('cdMicroProfileChurn');
    if (chEl) {
      if (ch != null && !Number.isNaN(ch)) {
        chEl.value = String(clamp(ch, Number(chEl.min) || 0, Number(chEl.max) || 100));
      } else {
        chEl.value = MICRO_RANGE_DEFAULTS.cdMicroProfileChurn;
      }
    }

    var aov = readAvgOrderFromEntity(entity);
    var ovEl = $('cdMicroProfileOrderValue');
    if (ovEl) {
      if (aov != null && !Number.isNaN(aov)) {
        var step = Number(ovEl.step) || 50;
        var max = Number(ovEl.max) || 5000;
        var min = Number(ovEl.min) || 0;
        var snapped = Math.round(aov / step) * step;
        ovEl.value = String(clamp(snapped, min, max));
      } else {
        ovEl.value = MICRO_RANGE_DEFAULTS.cdMicroProfileOrderValue;
      }
    }

    dispatchRangeRefresh('cdMicroProfileTier');
    dispatchRangeRefresh('cdMicroProfilePoints');
    dispatchRangeRefresh('cdMicroProfilePropensity');
    dispatchRangeRefresh('cdMicroProfileChurn');
    dispatchRangeRefresh('cdMicroProfileOrderValue');
    dispatchRangeRefresh('cdMicroProfileNps');

    setMicroBaselineFromDom();
  }

  function strEq(a, b) {
    return String(a || '') === String(b || '');
  }

  function buildUpdates(form) {
    var base = microBaseline || {};
    var updates = [];

    if (microLoyaltyInScheme) {
      if (form.tier && !strEq(form.tier, base.tier)) {
        updates.push({ path: 'loyalty.tier', value: form.tier });
        updates.push({ path: 'loyaltyDetails.level', value: form.tier });
      }
      if (form.points != null && form.points !== '') {
        var pts = Number(form.points);
        if (!Number.isNaN(pts) && !strEq(form.points, base.points)) {
          updates.push({ path: 'loyalty.points', value: pts });
          updates.push({ path: 'loyaltyDetails.points', value: pts });
        }
      }
    }
    if (form.channel && !strEq(form.channel, base.channel)) {
      updates.push({ path: 'consents.marketing.preferred', value: form.channel });
    }
    if (form.propensity != null && form.propensity !== '') {
      var pr = Number(form.propensity);
      if (!Number.isNaN(pr) && !strEq(form.propensity, base.propensity)) {
        updates.push({ path: 'scoring.core.propensityScore', value: Math.round(pr) });
      }
    }
    if (form.churn != null && form.churn !== '') {
      var ch = Number(form.churn);
      if (!Number.isNaN(ch) && !strEq(form.churn, base.churn)) {
        updates.push({ path: 'scoring.churn.churnPrediction', value: Math.round(ch) });
      }
    }
    if (form.orderValue != null && form.orderValue !== '') {
      var ov = Number(form.orderValue);
      if (!Number.isNaN(ov) && !strEq(form.orderValue, base.orderValue)) {
        updates.push({ path: 'orderProfile.avgOrderSize', value: ov });
      }
    }
    if (form.nps != null && form.nps !== '') {
      var np = Math.round(Number(form.nps));
      if (!Number.isNaN(np) && !strEq(form.nps, base.nps)) {
        updates.push({ path: 'scoring.npsScore', value: np });
      }
    }
    if (form.language && !strEq(form.language, base.language)) {
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

  function formatIntScore(v) {
    var n = Number(v);
    if (Number.isNaN(n)) return '0';
    return String(Math.round(n));
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
    var tierElApply = $('cdMicroProfileTier');
    var form = {
      tier: microLoyaltyInScheme && tierElApply ? metalFromTierIndex(tierElApply.value) : '',
      points: microLoyaltyInScheme ? (($('cdMicroProfilePoints') || {}).value || '') : '',
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
    { id: 'cdMicroProfileNps', reverse: false },
  ];

  /** Loyalty tier slider (0–3): bronze / silver / gold / platinum using dash tokens only. */
  var TIER_SLIDER_COLORS = [
    'color-mix(in srgb, var(--dash-error-border) 38%, var(--dash-warning-border))',
    'color-mix(in srgb, var(--dash-muted) 45%, var(--dash-blue))',
    'var(--dash-warning-border)',
    'color-mix(in srgb, var(--dash-blue) 40%, var(--dash-info-text))',
  ];

  function pickSliderToken(pct, reverse) {
    if (pct < 0.34) return reverse ? '--dash-success-border' : '--dash-error-border';
    if (pct < 0.67) return '--dash-warning-border';
    return reverse ? '--dash-error-border' : '--dash-success-border';
  }

  function applySliderTint(input, reverse) {
    if (!input) return;
    if (input.disabled) {
      input.style.setProperty('--cd-slider-fill', 'var(--dash-input-border)');
      input.style.setProperty('--cd-slider-pct', '0%');
      return;
    }
    var min = Number(input.min);
    var max = Number(input.max);
    var val = Number(input.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(val)) return;
    var pct = Math.max(0, Math.min(1, (val - min) / (max - min)));
    var token = pickSliderToken(pct, !!reverse);
    input.style.setProperty('--cd-slider-fill', 'var(' + token + ')');
    input.style.setProperty('--cd-slider-pct', (pct * 100).toFixed(2) + '%');
  }

  function applyLoyaltyTierSliderTint(el) {
    if (!el) return;
    if (el.disabled) {
      el.style.setProperty('--cd-slider-fill', 'var(--dash-input-border)');
      el.style.setProperty('--cd-slider-pct', '0%');
      return;
    }
    var min = Number(el.min);
    var max = Number(el.max);
    var val = Number(el.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(val)) return;
    var pct = Math.max(0, Math.min(1, (val - min) / (max - min)));
    var ix = clamp(Math.round(val), 0, TIER_SLIDER_COLORS.length - 1);
    el.style.setProperty('--cd-slider-fill', TIER_SLIDER_COLORS[ix]);
    el.style.setProperty('--cd-slider-pct', (pct * 100).toFixed(2) + '%');
  }

  function wireRangeMirrors() {
    var tierIn = $('cdMicroProfileTier');
    if (tierIn) {
      var syncTierLbl = function () {
        if (!microLoyaltyInScheme) return;
        syncTierDisplayFromSlider();
      };
      tierIn.addEventListener('input', syncTierLbl);
      syncTierLbl();
      var syncTierTint = function () {
        applyLoyaltyTierSliderTint(tierIn);
      };
      tierIn.addEventListener('input', syncTierTint);
      syncTierTint();
    }
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
      var syncPr = function () { prLabel.textContent = formatIntScore(pr.value); };
      pr.addEventListener('input', syncPr);
      syncPr();
    }
    var ch = $('cdMicroProfileChurn');
    var chLabel = $('cdMicroProfileChurnValue');
    if (ch && chLabel) {
      var syncCh = function () { chLabel.textContent = formatIntScore(ch.value); };
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
    var nps = $('cdMicroProfileNps');
    var npsLabel = $('cdMicroProfileNpsValue');
    if (nps && npsLabel) {
      var syncNps = function () { npsLabel.textContent = formatIntScore(nps.value); };
      nps.addEventListener('input', syncNps);
      syncNps();
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

  function readSessionMicroProfileExpanded() {
    try {
      return sessionStorage.getItem(SESSION_EXPANDED_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function writeSessionMicroProfileExpanded(expanded) {
    try {
      sessionStorage.setItem(SESSION_EXPANDED_KEY, expanded ? '1' : '0');
    } catch (e) {}
  }

  function wireMicroProfileCollapse() {
    var panel = $('cdMicroProfilePanel');
    var toggle = $('cdMicroProfileToggle');
    if (!panel || !toggle) return;

    function setExpanded(expanded) {
      panel.classList.toggle('is-collapsed', !expanded);
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      writeSessionMicroProfileExpanded(expanded);
    }

    setExpanded(readSessionMicroProfileExpanded());

    toggle.addEventListener('click', function () {
      var collapsed = panel.classList.contains('is-collapsed');
      setExpanded(collapsed);
    });
  }

  function wireProfileStateWatchers() {
    window.addEventListener('cd-edge-profile-lookup', function (ev) {
      refreshStateDot();
      var d = ev && ev.detail;
      if (d && d.ok === false) {
        resetMicroProfilePanelDefaults();
        return;
      }
      if (isProfileLoaded()) hydrateMicroProfileFromUps();
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
    wireMicroProfileCollapse();
    wireRangeMirrors();
    wireProfileStateWatchers();
    var btn = $('cdMicroProfileApply');
    if (btn) btn.addEventListener('click', onApply);
    refreshStateDot();
    if (isProfileLoaded()) hydrateMicroProfileFromUps();
    else setMicroBaselineFromDom();
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
