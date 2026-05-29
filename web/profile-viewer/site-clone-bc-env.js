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

  let envSandboxKey = getSandboxKey();
  let sandboxEnvSwitching = false;
  let datastreamLoadGen = 0;

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

  if (webPushOnInjectToggle && typeof env().applyWebPushToggle !== 'function') {
    applyWebPushOnInjectToggle();
    webPushOnInjectToggle.addEventListener('change', function () {
      writeWebPushOnInject(!!webPushOnInjectToggle.checked);
    });
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

const SC_BC_STYLE_URL_BY_SANDBOX_KEY = 'siteCloneBcStyleConfigUrlBySandbox';
const SC_BC_STYLE_URL_LEGACY_SCALAR = 'siteCloneBcStyleConfigUrl';
const SC_BC_DEFAULT_STYLE_URL = 'embed-bc/styleConfigurations-6a0992.js';
const siteCloneBcStyleConfigUrl = document.getElementById('siteCloneBcStyleConfigUrl');

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
const SC_BC_DEFAULT_DATASTREAM_ID = 'cf7272a7-f634-4bdf-9ce6-fa31ac0c6416';
const siteCloneBcDatastreamId = document.getElementById('siteCloneBcDatastreamId');
const siteCloneBcDatastreamList = document.getElementById('siteCloneBcDatastreamList');

/** @type {Array<{ id: string, title: string, sandbox?: string }>} */
let siteCloneBcAllDatastreamOptions = [];

function sanitiseSiteCloneBcDatastreamId(raw) {
  const v = String(raw || '').trim();
  if (!v) return SC_BC_DEFAULT_DATASTREAM_ID;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v.toLowerCase();
  return SC_BC_DEFAULT_DATASTREAM_ID;
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

function resolveSiteCloneBcDatastreamIdFromInput() {
  const raw = siteCloneBcDatastreamId ? String(siteCloneBcDatastreamId.value || '').trim() : '';
  if (!raw) return '';
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
  return stored || SC_BC_DEFAULT_DATASTREAM_ID;
}

function getSiteCloneBcDatastreamId() {
  const resolved = resolveSiteCloneBcDatastreamIdFromInput();
  if (resolved) return sanitiseSiteCloneBcDatastreamId(resolved);
  const fromField = siteCloneBcDatastreamId
    ? extractDatastreamUuidFromField(siteCloneBcDatastreamId.value)
    : '';
  if (fromField) return sanitiseSiteCloneBcDatastreamId(fromField);
  return readPersistedSiteCloneBcDatastreamId();
}

function renderSiteCloneBcDatastreamSuggestions(query) {
  if (!siteCloneBcDatastreamList) return;
  const q = String(query || '').trim().toLowerCase();
  siteCloneBcDatastreamList.innerHTML = '';
  const matches = siteCloneBcAllDatastreamOptions
    .filter(function (d) {
      if (!q) return true;
      const label = datastreamLabelFromItem(d).toLowerCase();
      const id = String(d.id || '').toLowerCase();
      return label.indexOf(q) !== -1 || id.indexOf(q) !== -1;
    })
    .slice(0, 200);
  matches.forEach(function (d) {
    const opt = document.createElement('option');
    opt.value = datastreamLabelFromItem(d);
    siteCloneBcDatastreamList.appendChild(opt);
  });
}

function applySiteCloneBcDatastreamInputToStoredId() {
  const id = getSiteCloneBcDatastreamId();
  const hit = siteCloneBcAllDatastreamOptions.find(function (d) {
    return String(d.id || '').toLowerCase() === id;
  });
  if (siteCloneBcDatastreamId && hit) {
    siteCloneBcDatastreamId.value = datastreamLabelFromItem(hit);
  }
  writeSandboxString(SC_BC_DATASTREAM_BY_SANDBOX_KEY, id);
  refreshSiteCloneBcDatastreamHint();
  return id;
}

function saveSiteCloneBcDatastreamId() {
  if (sandboxEnvSwitching) return;
  applySiteCloneBcDatastreamInputToStoredId();
}

function applySiteCloneBcDatastreamFieldForSandbox(sandboxKey) {
  if (!siteCloneBcDatastreamId) return;
  const storedId = readPersistedSiteCloneBcDatastreamId(sandboxKey);
  const hit = siteCloneBcAllDatastreamOptions.find(function (d) {
    return String(d.id || '').toLowerCase() === storedId;
  });
  siteCloneBcDatastreamId.value = hit ? datastreamLabelFromItem(hit) : storedId;
  refreshSiteCloneBcDatastreamHint();
}

function refreshSiteCloneBcDatastreamHint() {
  const id = getSiteCloneBcDatastreamId();
  const hint = document.getElementById('siteCloneBcDatastreamHint');
  const sandbox = getSandboxDisplayName();
  if (!hint) return;
  if (!siteCloneBcAllDatastreamOptions.length) {
    hint.textContent = id
      ? 'Alloy datastreamId (manual): ' + id + (sandbox ? ' · sandbox ' + sandbox : '')
      : sandbox
        ? 'Load datastreams for sandbox ' + sandbox + ', or paste a UUID.'
        : 'Paste a datastream UUID.';
    return;
  }
  hint.textContent =
    siteCloneBcAllDatastreamOptions.length +
    ' datastream(s)' +
    (sandbox ? ' for ' + sandbox : '') +
    ' · selected ' +
    id;
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
    renderSiteCloneBcDatastreamSuggestions(siteCloneBcDatastreamId ? siteCloneBcDatastreamId.value : '');

    applySiteCloneBcDatastreamFieldForSandbox(sandboxKeyAtStart);

    if (hint) {
      if (data.note && !siteCloneBcAllDatastreamOptions.length) {
        hint.textContent = String(data.note);
      } else {
        refreshSiteCloneBcDatastreamHint();
      }
    }
  } catch (err) {
    if (loadGen !== datastreamLoadGen || sandboxKeyAtStart !== getSandboxKey()) return;
    siteCloneBcAllDatastreamOptions = [];
    renderSiteCloneBcDatastreamSuggestions('');
    applySiteCloneBcDatastreamFieldForSandbox(sandboxKeyAtStart);
    if (hint) {
      hint.textContent =
        'Could not load datastreams' +
        (err && err.message ? ': ' + err.message : '') +
        '. Paste a datastream UUID.';
    }
  }
}

window.SiteCloneBcConfig = {
  getStyleConfigUrl: getSiteCloneBcStyleConfigUrl,
  getDatastreamId: getSiteCloneBcDatastreamId,
};

// Brand Concierge display prefs (env bar) — army-mod-home injected / modal modes
const siteCloneBcFullScreenToggle = document.getElementById('siteCloneBcFullScreenToggle');
const siteCloneBcModalToggle = document.getElementById('siteCloneBcModalToggle');
const siteCloneBcInjectedToggle = document.getElementById('siteCloneBcInjectedToggle');
const SC_BC_PREFS_BY_SANDBOX_KEY = 'siteCloneBcDisplayPrefsBySandbox';
const SC_BC_PREFS_KEY = 'siteCloneBcDisplayPrefs';

function normaliseDisplayPrefs(raw) {
  if (!raw || typeof raw !== 'object') {
    return { fullScreen: false, modal: false, injected: false };
  }
  return {
    fullScreen: !!raw.fullScreen,
    modal: !!raw.modal,
    injected: !!raw.injected,
  };
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
  const map = readStorageMap(SC_BC_PREFS_BY_SANDBOX_KEY);
  const key = sandboxKey != null ? sandboxKey : getSandboxKey();
  map[key] = {
    fullScreen: !!(siteCloneBcFullScreenToggle && siteCloneBcFullScreenToggle.checked),
    modal: !!(siteCloneBcModalToggle && siteCloneBcModalToggle.checked),
    injected: !!(siteCloneBcInjectedToggle && siteCloneBcInjectedToggle.checked),
  };
  writeStorageMap(SC_BC_PREFS_BY_SANDBOX_KEY, map);
}

function applySiteCloneBcDisplayPrefsToUi() {
  const prefs = loadSiteCloneBcDisplayPrefs();
  if (prefs.modal && (prefs.injected || prefs.fullScreen)) {
    prefs.injected = false;
    prefs.fullScreen = false;
  } else if (prefs.fullScreen && prefs.injected) {
    prefs.injected = false;
  }
  if (siteCloneBcInjectedToggle) siteCloneBcInjectedToggle.checked = prefs.injected;
  if (siteCloneBcFullScreenToggle) siteCloneBcFullScreenToggle.checked = prefs.fullScreen;
  if (siteCloneBcModalToggle) siteCloneBcModalToggle.checked = prefs.modal;
}

function syncSiteCloneBcFromPrefs() {
  if (typeof window.SiteCloneBc !== 'undefined' && typeof window.SiteCloneBc.sync === 'function') {
    window.SiteCloneBc.sync();
  }
}

(function initSiteCloneBcDisplayPrefs() {
  applySiteCloneBcDisplayPrefsToUi();
  [siteCloneBcFullScreenToggle, siteCloneBcModalToggle, siteCloneBcInjectedToggle].forEach(function (el) {
    if (!el) return;
    el.addEventListener('change', function () {
      if (el === siteCloneBcModalToggle && el.checked) {
        if (siteCloneBcInjectedToggle) siteCloneBcInjectedToggle.checked = false;
        if (siteCloneBcFullScreenToggle) siteCloneBcFullScreenToggle.checked = false;
      }
      if ((el === siteCloneBcInjectedToggle || el === siteCloneBcFullScreenToggle) && el.checked) {
        if (siteCloneBcModalToggle) siteCloneBcModalToggle.checked = false;
      }
      if (el === siteCloneBcInjectedToggle && el.checked && siteCloneBcFullScreenToggle) {
        siteCloneBcFullScreenToggle.checked = false;
      }
      if (el === siteCloneBcFullScreenToggle && el.checked && siteCloneBcInjectedToggle) {
        siteCloneBcInjectedToggle.checked = false;
      }
      saveSiteCloneBcDisplayPrefs();
      syncSiteCloneBcFromPrefs();
    });
  });
  saveSiteCloneBcDisplayPrefs();
})();

(function initSiteCloneBcStyleConfigUrl() {
  if (!siteCloneBcStyleConfigUrl) return;
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
})();

(function initSiteCloneBcDatastreamPicker() {
  if (!siteCloneBcDatastreamId) return;

  function onDatastreamFieldChange() {
    const prev = lastBcDatastreamIdForLiveEdge || getSiteCloneBcDatastreamId();
    saveSiteCloneBcDatastreamId();
    const next = getSiteCloneBcDatastreamId();
    lastBcDatastreamIdForLiveEdge = next;
    if (prev !== next) {
      invalidateSiteCloneBcCore();
      syncSiteCloneBcFromPrefs();
    }
  }

  let lastBcDatastreamIdForLiveEdge = getSiteCloneBcDatastreamId();

  siteCloneBcDatastreamId.addEventListener('input', function () {
    renderSiteCloneBcDatastreamSuggestions(siteCloneBcDatastreamId.value);
  });
  siteCloneBcDatastreamId.addEventListener('change', onDatastreamFieldChange);
  siteCloneBcDatastreamId.addEventListener('blur', onDatastreamFieldChange);
})();

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
      (siteCloneBcDatastreamId ? extractDatastreamUuidFromField(siteCloneBcDatastreamId.value) : '');
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

  function applyEnvForCurrentSandbox() {
    if (typeof env().applyWebPushToggle === 'function') env().applyWebPushToggle();
    else applyWebPushOnInjectToggle();
    applyBcOnInjectPrefs();
    if (siteCloneBcStyleConfigUrl) {
      applySiteCloneBcStyleConfigFieldForSandbox();
    }
    applySiteCloneBcDatastreamFieldForSandbox();
    applySiteCloneBcDisplayPrefsToUi();
    invalidateSiteCloneBcCore();
    syncSiteCloneBcFromPrefs();
    void loadSiteCloneBcStyleConfigs();
    void loadSiteCloneBcDatastreams();
    envSandboxKey = getSandboxKey();
  }

  global.addEventListener('aep-global-sandbox-change', function () {
    sandboxEnvSwitching = true;
    try {
      if (envSandboxKey) flushEnvForSandboxKey(envSandboxKey);
      envSandboxKey = getSandboxKey();
      applyEnvForCurrentSandbox();
    } finally {
      sandboxEnvSwitching = false;
    }
  });

  envSandboxKey = getSandboxKey();
  applyEnvForCurrentSandbox();

  global.SiteCloneBcEnv = {
    applyForCurrentSandbox: applyEnvForCurrentSandbox,
    flushForSandboxKey: flushEnvForSandboxKey,
    getSandboxKey: getSandboxKey,
    webPushOnInjectDesired: function () {
      return !!(webPushOnInjectToggle && webPushOnInjectToggle.checked);
    },
  };
})(typeof window !== 'undefined' ? window : this);
