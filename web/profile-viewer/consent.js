/**
 * Adobe Consent Manager – query profile by namespace, stream consent using profile email.
 */

const customerEmail = document.getElementById('customerEmail');
const identityNamespace = document.getElementById('identityNamespace');
const profileResolvedEmailLine = document.getElementById('profileResolvedEmailLine');
const profileResolvedEmailDisplay = document.getElementById('profileResolvedEmailDisplay');
/** Email from the loaded profile; used as primary identity for consent streaming (not the lookup value when namespace ≠ email). */
let consentStreamingEmail = '';
/** Optional ECID from loaded profile; added to stream payload when present (email-primary flows work without it). */
let consentOptionalEcid = '';
if (typeof attachEmailDatalist === 'function') {
  attachEmailDatalist('customerEmail', 'recentEmails', 'identityNamespace');
}
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
const consentPreviewPanel = document.getElementById('consentPreviewPanel');
const consentPreviewHeader = document.getElementById('consentPreviewHeader');
const consentPreviewNote = document.getElementById('consentPreviewNote');
const consentPreviewPre = document.getElementById('consentPreviewPre');
const consentPreviewMinimizeBtn = document.getElementById('consentPreviewMinimizeBtn');
const consentPreviewTitle = document.getElementById('consentPreviewTitle');
const consentPreviewMeta = document.getElementById('consentPreviewMeta');
const preferredChannelSelect = document.getElementById('preferredChannel');
const preferredLanguageSelect = document.getElementById('preferredLanguage');
const sandboxSelect = document.getElementById('sandboxSelect');
const infraStatusMessage = document.getElementById('infraStatusMessage');
const checkInfraBtn = document.getElementById('checkInfraBtn');
const stepCreateSchemaBtn = document.getElementById('stepCreateSchemaBtn');
const stepAttachFgBtn = document.getElementById('stepAttachFgBtn');
const stepCreateDatasetBtn = document.getElementById('stepCreateDatasetBtn');
const stepHttpFlowBtn = document.getElementById('stepHttpFlowBtn');
const saveStreamBtn = document.getElementById('saveStreamBtn');
const fetchFlowFromAepBtn = document.getElementById('fetchFlowFromAepBtn');

/** Legacy key (pre per-sandbox); still read once to migrate into sandbox-specific keys. */
const STREAM_LS_KEY = 'aepDecisioningConsentStream_v1';

const SAMPLE_EMAIL = 'kirkham+media-1@adobetest.com';
const CONSENT_ONBOARDING_OVERLAY_ID = 'consentSetupOnboardingOverlay';
const CONSENT_ONBOARDING_DEFER_PREFIX = 'consentSetupOnboardingDefer_';

function consentOnboardingSandboxSlug() {
  const sb = String(getSandboxNameForApi() || '')
    .trim()
    .toLowerCase();
  return sb ? sb.replace(/[^a-z0-9._-]+/g, '_').slice(0, 120) : '_no_sandbox_';
}

function consentOnboardingDeferKey() {
  return CONSENT_ONBOARDING_DEFER_PREFIX + consentOnboardingSandboxSlug();
}

function consentOnboardingIsDeferred() {
  try {
    return sessionStorage.getItem(consentOnboardingDeferKey()) === '1';
  } catch {
    return false;
  }
}

function consentOnboardingSetDeferred() {
  try {
    sessionStorage.setItem(consentOnboardingDeferKey(), '1');
  } catch {
    /* ignore */
  }
}

function consentOnboardingClearDeferred() {
  try {
    sessionStorage.removeItem(consentOnboardingDeferKey());
  } catch {
    /* ignore */
  }
}

function consentOnboardingShouldForceFromQuery() {
  try {
    return /(?:^|[?&])consentOnboarding=1(?:&|$)/.test(window.location.search || '');
  } catch {
    return false;
  }
}

function consentOnboardingShouldClearDeferFromQuery() {
  try {
    return /(?:^|[?&])consentSetup=1(?:&|$)/.test(window.location.search || '');
  } catch {
    return false;
  }
}

function consentOnboardingIsLocallyConfigured() {
  const s = getStreamingPayload();
  return !!(s.url && s.flowId && s.datasetId && s.schemaId);
}

const CONSENT_ONBOARDING_STEPS = [
  {
    title: 'Welcome — Consent backend setup',
    body:
      '<p class="consent-onb-lead">This sandbox does not have a saved Consent Manager connection yet.</p>' +
      '<p class="consent-onb-p">Follow this guided flow once, then click <strong>Save connection (browser &amp; Firebase)</strong>. After that, this sandbox is ready for consent updates.</p>' +
      '<p class="consent-onb-hint">You can reopen this wizard anytime with <code>?consentOnboarding=1</code> in the URL.</p>',
    checks: [],
  },
  {
    title: 'Step 1 — Create schema in AEP',
    body:
      '<ol class="consent-onb-ol">' +
      '<li>Create a schema using <strong>XDM Individual Profile</strong>.</li>' +
      '<li>Attach field groups: <strong>Profile Core v2</strong>, <strong>Preference Details</strong>, <strong>Consent and Preference Details</strong>, <strong>Demographic Details</strong>.</li>' +
      '<li>Set primary identity to your tenant email path (namespace: <strong>Email</strong>).</li>' +
      '<li>Copy the schema <strong>$id</strong>.</li>' +
      '</ol>',
    checks: [{ id: 'consentOnbCheckSchema', label: 'I created/verified the schema and have the Schema $id.' }],
  },
  {
    title: 'Step 2 — Create dataset + HTTP API dataflow',
    body:
      '<ol class="consent-onb-ol">' +
      '<li>Create a dataset from that schema (enable Real-Time Profile if required).</li>' +
      '<li>Create an HTTP API streaming connection to that dataset.</li>' +
      '<li>Copy the <strong>Dataset ID</strong>, <strong>Flow ID</strong>, and <strong>Collection URL</strong>.</li>' +
      '</ol>',
    checks: [{ id: 'consentOnbCheckDataflow', label: 'I have Dataset ID, Flow ID, and Collection URL.' }],
  },
  {
    title: 'Step 3 — Fill the connection form',
    body:
      '<p class="consent-onb-p">Open the setup section and paste values into:</p>' +
      '<ul class="consent-onb-ul">' +
      '<li><strong>Schema $id</strong></li>' +
      '<li><strong>Dataset ID</strong></li>' +
      '<li><strong>Flow ID</strong></li>' +
      '<li><strong>Collection URL</strong></li>' +
      '</ul>' +
      '<p class="consent-onb-p"><button type="button" class="btn btn-secondary consent-onb-inline-btn" id="consentOnbOpenSetupBtn">Open setup section now</button></p>',
    checks: [{ id: 'consentOnbCheckFilled', label: 'I filled the connection fields for this sandbox.' }],
  },
  {
    title: 'Step 4 — Save to Firebase',
    body:
      '<p class="consent-onb-p">Click <strong>Save connection (browser &amp; Firebase)</strong> in the setup section. That stores this sandbox config so the page loads it automatically next time.</p>' +
      '<p class="consent-onb-status" id="consentOnbSaveHint" role="status" aria-live="polite"></p>',
    checks: [{ id: 'consentOnbCheckSave', label: 'I am ready to save the connection for this sandbox.' }],
  },
];

let consentOnboardingOverlayEl = null;
let consentOnboardingStepIndex = 0;

function consentOnboardingEl(id) {
  return document.getElementById(id);
}

function consentOnboardingStepChecksOk() {
  const step = CONSENT_ONBOARDING_STEPS[consentOnboardingStepIndex];
  if (!step || !Array.isArray(step.checks) || !step.checks.length) return true;
  return step.checks.every((c) => {
    const cb = consentOnboardingEl(c.id);
    return !!(cb && cb.checked);
  });
}

function openConsentSetupSection() {
  const details = document.querySelector('#stepInfra details.consent-streaming-details');
  if (details) details.open = true;
  const panel = document.getElementById('stepInfra');
  if (panel) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function ensureConsentOnboardingOverlay() {
  if (consentOnboardingOverlayEl) return consentOnboardingOverlayEl;
  const wrap = document.createElement('div');
  wrap.id = CONSENT_ONBOARDING_OVERLAY_ID;
  wrap.className = 'consent-onboarding-overlay';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'consentOnbTitle');
  wrap.hidden = true;
  wrap.innerHTML =
    '<div class="consent-onboarding-backdrop" data-consent-onb-backdrop></div>' +
    '<div class="consent-onboarding-card">' +
    '<div class="consent-onboarding-head">' +
    '<p class="consent-onboarding-kicker">Guided setup</p>' +
    '<h2 class="consent-onboarding-title" id="consentOnbTitle"></h2>' +
    '<p class="consent-onboarding-progress"><span id="consentOnbStepNum"></span> of ' +
    String(CONSENT_ONBOARDING_STEPS.length) +
    '</p>' +
    '</div>' +
    '<div class="consent-onboarding-body" id="consentOnbBody"></div>' +
    '<div class="consent-onboarding-foot">' +
    '<button type="button" class="btn btn-secondary" id="consentOnbBack">Back</button>' +
    '<div class="consent-onboarding-foot-right">' +
    '<button type="button" class="consent-onboarding-later" id="consentOnbLater">I\'ll configure this later</button>' +
    '<button type="button" class="btn btn-primary" id="consentOnbNext">Next</button>' +
    '</div>' +
    '</div>' +
    '</div>';
  document.body.appendChild(wrap);
  consentOnboardingOverlayEl = wrap;
  consentOnboardingEl('consentOnbBack')?.addEventListener('click', () => {
    if (consentOnboardingStepIndex <= 0) return;
    consentOnboardingStepIndex -= 1;
    renderConsentOnboardingStep();
  });
  consentOnboardingEl('consentOnbNext')?.addEventListener('click', () => {
    if (!consentOnboardingStepChecksOk()) return;
    if (consentOnboardingStepIndex < CONSENT_ONBOARDING_STEPS.length - 1) {
      consentOnboardingStepIndex += 1;
      renderConsentOnboardingStep();
      return;
    }
    openConsentSetupSection();
    if (consentOnboardingIsLocallyConfigured()) {
      consentOnboardingClearDeferred();
      hideConsentOnboarding();
    } else {
      const msg = consentOnboardingEl('consentOnbSaveHint');
      if (msg) {
        msg.textContent = 'Open the setup section, save the connection, then this wizard will close automatically.';
        msg.className = 'consent-onb-status consent-onb-status--warn';
      }
    }
  });
  consentOnboardingEl('consentOnbLater')?.addEventListener('click', () => {
    consentOnboardingSetDeferred();
    hideConsentOnboarding();
  });
  return consentOnboardingOverlayEl;
}

function renderConsentOnboardingStep() {
  ensureConsentOnboardingOverlay();
  const step = CONSENT_ONBOARDING_STEPS[consentOnboardingStepIndex];
  if (!step) return;
  const title = consentOnboardingEl('consentOnbTitle');
  const body = consentOnboardingEl('consentOnbBody');
  const stepNum = consentOnboardingEl('consentOnbStepNum');
  if (title) title.textContent = step.title;
  if (stepNum) stepNum.textContent = `Step ${consentOnboardingStepIndex + 1}`;
  const checksHtml = Array.isArray(step.checks)
    ? step.checks
        .map(
          (c) =>
            `<label class="consent-onb-check"><input type="checkbox" class="consent-onb-cb" id="${c.id}"><span>${c.label}</span></label>`,
        )
        .join('')
    : '';
  if (body) body.innerHTML = step.body + (checksHtml ? `<div class="consent-onb-checks">${checksHtml}</div>` : '');
  consentOnboardingEl('consentOnbOpenSetupBtn')?.addEventListener('click', openConsentSetupSection);
  const back = consentOnboardingEl('consentOnbBack');
  const next = consentOnboardingEl('consentOnbNext');
  if (back) back.hidden = consentOnboardingStepIndex === 0;
  if (next) {
    next.textContent =
      consentOnboardingStepIndex === CONSENT_ONBOARDING_STEPS.length - 1 ? 'Open setup section' : 'Next';
    next.disabled = !consentOnboardingStepChecksOk();
  }
  body?.querySelectorAll('.consent-onb-cb').forEach((cb) => {
    cb.addEventListener('change', () => {
      const n = consentOnboardingEl('consentOnbNext');
      if (n) n.disabled = !consentOnboardingStepChecksOk();
    });
  });
}

function showConsentOnboarding() {
  ensureConsentOnboardingOverlay();
  if (!consentOnboardingOverlayEl) return;
  document.body.classList.add('consent-onboarding-open');
  consentOnboardingOverlayEl.hidden = false;
  consentOnboardingOverlayEl.setAttribute('aria-hidden', 'false');
  consentOnboardingStepIndex = 0;
  renderConsentOnboardingStep();
}

function hideConsentOnboarding() {
  if (!consentOnboardingOverlayEl) return;
  consentOnboardingOverlayEl.hidden = true;
  consentOnboardingOverlayEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('consent-onboarding-open');
}

function syncConsentOnboardingAfterConnectionLoad(hasFirebaseConfig) {
  if (consentOnboardingShouldClearDeferFromQuery()) {
    consentOnboardingClearDeferred();
  }
  const force = consentOnboardingShouldForceFromQuery();
  if (force) {
    consentOnboardingClearDeferred();
    showConsentOnboarding();
    return;
  }
  if (hasFirebaseConfig || consentOnboardingIsLocallyConfigured()) {
    consentOnboardingClearDeferred();
    hideConsentOnboarding();
    return;
  }
  if (consentOnboardingIsDeferred()) {
    hideConsentOnboarding();
    return;
  }
  showConsentOnboarding();
}

function streamStorageKey() {
  const sb = getSandboxNameForApi().trim();
  return sb ? `${STREAM_LS_KEY}__${sb}` : STREAM_LS_KEY;
}

/** Clear HTTP API / dataset fields when switching sandbox or when Firestore has no doc for this sandbox. */
function clearStreamingFormFields(opts) {
  const skipSave = opts && opts.skipSave;
  const u = document.getElementById('streamUrl');
  const f = document.getElementById('streamFlowId');
  const n = document.getElementById('streamFlowName');
  const d = document.getElementById('streamDatasetId');
  const s = document.getElementById('streamSchemaId');
  const x = document.getElementById('streamXdmKey');
  if (u) u.value = '';
  if (f) f.value = '';
  if (n) n.value = '';
  if (d) d.value = '';
  if (s) s.value = '';
  if (x) x.value = '_demoemea';
  if (!skipSave) saveStreamFieldsToStorage();
}

function formatConsentProfileTimestamp(iso) {
  if (iso == null || iso === '') return '';
  const d =
    typeof iso === 'string' || typeof iso === 'number'
      ? new Date(iso)
      : iso instanceof Date
        ? iso
        : null;
  if (!d || Number.isNaN(d.getTime())) return String(iso);
  try {
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return d.toISOString();
  }
}

function clearStep1ProfileMetaFields() {
  const fn = document.getElementById('profileFirstName');
  const ln = document.getElementById('profileLastName');
  const lu = document.getElementById('profileLastUpdated');
  const src = document.getElementById('profileSource');
  if (fn) fn.value = '';
  if (ln) ln.value = '';
  if (lu) lu.value = '';
  if (src) src.value = '';
}

/**
 * Profile query results are sandbox-scoped. Clear cached streaming identity when the AEP sandbox changes
 * so you re-query before updating consent in the new sandbox.
 */
function resetConsentProfileCacheForSandboxChange() {
  consentStreamingEmail = '';
  consentOptionalEcid = '';
  if (profileResolvedEmailLine) profileResolvedEmailLine.hidden = true;
  clearStep1ProfileMetaFields();
  consentFingerprintBaseline = null;
  step1Message.hidden = true;
  step4Message.hidden = true;
  if (consentPreviewPanel) {
    consentPreviewPanel.hidden = true;
    if (consentPreviewPre) consentPreviewPre.textContent = '';
    if (consentPreviewNote) consentPreviewNote.textContent = '';
    setConsentPreviewMinimized(false);
  }
  refreshProfileStreamingIdentityNote();
}

function getSandboxParam() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
    return window.AepGlobalSandbox.getSandboxParam();
  }
  const val = sandboxSelect?.value?.trim();
  return val ? `&sandbox=${encodeURIComponent(val)}` : '';
}

async function loadConsentPageSandboxes() {
  if (!sandboxSelect || !window.AepGlobalSandbox) return;
  await window.AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
  window.AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
  window.AepGlobalSandbox.attachStorageSync(sandboxSelect);
}

function getSandboxNameForApi() {
  if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
    return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
  }
  return '';
}

function getStreamingPayload() {
  const urlEl = document.getElementById('streamUrl');
  const flowEl = document.getElementById('streamFlowId');
  const nameEl = document.getElementById('streamFlowName');
  const dsEl = document.getElementById('streamDatasetId');
  const schEl = document.getElementById('streamSchemaId');
  const xdmEl = document.getElementById('streamXdmKey');
  return {
    url: urlEl ? String(urlEl.value || '').trim() : '',
    flowId: flowEl ? String(flowEl.value || '').trim() : '',
    flowName: nameEl ? String(nameEl.value || '').trim() : '',
    datasetId: dsEl ? String(dsEl.value || '').trim() : '',
    schemaId: schEl ? String(schEl.value || '').trim() : '',
    xdmKey: xdmEl && String(xdmEl.value || '').trim() ? String(xdmEl.value || '').trim() : '_demoemea',
  };
}

function loadStreamFieldsFromStorage() {
  try {
    const key = streamStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const o = JSON.parse(raw);
    const u = document.getElementById('streamUrl');
    const f = document.getElementById('streamFlowId');
    const n = document.getElementById('streamFlowName');
    const d = document.getElementById('streamDatasetId');
    const s = document.getElementById('streamSchemaId');
    const x = document.getElementById('streamXdmKey');
    if (u && o.url) u.value = o.url;
    if (f && o.flowId) f.value = o.flowId;
    if (n && o.flowName) n.value = o.flowName;
    if (d && o.datasetId) d.value = o.datasetId;
    if (s && o.schemaId) s.value = o.schemaId;
    if (x && o.xdmKey) x.value = o.xdmKey;
  } catch {
    /* ignore */
  }
}

function saveStreamFieldsToStorage() {
  try {
    localStorage.setItem(streamStorageKey(), JSON.stringify(getStreamingPayload()));
  } catch {
    /* ignore */
  }
}

function showInfraMessage(text, type) {
  if (!infraStatusMessage) return;
  infraStatusMessage.textContent = text || '';
  infraStatusMessage.className = 'consent-message ' + (type || '');
  infraStatusMessage.hidden = !text;
  if (text && type === 'error') {
    const det = document.querySelector('#stepInfra details.consent-streaming-details');
    if (det) det.open = true;
  }
}

function consentInfraQuerySuffix() {
  const sb = getSandboxNameForApi();
  return sb ? `?sandbox=${encodeURIComponent(sb)}` : '';
}

/** Query Flow Service for DCS URL + flow id once the HTTP API dataflow exists (matches dataflow name, or uses Flow ID field if set). */
async function fetchConsentFlowFromAep() {
  if (!fetchFlowFromAepBtn) return;
  fetchFlowFromAepBtn.disabled = true;
  showInfraMessage('Looking up dataflow in Flow Service…', '');
  try {
    const params = new URLSearchParams();
    const sb = getSandboxNameForApi();
    if (sb) params.set('sandbox', sb);
    const flowField = document.getElementById('streamFlowId');
    const existingFlowId = flowField && String(flowField.value || '').trim();
    if (existingFlowId) params.set('flowId', existingFlowId);
    const nameField = document.getElementById('streamFlowName');
    const flowNameForLookup = nameField && String(nameField.value || '').trim();
    if (!existingFlowId && flowNameForLookup) params.set('flowName', flowNameForLookup);
    const qs = params.toString();
    const res = await fetch('/api/consent-infra/flow-lookup' + (qs ? `?${qs}` : ''));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      showInfraMessage(data.error || 'Flow lookup failed', 'error');
      return;
    }
    const u = document.getElementById('streamUrl');
    const f = document.getElementById('streamFlowId');
    const n = document.getElementById('streamFlowName');
    if (u && data.url) u.value = String(data.url);
    if (f && data.flowId) f.value = String(data.flowId);
    if (n && data.flowName) n.value = String(data.flowName);
    saveStreamFieldsToStorage();
    try {
      await pushConsentConnectionToFirestore();
    } catch (e) {
      console.warn('[consent-connection] flow-lookup sync:', e && e.message);
    }
    showInfraMessage(
      `Loaded collection URL and flow ID${data.flowName ? ` for “${data.flowName}”` : ''}.`,
      'success',
    );
  } catch (e) {
    showInfraMessage(e.message || 'Network error', 'error');
  } finally {
    fetchFlowFromAepBtn.disabled = false;
  }
}

/** Apply Firestore `streaming` (+ infra fallbacks) to the HTTP API form fields. */
function applyFirestoreRecordToStreamingForm(record) {
  if (!record || typeof record !== 'object') return;
  const s = record.streaming && typeof record.streaming === 'object' ? record.streaming : {};
  const inf = record.infra && typeof record.infra === 'object' ? record.infra : {};
  const u = document.getElementById('streamUrl');
  const f = document.getElementById('streamFlowId');
  const n = document.getElementById('streamFlowName');
  const d = document.getElementById('streamDatasetId');
  const sch = document.getElementById('streamSchemaId');
  const x = document.getElementById('streamXdmKey');
  const setIf = (el, v) => {
    if (!el || v == null || String(v).trim() === '') return;
    el.value = String(v).trim();
  };
  setIf(u, s.url);
  setIf(f, s.flowId);
  setIf(n, s.flowName);
  setIf(d, s.datasetId || inf.datasetId);
  setIf(sch, s.schemaId || inf.schemaId);
  setIf(x, s.xdmKey);
}

async function pullConsentConnectionFromFirestore() {
  try {
    const res = await fetch('/api/consent-connection' + consentInfraQuerySuffix());
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return false;
    }
    if (data.record) {
      applyFirestoreRecordToStreamingForm(data.record);
      saveStreamFieldsToStorage();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Merge-save streaming form + optional infra metadata for the current sandbox.
 * @param {Record<string, string>} [extraInfra]
 */
async function pushConsentConnectionToFirestore(extraInfra) {
  const streaming = getStreamingPayload();
  const res = await fetch('/api/consent-connection' + consentInfraQuerySuffix(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sandbox: getSandboxNameForApi() || undefined,
      streaming,
      infra: extraInfra && typeof extraInfra === 'object' ? extraInfra : undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'Firebase save failed');
  }
  return true;
}

function attachConsentFirestoreSandboxSync() {
  const el = document.getElementById('sandboxSelect');
  if (!el || el.dataset.consentFirestoreSync === '1') return;
  el.dataset.consentFirestoreSync = '1';
  const run = async () => {
    resetConsentProfileCacheForSandboxChange();
    clearStreamingFormFields({ skipSave: true });
    showInfraMessage('Loading streaming connection for this sandbox…', '');
    const found = await pullConsentConnectionFromFirestore();
    if (found) {
      showInfraMessage('Streaming connection loaded from Firebase for this sandbox.', 'success');
      syncConsentOnboardingAfterConnectionLoad(true);
    } else {
      showInfraMessage(
        'No streaming connection saved for this sandbox. Create the schema, dataset and HTTP API dataflow in AEP, then enter the details below and click Save connection.',
        'error',
      );
      const det = document.querySelector('#stepInfra details.consent-streaming-details');
      if (det) det.open = true;
      syncConsentOnboardingAfterConnectionLoad(false);
    }
  };
  el.addEventListener('change', run);
  window.addEventListener('aep-global-sandbox-change', run);
}

async function checkConsentInfra() {
  if (!checkInfraBtn) return;
  checkInfraBtn.disabled = true;
  showInfraMessage('Checking…', '');
  try {
    const res = await fetch('/api/consent-infra/status' + consentInfraQuerySuffix());
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showInfraMessage(data.error || 'Status request failed', 'error');
      return;
    }
    if (data.ok === false) {
      showInfraMessage(data.error || 'Status check failed (see server logs for [consentInfra]).', 'error');
      return;
    }
    const ps = data.prepSteps || {};
    const parts = [
      data.schemaInProfileUnion
        ? 'Schema is in Real-Time Customer Profile union (not suitable for this lab).'
        : data.ready
          ? 'Ready for streaming (after URL + Flow ID set).'
          : 'Not fully ready.',
      `Profile Core v2 mixin: ${data.profileCoreMixinFound ? 'yes' : 'no'}`,
      `Consent schema: ${data.schemaFound ? 'yes' : 'no'}`,
      `Schema Profile union: ${data.schemaInProfileUnion ? 'yes (stop — irreversible)' : 'no'}`,
      `Primary email descriptor: ${data.primaryEmailDescriptor ? 'yes' : 'no'}`,
      `Dataset: ${data.datasetFound ? 'yes' : 'no'}`,
      `Wizard: 1 schema ${ps.step1_schemaShell ? '✓' : '—'} · 2 field groups+ID ${ps.step2_fieldGroupsIdentity ? '✓' : '—'} · 3 dataset ${ps.step3_dataset ? '✓' : '—'} · 4 HTTP ${ps.step4_readyForManualHttpFlow ? 'ready' : '—'}`,
    ];
    if (Array.isArray(data.warnings) && data.warnings.length) {
      parts.push(String(data.warnings[0]));
    }
    const msgType = data.schemaInProfileUnion ? 'error' : data.ready ? 'success' : '';
    showInfraMessage(parts.join(' · '), msgType);
    try {
      const infra = {};
      if (data.schemaId) infra.schemaId = data.schemaId;
      if (data.schemaMetaAltId) infra.schemaMetaAltId = data.schemaMetaAltId;
      if (data.datasetId) infra.datasetId = data.datasetId;
      if (data.profileCoreMixinId) infra.profileCoreMixinId = data.profileCoreMixinId;
      if (Object.keys(infra).length) await pushConsentConnectionToFirestore(infra);
    } catch (e) {
      console.warn('[consent-connection] status sync:', e && e.message);
    }
  } catch (e) {
    showInfraMessage(e.message || 'Network error', 'error');
  } finally {
    checkInfraBtn.disabled = false;
  }
}

function applyConsentStepResultToStreamFields(data) {
  if (!data || typeof data !== 'object') return;
  const d = document.getElementById('streamDatasetId');
  const s = document.getElementById('streamSchemaId');
  const x = document.getElementById('streamXdmKey');
  if (d && data.datasetId) d.value = String(data.datasetId);
  if (s && data.schemaId) s.value = String(data.schemaId);
  if (x && data.xdmKey) x.value = String(data.xdmKey);
  if (data.datasetId || data.schemaId || data.xdmKey) saveStreamFieldsToStorage();
}

/**
 * @param {string} step - createSchema | attachFieldGroups | createDataset | httpFlow
 * @param {HTMLButtonElement | null} btn
 */
async function runConsentInfraWizardStep(step, btn) {
  const labels = {
    createSchema: 'Creating schema…',
    attachFieldGroups: 'Attaching field groups…',
    createDataset: 'Creating dataset…',
    httpFlow: 'Loading HTTP flow instructions…',
  };
  const busy = [stepCreateSchemaBtn, stepAttachFgBtn, stepCreateDatasetBtn, stepHttpFlowBtn].filter(Boolean);
  busy.forEach((b) => {
    b.disabled = true;
  });
  showInfraMessage(labels[step] || 'Working…', '');
  try {
    const res = await fetch('/api/consent-infra/step' + consentInfraQuerySuffix(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showInfraMessage(data.error || 'Step request failed', 'error');
      return;
    }
    if (data.ok === false) {
      showInfraMessage(
        data.error ||
          (data.profileCoreMixinMissing
            ? 'Import “Profile Core v2” in this sandbox first, then run step 2 again.'
            : 'Step failed.'),
        'error',
      );
      return;
    }
    applyConsentStepResultToStreamFields(data);
    try {
      const infra = {};
      if (data.schemaId) infra.schemaId = data.schemaId;
      if (data.schemaMetaAltId) infra.schemaMetaAltId = data.schemaMetaAltId;
      if (data.datasetId) infra.datasetId = data.datasetId;
      if (data.profileCoreMixinId) infra.profileCoreMixinId = data.profileCoreMixinId;
      await pushConsentConnectionToFirestore(Object.keys(infra).length ? infra : undefined);
    } catch (e) {
      console.warn('[consent-connection] step sync:', e && e.message);
    }
    const msg =
      data.message ||
      (data.manual && Array.isArray(data.nextSteps)
        ? data.nextSteps.join(' ')
        : 'Step completed.');
    const badUnion = !!data.schemaInProfileUnion;
    showInfraMessage(msg, badUnion ? 'error' : 'success');
    if (Array.isArray(data.nextSteps) && data.nextSteps.length) {
      console.info('[consent-infra] Next steps:', data.nextSteps.join('\n'));
    }
  } catch (e) {
    showInfraMessage(e.message || 'Network error', 'error');
  } finally {
    busy.forEach((b) => {
      b.disabled = false;
    });
  }
}

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

function refreshProfileStreamingIdentityNote() {
  const el = document.getElementById('profileStreamingIdentityNote');
  if (!el) return;
  if (!consentStreamingEmail) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('consent-streaming-identity-hint--warn');
    return;
  }
  el.hidden = false;
  el.classList.remove('consent-streaming-identity-hint--warn');
  if (consentOptionalEcid && consentOptionalEcid.length >= 10) {
    el.textContent = 'ECID is present on the profile (optional).';
  } else {
    el.textContent = 'No ECID on this profile.';
  }
}

function clearForm() {
  customerEmail.value = '';
  consentStreamingEmail = '';
  consentOptionalEcid = '';
  if (profileResolvedEmailLine) profileResolvedEmailLine.hidden = true;
  if (identityNamespace) identityNamespace.value = 'email';
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
  if (preferredLanguageSelect) preferredLanguageSelect.value = 'en-US';
  clearStep1ProfileMetaFields();
  consentFingerprintBaseline = null;
  step4Message.hidden = true;
  refreshProfileStreamingIdentityNote();
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
  consentStreamingEmail = data.email ? String(data.email).trim() : '';
  const rawEcid = data.ecid != null ? String(data.ecid).trim() : '';
  consentOptionalEcid = rawEcid.length >= 10 ? rawEcid : '';
  if (profileResolvedEmailDisplay && profileResolvedEmailLine) {
    if (consentStreamingEmail) {
      profileResolvedEmailDisplay.textContent = consentStreamingEmail;
      profileResolvedEmailLine.hidden = false;
    } else {
      profileResolvedEmailLine.hidden = true;
    }
  }

  if (preferredChannelSelect) {
    preferredChannelSelect.value = mapPreferredToSelect(data.preferredMarketingChannel ?? data.preferred);
  }
  if (preferredLanguageSelect && data.preferredLanguage) {
    const want = String(data.preferredLanguage).trim();
    preferredLanguageSelect.value = [...preferredLanguageSelect.options].some((o) => o.value === want)
      ? want
      : 'en-US';
  }

  const pfn = document.getElementById('profileFirstName');
  const pln = document.getElementById('profileLastName');
  const plu = document.getElementById('profileLastUpdated');
  const psrc = document.getElementById('profileSource');
  if (pfn) pfn.value = data.firstName != null ? String(data.firstName) : '';
  if (pln) pln.value = data.lastName != null ? String(data.lastName) : '';
  if (plu) plu.value = formatConsentProfileTimestamp(data.lastModifiedAt);
  if (psrc) psrc.value = data.profileSource != null ? String(data.profileSource) : '';

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
  refreshProfileStreamingIdentityNote();
}

function consentStateFingerprint() {
  const ch = buildChannelsFromForm();
  const pfn = document.getElementById('profileFirstName');
  const pln = document.getElementById('profileLastName');
  return JSON.stringify({
    radios: RADIO_CONSENT_NAMES.map((n) => [n, getTri(n)]),
    preferred: preferredChannelSelect ? preferredChannelSelect.value : 'email',
    preferredLanguage: preferredLanguageSelect ? preferredLanguageSelect.value : 'en-US',
    profileFirstName: pfn ? String(pfn.value || '').trim() : '',
    profileLastName: pln ? String(pln.value || '').trim() : '',
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
  const preferredLanguage = preferredLanguageSelect ? preferredLanguageSelect.value : 'en-US';
  const toYorN = (v) => (v === 'y' ? 'y' : 'n');

  const chReason = 'Profile streaming default';
  const marketingChannelPaths = [
    'email',
    'sms',
    'push',
    'call',
    'whatsApp',
    'fax',
    'postalMail',
    'commercialEmail',
  ];
  const updates = [
    { path: 'consents.marketing.val', value: val },
    { path: 'consents.marketing.any.val', value: val },
    { path: 'consents.marketing.any.reason', value: chReason },
    { path: 'consents.marketing.any.time', value: marketingNow },
    { path: 'consents.marketing.preferred', value: preferred },
    { path: 'consents.marketing.preferredLanguage', value: preferredLanguage },
  ];
  const pfn = document.getElementById('profileFirstName');
  const pln = document.getElementById('profileLastName');
  const pFirst = pfn ? String(pfn.value || '').trim() : '';
  const pLast = pln ? String(pln.value || '').trim() : '';
  const pFull = [pFirst, pLast].filter(Boolean).join(' ').trim();
  updates.push(
    { path: 'person.name.firstName', value: pFirst },
    { path: 'person.name.lastName', value: pLast },
    { path: 'person.name.fullName', value: pFull },
  );
  for (const p of marketingChannelPaths) {
    updates.push(
      { path: `consents.marketing.${p}.val`, value: channelYn },
      { path: `consents.marketing.${p}.reason`, value: chReason },
      { path: `consents.marketing.${p}.time`, value: marketingNow },
    );
  }
  if (dc === 'y' || dc === 'n') updates.push({ path: 'consents.collect.val', value: toYorN(dc) });
  if (ds === 'y' || ds === 'n') updates.push({ path: 'consents.share.val', value: toYorN(ds) });
  if (cp === 'y' || cp === 'n') updates.push({ path: 'consents.personalize.content.val', value: toYorN(cp) });
  for (const key of Object.keys(channels)) {
    updates.push({ path: `optInOut._channels.${key}`, value: channels[key] });
  }
  return updates;
}

/**
 * Build the full DCS payload client-side — exact replica of the old Firebase consent-manager.html buildConsentPayload().
 * The server just adds auth headers and forwards this to DCS.
 */
function buildConsentPayload() {
  const email = consentStreamingEmail || String(customerEmail.value || '').trim();
  const pfn = document.getElementById('profileFirstName');
  const pln = document.getElementById('profileLastName');
  const firstName = pfn ? String(pfn.value || '').trim() : '';
  const lastName = pln ? String(pln.value || '').trim() : '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  const streaming = getStreamingPayload();
  const schemaId = streaming.schemaId || '';
  const datasetId = streaming.datasetId || '';
  const xdmKey = streaming.xdmKey || '_demoemea';
  const sourceName = streaming.flowName || 'Consent Manager - Profile Update';

  const preferredChannel = preferredChannelSelect ? preferredChannelSelect.value : 'email';
  const preferredLanguage = preferredLanguageSelect ? preferredLanguageSelect.value : 'en-US';
  const currentTime = new Date().toISOString();

  function triVal(name) { return getTri(name) === 'y' ? 'y' : 'n'; }
  function triReason(name) { return getTri(name) === 'y' ? {} : { reason: 'User preference' }; }

  const payload = {
    header: {
      schemaRef: {
        id: schemaId,
        contentType: 'application/vnd.adobe.xed-full+json;version=1.0',
      },
      imsOrgId: '',
      datasetId: datasetId,
      source: { name: sourceName },
    },
    body: {
      xdmMeta: {
        schemaRef: {
          id: schemaId,
          contentType: 'application/vnd.adobe.xed-full+json;version=1.0',
        },
      },
      xdmEntity: {
        [xdmKey]: {
          identification: {
            core: {
              email: email,
            },
          },
        },
        _id: crypto.randomUUID(),
        _repo: {
          createDate: currentTime,
          modifyDate: currentTime,
        },
        preferredLanguage: preferredLanguage,
        consents: {
          collect: {
            val: triVal('dataCollection'),
          },
          idSpecific: {
            Email: {
              [email]: {
                marketing: {
                  email: {
                    ...triReason('emailSpecific'),
                    time: currentTime,
                    val: triVal('emailSpecific'),
                  },
                },
              },
            },
          },
          marketing: {
            any: {
              ...triReason('marketingAny'),
              time: currentTime,
              val: triVal('marketingAny'),
            },
            call: {
              ...triReason('phoneMarketing'),
              time: currentTime,
              val: triVal('phoneMarketing'),
            },
            email: {
              ...triReason('emailGeneric'),
              time: currentTime,
              val: triVal('emailGeneric'),
            },
            postalMail: {
              ...triReason('postalMarketing'),
              time: currentTime,
              val: triVal('postalMarketing'),
            },
            preferred: preferredChannel,
            push: {
              ...triReason('pushMarketing'),
              time: currentTime,
              val: triVal('pushMarketing'),
            },
            sms: {
              ...triReason('smsMarketing'),
              time: currentTime,
              val: triVal('smsMarketing'),
            },
            whatsApp: {
              ...triReason('whatsappMarketing'),
              time: currentTime,
              val: triVal('whatsappMarketing'),
            },
            preferredLanguage: preferredLanguage,
          },
          personalize: {
            content: {
              val: triVal('contentPersonalization'),
            },
          },
          share: {
            val: triVal('dataSharing'),
          },
        },
        person: {
          name: {
            firstName: firstName,
            lastName: lastName,
            fullName: fullName,
          },
        },
        personID: email,
        metadata: {
          time: currentTime,
        },
      },
    },
  };
  return payload;
}

/** POST /api/consent/legacy-update — sends the client-built payload; server just adds auth + forwards to DCS. */
async function postLegacyConsentUpdate({ payload, collectionUrl, flowId, sandbox, dryRun }) {
  const body = { payload, collectionUrl, flowId, dryRun };
  if (sandbox) {
    body.sandbox = sandbox;
  } else if (typeof getSandboxNameForApi === 'function') {
    const sn = getSandboxNameForApi();
    if (sn) body.sandbox = sn;
  }
  const res = await fetch('/api/consent/legacy-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, res, data };
}

async function queryProfile() {
  const identifier = (customerEmail.value || '').trim();
  if (!identifier) {
    showMessage(step1Message, 'Enter an identifier value that matches the selected namespace.', 'error');
    return;
  }
  const ns = identityNamespace && identityNamespace.value ? identityNamespace.value : 'email';
  queryProfileBtn.disabled = true;
  showMessage(step1Message, 'Querying AEP for profile…', '');
  try {
    const p = new URLSearchParams();
    p.set('identifier', identifier);
    p.set('namespace', ns);
    if (ns === 'email') p.set('email', identifier);
    const res = await fetch('/api/profile/consent?' + p.toString() + getSandboxParam());
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
      consentStreamingEmail = '';
      consentOptionalEcid = '';
      if (profileResolvedEmailLine) profileResolvedEmailLine.hidden = true;
      clearStep1ProfileMetaFields();
      refreshProfileStreamingIdentityNote();
      showMessage(step1Message, 'No profile found for this identifier in Adobe Experience Platform.', 'error');
      return;
    }
    if (typeof addRecentIdentifier === 'function') addRecentIdentifier(identifier, ns);
    if (typeof addEmail === 'function' && data.email) addEmail(data.email);
    applyProfileToForm(data);
    const displayName = data.email || identifier;
    showMessage(step1Message, 'Profile loaded successfully for ' + displayName + '.', 'success');
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
  const email = consentStreamingEmail || (customerEmail.value || '').trim();
  if (!email) {
    showMessage(
      step4Message,
      'Query a profile first (Step 1). Consent streaming requires the profile’s email as primary identity.',
      'error',
    );
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
  const streaming = getStreamingPayload();
  if (!streaming.url || !streaming.flowId) {
    showMessage(
      step4Message,
      'Open “Sandbox & streaming connection” (above), add the HTTP API collection URL and Flow ID, click “Save connection (browser & Firebase)”, then try again.',
      'error',
    );
    return;
  }

  updateConsentBtn.disabled = true;
  showMessage(step4Message, 'Updating…', '');
  try {
    const payload = buildConsentPayload();
    const { ok, data } = await postLegacyConsentUpdate({
      payload,
      collectionUrl: streaming.url,
      flowId: streaming.flowId,
      sandbox: getSandboxNameForApi() || undefined,
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

function consentPreviewMetaRefresh() {
  if (!consentPreviewMeta || !consentPreviewPre) return;
  const json = consentPreviewPre.textContent || '';
  if (!json.trim()) {
    consentPreviewMeta.textContent = '';
    return;
  }
  let bytes = json.length;
  try {
    bytes = new TextEncoder().encode(json).length;
  } catch {
    /* ignore */
  }
  const sz = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
  consentPreviewMeta.textContent = `${sz} · expand for full JSON`;
}

function setConsentPreviewMinimized(min) {
  if (!consentPreviewPanel) return;
  consentPreviewPanel.classList.toggle('consent-preview-panel--minimized', min);
  if (consentPreviewHeader) consentPreviewHeader.setAttribute('aria-expanded', String(!min));
  if (consentPreviewMinimizeBtn) {
    consentPreviewMinimizeBtn.textContent = min ? 'Expand' : 'Minimize';
    consentPreviewMinimizeBtn.title = min ? 'Expand payload preview' : 'Collapse payload preview';
  }
  if (consentPreviewTitle) {
    consentPreviewTitle.textContent = min ? 'DCS payload preview (collapsed)' : 'DCS payload preview';
  }
  if (consentPreviewMeta) {
    consentPreviewMeta.setAttribute('aria-hidden', min ? 'false' : 'true');
    if (min) consentPreviewMetaRefresh();
    else consentPreviewMeta.textContent = '';
  }
}

function toggleConsentPreviewPanel() {
  if (!consentPreviewPanel || consentPreviewPanel.hidden) return;
  setConsentPreviewMinimized(!consentPreviewPanel.classList.contains('consent-preview-panel--minimized'));
}

/** Preview — builds the DCS payload client-side (no server round-trip needed). */
async function previewData() {
  const email = consentStreamingEmail || (customerEmail.value || '').trim();
  if (!email) {
    showMessage(step4Message, 'Load a profile first (Step 1) so the streaming email is known.', 'error');
    return;
  }
  const streaming = getStreamingPayload();
  if (!streaming.datasetId || !streaming.schemaId) {
    showMessage(
      step4Message,
      'Add Dataset ID and Schema $id under Sandbox & streaming connection, then save — preview needs the DCS envelope header.',
      'error',
    );
    return;
  }
  try {
    const payload = buildConsentPayload();
    if (consentPreviewPanel && consentPreviewNote && consentPreviewPre) {
      consentPreviewPanel.hidden = false;
      setConsentPreviewMinimized(false);
      consentPreviewNote.textContent =
        'Client-built DCS payload — same shape as old Firebase consent-manager. This is exactly what will be sent to DCS.';
      consentPreviewPre.textContent = JSON.stringify(payload, null, 2);
    }
    showMessage(step4Message, 'Payload preview loaded below — use Minimize or the header to collapse.', 'success');
  } catch (err) {
    showMessage(step4Message, err.message || 'Preview failed', 'error');
  }
}

loadConsentPageSandboxes()
  .then(() => {
    attachConsentFirestoreSandboxSync();
    return pullConsentConnectionFromFirestore().then((found) => {
      syncConsentOnboardingAfterConnectionLoad(!!found);
      return found;
    });
  })
  .catch(() => {
    attachConsentFirestoreSandboxSync();
    loadStreamFieldsFromStorage();
    pullConsentConnectionFromFirestore()
      .then((found) => {
        syncConsentOnboardingAfterConnectionLoad(!!found);
      })
      .catch(() => {
        syncConsentOnboardingAfterConnectionLoad(false);
      });
  });

checkInfraBtn && checkInfraBtn.addEventListener('click', checkConsentInfra);
stepCreateSchemaBtn &&
  stepCreateSchemaBtn.addEventListener('click', () => runConsentInfraWizardStep('createSchema', stepCreateSchemaBtn));
stepAttachFgBtn &&
  stepAttachFgBtn.addEventListener('click', () => runConsentInfraWizardStep('attachFieldGroups', stepAttachFgBtn));
stepCreateDatasetBtn &&
  stepCreateDatasetBtn.addEventListener('click', () => runConsentInfraWizardStep('createDataset', stepCreateDatasetBtn));
stepHttpFlowBtn &&
  stepHttpFlowBtn.addEventListener('click', () => runConsentInfraWizardStep('httpFlow', stepHttpFlowBtn));
fetchFlowFromAepBtn && fetchFlowFromAepBtn.addEventListener('click', fetchConsentFlowFromAep);
const loadFromFirebaseBtn = document.getElementById('loadFromFirebaseBtn');
loadFromFirebaseBtn &&
  loadFromFirebaseBtn.addEventListener('click', async () => {
    loadFromFirebaseBtn.disabled = true;
    clearStreamingFormFields({ skipSave: true });
    showInfraMessage('Loading streaming connection from Firebase…', '');
    try {
      const found = await pullConsentConnectionFromFirestore();
      if (found) {
        showInfraMessage('Streaming connection loaded from Firebase for this sandbox.', 'success');
        syncConsentOnboardingAfterConnectionLoad(true);
      } else {
        showInfraMessage(
          'No streaming connection found in Firebase for this sandbox. Create the required AEP resources first, then enter the details and Save connection.',
          'error',
        );
        syncConsentOnboardingAfterConnectionLoad(false);
      }
    } catch {
      showInfraMessage('Failed to load from Firebase.', 'error');
      syncConsentOnboardingAfterConnectionLoad(false);
    } finally {
      loadFromFirebaseBtn.disabled = false;
    }
  });
saveStreamBtn &&
  saveStreamBtn.addEventListener('click', async () => {
    saveStreamFieldsToStorage();
    try {
      await pushConsentConnectionToFirestore();
      showInfraMessage('Saved streaming connection to this browser and Firebase (per sandbox).', 'success');
      consentOnboardingClearDeferred();
      hideConsentOnboarding();
    } catch (e) {
      showInfraMessage(
        (e && e.message) || 'Saved locally only — Firebase save failed (enable Firestore and deploy rules).',
        'error',
      );
    }
  });

queryProfileBtn.addEventListener('click', queryProfile);
clearFormBtn.addEventListener('click', clearForm);
sampleDataBtn.addEventListener('click', () => {
  if (identityNamespace) identityNamespace.value = 'email';
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

if (consentPreviewHeader) {
  consentPreviewHeader.addEventListener('click', (e) => {
    if (e.target.closest('#consentPreviewMinimizeBtn')) return;
    toggleConsentPreviewPanel();
  });
  consentPreviewHeader.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('#consentPreviewMinimizeBtn')) return;
    e.preventDefault();
    toggleConsentPreviewPanel();
  });
}
if (consentPreviewMinimizeBtn) {
  consentPreviewMinimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleConsentPreviewPanel();
  });
}
