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
 *     • personalFinances.creditScores.{provider, score, scoreDate}
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
        const profileCore = {
          age: trim($('fsiAge')),
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
        const age = intOr($('fsiAge'));
        if (age != null) push('individualCharacteristics.core.age', age);

        const employer = trim($('fsiEmployer'));
        if (employer) push('individualCharacteristics.core.employer', employer);

        const occupation = trim($('fsiOccupation'));
        if (occupation) push('individualCharacteristics.core.occupation', occupation);

        // ---- New OOTB personalFinances.* leaves ----
        const explicitCreditScore = num($('fsiCreditScore'));
        if (explicitCreditScore != null) {
          // Explicit numeric value overrides the band-derived one.
          push('individualCharacteristics.core.creditScore', explicitCreditScore);
          push('personalFinances.creditScores.score', Math.round(explicitCreditScore));
        }

        const creditBureau = trim($('fsiCreditBureau'));
        if (creditBureau) push('personalFinances.creditScores.provider', creditBureau);

        const creditScoreDate = trim($('fsiCreditScoreDate'));
        if (creditScoreDate) push('personalFinances.creditScores.scoreDate', creditScoreDate);

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

        // Profile Core v2 hydration.
        const age = findBySuffix(['individualcharacteristics.core.age']) ||
                    findByKeywords('individualcharacteristics', 'core', 'age');
        if (age) setVal('fsiAge', String(age));

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
        setVal('fsiAge', pc.age || '');
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

      // Generate-N persona pass for FSI: pick one option from each
      // dropdown (skipping the "unknown" credit-score band since its
      // semantic value for analytics is zero). Toggle a realistic
      // distribution of products instead of all-or-nothing.
      randomizePersona({ randomPick: pick }) {
        FSI_SCALAR_FIELDS.forEach((f) => {
          const opts = selectValuesNonEmpty(f.id)
            .filter((v) => f.key !== 'creditScoreBand' || String(v).toLowerCase() !== 'unknown');
          if (opts.length) {
            const el = $(f.id);
            if (el) el.value = pick(opts);
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

        // Profile Core v2 demographic enrichment.
        setVal('fsiAge', String(randInt(18, 80)));
        setVal('fsiEmployer', randPick(EMPLOYER_POOL));
        setVal('fsiOccupation', randPick(OCCUPATION_POOL));

        // Personal Finance enrichment — anchor to the band when present.
        const band = trim($('fsiCreditScoreBand'));
        const score = randomCreditScoreInBand(band);
        setVal('fsiCreditScore', String(score));
        setVal('fsiCreditBureau', randPick(CREDIT_BUREAU_POOL));
        setVal('fsiCreditScoreDate', isoDateAgo(randInt(1, 90)));
        setVal('fsiAccountCardsTotal', String(randInt(1, 8)));
        setCheckbox('fsiHasBeneficiary', Math.random() < 0.55);

        const incomeBand = trim($('fsiHouseholdIncomeBand'));
        const taxBracket = TAX_BRACKET_BY_INCOME[incomeBand] || randPick(TAX_BRACKET_POOL);
        setVal('fsiTaxBracket', taxBracket);
        if (HOUSEHOLD_INCOME_BAND_MIDPOINT[incomeBand] != null) {
          setVal('fsiHouseholdIncomeAmount', String(HOUSEHOLD_INCOME_BAND_MIDPOINT[incomeBand]));
        } else {
          setVal('fsiHouseholdIncomeAmount', String(randInt(35000, 250000)));
        }
        setCheckbox('fsiHeadOfHousehold', Math.random() < 0.50);

        // Mutex tax filing status — pick exactly one with realistic mix.
        const filingPick = Math.random();
        setCheckbox('fsiTaxFilingJoint',     filingPick < 0.50);
        setCheckbox('fsiTaxFilingSeparate',  filingPick >= 0.50 && filingPick < 0.65);
        setCheckbox('fsiTaxFilingSingle',    filingPick >= 0.65);
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
