/**
 * Facebook Home (News Feed) demo — profile lookup + Tags injection + optional web push + flyout lab nav.
 */

const customerEmail = document.getElementById('customerEmailHome');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmailHome');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmailHome', 'facebookNs');

const queryProfileBtn = document.getElementById('queryProfileBtnHome');
const facebookHomeMessage = document.getElementById('facebookHomeMessage');
const generatorTargetSelect = document.getElementById('generatorTargetHome');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const FACEBOOK_HOME_WEB_PUSH_KEY = 'facebookHomeWebPushOnInjectToggle';
const facebookHomeWebPushToggle = document.getElementById('facebookHomeWebPushOnInjectToggle');
if (facebookHomeWebPushToggle) {
  try {
    if (localStorage.getItem(FACEBOOK_HOME_WEB_PUSH_KEY) === '1') facebookHomeWebPushToggle.checked = true;
  } catch { /* noop */ }
  facebookHomeWebPushToggle.addEventListener('change', function () {
    try {
      localStorage.setItem(FACEBOOK_HOME_WEB_PUSH_KEY, facebookHomeWebPushToggle.checked ? '1' : '0');
    } catch { /* noop */ }
  });
}

function facebookHomeWebPushOnInjectDesired() {
  return !!(facebookHomeWebPushToggle && facebookHomeWebPushToggle.checked);
}

const facebookHomeTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'facebookHome',
        identityEventType: 'facebook.home.identity.stitch',
        messageSetter: setFacebookHomeMessage,
        infoEcidId: 'infoEcidHome',
        tagsCompanyId: 'facebookHomeTagsCompany',
        tagsPropertyInputId: 'facebookHomeTagsProperty',
        tagsPropertyListId: 'facebookHomeTagsPropertyList',
        tagsEnvironmentId: 'facebookHomeTagsEnvironment',
        injectButtonId: 'injectSdkBtnHome',
        selectedScriptId: 'facebookHomeSelectedScript',
        configFieldsId: 'facebookHomeSdkConfigFields',
        configSummaryId: 'facebookHomeSdkConfigSummary',
        configSummaryTextId: 'facebookHomeSdkConfigSummaryText',
        changeConfigButtonId: 'facebookHomeChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: [],
        webPush: {
          enabled: true,
          subscribeAfterInject: facebookHomeWebPushOnInjectDesired,
          requestPermissionOnInject: facebookHomeWebPushOnInjectDesired,
        },
      })
    : null;

const facebookHomeWebPushRetryBtn = document.getElementById('facebookHomeWebPushRetryBtn');
if (facebookHomeWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  facebookHomeWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'facebookHome' }).then(function (ok) {
      setFacebookHomeMessage(
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

function setFacebookHomeMessage(text, type) {
  if (!facebookHomeMessage) return;
  facebookHomeMessage.textContent = text || '';
  facebookHomeMessage.className =
    'social-facebook-home-demo-message' + (type ? ' social-facebook-home-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  facebookHomeMessage.hidden = !text;
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
      setFacebookHomeMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setFacebookHomeMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !facebookHomeTagsInjection || typeof facebookHomeTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await facebookHomeTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setFacebookHomeMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initFacebookHomeDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('social-facebook-home-page')) return;
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;

  const mq = window.matchMedia('(max-width: 768px)');
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
  }

  function setFlyoutOpen(open) {
    body.classList.toggle('social-facebook-home-page--nav-open', open);
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
    if (body.classList.contains('social-facebook-home-page--nav-open')) scheduleClose();
  }

  sidebar.addEventListener('mouseenter', function () { if (!mq.matches) { clearHideTimer(); setFlyoutOpen(true); } });
  sidebar.addEventListener('mouseleave', function () { if (!mq.matches) scheduleClose(); });
  document.addEventListener('mousemove', onPointerMove, { passive: true });
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('social-facebook-home-page--nav-open');
  });
  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmailHome',
  profileOpenClass: 'social-facebook-home-page--profile-open',
  viewName: 'Facebook Home demo',
  emailGetter: getEmail,
  messageSetter: setFacebookHomeMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initFacebookHomeSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'facebookHomeSdkConfigSummary',
    fieldsId: 'facebookHomeSdkConfigFields',
    selectedScriptCodeId: 'facebookHomeSelectedScript',
  });
})();
