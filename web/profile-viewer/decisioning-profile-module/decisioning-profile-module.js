/**
 * Reusable decisioning profile tweak module (brand-agnostic).
 * Markup + behaviour aligned with Decisioning lab (Edge) micro profile panel.
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260613';
  var LOG_PREFIX = '[decisioning-profile-module]';

  function extractEntityFromUps(clientData) {
    if (!clientData || typeof clientData !== 'object') return null;
    var root = clientData.platform_response != null ? clientData.platform_response : clientData;
    if (!root || typeof root !== 'object') return null;
    if (root.entity && typeof root.entity === 'object' && !Array.isArray(root.entity)) return root.entity;
    var keys = Object.keys(root).filter(function (k) {
      return k.charAt(0) !== '_';
    });
    if (!keys.length) return null;
    var bestKey = null;
    var bestScore = -1;
    for (var bi = 0; bi < keys.length; bi++) {
      var bk = keys[bi];
      var payload = root[bk];
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
      var score = 0;
      if (payload.entity != null && typeof payload.entity === 'object' && !Array.isArray(payload.entity)) score += 100;
      if (bk.indexOf('@') !== -1) score += 50;
      var subn = 0;
      for (var sk in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, sk) && sk.charAt(0) !== '_') subn++;
      }
      score += Math.min(40, subn * 4);
      if (score > bestScore) {
        bestScore = score;
        bestKey = bk;
      }
    }
    var chosenKey = bestKey != null ? bestKey : keys[0];
    var entityPayload = root[chosenKey];
    if (!entityPayload || typeof entityPayload !== 'object' || Array.isArray(entityPayload)) return null;
    var ent =
      entityPayload.entity != null && typeof entityPayload.entity === 'object' && !Array.isArray(entityPayload.entity)
        ? entityPayload.entity
        : entityPayload;
    return ent && typeof ent === 'object' && !Array.isArray(ent) ? ent : null;
  }

  function buildLanguageOptions() {
    return (
      '<option value="">— Unchanged —</option>' +
      '<option value="en-US">English (United States)</option>' +
      '<option value="en-GB">English (United Kingdom)</option>' +
      '<option value="en-CA">English (Canada)</option>' +
      '<option value="en-AU">English (Australia)</option>' +
      '<option value="fr-FR">French (France)</option>' +
      '<option value="fr-CA">French (Canada)</option>' +
      '<option value="de-DE">German (Germany)</option>' +
      '<option value="de-AT">German (Austria)</option>' +
      '<option value="de-CH">German (Switzerland)</option>' +
      '<option value="es-ES">Spanish (Spain)</option>' +
      '<option value="es-MX">Spanish (Mexico)</option>' +
      '<option value="it-IT">Italian (Italy)</option>' +
      '<option value="pt-PT">Portuguese (Portugal)</option>' +
      '<option value="pt-BR">Portuguese (Brazil)</option>' +
      '<option value="nl-NL">Dutch (Netherlands)</option>' +
      '<option value="da-DK">Danish (Denmark)</option>' +
      '<option value="sv-SE">Swedish (Sweden)</option>' +
      '<option value="no-NO">Norwegian (Norway)</option>' +
      '<option value="fi-FI">Finnish (Finland)</option>' +
      '<option value="pl-PL">Polish (Poland)</option>'
    );
  }

  function buildChannelOptions() {
    return (
      '<option value="">— Unchanged —</option>' +
      '<option value="email">email</option>' +
      '<option value="push">Push Notifications</option>' +
      '<option value="inApp">In-app Messages</option>' +
      '<option value="sms">SMS (Text Messages)</option>' +
      '<option value="whatsApp">WhatsApp Messages</option>' +
      '<option value="phone">Phone Calls</option>' +
      '<option value="phyMail">Physical Mail</option>' +
      '<option value="inVehicle">In-vehicle Messages</option>' +
      '<option value="inHome">In-home Messages</option>' +
      '<option value="iot">IoT Messages</option>' +
      '<option value="social">Social Media</option>' +
      '<option value="other">Other</option>' +
      '<option value="none">No Preferred Channel</option>' +
      '<option value="unknown">Unknown</option>'
    );
  }

  function buildMarkup() {
    return (
      '<div class="cd-hero-rail" aria-label="Decisioning controls">' +
      '<button type="button" class="primary cd-run-full-btn" id="cdMicroProfileRunBtn">Run content decision</button>' +
      '<section class="cd-micro-profile is-loyalty-disabled" id="cdMicroProfilePanel" aria-label="Tweak profile">' +
      '<button type="button" class="cd-micro-profile-toggle" id="cdMicroProfileToggle" aria-expanded="true" aria-controls="cdMicroProfileBody">' +
      '<span class="cd-micro-profile-toggle-cluster">' +
      '<span class="cd-micro-profile-state" id="cdMicroProfileState" data-loaded="false">' +
      '<span class="cd-micro-profile-state-dot" aria-hidden="true"></span>' +
      '<span class="cd-micro-profile-state-label">No profile loaded</span>' +
      '</span></span>' +
      '<span class="cd-micro-profile-toggle-title">Tweak profile</span>' +
      '<span class="cd-micro-profile-chevron" aria-hidden="true"></span>' +
      '</button>' +
      '<div id="cdMicroProfileBody" class="cd-micro-profile-body">' +
      '<div class="cd-micro-profile-field">' +
      '<div class="cd-micro-profile-range-row"><label for="cdMicroProfileChurn">Churn risk</label><strong id="cdMicroProfileChurnValue">50</strong></div>' +
      '<input type="range" id="cdMicroProfileChurn" min="0" max="100" step="1" value="50">' +
      '</div>' +
      '<div class="cd-micro-profile-field">' +
      '<div class="cd-micro-profile-range-row"><label for="cdMicroProfilePropensity">Propensity score</label><strong id="cdMicroProfilePropensityValue">50</strong></div>' +
      '<input type="range" id="cdMicroProfilePropensity" min="0" max="100" step="1" value="50">' +
      '</div>' +
      '<div class="cd-micro-profile-field">' +
      '<div class="cd-micro-profile-range-row"><label for="cdMicroProfileOrderValue">Order value</label><strong id="cdMicroProfileOrderValueDisplay">$500</strong></div>' +
      '<input type="range" id="cdMicroProfileOrderValue" min="0" max="10000" step="50" value="500">' +
      '</div>' +
      '<div class="cd-micro-profile-field cd-micro-profile-field--loyalty-tier">' +
      '<div class="cd-micro-profile-range-row"><label for="cdMicroProfileTier">Loyalty tier</label>' +
      '<strong id="cdMicroProfileTierValue" class="cd-micro-profile-tier-label cd-micro-profile-tier-label--na">N/A</strong></div>' +
      '<input type="range" id="cdMicroProfileTier" min="0" max="3" step="1" value="0" disabled aria-disabled="true">' +
      '</div>' +
      '<div class="cd-micro-profile-field cd-micro-profile-field--loyalty-points">' +
      '<div class="cd-micro-profile-range-row"><label for="cdMicroProfilePoints">Loyalty points</label><strong id="cdMicroProfilePointsValue">3000</strong></div>' +
      '<input type="range" id="cdMicroProfilePoints" min="0" max="10000" step="100" value="3000" disabled aria-disabled="true">' +
      '</div>' +
      '<div class="cd-micro-profile-field">' +
      '<div class="cd-micro-profile-range-row"><label for="cdMicroProfileNps">NPS score</label><strong id="cdMicroProfileNpsValue">5</strong></div>' +
      '<input type="range" id="cdMicroProfileNps" min="0" max="10" step="1" value="5">' +
      '</div>' +
      '<div class="cd-micro-profile-field"><label for="cdMicroProfileLanguage">Language preference</label>' +
      '<select id="cdMicroProfileLanguage">' +
      buildLanguageOptions() +
      '</select></div>' +
      '<div class="cd-micro-profile-field"><label for="cdMicroProfileChannel">Preferred channel</label>' +
      '<select id="cdMicroProfileChannel" aria-label="Preferred marketing channel">' +
      buildChannelOptions() +
      '</select></div>' +
      '<div class="cd-micro-profile-actions">' +
      '<button type="button" class="cd-micro-profile-apply" id="cdMicroProfileApply">Apply</button>' +
      '<p class="cd-micro-profile-status" id="cdMicroProfileStatus" aria-live="polite"></p>' +
      '</div></div></section>' +
      '<p class="cd-micro-profile-pipeline" id="cdMicroProfilePipeline" aria-live="polite"></p>' +
      '</div>'
    );
  }

  function mount(container, options) {
    if (!container) return null;
    var opt = options || {};
    container.classList.add('decisioning-profile-module');
    container.innerHTML = buildMarkup();

    function $(id) {
      return document.getElementById(id);
    }

    var profileApi = opt.profileApi || {};
    var getNamespace = opt.getNamespace || function () {
      return 'email';
    };
    var getIdentifierValue = opt.getIdentifierValue || function () {
      return '';
    };
    var getSandboxName = opt.getSandboxName || function () {
      return '';
    };

    var microBaseline = null;
    var microLoyaltyInScheme = false;
    var streamingCache = Object.create(null);
    var MICRO_RANGE_DEFAULTS = {
      cdMicroProfilePoints: '3000',
      cdMicroProfileChurn: '50',
      cdMicroProfilePropensity: '50',
      cdMicroProfileOrderValue: '500',
      cdMicroProfileNps: '5',
    };
    var LOYALTY_METAL_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];
    var UPS_OPTION_ATTR = 'data-cd-micro-profile-from-ups';
    var SLIDER_TINT_CONFIG = [
      { id: 'cdMicroProfileChurn', reverse: true },
      { id: 'cdMicroProfilePropensity', reverse: false },
      { id: 'cdMicroProfileOrderValue', reverse: false },
      { id: 'cdMicroProfilePoints', reverse: false },
      { id: 'cdMicroProfileNps', reverse: false },
    ];
    var TIER_SLIDER_COLORS = [
      'color-mix(in srgb, var(--dash-error-border) 38%, var(--dash-warning-border))',
      'color-mix(in srgb, var(--dash-muted) 45%, var(--dash-blue))',
      'var(--dash-warning-border)',
      'color-mix(in srgb, var(--dash-blue) 40%, var(--dash-info-text))',
    ];

    function clamp(n, lo, hi) {
      return Math.max(lo, Math.min(hi, n));
    }

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

    function readNumberFrom(entity, reader) {
      var out = null;
      eachProfileSlice(entity, function (sl) {
        if (out != null) return;
        out = reader(sl);
      });
      return out;
    }

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

    function normalizeLanguageTagForSelect(s) {
      var t = String(s || '').trim().replace(/_/g, '-');
      if (!t) return '';
      var parts = t.split('-').filter(function (seg) {
        return !!seg;
      });
      if (!parts.length) return '';
      var out = [parts[0].toLowerCase()];
      for (var i = 1; i < parts.length; i++) {
        var seg = parts[i];
        if (seg.length === 2 && /^[A-Za-z]{2}$/.test(seg)) out.push(seg.toUpperCase());
        else out.push(seg);
      }
      return out.join('-');
    }

    function readLanguageFromSlice(sl) {
      if (!sl || typeof sl !== 'object') return '';
      var pr = sl.preferences;
      if (pr && typeof pr === 'object') {
        var fromPr = coerceLanguageScalar(pr.preferredLanguage);
        if (fromPr) return fromPr;
      }
      var pe = sl.personalEmail;
      if (pe && typeof pe === 'object') {
        var fromPe = coerceLanguageScalar(pe.language);
        if (fromPe) return fromPe;
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
        if (m.preferred != null && m.preferred !== '') out = String(m.preferred).trim();
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

    function profileInLoyaltyScheme(entity, drawerProfile) {
      if (drawerProfile && drawerProfile.loyaltyStatus && String(drawerProfile.loyaltyStatus).trim()) return true;
      if (!entity || typeof entity !== 'object') return false;
      var t = readTierFromEntity(entity);
      if (t && String(t).trim()) return true;
      var p = readPointsFromEntity(entity);
      return p != null && !Number.isNaN(p);
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

    function getDrawerProfile() {
      if (typeof global.DemoProfileDrawer === 'undefined') return null;
      if (typeof global.DemoProfileDrawer.getLastLookedUpProfile !== 'function') return null;
      return global.DemoProfileDrawer.getLastLookedUpProfile();
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
      return '';
    }

    function resolveStreamingEmail(ns, idValue) {
      if (ns === 'email' && idValue) return idValue;
      if (typeof profileApi.getLastUpsClientData === 'function') {
        var entity = extractEntityFromUps(profileApi.getLastUpsClientData());
        var em = extractEmailFromEntity(entity);
        if (em) return em;
      }
      var drawer = getDrawerProfile();
      if (drawer && drawer.email) return String(drawer.email).trim();
      return '';
    }

    function resolveEcid() {
      if (typeof profileApi.getLastProfileEcid === 'function') {
        var v = profileApi.getLastProfileEcid();
        if (v) return String(v).trim();
      }
      var drawer = getDrawerProfile();
      if (drawer && drawer.ecid) return String(drawer.ecid).trim();
      return '';
    }

    function isProfileLoaded() {
      if (typeof profileApi.getLastUpsClientData === 'function' && profileApi.getLastUpsClientData()) return true;
      var drawer = getDrawerProfile();
      return !!(drawer && (drawer.propensityScore != null || drawer.churnPrediction != null || drawer.email));
    }

    function refreshStateDot() {
      var el = $('cdMicroProfileState');
      if (!el) return;
      var loaded = isProfileLoaded();
      var labelEl = el.querySelector('.cd-micro-profile-state-label');
      el.setAttribute('data-loaded', loaded ? 'true' : 'false');
      el.setAttribute('aria-label', loaded ? 'Profile ready' : 'No profile loaded');
      if (labelEl) labelEl.textContent = loaded ? 'Profile ready' : 'No profile loaded';
    }

    function snapshotMicroForm() {
      return {
        tier: microLoyaltyInScheme && $('cdMicroProfileTier') ? metalFromTierIndex($('cdMicroProfileTier').value) : '',
        points: microLoyaltyInScheme && $('cdMicroProfilePoints') ? $('cdMicroProfilePoints').value : '',
        channel: $('cdMicroProfileChannel') ? $('cdMicroProfileChannel').value : '',
        propensity: $('cdMicroProfilePropensity') ? $('cdMicroProfilePropensity').value : '',
        churn: $('cdMicroProfileChurn') ? $('cdMicroProfileChurn').value : '',
        orderValue: $('cdMicroProfileOrderValue') ? $('cdMicroProfileOrderValue').value : '',
        nps: $('cdMicroProfileNps') ? $('cdMicroProfileNps').value : '',
        language: $('cdMicroProfileLanguage') ? $('cdMicroProfileLanguage').value : '',
      };
    }

    function setMicroBaselineFromDom() {
      microBaseline = snapshotMicroForm();
    }

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

    function findOptionValueLoose(select, raw) {
      if (!select || raw == null || raw === '') return '';
      var want = String(raw).trim();
      if (!want) return '';
      var matched = findOptionValueCaseInsensitive(select, want);
      if (matched) return matched;
      var wantLo = want.toLowerCase();
      var o = select.options;
      for (var k = 0; k < o.length; k++) {
        if (!o[k].value) continue;
        var lab = String(o[k].textContent || '').trim().toLowerCase();
        if (lab && lab === wantLo) return o[k].value;
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
      if (select.id === 'cdMicroProfileLanguage') str = normalizeLanguageTagForSelect(str);
      var matched =
        select.id === 'cdMicroProfileLanguage' ? findOptionValueLoose(select, str) : findOptionValueCaseInsensitive(select, str);
      if (matched) {
        select.value = matched;
        return;
      }
      injectUpsOption(select, str, (labelPrefix || str) + ' (from profile)');
      select.value = str;
    }

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

    function formatIntScore(v) {
      var n = Math.round(Number(v));
      return Number.isFinite(n) ? String(n) : '0';
    }

    function formatPoints(v) {
      var n = Math.round(Number(v));
      return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
    }

    function formatMoney(v) {
      var n = Math.round(Number(v) || 0);
      return '$' + n.toLocaleString('en-US');
    }

    function dispatchRangeRefresh(id) {
      var el = $(id);
      if (!el) return;
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_e) {}
    }

    function hydrateFromProfile() {
      var drawer = getDrawerProfile();
      var entity = null;
      if (typeof profileApi.getLastUpsClientData === 'function') {
        entity = extractEntityFromUps(profileApi.getLastUpsClientData());
      }

      var nps =
        drawer && drawer.npsScore != null && drawer.npsScore !== ''
          ? Number(drawer.npsScore)
          : entity
            ? readNpsFromEntity(entity)
            : null;
      var npsEl = $('cdMicroProfileNps');
      if (npsEl) {
        npsEl.value =
          nps != null && !Number.isNaN(nps) ? String(clamp(Math.round(nps), 0, 10)) : MICRO_RANGE_DEFAULTS.cdMicroProfileNps;
      }

      var lang = entity ? readLanguageFromEntity(entity) : '';
      setSelectFromProfileValue($('cdMicroProfileLanguage'), lang, lang);

      var chPref =
        drawer && drawer.preferredMarketingChannel
          ? drawer.preferredMarketingChannel
          : entity
            ? readPreferredChannelFromEntity(entity)
            : '';
      setSelectFromProfileValue($('cdMicroProfileChannel'), chPref, chPref);

      var inLoyalty = profileInLoyaltyScheme(entity, drawer);
      setLoyaltyUiEnabled(inLoyalty);

      var tierStr =
        drawer && drawer.loyaltyStatus ? String(drawer.loyaltyStatus).trim() : entity ? readTierFromEntity(entity) : '';
      var tierEl = $('cdMicroProfileTier');
      if (tierEl && inLoyalty) {
        tierEl.value = String(tierIndexFromMetalName(tierStr));
        syncTierDisplayFromSlider();
      }

      var ptsEl = $('cdMicroProfilePoints');
      if (ptsEl) {
        if (inLoyalty) {
          var pts = entity ? readPointsFromEntity(entity) : null;
          if (pts != null && !Number.isNaN(pts)) {
            ptsEl.value = String(clamp(pts, Number(ptsEl.min) || 0, Number(ptsEl.max) || 10000));
          } else {
            ptsEl.value = MICRO_RANGE_DEFAULTS.cdMicroProfilePoints;
          }
        } else {
          ptsEl.value = MICRO_RANGE_DEFAULTS.cdMicroProfilePoints;
        }
      }

      var pr =
        drawer && drawer.propensityScore != null && drawer.propensityScore !== ''
          ? Number(drawer.propensityScore)
          : entity
            ? readPropensityFromEntity(entity)
            : null;
      var prEl = $('cdMicroProfilePropensity');
      if (prEl) {
        prEl.value =
          pr != null && !Number.isNaN(pr)
            ? String(clamp(Math.round(pr), Number(prEl.min) || 0, Number(prEl.max) || 100))
            : MICRO_RANGE_DEFAULTS.cdMicroProfilePropensity;
      }

      var ch =
        drawer && drawer.churnPrediction != null && drawer.churnPrediction !== ''
          ? Number(drawer.churnPrediction)
          : entity
            ? readChurnFromEntity(entity)
            : null;
      var chEl = $('cdMicroProfileChurn');
      if (chEl) {
        chEl.value =
          ch != null && !Number.isNaN(ch)
            ? String(clamp(Math.round(ch), Number(chEl.min) || 0, Number(chEl.max) || 100))
            : MICRO_RANGE_DEFAULTS.cdMicroProfileChurn;
      }

      var aov = entity ? readAvgOrderFromEntity(entity) : null;
      var ovEl = $('cdMicroProfileOrderValue');
      if (ovEl) {
        if (aov != null && !Number.isNaN(aov)) {
          var step = Number(ovEl.step) || 50;
          var max = Number(ovEl.max) || 10000;
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
      refreshStateDot();
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
        updates.push({ path: 'preferences.preferredLanguage', value: form.language });
        updates.push({ path: 'personalEmail.language', value: form.language });
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

    function setPipeline(msg, kind) {
      var el = $('cdMicroProfilePipeline');
      if (!el) return;
      el.textContent = msg || '';
      el.classList.remove('is-error', 'is-ok');
      if (kind === 'error') el.classList.add('is-error');
      else if (kind === 'ok') el.classList.add('is-ok');
    }

    async function fetchStreamingForSandbox(sandbox) {
      var key = sandbox || '__default__';
      if (Object.prototype.hasOwnProperty.call(streamingCache, key)) return streamingCache[key];
      var qs = sandbox ? '?sandbox=' + encodeURIComponent(sandbox) : '';
      try {
        var res = await fetch('/api/generic-profile-connection' + qs);
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok || data.ok === false) {
          streamingCache[key] = { error: data.error || 'Streaming connection lookup failed.' };
          return streamingCache[key];
        }
        var rec = data.record;
        var streaming = rec && rec.streaming && typeof rec.streaming === 'object' ? rec.streaming : null;
        if (!streaming || !streaming.url || !streaming.flowId) {
          streamingCache[key] = {
            error: 'No saved streaming connection for this sandbox. Configure on Profile Generation first.',
          };
          return streamingCache[key];
        }
        streamingCache[key] = { streaming: streaming };
        return streamingCache[key];
      } catch (e) {
        streamingCache[key] = { error: String(e && e.message ? e.message : e) };
        return streamingCache[key];
      }
    }

    async function onApply() {
      var btn = $('cdMicroProfileApply');
      if (!btn) return;
      refreshStateDot();
      var ns = getNamespace();
      var idVal = getIdentifierValue();
      if (!idVal) {
        setStatus('Enter a profile identifier first.', 'error');
        return;
      }
      var streamingEmail = resolveStreamingEmail(ns, idVal);
      if (!streamingEmail) {
        setStatus('No email available — look up profile or use Email namespace.', 'error');
        return;
      }
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
      if (typeof global.postProfileUpdate !== 'function') {
        setStatus('Profile streaming helper not loaded.', 'error');
        return;
      }
      btn.disabled = true;
      setStatus('Applying…');
      try {
        var streamingResolved = await fetchStreamingForSandbox(getSandboxName());
        if (streamingResolved.error) {
          setStatus(streamingResolved.error, 'error');
          return;
        }
        var result = await global.postProfileUpdate({
          email: streamingEmail,
          ecid: resolveEcid() || undefined,
          updates: updates,
          sandbox: getSandboxName() || undefined,
          streaming: streamingResolved.streaming,
        });
        if (!result || !result.ok) {
          var msg =
            typeof global.formatProfileUpdateError === 'function' && result && result.data
              ? global.formatProfileUpdateError(result.data)
              : (result && result.data && (result.data.error || result.data.message)) || 'Update failed.';
          setStatus(msg, 'error');
          return;
        }
        setStatus('Updated. Re-run decision to see new result.', 'ok');
        setMicroBaselineFromDom();
      } catch (e) {
        setStatus(String(e && e.message ? e.message : e), 'error');
      } finally {
        btn.disabled = false;
      }
    }

    function wireRangeMirrors() {
      var tierIn = $('cdMicroProfileTier');
      if (tierIn) {
        tierIn.addEventListener('input', function () {
          if (!microLoyaltyInScheme) return;
          syncTierDisplayFromSlider();
          applyLoyaltyTierSliderTint(tierIn);
        });
        if (microLoyaltyInScheme) applyLoyaltyTierSliderTint(tierIn);
      }
      var pts = $('cdMicroProfilePoints');
      if (pts && $('cdMicroProfilePointsValue')) {
        var syncPts = function () {
          $('cdMicroProfilePointsValue').textContent = formatPoints(pts.value);
        };
        pts.addEventListener('input', syncPts);
        syncPts();
      }
      var pr = $('cdMicroProfilePropensity');
      if (pr && $('cdMicroProfilePropensityValue')) {
        var syncPr = function () {
          $('cdMicroProfilePropensityValue').textContent = formatIntScore(pr.value);
        };
        pr.addEventListener('input', syncPr);
        syncPr();
      }
      var ch = $('cdMicroProfileChurn');
      if (ch && $('cdMicroProfileChurnValue')) {
        var syncCh = function () {
          $('cdMicroProfileChurnValue').textContent = formatIntScore(ch.value);
        };
        ch.addEventListener('input', syncCh);
        syncCh();
      }
      var ov = $('cdMicroProfileOrderValue');
      if (ov && $('cdMicroProfileOrderValueDisplay')) {
        var syncOv = function () {
          $('cdMicroProfileOrderValueDisplay').textContent = formatMoney(ov.value);
        };
        ov.addEventListener('input', syncOv);
        syncOv();
      }
      var nps = $('cdMicroProfileNps');
      if (nps && $('cdMicroProfileNpsValue')) {
        var syncNps = function () {
          $('cdMicroProfileNpsValue').textContent = formatIntScore(nps.value);
        };
        nps.addEventListener('input', syncNps);
        syncNps();
      }
      SLIDER_TINT_CONFIG.forEach(function (cfg) {
        var input = $(cfg.id);
        if (!input) return;
        var sync = function () {
          applySliderTint(input, cfg.reverse);
        };
        input.addEventListener('input', sync);
        sync();
      });
    }

    var toggle = $('cdMicroProfileToggle');
    var panel = $('cdMicroProfilePanel');
    if (toggle && panel) {
      toggle.addEventListener('click', function () {
        var collapsed = panel.classList.contains('is-collapsed');
        panel.classList.toggle('is-collapsed', !collapsed);
        toggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
        if (collapsed && isProfileLoaded()) hydrateFromProfile();
      });
    }

    var runBtn = $('cdMicroProfileRunBtn');
    if (runBtn) {
      runBtn.addEventListener('click', async function () {
        if (runBtn.disabled) return;
        runBtn.disabled = true;
        setPipeline('Starting…');
        try {
          if (typeof profileApi.runContentDecision === 'function') {
            await profileApi.runContentDecision();
            setPipeline('Done — check Top Ribbon, Hero, and Content Card on the snapshot.', 'ok');
          } else {
            setPipeline('Decisioning runtime not configured.', 'error');
          }
        } catch (e) {
          setPipeline(String(e && e.message ? e.message : e), 'error');
        } finally {
          runBtn.disabled = false;
        }
      });
    }

    var applyBtn = $('cdMicroProfileApply');
    if (applyBtn) applyBtn.addEventListener('click', onApply);

    wireRangeMirrors();
    setMicroBaselineFromDom();
    refreshStateDot();

    global.addEventListener('decisioning-profile-updated', function (ev) {
      refreshStateDot();
      if (ev && ev.detail && ev.detail.ok) hydrateFromProfile();
    });

    return { refresh: refreshStateDot, hydrate: hydrateFromProfile };
  }

  global.DecisioningProfileModule = {
    CACHE_BUST: CACHE_BUST,
    mount: mount,
    extractEntityFromUps: extractEntityFromUps,
  };
})(typeof window !== 'undefined' ? window : globalThis);
