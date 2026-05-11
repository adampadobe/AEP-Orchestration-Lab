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
 *     • telecomSubscription.bundleName                     (string at root)
 *     • telecomSubscription.mobileSubscription   = [{ planLevel, portedNumber, earlyUpgradeEnrollment }]
 *     • telecomSubscription.internetSubscription = [{ connectionType, downloadSpeed, uploadSpeed, dataCap, selfSetup }]
 *     • telecomSubscription.mediaSubscription    = [{ channels }]
 *     • telecomSubscription.landlineSubscription = [{ voicemail, callerID }]
 *           ← OOTB Telecom Subscription FG (https://ns.adobe.com/xdm/mixins/profile/profile-telecom-subscription)
 *              attached by the wizard. CRITICAL: the four sub-product leaves
 *              ({mobile,internet,media,landline}Subscription) are typed as
 *              `array of object` in the OOTB schema (verified against the
 *              resolved FG in apalmer, May 2026 via Accept: xed-full+json),
 *              so we wrap each sub-product's leaves in a single-element array
 *              before streaming. Pushing them as flat dotted paths produced
 *              the JSONObject-vs-JSONArray DCVS-1104-400 ingestion failure
 *              that prompted this rewrite. Array children of
 *              <subProduct>.subscriptionDetails.* are intentionally NOT
 *              exposed (they require array-element editors).
 *
 * Operator-context dropdown re-mappings:
 *   • planTier  → telecomSubscription.bundleName              (when bundle name unset)
 *   • planTier  → telecomSubscription.mobileSubscription[0].planLevel  (when planLevel unset)
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

  // Audit §3.7: bundle-driven generation. Each persona picks a single
  // bundle archetype first, then every dependent field (plan tier, internet
  // connection + speeds, channels, landline, monthly spend, data allowance,
  // bundle name) is derived from that archetype so the streamed payload is
  // internally coherent (no "Family Quad-Play" persona without a landline,
  // no "Single Mobile-Only" persona with 100 TV channels).
  //
  // Field values map to the actual <option value="…"> entries in
  // profile-generation.html — the audit's table used semantic names; the
  // mapping below uses the live HTML values.
  const BUNDLE_PROFILES = [
    {
      name: 'Family Quad-Play',
      weight: 0.40,
      planTier: 'premium',
      monthlySpend: '100_200',
      dataAllowance: 'unlimited',
      connectionType: 'fiber',
      mediaChannels: 100,
      landline: { voicemail: true, callerID: true },
      hasMobile: true,
      hasBroadband: true,
      hasTv: true,
      hasFamilyPlan: true,
    },
    {
      name: 'Single Mobile-Only',
      weight: 0.30,
      planTier: 'standard',
      monthlySpend: 'under_25',
      dataAllowance: '5_25gb',
      connectionType: null,
      mediaChannels: 0,
      landline: null,
      hasMobile: true,
      hasBroadband: false,
      hasTv: false,
      hasFamilyPlan: false,
    },
    {
      name: 'Streaming + Internet',
      weight: 0.20,
      planTier: 'standard',
      monthlySpend: '50_100',
      dataAllowance: 'unlimited',
      connectionType: 'cable',
      mediaChannels: 80,
      landline: null,
      hasMobile: false,
      hasBroadband: true,
      hasTv: true,
      hasFamilyPlan: false,
    },
    {
      name: 'Senior Landline + Internet',
      weight: 0.10,
      planTier: 'basic',
      monthlySpend: '25_50',
      dataAllowance: '5_25gb',
      connectionType: 'dsl',
      mediaChannels: 0,
      landline: { voicemail: true, callerID: true },
      hasMobile: false,
      hasBroadband: true,
      hasTv: false,
      hasFamilyPlan: false,
    },
  ];

  // Audit §3.7 step 3: speed bias by connection type. The bands match the
  // canonical advertising buckets — fiber gigabit, cable 100-300, DSL <50.
  const SPEED_BY_CONNECTION = {
    fiber:     { dlMin: 500, dlMax: 1000, ulMin: 100, ulMax: 500 },
    cable:     { dlMin: 100, dlMax: 300,  ulMin: 25,  ulMax: 50 },
    dsl:       { dlMin: 25,  dlMax: 50,   ulMin: 5,   ulMax: 10 },
    wireless:  { dlMin: 50,  dlMax: 200,  ulMin: 10,  ulMax: 50 },
    satellite: { dlMin: 25,  dlMax: 100,  ulMin: 3,   ulMax: 25 },
  };

  function pickBundleByWeight() {
    let total = 0;
    BUNDLE_PROFILES.forEach((b) => { total += b.weight; });
    let r = Math.random() * total;
    for (let i = 0; i < BUNDLE_PROFILES.length; i++) {
      const w = BUNDLE_PROFILES[i].weight;
      if (r < w) return BUNDLE_PROFILES[i];
      r -= w;
    }
    return BUNDLE_PROFILES[BUNDLE_PROFILES.length - 1];
  }

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
      stepRunAllBtn: 'telecomStepRunAllBtn',
      infraProgressList: 'telecomInfraProgressList',
      stepCreateSchemaBtn: 'telecomStepCreateSchemaBtn',
      stepAttachFgBtn: 'telecomStepAttachFgBtn',
      stepCreateDatasetBtn: 'telecomStepCreateDatasetBtn',
      stepHttpFlowBtn: 'telecomStepHttpFlowBtn',
      enableProfileBtn: 'telecomEnableProfileBtn',
      enableProfileProgressList: 'telecomEnableProfileProgressList',
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
      markTestProfile: 'telecomMarkTestProfile',
      profileMessage: 'telecomProfileMessage',
      firstName: 'telecomFirstName',
      lastName: 'telecomLastName',
      birthDate: 'telecomBirthDate',
      age: 'telecomAge',
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

        // ---- OOTB telecomSubscription.* (root XDM mixin) ---------------------
        // The OOTB Telecom Subscription FG types `telecomSubscription` itself
        // as an object, but every sub-product
        // (mobile/internet/media/landline)Subscription is `type: array of
        // object`. The previous flat per-leaf pushes
        // (`telecomSubscription.mobileSubscription.planLevel = "Premium"`)
        // hit DCVS-1104-400 because they emitted an OBJECT where the schema
        // demanded an ARRAY. Fix: collect every leaf into a per-sub-product
        // object and push the wrapping single-element array as one leaf
        // (Route A — the proxy's setByPath assigns array values verbatim).

        // bundleName is a scalar at the root and stays a flat push.
        const tier = trim($('telecomPlanTier'));
        const explicitBundle = trim($('telecomSubBundleName'));
        const bundleName = explicitBundle || (tier && BUNDLE_NAME_BY_PLAN[tier]) || '';
        if (bundleName) push('telecomSubscription.bundleName', bundleName);

        // mobileSubscription[0] — planLevel + the two boolean toggles.
        const explicitPlanLevel = trim($('telecomSubMobilePlanLevel'));
        const planLevel = explicitPlanLevel || (tier && PLAN_LEVEL_BY_PLAN[tier]) || '';
        const mobile = {};
        if (planLevel) mobile.planLevel = planLevel;
        const portedEl = $('telecomSubPortedNumber');
        if (portedEl) mobile.portedNumber = !!portedEl.checked;
        const earlyUpgradeEl = $('telecomSubEarlyUpgrade');
        if (earlyUpgradeEl) mobile.earlyUpgradeEnrollment = !!earlyUpgradeEl.checked;
        if (Object.keys(mobile).length) {
          push('telecomSubscription.mobileSubscription', [mobile]);
        }

        // internetSubscription[0] — connectionType + speeds + cap + self-setup.
        const internet = {};
        const internetConn = trim($('telecomSubInternetConnection'));
        if (internetConn) internet.connectionType = internetConn;
        const dlSpeed = intOr($('telecomSubInternetDownload'));
        if (dlSpeed != null) internet.downloadSpeed = dlSpeed;
        const upSpeed = intOr($('telecomSubInternetUpload'));
        if (upSpeed != null) internet.uploadSpeed = upSpeed;
        const dataCap = intOr($('telecomSubInternetDataCap'));
        if (dataCap != null) internet.dataCap = dataCap;
        const selfSetupEl = $('telecomSubInternetSelfSetup');
        if (selfSetupEl) internet.selfSetup = !!selfSetupEl.checked;
        if (Object.keys(internet).length) {
          push('telecomSubscription.internetSubscription', [internet]);
        }

        // mediaSubscription[0] — currently just the channels integer.
        const media = {};
        const channels = intOr($('telecomSubMediaChannels'));
        if (channels != null) media.channels = channels;
        if (Object.keys(media).length) {
          push('telecomSubscription.mediaSubscription', [media]);
        }

        // landlineSubscription[0] — the two boolean feature toggles.
        const landline = {};
        const voicemailEl = $('telecomSubLandlineVoicemail');
        if (voicemailEl) landline.voicemail = !!voicemailEl.checked;
        const callerIDEl = $('telecomSubLandlineCallerID');
        if (callerIDEl) landline.callerID = !!callerIDEl.checked;
        if (Object.keys(landline).length) {
          push('telecomSubscription.landlineSubscription', [landline]);
        }
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
        const helpers = (window.AepProfileGenIndustry && window.AepProfileGenIndustry.helpers) || null;
        const wb = (helpers && typeof helpers.weightedBool === 'function')
          ? helpers.weightedBool
          : (p) => Math.random() < p;

        // ---- 1. Pick a bundle archetype ----
        const bundle = pickBundleByWeight();

        // ---- 2. Set every bundle-derived field. Plan tier first so the
        // plan-level/bundle-name remap (already in buildUpdates) sees a
        // real tier value rather than a random one. ----
        setSelect('telecomPlanTier', bundle.planTier);
        setSelect('telecomMonthlySpendBand', bundle.monthlySpend);
        setSelect('telecomDataAllowance', bundle.dataAllowance);

        // Remaining scalar fields that are NOT bundle-derived (contractEndBand,
        // deviceTier, networkNps) — pick uniformly from their existing pools.
        const independentScalars = SCALAR_FIELDS.filter((f) =>
          f.id !== 'telecomPlanTier' &&
          f.id !== 'telecomMonthlySpendBand' &&
          f.id !== 'telecomDataAllowance'
        );
        independentScalars.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) { const el = $(f.id); if (el) el.value = pick(opts); }
        });

        // ---- Service flags: bundle-coherent on the structural ones,
        // engagement flags via the shared randomizeFlagToggles helper for
        // the operator-facing "did anything happen recently" signals. ----
        setCheck('telecomHasMobile',     !!bundle.hasMobile);
        setCheck('telecomHasBroadband',  !!bundle.hasBroadband);
        setCheck('telecomHasTv',         !!bundle.hasTv);
        setCheck('telecomHasFamilyPlan', !!bundle.hasFamilyPlan);

        // recentNetworkIssue + upgradeEligible (the engagement flags) via
        // randomizeFlagToggles so the weights are declarative and easy to
        // tune. upgradeEligible weight is 0 here — set deterministically
        // from contractEndBand below (audit §3.7 step 4).
        if (helpers && typeof helpers.randomizeFlagToggles === 'function') {
          helpers.randomizeFlagToggles([
            { id: 'telecomRecentNetworkIssue', weight: 0.20 },
          ]);
        } else {
          setCheck('telecomRecentNetworkIssue', wb(0.20));
        }

        // ---- 4. Customer-tenure ↔ early-upgrade. The schema doesn't
        // expose customerTenure as a scalar, but contractEndBand carries
        // the same semantic. `under_3m` (i.e. fresh contract / under 1yr
        // tenure proxy) → upgradeEligible=false; otherwise 25% true. ----
        const contractBand = trim($('telecomContractEndBand'));
        const isUnder1Yr = contractBand === 'under_3m';
        if (isUnder1Yr) {
          setCheck('telecomUpgradeEligible', false);
        } else {
          setCheck('telecomUpgradeEligible', wb(0.25));
        }

        // ---- OOTB telecomSubscription enrichment — bundle-derived where
        // possible, randomised within bundle constraints otherwise. ----
        setVal('telecomSubBundleName', bundle.name);

        const tier = bundle.planTier;
        setVal('telecomSubMobilePlanLevel', PLAN_LEVEL_BY_PLAN[tier] || pick(Object.values(PLAN_LEVEL_BY_PLAN)));
        setCheck('telecomSubPortedNumber', wb(0.25));
        setCheck('telecomSubEarlyUpgrade', !isUnder1Yr && wb(0.20));

        // Internet: only set when the bundle has internet. When set,
        // pick speeds biased by connection type (audit §3.7 step 3).
        if (bundle.connectionType) {
          setSelect('telecomSubInternetConnection', bundle.connectionType);
          const speeds = SPEED_BY_CONNECTION[bundle.connectionType] || SPEED_BY_CONNECTION.cable;
          setVal('telecomSubInternetDownload', String(randInt(speeds.dlMin, speeds.dlMax)));
          setVal('telecomSubInternetUpload', String(randInt(speeds.ulMin, speeds.ulMax)));
          // Data cap: fiber gigabit + unlimited bundle → big cap; DSL → small.
          const isUnlimited = bundle.dataAllowance === 'unlimited';
          setVal('telecomSubInternetDataCap', String(isUnlimited ? pick([1000, 2000]) : pick([100, 250, 500])));
          setCheck('telecomSubInternetSelfSetup', wb(0.55));
        } else {
          setSelect('telecomSubInternetConnection', '');
          setVal('telecomSubInternetDownload', '');
          setVal('telecomSubInternetUpload', '');
          setVal('telecomSubInternetDataCap', '');
          setCheck('telecomSubInternetSelfSetup', false);
        }

        // Media channels: bundle-derived. Senior + Single Mobile-Only get 0.
        setVal('telecomSubMediaChannels', String(bundle.mediaChannels));

        // Landline: bundle-derived booleans.
        if (bundle.landline) {
          setCheck('telecomSubLandlineVoicemail', !!bundle.landline.voicemail);
          setCheck('telecomSubLandlineCallerID', !!bundle.landline.callerID);
        } else {
          setCheck('telecomSubLandlineVoicemail', false);
          setCheck('telecomSubLandlineCallerID', false);
        }

        // ---- 5. International roaming bias (audit §3.7 step 5). The
        // schema doesn't expose `hasInternationalRoaming` directly, but
        // we honour the spirit by biasing planLevel UPWARD when the
        // operator has manually toggled hasFamilyPlan + premium tier
        // already (i.e. quad-play personas read as "premium" mobile
        // plans). The bundle table already enforces this for Family
        // Quad-Play; nothing extra to do here, but the affordance is
        // documented for the next time the schema gains the leaf.
      },
    },
  });
})();
