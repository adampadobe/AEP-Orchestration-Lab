/**
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
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
      return global.AepLabEnvBarPrefs.readMap(key);
    }
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
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.writeMap === 'function') {
      global.AepLabEnvBarPrefs.writeMap(key, mapObj || {});
      return;
    }
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
    if (!legacyKey || legacyKey === mapKey) return;
    const map = readStorageMap(mapKey);
    const sk = getSandboxKey();
    if (map[sk] != null && map[sk] !== '') return;
    try {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy == null || legacy === '') return;
      const trimmed = String(legacy).trim();
      if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') return;
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

  let envSandboxKey = null;
  let sandboxEnvSwitching = false;
  let datastreamLoadGen = 0;

  /** Strip fields mount async via shared/env-bar.js — refresh refs after aep-demo-env-strip-mounted. */
  let webPushOnInjectToggle = null;
  let bcOnInjectToggle = null;
  let bcStyleSelect = null;
  let siteCloneBcStyleConfigUrl = null;
  let siteCloneBcFullScreenToggle = null;
  let siteCloneBcModalToggle = null;
  let siteCloneBcInjectedToggle = null;
  let siteCloneBcBottomDockToggle = null;
  let siteCloneBcModalBarToggle = null;
  let siteCloneDecisioningEnabledToggle = null;
  let stripDomListenersBound = false;

  function refreshStripDomRefs() {
    webPushOnInjectToggle = document.getElementById(env().webPushToggleId || '');
    bcOnInjectToggle = document.getElementById(env().bcOnInjectToggleId || '');
    bcStyleSelect = document.getElementById(env().bcStyleSelectId || '');
    siteCloneBcStyleConfigUrl = document.getElementById('siteCloneBcStyleConfigUrl');
    siteCloneBcFullScreenToggle = document.getElementById('siteCloneBcFullScreenToggle');
    siteCloneBcModalToggle = document.getElementById('siteCloneBcModalToggle');
    siteCloneBcInjectedToggle = document.getElementById('siteCloneBcInjectedToggle');
    siteCloneBcBottomDockToggle = document.getElementById('siteCloneBcBottomDockToggle');
    siteCloneBcModalBarToggle = document.getElementById('siteCloneBcModalBarToggle');
    siteCloneDecisioningEnabledToggle = document.getElementById('siteCloneDecisioningEnabledToggle');
  }

  function stripDomIsMounted() {
    refreshStripDomRefs();
    return !!(
      siteCloneBcStyleConfigUrl ||
      siteCloneBcDatastreamEl() ||
      webPushOnInjectToggle ||
      bcOnInjectToggle ||
      siteCloneBcFullScreenToggle
    );
  }

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

const SC_BC_STYLE_URL_BY_SANDBOX_KEY = 'siteCloneBcStyleConfigUrlBySandbox';
const SC_BC_STYLE_URL_LEGACY_SCALAR = 'siteCloneBcStyleConfigUrl';
const SC_BC_DEFAULT_STYLE_URL = 'embed-bc/styleConfigurations-6a0992.js';

/** @type {Array<{ relPath: string, cdnUrl: string }>} */
let siteCloneBcStyleConfigOptions = [];
let styleConfigLoadGen = 0;

function absoluteStyleConfigCdnUrl(cdnPath) {
  const p = String(cdnPath || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const origin = global.location && global.location.origin ? global.location.origin : '';
  return origin + p;
}

function normaliseStyleConfigPickerValue(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (/^\/cdn\/.+\.js$/i.test(u.pathname)) return u.pathname;
    } catch {
      /* noop */
    }
    return v;
  }
  return v;
}

function isJsStyleConfigLibraryItem(item) {
  if (!item || !item.relPath) return false;
  if (/\.js$/i.test(item.relPath)) return true;
  const ct = String(item.contentType || '').toLowerCase();
  return ct.indexOf('javascript') !== -1;
}

function sanitiseSiteCloneBcStyleConfigUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return SC_BC_DEFAULT_STYLE_URL;
  if (/^javascript:/i.test(v)) return SC_BC_DEFAULT_STYLE_URL;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\/cdn\//i.test(v)) return v;
  if (/^[a-z0-9_./-]+\.(js|json)$/i.test(v)) return v;
  return SC_BC_DEFAULT_STYLE_URL;
}

function readPersistedSiteCloneBcStyleConfigUrl(sandboxKey) {
  migrateLegacyScalar(SC_BC_STYLE_URL_BY_SANDBOX_KEY, SC_BC_STYLE_URL_LEGACY_SCALAR, sanitiseSiteCloneBcStyleConfigUrl);
  const sk = sandboxKey != null ? sandboxKey : getSandboxKey();
  const stored = readSandboxStringForKey(
    SC_BC_STYLE_URL_BY_SANDBOX_KEY,
    sk,
    sanitiseSiteCloneBcStyleConfigUrl,
    '',
  );
  return stored || SC_BC_DEFAULT_STYLE_URL;
}

function getSiteCloneBcStyleConfigUrl() {
  if (siteCloneBcStyleConfigUrl && siteCloneBcStyleConfigUrl.value.trim()) {
    return sanitiseSiteCloneBcStyleConfigUrl(siteCloneBcStyleConfigUrl.value);
  }
  return readPersistedSiteCloneBcStyleConfigUrl();
}

function saveSiteCloneBcStyleConfigUrl() {
  if (sandboxEnvSwitching) return;
  let url = siteCloneBcStyleConfigUrl
    ? sanitiseSiteCloneBcStyleConfigUrl(siteCloneBcStyleConfigUrl.value)
    : readPersistedSiteCloneBcStyleConfigUrl();
  const normalised = normaliseStyleConfigPickerValue(url);
  if (normalised && /^\/cdn\//i.test(normalised)) url = normalised;
  if (siteCloneBcStyleConfigUrl && siteCloneBcStyleConfigUrl.value.trim() !== url) {
    siteCloneBcStyleConfigUrl.value = url;
  }
  writeSandboxString(SC_BC_STYLE_URL_BY_SANDBOX_KEY, url);
  refreshSiteCloneBcStyleUrlHints();
}

function getSiteCloneBcStyleConfigResolvedUrl() {
  const raw = getSiteCloneBcStyleConfigUrl();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.charAt(0) === '/') return raw;
  const pageDir = window.location.pathname.replace(/\/[^/]*$/, '/');
  return pageDir + raw.replace(/^\.\//, '');
}

function refreshSiteCloneBcStyleUrlHints() {
  const url = getSiteCloneBcStyleConfigUrl();
  const resolved = getSiteCloneBcStyleConfigResolvedUrl();
  const hint = document.getElementById('siteCloneBcStyleConfigResolved');
  if (hint) {
    if (!resolved) {
      hint.textContent = '';
    } else if (siteCloneBcStyleConfigOptions.length) {
      hint.textContent =
        siteCloneBcStyleConfigOptions.length +
        ' hosted .js file(s) · loaded for Modal / Injected / Full Screen: ' +
        resolved;
    } else {
      hint.textContent = 'Loaded for Modal / Injected / Full Screen: ' + resolved;
    }
  }
  ['siteCloneBcFullScreenToggle', 'siteCloneBcModalToggle', 'siteCloneBcInjectedToggle'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('data-site-clone-bc-style-url', url);
  });
}

function renderSiteCloneBcStyleConfigSelect(persistedValue) {
  if (!siteCloneBcStyleConfigUrl || siteCloneBcStyleConfigUrl.tagName !== 'SELECT') return;
  const stored = normaliseStyleConfigPickerValue(persistedValue || readPersistedSiteCloneBcStyleConfigUrl());
  siteCloneBcStyleConfigUrl.innerHTML = '';

  const builtinGroup = document.createElement('optgroup');
  builtinGroup.label = 'Built-in';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = SC_BC_DEFAULT_STYLE_URL;
  defaultOpt.textContent = 'Default (styleConfigurations-6a0992.js)';
  builtinGroup.appendChild(defaultOpt);
  siteCloneBcStyleConfigUrl.appendChild(builtinGroup);

  const libraryGroup = document.createElement('optgroup');
  libraryGroup.label = 'Image hosting';
  if (siteCloneBcStyleConfigOptions.length) {
    siteCloneBcStyleConfigOptions.forEach(function (item) {
      const opt = document.createElement('option');
      opt.value = item.cdnUrl;
      opt.textContent = item.relPath;
      libraryGroup.appendChild(opt);
    });
  } else {
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.disabled = true;
    emptyOpt.textContent = 'No .js files in library';
    libraryGroup.appendChild(emptyOpt);
  }
  siteCloneBcStyleConfigUrl.appendChild(libraryGroup);

  let matched = '';
  if (stored) {
    const opts = siteCloneBcStyleConfigUrl.options;
    for (let i = 0; i < opts.length; i++) {
      const optVal = opts[i].value;
      if (!optVal) continue;
      if (optVal === stored || normaliseStyleConfigPickerValue(optVal) === stored) {
        matched = optVal;
        break;
      }
      if (/^https?:\/\//i.test(stored) && absoluteStyleConfigCdnUrl(optVal) === stored) {
        matched = optVal;
        break;
      }
    }
  }

  if (!matched && stored && stored !== SC_BC_DEFAULT_STYLE_URL) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = 'Saved (not in library)';
    const customOpt = document.createElement('option');
    customOpt.value = stored;
    customOpt.textContent = stored.replace(/^\/cdn\/[^/]+\//, '').replace(/^https?:\/\/[^/]+\/cdn\/[^/]+\//, '');
    customGroup.appendChild(customOpt);
    siteCloneBcStyleConfigUrl.appendChild(customGroup);
    matched = stored;
  }

  siteCloneBcStyleConfigUrl.value = matched || SC_BC_DEFAULT_STYLE_URL;
}

function applySiteCloneBcStyleConfigFieldForSandbox(sandboxKey) {
  if (!siteCloneBcStyleConfigUrl) return;
  const stored = readPersistedSiteCloneBcStyleConfigUrl(sandboxKey);
  if (siteCloneBcStyleConfigUrl.tagName === 'SELECT') {
    renderSiteCloneBcStyleConfigSelect(stored);
  } else {
    siteCloneBcStyleConfigUrl.value = stored;
  }
  refreshSiteCloneBcStyleUrlHints();
}

async function loadSiteCloneBcStyleConfigs() {
  const loadGen = ++styleConfigLoadGen;
  const sandbox = getSandboxDisplayName();
  const sandboxKeyAtStart = getSandboxKey();
  const hint = document.getElementById('siteCloneBcStyleConfigResolved');
  if (hint && siteCloneBcStyleConfigUrl && siteCloneBcStyleConfigUrl.tagName === 'SELECT') {
    hint.textContent = sandbox
      ? 'Loading .js style configs from image hosting for ' + sandbox + '…'
      : 'Loading .js style configs from image hosting…';
  }
  try {
    const params = new URLSearchParams();
    if (sandbox) params.set('sandbox', sandbox);
    const res = await fetch('/api/image-hosting/library?' + params.toString(), { credentials: 'same-origin' });
    const data = await res.json().catch(function () {
      return {};
    });
    if (loadGen !== styleConfigLoadGen || sandboxKeyAtStart !== getSandboxKey()) return;

    const items = Array.isArray(data.items) ? data.items : [];
    siteCloneBcStyleConfigOptions = items
      .filter(isJsStyleConfigLibraryItem)
      .map(function (item) {
        return { relPath: String(item.relPath || ''), cdnUrl: String(item.cdnUrl || '') };
      })
      .filter(function (item) {
        return item.cdnUrl && item.relPath;
      });

    applySiteCloneBcStyleConfigFieldForSandbox(sandboxKeyAtStart);

    if (hint && siteCloneBcStyleConfigUrl && siteCloneBcStyleConfigUrl.tagName === 'SELECT') {
      if (data.error && !siteCloneBcStyleConfigOptions.length) {
        hint.textContent = String(data.error);
      } else if (!siteCloneBcStyleConfigOptions.length) {
        hint.textContent =
          'No .js files in image hosting for this sandbox — upload styling-config-*.js in Image hosting, or use the built-in default.';
      } else {
        refreshSiteCloneBcStyleUrlHints();
      }
    }
  } catch (err) {
    if (loadGen !== styleConfigLoadGen || sandboxKeyAtStart !== getSandboxKey()) return;
    siteCloneBcStyleConfigOptions = [];
    applySiteCloneBcStyleConfigFieldForSandbox(sandboxKeyAtStart);
    if (hint) {
      hint.textContent =
        'Could not load image hosting library' +
        (err && err.message ? ': ' + err.message : '') +
        '. Using built-in default or saved value.';
    }
  }
}

function invalidateSiteCloneBcCore() {
  if (typeof window.SiteCloneBc !== 'undefined' && typeof window.SiteCloneBc.invalidateCore === 'function') {
    window.SiteCloneBc.invalidateCore();
  }
}

const SC_BC_DATASTREAM_BY_SANDBOX_KEY = 'siteCloneBcDatastreamIdBySandbox';
const SC_BC_DATASTREAM_LEGACY_SCALAR = 'siteCloneBcDatastreamId';
const SC_BC_DATASTREAM_RECENT_BY_SANDBOX_KEY = 'siteCloneBcDatastreamRecentBySandbox';
const DATASTREAM_RECENT_MAX = 5;

/** Filter console with `[AEP lab datastream]`. Disable: localStorage.removeItem('aepLabDatastreamDebug') */
function datastreamDebugEnabled() {
  try {
    if (global.localStorage && global.localStorage.getItem('aepLabDatastreamDebug') === '0') return false;
  } catch (_lsErr) {
    /* noop */
  }
  return true;
}

function datastreamDebugLog() {
  if (!datastreamDebugEnabled()) return;
  if (typeof console === 'undefined' || typeof console.log !== 'function') return;
  const args = ['[AEP lab datastream]'].concat(Array.prototype.slice.call(arguments));
  console.log.apply(console, args);
}

function activeSiteCloneBcEnvStripRoot() {
  const selectors = [
    '.lab-env-top-anchor--expanded .lab-env-overlay-panel:not([hidden])',
    '.lab-env-top-anchor--pinned .lab-env-overlay-panel:not([hidden])',
    '.lab-env-overlay-panel:not([hidden])',
    '.aep-demo-env-bar--spectrum',
    '.site-clone-bc-env-strip',
  ];
  for (let i = 0; i < selectors.length; i++) {
    const el = document.querySelector(selectors[i]);
    if (el && el.querySelector('#siteCloneBcDatastreamId')) return el;
  }
  return null;
}

function findSiteCloneBcDatastreamHint(preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  if (root) {
    const scoped = root.querySelector('#siteCloneBcDatastreamHint');
    if (scoped) return scoped;
  }
  return document.getElementById('siteCloneBcDatastreamHint');
}

function resolveDatastreamFieldRoot(fromNode) {
  if (fromNode && typeof fromNode.closest === 'function') {
    return (
      fromNode.closest('.site-clone-bc-datastream-row') ||
      fromNode.closest('.spectrum-env-field') ||
      fromNode.closest('.site-clone-bc-env-product-block') ||
      fromNode.closest('.site-clone-bc-env-strip') ||
      activeSiteCloneBcEnvStripRoot()
    );
  }
  return activeSiteCloneBcEnvStripRoot();
}

function siteCloneBcDatastreamEl(preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  if (root) {
    const scoped = root.querySelector('#siteCloneBcDatastreamId');
    if (scoped) return scoped;
  }
  return document.getElementById('siteCloneBcDatastreamId');
}

const DATASTREAM_ENTER_UUID_VALUE = '__lab_enter_datastream_uuid__';

/** @type {Array<{ id: string, title: string, sandbox?: string }>} */
let siteCloneBcAllDatastreamOptions = [];

function sanitiseSiteCloneBcDatastreamId(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v.toLowerCase();
  return '';
}

function datastreamLabelFromItem(d) {
  const title = String((d && d.title) || 'Unnamed').trim();
  const id = String((d && d.id) || '').trim();
  return title + ' (' + id + ')';
}

function findSiteCloneBcDatastreamByLabel(label) {
  const target = String(label || '').trim().toLowerCase();
  if (!target) return null;
  return (
    siteCloneBcAllDatastreamOptions.find(function (d) {
      return datastreamLabelFromItem(d).toLowerCase() === target;
    }) || null
  );
}

function resolveSiteCloneBcDatastreamIdFromInput(preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  if (isSiteCloneBcDatastreamManualEntryOpen()) {
    const manual = findSiteCloneBcDatastreamManualInput(root);
    if (manual) {
      const manualId = sanitiseSiteCloneBcDatastreamId(manual.value);
      if (manualId) return manualId;
    }
  }
  const el = siteCloneBcDatastreamEl(root);
  if (!el) return '';
  const raw = String(el.value || '').trim();
  if (!raw || raw === DATASTREAM_ENTER_UUID_VALUE) return '';
  if (el.tagName === 'SELECT') {
    return sanitiseSiteCloneBcDatastreamId(raw);
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  const hit = findSiteCloneBcDatastreamByLabel(raw);
  if (hit && hit.id) return String(hit.id).toLowerCase();
  return '';
}

function extractDatastreamUuidFromField(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return v.toLowerCase();
  }
  const m = v.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1].toLowerCase() : '';
}

function readPersistedSiteCloneBcDatastreamId(sandboxKey) {
  migrateLegacyScalar(SC_BC_DATASTREAM_BY_SANDBOX_KEY, SC_BC_DATASTREAM_LEGACY_SCALAR, sanitiseSiteCloneBcDatastreamId);
  const sk = sandboxKey != null ? sandboxKey : getSandboxKey();
  const stored = readSandboxStringForKey(
    SC_BC_DATASTREAM_BY_SANDBOX_KEY,
    sk,
    sanitiseSiteCloneBcDatastreamId,
    '',
  );
  return stored;
}

function getSiteCloneBcDatastreamId(preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  const resolved = resolveSiteCloneBcDatastreamIdFromInput(root);
  if (resolved) return sanitiseSiteCloneBcDatastreamId(resolved);
  const el = siteCloneBcDatastreamEl(root);
  const fromField = el ? extractDatastreamUuidFromField(el.value) : '';
  if (fromField) return sanitiseSiteCloneBcDatastreamId(fromField);
  return readPersistedSiteCloneBcDatastreamId();
}

function readRecentSiteCloneBcDatastreamIds(sandboxKey) {
  const sk = String(sandboxKey != null ? sandboxKey : getSandboxKey()).trim() || '__default__';
  const raw = readStorageMap(SC_BC_DATASTREAM_RECENT_BY_SANDBOX_KEY)[sk];
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach(function (entry) {
    const id = sanitiseSiteCloneBcDatastreamId(entry);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out.slice(0, DATASTREAM_RECENT_MAX);
}

function recordRecentSiteCloneBcDatastreamId(id, sandboxKey) {
  const clean = sanitiseSiteCloneBcDatastreamId(id);
  if (!clean) return;
  const sk = String(sandboxKey != null ? sandboxKey : getSandboxKey()).trim() || '__default__';
  const map = readStorageMap(SC_BC_DATASTREAM_RECENT_BY_SANDBOX_KEY);
  const prev = Array.isArray(map[sk]) ? map[sk] : [];
  const next = [clean].concat(prev.filter(function (entry) {
    return sanitiseSiteCloneBcDatastreamId(entry) !== clean;
  }));
  map[sk] = next.slice(0, DATASTREAM_RECENT_MAX);
  writeStorageMap(SC_BC_DATASTREAM_RECENT_BY_SANDBOX_KEY, map);
}

function datastreamOptionLabelForId(id) {
  const clean = sanitiseSiteCloneBcDatastreamId(id);
  if (!clean) return '';
  const hit = siteCloneBcAllDatastreamOptions.find(function (d) {
    return String(d.id || '').toLowerCase() === clean;
  });
  return hit ? datastreamLabelFromItem(hit) : clean;
}

function renderSiteCloneBcDatastreamSelectOptions(opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const root = options.root || activeSiteCloneBcEnvStripRoot();
  const el = siteCloneBcDatastreamEl(root);
  if (!el || el.tagName !== 'SELECT') return;
  if (isSiteCloneBcDatastreamManualEntryOpen() && !options.selectedId) return;
  const explicitSelected =
    options.selectedId != null ? sanitiseSiteCloneBcDatastreamId(options.selectedId) : '';
  const previous = sanitiseSiteCloneBcDatastreamId(el.value);
  const persisted = readPersistedSiteCloneBcDatastreamId();
  const selectedId = explicitSelected || previous || persisted;
  el.innerHTML = '';
  const seen = new Set();

  function appendOption(value, label) {
    const v = String(value || '').trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = String(label || v);
    el.appendChild(opt);
  }

  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Select datastream';
  el.appendChild(blank);

  readRecentSiteCloneBcDatastreamIds().forEach(function (id) {
    appendOption(id, datastreamOptionLabelForId(id));
  });

  siteCloneBcAllDatastreamOptions.slice(0, 200).forEach(function (d) {
    if (!d || !d.id) return;
    appendOption(String(d.id).toLowerCase(), datastreamLabelFromItem(d));
  });

  if (selectedId && !seen.has(selectedId)) {
    appendOption(selectedId, selectedId + ' (saved)');
  }

  const enterOpt = document.createElement('option');
  enterOpt.value = DATASTREAM_ENTER_UUID_VALUE;
  enterOpt.textContent = 'Enter UUID…';
  el.appendChild(enterOpt);

  if (selectedId && seen.has(selectedId)) {
    el.value = selectedId;
  } else {
    el.value = '';
  }
  datastreamDebugLog('renderSiteCloneBcDatastreamSelectOptions', {
    selectedId: selectedId,
    optionCount: seen.size,
    selectConnected: el.isConnected,
  });
}

function showSiteCloneBcDatastreamApplySuccess(fieldRoot, id) {
  const hint = findSiteCloneBcDatastreamHint(fieldRoot);
  if (!hint) return;
  hint.textContent = 'UUID saved — ' + id + ' is now selected for this sandbox.';
  hint.classList.add('site-clone-bc-datastream-hint--success');
  if (showSiteCloneBcDatastreamApplySuccess._timer) {
    global.clearTimeout(showSiteCloneBcDatastreamApplySuccess._timer);
  }
  showSiteCloneBcDatastreamApplySuccess._timer = global.setTimeout(function () {
    hint.classList.remove('site-clone-bc-datastream-hint--success');
    refreshSiteCloneBcDatastreamHint(fieldRoot);
  }, 5000);
}

function commitSiteCloneBcDatastreamSelection(fieldRoot, id) {
  const clean = sanitiseSiteCloneBcDatastreamId(id);
  if (!clean) return '';
  const dsInput = siteCloneBcDatastreamEl(fieldRoot);
  if (!dsInput) return '';
  writeSandboxString(SC_BC_DATASTREAM_BY_SANDBOX_KEY, clean);
  recordRecentSiteCloneBcDatastreamId(clean);
  setSiteCloneBcDatastreamManualEntryOpen(false, fieldRoot);
  renderSiteCloneBcDatastreamSelectOptions({ root: fieldRoot, selectedId: clean });
  dsInput.value = clean;
  dsInput.removeAttribute('aria-hidden');
  dsInput.tabIndex = 0;
  const manualInput = findSiteCloneBcDatastreamManualInput(fieldRoot);
  if (manualInput) manualInput.value = clean;
  refreshSiteCloneBcDatastreamHint(fieldRoot);
  showSiteCloneBcDatastreamApplySuccess(fieldRoot, clean);
  return clean;
}

function applySiteCloneBcDatastreamInputToStoredId(preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  const id = getSiteCloneBcDatastreamId(root);
  if (siteCloneBcDatastreamEl(root) && id) {
    siteCloneBcDatastreamEl(root).value = id;
  }
  writeSandboxString(SC_BC_DATASTREAM_BY_SANDBOX_KEY, id);
  if (id) recordRecentSiteCloneBcDatastreamId(id);
  renderSiteCloneBcDatastreamSelectOptions({ root: root, selectedId: id });
  if (siteCloneBcDatastreamEl(root) && id) {
    siteCloneBcDatastreamEl(root).value = id;
  }
  refreshSiteCloneBcDatastreamHint(root);
  return id;
}

function saveSiteCloneBcDatastreamId() {
  if (sandboxEnvSwitching) return;
  applySiteCloneBcDatastreamInputToStoredId();
}

function applySiteCloneBcDatastreamFieldForSandbox(sandboxKey) {
  const root = activeSiteCloneBcEnvStripRoot();
  if (!siteCloneBcDatastreamEl(root)) return;
  const storedId = readPersistedSiteCloneBcDatastreamId(sandboxKey);
  renderSiteCloneBcDatastreamSelectOptions({ root: root, selectedId: storedId });
  if (storedId) {
    siteCloneBcDatastreamEl(root).value = storedId;
    recordRecentSiteCloneBcDatastreamId(storedId, sandboxKey);
  }
  syncSiteCloneBcDatastreamManualInputFromStored(storedId, root);
  setSiteCloneBcDatastreamManualEntryOpen(false, root);
  refreshSiteCloneBcDatastreamHint(root);
}

function refreshSiteCloneBcDatastreamHint(preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  const id = getSiteCloneBcDatastreamId(root);
  const hint = findSiteCloneBcDatastreamHint(root);
  const sandbox = getSandboxDisplayName();
  if (!hint) return;
  if (!siteCloneBcAllDatastreamOptions.length) {
    const recent = readRecentSiteCloneBcDatastreamIds();
    const recentNote = recent.length ? ' · ' + recent.length + ' recent in list' : '';
    hint.textContent = id
      ? 'Lab override: ' +
        id +
        (sandbox ? ' · sandbox ' + sandbox : '') +
        recentNote +
        '. Debugger shows Tags Web SDK extension datastream until you publish a new library there.'
      : sandbox
        ? 'Load datastreams for sandbox ' + sandbox + ', or choose Enter UUID…' + recentNote
        : 'Pick a datastream from the list, or choose Enter UUID… to paste a new one.' + recentNote;
    return;
  }
  const recentCount = readRecentSiteCloneBcDatastreamIds().length;
  hint.textContent =
    siteCloneBcAllDatastreamOptions.length +
    ' datastream(s)' +
    (sandbox ? ' for ' + sandbox : '') +
    (recentCount ? ' · ' + recentCount + ' recent' : '') +
    (id ? ' · selected ' + id : ' · none selected — choose Enter UUID… to paste a new one.');
}

const DATASTREAM_MANUAL_ROW_ID = 'siteCloneBcDatastreamUuidManualRow';
const DATASTREAM_MANUAL_INPUT_ID = 'siteCloneBcDatastreamUuidManual';
const DATASTREAM_MANUAL_ERROR_ID = 'siteCloneBcDatastreamUuidManualError';
const DATASTREAM_MANUAL_APPLY_ID = 'siteCloneBcDatastreamUuidManualApply';
const DATASTREAM_MANUAL_CANCEL_ID = 'siteCloneBcDatastreamUuidManualCancel';
const DATASTREAM_MANUAL_FORM_CLASS = 'site-clone-bc-datastream-manual-open';

let siteCloneBcDatastreamManualEntryOpen = false;

function isSiteCloneBcDatastreamManualEntryOpen() {
  return siteCloneBcDatastreamManualEntryOpen;
}

function setSiteCloneBcDatastreamManualEntryOpen(open, preferredRoot) {
  siteCloneBcDatastreamManualEntryOpen = !!open;
  const row = findSiteCloneBcDatastreamManualRow(preferredRoot);
  if (row) {
    if (siteCloneBcDatastreamManualEntryOpen) row.removeAttribute('hidden');
    else row.setAttribute('hidden', '');
  }
  const fieldWrap =
    row &&
    row.closest(
      '.form-group, .form-row, .site-clone-bc-datastream-row, .spectrum-env-field, .site-clone-bc-env-product-block',
    );
  if (fieldWrap) fieldWrap.classList.toggle(DATASTREAM_MANUAL_FORM_CLASS, siteCloneBcDatastreamManualEntryOpen);
  try {
    global.dispatchEvent(
      new CustomEvent('aep-lab-datastream-manual-entry', { detail: { open: siteCloneBcDatastreamManualEntryOpen } }),
    );
  } catch (_evErr) {
    /* ignore */
  }
}

function findSiteCloneBcDatastreamManualRow(preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  if (root) {
    const scoped = root.querySelector('#' + DATASTREAM_MANUAL_ROW_ID);
    if (scoped) return scoped;
  }
  return document.getElementById(DATASTREAM_MANUAL_ROW_ID);
}

function findSiteCloneBcDatastreamManualInput(preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  if (root) {
    const scoped = root.querySelector('#' + DATASTREAM_MANUAL_INPUT_ID);
    if (scoped) return scoped;
  }
  return document.getElementById(DATASTREAM_MANUAL_INPUT_ID);
}

function ensureSiteCloneBcDatastreamManualRow(preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  let row = findSiteCloneBcDatastreamManualRow(root);
  if (row) {
    row.removeAttribute('hidden');
    return row;
  }
  const dsInput = siteCloneBcDatastreamEl(root);
  if (!dsInput || !dsInput.parentNode) return null;

  row = document.createElement('div');
  row.id = DATASTREAM_MANUAL_ROW_ID;
  row.className = 'site-clone-bc-datastream-manual-row';

  const label = document.createElement('label');
  label.className = 'site-clone-bc-datastream-manual-label spectrum-env-field__label';
  label.setAttribute('for', DATASTREAM_MANUAL_INPUT_ID);
  label.textContent = 'Or paste datastream UUID';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = DATASTREAM_MANUAL_INPUT_ID;
  input.className =
    'site-clone-bc-datastream-input site-clone-bc-datastream-manual-input spectrum-env-input';
  input.placeholder = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Paste datastream UUID');
  input.setAttribute('inputmode', 'text');

  const actions = document.createElement('div');
  actions.className = 'site-clone-bc-datastream-manual-actions';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.id = DATASTREAM_MANUAL_APPLY_ID;
  applyBtn.className =
    'btn-lookup spectrum-btn spectrum-btn--primary site-clone-bc-datastream-manual-apply';
  applyBtn.textContent = 'Apply UUID';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.id = DATASTREAM_MANUAL_CANCEL_ID;
  cancelBtn.className =
    'btn-lookup spectrum-btn spectrum-btn--secondary site-clone-bc-datastream-manual-cancel';
  cancelBtn.textContent = 'Clear';

  actions.appendChild(applyBtn);
  actions.appendChild(cancelBtn);

  const err = document.createElement('p');
  err.id = DATASTREAM_MANUAL_ERROR_ID;
  err.className =
    'site-clone-bc-datastream-manual-error site-clone-bc-style-url-hint spectrum-env-field__hint';
  err.setAttribute('aria-live', 'polite');

  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(actions);
  row.appendChild(err);

  const hint = findSiteCloneBcDatastreamHint(root);
  if (hint && hint.parentNode) {
    hint.parentNode.insertBefore(row, hint);
  } else {
    dsInput.parentNode.insertBefore(row, dsInput.nextSibling);
  }

  datastreamDebugLog('ensureSiteCloneBcDatastreamManualRow — injected missing paste row');
  return row;
}

function syncSiteCloneBcDatastreamManualInputFromStored(storedId, preferredRoot) {
  const input = findSiteCloneBcDatastreamManualInput(preferredRoot);
  if (!input) return;
  const id = sanitiseSiteCloneBcDatastreamId(
    storedId != null ? storedId : readPersistedSiteCloneBcDatastreamId(),
  );
  if (id) input.value = id;
}

function closeSiteCloneBcDatastreamManualEntry(restoreSelectValue, preferredRoot) {
  const root = preferredRoot || activeSiteCloneBcEnvStripRoot();
  const errEl = root
    ? root.querySelector('#' + DATASTREAM_MANUAL_ERROR_ID)
    : document.getElementById(DATASTREAM_MANUAL_ERROR_ID);
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.remove('site-clone-bc-datastream-manual-success');
  }
  setSiteCloneBcDatastreamManualEntryOpen(false, root);
  const dsInput = siteCloneBcDatastreamEl(root);
  if (dsInput) {
    dsInput.removeAttribute('aria-hidden');
    dsInput.tabIndex = 0;
  }
  if (restoreSelectValue != null) {
    const input = findSiteCloneBcDatastreamManualInput(root);
    if (input) input.value = restoreSelectValue || '';
    if (dsInput) {
      renderSiteCloneBcDatastreamSelectOptions({ root: root, selectedId: restoreSelectValue || '' });
      dsInput.value = restoreSelectValue || '';
    }
  }
}

function applySiteCloneBcDatastreamManualEntry(scopeFromNode) {
  const fieldRoot = resolveDatastreamFieldRoot(scopeFromNode);
  const input = findSiteCloneBcDatastreamManualInput(fieldRoot);
  const dsInput = siteCloneBcDatastreamEl(fieldRoot);
  datastreamDebugLog('applySiteCloneBcDatastreamManualEntry', {
    fieldRoot: fieldRoot,
    hasInput: !!input,
    hasSelect: !!dsInput,
    rawValue: input ? input.value : null,
    inputConnected: input ? input.isConnected : null,
    selectConnected: dsInput ? dsInput.isConnected : null,
  });
  if (!input || !dsInput) {
    datastreamDebugLog('apply aborted — missing input or select', {
      inputId: DATASTREAM_MANUAL_INPUT_ID,
      selectId: 'siteCloneBcDatastreamId',
    });
    return false;
  }
  const id = sanitiseSiteCloneBcDatastreamId(input.value);
  const errEl = fieldRoot
    ? fieldRoot.querySelector('#' + DATASTREAM_MANUAL_ERROR_ID)
    : document.getElementById(DATASTREAM_MANUAL_ERROR_ID);
  if (!id) {
    datastreamDebugLog('apply rejected — invalid UUID', { rawValue: input.value });
    if (errEl) {
      errEl.textContent = 'Enter a valid UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).';
    }
    input.focus();
    return false;
  }
  if (errEl) errEl.textContent = '';
  const committed = commitSiteCloneBcDatastreamSelection(fieldRoot, id);
  if (!committed) {
    datastreamDebugLog('apply failed — commitSiteCloneBcDatastreamSelection returned empty');
    return false;
  }
  siteCloneBcDatastreamPickerState.lastBcDatastreamIdForLiveEdge = committed;
  datastreamDebugLog('apply succeeded', { id: committed, sandbox: getSandboxKey(), selectValue: dsInput.value });
  return true;
}

function openSiteCloneBcDatastreamManualEntry(fallback, scopeFromNode) {
  const fieldRoot = resolveDatastreamFieldRoot(scopeFromNode);
  ensureSiteCloneBcDatastreamManualRow(fieldRoot);
  const dsInput = siteCloneBcDatastreamEl(fieldRoot);
  const row = findSiteCloneBcDatastreamManualRow(fieldRoot);
  const input = findSiteCloneBcDatastreamManualInput(fieldRoot);
  if (!dsInput || !row || !input) {
    datastreamDebugLog('openSiteCloneBcDatastreamManualEntry aborted', {
      hasSelect: !!dsInput,
      hasRow: !!row,
      hasInput: !!input,
    });
    return;
  }
  setSiteCloneBcDatastreamManualEntryOpen(true, fieldRoot);
  if (fallback && !String(input.value || '').trim()) input.value = fallback;
  if (dsInput) {
    dsInput.removeAttribute('aria-hidden');
    dsInput.tabIndex = 0;
  }
  const errEl = fieldRoot
    ? fieldRoot.querySelector('#' + DATASTREAM_MANUAL_ERROR_ID)
    : document.getElementById(DATASTREAM_MANUAL_ERROR_ID);
  if (errEl) errEl.textContent = '';
  global.requestAnimationFrame(function () {
    try {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (_scrollErr) {
      /* noop */
    }
    input.focus({ preventScroll: true });
  });
}

/** Updated on each boot — survives env strip remount via document delegation. */
const siteCloneBcDatastreamPickerState = {
  onFieldChange: null,
  manualEntryRestoreValue: '',
  lastBcDatastreamIdForLiveEdge: '',
  delegated: false,
};

function handleSiteCloneBcDatastreamSelectChange(dsInput) {
  if (!dsInput || dsInput.id !== 'siteCloneBcDatastreamId' || dsInput.tagName !== 'SELECT') return;
  const st = siteCloneBcDatastreamPickerState;
  const fieldRoot = resolveDatastreamFieldRoot(dsInput);
  if (dsInput.value === DATASTREAM_ENTER_UUID_VALUE) {
    st.manualEntryRestoreValue = st.lastBcDatastreamIdForLiveEdge || readPersistedSiteCloneBcDatastreamId() || '';
    openSiteCloneBcDatastreamManualEntry(st.manualEntryRestoreValue, dsInput);
    return;
  }
  if (isSiteCloneBcDatastreamManualEntryOpen()) {
    closeSiteCloneBcDatastreamManualEntry(null, fieldRoot);
  }
  if (typeof st.onFieldChange === 'function') st.onFieldChange();
}

function ensureSiteCloneBcDatastreamPickerDelegation() {
  if (siteCloneBcDatastreamPickerState.delegated) return;
  siteCloneBcDatastreamPickerState.delegated = true;
  datastreamDebugLog(
    'document delegation armed for datastream picker (disable logs: localStorage.setItem("aepLabDatastreamDebug","0"))',
  );

  document.addEventListener(
    'change',
    function (ev) {
      const t = ev.target;
      if (!t || t.id !== 'siteCloneBcDatastreamId') return;
      datastreamDebugLog('select change', { value: t.value });
      handleSiteCloneBcDatastreamSelectChange(t);
    },
    true,
  );

  document.addEventListener(
    'click',
    function (ev) {
      const t = ev.target;
      if (!t || typeof t.closest !== 'function') return;
      const applyBtn = t.closest('#' + DATASTREAM_MANUAL_APPLY_ID);
      const cancelBtn = t.closest('#' + DATASTREAM_MANUAL_CANCEL_ID);
      if (!applyBtn && !cancelBtn) return;
      const st = siteCloneBcDatastreamPickerState;
      if (applyBtn) {
        ev.preventDefault();
        datastreamDebugLog('Apply UUID click', {
          targetTag: t.tagName,
          targetId: t.id || null,
          applyBtnConnected: applyBtn.isConnected,
          onFieldChangeBound: typeof st.onFieldChange === 'function',
        });
        const applied = applySiteCloneBcDatastreamManualEntry(applyBtn);
        if (!applied) {
          datastreamDebugLog('Apply UUID stopped — applySiteCloneBcDatastreamManualEntry returned false');
          return;
        }
        if (typeof st.onFieldChange === 'function') {
          datastreamDebugLog('calling onFieldChange (invalidate if changed)');
          st.onFieldChange({ skipPersist: true });
        } else {
          datastreamDebugLog('onFieldChange not bound — invalidating SiteCloneBc after commit');
          invalidateSiteCloneBcCore();
          syncSiteCloneBcFromPrefs();
        }
        return;
      }
      if (cancelBtn) {
        ev.preventDefault();
        datastreamDebugLog('Cancel manual entry click');
        closeSiteCloneBcDatastreamManualEntry(st.manualEntryRestoreValue, resolveDatastreamFieldRoot(cancelBtn));
      }
    },
    true,
  );

  document.addEventListener(
    'keydown',
    function (ev) {
      if (!ev.target || ev.target.id !== DATASTREAM_MANUAL_INPUT_ID) return;
      const st = siteCloneBcDatastreamPickerState;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        datastreamDebugLog('manual input Enter');
        if (!applySiteCloneBcDatastreamManualEntry(ev.target)) return;
        if (typeof st.onFieldChange === 'function') st.onFieldChange({ skipPersist: true });
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        closeSiteCloneBcDatastreamManualEntry(st.manualEntryRestoreValue, resolveDatastreamFieldRoot(ev.target));
      }
    },
    true,
  );
}

function bootSiteCloneBcDatastreamPicker() {
  ensureSiteCloneBcDatastreamPickerDelegation();
  const bootRoot = activeSiteCloneBcEnvStripRoot();
  ensureSiteCloneBcDatastreamManualRow(bootRoot);
  const dsInput = siteCloneBcDatastreamEl(bootRoot);
  if (!dsInput) {
    datastreamDebugLog('bootSiteCloneBcDatastreamPicker — select not in DOM yet (delegation armed)');
    return false;
  }

  function onDatastreamFieldChange(opts) {
    const st = siteCloneBcDatastreamPickerState;
    const root = activeSiteCloneBcEnvStripRoot();
    const prev = st.lastBcDatastreamIdForLiveEdge || getSiteCloneBcDatastreamId(root);
    if (!(opts && opts.skipPersist)) {
      saveSiteCloneBcDatastreamId();
    }
    const next = getSiteCloneBcDatastreamId(root);
    st.lastBcDatastreamIdForLiveEdge = next;
    datastreamDebugLog('onDatastreamFieldChange', {
      prev: prev,
      next: next,
      sandbox: getSandboxKey(),
      skipPersist: !!(opts && opts.skipPersist),
    });
    if (prev !== next) {
      datastreamDebugLog('datastream changed — invalidating SiteCloneBc core');
      invalidateSiteCloneBcCore();
      syncSiteCloneBcFromPrefs();
    }
  }

  siteCloneBcDatastreamPickerState.onFieldChange = onDatastreamFieldChange;
  siteCloneBcDatastreamPickerState.lastBcDatastreamIdForLiveEdge = getSiteCloneBcDatastreamId(
    activeSiteCloneBcEnvStripRoot(),
  );
  datastreamDebugLog('bootSiteCloneBcDatastreamPicker', {
    selectFound: !!dsInput,
    currentId: siteCloneBcDatastreamPickerState.lastBcDatastreamIdForLiveEdge,
  });
  syncSiteCloneBcDatastreamManualInputFromStored(null, bootRoot);
  setSiteCloneBcDatastreamManualEntryOpen(false, bootRoot);
  return true;
}

async function loadSiteCloneBcDatastreams() {
  const loadGen = ++datastreamLoadGen;
  const sandbox = getSandboxDisplayName();
  const sandboxKeyAtStart = getSandboxKey();
  const hint = document.getElementById('siteCloneBcDatastreamHint');
  if (hint) {
    hint.textContent = sandbox ? 'Loading datastreams for ' + sandbox + '…' : 'Loading datastreams…';
  }
  try {
    const params = new URLSearchParams();
    if (sandbox) params.set('sandbox', sandbox);
    const res = await fetch('/api/events/datastreams?' + params.toString());
    const data = await res.json().catch(function () {
      return {};
    });
    if (loadGen !== datastreamLoadGen || sandboxKeyAtStart !== getSandboxKey()) return;

    siteCloneBcAllDatastreamOptions = Array.isArray(data.datastreams) ? data.datastreams : [];
    renderSiteCloneBcDatastreamSelectOptions({ root: activeSiteCloneBcEnvStripRoot() });

    applySiteCloneBcDatastreamFieldForSandbox(sandboxKeyAtStart);

    if (hint) {
      if (data.note && !siteCloneBcAllDatastreamOptions.length) {
        hint.textContent = String(data.note);
      } else {
        refreshSiteCloneBcDatastreamHint(activeSiteCloneBcEnvStripRoot());
      }
    }
  } catch (err) {
    if (loadGen !== datastreamLoadGen || sandboxKeyAtStart !== getSandboxKey()) return;
    siteCloneBcAllDatastreamOptions = [];
    renderSiteCloneBcDatastreamSelectOptions({ root: activeSiteCloneBcEnvStripRoot() });
    applySiteCloneBcDatastreamFieldForSandbox(sandboxKeyAtStart);
    if (hint) {
      hint.textContent =
        'Could not load datastreams' +
        (err && err.message ? ': ' + err.message : '') +
        '. Paste a datastream UUID via Enter UUID….';
    }
  }
}

window.SiteCloneBcConfig = {
  getStyleConfigUrl: getSiteCloneBcStyleConfigUrl,
  getDatastreamId: getSiteCloneBcDatastreamId,
};

// Brand Concierge display prefs (env bar) — army-mod-home injected / modal modes
const SC_BC_PREFS_BY_SANDBOX_KEY = 'siteCloneBcDisplayPrefsBySandbox';
const SC_BC_PREFS_KEY = 'siteCloneBcDisplayPrefs';
const SC_DECISIONING_PREFS_BY_SANDBOX_KEY = 'siteCloneDecisioningPrefsBySandbox';

function normaliseDisplayPrefs(raw) {
  if (!raw || typeof raw !== 'object') {
    return { fullScreen: false, modal: false, injected: false, bottomDock: false, modalBar: false };
  }
  return {
    fullScreen: !!raw.fullScreen,
    modal: !!raw.modal,
    injected: !!raw.injected,
    bottomDock: !!raw.bottomDock,
    modalBar: !!raw.modalBar,
  };
}

function loadDecisioningEnabledPrefs() {
  migrateLegacyScalar(SC_DECISIONING_PREFS_BY_SANDBOX_KEY, 'siteCloneDecisioningEnabled');
  const raw = readStorageMap(SC_DECISIONING_PREFS_BY_SANDBOX_KEY)[getSandboxKey()];
  if (raw === '1' || raw === true) return true;
  if (raw === '0' || raw === false) return false;
  return false;
}

function saveDecisioningEnabledPrefs(sandboxKey) {
  enableBcDisplayPrefsRestore();
  const map = readStorageMap(SC_DECISIONING_PREFS_BY_SANDBOX_KEY);
  const key = sandboxKey != null ? sandboxKey : getSandboxKey();
  map[key] = siteCloneDecisioningEnabledToggle && siteCloneDecisioningEnabledToggle.checked ? '1' : '0';
  writeStorageMap(SC_DECISIONING_PREFS_BY_SANDBOX_KEY, map);
}

function applyDecisioningEnabledPrefsToUi() {
  if (!siteCloneDecisioningEnabledToggle) return;
  siteCloneDecisioningEnabledToggle.checked = loadDecisioningEnabledPrefs();
}

function syncDecisioningFromPrefs() {
  if (typeof global.DecisioningProfileRuntime !== 'undefined' &&
      typeof global.DecisioningProfileRuntime.refreshEnabledState === 'function') {
    global.DecisioningProfileRuntime.refreshEnabledState();
  }
  if (typeof global.DecisioningProfilePanel !== 'undefined') {
    var anchor = document.getElementById('dpmPanelAnchor');
    if (anchor && siteCloneDecisioningEnabledToggle) {
      anchor.classList.toggle('is-visible', !!siteCloneDecisioningEnabledToggle.checked);
    }
  }
  syncBcMidrailFromPrefs();
}

function syncBcMidrailFromPrefs() {
  if (
    global.BrandConciergeMidrailPanel &&
    typeof global.BrandConciergeMidrailPanel.refreshVisibility === 'function'
  ) {
    global.BrandConciergeMidrailPanel.refreshVisibility();
  }
}

function loadSiteCloneBcDisplayPrefs() {
  migrateLegacyScalar(SC_BC_PREFS_BY_SANDBOX_KEY, SC_BC_PREFS_KEY, function (legacy) {
    try {
      return JSON.parse(legacy);
    } catch {
      return null;
    }
  });
  const raw = readStorageMap(SC_BC_PREFS_BY_SANDBOX_KEY)[getSandboxKey()];
  if (raw && typeof raw === 'object') return normaliseDisplayPrefs(raw);
  try {
    const flat = localStorage.getItem(SC_BC_PREFS_KEY);
    if (flat) return normaliseDisplayPrefs(JSON.parse(flat));
  } catch {
    /* noop */
  }
  return { fullScreen: false, modal: false, injected: false };
}

function saveSiteCloneBcDisplayPrefs(sandboxKey) {
  enableBcDisplayPrefsRestore();
  const map = readStorageMap(SC_BC_PREFS_BY_SANDBOX_KEY);
  const key = sandboxKey != null ? sandboxKey : getSandboxKey();
  map[key] = {
    fullScreen: !!(siteCloneBcFullScreenToggle && siteCloneBcFullScreenToggle.checked),
    modal: !!(siteCloneBcModalToggle && siteCloneBcModalToggle.checked),
    injected: !!(siteCloneBcInjectedToggle && siteCloneBcInjectedToggle.checked),
    bottomDock: !!(siteCloneBcBottomDockToggle && siteCloneBcBottomDockToggle.checked),
    modalBar: !!(siteCloneBcModalBarToggle && siteCloneBcModalBarToggle.checked),
  };
  writeStorageMap(SC_BC_PREFS_BY_SANDBOX_KEY, map);
  saveDecisioningEnabledPrefs(key);
}

function resetSiteCloneBcDisplayPrefsOnUi() {
  if (siteCloneBcInjectedToggle) siteCloneBcInjectedToggle.checked = false;
  if (siteCloneBcFullScreenToggle) siteCloneBcFullScreenToggle.checked = false;
  if (siteCloneBcModalToggle) siteCloneBcModalToggle.checked = false;
  if (siteCloneBcBottomDockToggle) siteCloneBcBottomDockToggle.checked = false;
  if (siteCloneBcModalBarToggle) siteCloneBcModalBarToggle.checked = false;
  if (siteCloneDecisioningEnabledToggle) siteCloneDecisioningEnabledToggle.checked = false;
}

/** Skip restoring saved BC display/decisioning toggles until sandbox is known or user saves. */
let restoreBcDisplayPrefsFromStorage = false;

function enableBcDisplayPrefsRestore() {
  restoreBcDisplayPrefsFromStorage = true;
}

function applySiteCloneBcDisplayPrefsToUi() {
  if (!restoreBcDisplayPrefsFromStorage) {
    resetSiteCloneBcDisplayPrefsOnUi();
    return;
  }
  const prefs = loadSiteCloneBcDisplayPrefs();
  if (prefs.modal && (prefs.injected || prefs.fullScreen || prefs.bottomDock || prefs.modalBar)) {
    prefs.injected = false;
    prefs.fullScreen = false;
    prefs.bottomDock = false;
    prefs.modalBar = false;
  } else if (prefs.fullScreen && prefs.injected) {
    prefs.injected = false;
  } else if (prefs.bottomDock && (prefs.injected || prefs.fullScreen || prefs.modal || prefs.modalBar)) {
    prefs.injected = false;
    prefs.fullScreen = false;
    prefs.modal = false;
    prefs.modalBar = false;
  } else if (prefs.modalBar && (prefs.injected || prefs.fullScreen || prefs.modal || prefs.bottomDock)) {
    prefs.injected = false;
    prefs.fullScreen = false;
    prefs.modal = false;
    prefs.bottomDock = false;
  }
  if (siteCloneBcInjectedToggle) siteCloneBcInjectedToggle.checked = prefs.injected;
  if (siteCloneBcFullScreenToggle) siteCloneBcFullScreenToggle.checked = prefs.fullScreen;
  if (siteCloneBcModalToggle) siteCloneBcModalToggle.checked = prefs.modal;
  if (siteCloneBcBottomDockToggle) siteCloneBcBottomDockToggle.checked = prefs.bottomDock;
  if (siteCloneBcModalBarToggle) siteCloneBcModalBarToggle.checked = prefs.modalBar;
  applyDecisioningEnabledPrefsToUi();
}

function syncSiteCloneBcFromPrefs() {
  if (typeof window.SiteCloneBc !== 'undefined' && typeof window.SiteCloneBc.sync === 'function') {
    window.SiteCloneBc.sync();
  }
}

function bindStripDomListenersOnce() {
  if (stripDomListenersBound) return;
  refreshStripDomRefs();
  if (!stripDomIsMounted()) return;
  stripDomListenersBound = true;

  if (webPushOnInjectToggle && typeof env().applyWebPushToggle !== 'function') {
    applyWebPushOnInjectToggle();
    webPushOnInjectToggle.addEventListener('change', function () {
      writeWebPushOnInject(!!webPushOnInjectToggle.checked);
    });
  }

  if (bcOnInjectToggle) {
    applyBcOnInjectPrefs();
    bcOnInjectToggle.addEventListener('change', saveBcOnInjectPrefs);
    if (bcStyleSelect) bcStyleSelect.addEventListener('change', saveBcOnInjectPrefs);
  }

  applySiteCloneBcDisplayPrefsToUi();
  syncSiteCloneBcFromPrefs();
  syncDecisioningFromPrefs();
  var bcToggles = [
    siteCloneBcFullScreenToggle,
    siteCloneBcModalToggle,
    siteCloneBcInjectedToggle,
    siteCloneBcBottomDockToggle,
    siteCloneBcModalBarToggle,
  ];
  bcToggles.forEach(function (el) {
    if (!el) return;
    el.addEventListener('change', function () {
      if (el === siteCloneBcModalToggle && el.checked) {
        if (siteCloneBcInjectedToggle) siteCloneBcInjectedToggle.checked = false;
        if (siteCloneBcFullScreenToggle) siteCloneBcFullScreenToggle.checked = false;
        if (siteCloneBcBottomDockToggle) siteCloneBcBottomDockToggle.checked = false;
        if (siteCloneBcModalBarToggle) siteCloneBcModalBarToggle.checked = false;
      }
      if ((el === siteCloneBcInjectedToggle || el === siteCloneBcFullScreenToggle) && el.checked) {
        if (siteCloneBcModalToggle) siteCloneBcModalToggle.checked = false;
        if (siteCloneBcBottomDockToggle) siteCloneBcBottomDockToggle.checked = false;
        if (siteCloneBcModalBarToggle) siteCloneBcModalBarToggle.checked = false;
      }
      if (el === siteCloneBcInjectedToggle && el.checked && siteCloneBcFullScreenToggle) {
        siteCloneBcFullScreenToggle.checked = false;
      }
      if (el === siteCloneBcFullScreenToggle && el.checked && siteCloneBcInjectedToggle) {
        siteCloneBcInjectedToggle.checked = false;
      }
      if (el === siteCloneBcBottomDockToggle && el.checked) {
        if (siteCloneBcModalToggle) siteCloneBcModalToggle.checked = false;
        if (siteCloneBcInjectedToggle) siteCloneBcInjectedToggle.checked = false;
        if (siteCloneBcFullScreenToggle) siteCloneBcFullScreenToggle.checked = false;
        if (siteCloneBcModalBarToggle) siteCloneBcModalBarToggle.checked = false;
      }
      if (el === siteCloneBcModalBarToggle && el.checked) {
        if (siteCloneBcModalToggle) siteCloneBcModalToggle.checked = false;
        if (siteCloneBcInjectedToggle) siteCloneBcInjectedToggle.checked = false;
        if (siteCloneBcFullScreenToggle) siteCloneBcFullScreenToggle.checked = false;
        if (siteCloneBcBottomDockToggle) siteCloneBcBottomDockToggle.checked = false;
      }
      saveSiteCloneBcDisplayPrefs();
      syncSiteCloneBcFromPrefs();
      syncDecisioningFromPrefs();
      window.setTimeout(function () {
        syncSiteCloneBcFromPrefs();
      }, 0);
    });
  });
  if (siteCloneDecisioningEnabledToggle) {
    siteCloneDecisioningEnabledToggle.addEventListener('change', function () {
      saveDecisioningEnabledPrefs();
      syncDecisioningFromPrefs();
    });
  }

  if (siteCloneBcStyleConfigUrl) {
    applySiteCloneBcStyleConfigFieldForSandbox();
    function onStyleUrlChange() {
      saveSiteCloneBcStyleConfigUrl();
      invalidateSiteCloneBcCore();
      syncSiteCloneBcFromPrefs();
    }
    if (siteCloneBcStyleConfigUrl.tagName === 'SELECT') {
      siteCloneBcStyleConfigUrl.addEventListener('change', onStyleUrlChange);
    } else {
      siteCloneBcStyleConfigUrl.addEventListener('input', function () {
        if (sandboxEnvSwitching) return;
        writeSandboxString(
          SC_BC_STYLE_URL_BY_SANDBOX_KEY,
          sanitiseSiteCloneBcStyleConfigUrl(siteCloneBcStyleConfigUrl.value),
        );
        refreshSiteCloneBcStyleUrlHints();
      });
      siteCloneBcStyleConfigUrl.addEventListener('change', onStyleUrlChange);
      siteCloneBcStyleConfigUrl.addEventListener('blur', onStyleUrlChange);
    }
    refreshSiteCloneBcStyleUrlHints();
  }
}

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
    const dsUuid =
      dsFromInput ||
      (siteCloneBcDatastreamEl() ? extractDatastreamUuidFromField(siteCloneBcDatastreamEl().value) : '');
    if (dsUuid) {
      writeSandboxStringForKey(SC_BC_DATASTREAM_BY_SANDBOX_KEY, sk, sanitiseSiteCloneBcDatastreamId(dsUuid));
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

  function applyEnvForCurrentSandbox(opts) {
    var force = !!(opts && opts.force);
    refreshStripDomRefs();
    bindStripDomListenersOnce();
    var nextKey = getSandboxKey();
    if (!force && nextKey === envSandboxKey && stripDomListenersBound) {
      bootSiteCloneBcDatastreamPicker();
      applySiteCloneBcStyleConfigFieldForSandbox();
      applySiteCloneBcDatastreamFieldForSandbox();
      applySiteCloneBcDisplayPrefsToUi();
      syncSiteCloneBcFromPrefs();
      syncDecisioningFromPrefs();
      return;
    }
    bootSiteCloneBcDatastreamPicker();
    if (typeof env().applyWebPushToggle === 'function') env().applyWebPushToggle();
    else applyWebPushOnInjectToggle();
    applyBcOnInjectPrefs();
    if (siteCloneBcStyleConfigUrl) {
      applySiteCloneBcStyleConfigFieldForSandbox();
    }
    const dsEarly = siteCloneBcDatastreamEl();
    if (dsEarly) {
      const storedDs = readPersistedSiteCloneBcDatastreamId();
      if (storedDs && !String(dsEarly.value || '').trim()) {
        dsEarly.value = storedDs;
      }
    }
    applySiteCloneBcDatastreamFieldForSandbox();
    applySiteCloneBcDisplayPrefsToUi();
    invalidateSiteCloneBcCore();
    syncSiteCloneBcFromPrefs();
    syncDecisioningFromPrefs();
    void loadSiteCloneBcStyleConfigs();
    void loadSiteCloneBcDatastreams();
    envSandboxKey = getSandboxKey();
  }

  function bootStripDomWhenReady() {
    if (!stripDomIsMounted()) return false;
    bindStripDomListenersOnce();
    applyEnvForCurrentSandbox();
    return true;
  }

  function scheduleStripDomBoot() {
    if (bootStripDomWhenReady()) return;
    function onStripReady() {
      if (bootStripDomWhenReady()) {
        document.removeEventListener('DOMContentLoaded', onStripReady);
        global.removeEventListener('aep-demo-env-strip-mounted', onStripReady);
      }
    }
    document.addEventListener('DOMContentLoaded', onStripReady);
    global.addEventListener('aep-demo-env-strip-mounted', onStripReady);
  }

  global.addEventListener('aep-demo-tags-injected', function () {
    syncSiteCloneBcFromPrefs();
    syncDecisioningFromPrefs();
  });

  global.addEventListener('aep-global-sandbox-change', function () {
    enableBcDisplayPrefsRestore();
    sandboxEnvSwitching = true;
    try {
      if (envSandboxKey) flushEnvForSandboxKey(envSandboxKey);
      var nextKey = getSandboxKey();
      var changed = nextKey !== envSandboxKey;
      envSandboxKey = nextKey;
      applyEnvForCurrentSandbox({ force: changed });
    } finally {
      sandboxEnvSwitching = false;
    }
  });

  global.addEventListener('aep-lab-env-bar-prefs-synced', function () {
    if (!stripDomIsMounted()) return;
    enableBcDisplayPrefsRestore();
    bootSiteCloneBcDatastreamPicker();
    applySiteCloneBcStyleConfigFieldForSandbox();
    applySiteCloneBcDatastreamFieldForSandbox();
    applySiteCloneBcDisplayPrefsToUi();
    syncSiteCloneBcFromPrefs();
    syncDecisioningFromPrefs();
  });

  global.addEventListener('aep-demo-env-strip-mounted', function () {
    ensureSiteCloneBcDatastreamManualRow(activeSiteCloneBcEnvStripRoot());
    bootSiteCloneBcDatastreamPicker();
  });

  scheduleStripDomBoot();
  ensureSiteCloneBcDatastreamPickerDelegation();

  global.SiteCloneBcEnv = {
    applyForCurrentSandbox: applyEnvForCurrentSandbox,
    flushForSandboxKey: flushEnvForSandboxKey,
    getSandboxKey: getSandboxKey,
    isDecisioningEnabled: function () {
      return !!(siteCloneDecisioningEnabledToggle && siteCloneDecisioningEnabledToggle.checked);
    },
    webPushOnInjectDesired: function () {
      return !!(webPushOnInjectToggle && webPushOnInjectToggle.checked);
    },
  };
})(typeof window !== 'undefined' ? window : this);
