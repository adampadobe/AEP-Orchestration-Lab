/**
 * Profile Generation — Retail industry section.
 *
 * Thin per-industry config that delegates the heavy lifting to the shared
 * runtime in profile-generation-industry-runtime.js. Same setup wizard,
 * Customer Analytics, Generate-N flow, and recent-snapshot picker as
 * Generic / Travel / FSI / Telecom — only the retail-specific attribute
 * fields differ.
 *
 * Schema-valid push paths (mirror the AEP Lab - Retail Profile - Schema):
 *   tenant subtree (`_<tenant>.…`) — auto-prefixed by the proxy
 *     • individualCharacteristics.core.{favouriteCategory,
 *         childrenInHouseHold, numberChildreninHouseHold}
 *           ← remap of existing dropdowns onto the OOTB Profile Core v2 leaves
 *     • individualCharacteristics.retail.{cobrandedCreditCardHolder,
 *         favoriteStore, favoriteColor, favoriteDesigner,
 *         favoriteFashionBrand, linkedStore[], pantsSize,
 *         shirtSize, shoeSize}
 *           ← Retail products & sizes section
 *     • scoring.retail.{cobrandedCreditCardSignUp, loyaltyProgramSignUp,
 *         loyaltyStatusUpgrade}
 *           ← Retail propensity sliders (each 0–100 integer; matches the
 *              lab-wide churn / propensity / NPS scoring scale so every
 *              propensity-style score in the lab speaks the same units)
 *     • orderProfile.{lastOrderDate, lastOrderSize, lastOrderValue,
 *         lastOrderPaymentMethod, lastOrderSku[], lastOrderStore[],
 *         lastOrderType[], ordersYTD, lifetimeValue}
 *           ← Last-order toggle subsection (extends the Generic
 *              orderProfile.avgOrderSize push)
 *
 * Client-side only (no schema home today, no AEP push):
 *   retailChannelPreference, retailRetailLoyaltyTier (Generic loyalty
 *   section already covers tier / points / id), and the six engagement
 *   flag checkboxes (cartAbandoned / wishlist / storeCardHolder /
 *   subscribed / returnedRecent / reviewsItems). They remain useful for
 *   describing the persona in the recently-generated picker.
 *
 * Wire-up:
 *   - DOM scope: #retailProfilePanel.
 *   - Endpoints: /api/retail-profile-infra/* + /api/retail-profile-connection.
 *   - Streaming target: AEP Lab - Retail Profile - Dataset.
 *   - Counter / recent / scaler shared via window.AepProfileGenShared.
 */
(function () {
  'use strict';
  if (!window.AepProfileGenIndustry || typeof window.AepProfileGenIndustry.bind !== 'function') {
    console.error('[retail-profile] AepProfileGenIndustry runtime missing.');
    return;
  }

  // ---- DOM helpers (scope: #retailProfilePanel) ----
  const $ = (id) => document.getElementById(id);
  const trim = (el) => (el && typeof el.value === 'string' ? el.value.trim() : '');
  const num = (el) => {
    const raw = trim(el);
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const intOr = (el) => {
    const raw = trim(el);
    if (raw === '') return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
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

  // CSV helpers for *_SKU / *_STORE / *_TYPE / linkedStore array fields.
  const splitCsv = (raw) => String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length);
  const joinCsv = (arr) => Array.isArray(arr) ? arr.filter((s) => String(s || '').trim()).join(', ') : '';

  // ---- Existing operator-context dropdowns + flag toggles (kept for UX). ----
  const SCALAR_FIELDS = [
    { id: 'retailFavoriteCategory',     key: 'favoriteCategory' },
    { id: 'retailLtvBand',              key: 'ltvBand' },
    { id: 'retailHouseholdComposition', key: 'householdComposition' },
    { id: 'retailChannelPreference',    key: 'channelPreference' },
    { id: 'retailRetailLoyaltyTier',    key: 'retailLoyaltyTier' },
    { id: 'retailLastPurchaseRecency',  key: 'lastPurchaseRecency' },
  ];
  const FLAG_TOGGLES = [
    { id: 'retailCartAbandoned',   key: 'cartAbandoned' },
    { id: 'retailWishlist',        key: 'wishlist' },
    { id: 'retailStoreCardHolder', key: 'storeCardHolder' },
    { id: 'retailSubscribed',      key: 'subscribed' },
    { id: 'retailReturnedRecent',  key: 'returnedRecent' },
    { id: 'retailReviewsItems',    key: 'reviewsItems' },
  ];

  // ---- Realistic random pools for new schema-valid attributes. ----
  const STORE_POOL = [
    'Selfridges', 'Galeries Lafayette', 'Harvey Nichols', "Macy's",
    'Nordstrom', 'Bloomingdale\u2019s', 'John Lewis', 'El Corte Ingl\u00e9s',
    'Online', 'Oxford St', 'Westfield London', 'Westfield Stratford',
    'Mall of America', 'Brent Cross', 'Dubai Mall',
  ];
  const COLOR_POOL = ['black', 'white', 'navy', 'grey', 'beige', 'brown', 'red', 'pink', 'green', 'blue', 'yellow', 'purple'];
  const DESIGNER_POOL = [
    'Burberry', 'Gucci', 'Prada', 'Dior', 'Chanel', 'Hermès', 'Versace',
    'Armani', 'Stella McCartney', 'Alexander McQueen', 'Saint Laurent',
    'Bottega Veneta', 'Loewe', 'Balenciaga',
  ];
  const FASHION_BRAND_POOL = [
    'Nike', 'Adidas', 'Levi\u2019s', 'Zara', 'H&M', 'Uniqlo',
    'Tommy Hilfiger', 'Ralph Lauren', 'Lacoste', 'Calvin Klein',
    'The North Face', 'Patagonia', 'Carhartt', 'Reformation', 'COS',
  ];
  const SHIRT_POOL = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  // Audit §3.7: cobranded card holders pay on the cobranded card most of
  // the time. We add the synthetic `cobranded_card` payment value so the
  // bias has somewhere to land — the schema accepts free-form strings
  // here. The base pool stays the same shape as before so non-cobranded
  // personas keep their realistic mix.
  const PAYMENT_POOL = ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay', 'bnpl', 'bank_transfer'];
  const COBRANDED_PAYMENT_VALUE = 'cobranded_card';
  const ORDER_TYPE_POOL = ['online', 'click-and-collect', 'in-store', 'subscription'];
  const SKU_PREFIX = ['SKU', 'PRD', 'ITM'];

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randPickN = (arr, n) => {
    if (n <= 0 || !arr.length) return [];
    const copy = arr.slice();
    const out = [];
    for (let i = 0; i < Math.min(n, copy.length); i++) {
      const idx = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  };

  function randomPantsSize() {
    const waist = randInt(28, 40);
    const inseam = randPick([30, 32, 34, 36]);
    return `${waist}x${inseam}`;
  }
  function randomShoeSize() {
    const half = Math.random() < 0.5;
    const base = randInt(6, 12);
    return `${base}${half ? '.5' : ''} US`;
  }
  function randomSku() {
    return `${randPick(SKU_PREFIX)}-${randInt(100000, 999999)}`;
  }
  function isoDateAgo(daysAgo) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  // Map operator-context dropdowns → schema leaves.
  const LTV_MIDPOINT = {
    under_100: 50,
    '100_500': 300,
    '500_2k': 1250,
    '2k_10k': 6000,
    over_10k: 25000,
  };
  const HOUSEHOLD_KIDS = {
    single:           { has: false, count: 0 },
    couple:           { has: false, count: 0 },
    family_young:     { has: true,  count: 2 },
    family_teen:      { has: true,  count: 2 },
    empty_nesters:    { has: false, count: 0 },
    multi_generation: { has: true,  count: 2 },
  };
  const RECENCY_DAYS = {
    within_7d:  3,
    within_30d: 15,
    within_90d: 45,
    within_1y:  180,
    over_1y:    560,
  };

  // ---- Slider display sync for the 3 retail propensity sliders. ----
  // Convention (matches the shared Customer Analytics churn / propensity /
  // NPS sliders on every industry page): integer 0–100 in the UI, pushed
  // AS-IS as an integer 0–100 to AEP. The runtime helper randomizes via
  // `randomizeSliderControl` which respects min/max/step from the input
  // (already 0/100/1 in the HTML) and dispatches an `input` event; our
  // listener updates the displayed integer AND repaints the green/amber/
  // red track tint so the visual fill always matches the value.
  const PROPENSITY_SLIDERS = [
    { id: 'retailCobrandedCreditCardSignUp', display: 'retailCobrandedCreditCardSignUpValue', key: 'cobrandedCreditCardSignUp' },
    { id: 'retailLoyaltyProgramSignUp',      display: 'retailLoyaltyProgramSignUpValue',      key: 'loyaltyProgramSignUp' },
    { id: 'retailLoyaltyStatusUpgrade',      display: 'retailLoyaltyStatusUpgradeValue',      key: 'loyaltyStatusUpgrade' },
  ];

  // Inlined replica of the runtime's `applySliderTint` (not exported on
  // window.AepProfileGenIndustry). Keeping it local avoids a runtime API
  // change and keeps this file self-contained. Higher = better here, so
  // no `reverse` flag — green sits at the top of the scale.
  function applyPropensityTint(input) {
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
    let token = '--dash-warning-border';
    if (pct < 0.34) token = '--dash-error-border';
    else if (pct >= 0.67) token = '--dash-success-border';
    input.style.setProperty('--gen-slider-fill', `var(${token})`);
    input.style.setProperty('--gen-slider-pct', `${(pct * 100).toFixed(2)}%`);
  }

  function renderPropensity(slider) {
    const cfg = PROPENSITY_SLIDERS.find((s) => s.id === slider.id);
    if (!cfg) return;
    const disp = $(cfg.display);
    const pct = Math.max(0, Math.min(100, Math.round(Number(slider.value) || 0)));
    if (disp) disp.textContent = String(pct);
    applyPropensityTint(slider);
  }

  // Coerce a raw value to an integer in [0, 100]. Treats legacy floats in
  // [0, 1] (i.e. older snapshots / profiles streamed before this fix used
  // the 0.00–1.00 scale) as probabilities and rescales them to 0–100 so
  // already-streamed data still renders sensibly.
  function coerceToPropensityInt(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n > 0 && n <= 1) return Math.round(n * 100); // legacy 0.0–1.0 → 0–100
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function setPropensitySliderInt(cfg, intVal) {
    const slider = $(cfg.id);
    if (!slider) return;
    const pct = Math.max(0, Math.min(100, Math.round(Number(intVal) || 0)));
    slider.value = String(pct);
    renderPropensity(slider);
  }
  function readPropensityInt(cfg) {
    const slider = $(cfg.id);
    if (!slider) return null;
    const raw = String(slider.value || '').trim();
    if (raw === '') return null;
    const pct = Number(raw);
    if (!Number.isFinite(pct)) return null;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  // ---- Last-order toggle visibility. ----
  function applyLastOrderToggle() {
    const enabled = getCheck('retailLastOrderEnabled');
    const fieldset = $('retailLastOrderFields');
    if (fieldset) fieldset.style.display = enabled ? '' : 'none';
  }

  window.AepProfileGenIndustry.bind({
    industryKey: 'retail',
    industryDisplayName: 'Retail',
    panelShownEvent: 'aep-retail-panel-shown',
    apiPathPrefix: 'retail-profile',
    defaultFlowName: 'AEP Lab - Retail Profile - Dataflow',
    ids: {
      profilePanel: 'retailProfilePanel',
      checkInfraBtn: 'retailCheckInfraBtn',
      stepRunAllBtn: 'retailStepRunAllBtn',
      infraProgressList: 'retailInfraProgressList',
      stepCreateSchemaBtn: 'retailStepCreateSchemaBtn',
      stepAttachFgBtn: 'retailStepAttachFgBtn',
      stepCreateDatasetBtn: 'retailStepCreateDatasetBtn',
      stepHttpFlowBtn: 'retailStepHttpFlowBtn',
      enableProfileBtn: 'retailEnableProfileBtn',
      enableProfileProgressList: 'retailEnableProfileProgressList',
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
      mobilePhone: 'retailMobilePhone',
      counter: 'retailCounter',
      generateCount: 'retailGenerateCount',
      emailPreview: 'retailEmailPreview',
      resetCounterBtn: 'retailResetCounterBtn',
      updateProfileBtn: 'retailUpdateProfileBtn',
      generateBtn: 'retailGenerateBtn',
      dryRun: 'retailDryRun',
      markTestProfile: 'retailMarkTestProfile',
      profileMessage: 'retailProfileMessage',
      firstName: 'retailFirstName',
      lastName: 'retailLastName',
      birthDate: 'retailBirthDate',
      age: 'retailAge',
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
      payloadPreview: 'retailPayloadPreview',
      payloadPreviewBtn: 'retailPayloadPreviewBtn',
      payloadPreviewPre: 'retailPayloadPreviewPre',
    },
    industry: {
      // ----- snapshot: capture form state for the recently-generated picker.
      snapshot() {
        const flags = {};
        FLAG_TOGGLES.forEach((t) => { flags[t.key] = getCheck(t.id); });
        const ctx = {};
        SCALAR_FIELDS.forEach((f) => {
          const el = $(f.id); const v = el ? String(el.value || '').trim() : '';
          if (v) ctx[f.key] = v;
        });

        const products = {
          favoriteStore: trim($('retailFavoriteStore')),
          favoriteColor: trim($('retailFavoriteColor')),
          favoriteDesigner: trim($('retailFavoriteDesigner')),
          favoriteFashionBrand: trim($('retailFavoriteFashionBrand')),
          linkedStore: splitCsv(trim($('retailLinkedStore'))),
          pantsSize: trim($('retailPantsSize')),
          shirtSize: trim($('retailShirtSize')),
          shoeSize: trim($('retailShoeSize')),
          cobrandedCreditCardHolder: getCheck('retailCobrandedCreditCardHolder'),
        };

        const propensity = {};
        PROPENSITY_SLIDERS.forEach((s) => {
          const v = readPropensityInt(s);
          if (v != null) propensity[s.key] = v; // integer 0–100
        });

        const lastOrder = {
          enabled: getCheck('retailLastOrderEnabled'),
          date: trim($('retailLastOrderDate')),
          size: trim($('retailLastOrderSize')),
          value: trim($('retailLastOrderValue')),
          paymentMethod: trim($('retailLastOrderPaymentMethod')),
          sku: splitCsv(trim($('retailLastOrderSku'))),
          store: splitCsv(trim($('retailLastOrderStore'))),
          type: splitCsv(trim($('retailLastOrderType'))),
          ordersYTD: trim($('retailOrdersYTD')),
          lifetimeValue: trim($('retailLifetimeValue')),
        };

        return { ...ctx, engagementFlags: flags, products, propensity, lastOrder };
      },

      // ----- buildUpdates: push to schema-valid paths only.
      buildUpdates({ push }) {
        // Operator-context dropdowns → schema-valid leaves where possible.
        // 1. Favourite category → individualCharacteristics.core.favouriteCategory (British spelling).
        const favCat = trim($('retailFavoriteCategory'));
        if (favCat) push('individualCharacteristics.core.favouriteCategory', favCat);

        // 2. LTV band → orderProfile.lifetimeValue (midpoint). The Last-order
        //    section can override this with an explicit number further down.
        const ltvBand = trim($('retailLtvBand'));
        if (ltvBand && LTV_MIDPOINT[ltvBand] != null) {
          push('orderProfile.lifetimeValue', LTV_MIDPOINT[ltvBand]);
        }

        // 3. Household composition → kids flags.
        const household = trim($('retailHouseholdComposition'));
        if (household && HOUSEHOLD_KIDS[household]) {
          const kids = HOUSEHOLD_KIDS[household];
          push('individualCharacteristics.core.childrenInHouseHold', kids.has);
          push('individualCharacteristics.core.numberChildreninHouseHold', kids.count);
        }

        // 4. Last-purchase recency → derived orderProfile.lastOrderDate.
        //    The Last-order section can override this with an explicit date.
        const recency = trim($('retailLastPurchaseRecency'));
        if (recency && RECENCY_DAYS[recency] != null) {
          push('orderProfile.lastOrderDate', isoDateAgo(RECENCY_DAYS[recency]));
        }

        // ----- Retail products & sizes (individualCharacteristics.retail.*).
        const productMap = [
          ['retailFavoriteStore',        'individualCharacteristics.retail.favoriteStore'],
          ['retailFavoriteColor',        'individualCharacteristics.retail.favoriteColor'],
          ['retailFavoriteDesigner',     'individualCharacteristics.retail.favoriteDesigner'],
          ['retailFavoriteFashionBrand', 'individualCharacteristics.retail.favoriteFashionBrand'],
          ['retailPantsSize',            'individualCharacteristics.retail.pantsSize'],
          ['retailShirtSize',            'individualCharacteristics.retail.shirtSize'],
          ['retailShoeSize',             'individualCharacteristics.retail.shoeSize'],
        ];
        productMap.forEach(([id, path]) => {
          const v = trim($(id));
          if (v) push(path, v);
        });
        const linkedStores = splitCsv(trim($('retailLinkedStore')));
        if (linkedStores.length) push('individualCharacteristics.retail.linkedStore', linkedStores);

        const cobrandedHolderEl = $('retailCobrandedCreditCardHolder');
        if (cobrandedHolderEl) {
          push('individualCharacteristics.retail.cobrandedCreditCardHolder', !!cobrandedHolderEl.checked);
        }

        // ----- Retail propensity scores (scoring.retail.*).
        // Push the slider value AS-IS as an integer 0–100 to match the
        // shared Customer Analytics scores (scoring.churn.churnPrediction,
        // scoring.core.propensityScore, scoring.npsScore). The schema
        // types these leaves as `number` with no min/max constraint, so
        // integers in [0,100] are valid AEP payloads.
        PROPENSITY_SLIDERS.forEach((s) => {
          const v = readPropensityInt(s);
          if (v != null) push(`scoring.retail.${s.key}`, v);
        });

        // ----- Last order details (orderProfile.* extras).
        const lastOrderEnabled = getCheck('retailLastOrderEnabled');
        if (lastOrderEnabled) {
          const date = trim($('retailLastOrderDate'));
          if (date) push('orderProfile.lastOrderDate', date); // overrides recency-derived

          const size = num($('retailLastOrderSize'));
          if (size != null) push('orderProfile.lastOrderSize', size);

          const value = num($('retailLastOrderValue'));
          if (value != null) push('orderProfile.lastOrderValue', value);

          const payment = trim($('retailLastOrderPaymentMethod'));
          if (payment) push('orderProfile.lastOrderPaymentMethod', payment);

          const skus = splitCsv(trim($('retailLastOrderSku')));
          if (skus.length) push('orderProfile.lastOrderSku', skus);

          const stores = splitCsv(trim($('retailLastOrderStore')));
          if (stores.length) push('orderProfile.lastOrderStore', stores);

          const types = splitCsv(trim($('retailLastOrderType')));
          if (types.length) push('orderProfile.lastOrderType', types);

          const ytd = intOr($('retailOrdersYTD'));
          if (ytd != null) push('orderProfile.ordersYTD', ytd);

          const ltv = num($('retailLifetimeValue'));
          if (ltv != null) push('orderProfile.lifetimeValue', ltv); // overrides band midpoint
        }
      },

      // ----- applyFindResult: hydrate UI from /api/profile/table results.
      applyFindResult({ findBySuffix, findByKeywords, setSelectValueLoose }) {
        // Existing operator-context dropdowns (best-effort — not all live in schema).
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

        // Favourite category lives on the Generic tenant subtree.
        const favCat = findBySuffix(['individualcharacteristics.core.favouritecategory']) ||
                       findByKeywords('individualcharacteristics', 'core', 'favouritecategory');
        if (favCat) setSelectValueLoose($('retailFavoriteCategory'), favCat);

        // Retail products & sizes.
        const productHydrate = [
          ['retailFavoriteStore',        ['individualcharacteristics.retail.favoritestore', 'retail.favoritestore']],
          ['retailFavoriteColor',        ['individualcharacteristics.retail.favoritecolor', 'retail.favoritecolor']],
          ['retailFavoriteDesigner',     ['individualcharacteristics.retail.favoritedesigner', 'retail.favoritedesigner']],
          ['retailFavoriteFashionBrand', ['individualcharacteristics.retail.favoritefashionbrand', 'retail.favoritefashionbrand']],
          ['retailPantsSize',            ['individualcharacteristics.retail.pantssize', 'retail.pantssize']],
          ['retailShirtSize',            ['individualcharacteristics.retail.shirtsize', 'retail.shirtsize']],
          ['retailShoeSize',             ['individualcharacteristics.retail.shoesize', 'retail.shoesize']],
        ];
        productHydrate.forEach(([id, suffixes]) => {
          const v = findBySuffix(suffixes);
          if (v == null || v === '') return;
          const el = $(id);
          if (!el) return;
          if (el.tagName === 'SELECT') setSelectValueLoose(el, String(v));
          else el.value = String(v);
        });

        const linked = findBySuffix(['individualcharacteristics.retail.linkedstore', 'retail.linkedstore']);
        if (linked != null && linked !== '') {
          const arr = Array.isArray(linked) ? linked : String(linked).split(/\s*,\s*/).filter(Boolean);
          setVal('retailLinkedStore', joinCsv(arr));
        }

        const cobranded = findBySuffix(['individualcharacteristics.retail.cobrandedcreditcardholder']) ||
                          findByKeywords('retail', 'cobrandedcreditcardholder');
        if (cobranded !== '' && cobranded != null) {
          setCheck('retailCobrandedCreditCardHolder', String(cobranded).toLowerCase() === 'true');
        }

        // Retail propensity sliders (integers 0–100). Older profiles
        // streamed before this fix used the 0.00–1.00 scale; coerce both
        // shapes via coerceToPropensityInt so legacy data still renders.
        PROPENSITY_SLIDERS.forEach((s) => {
          const v = findBySuffix([`scoring.retail.${s.key.toLowerCase()}`]) ||
                    findByKeywords('scoring', 'retail', s.key.toLowerCase());
          if (v == null || v === '') return;
          const n = coerceToPropensityInt(v);
          if (n != null) setPropensitySliderInt(s, n);
        });

        // Last-order details. Auto-open the toggle if any field shows up.
        let lastOrderTouched = false;
        const lastOrderHydrate = [
          ['retailLastOrderDate',          ['orderprofile.lastorderdate']],
          ['retailLastOrderSize',          ['orderprofile.lastordersize']],
          ['retailLastOrderValue',         ['orderprofile.lastordervalue']],
          ['retailLastOrderPaymentMethod', ['orderprofile.lastorderpaymentmethod']],
          ['retailOrdersYTD',              ['orderprofile.ordersytd']],
          ['retailLifetimeValue',          ['orderprofile.lifetimevalue']],
        ];
        lastOrderHydrate.forEach(([id, suffixes]) => {
          const v = findBySuffix(suffixes);
          if (v == null || v === '') return;
          lastOrderTouched = true;
          const el = $(id);
          if (!el) return;
          if (el.tagName === 'SELECT') setSelectValueLoose(el, String(v));
          else el.value = String(v);
        });
        const csvHydrate = [
          ['retailLastOrderSku',   ['orderprofile.lastordersku']],
          ['retailLastOrderStore', ['orderprofile.lastorderstore']],
          ['retailLastOrderType',  ['orderprofile.lastordertype']],
        ];
        csvHydrate.forEach(([id, suffixes]) => {
          const v = findBySuffix(suffixes);
          if (v == null || v === '') return;
          lastOrderTouched = true;
          const arr = Array.isArray(v) ? v : String(v).split(/\s*,\s*/).filter(Boolean);
          setVal(id, joinCsv(arr));
        });
        if (lastOrderTouched) {
          setCheck('retailLastOrderEnabled', true);
          applyLastOrderToggle();
        }
      },

      // ----- loadFromSnapshot: restore from recently-generated picker.
      loadFromSnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;
        SCALAR_FIELDS.forEach((f) => { setSelect(f.id, snap[f.key]); });
        const flags = (snap.engagementFlags && typeof snap.engagementFlags === 'object') ? snap.engagementFlags : {};
        FLAG_TOGGLES.forEach((t) => { setCheck(t.id, !!flags[t.key]); });

        const p = (snap.products && typeof snap.products === 'object') ? snap.products : {};
        setVal('retailFavoriteStore', p.favoriteStore || '');
        setSelect('retailFavoriteColor', p.favoriteColor || '');
        setVal('retailFavoriteDesigner', p.favoriteDesigner || '');
        setVal('retailFavoriteFashionBrand', p.favoriteFashionBrand || '');
        setVal('retailLinkedStore', joinCsv(p.linkedStore || []));
        setVal('retailPantsSize', p.pantsSize || '');
        setSelect('retailShirtSize', p.shirtSize || '');
        setVal('retailShoeSize', p.shoeSize || '');
        setCheck('retailCobrandedCreditCardHolder', !!p.cobrandedCreditCardHolder);

        // Snapshots may carry either the new 0–100 integer or the legacy
        // 0.00–1.00 float depending on when they were captured; coerce.
        const pr = (snap.propensity && typeof snap.propensity === 'object') ? snap.propensity : {};
        PROPENSITY_SLIDERS.forEach((s) => {
          const n = coerceToPropensityInt(pr[s.key]);
          if (n != null) setPropensitySliderInt(s, n);
        });

        const lo = (snap.lastOrder && typeof snap.lastOrder === 'object') ? snap.lastOrder : {};
        setCheck('retailLastOrderEnabled', !!lo.enabled);
        applyLastOrderToggle();
        setVal('retailLastOrderDate', lo.date || '');
        setVal('retailLastOrderSize', lo.size || '');
        setVal('retailLastOrderValue', lo.value || '');
        setSelect('retailLastOrderPaymentMethod', lo.paymentMethod || '');
        setVal('retailLastOrderSku', joinCsv(lo.sku || []));
        setVal('retailLastOrderStore', joinCsv(lo.store || []));
        setVal('retailLastOrderType', joinCsv(lo.type || []));
        setVal('retailOrdersYTD', lo.ordersYTD || '');
        setVal('retailLifetimeValue', lo.lifetimeValue || '');
      },

      // ----- summarise: short tail for the recently-generated picker.
      summarise(snap) {
        if (!snap || !snap.industry) return '';
        const ind = snap.industry;
        const parts = [];
        if (ind.favoriteCategory) parts.push(ind.favoriteCategory);
        const p = ind.products || {};
        if (p.favoriteFashionBrand) parts.push(p.favoriteFashionBrand);
        else if (p.favoriteDesigner) parts.push(p.favoriteDesigner);
        if (p.favoriteStore) parts.push(p.favoriteStore);
        const lo = ind.lastOrder || {};
        if (lo.enabled && lo.value) parts.push(`$${lo.value}`);
        else if (ind.ltvBand) parts.push(`LTV ${ind.ltvBand.replace(/_/g, ' ')}`);
        return parts.join(' · ');
      },

      // ----- randomizePersona: realistic random data for Generate flow.
      randomizePersona({ randomPick: pick }) {
        // Existing operator-context dropdowns first.
        SCALAR_FIELDS.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) { const el = $(f.id); if (el) el.value = pick(opts); }
        });

        // Engagement flags — declared as a weights table consumed by the
        // shared randomizeFlagToggles helper (audit §10 A). Drops the
        // ad-hoc `Math.random() < N` calls that previously lived inline.
        const helpers = (window.AepProfileGenIndustry && window.AepProfileGenIndustry.helpers) || null;
        if (helpers && typeof helpers.randomizeFlagToggles === 'function') {
          helpers.randomizeFlagToggles([
            { id: 'retailCartAbandoned',   weight: 0.30 },
            { id: 'retailWishlist',        weight: 0.40 },
            { id: 'retailStoreCardHolder', weight: 0.25 },
            { id: 'retailSubscribed',      weight: 0.55 },
            { id: 'retailReturnedRecent',  weight: 0.20 },
            { id: 'retailReviewsItems',    weight: 0.15 },
          ]);
        } else {
          setCheck('retailCartAbandoned',   Math.random() < 0.30);
          setCheck('retailWishlist',        Math.random() < 0.40);
          setCheck('retailStoreCardHolder', Math.random() < 0.25);
          setCheck('retailSubscribed',      Math.random() < 0.55);
          setCheck('retailReturnedRecent',  Math.random() < 0.20);
          setCheck('retailReviewsItems',    Math.random() < 0.15);
        }

        // Retail products & sizes.
        setVal('retailFavoriteStore', randPick(STORE_POOL));
        setSelect('retailFavoriteColor', randPick(COLOR_POOL));
        setVal('retailFavoriteDesigner', randPick(DESIGNER_POOL));
        setVal('retailFavoriteFashionBrand', randPick(FASHION_BRAND_POOL));
        setVal('retailLinkedStore', joinCsv(randPickN(STORE_POOL, randInt(1, 3))));
        setVal('retailPantsSize', randomPantsSize());
        setSelect('retailShirtSize', randPick(SHIRT_POOL));
        setVal('retailShoeSize', randomShoeSize());
        setCheck('retailCobrandedCreditCardHolder', Math.random() < 0.30);

        // Retail propensity sliders — random integer in [0, 100].
        PROPENSITY_SLIDERS.forEach((s) => {
          setPropensitySliderInt(s, randInt(0, 100));
        });

        // Last-order details — auto-enable + populate. Audit §3.7 ties
        // the order-value triplet together so a cohort persona reads as
        // a coherent customer (avg unit price × order size, lifetime value
        // ≥ rolling spend, payment method tracks cobranded-card status).
        setCheck('retailLastOrderEnabled', true);
        applyLastOrderToggle();
        setVal('retailLastOrderDate', isoDateAgo(randInt(1, 90)));

        const lastOrderSize = randInt(1, 12);
        setVal('retailLastOrderSize', String(lastOrderSize));

        // lastOrderValue ≈ lastOrderSize × $15..$120 average unit price.
        // Replaces the previous flat 20..2000 dollar-cents draw which
        // could ship a 12-item order at $20.
        const avgUnitPrice = randInt(15, 120);
        const lastOrderValue = +(lastOrderSize * avgUnitPrice).toFixed(2);
        setVal('retailLastOrderValue', String(lastOrderValue));

        // Cobranded card holder ↔ payment-method bias (~70%). When the
        // persona holds the co-brand card, prefer the new co-branded
        // option over the generic pool. Otherwise pick from the regular
        // pool (which excludes cobranded_card so non-holders never land
        // on it). The ~30% non-cobranded path leaves room for the cohort
        // to still exhibit other payment behaviours occasionally.
        const isCobranded = getCheck('retailCobrandedCreditCardHolder');
        const wb = (helpers && typeof helpers.weightedBool === 'function')
          ? helpers.weightedBool
          : (p) => Math.random() < p;
        const paymentChoice = isCobranded && wb(0.70)
          ? COBRANDED_PAYMENT_VALUE
          : randPick(PAYMENT_POOL);
        setSelect('retailLastOrderPaymentMethod', paymentChoice);

        const skus = [];
        for (let i = 0; i < randInt(1, 4); i++) skus.push(randomSku());
        setVal('retailLastOrderSku', joinCsv(skus));
        setVal('retailLastOrderStore', joinCsv(randPickN(STORE_POOL, randInt(1, 2))));
        setVal('retailLastOrderType', joinCsv(randPickN(ORDER_TYPE_POOL, randInt(1, 2))));

        const ordersYTD = randInt(1, 50);
        setVal('retailOrdersYTD', String(ordersYTD));

        // lifetimeValue ≥ max(LTV-band midpoint, ordersYTD × lastOrderValue × 0.6..1.2).
        // Captures the realistic floor that a customer with N orders this
        // year MUST have spent at least roughly N × avg-order-value over
        // their lifetime, regardless of the LTV band the operator (or
        // the random scalar pass above) picked. Min 200 keeps the LTV
        // sane for tiny edge-case orders.
        const ltvBandKey = trim($('retailLtvBand'));
        const ltvBandFloor = LTV_MIDPOINT[ltvBandKey] || 0;
        const orderActivityFloor = Math.round(
          ordersYTD * lastOrderValue * (0.6 + Math.random() * 0.6)
        );
        const lifetimeValue = Math.max(200, ltvBandFloor, orderActivityFloor);
        setVal('retailLifetimeValue', String(lifetimeValue));
      },
    },
  });

  // ----- Post-bind DOM wiring (runs after the runtime sets up its panel). -----
  // The runtime's bind() is synchronous and the IIFE runs after the DOM is
  // ready (script tag at end of body), so direct getElementById is safe here.

  // 1. Propensity-slider live display sync (the runtime's randomize button
  //    handler dispatches `input`, which we hook to update the 0.00 readout).
  PROPENSITY_SLIDERS.forEach((s) => {
    const slider = $(s.id);
    if (!slider) return;
    slider.addEventListener('input', () => renderPropensity(slider));
    renderPropensity(slider); // initial paint from default value
  });

  // 2. Last-order toggle visibility.
  const lastOrderToggle = $('retailLastOrderEnabled');
  if (lastOrderToggle) {
    lastOrderToggle.addEventListener('change', applyLastOrderToggle);
    applyLastOrderToggle();
  }
})();
