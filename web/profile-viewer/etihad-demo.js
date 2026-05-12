/**
 * Etihad demo — profile lookup + Tags injection (shared DemoTagsInjection) + flyout lab nav.
 * Iframe journey emits generic travel.* events via postMessage; parent POSTs /api/events/generator.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'etihadNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const etihadMessage = document.getElementById('etihadMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const etihadSiteFrame = document.getElementById('etihadSiteFrame');
/** Match Demo Website / Premier Inn generator payloads (`docs/ANONYMOUS_EDGE_DEMO_PATTERN.md`). */
const ETIHAD_XDM_TENANT_KEY = '_demoemea';

const etihadTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'etihadAirline',
        identityEventType: 'etihadAirline.identity.stitch',
        messageSetter: setEtihadMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'etihadTagsCompany',
        tagsPropertyInputId: 'etihadTagsProperty',
        tagsPropertyListId: 'etihadTagsPropertyList',
        tagsEnvironmentId: 'etihadTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'etihadSelectedScript',
        configFieldsId: 'etihadSdkConfigFields',
        configSummaryId: 'etihadSdkConfigSummary',
        configSummaryTextId: 'etihadSdkConfigSummaryText',
        changeConfigButtonId: 'etihadChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        iframeIds: [],
      })
    : null;

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setEtihadMessage(text, type) {
  if (!etihadMessage) return;
  etihadMessage.textContent = text || '';
  etihadMessage.className =
    'etihad-demo-message' + (type ? ' etihad-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  etihadMessage.hidden = !text;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

/**
 * @param {{ eventType?: string, viewName?: string, viewUrl?: string, public?: Record<string, unknown> }} payload
 */
async function sendEtihadAirlineExperienceEvent(payload) {
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
    eventType: String(p.eventType || 'travel.flight.search').trim(),
    viewName: String(p.viewName || 'Etihad lab').trim(),
    viewUrl: String(p.viewUrl || '').trim() || (typeof window !== 'undefined' ? window.location.href.split('?')[0] : ''),
    channel: 'Web',
    public: p.public && typeof p.public === 'object' ? p.public : {},
    xdmTenantKey: ETIHAD_XDM_TENANT_KEY,
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
      setEtihadMessage(errMsg + extra, 'error');
      return false;
    }
    let idPart = '';
    if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
    else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
    setEtihadMessage((data.message || 'Travel journey event sent to AEP.') + idPart, 'success');
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
    setEtihadMessage(err.message || 'Network error', 'error');
    return false;
  }
}

window.addEventListener('message', function (ev) {
  if (!etihadSiteFrame || !etihadSiteFrame.contentWindow || ev.source !== etihadSiteFrame.contentWindow) {
    return;
  }
  if (!ev.data || ev.data.source !== 'etihad-airline-lab' || ev.data.type !== 'airline-experience-event') return;
  void sendEtihadAirlineExperienceEvent(ev.data.payload);
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
      setEtihadMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setEtihadMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !etihadTagsInjection || typeof etihadTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await etihadTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setEtihadMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initEtihadDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('etihad-demo-page')) return;
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
    body.classList.toggle('etihad-demo-page--nav-open', open);
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
    if (body.classList.contains('etihad-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('etihad-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'etihad-demo-page--profile-open',
  viewName: 'Etihad demo',
  emailGetter: getEmail,
  messageSetter: setEtihadMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initEtihadSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'etihadSdkConfigSummary',
    fieldsId: 'etihadSdkConfigFields',
    selectedScriptCodeId: 'etihadSelectedScript',
  });
})();
