/**
 * Event Generator – select profile, fill event fields, send to AEP.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail');

function getSandboxParam() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
    return window.AepGlobalSandbox.getSandboxParam();
  }
  return '';
}

const queryProfileBtn = document.getElementById('queryProfileBtn');
const profileMessage = document.getElementById('profileMessage');

const eventType = document.getElementById('eventType');
const viewName = document.getElementById('viewName');
const viewUrl = document.getElementById('viewUrl');
const eventTypeHint = document.getElementById('eventTypeHint');
const generatorTargetSelect = document.getElementById('generatorTarget');
const orchestrationEventIDInput = document.getElementById('orchestrationEventID');

const EVENT_SCHEMA_ID = 'https://ns.adobe.com/demoemea/schemas/d9b88a044ad96154637965a97ed63c7b20bdf2ab3b4f642e';

/** @type {Array<{ id: string, label: string, transport: string, dataStreamId: string | null, xdmStyle: string, streamingUrl: string | null }>} */
let generatorTargets = [];

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

/** @returns {string | null} ISO-8601 UTC with ms (e.g. 2026-03-31T21:16:15.041Z), or null to use server default */
function getEventTimestampIsoFromPreset() {
  const sel = document.getElementById('eventTimestampPreset');
  const v = sel ? String(sel.value || '').trim() : '';
  if (v === 'now') return new Date().toISOString();
  if (v === 'yesterday') return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return null;
}

function buildPublicPayloadFromForm() {
  const amtRaw = document.getElementById('publicDonationAmount')?.value?.trim() ?? '';
  const regRaw = document.getElementById('publicEventRegistration')?.value?.trim() ?? '';
  const dateRaw = document.getElementById('publicDonationDate')?.value?.trim() ?? '';
  const pub = {};
  if (amtRaw !== '') {
    const n = Number(amtRaw.replace(/,/g, ''));
    pub.donationAmount = Number.isFinite(n) && !Number.isNaN(n) ? n : amtRaw;
  }
  if (regRaw !== '') pub.eventRegistration = regRaw;
  if (dateRaw !== '') pub.donationDate = dateRaw;
  return Object.keys(pub).length > 0 ? pub : null;
}

function setMessage(el, text, type) {
  el.textContent = text;
  el.className = 'consent-message' + (type ? ' ' + type : '');
  el.hidden = !text;
}

function getEmail() {
  return (customerEmail && customerEmail.value || '').trim();
}

function applyCustomerInfo(data) {
  document.getElementById('infoEmail').textContent = data.email || '—';
  document.getElementById('infoFirstName').textContent = data.firstName || '—';
  document.getElementById('infoLastName').textContent = data.lastName || '—';
  const ecidVal = data.ecid == null ? '' : Array.isArray(data.ecid) ? (data.ecid[0] != null ? String(data.ecid[0]) : '') : String(data.ecid);
  document.getElementById('infoEcid').textContent = !ecidVal ? '—' : ecidVal;
}

queryProfileBtn.addEventListener('click', async () => {
  const email = getEmail();
  if (!email) {
    setMessage(profileMessage, 'Please enter an identifier value.', 'error');
    return;
  }
  const ns = typeof AepIdentityPicker !== 'undefined' ? AepIdentityPicker.getNamespace('customerEmail') : 'email';
  setMessage(profileMessage, 'Loading…', '');
  try {
    const res = await fetch('/api/profile/consent?identifier=' + encodeURIComponent(email) + '&namespace=' + encodeURIComponent(ns) + getSandboxParam());
    const data = await res.json();
    if (!res.ok) {
      setMessage(profileMessage, data.error || 'Request failed.', 'error');
      return;
    }
    if (typeof addEmail === 'function') addEmail(email);
    if (data.found) {
      applyCustomerInfo(data);
      setMessage(profileMessage, 'Profile found. Customer information updated.', 'success');
    } else {
      applyCustomerInfo({ email: email, ecid: null, firstName: null, lastName: null });
      setMessage(profileMessage, 'No profile found for this email. You can still send an event; it may create a new profile.', 'success');
    }
  } catch (err) {
    setMessage(profileMessage, err.message || 'Network error', 'error');
  }
});

// DCS HTTP streaming (see /api/events/generator; default collection URL in server)
const sendEdgeBtn = document.getElementById('sendEdgeBtn');
const edgeMessage = document.getElementById('edgeMessage');

if (sendEdgeBtn && edgeMessage) {
  sendEdgeBtn.addEventListener('click', async () => {
    sendEdgeBtn.disabled = true;
    setMessage(edgeMessage, 'Sending…', '');
    try {
      const emailForEvent = getEmail();
      if (!emailForEvent) {
        setMessage(edgeMessage, 'Enter a customer email in Step 1 before sending.', 'error');
        return;
      }
      const ecidEl = document.getElementById('infoEcid');
      const ecidFromStep2 = ecidEl ? String(ecidEl.textContent || '').trim() : '';
      const ecid = ecidFromStep2 && ecidFromStep2 !== '—' && /^\d+$/.test(ecidFromStep2) && ecidFromStep2.length >= 10 ? ecidFromStep2 : null;
      const eventTypeEl = document.getElementById('eventType');
      const eventTypeFromDropdown = eventTypeEl ? String(eventTypeEl.value || '').trim() : '';
      const viewNameEl = document.getElementById('viewName');
      const viewUrlEl = document.getElementById('viewUrl');
      const viewNameVal = viewNameEl ? String(viewNameEl.value || '').trim() : '';
      const viewUrlVal = viewUrlEl ? String(viewUrlEl.value || '').trim() : '';
      const interactionChannelEl = document.getElementById('interactionChannel');
      const channelVal = interactionChannelEl ? String(interactionChannelEl.value || '').trim() : '';
      const target = getSelectedGeneratorTarget();
      const edgeMinimal =
        target &&
        String(target.transport || '').toLowerCase() === 'edge' &&
        String(target.xdmStyle || '') === 'minimal';
      const body = {
        targetId: target ? target.id : undefined,
        email: emailForEvent,
        eventType: eventTypeFromDropdown || (edgeMinimal ? 'donation.made' : 'transaction'),
        viewName: viewNameVal,
        viewUrl: viewUrlVal,
      };
      if (channelVal) body.channel = channelVal;
      if (ecid) body.ecid = ecid;
      const orch = orchestrationEventIDInput ? String(orchestrationEventIDInput.value || '').trim() : '';
      if (orch) body.eventID = orch;
      const tsIso = getEventTimestampIsoFromPreset();
      if (tsIso) {
        body.timestamp = tsIso;
        body._id = String(new Date(tsIso).getTime());
      }
      const industryVal = (document.getElementById('industry')?.value || '').trim().toLowerCase();
      const pub = buildPublicPayloadFromForm();
      if (pub && industryVal === 'public') {
        body.public = pub;
      }
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
          extra = ' — ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 140);
        } else if (data.edgeBody) {
          extra = ' — ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 140);
        }
        setMessage(edgeMessage, errMsg + extra, 'error');
      } else {
        if (typeof addEmail === 'function') addEmail(emailForEvent);
        let idPart = '';
        if (data.transport === 'edge' && data.requestId) idPart = ' requestId: ' + data.requestId;
        else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
        setMessage(edgeMessage, (data.message || 'Event sent.') + idPart, 'success');
      }
    } catch (err) {
      setMessage(edgeMessage, err.message || 'Network error', 'error');
    } finally {
      sendEdgeBtn.disabled = false;
    }
  });
}

/** Always offer these in the datalist alongside schema enum values (may not be in XED yet). */
const EXTRA_EVENT_TYPE_SUGGESTIONS = ['donation.made', 'event.registered', 'form.abandoned'];

// Load eventType suggestions into datalist from schema on page load
async function loadEventTypesFromSchema() {
  const eventTypeInput = document.getElementById('eventType');
  const eventTypeList = document.getElementById('eventTypeList');
  if (!eventTypeInput || !eventTypeList) return;
  let fromSchema = [];
  try {
    const res = await fetch('/api/schema/event-types?schemaId=' + encodeURIComponent(EVENT_SCHEMA_ID));
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.eventTypes) && data.eventTypes.length > 0) {
      fromSchema = data.eventTypes;
    }
  } catch (_) {
    /* use extras only */
  }
  const merged = [...new Set([...fromSchema, ...EXTRA_EVENT_TYPE_SUGGESTIONS])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  eventTypeList.innerHTML = '';
  merged.forEach((value) => {
    const opt = document.createElement('option');
    opt.value = value;
    eventTypeList.appendChild(opt);
  });
  if (eventTypeHint) {
    if (fromSchema.length > 0) {
      eventTypeHint.textContent =
        merged.length + ' types (schema + app suggestions); you can also type your own.';
    } else {
      eventTypeHint.textContent =
        'Suggestions include donation.made, event.registered, and form.abandoned; type any event type or expand the list when the schema loads.';
    }
  }
}

function initEventGeneratorPage() {
  loadEventTypesFromSchema();
  loadGeneratorTargets();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEventGeneratorPage);
} else {
  initEventGeneratorPage();
}

function todayLocalDateString() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function ensurePublicDonationDateDefault() {
  const el = document.getElementById('publicDonationDate');
  if (el && !el.value) el.value = todayLocalDateString();
}

// Step 3: Industry selector – show/hide industry-specific fields
const industrySelect = document.getElementById('industry');
const industryGroups = {
  retail: document.getElementById('industryRetail'),
  fsi: document.getElementById('industryFsi'),
  travel: document.getElementById('industryTravel'),
  media: document.getElementById('industryMedia'),
  public: document.getElementById('industryPublic'),
};

function showIndustryFields(industry) {
  Object.keys(industryGroups).forEach((key) => {
    const el = industryGroups[key];
    if (el) el.hidden = !industry || key !== industry;
  });
  if (industry === 'public') ensurePublicDonationDateDefault();
}

if (industrySelect) {
  industrySelect.addEventListener('change', () => {
    const v = (industrySelect.value || '').trim().toLowerCase();
    showIndustryFields(v || null);
  });
  const initial = (industrySelect.value || '').trim().toLowerCase();
  if (initial) showIndustryFields(initial);
}

ensurePublicDonationDateDefault();
