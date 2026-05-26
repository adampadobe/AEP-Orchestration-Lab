/**
 * MOD (British Army) demo — profile lookup + flyout lab nav; saved homepage in iframe.
 * Lab strip: web push + Tags inject aligned with Etihad (`etihad-demo.html`); BC modes in `mod-demo-bc.js`.
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

const MOD_WEB_PUSH_ON_INJECT_KEY = 'modDemoWebPushOnInjectToggle';
const modWebPushOnInjectToggle = document.getElementById('modWebPushOnInjectToggle');
if (modWebPushOnInjectToggle) {
  try {
    if (localStorage.getItem(MOD_WEB_PUSH_ON_INJECT_KEY) === '1') modWebPushOnInjectToggle.checked = true;
  } catch {
    /* noop */
  }
  modWebPushOnInjectToggle.addEventListener('change', function () {
    try {
      localStorage.setItem(MOD_WEB_PUSH_ON_INJECT_KEY, modWebPushOnInjectToggle.checked ? '1' : '0');
    } catch {
      /* noop */
    }
  });
}

function modWebPushOnInjectDesired() {
  return !!(modWebPushOnInjectToggle && modWebPushOnInjectToggle.checked);
}

// Brand Concierge when injecting Tags (Etihad pattern)
const modBcOnInjectToggle = document.getElementById('modBcOnInjectToggle');
const modBcStyleSelect = document.getElementById('modBcStyleSelect');
(function initModBcOnInjectToggle() {
  if (!modBcOnInjectToggle) return;
  const prefs =
    typeof AepBcToggle !== 'undefined' ? AepBcToggle.loadPrefs('modDemo') : { enabled: false, styleKey: 'army' };
  modBcOnInjectToggle.checked = !!prefs.enabled;
  if (modBcStyleSelect && prefs.styleKey) modBcStyleSelect.value = prefs.styleKey;
  function saveBcPrefs() {
    if (typeof AepBcToggle === 'undefined') return;
    AepBcToggle.savePrefs(
      'modDemo',
      !!(modBcOnInjectToggle && modBcOnInjectToggle.checked),
      modBcStyleSelect ? modBcStyleSelect.value : 'army',
    );
  }
  modBcOnInjectToggle.addEventListener('change', saveBcPrefs);
  if (modBcStyleSelect) modBcStyleSelect.addEventListener('change', saveBcPrefs);
})();

const MOD_BC_STYLE_URL_KEY = 'modDemoBcStyleConfigUrl';
const MOD_BC_DEFAULT_STYLE_URL = 'army-bc/styleConfigurations-6a0992.js';
const modBcStyleConfigUrl = document.getElementById('modBcStyleConfigUrl');

function sanitiseModBcStyleConfigUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return MOD_BC_DEFAULT_STYLE_URL;
  if (/^javascript:/i.test(v)) return MOD_BC_DEFAULT_STYLE_URL;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z0-9_./-]+\.(js|json)$/i.test(v)) return v;
  return MOD_BC_DEFAULT_STYLE_URL;
}

function getModBcStyleConfigUrl() {
  if (modBcStyleConfigUrl && modBcStyleConfigUrl.value.trim()) {
    return sanitiseModBcStyleConfigUrl(modBcStyleConfigUrl.value);
  }
  try {
    const stored = localStorage.getItem(MOD_BC_STYLE_URL_KEY);
    if (stored) return sanitiseModBcStyleConfigUrl(stored);
  } catch {
    /* noop */
  }
  return MOD_BC_DEFAULT_STYLE_URL;
}

function saveModBcStyleConfigUrl() {
  const url = getModBcStyleConfigUrl();
  if (modBcStyleConfigUrl && modBcStyleConfigUrl.value.trim() !== url) {
    modBcStyleConfigUrl.value = url;
  }
  try {
    localStorage.setItem(MOD_BC_STYLE_URL_KEY, url);
  } catch {
    /* noop */
  }
  refreshModBcStyleUrlHints();
}

function getModBcStyleConfigResolvedUrl() {
  const raw = getModBcStyleConfigUrl();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.charAt(0) === '/') return raw;
  const pageDir = window.location.pathname.replace(/\/[^/]*$/, '/');
  return pageDir + raw.replace(/^\.\//, '');
}

function refreshModBcStyleUrlHints() {
  const url = getModBcStyleConfigUrl();
  const resolved = getModBcStyleConfigResolvedUrl();
  const hint = document.getElementById('modBcStyleConfigResolved');
  if (hint) {
    hint.textContent = resolved
      ? 'Loaded for Modal / Injected / Full Screen: ' + resolved
      : '';
  }
  ['modBcFullScreenToggle', 'modBcModalToggle', 'modBcInjectedToggle'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('data-mod-bc-style-url', url);
  });
}

function invalidateModDemoBcCore() {
  if (typeof window.ModDemoBc !== 'undefined' && typeof window.ModDemoBc.invalidateCore === 'function') {
    window.ModDemoBc.invalidateCore();
  }
}

const MOD_BC_DATASTREAM_ID_KEY = 'modDemoBcDatastreamId';
const MOD_BC_DEFAULT_DATASTREAM_ID = 'cf7272a7-f634-4bdf-9ce6-fa31ac0c6416';
const modBcDatastreamId = document.getElementById('modBcDatastreamId');
const modBcDatastreamList = document.getElementById('modBcDatastreamList');

/** @type {Array<{ id: string, title: string, sandbox?: string }>} */
let modBcAllDatastreamOptions = [];

function sanitiseModBcDatastreamId(raw) {
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

function findModBcDatastreamByLabel(label) {
  const target = String(label || '').trim().toLowerCase();
  if (!target) return null;
  return (
    modBcAllDatastreamOptions.find(function (d) {
      return datastreamLabelFromItem(d).toLowerCase() === target;
    }) || null
  );
}

function resolveModBcDatastreamIdFromInput() {
  const raw = modBcDatastreamId ? String(modBcDatastreamId.value || '').trim() : '';
  if (!raw) return '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  const hit = findModBcDatastreamByLabel(raw);
  if (hit && hit.id) return String(hit.id).toLowerCase();
  return '';
}

function getModBcDatastreamId() {
  const resolved = resolveModBcDatastreamIdFromInput();
  if (resolved) return sanitiseModBcDatastreamId(resolved);
  try {
    const stored = localStorage.getItem(MOD_BC_DATASTREAM_ID_KEY);
    if (stored) return sanitiseModBcDatastreamId(stored);
  } catch {
    /* noop */
  }
  return MOD_BC_DEFAULT_DATASTREAM_ID;
}

function getModBcSandboxName() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
    return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
  }
  const sel = document.getElementById('sandboxSelect');
  if (sel && sel.value) return String(sel.value).trim();
  return '';
}

function renderModBcDatastreamSuggestions(query) {
  if (!modBcDatastreamList) return;
  const q = String(query || '').trim().toLowerCase();
  modBcDatastreamList.innerHTML = '';
  const matches = modBcAllDatastreamOptions
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
    modBcDatastreamList.appendChild(opt);
  });
}

function applyModBcDatastreamInputToStoredId() {
  const id = getModBcDatastreamId();
  const hit = modBcAllDatastreamOptions.find(function (d) {
    return String(d.id || '').toLowerCase() === id;
  });
  if (modBcDatastreamId && hit) {
    modBcDatastreamId.value = datastreamLabelFromItem(hit);
  }
  try {
    localStorage.setItem(MOD_BC_DATASTREAM_ID_KEY, id);
  } catch {
    /* noop */
  }
  refreshModBcDatastreamHint();
  return id;
}

function saveModBcDatastreamId() {
  applyModBcDatastreamInputToStoredId();
}

function refreshModBcDatastreamHint() {
  const id = getModBcDatastreamId();
  const hint = document.getElementById('modBcDatastreamHint');
  const sandbox = getModBcSandboxName();
  if (!hint) return;
  if (!modBcAllDatastreamOptions.length) {
    hint.textContent = id
      ? 'Alloy datastreamId (manual): ' + id + (sandbox ? ' · sandbox ' + sandbox : '')
      : sandbox
        ? 'Load datastreams for sandbox ' + sandbox + ', or paste a UUID.'
        : 'Paste a datastream UUID.';
    return;
  }
  hint.textContent =
    modBcAllDatastreamOptions.length +
    ' datastream(s)' +
    (sandbox ? ' for ' + sandbox : '') +
    ' · selected ' +
    id;
}

async function loadModBcDatastreams() {
  const sandbox = getModBcSandboxName();
  const hint = document.getElementById('modBcDatastreamHint');
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
    modBcAllDatastreamOptions = Array.isArray(data.datastreams) ? data.datastreams : [];
    renderModBcDatastreamSuggestions(modBcDatastreamId ? modBcDatastreamId.value : '');

    let storedId = MOD_BC_DEFAULT_DATASTREAM_ID;
    try {
      const raw = localStorage.getItem(MOD_BC_DATASTREAM_ID_KEY);
      if (raw) storedId = sanitiseModBcDatastreamId(raw);
    } catch {
      /* noop */
    }

    const hit = modBcAllDatastreamOptions.find(function (d) {
      return String(d.id || '').toLowerCase() === storedId;
    });
    if (hit && modBcDatastreamId) {
      modBcDatastreamId.value = datastreamLabelFromItem(hit);
    } else if (modBcDatastreamId && !modBcDatastreamId.value.trim()) {
      modBcDatastreamId.value = storedId;
    }

    if (hint) {
      if (data.note && !modBcAllDatastreamOptions.length) {
        hint.textContent = String(data.note);
      } else {
        refreshModBcDatastreamHint();
      }
    }
  } catch (err) {
    modBcAllDatastreamOptions = [];
    renderModBcDatastreamSuggestions('');
    if (hint) {
      hint.textContent =
        'Could not load datastreams' +
        (err && err.message ? ': ' + err.message : '') +
        '. Paste a datastream UUID.';
    }
  }
}

window.ModDemoBcConfig = {
  getStyleConfigUrl: getModBcStyleConfigUrl,
  getDatastreamId: getModBcDatastreamId,
};

// Brand Concierge display prefs (env bar) — army-mod-home injected / modal modes
const modBcFullScreenToggle = document.getElementById('modBcFullScreenToggle');
const modBcModalToggle = document.getElementById('modBcModalToggle');
const modBcInjectedToggle = document.getElementById('modBcInjectedToggle');
const MOD_BC_PREFS_KEY = 'modDemoBcDisplayPrefs';

function loadModBcDisplayPrefs() {
  try {
    const raw = localStorage.getItem(MOD_BC_PREFS_KEY);
    if (!raw) return { fullScreen: false, modal: false, injected: false };
    const p = JSON.parse(raw);
    return {
      fullScreen: !!p.fullScreen,
      modal: !!p.modal,
      injected: !!p.injected,
    };
  } catch {
    return { fullScreen: false, modal: false, injected: false };
  }
}

function saveModBcDisplayPrefs() {
  try {
    localStorage.setItem(
      MOD_BC_PREFS_KEY,
      JSON.stringify({
        fullScreen: !!(modBcFullScreenToggle && modBcFullScreenToggle.checked),
        modal: !!(modBcModalToggle && modBcModalToggle.checked),
        injected: !!(modBcInjectedToggle && modBcInjectedToggle.checked),
      }),
    );
  } catch { /* noop */ }
}

function syncModDemoBcFromPrefs() {
  if (typeof window.ModDemoBc !== 'undefined' && typeof window.ModDemoBc.sync === 'function') {
    window.ModDemoBc.sync();
  }
}

(function initModBcDisplayPrefs() {
  const prefs = loadModBcDisplayPrefs();
  if (prefs.modal && (prefs.injected || prefs.fullScreen)) {
    prefs.injected = false;
    prefs.fullScreen = false;
  } else if (prefs.fullScreen && prefs.injected) {
    prefs.injected = false;
  }
  if (modBcInjectedToggle) modBcInjectedToggle.checked = prefs.injected;
  if (modBcFullScreenToggle) modBcFullScreenToggle.checked = prefs.fullScreen;
  if (modBcModalToggle) modBcModalToggle.checked = prefs.modal;
  [modBcFullScreenToggle, modBcModalToggle, modBcInjectedToggle].forEach(function (el) {
    if (!el) return;
    el.addEventListener('change', function () {
      if (el === modBcModalToggle && el.checked) {
        if (modBcInjectedToggle) modBcInjectedToggle.checked = false;
        if (modBcFullScreenToggle) modBcFullScreenToggle.checked = false;
      }
      if ((el === modBcInjectedToggle || el === modBcFullScreenToggle) && el.checked) {
        if (modBcModalToggle) modBcModalToggle.checked = false;
      }
      if (el === modBcInjectedToggle && el.checked && modBcFullScreenToggle) {
        modBcFullScreenToggle.checked = false;
      }
      if (el === modBcFullScreenToggle && el.checked && modBcInjectedToggle) {
        modBcInjectedToggle.checked = false;
      }
      saveModBcDisplayPrefs();
      syncModDemoBcFromPrefs();
    });
  });
  saveModBcDisplayPrefs();
})();

(function initModBcStyleConfigUrl() {
  if (!modBcStyleConfigUrl) return;
  try {
    const stored = localStorage.getItem(MOD_BC_STYLE_URL_KEY);
    modBcStyleConfigUrl.value = stored ? sanitiseModBcStyleConfigUrl(stored) : MOD_BC_DEFAULT_STYLE_URL;
  } catch {
    modBcStyleConfigUrl.value = MOD_BC_DEFAULT_STYLE_URL;
  }
  function onStyleUrlChange() {
    saveModBcStyleConfigUrl();
    invalidateModDemoBcCore();
    syncModDemoBcFromPrefs();
  }
  modBcStyleConfigUrl.addEventListener('change', onStyleUrlChange);
  modBcStyleConfigUrl.addEventListener('blur', onStyleUrlChange);
  refreshModBcStyleUrlHints();
})();

(function initModBcDatastreamPicker() {
  if (!modBcDatastreamId) return;

  function onDatastreamFieldChange() {
    const prev = getModBcDatastreamId();
    saveModBcDatastreamId();
    const next = getModBcDatastreamId();
    if (prev !== next) {
      invalidateModDemoBcCore();
      syncModDemoBcFromPrefs();
    }
  }

  modBcDatastreamId.addEventListener('input', function () {
    renderModBcDatastreamSuggestions(modBcDatastreamId.value);
  });
  modBcDatastreamId.addEventListener('change', onDatastreamFieldChange);
  modBcDatastreamId.addEventListener('blur', onDatastreamFieldChange);

  window.addEventListener('aep-global-sandbox-change', function () {
    void loadModBcDatastreams();
  });

  void loadModBcDatastreams();
})();

/** Suppress Tags-inject BC until the user clicks Inject (avoids BC popup on reload/resume). */
window.__modDemoSuppressBcEnable = true;
const modInjectSdkBtn = document.getElementById('modInjectSdkBtn');
if (modInjectSdkBtn) {
  modInjectSdkBtn.addEventListener(
    'click',
    function () {
      window.__modDemoSuppressBcEnable = false;
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
            return !!window.__modDemoSuppressBcEnable;
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

