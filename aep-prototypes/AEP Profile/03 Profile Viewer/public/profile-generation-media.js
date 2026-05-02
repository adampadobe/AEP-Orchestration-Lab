/**
 * Profile Generation — Media industry section.
 *
 * Thin per-industry config that delegates the heavy lifting to the shared
 * runtime in profile-generation-industry-runtime.js. Same setup wizard,
 * Customer Analytics, Generate-N flow, and recent-snapshot picker — only
 * the media-specific attributes (subscription tier, preferred device,
 * viewing minutes band, primary genre, last-viewed recency, account
 * sharing band) and engagement flags differ.
 *
 * Wire-up:
 *   - DOM scope: #mediaProfilePanel.
 *   - Endpoints: /api/media-profile-infra/* + /api/media-profile-connection.
 *   - Streaming target: AEP Lab - Media Profile - Dataset; the wizard
 *     attaches Profile Media (custom tenant FG, only present in 1/3
 *     sandboxes) when available, else the OOTB profile-subscriptions FG,
 *     else falls back to the `_<tenant>.industryMedia.*` tenant subtree.
 *     Either way the UI streams to `industryMedia.*` paths.
 *   - Counter / recent / scaler shared via window.AepProfileGenShared.
 */
(function () {
  'use strict';
  if (!window.AepProfileGenIndustry || typeof window.AepProfileGenIndustry.bind !== 'function') {
    console.error('[media-profile] AepProfileGenIndustry runtime missing.');
    return;
  }

  const SCALAR_FIELDS = [
    { id: 'mediaSubscriptionTier',    key: 'subscriptionTier' },
    { id: 'mediaPreferredDevice',     key: 'preferredDevice' },
    { id: 'mediaViewingMinutesBand',  key: 'viewingMinutesBand' },
    { id: 'mediaPrimaryGenre',        key: 'primaryGenre' },
    { id: 'mediaLastViewedRecency',   key: 'lastViewedRecency' },
    { id: 'mediaAccountSharingBand',  key: 'accountSharingBand' },
  ];
  const FLAG_TOGGLES = [
    { id: 'mediaAdSupported',     key: 'adSupported' },
    { id: 'mediaDownloadsEnabled', key: 'downloadsEnabled' },
    { id: 'mediaSportsPackage',   key: 'sportsPackage' },
    { id: 'mediaHasKidsProfile',  key: 'hasKidsProfile' },
    { id: 'mediaLiveTv',          key: 'liveTv' },
    { id: 'mediaBingeWatcher',    key: 'bingeWatcher' },
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
    industryKey: 'media',
    industryDisplayName: 'Media',
    panelShownEvent: 'aep-media-panel-shown',
    apiPathPrefix: 'media-profile',
    defaultFlowName: 'AEP Lab - Media Profile - Dataflow',
    ids: {
      profilePanel: 'mediaProfilePanel',
      checkInfraBtn: 'mediaCheckInfraBtn',
      stepCreateSchemaBtn: 'mediaStepCreateSchemaBtn',
      stepAttachFgBtn: 'mediaStepAttachFgBtn',
      stepCreateDatasetBtn: 'mediaStepCreateDatasetBtn',
      stepHttpFlowBtn: 'mediaStepHttpFlowBtn',
      infraStatusMessage: 'mediaInfraStatusMessage',
      infraDetails: 'mediaProfileInfraDetails',
      infraHint: 'mediaProfileInfraHint',
      streamSchemaId: 'mediaStreamSchemaId',
      streamDatasetId: 'mediaStreamDatasetId',
      streamXdmKey: 'mediaStreamXdmKey',
      streamFlowId: 'mediaStreamFlowId',
      streamFlowName: 'mediaStreamFlowName',
      streamUrl: 'mediaStreamUrl',
      loadFromFirebaseBtn: 'mediaLoadFromFirebaseBtn',
      fetchFlowFromAepBtn: 'mediaFetchFlowFromAepBtn',
      saveStreamBtn: 'mediaSaveStreamBtn',
      lookupNs: 'mediaLookupNs',
      lookupIdentifier: 'mediaLookupIdentifier',
      lookupBtn: 'mediaLookupBtn',
      lookupRecent: 'mediaLookupIdentifierRecent',
      baseEmail: 'mediaBaseEmail',
      counter: 'mediaCounter',
      generateCount: 'mediaGenerateCount',
      emailPreview: 'mediaEmailPreview',
      resetCounterBtn: 'mediaResetCounterBtn',
      updateProfileBtn: 'mediaUpdateProfileBtn',
      generateBtn: 'mediaGenerateBtn',
      dryRun: 'mediaDryRun',
      profileMessage: 'mediaProfileMessage',
      firstName: 'mediaFirstName',
      lastName: 'mediaLastName',
      churn: 'mediaChurn',
      churnValue: 'mediaChurnValue',
      propensity: 'mediaPropensity',
      propensityValue: 'mediaPropensityValue',
      nps: 'mediaNps',
      aov: 'mediaAov',
      aovValue: 'mediaAovValue',
      preferredChannel: 'mediaPreferredChannel',
      gender: 'mediaGender',
      loyaltyEnabled: 'mediaLoyaltyEnabled',
      loyaltyFields: 'mediaLoyaltyFields',
      loyaltyID: 'mediaLoyaltyID',
      loyaltyTier: 'mediaLoyaltyTier',
      loyaltyPoints: 'mediaLoyaltyPoints',
      loyaltyRandomBtn: 'mediaLoyaltyRandomBtn',
      language: 'mediaLanguage',
      recentPicker: 'mediaRecentPicker',
      recentSelect: 'mediaRecentSelect',
      recentLoadBtn: 'mediaRecentLoadBtn',
      recentDetails: 'mediaRecentDetails',
      recentListBody: 'mediaRecentListBody',
      recentCountLabel: 'mediaRecentCountLabel',
      debug: 'mediaProfileDebug',
      debugClientRequest: 'mediaDebugClientRequest',
      debugStatus: 'mediaDebugStatus',
      debugResponse: 'mediaDebugResponse',
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
          if (v) push(`industryMedia.${f.key}`, v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const el = $(t.id); if (!el) return;
          push(`industryMedia.engagementFlags.${t.key}`, !!el.checked);
        });
      },
      applyFindResult({ findBySuffix, findByKeywords, setSelectValueLoose }) {
        SCALAR_FIELDS.forEach((f) => {
          const v = findBySuffix([`industrymedia.${f.key.toLowerCase()}`, f.key.toLowerCase()]) ||
                    findByKeywords('industrymedia', f.key.toLowerCase());
          if (v) setSelectValueLoose($(f.id), v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const v = findBySuffix([`engagementflags.${t.key.toLowerCase()}`]) ||
                    findByKeywords('industrymedia', 'engagementflags', t.key.toLowerCase());
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
        if (ind.subscriptionTier) parts.push(`${ind.subscriptionTier} sub`);
        if (ind.primaryGenre) parts.push(ind.primaryGenre);
        if (ind.viewingMinutesBand) parts.push(ind.viewingMinutesBand.replace(/_/g, ' '));
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
        // Engagement flags: most subscribers don't have a kids profile,
        // most enable downloads, sports add-on is rare, binge watching
        // is common.
        setCheck('mediaAdSupported',     Math.random() < 0.30);
        setCheck('mediaDownloadsEnabled', Math.random() < 0.70);
        setCheck('mediaSportsPackage',   Math.random() < 0.20);
        setCheck('mediaHasKidsProfile',  Math.random() < 0.30);
        setCheck('mediaLiveTv',          Math.random() < 0.40);
        setCheck('mediaBingeWatcher',    Math.random() < 0.55);
      },
    },
  });
})();
