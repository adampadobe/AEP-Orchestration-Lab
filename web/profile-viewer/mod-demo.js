/**
 * MOD (British Army) demo — profile lookup + flyout lab nav; saved homepage in iframe.
 * Lab strip: web push + Tags inject; embed BC modes in `site-clone-bc.js`.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'modNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const generatorTargetSelect = document.getElementById('generatorTarget');
const modMessage = document.getElementById('modMessage');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

function readModStorageMap(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeModStorageMap(key, mapObj) {
  try {
    localStorage.setItem(key, JSON.stringify(mapObj || {}));
  } catch {
    /* noop */
  }
}

function getSiteCloneBcSandboxName() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
    return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
  }
  const sel = document.getElementById('sandboxSelect');
  if (sel && sel.value) return String(sel.value).trim();
  return '';
}

function getModSandboxKey() {
  const raw = getSiteCloneBcSandboxName().toLowerCase();
  return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
}

function migrateLegacyModScalar(mapKey, legacyKey, transform) {
  const map = readModStorageMap(mapKey);
  const sk = getModSandboxKey();
  if (map[sk] != null && map[sk] !== '') return;
  try {
    const legacy = localStorage.getItem(legacyKey);
    if (legacy == null || legacy === '') return;
    map[sk] = transform ? transform(legacy) : legacy;
    writeModStorageMap(mapKey, map);
  } catch {
    /* noop */
  }
}

function readModSandboxString(mapKey, legacyKey, normaliser, fallback) {
  migrateLegacyModScalar(mapKey, legacyKey, normaliser);
  const raw = readModStorageMap(mapKey)[getModSandboxKey()];
  const v = String(raw != null ? raw : '').trim();
  if (!v) return fallback;
  return normaliser ? normaliser(v) : v;
}

function writeModSandboxString(mapKey, value) {
  writeModSandboxStringForKey(mapKey, getModSandboxKey(), value);
}

function writeModSandboxStringForKey(mapKey, sandboxKey, value) {
  const map = readModStorageMap(mapKey);
  const key = String(sandboxKey || '').trim() || '__default__';
  const v = String(value != null ? value : '').trim();
  if (!v) delete map[key];
  else map[key] = v;
  writeModStorageMap(mapKey, map);
}

function readModSandboxStringForKey(mapKey, sandboxKey, normaliser, fallback) {
  const raw = readModStorageMap(mapKey)[String(sandboxKey || '').trim() || '__default__'];
  const v = String(raw != null ? raw : '').trim();
  if (!v) return fallback;
  return normaliser ? normaliser(v) : v;
}

/** Sandbox key when env fields were last loaded or flushed (used to persist outgoing values on switch). */
let modDemoEnvSandboxKey = getModSandboxKey();

const MOD_WEB_PUSH_BY_SANDBOX_KEY = 'modDemoWebPushOnInjectBySandbox';
const MOD_WEB_PUSH_ON_INJECT_KEY = 'modDemoWebPushOnInjectToggle';
const modWebPushOnInjectToggle = document.getElementById('modWebPushOnInjectToggle');

function readModWebPushOnInject() {
  migrateLegacyModScalar(MOD_WEB_PUSH_BY_SANDBOX_KEY, MOD_WEB_PUSH_ON_INJECT_KEY);
  return readModStorageMap(MOD_WEB_PUSH_BY_SANDBOX_KEY)[getModSandboxKey()] === '1';
}

function writeModWebPushOnInject(on) {
  const map = readModStorageMap(MOD_WEB_PUSH_BY_SANDBOX_KEY);
  map[getModSandboxKey()] = on ? '1' : '0';
  writeModStorageMap(MOD_WEB_PUSH_BY_SANDBOX_KEY, map);
}

function applyModWebPushOnInjectToggle() {
  if (!modWebPushOnInjectToggle) return;
  modWebPushOnInjectToggle.checked = readModWebPushOnInject();
}

if (modWebPushOnInjectToggle) {
  applyModWebPushOnInjectToggle();
  modWebPushOnInjectToggle.addEventListener('change', function () {
    writeModWebPushOnInject(!!modWebPushOnInjectToggle.checked);
  });
}

function modWebPushOnInjectDesired() {
  return !!(modWebPushOnInjectToggle && modWebPushOnInjectToggle.checked);
}

// Brand Concierge when injecting Tags (Etihad pattern)
const modBcOnInjectToggle = document.getElementById('modBcOnInjectToggle');
const modBcStyleSelect = document.getElementById('modBcStyleSelect');

function applySiteCloneBcOnInjectPrefs() {
  if (!modBcOnInjectToggle) return;
  const prefs =
    typeof AepBcToggle !== 'undefined' ? AepBcToggle.loadPrefs('modDemo') : { enabled: false, styleKey: 'army' };
  modBcOnInjectToggle.checked = !!prefs.enabled;
  if (modBcStyleSelect && prefs.styleKey) modBcStyleSelect.value = prefs.styleKey;
}

function saveSiteCloneBcOnInjectPrefs() {
  if (typeof AepBcToggle === 'undefined') return;
  AepBcToggle.savePrefs(
    'modDemo',
    !!(modBcOnInjectToggle && modBcOnInjectToggle.checked),
    modBcStyleSelect ? modBcStyleSelect.value : 'army',
  );
}

(function initSiteCloneBcOnInjectToggle() {
  if (!modBcOnInjectToggle) return;
  applySiteCloneBcOnInjectPrefs();
  modBcOnInjectToggle.addEventListener('change', saveSiteCloneBcOnInjectPrefs);
  if (modBcStyleSelect) modBcStyleSelect.addEventListener('change', saveSiteCloneBcOnInjectPrefs);
})();

const SC_BC_STYLE_URL_BY_SANDBOX_KEY = 'siteCloneBcStyleConfigUrlBySandboxBySandbox';
const SC_BC_STYLE_URL_KEY = 'siteCloneBcStyleConfigUrlBySandbox';
const MOD_BC_DEFAULT_STYLE_URL = 'embed-bc/styleConfigurations-6a0992.js';
const siteCloneBcStyleConfigUrl = document.getElementById('siteCloneBcStyleConfigUrl');

function sanitiseSiteCloneBcStyleConfigUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return MOD_BC_DEFAULT_STYLE_URL;
  if (/^javascript:/i.test(v)) return MOD_BC_DEFAULT_STYLE_URL;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z0-9_./-]+\.(js|json)$/i.test(v)) return v;
  return MOD_BC_DEFAULT_STYLE_URL;
}

function readPersistedSiteCloneBcStyleConfigUrl(sandboxKey) {
  migrateLegacyModScalar(SC_BC_STYLE_URL_BY_SANDBOX_KEY, SC_BC_STYLE_URL_KEY, sanitiseSiteCloneBcStyleConfigUrl);
  const sk = sandboxKey != null ? sandboxKey : getModSandboxKey();
  const stored = readModSandboxStringForKey(
    SC_BC_STYLE_URL_BY_SANDBOX_KEY,
    sk,
    sanitiseSiteCloneBcStyleConfigUrl,
    '',
  );
  return stored || MOD_BC_DEFAULT_STYLE_URL;
}

function getSiteCloneBcStyleConfigUrl() {
  if (siteCloneBcStyleConfigUrl && siteCloneBcStyleConfigUrl.value.trim()) {
    return sanitiseSiteCloneBcStyleConfigUrl(siteCloneBcStyleConfigUrl.value);
  }
  return readPersistedSiteCloneBcStyleConfigUrl();
}

function saveSiteCloneBcStyleConfigUrl() {
  const url = siteCloneBcStyleConfigUrl
    ? sanitiseSiteCloneBcStyleConfigUrl(siteCloneBcStyleConfigUrl.value)
    : readPersistedSiteCloneBcStyleConfigUrl();
  if (siteCloneBcStyleConfigUrl && siteCloneBcStyleConfigUrl.value.trim() !== url) {
    siteCloneBcStyleConfigUrl.value = url;
  }
  writeModSandboxString(SC_BC_STYLE_URL_BY_SANDBOX_KEY, url);
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
    hint.textContent = resolved
      ? 'Loaded for Modal / Injected / Full Screen: ' + resolved
      : '';
  }
  ['siteCloneBcFullScreenToggle', 'siteCloneBcModalToggle', 'siteCloneBcInjectedToggle'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('data-site-clone-bc-style-url', url);
  });
}

function invalidateSiteCloneBcCore() {
  if (typeof window.SiteCloneBc !== 'undefined' && typeof window.SiteCloneBc.invalidateCore === 'function') {
    window.SiteCloneBc.invalidateCore();
  }
}

const SC_BC_DATASTREAM_BY_SANDBOX_KEY = 'siteCloneBcDatastreamIdBySandboxBySandbox';
const SC_BC_DATASTREAM_ID_KEY = 'siteCloneBcDatastreamIdBySandbox';
const MOD_BC_DEFAULT_DATASTREAM_ID = 'cf7272a7-f634-4bdf-9ce6-fa31ac0c6416';
const siteCloneBcDatastreamId = document.getElementById('siteCloneBcDatastreamId');
const siteCloneBcDatastreamList = document.getElementById('siteCloneBcDatastreamList');

/** @type {Array<{ id: string, title: string, sandbox?: string }>} */
let siteCloneBcAllDatastreamOptions = [];

function sanitiseSiteCloneBcDatastreamId(raw) {
  const v = String(raw || '').trim();
  if (!v) return MOD_BC_DEFAULT_DATASTREAM_ID;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v.toLowerCase();
  return MOD_BC_DEFAULT_DATASTREAM_ID;
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

function readPersistedSiteCloneBcDatastreamId(sandboxKey) {
  migrateLegacyModScalar(SC_BC_DATASTREAM_BY_SANDBOX_KEY, SC_BC_DATASTREAM_ID_KEY, sanitiseSiteCloneBcDatastreamId);
  const sk = sandboxKey != null ? sandboxKey : getModSandboxKey();
  const stored = readModSandboxStringForKey(
    SC_BC_DATASTREAM_BY_SANDBOX_KEY,
    sk,
    sanitiseSiteCloneBcDatastreamId,
    '',
  );
  return stored || MOD_BC_DEFAULT_DATASTREAM_ID;
}

function getSiteCloneBcDatastreamId() {
  const resolved = resolveSiteCloneBcDatastreamIdFromInput();
  if (resolved) return sanitiseSiteCloneBcDatastreamId(resolved);
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
  writeModSandboxString(SC_BC_DATASTREAM_BY_SANDBOX_KEY, id);
  refreshSiteCloneBcDatastreamHint();
  return id;
}

function saveSiteCloneBcDatastreamId() {
  applySiteCloneBcDatastreamInputToStoredId();
}

function refreshSiteCloneBcDatastreamHint() {
  const id = getSiteCloneBcDatastreamId();
  const hint = document.getElementById('siteCloneBcDatastreamHint');
  const sandbox = getSiteCloneBcSandboxName();
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
  const sandbox = getSiteCloneBcSandboxName();
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
    siteCloneBcAllDatastreamOptions = Array.isArray(data.datastreams) ? data.datastreams : [];
    renderSiteCloneBcDatastreamSuggestions(siteCloneBcDatastreamId ? siteCloneBcDatastreamId.value : '');

    const storedId = readPersistedSiteCloneBcDatastreamId();

    const hit = siteCloneBcAllDatastreamOptions.find(function (d) {
      return String(d.id || '').toLowerCase() === storedId;
    });
    if (siteCloneBcDatastreamId) {
      siteCloneBcDatastreamId.value = hit ? datastreamLabelFromItem(hit) : storedId;
    }

    if (hint) {
      if (data.note && !siteCloneBcAllDatastreamOptions.length) {
        hint.textContent = String(data.note);
      } else {
        refreshSiteCloneBcDatastreamHint();
      }
    }
  } catch (err) {
    siteCloneBcAllDatastreamOptions = [];
    renderSiteCloneBcDatastreamSuggestions('');
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

function normaliseModBcDisplayPrefs(raw) {
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
  migrateLegacyModScalar(SC_BC_PREFS_BY_SANDBOX_KEY, SC_BC_PREFS_KEY, function (legacy) {
    try {
      return JSON.parse(legacy);
    } catch {
      return null;
    }
  });
  const raw = readModStorageMap(SC_BC_PREFS_BY_SANDBOX_KEY)[getModSandboxKey()];
  if (raw && typeof raw === 'object') return normaliseModBcDisplayPrefs(raw);
  try {
    const flat = localStorage.getItem(SC_BC_PREFS_KEY);
    if (flat) return normaliseModBcDisplayPrefs(JSON.parse(flat));
  } catch {
    /* noop */
  }
  return { fullScreen: false, modal: false, injected: false };
}

function saveSiteCloneBcDisplayPrefs(sandboxKey) {
  const map = readModStorageMap(SC_BC_PREFS_BY_SANDBOX_KEY);
  const key = sandboxKey != null ? sandboxKey : getModSandboxKey();
  map[key] = {
    fullScreen: !!(siteCloneBcFullScreenToggle && siteCloneBcFullScreenToggle.checked),
    modal: !!(siteCloneBcModalToggle && siteCloneBcModalToggle.checked),
    injected: !!(siteCloneBcInjectedToggle && siteCloneBcInjectedToggle.checked),
  };
  writeModStorageMap(SC_BC_PREFS_BY_SANDBOX_KEY, map);
}

function flushModDemoEnvForSandboxKey(sandboxKey) {
  const sk = String(sandboxKey || '').trim();
  if (!sk) return;
  if (siteCloneBcStyleConfigUrl && siteCloneBcStyleConfigUrl.value.trim()) {
    writeModSandboxStringForKey(
      SC_BC_STYLE_URL_BY_SANDBOX_KEY,
      sk,
      sanitiseSiteCloneBcStyleConfigUrl(siteCloneBcStyleConfigUrl.value),
    );
  }
  const dsFromInput = resolveSiteCloneBcDatastreamIdFromInput();
  if (dsFromInput) {
    writeModSandboxStringForKey(SC_BC_DATASTREAM_BY_SANDBOX_KEY, sk, sanitiseSiteCloneBcDatastreamId(dsFromInput));
  } else if (siteCloneBcDatastreamId && siteCloneBcDatastreamId.value.trim()) {
    writeModSandboxStringForKey(
      SC_BC_DATASTREAM_BY_SANDBOX_KEY,
      sk,
      sanitiseSiteCloneBcDatastreamId(siteCloneBcDatastreamId.value.trim()),
    );
  }
  saveSiteCloneBcDisplayPrefs(sk);
  const map = readModStorageMap(MOD_WEB_PUSH_BY_SANDBOX_KEY);
  map[sk] = modWebPushOnInjectToggle && modWebPushOnInjectToggle.checked ? '1' : '0';
  writeModStorageMap(MOD_WEB_PUSH_BY_SANDBOX_KEY, map);
  if (typeof AepBcToggle !== 'undefined' && modBcOnInjectToggle) {
    AepBcToggle.savePrefs(
      'modDemo',
      !!modBcOnInjectToggle.checked,
      modBcStyleSelect ? modBcStyleSelect.value : 'army',
      sk,
    );
  }
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
  siteCloneBcStyleConfigUrl.value = readPersistedSiteCloneBcStyleConfigUrl();
  function onStyleUrlChange() {
    saveSiteCloneBcStyleConfigUrl();
    invalidateSiteCloneBcCore();
    syncSiteCloneBcFromPrefs();
  }
  siteCloneBcStyleConfigUrl.addEventListener('input', function () {
    writeModSandboxString(
      SC_BC_STYLE_URL_BY_SANDBOX_KEY,
      sanitiseSiteCloneBcStyleConfigUrl(siteCloneBcStyleConfigUrl.value),
    );
    refreshSiteCloneBcStyleUrlHints();
  });
  siteCloneBcStyleConfigUrl.addEventListener('change', onStyleUrlChange);
  siteCloneBcStyleConfigUrl.addEventListener('blur', onStyleUrlChange);
  refreshSiteCloneBcStyleUrlHints();
})();

(function initSiteCloneBcDatastreamPicker() {
  if (!siteCloneBcDatastreamId) return;

  function onDatastreamFieldChange() {
    const prev = getSiteCloneBcDatastreamId();
    saveSiteCloneBcDatastreamId();
    const next = getSiteCloneBcDatastreamId();
    if (prev !== next) {
      invalidateSiteCloneBcCore();
      syncSiteCloneBcFromPrefs();
    }
  }

  siteCloneBcDatastreamId.addEventListener('input', function () {
    renderSiteCloneBcDatastreamSuggestions(siteCloneBcDatastreamId.value);
  });
  siteCloneBcDatastreamId.addEventListener('change', onDatastreamFieldChange);
  siteCloneBcDatastreamId.addEventListener('blur', onDatastreamFieldChange);

  void loadSiteCloneBcDatastreams();
})();

function applyModDemoEnvForCurrentSandbox() {
  applyModWebPushOnInjectToggle();
  applySiteCloneBcOnInjectPrefs();
  if (siteCloneBcStyleConfigUrl) {
    siteCloneBcStyleConfigUrl.value = readPersistedSiteCloneBcStyleConfigUrl();
    refreshSiteCloneBcStyleUrlHints();
  }
  applySiteCloneBcDisplayPrefsToUi();
  invalidateSiteCloneBcCore();
  syncSiteCloneBcFromPrefs();
  void loadSiteCloneBcDatastreams();
  modDemoEnvSandboxKey = getModSandboxKey();
}

window.addEventListener('aep-global-sandbox-change', function () {
  if (modDemoEnvSandboxKey) {
    flushModDemoEnvForSandboxKey(modDemoEnvSandboxKey);
  }
  modDemoEnvSandboxKey = getModSandboxKey();
  applyModDemoEnvForCurrentSandbox();
});

modDemoEnvSandboxKey = getModSandboxKey();

/** Suppress Tags-inject BC until the user clicks Inject (avoids BC popup on reload/resume). */
window.__siteCloneSuppressBcEnable = true;
const modInjectSdkBtn = document.getElementById('modInjectSdkBtn');
if (modInjectSdkBtn) {
  modInjectSdkBtn.addEventListener(
    'click',
    function () {
      window.__siteCloneSuppressBcEnable = false;
    },
    true,
  );
}

const modTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'modDemo',
        identityEventType: 'mod.identity.stitch',
        messageSetter: setModMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'modTagsCompany',
        tagsPropertyInputId: 'modTagsProperty',
        tagsPropertyListId: 'modTagsPropertyList',
        tagsEnvironmentId: 'modTagsEnvironment',
        injectButtonId: 'modInjectSdkBtn',
        selectedScriptId: 'modSelectedScript',
        configFieldsId: 'modSdkConfigFields',
        configSummaryId: 'modSdkConfigSummary',
        configSummaryTextId: 'modSdkConfigSummaryText',
        changeConfigButtonId: 'modChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        /**
         * Parent shell only — same as Premier Inn / Admiral (`docs/ANONYMOUS_EDGE_DEMO_PATTERN.md`).
         * Avoids a second ECID in the MOD site iframe vs parent #infoEcid + generator / Edge.
         */
        iframeIds: [],
        hideTagsCompanyUi: true,
        webPush: {
          enabled: true,
          subscribeAfterInject: modWebPushOnInjectDesired,
          requestPermissionOnInject: modWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () {
            return !!(modBcOnInjectToggle && modBcOnInjectToggle.checked);
          },
          styleKey: function () {
            return modBcStyleSelect ? modBcStyleSelect.value : 'army';
          },
          suppressEnable: function () {
            return !!window.__siteCloneSuppressBcEnable;
          },
        },
      })
    : null;

const modWebPushRetryBtn = document.getElementById('modWebPushRetryBtn');
if (modWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  modWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'modDemo' }).then(function (ok) {
      setModMessage(
        ok
          ? 'Web push subscription sent (requires Tags Web SDK pushNotifications, permission, and AJO push surface).'
          : 'Web push did not complete. Allow notifications, ensure push is enabled on your datastream, and that Tags is injected on this page.',
        ok ? 'success' : 'error',
      );
    });
  });
}

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setModMessage(text, type) {
  if (!modMessage) return;
  modMessage.textContent = text || '';
  modMessage.className =
    'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  modMessage.hidden = !text;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

async function loadGeneratorTargets() {
  if (!generatorTargetSelect) return;
  if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect) {
    generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {});
    return;
  }
  try {
    const res = await fetch('/api/events/generator-targets');
    const data = await res.json().catch(() => ({}));
    generatorTargets = Array.isArray(data.targets) ? data.targets : [];
    generatorTargetSelect.innerHTML = '';
    if (generatorTargets.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No targets (check event-generator-targets.json)';
      generatorTargetSelect.appendChild(opt);
      return;
    }
    generatorTargets.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label || t.id;
      generatorTargetSelect.appendChild(opt);
    });
  } catch {
    generatorTargetSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Failed to load targets';
    generatorTargetSelect.appendChild(opt);
  }
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    const email = getEmail().trim();
    if (!email) {
      setModMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setModMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !modTagsInjection || typeof modTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await modTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setModMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

void loadGeneratorTargets();
if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
  window.AepDemoGeneratorTargets.onSandboxChange(function () {
    void loadGeneratorTargets();
  });
}

(function initModDemoSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'modSdkConfigSummary',
    fieldsId: 'modSdkConfigFields',
    selectedScriptCodeId: 'modSelectedScript',
  });
})();

(function normalizeSnapshotFrame() {
  const frame = document.querySelector('.mod-demo-site-frame');
  if (!frame) return;

  function applySnapshotLayoutFix(doc) {
    const root = doc.documentElement;
    const body = doc.body;
    if (!root || !body) return;

    root.classList.remove('lenis', 'lenis-scrolling');
    root.style.removeProperty('--viewport-width');
    root.style.removeProperty('--viewport-height');
    root.style.removeProperty('--scrollbar-width');
    root.style.removeProperty('scroll-behavior');

    let styleEl = doc.getElementById('aep-mod-snapshot-runtime-fix');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'aep-mod-snapshot-runtime-fix';
      doc.head.appendChild(styleEl);
    }

    const fs = root.classList.contains('mod-demo-bc-fs-active');
    const inj = root.classList.contains('mod-demo-bc-injected-active');
    if (fs || inj) {
      styleEl.textContent =
        'html,body{margin:0!important;width:100%!important;max-width:none!important;overflow-x:hidden!important;}';
      return;
    }
    styleEl.textContent = [
      'html,body{margin:0!important;width:100%!important;max-width:none!important;overflow-x:hidden!important;}',
      '.pin-spacer{width:100%!important;max-width:100%!important;left:0!important;right:0!important;padding:0!important;margin:0!important;transform:none!important;overflow:visible!important;}',
      '.pin-spacer>.exp-content__block-container,.pin-spacer>[x-ref=\"blockInner\"]{width:100%!important;max-width:100%!important;left:0!important;right:0!important;top:0!important;margin:0!important;transform:none!important;}',
      '.exp-hero-banner__logo{position:fixed!important;top:18px!important;left:50%!important;transform:translateX(-50%)!important;z-index:1200!important;margin:0!important;}',
      '.exp-hero-banner__cta-btn{position:fixed!important;top:18px!important;left:22px!important;transform:none!important;z-index:1200!important;margin:0!important;}',
      '.exp-hero-banner__text-container,.exp-hero-banner__media-container,.exp-hero-banner__scroll-prompt{transform:none!important;}',
    ].join('');
  }

  frame.addEventListener('load', function () {
    const doc = frame.contentDocument;
    if (!doc) return;
    applySnapshotLayoutFix(doc);
    try {
      frame.contentWindow.scrollTo(0, 0);
    } catch {}
  });
})();

(function initModDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('mod-demo-page')) return;
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;

  const mq = window.matchMedia('(max-width: 768px)');
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setFlyoutOpen(open) {
    body.classList.toggle('mod-demo-page--nav-open', open);
  }

  function scheduleClose() {
    clearHideTimer();
    hideTimer = window.setTimeout(function () {
      setFlyoutOpen(false);
      hideTimer = null;
    }, 450);
  }

  const topAnchor = document.getElementById('modDemoTopAnchor');
  const sidebarZone = document.getElementById('modDemoSidebarHoverZone');

  function pointerInTopChromeBand(clientY) {
    if (!topAnchor) return false;
    const r = topAnchor.getBoundingClientRect();
    return clientY <= r.bottom + 6;
  }

  function onPointerMove(e) {
    if (mq.matches) return;
    if (e.clientX <= 20 && !pointerInTopChromeBand(e.clientY)) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    const r = sidebar.getBoundingClientRect();
    const over =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    if (body.classList.contains('mod-demo-page--nav-open')) {
      scheduleClose();
    }
  }

  sidebar.addEventListener('mouseenter', function () {
    if (!mq.matches) {
      clearHideTimer();
      setFlyoutOpen(true);
    }
  });

  sidebar.addEventListener('mouseleave', function () {
    if (!mq.matches) scheduleClose();
  });

  if (sidebarZone) {
    sidebarZone.addEventListener('mouseenter', function () {
      if (!mq.matches) {
        clearHideTimer();
        setFlyoutOpen(true);
      }
    });
    sidebarZone.addEventListener('mouseleave', function () {
      if (!mq.matches) scheduleClose();
    });
  }

  document.addEventListener('mousemove', onPointerMove, { passive: true });

  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('mod-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'mod-demo-page--profile-open',
  viewName: 'MOD (British Army)',
  emailGetter: getEmail,
  messageSetter: setModMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

