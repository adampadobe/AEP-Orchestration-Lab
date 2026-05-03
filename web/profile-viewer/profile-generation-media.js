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
 * Schema-valid push paths (mirror the AEP Lab - Media Profile - Schema once
 * the wizard runs in this sandbox):
 *
 *   tenant subtree (`_<tenant>.…`) — auto-prefixed by the proxy
 *     • industryMedia.{subscriptionTier, preferredDevice, viewingMinutesBand,
 *         primaryGenre, lastViewedRecency, accountSharingBand}
 *     • industryMedia.engagementFlags.{adSupported, downloadsEnabled,
 *         sportsPackage, hasKidsProfile, liveTv, bingeWatcher}
 *           ← existing operator-context dropdowns + flags. Declared in the
 *              auto-created `Profile Media v1` tenant FG body, see
 *              functions/mediaProfileInfraService.js.
 *     • individualCharacteristics.core.favouriteSubCategory
 *           ← Profile Core v2 leaf, populated from `primaryGenre` so
 *              audiences can target by genre on the generic tenant subtree.
 *
 *   root XDM mixin (proxy must allow the `subscriptions` top key via
 *   `PROFILE_STREAM_ROOT_PATH_PREFIXES` in functions/profileStreamingCore.js)
 *     • subscriptions.{SKU, planName, billingPeriod, status, type,
 *         paymentMethod, startDate, endDate, term, termUnitOfTime,
 *         category, country, renew}
 *           ← OOTB Subscription Details FG attached by the Media wizard.
 *              Previously had no UI exposure for Media — fixed May 2026
 *              alongside the parallel FSI / Telecom / Sports / runtime audit.
 *
 * Operator-context dropdown re-mappings (added without changing the original
 * `industryMedia.*` push targets — those already land on real schema leaves):
 *   • subscriptionTier   → also `subscriptions.planName`
 *   • lastViewedRecency  → also `subscriptions.startDate` (derived)
 *   • primaryGenre       → also `_<tenant>.individualCharacteristics.core.favouriteSubCategory`
 *
 * Wire-up:
 *   - DOM scope: #mediaProfilePanel.
 *   - Endpoints: /api/media-profile-infra/* + /api/media-profile-connection.
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

  // Operator-context → OOTB plan name + recency → subscription start date.
  const TIER_TO_PLAN_NAME = {
    free:        'Free (Ad-supported)',
    standard:    'Standard',
    premium:     'Premium',
    premium_plus: 'Premium Plus',
    family:      'Family Bundle',
  };
  const RECENCY_DAYS = {
    today:        0,
    this_week:    3,
    this_month:   15,
    this_quarter: 45,
    lapsed:       180,
  };

  // Realistic random pools for the new editable subscription inputs.
  const SKU_POOL = ['SUB-STD-MO', 'SUB-PREM-MO', 'SUB-FAM-YR', 'SUB-PREM-YR', 'SUB-LITE-MO'];
  const BILLING_PERIOD_POOL = ['monthly', 'quarterly', 'annual'];
  const STATUS_POOL = ['active', 'cancelled', 'paused', 'trial'];
  const TYPE_POOL = ['streaming', 'cable', 'satellite', 'hybrid'];
  const PAYMENT_POOL = ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay', 'gift_card'];
  const COUNTRY_POOL = ['US', 'UK', 'FR', 'DE', 'CA', 'AU', 'JP', 'BR', 'IN'];
  const CATEGORY_POOL = ['video_streaming', 'audio_streaming', 'live_tv', 'news', 'kids'];
  const RENEW_POOL = ['auto', 'manual'];

  const $ = (id) => document.getElementById(id);
  const trim = (el) => (el && typeof el.value === 'string') ? el.value.trim() : '';
  const num = (el) => {
    const raw = trim(el); if (raw === '') return null;
    const n = Number(raw); return Number.isFinite(n) ? n : null;
  };
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

  function isoDateAgo(daysAgo) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }
  function isoDateInFuture(daysAhead) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return d.toISOString().slice(0, 10);
  }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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
      birthDate: 'mediaBirthDate',
      age: 'mediaAge',
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
        const subscription = {
          sku: trim($('mediaSubSku')),
          planName: trim($('mediaSubPlanName')),
          billingPeriod: trim($('mediaSubBillingPeriod')),
          status: trim($('mediaSubStatus')),
          type: trim($('mediaSubType')),
          category: trim($('mediaSubCategory')),
          paymentMethod: trim($('mediaSubPaymentMethod')),
          country: trim($('mediaSubCountry')),
          startDate: trim($('mediaSubStartDate')),
          endDate: trim($('mediaSubEndDate')),
          term: trim($('mediaSubTerm')),
          termUnitOfTime: trim($('mediaSubTermUnit')),
          renew: trim($('mediaSubRenew')),
        };
        return { ...scalar, engagementFlags: flags, subscription };
      },
      buildUpdates({ push }) {
        // ---- Original industryMedia.* pushes (kept; valid via Profile Media v1) ----
        SCALAR_FIELDS.forEach((f) => {
          const el = $(f.id); const v = el ? String(el.value || '').trim() : '';
          if (v) push(`industryMedia.${f.key}`, v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const el = $(t.id); if (!el) return;
          push(`industryMedia.engagementFlags.${t.key}`, !!el.checked);
        });

        // ---- Operator-context dropdown re-mappings ----
        const tier = trim($('mediaSubscriptionTier'));
        if (tier && TIER_TO_PLAN_NAME[tier]) {
          // Don't override an explicit plan name if the operator typed one.
          const explicitPlan = trim($('mediaSubPlanName'));
          if (!explicitPlan) push('subscriptions.planName', TIER_TO_PLAN_NAME[tier]);
        }
        const recency = trim($('mediaLastViewedRecency'));
        if (recency && RECENCY_DAYS[recency] != null) {
          // Don't override an explicit start date.
          const explicitStart = trim($('mediaSubStartDate'));
          if (!explicitStart) {
            // last-viewed-recency seeds a 30-day-old subscription start when
            // recency is "today" so the subscription always pre-dates the
            // most recent view (operator can override the date below).
            push('subscriptions.startDate', isoDateAgo(RECENCY_DAYS[recency] + 30));
          }
        }
        const genre = trim($('mediaPrimaryGenre'));
        if (genre) {
          push('individualCharacteristics.core.favouriteSubCategory', genre);
        }

        // ---- New OOTB subscriptions.* leaves ----
        const sku = trim($('mediaSubSku'));
        if (sku) push('subscriptions.SKU', sku);

        const planName = trim($('mediaSubPlanName'));
        if (planName) push('subscriptions.planName', planName);

        const billingPeriod = trim($('mediaSubBillingPeriod'));
        if (billingPeriod) push('subscriptions.billingPeriod', billingPeriod);

        const status = trim($('mediaSubStatus'));
        if (status) push('subscriptions.status', status);

        const type = trim($('mediaSubType'));
        if (type) push('subscriptions.type', type);

        const category = trim($('mediaSubCategory'));
        if (category) push('subscriptions.category', category);

        const paymentMethod = trim($('mediaSubPaymentMethod'));
        if (paymentMethod) push('subscriptions.paymentMethod', paymentMethod);

        const country = trim($('mediaSubCountry'));
        if (country) push('subscriptions.country', country);

        const startDate = trim($('mediaSubStartDate'));
        if (startDate) push('subscriptions.startDate', startDate); // overrides recency-derived

        const endDate = trim($('mediaSubEndDate'));
        if (endDate) push('subscriptions.endDate', endDate);

        const term = intOr($('mediaSubTerm'));
        if (term != null) push('subscriptions.term', term);

        const termUnit = trim($('mediaSubTermUnit'));
        if (termUnit) push('subscriptions.termUnitOfTime', termUnit);

        const renew = trim($('mediaSubRenew'));
        if (renew) push('subscriptions.renew', renew);
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

        // Subscription hydration.
        const subHydrate = [
          ['mediaSubSku',           ['subscriptions.sku']],
          ['mediaSubPlanName',      ['subscriptions.planname']],
          ['mediaSubBillingPeriod', ['subscriptions.billingperiod']],
          ['mediaSubStatus',        ['subscriptions.status']],
          ['mediaSubType',          ['subscriptions.type']],
          ['mediaSubCategory',      ['subscriptions.category']],
          ['mediaSubPaymentMethod', ['subscriptions.paymentmethod']],
          ['mediaSubCountry',       ['subscriptions.country']],
          ['mediaSubStartDate',     ['subscriptions.startdate']],
          ['mediaSubEndDate',       ['subscriptions.enddate']],
          ['mediaSubTerm',          ['subscriptions.term']],
          ['mediaSubTermUnit',      ['subscriptions.termunitoftime']],
          ['mediaSubRenew',         ['subscriptions.renew']],
        ];
        subHydrate.forEach(([id, suffixes]) => {
          const v = findBySuffix(suffixes);
          if (v == null || v === '') return;
          const el = $(id);
          if (!el) return;
          if (el.tagName === 'SELECT') setSelectValueLoose(el, String(v));
          else el.value = String(v).slice(0, id.endsWith('Date') ? 10 : undefined);
        });
      },
      loadFromSnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;
        SCALAR_FIELDS.forEach((f) => { setSelect(f.id, snap[f.key]); });
        const flags = (snap.engagementFlags && typeof snap.engagementFlags === 'object') ? snap.engagementFlags : {};
        FLAG_TOGGLES.forEach((t) => { setCheck(t.id, !!flags[t.key]); });

        const s = (snap.subscription && typeof snap.subscription === 'object') ? snap.subscription : {};
        setVal('mediaSubSku', s.sku || '');
        setVal('mediaSubPlanName', s.planName || '');
        setSelect('mediaSubBillingPeriod', s.billingPeriod || '');
        setSelect('mediaSubStatus', s.status || '');
        setSelect('mediaSubType', s.type || '');
        setSelect('mediaSubCategory', s.category || '');
        setSelect('mediaSubPaymentMethod', s.paymentMethod || '');
        setSelect('mediaSubCountry', s.country || '');
        setVal('mediaSubStartDate', s.startDate || '');
        setVal('mediaSubEndDate', s.endDate || '');
        setVal('mediaSubTerm', s.term || '');
        setSelect('mediaSubTermUnit', s.termUnitOfTime || '');
        setSelect('mediaSubRenew', s.renew || '');
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
        if (ind.subscription && ind.subscription.planName) parts.push(`plan ${ind.subscription.planName}`);
        return parts.join(' · ');
      },
      randomizePersona({ randomPick: pick }) {
        SCALAR_FIELDS.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) { const el = $(f.id); if (el) el.value = pick(opts); }
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

        // Subscription enrichment — derive from the chosen tier when possible.
        const tier = trim($('mediaSubscriptionTier'));
        const planName = TIER_TO_PLAN_NAME[tier] || randPick(Object.values(TIER_TO_PLAN_NAME));
        setVal('mediaSubSku', randPick(SKU_POOL));
        setVal('mediaSubPlanName', planName);
        setSelect('mediaSubBillingPeriod', randPick(BILLING_PERIOD_POOL));
        setSelect('mediaSubStatus', Math.random() < 0.85 ? 'active' : randPick(STATUS_POOL));
        setSelect('mediaSubType', randPick(TYPE_POOL));
        setSelect('mediaSubCategory', randPick(CATEGORY_POOL));
        setSelect('mediaSubPaymentMethod', randPick(PAYMENT_POOL));
        setSelect('mediaSubCountry', randPick(COUNTRY_POOL));
        const startDays = randInt(30, 365);
        setVal('mediaSubStartDate', isoDateAgo(startDays));
        setVal('mediaSubEndDate', isoDateInFuture(randInt(15, 365)));
        const term = randInt(1, 24);
        setVal('mediaSubTerm', String(term));
        setSelect('mediaSubTermUnit', term <= 12 ? 'months' : 'years');
        setSelect('mediaSubRenew', randPick(RENEW_POOL));
      },
    },
  });
})();
