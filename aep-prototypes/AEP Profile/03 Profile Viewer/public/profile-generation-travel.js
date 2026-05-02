/**
 * Profile Generation — Travel industry section.
 *
 * Mirrors profile-generation-generic.js exactly — same wizard, same lookup,
 * same Customer Analytics editor, same Generate-N flow. Differences are
 * limited to:
 *  - DOM ids prefixed `travel*` (`#travelStreamSchemaId`, `#travelGenerateBtn`, …).
 *  - `/api/travel-profile-infra/*` and `/api/travel-profile-connection`
 *    endpoints back the wizard / connection store (separate Firestore
 *    collection from Generic).
 *  - `buildUpdatesFromForm()` adds Travel attribute paths under the tenant
 *    (`individualCharacteristics.travel.*`, `travelReservations.*`).
 *
 * Cross-industry coordination (counter / base email / recent / lastStreamed)
 * runs through window.AepProfileGenShared, so a Generic profile and a
 * Travel profile in the same sandbox + base email never produce the same
 * scaled email on the same day.
 */

(function () {
  'use strict';

  const sandboxSelect = document.getElementById('sandboxSelect');

  // Setup wizard
  const checkInfraBtn = document.getElementById('travelCheckInfraBtn');
  const stepCreateSchemaBtn = document.getElementById('travelStepCreateSchemaBtn');
  const stepAttachFgBtn = document.getElementById('travelStepAttachFgBtn');
  const stepCreateDatasetBtn = document.getElementById('travelStepCreateDatasetBtn');
  const stepHttpFlowBtn = document.getElementById('travelStepHttpFlowBtn');
  const infraStatusMessage = document.getElementById('travelInfraStatusMessage');
  const infraDetailsEl = document.getElementById('travelProfileInfraDetails');
  const infraHintEl = document.getElementById('travelProfileInfraHint');
  const ORIGINAL_INFRA_HINT = infraHintEl ? infraHintEl.textContent.trim() : '';

  // Streaming connection fields
  const streamSchemaIdEl = document.getElementById('travelStreamSchemaId');
  const streamDatasetIdEl = document.getElementById('travelStreamDatasetId');
  const streamXdmKeyEl = document.getElementById('travelStreamXdmKey');
  const streamFlowIdEl = document.getElementById('travelStreamFlowId');
  const streamFlowNameEl = document.getElementById('travelStreamFlowName');
  const streamUrlEl = document.getElementById('travelStreamUrl');
  const loadFromFirebaseBtn = document.getElementById('travelLoadFromFirebaseBtn');
  const fetchFlowFromAepBtn = document.getElementById('travelFetchFlowFromAepBtn');
  const saveStreamBtn = document.getElementById('travelSaveStreamBtn');

  // Profile lookup
  const lookupNsEl = document.getElementById('travelLookupNs');
  const lookupIdentifierEl = document.getElementById('travelLookupIdentifier');
  const lookupBtn = document.getElementById('travelLookupBtn');
  if (typeof window.AepIdentityPicker !== 'undefined' && typeof window.AepIdentityPicker.init === 'function') {
    window.AepIdentityPicker.init('travelLookupIdentifier', 'travelLookupNs');
  }
  if (typeof window.attachEmailDatalist === 'function') {
    window.attachEmailDatalist('travelLookupIdentifier', 'travelLookupRecent', 'travelLookupNs');
  }

  // Base email + counter + actions
  const baseEmailEl = document.getElementById('travelBaseEmail');
  const counterEl = document.getElementById('travelCounter');
  const generateCountEl = document.getElementById('travelGenerateCount');
  const emailPreviewEl = document.getElementById('travelEmailPreview');
  const resetCounterBtn = document.getElementById('travelResetCounterBtn');
  const updateProfileBtn = document.getElementById('travelUpdateProfileBtn');
  const generateBtn = document.getElementById('travelGenerateBtn');
  const dryRunEl = document.getElementById('travelDryRun');
  const messageEl = document.getElementById('travelProfileMessage');

  // Identity
  const firstNameEl = document.getElementById('travelFirstName');
  const lastNameEl = document.getElementById('travelLastName');

  // Customer Analytics
  const churnEl = document.getElementById('travelChurn');
  const churnValueEl = document.getElementById('travelChurnValue');
  const propensityEl = document.getElementById('travelPropensity');
  const propensityValueEl = document.getElementById('travelPropensityValue');
  const npsEl = document.getElementById('travelNps');
  const aovEl = document.getElementById('travelAov');
  const aovValueEl = document.getElementById('travelAovValue');
  const preferredChannelEl = document.getElementById('travelPreferredChannel');
  const genderEl = document.getElementById('travelGender');
  const loyaltyEnabledEl = document.getElementById('travelLoyaltyEnabled');
  const loyaltyFieldsEl = document.getElementById('travelLoyaltyFields');
  const loyaltyIDEl = document.getElementById('travelLoyaltyID');
  const loyaltyTierEl = document.getElementById('travelLoyaltyTier');
  const loyaltyPointsEl = document.getElementById('travelLoyaltyPoints');
  const loyaltyRandomBtn = document.getElementById('travelLoyaltyRandomBtn');
  const languageEl = document.getElementById('travelLanguage');

  // Travel-specific attributes
  const favouriteAirlineEl = document.getElementById('travelFavouriteAirlineCompany');
  const primaryTravelClassEl = document.getElementById('travelPrimaryTravelClass2');

  const recentStayEnabledEl = document.getElementById('travelRecentStayEnabled');
  const recentStayFieldsEl = document.getElementById('travelRecentStayFields');
  const recentStayHotelEl = document.getElementById('travelRecentStayHotelName');
  const recentStayCityEl = document.getElementById('travelRecentStayCity');
  const recentStayCountryEl = document.getElementById('travelRecentStayCountry');
  const recentStayCheckInEl = document.getElementById('travelRecentStayCheckIn');
  const recentStayCheckOutEl = document.getElementById('travelRecentStayCheckOut');
  const recentStayRoomTypeEl = document.getElementById('travelRecentStayRoomType');

  const reservationsEnabledEl = document.getElementById('travelReservationsEnabled');
  const reservationsFieldsEl = document.getElementById('travelReservationsFields');
  const flightDepartureEl = document.getElementById('travelFlightDeparture');
  const flightArrivalEl = document.getElementById('travelFlightArrival');
  const flightNumberEl = document.getElementById('travelFlightNumber');
  const flightDateEl = document.getElementById('travelFlightDate');
  const flightClassEl = document.getElementById('travelFlightClass');
  const flightConfirmationEl = document.getElementById('travelFlightConfirmation');
  const flightPassengersEl = document.getElementById('travelFlightPassengers');
  const flightChildrenEl = document.getElementById('travelFlightChildren');
  const flightMultiLegEl = document.getElementById('travelFlightMultiLeg');
  const flightLayoversEl = document.getElementById('travelFlightLayovers');
  const hotelNameEl = document.getElementById('travelHotelName');
  const hotelCityEl = document.getElementById('travelHotelCity');
  const hotelCountryEl = document.getElementById('travelHotelCountry');
  const hotelCheckInEl = document.getElementById('travelHotelCheckIn');
  const hotelCheckOutEl = document.getElementById('travelHotelCheckOut');
  const hotelRoomTypeEl = document.getElementById('travelHotelRoomType');
  const hotelConfirmationEl = document.getElementById('travelHotelConfirmation');
  const carCompanyEl = document.getElementById('travelCarCompany');
  const carPickupCityEl = document.getElementById('travelCarPickupCity');
  const carClassEl = document.getElementById('travelCarClass');
  const carPickupDateEl = document.getElementById('travelCarPickupDate');
  const carReturnDateEl = document.getElementById('travelCarReturnDate');
  const carConfirmationEl = document.getElementById('travelCarConfirmation');

  // Recently-generated picker
  const recentPickerEl = document.getElementById('travelRecentPicker');
  const recentSelectEl = document.getElementById('travelRecentSelect');
  const recentLoadBtn = document.getElementById('travelRecentLoadBtn');
  const recentDetailsEl = document.getElementById('travelRecentDetails');
  const recentListBodyEl = document.getElementById('travelRecentListBody');
  const recentCountLabelEl = document.getElementById('travelRecentCountLabel');

  // Debug
  const debugEl = document.getElementById('travelProfileDebug');
  const debugClientReqEl = document.getElementById('travelDebugClientRequest');
  const debugStatusEl = document.getElementById('travelDebugStatus');
  const debugResponseEl = document.getElementById('travelDebugResponse');

  if (!baseEmailEl || !counterEl || !emailPreviewEl) return;

  const Shared = window.AepProfileGenShared;
  if (!Shared) {
    console.error('[travel-profile] AepProfileGenShared missing — load profile-generation-shared.js before this script.');
    return;
  }

  // ---------- Helpers (mirror of Generic) ----------
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
    if (text && type === 'error' && infraDetailsEl) infraDetailsEl.open = true;
  }

  function streamingFieldsAreFullyConfigured() {
    const s = getStreamingPayload();
    return !!(s && s.url && s.flowId && s.datasetId && s.schemaId);
  }

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

  function loadBaseEmailForCurrentSandbox() {
    if (!baseEmailEl) return;
    baseEmailEl.value = Shared.readBaseEmail(getSandboxName());
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

  // ---------- Email scaler / counter (shared) ----------
  const scaleEmail = Shared.scaleEmail;

  function getCurrentScaledEmail() {
    return scaleEmail(trimVal(baseEmailEl), parseInt(counterEl.value || '1', 10) || 1, new Date());
  }

  function updateEmailPreview() {
    if (!emailPreviewEl) return;
    emailPreviewEl.textContent = getCurrentScaledEmail() || '— enter a base email like apalmer@adobetest.com —';
  }

  function persistLastStreamed(email, n) {
    Shared.persistLastStreamed(getSandboxName(), trimVal(baseEmailEl), email, n);
  }
  function readLastStreamed() {
    return Shared.readLastStreamed(getSandboxName(), trimVal(baseEmailEl));
  }

  function getDefaultEmailLookupIdentifier() {
    const last = readLastStreamed();
    if (last && last.email) return last.email;
    return getCurrentScaledEmail();
  }

  function loadCounterForCurrentContext() {
    counterEl.value = String(Shared.readCounter(getSandboxName(), trimVal(baseEmailEl)));
    updateEmailPreview();
  }

  function persistCounter(n) {
    Shared.persistCounter(getSandboxName(), trimVal(baseEmailEl), n);
  }

  function bumpCounter() {
    const next = Shared.incrementCounter(getSandboxName(), trimVal(baseEmailEl));
    counterEl.value = String(next);
    updateEmailPreview();
  }

  // ---------- Streaming connection (Firestore) ----------
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
  }

  async function loadConnectionFromFirestore(silent) {
    try {
      const res = await fetch('/api/travel-profile-connection' + querySuffix());
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        if (!silent) showInfraMessage(data.error || 'Failed to load saved connection.', 'error');
        return false;
      }
      const rec = data.record;
      if (rec && rec.streaming) {
        fillStreamingFields(rec.streaming);
        if (!silent) showInfraMessage('Loaded saved Travel Profile connection for this sandbox.', 'success');
        applyConfiguredCollapseState();
        return true;
      }
      if (!silent) {
        showInfraMessage('No saved Travel connection for this sandbox yet — run the 4 setup steps and Save connection.', '');
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
      const res = await fetch('/api/travel-profile-connection' + querySuffix(), {
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

  async function runStep(step) {
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
      const res = await fetch('/api/travel-profile-infra/step' + querySuffix(), {
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
        console.warn('[travel-profile] infra sync:', e && e.message);
      }
      const msg =
        data.message ||
        (data.manual && Array.isArray(data.nextSteps) ? data.nextSteps.join(' ') : 'Step completed.');
      showInfraMessage(msg, 'success');
      if (Array.isArray(data.nextSteps) && data.nextSteps.length) {
        console.info('[travel-profile-infra] Next steps:', data.nextSteps.join('\n'));
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
      const res = await fetch('/api/travel-profile-infra/status' + querySuffix());
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
        console.warn('[travel-profile] status sync:', e && e.message);
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
    showInfraMessage('Looking up Travel dataflow in Flow Service…', '');
    try {
      const flowId = trimVal(streamFlowIdEl);
      const flowName = trimVal(streamFlowNameEl);
      const extra = {};
      if (flowId) extra.flowId = flowId;
      if (!flowId && flowName) extra.flowName = flowName;
      const res = await fetch('/api/travel-profile-infra/flow-lookup' + querySuffix(extra));
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

  // ---------- Customer Analytics editor wiring (mirror of Generic) ----------
  function pickSliderToken(pct, reverse) {
    if (pct < 0.34) return reverse ? '--dash-success-border' : '--dash-error-border';
    if (pct < 0.67) return '--dash-warning-border';
    return reverse ? '--dash-error-border' : '--dash-success-border';
  }

  function applySliderTint(input, reverse) {
    if (!input) return;
    if (input.disabled) {
      input.style.setProperty('--gen-slider-fill', 'var(--dash-input-border)');
      input.style.setProperty('--gen-slider-pct', '0%');
      return;
    }
    const min = Number(input.min);
    const max = Number(input.max);
    const val = Number(input.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(val)) return;
    const pct = Math.max(0, Math.min(1, (val - min) / (max - min)));
    const token = pickSliderToken(pct, !!reverse);
    input.style.setProperty('--gen-slider-fill', `var(${token})`);
    input.style.setProperty('--gen-slider-pct', `${(pct * 100).toFixed(2)}%`);
  }

  function renderChurn() { if (churnValueEl && churnEl) churnValueEl.textContent = `${churnEl.value || 0}%`; }
  function renderPropensity() {
    if (propensityValueEl && propensityEl) propensityValueEl.textContent = `${propensityEl.value || 0}%`;
  }
  function renderAov() {
    const n = parseInt(aovEl && aovEl.value ? aovEl.value : '0', 10) || 0;
    if (aovValueEl) aovValueEl.textContent = `$${n.toLocaleString('en-US')}`;
  }

  function syncChurnSlider() { renderChurn(); applySliderTint(churnEl, true); }
  function syncPropensitySlider() { renderPropensity(); applySliderTint(propensityEl, false); }
  function syncAovSlider() { renderAov(); applySliderTint(aovEl, false); }

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

  function selectNonEmptyValues(selectEl) {
    if (!selectEl || !selectEl.options) return [];
    const out = [];
    for (let i = 0; i < selectEl.options.length; i++) {
      const v = selectEl.options[i].value;
      if (v !== '') out.push(v);
    }
    return out;
  }

  const PREFERRED_CHANNEL_RANDOM_SKIP = new Set(['unknown', 'none']);

  function selectPreferredChannelValuesForRandom(selectEl) {
    const raw = selectNonEmptyValues(selectEl);
    const filtered = raw.filter((v) => !PREFERRED_CHANNEL_RANDOM_SKIP.has(String(v).toLowerCase()));
    if (filtered.length) return filtered;
    return raw.includes('email') ? ['email'] : raw;
  }

  function resolveGenderOptionValue(selectEl, canonicalLower) {
    if (!selectEl || !selectEl.options) return '';
    const want = String(canonicalLower || '').toLowerCase();
    for (let i = 0; i < selectEl.options.length; i++) {
      const v = selectEl.options[i].value;
      if (v !== '' && String(v).toLowerCase() === want) return v;
    }
    return '';
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

  // Travel-flavoured persona randomization for Generate-N. Each generated
  // profile carries a full Travel-schema-aligned reservation + preferences
  // bundle so the rendered profile in AEP looks like a real travel customer
  // even when the operator only fills the analytics sliders.
  //
  // What gets streamed (matches AEP Lab - Travel Profile - Schema in apalmer):
  //   _<tenant>.travelReservations.flightReservations.{usaFlight, numberofPassengers,
  //     flightNumber, flightDate, flightClass, departureCountry, departureAirportCode,
  //     confirmationNumber, childrenTravelling, arrivalCountry, arrivalAirportCode,
  //     multiLeg.{multiLeg, numberofLayovers, layoverDuration_1/_2,
  //               layoverAirport_1, layoverAiport_2 (sic — typo preserved upstream),
  //               layoverAirportCode_1/_2}}
  //   travelPreferences.{meal, seat, seatSection, roomType, vehicleType,
  //     preferredDepartureAirportCode, ticketDelivery, gym, pool, earlyCheckIn, ...}
  //     (root-level OOTB Adobe travel-preferences mixin)
  //
  // What is NOT streamed (no schema home today — see hint banner in profile-generation.html):
  //   _<tenant>.individualCharacteristics.travel.* (favouriteAirline, primaryTravelClass, recentStay)
  //   _<tenant>.travelReservations.{hotelReservations, carReservations}.*
  // The form inputs for those subsections still render so an operator can preview
  // a richer travel persona, but the values stay client-side until the Travel Profile
  // schema gains a tenant FG that exposes them.
  const RANDOM_AIRLINES = [
    'British Airways', 'Air France', 'Lufthansa', 'KLM', 'Emirates',
    'Qatar Airways', 'Delta Air Lines', 'United Airlines', 'American Airlines',
    'Singapore Airlines', 'Cathay Pacific', 'ANA', 'Turkish Airlines', 'Iberia',
  ];

  // Map display name → 2-letter IATA code so flightNumber prefixes match the
  // randomly-picked favourite airline (BA0287, EK1145, etc.).
  const AIRLINE_IATA = {
    'British Airways': 'BA', 'Air France': 'AF', 'Lufthansa': 'LH', 'KLM': 'KL',
    'Emirates': 'EK', 'Qatar Airways': 'QR', 'Delta Air Lines': 'DL',
    'United Airlines': 'UA', 'American Airlines': 'AA', 'Singapore Airlines': 'SQ',
    'Cathay Pacific': 'CX', 'ANA': 'NH', 'Turkish Airlines': 'TK', 'Iberia': 'IB',
  };

  // Curated airport pool. Each entry carries the country + USA flag so we can
  // derive _<tenant>.travelReservations.flightReservations.{departureCountry,
  // arrivalCountry, usaFlight} from the picked codes without a second API call.
  const AIRPORTS = [
    { code: 'LHR', city: 'London',         country: 'United Kingdom',     isUSA: false },
    { code: 'CDG', city: 'Paris',          country: 'France',             isUSA: false },
    { code: 'FRA', city: 'Frankfurt',      country: 'Germany',            isUSA: false },
    { code: 'AMS', city: 'Amsterdam',      country: 'Netherlands',        isUSA: false },
    { code: 'MAD', city: 'Madrid',         country: 'Spain',              isUSA: false },
    { code: 'FCO', city: 'Rome',           country: 'Italy',              isUSA: false },
    { code: 'IST', city: 'Istanbul',       country: 'Turkey',             isUSA: false },
    { code: 'DXB', city: 'Dubai',          country: 'United Arab Emirates', isUSA: false },
    { code: 'DOH', city: 'Doha',           country: 'Qatar',              isUSA: false },
    { code: 'SIN', city: 'Singapore',      country: 'Singapore',          isUSA: false },
    { code: 'HKG', city: 'Hong Kong',      country: 'Hong Kong',          isUSA: false },
    { code: 'NRT', city: 'Tokyo',          country: 'Japan',              isUSA: false },
    { code: 'SYD', city: 'Sydney',         country: 'Australia',          isUSA: false },
    { code: 'YYZ', city: 'Toronto',        country: 'Canada',             isUSA: false },
    { code: 'JFK', city: 'New York',       country: 'United States',      isUSA: true },
    { code: 'LAX', city: 'Los Angeles',    country: 'United States',      isUSA: true },
    { code: 'SFO', city: 'San Francisco',  country: 'United States',      isUSA: true },
    { code: 'ORD', city: 'Chicago',        country: 'United States',      isUSA: true },
    { code: 'MIA', city: 'Miami',          country: 'United States',      isUSA: true },
  ];

  // OOTB Travel Preferences mixin enums (root-level travelPreferences.*).
  const MEAL_OPTIONS    = ['Standard', 'Vegetarian', 'Vegan', 'Kosher', 'Halal', 'Gluten-Free', 'Low-Sodium'];
  const SEAT_OPTIONS    = ['window', 'aisle', 'middle'];
  const SEAT_SECTION    = ['front', 'middle', 'rear'];
  const ROOM_TYPES      = ['King', 'Queen', 'Twin', 'Suite', 'Studio'];
  const VEHICLE_TYPES   = ['Compact', 'Sedan', 'SUV', 'Luxury', 'Convertible', 'Minivan'];
  const TICKET_DELIVERY = ['mobile', 'email', 'printed'];

  // Module-level "pending" state populated by applyRandomCustomerPersonaForGenerate
  // and consumed-then-cleared by buildUpdatesFromForm. Lets the randomizer attach
  // schema-valid extras (departureCountry, usaFlight, multiLeg sub-fields, root
  // travelPreferences.*) that have no UI inputs without polluting the form DOM.
  let pendingFlightExtras = null;
  let pendingTravelPreferences = null;

  function pickAirportPair() {
    const dep = randomPick(AIRPORTS);
    let arr = randomPick(AIRPORTS);
    let guard = 0;
    while (arr.code === dep.code && guard < 6) {
      arr = randomPick(AIRPORTS);
      guard += 1;
    }
    return { dep, arr };
  }

  function isoFutureDate(daysAhead) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().slice(0, 10);
  }

  function randomConfirmationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous
    let out = '';
    for (let i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function randomFlightNumber(airlineDisplay) {
    const code = AIRLINE_IATA[airlineDisplay] || randomPick(['BA', 'AF', 'LH', 'EK', 'QR']);
    return `${code}${String(randomBetween(100, 4999)).padStart(4, '0')}`;
  }

  // Build the full random Travel persona once per Generate iteration. Mutates
  // form fields (so snapshotForm + summariseSnapshot stay accurate) AND stashes
  // schema-only extras into pendingFlightExtras / pendingTravelPreferences so
  // buildUpdatesFromForm can stream them.
  function generateRandomTravelPersona() {
    const airline = randomPick(RANDOM_AIRLINES);
    const { dep, arr } = pickAirportPair();
    const passengers = randomBetween(1, 4);
    const childrenTravelling = passengers >= 2 && Math.random() < 0.3;
    const flightClassRaw = randomPick(['economy', 'economy', 'economy', 'premium_economy', 'business', 'business', 'first']);
    const isMultiLeg = Math.random() < 0.35;
    const layovers = isMultiLeg ? randomBetween(1, 2) : 0;
    const layover1 = isMultiLeg ? randomPick(AIRPORTS.filter((a) => a.code !== dep.code && a.code !== arr.code)) : null;
    const layover2 = isMultiLeg && layovers === 2
      ? randomPick(AIRPORTS.filter((a) => a.code !== dep.code && a.code !== arr.code && a.code !== (layover1 && layover1.code)))
      : null;

    // Mutate the form so the existing (toggle-gated) buildUpdatesFromForm path
    // pushes the visible inputs. The reservations toggle is auto-checked below.
    if (favouriteAirlineEl) favouriteAirlineEl.value = airline;
    if (primaryTravelClassEl && !trimVal(primaryTravelClassEl)) {
      const opts = selectNonEmptyValues(primaryTravelClassEl);
      if (opts.includes(flightClassRaw)) primaryTravelClassEl.value = flightClassRaw;
    }
    if (flightDepartureEl) flightDepartureEl.value = dep.code;
    if (flightArrivalEl) flightArrivalEl.value = arr.code;
    if (flightNumberEl) flightNumberEl.value = randomFlightNumber(airline);
    if (flightDateEl) flightDateEl.value = isoFutureDate(randomBetween(7, 120));
    if (flightClassEl) {
      const opts = selectNonEmptyValues(flightClassEl);
      flightClassEl.value = opts.includes(flightClassRaw) ? flightClassRaw : (opts[0] || '');
    }
    if (flightConfirmationEl) flightConfirmationEl.value = randomConfirmationCode();
    if (flightPassengersEl) flightPassengersEl.value = String(passengers);
    if (flightChildrenEl) flightChildrenEl.value = childrenTravelling ? 'true' : 'false';
    if (flightMultiLegEl) flightMultiLegEl.value = isMultiLeg ? 'true' : 'false';
    if (flightLayoversEl) flightLayoversEl.value = String(layovers);

    // Auto-enable the reservations toggle so the existing push-from-form code
    // for the visible flight inputs runs. The Hotel/Car form fields are dead
    // (no schema home) so we leave them blank — the proxy receives nothing for
    // them and the OOTB travelPreferences mixin covers room/vehicle preferences.
    if (reservationsEnabledEl && !reservationsEnabledEl.checked) {
      reservationsEnabledEl.checked = true;
      try { applyReservationsToggleVisibility(); } catch (_) {}
    }

    // Stash flightReservations leaves that don't have a UI input.
    pendingFlightExtras = {
      usaFlight: !!(dep.isUSA || arr.isUSA),
      departureCountry: dep.country,
      arrivalCountry: arr.country,
      multiLeg: {
        layoverAirport_1: layover1 ? layover1.city : '',
        layoverAirportCode_1: layover1 ? layover1.code : '',
        layoverDuration_1: layover1 ? randomBetween(45, 240) : 0,
        // Schema typo preserved upstream: `layoverAiport_2` (note missing 'r').
        layoverAiport_2: layover2 ? layover2.city : '',
        layoverAirportCode_2: layover2 ? layover2.code : '',
        layoverDuration_2: layover2 ? randomBetween(45, 240) : 0,
      },
    };

    // Stash root-level OOTB travel preferences (no UI inputs today). Booleans
    // bias toward leisure-friendly defaults; strings pick from the OOTB enums.
    pendingTravelPreferences = {
      meal: randomPick(MEAL_OPTIONS),
      seat: randomPick(SEAT_OPTIONS),
      seatSection: randomPick(SEAT_SECTION),
      roomType: randomPick(ROOM_TYPES),
      vehicleType: randomPick(VEHICLE_TYPES),
      preferredDepartureAirportCode: dep.code,
      ticketDelivery: randomPick(TICKET_DELIVERY),
      gym: Math.random() < 0.6,
      pool: Math.random() < 0.7,
      hasRestaurant: true,
      earlyCheckIn: Math.random() < 0.5,
      roomService: Math.random() < 0.4,
      foamPillows: Math.random() < 0.3,
      crib: childrenTravelling && Math.random() < 0.5,
      rollAwayBed: childrenTravelling && Math.random() < 0.3,
      smokingRoom: false,
      smokingVehicle: false,
      manualTransmission: Math.random() < 0.15,
      visuallyImpairedAccessible: false,
      wheelchairAccessible: Math.random() < 0.05,
    };
  }

  function applyRandomCustomerPersonaForGenerate() {
    const mfCanon = ['male', 'female'];
    const available = [];
    for (const c of mfCanon) {
      const optVal = resolveGenderOptionValue(genderEl, c);
      if (optVal) available.push({ canon: c, optVal });
    }
    let genderCanon = 'female';
    let genderValue = '';
    if (available.length) {
      const chosen = randomPick(available);
      genderCanon = chosen.canon;
      genderValue = chosen.optVal;
    }
    if (genderEl && genderValue) genderEl.value = genderValue;

    if (firstNameEl) firstNameEl.value = randomFirstNameForGender(genderCanon);
    if (lastNameEl) lastNameEl.value = randomPick(RANDOM_LAST_NAMES);

    randomizeSliderControl(churnEl);
    randomizeSliderControl(propensityEl);
    randomizeSliderControl(aovEl);

    const npsChoices = selectNonEmptyValues(npsEl);
    if (npsEl && npsChoices.length) npsEl.value = randomPick(npsChoices);

    const prefChoices = selectPreferredChannelValuesForRandom(preferredChannelEl);
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

    // Full Travel persona — picks airline + airport pair + class, fills the
    // visible flight reservation form fields, auto-checks the reservations
    // toggle (so the existing buildUpdatesFromForm push code runs), and stashes
    // the schema-only extras (departureCountry, usaFlight, multiLeg layovers,
    // root travelPreferences.*) into module-level pending state for
    // buildUpdatesFromForm to consume on the next call.
    generateRandomTravelPersona();
  }

  function snapshotForm() {
    const loyaltyEnabled = !!(loyaltyEnabledEl && loyaltyEnabledEl.checked);
    const recentStayOn = !!(recentStayEnabledEl && recentStayEnabledEl.checked);
    const reservationsOn = !!(reservationsEnabledEl && reservationsEnabledEl.checked);
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
      travel: {
        favouriteAirline: trimVal(favouriteAirlineEl),
        primaryTravelClass: trimVal(primaryTravelClassEl),
        recentStay: recentStayOn ? {
          enabled: true,
          hotelName: trimVal(recentStayHotelEl),
          city: trimVal(recentStayCityEl),
          country: trimVal(recentStayCountryEl),
          checkIn: trimVal(recentStayCheckInEl),
          checkOut: trimVal(recentStayCheckOutEl),
          roomType: trimVal(recentStayRoomTypeEl),
        } : { enabled: false },
        reservations: reservationsOn ? {
          enabled: true,
          flight: {
            departure: trimVal(flightDepartureEl),
            arrival: trimVal(flightArrivalEl),
            number: trimVal(flightNumberEl),
            date: trimVal(flightDateEl),
            class: trimVal(flightClassEl),
            confirmation: trimVal(flightConfirmationEl),
            passengers: trimVal(flightPassengersEl),
            children: trimVal(flightChildrenEl),
            multiLeg: trimVal(flightMultiLegEl),
            layovers: trimVal(flightLayoversEl),
          },
          hotel: {
            name: trimVal(hotelNameEl),
            city: trimVal(hotelCityEl),
            country: trimVal(hotelCountryEl),
            checkIn: trimVal(hotelCheckInEl),
            checkOut: trimVal(hotelCheckOutEl),
            roomType: trimVal(hotelRoomTypeEl),
            confirmation: trimVal(hotelConfirmationEl),
          },
          car: {
            company: trimVal(carCompanyEl),
            pickupCity: trimVal(carPickupCityEl),
            class: trimVal(carClassEl),
            pickupDate: trimVal(carPickupDateEl),
            returnDate: trimVal(carReturnDateEl),
            confirmation: trimVal(carConfirmationEl),
          },
        } : { enabled: false },
      },
    };
  }

  /**
   * Travel update list. Same Generic Customer Analytics + Loyalty paths
   * (so Travel profiles still carry churn/propensity/NPS/AOV/etc.) PLUS
   * Travel-specific tenant paths under `individualCharacteristics.travel.*`
   * and `travelReservations.*`. The proxy auto-prefixes paths whose top
   * segment isn't in PROFILE_STREAM_ROOT_PATH_PREFIXES with the discovered
   * tenant XDM key (e.g. `_demoemea`), so we only specify suffixes here.
   */
  function buildUpdatesFromForm() {
    const updates = [];
    const push = (path, value) => updates.push({ path, value });

    // Identity (root via PROFILE_STREAM_ROOT_PATH_PREFIXES)
    const firstName = trimVal(firstNameEl);
    if (firstName) push('person.name.firstName', firstName);
    const lastName = trimVal(lastNameEl);
    if (lastName) push('person.name.lastName', lastName);

    // Customer Analytics (Profile Core v2 tenant paths — see Generic comments)
    const churnRaw = churnEl ? String(churnEl.value || '').trim() : '';
    const propRaw = propensityEl ? String(propensityEl.value || '').trim() : '';
    const aovRaw = aovEl ? String(aovEl.value || '').trim() : '';
    const npsRaw = npsEl ? String(npsEl.value || '').trim() : '';
    if (churnRaw !== '') push('scoring.churn.churnPrediction', Number(churnRaw));
    if (propRaw !== '') push('scoring.core.propensityScore', Number(propRaw));
    if (npsRaw !== '') push('scoring.npsScore', parseInt(npsRaw, 10));
    if (aovRaw !== '') push('orderProfile.avgOrderSize', Number(aovRaw));

    const preferredRaw = preferredChannelEl ? String(preferredChannelEl.value || '').trim() : '';
    if (preferredRaw !== '') push('consents.marketing.preferred', preferredRaw);

    const lang = languageEl ? trimVal(languageEl) : '';
    if (lang) {
      push('preferences.preferredLanguage', lang);
      push('personalEmail.language', lang);
    }

    const gender = genderEl ? trimVal(genderEl) : '';
    if (gender) push('person.gender', gender);

    const loyaltyEnabled = !!(loyaltyEnabledEl && loyaltyEnabledEl.checked);
    if (loyaltyEnabled) {
      const loyaltyID = loyaltyIDEl ? trimVal(loyaltyIDEl) : '';
      if (loyaltyID) {
        push('identification.core.loyaltyId', loyaltyID);
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

    // Travel attributes — schema-aligned with `AEP Lab - Travel Profile - Schema`
    // (Profile Core v2 tenant subtree + OOTB Adobe travel-preferences mixin).
    //
    // NOTE on dropped paths:
    //   - `individualCharacteristics.travel.{favouriteAirlineCompany, primaryTravelClass,
    //     recentStay.*}` is NOT in the current schema's `_<tenant>` subtree. The favourite
    //     airline / primary travel class form inputs still drive the Generate randomizer
    //     (airline picks the IATA prefix for flightNumber, class flows into flightClass),
    //     and recentStay form fields stay client-side only. AEP would silently drop them
    //     if streamed, which is the bug that caused "travel profiles with only generic
    //     attributes" before.
    //   - `travelReservations.{hotelReservations, carReservations}.*` likewise have no
    //     schema home today. The OOTB `travelPreferences.{roomType, vehicleType}` covers
    //     room/vehicle preferences instead, and Generate now populates those.
    if (reservationsEnabledEl && reservationsEnabledEl.checked) {
      const flightPath = 'travelReservations.flightReservations';
      const v = (el) => trimVal(el);
      const intVal = (el) => {
        const s = trimVal(el);
        if (!s) return null;
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : null;
      };
      const boolFromTriState = (el) => {
        const s = trimVal(el);
        if (s === 'true') return true;
        if (s === 'false') return false;
        return null;
      };

      // Visible flight inputs.
      if (v(flightDepartureEl)) push(`${flightPath}.departureAirportCode`, v(flightDepartureEl));
      if (v(flightArrivalEl)) push(`${flightPath}.arrivalAirportCode`, v(flightArrivalEl));
      if (v(flightNumberEl)) push(`${flightPath}.flightNumber`, v(flightNumberEl));
      if (v(flightDateEl)) push(`${flightPath}.flightDate`, v(flightDateEl));
      if (v(flightClassEl)) push(`${flightPath}.flightClass`, v(flightClassEl));
      if (v(flightConfirmationEl)) push(`${flightPath}.confirmationNumber`, v(flightConfirmationEl));
      const pax = intVal(flightPassengersEl);
      if (pax != null) push(`${flightPath}.numberofPassengers`, pax);
      const children = boolFromTriState(flightChildrenEl);
      if (children != null) push(`${flightPath}.childrenTravelling`, children);
      const multiLeg = boolFromTriState(flightMultiLegEl);
      if (multiLeg != null) push(`${flightPath}.multiLeg.multiLeg`, multiLeg);
      const layovers = intVal(flightLayoversEl);
      if (layovers != null) push(`${flightPath}.multiLeg.numberofLayovers`, layovers);

      // Schema extras with no UI inputs (populated by Generate randomizer via
      // pendingFlightExtras). Read-and-clear so manual Update flows after a
      // Generate don't accidentally re-emit a stale random country/usaFlight.
      if (pendingFlightExtras) {
        const extras = pendingFlightExtras;
        pendingFlightExtras = null;
        if (typeof extras.usaFlight === 'boolean') push(`${flightPath}.usaFlight`, extras.usaFlight);
        if (extras.departureCountry) push(`${flightPath}.departureCountry`, extras.departureCountry);
        if (extras.arrivalCountry) push(`${flightPath}.arrivalCountry`, extras.arrivalCountry);
        const ml = extras.multiLeg || {};
        if (ml.layoverAirport_1) push(`${flightPath}.multiLeg.layoverAirport_1`, ml.layoverAirport_1);
        if (ml.layoverAirportCode_1) push(`${flightPath}.multiLeg.layoverAirportCode_1`, ml.layoverAirportCode_1);
        if (Number.isFinite(ml.layoverDuration_1)) push(`${flightPath}.multiLeg.layoverDuration_1`, ml.layoverDuration_1);
        // Schema typo preserved upstream: `layoverAiport_2` (note missing 'r').
        if (ml.layoverAiport_2) push(`${flightPath}.multiLeg.layoverAiport_2`, ml.layoverAiport_2);
        if (ml.layoverAirportCode_2) push(`${flightPath}.multiLeg.layoverAirportCode_2`, ml.layoverAirportCode_2);
        if (Number.isFinite(ml.layoverDuration_2)) push(`${flightPath}.multiLeg.layoverDuration_2`, ml.layoverDuration_2);
      }
    }

    // Root-level OOTB Travel Preferences mixin (https://ns.adobe.com/xdm/mixins/profile/
    // travel-preferences). Routes to XDM root because `travelPreferences` is in
    // PROFILE_STREAM_ROOT_PATH_PREFIXES — without that the proxy would tenant-prefix it
    // to `_<tenant>.travelPreferences.*` and AEP would drop the values.
    if (pendingTravelPreferences) {
      const prefs = pendingTravelPreferences;
      pendingTravelPreferences = null;
      const prefsPath = 'travelPreferences';
      for (const [k, val] of Object.entries(prefs)) {
        if (val == null) continue;
        if (typeof val === 'string' && val.trim() === '') continue;
        push(`${prefsPath}.${k}`, val);
      }
    }

    return updates;
  }

  /**
   * Hydrate the editor below from a /api/profile/table response. Same
   * suffix-/keyword-match strategy as Generic for tenant-agnostic handling
   * (we don't hard-code `_demoemea` etc.). Travel attributes are pulled
   * back from the same paths buildUpdatesFromForm sends them out on.
   */
  function applyProfileFindResultToForm(found) {
    if (!found || typeof found !== 'object') return;
    const rows = Array.isArray(found.rows) ? found.rows : null;
    const trim = (v) => (v == null ? '' : String(v).trim());
    const pathLower = (r) => String(r && r.path || '').toLowerCase().replace(/_/g, '.');

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

    const firstName = findBySuffix(['firstname', 'givenname']);
    const lastName = findBySuffix(['lastname', 'surname', 'familyname']);
    const churn = findByKeywords('churn', 'prediction') || findBySuffix(['churnprediction', 'churnscore']);
    const propensity = findByKeywords('scoring', 'propensity') || findBySuffix(['propensityscore']);
    const nps = findBySuffix(['npsscore']) || findByKeywords('scoring', 'nps');
    const aov = findBySuffix(['avgordersize', 'averageordervalue']);
    const lang = findBySuffix(['preferredlanguage']) ||
      findByKeywords('personalemail', 'language') ||
      findBySuffix(['language', 'locale']);
    const gender = findBySuffix(['gender']) || findByKeywords('person', 'gender');
    const preferredChannel = findBySuffix(['marketing.preferred']);
    const loyaltyId =
      findByKeywords('loyalty', 'loyaltyid') ||
      findByKeywords('identification', 'loyaltyid') ||
      findBySuffix(['loyaltyid']);
    const tier = findByKeywords('loyalty', 'tier') ||
      findByKeywords('loyaltydetails', 'level') ||
      findBySuffix(['tier']);
    const points = findByKeywords('loyalty', 'points') ||
      findByKeywords('loyaltydetails', 'points');

    // Travel
    const favAirline = findBySuffix(['favouriteairlinecompany', 'favoriteairlinecompany']);
    const travelClass = findBySuffix(['primarytravelclass']);

    if (firstName && firstNameEl) firstNameEl.value = firstName;
    if (lastName && lastNameEl) lastNameEl.value = lastName;
    if (churn && churnEl) { churnEl.value = churn; syncChurnSlider(); }
    if (propensity && propensityEl) { propensityEl.value = propensity; syncPropensitySlider(); }
    if (nps && npsEl) npsEl.value = nps;
    if (aov && aovEl) { aovEl.value = aov; syncAovSlider(); }
    setSelectValueLoose(languageEl, lang);
    setSelectValueLoose(genderEl, gender);
    setSelectValueLoose(preferredChannelEl, preferredChannel);

    const hasLoyalty = !!(loyaltyId || tier || points);
    if (hasLoyalty && loyaltyEnabledEl) {
      loyaltyEnabledEl.checked = true;
      applyLoyaltyToggleVisibility();
    }
    if (loyaltyId && loyaltyIDEl) loyaltyIDEl.value = loyaltyId;
    setSelectValueLoose(loyaltyTierEl, tier);
    if (points && loyaltyPointsEl) loyaltyPointsEl.value = points;

    if (favAirline && favouriteAirlineEl) favouriteAirlineEl.value = favAirline;
    setSelectValueLoose(primaryTravelClassEl, travelClass);
  }

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
      if (infraDetailsEl) infraDetailsEl.open = true;
      setMessage(
        messageEl,
        `Streaming connection missing: ${missing.join(', ')}. Run setup or click Fetch URL & Flow ID, then Save connection.`,
        'error'
      );
      return null;
    }
    return s;
  }

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
      setMessage(messageEl, 'No fields to update — fill at least one Customer Analytics or Travel field.', 'warning');
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
    setMessage(messageEl, `Generating ${count} Travel profile${count === 1 ? '' : 's'}…`, '');
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
          if (!dryRun) {
            recordGenerated(email, n, snapshotForm());
            persistLastStreamed(email, n);
          }
        } catch (e) {
          lastError = e.message || 'Network error';
          break;
        }
        bumpCounter();
      }
      if (successCount === count && !lastError) {
        setMessage(
          messageEl,
          `Generated ${successCount} Travel profile${successCount === 1 ? '' : 's'}${dryRun ? ' (dry run)' : ''}. Latest: ${lastEmail}.`,
          'success'
        );
      } else if (successCount > 0) {
        setMessage(
          messageEl,
          `Generated ${successCount}/${count} Travel profile${count === 1 ? '' : 's'} before stopping. Last error: ${lastError}`,
          'warning'
        );
      } else {
        setMessage(messageEl, `Generate failed: ${lastError || 'unknown error'}.`, 'error');
      }
    } finally {
      generateBtn.disabled = false;
    }
  }

  // ---------- Toggle UX ----------
  function applyLoyaltyToggleVisibility() {
    const enabled = !!(loyaltyEnabledEl && loyaltyEnabledEl.checked);
    if (loyaltyFieldsEl) loyaltyFieldsEl.hidden = !enabled;
    if (loyaltyEnabledEl) loyaltyEnabledEl.setAttribute('aria-expanded', enabled ? 'true' : 'false');
  }
  function applyRecentStayToggleVisibility() {
    const enabled = !!(recentStayEnabledEl && recentStayEnabledEl.checked);
    if (recentStayFieldsEl) recentStayFieldsEl.hidden = !enabled;
    if (recentStayEnabledEl) recentStayEnabledEl.setAttribute('aria-expanded', enabled ? 'true' : 'false');
  }
  function applyReservationsToggleVisibility() {
    const enabled = !!(reservationsEnabledEl && reservationsEnabledEl.checked);
    if (reservationsFieldsEl) reservationsFieldsEl.hidden = !enabled;
    if (reservationsEnabledEl) reservationsEnabledEl.setAttribute('aria-expanded', enabled ? 'true' : 'false');
  }

  // ---------- Recently-generated picker (shared storage) ----------
  function readRecent() {
    return Shared.readRecent(getSandboxName(), trimVal(baseEmailEl));
  }

  function recordGenerated(scaledEmail, n, snapshotOverride) {
    if (!scaledEmail) return;
    const snap =
      snapshotOverride && typeof snapshotOverride === 'object' ? snapshotOverride : snapshotForm();
    Shared.pushRecent(getSandboxName(), trimVal(baseEmailEl), {
      scaledEmail,
      n: Number.isFinite(n) ? n : null,
      ts: Date.now(),
      snapshot: snap,
    });
    renderRecent();
    if (typeof window.addRecentIdentifier === 'function') {
      try { window.addRecentIdentifier(scaledEmail, 'email'); } catch (_) {}
    }
  }

  function summariseSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return '';
    const parts = [];
    if (snap.firstName || snap.lastName) parts.push(`${snap.firstName || ''} ${snap.lastName || ''}`.trim());
    if (snap.gender) parts.push(snap.gender);
    if (snap.travel && snap.travel.favouriteAirline) parts.push(`Airline: ${snap.travel.favouriteAirline}`);
    if (snap.travel && snap.travel.primaryTravelClass) parts.push(snap.travel.primaryTravelClass);
    if (snap.loyalty && snap.loyalty.enabled) {
      const lp = [];
      if (snap.loyalty.tier) lp.push(snap.loyalty.tier);
      if (snap.loyalty.points) lp.push(`${snap.loyalty.points} pts`);
      parts.push(`Loyalty: ${lp.join(' · ') || 'on'}`);
    }
    if (snap.nps) parts.push(`NPS ${snap.nps}`);
    if (snap.aov) parts.push(`AOV $${snap.aov}`);
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
      if (list.some((e) => e.scaledEmail === prev)) recentSelectEl.value = prev;
    }
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
    if (firstNameEl) firstNameEl.value = s.firstName || '';
    if (lastNameEl) lastNameEl.value = s.lastName || '';
    if (genderEl) genderEl.value = s.gender || '';
    if (churnEl && s.churn !== '') { churnEl.value = String(s.churn); syncChurnSlider(); }
    if (propensityEl && s.propensity !== '') { propensityEl.value = String(s.propensity); syncPropensitySlider(); }
    if (npsEl) npsEl.value = s.nps || '';
    if (aovEl && s.aov !== '') { aovEl.value = String(s.aov); syncAovSlider(); }
    if (preferredChannelEl) preferredChannelEl.value = s.preferredChannel || '';
    if (languageEl) languageEl.value = s.language || '';
    if (loyaltyEnabledEl) loyaltyEnabledEl.checked = !!(s.loyalty && s.loyalty.enabled);
    if (loyaltyIDEl) loyaltyIDEl.value = (s.loyalty && s.loyalty.id) || '';
    if (loyaltyTierEl) loyaltyTierEl.value = (s.loyalty && s.loyalty.tier) || '';
    if (loyaltyPointsEl) loyaltyPointsEl.value = (s.loyalty && s.loyalty.points) || '';
    applyLoyaltyToggleVisibility();

    // Travel
    const t = s.travel || {};
    if (favouriteAirlineEl) favouriteAirlineEl.value = t.favouriteAirline || '';
    if (primaryTravelClassEl) primaryTravelClassEl.value = t.primaryTravelClass || '';
    if (recentStayEnabledEl && t.recentStay) {
      recentStayEnabledEl.checked = !!t.recentStay.enabled;
      if (t.recentStay.enabled) {
        if (recentStayHotelEl) recentStayHotelEl.value = t.recentStay.hotelName || '';
        if (recentStayCityEl) recentStayCityEl.value = t.recentStay.city || '';
        if (recentStayCountryEl) recentStayCountryEl.value = t.recentStay.country || '';
        if (recentStayCheckInEl) recentStayCheckInEl.value = t.recentStay.checkIn || '';
        if (recentStayCheckOutEl) recentStayCheckOutEl.value = t.recentStay.checkOut || '';
        if (recentStayRoomTypeEl) recentStayRoomTypeEl.value = t.recentStay.roomType || '';
      }
      applyRecentStayToggleVisibility();
    }
    if (reservationsEnabledEl && t.reservations) {
      reservationsEnabledEl.checked = !!t.reservations.enabled;
      if (t.reservations.enabled) {
        const f = t.reservations.flight || {};
        const h = t.reservations.hotel || {};
        const c = t.reservations.car || {};
        if (flightDepartureEl) flightDepartureEl.value = f.departure || '';
        if (flightArrivalEl) flightArrivalEl.value = f.arrival || '';
        if (flightNumberEl) flightNumberEl.value = f.number || '';
        if (flightDateEl) flightDateEl.value = f.date || '';
        if (flightClassEl) flightClassEl.value = f.class || '';
        if (flightConfirmationEl) flightConfirmationEl.value = f.confirmation || '';
        if (flightPassengersEl) flightPassengersEl.value = f.passengers || '';
        if (flightChildrenEl) flightChildrenEl.value = f.children || '';
        if (flightMultiLegEl) flightMultiLegEl.value = f.multiLeg || '';
        if (flightLayoversEl) flightLayoversEl.value = f.layovers || '';
        if (hotelNameEl) hotelNameEl.value = h.name || '';
        if (hotelCityEl) hotelCityEl.value = h.city || '';
        if (hotelCountryEl) hotelCountryEl.value = h.country || '';
        if (hotelCheckInEl) hotelCheckInEl.value = h.checkIn || '';
        if (hotelCheckOutEl) hotelCheckOutEl.value = h.checkOut || '';
        if (hotelRoomTypeEl) hotelRoomTypeEl.value = h.roomType || '';
        if (hotelConfirmationEl) hotelConfirmationEl.value = h.confirmation || '';
        if (carCompanyEl) carCompanyEl.value = c.company || '';
        if (carPickupCityEl) carPickupCityEl.value = c.pickupCity || '';
        if (carClassEl) carClassEl.value = c.class || '';
        if (carPickupDateEl) carPickupDateEl.value = c.pickupDate || '';
        if (carReturnDateEl) carReturnDateEl.value = c.returnDate || '';
        if (carConfirmationEl) carConfirmationEl.value = c.confirmation || '';
      }
      applyReservationsToggleVisibility();
    }

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
  if (stepCreateSchemaBtn) stepCreateSchemaBtn.addEventListener('click', () => runStep('createSchema'));
  if (stepAttachFgBtn) stepAttachFgBtn.addEventListener('click', () => runStep('attachFieldGroups'));
  if (stepCreateDatasetBtn) stepCreateDatasetBtn.addEventListener('click', () => runStep('createDataset'));
  if (stepHttpFlowBtn) stepHttpFlowBtn.addEventListener('click', () => runStep('httpFlow'));

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
      Shared.writeBaseEmail(getSandboxName(), baseEmailEl.value || '');
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

  if (churnEl) churnEl.addEventListener('input', syncChurnSlider);
  if (propensityEl) propensityEl.addEventListener('input', syncPropensitySlider);
  if (aovEl) aovEl.addEventListener('input', syncAovSlider);
  if (loyaltyRandomBtn && loyaltyTierEl && loyaltyPointsEl) {
    loyaltyRandomBtn.addEventListener('click', () => {
      const tier = trimVal(loyaltyTierEl);
      loyaltyPointsEl.value = String(randomLoyaltyPointsForTier(tier));
    });
  }

  if (loyaltyEnabledEl) loyaltyEnabledEl.addEventListener('change', applyLoyaltyToggleVisibility);
  if (recentStayEnabledEl) recentStayEnabledEl.addEventListener('change', applyRecentStayToggleVisibility);
  if (reservationsEnabledEl) reservationsEnabledEl.addEventListener('change', applyReservationsToggleVisibility);

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
  if (baseEmailEl) {
    baseEmailEl.addEventListener('input', renderRecent);
  }

  if (lookupBtn) lookupBtn.addEventListener('click', lookupProfile);
  if (lookupIdentifierEl) {
    lookupIdentifierEl.addEventListener('focus', () => {
      if (!trimVal(lookupIdentifierEl) && lookupNsEl && lookupNsEl.value === 'email') {
        const scaled = getDefaultEmailLookupIdentifier();
        if (scaled) lookupIdentifierEl.value = scaled;
      }
    });
    lookupIdentifierEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        lookupProfile();
      }
    });
  }
  if (updateProfileBtn) updateProfileBtn.addEventListener('click', updateProfile);
  if (generateBtn) generateBtn.addEventListener('click', generateProfiles);

  // Sandbox change
  function onSandboxChange() {
    clearStreamingFields();
    applyConfiguredCollapseState();
    loadConnectionFromFirestore(true);
    loadBaseEmailForCurrentSandbox();
    loadCounterForCurrentContext();
    renderRecent();
  }
  if (sandboxSelect) sandboxSelect.addEventListener('change', onSandboxChange);
  window.addEventListener('aep-global-sandbox-change', onSandboxChange);

  window.addEventListener('aep-travel-panel-shown', () => {
    renderRecent();
    applyLoyaltyToggleVisibility();
    applyRecentStayToggleVisibility();
    applyReservationsToggleVisibility();
    applyConfiguredCollapseState();
    // Refresh the picker now that the panel is on screen — the partition
    // depends on the live sandbox + base email, both of which can have
    // changed while the user was on Generic.
    loadCounterForCurrentContext();
  });

  loadBaseEmailForCurrentSandbox();
  if (churnEl) syncChurnSlider();
  if (propensityEl) syncPropensitySlider();
  if (aovEl) syncAovSlider();
  applyLoyaltyToggleVisibility();
  applyRecentStayToggleVisibility();
  applyReservationsToggleVisibility();
  loadCounterForCurrentContext();
  updateEmailPreview();
  renderRecent();
  setTimeout(() => loadConnectionFromFirestore(true), 800);
})();
