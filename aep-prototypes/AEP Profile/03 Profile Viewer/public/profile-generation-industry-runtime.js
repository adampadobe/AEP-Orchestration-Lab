/**
 * Profile Generation — shared client-side runtime for new industries
 * (FSI, Telecommunications, Retail, Media, Sports).
 *
 * Mirrors the behaviour of profile-generation-generic.js +
 * profile-generation-travel.js exactly: same setup wizard, same lookup,
 * same Customer Analytics editor, same Generate-N flow with per-day
 * counter sharing across industries via window.AepProfileGenShared.
 *
 * Generic and Travel intentionally keep their hand-rolled modules
 * untouched (they shipped before this helper existed and the Phase 0
 * refactor's "behaviour-unchanged" guarantee covers them); every NEW
 * industry uses this helper so adding one is ≈150 LOC of config rather
 * than ≈1500 LOC of cloned JS.
 *
 * Usage (in profile-generation-<industry>.js):
 *
 *   window.AepProfileGenIndustry.bind({
 *     industryKey: 'fsi',
 *     industryDisplayName: 'FSI',
 *     panelShownEvent: 'aep-fsi-panel-shown',
 *     apiPathPrefix: 'fsi-profile',
 *     defaultFlowName: 'AEP Lab - FSI Profile - Dataflow',
 *     ids: { ...all DOM ids the runtime needs... },
 *     industry: {
 *       fields: [...],                  // industry attribute element IDs
 *       toggles: [{ checkboxId, fieldsId }],
 *       snapshot: ({ trimVal, get }) => ({...}),
 *       buildUpdates: ({ push, trimVal, get }) => { ... },
 *       applyFindResult: ({ findBySuffix, findByKeywords, setSelectValueLoose, get, set }) => { ... },
 *       loadFromSnapshot: (snap, { get, set }) => { ... },
 *       summarise: (snap) => '',
 *       randomizePersona: ({ trimVal, get, set }) => { ... },
 *     },
 *   });
 */

(function () {
  'use strict';

  if (window.AepProfileGenIndustry) return;

  const PREFERRED_CHANNEL_RANDOM_SKIP = new Set(['unknown', 'none']);

  const RANDOM_MALE_FIRST = [
    'James', 'Michael', 'Robert', 'David', 'Daniel', 'Matthew', 'Ryan', 'Kevin', 'Brian', 'Jason',
    'Eric', 'Thomas', 'William', 'John', 'Christopher', 'Andrew', 'Steven', 'Adam', 'Marcus', 'Omar',
  ];
  const RANDOM_FEMALE_FIRST = [
    'Emma', 'Olivia', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia', 'Harper', 'Evelyn', 'Luna',
    'Grace', 'Chloe', 'Victoria', 'Aria', 'Zoey', 'Natalie', 'Hannah', 'Sarah', 'Priya', 'Yuki',
  ];
  const RANDOM_NEUTRAL_FIRST = [
    'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Quinn', 'Avery', 'Skyler',
    'Reese', 'Cameron', 'Remi', 'Rowan', 'Phoenix', 'Sam', 'Dakota', 'Blake', 'Eden', 'Sage',
  ];
  const RANDOM_LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Lee', 'Kim', 'Patel', 'Cohen', 'Okafor', 'Silva', 'Andersen', 'Nielsen', 'Kowalski', 'Tanaka',
    'Nguyen', 'Khan', 'Lopez', 'Thompson', 'Murphy', "O'Brien", 'Bernhardt', 'Rossi', 'Santos', 'Chen',
    'Walsh', 'Fernandez', 'Okonkwo', 'Hassan', 'Park', 'Ito', 'Muller', 'Dubois', 'van Dijk', 'Reyes',
  ];

  function randomBetween(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  function randomPick(arr) {
    if (!arr || !arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function randomFirstNameForGender(genderVal) {
    const g = String(genderVal || '').toLowerCase();
    if (g === 'male') return randomPick(RANDOM_MALE_FIRST);
    if (g === 'female') return randomPick(RANDOM_FEMALE_FIRST);
    return randomPick(RANDOM_NEUTRAL_FIRST);
  }
  function randomLoyaltyPointsForTier(tier) {
    switch (String(tier || '').toLowerCase()) {
      case 'platinum': return randomBetween(50000, 200000);
      case 'gold':     return randomBetween(20000, 60000);
      case 'silver':   return randomBetween(5000, 25000);
      case 'bronze':   return randomBetween(500, 7500);
      default:         return randomBetween(500, 50000);
    }
  }

  function trimVal(el) {
    return el ? String(el.value || '').trim() : '';
  }

  // ---- Birth date / age helpers (shared across every industry) ----
  // person.birthDate is a string/date leaf at XDM root (profile-person-details
  // mixin attached by every Profile-class schema). The tenant Profile Core v2
  // mixin contributes `_<tenant>.individualCharacteristics.core.age` (integer).
  // Both fields are populated on every Generate so cohorts get realistic
  // demographics, and the two are kept consistent: any time birthDate changes
  // (operator typing or randomizer), age is recomputed from it.
  const BIRTH_AGE_MIN = 18;
  const BIRTH_AGE_MAX = 85;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function isValidIsoBirthDate(str) {
    if (!str || typeof str !== 'string') return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
    if (!m) return false;
    const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    if (y < 1900 || y > new Date().getFullYear()) return false;
    return true;
  }

  function computeAgeFromBirthDate(isoStr) {
    if (!isValidIsoBirthDate(isoStr)) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoStr.trim());
    const by = Number(m[1]); const bm = Number(m[2]); const bd = Number(m[3]);
    const today = new Date();
    let age = today.getFullYear() - by;
    const beforeBirthday =
      today.getMonth() + 1 < bm ||
      (today.getMonth() + 1 === bm && today.getDate() < bd);
    if (beforeBirthday) age -= 1;
    if (age < 0) return null;
    return age;
  }

  function randomBirthDateIso() {
    const now = new Date();
    const year = now.getFullYear() - randomBetween(BIRTH_AGE_MIN, BIRTH_AGE_MAX);
    const month = randomBetween(1, 12);
    // 1..28 avoids month-end rollover edge cases (Feb 29, etc).
    const day = randomBetween(1, 28);
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  function selectNonEmptyValues(selectEl) {
    if (!selectEl || !selectEl.options) return [];
    const out = [];
    for (let i = 0; i < selectEl.options.length; i++) {
      const v = selectEl.options[i].value;
      if (v !== '') out.push(v);
    }
    return out;
  }

  function selectPreferredChannelValuesForRandom(selectEl) {
    const raw = selectNonEmptyValues(selectEl);
    const filtered = raw.filter((v) => !PREFERRED_CHANNEL_RANDOM_SKIP.has(String(v).toLowerCase()));
    if (filtered.length) return filtered;
    return raw.includes('email') ? ['email'] : raw;
  }

  function resolveGenderOptionValue(selectEl, canonicalLower) {
    if (!selectEl || !selectEl.options) return '';
    const want = String(canonicalLower || '').toLowerCase();
    for (let i = 0; i < selectEl.options.length; i++) {
      const v = selectEl.options[i].value;
      if (v !== '' && String(v).toLowerCase() === want) return v;
    }
    return '';
  }

  function randomizeSliderControl(el) {
    if (!el) return;
    const min = parseFloat(el.min || '0');
    const max = parseFloat(el.max || '100');
    const step = parseFloat(el.step || '1') || 1;
    const span = max - min;
    const rand = min + Math.random() * span;
    el.value = String(Math.round(rand / step) * step);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function pickSliderToken(pct, reverse) {
    if (pct < 0.34) return reverse ? '--dash-success-border' : '--dash-error-border';
    if (pct < 0.67) return '--dash-warning-border';
    return reverse ? '--dash-error-border' : '--dash-success-border';
  }

  function applySliderTint(input, reverse) {
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
    const token = pickSliderToken(pct, !!reverse);
    input.style.setProperty('--gen-slider-fill', `var(${token})`);
    input.style.setProperty('--gen-slider-pct', `${(pct * 100).toFixed(2)}%`);
  }

  function setSelectValueLoose(selectEl, raw) {
    if (!selectEl || raw == null) return;
    const val = String(raw).trim();
    if (!val) return;
    const opts = Array.from(selectEl.options || []);
    const exact = opts.find((o) => o.value === val);
    if (exact) { selectEl.value = exact.value; return; }
    const ci = opts.find((o) => String(o.value).toLowerCase() === val.toLowerCase());
    if (ci) { selectEl.value = ci.value; return; }
    const byText = opts.find((o) => String(o.textContent || '').trim().toLowerCase() === val.toLowerCase());
    if (byText) { selectEl.value = byText.value; return; }
  }

  // ============================================================
  // Cross-industry helpers (audit §10 follow-ups, May 2026).
  //
  // Exported on window.AepProfileGenIndustry.helpers so per-industry
  // modules can compose them without re-implementing the same math
  // (and so the verification harness at /tmp/verify-audit-followups.mjs
  // can load and exercise the same code paths as the browser does).
  //
  // Design contract:
  //   - All helpers are pure functions of their args + Math.random()
  //     (no DOM access except for the checkbox/select-id helpers, which
  //     read+write live elements via document.getElementById).
  //   - Every helper short-circuits gracefully on missing elements / bad
  //     inputs so a misconfigured industry module can't crash Generate-N.
  //   - Numeric helpers clamp to sensible ranges; string helpers always
  //     return strings.
  // ============================================================

  /**
   * Weighted boolean draw — `true` with probability `p` (clamped 0..1).
   * Replaces the ad-hoc `Math.random() < N` pattern that was scattered
   * across every per-industry randomiser. (Audit §10 H.)
   */
  function weightedBool(p) {
    const probability = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
    return Math.random() < probability;
  }

  /**
   * Triangular-ish distribution biased toward `mean` over the [min, max]
   * range. Uses the average of two uniform draws, which approximates a
   * triangular PDF centered at the midpoint; we then shift by
   * `mean - midpoint` so the operator can bias the centre. Returns an
   * integer when both inputs are integers (snapping to nearest), else a
   * float. Always clamped to [min, max]. (Audit §10 J — biggest realism
   * multiplier.)
   */
  function randomBellBetween(min, max, mean) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return Number.isFinite(min) ? min : 0;
    }
    const m = Number.isFinite(mean) ? mean : (min + max) / 2;
    const midpoint = (min + max) / 2;
    const shift = m - midpoint;
    const span = max - min;
    const uniform1 = Math.random() * span;
    const uniform2 = Math.random() * span;
    let v = min + (uniform1 + uniform2) / 2 + shift;
    if (v < min) v = min;
    if (v > max) v = max;
    if (Number.isInteger(min) && Number.isInteger(max)) {
      return Math.round(v);
    }
    return v;
  }

  /**
   * Mutual-exclusion checkbox setter. Given an array of checkbox ids
   * (or live <input> elements), set exactly ONE to true and clear the
   * rest. Returns the id (or empty string) of the chosen checkbox.
   * Missing elements are silently skipped so an old DOM that lacks one
   * of the ids in the list still works. (Audit §10 G — generalises the
   * FSI tax-filing mutex.)
   */
  function pickOneOf(checkboxElsOrIds) {
    if (!Array.isArray(checkboxElsOrIds) || !checkboxElsOrIds.length) return '';
    const resolved = checkboxElsOrIds
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === 'string') {
          const el = document.getElementById(entry);
          return el ? { id: entry, el } : null;
        }
        if (entry.id) return { id: entry.id, el: entry };
        return null;
      })
      .filter((x) => x);
    if (!resolved.length) return '';
    const chosen = resolved[Math.floor(Math.random() * resolved.length)];
    resolved.forEach((r) => {
      r.el.checked = r === chosen;
    });
    return chosen.id;
  }

  /**
   * Apply weighted random to a list of checkbox toggles. `toggleSpecs` is
   * an array of `{ id, weight }` (weight in [0, 1]). For each entry, the
   * checkbox is set to `weightedBool(weight)`. Used by Retail / Media /
   * Sports / Telecom to centralise their engagement-flag passes so the
   * weights live in one declarative table per industry. (Audit §10 A.)
   */
  function randomizeFlagToggles(toggleSpecs) {
    if (!Array.isArray(toggleSpecs)) return;
    toggleSpecs.forEach((spec) => {
      if (!spec || !spec.id) return;
      const el = document.getElementById(spec.id);
      if (!el) return;
      el.checked = weightedBool(spec.weight);
    });
  }

  /**
   * Resolve a band key to a numeric value, optionally jittered. Useful
   * when a UI dropdown ("under_30k", "30k_75k", …) needs to project to
   * a realistic numeric leaf (income amount, credit score midpoint, …).
   *   bandValue: the dropdown's selected value
   *   mappingTable: { bandKey: numericValue } lookup
   *   jitterPct: 0..1 — how much to perturb the midpoint as a fraction
   *     of the value itself (0.1 = ±10%). Default 0.1. Pass 0 for the
   *     midpoint exact.
   * Returns null when the band isn't in the mapping. (Audit §10 B.)
   */
  function deriveFromBand(bandValue, mappingTable, jitterPct) {
    if (!bandValue || !mappingTable || !(bandValue in mappingTable)) return null;
    const base = Number(mappingTable[bandValue]);
    if (!Number.isFinite(base)) return null;
    const j = Number.isFinite(jitterPct) ? jitterPct : 0.1;
    if (j === 0) return base;
    const factor = 1 + j * (Math.random() - 0.5) * 2;
    return base * factor;
  }

  /**
   * Recency-band-driven date generator. Returns ISO `YYYY-MM-DD` for
   * `now() - randomBetween(min, max) * MS_PER_DAY` where the range is
   * looked up from `mapping[bandValue]`. Returns '' when the band is
   * absent or invalid. (Audit §10 C.)
   */
  const MS_PER_DAY_FOR_RECENCY = 24 * 60 * 60 * 1000;
  function dateFromRecencyBand(bandValue, mapping) {
    if (!bandValue || !mapping || !mapping[bandValue]) return '';
    const cfg = mapping[bandValue];
    const minDays = Number(cfg.minDays);
    const maxDays = Number(cfg.maxDays);
    if (!Number.isFinite(minDays) || !Number.isFinite(maxDays) || maxDays < minDays) return '';
    const days = randomBetween(minDays, maxDays);
    const t = Date.now() - days * MS_PER_DAY_FOR_RECENCY;
    return new Date(t).toISOString().slice(0, 10);
  }

  /**
   * Read a <select>'s option values, intersect with an allowlist, and
   * return the filtered list. Lets industry randomisers safely pick
   * from a schema-enum-constrained subset of whatever options the HTML
   * happens to declare. (Audit §10 I.)
   */
  function safeSelectValues(selectId, schemaEnumAllowlist) {
    const el = document.getElementById(selectId);
    if (!el || !el.options) return [];
    const allow = new Set((schemaEnumAllowlist || []).map((v) => String(v)));
    const out = [];
    for (let i = 0; i < el.options.length; i++) {
      const v = el.options[i].value;
      if (v !== '' && allow.has(String(v))) out.push(v);
    }
    return out;
  }

  /**
   * Bind a new industry's profile-generation page to this runtime.
   * Returns nothing; binding is purely side-effects (event listeners +
   * initial state read).
   */
  function bind(config) {
    if (!config || typeof config !== 'object') {
      console.error('[profile-gen-industry] config required');
      return;
    }
    const Shared = window.AepProfileGenShared;
    if (!Shared) {
      console.error(`[${config.industryKey || 'profile-gen'}] AepProfileGenShared missing — load profile-generation-shared.js before this script.`);
      return;
    }

    const industryKey = config.industryKey || 'industry';
    const displayName = config.industryDisplayName || industryKey;
    const apiPathPrefix = config.apiPathPrefix || `${industryKey}-profile`;
    const defaultFlowName = config.defaultFlowName || '';
    const panelShownEvent = config.panelShownEvent || `aep-${industryKey}-panel-shown`;
    const log = (msg, ...rest) => console.log(`[${industryKey}-profile] ${msg}`, ...rest);
    const warn = (msg, ...rest) => console.warn(`[${industryKey}-profile] ${msg}`, ...rest);

    const ids = config.ids || {};
    const $ = (id) => (id ? document.getElementById(id) : null);

    const sandboxSelect = document.getElementById('sandboxSelect');

    // ---- DOM bindings (mirrors the pattern from Travel) ----
    const checkInfraBtn = $(ids.checkInfraBtn);
    // The legacy per-step buttons (`stepCreateSchemaBtn` / `stepAttachFgBtn` /
    // `stepCreateDatasetBtn`) are no longer rendered by profile-generation.html
    // — the May 2026 single-button consolidation collapsed steps 1-3 into the
    // new `stepRunAllBtn` (handled by `runProvisioningStepsCombined` below).
    // We still resolve the old ids defensively so any older / out-of-date
    // markup (e.g. a cached HTML page or the Express prototype) keeps working
    // and so the underlying per-step Cloud Functions remain reachable from
    // diagnostics tools that build the same DOM. Resolves to null in current
    // markup → all `disabled` / wire-up calls below short-circuit.
    const stepCreateSchemaBtn = $(ids.stepCreateSchemaBtn);
    const stepAttachFgBtn = $(ids.stepAttachFgBtn);
    const stepCreateDatasetBtn = $(ids.stepCreateDatasetBtn);
    const stepHttpFlowBtn = $(ids.stepHttpFlowBtn);
    // New combined button + inline progress list (May 2026 consolidation).
    const stepRunAllBtn = $(ids.stepRunAllBtn);
    const infraProgressListEl = $(ids.infraProgressList);
    const infraStatusMessage = $(ids.infraStatusMessage);
    const infraDetailsEl = $(ids.infraDetails);
    const infraHintEl = $(ids.infraHint);
    const ORIGINAL_INFRA_HINT = infraHintEl ? infraHintEl.textContent.trim() : '';

    const streamSchemaIdEl = $(ids.streamSchemaId);
    const streamDatasetIdEl = $(ids.streamDatasetId);
    const streamXdmKeyEl = $(ids.streamXdmKey);
    const streamFlowIdEl = $(ids.streamFlowId);
    const streamFlowNameEl = $(ids.streamFlowName);
    const streamUrlEl = $(ids.streamUrl);
    const loadFromFirebaseBtn = $(ids.loadFromFirebaseBtn);
    const fetchFlowFromAepBtn = $(ids.fetchFlowFromAepBtn);
    const saveStreamBtn = $(ids.saveStreamBtn);

    const lookupNsEl = $(ids.lookupNs);
    const lookupIdentifierEl = $(ids.lookupIdentifier);
    const lookupBtn = $(ids.lookupBtn);
    if (lookupIdentifierEl && lookupNsEl && typeof window.AepIdentityPicker !== 'undefined' && typeof window.AepIdentityPicker.init === 'function') {
      window.AepIdentityPicker.init(lookupIdentifierEl.id, lookupNsEl.id);
    }
    if (lookupIdentifierEl && lookupNsEl && typeof window.attachEmailDatalist === 'function') {
      window.attachEmailDatalist(lookupIdentifierEl.id, ids.lookupRecent || `${lookupIdentifierEl.id}Recent`, lookupNsEl.id);
    }

    const baseEmailEl = $(ids.baseEmail);
    const counterEl = $(ids.counter);
    const generateCountEl = $(ids.generateCount);
    const emailPreviewEl = $(ids.emailPreview);
    const resetCounterBtn = $(ids.resetCounterBtn);
    const updateProfileBtn = $(ids.updateProfileBtn);
    const generateBtn = $(ids.generateBtn);
    const dryRunEl = $(ids.dryRun);
    const messageEl = $(ids.profileMessage);

    const firstNameEl = $(ids.firstName);
    const lastNameEl = $(ids.lastName);
    const birthDateEl = $(ids.birthDate);
    const ageEl = $(ids.age);

    const churnEl = $(ids.churn);
    const churnValueEl = $(ids.churnValue);
    const propensityEl = $(ids.propensity);
    const propensityValueEl = $(ids.propensityValue);
    const npsEl = $(ids.nps);
    const aovEl = $(ids.aov);
    const aovValueEl = $(ids.aovValue);
    const preferredChannelEl = $(ids.preferredChannel);
    const genderEl = $(ids.gender);
    const loyaltyEnabledEl = $(ids.loyaltyEnabled);
    const loyaltyFieldsEl = $(ids.loyaltyFields);
    const loyaltyIDEl = $(ids.loyaltyID);
    const loyaltyTierEl = $(ids.loyaltyTier);
    const loyaltyPointsEl = $(ids.loyaltyPoints);
    const loyaltyRandomBtn = $(ids.loyaltyRandomBtn);
    const languageEl = $(ids.language);

    const recentPickerEl = $(ids.recentPicker);
    const recentSelectEl = $(ids.recentSelect);
    const recentLoadBtn = $(ids.recentLoadBtn);
    const recentDetailsEl = $(ids.recentDetails);
    const recentListBodyEl = $(ids.recentListBody);
    const recentCountLabelEl = $(ids.recentCountLabel);

    const debugEl = $(ids.debug);
    const debugClientReqEl = $(ids.debugClientRequest);
    const debugStatusEl = $(ids.debugStatus);
    const debugResponseEl = $(ids.debugResponse);

    if (!baseEmailEl || !counterEl || !emailPreviewEl) {
      warn('Skipping bind — required base elements not in DOM (panel may not be on this page).');
      return;
    }

    // ---- Industry-extension hooks ----
    const industryCfg = config.industry || {};
    const industryToggles = Array.isArray(industryCfg.toggles) ? industryCfg.toggles : [];
    const industryHooks = {
      snapshot: typeof industryCfg.snapshot === 'function' ? industryCfg.snapshot : () => ({}),
      buildUpdates: typeof industryCfg.buildUpdates === 'function' ? industryCfg.buildUpdates : () => {},
      applyFindResult: typeof industryCfg.applyFindResult === 'function' ? industryCfg.applyFindResult : () => {},
      loadFromSnapshot: typeof industryCfg.loadFromSnapshot === 'function' ? industryCfg.loadFromSnapshot : () => {},
      summarise: typeof industryCfg.summarise === 'function' ? industryCfg.summarise : () => '',
      randomizePersona: typeof industryCfg.randomizePersona === 'function' ? industryCfg.randomizePersona : () => {},
    };

    // ---- Helpers ----
    function setMessage(el, text, type) {
      if (!el) return;
      el.textContent = text || '';
      el.className = 'consent-message' + (type ? ' ' + type : '') + ' consent-message--below-btn';
      el.hidden = !text;
    }

    function showInfraMessage(text, type) {
      if (!infraStatusMessage) return;
      infraStatusMessage.textContent = text || '';
      infraStatusMessage.className = 'consent-message' + (type ? ' ' + type : '');
      infraStatusMessage.hidden = !text;
      if (text && type === 'error' && infraDetailsEl) infraDetailsEl.open = true;
    }

    function streamingFieldsAreFullyConfigured() {
      const s = getStreamingPayload();
      return !!(s && s.url && s.flowId && s.datasetId && s.schemaId);
    }

    function applyConfiguredCollapseState() {
      if (!infraDetailsEl) return;
      const ready = streamingFieldsAreFullyConfigured();
      if (ready) {
        infraDetailsEl.open = false;
        if (infraHintEl) {
          const sb = getSandboxName();
          infraHintEl.textContent = sb
            ? `✓ Configured for sandbox "${sb}" — click to expand if you want to reconfigure.`
            : '✓ Configured — click to expand if you want to reconfigure.';
          infraHintEl.classList.add('consent-streaming-details__hint--configured');
        }
      } else {
        infraDetailsEl.open = true;
        if (infraHintEl) {
          infraHintEl.textContent = ORIGINAL_INFRA_HINT;
          infraHintEl.classList.remove('consent-streaming-details__hint--configured');
        }
      }
    }

    function getSandboxName() {
      if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
        return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
      }
      return String((sandboxSelect && sandboxSelect.value) || '').trim();
    }

    function loadBaseEmailForCurrentSandbox() {
      if (!baseEmailEl) return;
      baseEmailEl.value = Shared.readBaseEmail(getSandboxName());
    }

    function querySuffix(extra) {
      const params = new URLSearchParams();
      const sb = getSandboxName();
      if (sb) params.set('sandbox', sb);
      if (extra && typeof extra === 'object') {
        for (const [k, v] of Object.entries(extra)) {
          if (v != null && String(v).trim() !== '') params.set(k, String(v));
        }
      }
      const qs = params.toString();
      return qs ? `?${qs}` : '';
    }

    function getStreamingPayload() {
      return {
        url: trimVal(streamUrlEl),
        flowId: trimVal(streamFlowIdEl),
        flowName: trimVal(streamFlowNameEl),
        datasetId: trimVal(streamDatasetIdEl),
        schemaId: trimVal(streamSchemaIdEl),
        xdmKey: trimVal(streamXdmKeyEl) || '_demoemea',
      };
    }

    // ---- Email scaler / counter (shared) ----
    const scaleEmail = Shared.scaleEmail;

    function getCurrentScaledEmail() {
      return scaleEmail(trimVal(baseEmailEl), parseInt(counterEl.value || '1', 10) || 1, new Date());
    }

    function updateEmailPreview() {
      if (!emailPreviewEl) return;
      emailPreviewEl.textContent = getCurrentScaledEmail() || '— enter a base email like apalmer@adobetest.com —';
    }

    function persistLastStreamed(email, n) {
      Shared.persistLastStreamed(getSandboxName(), trimVal(baseEmailEl), email, n);
    }
    function readLastStreamed() {
      return Shared.readLastStreamed(getSandboxName(), trimVal(baseEmailEl));
    }

    function getDefaultEmailLookupIdentifier() {
      const last = readLastStreamed();
      if (last && last.email) return last.email;
      return getCurrentScaledEmail();
    }

    function loadCounterForCurrentContext() {
      counterEl.value = String(Shared.readCounter(getSandboxName(), trimVal(baseEmailEl)));
      updateEmailPreview();
    }

    function persistCounter(n) {
      Shared.persistCounter(getSandboxName(), trimVal(baseEmailEl), n);
    }

    function bumpCounter() {
      const next = Shared.incrementCounter(getSandboxName(), trimVal(baseEmailEl));
      counterEl.value = String(next);
      updateEmailPreview();
    }

    // ---- Streaming connection (Firestore) ----
    function fillStreamingFields(streaming) {
      if (!streaming || typeof streaming !== 'object') return;
      if (streamUrlEl && streaming.url) streamUrlEl.value = streaming.url;
      if (streamFlowIdEl && streaming.flowId) streamFlowIdEl.value = streaming.flowId;
      if (streamFlowNameEl && streaming.flowName) streamFlowNameEl.value = streaming.flowName;
      if (streamDatasetIdEl && streaming.datasetId) streamDatasetIdEl.value = streaming.datasetId;
      if (streamSchemaIdEl && streaming.schemaId) streamSchemaIdEl.value = streaming.schemaId;
      if (streamXdmKeyEl && streaming.xdmKey) streamXdmKeyEl.value = streaming.xdmKey;
    }

    function clearStreamingFields() {
      if (streamUrlEl) streamUrlEl.value = '';
      if (streamFlowIdEl) streamFlowIdEl.value = '';
      if (streamDatasetIdEl) streamDatasetIdEl.value = '';
      if (streamSchemaIdEl) streamSchemaIdEl.value = '';
      if (streamXdmKeyEl) streamXdmKeyEl.value = '_demoemea';
    }

    async function loadConnectionFromFirestore(silent) {
      try {
        const res = await fetch(`/api/${apiPathPrefix}-connection` + querySuffix());
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          if (!silent) showInfraMessage(data.error || 'Failed to load saved connection.', 'error');
          return false;
        }
        const rec = data.record;
        const recordedStreaming = rec && rec.streaming && typeof rec.streaming === 'object' ? rec.streaming : null;
        const hasFirestoreSchemaAndDataset = !!(recordedStreaming && recordedStreaming.schemaId && recordedStreaming.datasetId);
        if (recordedStreaming) {
          fillStreamingFields(recordedStreaming);
          if (!silent) showInfraMessage(`Loaded saved ${displayName} Profile connection for this sandbox.`, 'success');
          applyConfiguredCollapseState();
          // Even when Firestore returned a record, the architect may have
          // saved BEFORE running the wizard (so Schema $id / Dataset ID are
          // empty). Try the sandbox auto-discover only when those leaves
          // are still missing AND the panel is the visible one — never
          // worth a heavy /status round-trip for a hidden panel.
          if (!hasFirestoreSchemaAndDataset && isProfilePanelVisible()) {
            autoDiscoverInfraFromSandbox();
          }
          return hasFirestoreSchemaAndDataset;
        }
        if (!silent) {
          showInfraMessage(`No saved ${displayName} connection for this sandbox yet — click "Set up schema, field groups & dataset", then create the HTTP API source and Save connection.`, '');
        }
        applyConfiguredCollapseState();
        // No Firestore record at all — try sandbox auto-discover when the
        // panel is visible. The discover function itself caches per sandbox
        // so panel-show / firestore-reload pairs are safe to call repeatedly.
        if (isProfilePanelVisible()) {
          autoDiscoverInfraFromSandbox();
        }
        return false;
      } catch (e) {
        if (!silent) showInfraMessage(e.message || 'Network error loading connection.', 'error');
        return false;
      }
    }

    async function saveConnectionToFirestore(extraInfra) {
      const sb = getSandboxName();
      if (!sb) {
        showInfraMessage('Pick a sandbox first.', 'error');
        return false;
      }
      const body = { sandbox: sb, streaming: getStreamingPayload() };
      if (extraInfra && typeof extraInfra === 'object' && Object.keys(extraInfra).length) {
        body.infra = extraInfra;
      }
      try {
        const res = await fetch(`/api/${apiPathPrefix}-connection` + querySuffix(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          showInfraMessage(data.error || 'Save failed.', 'error');
          return false;
        }
        applyConfiguredCollapseState();
        return true;
      } catch (e) {
        showInfraMessage(e.message || 'Network error saving connection.', 'error');
        return false;
      }
    }

    // ---- Setup wizard ----
    function applyStepResultToFields(data) {
      if (!data || typeof data !== 'object') return;
      if (streamDatasetIdEl && data.datasetId) streamDatasetIdEl.value = String(data.datasetId);
      if (streamSchemaIdEl && data.schemaId) streamSchemaIdEl.value = String(data.schemaId);
      if (streamXdmKeyEl && data.xdmKey) streamXdmKeyEl.value = String(data.xdmKey);
    }

    async function runStep(step) {
      const labels = {
        createSchema: 'Creating schema…',
        attachFieldGroups: 'Attaching field groups…',
        createDataset: 'Creating dataset…',
        httpFlow: 'Loading HTTP flow instructions…',
      };
      const busy = [stepCreateSchemaBtn, stepAttachFgBtn, stepCreateDatasetBtn, stepHttpFlowBtn].filter(Boolean);
      busy.forEach((b) => { b.disabled = true; });
      showInfraMessage(labels[step] || 'Working…', '');
      try {
        const res = await fetch(`/api/${apiPathPrefix}-infra/step` + querySuffix(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showInfraMessage(data.error || 'Step request failed', 'error');
          return;
        }
        if (data.ok === false) {
          showInfraMessage(
            data.error ||
              (data.profileCoreMixinMissing
                ? 'Import "Profile Core v2" in this sandbox first, then run step 2 again.'
                : 'Step failed.'),
            'error'
          );
          return;
        }
        applyStepResultToFields(data);
        try {
          const infra = {};
          if (data.schemaId) infra.schemaId = data.schemaId;
          if (data.schemaMetaAltId) infra.schemaMetaAltId = data.schemaMetaAltId;
          if (data.datasetId) infra.datasetId = data.datasetId;
          if (data.profileCoreMixinId) infra.profileCoreMixinId = data.profileCoreMixinId;
          if (Object.keys(infra).length) await saveConnectionToFirestore(infra);
        } catch (e) {
          warn('infra sync:', e && e.message);
        }
        // Enrich attachFieldGroups success with the auto-create + tag-discovery
        // breakdown the new factory now returns. The factory's `data.message`
        // already mentions any FG it created in this sandbox; we additionally
        // surface OOTB FGs discovered via the ootbByIndustryTag layer so the
        // operator sees exactly which `meta:industries` / titleHints matches
        // the wizard pulled in.
        let msg =
          data.message ||
          (data.manual && Array.isArray(data.nextSteps) ? data.nextSteps.join(' ') : 'Step completed.');
        if (step === 'attachFieldGroups') {
          const created = Array.isArray(data.industryFieldGroupsCreated) ? data.industryFieldGroupsCreated : [];
          const discovered = Array.isArray(data.industryFieldGroupsDiscovered) ? data.industryFieldGroupsDiscovered : [];
          if (discovered.length) {
            const titles = discovered.map((d) => d.label || d.ref || 'unknown').join(', ');
            msg += ` Discovered Profile-class OOTB FG${discovered.length === 1 ? '' : 's'} via tag/title hints: ${titles}.`;
          }
          if (created.length) {
            log(`auto-created ${created.length} tenant field group${created.length === 1 ? '' : 's'}:`, created);
          }
          if (discovered.length) {
            log(`tag-discovered ${discovered.length} OOTB field group${discovered.length === 1 ? '' : 's'}:`, discovered);
          }
        }
        showInfraMessage(msg, 'success');
        if (Array.isArray(data.nextSteps) && data.nextSteps.length) {
          log('Next steps:', data.nextSteps.join('\n'));
        }
      } catch (e) {
        showInfraMessage(e.message || 'Network error', 'error');
      } finally {
        busy.forEach((b) => { b.disabled = false; });
      }
    }

    // ---- Combined provisioning (Schema → Field groups → Dataset) ----
    //
    // Replaces the legacy 3-button stepper with a single primary action that
    // runs `createSchema → attachFieldGroups → createDataset` in sequence.
    // The three sub-steps share data, never run independently for production
    // sandboxes, and the underlying Cloud Functions are fully idempotent
    // after `0d18852` (factory hardening). Operators previously had to click
    // them in order and remember to re-click after partial failures — this
    // collapses them into a single "Set up schema, field groups & dataset"
    // button with inline ✓ progress and AEP-error surfacing.
    //
    // Underlying per-step Cloud Functions are NOT removed — they remain
    // reachable for diagnostics, Postman collections, and any future
    // "advanced" UX. This is purely a front-end orchestration layer.
    const COMBINED_PROVISIONING_STEPS = [
      { step: 'createSchema',      label: 'Schema' },
      { step: 'attachFieldGroups', label: 'Field groups' },
      { step: 'createDataset',     label: 'Dataset' },
    ];

    function ensureProgressList() {
      if (!infraProgressListEl) return null;
      infraProgressListEl.hidden = false;
      infraProgressListEl.innerHTML = '';
      COMBINED_PROVISIONING_STEPS.forEach((s, i) => {
        const li = document.createElement('li');
        li.className = 'consent-infra-progress__item consent-infra-progress__item--pending';
        li.dataset.step = s.step;
        li.dataset.idx = String(i + 1);
        const icon = document.createElement('span');
        icon.className = 'consent-infra-progress__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '·';
        const label = document.createElement('span');
        label.className = 'consent-infra-progress__label';
        label.textContent = `${i + 1}. ${s.label}`;
        const detail = document.createElement('span');
        detail.className = 'consent-infra-progress__detail';
        detail.textContent = '';
        li.append(icon, label, detail);
        infraProgressListEl.appendChild(li);
      });
      return infraProgressListEl;
    }

    function setProgressItemState(step, state, detailText) {
      if (!infraProgressListEl) return;
      const li = infraProgressListEl.querySelector(`[data-step="${step}"]`);
      if (!li) return;
      li.className =
        'consent-infra-progress__item consent-infra-progress__item--' + state;
      const icon = li.querySelector('.consent-infra-progress__icon');
      const detail = li.querySelector('.consent-infra-progress__detail');
      if (icon) {
        icon.textContent =
          state === 'success' ? '✓' :
          state === 'error'   ? '✗' :
          state === 'working' ? '…' : '·';
      }
      if (detail) detail.textContent = detailText ? ` — ${detailText}` : '';
    }

    /**
     * Classify a /step success payload as "created/changed" vs
     * "already configured" so the combined progress UI can tell the
     * operator what actually happened in this sandbox on this run.
     *
     *   - createSchema  → factory returns `skipped: true` when the
     *     schema already exists; otherwise the schema was created.
     *   - createDataset → same `skipped: true` semantics.
     *   - attachFieldGroups → factory returns `patchApplied: true`
     *     when at least one JSON-Patch op landed; `false` means every
     *     field group was already attached and the primary email
     *     descriptor was already in place. The `profileCoreV2TopUp`
     *     sub-block also matters, but treating top-up-only changes as
     *     "already configured" is fine for the inline UX — the full
     *     message string still surfaces in `infraStatusMessage` so
     *     architects who care about the drift top-up details still see
     *     them.
     */
    function classifyStepResult(stepName, data) {
      if (!data || typeof data !== 'object') return 'created';
      if (stepName === 'attachFieldGroups') {
        return data.patchApplied ? 'created' : 'already';
      }
      return data.skipped ? 'already' : 'created';
    }

    function describeStepOutcome(stepName, outcome) {
      if (outcome === 'already') return 'already configured';
      if (stepName === 'createSchema')      return 'created';
      if (stepName === 'attachFieldGroups') return 'attached';
      if (stepName === 'createDataset')     return 'created';
      return 'done';
    }

    async function runProvisioningStepsCombined() {
      // Disable wizard buttons so the operator can't fire conflicting
      // requests mid-chain. The legacy per-step buttons are usually null
      // (consolidated markup) but we still defensively disable them in
      // case an older HTML render is in front of us.
      const busy = [
        stepRunAllBtn,
        stepCreateSchemaBtn,
        stepAttachFgBtn,
        stepCreateDatasetBtn,
        stepHttpFlowBtn,
        checkInfraBtn,
      ].filter(Boolean);
      busy.forEach((b) => { b.disabled = true; });
      ensureProgressList();
      showInfraMessage('Setting up schema, field groups and dataset…', '');

      let lastSuccessData = null;
      try {
        for (const cfg of COMBINED_PROVISIONING_STEPS) {
          setProgressItemState(cfg.step, 'working', 'working…');
          let res, data;
          try {
            res = await fetch(`/api/${apiPathPrefix}-infra/step` + querySuffix(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ step: cfg.step }),
            });
            data = await res.json().catch(() => ({}));
          } catch (e) {
            const errMsg = e && e.message ? e.message : 'Network error';
            setProgressItemState(cfg.step, 'error', errMsg);
            showInfraMessage(`${cfg.label} failed: ${errMsg}`, 'error');
            return;
          }
          if (!res.ok || data.ok === false) {
            // Server-side AEP error already extracted via
            // extractAepErrorMessage (see profileInfraFactory.js — pulls
            // report.additionalDetails[].errorReason on 4xx bodies).
            const aepError =
              data && data.error
                ? data.error
                : data && data.profileCoreMixinMissing
                  ? 'Profile Core v2 not imported in this sandbox.'
                  : `Step request failed (HTTP ${res.status}).`;
            setProgressItemState(cfg.step, 'error', aepError);
            showInfraMessage(`${cfg.label} failed: ${aepError}`, 'error');
            return;
          }

          // Success: update the relevant streaming form fields and persist
          // any infra ids back to Firestore so the streaming connection
          // record stays in sync (mirrors what the original per-step
          // runStep() did, intentionally kept here so we don't lose the
          // Firestore round-trip when the operator uses the combined flow).
          applyStepResultToFields(data);
          try {
            const infra = {};
            if (data.schemaId) infra.schemaId = data.schemaId;
            if (data.schemaMetaAltId) infra.schemaMetaAltId = data.schemaMetaAltId;
            if (data.datasetId) infra.datasetId = data.datasetId;
            if (data.profileCoreMixinId) infra.profileCoreMixinId = data.profileCoreMixinId;
            if (Object.keys(infra).length) await saveConnectionToFirestore(infra);
          } catch (e) {
            warn(`combined infra sync after ${cfg.step}:`, e && e.message);
          }

          const outcome = classifyStepResult(cfg.step, data);
          const detailText = describeStepOutcome(cfg.step, outcome);
          setProgressItemState(cfg.step, 'success', detailText);
          lastSuccessData = data;
        }

        // All three sub-steps succeeded. Surface the full per-step message
        // (which already encodes the field-group / Profile Core v2 top-up
        // breakdown) and try the sandbox-driven Schema $id / Dataset ID
        // auto-fill so the operator sees the connection panel populate
        // immediately. Open the streaming details so they can paste the
        // dataflow ID as the only remaining manual concern.
        const summary =
          (lastSuccessData && lastSuccessData.message) ||
          'Schema, field groups and dataset ready.';
        showInfraMessage(
          `${summary} Now create the HTTP API streaming source in AEP and paste the dataflow ID below.`,
          'success'
        );
        if (infraDetailsEl) infraDetailsEl.open = true;
        try {
          await autoDiscoverInfraFromSandbox();
        } catch (e) {
          warn('autoDiscoverInfraFromSandbox after combined run:', e && e.message);
        }
      } finally {
        busy.forEach((b) => { b.disabled = false; });
      }
    }

    async function checkInfra() {
      if (!checkInfraBtn) return;
      checkInfraBtn.disabled = true;
      showInfraMessage('Checking…', '');
      try {
        const res = await fetch(`/api/${apiPathPrefix}-infra/status` + querySuffix());
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          showInfraMessage(data.error || 'Status request failed', 'error');
          return;
        }
        const ps = data.prepSteps || {};
        const parts = [
          data.ready ? 'Ready for streaming (after URL + Flow ID set).' : 'Not fully ready yet.',
          `Profile Core v2 mixin: ${data.profileCoreMixinFound ? 'yes' : 'no'}`,
          `Schema: ${data.schemaFound ? 'yes' : 'no'}`,
          `Primary email descriptor: ${data.primaryEmailDescriptor ? 'yes' : 'no'}`,
          `Dataset: ${data.datasetFound ? `yes (Profile-enabled: ${data.datasetProfileEnabled ? 'yes' : 'no'})` : 'no'}`,
          `Wizard: 1 schema ${ps.step1_schemaShell ? '✓' : '—'} · 2 field groups+ID ${ps.step2_fieldGroupsIdentity ? '✓' : '—'} · 3 dataset ${ps.step3_dataset ? '✓' : '—'} · 4 HTTP ${ps.step4_readyForManualHttpFlow ? 'ready' : '—'}`,
        ];
        showInfraMessage(parts.join(' · '), data.ready ? 'success' : '');
        try {
          const infra = {};
          if (data.schemaId) infra.schemaId = data.schemaId;
          if (data.schemaMetaAltId) infra.schemaMetaAltId = data.schemaMetaAltId;
          if (data.datasetId) infra.datasetId = data.datasetId;
          if (data.profileCoreMixinId) infra.profileCoreMixinId = data.profileCoreMixinId;
          if (Object.keys(infra).length) await saveConnectionToFirestore(infra);
        } catch (e) {
          warn('status sync:', e && e.message);
        }
      } catch (e) {
        showInfraMessage(e.message || 'Network error', 'error');
      } finally {
        checkInfraBtn.disabled = false;
      }
    }

    async function fetchFlowFromAep() {
      if (!fetchFlowFromAepBtn) return;
      fetchFlowFromAepBtn.disabled = true;
      showInfraMessage(`Looking up ${displayName} dataflow in Flow Service…`, '');
      try {
        const flowId = trimVal(streamFlowIdEl);
        const flowName = trimVal(streamFlowNameEl) || defaultFlowName;
        const extra = {};
        if (flowId) extra.flowId = flowId;
        if (!flowId && flowName) extra.flowName = flowName;
        const res = await fetch(`/api/${apiPathPrefix}-infra/flow-lookup` + querySuffix(extra));
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          showInfraMessage(data.error || 'Flow lookup failed', 'error');
          return;
        }
        if (streamUrlEl && data.url) streamUrlEl.value = data.url;
        if (streamFlowIdEl && data.flowId) streamFlowIdEl.value = data.flowId;
        if (streamFlowNameEl && data.flowName) streamFlowNameEl.value = data.flowName;
        showInfraMessage('Fetched URL & Flow ID from AEP. Click Save connection to persist for this sandbox.', 'success');
      } catch (e) {
        showInfraMessage(e.message || 'Network error', 'error');
      } finally {
        fetchFlowFromAepBtn.disabled = false;
      }
    }

    // ---- Sandbox-driven auto-discovery of Schema $id + Dataset ID ----
    //
    // When the agent (or anyone) provisions schemas/datasets directly in a
    // sandbox under their canonical names (e.g. `AEP Lab - FSI Profile -
    // Schema` / `AEP Lab - FSI Profile - Dataset`), the architect should
    // not have to open the AEP UI to copy `$id` / dataset ID into this
    // wizard by hand. The `/api/<industry>-profile-infra/status` endpoint
    // already returns `schemaId` and `datasetId` resolved by canonical
    // name, so we simply call it once per (sandbox, industry) and pre-fill
    // the two empty inputs.
    //
    // Discovery rules:
    //   - Skip if either field is already populated (don't clobber Firestore-
    //     loaded values or anything the operator typed by hand).
    //   - Skip if no sandbox is selected yet.
    //   - Cache attempts per sandbox name so panel-shown / firestore-load
    //     cycles don't re-hit AEP unnecessarily.
    //   - Silent on failure / not-found — the user is allowed to be on a
    //     sandbox the agent hasn't provisioned, and the four-step manual
    //     wizard remains the documented fallback below.
    const _autoDiscoverAttempted = new Set();

    function isProfilePanelVisible() {
      const panelEl = ids.profilePanel ? document.getElementById(ids.profilePanel) : null;
      if (!panelEl) return true;
      return !panelEl.hidden;
    }

    async function autoDiscoverInfraFromSandbox() {
      const sb = getSandboxName();
      if (!sb) return false;
      if (trimVal(streamSchemaIdEl) || trimVal(streamDatasetIdEl)) return false;
      if (_autoDiscoverAttempted.has(sb)) return false;
      _autoDiscoverAttempted.add(sb);
      try {
        const res = await fetch(`/api/${apiPathPrefix}-infra/status` + querySuffix());
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) return false;
        const schemaOk = !!(data.schemaFound && data.schemaId);
        const datasetOk = !!(data.datasetFound && data.datasetId);
        if (!schemaOk || !datasetOk) return false;
        if (streamSchemaIdEl && !trimVal(streamSchemaIdEl)) {
          streamSchemaIdEl.value = data.schemaId;
        }
        if (streamDatasetIdEl && !trimVal(streamDatasetIdEl)) {
          streamDatasetIdEl.value = data.datasetId;
        }
        if (streamXdmKeyEl && !trimVal(streamXdmKeyEl) && data.xdmKey) {
          streamXdmKeyEl.value = data.xdmKey;
        }
        showInfraMessage(
          `✓ Auto-filled Schema $id and Dataset ID from sandbox "${sb}" (matched canonical names "${displayName} Profile - Schema" / "Dataset"). Create the HTTP API source then paste the dataflow ID below — or click Fetch URL & Flow ID from AEP.`,
          'success'
        );
        applyConfiguredCollapseState();
        return true;
      } catch (e) {
        warn('autoDiscoverInfraFromSandbox failed:', e && e.message);
        return false;
      }
    }

    // ---- Customer Analytics editor wiring ----
    function renderChurn() { if (churnValueEl && churnEl) churnValueEl.textContent = `${churnEl.value || 0}%`; }
    function renderPropensity() {
      if (propensityValueEl && propensityEl) propensityValueEl.textContent = `${propensityEl.value || 0}%`;
    }
    function renderAov() {
      const n = parseInt(aovEl && aovEl.value ? aovEl.value : '0', 10) || 0;
      if (aovValueEl) aovValueEl.textContent = `$${n.toLocaleString('en-US')}`;
    }

    function syncChurnSlider() { renderChurn(); applySliderTint(churnEl, true); }
    function syncPropensitySlider() { renderPropensity(); applySliderTint(propensityEl, false); }
    function syncAovSlider() { renderAov(); applySliderTint(aovEl, false); }

    function applyRandomCustomerPersonaForGenerate() {
      const mfCanon = ['male', 'female'];
      const available = [];
      for (const c of mfCanon) {
        const optVal = resolveGenderOptionValue(genderEl, c);
        if (optVal) available.push({ canon: c, optVal });
      }
      let genderCanon = 'female';
      let genderValue = '';
      if (available.length) {
        const chosen = randomPick(available);
        genderCanon = chosen.canon;
        genderValue = chosen.optVal;
      }
      if (genderEl && genderValue) genderEl.value = genderValue;

      if (firstNameEl) firstNameEl.value = randomFirstNameForGender(genderCanon);
      if (lastNameEl) lastNameEl.value = randomPick(RANDOM_LAST_NAMES);

      // Always overwrite birth date + age on Generate so every generated
      // profile carries a realistic person.birthDate (string/date at XDM
      // root) and a consistent _<tenant>.individualCharacteristics.core.age
      // (integer). Force-overwrite even if the operator had typed a value —
      // matches the Travel "Generate always populates everything" pattern.
      if (birthDateEl) {
        const iso = randomBirthDateIso();
        birthDateEl.value = iso;
        const a = computeAgeFromBirthDate(iso);
        if (ageEl && a != null) ageEl.value = String(a);
      } else if (ageEl) {
        ageEl.value = String(randomBetween(BIRTH_AGE_MIN, BIRTH_AGE_MAX));
      }

      randomizeSliderControl(churnEl);
      randomizeSliderControl(propensityEl);
      randomizeSliderControl(aovEl);

      const npsChoices = selectNonEmptyValues(npsEl);
      if (npsEl && npsChoices.length) npsEl.value = randomPick(npsChoices);

      const prefChoices = selectPreferredChannelValuesForRandom(preferredChannelEl);
      if (preferredChannelEl && prefChoices.length) preferredChannelEl.value = randomPick(prefChoices);

      const langChoices = selectNonEmptyValues(languageEl);
      if (languageEl && langChoices.length) languageEl.value = randomPick(langChoices);

      if (loyaltyEnabledEl && loyaltyEnabledEl.checked) {
        const tierChoices = selectNonEmptyValues(loyaltyTierEl);
        if (loyaltyTierEl && tierChoices.length) loyaltyTierEl.value = randomPick(tierChoices);
        const tier = loyaltyTierEl ? trimVal(loyaltyTierEl) : '';
        if (loyaltyPointsEl) loyaltyPointsEl.value = String(randomLoyaltyPointsForTier(tier));
        if (loyaltyIDEl) loyaltyIDEl.value = `LYL-${randomBetween(100000, 999999)}`;
      }

      // Industry-specific persona pass — runs AFTER the shared persona so
      // industries can fill blanks without trampling shared analytics.
      try {
        industryHooks.randomizePersona({
          trimVal,
          randomBetween,
          randomPick,
          selectNonEmptyValues,
        });
      } catch (e) {
        warn('industry randomizePersona threw:', e && e.message);
      }
    }

    // ---- Snapshot / build / apply ----
    function snapshotForm() {
      const loyaltyEnabled = !!(loyaltyEnabledEl && loyaltyEnabledEl.checked);
      const base = {
        firstName: trimVal(firstNameEl),
        lastName: trimVal(lastNameEl),
        birthDate: trimVal(birthDateEl),
        age: trimVal(ageEl),
        gender: trimVal(genderEl),
        churn: trimVal(churnEl),
        propensity: trimVal(propensityEl),
        nps: trimVal(npsEl),
        aov: trimVal(aovEl),
        preferredChannel: trimVal(preferredChannelEl),
        language: trimVal(languageEl),
        loyalty: {
          enabled: loyaltyEnabled,
          id: loyaltyEnabled ? trimVal(loyaltyIDEl) : '',
          tier: loyaltyEnabled ? trimVal(loyaltyTierEl) : '',
          points: loyaltyEnabled ? trimVal(loyaltyPointsEl) : '',
        },
      };
      let industrySnap = {};
      try {
        industrySnap = industryHooks.snapshot({ trimVal }) || {};
      } catch (e) {
        warn('industry snapshot threw:', e && e.message);
      }
      base.industry = industrySnap;
      return base;
    }

    function buildUpdatesFromForm() {
      const updates = [];
      const push = (path, value) => updates.push({ path, value });

      const firstName = trimVal(firstNameEl);
      if (firstName) push('person.name.firstName', firstName);
      const lastName = trimVal(lastNameEl);
      if (lastName) push('person.name.lastName', lastName);

      // Birth date + age. Stream both leaves whenever either input has a
      // value; re-derive age from birthDate at push time so the two never
      // drift apart even if the operator hand-edited only one (e.g.
      // typed an age then changed birth year). Skip entirely when both
      // fields are blank.
      //   person.birthDate              → root (PROFILE_STREAM_ROOT_PATH_PREFIXES has `person`)
      //   individualCharacteristics.core.age → tenant subtree (auto _<tenant>-prefixed by proxy)
      const birthDateRaw = trimVal(birthDateEl);
      const ageRaw = trimVal(ageEl);
      if (birthDateRaw || ageRaw) {
        let derivedAge = null;
        if (isValidIsoBirthDate(birthDateRaw)) {
          push('person.birthDate', birthDateRaw);
          derivedAge = computeAgeFromBirthDate(birthDateRaw);
        }
        let ageInt = null;
        if (derivedAge != null) ageInt = derivedAge;
        else if (ageRaw !== '') {
          const n = parseInt(ageRaw, 10);
          if (Number.isFinite(n) && n >= 0 && n <= 120) ageInt = n;
        }
        if (ageInt != null) push('individualCharacteristics.core.age', ageInt);
      }

      const churnRaw = churnEl ? String(churnEl.value || '').trim() : '';
      const propRaw = propensityEl ? String(propensityEl.value || '').trim() : '';
      const aovRaw = aovEl ? String(aovEl.value || '').trim() : '';
      const npsRaw = npsEl ? String(npsEl.value || '').trim() : '';
      if (churnRaw !== '') push('scoring.churn.churnPrediction', Number(churnRaw));
      if (propRaw !== '') push('scoring.core.propensityScore', Number(propRaw));
      if (npsRaw !== '') push('scoring.npsScore', parseInt(npsRaw, 10));
      if (aovRaw !== '') push('orderProfile.avgOrderSize', Number(aovRaw));

      const preferredRaw = preferredChannelEl ? String(preferredChannelEl.value || '').trim() : '';
      if (preferredRaw !== '') push('consents.marketing.preferred', preferredRaw);

      const lang = languageEl ? trimVal(languageEl) : '';
      if (lang) {
        // Schema-valid root path. The OOTB Profile-class schemas (Generic /
        // Travel / Retail and the per-industry lab schemas) all expose
        // `preferredLanguage` at the streaming root and `_<tenant>.preferredLanguage`
        // via Profile Core v2; profileStreamingCore.mirrorPreferredLanguageDemoSchema
        // copies it to both. The previous push to `preferences.preferredLanguage`
        // landed at root.preferences.preferredLanguage which doesn't exist on
        // any of these schemas (no `preferences` root mixin attached) so AEP
        // silently dropped the language for every NEW-runtime industry
        // (FSI / Media / Sports / Telecom / Retail). Fixed Apr 2026.
        push('preferredLanguage', lang);
        // `personalEmail.language` is kept as a fallback signal for the
        // mirror function; the personalEmail schema itself doesn't actually
        // have a `language` leaf so AEP drops the literal but the mirror
        // already harvested the value above. Safe to leave.
        push('personalEmail.language', lang);
      }

      const gender = genderEl ? trimVal(genderEl) : '';
      if (gender) push('person.gender', gender);

      const loyaltyEnabled = !!(loyaltyEnabledEl && loyaltyEnabledEl.checked);
      if (loyaltyEnabled) {
        const loyaltyID = loyaltyIDEl ? trimVal(loyaltyIDEl) : '';
        if (loyaltyID) {
          push('identification.core.loyaltyId', loyaltyID);
          push('loyalty.loyaltyID', [loyaltyID]);
        }
        const tier = loyaltyTierEl ? trimVal(loyaltyTierEl) : '';
        if (tier) {
          push('loyalty.tier', tier);
          push('loyaltyDetails.level', tier);
        }
        const pts = loyaltyPointsEl ? trimVal(loyaltyPointsEl) : '';
        if (pts !== '') {
          const ptsNum = Number(pts);
          push('loyalty.points', ptsNum);
          push('loyaltyDetails.points', ptsNum);
        }
      }

      try {
        industryHooks.buildUpdates({ push, trimVal });
      } catch (e) {
        warn('industry buildUpdates threw:', e && e.message);
      }

      return updates;
    }

    function applyProfileFindResultToForm(found) {
      if (!found || typeof found !== 'object') return;
      const rows = Array.isArray(found.rows) ? found.rows : null;
      const trim = (v) => (v == null ? '' : String(v).trim());
      const pathLower = (r) => String(r && r.path || '').toLowerCase().replace(/_/g, '.');

      function findBySuffix(suffixes) {
        if (!rows) return '';
        for (const row of rows) {
          const p = pathLower(row);
          for (const s of suffixes) {
            const ss = s.toLowerCase();
            if (p === ss || p.endsWith(`.${ss}`) || p.endsWith(ss)) {
              const v = trim(row.value);
              if (v) return v;
            }
          }
        }
        return '';
      }
      function findByKeywords(...keywords) {
        if (!rows) return '';
        const kws = keywords.map((k) => String(k).toLowerCase());
        for (const row of rows) {
          const p = pathLower(row);
          if (kws.every((k) => p.includes(k))) {
            const v = trim(row.value);
            if (v) return v;
          }
        }
        return '';
      }

      const firstName = findBySuffix(['firstname', 'givenname']);
      const lastName = findBySuffix(['lastname', 'surname', 'familyname']);
      const birthDate = findBySuffix(['person.birthdate', 'birthdate']);
      const ageRaw = findBySuffix(['individualcharacteristics.core.age']) ||
        findByKeywords('individualcharacteristics', 'core', 'age');
      const churn = findByKeywords('churn', 'prediction') || findBySuffix(['churnprediction', 'churnscore']);
      const propensity = findByKeywords('scoring', 'propensity') || findBySuffix(['propensityscore']);
      const nps = findBySuffix(['npsscore']) || findByKeywords('scoring', 'nps');
      const aov = findBySuffix(['avgordersize', 'averageordervalue']);
      const lang = findBySuffix(['preferredlanguage']) ||
        findByKeywords('personalemail', 'language') ||
        findBySuffix(['language', 'locale']);
      const gender = findBySuffix(['gender']) || findByKeywords('person', 'gender');
      const preferredChannel = findBySuffix(['marketing.preferred']);
      const loyaltyId =
        findByKeywords('loyalty', 'loyaltyid') ||
        findByKeywords('identification', 'loyaltyid') ||
        findBySuffix(['loyaltyid']);
      const tier = findByKeywords('loyalty', 'tier') ||
        findByKeywords('loyaltydetails', 'level') ||
        findBySuffix(['tier']);
      const points = findByKeywords('loyalty', 'points') ||
        findByKeywords('loyaltydetails', 'points');

      if (firstName && firstNameEl) firstNameEl.value = firstName;
      if (lastName && lastNameEl) lastNameEl.value = lastName;
      // Birth date / age: prefer the lookup's birthDate (it's the source of
      // truth — we re-derive age from it on every push). When only age is
      // returned, populate the age input but leave birthDate blank (we
      // can't reliably back-derive a specific year/month/day from age).
      if (birthDate && birthDateEl) {
        // Profile API may return ISO with timestamp; trim to date portion.
        const iso = String(birthDate).slice(0, 10);
        if (isValidIsoBirthDate(iso)) {
          birthDateEl.value = iso;
          if (ageEl) {
            const a = computeAgeFromBirthDate(iso);
            if (a != null) ageEl.value = String(a);
          }
        }
      } else if (ageRaw && ageEl) {
        const n = parseInt(String(ageRaw), 10);
        if (Number.isFinite(n)) ageEl.value = String(n);
      }
      if (churn && churnEl) { churnEl.value = churn; syncChurnSlider(); }
      if (propensity && propensityEl) { propensityEl.value = propensity; syncPropensitySlider(); }
      if (nps && npsEl) npsEl.value = nps;
      if (aov && aovEl) { aovEl.value = aov; syncAovSlider(); }
      setSelectValueLoose(languageEl, lang);
      setSelectValueLoose(genderEl, gender);
      setSelectValueLoose(preferredChannelEl, preferredChannel);

      const hasLoyalty = !!(loyaltyId || tier || points);
      if (hasLoyalty && loyaltyEnabledEl) {
        loyaltyEnabledEl.checked = true;
        applyLoyaltyToggleVisibility();
      }
      if (loyaltyId && loyaltyIDEl) loyaltyIDEl.value = loyaltyId;
      setSelectValueLoose(loyaltyTierEl, tier);
      if (points && loyaltyPointsEl) loyaltyPointsEl.value = points;

      try {
        industryHooks.applyFindResult({ findBySuffix, findByKeywords, setSelectValueLoose });
      } catch (e) {
        warn('industry applyFindResult threw:', e && e.message);
      }
    }

    // ---- Find / Update / Generate ----
    function ensureStreamingReady() {
      const s = getStreamingPayload();
      const missing = [];
      if (!s.url) missing.push('Collection URL');
      if (!s.flowId) missing.push('Flow ID');
      if (!s.datasetId) missing.push('Dataset ID');
      if (!s.schemaId) missing.push('Schema $id');
      if (missing.length) {
        if (infraDetailsEl) infraDetailsEl.open = true;
        setMessage(
          messageEl,
          `Streaming connection missing: ${missing.join(', ')}. Run setup or click Fetch URL & Flow ID, then Save connection.`,
          'error'
        );
        return null;
      }
      return s;
    }

    async function lookupProfile() {
      if (!lookupNsEl || !lookupIdentifierEl || !lookupBtn) return;
      const ns = String(lookupNsEl.value || 'email').trim();
      let identifier = trimVal(lookupIdentifierEl);
      if (!identifier && ns === 'email') {
        identifier = getDefaultEmailLookupIdentifier();
        if (identifier) lookupIdentifierEl.value = identifier;
      }
      if (!identifier) {
        setMessage(messageEl, `Enter an ${ns} identifier to look up, or set a base email and try again.`, 'warning');
        lookupIdentifierEl.focus();
        return;
      }
      lookupBtn.disabled = true;
      setMessage(messageEl, `Looking up ${ns}: ${identifier}…`, '');
      try {
        const url = '/api/profile/table' + querySuffix({ identifier, namespace: ns });
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(messageEl, data.error || `Lookup failed (HTTP ${res.status}).`, 'error');
          return;
        }
        const found =
          (data && data.found === true) ||
          (data && (data.entity || data.profile)) ||
          (Array.isArray(data && data.entities) && data.entities.length) ||
          (Array.isArray(data && data.profiles) && data.profiles.length) ||
          (Array.isArray(data && data.results) && data.results.length);
        if (!found) {
          setMessage(
            messageEl,
            `No profile found for ${ns}: ${identifier} in this sandbox. Use Generate / Update to create one.`,
            ''
          );
          return;
        }
        applyProfileFindResultToForm(data);
        if (ns === 'email') persistLastStreamed(identifier, null);
        if (typeof window.addRecentIdentifier === 'function') {
          try { window.addRecentIdentifier(identifier, ns); } catch (_) {}
        }
        setMessage(messageEl, `Loaded profile for ${ns}: ${identifier}. Edit fields then click Update profile.`, 'success');
      } catch (e) {
        setMessage(messageEl, e.message || 'Network error', 'error');
      } finally {
        lookupBtn.disabled = false;
      }
    }

    async function postProfileUpdate(email, updates, streaming, dryRun) {
      const sb = getSandboxName();
      const body = {
        email,
        sandbox: sb || undefined,
        updates,
        streaming,
        ...(dryRun ? { dryRun: true } : {}),
      };
      const clientReq = {
        method: 'POST',
        url: `${window.location.origin}/api/profile/update`,
        headers: { 'Content-Type': 'application/json' },
        body,
      };
      if (debugEl && debugClientReqEl) {
        debugEl.hidden = false;
        debugClientReqEl.textContent = JSON.stringify(clientReq, null, 2);
        if (debugStatusEl) debugStatusEl.textContent = '…';
        if (debugResponseEl) debugResponseEl.textContent = '';
      }
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (debugEl) {
        if (debugStatusEl) debugStatusEl.textContent = `${res.status} ${res.ok ? 'OK' : ''}`;
        if (debugResponseEl) debugResponseEl.textContent = JSON.stringify(data, null, 2);
      }
      return { res, data };
    }

    async function updateProfile() {
      const email = getCurrentScaledEmail();
      if (!email) {
        setMessage(messageEl, 'Enter a base email first.', 'warning');
        baseEmailEl.focus();
        return;
      }
      const streaming = ensureStreamingReady();
      if (!streaming) return;
      const updates = buildUpdatesFromForm();
      if (!updates.length) {
        setMessage(messageEl, `No fields to update — fill at least one Customer Analytics or ${displayName} field.`, 'warning');
        return;
      }
      updateProfileBtn.disabled = true;
      setMessage(messageEl, `Updating ${email}…`, '');
      try {
        const dryRun = !!(dryRunEl && dryRunEl.checked);
        const { res, data } = await postProfileUpdate(email, updates, streaming, dryRun);
        if (!res.ok) {
          setMessage(messageEl, data.error || `Update failed (HTTP ${res.status}).`, 'error');
          return;
        }
        if (!dryRun) {
          const n = parseInt(counterEl.value || '1', 10) || 1;
          recordGenerated(email, n);
          persistLastStreamed(email, n);
        }
        const okMsg = data.message || `Update sent for ${email}.`;
        setMessage(messageEl, okMsg + (dryRun ? ' (dry run)' : ''), 'success');
      } catch (e) {
        setMessage(messageEl, e.message || 'Network error', 'error');
      } finally {
        updateProfileBtn.disabled = false;
      }
    }

    async function generateProfiles() {
      const base = trimVal(baseEmailEl);
      if (!base || !base.includes('@')) {
        setMessage(messageEl, 'Enter a valid base email like apalmer@adobetest.com first.', 'warning');
        baseEmailEl.focus();
        return;
      }
      const streaming = ensureStreamingReady();
      if (!streaming) return;
      const count = Math.max(1, Math.min(100, parseInt(generateCountEl.value || '1', 10) || 1));
      const dryRun = !!(dryRunEl && dryRunEl.checked);

      generateBtn.disabled = true;
      setMessage(messageEl, `Generating ${count} ${displayName} profile${count === 1 ? '' : 's'}…`, '');
      let successCount = 0;
      let lastError = '';
      let lastEmail = '';
      try {
        for (let i = 0; i < count; i++) {
          const n = parseInt(counterEl.value || '1', 10) || 1;
          const email = scaleEmail(base, n, new Date());
          if (!email) {
            lastError = 'Could not scale email — invalid base format.';
            break;
          }
          lastEmail = email;
          try {
            applyRandomCustomerPersonaForGenerate();
            const updates = buildUpdatesFromForm();
            if (!updates.length) {
              lastError = 'Could not build profile fields after randomization — check form configuration.';
              break;
            }
            const { res, data } = await postProfileUpdate(email, updates, streaming, dryRun);
            if (!res.ok) {
              lastError = data.error || `HTTP ${res.status}`;
              break;
            }
            successCount += 1;
            if (!dryRun) {
              recordGenerated(email, n, snapshotForm());
              persistLastStreamed(email, n);
            }
          } catch (e) {
            lastError = e.message || 'Network error';
            break;
          }
          bumpCounter();
        }
        if (successCount === count && !lastError) {
          setMessage(
            messageEl,
            `Generated ${successCount} ${displayName} profile${successCount === 1 ? '' : 's'}${dryRun ? ' (dry run)' : ''}. Latest: ${lastEmail}.`,
            'success'
          );
        } else if (successCount > 0) {
          setMessage(
            messageEl,
            `Generated ${successCount}/${count} ${displayName} profile${count === 1 ? '' : 's'} before stopping. Last error: ${lastError}`,
            'warning'
          );
        } else {
          setMessage(messageEl, `Generate failed: ${lastError || 'unknown error'}.`, 'error');
        }
      } finally {
        generateBtn.disabled = false;
      }
    }

    // ---- Toggle UX (loyalty + industry-specific toggles) ----
    function applyLoyaltyToggleVisibility() {
      const enabled = !!(loyaltyEnabledEl && loyaltyEnabledEl.checked);
      if (loyaltyFieldsEl) loyaltyFieldsEl.hidden = !enabled;
      if (loyaltyEnabledEl) loyaltyEnabledEl.setAttribute('aria-expanded', enabled ? 'true' : 'false');
    }
    function applyIndustryToggle(toggle) {
      const checkbox = $(toggle.checkboxId);
      const fields = $(toggle.fieldsId);
      const enabled = !!(checkbox && checkbox.checked);
      if (fields) fields.hidden = !enabled;
      if (checkbox) checkbox.setAttribute('aria-expanded', enabled ? 'true' : 'false');
    }
    function applyAllIndustryToggles() {
      industryToggles.forEach(applyIndustryToggle);
    }

    // ---- Recently-generated picker (shared storage) ----
    function readRecent() {
      return Shared.readRecent(getSandboxName(), trimVal(baseEmailEl));
    }

    function recordGenerated(scaledEmail, n, snapshotOverride) {
      if (!scaledEmail) return;
      const snap =
        snapshotOverride && typeof snapshotOverride === 'object' ? snapshotOverride : snapshotForm();
      Shared.pushRecent(getSandboxName(), trimVal(baseEmailEl), {
        scaledEmail,
        n: Number.isFinite(n) ? n : null,
        ts: Date.now(),
        snapshot: snap,
      });
      renderRecent();
      if (typeof window.addRecentIdentifier === 'function') {
        try { window.addRecentIdentifier(scaledEmail, 'email'); } catch (_) {}
      }
    }

    function summariseSnapshot(snap) {
      if (!snap || typeof snap !== 'object') return '';
      const parts = [];
      if (snap.firstName || snap.lastName) {
        const name = `${snap.firstName || ''} ${snap.lastName || ''}`.trim();
        // Show age in parentheses next to the identity when present so
        // operators can scan recently-generated cohorts at a glance.
        parts.push(snap.age ? `${name} (${snap.age})` : name);
      }
      if (snap.gender) parts.push(snap.gender);

      let industryTail = '';
      try {
        industryTail = String(industryHooks.summarise(snap) || '').trim();
      } catch (e) {
        warn('industry summarise threw:', e && e.message);
      }
      if (industryTail) parts.push(industryTail);

      if (snap.loyalty && snap.loyalty.enabled) {
        const lp = [];
        if (snap.loyalty.tier) lp.push(snap.loyalty.tier);
        if (snap.loyalty.points) lp.push(`${snap.loyalty.points} pts`);
        parts.push(`Loyalty: ${lp.join(' · ') || 'on'}`);
      }
      if (snap.nps) parts.push(`NPS ${snap.nps}`);
      if (snap.aov) parts.push(`AOV $${snap.aov}`);
      return parts.join(' · ');
    }

    function formatRelative(ts) {
      if (!ts) return '';
      const diffMs = Date.now() - ts;
      const sec = Math.round(diffMs / 1000);
      if (sec < 60) return `${sec}s ago`;
      const min = Math.round(sec / 60);
      if (min < 60) return `${min}m ago`;
      const hr = Math.round(min / 60);
      return `${hr}h ago`;
    }

    function renderRecent() {
      const list = readRecent();
      if (!recentPickerEl) return;
      recentPickerEl.hidden = list.length === 0;
      if (recentCountLabelEl) recentCountLabelEl.textContent = `Recently generated (${list.length})`;
      if (recentSelectEl) {
        const prev = recentSelectEl.value;
        recentSelectEl.innerHTML = '<option value="">— pick to load —</option>';
        list.forEach((entry) => {
          const opt = document.createElement('option');
          opt.value = entry.scaledEmail;
          const tail = summariseSnapshot(entry.snapshot);
          opt.textContent = tail ? `${entry.scaledEmail} — ${tail}` : entry.scaledEmail;
          recentSelectEl.appendChild(opt);
        });
        if (list.some((e) => e.scaledEmail === prev)) recentSelectEl.value = prev;
      }
      if (recentListBodyEl) {
        recentListBodyEl.innerHTML = '';
        list.forEach((entry) => {
          const tr = document.createElement('tr');
          const tdEmail = document.createElement('td');
          tdEmail.textContent = entry.scaledEmail;
          const tdTs = document.createElement('td');
          tdTs.textContent = formatRelative(entry.ts);
          tdTs.title = new Date(entry.ts).toISOString();
          const tdSummary = document.createElement('td');
          tdSummary.textContent = summariseSnapshot(entry.snapshot);
          const tdAction = document.createElement('td');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-link';
          btn.textContent = 'Load';
          btn.addEventListener('click', () => loadRecentSnapshot(entry));
          tdAction.appendChild(btn);
          tr.append(tdEmail, tdTs, tdSummary, tdAction);
          recentListBodyEl.appendChild(tr);
        });
      }
    }

    function loadRecentSnapshot(entry) {
      if (!entry || !entry.snapshot) return;
      const s = entry.snapshot;
      if (firstNameEl) firstNameEl.value = s.firstName || '';
      if (lastNameEl) lastNameEl.value = s.lastName || '';
      if (birthDateEl) birthDateEl.value = s.birthDate || '';
      if (ageEl) ageEl.value = s.age || '';
      if (genderEl) genderEl.value = s.gender || '';
      if (churnEl && s.churn !== '') { churnEl.value = String(s.churn); syncChurnSlider(); }
      if (propensityEl && s.propensity !== '') { propensityEl.value = String(s.propensity); syncPropensitySlider(); }
      if (npsEl) npsEl.value = s.nps || '';
      if (aovEl && s.aov !== '') { aovEl.value = String(s.aov); syncAovSlider(); }
      if (preferredChannelEl) preferredChannelEl.value = s.preferredChannel || '';
      if (languageEl) languageEl.value = s.language || '';
      if (loyaltyEnabledEl) loyaltyEnabledEl.checked = !!(s.loyalty && s.loyalty.enabled);
      if (loyaltyIDEl) loyaltyIDEl.value = (s.loyalty && s.loyalty.id) || '';
      if (loyaltyTierEl) loyaltyTierEl.value = (s.loyalty && s.loyalty.tier) || '';
      if (loyaltyPointsEl) loyaltyPointsEl.value = (s.loyalty && s.loyalty.points) || '';
      applyLoyaltyToggleVisibility();

      try {
        industryHooks.loadFromSnapshot(s.industry || {}, { setSelectValueLoose });
      } catch (e) {
        warn('industry loadFromSnapshot threw:', e && e.message);
      }
      applyAllIndustryToggles();

      if (counterEl && Number.isFinite(entry.n)) {
        counterEl.value = String(entry.n);
        persistCounter(entry.n);
        updateEmailPreview();
      }
      persistLastStreamed(entry.scaledEmail, entry.n);
      setMessage(messageEl, `Loaded ${entry.scaledEmail}. Edit fields then click Update profile, or Generate to create a new profile after this one.`, 'success');
    }

    // ---- Wire events ----
    if (checkInfraBtn) checkInfraBtn.addEventListener('click', checkInfra);
    // Combined provisioning button (May 2026 consolidation). The legacy
    // per-step buttons are intentionally removed from the rendered HTML
    // but the handlers stay defensive so older markup keeps functioning.
    if (stepRunAllBtn) stepRunAllBtn.addEventListener('click', runProvisioningStepsCombined);
    if (stepCreateSchemaBtn) stepCreateSchemaBtn.addEventListener('click', () => runStep('createSchema'));
    if (stepAttachFgBtn) stepAttachFgBtn.addEventListener('click', () => runStep('attachFieldGroups'));
    if (stepCreateDatasetBtn) stepCreateDatasetBtn.addEventListener('click', () => runStep('createDataset'));
    if (stepHttpFlowBtn) stepHttpFlowBtn.addEventListener('click', () => runStep('httpFlow'));

    if (loadFromFirebaseBtn) loadFromFirebaseBtn.addEventListener('click', () => loadConnectionFromFirestore(false));
    if (fetchFlowFromAepBtn) fetchFlowFromAepBtn.addEventListener('click', fetchFlowFromAep);
    if (saveStreamBtn) {
      saveStreamBtn.addEventListener('click', async () => {
        saveStreamBtn.disabled = true;
        try {
          const ok = await saveConnectionToFirestore();
          if (ok) showInfraMessage('Connection saved for this sandbox.', 'success');
        } finally {
          saveStreamBtn.disabled = false;
        }
      });
    }

    if (baseEmailEl) {
      baseEmailEl.addEventListener('input', () => {
        Shared.writeBaseEmail(getSandboxName(), baseEmailEl.value || '');
        loadCounterForCurrentContext();
      });
      baseEmailEl.addEventListener('change', loadCounterForCurrentContext);
    }
    if (counterEl) {
      counterEl.addEventListener('input', () => {
        const n = parseInt(counterEl.value || '1', 10) || 1;
        persistCounter(n);
        updateEmailPreview();
      });
    }
    if (resetCounterBtn) {
      resetCounterBtn.addEventListener('click', () => {
        counterEl.value = '1';
        persistCounter(1);
        updateEmailPreview();
      });
    }

    if (churnEl) churnEl.addEventListener('input', syncChurnSlider);
    if (propensityEl) propensityEl.addEventListener('input', syncPropensitySlider);
    if (aovEl) aovEl.addEventListener('input', syncAovSlider);

    // Birth date → age sync. Whenever the operator picks a new date (or the
    // input loses focus with a value) recompute age and write it back to
    // the age input. Keeping the two consistent ensures buildUpdatesFromForm
    // doesn't accidentally stream a stale age alongside an updated birthDate.
    function applyBirthDateChange() {
      if (!birthDateEl) return;
      const iso = trimVal(birthDateEl);
      if (!iso) return;
      if (!isValidIsoBirthDate(iso)) return;
      const a = computeAgeFromBirthDate(iso);
      if (ageEl && a != null) ageEl.value = String(a);
    }
    if (birthDateEl) {
      birthDateEl.addEventListener('change', applyBirthDateChange);
      birthDateEl.addEventListener('blur', applyBirthDateChange);
    }
    if (loyaltyRandomBtn && loyaltyTierEl && loyaltyPointsEl) {
      loyaltyRandomBtn.addEventListener('click', () => {
        const tier = trimVal(loyaltyTierEl);
        loyaltyPointsEl.value = String(randomLoyaltyPointsForTier(tier));
      });
    }

    // Wire the "🎲 Randomize" mini-buttons next to each analytics slider.
    const randomizeButtons = document.querySelectorAll(`#${ids.profilePanel || ''} .analytics-randomize`);
    randomizeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const targetEl = $(targetId);
        if (targetEl) randomizeSliderControl(targetEl);
      });
    });

    if (loyaltyEnabledEl) loyaltyEnabledEl.addEventListener('change', applyLoyaltyToggleVisibility);
    industryToggles.forEach((toggle) => {
      const checkbox = $(toggle.checkboxId);
      if (checkbox) checkbox.addEventListener('change', () => applyIndustryToggle(toggle));
    });

    if (recentLoadBtn && recentSelectEl) {
      recentLoadBtn.addEventListener('click', () => {
        const v = recentSelectEl.value;
        if (!v) {
          setMessage(messageEl, 'Pick a generated profile from the dropdown first.', 'warning');
          return;
        }
        const entry = readRecent().find((e) => e && e.scaledEmail === v);
        if (entry) loadRecentSnapshot(entry);
      });
    }
    if (baseEmailEl) {
      baseEmailEl.addEventListener('input', renderRecent);
    }

    if (lookupBtn) lookupBtn.addEventListener('click', lookupProfile);
    if (lookupIdentifierEl) {
      lookupIdentifierEl.addEventListener('focus', () => {
        if (!trimVal(lookupIdentifierEl) && lookupNsEl && lookupNsEl.value === 'email') {
          const scaled = getDefaultEmailLookupIdentifier();
          if (scaled) lookupIdentifierEl.value = scaled;
        }
      });
      lookupIdentifierEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          lookupProfile();
        }
      });
    }
    if (updateProfileBtn) updateProfileBtn.addEventListener('click', updateProfile);
    if (generateBtn) generateBtn.addEventListener('click', generateProfiles);

    function onSandboxChange() {
      // Reset the auto-discover cache so the new sandbox gets one fresh
      // attempt; the cache exists to avoid re-hitting AEP on panel-show /
      // firestore-reload cycles within a single sandbox, not to suppress
      // discovery across sandboxes.
      _autoDiscoverAttempted.clear();
      clearStreamingFields();
      applyConfiguredCollapseState();
      loadConnectionFromFirestore(true);
      loadBaseEmailForCurrentSandbox();
      loadCounterForCurrentContext();
      renderRecent();
    }
    if (sandboxSelect) sandboxSelect.addEventListener('change', onSandboxChange);
    window.addEventListener('aep-global-sandbox-change', onSandboxChange);

    window.addEventListener(panelShownEvent, () => {
      renderRecent();
      applyLoyaltyToggleVisibility();
      applyAllIndustryToggles();
      applyConfiguredCollapseState();
      loadCounterForCurrentContext();
      // Panel just became visible — kick the sandbox-driven Schema $id /
      // Dataset ID auto-discover. No-op when fields are already populated
      // (Firestore-loaded values, hand-typed values, or a previous discover
      // attempt) thanks to the per-sandbox cache + emptiness guards.
      autoDiscoverInfraFromSandbox();
    });

    // ---- Initial state ----
    loadBaseEmailForCurrentSandbox();
    if (churnEl) syncChurnSlider();
    if (propensityEl) syncPropensitySlider();
    if (aovEl) syncAovSlider();
    applyLoyaltyToggleVisibility();
    applyAllIndustryToggles();
    loadCounterForCurrentContext();
    updateEmailPreview();
    renderRecent();
    setTimeout(() => loadConnectionFromFirestore(true), 800);
  }

  window.AepProfileGenIndustry = {
    bind,
    // Cross-industry helpers (audit §10) — exposed so per-industry modules
    // can compose them without re-implementing the math, and so the
    // verification harness at /tmp/verify-audit-followups.mjs can reach
    // them via the same global the browser uses.
    helpers: {
      weightedBool,
      randomBellBetween,
      pickOneOf,
      randomizeFlagToggles,
      deriveFromBand,
      dateFromRecencyBand,
      safeSelectValues,
      randomBetween,
      randomPick,
    },
  };
})();
