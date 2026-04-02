/**
 * Trigger journey events (AJO) – event dropdown; sends JSON with selected eventType to AJO (Edge).
 */

const eventOption = document.getElementById('eventOption');
const profileEmail = document.getElementById('profileEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('profileEmail');
const triggerEventBtn = document.getElementById('triggerEventBtn');
const eventMessage = document.getElementById('eventMessage');

function setMessage(text, type) {
  if (!eventMessage) return;
  eventMessage.textContent = text;
  eventMessage.className = 'consent-message' + (type ? ' ' + type : '');
  eventMessage.hidden = !text;
}

if (triggerEventBtn) {
  triggerEventBtn.addEventListener('click', async () => {
    const eventType = eventOption && eventOption.value;
    const email = (profileEmail && profileEmail.value || '').trim();
    if (!eventType) {
      setMessage('Please select an event option.', 'error');
      return;
    }
    if (!email) {
      setMessage('Please enter a customer email.', 'error');
      return;
    }

    triggerEventBtn.disabled = true;
    setMessage('Sending journey event to AJO…', '');

    try {
      const res = await fetch('/api/events/ajo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, email }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.error || data.message || 'Request failed.', 'error');
        return;
      }
      if (email && typeof addEmail === 'function') addEmail(email);
      setMessage(
        (data.message || 'Event sent.') +
          (data.eventType ? ' Event type: ' + data.eventType : '') +
          (data.requestId ? ' Request ID: ' + data.requestId : ''),
        'success'
      );
    } catch (err) {
      setMessage(err.message || 'Network error', 'error');
    } finally {
      triggerEventBtn.disabled = false;
    }
  });
}
