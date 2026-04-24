/**
 * Race for Life demo page.
 * Sends event.registered via /api/events/generator.
 * After a successful profile lookup, sends form.abandon in 10s unless the form is submitted.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'raceNs');

function getSandboxParam() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
    return window.AepGlobalSandbox.getSandboxParam();
  }
  return '';
}

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const generatorTargetSelect = document.getElementById('generatorTarget');
const raceEventForm = document.getElementById('raceEventForm');
const eventLocation = document.getElementById('eventLocation');
const eventType = document.getElementById('eventType');
const startDate = document.getElementById('startDate');
const endDate = document.getElementById('endDate');
const eventSubmitBtn = document.getElementById('eventSubmitBtn');
const abandonedBasketBtn = document.getElementById('abandonedBasketBtn');
const raceMessage = document.getElementById('raceMessage');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

/** Fires `form.abandon` after profile lookup unless submit or manual abandon happens first. */
let abandonBasketTimerId = null;

function clearAbandonBasketTimer() {
  if (abandonBasketTimerId != null) {
    window.clearTimeout(abandonBasketTimerId);
    abandonBasketTimerId = null;
  }
}

function scheduleAutoAbandonAfterLookup() {
  clearAbandonBasketTimer();
  abandonBasketTimerId = window.setTimeout(() => {
    abandonBasketTimerId = null;
    void sendRaceEvent('form.abandon', true);
  }, 10_000);
}

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setRaceMessage(text, type) {
  if (!raceMessage) return;
  raceMessage.textContent = text || '';
  raceMessage.className = 'race-message' + (type ? ' ' + type : '');
  raceMessage.hidden = !text;
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
    clearAbandonBasketTimer();
    const email = getEmail().trim();
    if (!email) {
      setRaceMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setRaceMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (ok && typeof RaceForLifeAjo !== 'undefined' && typeof RaceForLifeAjo.refreshFromProfile === 'function') {
      const ns =
        typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function'
          ? AepIdentityPicker.getNamespace('customerEmail')
          : 'email';
      void RaceForLifeAjo.refreshFromProfile(DemoProfileDrawer.getLastLookedUpProfile(), email, ns);
    }
    scheduleAutoAbandonAfterLookup();
  });

/** @returns {Promise<boolean>} true if the event was accepted by the generator API */
async function sendRaceEvent(eventTypeName, includeEventRegistration) {
    const emailForEvent = getEmail().trim();
    const location = eventLocation ? String(eventLocation.value || '').trim() : '';
    const type = eventType ? String(eventType.value || '').trim() : 'All types';
    const start = startDate ? String(startDate.value || '').trim() : '';
    const end = endDate ? String(endDate.value || '').trim() : '';

    if (!emailForEvent) {
      setRaceMessage('Enter your customer email at the top before submitting.', 'error');
      return false;
    }
    if (!location) {
      setRaceMessage('Choose an event location.', 'error');
      return false;
    }

    if (eventSubmitBtn) eventSubmitBtn.disabled = true;
    if (abandonedBasketBtn) abandonedBasketBtn.disabled = true;
    setRaceMessage('Sending event to AEP...', '');
    try {
      const ecidText = infoEcid ? String(infoEcid.textContent || '').trim() : '';
      const ecid = ecidText && ecidText !== '-' && /^\d+$/.test(ecidText) && ecidText.length >= 10 ? ecidText : null;
      const target = getSelectedGeneratorTarget();
      const publicPayload = {
        location,
        eventType: type,
        startDate: start || null,
        endDate: end || null,
      };
      if (includeEventRegistration) publicPayload.eventRegistration = location;
      const body = {
        targetId: target ? target.id : undefined,
        email: emailForEvent,
        eventType: eventTypeName,
        viewName: 'Race for Life',
        viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
        channel: 'Web',
        public: publicPayload,
      };
      if (ecid) body.ecid = ecid;

      const res = await fetch('/api/events/generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error || data.message || 'Request failed.';
        let extra = '';
        if (data.streamingResponse) extra = ' - ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
        else if (data.edgeBody) extra = ' - ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
        setRaceMessage(errMsg + extra, 'error');
        return false;
      }
      if (typeof addEmail === 'function') addEmail(emailForEvent);
      let idPart = '';
      if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
      else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
      setRaceMessage((data.message || 'Event sent to AEP.') + idPart, 'success');
      return true;
    } catch (err) {
      setRaceMessage(err.message || 'Network error', 'error');
      return false;
    } finally {
      if (eventSubmitBtn) eventSubmitBtn.disabled = false;
      if (abandonedBasketBtn) abandonedBasketBtn.disabled = false;
    }
}

raceEventForm &&
  raceEventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAbandonBasketTimer();
    const ok = await sendRaceEvent('event.registered', true);
    if (ok) window.location.assign('donate-demo.html');
  });

abandonedBasketBtn &&
  abandonedBasketBtn.addEventListener('click', async () => {
    clearAbandonBasketTimer();
    await sendRaceEvent('form.abandon', true);
  });

loadGeneratorTargets();

(function initRacePageFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('race-page')) return;
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
    body.classList.toggle('race-page--nav-open', open);
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
    if (body.classList.contains('race-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('race-page--nav-open');
  });
  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'race-page--profile-open',
  viewName: 'Race for Life',
  emailGetter: getEmail,
  messageSetter: setRaceMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});
