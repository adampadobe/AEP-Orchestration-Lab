/**
 * Sky demo ÔÇö saved sky.com homepage in iframe + lab env strip (British Army / MOD pattern).
 */
const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'skyNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const generatorTargetSelect = document.getElementById('generatorTarget');
const skyMessage = document.getElementById('skyMessage');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const skyBcOnInjectToggle = document.getElementById('skyBcOnInjectToggle');
const skyBcStyleSelect = document.getElementById('skyBcStyleSelect');

function skyWebPushOnInjectDesired() {
  if (typeof window.SiteCloneBcEnv !== 'undefined' && typeof window.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
    return window.SiteCloneBcEnv.webPushOnInjectDesired();
  }
  const el = document.getElementById('skyWebPushOnInjectToggle');
  return !!(el && el.checked);
}

window.__siteCloneSuppressBcEnable = true;
const skyInjectSdkBtn = document.getElementById('skyInjectSdkBtn');
if (skyInjectSdkBtn) {
  skyInjectSdkBtn.addEventListener(
    'click',
    function () {
      window.__siteCloneSuppressBcEnable = false;
    },
    true,
  );
}

const skyTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'skyDemo',
        identityEventType: 'sky.identity.stitch',
        messageSetter: setSkyMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'skyTagsCompany',
        tagsPropertyInputId: 'skyTagsProperty',
        tagsPropertyListId: 'skyTagsPropertyList',
        tagsEnvironmentId: 'skyTagsEnvironment',
        injectButtonId: 'skyInjectSdkBtn',
        selectedScriptId: 'skySelectedScript',
        configFieldsId: 'skySdkConfigFields',
        configSummaryId: 'skySdkConfigSummary',
        configSummaryTextId: 'skySdkConfigSummaryText',
        changeConfigButtonId: 'skyChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: [],
        hideTagsCompanyUi: true,
        webPush: {
          enabled: true,
          subscribeAfterInject: skyWebPushOnInjectDesired,
          requestPermissionOnInject: skyWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () {
            return !!(skyBcOnInjectToggle && skyBcOnInjectToggle.checked);
          },
          styleKey: function () {
            return skyBcStyleSelect ? skyBcStyleSelect.value : 'miral';
          },
          suppressEnable: function () {
            return !!window.__siteCloneSuppressBcEnable;
          },
        },
      })
    : null;

const skyWebPushRetryBtn = document.getElementById('skyWebPushRetryBtn');
if (skyWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  skyWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'skyDemo' }).then(function (ok) {
      setSkyMessage(
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

function setSkyMessage(text, type) {
  if (!skyMessage) return;
  skyMessage.textContent = text || '';
  skyMessage.className =
    'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  skyMessage.hidden = !text;
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
      setSkyMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setSkyMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !skyTagsInjection || typeof skyTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await skyTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setSkyMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

void loadGeneratorTargets();
if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
  window.AepDemoGeneratorTargets.onSandboxChange(function () {
    void loadGeneratorTargets();
  });
}

(function initSkyDemoEnvStrip() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'skySdkConfigSummary',
    fieldsId: 'skySdkConfigFields',
    selectedScriptCodeId: 'skySelectedScript',
  });
})();

(function initSkyDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('sky-demo-page')) return;
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

  function onPointerMove(e) {
    if (mq.matches) return;
    if (e.clientX <= 24) {
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
  viewName: 'Sky',
  emailGetter: getEmail,
  messageSetter: setSkyMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});
