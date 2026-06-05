/**
 * Re-injects the persisted Adobe Launch / Web SDK script on each Aviva journey page load.
 * Parent lab shell (aviva-target-demo.html) stores config via DemoTagsInjection storagePrefix avivaTarget.
 * Skipped during Target VEC authoring so Alloy/Launch does not fight the composer.
 */
(function () {
  'use strict';

  function isVecAuthoring() {
    if (window.AvivaTargetVec && typeof window.AvivaTargetVec.isAuthoring === 'function') {
      return window.AvivaTargetVec.isAuthoring();
    }
    var s = String((location.search || '')).toLowerCase();
    return (
      s.indexOf('adobe_authoring_enabled') !== -1 ||
      s.indexOf('mboxdisable=1') !== -1 ||
      s.indexOf('at_preview') !== -1
    );
  }

  if (isVecAuthoring()) return;

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

  function injectLaunchScript(url) {
    if (!url || document.querySelector('script[' + SCRIPT_MARKER + '="1"]')) return;
    var script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.setAttribute(SCRIPT_MARKER, '1');
    (document.head || document.documentElement).appendChild(script);
  }

  injectLaunchScript(readPersistedLaunchUrl());
})();
