/**
 * Ferrari World Abu Dhabi demo — profile lookup + Tags injection + optional web push + flyout lab nav.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'ferrariworldNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const ferrariworldMessage = document.getElementById('ferrariworldMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const FERRARIWORLD_WEB_PUSH_ON_INJECT_KEY = 'ferrariworldWebPushOnInjectToggle';
const ferrariworldWebPushOnInjectToggle = document.getElementById('ferrariworldWebPushOnInjectToggle');
if (ferrariworldWebPushOnInjectToggle) {
  try {
    if (localStorage.getItem(FERRARIWORLD_WEB_PUSH_ON_INJECT_KEY) === '1') ferrariworldWebPushOnInjectToggle.checked = true;
  } catch {
    /* noop */
  }
  ferrariworldWebPushOnInjectToggle.addEventListener('change', function () {
    try {
      localStorage.setItem(FERRARIWORLD_WEB_PUSH_ON_INJECT_KEY, ferrariworldWebPushOnInjectToggle.checked ? '1' : '0');
    } catch {
      /* noop */
    }
  });
}

function ferrariworldWebPushOnInjectDesired() {
  return !!(ferrariworldWebPushOnInjectToggle && ferrariworldWebPushOnInjectToggle.checked);
}

// Brand Concierge launcher visibility toggle
const ferrariworldBcLauncherToggle = document.getElementById('ferrariworldBcLauncherToggle');
const ferrariworldBcLauncher = document.getElementById('ferrariworldBcLauncher');
(function initFerrariworldBcLauncher() {
  const LAUNCHER_KEY = 'ferrariworldBcLauncherVisible';
  if (!ferrariworldBcLauncherToggle) return;
  try {
    if (localStorage.getItem(LAUNCHER_KEY) === '1') {
      ferrariworldBcLauncherToggle.checked = true;
      document.body.classList.add('aep-bc-launcher-on');
    }
  } catch { /* noop */ }
  ferrariworldBcLauncherToggle.addEventListener('change', function () {
    const on = ferrariworldBcLauncherToggle.checked;
    document.body.classList.toggle('aep-bc-launcher-on', on);
    try { localStorage.setItem(LAUNCHER_KEY, on ? '1' : '0'); } catch { /* noop */ }
  });
  if (ferrariworldBcLauncher) {
    ferrariworldBcLauncher.addEventListener('click', function () {
      if (typeof AepBcToggle !== 'undefined') AepBcToggle.reopen(); else document.body.classList.remove('aep-bc-panel-dismissed');
    });
  }
})();

// Brand Concierge toggle
const ferrariworldBcOnInjectToggle = document.getElementById('ferrariworldBcOnInjectToggle');
const ferrariworldBcStyleSelect = document.getElementById('ferrariworldBcStyleSelect');
(function initFerrariworldBcToggle() {
  if (!ferrariworldBcOnInjectToggle) return;
  const prefs = typeof AepBcToggle !== 'undefined' ? AepBcToggle.loadPrefs('ferrariworld') : { enabled: false, styleKey: 'miral' };
  ferrariworldBcOnInjectToggle.checked = !!prefs.enabled;
  if (ferrariworldBcStyleSelect && prefs.styleKey) ferrariworldBcStyleSelect.value = prefs.styleKey;
  function saveBcPrefs() {
    if (typeof AepBcToggle === 'undefined') return;
    AepBcToggle.savePrefs('ferrariworld', !!(ferrariworldBcOnInjectToggle && ferrariworldBcOnInjectToggle.checked), ferrariworldBcStyleSelect ? ferrariworldBcStyleSelect.value : 'miral');
  }
  ferrariworldBcOnInjectToggle.addEventListener('change', saveBcPrefs);
  if (ferrariworldBcStyleSelect) ferrariworldBcStyleSelect.addEventListener('change', saveBcPrefs);
})();

const ferrariworldTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'ferrariworld',
        identityEventType: 'ferrariworld.identity.stitch',
        messageSetter: setFerrariworldMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'ferrariworldTagsCompany',
        tagsPropertyInputId: 'ferrariworldTagsProperty',
        tagsPropertyListId: 'ferrariworldTagsPropertyList',
        tagsEnvironmentId: 'ferrariworldTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'ferrariworldSelectedScript',
        configFieldsId: 'ferrariworldSdkConfigFields',
        configSummaryId: 'ferrariworldSdkConfigSummary',
        configSummaryTextId: 'ferrariworldSdkConfigSummaryText',
        changeConfigButtonId: 'ferrariworldChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: [],
        webPush: {
          enabled: true,
          subscribeAfterInject: ferrariworldWebPushOnInjectDesired,
          requestPermissionOnInject: ferrariworldWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () { return !!(ferrariworldBcOnInjectToggle && ferrariworldBcOnInjectToggle.checked); },
          styleKey: function () { return ferrariworldBcStyleSelect ? ferrariworldBcStyleSelect.value : 'miral'; },
        },
      })
    : null;

const ferrariworldWebPushRetryBtn = document.getElementById('ferrariworldWebPushRetryBtn');
if (ferrariworldWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  ferrariworldWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'ferrariworld' }).then(function (ok) {
      setFerrariworldMessage(
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

function setFerrariworldMessage(text, type) {
  if (!ferrariworldMessage) return;
  ferrariworldMessage.textContent = text || '';
  ferrariworldMessage.className =
    'ferrari-world-abu-dhabi-demo-message' + (type ? ' ferrari-world-abu-dhabi-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  ferrariworldMessage.hidden = !text;
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
      setFerrariworldMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setFerrariworldMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !ferrariworldTagsInjection || typeof ferrariworldTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await ferrariworldTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setFerrariworldMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initFerrariworldDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('ferrari-world-abu-dhabi-demo-page')) return;
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;

  const mq = window.matchMedia('(max-width: 768px)');
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
  }

  function setFlyoutOpen(open) {
    body.classList.toggle('ferrari-world-abu-dhabi-demo-page--nav-open', open);
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
    if (body.classList.contains('ferrari-world-abu-dhabi-demo-page--nav-open')) scheduleClose();
  }

  sidebar.addEventListener('mouseenter', function () { if (!mq.matches) { clearHideTimer(); setFlyoutOpen(true); } });
  sidebar.addEventListener('mouseleave', function () { if (!mq.matches) scheduleClose(); });
  document.addEventListener('mousemove', onPointerMove, { passive: true });
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('ferrari-world-abu-dhabi-demo-page--nav-open');
  });
  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'ferrari-world-abu-dhabi-demo-page--profile-open',
  viewName: 'Ferrari World Abu Dhabi demo',
  emailGetter: getEmail,
  messageSetter: setFerrariworldMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initFerrariworldSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'ferrariworldSdkConfigSummary',
    fieldsId: 'ferrariworldSdkConfigFields',
    selectedScriptCodeId: 'ferrariworldSelectedScript',
  });
})();
