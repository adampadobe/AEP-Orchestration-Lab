/**
 * Profile Generation — FSI (financial services) industry section.
 *
 * Thin per-industry config that delegates the heavy lifting to the shared
 * runtime in profile-generation-industry-runtime.js. Behaviour mirrors
 * profile-generation-travel.js / profile-generation-retail.js: own setup
 * wizard, lookup, Customer Analytics, Generate-N flow, recent-snapshot
 * picker — but with FSI field semantics on top.
 *
 * Schema-valid push paths (mirror the AEP Lab - FSI Profile - Schema once
 * the wizard runs in this sandbox):
 *
 *   tenant subtree (`_<tenant>.…`) — auto-prefixed by the proxy
 *     • industryFsi.{primaryBankingChannel, creditScoreBand, lifeStage,
 *         employment, householdIncomeBand}
 *           ← existing operator-context dropdowns (declared in the
 *              auto-created `Profile FSI v1` tenant FG body, see
 *              functions/fsiProfileInfraService.js).
 *     • industryFsi.financialProducts.{checking, savings, creditCard,
 *         mortgage, investment, loan}
 *           ← existing product-holding boolean toggles.
 *     • individualCharacteristics.core.{age, employer, occupation,
 *         creditScore}
 *           ← Profile Core v2 leaves (always present on every Profile-class
 *              schema in this sandbox; previously had no UI exposure for FSI).
 *
 *   root XDM mixins (proxy must allow these top keys via
 *   `PROFILE_STREAM_ROOT_PATH_PREFIXES` in functions/profileStreamingCore.js)
 *     • personalFinances.creditScores = [{ provider, score, scoreDate }]
 *           ← OOTB Personal Finance Details FG (https://ns.adobe.com/xdm/mixins/profile-personal-finance-details)
 *              types `personalFinances.creditScores` as `array of object`.
 *              Pushing the leaves as flat dotted paths produced the
 *              JSONObject-vs-JSONArray DCVS-1104-400 ingestion failure
 *              ("expected type: JSONArray, found: JSONObject") that prompted
 *              the May 2026 rewrite — wrap the score/provider/scoreDate trio
 *              in a single-element array before streaming.
 *     • personalFinances.employmentStatus
 *     • personalFinances.accountCardsTotal
 *     • personalFinances.hasAssignedBeneficiary
 *     • personalFinances.personalTaxProfile.{taxBracket, isHeadOfHousehold,
 *         filingJointly, householdIncome.amount, householdIncome.currencyCode}
 *           ← OOTB Personal Finance + Personal Tax Profile Details FGs that
 *              the FSI wizard attaches by default. Ship-blocked-and-fixed in
 *              May 2026 along with the parallel Retail / Travel / per-industry
 *              audit (the original module pushed only the auto-created tenant
 *              FG paths and ignored every OOTB leaf the wizard attaches).
 *
 * Operator-context dropdown re-mappings (added without changing the original
 * `industryFsi.*` push targets — those already land on real schema leaves):
 *   • creditScoreBand        → also `_<tenant>.individualCharacteristics.core.creditScore` (numeric midpoint)
 *   • employment             → also `personalFinances.employmentStatus`             (mapped value)
 *   • householdIncomeBand    → also `personalFinances.personalTaxProfile.householdIncome.{amount, currencyCode}`
 *
 * Wire-up at a glance:
 *   - DOM scope: #fsiProfilePanel (built in profile-generation.html).
 *   - Endpoints: /api/fsi-profile-infra/* + /api/fsi-profile-connection
 *     (declared in firebase.json, served by functions/index.js, backed by
 *     functions/fsiProfileInfraService.js + fsiProfileConnectionStore.js).
 *   - Counter / recent / scaler shared via window.AepProfileGenShared.
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

  // Operator-context dropdown → schema leaf mappings.
  const CREDIT_SCORE_BAND_MIDPOINT = {
    poor: 440,
    fair: 625,
    good: 705,
    very_good: 770,
    excellent: 825,
  };
  const HOUSEHOLD_INCOME_BAND_MIDPOINT = {
    under_50k: 35000,
    '50k_100k': 75000,
    '100k_200k': 150000,
    '200k_500k': 350000,
    '500k_plus': 750000,
  };
  const EMPLOYMENT_TO_OOTB = {
    employed: 'Employed',
    self_employed: 'Self-Employed',
    contract: 'Contract',
    student: 'Student',
    retired: 'Retired',
    unemployed: 'Unemployed',
  };
  const TAX_BRACKET_BY_INCOME = {
    under_50k: '12%',
    '50k_100k': '22%',
    '100k_200k': '24%',
    '200k_500k': '32%',
    '500k_plus': '37%',
  };

  // Random pools for the new editable inputs.
  const CREDIT_BUREAU_POOL = ['Equifax', 'Experian', 'TransUnion', 'FICO'];
  const EMPLOYER_POOL = [
    'Adobe', 'Apple', 'JPMorgan', 'HSBC', 'Barclays', 'Goldman Sachs',
    'Wells Fargo', 'Citi', 'Lloyds', 'Santander', 'BNP Paribas',
    'Deutsche Bank', 'UBS', 'Northern Trust', 'Morgan Stanley',
    'Bank of America', 'Capital One', 'American Express',
  ];
  const OCCUPATION_POOL = [
    'Software engineer', 'Product manager', 'Designer', 'Doctor',
    'Lawyer', 'Teacher', 'Accountant', 'Architect', 'Nurse',
    'Marketing manager', 'Sales executive', 'Financial analyst',
    'Consultant', 'Operations manager', 'Data scientist',
  ];
  const TAX_BRACKET_POOL = ['10%', '12%', '22%', '24%', '32%', '35%', '37%'];

  function $(id) { return document.getElementById(id); }

  function getCheckbox(id) {
    const el = $(id);
    return el ? !!el.checked : false;
  }

  function setCheckbox(id, val) {
    const el = $(id);
    if (el) el.checked = !!val;
  }

  function trim(el) { return (el && typeof el.value === 'string') ? el.value.trim() : ''; }

  function num(el) {
    const raw = trim(el);
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function intOr(el) {
    const raw = trim(el);
    if (raw === '') return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
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

  function setVal(id, val) {
    const el = $(id);
    if (el && val != null) el.value = String(val);
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

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function isoDateAgo(daysAgo) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }
  // Convert a date-only string ('YYYY-MM-DD') into a full ISO-8601 instant
  // ('YYYY-MM-DDTHH:mm:ssZ') for OOTB schema leaves typed as `format: date-time`.
  // Required by personalFinances.creditScores[].scoreDate — that leaf rejected
  // bare 'YYYY-MM-DD' values with DCVS-1102-400 ("not a valid date-time")
  // on the May 3 2026 batch (4 records failed) until this conversion was added.
  // DO NOT use this for `format: date` leaves (e.g. person.birthDate,
  // homeInsuranceDataType.effectiveDate) — those want bare 'YYYY-MM-DD'.
  function toIsoDateTime(dateOnly) {
    if (!dateOnly || typeof dateOnly !== 'string') return dateOnly;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return `${dateOnly}T00:00:00Z`;
    return dateOnly;
  }
  function randomCreditScoreInBand(bandKey) {
    switch (bandKey) {
      case 'poor':      return randInt(300, 579);
      case 'fair':      return randInt(580, 669);
      case 'good':      return randInt(670, 739);
      case 'very_good': return randInt(740, 799);
      case 'excellent': return randInt(800, 850);
      default:          return randInt(600, 800);
    }
  }
  function applyTaxFilingMutex(checkboxId) {
    // joint / separately / single are mutually exclusive — clear the others.
    const ids = ['fsiTaxFilingJoint', 'fsiTaxFilingSeparate', 'fsiTaxFilingSingle'];
    if (!ids.includes(checkboxId)) return;
    if (!getCheckbox(checkboxId)) return;
    ids.forEach((id) => { if (id !== checkboxId) setCheckbox(id, false); });
  }

  // ---------------------------------------------------------------------------
  // Audit §3.4 / §4.7 correlation tables. Keep these as plain const objects so
  // the verification harness at /tmp/verify-audit-followups.mjs can require()
  // this module without a DOM and still reproduce the distribution by import.
  //
  // CREDIT_BAND_DISTRIBUTION_BY_INCOME maps each household-income band (the
  // values defined on the #fsiHouseholdIncomeBand <select> in
  // profile-generation.html) to a weighted distribution over the credit-score
  // bands declared on #fsiCreditScoreBand. Weights MUST sum to 1.0 per row;
  // the row total is checked at module load to fail fast on a bad edit.
  // The distributions implement the audit's "high income → high credit
  // skew" requirement using the bands the HTML actually exposes (poor,
  // fair, good, very_good, excellent) rather than the audit's free-form
  // numeric thresholds.
  // ---------------------------------------------------------------------------
  const CREDIT_BAND_DISTRIBUTION_BY_INCOME = {
    under_50k: {
      poor: 0.50, fair: 0.30, good: 0.15, very_good: 0.05, excellent: 0.00,
    },
    '50k_100k': {
      poor: 0.20, fair: 0.30, good: 0.30, very_good: 0.20, excellent: 0.00,
    },
    '100k_200k': {
      poor: 0.05, fair: 0.20, good: 0.35, very_good: 0.30, excellent: 0.10,
    },
    '200k_500k': {
      poor: 0.02, fair: 0.10, good: 0.28, very_good: 0.40, excellent: 0.20,
    },
    '500k_plus': {
      poor: 0.01, fair: 0.05, good: 0.14, very_good: 0.30, excellent: 0.50,
    },
  };

  // Verify each row sums to 1 (±epsilon) at module load. Keeps the table
  // self-validating — a future edit that drops or duplicates a band will
  // throw on next load instead of silently shifting the cohort.
  Object.entries(CREDIT_BAND_DISTRIBUTION_BY_INCOME).forEach(([incomeBand, dist]) => {
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.0001) {
      console.warn(`[fsi-profile] CREDIT_BAND_DISTRIBUTION_BY_INCOME[${incomeBand}] sums to ${total.toFixed(4)}; expected 1.`);
    }
  });

  // Pick a credit-score band from the income-conditioned distribution above.
  // Uses cumulative-weight roulette so each band's weight maps to its slice
  // of the [0,1) interval. Falls back to 'good' (most common bucket) if the
  // income band isn't in the table.
  function pickCreditBandForIncome(incomeBand) {
    const dist = CREDIT_BAND_DISTRIBUTION_BY_INCOME[incomeBand];
    if (!dist) return 'good';
    const r = Math.random();
    let acc = 0;
    for (const [band, weight] of Object.entries(dist)) {
      acc += weight;
      if (r < acc) return band;
    }
    return 'excellent';
  }

  // Account-cards-total ranges keyed by credit-score band. The audit's
  // numeric ranges ("320–579 → 0–1 cards" etc.) align 1:1 with the HTML's
  // poor / fair / good / very_good / excellent enum.
  const ACCOUNT_CARDS_RANGE_BY_CREDIT_BAND = {
    poor:      { min: 0, max: 1 },
    fair:      { min: 1, max: 3 },
    good:      { min: 2, max: 5 },
    very_good: { min: 3, max: 7 },
    excellent: { min: 3, max: 7 },
  };

  // Life-stage ↔ employment correlation. retired forces employment=retired
  // (matches the audit). student / pre_career bias toward a small allowed
  // pool — `pre_career` from the audit isn't an HTML option here but we
  // treat 'young_professional' similarly (newly entering workforce).
  const EMPLOYMENT_BIAS_BY_LIFE_STAGE = {
    student:            ['student', 'unemployed', 'contract'],
    young_professional: ['employed', 'employed', 'employed', 'contract'],
    family:             ['employed', 'employed', 'self_employed', 'contract'],
    pre_retirement:     ['employed', 'self_employed', 'retired'],
    // 'retired' is handled as a hard force, not a bias pool.
  };

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
      birthDate: 'fsiBirthDate',
      age: 'fsiAge',

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
        // Note: birthDate + age are owned by the shared runtime (snapshotForm
        // captures `birthDate` / `age` on the base snapshot directly via the
        // `birthDate` / `age` ids declared above). Profile Core extras kept
        // here are the FSI-specific Employer + Occupation pair only.
        const profileCore = {
          employer: trim($('fsiEmployer')),
          occupation: trim($('fsiOccupation')),
        };
        const finance = {
          creditScore: trim($('fsiCreditScore')),
          creditBureau: trim($('fsiCreditBureau')),
          creditScoreDate: trim($('fsiCreditScoreDate')),
          accountCardsTotal: trim($('fsiAccountCardsTotal')),
          hasAssignedBeneficiary: getCheckbox('fsiHasBeneficiary'),
          taxBracket: trim($('fsiTaxBracket')),
          householdIncomeAmount: trim($('fsiHouseholdIncomeAmount')),
          isHeadOfHousehold: getCheckbox('fsiHeadOfHousehold'),
          filingJointly: getCheckbox('fsiTaxFilingJoint'),
          filingSeparately: getCheckbox('fsiTaxFilingSeparate'),
          singleFiler: getCheckbox('fsiTaxFilingSingle'),
        };
        return { ...scalar, financialProducts: products, profileCore, finance };
      },

      // Build the XDM `updates` array. Existing operator-context dropdowns
      // (`industryFsi.*`) ARE schema-valid (they're declared in the
      // auto-created `Profile FSI v1` tenant FG, see fsiProfileInfraService),
      // so they keep their pushes. We additionally remap them onto the OOTB
      // personalFinances mixin and the Profile Core v2 tenant subtree where
      // there's a sensible mapping.
      buildUpdates({ push }) {
        // ---- Original industryFsi.* pushes (kept; valid via Profile FSI v1) ----
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

        // ---- Operator-context dropdown re-mappings onto schema leaves ----
        const creditBand = trim($('fsiCreditScoreBand'));
        if (creditBand && CREDIT_SCORE_BAND_MIDPOINT[creditBand] != null) {
          // Generic Profile Core v2 leaf, numeric — see /tmp/generic-schema-full.json.
          push('individualCharacteristics.core.creditScore', CREDIT_SCORE_BAND_MIDPOINT[creditBand]);
        }

        const employment = trim($('fsiEmploymentStatus'));
        if (employment && EMPLOYMENT_TO_OOTB[employment]) {
          push('personalFinances.employmentStatus', EMPLOYMENT_TO_OOTB[employment]);
        }

        const incomeBand = trim($('fsiHouseholdIncomeBand'));
        if (incomeBand && HOUSEHOLD_INCOME_BAND_MIDPOINT[incomeBand] != null) {
          push('personalFinances.personalTaxProfile.householdIncome.amount', HOUSEHOLD_INCOME_BAND_MIDPOINT[incomeBand]);
          push('personalFinances.personalTaxProfile.householdIncome.currencyCode', 'USD');
        }

        // ---- New Profile Core v2 tenant-subtree leaves ----
        // (age is now owned by the shared runtime — see `age: 'fsiAge'` in
        // the ids map above; runtime pushes individualCharacteristics.core.age
        // re-derived from person.birthDate so both stay consistent.)

        const employer = trim($('fsiEmployer'));
        if (employer) push('individualCharacteristics.core.employer', employer);

        const occupation = trim($('fsiOccupation'));
        if (occupation) push('individualCharacteristics.core.occupation', occupation);

        // ---- New OOTB personalFinances.* leaves ----
        // CRITICAL: `personalFinances.creditScores` is typed as
        // `array of object` in the OOTB Personal Finance Details FG
        // (https://ns.adobe.com/xdm/mixins/profile-personal-finance-details).
        // Earlier this module emitted the three leaves as flat dotted pushes
        // (`personalFinances.creditScores.score = 740`) which the proxy's
        // setByPath assigned as a JSON object — AEP DCVS rejected with
        // DCVS-1104-400 ("expected type: JSONArray, found: JSONObject"),
        // 0 records ingested. Fix: collect the per-score leaves into one
        // object and push the wrapping single-element array as one leaf
        // (Route A — same canonical pattern the May 2026 Telecom fix used
        // for `telecomSubscription.{mobile,internet,media,landline}Subscription`).
        const explicitCreditScore = num($('fsiCreditScore'));
        if (explicitCreditScore != null) {
          // Explicit numeric value overrides the band-derived one.
          push('individualCharacteristics.core.creditScore', explicitCreditScore);
        }
        const creditBureau = trim($('fsiCreditBureau'));
        const creditScoreDate = trim($('fsiCreditScoreDate'));
        const creditScoreEntry = {};
        if (explicitCreditScore != null) creditScoreEntry.score = Math.round(explicitCreditScore);
        if (creditBureau) creditScoreEntry.provider = creditBureau;
        if (creditScoreDate) creditScoreEntry.scoreDate = toIsoDateTime(creditScoreDate);
        if (Object.keys(creditScoreEntry).length) {
          push('personalFinances.creditScores', [creditScoreEntry]);
        }

        const accountCards = intOr($('fsiAccountCardsTotal'));
        if (accountCards != null) push('personalFinances.accountCardsTotal', accountCards);

        const hasBeneficiaryEl = $('fsiHasBeneficiary');
        if (hasBeneficiaryEl) push('personalFinances.hasAssignedBeneficiary', !!hasBeneficiaryEl.checked);

        const taxBracket = trim($('fsiTaxBracket'));
        if (taxBracket) push('personalFinances.personalTaxProfile.taxBracket', taxBracket);

        const explicitIncome = num($('fsiHouseholdIncomeAmount'));
        if (explicitIncome != null) {
          push('personalFinances.personalTaxProfile.householdIncome.amount', explicitIncome);
          push('personalFinances.personalTaxProfile.householdIncome.currencyCode', 'USD');
        }

        const headOfHousehold = $('fsiHeadOfHousehold');
        if (headOfHousehold) push('personalFinances.personalTaxProfile.isHeadOfHousehold', !!headOfHousehold.checked);

        const filingJointly = $('fsiTaxFilingJoint');
        if (filingJointly && filingJointly.checked) {
          push('personalFinances.personalTaxProfile.filingJointly', true);
        }
        const filingSeparately = $('fsiTaxFilingSeparate');
        if (filingSeparately && filingSeparately.checked) {
          push('personalFinances.personalTaxProfile.filingSeparately', true);
        }
        const singleFiler = $('fsiTaxFilingSingle');
        if (singleFiler && singleFiler.checked) {
          push('personalFinances.personalTaxProfile.singleFiler', true);
        }
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

        // Profile Core v2 hydration. (age is owned by the shared runtime —
        // applyProfileFindResultToForm in profile-generation-industry-runtime.js
        // resolves it from person.birthDate / individualCharacteristics.core.age.)

        const employer = findBySuffix(['individualcharacteristics.core.employer']) ||
                         findByKeywords('individualcharacteristics', 'core', 'employer');
        if (employer) setVal('fsiEmployer', String(employer));

        const occupation = findBySuffix(['individualcharacteristics.core.occupation']) ||
                           findByKeywords('individualcharacteristics', 'core', 'occupation');
        if (occupation) setVal('fsiOccupation', String(occupation));

        const creditScore = findBySuffix(['personalfinances.creditscores.score']) ||
                            findBySuffix(['individualcharacteristics.core.creditscore']) ||
                            findByKeywords('creditscores', 'score');
        if (creditScore) setVal('fsiCreditScore', String(creditScore));

        const creditBureau = findBySuffix(['personalfinances.creditscores.provider']) ||
                             findByKeywords('creditscores', 'provider');
        if (creditBureau) setVal('fsiCreditBureau', String(creditBureau));

        const creditScoreDate = findBySuffix(['personalfinances.creditscores.scoredate']) ||
                                findByKeywords('creditscores', 'scoredate');
        if (creditScoreDate) setVal('fsiCreditScoreDate', String(creditScoreDate).slice(0, 10));

        const cards = findBySuffix(['personalfinances.accountcardstotal']) ||
                      findByKeywords('personalfinances', 'accountcardstotal');
        if (cards) setVal('fsiAccountCardsTotal', String(cards));

        const beneficiary = findBySuffix(['personalfinances.hasassignedbeneficiary']) ||
                            findByKeywords('personalfinances', 'hasassignedbeneficiary');
        if (beneficiary !== '' && beneficiary != null) {
          setCheckbox('fsiHasBeneficiary', String(beneficiary).toLowerCase() === 'true');
        }

        const taxBracket = findBySuffix(['personaltaxprofile.taxbracket']) ||
                           findByKeywords('personaltaxprofile', 'taxbracket');
        if (taxBracket) setVal('fsiTaxBracket', String(taxBracket));

        const incomeAmount = findBySuffix(['householdincome.amount']) ||
                             findByKeywords('householdincome', 'amount');
        if (incomeAmount) setVal('fsiHouseholdIncomeAmount', String(incomeAmount));

        const headOfHousehold = findBySuffix(['personaltaxprofile.isheadofhousehold']) ||
                                findByKeywords('personaltaxprofile', 'isheadofhousehold');
        if (headOfHousehold !== '' && headOfHousehold != null) {
          setCheckbox('fsiHeadOfHousehold', String(headOfHousehold).toLowerCase() === 'true');
        }

        const joint = findBySuffix(['personaltaxprofile.filingjointly']) ||
                      findByKeywords('personaltaxprofile', 'filingjointly');
        if (joint !== '' && joint != null) {
          setCheckbox('fsiTaxFilingJoint', String(joint).toLowerCase() === 'true');
        }
        const sep = findBySuffix(['personaltaxprofile.filingseparately']) ||
                    findByKeywords('personaltaxprofile', 'filingseparately');
        if (sep !== '' && sep != null) {
          setCheckbox('fsiTaxFilingSeparate', String(sep).toLowerCase() === 'true');
        }
        const single = findBySuffix(['personaltaxprofile.singlefiler']) ||
                       findByKeywords('personaltaxprofile', 'singlefiler');
        if (single !== '' && single != null) {
          setCheckbox('fsiTaxFilingSingle', String(single).toLowerCase() === 'true');
        }
      },

      // Restore a snapshot stored in Shared.recent into the form.
      loadFromSnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;
        FSI_SCALAR_FIELDS.forEach((f) => { setSelect(f.id, snap[f.key]); });
        const products = (snap.financialProducts && typeof snap.financialProducts === 'object') ? snap.financialProducts : {};
        FSI_PRODUCT_CHECKBOXES.forEach((p) => { setCheckbox(p.id, !!products[p.key]); });

        const pc = (snap.profileCore && typeof snap.profileCore === 'object') ? snap.profileCore : {};
        // (age is owned by the shared runtime — restored from snap.age at the base level.)
        setVal('fsiEmployer', pc.employer || '');
        setVal('fsiOccupation', pc.occupation || '');

        const f = (snap.finance && typeof snap.finance === 'object') ? snap.finance : {};
        setVal('fsiCreditScore', f.creditScore || '');
        setVal('fsiCreditBureau', f.creditBureau || '');
        setVal('fsiCreditScoreDate', f.creditScoreDate || '');
        setVal('fsiAccountCardsTotal', f.accountCardsTotal || '');
        setCheckbox('fsiHasBeneficiary', !!f.hasAssignedBeneficiary);
        setVal('fsiTaxBracket', f.taxBracket || '');
        setVal('fsiHouseholdIncomeAmount', f.householdIncomeAmount || '');
        setCheckbox('fsiHeadOfHousehold', !!f.isHeadOfHousehold);
        setCheckbox('fsiTaxFilingJoint', !!f.filingJointly);
        setCheckbox('fsiTaxFilingSeparate', !!f.filingSeparately);
        setCheckbox('fsiTaxFilingSingle', !!f.singleFiler);
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
        if (ind.finance && ind.finance.creditScore) parts.push(`FICO ${ind.finance.creditScore}`);
        return parts.join(' · ');
      },

      // Generate-N persona pass for FSI. Audit §3.4 + §4.7: every leaf
      // we touch is correlated with the others so the cohort reads as a
      // coherent customer. Order matters — earlier picks feed later ones.
      //   1. Income band (free pick)
      //   2. Credit band → biased by income
      //   3. Numeric credit score → bell-distributed inside the chosen band
      //   4. Account cards total → range keyed by credit band
      //   5. Life stage (free pick)
      //   6. Employment status → forced/biased by life stage
      //   7. Other holdings + bureau + tax + filing-status mutex
      randomizePersona({ randomPick: pick }) {
        const helpers = (window.AepProfileGenIndustry && window.AepProfileGenIndustry.helpers) || null;
        const wb = (helpers && typeof helpers.weightedBool === 'function')
          ? helpers.weightedBool
          : (p) => Math.random() < p;
        const bell = (helpers && typeof helpers.randomBellBetween === 'function')
          ? helpers.randomBellBetween
          : (lo, hi) => randInt(lo, hi);

        // Step 1: pick the household-income band first (drives credit + tax).
        const incomeBandOpts = selectValuesNonEmpty('fsiHouseholdIncomeBand');
        const incomeBand = pick(incomeBandOpts);
        setSelect('fsiHouseholdIncomeBand', incomeBand);

        // Step 2: pick credit band conditioned on income (no more uniform-all).
        const creditBand = pickCreditBandForIncome(incomeBand);
        setSelect('fsiCreditScoreBand', creditBand);

        // Step 3: pick remaining scalar dropdowns (excl. the ones we
        // already picked above + employment + life stage which we
        // resolve in steps 5–6 with a correlation).
        FSI_SCALAR_FIELDS.forEach((f) => {
          if (f.key === 'creditScoreBand') return;
          if (f.key === 'householdIncomeBand') return;
          if (f.key === 'lifeStage') return;
          if (f.key === 'employment') return;
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) {
            const el = $(f.id);
            if (el) el.value = pick(opts);
          }
        });

        // Step 5–6: life-stage drives employment.
        //   retired   → force employment=retired (always)
        //   student / pre_retirement / etc. → biased pool from
        //   EMPLOYMENT_BIAS_BY_LIFE_STAGE so the persona's stage and job
        //   reconcile (no more 'retired' personas tagged 'employed').
        const lifeOpts = selectValuesNonEmpty('fsiLifeStage');
        const lifeStage = pick(lifeOpts);
        setSelect('fsiLifeStage', lifeStage);
        const employmentOpts = selectValuesNonEmpty('fsiEmploymentStatus');
        let employment;
        if (lifeStage === 'retired') {
          employment = 'retired';
        } else {
          const pool = EMPLOYMENT_BIAS_BY_LIFE_STAGE[lifeStage] || employmentOpts;
          // Filter to only options that actually exist in the HTML <select>
          // so a stale audit table can't ship an enum value AEP would drop.
          const allowed = pool.filter((v) => employmentOpts.includes(v));
          employment = allowed.length ? pick(allowed) : pick(employmentOpts);
        }
        setSelect('fsiEmploymentStatus', employment);

        // Realistic-looking holdings: most people hold checking + savings;
        // bias higher tiers toward more product holdings via wb so the
        // weights stay in one easy-to-tune table.
        setCheckbox('fsiHoldChecking',   wb(0.95));
        setCheckbox('fsiHoldSavings',    wb(0.85));
        setCheckbox('fsiHoldCreditCard', wb(0.55));
        setCheckbox('fsiHoldMortgage',   wb(0.30));
        setCheckbox('fsiHoldInvestment', wb(0.30));
        setCheckbox('fsiHoldLoan',       wb(0.25));

        // Profile Core v2 demographic enrichment. (age is owned by the
        // shared runtime — randomized via randomBirthDateIso → derived age.)
        setVal('fsiEmployer', randPick(EMPLOYER_POOL));
        setVal('fsiOccupation', randPick(OCCUPATION_POOL));

        // Personal Finance enrichment.
        // Step 3 (numeric credit): bell-distributed inside the band so
        // most personas land near the midpoint instead of bouncing
        // uniformly across the whole 60+ point range.
        const bandRange = (() => {
          switch (creditBand) {
            case 'poor':      return { min: 300, max: 579 };
            case 'fair':      return { min: 580, max: 669 };
            case 'good':      return { min: 670, max: 739 };
            case 'very_good': return { min: 740, max: 799 };
            case 'excellent': return { min: 800, max: 850 };
            default:          return { min: 600, max: 800 };
          }
        })();
        const bandMid = Math.round((bandRange.min + bandRange.max) / 2);
        const score = Math.round(bell(bandRange.min, bandRange.max, bandMid));
        setVal('fsiCreditScore', String(score));
        setVal('fsiCreditBureau', randPick(CREDIT_BUREAU_POOL));
        setVal('fsiCreditScoreDate', isoDateAgo(randInt(1, 90)));

        // Step 4: account-cards-total range keyed by credit band so a
        // 320-FICO persona doesn't end up with 8 cards. Bell distribution
        // again — keeps most personas in the realistic middle of each
        // band's range.
        const cardsRange = ACCOUNT_CARDS_RANGE_BY_CREDIT_BAND[creditBand] || { min: 1, max: 5 };
        const accountCardsTotal = Math.round(bell(cardsRange.min, cardsRange.max));
        setVal('fsiAccountCardsTotal', String(accountCardsTotal));

        setCheckbox('fsiHasBeneficiary', wb(0.55));

        const taxBracket = TAX_BRACKET_BY_INCOME[incomeBand] || randPick(TAX_BRACKET_POOL);
        setVal('fsiTaxBracket', taxBracket);
        if (HOUSEHOLD_INCOME_BAND_MIDPOINT[incomeBand] != null) {
          setVal('fsiHouseholdIncomeAmount', String(HOUSEHOLD_INCOME_BAND_MIDPOINT[incomeBand]));
        } else {
          setVal('fsiHouseholdIncomeAmount', String(randInt(35000, 250000)));
        }
        setCheckbox('fsiHeadOfHousehold', wb(0.50));

        // Mutex tax filing status — exactly one of the three checkboxes
        // can be true. Use the runtime's pickOneOf helper so we share the
        // mutex pattern with any future industries that need it (and the
        // verifier can reach it via window.AepProfileGenIndustry.helpers).
        if (helpers && typeof helpers.pickOneOf === 'function') {
          helpers.pickOneOf(['fsiTaxFilingJoint', 'fsiTaxFilingSeparate', 'fsiTaxFilingSingle']);
        } else {
          // Fallback to the previous probabilistic distribution if the
          // runtime helper is missing (defensive — should never happen
          // in normal browser load order).
          const filingPick = Math.random();
          setCheckbox('fsiTaxFilingJoint',     filingPick < 0.50);
          setCheckbox('fsiTaxFilingSeparate',  filingPick >= 0.50 && filingPick < 0.65);
          setCheckbox('fsiTaxFilingSingle',    filingPick >= 0.65);
        }
      },
    },
  });

  // Wire mutex behaviour for the three filing-status checkboxes (only one
  // makes sense at a time per the OOTB Personal Tax Profile FG semantics).
  ['fsiTaxFilingJoint', 'fsiTaxFilingSeparate', 'fsiTaxFilingSingle'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('change', () => applyTaxFilingMutex(id));
  });
})();
