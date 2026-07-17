/**
 * Profile Generation — shared cross-industry helpers.
 *
 * Owns the email scaler, the daily per-(sandbox, base email) counter, the
 * last-streamed cache, the recently-generated picker, and the per-sandbox
 * base email / base mobile persistence used by every industry-specific profile
 * generator module on this page (Generic, Travel, and industry-runtime panels).
 *
 * Exposes a single global `window.AepProfileGenShared` so each industry
 * module reads/writes the SAME counter and recent list — guaranteeing that
 * Generic and Travel can never produce the same scaled email twice in one
 * day for the same sandbox + base email.
 *
 * STORAGE KEY POLICY
 * ------------------
 * All keys live under the `profileGen` prefix:
 *
 *   profileGenBaseEmail:<sandbox>
 *   profileGenBaseMobile:<sandbox>
 *   profileGenCounter:<sandbox>:<baseLower>:<DDMMYYYY>
 *   profileGenLastStreamed:<sandbox>:<baseLower>:<DDMMYYYY>
 *   profileGenRecent:<sandbox>:<baseLower>:<DDMMYYYY>
 *   profileGenMigrationDone:v1
 *   profileGenMarkTestProfile:<industryKey>   — '1' / '0' for "Mark as AEP test profile" (default ON when unset)
 *
 * Pre-shared release the Generic generator wrote keys under the
 * `genericProfile` prefix. The first time this module loads we copy any
 * `genericProfile*` key to its `profileGen*` equivalent (only when the
 * destination is empty), then delete the legacy key, then flag
 * `profileGenMigrationDone:v1` so we never run again on the same browser.
 */

(function () {
  'use strict';

  if (window.AepProfileGenShared) return;

  const PREFIX_LEGACY = 'genericProfile';
  const PREFIX_NEW = 'profileGen';
  const MIGRATION_DONE_KEY = 'profileGenMigrationDone:v1';
  const RECENT_LIMIT = 20;

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
  }

  /**
   * One-time migration: rename every `genericProfile<rest>` localStorage
   * key to `profileGen<rest>`. Idempotent (uses MIGRATION_DONE_KEY guard);
   * never overwrites a populated destination (newer write wins).
   */
  function migrateLegacyGenericKeysOnce() {
    if (safeGet(MIGRATION_DONE_KEY) === '1') return;
    let n = 0;
    try {
      const legacyKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(PREFIX_LEGACY) === 0) legacyKeys.push(k);
      }
      legacyKeys.forEach((legacy) => {
        const rest = legacy.slice(PREFIX_LEGACY.length);
        const fresh = PREFIX_NEW + rest;
        const legacyVal = safeGet(legacy);
        if (legacyVal == null) return;
        const existing = safeGet(fresh);
        if (existing == null || existing === '') {
          if (safeSet(fresh, legacyVal)) n += 1;
        }
        safeRemove(legacy);
      });
    } catch (_) { /* ignore — migration is best-effort */ }
    safeSet(MIGRATION_DONE_KEY, '1');
    if (n) {
      try { console.info(`[AepProfileGenShared] Migrated ${n} legacy genericProfile* keys → profileGen*.`); } catch (_) {}
    }
  }

  // ---------- Date / email scaler ----------

  function todayYmd(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  /**
   * Scale a base email to a plus-addressed pattern with today's DDMMYYYY and a counter N.
   * Existing plus-tags on the local part are preserved (we append after them with `-N`).
   *
   *   apalmer@adobetest.com               → apalmer+30042026-1@adobetest.com
   *   adamp.adobedemo+demo@gmail.com      → adamp.adobedemo+demo-30042026-1@gmail.com
   */
  function scaleEmail(base, n, date) {
    const s = String(base || '').trim();
    if (!s.includes('@')) return '';
    const at = s.lastIndexOf('@');
    const local = s.slice(0, at);
    const domain = s.slice(at + 1);
    if (!local || !domain) return '';
    const d = date instanceof Date ? date : new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const counter = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    if (local.includes('+')) {
      return `${local}-${dd}${mm}${yyyy}-${counter}@${domain}`;
    }
    return `${local}+${dd}${mm}${yyyy}-${counter}@${domain}`;
  }

  /**
   * Resolve which email Update profile should stream to.
   * Prefers an explicit lookup identifier, then last streamed/looked-up email,
   * then the current counter slot (generate-next).
   */
  function resolveUpdateTargetEmail(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const ns = String(o.lookupNamespace || 'email').trim();
    if (ns === 'email') {
      const fromLookup = String(o.lookupIdentifier || '').trim();
      if (fromLookup && fromLookup.includes('@')) return fromLookup;
    }
    const last = typeof o.readLastStreamed === 'function' ? o.readLastStreamed() : null;
    if (last && last.email) return last.email;
    return typeof o.getCurrentScaledEmail === 'function' ? o.getCurrentScaledEmail() : '';
  }

  // ---------- Storage key builders ----------

  function normSandbox(sandbox) {
    return String(sandbox || '').trim() || 'default';
  }

  function normBaseEmail(baseEmail) {
    return String(baseEmail || '').trim().toLowerCase() || 'no-email';
  }

  function baseEmailStorageKey(sandbox) {
    return `${PREFIX_NEW}BaseEmail:${normSandbox(sandbox)}`;
  }

  function baseMobileStorageKey(sandbox) {
    return `${PREFIX_NEW}BaseMobile:${normSandbox(sandbox)}`;
  }

  function counterStorageKey(sandbox, baseEmail, date) {
    return `${PREFIX_NEW}Counter:${normSandbox(sandbox)}:${normBaseEmail(baseEmail)}:${todayYmd(date)}`;
  }

  function lastStreamedKey(sandbox, baseEmail, date) {
    return `${PREFIX_NEW}LastStreamed:${normSandbox(sandbox)}:${normBaseEmail(baseEmail)}:${todayYmd(date)}`;
  }

  function recentKey(sandbox, baseEmail, date) {
    return `${PREFIX_NEW}Recent:${normSandbox(sandbox)}:${normBaseEmail(baseEmail)}:${todayYmd(date)}`;
  }

  function markTestProfilePreferenceKey(industryKey) {
    const k = String(industryKey || 'generic').trim().toLowerCase() || 'generic';
    return `${PREFIX_NEW}MarkTestProfile:${k}`;
  }

  /** @returns {boolean} Default true when key missing (lab test data). */
  function readMarkTestProfilePreference(industryKey) {
    const v = safeGet(markTestProfilePreferenceKey(industryKey));
    if (v === '0' || v === 'false' || v === 'off') return false;
    return true;
  }

  function writeMarkTestProfilePreference(industryKey, enabled) {
    safeSet(markTestProfilePreferenceKey(industryKey), enabled ? '1' : '0');
  }

  // ---------- Base email persistence ----------

  function readBaseEmail(sandbox) {
    const v = safeGet(baseEmailStorageKey(sandbox));
    return v == null ? '' : v;
  }

  function writeBaseEmail(sandbox, value) {
    safeSet(baseEmailStorageKey(sandbox), String(value || ''));
  }

  // ---------- Base mobile persistence (trimmed, same sandbox scope as base email) ----------

  function readBaseMobile(sandbox) {
    const v = safeGet(baseMobileStorageKey(sandbox));
    return v == null ? '' : String(v).trim();
  }

  function writeBaseMobile(sandbox, value) {
    safeSet(baseMobileStorageKey(sandbox), String(value || '').trim());
  }

  // ---------- Counter ----------

  function readCounter(sandbox, baseEmail, date) {
    const raw = safeGet(counterStorageKey(sandbox, baseEmail, date));
    const n = raw != null ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function persistCounter(sandbox, baseEmail, n, date) {
    const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    safeSet(counterStorageKey(sandbox, baseEmail, date), String(v));
    return v;
  }

  /** Read current N, persist N+1, return the NEW value (next slot). */
  function incrementCounter(sandbox, baseEmail, date) {
    const cur = readCounter(sandbox, baseEmail, date);
    const next = cur + 1;
    persistCounter(sandbox, baseEmail, next, date);
    return next;
  }

  // ---------- Last streamed ----------

  function persistLastStreamed(sandbox, baseEmail, email, n, date) {
    const e = String(email || '').trim();
    if (!e.includes('@')) return;
    safeSet(
      lastStreamedKey(sandbox, baseEmail, date),
      JSON.stringify({ email: e, n: Number.isFinite(n) ? n : null, ts: Date.now() }),
    );
  }

  function readLastStreamed(sandbox, baseEmail, date) {
    const raw = safeGet(lastStreamedKey(sandbox, baseEmail, date));
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      if (o && typeof o.email === 'string' && o.email.includes('@')) return o;
    } catch (_) { /* ignore */ }
    return null;
  }

  // ---------- Recent picker ----------

  function readRecent(sandbox, baseEmail, date) {
    const raw = safeGet(recentKey(sandbox, baseEmail, date));
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeRecent(sandbox, baseEmail, arr, date) {
    const list = Array.isArray(arr) ? arr.slice(0, RECENT_LIMIT) : [];
    safeSet(recentKey(sandbox, baseEmail, date), JSON.stringify(list));
  }

  /** Human-readable labels for recently-generated industry keys. */
  const INDUSTRY_DISPLAY_NAMES = {
    generic: 'Generic',
    travel: 'Travel',
    fsi: 'FSI',
    telecom: 'Telecom',
    retail: 'Retail',
    media: 'Media',
    sports: 'Sports',
  };

  function industryDisplayNameForKey(key) {
    const k = String(key || '').trim().toLowerCase();
    if (!k) return '';
    if (INDUSTRY_DISPLAY_NAMES[k]) return INDUSTRY_DISPLAY_NAMES[k];
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  /**
   * Resolve the industry label for a recent-list row (local or Firestore-synced).
   * Older entries without industry metadata return "—".
   */
  function formatRecentIndustryLabel(entry) {
    if (!entry || typeof entry !== 'object') return '—';
    if (entry.industryDisplayName) return String(entry.industryDisplayName);
    const key = entry.industryKey || entry.industry;
    if (key) {
      const label = industryDisplayNameForKey(key);
      return label || '—';
    }
    return '—';
  }

  function resolveRecentEntryIndustryKey(entry) {
    if (!entry || typeof entry !== 'object') return '';
    return String(entry.industryKey || entry.industry || '').trim().toLowerCase();
  }

  function filterRecentByIndustry(list, filterKey) {
    const fk = String(filterKey || '').trim().toLowerCase();
    if (!fk) return Array.isArray(list) ? list : [];
    return (Array.isArray(list) ? list : []).filter((entry) => resolveRecentEntryIndustryKey(entry) === fk);
  }

  /** Unique industry keys present in `list`, sorted by canonical display order. */
  function collectRecentIndustryOptions(list) {
    const seen = new Map();
    (Array.isArray(list) ? list : []).forEach((entry) => {
      const key = resolveRecentEntryIndustryKey(entry);
      if (!key) return;
      const label = formatRecentIndustryLabel(entry);
      if (label && label !== '—') seen.set(key, label);
      else if (!seen.has(key)) seen.set(key, industryDisplayNameForKey(key) || key);
    });
    const order = Object.keys(INDUSTRY_DISPLAY_NAMES);
    return Array.from(seen.entries())
      .sort((a, b) => {
        const ia = order.indexOf(a[0]);
        const ib = order.indexOf(b[0]);
        if (ia === -1 && ib === -1) return a[1].localeCompare(b[1]);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
      .map(([key, label]) => ({ key, label }));
  }

  function recentIndustryFilterStorageKey(sandbox, baseEmail) {
    return `${PREFIX_NEW}:recent-industry-filter:${String(sandbox || '').trim()}:${String(baseEmail || '').trim().toLowerCase()}`;
  }

  function readRecentIndustryFilter(sandbox, baseEmail) {
    try {
      return sessionStorage.getItem(recentIndustryFilterStorageKey(sandbox, baseEmail)) || '';
    } catch (_) {
      return '';
    }
  }

  function writeRecentIndustryFilter(sandbox, baseEmail, filterKey) {
    try {
      const storageKey = recentIndustryFilterStorageKey(sandbox, baseEmail);
      const fk = String(filterKey || '').trim();
      if (!fk) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, fk);
    } catch (_) { /* ignore */ }
  }

  function populateRecentIndustryFilterSelect(filterEl, list, sandbox, baseEmail) {
    if (!filterEl) return '';
    const prev = filterEl.value || readRecentIndustryFilter(sandbox, baseEmail);
    const options = collectRecentIndustryOptions(list);
    filterEl.innerHTML = '<option value="">All industries</option>';
    options.forEach(({ key, label }) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      filterEl.appendChild(opt);
    });
    if (prev && options.some((o) => o.key === prev)) {
      filterEl.value = prev;
      return prev;
    }
    filterEl.value = '';
    return '';
  }

  /**
   * Render the recently-generated picker (dropdown + expandable table).
   * Applies the industry filter to both views and updates the filtered count.
   */
  function renderRecentPicker(opts) {
    const o = opts || {};
    const fullList = Array.isArray(o.list) ? o.list : [];
    const {
      recentPickerEl,
      recentSelectEl,
      recentListBodyEl,
      recentCountLabelEl,
      recentIndustryFilterEl,
      sandbox,
      baseEmail,
      formatRelative,
      summariseSnapshot,
      onLoadEntry,
    } = o;

    if (!recentPickerEl) return;

    recentPickerEl.hidden = fullList.length === 0;

    const filterKey = populateRecentIndustryFilterSelect(
      recentIndustryFilterEl,
      fullList,
      sandbox,
      baseEmail
    );
    const list = filterRecentByIndustry(fullList, filterKey);

    if (recentCountLabelEl) {
      recentCountLabelEl.textContent = `Recently generated (${list.length})`;
    }

    if (recentSelectEl) {
      const prev = recentSelectEl.value;
      recentSelectEl.innerHTML = '<option value="">— pick to load —</option>';
      list.forEach((entry) => {
        const opt = document.createElement('option');
        opt.value = entry.scaledEmail;
        let tail = typeof summariseSnapshot === 'function' ? summariseSnapshot(entry.snapshot) : '';
        if (!tail && window.AepProfileGenRecentSync) {
          tail = window.AepProfileGenRecentSync.summariseEntry(entry);
        }
        const industryLabel = formatRecentIndustryLabel(entry);
        const industryPrefix = industryLabel !== '—' ? `[${industryLabel}] ` : '';
        opt.textContent = industryPrefix + (tail ? `${entry.scaledEmail} — ${tail}` : entry.scaledEmail);
        recentSelectEl.appendChild(opt);
      });
      if (list.some((e) => e && e.scaledEmail === prev)) recentSelectEl.value = prev;
      else recentSelectEl.value = '';
    }

    if (recentListBodyEl) {
      recentListBodyEl.innerHTML = '';
      list.forEach((entry) => {
        const tr = document.createElement('tr');
        const tdEmail = document.createElement('td');
        tdEmail.textContent = entry.scaledEmail;
        const tdTs = document.createElement('td');
        tdTs.textContent = typeof formatRelative === 'function' ? formatRelative(entry.ts) : '';
        if (entry.ts) tdTs.title = new Date(entry.ts).toISOString();
        const tdIndustry = document.createElement('td');
        tdIndustry.className = 'gen-recent-list__industry';
        tdIndustry.textContent = formatRecentIndustryLabel(entry);
        const tdSummary = document.createElement('td');
        let rowSummary = typeof summariseSnapshot === 'function' ? summariseSnapshot(entry.snapshot) : '';
        if (!rowSummary && window.AepProfileGenRecentSync) {
          rowSummary = window.AepProfileGenRecentSync.summariseEntry(entry);
        }
        tdSummary.textContent = rowSummary;
        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-link';
        btn.textContent = 'Load';
        btn.addEventListener('click', () => {
          if (typeof onLoadEntry === 'function') onLoadEntry(entry);
        });
        tdAction.appendChild(btn);
        tr.append(tdEmail, tdTs, tdIndustry, tdSummary, tdAction);
        recentListBodyEl.appendChild(tr);
      });
    }
  }

  /**
   * Push a new entry to the front of the recent list (deduping by `scaledEmail`).
   * Caller passes a fully-formed entry like `{ scaledEmail, n, ts, snapshot, industryKey }`.
   */
  function pushRecent(sandbox, baseEmail, entry, date) {
    if (!entry || !entry.scaledEmail) return;
    const list = readRecent(sandbox, baseEmail, date);
    const filtered = list.filter((e) => e && e.scaledEmail !== entry.scaledEmail);
    writeRecent(sandbox, baseEmail, [entry, ...filtered], date);
  }

  /**
   * Show "Save connection (Firebase)" only after the architect manually edits
   * a streaming field and the form no longer matches the last Firebase sync.
   * Fetch-from-AEP auto-save and Load from Firebase call markSynced(); wizard /
   * auto-discover fills do not (userEdited stays false).
   */
  function createStreamConnectionSaveUi(opts) {
    const saveBtn = opts && opts.saveBtn;
    const getPayload = opts && opts.getPayload;
    const fieldEls = (opts && opts.fieldEls) || [];

    let savedSnapshot = null;
    let userEdited = false;

    function payloadKey(payload) {
      const p = payload || (typeof getPayload === 'function' ? getPayload() : {});
      return JSON.stringify({
        url: String(p.url || '').trim(),
        flowId: String(p.flowId || '').trim(),
        flowName: String(p.flowName || '').trim(),
        datasetId: String(p.datasetId || '').trim(),
        schemaId: String(p.schemaId || '').trim(),
        xdmKey: String(p.xdmKey || '_demoemea').trim(),
      });
    }

    function syncSaveButtonVisibility() {
      if (!saveBtn) return;
      const show = userEdited && payloadKey() !== (savedSnapshot == null ? '' : savedSnapshot);
      saveBtn.hidden = !show;
    }

    function markSynced(payload) {
      savedSnapshot = payloadKey(payload);
      userEdited = false;
      syncSaveButtonVisibility();
    }

    function resetSyncState() {
      savedSnapshot = null;
      userEdited = false;
      syncSaveButtonVisibility();
    }

    function wire() {
      if (saveBtn) saveBtn.hidden = true;
      fieldEls.filter(Boolean).forEach((el) => {
        el.addEventListener('input', () => {
          userEdited = true;
          syncSaveButtonVisibility();
        });
        el.addEventListener('change', () => {
          userEdited = true;
          syncSaveButtonVisibility();
        });
      });
    }

    return { wire, markSynced, resetSyncState, syncSaveButtonVisibility };
  }

  /**
   * Tracks operator-provided persona field values so Generate / Generate-N can
   * honor edits and prefilled lookup/recent values while still randomizing
   * untouched fields.
   *
   * - captureBaseline: snapshot current values (after lookup, load recent, panel show)
   * - markDirty: user edited a field (including clearing to empty)
   * - shouldRandomize(fieldId): false when dirty or baseline holds a meaningful value
   * - birthDate + age behave as one unit via shouldRandomizeBirthDateAge()
   */
  /**
   * @param {{ birthDateFieldId?: string, ageFieldId?: string }} [opts]
   */
  function createPersonaFieldGuard(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const birthDateFieldId = String(options.birthDateFieldId || 'birthDate').trim();
    const ageFieldId = String(options.ageFieldId || 'age').trim();
    const birthAgeIds = new Set([birthDateFieldId, ageFieldId].filter(Boolean));

    /** @type {Map<string, string>} */
    const baseline = new Map();
    /** @type {Set<string>} */
    const dirty = new Set();
    /** @type {Map<string, HTMLElement>} */
    const fields = new Map();
    let programmaticDepth = 0;

    function serializeField(el) {
      if (!el) return '';
      if (el.type === 'checkbox') return el.checked ? '1' : '0';
      return String(el.value ?? '');
    }

    function resolveEl(fieldId, el) {
      if (el && el.id) return el;
      if (fieldId) return document.getElementById(fieldId);
      return null;
    }

    function register(fieldId, el) {
      const id = String(fieldId || '').trim();
      if (!id) return;
      const node = resolveEl(id, el);
      if (node) fields.set(id, node);
    }

    function registerMany(fieldIds) {
      if (!Array.isArray(fieldIds)) return;
      fieldIds.forEach((id) => register(id));
    }

    /**
     * Register every control with an id inside a panel container.
     * @param {string|HTMLElement} container
     * @param {{ excludeIds?: string[] }} [opts]
     */
    function registerFromContainer(container, opts) {
      const root = typeof container === 'string' ? document.getElementById(container) : container;
      if (!root) return;
      const exclude = new Set((opts && opts.excludeIds) || []);
      root.querySelectorAll('input[id], select[id], textarea[id]').forEach((el) => {
        if (el.id && !exclude.has(el.id)) register(el.id, el);
      });
    }

    function runProgrammatic(fn) {
      programmaticDepth += 1;
      try {
        return fn();
      } finally {
        programmaticDepth -= 1;
      }
    }

    function captureBaseline() {
      dirty.clear();
      fields.forEach((el, id) => {
        baseline.set(id, serializeField(el));
      });
    }

    function resetBaseline() {
      captureBaseline();
    }

    function markDirty(fieldId) {
      const id = String(fieldId || '').trim();
      if (id) dirty.add(id);
    }

    function baselineIsMeaningful(fieldId) {
      if (!baseline.has(fieldId)) return false;
      const val = baseline.get(fieldId);
      const el = fields.get(fieldId);
      if (el && el.type === 'checkbox') return val === '1';
      return val != null && String(val).trim() !== '';
    }

    function shouldRandomize(fieldId) {
      const id = String(fieldId || '').trim();
      if (!id) return true;
      if (birthAgeIds.has(id)) return shouldRandomizeBirthDateAge();
      if (dirty.has(id)) return false;
      if (baselineIsMeaningful(id)) return false;
      return true;
    }

    function shouldRandomizeBirthDateAge() {
      if (dirty.has(birthDateFieldId) || dirty.has(ageFieldId)) return false;
      if (baselineIsMeaningful(birthDateFieldId) || baselineIsMeaningful(ageFieldId)) return false;
      return true;
    }

    function wireListeners() {
      fields.forEach((el, id) => {
        const mark = () => {
          if (programmaticDepth > 0) return;
          markDirty(id);
        };
        el.addEventListener('input', mark);
        el.addEventListener('change', mark);
      });
    }

    function setFieldValue(fieldId, value) {
      const el = fields.get(fieldId) || document.getElementById(fieldId);
      if (!el) return;
      runProgrammatic(() => {
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value == null ? '' : String(value);
      });
    }

    return {
      register,
      registerMany,
      registerFromContainer,
      captureBaseline,
      resetBaseline,
      markDirty,
      shouldRandomize,
      shouldRandomizeBirthDateAge,
      wireListeners,
      runProgrammatic,
      setFieldValue,
    };
  }

  /** Infra / scaler controls excluded when auto-registering persona panels. */
  const PERSONA_FIELD_EXCLUDE_IDS = [
    'baseEmail', 'counter', 'generateCount', 'lookupIdentifier', 'lookupNs',
    'streamSchemaId', 'streamDatasetId', 'streamXdmKey', 'streamFlowId',
    'streamFlowName', 'streamUrl', 'dryRun', 'markTestProfile',
  ];

  /**
   * True when Firestore has a saved streaming connection worth "Load from Firebase".
   * Requires URL + Flow ID — wizard infra sync may persist schema/dataset ids alone,
   * which is not a reloadable streaming connection on a fresh sandbox.
   */
  function hasMeaningfulStreamingRecord(streaming) {
    if (!streaming || typeof streaming !== 'object') return false;
    const flowId = String(streaming.flowId || '').trim();
    const url = String(streaming.url || '').trim();
    return !!(flowId && url);
  }

  migrateLegacyGenericKeysOnce();

  window.AepProfileGenShared = {
    PREFIX_NEW,
    RECENT_LIMIT,
    migrateLegacyGenericKeysOnce,
    todayYmd,
    scaleEmail,
    resolveUpdateTargetEmail,
    baseEmailStorageKey,
    baseMobileStorageKey,
    counterStorageKey,
    lastStreamedKey,
    recentKey,
    readBaseEmail,
    writeBaseEmail,
    readBaseMobile,
    writeBaseMobile,
    readCounter,
    persistCounter,
    incrementCounter,
    persistLastStreamed,
    readLastStreamed,
    INDUSTRY_DISPLAY_NAMES,
    industryDisplayNameForKey,
    formatRecentIndustryLabel,
    resolveRecentEntryIndustryKey,
    filterRecentByIndustry,
    collectRecentIndustryOptions,
    readRecentIndustryFilter,
    writeRecentIndustryFilter,
    renderRecentPicker,
    readRecent,
    writeRecent,
    pushRecent,
    markTestProfilePreferenceKey,
    readMarkTestProfilePreference,
    writeMarkTestProfilePreference,
    createStreamConnectionSaveUi,
    hasMeaningfulStreamingRecord,
    createPersonaFieldGuard,
    PERSONA_FIELD_EXCLUDE_IDS,
  };
})();
