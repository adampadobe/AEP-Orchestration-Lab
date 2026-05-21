/**
 * Facebook Home (News Feed) demo — canonical lab strip (sandbox, Tags inject, event destination,
 * profile lookup) + optional Miral feed/rail refresh from `/api/profile/events` polling by ECID.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function' && customerEmail) attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined' && customerEmail) AepIdentityPicker.init('customerEmail', 'facebookHomeNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const facebookHomeMessage = document.getElementById('facebookHomeMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const FACEBOOK_HOME_WEB_PUSH_KEY = 'facebookHomeWebPushOnInjectToggle';
const facebookHomeWebPushToggle = document.getElementById('facebookHomeWebPushOnInjectToggle');
if (facebookHomeWebPushToggle) {
  try {
    if (localStorage.getItem(FACEBOOK_HOME_WEB_PUSH_KEY) === '1') facebookHomeWebPushToggle.checked = true;
  } catch {
    /* noop */
  }
  facebookHomeWebPushToggle.addEventListener('change', function () {
    try {
      localStorage.setItem(FACEBOOK_HOME_WEB_PUSH_KEY, facebookHomeWebPushToggle.checked ? '1' : '0');
    } catch {
      /* noop */
    }
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
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'facebookHomeTagsCompany',
        tagsPropertyInputId: 'facebookHomeTagsProperty',
        tagsPropertyListId: 'facebookHomeTagsPropertyList',
        tagsEnvironmentId: 'facebookHomeTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
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
        onEcidResolved: function () {
          void pollProfileForMiralAdHint();
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
    void pollProfileForMiralAdHint();
  });

(function initFacebookHomeDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('social-facebook-home-page')) return;
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
    body.classList.toggle('social-facebook-home-page--nav-open', open);
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
    if (body.classList.contains('social-facebook-home-page--nav-open')) scheduleClose();
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
    if (mq.matches) body.classList.remove('social-facebook-home-page--nav-open');
  });
  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
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

function sandboxQs() {
  if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
    const s = String(window.AepGlobalSandbox.getSandboxName() || '').trim();
    if (s) return '&sandbox=' + encodeURIComponent(s);
  }
  return '';
}

const MIRAL_PARK_IDS_FB = ['ferrariworld', 'wbworld', 'seaworld'];

/** Pull Miral park ids from one API event (eventType, eventName, flattened rows). */
function inferMiralParksFromProfileEvent(ev) {
  if (!ev || typeof ev !== 'object') return [];
  const parts = [];
  if (ev.eventType) parts.push(String(ev.eventType));
  if (ev.eventName) parts.push(String(ev.eventName));
  if (Array.isArray(ev.rows)) {
    for (let i = 0; i < ev.rows.length; i++) {
      const r = ev.rows[i];
      if (!r) continue;
      const path = String(r.path || '').toLowerCase();
      if (path.indexOf('miral') !== -1 || path.indexOf('demoemea') !== -1) {
        if (r.value != null) parts.push(String(r.value));
        parts.push(path);
      }
    }
  }
  const blob = parts.join(' ').toLowerCase();
  const out = [];
  for (let j = 0; j < MIRAL_PARK_IDS_FB.length; j++) {
    const p = MIRAL_PARK_IDS_FB[j];
    if (blob.indexOf(p) !== -1 && out.indexOf(p) === -1) out.push(p);
  }
  return out;
}

async function pollProfileForMiralAdHint() {
  if (typeof window.MiralCrossSite === 'undefined') return;
  const ecidEl = document.getElementById('infoEcid');
  const ecid = ecidEl ? String(ecidEl.textContent || '').trim() : '';
  if (!ecid || ecid === '—' || ecid === '-' || !/^\d{10,}$/.test(ecid)) return;
  try {
    const res = await fetch(
      '/api/profile/events?identifier=' + encodeURIComponent(ecid) + '&namespace=ecid' + sandboxQs(),
    );
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    const events = Array.isArray(data.events) ? data.events : [];
    events.sort(function (a, b) {
      return (Number(b && b.timestamp) || 0) - (Number(a && a.timestamp) || 0);
    });
    const slice = events.slice(0, 12);
    const mergedInf = [];
    for (let k = 0; k < slice.length; k++) {
      const inf = inferMiralParksFromProfileEvent(slice[k]);
      for (let m = 0; m < inf.length; m++) {
        if (mergedInf.indexOf(inf[m]) === -1) mergedInf.push(inf[m]);
      }
    }
    let digest = slice
      .map(function (e) {
        return [String((e && e.eventType) || ''), String((e && e.eventName) || '')].join(' ');
      })
      .join(' ')
      .trim();
    if (!digest && mergedInf.length) digest = mergedInf.join(' ');
    if (!digest && mergedInf.length === 0) return;
    if (typeof window.MiralCrossSite.applyProfileEventHint === 'function') {
      window.MiralCrossSite.applyProfileEventHint(digest, mergedInf);
    }
    if (typeof window.MiralCrossSite.refreshMiralFacebookSlots === 'function') {
      window.MiralCrossSite.refreshMiralFacebookSlots();
    }
  } catch {
    /* noop */
  }
}

window.setInterval(function () {
  void pollProfileForMiralAdHint();
}, 15000);
void pollProfileForMiralAdHint();
