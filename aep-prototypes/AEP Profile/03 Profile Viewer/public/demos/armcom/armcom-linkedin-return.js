/**
 * Arm demo — cross-tab bootstrap when opened from LinkedIn (new tab).
 * Reads unified localStorage env prefs, seeds session collapse flags, auto-resumes Tags inject.
 */
(function armcomLinkedInReturn(global) {
  'use strict';

  var ARMCOM_PREFIX = 'armcom';
  var LINKEDIN_PREFIX = 'linkedinArm';
  var PRESENTER_MODE_KEY = 'armcomPresenterMode';
  var PRESENTER_SUCCESS_ATTR = 'data-armcom-presenter-success';
  var PRESENTER_ERROR_ATTR = 'data-armcom-presenter-config-error';
  var LAB_ENV_CONFIGURED_KEY = 'aepLabEnvConfigured:' + ARMCOM_PREFIX;
  var BOOTSTRAP_SESSION_KEY = 'armcomLinkedInPresenterBootDone';
  var PAID_AD_AFTER_BRIEF_KEY = 'armcomPaidAdClickedAfterBrief';
  var PRESENTER_FINAL_EVAL_MS = 7000;
  var RETURN_SOURCES = {
    'linkedin-ad': true,
    'linkedin-organic': true,
    activation: true,
  };
  var presenterBootstrapComplete = false;
  var presenterBootstrapScheduled = false;
  var tagsReadyHandled = false;
  var presenterChromeLocked = false;
  var presenterFinalEvalTimer = null;

  function tagsLog(level, message, detail) {
    if (!global.AepLabConsole) return;
    if (level === 'warn') global.AepLabConsole.warn('tags-inject', message, detail);
    else global.AepLabConsole.info('tags-inject', message, detail);
  }

  function envLog(level, message, detail) {
    if (!global.AepLabConsole) return;
    if (level === 'warn') global.AepLabConsole.warn('env-bar', message, detail);
    else global.AepLabConsole.info('env-bar', message, detail);
  }

  function deferHeavyWork(run) {
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(function () {
        global.setTimeout(run, 0);
      });
      return;
    }
    global.setTimeout(run, 0);
  }

  function readBootstrapSessionFlag() {
    try {
      return global.sessionStorage.getItem(BOOTSTRAP_SESSION_KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function writeBootstrapSessionFlag() {
    try {
      global.sessionStorage.setItem(BOOTSTRAP_SESSION_KEY, '1');
    } catch (_e) {
      /* noop */
    }
  }

  function getReturnSource() {
    try {
      return String(new URLSearchParams(global.location.search).get('from') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function isLinkedInReturnVisit() {
    return !!RETURN_SOURCES[getReturnSource()];
  }

  function isLinkedInAdReturnVisit() {
    return getReturnSource() === 'linkedin-ad';
  }

  function isLinkedInOrganicReturnVisit() {
    return getReturnSource() === 'linkedin-organic';
  }

  function markPaidAdClickedAfterBrief() {
    try {
      global.sessionStorage.setItem(PAID_AD_AFTER_BRIEF_KEY, '1');
    } catch (_e) {
      /* noop */
    }
  }

  function readPaidAdClickedAfterBrief() {
    try {
      return global.sessionStorage.getItem(PAID_AD_AFTER_BRIEF_KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function clearPaidAdClickedAfterBrief() {
    try {
      global.sessionStorage.removeItem(PAID_AD_AFTER_BRIEF_KEY);
    } catch (_e) {
      /* noop */
    }
  }

  function resolveSandboxKey() {
    var sb = '';
    try {
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
        sb = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
      }
      if (!sb && global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.getSelectedSandbox === 'function') {
        sb = String(global.AepLabEnvBarPrefs.getSelectedSandbox() || '').trim();
      }
      if (!sb) sb = String(global.localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (_e) {
      /* noop */
    }
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.sandboxKey === 'function') {
      return global.AepLabEnvBarPrefs.sandboxKey(sb);
    }
    var raw = sb.toLowerCase();
    return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
  }

  function readUnifiedLaunchScript(sandboxKey) {
    try {
      if (!global.AepLabEnvBarPrefs || typeof global.AepLabEnvBarPrefs.getDoc !== 'function') return '';
      var doc = global.AepLabEnvBarPrefs.getDoc();
      var entry = doc && doc.tagsBySandbox ? doc.tagsBySandbox[sandboxKey] : null;
      return entry && entry.launchScript ? String(entry.launchScript).trim() : '';
    } catch (_e) {
      return '';
    }
  }

  function readUnifiedConfigured(sandboxKey) {
    try {
      if (!global.AepLabEnvBarPrefs || typeof global.AepLabEnvBarPrefs.getDoc !== 'function') return false;
      var doc = global.AepLabEnvBarPrefs.getDoc();
      var entry = doc && doc.tagsBySandbox ? doc.tagsBySandbox[sandboxKey] : null;
      if (!entry) return false;
      if (entry.configured === 1 || entry.configured === '1' || entry.configured === true) return true;
      return !!String(entry.launchScript || '').trim();
    } catch (_e) {
      return false;
    }
  }

  function readLaunchScriptFromLegacyMaps(sandboxKey) {
    var keys = [ARMCOM_PREFIX + 'SelectedLaunchScriptBySandbox', LINKEDIN_PREFIX + 'SelectedLaunchScriptBySandbox'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var map = {};
        if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
          map = global.AepLabEnvBarPrefs.readMap(keys[i]) || {};
        } else {
          var raw = global.localStorage.getItem(keys[i]);
          map = raw ? JSON.parse(raw) : {};
        }
        var url = map && map[sandboxKey] != null ? String(map[sandboxKey]).trim() : '';
        if (url) return url;
      } catch (_e) {
        /* noop */
      }
    }
    return '';
  }

  function resolveCrossTabLaunchScript(sandboxKey) {
    var fromUnified = readUnifiedLaunchScript(sandboxKey);
    if (fromUnified) return fromUnified;
    if (
      global.AepLabTagsInjectSession &&
      typeof global.AepLabTagsInjectSession.readLocalScript === 'function'
    ) {
      var fromArmLocal = global.AepLabTagsInjectSession.readLocalScript(ARMCOM_PREFIX, sandboxKey);
      if (fromArmLocal) return fromArmLocal;
      var fromLiLocal = global.AepLabTagsInjectSession.readLocalScript(LINKEDIN_PREFIX, sandboxKey);
      if (fromLiLocal) return fromLiLocal;
    }
    return readLaunchScriptFromLegacyMaps(sandboxKey);
  }

  function enablePresenterMode() {
    try {
      global.sessionStorage.setItem(PRESENTER_MODE_KEY, '1');
      document.documentElement.setAttribute('data-armcom-presenter', '');
    } catch (_e) {
      /* noop */
    }
  }

  function readJsonMap(key) {
    try {
      if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
        return global.AepLabEnvBarPrefs.readMap(key) || {};
      }
      var raw = global.localStorage.getItem(key);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function mapsJsonEqual(a, b) {
    try {
      return JSON.stringify(a || {}) === JSON.stringify(b || {});
    } catch (_eq) {
      return false;
    }
  }

  function writeJsonMap(key, mapObj, opts) {
    var options = opts || {};
    try {
      if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.writeMap === 'function') {
        if (options.silent && typeof global.AepLabEnvBarPrefs.writeMapSilent === 'function') {
          global.AepLabEnvBarPrefs.writeMapSilent(key, mapObj || {});
          return;
        }
        global.AepLabEnvBarPrefs.writeMap(key, mapObj || {});
        return;
      }
      global.localStorage.setItem(key, JSON.stringify(mapObj || {}));
    } catch (_e) {
      /* noop */
    }
  }

  function writeJsonMapIfChanged(key, mapObj, opts) {
    var next = mapObj && typeof mapObj === 'object' ? mapObj : {};
    if (mapsJsonEqual(readJsonMap(key), next)) return false;
    writeJsonMap(key, next, opts);
    return true;
  }

  function mirrorLinkedInConfiguredMapsToArmcom(sandboxKey, opts) {
    var options = opts || {};
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.mirrorLinkedInArmToArmcomPrefs === 'function') {
      global.AepLabEnvBarPrefs.mirrorLinkedInArmToArmcomPrefs(sandboxKey, { silent: !!options.silent });
    }
    var armScriptMap = readJsonMap(ARMCOM_PREFIX + 'SelectedLaunchScriptBySandbox');
    var liScriptMap = readJsonMap(LINKEDIN_PREFIX + 'SelectedLaunchScriptBySandbox');
    var launchScript = String(armScriptMap[sandboxKey] || liScriptMap[sandboxKey] || '').trim();
    if (launchScript) {
      var nextArmScriptMap = Object.assign({}, armScriptMap);
      nextArmScriptMap[sandboxKey] = launchScript;
      writeJsonMapIfChanged(ARMCOM_PREFIX + 'SelectedLaunchScriptBySandbox', nextArmScriptMap, options);
    }

    var armCfgMap = readJsonMap(ARMCOM_PREFIX + 'SdkConfiguredBySandbox');
    var liCfgMap = readJsonMap(LINKEDIN_PREFIX + 'SdkConfiguredBySandbox');
    if (liCfgMap[sandboxKey] === 1 || launchScript) {
      var nextArmCfgMap = Object.assign({}, armCfgMap);
      nextArmCfgMap[sandboxKey] = 1;
      writeJsonMapIfChanged(ARMCOM_PREFIX + 'SdkConfiguredBySandbox', nextArmCfgMap, options);
    }

    try {
      if (
        global.localStorage.getItem('aepLabEnvConfiguredLocal:' + LINKEDIN_PREFIX) === '1' ||
        launchScript
      ) {
        if (global.localStorage.getItem('aepLabEnvConfiguredLocal:' + ARMCOM_PREFIX) !== '1') {
          global.localStorage.setItem('aepLabEnvConfiguredLocal:' + ARMCOM_PREFIX, '1');
        }
      }
      var liLocalInject = global.localStorage.getItem('aepDemoTagsInjectedLocal:' + LINKEDIN_PREFIX + ':' + sandboxKey);
      var armLocalKey = 'aepDemoTagsInjectedLocal:' + ARMCOM_PREFIX + ':' + sandboxKey;
      var armLocalInject = global.localStorage.getItem(armLocalKey);
      if (liLocalInject && !armLocalInject) {
        global.localStorage.setItem(armLocalKey, liLocalInject);
      } else if (launchScript && armLocalInject !== launchScript) {
        global.localStorage.setItem(armLocalKey, launchScript);
      }
    } catch (_e0) {
      /* noop */
    }
    return launchScript;
  }

  function seedCrossTabSessionState(sandboxKey, launchScript, opts) {
    var options = opts || {};
    if (!options.skipMirror) {
      mirrorLinkedInConfiguredMapsToArmcom(sandboxKey, { silent: !!options.silent });
    }
    if (!launchScript) {
      launchScript = resolveCrossTabLaunchScript(sandboxKey);
    }
    var configured = readUnifiedConfigured(sandboxKey) || !!launchScript;
    if (configured) {
      try {
        global.sessionStorage.setItem(LAB_ENV_CONFIGURED_KEY, '1');
      } catch (_e0) {
        /* noop */
      }
      if (
        global.AepLabTagsInjectSession &&
        typeof global.AepLabTagsInjectSession.writeLabEnvConfiguredLocal === 'function'
      ) {
        global.AepLabTagsInjectSession.writeLabEnvConfiguredLocal(ARMCOM_PREFIX, true);
      }
    }
    if (
      launchScript &&
      global.AepLabTagsInjectSession &&
      typeof global.AepLabTagsInjectSession.writeScript === 'function'
    ) {
      global.AepLabTagsInjectSession.writeScript(ARMCOM_PREFIX, sandboxKey, launchScript);
      if (typeof global.AepLabTagsInjectSession.writeLocalScript === 'function') {
        global.AepLabTagsInjectSession.writeLocalScript(ARMCOM_PREFIX, sandboxKey, launchScript);
      }
    }
    if (global.EnvBarCompact && typeof global.EnvBarCompact.seedLabEnvConfiguredSessionFromLocal === 'function') {
      global.EnvBarCompact.seedLabEnvConfiguredSessionFromLocal();
    }
    envLog('info', 'seeded cross-tab env bar session from localStorage', {
      sandboxKey: sandboxKey,
      configured: configured,
      hasLaunchScript: !!launchScript,
      silent: !!options.silent,
    });
    return configured;
  }

  function forceEnvBarMinimized(reason) {
    if (!global.EnvBarCompact) return false;
    if (typeof global.EnvBarCompact.closeOverlay === 'function') {
      var closed = global.EnvBarCompact.closeOverlay({ force: true });
      envLog('info', 'force env bar closed (toolbar only)', {
        reason: reason || 'linkedin-return',
        ok: closed,
      });
      return closed;
    }
    if (typeof global.EnvBarCompact.minimizeToProfileLookup === 'function') {
      var ok = global.EnvBarCompact.minimizeToProfileLookup();
      envLog('info', 'force env bar minimized', { reason: reason || 'linkedin-return', ok: ok });
      return ok;
    }
    return false;
  }

  function setPresenterStripHidden(hidden, reason) {
    if (!global.EnvBarCompact || typeof global.EnvBarCompact.setPresenterStripHidden !== 'function') {
      return false;
    }
    var ok = global.EnvBarCompact.setPresenterStripHidden(!!hidden);
    envLog('info', hidden ? 'presenter strip hidden' : 'presenter strip restored', {
      reason: reason || 'presenter-chrome',
      ok: ok,
    });
    return ok;
  }

  function readNumericEcidFromDom() {
    var nodes = [
      document.getElementById('infoEcid'),
      document.getElementById('aepSpectrumToolbarEcid'),
    ];
    var i;
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node) continue;
      var textDigits = String(node.textContent || '').replace(/\D/g, '');
      if (textDigits.length >= 10) return textDigits;
      var titleDigits = String(node.title || '').replace(/\D/g, '');
      if (titleDigits.length >= 10) return titleDigits;
    }
    return '';
  }

  function readEcidHintText() {
    var info = document.getElementById('infoEcid');
    return info ? String(info.textContent || '').trim() : '';
  }

  function isLaunchScriptConfigured(sandboxKey) {
    return !!resolveCrossTabLaunchScript(sandboxKey) || readUnifiedConfigured(sandboxKey);
  }

  function isSdkToolbarActive() {
    if (tagsReadyHandled) return true;
    var scriptsBtn = document.getElementById('aepSpectrumScriptsCount');
    if (scriptsBtn) {
      var scriptText = String(scriptsBtn.textContent || '').trim();
      if (scriptText && scriptText !== 'None' && scriptText !== '—') return true;
    }
    var sdkStatus = document.getElementById('aepSpectrumSdkStatus');
    if (sdkStatus) {
      var statusText = String(sdkStatus.textContent || '').trim().toLowerCase();
      if (statusText && statusText !== 'disconnected' && statusText.indexOf('not') === -1) return true;
    }
    if (global.EnvBarCompact && typeof global.EnvBarCompact.isConfiguredForCollapse === 'function') {
      return !!global.EnvBarCompact.isConfiguredForCollapse();
    }
    return false;
  }

  function assessPresenterConfigHealth(opts) {
    var options = opts || {};
    var sandboxKey = resolveSandboxKey();
    var launchScript = resolveCrossTabLaunchScript(sandboxKey);
    var configured = readUnifiedConfigured(sandboxKey) || !!launchScript;
    var ecid = readNumericEcidFromDom();
    var ecidHint = readEcidHintText();
    var reasons = [];

    if (!launchScript && !configured) reasons.push('missing-launch-script');
    if (options.final && !isSdkToolbarActive()) reasons.push('sdk-not-active');

    if (ecid) {
      return { ok: true, ecid: ecid, reasons: reasons };
    }
    if (ecidHint === 'ECID unavailable') reasons.push('ecid-unavailable');
    if (options.final && ecidHint === 'Connecting ECID…') reasons.push('ecid-timeout');

    return {
      ok: false,
      pending: !options.final && reasons.length === 0 && (!ecidHint || ecidHint === 'Connecting ECID…'),
      reasons: reasons,
      ecidHint: ecidHint,
    };
  }

  function applyPresenterChrome(mode, detail) {
    if (!isLinkedInReturnVisit()) return;
    var reason = detail && detail.reason ? detail.reason : mode;
    if (mode === 'success' || mode === 'pending') {
      try {
        document.documentElement.setAttribute(PRESENTER_SUCCESS_ATTR, '');
        document.documentElement.removeAttribute(PRESENTER_ERROR_ATTR);
        if (mode === 'success') {
          document.documentElement.removeAttribute('data-armcom-presenter-connecting');
        } else {
          document.documentElement.setAttribute('data-armcom-presenter-connecting', '');
        }
      } catch (_attrOk) {
        /* noop */
      }
      setPresenterStripHidden(true, reason);
      forceEnvBarMinimized(reason);
      return;
    }
    if (mode !== 'error') return;
    presenterChromeLocked = true;
    try {
      document.documentElement.removeAttribute(PRESENTER_SUCCESS_ATTR);
      document.documentElement.removeAttribute('data-armcom-presenter-connecting');
      document.documentElement.setAttribute(PRESENTER_ERROR_ATTR, '');
    } catch (_attrErr) {
      /* noop */
    }
    setPresenterStripHidden(false, reason);
    if (global.EnvBarCompact && typeof global.EnvBarCompact.openOverlay === 'function') {
      global.EnvBarCompact.openOverlay();
    }
    envLog('warn', 'presenter config error — expanded env bar for recovery', {
      reason: reason,
      detail: detail && detail.reasons ? detail.reasons : undefined,
    });
  }

  function showPresenterConfigError(detail) {
    applyPresenterChrome('error', detail || { reason: 'config-error' });
  }

  function evaluatePresenterChrome(reason, opts) {
    if (!isLinkedInReturnVisit()) return;
    if (presenterChromeLocked) return;
    var options = opts || {};
    var health = assessPresenterConfigHealth(options);
    if (health.ok) {
      presenterChromeLocked = true;
      applyPresenterChrome('success', { reason: reason, ecid: health.ecid });
      envLog('info', 'presenter chrome locked — config OK', {
        reason: reason,
        ecidPreview: health.ecid ? health.ecid.slice(0, 8) + '…' : '',
      });
      return;
    }
    if (health.pending && !options.final) {
      applyPresenterChrome('pending', { reason: reason });
      return;
    }
    if (
      !options.final &&
      health.reasons.indexOf('ecid-unavailable') === -1 &&
      health.reasons.indexOf('missing-launch-script') === -1 &&
      health.reasons.length === 0
    ) {
      return;
    }
    applyPresenterChrome('error', { reason: reason, reasons: health.reasons });
  }

  function bootstrapPresenterChromeImmediate() {
    if (!isLinkedInReturnVisit()) return;
    enablePresenterMode();
    applyPresenterChrome('pending', { reason: 'bootstrap-immediate' });
  }

  function schedulePresenterFinalEval(reason) {
    if (!isLinkedInReturnVisit()) return;
    if (presenterFinalEvalTimer) global.clearTimeout(presenterFinalEvalTimer);
    presenterFinalEvalTimer = global.setTimeout(function () {
      presenterFinalEvalTimer = null;
      evaluatePresenterChrome(reason || 'presenter-final-eval', { final: true });
    }, PRESENTER_FINAL_EVAL_MS);
  }

  function runPresenterBootstrapOnce(reason) {
    if (!isLinkedInReturnVisit()) return;
    if (presenterBootstrapComplete || readBootstrapSessionFlag()) {
      presenterBootstrapComplete = true;
      if (!presenterChromeLocked) {
        evaluatePresenterChrome(reason || 'bootstrap-skip');
      }
      return;
    }
    presenterBootstrapComplete = true;
    writeBootstrapSessionFlag();
    enablePresenterMode();
    var sandboxKey = resolveSandboxKey();
    var launchScript = resolveCrossTabLaunchScript(sandboxKey);
    seedCrossTabSessionState(sandboxKey, launchScript, { silent: true });
    if (!isLaunchScriptConfigured(sandboxKey)) {
      applyPresenterChrome('error', { reason: 'missing-launch-script', reasons: ['missing-launch-script'] });
      tagsLog('warn', 'LinkedIn return visit — missing launch script', {
        from: getReturnSource(),
        sandboxKey: sandboxKey,
      });
      return;
    }
    applyPresenterChrome('pending', { reason: reason || 'presenter-bootstrap' });
    startPresenterEcidRefresh(reason || 'presenter-bootstrap');
    schedulePresenterFinalEval(reason || 'presenter-bootstrap');
    tagsLog('info', 'LinkedIn return visit — presenter bootstrap complete', {
      from: getReturnSource(),
      sandboxKey: sandboxKey,
      reason: reason || 'presenter-bootstrap',
      launchScriptPreview: launchScript ? launchScript.slice(0, 72) + '…' : '',
    });
  }

  function schedulePresenterBootstrap(reason) {
    if (!isLinkedInReturnVisit()) return;
    if (presenterBootstrapComplete || readBootstrapSessionFlag()) {
      presenterBootstrapComplete = true;
      return;
    }
    if (presenterBootstrapScheduled) return;
    presenterBootstrapScheduled = true;
    deferHeavyWork(function () {
      runPresenterBootstrapOnce(reason || 'scheduled');
    });
  }

  function whenEnvBarReady(run) {
    if (global.envBar && typeof global.envBar.ready === 'function') {
      global.envBar.ready().then(run).catch(function () {
        run();
      });
    } else {
      run();
    }
  }

  function patchOrganicDrawerState() {
    if (!isLinkedInOrganicReturnVisit()) return;
    if (global.ArmcomFakeAudiences) {
      if (typeof global.ArmcomFakeAudiences.onLinkedInOrganicClick === 'function') {
        global.ArmcomFakeAudiences.onLinkedInOrganicClick();
      }
      if (typeof global.ArmcomFakeAudiences.patchDrawer === 'function') {
        global.ArmcomFakeAudiences.patchDrawer();
      }
    }
  }

  function refreshToolbarEcidAfterInject() {
    function scheduleRefresh(delayMs) {
      global.setTimeout(function () {
        if (!global.DemoProfileDrawer || typeof global.DemoProfileDrawer.refreshBrowserEcidFromAlloy !== 'function') {
          evaluatePresenterChrome('ecid-refresh-no-drawer-' + delayMs);
          return;
        }
        void global.DemoProfileDrawer.refreshBrowserEcidFromAlloy()
          .then(function () {
            evaluatePresenterChrome('ecid-refresh-' + delayMs);
          })
          .catch(function () {
            evaluatePresenterChrome('ecid-refresh-fail-' + delayMs);
          });
      }, delayMs);
    }

    scheduleRefresh(0);
    scheduleRefresh(500);
    scheduleRefresh(1500);
    scheduleRefresh(3000);
    scheduleRefresh(6000);
  }

  function startPresenterEcidRefresh(reason) {
    if (!isLinkedInReturnVisit()) return;
    tagsLog('info', 'LinkedIn return — refresh toolbar ECID', { reason: reason || 'presenter' });
    refreshToolbarEcidAfterInject();
  }

  function onLinkedInReturnTagsReady() {
    if (!isLinkedInReturnVisit()) return;
    if (tagsReadyHandled) return;
    tagsReadyHandled = true;
    deferHeavyWork(function () {
      patchOrganicDrawerState();
      refreshToolbarEcidAfterInject();
      evaluatePresenterChrome('tags-injected');
    });
  }

  bootstrapPresenterChromeImmediate();
  schedulePresenterBootstrap('bootstrap-early');

  whenEnvBarReady(function () {
    schedulePresenterBootstrap('envBar.ready');
  });

  global.addEventListener('aep-demo-env-strip-mounted', function () {
    if (!isLinkedInReturnVisit()) return;
    deferHeavyWork(function () {
      if (!presenterChromeLocked) {
        applyPresenterChrome('pending', { reason: 'env-strip-mounted' });
      }
      startPresenterEcidRefresh('env-strip-mounted');
    });
  });

  global.addEventListener('aep-demo-env-configured', function () {
    if (!isLinkedInReturnVisit()) return;
    onLinkedInReturnTagsReady();
  });

  global.addEventListener('aep-demo-tags-injected', onLinkedInReturnTagsReady);

  global.ArmcomLinkedInReturn = {
    getReturnSource: getReturnSource,
    isLinkedInReturnVisit: isLinkedInReturnVisit,
    isLinkedInAdReturnVisit: isLinkedInAdReturnVisit,
    isLinkedInOrganicReturnVisit: isLinkedInOrganicReturnVisit,
    markPaidAdClickedAfterBrief: markPaidAdClickedAfterBrief,
    readPaidAdClickedAfterBrief: readPaidAdClickedAfterBrief,
    clearPaidAdClickedAfterBrief: clearPaidAdClickedAfterBrief,
    enablePresenterMode: enablePresenterMode,
    seedCrossTabSessionState: seedCrossTabSessionState,
    forceEnvBarMinimized: forceEnvBarMinimized,
    evaluatePresenterChrome: evaluatePresenterChrome,
    applyPresenterChrome: applyPresenterChrome,
    showPresenterConfigError: showPresenterConfigError,
    isPresenterBootstrapComplete: function () {
      return presenterBootstrapComplete || readBootstrapSessionFlag();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
