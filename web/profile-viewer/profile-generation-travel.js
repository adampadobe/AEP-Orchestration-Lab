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
  // May 2026 single-button consolidation — see runProvisioningStepsCombined()
  // below. Underlying per-step Cloud Functions and the legacy per-step
  // buttons (when still rendered) remain functional for diagnostics.
  const stepRunAllBtn = document.getElementById('travelStepRunAllBtn');
  const infraProgressListEl = document.getElementById('travelInfraProgressList');
  const infraStatusMessage = document.getElementById('travelInfraStatusMessage');
  // Enable schema + dataset for Real-Time Customer Profile (May 2026 addition).
  // Final on-platform action — strict schema-first → dataset-second; idempotent.
  const enableProfileBtn = document.getElementById('travelEnableProfileBtn');
  const enableProfileProgressListEl = document.getElementById('travelEnableProfileProgressList');
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
  // Birth date + age. person.birthDate is a string/date leaf at XDM root
  // (profile-person-details mixin attached by the Travel schema).
  // _<tenant>.individualCharacteristics.core.age is an integer in Profile
  // Core v2. Both populated on every Generate; age is recomputed from
  // birthDate whenever the latter changes so they never drift apart.
  const birthDateEl = document.getElementById('travelBirthDate');
  const ageEl = document.getElementById('travelAge');

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
  // Schema-only flight extras (added 2026-05-02): now editable in the UI.
  const flightDepartureCountryEl = document.getElementById('travelFlightDepartureCountry');
  const flightArrivalCountryEl = document.getElementById('travelFlightArrivalCountry');
  const flightUsaFlightEl = document.getElementById('travelFlightUsaFlight');
  const flightLayover1CodeEl = document.getElementById('travelFlightLayover1Code');
  const flightLayover1NameEl = document.getElementById('travelFlightLayover1Name');
  const flightLayover1DurationEl = document.getElementById('travelFlightLayover1Duration');
  const flightLayover2CodeEl = document.getElementById('travelFlightLayover2Code');
  const flightLayover2NameEl = document.getElementById('travelFlightLayover2Name');
  const flightLayover2DurationEl = document.getElementById('travelFlightLayover2Duration');
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

  // Travel preferences (OOTB Adobe travel-preferences mixin) — root-level paths.
  // Toggle gates the entire block in buildUpdatesFromForm. Strings are <select>
  // / <input>; the 13 amenity / accessibility flags are checkboxes.
  const travelPrefsEnabledEl = document.getElementById('travelPrefsEnabled');
  const travelPrefsFieldsEl = document.getElementById('travelPrefsFields');
  const prefMealEl = document.getElementById('travelPrefMeal');
  const prefSeatEl = document.getElementById('travelPrefSeat');
  const prefSeatSectionEl = document.getElementById('travelPrefSeatSection');
  const prefTicketDeliveryEl = document.getElementById('travelPrefTicketDelivery');
  const prefDepartureAirportEl = document.getElementById('travelPrefDepartureAirport');
  const prefRoomTypeEl = document.getElementById('travelPrefRoomType');
  const prefVehicleTypeEl = document.getElementById('travelPrefVehicleType');
  const prefMedicalAlertsEl = document.getElementById('travelPrefMedicalAlerts');
  const prefGymEl = document.getElementById('travelPrefGym');
  const prefPoolEl = document.getElementById('travelPrefPool');
  const prefEarlyCheckInEl = document.getElementById('travelPrefEarlyCheckIn');
  const prefRoomServiceEl = document.getElementById('travelPrefRoomService');
  const prefHasRestaurantEl = document.getElementById('travelPrefHasRestaurant');
  const prefFoamPillowsEl = document.getElementById('travelPrefFoamPillows');
  const prefCribEl = document.getElementById('travelPrefCrib');
  const prefRollAwayBedEl = document.getElementById('travelPrefRollAwayBed');
  const prefSmokingRoomEl = document.getElementById('travelPrefSmokingRoom');
  const prefManualTransmissionEl = document.getElementById('travelPrefManualTransmission');
  const prefSmokingVehicleEl = document.getElementById('travelPrefSmokingVehicle');
  const prefVisuallyImpairedEl = document.getElementById('travelPrefVisuallyImpaired');
  const prefWheelchairEl = document.getElementById('travelPrefWheelchair');

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
      const recordedStreaming = rec && rec.streaming && typeof rec.streaming === 'object' ? rec.streaming : null;
      const hasFirestoreSchemaAndDataset = !!(recordedStreaming && recordedStreaming.schemaId && recordedStreaming.datasetId);
      if (recordedStreaming) {
        fillStreamingFields(recordedStreaming);
        if (!silent) showInfraMessage('Loaded saved Travel Profile connection for this sandbox.', 'success');
        applyConfiguredCollapseState();
        if (!hasFirestoreSchemaAndDataset && isProfilePanelVisible()) {
          autoDiscoverInfraFromSandbox();
        }
        return hasFirestoreSchemaAndDataset;
      }
      if (!silent) {
        showInfraMessage('No saved Travel connection for this sandbox yet — click "Set up schema, field groups & dataset", then create the HTTP API source and Save connection.', '');
      }
      applyConfiguredCollapseState();
      if (isProfilePanelVisible()) {
        autoDiscoverInfraFromSandbox();
      }
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

  // ---- Combined provisioning (Schema → Field groups → Dataset) ----
  // Mirrors the helper in profile-generation-industry-runtime.js. Travel +
  // Generic pre-date the runtime; we add a parallel
  // runProvisioningStepsCombined() so both modules expose the same
  // single-button UX (May 2026 consolidation).
  const COMBINED_PROVISIONING_STEPS_TRAVEL = [
    { step: 'createSchema',      label: 'Schema' },
    { step: 'attachFieldGroups', label: 'Field groups' },
    { step: 'createDataset',     label: 'Dataset' },
  ];

  function ensureTravelProgressList() {
    if (!infraProgressListEl) return null;
    infraProgressListEl.hidden = false;
    infraProgressListEl.innerHTML = '';
    COMBINED_PROVISIONING_STEPS_TRAVEL.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'consent-infra-progress__item consent-infra-progress__item--pending';
      li.dataset.step = s.step;
      const icon = document.createElement('span');
      icon.className = 'consent-infra-progress__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '·';
      const label = document.createElement('span');
      label.className = 'consent-infra-progress__label';
      label.textContent = `${i + 1}. ${s.label}`;
      const detail = document.createElement('span');
      detail.className = 'consent-infra-progress__detail';
      detail.textContent = '';
      li.append(icon, label, detail);
      infraProgressListEl.appendChild(li);
    });
    return infraProgressListEl;
  }

  function setTravelProgressItem(step, state, detailText) {
    if (!infraProgressListEl) return;
    const li = infraProgressListEl.querySelector(`[data-step="${step}"]`);
    if (!li) return;
    li.className = 'consent-infra-progress__item consent-infra-progress__item--' + state;
    const icon = li.querySelector('.consent-infra-progress__icon');
    const detail = li.querySelector('.consent-infra-progress__detail');
    if (icon) {
      icon.textContent =
        state === 'success' ? '✓' :
        state === 'error'   ? '✗' :
        state === 'working' ? '…' : '·';
    }
    if (detail) detail.textContent = detailText ? ` — ${detailText}` : '';
  }

  function classifyTravelStepResult(stepName, data) {
    if (!data || typeof data !== 'object') return 'created';
    if (stepName === 'attachFieldGroups') return data.patchApplied ? 'created' : 'already';
    return data.skipped ? 'already' : 'created';
  }

  function describeTravelStepOutcome(stepName, outcome) {
    if (outcome === 'already') return 'already configured';
    if (stepName === 'createSchema') return 'created';
    if (stepName === 'attachFieldGroups') return 'attached';
    if (stepName === 'createDataset') return 'created';
    return 'done';
  }

  async function runProvisioningStepsCombined() {
    const busy = [
      stepRunAllBtn,
      stepCreateSchemaBtn,
      stepAttachFgBtn,
      stepCreateDatasetBtn,
      stepHttpFlowBtn,
      checkInfraBtn,
    ].filter(Boolean);
    busy.forEach((b) => { b.disabled = true; });
    ensureTravelProgressList();
    showInfraMessage('Setting up schema, field groups and dataset…', '');
    let lastSuccessData = null;
    try {
      for (const cfg of COMBINED_PROVISIONING_STEPS_TRAVEL) {
        setTravelProgressItem(cfg.step, 'working', 'working…');
        let res, data;
        try {
          res = await fetch('/api/travel-profile-infra/step' + querySuffix(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: cfg.step }),
          });
          data = await res.json().catch(() => ({}));
        } catch (e) {
          const errMsg = e && e.message ? e.message : 'Network error';
          setTravelProgressItem(cfg.step, 'error', errMsg);
          showInfraMessage(`${cfg.label} failed: ${errMsg}`, 'error');
          return;
        }
        if (!res.ok || data.ok === false) {
          // AEP error already extracted by extractAepErrorMessage in the
          // factory (report.additionalDetails[].errorReason).
          const aepError =
            data && data.error
              ? data.error
              : data && data.profileCoreMixinMissing
                ? 'Profile Core v2 not imported in this sandbox.'
                : `Step request failed (HTTP ${res.status}).`;
          setTravelProgressItem(cfg.step, 'error', aepError);
          showInfraMessage(`${cfg.label} failed: ${aepError}`, 'error');
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
          console.warn(`[travel-profile] combined infra sync after ${cfg.step}:`, e && e.message);
        }
        const outcome = classifyTravelStepResult(cfg.step, data);
        setTravelProgressItem(cfg.step, 'success', describeTravelStepOutcome(cfg.step, outcome));
        lastSuccessData = data;
      }
      const summary = (lastSuccessData && lastSuccessData.message) || 'Schema, field groups and dataset ready.';
      showInfraMessage(
        `${summary} Now create the HTTP API streaming source in AEP and paste the dataflow ID below.`,
        'success'
      );
      if (infraDetailsEl) infraDetailsEl.open = true;
      try {
        await autoDiscoverInfraFromSandbox();
      } catch (e) {
        console.warn('[travel-profile] autoDiscoverInfraFromSandbox after combined run:', e && e.message);
      }
    } finally {
      busy.forEach((b) => { b.disabled = false; });
    }
  }

  // ---- Enable schema + dataset for Real-Time Customer Profile ----
  // Mirrors the orchestrator in profile-generation-industry-runtime.js for
  // the new industries (Generic + Travel pre-date that runtime helper). The
  // server enforces strict schema-first → dataset-second ordering and
  // idempotent `already-enabled` semantics; the UI here only renders the
  // structured response into a two-row progress list above the button.
  const ENABLE_PROFILE_PROGRESS_STEPS_TR = [
    { step: 'schemaUnion',    label: 'Schema enabled for Profile' },
    { step: 'datasetProfile', label: 'Dataset enabled for Profile' },
  ];

  function ensureTravelEnableProfileProgressList() {
    if (!enableProfileProgressListEl) return null;
    enableProfileProgressListEl.hidden = false;
    enableProfileProgressListEl.innerHTML = '';
    ENABLE_PROFILE_PROGRESS_STEPS_TR.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'consent-infra-progress__item consent-infra-progress__item--pending';
      li.dataset.step = s.step;
      const icon = document.createElement('span');
      icon.className = 'consent-infra-progress__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '·';
      const label = document.createElement('span');
      label.className = 'consent-infra-progress__label';
      label.textContent = s.label;
      const detail = document.createElement('span');
      detail.className = 'consent-infra-progress__detail';
      detail.textContent = '';
      li.append(icon, label, detail);
      enableProfileProgressListEl.appendChild(li);
    });
    return enableProfileProgressListEl;
  }

  function setTravelEnableProfileProgressItem(step, state, detailText) {
    if (!enableProfileProgressListEl) return;
    const li = enableProfileProgressListEl.querySelector(`[data-step="${step}"]`);
    if (!li) return;
    li.className = 'consent-infra-progress__item consent-infra-progress__item--' + state;
    const icon = li.querySelector('.consent-infra-progress__icon');
    const detail = li.querySelector('.consent-infra-progress__detail');
    if (icon) {
      icon.textContent =
        state === 'success' ? '✓' :
        state === 'error'   ? '✗' :
        state === 'working' ? '…' : '·';
    }
    if (detail) detail.textContent = detailText ? ` — ${detailText}` : '';
  }

  function describeTravelEnableSubResult(value, errorText) {
    if (value === 'enabled') return { state: 'success', text: 'enabled' };
    if (value === 'already-enabled') return { state: 'success', text: 'already enabled' };
    if (value === 'skipped') return { state: 'pending', text: 'skipped' };
    return { state: 'error', text: errorText || 'failed' };
  }

  async function enableProfileOnSchemaAndDataset() {
    if (!enableProfileBtn) return;
    enableProfileBtn.disabled = true;
    ensureTravelEnableProfileProgressList();
    setTravelEnableProfileProgressItem('schemaUnion', 'working', 'working…');
    setTravelEnableProfileProgressItem('datasetProfile', 'pending', '');
    showInfraMessage('Enabling schema, then dataset, for Real-Time Customer Profile…', '');
    try {
      let res, data;
      try {
        res = await fetch('/api/travel-profile-infra/enable-profile' + querySuffix(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        data = await res.json().catch(() => ({}));
      } catch (e) {
        const errMsg = e && e.message ? e.message : 'Network error';
        setTravelEnableProfileProgressItem('schemaUnion', 'error', errMsg);
        showInfraMessage(`Enable for Profile failed: ${errMsg}`, 'error');
        return;
      }
      const schemaSub = describeTravelEnableSubResult(data.schemaUnion, data.schemaError || data.error);
      setTravelEnableProfileProgressItem('schemaUnion', schemaSub.state, schemaSub.text);
      if (data.datasetProfile) {
        const dsSub = describeTravelEnableSubResult(data.datasetProfile, data.datasetError);
        setTravelEnableProfileProgressItem('datasetProfile', dsSub.state, dsSub.text);
      }
      if (!res.ok || data.ok === false) {
        showInfraMessage(
          data.message || data.error || `Enable for Profile failed (HTTP ${res.status}).`,
          'error'
        );
        return;
      }
      showInfraMessage(data.message || 'Schema and dataset are Profile-enabled.', 'success');
    } finally {
      enableProfileBtn.disabled = false;
      // Refresh the at-a-glance Profile-enabled badges (industry dropdown +
      // panel headers). Force=true bypasses the 30s server cache so the
      // user sees the new state immediately.
      try {
        if (window.AepProfileInfraStatus && typeof window.AepProfileInfraStatus.refresh === 'function') {
          window.AepProfileInfraStatus.refresh({ force: true });
        }
      } catch (_) { /* ignore */ }
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

  // ---------- Sandbox-driven auto-discovery of Schema $id + Dataset ID ----------
  //
  // When the agent (or anyone) provisions schemas/datasets directly in a
  // sandbox under their canonical names (`AEP Lab - Travel Profile - Schema` /
  // `AEP Lab - Travel Profile - Dataset`), the architect should not have
  // to open the AEP UI to copy the resolved `$id` / dataset ID into the
  // wizard by hand. The `/api/travel-profile-infra/status` endpoint
  // already returns `schemaId` and `datasetId` resolved by canonical name,
  // so we call it once per (sandbox) and pre-fill the two empty inputs.
  //
  // Discovery rules mirror profile-generation-industry-runtime.js exactly
  // (skip when fields are pre-populated, cache attempts per sandbox, reset
  // cache on sandbox change, silent on failure / not-found).
  const _autoDiscoverAttempted = new Set();

  function isProfilePanelVisible() {
    const panelEl = document.getElementById('travelProfilePanel');
    if (!panelEl) return true;
    return !panelEl.hidden;
  }

  async function autoDiscoverInfraFromSandbox() {
    const sb = getSandboxName();
    if (!sb) return false;
    if (trimVal(streamSchemaIdEl) || trimVal(streamDatasetIdEl)) return false;
    if (_autoDiscoverAttempted.has(sb)) return false;
    _autoDiscoverAttempted.add(sb);
    try {
      const res = await fetch('/api/travel-profile-infra/status' + querySuffix());
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) return false;
      const schemaOk = !!(data.schemaFound && data.schemaId);
      const datasetOk = !!(data.datasetFound && data.datasetId);
      if (!schemaOk || !datasetOk) return false;
      if (streamSchemaIdEl && !trimVal(streamSchemaIdEl)) {
        streamSchemaIdEl.value = data.schemaId;
      }
      if (streamDatasetIdEl && !trimVal(streamDatasetIdEl)) {
        streamDatasetIdEl.value = data.datasetId;
      }
      if (streamXdmKeyEl && !trimVal(streamXdmKeyEl) && data.xdmKey) {
        streamXdmKeyEl.value = data.xdmKey;
      }
      showInfraMessage(
        `✓ Auto-filled Schema ID and Dataset ID from sandbox "${sb}". Create the HTTP API source in AEP and paste the dataflow ID below.`,
        'success'
      );
      applyConfiguredCollapseState();
      return true;
    } catch (e) {
      console.warn('[travel-profile] autoDiscoverInfraFromSandbox failed:', e && e.message);
      return false;
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

  // ---- Birth date / age helpers (parity with profile-generation-industry-runtime.js) ----
  const BIRTH_AGE_MIN = 18;
  const BIRTH_AGE_MAX = 85;
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isValidIsoBirthDate(str) {
    if (!str || typeof str !== 'string') return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
    if (!m) return false;
    const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    if (y < 1900 || y > new Date().getFullYear()) return false;
    return true;
  }
  function computeAgeFromBirthDate(isoStr) {
    if (!isValidIsoBirthDate(isoStr)) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoStr.trim());
    const by = Number(m[1]); const bm = Number(m[2]); const bd = Number(m[3]);
    const today = new Date();
    let age = today.getFullYear() - by;
    const beforeBirthday =
      today.getMonth() + 1 < bm ||
      (today.getMonth() + 1 === bm && today.getDate() < bd);
    if (beforeBirthday) age -= 1;
    if (age < 0) return null;
    return age;
  }
  function randomBirthDateIso() {
    const now = new Date();
    const year = now.getFullYear() - randomBetween(BIRTH_AGE_MIN, BIRTH_AGE_MAX);
    const month = randomBetween(1, 12);
    const day = randomBetween(1, 28);
    return `${year}-${pad2(month)}-${pad2(day)}`;
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
  // The list is intentionally hub-heavy: every code referenced by the
  // route-aware layover picker (`pickRealisticLayovers`) MUST exist here so
  // the layover-name input downstream renders the correct city / country.
  const AIRPORTS = [
    { code: 'LHR', city: 'London',         country: 'United Kingdom',     isUSA: false },
    { code: 'CDG', city: 'Paris',          country: 'France',             isUSA: false },
    { code: 'FRA', city: 'Frankfurt',      country: 'Germany',            isUSA: false },
    { code: 'MUC', city: 'Munich',         country: 'Germany',            isUSA: false },
    { code: 'AMS', city: 'Amsterdam',      country: 'Netherlands',        isUSA: false },
    { code: 'MAD', city: 'Madrid',         country: 'Spain',              isUSA: false },
    { code: 'BCN', city: 'Barcelona',      country: 'Spain',              isUSA: false },
    { code: 'FCO', city: 'Rome',           country: 'Italy',              isUSA: false },
    { code: 'IST', city: 'Istanbul',       country: 'Turkey',             isUSA: false },
    { code: 'DUB', city: 'Dublin',         country: 'Ireland',            isUSA: false },
    { code: 'KEF', city: 'Reykjavik',      country: 'Iceland',            isUSA: false },
    { code: 'DXB', city: 'Dubai',          country: 'United Arab Emirates', isUSA: false },
    { code: 'AUH', city: 'Abu Dhabi',      country: 'United Arab Emirates', isUSA: false },
    { code: 'DOH', city: 'Doha',           country: 'Qatar',              isUSA: false },
    { code: 'SIN', city: 'Singapore',      country: 'Singapore',          isUSA: false },
    { code: 'HKG', city: 'Hong Kong',      country: 'Hong Kong',          isUSA: false },
    { code: 'BKK', city: 'Bangkok',        country: 'Thailand',           isUSA: false },
    { code: 'ICN', city: 'Seoul',          country: 'South Korea',        isUSA: false },
    { code: 'NRT', city: 'Tokyo',          country: 'Japan',              isUSA: false },
    { code: 'HND', city: 'Tokyo',          country: 'Japan',              isUSA: false },
    { code: 'SYD', city: 'Sydney',         country: 'Australia',          isUSA: false },
    { code: 'JNB', city: 'Johannesburg',   country: 'South Africa',       isUSA: false },
    { code: 'YYZ', city: 'Toronto',        country: 'Canada',             isUSA: false },
    { code: 'JFK', city: 'New York',       country: 'United States',      isUSA: true },
    { code: 'EWR', city: 'Newark',         country: 'United States',      isUSA: true },
    { code: 'BOS', city: 'Boston',         country: 'United States',      isUSA: true },
    { code: 'IAD', city: 'Washington',     country: 'United States',      isUSA: true },
    { code: 'ATL', city: 'Atlanta',        country: 'United States',      isUSA: true },
    { code: 'MIA', city: 'Miami',          country: 'United States',      isUSA: true },
    { code: 'ORD', city: 'Chicago',        country: 'United States',      isUSA: true },
    { code: 'DFW', city: 'Dallas',         country: 'United States',      isUSA: true },
    { code: 'DEN', city: 'Denver',         country: 'United States',      isUSA: true },
    { code: 'LAS', city: 'Las Vegas',      country: 'United States',      isUSA: true },
    { code: 'LAX', city: 'Los Angeles',    country: 'United States',      isUSA: true },
    { code: 'SFO', city: 'San Francisco',  country: 'United States',      isUSA: true },
    { code: 'SEA', city: 'Seattle',        country: 'United States',      isUSA: true },
  ];

  // OOTB Travel Preferences mixin enums (root-level travelPreferences.*).
  // Values MUST match the OOTB `travel-preferences` field group's `enum` arrays
  // verbatim — AEP silently drops any value not in the schema enum (the bug
  // that hid every "Vegetarian" / "Window" / "King" persona produced before
  // 2026-05-02; see commit history). The randomizer biases toward the most
  // common real-world picks (regular meal, leisure-friendly defaults) so
  // generated personas read as believable Travel customers.
  const MEAL_OPTIONS = [
    'regularMeal', 'regularMeal', 'regularMeal', // weight: ~50% regular meal
    'vegetarian', 'vegetarian',
    'vegLactoOvo',
    'kosherMeal',
    'halalMeal',
    'glutenFreeMeal',
    'diabeticMeal',
    'lowCalorieMeal',
    'lowSaltSodiumMeal',
    'nonLactoseMeal',
    'peanutFreeMeal',
    'seafoodMeal',
    'fruitPlatter',
  ];
  const SEAT_OPTIONS    = ['window', 'aisle', 'middle', 'noPreference'];
  const SEAT_SECTION    = ['forward', 'rear', 'exitRow', 'bulkhead', 'noPreference'];
  const ROOM_TYPES      = ['king', 'queen', 'double', 'twin', 'single', 'noPreference'];
  // Weight ~70% toward common car classes (compact / mid-size / SUV) so most
  // generated personas don't end up with esoteric vehicle picks.
  const VEHICLE_TYPES = [
    'compactCar', 'compactCar',
    'economyCar', 'economyCar',
    'intermediateCar',
    'standardCar',
    'fullSizeCar',
    'intermediateSUV',
    'standardSUV',
    'fullSizeSUV',
    'miniVan',
    'premiumCar',
    'luxuryCar',
    'compactCarHybrid',
    'economyCarHybrid',
  ];
  const TICKET_DELIVERY = ['eTicket', 'eTicket', 'eTicket', 'physical']; // ~75% e-ticket

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

  // Route-aware layover hub picker. Given a dep + arr airport and the desired
  // count (1 or 2), returns that many AIRPORTS entries chosen from a hub set
  // appropriate to the geographic route class:
  //   * Domestic US        → ATL/ORD/DFW/DEN/LAX/JFK/etc.
  //   * Both endpoints EU  → LHR/CDG/FRA/AMS/MUC/MAD/IST/DUB/BCN
  //   * Transatlantic      → JFK/EWR/BOS/IAD/LHR/DUB/KEF/CDG/AMS
  //   * Asia ↔ Europe      → DXB/AUH/DOH (Gulf) or SIN/HKG/ICN/BKK
  //   * Asia ↔ Americas    → NRT/HND/ICN/HKG/SIN/LAX/SFO (Pacific)
  //   * Oceania anywhere   → SIN/HKG/DXB/NRT
  //   * Africa / ME        → DXB/DOH/IST/FRA/CDG
  //   * Fallback           → mixed global hubs
  // Always filters out dep + arr; ensures uniqueness when count === 2.
  function pickRealisticLayovers(departureAirport, arrivalAirport, count) {
    if (!departureAirport || !arrivalAirport || !count) return [];

    const HUBS_EUROPE = ['LHR', 'CDG', 'FRA', 'AMS', 'MUC', 'MAD', 'IST', 'DUB', 'BCN'];
    const HUBS_GULF   = ['DXB', 'AUH', 'DOH'];
    const HUBS_ASIA   = ['SIN', 'HKG', 'ICN', 'BKK', 'NRT', 'HND'];
    const HUBS_USA_E  = ['JFK', 'EWR', 'BOS', 'IAD', 'ATL'];
    const HUBS_USA_W  = ['LAX', 'SFO', 'SEA', 'LAS'];
    const HUBS_USA_C  = ['ORD', 'DFW', 'DEN'];
    const HUBS_TRANSATLANTIC = ['JFK', 'EWR', 'BOS', 'IAD', 'LHR', 'DUB', 'KEF', 'CDG', 'AMS'];
    const HUBS_PACIFIC = ['NRT', 'HND', 'ICN', 'HKG', 'SIN', 'LAX', 'SFO'];
    const HUBS_FALLBACK = ['LHR', 'CDG', 'FRA', 'DXB', 'SIN', 'JFK', 'LAX', 'IST'];

    const EUR = new Set([
      'United Kingdom', 'France', 'Germany', 'Netherlands', 'Spain', 'Italy',
      'Turkey', 'Ireland', 'Iceland', 'Switzerland', 'Belgium', 'Portugal',
      'Sweden', 'Norway', 'Denmark', 'Austria', 'Poland', 'Finland',
    ]);
    const ASIA = new Set([
      'Japan', 'Singapore', 'Hong Kong', 'South Korea', 'China', 'Thailand',
      'Malaysia', 'Vietnam', 'Indonesia', 'Philippines', 'India',
    ]);
    const ME = new Set([
      'United Arab Emirates', 'Qatar', 'Saudi Arabia', 'Bahrain', 'Kuwait',
      'Oman', 'Jordan', 'Israel', 'Egypt',
    ]);
    const OCEAN = new Set(['Australia', 'New Zealand']);
    const AFRICA = new Set([
      'South Africa', 'Kenya', 'Nigeria', 'Morocco', 'Ethiopia', 'Tanzania',
    ]);

    const dCountry = departureAirport.country;
    const aCountry = arrivalAirport.country;
    const dUS = !!departureAirport.isUSA;
    const aUS = !!arrivalAirport.isUSA;
    const dCA = dCountry === 'Canada';
    const aCA = aCountry === 'Canada';
    const dNA = dUS || dCA;
    const aNA = aUS || aCA;
    const dEur = EUR.has(dCountry);
    const aEur = EUR.has(aCountry);
    const dAsia = ASIA.has(dCountry);
    const aAsia = ASIA.has(aCountry);
    const dME = ME.has(dCountry);
    const aME = ME.has(aCountry);
    const dOcean = OCEAN.has(dCountry);
    const aOcean = OCEAN.has(aCountry);
    const dAfr = AFRICA.has(dCountry);
    const aAfr = AFRICA.has(aCountry);

    let candidates;
    if (dUS && aUS) {
      candidates = HUBS_USA_E.concat(HUBS_USA_C, HUBS_USA_W);
    } else if (dEur && aEur) {
      candidates = HUBS_EUROPE;
    } else if ((dEur && aNA) || (dNA && aEur)) {
      candidates = HUBS_TRANSATLANTIC;
    } else if ((dAsia && aEur) || (dEur && aAsia)) {
      candidates = HUBS_GULF.concat(HUBS_ASIA);
    } else if ((dAsia && aNA) || (dNA && aAsia)) {
      candidates = HUBS_PACIFIC;
    } else if (dOcean || aOcean) {
      candidates = ['SIN', 'HKG', 'DXB', 'NRT'];
    } else if (dAfr || aAfr || dME || aME) {
      candidates = ['DXB', 'DOH', 'IST', 'FRA', 'CDG'];
    } else {
      candidates = HUBS_FALLBACK;
    }

    // Resolve hub codes → AIRPORTS entries; drop dep + arr; sample without
    // replacement so layover-1 ≠ layover-2 when count === 2.
    const pool = candidates
      .map((code) => AIRPORTS.find((a) => a.code === code))
      .filter((a) => a && a.code !== departureAirport.code && a.code !== arrivalAirport.code);

    const picks = [];
    const usedCodes = new Set();
    for (let i = 0; i < count; i++) {
      const remaining = pool.filter((a) => !usedCodes.has(a.code));
      if (!remaining.length) break;
      const pick = randomPick(remaining);
      picks.push(pick);
      usedCodes.add(pick.code);
    }
    return picks;
  }

  // Realistic layover duration in minutes. Distribution:
  //   20% short (45–90 min, tight major-hub connections)
  //   60% medium (90–240 min, typical international layover)
  //   20% long (240–540 min, occasional overnight at Gulf / Asia hubs)
  function pickLayoverDurationMinutes() {
    const r = Math.random();
    if (r < 0.20) return randomBetween(45, 90);
    if (r < 0.80) return randomBetween(90, 240);
    return randomBetween(240, 540);
  }

  function isoFutureDate(daysAhead) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().slice(0, 10);
  }

  function isoPastDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  // Audit §2.7: split flightDate 70% future / 30% past per Generate. Future
  // flights ride the existing 1..180-day window; past flights fall in the
  // 1..90-day window so the recently-flown cohort reads as believable too.
  function randomFlightDateBiased() {
    if (Math.random() < 0.30) {
      return isoPastDate(randomBetween(1, 90));
    }
    return isoFutureDate(randomBetween(1, 180));
  }

  // Audit §2.7: airlines split between 6-character mixed-alphanumeric PNRs
  // (most carriers — BA, AF, EK, etc.) and 6-character all-letter PNRs
  // (Delta-style). Roughly 50/50 in the wild, so we toss a coin per
  // generate to keep cohorts varied.
  function randomConfirmationCode() {
    const ALPHA_NUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous
    const ALPHA_ONLY    = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const chars = Math.random() < 0.5 ? ALPHA_NUMERIC : ALPHA_ONLY;
    let out = '';
    for (let i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function randomFlightNumber(airlineDisplay) {
    const code = AIRLINE_IATA[airlineDisplay] || randomPick(['BA', 'AF', 'LH', 'EK', 'QR']);
    return `${code}${String(randomBetween(100, 4999)).padStart(4, '0')}`;
  }

  // Build the full random Travel persona once per Generate iteration. Mutates
  // form fields (so snapshotForm + summariseSnapshot stay accurate) and writes
  // every schema-aligned input directly so buildUpdatesFromForm has values to
  // stream.
  //
  // **Always-on contract (per operator request 2026-05-02):** every Generate
  // click MUST force both the Reservations and Travel-preferences toggles ON
  // and populate every schema-aligned field, regardless of prior UI state.
  // The toggles are visibility-only affordances; buildUpdatesFromForm streams
  // travel data whenever the inputs hold values, so Generate cannot produce a
  // profile that's missing reservations or preferences just because a toggle
  // happened to be off.
  function generateRandomTravelPersona() {
    // Force both panels OPEN first so the fields we're about to populate are
    // visible to the operator. Done unconditionally — clicking Generate is
    // always a "show me the full persona" action.
    if (reservationsEnabledEl) {
      reservationsEnabledEl.checked = true;
      try { applyReservationsToggleVisibility(); } catch (_) {}
    }
    if (travelPrefsEnabledEl) {
      travelPrefsEnabledEl.checked = true;
      try { applyTravelPrefsToggleVisibility(); } catch (_) {}
    }

    const airline = randomPick(RANDOM_AIRLINES);
    const { dep, arr } = pickAirportPair();
    // Passengers: 1–4. Children gate keeps the schema honest: children only
    // travel when there are ≥ 2 passengers (so we never ship a 1-pax flight
    // with childrenTravelling=true). Roughly 30% of multi-pax bookings carry
    // children — feels right for a leisure-heavy travel persona pool.
    const passengers = randomBetween(1, 4);
    const childrenTravelling = passengers >= 2 && Math.random() < 0.3;
    const flightClassRaw = randomPick(['economy', 'economy', 'economy', 'premium_economy', 'business', 'business', 'first']);

    // Multi-leg distribution: ~60% direct, ~30% one-layover, ~10% two-layover.
    // Tweak these thresholds to taste; the sim at /tmp/verify-travel-multileg.mjs
    // asserts the distribution stays roughly here (±5pp over 1000 runs).
    const r = Math.random();
    let isMultiLeg;
    let layovers;
    if (r < 0.60) { isMultiLeg = false; layovers = 0; }
    else if (r < 0.90) { isMultiLeg = true; layovers = 1; }
    else { isMultiLeg = true; layovers = 2; }

    // Route-aware hub pick (filters out dep + arr, ensures layover-1 ≠ layover-2).
    const layoverPicks = isMultiLeg ? pickRealisticLayovers(dep, arr, layovers) : [];
    const layover1 = layoverPicks[0] || null;
    const layover2 = layoverPicks[1] || null;

    // Visible Travel attribute fields — always overwrite (the operator wants a
    // fresh realistic persona on every click, not partial holdover values).
    if (favouriteAirlineEl) favouriteAirlineEl.value = airline;
    if (primaryTravelClassEl) {
      const opts = selectNonEmptyValues(primaryTravelClassEl);
      if (opts.includes(flightClassRaw)) primaryTravelClassEl.value = flightClassRaw;
      else if (opts.length) primaryTravelClassEl.value = opts[0];
    }

    // Visible flight reservation inputs.
    if (flightDepartureEl) flightDepartureEl.value = dep.code;
    if (flightArrivalEl) flightArrivalEl.value = arr.code;
    if (flightNumberEl) flightNumberEl.value = randomFlightNumber(airline);
    // Flight date: 70% future (upcoming travel), 30% past (recent travel).
    // See randomFlightDateBiased — replaces the previous always-future logic.
    if (flightDateEl) flightDateEl.value = randomFlightDateBiased();
    if (flightClassEl) {
      const opts = selectNonEmptyValues(flightClassEl);
      flightClassEl.value = opts.includes(flightClassRaw) ? flightClassRaw : (opts[0] || '');
    }
    if (flightConfirmationEl) flightConfirmationEl.value = randomConfirmationCode();
    if (flightPassengersEl) flightPassengersEl.value = String(passengers);
    if (flightChildrenEl) flightChildrenEl.value = childrenTravelling ? 'true' : 'false';
    if (flightMultiLegEl) flightMultiLegEl.value = isMultiLeg ? 'true' : 'false';
    if (flightLayoversEl) flightLayoversEl.value = String(layovers);

    // Schema-only flight extras (now backed by real UI inputs).
    if (flightDepartureCountryEl) flightDepartureCountryEl.value = dep.country;
    if (flightArrivalCountryEl) flightArrivalCountryEl.value = arr.country;
    if (flightUsaFlightEl) flightUsaFlightEl.value = (dep.isUSA || arr.isUSA) ? 'true' : 'false';

    // Layover slots — populated ONLY for the slot the persona warrants.
    // Direct flights blank ALL six layover inputs so a stale value from a
    // previous click can't leak into buildUpdatesFromForm. Two-layover
    // personas fill both slots; one-layover personas fill slot 1 only.
    if (flightLayover1CodeEl) flightLayover1CodeEl.value = layover1 ? layover1.code : '';
    if (flightLayover1NameEl) flightLayover1NameEl.value = layover1 ? layover1.city : '';
    if (flightLayover1DurationEl) flightLayover1DurationEl.value = layover1 ? String(pickLayoverDurationMinutes()) : '';
    if (flightLayover2CodeEl) flightLayover2CodeEl.value = layover2 ? layover2.code : '';
    if (flightLayover2NameEl) flightLayover2NameEl.value = layover2 ? layover2.city : '';
    if (flightLayover2DurationEl) flightLayover2DurationEl.value = layover2 ? String(pickLayoverDurationMinutes()) : '';

    // OOTB Adobe travel-preferences mixin (root-level travelPreferences.*).
    // Booleans bias toward leisure-friendly defaults so the resulting AEP
    // profile reads like a real travel customer.
    const setSel = (el, val) => { if (!el) return; const opts = selectNonEmptyValues(el); if (opts.includes(val)) el.value = val; };
    setSel(prefMealEl, randomPick(MEAL_OPTIONS));
    setSel(prefSeatEl, randomPick(SEAT_OPTIONS));
    setSel(prefSeatSectionEl, randomPick(SEAT_SECTION));
    setSel(prefRoomTypeEl, randomPick(ROOM_TYPES));
    setSel(prefVehicleTypeEl, randomPick(VEHICLE_TYPES));
    setSel(prefTicketDeliveryEl, randomPick(TICKET_DELIVERY));
    if (prefDepartureAirportEl) prefDepartureAirportEl.value = dep.code;
    // medicalAlerts: only fill ~10% of personas (most travellers have none),
    // and only on the first click (don't clobber an operator-typed override).
    if (prefMedicalAlertsEl && !trimVal(prefMedicalAlertsEl) && Math.random() < 0.1) {
      prefMedicalAlertsEl.value = randomPick(['Peanut allergy', 'Diabetic', 'Asthmatic', 'Lactose intolerant']);
    }
    if (prefGymEl) prefGymEl.checked = Math.random() < 0.6;
    if (prefPoolEl) prefPoolEl.checked = Math.random() < 0.7;
    if (prefEarlyCheckInEl) prefEarlyCheckInEl.checked = Math.random() < 0.5;
    if (prefRoomServiceEl) prefRoomServiceEl.checked = Math.random() < 0.4;
    if (prefHasRestaurantEl) prefHasRestaurantEl.checked = true;
    if (prefFoamPillowsEl) prefFoamPillowsEl.checked = Math.random() < 0.3;
    if (prefCribEl) prefCribEl.checked = childrenTravelling && Math.random() < 0.5;
    if (prefRollAwayBedEl) prefRollAwayBedEl.checked = childrenTravelling && Math.random() < 0.3;
    if (prefSmokingRoomEl) prefSmokingRoomEl.checked = false;
    if (prefManualTransmissionEl) prefManualTransmissionEl.checked = Math.random() < 0.15;
    if (prefSmokingVehicleEl) prefSmokingVehicleEl.checked = false;
    if (prefVisuallyImpairedEl) prefVisuallyImpairedEl.checked = false;
    if (prefWheelchairEl) prefWheelchairEl.checked = Math.random() < 0.05;
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

    // Always overwrite birth date + age on Generate so every Travel
    // profile carries person.birthDate (root) + _<tenant>.individualCharacteristics.core.age
    // (integer). Force-overwrite even if the operator had typed something —
    // matches the "Generate always populates everything" pattern landed
    // earlier on Travel for reservations / preferences.
    if (birthDateEl) {
      const iso = randomBirthDateIso();
      birthDateEl.value = iso;
      const a = computeAgeFromBirthDate(iso);
      if (ageEl && a != null) ageEl.value = String(a);
    } else if (ageEl) {
      ageEl.value = String(randomBetween(BIRTH_AGE_MIN, BIRTH_AGE_MAX));
    }

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

    // AOV ↔ loyalty tier bias (audit §1.7 — applies to every industry that
    // ships its own randomiser). Higher tiers spend more on average; bell
    // distribution centres each tier in a believable spend band.
    const helpers = (window.AepProfileGenIndustry && window.AepProfileGenIndustry.helpers) || null;
    const bell = (helpers && typeof helpers.randomBellBetween === 'function')
      ? helpers.randomBellBetween
      : (lo, hi) => randomBetween(lo, hi);
    const tierForAov = (loyaltyEnabledEl && loyaltyEnabledEl.checked && loyaltyTierEl)
      ? String(loyaltyTierEl.value || '').toLowerCase()
      : '';
    let aovBiased = null;
    switch (tierForAov) {
      case 'bronze':
      case 'silver':
        aovBiased = bell(20, 200);
        break;
      case 'gold':
      case 'platinum':
        aovBiased = bell(150, 800);
        break;
      case 'diamond':
        aovBiased = bell(500, 2000);
        break;
      default:
        break;
    }
    if (aovEl && aovBiased != null) {
      const aovInt = Math.round(aovBiased);
      const aovMin = Number(aovEl.min);
      const aovMax = Number(aovEl.max);
      const lo = Number.isFinite(aovMin) ? aovMin : 0;
      const hi = Number.isFinite(aovMax) ? aovMax : 2000;
      aovEl.value = String(Math.max(lo, Math.min(hi, aovInt)));
      try { syncAovSlider(); } catch (_) {}
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
      birthDate: trimVal(birthDateEl),
      age: trimVal(ageEl),
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
        prefs: (travelPrefsEnabledEl && travelPrefsEnabledEl.checked) ? {
          enabled: true,
          meal: trimVal(prefMealEl),
          seat: trimVal(prefSeatEl),
          roomType: trimVal(prefRoomTypeEl),
          vehicleType: trimVal(prefVehicleTypeEl),
        } : { enabled: false },
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

    // Birth date + age. Stream both leaves whenever either has a value;
    // re-derive age from birthDate at push time so the two never drift
    // apart even if the operator hand-edited only one. Skip entirely when
    // both fields are blank.
    //   person.birthDate              → root (PROFILE_STREAM_ROOT_PATH_PREFIXES has `person`)
    //   individualCharacteristics.core.age → tenant subtree (auto _<tenant>-prefixed by proxy)
    const birthDateRaw = trimVal(birthDateEl);
    const ageRaw = trimVal(ageEl);
    if (birthDateRaw || ageRaw) {
      let derivedAge = null;
      if (isValidIsoBirthDate(birthDateRaw)) {
        push('person.birthDate', birthDateRaw);
        derivedAge = computeAgeFromBirthDate(birthDateRaw);
      }
      let ageInt = null;
      if (derivedAge != null) ageInt = derivedAge;
      else if (ageRaw !== '') {
        const n = parseInt(ageRaw, 10);
        if (Number.isFinite(n) && n >= 0 && n <= 120) ageInt = n;
      }
      if (ageInt != null) push('individualCharacteristics.core.age', ageInt);
    }

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
    // **Toggle-independent contract (per operator request 2026-05-02):** travel
    // values stream whenever the underlying inputs hold a value, regardless of
    // the visibility toggle. The `travelReservationsEnabled` and
    // `travelPrefsEnabled` checkboxes are now pure UI affordances (open/close
    // the panel); they no longer gate the streamed payload. This guarantees a
    // Generate click — which always populates every input — produces a profile
    // with full reservation + preferences data, even if a toggle is off when
    // the operator clicks Update afterwards. To skip a field, clear the input
    // value (or leave it empty) instead of unticking the toggle.
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
    {
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

      // Multi-leg core leaves stream UNCONDITIONALLY — `multiLeg=false` and
      // `numberofLayovers=0` are valid, meaningful values for direct flights
      // and we want every Travel persona to carry a definitive answer (not
      // leave stale layover state implied by an absent property). Empty
      // select / blank input is treated as false / 0 so an operator who hasn't
      // touched these gets a sensible direct-flight default.
      const multiLegRaw = trimVal(flightMultiLegEl);
      const multiLegBool = multiLegRaw === 'true';
      push(`${flightPath}.multiLeg.multiLeg`, multiLegBool);
      const layoversRaw = trimVal(flightLayoversEl);
      let layoversInt = 0;
      if (layoversRaw !== '') {
        const n = parseInt(layoversRaw, 10);
        if (Number.isFinite(n) && n >= 0) layoversInt = n;
      }
      push(`${flightPath}.multiLeg.numberofLayovers`, layoversInt);

      // Schema-only flight extras — operator-editable via the new UI inputs.
      if (v(flightDepartureCountryEl)) push(`${flightPath}.departureCountry`, v(flightDepartureCountryEl));
      if (v(flightArrivalCountryEl)) push(`${flightPath}.arrivalCountry`, v(flightArrivalCountryEl));
      // usaFlight: explicit override wins, else derive from the two countries
      // (United States in either => true). Only pushes when we have a value.
      let usaFlight = boolFromTriState(flightUsaFlightEl);
      if (usaFlight == null) {
        const dc = v(flightDepartureCountryEl).toLowerCase();
        const ac = v(flightArrivalCountryEl).toLowerCase();
        if (dc || ac) usaFlight = (dc === 'united states' || ac === 'united states');
      }
      if (usaFlight != null) push(`${flightPath}.usaFlight`, usaFlight);

      // Layover detail leaves — gated TWICE: only when (a) multiLeg is true
      // AND (b) numberofLayovers >= the slot index AND (c) the input itself
      // is non-blank. This prevents stale layover values from a previous
      // Generate (or hand-edit) leaking into a direct-flight payload. If you
      // want to clear a layover, set multi-leg to No or layovers to 0 — don't
      // push empty strings because AEP would still treat them as set values.
      if (multiLegBool && layoversInt >= 1) {
        if (v(flightLayover1NameEl)) push(`${flightPath}.multiLeg.layoverAirport_1`, v(flightLayover1NameEl));
        if (v(flightLayover1CodeEl)) push(`${flightPath}.multiLeg.layoverAirportCode_1`, v(flightLayover1CodeEl));
        const ld1 = intVal(flightLayover1DurationEl);
        if (ld1 != null) push(`${flightPath}.multiLeg.layoverDuration_1`, ld1);
        if (layoversInt >= 2) {
          // Schema typo preserved upstream: `layoverAiport_2` (note missing 'r').
          if (v(flightLayover2NameEl)) push(`${flightPath}.multiLeg.layoverAiport_2`, v(flightLayover2NameEl));
          if (v(flightLayover2CodeEl)) push(`${flightPath}.multiLeg.layoverAirportCode_2`, v(flightLayover2CodeEl));
          const ld2 = intVal(flightLayover2DurationEl);
          if (ld2 != null) push(`${flightPath}.multiLeg.layoverDuration_2`, ld2);
        }
      }
    }

    // Root-level OOTB Travel Preferences mixin (https://ns.adobe.com/xdm/mixins/profile/
    // travel-preferences). Routes to XDM root because `travelPreferences` is in
    // PROFILE_STREAM_ROOT_PATH_PREFIXES — without that the proxy would tenant-prefix
    // it to `_<tenant>.travelPreferences.*` and AEP would drop the values. Stream
    // these UNCONDITIONALLY (toggle is now visibility-only — see top of function).
    {
      const prefs = 'travelPreferences';
      const v = (el) => trimVal(el);
      // String preferences — only push if non-empty (so an operator who wants
      // to skip a field can clear the input).
      if (v(prefMealEl)) push(`${prefs}.meal`, v(prefMealEl));
      if (v(prefSeatEl)) push(`${prefs}.seat`, v(prefSeatEl));
      if (v(prefSeatSectionEl)) push(`${prefs}.seatSection`, v(prefSeatSectionEl));
      if (v(prefTicketDeliveryEl)) push(`${prefs}.ticketDelivery`, v(prefTicketDeliveryEl));
      if (v(prefDepartureAirportEl)) push(`${prefs}.preferredDepartureAirportCode`, v(prefDepartureAirportEl));
      if (v(prefRoomTypeEl)) push(`${prefs}.roomType`, v(prefRoomTypeEl));
      if (v(prefVehicleTypeEl)) push(`${prefs}.vehicleType`, v(prefVehicleTypeEl));
      if (v(prefMedicalAlertsEl)) push(`${prefs}.medicalAlerts`, v(prefMedicalAlertsEl));
      // Boolean amenity / accessibility flags — always push the checkbox state
      // (true OR false) so a profile lookup that sets a checkbox to false can
      // round-trip back as `false` instead of leaving the prior value untouched.
      const cb = (el) => !!(el && el.checked);
      if (prefGymEl) push(`${prefs}.gym`, cb(prefGymEl));
      if (prefPoolEl) push(`${prefs}.pool`, cb(prefPoolEl));
      if (prefEarlyCheckInEl) push(`${prefs}.earlyCheckIn`, cb(prefEarlyCheckInEl));
      if (prefRoomServiceEl) push(`${prefs}.roomService`, cb(prefRoomServiceEl));
      if (prefHasRestaurantEl) push(`${prefs}.hasRestaurant`, cb(prefHasRestaurantEl));
      if (prefFoamPillowsEl) push(`${prefs}.foamPillows`, cb(prefFoamPillowsEl));
      if (prefCribEl) push(`${prefs}.crib`, cb(prefCribEl));
      if (prefRollAwayBedEl) push(`${prefs}.rollAwayBed`, cb(prefRollAwayBedEl));
      if (prefSmokingRoomEl) push(`${prefs}.smokingRoom`, cb(prefSmokingRoomEl));
      if (prefManualTransmissionEl) push(`${prefs}.manualTransmission`, cb(prefManualTransmissionEl));
      if (prefSmokingVehicleEl) push(`${prefs}.smokingVehicle`, cb(prefSmokingVehicleEl));
      if (prefVisuallyImpairedEl) push(`${prefs}.visuallyImpairedAccessible`, cb(prefVisuallyImpairedEl));
      if (prefWheelchairEl) push(`${prefs}.wheelchairAccessible`, cb(prefWheelchairEl));
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
    const birthDate = findBySuffix(['person.birthdate', 'birthdate']);
    const ageHydrated = findBySuffix(['individualcharacteristics.core.age']) ||
      findByKeywords('individualcharacteristics', 'core', 'age');
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

    // Travel — favourite airline / primary travel class are operator-only fields
    // (not in schema today), but if a previous tool happened to write them we
    // still hydrate so the operator sees something familiar.
    const favAirline = findBySuffix(['favouriteairlinecompany', 'favoriteairlinecompany']);
    const travelClass = findBySuffix(['primarytravelclass']);

    // Schema-valid flight reservation paths (`_<tenant>.travelReservations.flightReservations.*`).
    // The path-lower normalizer strips `_` to handle both `_demoemea` and any
    // other tenant key. We use compound suffix matchers (`flightreservations.X`)
    // so we don't accidentally pick up an `airportcode` from a different parent.
    const flightDeparture = findBySuffix(['flightreservations.departureairportcode']);
    const flightArrival = findBySuffix(['flightreservations.arrivalairportcode']);
    const flightNumber = findBySuffix(['flightreservations.flightnumber']);
    const flightDate = findBySuffix(['flightreservations.flightdate']);
    const flightClass = findBySuffix(['flightreservations.flightclass']);
    const flightConfirmation = findBySuffix(['flightreservations.confirmationnumber']);
    const flightPassengers = findBySuffix(['flightreservations.numberofpassengers']);
    const flightChildren = findBySuffix(['flightreservations.childrentravelling']);
    const flightDepartureCountry = findBySuffix(['flightreservations.departurecountry']);
    const flightArrivalCountry = findBySuffix(['flightreservations.arrivalcountry']);
    const flightUsa = findBySuffix(['flightreservations.usaflight']);
    const flightMultiLeg = findBySuffix(['multileg.multileg']);
    const flightLayoverCount = findBySuffix(['multileg.numberoflayovers']);
    const layover1Code = findBySuffix(['multileg.layoverairportcode.1', 'multileg.layoverairportcode1']);
    const layover1Name = findBySuffix(['multileg.layoverairport.1', 'multileg.layoverairport1']);
    const layover1Duration = findBySuffix(['multileg.layoverduration.1', 'multileg.layoverduration1']);
    // Schema typo preserved upstream: `layoverAiport_2` becomes `layoverairport.2`
    // after the `_`→`.` normalizer (note missing 'r' in the second variant).
    const layover2Code = findBySuffix(['multileg.layoverairportcode.2', 'multileg.layoverairportcode2']);
    const layover2Name = findBySuffix(['multileg.layoverairport.2', 'multileg.layoverairport2', 'multileg.layoveraiport.2']);
    const layover2Duration = findBySuffix(['multileg.layoverduration.2', 'multileg.layoverduration2']);

    // Root-level OOTB Travel Preferences (`travelPreferences.*`). Use compound
    // suffix so e.g. `meal` doesn't collide with an unrelated XDM `meal` field.
    const prefMeal = findBySuffix(['travelpreferences.meal']);
    const prefSeat = findBySuffix(['travelpreferences.seat']);
    const prefSeatSection = findBySuffix(['travelpreferences.seatsection']);
    const prefTicketDelivery = findBySuffix(['travelpreferences.ticketdelivery']);
    const prefDepartureAirport = findBySuffix(['travelpreferences.preferreddepartureairportcode']);
    const prefRoomType = findBySuffix(['travelpreferences.roomtype']);
    const prefVehicleType = findBySuffix(['travelpreferences.vehicletype']);
    const prefMedicalAlerts = findBySuffix(['travelpreferences.medicalalerts']);
    const prefBoolFinder = (suffix) => {
      const v = findBySuffix([`travelpreferences.${suffix}`]);
      if (v === '') return null;
      const lv = v.toLowerCase();
      return lv === 'true' || lv === '1' || lv === 'yes';
    };
    const prefGym = prefBoolFinder('gym');
    const prefPool = prefBoolFinder('pool');
    const prefEarlyCheckIn = prefBoolFinder('earlycheckin');
    const prefRoomService = prefBoolFinder('roomservice');
    const prefHasRestaurant = prefBoolFinder('hasrestaurant');
    const prefFoamPillows = prefBoolFinder('foampillows');
    const prefCrib = prefBoolFinder('crib');
    const prefRollAwayBed = prefBoolFinder('rollawaybed');
    const prefSmokingRoom = prefBoolFinder('smokingroom');
    const prefManualTransmission = prefBoolFinder('manualtransmission');
    const prefSmokingVehicle = prefBoolFinder('smokingvehicle');
    const prefVisuallyImpaired = prefBoolFinder('visuallyimpairedaccessible');
    const prefWheelchair = prefBoolFinder('wheelchairaccessible');

    if (firstName && firstNameEl) firstNameEl.value = firstName;
    if (lastName && lastNameEl) lastNameEl.value = lastName;
    // Birth date / age. Prefer birthDate (source of truth, age re-derived
    // on push). Leave birthDate blank when only age is known.
    if (birthDate && birthDateEl) {
      const iso = String(birthDate).slice(0, 10);
      if (isValidIsoBirthDate(iso)) {
        birthDateEl.value = iso;
        if (ageEl) {
          const a = computeAgeFromBirthDate(iso);
          if (a != null) ageEl.value = String(a);
        }
      }
    } else if (ageHydrated && ageEl) {
      const n = parseInt(String(ageHydrated), 10);
      if (Number.isFinite(n)) ageEl.value = String(n);
    }
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

    // Hydrate the schema-valid Flight reservation block. Auto-open the toggle
    // if any flight value came back so the operator sees what's stored.
    const hasFlight = !!(flightDeparture || flightArrival || flightNumber || flightDate ||
      flightClass || flightConfirmation || flightPassengers || flightChildren ||
      flightDepartureCountry || flightArrivalCountry || flightUsa || flightMultiLeg);
    if (hasFlight && reservationsEnabledEl) {
      reservationsEnabledEl.checked = true;
      applyReservationsToggleVisibility();
    }
    if (flightDeparture && flightDepartureEl) flightDepartureEl.value = flightDeparture;
    if (flightArrival && flightArrivalEl) flightArrivalEl.value = flightArrival;
    if (flightNumber && flightNumberEl) flightNumberEl.value = flightNumber;
    if (flightDate && flightDateEl) flightDateEl.value = flightDate;
    setSelectValueLoose(flightClassEl, flightClass);
    if (flightConfirmation && flightConfirmationEl) flightConfirmationEl.value = flightConfirmation;
    if (flightPassengers && flightPassengersEl) flightPassengersEl.value = flightPassengers;
    setSelectValueLoose(flightChildrenEl, flightChildren);
    if (flightDepartureCountry && flightDepartureCountryEl) flightDepartureCountryEl.value = flightDepartureCountry;
    if (flightArrivalCountry && flightArrivalCountryEl) flightArrivalCountryEl.value = flightArrivalCountry;
    setSelectValueLoose(flightUsaFlightEl, flightUsa);
    setSelectValueLoose(flightMultiLegEl, flightMultiLeg);
    if (flightLayoverCount && flightLayoversEl) flightLayoversEl.value = flightLayoverCount;
    if (layover1Code && flightLayover1CodeEl) flightLayover1CodeEl.value = layover1Code;
    if (layover1Name && flightLayover1NameEl) flightLayover1NameEl.value = layover1Name;
    if (layover1Duration && flightLayover1DurationEl) flightLayover1DurationEl.value = layover1Duration;
    if (layover2Code && flightLayover2CodeEl) flightLayover2CodeEl.value = layover2Code;
    if (layover2Name && flightLayover2NameEl) flightLayover2NameEl.value = layover2Name;
    if (layover2Duration && flightLayover2DurationEl) flightLayover2DurationEl.value = layover2Duration;

    // Hydrate the OOTB Travel Preferences block. Auto-open the toggle if any
    // preference came back; checkboxes preserve `false` from the lookup so
    // unchecking a preference and clicking Update can write false back.
    const hasPrefs = !!(prefMeal || prefSeat || prefSeatSection || prefTicketDelivery ||
      prefDepartureAirport || prefRoomType || prefVehicleType || prefMedicalAlerts ||
      prefGym !== null || prefPool !== null || prefEarlyCheckIn !== null ||
      prefRoomService !== null || prefHasRestaurant !== null || prefFoamPillows !== null ||
      prefCrib !== null || prefRollAwayBed !== null || prefSmokingRoom !== null ||
      prefManualTransmission !== null || prefSmokingVehicle !== null ||
      prefVisuallyImpaired !== null || prefWheelchair !== null);
    if (hasPrefs && travelPrefsEnabledEl) {
      travelPrefsEnabledEl.checked = true;
      applyTravelPrefsToggleVisibility();
    }
    setSelectValueLoose(prefMealEl, prefMeal);
    setSelectValueLoose(prefSeatEl, prefSeat);
    setSelectValueLoose(prefSeatSectionEl, prefSeatSection);
    setSelectValueLoose(prefTicketDeliveryEl, prefTicketDelivery);
    if (prefDepartureAirport && prefDepartureAirportEl) prefDepartureAirportEl.value = prefDepartureAirport;
    setSelectValueLoose(prefRoomTypeEl, prefRoomType);
    setSelectValueLoose(prefVehicleTypeEl, prefVehicleType);
    if (prefMedicalAlerts && prefMedicalAlertsEl) prefMedicalAlertsEl.value = prefMedicalAlerts;
    const setCb = (el, val) => { if (el && val !== null) el.checked = !!val; };
    setCb(prefGymEl, prefGym);
    setCb(prefPoolEl, prefPool);
    setCb(prefEarlyCheckInEl, prefEarlyCheckIn);
    setCb(prefRoomServiceEl, prefRoomService);
    setCb(prefHasRestaurantEl, prefHasRestaurant);
    setCb(prefFoamPillowsEl, prefFoamPillows);
    setCb(prefCribEl, prefCrib);
    setCb(prefRollAwayBedEl, prefRollAwayBed);
    setCb(prefSmokingRoomEl, prefSmokingRoom);
    setCb(prefManualTransmissionEl, prefManualTransmission);
    setCb(prefSmokingVehicleEl, prefSmokingVehicle);
    setCb(prefVisuallyImpairedEl, prefVisuallyImpaired);
    setCb(prefWheelchairEl, prefWheelchair);
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
    if (!s.schemaId) missing.push('Schema ID');
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
  function applyTravelPrefsToggleVisibility() {
    const enabled = !!(travelPrefsEnabledEl && travelPrefsEnabledEl.checked);
    if (travelPrefsFieldsEl) travelPrefsFieldsEl.hidden = !enabled;
    if (travelPrefsEnabledEl) travelPrefsEnabledEl.setAttribute('aria-expanded', enabled ? 'true' : 'false');
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
    if (snap.firstName || snap.lastName) {
      const name = `${snap.firstName || ''} ${snap.lastName || ''}`.trim();
      parts.push(snap.age ? `${name} (${snap.age})` : name);
    }
    if (snap.gender) parts.push(snap.gender);
    const t = snap.travel || {};
    // Flight route is the most identifiable bit — show it first if we streamed
    // a reservation. Falls back to airline/class for legacy snapshots.
    const r = t.reservations || {};
    if (r.enabled && r.flight && (r.flight.departure || r.flight.arrival)) {
      const route = [r.flight.departure, r.flight.arrival].filter(Boolean).join('→');
      const flightBits = [route];
      if (r.flight.number) flightBits.push(r.flight.number);
      if (r.flight.class) flightBits.push(r.flight.class);
      parts.push(flightBits.join(' '));
    } else if (t.favouriteAirline) {
      parts.push(`Airline: ${t.favouriteAirline}`);
    }
    if (t.prefs && t.prefs.enabled) {
      const pp = [t.prefs.meal, t.prefs.seat, t.prefs.roomType, t.prefs.vehicleType].filter(Boolean);
      if (pp.length) parts.push(pp.join('/'));
    }
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
    if (birthDateEl) birthDateEl.value = s.birthDate || '';
    if (ageEl) ageEl.value = s.age || '';
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
  // Combined provisioning button (May 2026 consolidation). Legacy per-step
  // wiring stays in place for older / cached HTML.
  if (stepRunAllBtn) stepRunAllBtn.addEventListener('click', runProvisioningStepsCombined);
  if (enableProfileBtn) enableProfileBtn.addEventListener('click', enableProfileOnSchemaAndDataset);
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

  // Birth date → age sync. Whenever the operator picks a new date (or the
  // input loses focus with a value) recompute age and write it back so
  // buildUpdatesFromForm doesn't stream a stale age alongside an updated
  // birthDate.
  function applyBirthDateChange() {
    if (!birthDateEl) return;
    const iso = trimVal(birthDateEl);
    if (!iso) return;
    if (!isValidIsoBirthDate(iso)) return;
    const a = computeAgeFromBirthDate(iso);
    if (ageEl && a != null) ageEl.value = String(a);
  }
  if (birthDateEl) {
    birthDateEl.addEventListener('change', applyBirthDateChange);
    birthDateEl.addEventListener('blur', applyBirthDateChange);
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
  if (travelPrefsEnabledEl) travelPrefsEnabledEl.addEventListener('change', applyTravelPrefsToggleVisibility);

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
    // Reset the auto-discover cache so the new sandbox gets one fresh
    // attempt; the cache exists to avoid re-hitting AEP on panel-show /
    // firestore-reload cycles within a single sandbox, not to suppress
    // discovery across sandboxes.
    _autoDiscoverAttempted.clear();
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
    applyTravelPrefsToggleVisibility();
    applyConfiguredCollapseState();
    // Refresh the picker now that the panel is on screen — the partition
    // depends on the live sandbox + base email, both of which can have
    // changed while the user was on Generic.
    loadCounterForCurrentContext();
    // Panel just became visible — kick the sandbox-driven Schema $id /
    // Dataset ID auto-discover. No-op when fields are already populated.
    autoDiscoverInfraFromSandbox();
  });

  loadBaseEmailForCurrentSandbox();
  if (churnEl) syncChurnSlider();
  if (propensityEl) syncPropensitySlider();
  if (aovEl) syncAovSlider();
  applyLoyaltyToggleVisibility();
  applyRecentStayToggleVisibility();
  applyReservationsToggleVisibility();
  applyTravelPrefsToggleVisibility();
  loadCounterForCurrentContext();
  updateEmailPreview();
  renderRecent();
  setTimeout(() => loadConnectionFromFirestore(true), 800);
})();
