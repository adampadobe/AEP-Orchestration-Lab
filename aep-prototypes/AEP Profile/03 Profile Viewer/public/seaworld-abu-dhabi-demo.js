/**
 * SeaWorld Abu Dhabi demo — profile lookup + Tags injection + optional web push + flyout lab nav.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'seaworldNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const seaworldMessage = document.getElementById('seaworldMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const SEAWORLD_WEB_PUSH_ON_INJECT_KEY = 'seaworldWebPushOnInjectToggle';
const seaworldWebPushOnInjectToggle = document.getElementById('seaworldWebPushOnInjectToggle');
if (seaworldWebPushOnInjectToggle) {
  try {
    if (localStorage.getItem(SEAWORLD_WEB_PUSH_ON_INJECT_KEY) === '1') seaworldWebPushOnInjectToggle.checked = true;
  } catch {
    /* noop */
  }
  seaworldWebPushOnInjectToggle.addEventListener('change', function () {
    try {
      localStorage.setItem(SEAWORLD_WEB_PUSH_ON_INJECT_KEY, seaworldWebPushOnInjectToggle.checked ? '1' : '0');
    } catch {
      /* noop */
    }
  });
}

function seaworldWebPushOnInjectDesired() {
  return !!(seaworldWebPushOnInjectToggle && seaworldWebPushOnInjectToggle.checked);
}

// Brand Concierge launcher visibility toggle
const seaworldBcLauncherToggle = document.getElementById('seaworldBcLauncherToggle');
const seaworldBcLauncher = document.getElementById('seaworldBcLauncher');
(function initSeaworldBcLauncher() {
  const LAUNCHER_KEY = 'seaworldBcLauncherVisible';
  if (!seaworldBcLauncherToggle) return;
  try {
    if (localStorage.getItem(LAUNCHER_KEY) === '1') {
      seaworldBcLauncherToggle.checked = true;
      document.body.classList.add('aep-bc-launcher-on');
    }
  } catch { /* noop */ }
  seaworldBcLauncherToggle.addEventListener('change', function () {
    const on = seaworldBcLauncherToggle.checked;
    document.body.classList.toggle('aep-bc-launcher-on', on);
    try { localStorage.setItem(LAUNCHER_KEY, on ? '1' : '0'); } catch { /* noop */ }
  });
  if (seaworldBcLauncher) {
    seaworldBcLauncher.addEventListener('click', function () {
      if (typeof AepBcToggle !== 'undefined') AepBcToggle.reopen(); else document.body.classList.remove('aep-bc-panel-dismissed');
    });
  }
})();

// Brand Concierge toggle
const seaworldBcOnInjectToggle = document.getElementById('seaworldBcOnInjectToggle');
const seaworldBcStyleSelect = document.getElementById('seaworldBcStyleSelect');
(function initSeaworldBcToggle() {
  if (!seaworldBcOnInjectToggle) return;
  const prefs = typeof AepBcToggle !== 'undefined' ? AepBcToggle.loadPrefs('seaworld') : { enabled: false, styleKey: 'miral' };
  seaworldBcOnInjectToggle.checked = !!prefs.enabled;
  if (seaworldBcStyleSelect && prefs.styleKey) seaworldBcStyleSelect.value = prefs.styleKey;
  function saveBcPrefs() {
    if (typeof AepBcToggle === 'undefined') return;
    AepBcToggle.savePrefs('seaworld', !!(seaworldBcOnInjectToggle && seaworldBcOnInjectToggle.checked), seaworldBcStyleSelect ? seaworldBcStyleSelect.value : 'miral');
  }
  seaworldBcOnInjectToggle.addEventListener('change', saveBcPrefs);
  if (seaworldBcStyleSelect) seaworldBcStyleSelect.addEventListener('change', saveBcPrefs);
})();

const seaworldTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'seaworld',
        identityEventType: 'seaworld.identity.stitch',
        messageSetter: setSeaworldMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'seaworldTagsCompany',
        tagsPropertyInputId: 'seaworldTagsProperty',
        tagsPropertyListId: 'seaworldTagsPropertyList',
        tagsEnvironmentId: 'seaworldTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'seaworldSelectedScript',
        configFieldsId: 'seaworldSdkConfigFields',
        configSummaryId: 'seaworldSdkConfigSummary',
        configSummaryTextId: 'seaworldSdkConfigSummaryText',
        changeConfigButtonId: 'seaworldChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: [],
        webPush: {
          enabled: true,
          subscribeAfterInject: seaworldWebPushOnInjectDesired,
          requestPermissionOnInject: seaworldWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () { return !!(seaworldBcOnInjectToggle && seaworldBcOnInjectToggle.checked); },
          styleKey: function () { return seaworldBcStyleSelect ? seaworldBcStyleSelect.value : 'miral'; },
        },
        onEcidResolved: function () {
          if (typeof window.MiralCrossSite !== 'undefined') window.MiralCrossSite.retryPageView();
          if (typeof AepBcToggle !== 'undefined') AepBcToggle.enableIfPrefsSet('seaworld');
          var ecidEl = document.getElementById('infoEcid');
          var ecid = ecidEl ? String(ecidEl.textContent || '').trim() : '';
          if (ecid && ecid !== '—' && /^\d+$/.test(ecid) && ecid.length >= 10) {
            if (typeof DemoProfileDrawer !== 'undefined' && typeof DemoProfileDrawer.refreshDrawerEventsForIdentity === 'function') {
              DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
            }
          }
        },
      })
    : null;

const seaworldWebPushRetryBtn = document.getElementById('seaworldWebPushRetryBtn');
if (seaworldWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  seaworldWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'seaworld' }).then(function (ok) {
      setSeaworldMessage(
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

function setSeaworldMessage(text, type) {
  if (!seaworldMessage) return;
  seaworldMessage.textContent = text || '';
  seaworldMessage.className =
    'seaworld-abu-dhabi-demo-message' + (type ? ' seaworld-abu-dhabi-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  seaworldMessage.hidden = !text;
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
      setSeaworldMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setSeaworldMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !seaworldTagsInjection || typeof seaworldTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await seaworldTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setSeaworldMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initSeaworldDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('seaworld-abu-dhabi-demo-page')) return;
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;

  const mq = window.matchMedia('(max-width: 768px)');
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
  }

  function setFlyoutOpen(open) {
    body.classList.toggle('seaworld-abu-dhabi-demo-page--nav-open', open);
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
    if (body.classList.contains('seaworld-abu-dhabi-demo-page--nav-open')) scheduleClose();
  }

  sidebar.addEventListener('mouseenter', function () { if (!mq.matches) { clearHideTimer(); setFlyoutOpen(true); } });
  sidebar.addEventListener('mouseleave', function () { if (!mq.matches) scheduleClose(); });
  document.addEventListener('mousemove', onPointerMove, { passive: true });
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('seaworld-abu-dhabi-demo-page--nav-open');
  });
  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'seaworld-abu-dhabi-demo-page--profile-open',
  viewName: 'SeaWorld Abu Dhabi demo',
  emailGetter: getEmail,
  messageSetter: setSeaworldMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initSeaworldSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'seaworldSdkConfigSummary',
    fieldsId: 'seaworldSdkConfigFields',
    selectedScriptCodeId: 'seaworldSelectedScript',
  });
})();

window.AepDemoParkStitch = window.AepDemoParkStitch || {};
window.AepDemoParkStitch.stitch = function (email, ecid) {
  if (seaworldTagsInjection && typeof seaworldTagsInjection.stitchAfterProfileLookup === 'function') {
    var fakeProfile = ecid ? { ecid: ecid } : null;
    void seaworldTagsInjection.stitchAfterProfileLookup(fakeProfile, email);
  }
};
