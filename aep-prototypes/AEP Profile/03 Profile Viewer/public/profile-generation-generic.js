/**
 * Profile Generation — generic (industry-less) section.
 *
 * Handles:
 *  - Sandbox-portable setup wizard (4 steps): Create schema → Attach field groups → Create dataset → HTTP flow instructions.
 *  - Per-sandbox saved DCS HTTP API connection (URL, Flow ID, Dataset ID, Schema $id) via Firestore.
 *  - Customer Analytics editor (churn, propensity, NPS, AOV, preferred marketing channel → consents.marketing.preferred, gender, loyalty tier+points, language).
 *  - Plain-email-to-pattern scaler `<local>+DDMMYYYY-N@<domain>` with daily counter per (sandbox, base email).
 *  - Find existing profile by scaled email (`/api/profile/table`).
 *  - Update / generate-N profiles via the existing Adobe Profile Updater (`/api/profile/update`).
 *  - Generate rolls a fresh random persona (name, gender, analytics, channel, language; loyalty when enabled) per profile.
 *
 * Sandbox is read from the global `AepGlobalSandbox` so the section follows the page's sandbox switcher.
 */

(function () {
  'use strict';

  // ---------- DOM lookups ----------
  const sandboxSelect = document.getElementById('sandboxSelect');

  // Setup wizard
  const checkInfraBtn = document.getElementById('genCheckInfraBtn');
  const stepCreateSchemaBtn = document.getElementById('genStepCreateSchemaBtn');
  const stepAttachFgBtn = document.getElementById('genStepAttachFgBtn');
  const stepCreateDatasetBtn = document.getElementById('genStepCreateDatasetBtn');
  const stepHttpFlowBtn = document.getElementById('genStepHttpFlowBtn');
  const infraStatusMessage = document.getElementById('genInfraStatusMessage');
  // Collapsible <details> wrapping the wizard. We capture the original hint
  // copy at module load so applyConfiguredCollapseState() can restore it
  // when the user re-opens / clears fields.
  const infraDetailsEl = document.getElementById('genericProfileInfraDetails');
  const infraHintEl = document.getElementById('genericProfileInfraHint');
  const ORIGINAL_INFRA_HINT = infraHintEl ? infraHintEl.textContent.trim() : '';

  // Streaming connection fields
  const streamSchemaIdEl = document.getElementById('genStreamSchemaId');
  const streamDatasetIdEl = document.getElementById('genStreamDatasetId');
  const streamXdmKeyEl = document.getElementById('genStreamXdmKey');
  const streamFlowIdEl = document.getElementById('genStreamFlowId');
  const streamFlowNameEl = document.getElementById('genStreamFlowName');
  const streamUrlEl = document.getElementById('genStreamUrl');
  const loadFromFirebaseBtn = document.getElementById('genLoadFromFirebaseBtn');
  const fetchFlowFromAepBtn = document.getElementById('genFetchFlowFromAepBtn');
  const saveStreamBtn = document.getElementById('genSaveStreamBtn');

  // Profile lookup (any identity namespace) — mirrors the standard widget on index.html.
  // The namespace <select> is wired to AepIdentityPicker (shared aepIdentityNamespace
  // localStorage key, kept in sync across every lookup page in the lab) and the
  // identifier <input> gets per-namespace autocomplete via attachEmailDatalist
  // (shared 'aep-profile-viewer-recent-identifiers-v1' cache, populated by every
  // successful lookup on consent.html, index.html, event-tool, live-activities, etc).
  const lookupNsEl = document.getElementById('genLookupNs');
  const lookupIdentifierEl = document.getElementById('genLookupIdentifier');
  const lookupBtn = document.getElementById('genLookupBtn');
  if (typeof window.AepIdentityPicker !== 'undefined' && typeof window.AepIdentityPicker.init === 'function') {
    window.AepIdentityPicker.init('genLookupIdentifier', 'genLookupNs');
  }
  if (typeof window.attachEmailDatalist === 'function') {
    // Page-local datalist id avoids collision with the global 'recentEmails'
    // datalist that consent.html and others create — same shared cache, separate
    // <datalist> element so the input's `list=` attribute resolves cleanly.
    window.attachEmailDatalist('genLookupIdentifier', 'genLookupRecent', 'genLookupNs');
  }

  // Base email + counter + actions ("Generate from your base email" sub-block)
  const baseEmailEl = document.getElementById('genBaseEmail');
  const counterEl = document.getElementById('genCounter');
  const generateCountEl = document.getElementById('genGenerateCount');
  const emailPreviewEl = document.getElementById('genEmailPreview');
  const resetCounterBtn = document.getElementById('genResetCounterBtn');
  const updateProfileBtn = document.getElementById('genUpdateProfileBtn');
  const generateBtn = document.getElementById('genGenerateBtn');
  const dryRunEl = document.getElementById('genDryRun');
  const messageEl = document.getElementById('genericProfileMessage');

  // Set-and-forget base email persistence (global, all sandboxes — one device, one user).
  const BASE_EMAIL_STORAGE_KEY = 'genericProfileBaseEmail';

  // Identity (added when Generic became an industry option — basic profile fields)
  const firstNameEl = document.getElementById('genFirstName');
  const lastNameEl = document.getElementById('genLastName');

  // Customer Analytics
  const churnEl = document.getElementById('genChurn');
  const churnValueEl = document.getElementById('genChurnValue');
  const propensityEl = document.getElementById('genPropensity');
  const propensityValueEl = document.getElementById('genPropensityValue');
  const npsEl = document.getElementById('genNps');
  const aovEl = document.getElementById('genAov');
  const aovValueEl = document.getElementById('genAovValue');
  const preferredChannelEl = document.getElementById('genPreferredChannel');
  const genderEl = document.getElementById('genGender');
  // Loyalty subgroup (now toggle-gated — see genLoyaltyEnabled)
  const loyaltyEnabledEl = document.getElementById('genLoyaltyEnabled');
  const loyaltyFieldsEl = document.getElementById('genLoyaltyFields');
  const loyaltyIDEl = document.getElementById('genLoyaltyID');
  const loyaltyTierEl = document.getElementById('genLoyaltyTier');
  const loyaltyPointsEl = document.getElementById('genLoyaltyPoints');
  const loyaltyRandomBtn = document.getElementById('genLoyaltyRandomBtn');
  const languageEl = document.getElementById('genLanguage');
  // Recently-generated picker (per sandbox + base email + day)
  const recentPickerEl = document.getElementById('genRecentPicker');
  const recentSelectEl = document.getElementById('genRecentSelect');
  const recentLoadBtn = document.getElementById('genRecentLoadBtn');
  const recentDetailsEl = document.getElementById('genRecentDetails');
  const recentListBodyEl = document.getElementById('genRecentListBody');
  const recentCountLabelEl = document.getElementById('genRecentCountLabel');

  // Debug
  const debugEl = document.getElementById('genericProfileDebug');
  const debugClientReqEl = document.getElementById('genDebugClientRequest');
  const debugStatusEl = document.getElementById('genDebugStatus');
  const debugResponseEl = document.getElementById('genDebugResponse');

  // Bail out if the section isn't on the page (defensive — same JS file is shared).
  if (!baseEmailEl || !counterEl || !emailPreviewEl) return;

  // ---------- Helpers ----------
  function setMessage(el, text, type) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'consent-message' + (type ? ' ' + type : '') + ' consent-message--below-btn';
    el.hidden = !text;
  }

  function showInfraMessage(text, type) {
    if (!infraStatusMessage) return;
    infraStatusMessage.textContent = text || '';
    infraStatusMessage.className = 'consent-message' + (type ? ' ' + type : '');
    infraStatusMessage.hidden = !text;
    if (text && type === 'error') {
      const det = document.getElementById('genericProfileInfraDetails');
      if (det) det.open = true;
    }
  }

  /**
   * True when the four required streaming fields (Schema $id, Dataset ID,
   * Flow ID, Collection URL) are all filled. We treat that as "fully
   * configured" — the operator has either completed the wizard or pasted
   * a saved connection from Firebase.
   */
  function streamingFieldsAreFullyConfigured() {
    const s = getStreamingPayload();
    return !!(s && s.url && s.flowId && s.datasetId && s.schemaId);
  }

  /**
   * Collapse the wizard <details> when fully configured (and swap the hint
   * for a green "Configured" message); expand it again when the
   * configuration becomes incomplete. Called from:
   *   - loadConnectionFromFirestore() after a successful Firebase load.
   *   - saveConnectionToFirestore() after a successful save.
   *   - onSandboxChange() so switching sandboxes re-evaluates state.
   *   - The "aep-generic-panel-shown" handler so the first reveal of the
   *     Generic editor reflects the current state correctly.
   * `showInfraMessage('…', 'error')` still force-opens the <details>
   * regardless, so error states stay visible.
   */
  function applyConfiguredCollapseState() {
    if (!infraDetailsEl) return;
    const ready = streamingFieldsAreFullyConfigured();
    if (ready) {
      infraDetailsEl.open = false;
      if (infraHintEl) {
        const sb = getSandboxName();
        infraHintEl.textContent = sb
          ? `✓ Configured for sandbox "${sb}" — click to expand if you want to reconfigure.`
          : '✓ Configured — click to expand if you want to reconfigure.';
        infraHintEl.classList.add('consent-streaming-details__hint--configured');
      }
    } else {
      infraDetailsEl.open = true;
      if (infraHintEl) {
        infraHintEl.textContent = ORIGINAL_INFRA_HINT;
        infraHintEl.classList.remove('consent-streaming-details__hint--configured');
      }
    }
  }

  function getSandboxName() {
    if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
      return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
    }
    return String((sandboxSelect && sandboxSelect.value) || '').trim();
  }

  function querySuffix(extra) {
    const params = new URLSearchParams();
    const sb = getSandboxName();
    if (sb) params.set('sandbox', sb);
    if (extra && typeof extra === 'object') {
      for (const [k, v] of Object.entries(extra)) {
        if (v != null && String(v).trim() !== '') params.set(k, String(v));
      }
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  function trimVal(el) {
    return el ? String(el.value || '').trim() : '';
  }

  function getStreamingPayload() {
    return {
      url: trimVal(streamUrlEl),
      flowId: trimVal(streamFlowIdEl),
      flowName: trimVal(streamFlowNameEl),
      datasetId: trimVal(streamDatasetIdEl),
      schemaId: trimVal(streamSchemaIdEl),
      xdmKey: trimVal(streamXdmKeyEl) || '_demoemea',
    };
  }

  // ---------- Email scaler ----------
  /**
   * Scale a base email to a plus-addressed pattern with today's DDMMYYYY and a counter N.
   * Examples:
   *   adamp.adobedemo@gmail.com   → adamp.adobedemo+30042026-1@gmail.com
   *   apalmer@adobetest.com       → apalmer+30042026-1@adobetest.com
   * Existing plus-tags on the local part are preserved (we append after them with a `-N` suffix only).
   * @param {string} base
   * @param {number} n
   * @param {Date} [date]
   * @returns {string} scaled email or empty string when base is invalid
   */
  function scaleEmail(base, n, date) {
    const s = String(base || '').trim();
    if (!s.includes('@')) return '';
    const at = s.lastIndexOf('@');
    const local = s.slice(0, at);
    const domain = s.slice(at + 1);
    if (!local || !domain) return '';
    const d = date instanceof Date ? date : new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const counter = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    // If the user typed `local+something`, append `-DDMMYYYY-N` to that, otherwise add a fresh `+DDMMYYYY-N`.
    if (local.includes('+')) {
      return `${local}-${dd}${mm}${yyyy}-${counter}@${domain}`;
    }
    return `${local}+${dd}${mm}${yyyy}-${counter}@${domain}`;
  }

  function getCurrentScaledEmail() {
    const base = trimVal(baseEmailEl);
    const n = parseInt(counterEl.value || '1', 10) || 1;
    return scaleEmail(base, n, new Date());
  }

  function updateEmailPreview() {
    const out = getCurrentScaledEmail();
    if (!emailPreviewEl) return;
    emailPreviewEl.textContent = out || '— enter a base email like apalmer@adobetest.com —';
  }

  // ---------- Daily per-sandbox counter persistence ----------
  function todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  function counterStorageKey() {
    const sb = getSandboxName() || 'default';
    const base = (trimVal(baseEmailEl) || 'no-email').toLowerCase();
    return `genericProfileCounter:${sb}:${base}:${todayYmd()}`;
  }

  /** Same partition as counter — last scaled email we successfully streamed (generate/update). */
  function lastStreamedStorageKey() {
    return counterStorageKey().replace(/^genericProfileCounter:/, 'genericProfileLastStreamed:');
  }

  function persistLastStreamed(email, n) {
    const e = String(email || '').trim();
    if (!e.includes('@')) return;
    try {
      localStorage.setItem(
        lastStreamedStorageKey(),
        JSON.stringify({ email: e, n: Number.isFinite(n) ? n : null, ts: Date.now() }),
      );
    } catch (_) {
      /* ignore */
    }
  }

  function readLastStreamed() {
    try {
      const raw = localStorage.getItem(lastStreamedStorageKey());
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o && typeof o.email === 'string' && o.email.includes('@')) return o;
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  /**
   * Email to pre-fill for email-namespace lookup when the field is empty.
   * After Generate, the counter points at the *next* slot; the last profile
   * that exists in AEP is the one we just streamed — prefer that over
   * `getCurrentScaledEmail()` (which would be one slot ahead).
   */
  function getDefaultEmailLookupIdentifier() {
    const last = readLastStreamed();
    if (last && last.email) return last.email;
    return getCurrentScaledEmail();
  }

  function loadCounterForCurrentContext() {
    try {
      const raw = localStorage.getItem(counterStorageKey());
      const n = raw != null ? parseInt(raw, 10) : NaN;
      counterEl.value = String(Number.isFinite(n) && n > 0 ? n : 1);
    } catch (_) {
      counterEl.value = '1';
    }
    updateEmailPreview();
  }

  function persistCounter(n) {
    try {
      localStorage.setItem(counterStorageKey(), String(n));
    } catch (_) {
      /* ignore */
    }
  }

  function bumpCounter() {
    const cur = parseInt(counterEl.value || '1', 10) || 1;
    const next = cur + 1;
    counterEl.value = String(next);
    persistCounter(next);
    updateEmailPreview();
  }

  // ---------- Streaming connection (Firestore-backed) ----------
  function fillStreamingFields(streaming) {
    if (!streaming || typeof streaming !== 'object') return;
    if (streamUrlEl && streaming.url) streamUrlEl.value = streaming.url;
    if (streamFlowIdEl && streaming.flowId) streamFlowIdEl.value = streaming.flowId;
    if (streamFlowNameEl && streaming.flowName) streamFlowNameEl.value = streaming.flowName;
    if (streamDatasetIdEl && streaming.datasetId) streamDatasetIdEl.value = streaming.datasetId;
    if (streamSchemaIdEl && streaming.schemaId) streamSchemaIdEl.value = streaming.schemaId;
    if (streamXdmKeyEl && streaming.xdmKey) streamXdmKeyEl.value = streaming.xdmKey;
  }

  function clearStreamingFields() {
    if (streamUrlEl) streamUrlEl.value = '';
    if (streamFlowIdEl) streamFlowIdEl.value = '';
    if (streamDatasetIdEl) streamDatasetIdEl.value = '';
    if (streamSchemaIdEl) streamSchemaIdEl.value = '';
    if (streamXdmKeyEl) streamXdmKeyEl.value = '_demoemea';
    // Keep streamFlowName at the canonical default; user can override.
  }

  async function loadConnectionFromFirestore(silent) {
    try {
      const res = await fetch('/api/generic-profile-connection' + querySuffix());
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        if (!silent) showInfraMessage(data.error || 'Failed to load saved connection.', 'error');
        return false;
      }
      const rec = data.record;
      if (rec && rec.streaming) {
        fillStreamingFields(rec.streaming);
        if (!silent) showInfraMessage('Loaded saved Generic Profile connection for this sandbox.', 'success');
        applyConfiguredCollapseState();
        return true;
      }
      if (!silent) {
        showInfraMessage('No saved connection for this sandbox yet — run the 4 setup steps and Save connection.', '');
      }
      applyConfiguredCollapseState();
      return false;
    } catch (e) {
      if (!silent) showInfraMessage(e.message || 'Network error loading connection.', 'error');
      return false;
    }
  }

  async function saveConnectionToFirestore(extraInfra) {
    const sb = getSandboxName();
    if (!sb) {
      showInfraMessage('Pick a sandbox first.', 'error');
      return false;
    }
    const body = { sandbox: sb, streaming: getStreamingPayload() };
    if (extraInfra && typeof extraInfra === 'object' && Object.keys(extraInfra).length) {
      body.infra = extraInfra;
    }
    try {
      const res = await fetch('/api/generic-profile-connection' + querySuffix(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        showInfraMessage(data.error || 'Save failed.', 'error');
        return false;
      }
      applyConfiguredCollapseState();
      return true;
    } catch (e) {
      showInfraMessage(e.message || 'Network error saving connection.', 'error');
      return false;
    }
  }

  // ---------- Setup wizard ----------
  function applyStepResultToFields(data) {
    if (!data || typeof data !== 'object') return;
    if (streamDatasetIdEl && data.datasetId) streamDatasetIdEl.value = String(data.datasetId);
    if (streamSchemaIdEl && data.schemaId) streamSchemaIdEl.value = String(data.schemaId);
    if (streamXdmKeyEl && data.xdmKey) streamXdmKeyEl.value = String(data.xdmKey);
  }

  async function runStep(step, btn) {
    const labels = {
      createSchema: 'Creating schema…',
      attachFieldGroups: 'Attaching field groups…',
      createDataset: 'Creating dataset…',
      httpFlow: 'Loading HTTP flow instructions…',
    };
    const busy = [stepCreateSchemaBtn, stepAttachFgBtn, stepCreateDatasetBtn, stepHttpFlowBtn].filter(Boolean);
    busy.forEach((b) => { b.disabled = true; });
    showInfraMessage(labels[step] || 'Working…', '');
    try {
      const res = await fetch('/api/generic-profile-infra/step' + querySuffix(), {
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
              ? 'Import "Profile Core v2" in this sandbox first, then run step 2 again.'
              : 'Step failed.'),
          'error'
        );
        return;
      }
      applyStepResultToFields(data);
      try {
        const infra = {};
        if (data.schemaId) infra.schemaId = data.schemaId;
        if (data.schemaMetaAltId) infra.schemaMetaAltId = data.schemaMetaAltId;
        if (data.datasetId) infra.datasetId = data.datasetId;
        if (data.profileCoreMixinId) infra.profileCoreMixinId = data.profileCoreMixinId;
        if (Object.keys(infra).length) await saveConnectionToFirestore(infra);
      } catch (e) {
        console.warn('[generic-profile] infra sync:', e && e.message);
      }
      const msg =
        data.message ||
        (data.manual && Array.isArray(data.nextSteps) ? data.nextSteps.join(' ') : 'Step completed.');
      showInfraMessage(msg, 'success');
      if (Array.isArray(data.nextSteps) && data.nextSteps.length) {
        console.info('[generic-profile-infra] Next steps:', data.nextSteps.join('\n'));
      }
    } catch (e) {
      showInfraMessage(e.message || 'Network error', 'error');
    } finally {
      busy.forEach((b) => { b.disabled = false; });
    }
  }

  async function checkInfra() {
    if (!checkInfraBtn) return;
    checkInfraBtn.disabled = true;
    showInfraMessage('Checking…', '');
    try {
      const res = await fetch('/api/generic-profile-infra/status' + querySuffix());
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        showInfraMessage(data.error || 'Status request failed', 'error');
        return;
      }
      const ps = data.prepSteps || {};
      const parts = [
        data.ready ? 'Ready for streaming (after URL + Flow ID set).' : 'Not fully ready yet.',
        `Profile Core v2 mixin: ${data.profileCoreMixinFound ? 'yes' : 'no'}`,
        `Schema: ${data.schemaFound ? 'yes' : 'no'}`,
        `Primary email descriptor: ${data.primaryEmailDescriptor ? 'yes' : 'no'}`,
        `Dataset: ${data.datasetFound ? `yes (Profile-enabled: ${data.datasetProfileEnabled ? 'yes' : 'no'})` : 'no'}`,
        `Wizard: 1 schema ${ps.step1_schemaShell ? '✓' : '—'} · 2 field groups+ID ${ps.step2_fieldGroupsIdentity ? '✓' : '—'} · 3 dataset ${ps.step3_dataset ? '✓' : '—'} · 4 HTTP ${ps.step4_readyForManualHttpFlow ? 'ready' : '—'}`,
      ];
      showInfraMessage(parts.join(' · '), data.ready ? 'success' : '');
      try {
        const infra = {};
        if (data.schemaId) infra.schemaId = data.schemaId;
        if (data.schemaMetaAltId) infra.schemaMetaAltId = data.schemaMetaAltId;
        if (data.datasetId) infra.datasetId = data.datasetId;
        if (data.profileCoreMixinId) infra.profileCoreMixinId = data.profileCoreMixinId;
        if (Object.keys(infra).length) await saveConnectionToFirestore(infra);
      } catch (e) {
        console.warn('[generic-profile] status sync:', e && e.message);
      }
    } catch (e) {
      showInfraMessage(e.message || 'Network error', 'error');
    } finally {
      checkInfraBtn.disabled = false;
    }
  }

  async function fetchFlowFromAep() {
    if (!fetchFlowFromAepBtn) return;
    fetchFlowFromAepBtn.disabled = true;
    showInfraMessage('Looking up dataflow in Flow Service…', '');
    try {
      const flowId = trimVal(streamFlowIdEl);
      const flowName = trimVal(streamFlowNameEl);
      const extra = {};
      if (flowId) extra.flowId = flowId;
      if (!flowId && flowName) extra.flowName = flowName;
      const res = await fetch('/api/generic-profile-infra/flow-lookup' + querySuffix(extra));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        showInfraMessage(data.error || 'Flow lookup failed', 'error');
        return;
      }
      if (streamUrlEl && data.url) streamUrlEl.value = data.url;
      if (streamFlowIdEl && data.flowId) streamFlowIdEl.value = data.flowId;
      if (streamFlowNameEl && data.flowName) streamFlowNameEl.value = data.flowName;
      showInfraMessage('Fetched URL & Flow ID from AEP. Click Save connection to persist for this sandbox.', 'success');
    } catch (e) {
      showInfraMessage(e.message || 'Network error', 'error');
    } finally {
      fetchFlowFromAepBtn.disabled = false;
    }
  }

  // ---------- Customer Analytics editor wiring ----------
  function renderChurn() { if (churnValueEl) churnValueEl.textContent = `${churnEl.value || 0}%`; }
  function renderPropensity() { if (propensityValueEl) propensityValueEl.textContent = `${propensityEl.value || 0}%`; }
  function renderAov() {
    const n = parseInt(aovEl.value || '0', 10) || 0;
    if (aovValueEl) aovValueEl.textContent = `$${n.toLocaleString('en-US')}`;
  }

  function randomBetween(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function randomLoyaltyPointsForTier(tier) {
    switch (String(tier || '').toLowerCase()) {
      case 'platinum': return randomBetween(50000, 200000);
      case 'gold':     return randomBetween(20000, 60000);
      case 'silver':   return randomBetween(5000, 25000);
      case 'bronze':   return randomBetween(500, 7500);
      default:         return randomBetween(500, 50000);
    }
  }

  function randomPick(arr) {
    if (!arr || !arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** Non-placeholder `<option value="">` values from a `<select>`. */
  function selectNonEmptyValues(selectEl) {
    if (!selectEl || !selectEl.options) return [];
    const out = [];
    for (let i = 0; i < selectEl.options.length; i++) {
      const v = selectEl.options[i].value;
      if (v !== '') out.push(v);
    }
    return out;
  }

  function randomizeSliderControl(el) {
    if (!el) return;
    const min = parseFloat(el.min || '0');
    const max = parseFloat(el.max || '100');
    const step = parseFloat(el.step || '1') || 1;
    const span = max - min;
    const rand = min + Math.random() * span;
    el.value = String(Math.round(rand / step) * step);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** First names loosely aligned with `person.gender` for believable demo personas. */
  const RANDOM_MALE_FIRST = [
    'James', 'Michael', 'Robert', 'David', 'Daniel', 'Matthew', 'Ryan', 'Kevin', 'Brian', 'Jason',
    'Eric', 'Thomas', 'William', 'John', 'Christopher', 'Andrew', 'Steven', 'Adam', 'Marcus', 'Omar',
  ];
  const RANDOM_FEMALE_FIRST = [
    'Emma', 'Olivia', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia', 'Harper', 'Evelyn', 'Luna',
    'Grace', 'Chloe', 'Victoria', 'Aria', 'Zoey', 'Natalie', 'Hannah', 'Sarah', 'Priya', 'Yuki',
  ];
  const RANDOM_NEUTRAL_FIRST = [
    'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Quinn', 'Avery', 'Skyler',
    'Reese', 'Cameron', 'Remi', 'Rowan', 'Phoenix', 'Sam', 'Dakota', 'Blake', 'Eden', 'Sage',
  ];
  const RANDOM_LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Lee', 'Kim', 'Patel', 'Cohen', 'Okafor', 'Silva', 'Andersen', 'Nielsen', 'Kowalski', 'Tanaka',
    'Nguyen', 'Khan', 'Lopez', 'Thompson', 'Murphy', "O'Brien", 'Bernhardt', 'Rossi', 'Santos', 'Chen',
    'Walsh', 'Fernandez', 'Okonkwo', 'Hassan', 'Park', 'Ito', 'Muller', 'Dubois', 'van Dijk', 'Reyes',
  ];

  function randomFirstNameForGender(genderVal) {
    const g = String(genderVal || '').toLowerCase();
    if (g === 'male') return randomPick(RANDOM_MALE_FIRST);
    if (g === 'female') return randomPick(RANDOM_FEMALE_FIRST);
    return randomPick(RANDOM_NEUTRAL_FIRST);
  }

  /**
   * Fills Identity + Customer Analytics (and loyalty when enabled) with one random persona.
   * Called before each profile in Generate-N so every scaled email gets distinct demo data.
   */
  function applyRandomCustomerPersonaForGenerate() {
    const genderChoices = selectNonEmptyValues(genderEl);
    const gender = genderChoices.length ? randomPick(genderChoices) : '';
    if (genderEl && gender) genderEl.value = gender;

    if (firstNameEl) firstNameEl.value = randomFirstNameForGender(gender);
    if (lastNameEl) lastNameEl.value = randomPick(RANDOM_LAST_NAMES);

    randomizeSliderControl(churnEl);
    randomizeSliderControl(propensityEl);
    randomizeSliderControl(aovEl);

    const npsChoices = selectNonEmptyValues(npsEl);
    if (npsEl && npsChoices.length) npsEl.value = randomPick(npsChoices);

    const prefChoices = selectNonEmptyValues(preferredChannelEl);
    if (preferredChannelEl && prefChoices.length) preferredChannelEl.value = randomPick(prefChoices);

    const langChoices = selectNonEmptyValues(languageEl);
    if (languageEl && langChoices.length) languageEl.value = randomPick(langChoices);

    if (loyaltyEnabledEl && loyaltyEnabledEl.checked) {
      const tierChoices = selectNonEmptyValues(loyaltyTierEl);
      if (loyaltyTierEl && tierChoices.length) loyaltyTierEl.value = randomPick(tierChoices);
      const tier = loyaltyTierEl ? trimVal(loyaltyTierEl) : '';
      if (loyaltyPointsEl) loyaltyPointsEl.value = String(randomLoyaltyPointsForTier(tier));
      if (loyaltyIDEl) loyaltyIDEl.value = `LYL-${randomBetween(100000, 999999)}`;
    }
  }

  /**
   * Snapshot the current form state so a successful generate can be replayed
   * later via the Recently-generated picker. Mirror of buildUpdatesFromForm
   * but as a plain object — the `Load` action restores fields from this.
   */
  function snapshotForm() {
    const loyaltyEnabled = !!(loyaltyEnabledEl && loyaltyEnabledEl.checked);
    return {
      firstName: trimVal(firstNameEl),
      lastName: trimVal(lastNameEl),
      gender: trimVal(genderEl),
      churn: trimVal(churnEl),
      propensity: trimVal(propensityEl),
      nps: trimVal(npsEl),
      aov: trimVal(aovEl),
      preferredChannel: trimVal(preferredChannelEl),
      language: trimVal(languageEl),
      loyalty: {
        enabled: loyaltyEnabled,
        id: loyaltyEnabled ? trimVal(loyaltyIDEl) : '',
        tier: loyaltyEnabled ? trimVal(loyaltyTierEl) : '',
        points: loyaltyEnabled ? trimVal(loyaltyPointsEl) : '',
      },
    };
  }

  /**
   * HTTP/DCS XDM shape is defined by profileUpdateProxy + profileStreamingCore merge:
   * these path suffixes nest under streaming.xdmKey (e.g. `_demoemea`) unless the
   * top segment is in PROFILE_STREAM_ROOT_PATH_PREFIXES. Random persona code only
   * mutates scalar form values—it never changes path strings or push order below.
   */
  function buildUpdatesFromForm() {
    const updates = [];
    const push = (path, value) => updates.push({ path, value });

    // Identity (XDM root via PROFILE_STREAM_ROOT_PATH_PREFIXES "person.")
    const firstName = trimVal(firstNameEl);
    if (firstName) push('person.name.firstName', firstName);
    const lastName = trimVal(lastNameEl);
    if (lastName) push('person.name.lastName', lastName);

    // Tenant analytics — these XDM paths live under the Profile Core v2
    // tenant field group attached by the wizard (see the schema dump in the
    // chat thread that introduced this mapping). The proxy auto-prefixes
    // any path NOT in PROFILE_STREAM_ROOT_PATH_PREFIXES with the discovered
    // xdmKey (e.g. `_demoemea`), so we only specify the suffix here.
    //
    // Path notes (Profile Core v2):
    //   NPS lives at `_<tenant>.scoring.npsScore` (NOT `scoring.nps`)
    //   AOV lives at `_<tenant>.orderProfile.avgOrderSize`
    //         (NOT `commerce.averageOrderValue`)
    const churnRaw = churnEl ? String(churnEl.value || '').trim() : '';
    const propRaw = propensityEl ? String(propensityEl.value || '').trim() : '';
    const aovRaw = aovEl ? String(aovEl.value || '').trim() : '';
    const npsRaw = npsEl ? String(npsEl.value || '').trim() : '';
    if (churnRaw !== '') push('scoring.churn.churnPrediction', Number(churnRaw));
    if (propRaw !== '') push('scoring.core.propensityScore', Number(propRaw));
    if (npsRaw !== '') push('scoring.npsScore', parseInt(npsRaw, 10));
    if (aovRaw !== '') push('orderProfile.avgOrderSize', Number(aovRaw));

    // Consent and Preference Details: enum string at consents.marketing.preferred
    // (not a Profile Core v2 tenant path — merged at root via tenant.consents
    // in profileStreamingCore.resolveStreamingConsentsOptInOut).
    const preferredRaw = preferredChannelEl ? String(preferredChannelEl.value || '').trim() : '';
    if (preferredRaw !== '') push('consents.marketing.preferred', preferredRaw);

    // Standalone Language card — maps to `personalEmail.language` and
    // `preferences.preferredLanguage` (XDM root paths).
    const lang = languageEl ? trimVal(languageEl) : '';
    if (lang) {
      push('personalEmail.language', lang);
      push('preferences.preferredLanguage', lang);
    }

    // Person.gender — root via PROFILE_STREAM_ROOT_PATH_PREFIXES
    const gender = genderEl ? trimVal(genderEl) : '';
    if (gender) push('person.gender', gender);

    // Loyalty — only stream when the user has explicitly toggled the loyalty
    // sub-form on. This keeps non-loyalty profiles clean (no empty loyalty.*
    // keys end up in the AEP profile).
    //
    // Each of the three loyalty fields below is DUAL-WRITTEN to two XDM
    // paths so the profile lights up both the standard XDM Loyalty Details
    // view AND the demo-platform's Profile Core v2 tenant tree (which the
    // user has wired into other dashboards / journeys):
    //
    //                     standard XDM (loyalty.*)        Profile Core v2 tenant
    //   Loyalty Tier   →  loyalty.tier                    _<tenant>.loyaltyDetails.level
    //   Loyalty Points →  loyalty.points                  _<tenant>.loyaltyDetails.points
    //   Loyalty ID     →  loyalty.loyaltyID (array)       _<tenant>.identification.core.loyaltyId
    //
    // The standard XDM `loyalty.*` paths reach the profile via the standard
    // Loyalty Details field group attached by the wizard (step 2). The
    // tenant `_<tenant>.*` paths reach it via Profile Core v2. The proxy
    // sends the same payload to AEP exactly once; AEP populates both views
    // because the field groups overlap on these semantic concepts.
    const loyaltyEnabled = !!(loyaltyEnabledEl && loyaltyEnabledEl.checked);
    if (loyaltyEnabled) {
      const loyaltyID = loyaltyIDEl ? trimVal(loyaltyIDEl) : '';
      if (loyaltyID) {
        push('identification.core.loyaltyId', loyaltyID);
        // Standard XDM loyalty.loyaltyID is an ARRAY of strings — wrap.
        push('loyalty.loyaltyID', [loyaltyID]);
      }
      const tier = loyaltyTierEl ? trimVal(loyaltyTierEl) : '';
      if (tier) {
        push('loyalty.tier', tier);
        push('loyaltyDetails.level', tier);
      }
      const pts = loyaltyPointsEl ? trimVal(loyaltyPointsEl) : '';
      if (pts !== '') {
        const ptsNum = Number(pts);
        push('loyalty.points', ptsNum);
        push('loyaltyDetails.points', ptsNum);
      }
    }

    return updates;
  }

  /**
   * Hydrate the editor below from a /api/profile/table response so the
   * operator can pull a profile, tweak fields, and resend an update — the
   * core "round-trip" workflow on this page.
   *
   * The table API returns a flat row array: { found, rows: [{ path, value,
   * attribute, displayName }], profileEmail, ecid, entityId, lastModified }
   * — see functions/profileTableHelpers.js → buildProfileTablePayload().
   * That's the same shape index.html consumes through extractProfileInsightFields.
   *
   * We deliberately avoid hard-coding the tenant prefix (`_demoemea` etc.)
   * — sandbox tenant ids vary per IMS org. Path-suffix / path-keyword
   * matching against the lower-cased path strings in rows[] gives us a
   * tenant-agnostic, schema-version-agnostic resolver that works for both
   * legacy paths (Customer Analytics: scoring.nps, commerce.averageOrderValue)
   * AND the current Profile Core v2 paths (scoring.npsScore,
   * orderProfile.avgOrderSize) emitted by buildUpdatesFromForm().
   *
   * The legacy entity-walking branch is kept as a fallback for any caller
   * that hands us a raw UPS entity (e.g. a future code path that bypasses
   * the table proxy).
   */
  function applyProfileFindResultToForm(found) {
    if (!found || typeof found !== 'object') return;

    const rows = Array.isArray(found.rows) ? found.rows : null;
    const trim = (v) => (v == null ? '' : String(v).trim());
    const pathLower = (r) => String(r && r.path || '').toLowerCase().replace(/_/g, '.');

    // Path-suffix match (e.g. ['npsscore', 'nps']) — first non-empty wins.
    function findBySuffix(suffixes) {
      if (!rows) return '';
      for (const row of rows) {
        const p = pathLower(row);
        for (const s of suffixes) {
          const ss = s.toLowerCase();
          if (p === ss || p.endsWith(`.${ss}`) || p.endsWith(ss)) {
            const v = trim(row.value);
            if (v) return v;
          }
        }
      }
      return '';
    }
    // All-keywords match (e.g. ['loyalty', 'points']) — useful when the
    // suffix alone is too generic ('points' on its own would also match
    // 'rewards.points'). First non-empty wins.
    function findByKeywords(...keywords) {
      if (!rows) return '';
      const kws = keywords.map((k) => String(k).toLowerCase());
      for (const row of rows) {
        const p = pathLower(row);
        if (kws.every((k) => p.includes(k))) {
          const v = trim(row.value);
          if (v) return v;
        }
      }
      return '';
    }

    let firstName = findBySuffix(['firstname', 'givenname']);
    let lastName = findBySuffix(['lastname', 'surname', 'familyname']);
    let churn = findByKeywords('churn', 'prediction') || findBySuffix(['churnprediction', 'churnscore']);
    let propensity = findByKeywords('scoring', 'propensity') || findBySuffix(['propensityscore']);
    // NPS: prefer Profile Core v2 (scoring.npsScore), fall back to legacy
    // (scoring.nps from the old AEP Lab Customer Analytics field group).
    let nps = findBySuffix(['npsscore']) || findByKeywords('scoring', 'nps');
    // AOV: Profile Core v2 = orderProfile.avgOrderSize; legacy = commerce.averageOrderValue.
    let aov = findBySuffix(['avgordersize', 'averageordervalue']);
    let lang = findBySuffix(['preferredlanguage']) ||
      findByKeywords('personalemail', 'language') ||
      findBySuffix(['language', 'locale']);
    let gender = findBySuffix(['gender']) || findByKeywords('person', 'gender');
    let preferredChannel = findBySuffix(['marketing.preferred']);

    // Loyalty (dual-written by buildUpdatesFromForm to both the standard
    // XDM mixin and Profile Core v2 tenant paths). Path-suffix match
    // pulls whichever one made it into the profile, regardless of order.
    let loyaltyId =
      findByKeywords('loyalty', 'loyaltyid') ||
      findByKeywords('identification', 'loyaltyid') ||
      findBySuffix(['loyaltyid']);
    let tier = findByKeywords('loyalty', 'tier') ||
      findByKeywords('loyaltydetails', 'level') ||
      findBySuffix(['tier']);
    let points = findByKeywords('loyalty', 'points') ||
      findByKeywords('loyaltydetails', 'points');

    // Fallback path for raw UPS entity payloads (rows[] absent).
    if (!rows) {
      let entity = null;
      if (found.entity && typeof found.entity === 'object') entity = found.entity;
      if (!entity && found.profile && typeof found.profile === 'object') entity = found.profile;
      if (!entity && Array.isArray(found.entities) && found.entities.length) entity = found.entities[0];
      if (!entity && Array.isArray(found.profiles) && found.profiles.length) entity = found.profiles[0];
      if (!entity && Array.isArray(found.results) && found.results.length) entity = found.results[0];
      if (!entity) return;
      const get = (obj, path) => {
        const keys = path.split('.');
        let cur = obj;
        for (const k of keys) {
          if (cur == null || typeof cur !== 'object') return undefined;
          cur = cur[k];
        }
        return cur;
      };
      // Discover tenant prefix dynamically (any key starting with `_`).
      const tenantKey = Object.keys(entity).find((k) => k.startsWith('_'));
      const tenant = tenantKey && entity[tenantKey] && typeof entity[tenantKey] === 'object'
        ? entity[tenantKey]
        : {};
      if (!firstName) { const v = get(entity, 'person.name.firstName'); if (v != null) firstName = String(v); }
      if (!lastName)  { const v = get(entity, 'person.name.lastName');  if (v != null) lastName  = String(v); }
      if (!churn)      { const v = get(tenant, 'scoring.churn.churnPrediction'); if (v != null) churn = String(v); }
      if (!propensity) { const v = get(tenant, 'scoring.core.propensityScore'); if (v != null) propensity = String(v); }
      if (!nps) { const v = get(tenant, 'scoring.npsScore'); if (v != null) nps = String(v); }
      if (!nps) { const v = get(tenant, 'scoring.nps'); if (v != null) nps = String(v); }
      if (!aov) { const v = get(tenant, 'orderProfile.avgOrderSize'); if (v != null) aov = String(v); }
      if (!aov) { const v = get(tenant, 'commerce.averageOrderValue'); if (v != null) aov = String(v); }
      if (!lang) {
        const v = get(tenant, 'preferences.preferredLanguage') || get(entity, 'personalEmail.language');
        if (v != null) lang = String(v);
      }
      if (!gender) { const v = get(entity, 'person.gender'); if (v != null) gender = String(v); }
      if (!preferredChannel) {
        const v = get(entity, 'consents.marketing.preferred');
        if (v != null) preferredChannel = String(v);
      }
      if (!loyaltyId) {
        const arr = get(entity, 'loyalty.loyaltyID');
        if (Array.isArray(arr) && arr.length) loyaltyId = String(arr[0]);
        else { const v = get(tenant, 'identification.core.loyaltyId'); if (v != null) loyaltyId = String(v); }
      }
      if (!tier)   { let v = get(entity, 'loyalty.tier');   if (v == null) v = get(tenant, 'loyaltyDetails.level');  if (v != null) tier   = String(v); }
      if (!points) { let v = get(entity, 'loyalty.points'); if (v == null) v = get(tenant, 'loyaltyDetails.points'); if (v != null) points = String(v); }
    }

    if (firstName && firstNameEl) firstNameEl.value = firstName;
    if (lastName && lastNameEl) lastNameEl.value = lastName;
    if (churn && churnEl) { churnEl.value = churn; if (typeof renderChurn === 'function') renderChurn(); }
    if (propensity && propensityEl) { propensityEl.value = propensity; if (typeof renderPropensity === 'function') renderPropensity(); }
    if (nps && npsEl) npsEl.value = nps;
    if (aov && aovEl) { aovEl.value = aov; if (typeof renderAov === 'function') renderAov(); }
    setSelectValueLoose(languageEl, lang);
    setSelectValueLoose(genderEl, gender);
    setSelectValueLoose(preferredChannelEl, preferredChannel);

    const hasLoyalty = !!(loyaltyId || tier || points);
    if (hasLoyalty && loyaltyEnabledEl) {
      loyaltyEnabledEl.checked = true;
      if (typeof applyLoyaltyToggleVisibility === 'function') applyLoyaltyToggleVisibility();
    }
    if (loyaltyId && loyaltyIDEl) loyaltyIDEl.value = loyaltyId;
    setSelectValueLoose(loyaltyTierEl, tier);
    if (points && loyaltyPointsEl) loyaltyPointsEl.value = points;
  }

  /**
   * Set a <select> to a value with case- and label-fallback matching. Profile
   * Core v2 stores loyalty tier as lower-case 'silver' / 'gold' but the form's
   * <option> values are Title Case ('Silver' / 'Gold') — direct assignment
   * silently leaves the dropdown on '— Select —' because <select>.value is
   * case-sensitive. Try exact value, then case-insensitive value, then
   * case-insensitive option text. If nothing matches, leave the existing
   * selection alone (don't blank out a value the operator may have set).
   */
  function setSelectValueLoose(selectEl, raw) {
    if (!selectEl || raw == null) return;
    const val = String(raw).trim();
    if (!val) return;
    const opts = Array.from(selectEl.options || []);
    const exact = opts.find((o) => o.value === val);
    if (exact) { selectEl.value = exact.value; return; }
    const ci = opts.find((o) => String(o.value).toLowerCase() === val.toLowerCase());
    if (ci) { selectEl.value = ci.value; return; }
    const byText = opts.find((o) => String(o.textContent || '').trim().toLowerCase() === val.toLowerCase());
    if (byText) { selectEl.value = byText.value; return; }
  }

  // ---------- Find / Update / Generate ----------
  function ensureStreamingReady() {
    const s = getStreamingPayload();
    const missing = [];
    if (!s.url) missing.push('Collection URL');
    if (!s.flowId) missing.push('Flow ID');
    if (!s.datasetId) missing.push('Dataset ID');
    if (!s.schemaId) missing.push('Schema $id');
    if (missing.length) {
      const det = document.getElementById('genericProfileInfraDetails');
      if (det) det.open = true;
      setMessage(
        messageEl,
        `Streaming connection missing: ${missing.join(', ')}. Run setup or click Fetch URL & Flow ID, then Save connection.`,
        'error'
      );
      return null;
    }
    return s;
  }

  /**
   * Look up an existing profile by any identity namespace (email / ecid / crmId / loyaltyId / phone)
   * via /api/profile/table — same endpoint as the standard widget on index.html. Result is fed into
   * the editor below through applyProfileFindResultToForm so the Customer Analytics + Loyalty fields
   * pre-populate. When namespace=email and the identifier is blank, we substitute the current
   * last streamed scaled email when available (see `getDefaultEmailLookupIdentifier`),
   * else the scaled email for the current counter.
   */
  async function lookupProfile() {
    if (!lookupNsEl || !lookupIdentifierEl || !lookupBtn) return;
    const ns = String(lookupNsEl.value || 'email').trim();
    let identifier = trimVal(lookupIdentifierEl);
    if (!identifier && ns === 'email') {
      identifier = getDefaultEmailLookupIdentifier();
      if (identifier) lookupIdentifierEl.value = identifier;
    }
    if (!identifier) {
      setMessage(messageEl, `Enter an ${ns} identifier to look up, or set a base email and try again.`, 'warning');
      lookupIdentifierEl.focus();
      return;
    }
    lookupBtn.disabled = true;
    setMessage(messageEl, `Looking up ${ns}: ${identifier}…`, '');
    try {
      const url = '/api/profile/table' + querySuffix({ identifier, namespace: ns });
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(messageEl, data.error || `Lookup failed (HTTP ${res.status}).`, 'error');
        return;
      }
      // /api/profile/table contract: { found: bool, rows: [...] } when the
      // proxy resolved a UPS entity, otherwise { found: false, rows: [] }.
      // The legacy entity-shape branches stay in place to cover any future
      // caller that pipes a raw UPS payload through the same handler.
      const found =
        (data && data.found === true) ||
        (data && (data.entity || data.profile)) ||
        (Array.isArray(data && data.entities) && data.entities.length) ||
        (Array.isArray(data && data.profiles) && data.profiles.length) ||
        (Array.isArray(data && data.results) && data.results.length);
      if (!found) {
        setMessage(
          messageEl,
          `No profile found for ${ns}: ${identifier} in this sandbox. Use Generate / Update to create one.`,
          ''
        );
        return;
      }
      applyProfileFindResultToForm(data);
      if (ns === 'email') persistLastStreamed(identifier, null);
      // Remember the resolved identifier in the shared per-namespace cache
      // so autocomplete on the next visit (or on any other lookup page in
      // the lab — consent.html, index.html, event-tool, etc.) suggests it.
      if (typeof window.addRecentIdentifier === 'function') {
        try { window.addRecentIdentifier(identifier, ns); } catch (_) {}
      }
      setMessage(messageEl, `Loaded profile for ${ns}: ${identifier}. Edit fields then click Update profile.`, 'success');
    } catch (e) {
      setMessage(messageEl, e.message || 'Network error', 'error');
    } finally {
      lookupBtn.disabled = false;
    }
  }

  async function postProfileUpdate(email, updates, streaming, dryRun) {
    const sb = getSandboxName();
    const body = {
      email,
      sandbox: sb || undefined,
      updates,
      streaming,
      ...(dryRun ? { dryRun: true } : {}),
    };
    const clientReq = {
      method: 'POST',
      url: `${window.location.origin}/api/profile/update`,
      headers: { 'Content-Type': 'application/json' },
      body,
    };
    if (debugEl && debugClientReqEl) {
      debugEl.hidden = false;
      debugClientReqEl.textContent = JSON.stringify(clientReq, null, 2);
      if (debugStatusEl) debugStatusEl.textContent = '…';
      if (debugResponseEl) debugResponseEl.textContent = '';
    }
    const res = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (debugEl) {
      if (debugStatusEl) debugStatusEl.textContent = `${res.status} ${res.ok ? 'OK' : ''}`;
      if (debugResponseEl) debugResponseEl.textContent = JSON.stringify(data, null, 2);
    }
    return { res, data };
  }

  async function updateProfile() {
    const email = getCurrentScaledEmail();
    if (!email) {
      setMessage(messageEl, 'Enter a base email first.', 'warning');
      baseEmailEl.focus();
      return;
    }
    const streaming = ensureStreamingReady();
    if (!streaming) return;
    const updates = buildUpdatesFromForm();
    if (!updates.length) {
      setMessage(messageEl, 'No fields to update — fill at least one Customer Analytics field.', 'warning');
      return;
    }
    updateProfileBtn.disabled = true;
    setMessage(messageEl, `Updating ${email}…`, '');
    try {
      const dryRun = !!(dryRunEl && dryRunEl.checked);
      const { res, data } = await postProfileUpdate(email, updates, streaming, dryRun);
      if (!res.ok) {
        setMessage(messageEl, data.error || `Update failed (HTTP ${res.status}).`, 'error');
        return;
      }
      // Refresh recent so an Update on a brand-new email also surfaces in
      // the picker (Generate-N is not the only path that creates a profile).
      if (!dryRun) {
        const n = parseInt(counterEl.value || '1', 10) || 1;
        recordGenerated(email, n);
        persistLastStreamed(email, n);
      }
      const okMsg = data.message || `Update sent for ${email}.`;
      setMessage(messageEl, okMsg + (dryRun ? ' (dry run)' : ''), 'success');
    } catch (e) {
      setMessage(messageEl, e.message || 'Network error', 'error');
    } finally {
      updateProfileBtn.disabled = false;
    }
  }

  async function generateProfiles() {
    const base = trimVal(baseEmailEl);
    if (!base || !base.includes('@')) {
      setMessage(messageEl, 'Enter a valid base email like apalmer@adobetest.com first.', 'warning');
      baseEmailEl.focus();
      return;
    }
    const streaming = ensureStreamingReady();
    if (!streaming) return;
    const count = Math.max(1, Math.min(100, parseInt(generateCountEl.value || '1', 10) || 1));
    const dryRun = !!(dryRunEl && dryRunEl.checked);

    generateBtn.disabled = true;
    setMessage(messageEl, `Generating ${count} profile${count === 1 ? '' : 's'}…`, '');
    let successCount = 0;
    let lastError = '';
    let lastEmail = '';
    try {
      for (let i = 0; i < count; i++) {
        const n = parseInt(counterEl.value || '1', 10) || 1;
        const email = scaleEmail(base, n, new Date());
        if (!email) {
          lastError = 'Could not scale email — invalid base format.';
          break;
        }
        lastEmail = email;
        try {
          applyRandomCustomerPersonaForGenerate();
          const updates = buildUpdatesFromForm();
          if (!updates.length) {
            lastError = 'Could not build profile fields after randomization — check form configuration.';
            break;
          }
          const { res, data } = await postProfileUpdate(email, updates, streaming, dryRun);
          if (!res.ok) {
            lastError = data.error || `HTTP ${res.status}`;
            break;
          }
          successCount += 1;
          // Record in the per-(sandbox, base, day) recent picker so the user
          // can reload this exact profile to inspect or modify it later.
          // Skip dry runs — they didn't actually create anything in AEP.
          if (!dryRun) {
            recordGenerated(email, n, snapshotForm());
            persistLastStreamed(email, n);
          }
        } catch (e) {
          lastError = e.message || 'Network error';
          break;
        }
        // Always bump counter after a successful send so retries don't collide.
        bumpCounter();
      }
      if (successCount === count && !lastError) {
        setMessage(
          messageEl,
          `Generated ${successCount} profile${successCount === 1 ? '' : 's'}${dryRun ? ' (dry run)' : ''}. Latest: ${lastEmail}.`,
          'success'
        );
      } else if (successCount > 0) {
        setMessage(
          messageEl,
          `Generated ${successCount}/${count} profile${count === 1 ? '' : 's'} before stopping. Last error: ${lastError}`,
          'warning'
        );
      } else {
        setMessage(messageEl, `Generate failed: ${lastError || 'unknown error'}.`, 'error');
      }
    } finally {
      generateBtn.disabled = false;
    }
  }

  // ---------- Loyalty toggle UX ----------
  /**
   * Show/hide the loyalty subgroup based on the toggle state. The standalone
   * Language card stays visible at all times — when loyalty is ON the loyalty
   * subgroup adds its own Language preference field alongside it (both write
   * to `personalEmail.language` on the AEP side, with the loyalty subgroup
   * winning on precedence; see buildUpdatesFromForm()).
   */
  function applyLoyaltyToggleVisibility() {
    const enabled = !!(loyaltyEnabledEl && loyaltyEnabledEl.checked);
    if (loyaltyFieldsEl) loyaltyFieldsEl.hidden = !enabled;
    if (loyaltyEnabledEl) loyaltyEnabledEl.setAttribute('aria-expanded', enabled ? 'true' : 'false');
  }

  // ---------- Recently-generated picker ----------
  // We persist the last ~20 successful generates per (sandbox, base email,
  // day) so the user can reload any of them to inspect/modify. The same
  // partitioning as the counter (see counterStorageKey) means the day
  // rollover automatically clears stale entries.
  const RECENT_LIMIT = 20;

  function recentStorageKey() {
    const sb = getSandboxName() || 'default';
    const base = (trimVal(baseEmailEl) || 'no-email').toLowerCase();
    return `genericProfileRecent:${sb}:${base}:${todayYmd()}`;
  }

  function readRecent() {
    try {
      const raw = localStorage.getItem(recentStorageKey());
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeRecent(arr) {
    try {
      localStorage.setItem(recentStorageKey(), JSON.stringify(arr.slice(0, RECENT_LIMIT)));
    } catch (_) {
      /* quota / privacy mode — non-fatal, just lose the picker for this session */
    }
  }

  function recordGenerated(scaledEmail, n, snapshotOverride) {
    if (!scaledEmail) return;
    const snap =
      snapshotOverride && typeof snapshotOverride === 'object' ? snapshotOverride : snapshotForm();
    const entry = {
      scaledEmail,
      n: Number.isFinite(n) ? n : null,
      ts: Date.now(),
      snapshot: snap,
    };
    const next = [entry, ...readRecent().filter((e) => e && e.scaledEmail !== scaledEmail)];
    writeRecent(next);
    renderRecent();
    // Also seed the shared cross-page identifier cache so this scaled email
    // appears in the autocomplete datalist on every other lookup page in
    // the lab (consent.html, index.html, event-tool, live-activities, etc.).
    if (typeof window.addRecentIdentifier === 'function') {
      try { window.addRecentIdentifier(scaledEmail, 'email'); } catch (_) {}
    }
  }

  function summariseSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return '';
    const parts = [];
    if (snap.firstName || snap.lastName) parts.push(`${snap.firstName || ''} ${snap.lastName || ''}`.trim());
    if (snap.gender) parts.push(snap.gender);
    if (snap.loyalty && snap.loyalty.enabled) {
      const lp = [];
      if (snap.loyalty.tier) lp.push(snap.loyalty.tier);
      if (snap.loyalty.points) lp.push(`${snap.loyalty.points} pts`);
      parts.push(`Loyalty: ${lp.join(' · ') || 'on'}`);
    }
    if (snap.nps) parts.push(`NPS ${snap.nps}`);
    if (snap.aov) parts.push(`AOV $${snap.aov}`);
    if (snap.preferredChannel) parts.push(`Preferred ${snap.preferredChannel}`);
    return parts.join(' · ');
  }

  function formatRelative(ts) {
    if (!ts) return '';
    const diffMs = Date.now() - ts;
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    return `${hr}h ago`;
  }

  function renderRecent() {
    const list = readRecent();
    if (!recentPickerEl) return;
    recentPickerEl.hidden = list.length === 0;
    if (recentCountLabelEl) recentCountLabelEl.textContent = `Recently generated (${list.length})`;
    // Dropdown
    if (recentSelectEl) {
      const prev = recentSelectEl.value;
      recentSelectEl.innerHTML = '<option value="">— pick to load —</option>';
      list.forEach((entry) => {
        const opt = document.createElement('option');
        opt.value = entry.scaledEmail;
        const tail = summariseSnapshot(entry.snapshot);
        opt.textContent = tail ? `${entry.scaledEmail} — ${tail}` : entry.scaledEmail;
        recentSelectEl.appendChild(opt);
      });
      // Restore previous selection if still in the list.
      if (list.some((e) => e.scaledEmail === prev)) recentSelectEl.value = prev;
    }
    // Table
    if (recentListBodyEl) {
      recentListBodyEl.innerHTML = '';
      list.forEach((entry) => {
        const tr = document.createElement('tr');
        const tdEmail = document.createElement('td');
        tdEmail.textContent = entry.scaledEmail;
        const tdTs = document.createElement('td');
        tdTs.textContent = formatRelative(entry.ts);
        tdTs.title = new Date(entry.ts).toISOString();
        const tdSummary = document.createElement('td');
        tdSummary.textContent = summariseSnapshot(entry.snapshot);
        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-link';
        btn.textContent = 'Load';
        btn.addEventListener('click', () => loadRecentSnapshot(entry));
        tdAction.appendChild(btn);
        tr.append(tdEmail, tdTs, tdSummary, tdAction);
        recentListBodyEl.appendChild(tr);
      });
    }
  }

  function loadRecentSnapshot(entry) {
    if (!entry || !entry.snapshot) return;
    const s = entry.snapshot;
    // Identity
    if (firstNameEl) firstNameEl.value = s.firstName || '';
    if (lastNameEl) lastNameEl.value = s.lastName || '';
    // Analytics
    if (genderEl) genderEl.value = s.gender || '';
    if (churnEl && s.churn !== '') { churnEl.value = String(s.churn); renderChurn(); }
    if (propensityEl && s.propensity !== '') { propensityEl.value = String(s.propensity); renderPropensity(); }
    if (npsEl) npsEl.value = s.nps || '';
    if (aovEl && s.aov !== '') { aovEl.value = String(s.aov); renderAov(); }
    if (preferredChannelEl) preferredChannelEl.value = s.preferredChannel || '';
    if (languageEl) languageEl.value = s.language || (s.loyalty && s.loyalty.language) || '';
    // Loyalty
    if (loyaltyEnabledEl) loyaltyEnabledEl.checked = !!(s.loyalty && s.loyalty.enabled);
    if (loyaltyIDEl) loyaltyIDEl.value = (s.loyalty && s.loyalty.id) || '';
    if (loyaltyTierEl) loyaltyTierEl.value = (s.loyalty && s.loyalty.tier) || '';
    if (loyaltyPointsEl) loyaltyPointsEl.value = (s.loyalty && s.loyalty.points) || '';
    applyLoyaltyToggleVisibility();
    // Restore counter so subsequent Update/Generate target the same scaled
    // email. The base email is whatever produced this entry — keep it.
    if (counterEl && Number.isFinite(entry.n)) {
      counterEl.value = String(entry.n);
      persistCounter(entry.n);
      updateEmailPreview();
    }
    persistLastStreamed(entry.scaledEmail, entry.n);
    setMessage(messageEl, `Loaded ${entry.scaledEmail}. Edit fields then click Update profile, or Generate to create a new profile after this one.`, 'success');
  }

  // ---------- Wire events ----------
  if (checkInfraBtn) checkInfraBtn.addEventListener('click', checkInfra);
  if (stepCreateSchemaBtn) stepCreateSchemaBtn.addEventListener('click', () => runStep('createSchema', stepCreateSchemaBtn));
  if (stepAttachFgBtn) stepAttachFgBtn.addEventListener('click', () => runStep('attachFieldGroups', stepAttachFgBtn));
  if (stepCreateDatasetBtn) stepCreateDatasetBtn.addEventListener('click', () => runStep('createDataset', stepCreateDatasetBtn));
  if (stepHttpFlowBtn) stepHttpFlowBtn.addEventListener('click', () => runStep('httpFlow', stepHttpFlowBtn));

  if (loadFromFirebaseBtn) loadFromFirebaseBtn.addEventListener('click', () => loadConnectionFromFirestore(false));
  if (fetchFlowFromAepBtn) fetchFlowFromAepBtn.addEventListener('click', fetchFlowFromAep);
  if (saveStreamBtn) {
    saveStreamBtn.addEventListener('click', async () => {
      saveStreamBtn.disabled = true;
      try {
        const ok = await saveConnectionToFirestore();
        if (ok) showInfraMessage('Connection saved for this sandbox.', 'success');
      } finally {
        saveStreamBtn.disabled = false;
      }
    });
  }

  if (baseEmailEl) {
    baseEmailEl.addEventListener('input', () => {
      // Persist the base email globally so the next visit (any sandbox) prefills it — set-and-forget.
      try { localStorage.setItem(BASE_EMAIL_STORAGE_KEY, baseEmailEl.value || ''); } catch (_) {}
      // When the base email changes, reload the counter for the new (sandbox, base, today) key.
      loadCounterForCurrentContext();
    });
    baseEmailEl.addEventListener('change', loadCounterForCurrentContext);
  }
  if (counterEl) {
    counterEl.addEventListener('input', () => {
      const n = parseInt(counterEl.value || '1', 10) || 1;
      persistCounter(n);
      updateEmailPreview();
    });
  }
  if (resetCounterBtn) {
    resetCounterBtn.addEventListener('click', () => {
      counterEl.value = '1';
      persistCounter(1);
      updateEmailPreview();
    });
  }

  // Customer Analytics
  if (churnEl) churnEl.addEventListener('input', renderChurn);
  if (propensityEl) propensityEl.addEventListener('input', renderPropensity);
  if (aovEl) aovEl.addEventListener('input', renderAov);
  document.querySelectorAll('.analytics-randomize').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-target') || '');
      if (!target) return;
      randomizeSliderControl(target);
    });
  });
  if (loyaltyRandomBtn && loyaltyTierEl && loyaltyPointsEl) {
    loyaltyRandomBtn.addEventListener('click', () => {
      const tier = trimVal(loyaltyTierEl);
      loyaltyPointsEl.value = String(randomLoyaltyPointsForTier(tier));
    });
  }

  // Loyalty toggle wiring
  if (loyaltyEnabledEl) {
    loyaltyEnabledEl.addEventListener('change', applyLoyaltyToggleVisibility);
  }

  // Recently-generated picker wiring
  if (recentLoadBtn && recentSelectEl) {
    recentLoadBtn.addEventListener('click', () => {
      const v = recentSelectEl.value;
      if (!v) {
        setMessage(messageEl, 'Pick a generated profile from the dropdown first.', 'warning');
        return;
      }
      const entry = readRecent().find((e) => e && e.scaledEmail === v);
      if (entry) loadRecentSnapshot(entry);
    });
  }
  // Reload recent when the base email changes — same partition key as counter.
  if (baseEmailEl) {
    baseEmailEl.addEventListener('input', renderRecent);
  }

  // Profile lookup wiring (replaces the old "Find profile by current scaled email" button —
  // the lookup widget below covers that case via auto-fill on focus when namespace=email).
  if (lookupBtn) lookupBtn.addEventListener('click', lookupProfile);
  if (lookupIdentifierEl) {
    lookupIdentifierEl.addEventListener('focus', () => {
      // One-click parity with the old Find button: when nothing is typed and namespace=email,
      // pre-fill the identifier with the current scaled email so the user just clicks Look up.
      if (!trimVal(lookupIdentifierEl) && lookupNsEl && lookupNsEl.value === 'email') {
        const scaled = getDefaultEmailLookupIdentifier();
        if (scaled) lookupIdentifierEl.value = scaled;
      }
    });
    // Pressing Enter inside the identifier input triggers lookup.
    lookupIdentifierEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        lookupProfile();
      }
    });
  }
  if (updateProfileBtn) updateProfileBtn.addEventListener('click', updateProfile);
  if (generateBtn) generateBtn.addEventListener('click', generateProfiles);

  // Sandbox change: reload connection + counter context.
  function onSandboxChange() {
    clearStreamingFields();
    // Immediately reflect the cleared fields in the wizard <details>
    // (re-expand it) — the async loadConnectionFromFirestore() below will
    // collapse it again if it finds a saved connection for the new sandbox.
    applyConfiguredCollapseState();
    loadConnectionFromFirestore(true);
    loadCounterForCurrentContext();
    renderRecent();
  }
  if (sandboxSelect) {
    sandboxSelect.addEventListener('change', onSandboxChange);
  }
  window.addEventListener('aep-global-sandbox-change', onSandboxChange);

  // When the user picks "Generic" in the industry dropdown, profile-generation.js
  // emits aep-generic-panel-shown — that's a good cue to refresh the picker
  // (the panel was hidden on initial load so the table wasn't drawn).
  window.addEventListener('aep-generic-panel-shown', () => {
    renderRecent();
    applyLoyaltyToggleVisibility();
    // Reflect the current configured state in the wizard <details> on the
    // first reveal (the deferred loadConnectionFromFirestore at the bottom
    // of this module already calls applyConfiguredCollapseState, but if the
    // user picks Generic before that 750ms delay fires we still want a
    // sensible initial state based on whatever fields are populated now).
    applyConfiguredCollapseState();
  });

  // Set-and-forget base email: prefill from localStorage so the user only types it once.
  // We do this before loadCounterForCurrentContext() because the counter partition key
  // includes the base email — restoring it first means the saved counter for that base
  // email loads correctly on first paint.
  try {
    const savedBase = localStorage.getItem(BASE_EMAIL_STORAGE_KEY);
    if (savedBase && baseEmailEl && !trimVal(baseEmailEl)) {
      baseEmailEl.value = savedBase;
    }
  } catch (_) { /* localStorage unavailable — fall through */ }

  // Initial render
  renderChurn();
  renderPropensity();
  renderAov();
  applyLoyaltyToggleVisibility();
  loadCounterForCurrentContext();
  updateEmailPreview();
  renderRecent();
  // Defer initial connection load so the sandbox dropdown finishes loading first.
  setTimeout(() => loadConnectionFromFirestore(true), 750);
})();
