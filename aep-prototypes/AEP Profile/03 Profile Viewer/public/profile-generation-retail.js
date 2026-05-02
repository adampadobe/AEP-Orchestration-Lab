/**
 * Profile Generation — Retail industry section.
 *
 * Thin per-industry config that delegates the heavy lifting to the shared
 * runtime in profile-generation-industry-runtime.js. Same setup wizard,
 * Customer Analytics, Generate-N flow, and recent-snapshot picker as
 * Generic / Travel / FSI / Telecom — only the retail-specific attribute
 * fields differ.
 *
 * Wire-up:
 *   - DOM scope: #retailProfilePanel.
 *   - Endpoints: /api/retail-profile-infra/* + /api/retail-profile-connection.
 *   - Streaming target: AEP Lab - Retail Profile - Dataset; the wizard
 *     attaches the custom Profile Retail v2 / Profile Retail Scoring
 *     tenant FGs when present (3/3 sandboxes had Retail v2), otherwise
 *     falls back to the `_<tenant>.industryRetail.*` tenant subtree.
 *     Either way the UI streams to `industryRetail.*` paths.
 *   - Counter / recent / scaler shared via window.AepProfileGenShared.
 */
(function () {
  'use strict';
  if (!window.AepProfileGenIndustry || typeof window.AepProfileGenIndustry.bind !== 'function') {
    console.error('[retail-profile] AepProfileGenIndustry runtime missing.');
    return;
  }

  const SCALAR_FIELDS = [
    { id: 'retailFavoriteCategory',    key: 'favoriteCategory' },
    { id: 'retailLtvBand',             key: 'ltvBand' },
    { id: 'retailHouseholdComposition', key: 'householdComposition' },
    { id: 'retailChannelPreference',   key: 'channelPreference' },
    { id: 'retailRetailLoyaltyTier',   key: 'retailLoyaltyTier' },
    { id: 'retailLastPurchaseRecency', key: 'lastPurchaseRecency' },
  ];
  const FLAG_TOGGLES = [
    { id: 'retailCartAbandoned',  key: 'cartAbandoned' },
    { id: 'retailWishlist',       key: 'wishlist' },
    { id: 'retailStoreCardHolder', key: 'storeCardHolder' },
    { id: 'retailSubscribed',     key: 'subscribed' },
    { id: 'retailReturnedRecent', key: 'returnedRecent' },
    { id: 'retailReviewsItems',   key: 'reviewsItems' },
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
    industryKey: 'retail',
    industryDisplayName: 'Retail',
    panelShownEvent: 'aep-retail-panel-shown',
    apiPathPrefix: 'retail-profile',
    defaultFlowName: 'AEP Lab - Retail Profile - Dataflow',
    ids: {
      profilePanel: 'retailProfilePanel',
      checkInfraBtn: 'retailCheckInfraBtn',
      stepCreateSchemaBtn: 'retailStepCreateSchemaBtn',
      stepAttachFgBtn: 'retailStepAttachFgBtn',
      stepCreateDatasetBtn: 'retailStepCreateDatasetBtn',
      stepHttpFlowBtn: 'retailStepHttpFlowBtn',
      infraStatusMessage: 'retailInfraStatusMessage',
      infraDetails: 'retailProfileInfraDetails',
      infraHint: 'retailProfileInfraHint',
      streamSchemaId: 'retailStreamSchemaId',
      streamDatasetId: 'retailStreamDatasetId',
      streamXdmKey: 'retailStreamXdmKey',
      streamFlowId: 'retailStreamFlowId',
      streamFlowName: 'retailStreamFlowName',
      streamUrl: 'retailStreamUrl',
      loadFromFirebaseBtn: 'retailLoadFromFirebaseBtn',
      fetchFlowFromAepBtn: 'retailFetchFlowFromAepBtn',
      saveStreamBtn: 'retailSaveStreamBtn',
      lookupNs: 'retailLookupNs',
      lookupIdentifier: 'retailLookupIdentifier',
      lookupBtn: 'retailLookupBtn',
      lookupRecent: 'retailLookupIdentifierRecent',
      baseEmail: 'retailBaseEmail',
      counter: 'retailCounter',
      generateCount: 'retailGenerateCount',
      emailPreview: 'retailEmailPreview',
      resetCounterBtn: 'retailResetCounterBtn',
      updateProfileBtn: 'retailUpdateProfileBtn',
      generateBtn: 'retailGenerateBtn',
      dryRun: 'retailDryRun',
      profileMessage: 'retailProfileMessage',
      firstName: 'retailFirstName',
      lastName: 'retailLastName',
      churn: 'retailChurn',
      churnValue: 'retailChurnValue',
      propensity: 'retailPropensity',
      propensityValue: 'retailPropensityValue',
      nps: 'retailNps',
      aov: 'retailAov',
      aovValue: 'retailAovValue',
      preferredChannel: 'retailPreferredChannel',
      gender: 'retailGender',
      loyaltyEnabled: 'retailLoyaltyEnabled',
      loyaltyFields: 'retailLoyaltyFields',
      loyaltyID: 'retailLoyaltyID',
      loyaltyTier: 'retailLoyaltyTier',
      loyaltyPoints: 'retailLoyaltyPoints',
      loyaltyRandomBtn: 'retailLoyaltyRandomBtn',
      language: 'retailLanguage',
      recentPicker: 'retailRecentPicker',
      recentSelect: 'retailRecentSelect',
      recentLoadBtn: 'retailRecentLoadBtn',
      recentDetails: 'retailRecentDetails',
      recentListBody: 'retailRecentListBody',
      recentCountLabel: 'retailRecentCountLabel',
      debug: 'retailProfileDebug',
      debugClientRequest: 'retailDebugClientRequest',
      debugStatus: 'retailDebugStatus',
      debugResponse: 'retailDebugResponse',
    },
    industry: {
      snapshot() {
        const flags = {};
        FLAG_TOGGLES.forEach((t) => { flags[t.key] = getCheck(t.id); });
        const scalar = {};
        SCALAR_FIELDS.forEach((f) => { const el = $(f.id); const v = el ? String(el.value || '').trim() : ''; if (v) scalar[f.key] = v; });
        return { ...scalar, engagementFlags: flags };
      },
      buildUpdates({ push }) {
        SCALAR_FIELDS.forEach((f) => {
          const el = $(f.id); const v = el ? String(el.value || '').trim() : '';
          if (v) push(`industryRetail.${f.key}`, v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const el = $(t.id); if (!el) return;
          push(`industryRetail.engagementFlags.${t.key}`, !!el.checked);
        });
      },
      applyFindResult({ findBySuffix, findByKeywords, setSelectValueLoose }) {
        SCALAR_FIELDS.forEach((f) => {
          const v = findBySuffix([`industryretail.${f.key.toLowerCase()}`, f.key.toLowerCase()]) ||
                    findByKeywords('industryretail', f.key.toLowerCase());
          if (v) setSelectValueLoose($(f.id), v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const v = findBySuffix([`engagementflags.${t.key.toLowerCase()}`]) ||
                    findByKeywords('industryretail', 'engagementflags', t.key.toLowerCase());
          if (v === '' || v == null) return;
          setCheck(t.id, String(v).toLowerCase() === 'true');
        });
      },
      loadFromSnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;
        SCALAR_FIELDS.forEach((f) => { setSelect(f.id, snap[f.key]); });
        const flags = (snap.engagementFlags && typeof snap.engagementFlags === 'object') ? snap.engagementFlags : {};
        FLAG_TOGGLES.forEach((t) => { setCheck(t.id, !!flags[t.key]); });
      },
      summarise(snap) {
        if (!snap || !snap.industry) return '';
        const ind = snap.industry;
        const parts = [];
        if (ind.favoriteCategory) parts.push(ind.favoriteCategory);
        if (ind.ltvBand) parts.push(`LTV ${ind.ltvBand.replace(/_/g, ' ')}`);
        if (ind.retailLoyaltyTier) parts.push(`tier ${ind.retailLoyaltyTier}`);
        if (ind.engagementFlags && typeof ind.engagementFlags === 'object') {
          const on = Object.entries(ind.engagementFlags).filter(([, v]) => !!v);
          if (on.length) parts.push(`${on.length} flags`);
        }
        return parts.join(' · ');
      },
      randomizePersona({ randomPick }) {
        SCALAR_FIELDS.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) { const el = $(f.id); if (el) el.value = randomPick(opts); }
        });
        // Engagement-flag distribution: typical retail customer hasn't
        // returned anything recently, has no active wishlist, mid-tier on
        // store-card; review writers are a minority.
        setCheck('retailCartAbandoned',  Math.random() < 0.30);
        setCheck('retailWishlist',       Math.random() < 0.40);
        setCheck('retailStoreCardHolder', Math.random() < 0.25);
        setCheck('retailSubscribed',     Math.random() < 0.55);
        setCheck('retailReturnedRecent', Math.random() < 0.20);
        setCheck('retailReviewsItems',   Math.random() < 0.15);
      },
    },
  });
})();
