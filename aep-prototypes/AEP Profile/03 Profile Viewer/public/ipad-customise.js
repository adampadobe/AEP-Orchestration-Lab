/**
 * iPad lab customise dock: per-workspace RTDB read/write for industry, brand chrome, and flight strip.
 * Paths: ajoLookups/{ldap}/CoreDemoData, StaffPortal, TravelData, Mobile, CallCentre
 */
(function () {
  'use strict';

  var FIELD_INPUT_IDS = [
    'ccCustomiseBrandName',
    'ccCustomiseShortName',
    'ccCustomiseAgentName',
    'ccCustomiseAccentColour',
    'ccCustomiseFlightNumber',
    'ccCustomiseRoute',
    'ccCustomiseGate',
  ];
  var lastSaved = null;
  var saveInFlight = null;
  var refreshGeneration = 0;

  function rtdb() {
    return window.AepDemoConfigRtdb;
  }

  function industryCtx() {
    return window.AepLabIndustryContext;
  }

  function emptyConfig() {
    return {
      industryId: '',
      brandName: '',
      shortName: '',
      agentName: '',
      accentColour: '',
      flightNumber: '',
      route: '',
      gate: '',
    };
  }

  function normalizeConfig(raw) {
    var o = emptyConfig();
    if (!raw || typeof raw !== 'object') return o;
    if (raw.industryId) o.industryId = String(raw.industryId).trim();
    var cd = raw.CoreDemoData || {};
    o.brandName =
      (cd.name && String(cd.name).trim()) ||
      (cd.airlineName && String(cd.airlineName).trim()) ||
      (raw.brandName && String(raw.brandName).trim()) ||
      '';
    o.shortName = (cd.shortName && String(cd.shortName).trim()) || '';
    var sp = raw.StaffPortal || {};
    var mb = raw.Mobile || {};
    o.agentName =
      (mb.StaffName && String(mb.StaffName).trim()) ||
      (sp.AgentName && String(sp.AgentName).trim()) ||
      '';
    var colour = sp.Colour != null ? String(sp.Colour).trim() : '';
    o.accentColour = colour.replace(/^#/, '');
    var td = raw.TravelData || {};
    o.flightNumber = (td.flightNumber && String(td.flightNumber).trim()) || (td.flight && String(td.flight).trim()) || '';
    o.route = (td.route && String(td.route).trim()) || '';
    o.gate = (td.gate && String(td.gate).trim()) || (mb.Gate && String(mb.Gate).trim()) || '';
    return o;
  }

  function configEqual(a, b) {
    var x = normalizeConfig(a);
    var y = normalizeConfig(b);
    return Object.keys(emptyConfig()).every(function (k) {
      return x[k] === y[k];
    });
  }

  function getWorkspaceSlug() {
    var c = rtdb();
    if (c && typeof c.resolveLdapSlugAsync === 'function') {
      return c.resolveLdapSlugAsync();
    }
    if (c && c.getLdapSlugSync) {
      var sync = c.getLdapSlugSync();
      return Promise.resolve(sync || '');
    }
    return Promise.resolve('');
  }

  function updateWorkspaceLabel(workspaceSlug) {
    var el = document.getElementById('ccCustomiseSandboxLabel');
    if (!el) return;
    var ws = workspaceSlug || '';
    var nameEl = el.querySelector('.cc-customize-sandbox-name');
    if (nameEl) {
      nameEl.textContent = ws || '—';
      return;
    }
    el.textContent = ws ? 'Workspace: ' + ws : 'Workspace: —';
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('ccCustomiseStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'cc-customize-status' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
  }

  function fillInputs(cfg) {
    var c = normalizeConfig(cfg);
    var industrySel = document.getElementById('ccIndustrySelect');
    if (industrySel && c.industryId && industrySel.querySelector('option[value="' + c.industryId + '"]')) {
      industrySel.value = c.industryId;
    }
    var map = {
      ccCustomiseBrandName: c.brandName,
      ccCustomiseShortName: c.shortName,
      ccCustomiseAgentName: c.agentName,
      ccCustomiseAccentColour: c.accentColour,
      ccCustomiseFlightNumber: c.flightNumber,
      ccCustomiseRoute: c.route,
      ccCustomiseGate: c.gate,
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = map[id] || '';
    });
  }

  function collectInputs() {
    var industrySel = document.getElementById('ccIndustrySelect');
    var industryId = industrySel && industrySel.value ? String(industrySel.value).trim() : '';
    function val(id) {
      var el = document.getElementById(id);
      return el && el.value != null ? String(el.value).trim() : '';
    }
    return {
      industryId: industryId,
      brandName: val('ccCustomiseBrandName'),
      shortName: val('ccCustomiseShortName'),
      agentName: val('ccCustomiseAgentName'),
      accentColour: val('ccCustomiseAccentColour').replace(/^#/, ''),
      flightNumber: val('ccCustomiseFlightNumber'),
      route: val('ccCustomiseRoute'),
      gate: val('ccCustomiseGate'),
    };
  }

  function isUserEditingInputs() {
    var active = document.activeElement;
    if (!active || !active.id) return false;
    return FIELD_INPUT_IDS.indexOf(active.id) >= 0;
  }

  function configHasMeaningfulData(cfg) {
    var c = normalizeConfig(cfg);
    return !!(
      c.industryId ||
      c.brandName ||
      c.shortName ||
      c.agentName ||
      c.accentColour ||
      c.flightNumber ||
      c.route ||
      c.gate
    );
  }

  function loadConfigFromRtdb() {
    var c = rtdb();
    if (!c) return Promise.resolve(null);
    return c
      .whenReady()
      .then(function () {
        return Promise.all([
          c.loadSection(c.SECTIONS.CallCentre),
          c.loadIPadFlat(),
        ]);
      })
      .then(function (results) {
        var callCentre = results[0] || {};
        var flat = results[1] || {};
        return normalizeConfig(
          Object.assign({}, flat, {
            industryId: callCentre.industryId || '',
            CoreDemoData: flat.CoreDemoData || {},
            StaffPortal: flat.StaffPortal || {},
            Mobile: flat.Mobile || {},
            TravelData: flat.TravelData || {},
          }),
        );
      });
  }

  function buildRtdbPayload(cfg) {
    var norm = normalizeConfig(cfg);
    var colour = norm.accentColour ? '#' + norm.accentColour.replace(/^#/, '') : '';
    return {
      callCentre: { industryId: norm.industryId || 'generic' },
      core: {
        name: norm.brandName,
        airlineName: norm.brandName,
        shortName: norm.shortName,
      },
      staff: {
        AgentName: norm.agentName,
        Colour: colour,
      },
      mobile: {
        StaffName: norm.agentName,
        Gate: norm.gate,
      },
      travel: {
        flightNumber: norm.flightNumber,
        route: norm.route,
        gate: norm.gate,
      },
      flat: {
        CoreDemoData: {
          name: norm.brandName,
          airlineName: norm.brandName,
          shortName: norm.shortName,
        },
        StaffPortal: {
          AgentName: norm.agentName,
          Colour: colour,
        },
        Mobile: { StaffName: norm.agentName, Gate: norm.gate },
        TravelData: {
          flightNumber: norm.flightNumber,
          route: norm.route,
          gate: norm.gate,
        },
      },
    };
  }

  function applyToDemo(cfg) {
    var lab = window.AepIpadLab;
    if (!lab) return;
    var payload = buildRtdbPayload(cfg);
    if (typeof lab.applyIndustry === 'function' && cfg.industryId) {
      lab.applyIndustry(cfg.industryId);
    }
    if (typeof lab.applyRtdbData === 'function') {
      lab.applyRtdbData(payload.flat);
    }
  }

  function saveConfigToRtdb(cfg) {
    var c = rtdb();
    if (!c) return Promise.reject(new Error('Demo config RTDB module not loaded'));
    var payload = buildRtdbPayload(cfg);
    return Promise.all([
      c.saveSection(c.SECTIONS.CallCentre, payload.callCentre),
      c.saveCoreDemoData(payload.core),
      c.saveStaffPortal(payload.staff),
      c.saveSection(c.SECTIONS.Mobile, payload.mobile),
      c.saveSection(c.SECTIONS.TravelData, payload.travel),
    ]).then(function () {
      return { config: normalizeConfig(cfg) };
    });
  }

  function persistIndustryLocal(industryId) {
    var ctx = industryCtx();
    if (ctx && typeof ctx.persistIndustry === 'function' && industryId) {
      ctx.persistIndustry(industryId);
    }
  }

  function persistIndustryOnly(industryId) {
    var c = rtdb();
    if (!c || !industryId) return Promise.resolve(false);
    return c
      .saveSection(c.SECTIONS.CallCentre, { industryId: industryId })
      .then(function () {
        persistIndustryLocal(industryId);
        return true;
      })
      .catch(function (e) {
        console.warn('[ipad-customise] industry save failed:', e);
        return false;
      });
  }

  function persistConfig(cfg, statusPrefix, opts) {
    opts = opts || {};
    var norm = normalizeConfig(cfg);
    if (!opts.force && lastSaved && configEqual(norm, lastSaved)) {
      console.log('[AepDemoConfigRtdb] [ipad-customise] persistConfig skipped (unchanged)', { norm: norm });
      return Promise.resolve(true);
    }
    console.log('[AepDemoConfigRtdb] [ipad-customise] persistConfig start', {
      norm: norm,
      lastSaved: lastSaved,
      force: !!opts.force,
      trigger: statusPrefix || 'Saving',
    });
    setStatus((statusPrefix || 'Saving') + '…', '');
    if (saveInFlight) {
      return saveInFlight.then(function () {
        return persistConfig(cfg, statusPrefix, opts);
      });
    }
    var c = rtdb();
    var ready = c && typeof c.whenReady === 'function' ? c.whenReady() : Promise.resolve();
    saveInFlight = ready
      .then(function () {
        return getWorkspaceSlug();
      })
      .then(function (ws) {
        if (!ws) {
          throw new Error('Sign in with your Adobe lab account to save demo config.');
        }
        return saveConfigToRtdb(norm);
      })
      .then(function () {
        lastSaved = norm;
        persistIndustryLocal(norm.industryId);
        applyToDemo(norm);
        return getWorkspaceSlug();
      })
      .then(function (ws) {
        setStatus('Saved customise settings for workspace “' + (ws || 'your lab') + '”.', 'ok');
        refreshFromRtdb();
        return true;
      })
      .catch(function (e) {
        console.error('[AepDemoConfigRtdb] [ipad-customise] persistConfig failed', e);
        setStatus(String((e && e.message) || e), 'err');
        return false;
      })
      .finally(function () {
        saveInFlight = null;
      });
    return saveInFlight;
  }

  function refreshFromRtdb() {
    if (saveInFlight) return;
    var gen = ++refreshGeneration;
    loadConfigFromRtdb()
      .then(function (cfg) {
        if (gen !== refreshGeneration) return;
        var normalized = normalizeConfig(cfg);
        lastSaved = normalized;
        if (!isUserEditingInputs()) {
          fillInputs(cfg);
        }
        applyToDemo(cfg);
        return getWorkspaceSlug();
      })
      .then(function (ws) {
        if (gen !== refreshGeneration) return;
        updateWorkspaceLabel(ws);
        if (!ws) {
          setStatus('Sign in to load your workspace demo settings.', 'err');
        } else {
          setStatus('', '');
        }
      })
      .catch(function (e) {
        if (gen !== refreshGeneration) return;
        console.warn('[ipad-customise] RTDB load failed:', e);
        if (lastSaved && configHasMeaningfulData(lastSaved)) {
          setStatus('', '');
          return;
        }
        setStatus('Could not load settings from RTDB.', 'err');
      });
  }

  function scheduleRefreshAfterAuth() {
    function tryRefresh() {
      refreshFromRtdb();
    }
    if (window.__aepLabSyncReady && typeof window.__aepLabSyncReady.then === 'function') {
      window.__aepLabSyncReady.then(tryRefresh);
    } else {
      tryRefresh();
    }
    window.setTimeout(tryRefresh, 1500);
  }

  function bindDrawerRefresh() {
    var dock = document.getElementById('ccCustomizeDock');
    var tab = document.getElementById('ccCustomizeTabBtn');
    if (!tab || !dock) return;
    tab.addEventListener('click', function () {
      window.setTimeout(function () {
        if (dock.classList.contains('cc-customize-open')) refreshFromRtdb();
      }, 0);
    });
  }

  function init() {
    bindDrawerRefresh();

    var btn = document.getElementById('ccCustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        console.log('[AepDemoConfigRtdb] [ipad-customise] Update clicked', collectInputs());
        persistConfig(collectInputs(), 'Saving', { force: true });
      });
    }

    FIELD_INPUT_IDS.forEach(function (id) {
      var inp = document.getElementById(id);
      if (!inp) return;
      inp.addEventListener('blur', function () {
        console.log('[AepDemoConfigRtdb] [ipad-customise] blur persist', id, inp.value);
        persistConfig(collectInputs(), 'Saving');
      });
    });

    var industrySel = document.getElementById('ccIndustrySelect');
    if (industrySel) {
      industrySel.addEventListener('change', function () {
        var cfg = collectInputs();
        persistIndustryLocal(cfg.industryId);
        if (window.AepIpadLab && typeof window.AepIpadLab.applyIndustry === 'function' && cfg.industryId) {
          window.AepIpadLab.applyIndustry(cfg.industryId);
        }
        applyToDemo(cfg);
        persistIndustryOnly(cfg.industryId);
      });
    }

    window.addEventListener('aep-demo-config-changed', refreshFromRtdb);
    document.addEventListener('aep-lab-sandbox-keys-applied', refreshFromRtdb);

    scheduleRefreshAfterAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
