/**
 * Admiral demo — profile lookup + Tags injection (shared DemoTagsInjection) + flyout lab nav.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'admiralNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const admiralMessage = document.getElementById('admiralMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');
const admiralSiteFrame = document.getElementById('admiralSiteFrame');
/** Match Demo Website / Premier Inn generator payloads (`docs/ANONYMOUS_EDGE_DEMO_PATTERN.md`). */
const ADMIRAL_XDM_TENANT_KEY = '_demoemea';

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const admiralTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'admiral',
        identityEventType: 'admiral.identity.stitch',
        messageSetter: setAdmiralMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'admiralTagsCompany',
        tagsPropertyInputId: 'admiralTagsProperty',
        tagsPropertyListId: 'admiralTagsPropertyList',
        tagsEnvironmentId: 'admiralTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'admiralSelectedScript',
        configFieldsId: 'admiralSdkConfigFields',
        configSummaryId: 'admiralSdkConfigSummary',
        configSummaryTextId: 'admiralSdkConfigSummaryText',
        changeConfigButtonId: 'admiralChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        /**
         * Parent shell only — same pattern as Premier Inn (`docs/ANONYMOUS_EDGE_DEMO_PATTERN.md`).
         * Injecting Launch into the iframe mints a different ECID / kndctr context than parent
         * `syncEcidFromAlloy` + `_demoemea` sendEvent, so UPS and #infoEcid no longer line up.
         */
        iframeIds: [],
      })
    : null;

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setAdmiralMessage(text, type) {
  if (!admiralMessage) return;
  admiralMessage.textContent = text || '';
  admiralMessage.className =
    'admiral-demo-message' + (type ? ' admiral-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  admiralMessage.hidden = !text;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

/**
 * @param {{ eventType?: string, viewName?: string, viewUrl?: string, public?: Record<string, unknown> }} payload
 */
async function sendAdmiralInsuranceExperienceEvent(payload) {
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
    eventType: String(p.eventType || 'admiral.insurance.interaction').trim(),
    viewName: String(p.viewName || 'Admiral insurance demo').trim(),
    viewUrl: String(p.viewUrl || '').trim() || (typeof window !== 'undefined' ? window.location.href.split('?')[0] : ''),
    channel: 'Web',
    public: p.public && typeof p.public === 'object' ? p.public : {},
    xdmTenantKey: ADMIRAL_XDM_TENANT_KEY,
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
      setAdmiralMessage(errMsg + extra, 'error');
      return false;
    }
    let idPart = '';
    if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
    else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
    setAdmiralMessage((data.message || 'Admiral journey event sent to AEP.') + idPart, 'success');
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
    setAdmiralMessage(err.message || 'Network error', 'error');
    return false;
  }
}

window.addEventListener('message', function (ev) {
  if (!admiralSiteFrame || !admiralSiteFrame.contentWindow || ev.source !== admiralSiteFrame.contentWindow) {
    return;
  }
  if (!ev.data || ev.data.source !== 'admiral-insurance-lab' || ev.data.type !== 'admiral-insurance-experience-event') {
    return;
  }
  void sendAdmiralInsuranceExperienceEvent(ev.data.payload);
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
      setAdmiralMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setAdmiralMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !admiralTagsInjection || typeof admiralTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await admiralTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setAdmiralMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initAdmiralDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('admiral-demo-page')) return;
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
    body.classList.toggle('admiral-demo-page--nav-open', open);
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
    if (body.classList.contains('admiral-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('admiral-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'admiral-demo-page--profile-open',
  viewName: 'Admiral demo',
  emailGetter: getEmail,
  messageSetter: setAdmiralMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initAdmiralSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'admiralSdkConfigSummary',
    fieldsId: 'admiralSdkConfigFields',
    selectedScriptCodeId: 'admiralSelectedScript',
  });
})();
