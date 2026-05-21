/**
 * WB World Abu Dhabi demo — profile lookup + Tags injection + optional web push + flyout lab nav.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'wbworldNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const wbworldMessage = document.getElementById('wbworldMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const WBWORLD_WEB_PUSH_ON_INJECT_KEY = 'wbworldWebPushOnInjectToggle';
const wbworldWebPushOnInjectToggle = document.getElementById('wbworldWebPushOnInjectToggle');
if (wbworldWebPushOnInjectToggle) {
  try {
    if (localStorage.getItem(WBWORLD_WEB_PUSH_ON_INJECT_KEY) === '1') wbworldWebPushOnInjectToggle.checked = true;
  } catch {
    /* noop */
  }
  wbworldWebPushOnInjectToggle.addEventListener('change', function () {
    try {
      localStorage.setItem(WBWORLD_WEB_PUSH_ON_INJECT_KEY, wbworldWebPushOnInjectToggle.checked ? '1' : '0');
    } catch {
      /* noop */
    }
  });
}

function wbworldWebPushOnInjectDesired() {
  return !!(wbworldWebPushOnInjectToggle && wbworldWebPushOnInjectToggle.checked);
}

// Brand Concierge launcher visibility toggle
const wbworldBcLauncherToggle = document.getElementById('wbworldBcLauncherToggle');
const wbworldBcLauncher = document.getElementById('wbworldBcLauncher');
(function initWbworldBcLauncher() {
  const LAUNCHER_KEY = 'wbworldBcLauncherVisible';
  if (!wbworldBcLauncherToggle) return;
  try {
    if (localStorage.getItem(LAUNCHER_KEY) === '1') {
      wbworldBcLauncherToggle.checked = true;
      document.body.classList.add('aep-bc-launcher-on');
    }
  } catch { /* noop */ }
  wbworldBcLauncherToggle.addEventListener('change', function () {
    const on = wbworldBcLauncherToggle.checked;
    document.body.classList.toggle('aep-bc-launcher-on', on);
    try { localStorage.setItem(LAUNCHER_KEY, on ? '1' : '0'); } catch { /* noop */ }
  });
  if (wbworldBcLauncher) {
    wbworldBcLauncher.addEventListener('click', function () {
      if (typeof AepBcToggle !== 'undefined') AepBcToggle.reopen(); else document.body.classList.remove('aep-bc-panel-dismissed');
    });
  }
})();

// Brand Concierge toggle
const wbworldBcOnInjectToggle = document.getElementById('wbworldBcOnInjectToggle');
const wbworldBcStyleSelect = document.getElementById('wbworldBcStyleSelect');
(function initWbworldBcToggle() {
  if (!wbworldBcOnInjectToggle) return;
  const prefs = typeof AepBcToggle !== 'undefined' ? AepBcToggle.loadPrefs('wbworld') : { enabled: false, styleKey: 'miral' };
  wbworldBcOnInjectToggle.checked = !!prefs.enabled;
  if (wbworldBcStyleSelect && prefs.styleKey) wbworldBcStyleSelect.value = prefs.styleKey;
  function saveBcPrefs() {
    if (typeof AepBcToggle === 'undefined') return;
    AepBcToggle.savePrefs('wbworld', !!(wbworldBcOnInjectToggle && wbworldBcOnInjectToggle.checked), wbworldBcStyleSelect ? wbworldBcStyleSelect.value : 'miral');
  }
  wbworldBcOnInjectToggle.addEventListener('change', saveBcPrefs);
  if (wbworldBcStyleSelect) wbworldBcStyleSelect.addEventListener('change', saveBcPrefs);
})();

const wbworldTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'wbworld',
        identityEventType: 'wbworld.identity.stitch',
        messageSetter: setWbworldMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'wbworldTagsCompany',
        tagsPropertyInputId: 'wbworldTagsProperty',
        tagsPropertyListId: 'wbworldTagsPropertyList',
        tagsEnvironmentId: 'wbworldTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'wbworldSelectedScript',
        configFieldsId: 'wbworldSdkConfigFields',
        configSummaryId: 'wbworldSdkConfigSummary',
        configSummaryTextId: 'wbworldSdkConfigSummaryText',
        changeConfigButtonId: 'wbworldChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: [],
        webPush: {
          enabled: true,
          subscribeAfterInject: wbworldWebPushOnInjectDesired,
          requestPermissionOnInject: wbworldWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () { return !!(wbworldBcOnInjectToggle && wbworldBcOnInjectToggle.checked); },
          styleKey: function () { return wbworldBcStyleSelect ? wbworldBcStyleSelect.value : 'miral'; },
        },
        onEcidResolved: function () {
          if (typeof window.MiralCrossSite !== 'undefined') window.MiralCrossSite.retryPageView();
          if (typeof AepBcToggle !== 'undefined') AepBcToggle.enableIfPrefsSet('wbworld');
        },
      })
    : null;

const wbworldWebPushRetryBtn = document.getElementById('wbworldWebPushRetryBtn');
if (wbworldWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  wbworldWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'wbworld' }).then(function (ok) {
      setWbworldMessage(
        ok
          ? 'Web push subscription sent.'
          : 'Web push did not complete. Allow notifications, ensure push is enabled on your datastream, and that Tags is injected on this page.',
        ok ? 'success' : 'error',
      );
    });
  });
}

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setWbworldMessage(text, type) {
  if (!wbworldMessage) return;
  wbworldMessage.textContent = text || '';
  wbworldMessage.className =
    'wb-world-abu-dhabi-demo-message' + (type ? ' wb-world-abu-dhabi-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  wbworldMessage.hidden = !text;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

async function loadGeneratorTargets() {
  if (!generatorTargetSelect) return;
  if (
    typeof window.AepDemoGeneratorTargets !== 'undefined' &&
    window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
  ) {
    generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, { preferredId: 'lab-event-tool-edge' });
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

void loadGeneratorTargets();
if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
  window.AepDemoGeneratorTargets.onSandboxChange(function () {
    void loadGeneratorTargets();
  });
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    const email = getEmail().trim();
    if (!email) {
      setWbworldMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setWbworldMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !wbworldTagsInjection || typeof wbworldTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await wbworldTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setWbworldMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initWbworldDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('wb-world-abu-dhabi-demo-page')) return;
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;

  const mq = window.matchMedia('(max-width: 768px)');
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
  }

  function setFlyoutOpen(open) {
    body.classList.toggle('wb-world-abu-dhabi-demo-page--nav-open', open);
  }

  function scheduleClose() {
    clearHideTimer();
    hideTimer = window.setTimeout(function () { setFlyoutOpen(false); hideTimer = null; }, 450);
  }

  function onPointerMove(e) {
    if (mq.matches) return;
    if (e.clientX <= 24) { clearHideTimer(); setFlyoutOpen(true); return; }
    const r = sidebar.getBoundingClientRect();
    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over) { clearHideTimer(); setFlyoutOpen(true); return; }
    if (body.classList.contains('wb-world-abu-dhabi-demo-page--nav-open')) scheduleClose();
  }

  sidebar.addEventListener('mouseenter', function () { if (!mq.matches) { clearHideTimer(); setFlyoutOpen(true); } });
  sidebar.addEventListener('mouseleave', function () { if (!mq.matches) scheduleClose(); });
  document.addEventListener('mousemove', onPointerMove, { passive: true });
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('wb-world-abu-dhabi-demo-page--nav-open');
  });
  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'wb-world-abu-dhabi-demo-page--profile-open',
  viewName: 'WB World Abu Dhabi demo',
  emailGetter: getEmail,
  messageSetter: setWbworldMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initWbworldSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'wbworldSdkConfigSummary',
    fieldsId: 'wbworldSdkConfigFields',
    selectedScriptCodeId: 'wbworldSelectedScript',
  });
})();
