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
 * Wire-up:
 *   - DOM scope: #telecomProfilePanel.
 *   - Endpoints: /api/telecom-profile-infra/* + /api/telecom-profile-connection
 *     (rewrites in firebase.json, served by functions/index.js, backed by
 *     functions/telecomProfileInfraService.js + telecomProfileConnectionStore.js).
 *   - Streaming target: AEP Lab - Telecom Profile - Dataset; the wizard
 *     attaches the OOTB profile-telecom-subscription field group when
 *     present, otherwise the lab falls back to the `_<tenant>.industryTelecom.*`
 *     tenant subtree (Profile Core v2). Either way the UI streams to
 *     `industryTelecom.*` paths only — never the OOTB telecomSubscription
 *     root path — so every sandbox renders identically.
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

  const $ = (id) => document.getElementById(id);
  const getCheck = (id) => { const el = $(id); return el ? !!el.checked : false; };
  const setCheck = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
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
        return { ...scalar, serviceFlags: flags };
      },
      buildUpdates({ push }) {
        SCALAR_FIELDS.forEach((f) => {
          const el = $(f.id); const v = el ? String(el.value || '').trim() : '';
          if (v) push(`industryTelecom.${f.key}`, v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const el = $(t.id); if (!el) return;
          push(`industryTelecom.serviceFlags.${t.key}`, !!el.checked);
        });
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
      },
      loadFromSnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;
        SCALAR_FIELDS.forEach((f) => { setSelect(f.id, snap[f.key]); });
        const flags = (snap.serviceFlags && typeof snap.serviceFlags === 'object') ? snap.serviceFlags : {};
        FLAG_TOGGLES.forEach((t) => { setCheck(t.id, !!flags[t.key]); });
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
        return parts.join(' · ');
      },
      randomizePersona({ randomPick }) {
        SCALAR_FIELDS.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) { const el = $(f.id); if (el) el.value = randomPick(opts); }
        });
        // Realistic service-flag distribution: most operators have a
        // mobile line; broadband / TV vary; family plan and recent
        // network issue are minority cases.
        setCheck('telecomHasMobile',          Math.random() < 0.92);
        setCheck('telecomHasBroadband',       Math.random() < 0.55);
        setCheck('telecomHasTv',              Math.random() < 0.35);
        setCheck('telecomHasFamilyPlan',      Math.random() < 0.30);
        setCheck('telecomRecentNetworkIssue', Math.random() < 0.20);
        setCheck('telecomUpgradeEligible',    Math.random() < 0.40);
      },
    },
  });
})();
