/**
 * Saga Cruises demo — profile lookup + Tags injection + iframe cruise journey events.
 * Iframe posts travel.cruise.* / web.webpagedetails.* via postMessage; parent POSTs /api/events/generator.
 */

const customerEmail = document.getElementById('customerEmail');
const sagaNs = document.getElementById('sagaNs');

function rememberSagaSessionIdentifier(value) {
  if (typeof setSessionIdentifier !== 'function') return;
  let ns = 'email';
  try {
    if (typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function') {
      ns = AepIdentityPicker.getNamespace('customerEmail') || 'email';
    } else if (sagaNs && sagaNs.value) {
      ns = String(sagaNs.value).trim().toLowerCase();
    }
  } catch {
    /* noop */
  }
  setSessionIdentifier(value, ns);
}

if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail', 'recentEmails', 'sagaNs');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'sagaNs');
if (typeof hydrateIdentifierFromSession === 'function') hydrateIdentifierFromSession('customerEmail', 'sagaNs');
if (sagaNs) {
  sagaNs.addEventListener('change', function () {
    window.requestAnimationFrame(function () {
      if (typeof hydrateIdentifierFromSession === 'function') {
        hydrateIdentifierFromSession('customerEmail', 'sagaNs');
      }
    });
  });
}

const queryProfileBtn = document.getElementById('queryProfileBtn');
const sagaMessage = document.getElementById('sagaMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');
const sagaSiteFrame = document.getElementById('sagaSiteFrame');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

/** Match Demo Website / Premier Inn / Etihad generator payloads. */
const SAGA_XDM_TENANT_KEY = '_demoemea';

const sagaBcOnInjectToggle = document.getElementById('sagaBcOnInjectToggle');
const sagaBcStyleSelect = document.getElementById('sagaBcStyleSelect');

function sagaWebPushOnInjectDesired() {
  if (typeof window.SiteCloneBcEnv !== 'undefined' && typeof window.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
    return window.SiteCloneBcEnv.webPushOnInjectDesired();
  }
  const el = document.getElementById('sagaWebPushOnInjectToggle');
  return !!(el && el.checked);
}

window.__siteCloneSuppressBcEnable = true;
const sagaInjectSdkBtn = document.getElementById('sagaInjectSdkBtn');
if (sagaInjectSdkBtn) {
  sagaInjectSdkBtn.addEventListener(
    'click',
    function () {
      window.__siteCloneSuppressBcEnable = false;
    },
    true,
  );
}

const sagaTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'sagaDemo',
        identityEventType: 'saga.identity.stitch',
        messageSetter: setSagaMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'sagaTagsCompany',
        tagsPropertyInputId: 'sagaTagsProperty',
        tagsPropertyListId: 'sagaTagsPropertyList',
        tagsEnvironmentId: 'sagaTagsEnvironment',
        injectButtonId: 'sagaInjectSdkBtn',
        selectedScriptId: 'sagaSelectedScript',
        configFieldsId: 'sagaSdkConfigFields',
        configSummaryId: 'sagaSdkConfigSummary',
        configSummaryTextId: 'sagaSdkConfigSummaryText',
        changeConfigButtonId: 'sagaChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: ['sagaSiteFrame'],
        hideTagsCompanyUi: true,
        webPush: {
          enabled: true,
          subscribeAfterInject: sagaWebPushOnInjectDesired,
          requestPermissionOnInject: sagaWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () {
            return !!(sagaBcOnInjectToggle && sagaBcOnInjectToggle.checked);
          },
          styleKey: function () {
            return sagaBcStyleSelect ? sagaBcStyleSelect.value : 'miral';
          },
          suppressEnable: function () {
            return !!window.__siteCloneSuppressBcEnable;
          },
        },
      })
    : null;

const sagaWebPushRetryBtn = document.getElementById('sagaWebPushRetryBtn');
if (sagaWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  sagaWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'sagaDemo' }).then(function (ok) {
      setSagaMessage(
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

function setSagaMessage(text, type) {
  if (!sagaMessage) return;
  sagaMessage.textContent = text || '';
  sagaMessage.className =
    'saga-demo-message' + (type ? ' saga-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  sagaMessage.hidden = !text;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

/**
 * @param {{ eventType?: string, viewName?: string, viewUrl?: string, public?: Record<string, unknown> }} payload
 */
async function sendSagaCruiseExperienceEvent(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const ecidEl = document.getElementById('infoEcid');
  const ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
  const ecid =
    ecidText && ecidText !== '-' && ecidText !== '\u2014' && /^\d+$/.test(ecidText) && ecidText.length >= 10
      ? ecidText
      : null;
  const emailForEvent = getEmail().trim();
  const target = getSelectedGeneratorTarget();
  const body = {
    targetId: target ? target.id : undefined,
    eventType: String(p.eventType || 'web.webpagedetails.pageViews').trim(),
    viewName: String(p.viewName || 'Saga Cruises lab').trim(),
    viewUrl: String(p.viewUrl || '').trim() || (typeof window !== 'undefined' ? window.location.href.split('?')[0] : ''),
    channel: 'web',
    public: p.public && typeof p.public === 'object' ? p.public : {},
    xdmTenantKey: SAGA_XDM_TENANT_KEY,
    identityMapEcidKey: 'ECID',
  };
  if (emailForEvent) body.email = emailForEvent;
  if (ecid) body.ecid = ecid;
  const postBody =
    typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.augmentGeneratorPostBody
      ? window.AepDemoGeneratorTargets.augmentGeneratorPostBody(body)
      : body;
  try {
    const res = await fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.error || data.message || 'Request failed.';
      let extra = '';
      if (data.streamingResponse) extra = ' \u2014 ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
      else if (data.edgeBody) extra = ' \u2014 ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
      setSagaMessage(errMsg + extra, 'error');
      return false;
    }
    let idPart = '';
    if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
    else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
    setSagaMessage((data.message || 'Cruise journey event sent to AEP.') + idPart, 'success');
    const refreshId = ecid || emailForEvent;
    const refreshNs = ecid ? 'ecid' : emailForEvent ? 'email' : '';
    if (
      refreshId &&
      typeof DemoProfileDrawer !== 'undefined' &&
      typeof DemoProfileDrawer.refreshDrawerEventsForIdentity === 'function'
    ) {
      void DemoProfileDrawer.refreshDrawerEventsForIdentity(refreshId, refreshNs);
      window.setTimeout(function () {
        void DemoProfileDrawer.refreshDrawerEventsForIdentity(refreshId, refreshNs);
      }, 2500);
      window.setTimeout(function () {
        void DemoProfileDrawer.refreshDrawerEventsForIdentity(refreshId, refreshNs);
      }, 8000);
    }
    return true;
  } catch (err) {
    setSagaMessage(err.message || 'Network error', 'error');
    return false;
  }
}

window.addEventListener('message', async function (ev) {
  if (!sagaSiteFrame || !sagaSiteFrame.contentWindow || ev.source !== sagaSiteFrame.contentWindow) {
    return;
  }
  if (!ev.data || ev.data.source !== 'saga-cruises-lab') return;

  if (ev.data.type === 'login-modal-open') {
    const prefill = getEmail().trim();
    if (sagaSiteFrame && sagaSiteFrame.contentWindow) {
      sagaSiteFrame.contentWindow.postMessage(
        {
          source: 'saga-demo-shell',
          type: 'login-prefill',
          email: prefill,
        },
        '*',
      );
    }
    return;
  }

  if (ev.data.type === 'login-request') {
    const email = String(ev.data.email || '').trim();
    if (!email) return;

    if (customerEmail) customerEmail.value = email;
    rememberSagaSessionIdentifier(email);

    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const profileMsg = profile
      ? {
          firstName: profile.firstName || null,
          loyaltyStatus: profile.loyaltyStatus || null,
        }
      : null;

    if (sagaSiteFrame && sagaSiteFrame.contentWindow) {
      sagaSiteFrame.contentWindow.postMessage(
        {
          source: 'saga-demo-shell',
          type: 'login-complete',
          found: !!ok,
          email: email,
          firstName: profile ? profile.firstName || null : null,
          profile: profileMsg,
        },
        '*',
      );
    }

    if (ok && sagaTagsInjection && typeof sagaTagsInjection.stitchAfterProfileLookup === 'function') {
      const stitched = await sagaTagsInjection.stitchAfterProfileLookup(profile, email);
      if (stitched) setSagaMessage('Profile loaded and email linked to ECID for stitching.', 'success');
    }
    return;
  }

  if (ev.data.type === 'cruise-experience-event') {
    void sendSagaCruiseExperienceEvent(ev.data.payload);
    return;
  }

  if (ev.data.type === 'set-shell-customer-email') {
    const em = String(ev.data.email || '').trim();
    if (!em) return;
    if (customerEmail) customerEmail.value = em;
    rememberSagaSessionIdentifier(em);
    void (async () => {
      try {
        const ok = await DemoProfileDrawer.loadProfileDataForDrawer(em, { updateMessage: true });
        const profile =
          window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? window.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        if (ok && sagaTagsInjection && typeof sagaTagsInjection.stitchAfterProfileLookup === 'function') {
          await sagaTagsInjection.stitchAfterProfileLookup(profile, em);
        }
      } catch {
        /* guest path */
      }
    })();
  }
});

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
      setSagaMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setSagaMessage('Looking up profile...', '');
    rememberSagaSessionIdentifier(email);
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !sagaTagsInjection || typeof sagaTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await sagaTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setSagaMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initSagaDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('saga-demo-page')) return;
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
    body.classList.toggle('saga-demo-page--nav-open', open);
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
    if (body.classList.contains('saga-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('saga-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'saga-demo-page--profile-open',
  viewName: 'Saga Cruises demo',
  emailGetter: getEmail,
  messageSetter: setSagaMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

window.initLabDemoEnvBar && window.initLabDemoEnvBar({ prefix: 'saga' });
