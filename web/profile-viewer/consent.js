/**
 * Adobe Consent Manager – query profile, display ECID & consent, update AEP.
 */

const customerEmail = document.getElementById('customerEmail');
const profileEcid = document.getElementById('profileEcid');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
const queryProfileBtn = document.getElementById('queryProfileBtn');
const clearFormBtn = document.getElementById('clearFormBtn');
const sampleDataBtn = document.getElementById('sampleDataBtn');
const step1Message = document.getElementById('step1Message');
const enableAllBtn = document.getElementById('enableAllBtn');
const disableAllBtn = document.getElementById('disableAllBtn');
const quickClearBtn = document.getElementById('quickClearBtn');
const updateConsentBtn = document.getElementById('updateConsentBtn');
const previewDataBtn = document.getElementById('previewDataBtn');
const step4Message = document.getElementById('step4Message');
const preferredChannelSelect = document.getElementById('preferredChannel');

const SAMPLE_EMAIL = 'kirkham+media-1@adobetest.com';

/** Consent radios live under Step 2 so :checked is never read from another part of the page. */
function consentFormRoot() {
  return document.getElementById('step3') || document;
}

/** Snapshot of form choices after a successful profile load — used to detect real edits before save. */
let consentFingerprintBaseline = null;

const RADIO_CONSENT_NAMES = [
  'dataCollection',
  'dataSharing',
  'contentPersonalization',
  'marketingAny',
  'emailGeneric',
  'emailSpecific',
  'smsMarketing',
  'pushMarketing',
  'phoneMarketing',
  'postalMarketing',
  'whatsappMarketing',
];

function showMessage(el, text, type) {
  el.textContent = text;
  el.className = 'consent-message ' + (type || '');
  el.hidden = !text;
}

function setTri(name, val) {
  const r = consentFormRoot().querySelector(`input[type="radio"][name="${name}"][value="${val}"]`);
  if (r) r.checked = true;
}

function getTri(name) {
  const el = consentFormRoot().querySelector(`input[type="radio"][name="${name}"]:checked`);
  return el ? el.value : 'na';
}

function setAllRadios(value) {
  RADIO_CONSENT_NAMES.forEach((n) => setTri(n, value));
}

function clearForm() {
  customerEmail.value = '';
  if (profileEcid) {
    profileEcid.value = '';
    profileEcid.placeholder = '—';
  }
  step1Message.hidden = true;
  setTri('dataCollection', 'na');
  setTri('dataSharing', 'na');
  setTri('contentPersonalization', 'na');
  setTri('marketingAny', 'n');
  setTri('emailGeneric', 'na');
  setTri('emailSpecific', 'na');
  setTri('smsMarketing', 'n');
  setTri('pushMarketing', 'n');
  setTri('phoneMarketing', 'n');
  setTri('postalMarketing', 'n');
  setTri('whatsappMarketing', 'n');
  consentFingerprintBaseline = null;
  step4Message.hidden = true;
}

function mapPreferredToSelect(value) {
  if (!value) return 'email';
  const v = String(value).toLowerCase();
  if (v === 'email') return 'email';
  if (v === 'sms') return 'sms';
  if (v === 'push') return 'push';
  if (v === 'phone') return 'phone';
  if (v === 'postal' || v === 'postalmail' || v === 'directmail' || v === 'direct_mail') return 'postal';
  return 'email';
}

function ynFromProfile(v) {
  if (v === 'y' || v === 'Y') return 'y';
  if (v === 'n' || v === 'N') return 'n';
  return 'na';
}

function channelToTri(v) {
  if (v === 'in') return 'y';
  if (v === 'out') return 'n';
  return 'na';
}

function applyProfileToForm(data) {
  if (profileEcid) {
    profileEcid.value = data.ecid ? String(data.ecid) : '';
    profileEcid.placeholder = data.ecid ? '' : '—';
  }

  if (preferredChannelSelect) {
    preferredChannelSelect.value = mapPreferredToSelect(data.preferredMarketingChannel ?? data.preferred);
  }

  setTri('dataCollection', ynFromProfile(data.dataCollection));
  setTri('dataSharing', ynFromProfile(data.dataSharing));
  setTri('contentPersonalization', ynFromProfile(data.contentPersonalization));

  const m = data.marketingConsent;
  setTri('marketingAny', m === 'Y' || m === 'y' ? 'y' : m === 'N' || m === 'n' ? 'n' : 'na');

  const ch = data.channels || {};
  setTri('emailGeneric', ch.email != null ? channelToTri(ch.email) : 'na');
  setTri('emailSpecific', ch.email != null ? channelToTri(ch.email) : 'na');
  setTri('smsMarketing', ch.sms != null ? channelToTri(ch.sms) : 'na');
  setTri('pushMarketing', ch.push != null ? channelToTri(ch.push) : 'na');
  setTri('postalMarketing', ch.directMail != null ? channelToTri(ch.directMail) : 'na');
  setTri('phoneMarketing', ch.phone != null ? channelToTri(ch.phone) : 'na');
  setTri('whatsappMarketing', ch.whatsapp != null ? channelToTri(ch.whatsapp) : 'na');

  consentFingerprintBaseline = consentStateFingerprint();
}

function consentStateFingerprint() {
  const ch = buildChannelsFromForm();
  return JSON.stringify({
    radios: RADIO_CONSENT_NAMES.map((n) => [n, getTri(n)]),
    preferred: preferredChannelSelect ? preferredChannelSelect.value : 'email',
    channels: ch,
  });
}

/**
 * Same streaming contract as Profile Viewer “Update profile”: dotted paths under tenant _demoemea.
 * Mirrors server buildConsentXdm when channelOptInOut is omitted and a full channels map is sent.
 */
function consentFormToStreamingUpdates() {
  const ma = getTri('marketingAny');
  const mc = ma === 'y' ? 'Y' : ma === 'n' ? 'N' : null;
  const val = mc != null ? (String(mc).toUpperCase() === 'Y' ? 'y' : 'n') : 'y';
  const defaultChannelVal = 'in';
  const channelYn = defaultChannelVal === 'out' ? 'n' : 'y';
  const marketingNow = new Date().toISOString();
  const channels = buildChannelsFromForm();
  const dc = getTri('dataCollection');
  const ds = getTri('dataSharing');
  const cp = getTri('contentPersonalization');
  const preferred = preferredChannelSelect ? preferredChannelSelect.value : 'email';
  const toYorN = (v) => (v === 'y' ? 'y' : 'n');

  const updates = [
    { path: 'consents.marketing.val', value: val },
    { path: 'consents.marketing.any.val', value: val },
    { path: 'consents.marketing.any.reason', value: 'Profile streaming default' },
    { path: 'consents.marketing.any.time', value: marketingNow },
    { path: 'consents.marketing.preferred', value: preferred },
    { path: 'consents.marketing.email.val', value: channelYn },
    { path: 'consents.marketing.sms.val', value: channelYn },
    { path: 'consents.marketing.push.val', value: channelYn },
    { path: 'consents.marketing.call.val', value: channelYn },
    { path: 'consents.marketing.whatsApp.val', value: channelYn },
    { path: 'consents.marketing.fax.val', value: channelYn },
    { path: 'consents.marketing.postalMail.val', value: channelYn },
    { path: 'consents.marketing.commercialEmail.val', value: channelYn },
  ];
  if (dc === 'y' || dc === 'n') updates.push({ path: 'consents.collect.val', value: toYorN(dc) });
  if (ds === 'y' || ds === 'n') updates.push({ path: 'consents.share.val', value: toYorN(ds) });
  if (cp === 'y' || cp === 'n') updates.push({ path: 'consents.personalize.content.val', value: toYorN(cp) });
  for (const key of Object.keys(channels)) {
    updates.push({ path: `optInOut._channels.${key}`, value: channels[key] });
  }
  return updates;
}

async function queryProfile() {
  const email = (customerEmail.value || '').trim();
  if (!email) {
    showMessage(step1Message, 'Enter a customer email address.', 'error');
    return;
  }
  queryProfileBtn.disabled = true;
  showMessage(step1Message, 'Querying AEP for profile…', '');
  try {
    const res = await fetch('/api/profile/consent?email=' + encodeURIComponent(email));
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      showMessage(step1Message, 'Server returned an invalid response. Use http://localhost:3333/consent.html', 'error');
      return;
    }
    if (!res.ok) {
      showMessage(step1Message, data.error || 'Request failed', 'error');
      return;
    }
    if (!data.found) {
      consentFingerprintBaseline = null;
      if (profileEcid) {
        profileEcid.value = '';
        profileEcid.placeholder = '—';
      }
      showMessage(step1Message, 'No profile found for this email in Adobe Experience Platform.', 'error');
      return;
    }
    if (typeof addEmail === 'function') addEmail(data.email || email);
    applyProfileToForm(data);
    showMessage(step1Message, 'Profile loaded successfully for ' + (data.email || email) + '.', 'success');
  } catch (err) {
    showMessage(step1Message, err.message || 'Network error', 'error');
  } finally {
    queryProfileBtn.disabled = false;
  }
}

function buildChannelsFromForm() {
  const map = (v) => (v === 'y' ? 'in' : v === 'n' ? 'out' : 'not_provided');
  const emailTri =
    getTri('emailGeneric') === 'y' || getTri('emailSpecific') === 'y'
      ? 'y'
      : getTri('emailGeneric') === 'n' || getTri('emailSpecific') === 'n'
        ? 'n'
        : 'na';
  return {
    email: map(emailTri),
    sms: map(getTri('smsMarketing')),
    push: map(getTri('pushMarketing')),
    phone: map(getTri('phoneMarketing')),
    directMail: map(getTri('postalMarketing')),
    whatsapp: map(getTri('whatsappMarketing')),
    facebookFeed: 'not_provided',
    web: 'not_provided',
    mobileApp: 'not_provided',
    twitterFeed: 'not_provided',
  };
}

async function updateConsent() {
  const email = (customerEmail.value || '').trim();
  if (!email) {
    showMessage(step4Message, 'Query a profile first (Step 1).', 'error');
    return;
  }
  const ecid = profileEcid ? String(profileEcid.value || '').trim() : '';
  if (!ecid || ecid.length < 10) {
    showMessage(step4Message, 'Load a profile first (Step 1) to get ECID, or paste a valid ECID.', 'error');
    return;
  }
  if (consentFingerprintBaseline != null && consentStateFingerprint() === consentFingerprintBaseline) {
    showMessage(
      step4Message,
      'No consent changes since this profile was loaded. Change at least one Yes / No / N/A option, then click Update again.',
      'error',
    );
    return;
  }
  const updates = consentFormToStreamingUpdates();
  updateConsentBtn.disabled = true;
  showMessage(step4Message, 'Updating…', '');
  try {
    const { ok, data } = await postProfileUpdate({
      email,
      ecid,
      updates,
    });
    if (!ok) {
      showMessage(step4Message, formatProfileUpdateError(data), 'error');
      return;
    }
    if (typeof addEmail === 'function') addEmail(email);
    consentFingerprintBaseline = consentStateFingerprint();
    showMessage(step4Message, data.message || 'Consent preferences updated successfully.', 'success');
  } catch (err) {
    showMessage(step4Message, err.message || 'Network error', 'error');
  } finally {
    updateConsentBtn.disabled = false;
  }
}

function previewData() {
  const email = (customerEmail.value || '').trim();
  const ma = getTri('marketingAny');
  const payload = {
    email,
    ecid: profileEcid ? profileEcid.value.trim() || null : null,
    marketingConsent: ma === 'y' ? 'Y' : ma === 'n' ? 'N' : null,
    dataCollection: getTri('dataCollection'),
    dataSharing: getTri('dataSharing'),
    contentPersonalization: getTri('contentPersonalization'),
    channels: buildChannelsFromForm(),
  };
  const w = window.open('', '_blank');
  w.document.write(
    '<pre style="background:#1a1d23;color:#e6e8ec;padding:1rem;font-family:monospace;white-space:pre-wrap;">' +
      JSON.stringify(payload, null, 2) +
      '</pre>',
  );
  w.document.close();
}

queryProfileBtn.addEventListener('click', queryProfile);
clearFormBtn.addEventListener('click', clearForm);
sampleDataBtn.addEventListener('click', () => {
  customerEmail.value = SAMPLE_EMAIL;
  queryProfile();
});
enableAllBtn.addEventListener('click', () => {
  setAllRadios('y');
});
disableAllBtn.addEventListener('click', () => {
  setAllRadios('n');
});
quickClearBtn.addEventListener('click', clearForm);
updateConsentBtn.addEventListener('click', updateConsent);
previewDataBtn.addEventListener('click', previewData);
