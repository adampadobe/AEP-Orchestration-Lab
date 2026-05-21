/**
 * AepBcToggle — Brand Concierge lifecycle helper for demo park sites.
 *
 * Usage in a park demo JS:
 *   AepBcToggle.savePrefs('ferrariworld', true, 'miral');  // save checkbox + select
 *   AepBcToggle.loadPrefs('ferrariworld');                  // { enabled, styleKey }
 *   AepBcToggle.enableIfPrefsSet('ferrariworld');           // call post-inject/onEcidResolved
 *   AepBcToggle.enable('miral');                            // force-enable immediately
 */
(function (global) {
  'use strict';

  var BC_MAIN_JS =
    'https://experience-stage.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js';
  var LOG_TAG = '[AepBcToggle]';
  var _lastStyleKey = null;

  function log() {
    try {
      var args = [LOG_TAG].concat(Array.prototype.slice.call(arguments));
      global.console && global.console.log && global.console.log.apply(global.console, args);
    } catch (_e) {}
  }

  function prefsKey(prefix) {
    return (prefix || 'aepBc') + 'BrandConciergePrefs';
  }

  function savePrefs(storagePrefix, enabled, styleKey) {
    try {
      localStorage.setItem(
        prefsKey(storagePrefix),
        JSON.stringify({ enabled: !!enabled, styleKey: styleKey || 'miral' })
      );
    } catch (_e) {}
  }

  function loadPrefs(storagePrefix) {
    try {
      var raw = localStorage.getItem(prefsKey(storagePrefix));
      if (!raw) return { enabled: false, styleKey: 'miral' };
      var p = JSON.parse(raw);
      return { enabled: !!p.enabled, styleKey: p.styleKey || 'miral' };
    } catch (_e) {
      return { enabled: false, styleKey: 'miral' };
    }
  }

  function ensureMainJs() {
    if (document.querySelector("script[data-aep-bc-toggle-main='1']")) return;
    var s = document.createElement('script');
    s.async = true;
    s.setAttribute('data-aep-bc-toggle-main', '1');
    s.src = BC_MAIN_JS;
    s.onerror = function () { log('failed to load main.js'); };
    document.head.appendChild(s);
    log('loading main.js');
  }

  /**
   * Reopen the BC panel after the widget's own X button closed it.
   * Removes our CSS-dismissed state, calls the native open API if available,
   * or tears down the mount and re-bootstraps so the panel reliably reappears.
   * The widget keeps its DOM when closed (children.length stays > 0), so we
   * cannot gate on that — always re-mount when there is no native open API.
   */
  function reopen(styleKey) {
    document.body.classList.remove('aep-bc-panel-dismissed');
    var key = styleKey || _lastStyleKey || 'miral';
    if (global.adobe && global.adobe.concierge && typeof global.adobe.concierge.open === 'function') {
      global.adobe.concierge.open();
      return;
    }
    var mount = document.getElementById('brand-concierge-mount');
    if (mount) mount.innerHTML = '';
    global.__aepBcToggleBootstrapped = false;
    enable(key);
  }

  /**
   * Enable Brand Concierge immediately with the given style key.
   * Sets window.styleConfiguration from window.aepBcStyles[styleKey] then waits
   * for alloy + window.adobe.concierge to be available before bootstrapping.
   */

  function enable(styleKey, onDone) {
    var key = styleKey || 'miral';
    _lastStyleKey = key;
    var styles = global.aepBcStyles;

    if (styles && styles[key]) {
      global.styleConfiguration = styles[key];
      log('styleConfiguration set to', key);
    } else {
      log('no style config found for key', key, '— using existing window.styleConfiguration');
    }

    if (global.__aepBcToggleBootstrapped) {
      log('already bootstrapped, skip');
      if (typeof onDone === 'function') onDone(true);
      return;
    }

    ensureMainJs();

    var maxWaitMs = 30000;
    var start = Date.now();

    function tick() {
      if (Date.now() - start > maxWaitMs) {
        log('bootstrap timed out after ' + maxWaitMs + 'ms');
        if (typeof onDone === 'function') onDone(false);
        return;
      }

      var alloyOk = typeof global.alloy === 'function';
      var conciergeOk = !!(
        global.adobe &&
        global.adobe.concierge &&
        typeof global.adobe.concierge.bootstrap === 'function'
      );

      if (!alloyOk || !conciergeOk) {
        global.setTimeout(tick, 100);
        return;
      }

      global.__aepBcToggleBootstrapped = true;
      try {
        global.adobe.concierge.bootstrap({
          instanceName: 'alloy',
          stylingConfigurations: global.styleConfiguration,
          selector: '#brand-concierge-mount',
          stickySession: false,
        });
        log('bootstrapped OK with style', key);
        if (typeof onDone === 'function') onDone(true);
      } catch (e) {
        log('bootstrap threw', e);
        if (typeof onDone === 'function') onDone(false);
      }
    }

    tick();
  }

  /** Call this from onEcidResolved or post-inject hook — enables BC if user toggled it on. */
  function enableIfPrefsSet(storagePrefix) {
    var prefs = loadPrefs(storagePrefix);
    if (prefs.enabled) {
      log('prefs say enabled for', storagePrefix, 'style=', prefs.styleKey);
      enable(prefs.styleKey);
    }
  }

  global.AepBcToggle = {
    enable: enable,
    reopen: reopen,
    enableIfPrefsSet: enableIfPrefsSet,
    savePrefs: savePrefs,
    loadPrefs: loadPrefs,
  };
})(typeof window !== 'undefined' ? window : this);
