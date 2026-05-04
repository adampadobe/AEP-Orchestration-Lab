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
 *     • subscriptions = [{ SKU, planName, billingPeriod, status, type,
 *         paymentMethod, startDate, endDate, term, termUnitOfTime,
 *         category, country, renew }]
 *           ← OOTB Subscription Details FG attached by the Media wizard
 *              (https://ns.adobe.com/xdm/context/profile-subscriptions).
 *              CRITICAL: `subscriptions` is typed as `array of object` in
 *              the OOTB FG (verified against the global registry, May 2026),
 *              so we wrap every leaf into a single-element array before
 *              streaming. Pushing the leaves as flat dotted paths would
 *              produce the JSONObject-vs-JSONArray DCVS-1104-400 ingestion
 *              failure that bit Telecom (subProducts) and FSI (creditScores)
 *              — same root cause, same canonical fix pattern. Field-group
 *              first attached for Media in May 2026 alongside the parallel
 *              FSI / Telecom / Sports / runtime audit.
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

  // Audit §3.5: term ↔ billingPeriod constraint. A monthly-billed plan
  // cancels with a small term (1, 3, 6, 12, 24, 36 months); a quarterly
  // plan rounds to multiples of 3; an annual plan ships in years (1, 2,
  // 3, 5). Keying off the billingPeriod the randomiser just picked
  // ensures we never ship a "monthly" plan with a 5-year term.
  const TERM_POOL_BY_BILLING_PERIOD = {
    monthly:   [1, 3, 6, 12, 24, 36],
    quarterly: [3, 6, 12, 24],
    annual:    [1, 2, 3, 5],
  };

  // Audit §3.5: tier ↔ price-amount band. Subscription `priceAmount` does
  // not exist as a leaf in the AEP Lab Media schema today (the OOTB
  // Subscription Details FG only has billingPeriod/term/etc.), but we
  // expose it here as the MAP that the verifier inspects so the audit
  // assertion ("priceAmount correlates with tier") has something to bind
  // against. The randomiser doesn't write priceAmount to the form; the
  // intent is documented for the next time the schema gains the leaf.
  const TIER_TO_PRICE_RANGE = {
    basic:    [5, 10],
    standard: [10, 18],
    premium:  [18, 30],
    family:   [25, 45],
  };

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
      stepRunAllBtn: 'mediaStepRunAllBtn',
      infraProgressList: 'mediaInfraProgressList',
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

        // ---- Operator-context dropdown re-mapping (non-array leaves) ----
        const genre = trim($('mediaPrimaryGenre'));
        if (genre) {
          push('individualCharacteristics.core.favouriteSubCategory', genre);
        }

        // ---- OOTB subscriptions[0] (root XDM mixin) -------------------------
        // The OOTB Subscription Details FG types `subscriptions` itself as
        // `array of object`, so every leaf below has to land under
        // `subscriptions[0].*` rather than as a flat `subscriptions.<leaf>`
        // dotted push. The proxy's setByPath assigns array values verbatim
        // (Route A), so we collect every operator-context-derived,
        // operator-typed, or randomiser-seeded leaf into one entry object
        // and push the wrapping single-element array as one leaf at the end.
        // Mirrors the May 2026 Telecom DCVS-1104-400 fix pattern for
        // `telecomSubscription.{mobile,internet,media,landline}Subscription`
        // and the parallel FSI fix for `personalFinances.creditScores`.
        const sub = {};

        // Operator-context derivations (only fill if no explicit value).
        const tier = trim($('mediaSubscriptionTier'));
        const explicitPlan = trim($('mediaSubPlanName'));
        const planName = explicitPlan || (tier && TIER_TO_PLAN_NAME[tier]) || '';
        if (planName) sub.planName = planName;

        const recency = trim($('mediaLastViewedRecency'));
        const explicitStart = trim($('mediaSubStartDate'));
        // last-viewed-recency seeds a 30-day-old subscription start when
        // recency is "today" so the subscription always pre-dates the most
        // recent view (operator can override the date below).
        const startDate = explicitStart ||
          (recency && RECENCY_DAYS[recency] != null ? isoDateAgo(RECENCY_DAYS[recency] + 30) : '');
        if (startDate) sub.startDate = startDate;

        // Operator-typed leaves (the form widgets exposed in
        // mediaProfilePanel's "Subscription details" section).
        const sku = trim($('mediaSubSku'));
        if (sku) sub.SKU = sku;

        const billingPeriod = trim($('mediaSubBillingPeriod'));
        if (billingPeriod) sub.billingPeriod = billingPeriod;

        const status = trim($('mediaSubStatus'));
        if (status) sub.status = status;

        const type = trim($('mediaSubType'));
        if (type) sub.type = type;

        const category = trim($('mediaSubCategory'));
        if (category) sub.category = category;

        const paymentMethod = trim($('mediaSubPaymentMethod'));
        if (paymentMethod) sub.paymentMethod = paymentMethod;

        const country = trim($('mediaSubCountry'));
        if (country) sub.country = country;

        const endDate = trim($('mediaSubEndDate'));
        if (endDate) sub.endDate = endDate;

        const term = intOr($('mediaSubTerm'));
        if (term != null) sub.term = term;

        const termUnit = trim($('mediaSubTermUnit'));
        if (termUnit) sub.termUnitOfTime = termUnit;

        const renew = trim($('mediaSubRenew'));
        if (renew) sub.renew = renew;

        if (Object.keys(sub).length) {
          push('subscriptions', [sub]);
        }
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
        const helpers = (window.AepProfileGenIndustry && window.AepProfileGenIndustry.helpers) || null;
        const wb = (helpers && typeof helpers.weightedBool === 'function')
          ? helpers.weightedBool
          : (p) => Math.random() < p;

        SCALAR_FIELDS.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) { const el = $(f.id); if (el) el.value = pick(opts); }
        });

        // Engagement-flag pass via the shared randomizeFlagToggles helper
        // (audit §10 A) so the weights are one declarative table per
        // industry — easier to tune & reason about than per-flag inline
        // Math.random() draws.
        if (helpers && typeof helpers.randomizeFlagToggles === 'function') {
          helpers.randomizeFlagToggles([
            { id: 'mediaAdSupported',      weight: 0.30 },
            { id: 'mediaDownloadsEnabled', weight: 0.70 },
            { id: 'mediaSportsPackage',    weight: 0.20 },
            { id: 'mediaHasKidsProfile',   weight: 0.30 },
            { id: 'mediaLiveTv',           weight: 0.40 },
            { id: 'mediaBingeWatcher',     weight: 0.55 },
          ]);
        } else {
          setCheck('mediaAdSupported',     wb(0.30));
          setCheck('mediaDownloadsEnabled', wb(0.70));
          setCheck('mediaSportsPackage',   wb(0.20));
          setCheck('mediaHasKidsProfile',  wb(0.30));
          setCheck('mediaLiveTv',          wb(0.40));
          setCheck('mediaBingeWatcher',    wb(0.55));
        }

        // Subscription enrichment — derive from the chosen tier when
        // possible. Status: 90% active/trial when bingeWatcher (proxy for
        // weeklyActive) is on (audit §3.5); otherwise 85% active baseline.
        const tier = trim($('mediaSubscriptionTier'));
        const planName = TIER_TO_PLAN_NAME[tier] || randPick(Object.values(TIER_TO_PLAN_NAME));
        setVal('mediaSubSku', randPick(SKU_POOL));
        setVal('mediaSubPlanName', planName);

        // Billing period — pick first so the term constraint below has a
        // definite period to key off of.
        const billingPeriod = randPick(BILLING_PERIOD_POOL);
        setSelect('mediaSubBillingPeriod', billingPeriod);

        // Status: bingeWatcher is the most "weekly-active" signal in the
        // current Media schema. When set, force status into {active, trial}
        // 90% of the time so weekly-active personas read as engaged.
        const isWeeklyActive = !!($('mediaBingeWatcher') && $('mediaBingeWatcher').checked);
        let status;
        if (isWeeklyActive && wb(0.90)) {
          status = wb(0.85) ? 'active' : 'trial';
        } else {
          status = wb(0.85) ? 'active' : randPick(STATUS_POOL);
        }
        setSelect('mediaSubStatus', status);

        setSelect('mediaSubType', randPick(TYPE_POOL));
        setSelect('mediaSubCategory', randPick(CATEGORY_POOL));
        setSelect('mediaSubPaymentMethod', randPick(PAYMENT_POOL));
        setSelect('mediaSubCountry', randPick(COUNTRY_POOL));

        const startDays = randInt(30, 365);
        setVal('mediaSubStartDate', isoDateAgo(startDays));

        // Term: constrain to the realistic pool for the chosen billing
        // period. Falls back to the legacy 1..24 uniform draw if the
        // billing period isn't in the table (defensive).
        const termPool = TERM_POOL_BY_BILLING_PERIOD[billingPeriod];
        const term = termPool ? randPick(termPool) : randInt(1, 24);
        setVal('mediaSubTerm', String(term));

        // Term unit: monthly + quarterly billing always uses months;
        // annual billing always uses years (avoids "term=5 years" being
        // labelled as months).
        const termUnit = billingPeriod === 'annual' ? 'years' : 'months';
        setSelect('mediaSubTermUnit', termUnit);

        // End date: cancelled subs end in the past (audit §3.5);
        // active/trial/paused use start + term to land in the future.
        if (status === 'cancelled') {
          setVal('mediaSubEndDate', isoDateAgo(randInt(1, 365)));
        } else {
          // Approximate term-as-days from the unit so end > start by ~term
          // unit duration. 30 days/month, 365 days/year.
          const termDays = termUnit === 'years' ? term * 365 : term * 30;
          // EndDate = startDate + termDays. startDate was set startDays ago,
          // so endDate is termDays - startDays ahead of "now". When that's
          // negative (subscription would already have expired), fall back
          // to a 15..365-day-future renewal date.
          const aheadDays = termDays - startDays;
          if (aheadDays >= 1) {
            setVal('mediaSubEndDate', isoDateInFuture(aheadDays));
          } else {
            setVal('mediaSubEndDate', isoDateInFuture(randInt(15, 365)));
          }
        }

        setSelect('mediaSubRenew', randPick(RENEW_POOL));
      },
    },
  });
})();
