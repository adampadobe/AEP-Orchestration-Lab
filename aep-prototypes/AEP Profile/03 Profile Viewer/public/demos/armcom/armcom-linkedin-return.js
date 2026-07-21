/**
 * Arm demo — cross-tab bootstrap when opened from LinkedIn (new tab).
 * Reads unified localStorage env prefs, seeds session collapse flags, auto-resumes Tags inject.
 */
(function armcomLinkedInReturn(global) {
  'use strict';

  var ARMCOM_PREFIX = 'armcom';
  var LINKEDIN_PREFIX = 'linkedinArm';
  var PRESENTER_MODE_KEY = 'armcomPresenterMode';
  var LAB_ENV_CONFIGURED_KEY = 'aepLabEnvConfigured:' + ARMCOM_PREFIX;
  var RETURN_SOURCES = {
    'linkedin-ad': true,
    'linkedin-organic': true,
    activation: true,
  };

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

  function seedCrossTabSessionState(sandboxKey, launchScript) {
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
    });
    return configured;
  }

  function forceEnvBarMinimized(reason) {
    if (global.EnvBarCompact && typeof global.EnvBarCompact.minimizeToProfileLookup === 'function') {
      var ok = global.EnvBarCompact.minimizeToProfileLookup();
      envLog('info', 'force env bar minimized', { reason: reason || 'linkedin-return', ok: ok });
      return ok;
    }
    return false;
  }

  function bootstrapEarly() {
    if (!isLinkedInReturnVisit()) return;
    enablePresenterMode();
    var sandboxKey = resolveSandboxKey();
    var launchScript = resolveCrossTabLaunchScript(sandboxKey);
    seedCrossTabSessionState(sandboxKey, launchScript);
    tagsLog('info', 'LinkedIn return visit — cross-tab prefs loaded', {
      from: getReturnSource(),
      sandboxKey: sandboxKey,
      launchScriptPreview: launchScript ? launchScript.slice(0, 72) + '…' : '',
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

  function bootstrapAfterEnvBar() {
    if (!isLinkedInReturnVisit()) return;
    var sandboxKey = resolveSandboxKey();
    var launchScript = resolveCrossTabLaunchScript(sandboxKey);
    seedCrossTabSessionState(sandboxKey, launchScript);
    forceEnvBarMinimized('envBar.ready');
  }

  bootstrapEarly();

  whenEnvBarReady(bootstrapAfterEnvBar);

  global.addEventListener('aep-demo-env-strip-mounted', function () {
    if (!isLinkedInReturnVisit()) return;
    forceEnvBarMinimized('env-strip-mounted');
  });

  global.addEventListener('aep-demo-env-configured', function () {
    if (!isLinkedInReturnVisit()) return;
    forceEnvBarMinimized('env-configured');
  });

  global.addEventListener('aep-lab-env-bar-prefs-synced', function () {
    if (!isLinkedInReturnVisit()) return;
    bootstrapAfterEnvBar();
  });

  global.ArmcomLinkedInReturn = {
    getReturnSource: getReturnSource,
    isLinkedInReturnVisit: isLinkedInReturnVisit,
    isLinkedInAdReturnVisit: isLinkedInAdReturnVisit,
    isLinkedInOrganicReturnVisit: isLinkedInOrganicReturnVisit,
    enablePresenterMode: enablePresenterMode,
    seedCrossTabSessionState: seedCrossTabSessionState,
    forceEnvBarMinimized: forceEnvBarMinimized,
  };
})(typeof window !== 'undefined' ? window : globalThis);
