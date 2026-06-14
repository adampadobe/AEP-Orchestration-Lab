/**
 * Contact centre customise dock: per-sandbox RTDB read/write for industry + shared brand chrome.
 * Paths: ajoLookups/{ldap}/sandboxes/{sandbox}/CallCentre, CoreDemoData, StaffPortal
 */
(function () {
  'use strict';

  var BRAND_INPUT_IDS = ['ccCustomiseBrandName', 'ccCustomiseAgentName', 'ccCustomiseAccentColour'];
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
      agentName: '',
      accentColour: '',
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
    var sp = raw.StaffPortal || {};
    o.agentName =
      (sp.AgentName && String(sp.AgentName).trim()) ||
      (sp.agentName && String(sp.agentName).trim()) ||
      (raw.agentName && String(raw.agentName).trim()) ||
      '';
    var colour = sp.Colour != null ? String(sp.Colour).trim() : raw.accentColour || '';
    o.accentColour = colour.replace(/^#/, '');
    return o;
  }

  function configEqual(a, b) {
    var x = normalizeConfig(a);
    var y = normalizeConfig(b);
    return (
      x.industryId === y.industryId &&
      x.brandName === y.brandName &&
      x.agentName === y.agentName &&
      x.accentColour === y.accentColour
    );
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
    var brandEl = document.getElementById('ccCustomiseBrandName');
    if (brandEl) brandEl.value = c.brandName || '';
    var agentEl = document.getElementById('ccCustomiseAgentName');
    if (agentEl) agentEl.value = c.agentName || '';
    var colourEl = document.getElementById('ccCustomiseAccentColour');
    if (colourEl) colourEl.value = c.accentColour || '';
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
      agentName: val('ccCustomiseAgentName'),
      accentColour: val('ccCustomiseAccentColour').replace(/^#/, ''),
    };
  }

  function isUserEditingBrandInputs() {
    var active = document.activeElement;
    if (!active || !active.id) return false;
    return BRAND_INPUT_IDS.indexOf(active.id) >= 0;
  }

  function configHasMeaningfulData(cfg) {
    var c = normalizeConfig(cfg);
    return !!(c.industryId || c.brandName || c.agentName || c.accentColour);
  }

  function loadConfigFromRtdb(sandboxSlug) {
    var c = rtdb();
    if (!c) return Promise.resolve(null);
    var sb = c.normalizeSlug(sandboxSlug) || c.getActiveSandboxSlug();
    return c
      .whenReady()
      .then(function () {
        // migrateLocalStorageKeys runs inside loadSection → ensurePrepReady after auth/provision.
        return c.loadSection(c.SECTIONS.CallCentre, { sandboxSlug: sb });
      })
      .then(function (section) {
        return normalizeConfig(section || {});
      });
  }

  function applyToDemo(cfg) {
    var lab = window.AepCallCentreLab;
    if (!lab || typeof lab.applyLoadedConfig !== 'function') return;
    var c = normalizeConfig(cfg);
    var payload = {
      industryId: c.industryId,
      CoreDemoData: {
        name: c.brandName,
        airlineName: c.brandName,
      },
      StaffPortal: {
        AgentName: c.agentName,
        Colour: c.accentColour ? '#' + c.accentColour.replace(/^#/, '') : '',
      },
    };
    lab.applyLoadedConfig(payload);
  }

  function saveConfigToRtdb(cfg, sandboxSlug) {
    var c = rtdb();
    if (!c) return Promise.reject(new Error('Demo config RTDB module not loaded'));
    var sb = c.normalizeSlug(sandboxSlug) || c.normalizeSlug(currentSandboxName());
    if (!sb) return Promise.reject(new Error('Select a sandbox in the environment bar to save demo config.'));
    var norm = normalizeConfig(cfg);
    var colour = norm.accentColour ? '#' + norm.accentColour.replace(/^#/, '') : '';
    var tasks = [
      c.saveSection(c.SECTIONS.CallCentre, { industryId: norm.industryId || 'generic' }, { sandboxSlug: sb }),
      c.saveCoreDemoData({ name: norm.brandName, airlineName: norm.brandName }, { sandboxSlug: sb }),
      c.saveStaffPortal({ AgentName: norm.agentName, Colour: colour }, { sandboxSlug: sb }),
    ];
    return Promise.all(tasks).then(function () {
      return { sandboxSlug: sb, config: norm };
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
    if (saveInFlight) {
      return saveInFlight.then(function () {
        return persistConfig(cfg, sandboxSlug, statusPrefix);
      });
    }
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
        refreshFromRtdb();
      });
    return saveInFlight;
  }

  function refreshFromRtdb() {
    if (saveInFlight) return;
    var gen = ++refreshGeneration;
    var sb = currentSandboxName();
    loadConfigFromRtdb(sb)
      .then(function (cfg) {
        if (gen !== refreshGeneration) return;
        var normalized = normalizeConfig(cfg);
        lastSaved = normalized;
        if (!isUserEditingBrandInputs()) {
          fillInputs(cfg);
        }
        applyToDemo(cfg);
        updateSandboxLabel();
        if (!sb) {
          setStatus('Select a sandbox in the environment bar to load saved settings.', 'err');
        } else {
          setStatus('', '');
        }
      })
      .catch(function (e) {
        if (gen !== refreshGeneration) return;
        console.warn('[call-centre-customise] RTDB load failed:', e);
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
      window.__aepLabSyncReady.then(function () {
        tryRefresh();
        if (!currentSandboxName()) {
          window.addEventListener('aep-global-sandbox-change', tryRefresh, { once: true });
        }
      });
    } else {
      tryRefresh();
      if (!currentSandboxName()) {
        window.addEventListener('aep-global-sandbox-change', tryRefresh, { once: true });
      }
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
    updateSandboxLabel();

    var btn = document.getElementById('ccCustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        persistConfig(collectInputs(), currentSandboxName(), 'Saving');
      });
    }

    BRAND_INPUT_IDS.forEach(function (id) {
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
        var lab = window.AepCallCentreLab;
        if (lab && typeof lab.applyIndustry === 'function' && cfg.industryId) {
          lab.applyIndustry(cfg.industryId);
        }
        persistIndustryLocal(cfg.industryId);
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
    window.addEventListener('aep-call-centre-lab-ready', refreshFromRtdb);

    scheduleRefreshAfterAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
