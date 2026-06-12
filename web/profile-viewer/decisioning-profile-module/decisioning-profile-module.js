/**
 * Reusable decisioning profile tweak module (brand-agnostic).
 * Mirrors Decisioning lab (Edge) micro profile + run content decision.
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260612';
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

  var LANGUAGE_OPTIONS =
    '<option value="">— Unchanged —</option>' +
    '<option value="en-US">English (United States)</option>' +
    '<option value="en-GB">English (United Kingdom)</option>' +
    '<option value="en-CA">English (Canada)</option>' +
    '<option value="fr-FR">French (France)</option>' +
    '<option value="de-DE">German (Germany)</option>' +
    '<option value="es-ES">Spanish (Spain)</option>' +
    '<option value="it-IT">Italian (Italy)</option>' +
    '<option value="nl-NL">Dutch (Netherlands)</option>';

  var CHANNEL_OPTIONS =
    '<option value="">— Unchanged —</option>' +
    '<option value="email">email</option>' +
    '<option value="push">Push Notifications</option>' +
    '<option value="sms">SMS (Text Messages)</option>' +
    '<option value="phone">Phone Calls</option>' +
    '<option value="none">No Preferred Channel</option>';

  function buildMarkup(prefix) {
    var p = prefix || 'dpm';
    return (
      '<button type="button" class="dpm-run-btn" id="' +
      p +
      'RunBtn">Run content decision</button>' +
      '<section class="dpm-micro-profile is-collapsed" id="' +
      p +
      'Panel" aria-label="Tweak profile">' +
      '<button type="button" class="dpm-micro-profile-toggle" id="' +
      p +
      'Toggle" aria-expanded="false" aria-controls="' +
      p +
      'Body">' +
      '<span class="dpm-micro-profile-toggle-cluster">' +
      '<span class="dpm-micro-profile-state" id="' +
      p +
      'State" data-loaded="false">' +
      '<span class="dpm-micro-profile-state-dot" aria-hidden="true"></span>' +
      '<span class="dpm-micro-profile-state-label">No profile loaded</span>' +
      '</span></span>' +
      '<span class="dpm-micro-profile-toggle-title">Tweak profile</span>' +
      '<span class="dpm-micro-profile-chevron" aria-hidden="true"></span>' +
      '</button>' +
      '<div id="' +
      p +
      'Body" class="dpm-micro-profile-body">' +
      rangeField(p, 'Churn', 'Churn risk', 0, 100, 1, 50) +
      rangeField(p, 'Propensity', 'Propensity score', 0, 100, 1, 50) +
      rangeField(p, 'OrderValue', 'Order value', 0, 10000, 50, 500, 'OrderValueDisplay', true) +
      '<div class="dpm-micro-profile-field dpm-field--loyalty">' +
      rangeRow(p, 'Tier', 'Loyalty tier', 'N/A') +
      '<input type="range" id="' +
      p +
      'Tier" min="0" max="3" step="1" value="0" disabled aria-disabled="true">' +
      '</div>' +
      '<div class="dpm-micro-profile-field dpm-field--loyalty">' +
      rangeRow(p, 'Points', 'Loyalty points', '3000') +
      '<input type="range" id="' +
      p +
      'Points" min="0" max="10000" step="100" value="3000" disabled aria-disabled="true">' +
      '</div>' +
      rangeField(p, 'Nps', 'NPS score', 0, 10, 1, 5) +
      '<div class="dpm-micro-profile-field"><label for="' +
      p +
      'Language">Language preference</label><select id="' +
      p +
      'Language">' +
      LANGUAGE_OPTIONS +
      '</select></div>' +
      '<div class="dpm-micro-profile-field"><label for="' +
      p +
      'Channel">Preferred channel</label><select id="' +
      p +
      'Channel" aria-label="Preferred marketing channel">' +
      CHANNEL_OPTIONS +
      '</select></div>' +
      '<div class="dpm-micro-profile-actions">' +
      '<button type="button" class="dpm-micro-profile-apply" id="' +
      p +
      'Apply">Apply</button>' +
      '<p class="dpm-micro-profile-status" id="' +
      p +
      'Status" aria-live="polite"></p>' +
      '</div></div></section>' +
      '<p class="dpm-pipeline-status" id="' +
      p +
      'Pipeline" aria-live="polite"></p>'
    );
  }

  function rangeRow(prefix, name, label, displayDefault) {
    return (
      '<div class="dpm-micro-profile-range-row">' +
      '<label for="' +
      prefix +
      name +
      '">' +
      label +
      '</label>' +
      '<strong id="' +
      prefix +
      name +
      'Value">' +
      displayDefault +
      '</strong></div>'
    );
  }

  function rangeField(prefix, name, label, min, max, step, value, displayId, money) {
    var disp = displayId || name + 'Value';
    var dispVal = money ? '$' + value : String(value);
    return (
      '<div class="dpm-micro-profile-field">' +
      '<div class="dpm-micro-profile-range-row"><label for="' +
      prefix +
      name +
      '">' +
      label +
      '</label><strong id="' +
      prefix +
      disp +
      '">' +
      dispVal +
      '</strong></div>' +
      '<input type="range" id="' +
      prefix +
      name +
      '" min="' +
      min +
      '" max="' +
      max +
      '" step="' +
      step +
      '" value="' +
      value +
      '"></div>'
    );
  }

  function mount(container, options) {
    if (!container) return null;
    var opt = options || {};
    var prefix = String(opt.idPrefix || 'dpm');
    container.classList.add('decisioning-profile-module');
    container.innerHTML = buildMarkup(prefix);

    function $(suffix) {
      return document.getElementById(prefix + suffix);
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
    var RANGE_DEFAULTS = { Points: '3000', Churn: '50', Propensity: '50', OrderValue: '500', Nps: '5' };
    var LOYALTY_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];

    function clamp(n, lo, hi) {
      return Math.max(lo, Math.min(hi, n));
    }

    function metalFromTierIndex(ix) {
      var i = Math.round(Number(ix));
      if (!Number.isFinite(i)) return LOYALTY_TIERS[0];
      return LOYALTY_TIERS[clamp(i, 0, LOYALTY_TIERS.length - 1)];
    }

    function tierIndexFromMetalName(raw) {
      if (raw == null || raw === '') return 0;
      var s = String(raw).trim().toLowerCase();
      for (var i = 0; i < LOYALTY_TIERS.length; i++) {
        if (LOYALTY_TIERS[i].toLowerCase() === s) return i;
      }
      return 0;
    }

    function eachProfileSlice(entity, fn) {
      if (!entity || typeof entity !== 'object') return;
      fn(entity);
      var keys = ['_tenant', '_experience', '_retail'];
      for (var k = 0; k < keys.length; k++) {
        if (entity[keys[k]] && typeof entity[keys[k]] === 'object') fn(entity[keys[k]]);
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

    function readTierFromEntity(entity) {
      return readNumberFrom(entity, function (sl) {
        if (sl.loyalty && sl.loyalty.tier) return String(sl.loyalty.tier);
        if (sl.loyaltyDetails && sl.loyaltyDetails.level) return String(sl.loyaltyDetails.level);
        return null;
      });
    }

    function readPointsFromEntity(entity) {
      var out = readNumberFrom(entity, function (sl) {
        if (sl.loyalty && sl.loyalty.points != null) return Number(sl.loyalty.points);
        if (sl.loyaltyDetails && sl.loyaltyDetails.points != null) return Number(sl.loyaltyDetails.points);
        return null;
      });
      return out != null && !Number.isNaN(out) ? Math.round(out) : null;
    }

    function profileInLoyaltyScheme(entity) {
      var t = readTierFromEntity(entity);
      if (t && String(t).trim()) return true;
      var p = readPointsFromEntity(entity);
      return p != null && !Number.isNaN(p);
    }

    function readPropensityFromEntity(entity) {
      return readNumberFrom(entity, function (sl) {
        if (sl.scoring && sl.scoring.core && sl.scoring.core.propensityScore != null) {
          return Math.round(Number(sl.scoring.core.propensityScore));
        }
        return null;
      });
    }

    function readChurnFromEntity(entity) {
      return readNumberFrom(entity, function (sl) {
        if (sl.scoring && sl.scoring.churn) {
          var raw = sl.scoring.churn.churnPrediction != null ? sl.scoring.churn.churnPrediction : sl.scoring.churn.churnScore;
          if (raw != null && raw !== '') return Math.round(Number(raw));
        }
        return null;
      });
    }

    function readAvgOrderFromEntity(entity) {
      return readNumberFrom(entity, function (sl) {
        if (sl.orderProfile && sl.orderProfile.avgOrderSize != null) return Number(sl.orderProfile.avgOrderSize);
        return null;
      });
    }

    function readNpsFromEntity(entity) {
      return readNumberFrom(entity, function (sl) {
        if (sl.scoring && sl.scoring.npsScore != null) return Math.round(Number(sl.scoring.npsScore));
        return null;
      });
    }

    function readLanguageFromEntity(entity) {
      return readNumberFrom(entity, function (sl) {
        if (sl.preferences && sl.preferences.preferredLanguage) return String(sl.preferences.preferredLanguage);
        if (sl.personalEmail && sl.personalEmail.language) return String(sl.personalEmail.language);
        return null;
      });
    }

    function readPreferredChannelFromEntity(entity) {
      return readNumberFrom(entity, function (sl) {
        if (sl.consents && sl.consents.marketing && sl.consents.marketing.preferred) {
          return String(sl.consents.marketing.preferred);
        }
        return null;
      });
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
      return '';
    }

    function resolveEcid() {
      if (typeof profileApi.getLastProfileEcid === 'function') {
        var v = profileApi.getLastProfileEcid();
        if (v) return String(v).trim();
      }
      return '';
    }

    function isProfileLoaded() {
      if (typeof profileApi.getLastUpsClientData !== 'function') return false;
      return !!profileApi.getLastUpsClientData();
    }

    function refreshStateDot() {
      var el = $('State');
      if (!el) return;
      var loaded = isProfileLoaded();
      var labelEl = el.querySelector('.dpm-micro-profile-state-label');
      el.setAttribute('data-loaded', loaded ? 'true' : 'false');
      el.setAttribute('aria-label', loaded ? 'Profile loaded' : 'No profile loaded');
      if (labelEl) labelEl.textContent = loaded ? 'Profile ready' : 'No profile loaded';
    }

    function snapshotMicroForm() {
      return {
        tier: microLoyaltyInScheme && $('Tier') ? metalFromTierIndex($('Tier').value) : '',
        points: microLoyaltyInScheme && $('Points') ? $('Points').value : '',
        channel: $('Channel') ? $('Channel').value : '',
        propensity: $('Propensity') ? $('Propensity').value : '',
        churn: $('Churn') ? $('Churn').value : '',
        orderValue: $('OrderValue') ? $('OrderValue').value : '',
        nps: $('Nps') ? $('Nps').value : '',
        language: $('Language') ? $('Language').value : '',
      };
    }

    function setMicroBaselineFromDom() {
      microBaseline = snapshotMicroForm();
    }

    function setSelectFromProfileValue(select, raw) {
      if (!select) return;
      if (raw == null || raw === '') {
        select.value = '';
        return;
      }
      var str = String(raw).trim();
      var matched = '';
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === str) matched = str;
      }
      select.value = matched || '';
    }

    function setLoyaltyUiEnabled(inScheme) {
      microLoyaltyInScheme = !!inScheme;
      var panel = $('Panel');
      if (panel) panel.classList.toggle('is-loyalty-disabled', !inScheme);
      var tierEl = $('Tier');
      var ptsEl = $('Points');
      var tierLabel = $('TierValue');
      if (tierEl) {
        tierEl.disabled = !inScheme;
        tierEl.setAttribute('aria-disabled', inScheme ? 'false' : 'true');
      }
      if (ptsEl) {
        ptsEl.disabled = !inScheme;
        ptsEl.setAttribute('aria-disabled', inScheme ? 'false' : 'true');
      }
      if (tierLabel) {
        tierLabel.textContent = inScheme ? metalFromTierIndex(tierEl ? tierEl.value : 0) : 'N/A';
      }
    }

    function hydrateFromUps() {
      if (typeof profileApi.getLastUpsClientData !== 'function') return;
      var entity = extractEntityFromUps(profileApi.getLastUpsClientData());
      if (!entity) return;
      var nps = readNpsFromEntity(entity);
      if ($('Nps')) $('Nps').value = nps != null ? String(clamp(nps, 0, 10)) : RANGE_DEFAULTS.Nps;
      setSelectFromProfileValue($('Language'), readLanguageFromEntity(entity));
      setSelectFromProfileValue($('Channel'), readPreferredChannelFromEntity(entity));
      var inLoyalty = profileInLoyaltyScheme(entity);
      setLoyaltyUiEnabled(inLoyalty);
      if ($('Tier') && inLoyalty) $('Tier').value = String(tierIndexFromMetalName(readTierFromEntity(entity)));
      if ($('Points') && inLoyalty) {
        var pts = readPointsFromEntity(entity);
        $('Points').value = pts != null ? String(pts) : RANGE_DEFAULTS.Points;
      }
      var pr = readPropensityFromEntity(entity);
      if ($('Propensity')) $('Propensity').value = pr != null ? String(pr) : RANGE_DEFAULTS.Propensity;
      var ch = readChurnFromEntity(entity);
      if ($('Churn')) $('Churn').value = ch != null ? String(ch) : RANGE_DEFAULTS.Churn;
      var aov = readAvgOrderFromEntity(entity);
      if ($('OrderValue') && aov != null) $('OrderValue').value = String(Math.round(aov));
      wireRangeDisplays();
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
        if (form.points !== '' && !strEq(form.points, base.points)) {
          var pts = Number(form.points);
          if (!Number.isNaN(pts)) {
            updates.push({ path: 'loyalty.points', value: pts });
            updates.push({ path: 'loyaltyDetails.points', value: pts });
          }
        }
      }
      if (form.channel && !strEq(form.channel, base.channel)) {
        updates.push({ path: 'consents.marketing.preferred', value: form.channel });
      }
      if (form.propensity !== '' && !strEq(form.propensity, base.propensity)) {
        var pr = Number(form.propensity);
        if (!Number.isNaN(pr)) updates.push({ path: 'scoring.core.propensityScore', value: Math.round(pr) });
      }
      if (form.churn !== '' && !strEq(form.churn, base.churn)) {
        var ch = Number(form.churn);
        if (!Number.isNaN(ch)) updates.push({ path: 'scoring.churn.churnPrediction', value: Math.round(ch) });
      }
      if (form.orderValue !== '' && !strEq(form.orderValue, base.orderValue)) {
        var ov = Number(form.orderValue);
        if (!Number.isNaN(ov)) updates.push({ path: 'orderProfile.avgOrderSize', value: ov });
      }
      if (form.nps !== '' && !strEq(form.nps, base.nps)) {
        var np = Math.round(Number(form.nps));
        if (!Number.isNaN(np)) updates.push({ path: 'scoring.npsScore', value: np });
      }
      if (form.language && !strEq(form.language, base.language)) {
        updates.push({ path: 'preferences.preferredLanguage', value: form.language });
        updates.push({ path: 'personalEmail.language', value: form.language });
      }
      return updates;
    }

    function setStatus(msg, kind) {
      var el = $('Status');
      if (!el) return;
      el.textContent = msg || '';
      el.classList.remove('is-error', 'is-ok');
      if (kind === 'error') el.classList.add('is-error');
      else if (kind === 'ok') el.classList.add('is-ok');
    }

    function setPipeline(msg, kind) {
      var el = $('Pipeline');
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
      var btn = $('Apply');
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
      var form = snapshotMicroForm();
      form.tier = microLoyaltyInScheme && $('Tier') ? metalFromTierIndex($('Tier').value) : '';
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

    function wireRangeDisplays() {
      var churn = $('Churn');
      if (churn && $('ChurnValue')) $('ChurnValue').textContent = churn.value;
      var prop = $('Propensity');
      if (prop && $('PropensityValue')) $('PropensityValue').textContent = prop.value;
      var ov = $('OrderValue');
      if (ov && $('OrderValueDisplay')) {
        $('OrderValueDisplay').textContent = '$' + Math.round(Number(ov.value) || 0).toLocaleString('en-US');
      }
      var pts = $('Points');
      if (pts && $('PointsValue')) $('PointsValue').textContent = pts.value;
      var nps = $('Nps');
      if (nps && $('NpsValue')) $('NpsValue').textContent = nps.value;
      if ($('Tier') && $('TierValue') && microLoyaltyInScheme) {
        $('TierValue').textContent = metalFromTierIndex($('Tier').value);
      }
    }

    function wireRangeInputs() {
      [
        ['Churn', 'ChurnValue', false],
        ['Propensity', 'PropensityValue', false],
        ['Points', 'PointsValue', false],
        ['Nps', 'NpsValue', false],
      ].forEach(function (row) {
        var input = $(row[0]);
        if (!input) return;
        input.addEventListener('input', function () {
          if ($(row[1])) $(row[1]).textContent = input.value;
        });
      });
      var ov = $('OrderValue');
      if (ov) {
        ov.addEventListener('input', function () {
          if ($('OrderValueDisplay')) {
            $('OrderValueDisplay').textContent =
              '$' + Math.round(Number(ov.value) || 0).toLocaleString('en-US');
          }
        });
      }
      var tier = $('Tier');
      if (tier) {
        tier.addEventListener('input', function () {
          if ($('TierValue')) $('TierValue').textContent = metalFromTierIndex(tier.value);
        });
      }
    }

    var toggle = $('Toggle');
    var panel = $('Panel');
    if (toggle && panel) {
      toggle.addEventListener('click', function () {
        var collapsed = panel.classList.contains('is-collapsed');
        panel.classList.toggle('is-collapsed', !collapsed);
        toggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
        if (collapsed && isProfileLoaded()) hydrateFromUps();
      });
    }

    var runBtn = $('RunBtn');
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

    var applyBtn = $('Apply');
    if (applyBtn) applyBtn.addEventListener('click', onApply);

    wireRangeInputs();
    wireRangeDisplays();
    setMicroBaselineFromDom();
    refreshStateDot();

    global.addEventListener('decisioning-profile-updated', function (ev) {
      refreshStateDot();
      if (ev && ev.detail && ev.detail.ok) hydrateFromUps();
    });

    return { refresh: refreshStateDot, hydrate: hydrateFromUps };
  }

  global.DecisioningProfileModule = {
    CACHE_BUST: CACHE_BUST,
    mount: mount,
    extractEntityFromUps: extractEntityFromUps,
  };
})(typeof window !== 'undefined' ? window : globalThis);
