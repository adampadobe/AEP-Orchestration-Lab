import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'profile-viewer');
const mod = fs.readFileSync(path.join(root, 'mod-demo.js'), 'utf8');

const start = mod.indexOf('const SC_BC_STYLE_URL_BY_SANDBOX_KEY');
const end = mod.indexOf('/** Suppress Tags-inject BC');
let body = mod.slice(start, end);

body = body
  .replace(/BySandboxBySandbox/g, 'BySandbox')
  .replace(/MOD_BC_DEFAULT/g, 'SC_BC_DEFAULT')
  .replace(/getModSandboxKey\(\)/g, 'getSandboxKey()')
  .replace(/migrateLegacyModScalar/g, 'migrateLegacyScalar')
  .replace(/readModStorageMap/g, 'readStorageMap')
  .replace(/writeModStorageMap/g, 'writeStorageMap')
  .replace(/readModSandboxString/g, 'readSandboxString')
  .replace(/writeModSandboxString/g, 'writeSandboxString')
  .replace(/writeModSandboxStringForKey/g, 'writeSandboxStringForKey')
  .replace(/readModSandboxStringForKey/g, 'readSandboxStringForKey')
  .replace(/getSiteCloneBcSandboxName/g, 'getSandboxDisplayName')
  .replace(/normaliseModBcDisplayPrefs/g, 'normaliseDisplayPrefs')
  .replace(/flushModDemoEnvForSandboxKey/g, 'flushEnvForSandboxKey')
  .replace(/applyModDemoEnvForCurrentSandbox/g, 'applyEnvForCurrentSandbox')
  .replace(/modDemoEnvSandboxKey/g, 'envSandboxKey')
  .replace(/MOD_WEB_PUSH_BY_SANDBOX_KEY/g, 'WEB_PUSH_BY_SANDBOX_KEY')
  .replace(/modWebPushOnInjectToggle/g, 'webPushOnInjectToggle')
  .replace(/readModWebPushOnInject/g, 'readWebPushOnInject')
  .replace(/writeModWebPushOnInject/g, 'writeWebPushOnInject')
  .replace(/applyModWebPushOnInjectToggle/g, 'applyWebPushOnInjectToggle')
  .replace(/modBcOnInjectToggle/g, 'bcOnInjectToggle')
  .replace(/modBcStyleSelect/g, 'bcStyleSelect');

const header = `/**
 * Shared Brand Concierge env strip (style URL, datastream, display modes).
 * Configure per page: window.SiteCloneDemoEnv = { storagePrefix, webPushBySandboxKey, ... }
 */
(function (global) {
  'use strict';

  function env() {
    return global.SiteCloneDemoEnv || {};
  }

  function storagePrefix() {
    return String(env().storagePrefix || 'siteCloneDemo');
  }

  function webPushBySandboxKey() {
    return String(env().webPushBySandboxKey || storagePrefix() + 'WebPushOnInjectBySandbox');
  }

  function webPushLegacyKey() {
    return String(env().webPushLegacyKey || storagePrefix() + 'WebPushOnInjectToggle');
  }

  function readStorageMap(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeStorageMap(key, mapObj) {
    try {
      localStorage.setItem(key, JSON.stringify(mapObj || {}));
    } catch {
      /* noop */
    }
  }

  function getSandboxDisplayName() {
    if (typeof global.AepGlobalSandbox !== 'undefined' && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      return String(global.AepGlobalSandbox.getSandboxName() || '').trim();
    }
    const sel = document.getElementById('sandboxSelect');
    if (sel && sel.value) return String(sel.value).trim();
    return '';
  }

  function getSandboxKey() {
    const raw = getSandboxDisplayName().toLowerCase();
    return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
  }

  function migrateLegacyScalar(mapKey, legacyKey, transform) {
    const map = readStorageMap(mapKey);
    const sk = getSandboxKey();
    if (map[sk] != null && map[sk] !== '') return;
    try {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy == null || legacy === '') return;
      map[sk] = transform ? transform(legacy) : legacy;
      writeStorageMap(mapKey, map);
    } catch {
      /* noop */
    }
  }

  function readSandboxString(mapKey, legacyKey, normaliser, fallback) {
    migrateLegacyScalar(mapKey, legacyKey, normaliser);
    const raw = readStorageMap(mapKey)[getSandboxKey()];
    const v = String(raw != null ? raw : '').trim();
    if (!v) return fallback;
    return normaliser ? normaliser(v) : v;
  }

  function writeSandboxString(mapKey, value) {
    writeSandboxStringForKey(mapKey, getSandboxKey(), value);
  }

  function writeSandboxStringForKey(mapKey, sandboxKey, value) {
    const map = readStorageMap(mapKey);
    const key = String(sandboxKey || '').trim() || '__default__';
    const v = String(value != null ? value : '').trim();
    if (!v) delete map[key];
    else map[key] = v;
    writeStorageMap(mapKey, map);
  }

  function readSandboxStringForKey(mapKey, sandboxKey, normaliser, fallback) {
    const raw = readStorageMap(mapKey)[String(sandboxKey || '').trim() || '__default__'];
    const v = String(raw != null ? raw : '').trim();
    if (!v) return fallback;
    return normaliser ? normaliser(v) : v;
  }

  let envSandboxKey = getSandboxKey();

  const webPushOnInjectToggle = document.getElementById(env().webPushToggleId || '');

  function readWebPushOnInject() {
    migrateLegacyScalar(webPushBySandboxKey(), webPushLegacyKey());
    return readStorageMap(webPushBySandboxKey())[getSandboxKey()] === '1';
  }

  function writeWebPushOnInject(on) {
    const map = readStorageMap(webPushBySandboxKey());
    map[getSandboxKey()] = on ? '1' : '0';
    writeStorageMap(webPushBySandboxKey(), map);
  }

  function applyWebPushOnInjectToggle() {
    if (!webPushOnInjectToggle) return;
    webPushOnInjectToggle.checked = readWebPushOnInject();
  }

  const bcOnInjectToggle = document.getElementById(env().bcOnInjectToggleId || '');
  const bcStyleSelect = document.getElementById(env().bcStyleSelectId || '');

  function applyBcOnInjectPrefs() {
    if (!bcOnInjectToggle) return;
    const prefs =
      typeof global.AepBcToggle !== 'undefined'
        ? global.AepBcToggle.loadPrefs(storagePrefix())
        : { enabled: false, styleKey: 'miral' };
    bcOnInjectToggle.checked = !!prefs.enabled;
    if (bcStyleSelect && prefs.styleKey) bcStyleSelect.value = prefs.styleKey;
  }

  function saveBcOnInjectPrefs() {
    if (typeof global.AepBcToggle === 'undefined') return;
    global.AepBcToggle.savePrefs(
      storagePrefix(),
      !!(bcOnInjectToggle && bcOnInjectToggle.checked),
      bcStyleSelect ? bcStyleSelect.value : 'miral',
    );
  }

  (function initBcOnInjectToggle() {
    if (!bcOnInjectToggle) return;
    applyBcOnInjectPrefs();
    bcOnInjectToggle.addEventListener('change', saveBcOnInjectPrefs);
    if (bcStyleSelect) bcStyleSelect.addEventListener('change', saveBcOnInjectPrefs);
  })();

`;

const footer = `
  function flushEnvForSandboxKey(sandboxKey) {
    const sk = String(sandboxKey || '').trim();
    if (!sk) return;
    if (siteCloneBcStyleConfigUrl && siteCloneBcStyleConfigUrl.value.trim()) {
      writeSandboxStringForKey(
        SC_BC_STYLE_URL_BY_SANDBOX_KEY,
        sk,
        sanitiseSiteCloneBcStyleConfigUrl(siteCloneBcStyleConfigUrl.value),
      );
    }
    const dsFromInput = resolveSiteCloneBcDatastreamIdFromInput();
    if (dsFromInput) {
      writeSandboxStringForKey(SC_BC_DATASTREAM_BY_SANDBOX_KEY, sk, sanitiseSiteCloneBcDatastreamId(dsFromInput));
    } else if (siteCloneBcDatastreamId && siteCloneBcDatastreamId.value.trim()) {
      writeSandboxStringForKey(
        SC_BC_DATASTREAM_BY_SANDBOX_KEY,
        sk,
        sanitiseSiteCloneBcDatastreamId(siteCloneBcDatastreamId.value.trim()),
      );
    }
    saveSiteCloneBcDisplayPrefs(sk);
    const map = readStorageMap(webPushBySandboxKey());
    map[sk] = webPushOnInjectToggle && webPushOnInjectToggle.checked ? '1' : '0';
    writeStorageMap(webPushBySandboxKey(), map);
    if (typeof global.AepBcToggle !== 'undefined' && bcOnInjectToggle) {
      global.AepBcToggle.savePrefs(
        storagePrefix(),
        !!bcOnInjectToggle.checked,
        bcStyleSelect ? bcStyleSelect.value : 'miral',
        sk,
      );
    }
  }

  function applyEnvForCurrentSandbox() {
    if (typeof env().applyWebPushToggle === 'function') env().applyWebPushToggle();
    else applyWebPushOnInjectToggle();
    applyBcOnInjectPrefs();
    if (siteCloneBcStyleConfigUrl) {
      siteCloneBcStyleConfigUrl.value = readPersistedSiteCloneBcStyleConfigUrl();
      refreshSiteCloneBcStyleUrlHints();
    }
    applySiteCloneBcDisplayPrefsToUi();
    invalidateSiteCloneBcCore();
    syncSiteCloneBcFromPrefs();
    void loadSiteCloneBcDatastreams();
    envSandboxKey = getSandboxKey();
  }

  global.addEventListener('aep-global-sandbox-change', function () {
    if (envSandboxKey) flushEnvForSandboxKey(envSandboxKey);
    envSandboxKey = getSandboxKey();
    applyEnvForCurrentSandbox();
  });

  envSandboxKey = getSandboxKey();
  applyEnvForCurrentSandbox();

  global.SiteCloneBcEnv = {
    applyForCurrentSandbox: applyEnvForCurrentSandbox,
    flushForSandboxKey: flushEnvForSandboxKey,
    getSandboxKey: getSandboxKey,
  };
})(typeof window !== 'undefined' ? window : this);
`;

fs.writeFileSync(path.join(root, 'site-clone-bc-env.js'), header + body + footer);
console.log('wrote site-clone-bc-env.js');
