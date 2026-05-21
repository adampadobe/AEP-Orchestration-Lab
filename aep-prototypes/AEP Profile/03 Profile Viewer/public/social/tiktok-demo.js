/**
 * TikTok profile demo — canonical lab strip (sandbox, Tags inject, event destination, profile lookup).
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function' && customerEmail) attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined' && customerEmail) AepIdentityPicker.init('customerEmail', 'tiktokNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const tiktokMessage = document.getElementById('tiktokMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const TIKTOK_WEB_PUSH_KEY = 'tiktokWebPushOnInjectToggle';
const tiktokWebPushToggle = document.getElementById('tiktokWebPushOnInjectToggle');
if (tiktokWebPushToggle) {
  try {
    if (localStorage.getItem(TIKTOK_WEB_PUSH_KEY) === '1') tiktokWebPushToggle.checked = true;
  } catch {
    /* noop */
  }
  tiktokWebPushToggle.addEventListener('change', function () {
    try {
      localStorage.setItem(TIKTOK_WEB_PUSH_KEY, tiktokWebPushToggle.checked ? '1' : '0');
    } catch {
      /* noop */
    }
  });
}

function tiktokWebPushOnInjectDesired() {
  return !!(tiktokWebPushToggle && tiktokWebPushToggle.checked);
}

const tiktokTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'tiktok',
        identityEventType: 'tiktok.identity.stitch',
        messageSetter: setTiktokMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'tiktokTagsCompany',
        tagsPropertyInputId: 'tiktokTagsProperty',
        tagsPropertyListId: 'tiktokTagsPropertyList',
        tagsEnvironmentId: 'tiktokTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'tiktokSelectedScript',
        configFieldsId: 'tiktokSdkConfigFields',
        configSummaryId: 'tiktokSdkConfigSummary',
        configSummaryTextId: 'tiktokSdkConfigSummaryText',
        changeConfigButtonId: 'tiktokChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: [],
        webPush: {
          enabled: true,
          subscribeAfterInject: tiktokWebPushOnInjectDesired,
          requestPermissionOnInject: tiktokWebPushOnInjectDesired,
        },
      })
    : null;

const tiktokWebPushRetryBtn = document.getElementById('tiktokWebPushRetryBtn');
if (tiktokWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  tiktokWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'tiktok' }).then(function (ok) {
      setTiktokMessage(
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

function setTiktokMessage(text, type) {
  if (!tiktokMessage) return;
  tiktokMessage.textContent = text || '';
  tiktokMessage.className =
    'social-tiktok-demo-message' + (type ? ' social-tiktok-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  tiktokMessage.hidden = !text;
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
    generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {
      preferredId: 'lab-event-tool-edge',
    });
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
      setTiktokMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setTiktokMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !tiktokTagsInjection || typeof tiktokTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await tiktokTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setTiktokMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initTiktokDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('social-tiktok-page')) return;
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
    body.classList.toggle('social-tiktok-page--nav-open', open);
  }

  function scheduleClose() {
    clearHideTimer();
    hideTimer = window.setTimeout(function () {
      setFlyoutOpen(false);
      hideTimer = null;
    }, 450);
  }

  function onPointerMove(e) {
    if (mq.matches) return;
    if (e.clientX <= 24) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    const r = sidebar.getBoundingClientRect();
    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    if (body.classList.contains('social-tiktok-page--nav-open')) scheduleClose();
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
  document.addEventListener('mousemove', onPointerMove, { passive: true });
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('social-tiktok-page--nav-open');
  });
  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'social-tiktok-page--profile-open',
  viewName: 'TikTok profile demo',
  emailGetter: getEmail,
  messageSetter: setTiktokMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initTiktokSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'tiktokSdkConfigSummary',
    fieldsId: 'tiktokSdkConfigFields',
    selectedScriptCodeId: 'tiktokSelectedScript',
  });
})();
