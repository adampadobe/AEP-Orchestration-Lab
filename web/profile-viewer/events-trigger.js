/**
 * Events Trigger – select profile, choose event type from config, send predefined payload with ECID.
 * Event types and payloads are defined in event-triggers.json.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');

function getSandboxParam() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
    return window.AepGlobalSandbox.getSandboxParam();
  }
  return '';
}

const queryProfileBtn = document.getElementById('queryProfileBtn');
const profileMessage = document.getElementById('profileMessage');

const eventTypeSelect = document.getElementById('eventType');
const eventTypeHint = document.getElementById('eventTypeHint');
const sendTriggerBtn = document.getElementById('sendTriggerBtn');
const triggerMessage = document.getElementById('triggerMessage');

function setMessage(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = 'consent-message' + (type ? ' ' + type : '');
  el.hidden = !text;
}

function getEmail() {
  return (customerEmail && customerEmail.value || '').trim();
}

function formatPreferredChannel(value) {
  if (value == null || value === '') return '—';
  const v = String(value).toLowerCase().trim();
  if (v === 'email') return 'Email';
  if (v === 'sms') return 'SMS';
  if (v === 'push') return 'Push';
  if (v === 'phone') return 'Phone';
  if (v === 'postal' || v === 'postalmail' || v === 'directmail' || v === 'direct_mail') return 'Postal Mail';
  return value;
}

function applyCustomerInfo(data) {
  document.getElementById('infoEmail').textContent = data.email || '—';
  document.getElementById('infoFirstName').textContent = data.firstName || '—';
  document.getElementById('infoLastName').textContent = data.lastName || '—';
  const ecidVal = data.ecid == null ? '' : Array.isArray(data.ecid) ? (data.ecid[0] != null ? String(data.ecid[0]) : '') : String(data.ecid);
  document.getElementById('infoEcid').textContent = !ecidVal ? '—' : ecidVal;
  document.getElementById('infoPreferredChannel').textContent = formatPreferredChannel(data.preferredMarketingChannel);
  document.getElementById('infoLastUpdated').textContent = data.lastModifiedAt || '—';
}

queryProfileBtn.addEventListener('click', async () => {
  const email = getEmail();
  if (!email) {
    setMessage(profileMessage, 'Please enter an email address.', 'error');
    return;
  }
  setMessage(profileMessage, 'Loading…', '');
  try {
    const res = await fetch('/api/profile/consent?email=' + encodeURIComponent(email) + getSandboxParam());
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
      applyCustomerInfo({ email: email, ecid: null, firstName: null, lastName: null, preferredMarketingChannel: null, lastModifiedAt: null });
      setMessage(profileMessage, 'No profile found for this email. ECID is required to send events.', 'error');
    }
  } catch (err) {
    setMessage(profileMessage, err.message || 'Network error', 'error');
  }
});

// Load event types from config and populate dropdown
async function loadEventTypes() {
  if (!eventTypeSelect) return;
  try {
    const res = await fetch('/api/events/trigger-config');
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.eventTypes && data.eventTypes.length > 0) {
      eventTypeSelect.innerHTML = '<option value="">— Select event type —</option>';
      data.eventTypes.forEach((et) => {
        const opt = document.createElement('option');
        opt.value = et;
        opt.textContent = et;
        eventTypeSelect.appendChild(opt);
      });
      if (eventTypeHint) eventTypeHint.textContent = data.eventTypes.length + ' event type(s) from event-triggers.json.';
    } else {
      if (eventTypeHint) eventTypeHint.textContent = 'Event types loaded from event-triggers.json. Add deposit.made and more in the config.';
    }
  } catch (_) {
    if (eventTypeHint) eventTypeHint.textContent = 'Could not load event types. Check event-triggers.json.';
  }
}

// Send event
if (sendTriggerBtn && triggerMessage) {
  sendTriggerBtn.addEventListener('click', async () => {
    const eventType = eventTypeSelect ? String(eventTypeSelect.value || '').trim() : '';
    const ecidEl = document.getElementById('infoEcid');
    const ecid = ecidEl ? String(ecidEl.textContent || '').trim() : '';
    const ecidValid = ecid && ecid !== '—' && /^\d+$/.test(ecid) && ecid.length >= 10;
    const email = getEmail();

    if (!eventType) {
      setMessage(triggerMessage, 'Please select an event type.', 'error');
      return;
    }
    if (!ecidValid) {
      setMessage(triggerMessage, 'ECID is required. Query a profile first (Step 1).', 'error');
      return;
    }

    sendTriggerBtn.disabled = true;
    setMessage(triggerMessage, 'Sending…', '');
    try {
      const res = await fetch('/api/events/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, ecid, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg =
          data.error ||
          data.message ||
          data.detail ||
          data.title ||
          (data.streamingResponse && (data.streamingResponse.message || data.streamingResponse.detail || data.streamingResponse.title));
        setMessage(triggerMessage, errMsg || `Request failed (${res.status}). Check .env for AEP_TRIGGER_STREAMING_URL or AEP_PROFILE_STREAMING_URL.`, 'error');
      } else {
        if (email && typeof addEmail === 'function') addEmail(email);
        setMessage(triggerMessage, (data.message || 'Event sent.') + (data.requestId ? ' Request ID: ' + data.requestId : ''), 'success');
      }
    } catch (err) {
      setMessage(triggerMessage, err.message || 'Network error', 'error');
    } finally {
      sendTriggerBtn.disabled = false;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadEventTypes);
} else {
  loadEventTypes();
}
