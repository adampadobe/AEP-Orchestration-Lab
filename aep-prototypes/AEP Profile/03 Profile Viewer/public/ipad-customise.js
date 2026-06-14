/**
 * iPad lab customise dock: per-sandbox RTDB read/write for industry, brand chrome, and flight strip.
 * Paths: ajoLookups/{ldap}/sandboxes/{sandbox}/CallCentre, CoreDemoData, StaffPortal, iPad
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

  function currentSandboxName() {
    if (typeof AepGlobalSandbox !== 'undefined') {
      if (typeof AepGlobalSandbox.getSelected === 'function') {
        var selected = String(AepGlobalSandbox.getSelected() || '').trim();
        if (selected) return selected;
      }
      if (typeof AepGlobalSandbox.getSandboxName === 'function') {
        var globalName = String(AepGlobalSandbox.getSandboxName() || '').trim();
        if (globalName) return globalName;
      }
    }
    var c = rtdb();
    if (c && c.getActiveSandboxSlug) {
      var slug = c.getActiveSandboxSlug();
      if (slug) return slug;
    }
    try {
      var stored = String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
      if (stored) return stored;
    } catch (e) {}
    return '';
  }

  function updateSandboxLabel() {
    var el = document.getElementById('ccCustomiseSandboxLabel');
    if (!el) return;
    var sb = currentSandboxName();
    var nameEl = el.querySelector('.cc-customize-sandbox-name');
    if (nameEl) {
      nameEl.textContent = sb || '—';
      return;
    }
    el.textContent = sb ? 'Sandbox: ' + sb : 'Sandbox: —';
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

  function loadConfigFromRtdb(sandboxSlug) {
    var c = rtdb();
    if (!c) return Promise.resolve(null);
    var sb = c.normalizeSlug(sandboxSlug) || c.getActiveSandboxSlug();
    return c
      .whenReady()
      .then(function () {
        return c.migrateLocalStorageKeys(sb);
      })
      .then(function () {
        return Promise.all([
          c.loadSection(c.SECTIONS.CallCentre, { sandboxSlug: sb }),
          c.loadIPadFlat({ sandboxSlug: sb }),
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
      ipad: {
        Mobile: { StaffName: norm.agentName, Gate: norm.gate },
        TravelData: {
          flightNumber: norm.flightNumber,
          route: norm.route,
          gate: norm.gate,
        },
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

  function saveConfigToRtdb(cfg, sandboxSlug) {
    var c = rtdb();
    if (!c) return Promise.reject(new Error('Demo config RTDB module not loaded'));
    var sb = c.normalizeSlug(sandboxSlug) || c.normalizeSlug(currentSandboxName());
    if (!sb) return Promise.reject(new Error('Select a sandbox in the environment bar to save demo config.'));
    var payload = buildRtdbPayload(cfg);
    return Promise.all([
      c.saveSection(c.SECTIONS.CallCentre, payload.callCentre, { sandboxSlug: sb }),
      c.saveCoreDemoData(payload.core, { sandboxSlug: sb }),
      c.saveStaffPortal(payload.staff, { sandboxSlug: sb }),
      c.saveSection(c.SECTIONS.iPad, payload.ipad, { sandboxSlug: sb }),
    ]).then(function () {
      return { sandboxSlug: sb, config: normalizeConfig(cfg) };
    });
  }

  function persistIndustryLocal(industryId) {
    var ctx = industryCtx();
    if (ctx && typeof ctx.persistIndustry === 'function' && industryId) {
      ctx.persistIndustry(industryId);
    }
  }

  function persistConfig(cfg, sandboxSlug, statusPrefix) {
    var sb = sandboxSlug || currentSandboxName();
    if (!sb) {
      setStatus('Select a sandbox in the environment bar to save demo config.', 'err');
      return Promise.resolve(false);
    }
    var norm = normalizeConfig(cfg);
    if (lastSaved && configEqual(norm, lastSaved)) {
      return Promise.resolve(true);
    }
    setStatus((statusPrefix || 'Saving') + '…', '');
    if (saveInFlight) return saveInFlight;
    saveInFlight = saveConfigToRtdb(norm, sb)
      .then(function () {
        lastSaved = norm;
        persistIndustryLocal(norm.industryId);
        applyToDemo(norm);
        setStatus('Saved customise settings for sandbox “' + sb + '”.', 'ok');
        return true;
      })
      .catch(function (e) {
        setStatus(String((e && e.message) || e), 'err');
        return false;
      })
      .finally(function () {
        saveInFlight = null;
      });
    return saveInFlight;
  }

  function refreshFromRtdb() {
    var sb = currentSandboxName();
    loadConfigFromRtdb(sb)
      .then(function (cfg) {
        var normalized = normalizeConfig(cfg);
        lastSaved = normalized;
        if (!isUserEditingInputs()) {
          fillInputs(cfg);
        }
        applyToDemo(cfg);
        if (!sb) {
          setStatus('Select a sandbox in the environment bar to load saved settings.', 'err');
        }
        updateSandboxLabel();
      })
      .catch(function (e) {
        console.warn('[ipad-customise] RTDB load failed:', e);
        setStatus('Could not load settings from RTDB.', 'err');
      });
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
    updateSandboxLabel();

    var btn = document.getElementById('ccCustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        persistConfig(collectInputs(), currentSandboxName(), 'Saving');
      });
    }

    FIELD_INPUT_IDS.forEach(function (id) {
      var inp = document.getElementById(id);
      if (!inp) return;
      inp.addEventListener('blur', function () {
        persistConfig(collectInputs(), currentSandboxName(), 'Saving');
      });
    });

    var industrySel = document.getElementById('ccIndustrySelect');
    if (industrySel) {
      industrySel.addEventListener('change', function () {
        var cfg = collectInputs();
        persistIndustryLocal(cfg.industryId);
        applyToDemo(cfg);
        persistConfig(cfg, currentSandboxName(), 'Saving');
      });
    }

    window.addEventListener('aep-global-sandbox-change', function () {
      lastSaved = null;
      updateSandboxLabel();
      refreshFromRtdb();
    });

    window.addEventListener('aep-demo-config-changed', refreshFromRtdb);
    document.addEventListener('aep-lab-sandbox-keys-applied', refreshFromRtdb);

    if (window.__aepLabSyncReady && typeof window.__aepLabSyncReady.then === 'function') {
      window.__aepLabSyncReady.then(refreshFromRtdb);
    } else {
      refreshFromRtdb();
    }
    window.setTimeout(refreshFromRtdb, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
