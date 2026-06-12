/**
 * Re-injects the persisted Adobe Launch / Web SDK script on each Aviva journey page load.
 * Parent lab shell (aviva-target-demo.html) stores config via DemoTagsInjection storagePrefix avivaTarget.
 * Skipped during Target VEC compose only (adobe_authoring_enabled). Activity QA (at_preview)
 * still needs Launch so Web SDK can apply preview offers.
 */
(function (global) {
  'use strict';

  function isVecCompose() {
    if (global.AvivaTargetVec && typeof global.AvivaTargetVec.isVecCompose === 'function') {
      return global.AvivaTargetVec.isVecCompose();
    }
    var s = String((location.search || '') + (location.hash || '')).toLowerCase();
    return s.indexOf('adobe_authoring_enabled') !== -1 || s.indexOf('mboxdisable=1') !== -1;
  }

  if (isVecCompose()) return;

  var STORAGE_PREFIX = 'avivaTarget';
  var SCRIPT_MARKER = 'data-aviva-target-launch';

  function getSandboxKey() {
    try {
      var raw = (localStorage.getItem('aepGlobalSandboxName') || '').toLowerCase();
      return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
    } catch (e) {
      return '__default__';
    }
  }

  function readStorageMap(key) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function sanitiseLaunchScriptUrl(raw) {
    var v = String(raw || '').trim();
    if (!v) return '';
    var m = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i.exec(v);
    if (m) v = m[1].trim();
    if (/^http:\/\/assets\.adobedtm\.com/i.test(v)) v = v.replace(/^http:/i, 'https:');
    if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    if (!/^https:\/\/assets\.adobedtm\.com\//i.test(v)) return '';
    return v;
  }

  function readPersistedLaunchUrl() {
    var configured = readStorageMap(STORAGE_PREFIX + 'SdkConfiguredBySandbox');
    if (configured[getSandboxKey()] !== 1) return '';
    var scripts = readStorageMap(STORAGE_PREFIX + 'SelectedLaunchScriptBySandbox');
    return sanitiseLaunchScriptUrl(scripts[getSandboxKey()] || '');
  }

  function notifyLaunchReady() {
    try {
      global.dispatchEvent(new CustomEvent('aviva-target-launch-injected'));
    } catch (e) {}
  }

  function injectLaunchScript(url) {
    if (!url || document.querySelector('script[' + SCRIPT_MARKER + '="1"]')) return false;
    var script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.setAttribute(SCRIPT_MARKER, '1');
    script.addEventListener('load', notifyLaunchReady);
    script.addEventListener('error', function () {
      if (global.console && global.console.warn) {
        global.console.warn('[AvivaTarget] Launch script failed to load — re-inject from the lab strip.');
      }
    });
    (document.head || document.documentElement).appendChild(script);
    return true;
  }

  if (!injectLaunchScript(readPersistedLaunchUrl()) && typeof global.alloy === 'function') {
    global.setTimeout(notifyLaunchReady, 0);
  }
})(window);
