/**
 * Donate demo page — donation.made via /api/events/generator with public.donationAmount and public.donationDate (YYYY-MM-DD local).
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'donateNs');

function getSandboxParam() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
    return window.AepGlobalSandbox.getSandboxParam();
  }
  return '';
}

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const generatorTargetSelect = document.getElementById('generatorTarget');
const donateAmountInput = document.getElementById('donateAmount');
const donateNowBtn = document.getElementById('donateNowBtn');
const donateMessage = document.getElementById('donateMessage');

const tabMonthly = document.getElementById('tabMonthly');
const tabSingle = document.getElementById('tabSingle');
const presetsMonthly = document.getElementById('donatePresetsMonthly');
const presetsSingle = document.getElementById('donatePresetsSingle');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setDonateMessage(text, type) {
  if (!donateMessage) return;
  donateMessage.textContent = text || '';
  donateMessage.className = 'donate-message' + (type ? ' ' + type : '');
  donateMessage.hidden = !text;
}

/** Today's date in local timezone as YYYY-MM-DD (no time). */
function donationDateLocalYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Same parsing as Event generator `buildPublicPayloadFromForm` for donation amount. */
function parseDonationAmountForPayload() {
  const raw = donateAmountInput ? String(donateAmountInput.value || '').trim() : '';
  if (raw === '') return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && !Number.isNaN(n) ? n : raw;
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

function getFrequency() {
  return tabSingle && tabSingle.getAttribute('aria-selected') === 'true' ? 'single' : 'monthly';
}

function syncPresetPanels() {
  const single = getFrequency() === 'single';
  if (presetsMonthly) presetsMonthly.hidden = single;
  if (presetsSingle) presetsSingle.hidden = !single;
  document.querySelectorAll('.donate-preset.is-selected').forEach((b) => b.classList.remove('is-selected'));
}

function selectTab(isSingle) {
  if (tabMonthly) {
    tabMonthly.setAttribute('aria-selected', isSingle ? 'false' : 'true');
  }
  if (tabSingle) {
    tabSingle.setAttribute('aria-selected', isSingle ? 'true' : 'false');
  }
  syncPresetPanels();
}

tabMonthly &&
  tabMonthly.addEventListener('click', () => {
    selectTab(false);
  });
tabSingle &&
  tabSingle.addEventListener('click', () => {
    selectTab(true);
  });

document.querySelectorAll('.donate-preset').forEach((btn) => {
  btn.addEventListener('click', () => {
    const panel = btn.closest('.donate-presets');
    if (panel) {
      panel.querySelectorAll('.donate-preset').forEach((b) => b.classList.remove('is-selected'));
    }
    btn.classList.add('is-selected');
    const amt = btn.getAttribute('data-amount');
    if (donateAmountInput && amt != null) donateAmountInput.value = amt;
  });
});

if (donateAmountInput) {
  donateAmountInput.addEventListener('input', () => {
    document.querySelectorAll('.donate-preset.is-selected').forEach((b) => b.classList.remove('is-selected'));
  });
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    const email = getEmail().trim();
    if (!email) {
      setDonateMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setDonateMessage('Looking up profile…', '');
    await DemoProfileDrawer.loadProfileDataForDrawer(email, {
      updateMessage: true,
    });
  });

donateNowBtn &&
  donateNowBtn.addEventListener('click', async () => {
    const emailForEvent = getEmail().trim();
    if (!emailForEvent) {
      setDonateMessage('Enter your customer identifier at the top before donating.', 'error');
      return;
    }
    const donationAmount = parseDonationAmountForPayload();
    if (donationAmount == null || donationAmount === '') {
      setDonateMessage('Enter a donation amount (choose a preset or type an amount).', 'error');
      return;
    }

    donateNowBtn.disabled = true;
    setDonateMessage('Sending event to AEP…', '');

    try {
      const ecidText = infoEcid ? String(infoEcid.textContent || '').trim() : '';
      const ecid =
        ecidText && ecidText !== '—' && /^\d+$/.test(ecidText) && ecidText.length >= 10 ? ecidText : null;
      const target = getSelectedGeneratorTarget();
      const publicPayload = {
        donationAmount,
        donationDate: donationDateLocalYYYYMMDD(),
      };

      const body = {
        targetId: target ? target.id : undefined,
        email: emailForEvent,
        eventType: 'donation.made',
        viewName: 'Donate',
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
        if (data.streamingResponse) {
          extra = ' — ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
        } else if (data.edgeBody) {
          extra = ' — ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
        }
        setDonateMessage(errMsg + extra, 'error');
        return;
      }
      if (typeof addEmail === 'function') addEmail(emailForEvent);
      const lastDonationAmount = typeof donationAmount === 'number' ? `£${donationAmount}` : donationAmount;
      const lastDonationDate = donationDateLocalYYYYMMDD();
      DemoProfileDrawer.patchLastProfileOrUpdate({
        email: emailForEvent,
        lastDonationAmount,
        lastDonationDate,
      });
      let idPart = '';
      if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
      else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
      setDonateMessage((data.message || 'Event sent to AEP.') + idPart, 'success');
    } catch (err) {
      setDonateMessage(err.message || 'Network error', 'error');
    } finally {
      donateNowBtn.disabled = false;
    }
  });

loadGeneratorTargets();
syncPresetPanels();

(function initDonatePageFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('donate-demo-page')) return;
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
    body.classList.toggle('donate-demo-page--nav-open', open);
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
    if (body.classList.contains('donate-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('donate-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'donate-demo-page--profile-open',
  viewName: 'Donate',
  emailGetter: getEmail,
  messageSetter: setDonateMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
});
