/**
 * Facebook social demo — profile lookup + Tags injection + optional web push + flyout lab nav.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'facebookNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const facebookMessage = document.getElementById('facebookMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const FACEBOOK_WEB_PUSH_ON_INJECT_KEY = 'facebookWebPushOnInjectToggle';
const facebookWebPushOnInjectToggle = document.getElementById('facebookWebPushOnInjectToggle');
if (facebookWebPushOnInjectToggle) {
  try {
    if (localStorage.getItem(FACEBOOK_WEB_PUSH_ON_INJECT_KEY) === '1') facebookWebPushOnInjectToggle.checked = true;
  } catch { /* noop */ }
  facebookWebPushOnInjectToggle.addEventListener('change', function () {
    try {
      localStorage.setItem(FACEBOOK_WEB_PUSH_ON_INJECT_KEY, facebookWebPushOnInjectToggle.checked ? '1' : '0');
    } catch { /* noop */ }
  });
}

function facebookWebPushOnInjectDesired() {
  return !!(facebookWebPushOnInjectToggle && facebookWebPushOnInjectToggle.checked);
}

const facebookTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'facebook',
        identityEventType: 'facebook.identity.stitch',
        messageSetter: setFacebookMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'facebookTagsCompany',
        tagsPropertyInputId: 'facebookTagsProperty',
        tagsPropertyListId: 'facebookTagsPropertyList',
        tagsEnvironmentId: 'facebookTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'facebookSelectedScript',
        configFieldsId: 'facebookSdkConfigFields',
        configSummaryId: 'facebookSdkConfigSummary',
        configSummaryTextId: 'facebookSdkConfigSummaryText',
        changeConfigButtonId: 'facebookChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: [],
        webPush: {
          enabled: true,
          subscribeAfterInject: facebookWebPushOnInjectDesired,
          requestPermissionOnInject: facebookWebPushOnInjectDesired,
        },
      })
    : null;

const facebookWebPushRetryBtn = document.getElementById('facebookWebPushRetryBtn');
if (facebookWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  facebookWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'facebook' }).then(function (ok) {
      setFacebookMessage(
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

function setFacebookMessage(text, type) {
  if (!facebookMessage) return;
  facebookMessage.textContent = text || '';
  facebookMessage.className =
    'social-facebook-demo-message' + (type ? ' social-facebook-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  facebookMessage.hidden = !text;
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
      setFacebookMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setFacebookMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !facebookTagsInjection || typeof facebookTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await facebookTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setFacebookMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initFacebookDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('social-facebook-demo-page')) return;
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;

  const mq = window.matchMedia('(max-width: 768px)');
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
  }

  function setFlyoutOpen(open) {
    body.classList.toggle('social-facebook-demo-page--nav-open', open);
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
    if (body.classList.contains('social-facebook-demo-page--nav-open')) scheduleClose();
  }

  sidebar.addEventListener('mouseenter', function () { if (!mq.matches) { clearHideTimer(); setFlyoutOpen(true); } });
  sidebar.addEventListener('mouseleave', function () { if (!mq.matches) scheduleClose(); });
  document.addEventListener('mousemove', onPointerMove, { passive: true });
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('social-facebook-demo-page--nav-open');
  });
  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'social-facebook-demo-page--profile-open',
  viewName: 'Facebook social demo',
  emailGetter: getEmail,
  messageSetter: setFacebookMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initFacebookSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'facebookSdkConfigSummary',
    fieldsId: 'facebookSdkConfigFields',
    selectedScriptCodeId: 'facebookSelectedScript',
  });
})();
