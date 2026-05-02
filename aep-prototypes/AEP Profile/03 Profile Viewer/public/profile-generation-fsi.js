/**
 * Profile Generation — FSI (financial services) industry section.
 *
 * Thin per-industry config that delegates the heavy lifting to the shared
 * runtime in profile-generation-industry-runtime.js. Behaviour mirrors
 * profile-generation-travel.js: own setup wizard, lookup, Customer
 * Analytics, Generate-N flow, and recent-snapshot picker — but with FSI
 * field semantics on top.
 *
 * Wire-up at a glance:
 *   - DOM scope: #fsiProfilePanel (built in profile-generation.html).
 *   - Endpoints: /api/fsi-profile-infra/* + /api/fsi-profile-connection
 *     (declared in firebase.json, served by functions/index.js, backed by
 *     functions/fsiProfileInfraService.js + fsiProfileConnectionStore.js).
 *   - Streaming target: AEP Lab - FSI Profile - Dataset (resolved by the
 *     setup wizard at runtime via the configured Profile Core v2 tenant
 *     and the `Profile FSI v2` / OOTB profile-personal-finance-details
 *     field group layers — see functions/profileInfraFactory.js).
 *   - Counter / recent / scaler: shared with every other industry via
 *     window.AepProfileGenShared (defined in profile-generation-shared.js)
 *     so the same base email scales to a single sequence per sandbox+day.
 *
 * Tenant XDM paths emitted (after profileStreamingCore.js reroutes
 * non-root prefixes under `_<tenant>`):
 *   _<tenant>.industryFsi.primaryBankingChannel
 *   _<tenant>.industryFsi.creditScoreBand
 *   _<tenant>.industryFsi.lifeStage
 *   _<tenant>.industryFsi.employment
 *   _<tenant>.industryFsi.householdIncomeBand
 *   _<tenant>.industryFsi.financialProducts.{checking,savings,creditCard,
 *                                            mortgage,investment,loan}
 *
 * If a sandbox has the custom Profile FSI v2 field group attached, those
 * paths still live under industryFsi.* (Profile FSI v2 subsumes the
 * tenant subtree).
 */
(function () {
  'use strict';

  if (!window.AepProfileGenIndustry || typeof window.AepProfileGenIndustry.bind !== 'function') {
    console.error('[fsi-profile] AepProfileGenIndustry runtime missing — load profile-generation-industry-runtime.js first.');
    return;
  }

  const FSI_PRODUCT_CHECKBOXES = [
    { id: 'fsiHoldChecking',   key: 'checking' },
    { id: 'fsiHoldSavings',    key: 'savings' },
    { id: 'fsiHoldCreditCard', key: 'creditCard' },
    { id: 'fsiHoldMortgage',   key: 'mortgage' },
    { id: 'fsiHoldInvestment', key: 'investment' },
    { id: 'fsiHoldLoan',       key: 'loan' },
  ];

  const FSI_SCALAR_FIELDS = [
    { id: 'fsiPrimaryBankingChannel', key: 'primaryBankingChannel' },
    { id: 'fsiCreditScoreBand',       key: 'creditScoreBand' },
    { id: 'fsiLifeStage',             key: 'lifeStage' },
    { id: 'fsiEmploymentStatus',      key: 'employment' },
    { id: 'fsiHouseholdIncomeBand',   key: 'householdIncomeBand' },
  ];

  function $(id) { return document.getElementById(id); }

  function getCheckbox(id) {
    const el = $(id);
    return el ? !!el.checked : false;
  }

  function setCheckbox(id, val) {
    const el = $(id);
    if (el) el.checked = !!val;
  }

  function setSelect(id, val) {
    const el = $(id);
    if (!el || val == null) return;
    const v = String(val).trim();
    if (!v) return;
    const opts = Array.from(el.options || []);
    const exact = opts.find((o) => o.value === v);
    if (exact) { el.value = exact.value; return; }
    const ci = opts.find((o) => String(o.value).toLowerCase() === v.toLowerCase());
    if (ci) { el.value = ci.value; }
  }

  function selectValuesNonEmpty(id) {
    const el = $(id);
    if (!el || !el.options) return [];
    const out = [];
    for (let i = 0; i < el.options.length; i++) {
      const v = el.options[i].value;
      if (v !== '') out.push(v);
    }
    return out;
  }

  window.AepProfileGenIndustry.bind({
    industryKey: 'fsi',
    industryDisplayName: 'FSI',
    panelShownEvent: 'aep-fsi-panel-shown',
    apiPathPrefix: 'fsi-profile',
    defaultFlowName: 'AEP Lab - FSI Profile - Dataflow',

    // DOM ids inside #fsiProfilePanel — every key matches the contract
    // documented in profile-generation-industry-runtime.js and the
    // corresponding markup in profile-generation.html.
    ids: {
      profilePanel: 'fsiProfilePanel',

      checkInfraBtn: 'fsiCheckInfraBtn',
      stepCreateSchemaBtn: 'fsiStepCreateSchemaBtn',
      stepAttachFgBtn: 'fsiStepAttachFgBtn',
      stepCreateDatasetBtn: 'fsiStepCreateDatasetBtn',
      stepHttpFlowBtn: 'fsiStepHttpFlowBtn',
      infraStatusMessage: 'fsiInfraStatusMessage',
      infraDetails: 'fsiProfileInfraDetails',
      infraHint: 'fsiProfileInfraHint',

      streamSchemaId: 'fsiStreamSchemaId',
      streamDatasetId: 'fsiStreamDatasetId',
      streamXdmKey: 'fsiStreamXdmKey',
      streamFlowId: 'fsiStreamFlowId',
      streamFlowName: 'fsiStreamFlowName',
      streamUrl: 'fsiStreamUrl',
      loadFromFirebaseBtn: 'fsiLoadFromFirebaseBtn',
      fetchFlowFromAepBtn: 'fsiFetchFlowFromAepBtn',
      saveStreamBtn: 'fsiSaveStreamBtn',

      lookupNs: 'fsiLookupNs',
      lookupIdentifier: 'fsiLookupIdentifier',
      lookupBtn: 'fsiLookupBtn',
      lookupRecent: 'fsiLookupIdentifierRecent',

      baseEmail: 'fsiBaseEmail',
      counter: 'fsiCounter',
      generateCount: 'fsiGenerateCount',
      emailPreview: 'fsiEmailPreview',
      resetCounterBtn: 'fsiResetCounterBtn',
      updateProfileBtn: 'fsiUpdateProfileBtn',
      generateBtn: 'fsiGenerateBtn',
      dryRun: 'fsiDryRun',
      profileMessage: 'fsiProfileMessage',

      firstName: 'fsiFirstName',
      lastName: 'fsiLastName',

      churn: 'fsiChurn',
      churnValue: 'fsiChurnValue',
      propensity: 'fsiPropensity',
      propensityValue: 'fsiPropensityValue',
      nps: 'fsiNps',
      aov: 'fsiAov',
      aovValue: 'fsiAovValue',
      preferredChannel: 'fsiPreferredChannel',
      gender: 'fsiGender',
      loyaltyEnabled: 'fsiLoyaltyEnabled',
      loyaltyFields: 'fsiLoyaltyFields',
      loyaltyID: 'fsiLoyaltyID',
      loyaltyTier: 'fsiLoyaltyTier',
      loyaltyPoints: 'fsiLoyaltyPoints',
      loyaltyRandomBtn: 'fsiLoyaltyRandomBtn',
      language: 'fsiLanguage',

      recentPicker: 'fsiRecentPicker',
      recentSelect: 'fsiRecentSelect',
      recentLoadBtn: 'fsiRecentLoadBtn',
      recentDetails: 'fsiRecentDetails',
      recentListBody: 'fsiRecentListBody',
      recentCountLabel: 'fsiRecentCountLabel',

      debug: 'fsiProfileDebug',
      debugClientRequest: 'fsiDebugClientRequest',
      debugStatus: 'fsiDebugStatus',
      debugResponse: 'fsiDebugResponse',
    },

    industry: {
      // Drives renderRecent() summaries and the "load this snapshot back
      // into the form" flow. Everything is plain serialisable JSON.
      snapshot() {
        const products = {};
        FSI_PRODUCT_CHECKBOXES.forEach((p) => { products[p.key] = getCheckbox(p.id); });
        const scalar = {};
        FSI_SCALAR_FIELDS.forEach((f) => {
          const v = ($(f.id) && String($(f.id).value || '').trim()) || '';
          if (v) scalar[f.key] = v;
        });
        return { ...scalar, financialProducts: products };
      },

      // Build the XDM `updates` array. Every path is rooted at
      // `industryFsi.*` so profileStreamingCore.js puts it under
      // `_<tenant>.industryFsi.*` automatically. Booleans always emit
      // (true OR false) so unchecking a product toggle in the form is
      // reflected in the next stream — matches Generic/Travel UX.
      buildUpdates({ push }) {
        FSI_SCALAR_FIELDS.forEach((f) => {
          const el = $(f.id);
          const v = el ? String(el.value || '').trim() : '';
          if (v) push(`industryFsi.${f.key}`, v);
        });
        FSI_PRODUCT_CHECKBOXES.forEach((p) => {
          const el = $(p.id);
          if (!el) return;
          push(`industryFsi.financialProducts.${p.key}`, !!el.checked);
        });
      },

      // Pull industry fields out of a profile/table response. Profile API
      // returns rows as either dot-paths or underscore paths — the
      // findBySuffix / findByKeywords helpers normalise those for us.
      applyFindResult({ findBySuffix, findByKeywords, setSelectValueLoose }) {
        FSI_SCALAR_FIELDS.forEach((f) => {
          const v = findBySuffix([`industryfsi.${f.key.toLowerCase()}`, f.key.toLowerCase()]) ||
                    findByKeywords('industryfsi', f.key.toLowerCase());
          if (v) setSelectValueLoose($(f.id), v);
        });
        FSI_PRODUCT_CHECKBOXES.forEach((p) => {
          const v = findBySuffix([`financialproducts.${p.key.toLowerCase()}`]) ||
                    findByKeywords('industryfsi', 'financialproducts', p.key.toLowerCase());
          if (v === '' || v == null) return;
          setCheckbox(p.id, String(v).toLowerCase() === 'true');
        });
      },

      // Restore a snapshot stored in Shared.recent into the form.
      loadFromSnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;
        FSI_SCALAR_FIELDS.forEach((f) => { setSelect(f.id, snap[f.key]); });
        const products = (snap.financialProducts && typeof snap.financialProducts === 'object') ? snap.financialProducts : {};
        FSI_PRODUCT_CHECKBOXES.forEach((p) => { setCheckbox(p.id, !!products[p.key]); });
      },

      // Used in the "Recently generated" dropdown to give each row a
      // human label. Keep it short — the rendered string already includes
      // the scaled email and the customer analytics tail.
      summarise(snap) {
        if (!snap || !snap.industry) return '';
        const ind = snap.industry;
        const parts = [];
        if (ind.lifeStage) parts.push(ind.lifeStage.replace(/_/g, ' '));
        if (ind.householdIncomeBand) parts.push(`income ${ind.householdIncomeBand.replace(/_/g, ' ')}`);
        if (ind.creditScoreBand) parts.push(`credit ${ind.creditScoreBand.replace(/_/g, ' ')}`);
        if (ind.financialProducts && typeof ind.financialProducts === 'object') {
          const held = Object.entries(ind.financialProducts)
            .filter(([, v]) => !!v)
            .map(([k]) => k);
          if (held.length) parts.push(`holds ${held.length}`);
        }
        return parts.join(' · ');
      },

      // Generate-N persona pass for FSI: pick one option from each
      // dropdown (skipping the "unknown" credit-score band since its
      // semantic value for analytics is zero). Toggle a realistic
      // distribution of products instead of all-or-nothing.
      randomizePersona({ randomPick }) {
        FSI_SCALAR_FIELDS.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id)
            .filter((v) => f.key !== 'creditScoreBand' || String(v).toLowerCase() !== 'unknown');
          if (opts.length) {
            const el = $(f.id);
            if (el) el.value = randomPick(opts);
          }
        });
        // Realistic-looking holdings: most people hold checking + savings;
        // ~50% hold a credit card; mortgage / investment / loan each
        // ~30%. Keeps the cohort visually varied without being uniform.
        setCheckbox('fsiHoldChecking',   Math.random() < 0.95);
        setCheckbox('fsiHoldSavings',    Math.random() < 0.85);
        setCheckbox('fsiHoldCreditCard', Math.random() < 0.55);
        setCheckbox('fsiHoldMortgage',   Math.random() < 0.30);
        setCheckbox('fsiHoldInvestment', Math.random() < 0.30);
        setCheckbox('fsiHoldLoan',       Math.random() < 0.25);
      },
    },
  });
})();
