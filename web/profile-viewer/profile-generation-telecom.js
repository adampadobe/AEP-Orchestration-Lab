/**
 * Profile Generation — Telecommunications industry section.
 *
 * Thin per-industry config that delegates the heavy lifting to the shared
 * runtime in profile-generation-industry-runtime.js. Same setup wizard,
 * Customer Analytics, Generate-N flow, and recent-snapshot picker as
 * Generic / Travel / FSI — only the telecom-specific attribute fields
 * (plan tier, contract end, monthly spend, data allowance, device tier,
 * NPS for the network) and service flags differ.
 *
 * Schema-valid push paths (mirror the AEP Lab - Telecom Profile - Schema
 * once the wizard runs in this sandbox):
 *
 *   tenant subtree (`_<tenant>.…`) — auto-prefixed by the proxy
 *     • industryTelecom.{planTier, monthlySpendBand, dataAllowance,
 *         contractEndBand, deviceTier, networkNps}
 *     • industryTelecom.serviceFlags.{hasMobile, hasBroadband, hasTv,
 *         hasFamilyPlan, recentNetworkIssue, upgradeEligible}
 *           ← existing operator-context dropdowns + flags. Declared in the
 *              auto-created `Profile Telecom v1` tenant FG body, see
 *              functions/telecomProfileInfraService.js.
 *
 *   root XDM mixin (`telecomSubscription` is in
 *   `PROFILE_STREAM_ROOT_PATH_PREFIXES` already — required so the proxy
 *   doesn't tenant-prefix it under `_<tenant>.telecomSubscription.*`)
 *     • telecomSubscription.bundleName
 *     • telecomSubscription.mobileSubscription.planLevel
 *     • telecomSubscription.mobileSubscription.portedNumber
 *     • telecomSubscription.mobileSubscription.earlyUpgradeEnrollment
 *     • telecomSubscription.internetSubscription.connectionType
 *     • telecomSubscription.internetSubscription.downloadSpeed
 *     • telecomSubscription.internetSubscription.uploadSpeed
 *     • telecomSubscription.internetSubscription.dataCap
 *     • telecomSubscription.internetSubscription.selfSetup
 *     • telecomSubscription.mediaSubscription.channels
 *     • telecomSubscription.landlineSubscription.{voicemail, callerID}
 *           ← OOTB Telecom Subscription FG (https://ns.adobe.com/xdm/mixins/profile/profile-telecom-subscription)
 *              attached by the wizard. Verified leaves against the resolved
 *              FG (apalmer, May 2026) — every path above maps to an actual
 *              schema leaf. Array children of {mobile,internet,landline,media}
 *              Subscription.subscriptionDetails.* are intentionally NOT
 *              exposed (they require array-element editors).
 *
 * Operator-context dropdown re-mappings:
 *   • planTier  → telecomSubscription.bundleName  (when bundle name unset)
 *   • planTier  → telecomSubscription.mobileSubscription.planLevel  (when planLevel unset)
 *
 * Wire-up:
 *   - DOM scope: #telecomProfilePanel.
 *   - Endpoints: /api/telecom-profile-infra/* + /api/telecom-profile-connection
 *     (rewrites in firebase.json, served by functions/index.js, backed by
 *     functions/telecomProfileInfraService.js + telecomProfileConnectionStore.js).
 *   - Counter / recent / scaler: shared via window.AepProfileGenShared.
 */
(function () {
  'use strict';
  if (!window.AepProfileGenIndustry || typeof window.AepProfileGenIndustry.bind !== 'function') {
    console.error('[telecom-profile] AepProfileGenIndustry runtime missing.');
    return;
  }

  const SCALAR_FIELDS = [
    { id: 'telecomPlanTier',           key: 'planTier' },
    { id: 'telecomMonthlySpendBand',   key: 'monthlySpendBand' },
    { id: 'telecomDataAllowance',      key: 'dataAllowance' },
    { id: 'telecomContractEndBand',    key: 'contractEndBand' },
    { id: 'telecomDeviceTier',         key: 'deviceTier' },
    { id: 'telecomNetworkNps',         key: 'networkNps' },
  ];
  const FLAG_TOGGLES = [
    { id: 'telecomHasMobile',          key: 'hasMobile' },
    { id: 'telecomHasBroadband',       key: 'hasBroadband' },
    { id: 'telecomHasTv',              key: 'hasTv' },
    { id: 'telecomHasFamilyPlan',      key: 'hasFamilyPlan' },
    { id: 'telecomRecentNetworkIssue', key: 'recentNetworkIssue' },
    { id: 'telecomUpgradeEligible',    key: 'upgradeEligible' },
  ];

  const BUNDLE_NAME_BY_PLAN = {
    basic:     'Essentials Bundle',
    standard:  'Standard Bundle',
    premium:   'Premium Bundle',
    unlimited: 'Unlimited Bundle',
  };
  const PLAN_LEVEL_BY_PLAN = {
    basic:     'Basic',
    standard:  'Standard',
    premium:   'Premium',
    unlimited: 'Unlimited',
  };
  const CONNECTION_TYPE_POOL = ['fiber', 'cable', 'dsl', 'wireless', 'satellite'];

  const $ = (id) => document.getElementById(id);
  const trim = (el) => (el && typeof el.value === 'string') ? el.value.trim() : '';
  const intOr = (el) => {
    const raw = trim(el); if (raw === '') return null;
    const n = parseInt(raw, 10); return Number.isFinite(n) ? n : null;
  };
  const getCheck = (id) => { const el = $(id); return el ? !!el.checked : false; };
  const setCheck = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
  const setVal = (id, v) => { const el = $(id); if (el && v != null) el.value = String(v); };
  const setSelect = (id, v) => {
    const el = $(id);
    if (!el || v == null) return;
    const val = String(v).trim();
    if (!val) return;
    const opts = Array.from(el.options || []);
    const exact = opts.find((o) => o.value === val);
    if (exact) { el.value = exact.value; return; }
    const ci = opts.find((o) => String(o.value).toLowerCase() === val.toLowerCase());
    if (ci) el.value = ci.value;
  };
  const selectValuesNonEmpty = (id) => {
    const el = $(id); if (!el || !el.options) return [];
    const out = []; for (let i = 0; i < el.options.length; i++) { const v = el.options[i].value; if (v !== '') out.push(v); } return out;
  };
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  window.AepProfileGenIndustry.bind({
    industryKey: 'telecom',
    industryDisplayName: 'Telecom',
    panelShownEvent: 'aep-telecom-panel-shown',
    apiPathPrefix: 'telecom-profile',
    defaultFlowName: 'AEP Lab - Telecom Profile - Dataflow',
    ids: {
      profilePanel: 'telecomProfilePanel',
      checkInfraBtn: 'telecomCheckInfraBtn',
      stepCreateSchemaBtn: 'telecomStepCreateSchemaBtn',
      stepAttachFgBtn: 'telecomStepAttachFgBtn',
      stepCreateDatasetBtn: 'telecomStepCreateDatasetBtn',
      stepHttpFlowBtn: 'telecomStepHttpFlowBtn',
      infraStatusMessage: 'telecomInfraStatusMessage',
      infraDetails: 'telecomProfileInfraDetails',
      infraHint: 'telecomProfileInfraHint',
      streamSchemaId: 'telecomStreamSchemaId',
      streamDatasetId: 'telecomStreamDatasetId',
      streamXdmKey: 'telecomStreamXdmKey',
      streamFlowId: 'telecomStreamFlowId',
      streamFlowName: 'telecomStreamFlowName',
      streamUrl: 'telecomStreamUrl',
      loadFromFirebaseBtn: 'telecomLoadFromFirebaseBtn',
      fetchFlowFromAepBtn: 'telecomFetchFlowFromAepBtn',
      saveStreamBtn: 'telecomSaveStreamBtn',
      lookupNs: 'telecomLookupNs',
      lookupIdentifier: 'telecomLookupIdentifier',
      lookupBtn: 'telecomLookupBtn',
      lookupRecent: 'telecomLookupIdentifierRecent',
      baseEmail: 'telecomBaseEmail',
      counter: 'telecomCounter',
      generateCount: 'telecomGenerateCount',
      emailPreview: 'telecomEmailPreview',
      resetCounterBtn: 'telecomResetCounterBtn',
      updateProfileBtn: 'telecomUpdateProfileBtn',
      generateBtn: 'telecomGenerateBtn',
      dryRun: 'telecomDryRun',
      profileMessage: 'telecomProfileMessage',
      firstName: 'telecomFirstName',
      lastName: 'telecomLastName',
      churn: 'telecomChurn',
      churnValue: 'telecomChurnValue',
      propensity: 'telecomPropensity',
      propensityValue: 'telecomPropensityValue',
      nps: 'telecomNps',
      aov: 'telecomAov',
      aovValue: 'telecomAovValue',
      preferredChannel: 'telecomPreferredChannel',
      gender: 'telecomGender',
      loyaltyEnabled: 'telecomLoyaltyEnabled',
      loyaltyFields: 'telecomLoyaltyFields',
      loyaltyID: 'telecomLoyaltyID',
      loyaltyTier: 'telecomLoyaltyTier',
      loyaltyPoints: 'telecomLoyaltyPoints',
      loyaltyRandomBtn: 'telecomLoyaltyRandomBtn',
      language: 'telecomLanguage',
      recentPicker: 'telecomRecentPicker',
      recentSelect: 'telecomRecentSelect',
      recentLoadBtn: 'telecomRecentLoadBtn',
      recentDetails: 'telecomRecentDetails',
      recentListBody: 'telecomRecentListBody',
      recentCountLabel: 'telecomRecentCountLabel',
      debug: 'telecomProfileDebug',
      debugClientRequest: 'telecomDebugClientRequest',
      debugStatus: 'telecomDebugStatus',
      debugResponse: 'telecomDebugResponse',
    },
    industry: {
      snapshot() {
        const flags = {};
        FLAG_TOGGLES.forEach((t) => { flags[t.key] = getCheck(t.id); });
        const scalar = {};
        SCALAR_FIELDS.forEach((f) => { const el = $(f.id); const v = el ? String(el.value || '').trim() : ''; if (v) scalar[f.key] = v; });
        const subscription = {
          bundleName:           trim($('telecomSubBundleName')),
          mobilePlanLevel:      trim($('telecomSubMobilePlanLevel')),
          portedNumber:         getCheck('telecomSubPortedNumber'),
          earlyUpgrade:         getCheck('telecomSubEarlyUpgrade'),
          internetConnection:   trim($('telecomSubInternetConnection')),
          internetDownload:     trim($('telecomSubInternetDownload')),
          internetUpload:       trim($('telecomSubInternetUpload')),
          internetDataCap:      trim($('telecomSubInternetDataCap')),
          internetSelfSetup:    getCheck('telecomSubInternetSelfSetup'),
          mediaChannels:        trim($('telecomSubMediaChannels')),
          landlineVoicemail:    getCheck('telecomSubLandlineVoicemail'),
          landlineCallerID:     getCheck('telecomSubLandlineCallerID'),
        };
        return { ...scalar, serviceFlags: flags, subscription };
      },
      buildUpdates({ push }) {
        // ---- Original industryTelecom.* pushes (kept; valid via Profile Telecom v1) ----
        SCALAR_FIELDS.forEach((f) => {
          const el = $(f.id); const v = el ? String(el.value || '').trim() : '';
          if (v) push(`industryTelecom.${f.key}`, v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const el = $(t.id); if (!el) return;
          push(`industryTelecom.serviceFlags.${t.key}`, !!el.checked);
        });

        // ---- Operator-context plan-tier remapping onto OOTB scalars ----
        const tier = trim($('telecomPlanTier'));
        const explicitBundle = trim($('telecomSubBundleName'));
        if (!explicitBundle && tier && BUNDLE_NAME_BY_PLAN[tier]) {
          push('telecomSubscription.bundleName', BUNDLE_NAME_BY_PLAN[tier]);
        }
        const explicitPlanLevel = trim($('telecomSubMobilePlanLevel'));
        if (!explicitPlanLevel && tier && PLAN_LEVEL_BY_PLAN[tier]) {
          push('telecomSubscription.mobileSubscription.planLevel', PLAN_LEVEL_BY_PLAN[tier]);
        }

        // ---- New OOTB telecomSubscription.* leaves ----
        if (explicitBundle) push('telecomSubscription.bundleName', explicitBundle);
        if (explicitPlanLevel) push('telecomSubscription.mobileSubscription.planLevel', explicitPlanLevel);

        const portedEl = $('telecomSubPortedNumber');
        if (portedEl) push('telecomSubscription.mobileSubscription.portedNumber', !!portedEl.checked);

        const earlyUpgradeEl = $('telecomSubEarlyUpgrade');
        if (earlyUpgradeEl) push('telecomSubscription.mobileSubscription.earlyUpgradeEnrollment', !!earlyUpgradeEl.checked);

        const internetConn = trim($('telecomSubInternetConnection'));
        if (internetConn) push('telecomSubscription.internetSubscription.connectionType', internetConn);

        const dlSpeed = intOr($('telecomSubInternetDownload'));
        if (dlSpeed != null) push('telecomSubscription.internetSubscription.downloadSpeed', dlSpeed);

        const upSpeed = intOr($('telecomSubInternetUpload'));
        if (upSpeed != null) push('telecomSubscription.internetSubscription.uploadSpeed', upSpeed);

        const dataCap = intOr($('telecomSubInternetDataCap'));
        if (dataCap != null) push('telecomSubscription.internetSubscription.dataCap', dataCap);

        const selfSetupEl = $('telecomSubInternetSelfSetup');
        if (selfSetupEl) push('telecomSubscription.internetSubscription.selfSetup', !!selfSetupEl.checked);

        const channels = intOr($('telecomSubMediaChannels'));
        if (channels != null) push('telecomSubscription.mediaSubscription.channels', channels);

        const voicemailEl = $('telecomSubLandlineVoicemail');
        if (voicemailEl) push('telecomSubscription.landlineSubscription.voicemail', !!voicemailEl.checked);

        const callerIDEl = $('telecomSubLandlineCallerID');
        if (callerIDEl) push('telecomSubscription.landlineSubscription.callerID', !!callerIDEl.checked);
      },
      applyFindResult({ findBySuffix, findByKeywords, setSelectValueLoose }) {
        SCALAR_FIELDS.forEach((f) => {
          const v = findBySuffix([`industrytelecom.${f.key.toLowerCase()}`, f.key.toLowerCase()]) ||
                    findByKeywords('industrytelecom', f.key.toLowerCase());
          if (v) setSelectValueLoose($(f.id), v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const v = findBySuffix([`serviceflags.${t.key.toLowerCase()}`]) ||
                    findByKeywords('industrytelecom', 'serviceflags', t.key.toLowerCase());
          if (v === '' || v == null) return;
          setCheck(t.id, String(v).toLowerCase() === 'true');
        });

        // OOTB telecomSubscription hydration.
        const bundle = findBySuffix(['telecomsubscription.bundlename']) ||
                       findByKeywords('telecomsubscription', 'bundlename');
        if (bundle) setVal('telecomSubBundleName', String(bundle));

        const planLevel = findBySuffix(['mobilesubscription.planlevel']) ||
                          findByKeywords('mobilesubscription', 'planlevel');
        if (planLevel) setVal('telecomSubMobilePlanLevel', String(planLevel));

        const ported = findBySuffix(['mobilesubscription.portednumber']) ||
                       findByKeywords('mobilesubscription', 'portednumber');
        if (ported !== '' && ported != null) setCheck('telecomSubPortedNumber', String(ported).toLowerCase() === 'true');

        const earlyUp = findBySuffix(['mobilesubscription.earlyupgradeenrollment']) ||
                        findByKeywords('mobilesubscription', 'earlyupgrade');
        if (earlyUp !== '' && earlyUp != null) setCheck('telecomSubEarlyUpgrade', String(earlyUp).toLowerCase() === 'true');

        const conn = findBySuffix(['internetsubscription.connectiontype']) ||
                     findByKeywords('internetsubscription', 'connectiontype');
        if (conn) setSelectValueLoose($('telecomSubInternetConnection'), conn);

        const dl = findBySuffix(['internetsubscription.downloadspeed']) ||
                   findByKeywords('internetsubscription', 'downloadspeed');
        if (dl) setVal('telecomSubInternetDownload', String(dl));

        const up = findBySuffix(['internetsubscription.uploadspeed']) ||
                   findByKeywords('internetsubscription', 'uploadspeed');
        if (up) setVal('telecomSubInternetUpload', String(up));

        const cap = findBySuffix(['internetsubscription.datacap']) ||
                    findByKeywords('internetsubscription', 'datacap');
        if (cap) setVal('telecomSubInternetDataCap', String(cap));

        const selfSetup = findBySuffix(['internetsubscription.selfsetup']) ||
                          findByKeywords('internetsubscription', 'selfsetup');
        if (selfSetup !== '' && selfSetup != null) setCheck('telecomSubInternetSelfSetup', String(selfSetup).toLowerCase() === 'true');

        const ch = findBySuffix(['mediasubscription.channels']) ||
                   findByKeywords('mediasubscription', 'channels');
        if (ch) setVal('telecomSubMediaChannels', String(ch));

        const vm = findBySuffix(['landlinesubscription.voicemail']) ||
                   findByKeywords('landlinesubscription', 'voicemail');
        if (vm !== '' && vm != null) setCheck('telecomSubLandlineVoicemail', String(vm).toLowerCase() === 'true');

        const cid = findBySuffix(['landlinesubscription.callerid']) ||
                    findByKeywords('landlinesubscription', 'callerid');
        if (cid !== '' && cid != null) setCheck('telecomSubLandlineCallerID', String(cid).toLowerCase() === 'true');
      },
      loadFromSnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;
        SCALAR_FIELDS.forEach((f) => { setSelect(f.id, snap[f.key]); });
        const flags = (snap.serviceFlags && typeof snap.serviceFlags === 'object') ? snap.serviceFlags : {};
        FLAG_TOGGLES.forEach((t) => { setCheck(t.id, !!flags[t.key]); });
        const s = (snap.subscription && typeof snap.subscription === 'object') ? snap.subscription : {};
        setVal('telecomSubBundleName', s.bundleName || '');
        setVal('telecomSubMobilePlanLevel', s.mobilePlanLevel || '');
        setCheck('telecomSubPortedNumber', !!s.portedNumber);
        setCheck('telecomSubEarlyUpgrade', !!s.earlyUpgrade);
        setSelect('telecomSubInternetConnection', s.internetConnection || '');
        setVal('telecomSubInternetDownload', s.internetDownload || '');
        setVal('telecomSubInternetUpload', s.internetUpload || '');
        setVal('telecomSubInternetDataCap', s.internetDataCap || '');
        setCheck('telecomSubInternetSelfSetup', !!s.internetSelfSetup);
        setVal('telecomSubMediaChannels', s.mediaChannels || '');
        setCheck('telecomSubLandlineVoicemail', !!s.landlineVoicemail);
        setCheck('telecomSubLandlineCallerID', !!s.landlineCallerID);
      },
      summarise(snap) {
        if (!snap || !snap.industry) return '';
        const ind = snap.industry;
        const parts = [];
        if (ind.planTier) parts.push(`${ind.planTier} plan`);
        if (ind.monthlySpendBand) parts.push(`spend ${ind.monthlySpendBand.replace(/_/g, ' ')}`);
        if (ind.deviceTier) parts.push(`device ${ind.deviceTier.replace(/_/g, ' ')}`);
        if (ind.serviceFlags && typeof ind.serviceFlags === 'object') {
          const on = Object.entries(ind.serviceFlags).filter(([, v]) => !!v);
          if (on.length) parts.push(`${on.length} services`);
        }
        if (ind.subscription && ind.subscription.bundleName) parts.push(`bundle ${ind.subscription.bundleName}`);
        return parts.join(' · ');
      },
      randomizePersona({ randomPick: pick }) {
        SCALAR_FIELDS.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) { const el = $(f.id); if (el) el.value = pick(opts); }
        });
        // Realistic service-flag distribution.
        setCheck('telecomHasMobile',          Math.random() < 0.92);
        setCheck('telecomHasBroadband',       Math.random() < 0.55);
        setCheck('telecomHasTv',              Math.random() < 0.35);
        setCheck('telecomHasFamilyPlan',      Math.random() < 0.30);
        setCheck('telecomRecentNetworkIssue', Math.random() < 0.20);
        setCheck('telecomUpgradeEligible',    Math.random() < 0.40);

        // OOTB telecomSubscription enrichment — anchored to the chosen plan tier.
        const tier = trim($('telecomPlanTier'));
        setVal('telecomSubBundleName', BUNDLE_NAME_BY_PLAN[tier] || pick(Object.values(BUNDLE_NAME_BY_PLAN)));
        setVal('telecomSubMobilePlanLevel', PLAN_LEVEL_BY_PLAN[tier] || pick(Object.values(PLAN_LEVEL_BY_PLAN)));
        setCheck('telecomSubPortedNumber', Math.random() < 0.25);
        setCheck('telecomSubEarlyUpgrade', Math.random() < 0.20);

        setSelect('telecomSubInternetConnection', pick(CONNECTION_TYPE_POOL));
        // Download/upload speeds (Mbps) — fiber heavy at the top end.
        setVal('telecomSubInternetDownload', String(pick([25, 50, 100, 250, 500, 1000])));
        setVal('telecomSubInternetUpload', String(pick([5, 10, 25, 50, 100, 500])));
        setVal('telecomSubInternetDataCap', String(pick([100, 250, 500, 1000, 2000])));
        setCheck('telecomSubInternetSelfSetup', Math.random() < 0.55);

        setVal('telecomSubMediaChannels', String(randInt(50, 400)));
        setCheck('telecomSubLandlineVoicemail', Math.random() < 0.55);
        setCheck('telecomSubLandlineCallerID', Math.random() < 0.65);
      },
    },
  });
})();
