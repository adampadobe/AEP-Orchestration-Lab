/**
 * Profile Generation — Sports industry section.
 *
 * Thin per-industry config that delegates the heavy lifting to the shared
 * runtime in profile-generation-industry-runtime.js. Same setup wizard,
 * Customer Analytics, Generate-N flow, and recent-snapshot picker — only
 * the sports-specific attributes (favourite sport / team, fan segment,
 * jersey size, merchandise spend, last attended event) and fan flags
 * differ.
 *
 * Wire-up:
 *   - DOM scope: #sportsProfilePanel.
 *   - Endpoints: /api/sports-profile-infra/* + /api/sports-profile-connection.
 *   - Streaming target: AEP Lab - Sports Profile - Dataset. There is NO
 *     Profile-class custom or OOTB Adobe Sports field group, so the
 *     wizard always falls back to the `_<tenant>.industrySports.*` tenant
 *     subtree (Profile Core v2). This validates the Phase 0 layered
 *     field-group resolver's tenant-subtree fallback path.
 *   - Counter / recent / scaler shared via window.AepProfileGenShared.
 */
(function () {
  'use strict';
  if (!window.AepProfileGenIndustry || typeof window.AepProfileGenIndustry.bind !== 'function') {
    console.error('[sports-profile] AepProfileGenIndustry runtime missing.');
    return;
  }

  const SCALAR_FIELDS = [
    { id: 'sportsFavouriteSport',     key: 'favouriteSport' },
    { id: 'sportsFavouriteTeam',      key: 'favouriteTeam' },
    { id: 'sportsFanSegment',         key: 'fanSegment' },
    { id: 'sportsJerseySize',         key: 'jerseySize' },
    { id: 'sportsMerchSpendBand',     key: 'merchSpendBand' },
    { id: 'sportsLastAttendedEvent',  key: 'lastAttendedEvent' },
  ];
  const FLAG_TOGGLES = [
    { id: 'sportsSeasonTicket',  key: 'seasonTicket' },
    { id: 'sportsFantasyPlayer', key: 'fantasyPlayer' },
    { id: 'sportsBetsRegularly', key: 'betsRegularly' },
    { id: 'sportsStreamLive',    key: 'streamLive' },
    { id: 'sportsNewsletterSub', key: 'newsletterSub' },
    { id: 'sportsChildFan',      key: 'childFan' },
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
    industryKey: 'sports',
    industryDisplayName: 'Sports',
    panelShownEvent: 'aep-sports-panel-shown',
    apiPathPrefix: 'sports-profile',
    defaultFlowName: 'AEP Lab - Sports Profile - Dataflow',
    ids: {
      profilePanel: 'sportsProfilePanel',
      checkInfraBtn: 'sportsCheckInfraBtn',
      stepCreateSchemaBtn: 'sportsStepCreateSchemaBtn',
      stepAttachFgBtn: 'sportsStepAttachFgBtn',
      stepCreateDatasetBtn: 'sportsStepCreateDatasetBtn',
      stepHttpFlowBtn: 'sportsStepHttpFlowBtn',
      infraStatusMessage: 'sportsInfraStatusMessage',
      infraDetails: 'sportsProfileInfraDetails',
      infraHint: 'sportsProfileInfraHint',
      streamSchemaId: 'sportsStreamSchemaId',
      streamDatasetId: 'sportsStreamDatasetId',
      streamXdmKey: 'sportsStreamXdmKey',
      streamFlowId: 'sportsStreamFlowId',
      streamFlowName: 'sportsStreamFlowName',
      streamUrl: 'sportsStreamUrl',
      loadFromFirebaseBtn: 'sportsLoadFromFirebaseBtn',
      fetchFlowFromAepBtn: 'sportsFetchFlowFromAepBtn',
      saveStreamBtn: 'sportsSaveStreamBtn',
      lookupNs: 'sportsLookupNs',
      lookupIdentifier: 'sportsLookupIdentifier',
      lookupBtn: 'sportsLookupBtn',
      lookupRecent: 'sportsLookupIdentifierRecent',
      baseEmail: 'sportsBaseEmail',
      counter: 'sportsCounter',
      generateCount: 'sportsGenerateCount',
      emailPreview: 'sportsEmailPreview',
      resetCounterBtn: 'sportsResetCounterBtn',
      updateProfileBtn: 'sportsUpdateProfileBtn',
      generateBtn: 'sportsGenerateBtn',
      dryRun: 'sportsDryRun',
      profileMessage: 'sportsProfileMessage',
      firstName: 'sportsFirstName',
      lastName: 'sportsLastName',
      churn: 'sportsChurn',
      churnValue: 'sportsChurnValue',
      propensity: 'sportsPropensity',
      propensityValue: 'sportsPropensityValue',
      nps: 'sportsNps',
      aov: 'sportsAov',
      aovValue: 'sportsAovValue',
      preferredChannel: 'sportsPreferredChannel',
      gender: 'sportsGender',
      loyaltyEnabled: 'sportsLoyaltyEnabled',
      loyaltyFields: 'sportsLoyaltyFields',
      loyaltyID: 'sportsLoyaltyID',
      loyaltyTier: 'sportsLoyaltyTier',
      loyaltyPoints: 'sportsLoyaltyPoints',
      loyaltyRandomBtn: 'sportsLoyaltyRandomBtn',
      language: 'sportsLanguage',
      recentPicker: 'sportsRecentPicker',
      recentSelect: 'sportsRecentSelect',
      recentLoadBtn: 'sportsRecentLoadBtn',
      recentDetails: 'sportsRecentDetails',
      recentListBody: 'sportsRecentListBody',
      recentCountLabel: 'sportsRecentCountLabel',
      debug: 'sportsProfileDebug',
      debugClientRequest: 'sportsDebugClientRequest',
      debugStatus: 'sportsDebugStatus',
      debugResponse: 'sportsDebugResponse',
    },
    industry: {
      snapshot() {
        const flags = {};
        FLAG_TOGGLES.forEach((t) => { flags[t.key] = getCheck(t.id); });
        const scalar = {};
        SCALAR_FIELDS.forEach((f) => { const el = $(f.id); const v = el ? String(el.value || '').trim() : ''; if (v) scalar[f.key] = v; });
        return { ...scalar, fanFlags: flags };
      },
      buildUpdates({ push }) {
        SCALAR_FIELDS.forEach((f) => {
          const el = $(f.id); const v = el ? String(el.value || '').trim() : '';
          if (v) push(`industrySports.${f.key}`, v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const el = $(t.id); if (!el) return;
          push(`industrySports.fanFlags.${t.key}`, !!el.checked);
        });
      },
      applyFindResult({ findBySuffix, findByKeywords, setSelectValueLoose }) {
        SCALAR_FIELDS.forEach((f) => {
          const v = findBySuffix([`industrysports.${f.key.toLowerCase()}`, f.key.toLowerCase()]) ||
                    findByKeywords('industrysports', f.key.toLowerCase());
          if (v) setSelectValueLoose($(f.id), v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const v = findBySuffix([`fanflags.${t.key.toLowerCase()}`]) ||
                    findByKeywords('industrysports', 'fanflags', t.key.toLowerCase());
          if (v === '' || v == null) return;
          setCheck(t.id, String(v).toLowerCase() === 'true');
        });
      },
      loadFromSnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;
        SCALAR_FIELDS.forEach((f) => { setSelect(f.id, snap[f.key]); });
        const flags = (snap.fanFlags && typeof snap.fanFlags === 'object') ? snap.fanFlags : {};
        FLAG_TOGGLES.forEach((t) => { setCheck(t.id, !!flags[t.key]); });
      },
      summarise(snap) {
        if (!snap || !snap.industry) return '';
        const ind = snap.industry;
        const parts = [];
        if (ind.favouriteSport) parts.push(ind.favouriteSport.replace(/_/g, ' '));
        if (ind.fanSegment) parts.push(ind.fanSegment);
        if (ind.merchSpendBand) parts.push(`merch ${ind.merchSpendBand.replace(/_/g, ' ')}`);
        if (ind.fanFlags && typeof ind.fanFlags === 'object') {
          const on = Object.entries(ind.fanFlags).filter(([, v]) => !!v);
          if (on.length) parts.push(`${on.length} flags`);
        }
        return parts.join(' · ');
      },
      randomizePersona({ randomPick }) {
        SCALAR_FIELDS.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) { const el = $(f.id); if (el) el.value = randomPick(opts); }
        });
        // Fan-flag distribution: most fans stream live games and
        // subscribe to the club newsletter; season tickets and betting
        // are minorities.
        setCheck('sportsSeasonTicket',  Math.random() < 0.20);
        setCheck('sportsFantasyPlayer', Math.random() < 0.30);
        setCheck('sportsBetsRegularly', Math.random() < 0.20);
        setCheck('sportsStreamLive',    Math.random() < 0.65);
        setCheck('sportsNewsletterSub', Math.random() < 0.55);
        setCheck('sportsChildFan',      Math.random() < 0.30);
      },
    },
  });
})();
