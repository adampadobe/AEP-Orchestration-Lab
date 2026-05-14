/**
 * Premier Inn demo — profile lookup + Tags injection (shared DemoTagsInjection) + flyout lab nav.
 * Iframe journey emits generic hospitality events (hotel.*) via postMessage; parent POSTs /api/events/generator.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'premierInnNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const premierInnMessage = document.getElementById('premierInnMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const premierInnSiteFrame = document.getElementById('premierInnSiteFrame');
/** Match Demo Website / global v1.1 style datasets (see Navigator `_demosystem5` for generator-only CTAs). */
const PREMIER_INN_XDM_TENANT_KEY = '_demoemea';

const premierInnTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'premierInn',
        identityEventType: 'premierinn.identity.stitch',
        messageSetter: setPremierInnMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'premierInnTagsCompany',
        tagsPropertyInputId: 'premierInnTagsProperty',
        tagsPropertyListId: 'premierInnTagsPropertyList',
        tagsEnvironmentId: 'premierInnTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'premierInnSelectedScript',
        configFieldsId: 'premierInnSdkConfigFields',
        configSummaryId: 'premierInnSdkConfigSummary',
        configSummaryTextId: 'premierInnSdkConfigSummaryText',
        changeConfigButtonId: 'premierInnChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        /* Launch only on the parent shell: iframe + third-party cookies often mint a different ECID than the parent, while hotel.* events use parent #infoEcid via the generator — bad anonymous tracking. */
        iframeIds: [],
      })
    : null;

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setPremierInnMessage(text, type) {
  if (!premierInnMessage) return;
  premierInnMessage.textContent = text || '';
  premierInnMessage.className =
    'premier-inn-demo-message' + (type ? ' premier-inn-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  premierInnMessage.hidden = !text;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

/**
 * @param {{ eventType?: string, viewName?: string, viewUrl?: string, public?: Record<string, unknown> }} payload
 */
async function sendPremierInnHotelExperienceEvent(payload) {
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
    eventType: String(p.eventType || 'hotel.search').trim(),
    viewName: String(p.viewName || 'Premier Inn lab').trim(),
    viewUrl: String(p.viewUrl || '').trim() || (typeof window !== 'undefined' ? window.location.href.split('?')[0] : ''),
    channel: 'Web',
    public: p.public && typeof p.public === 'object' ? p.public : {},
    xdmTenantKey: PREMIER_INN_XDM_TENANT_KEY,
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
      setPremierInnMessage(errMsg + extra, 'error');
      return false;
    }
    let idPart = '';
    if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
    else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
    setPremierInnMessage((data.message || 'Hotel journey event sent to AEP.') + idPart, 'success');
    if (ecid && typeof DemoProfileDrawer !== 'undefined' && typeof DemoProfileDrawer.refreshDrawerEventsForIdentity === 'function') {
      void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
      window.setTimeout(function () {
        void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
      }, 2500);
      window.setTimeout(function () {
        void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
      }, 8000);
    }
    return true;
  } catch (err) {
    setPremierInnMessage(err.message || 'Network error', 'error');
    return false;
  }
}

window.addEventListener('message', async function (ev) {
  if (!premierInnSiteFrame || !premierInnSiteFrame.contentWindow || ev.source !== premierInnSiteFrame.contentWindow) {
    return;
  }
  if (!ev.data || ev.data.source !== 'premier-inn-lab') return;

  if (ev.data.type === 'login-request') {
    const email = String(ev.data.email || '').trim();
    if (!email) return;

    if (customerEmail) customerEmail.value = email;

    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const profileMsg = profile
      ? {
          firstName: profile.firstName || null,
          loyaltyStatus: profile.loyaltyStatus || null,
          churnPrediction: profile.churnPrediction != null ? profile.churnPrediction : null,
          propensityScore: profile.propensityScore != null ? profile.propensityScore : null,
        }
      : null;

    if (premierInnSiteFrame && premierInnSiteFrame.contentWindow) {
      premierInnSiteFrame.contentWindow.postMessage(
        {
          source: 'premier-inn-demo-shell',
          type: 'login-complete',
          found: !!ok,
          firstName: profile ? profile.firstName || null : null,
          profile: profileMsg,
        },
        '*'
      );
      if (ok && profileMsg) {
        premierInnSiteFrame.contentWindow.postMessage(
          { source: 'premier-inn-demo-shell', type: 'profile-loaded', profile: profileMsg },
          '*'
        );
      }
    }

    if (ok && premierInnTagsInjection && typeof premierInnTagsInjection.stitchAfterProfileLookup === 'function') {
      void premierInnTagsInjection.stitchAfterProfileLookup(profile, email);
    }
    return;
  }

  if (ev.data.type === 'hotel-experience-event') {
    void sendPremierInnHotelExperienceEvent(ev.data.payload);
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
      setPremierInnMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setPremierInnMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !premierInnTagsInjection || typeof premierInnTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await premierInnTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setPremierInnMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initPremierInnDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('premier-inn-demo-page')) return;
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
    body.classList.toggle('premier-inn-demo-page--nav-open', open);
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
    if (body.classList.contains('premier-inn-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('premier-inn-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'premier-inn-demo-page--profile-open',
  viewName: 'Premier Inn demo',
  emailGetter: getEmail,
  messageSetter: setPremierInnMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initPremierInnSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'premierInnSdkConfigSummary',
    fieldsId: 'premierInnSdkConfigFields',
    selectedScriptCodeId: 'premierInnSelectedScript',
  });
})();
