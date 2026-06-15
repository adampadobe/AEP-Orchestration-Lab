/**
 * Contact centre customise dock: per-workspace RTDB read/write for industry + shared brand chrome.
 * Paths: ajoLookups/{ldap}/CallCentre, CoreDemoData, StaffPortal
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

  function getWorkspaceSlug() {
    var c = rtdb();
    if (c && typeof c.resolveLdapSlugAsync === 'function') {
      return c.resolveLdapSlugAsync();
    }
    if (c && c.getLdapSlugSync) {
      return Promise.resolve(c.getLdapSlugSync() || '');
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

  function loadConfigFromRtdb() {
    var c = rtdb();
    if (!c) return Promise.resolve(null);
    return c.whenReady().then(function () {
      return Promise.all([c.loadSection(c.SECTIONS.CallCentre), c.loadSharedBrand()]);
    }).then(function (results) {
      var callCentre = results[0] || {};
      var shared = results[1] || {};
      return normalizeConfig(
        Object.assign({}, callCentre, {
          CoreDemoData: shared.CoreDemoData || {},
          StaffPortal: shared.StaffPortal || {},
        }),
      );
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
      },
      StaffPortal: {
        AgentName: c.agentName,
        Colour: c.accentColour ? '#' + c.accentColour.replace(/^#/, '') : '',
      },
    };
    lab.applyLoadedConfig(payload);
  }

  function saveConfigToRtdb(cfg) {
    var c = rtdb();
    if (!c) return Promise.reject(new Error('Demo config RTDB module not loaded'));
    var norm = normalizeConfig(cfg);
    var colour = norm.accentColour ? '#' + norm.accentColour.replace(/^#/, '') : '';
    return Promise.all([
      c.saveSection(c.SECTIONS.CallCentre, { industryId: norm.industryId || 'generic' }),
      c.saveCoreDemoData({ name: norm.brandName }),
      c.saveStaffPortal({ AgentName: norm.agentName, Colour: colour }),
    ]).then(function () {
      return { config: norm };
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
        console.warn('[call-centre-customise] industry save failed:', e);
        return false;
      });
  }

  function persistConfig(cfg, statusPrefix, opts) {
    opts = opts || {};
    var norm = normalizeConfig(cfg);
    if (!opts.force && lastSaved && configEqual(norm, lastSaved)) {
      console.log('[AepDemoConfigRtdb] [call-centre-customise] persistConfig skipped (unchanged)', { norm: norm });
      return Promise.resolve(true);
    }
    console.log('[AepDemoConfigRtdb] [call-centre-customise] persistConfig start', {
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
    saveInFlight = getWorkspaceSlug()
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
    loadConfigFromRtdb()
      .then(function (cfg) {
        if (gen !== refreshGeneration) return;
        var normalized = normalizeConfig(cfg);
        lastSaved = normalized;
        if (!isUserEditingBrandInputs()) {
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
        console.log('[AepDemoConfigRtdb] [call-centre-customise] Update clicked', collectInputs());
        persistConfig(collectInputs(), 'Saving', { force: true });
      });
    }

    BRAND_INPUT_IDS.forEach(function (id) {
      var inp = document.getElementById(id);
      if (!inp) return;
      inp.addEventListener('blur', function () {
        console.log('[AepDemoConfigRtdb] [call-centre-customise] blur persist', id, inp.value);
        persistConfig(collectInputs(), 'Saving');
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
        applyToDemo(cfg);
        persistIndustryLocal(cfg.industryId);
        persistIndustryOnly(cfg.industryId);
      });
    }

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
