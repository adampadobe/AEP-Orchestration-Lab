/**
 * Navigator Global demo — profile lookup + flyout lab nav; saved navigator.global page in iframe.
 * Top identity strip and shell behavior match mod-demo (British Army).
 *
 * AEP experience events: JSON body for `POST /api/events/generator` matches the first argument to
 * `sendGeneratorEvent()` in `navigator-global-demo-assets/aep-event-sender-bundle/send-aep-event.js`
 * (see `buildEventGeneratorXdm` / `sendGeneratorEvent`). Do not import that file in the browser
 * (no tokens). Replication checklist: `navigator-global-demo-assets/AEP-EVENT-REPLICATION.md`.
 *
 * CTA payload shape: `identityMap.ecid`, `_demosystem5.identification.core.ecid`,
 * `_experience.campaign.orchestration.eventID`, `eventType` from button (e.g. get.started).
 * Default preset: edge-46677-navigator. Change NAVIGATOR_ORCHESTRATION_EVENT_ID if your trigger hash differs.
 */
const NAVIGATOR_XDM_TENANT_KEY = '_demosystem5';
const NAVIGATOR_IDENTITY_ECID_KEY = 'ecid';
const NAVIGATOR_PRESET_ID = 'edge-46677-navigator';
const NAVIGATOR_ORCHESTRATION_EVENT_ID =
  '780960c9b920edefc4283c3d21ab58a32c3dd5a7e38de212865d8d308fd53873';

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'modNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const generatorTargetSelect = document.getElementById('generatorTarget');
const modMessage = document.getElementById('modMessage');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setModMessage(text, type) {
  if (!modMessage) return;
  modMessage.textContent = text || '';
  modMessage.className =
    'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  modMessage.hidden = !text;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

async function loadGeneratorTargets() {
  if (!generatorTargetSelect) return;
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
    if (generatorTargetSelect.querySelector('option[value="' + NAVIGATOR_PRESET_ID + '"]')) {
      generatorTargetSelect.value = NAVIGATOR_PRESET_ID;
    }
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
      setModMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setModMessage('Looking up profile...', '');
    await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
  });

loadGeneratorTargets();

(function initNavigatorGlobalDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('navigator-global-demo-page')) return;
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
  viewName: 'Navigator Global',
  emailGetter: getEmail,
  messageSetter: setModMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
});

/** CTA label → event type (e.g. Get started → get.started). */
function navigatorGlobalCtaLabelToEventType(text) {
  const parts = String(text || '')
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  return parts && parts.length ? parts.join('.') : 'link.clicked';
}

/**
 * Body for `POST /api/events/generator` — same contract as
 * `sendGeneratorEvent(requestBody, …)` in aep-event-sender-bundle/send-aep-event.js.
 *
 * @param {object} o
 * @param {string} o.eventType
 * @param {string} o.viewUrl
 * @param {string} [o.ctaLabel]
 * @param {string} [o.viewName]
 * @param {string} o.email
 * @param {string} o.ecid
 * @param {{ id?: string } | null} o.target
 * @param {string} [o.eventID] — journey / trigger orchestration event id
 */
function buildNavigatorGlobalGeneratorRequestBody(o) {
  const viewName = o.viewName != null && String(o.viewName).trim() ? String(o.viewName).trim() : 'Navigator Global';
  const body = {
    targetId: o.target && o.target.id ? o.target.id : undefined,
    email: o.email,
    eventType: o.eventType,
    viewName,
    viewUrl: o.viewUrl,
    channel: 'Web',
    timestamp: new Date().toISOString(),
    xdmTenantKey: NAVIGATOR_XDM_TENANT_KEY,
    identityMapEcidKey: NAVIGATOR_IDENTITY_ECID_KEY,
    eventID: o.eventID || NAVIGATOR_ORCHESTRATION_EVENT_ID,
    public: {
      linkUrl: o.viewUrl,
      ...(o.ctaLabel && String(o.ctaLabel).trim() ? { ctaLabel: String(o.ctaLabel).trim() } : {}),
    },
  };
  body.ecid = o.ecid;
  return body;
}

function getActiveEcidString() {
  const ecidText = infoEcid ? String(infoEcid.textContent || '').trim() : '';
  if (!ecidText || ecidText === '—' || ecidText === '-') return '';
  if (!/^\d+$/.test(ecidText) || ecidText.length < 10) return '';
  return ecidText;
}

async function sendNavigatorGlobalCtaEvent(eventType, destinationUrl, ctaLabel) {
  const emailForEvent = getEmail().trim();
  if (!emailForEvent) {
    setModMessage('Enter a customer identifier at the top before using page links.', 'error');
    return;
  }
  const ecid = getActiveEcidString();
  if (!ecid) {
    setModMessage('Look up a profile first so a valid ECID is available to attach to the event.', 'error');
    return;
  }
  setModMessage('Sending event to AEP…', '');
  try {
    const target = getSelectedGeneratorTarget();
    const body = buildNavigatorGlobalGeneratorRequestBody({
      eventType,
      viewUrl: destinationUrl,
      ctaLabel,
      email: emailForEvent,
      ecid,
      target,
    });
    const res = await fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.error || data.message || 'Request failed.';
      setModMessage(errMsg, 'error');
      return;
    }
    let idPart = '';
    if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
    else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
    setModMessage((data.message || 'Event sent to AEP.') + idPart, 'success');
  } catch (err) {
    setModMessage(err.message || 'Network error', 'error');
  }
}

/** Primary CTAs in the embedded snapshot: new tab + Experience Event to AEP (same pattern as Race for Life submit). */
(function wireNavigatorGlobalSnapshotCtas() {
  const body = document.body;
  if (!body || !body.classList.contains('navigator-global-demo-page')) return;
  const frame = document.querySelector('iframe.mod-demo-site-frame');
  if (!frame) return;

  function onIframeDocClick(e) {
    if (e.defaultPrevented) return;
    const t = e.target;
    if (!t || t.closest('#onetrust-consent-sdk')) return;
    const a = t.closest('a[href].cmp-button, a[href].auth-link');
    if (!a || !a.getAttribute('href')) return;
    const href = a.getAttribute('href').trim();
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return;
    const labelEl = a.querySelector('.cmp-button__text');
    const raw = ((labelEl && labelEl.textContent) || a.textContent || '').trim();
    const eventType = navigatorGlobalCtaLabelToEventType(raw);
    e.preventDefault();
    e.stopPropagation();
    if (!getEmail().trim()) {
      setModMessage('Enter a customer identifier at the top before using page links.', 'error');
      return;
    }
    if (!getActiveEcidString()) {
      setModMessage('Look up a profile first so a valid ECID is available to attach to the event.', 'error');
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
    void sendNavigatorGlobalCtaEvent(eventType, href, raw);
  }

  function attach() {
    let doc;
    try {
      doc = frame.contentDocument;
    } catch {
      return;
    }
    if (!doc || !doc.documentElement) return;
    if (doc.documentElement.getAttribute('data-aep-nav-cta-bridge') === '1') return;
    doc.documentElement.setAttribute('data-aep-nav-cta-bridge', '1');
    doc.addEventListener('click', onIframeDocClick, true);
  }

  frame.addEventListener('load', attach);
  if (frame.contentDocument && frame.contentDocument.readyState === 'complete') attach();
})();
