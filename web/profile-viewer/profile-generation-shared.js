/**
 * Profile Generation — shared cross-industry helpers.
 *
 * Owns the email scaler, the daily per-(sandbox, base email) counter, the
 * last-streamed cache, the recently-generated picker, and the per-sandbox
 * base email persistence used by every industry-specific profile generator
 * module on this page (currently Generic + Travel).
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
 *   profileGenCounter:<sandbox>:<baseLower>:<DDMMYYYY>
 *   profileGenLastStreamed:<sandbox>:<baseLower>:<DDMMYYYY>
 *   profileGenRecent:<sandbox>:<baseLower>:<DDMMYYYY>
 *   profileGenMigrationDone:v1
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

  function counterStorageKey(sandbox, baseEmail, date) {
    return `${PREFIX_NEW}Counter:${normSandbox(sandbox)}:${normBaseEmail(baseEmail)}:${todayYmd(date)}`;
  }

  function lastStreamedKey(sandbox, baseEmail, date) {
    return `${PREFIX_NEW}LastStreamed:${normSandbox(sandbox)}:${normBaseEmail(baseEmail)}:${todayYmd(date)}`;
  }

  function recentKey(sandbox, baseEmail, date) {
    return `${PREFIX_NEW}Recent:${normSandbox(sandbox)}:${normBaseEmail(baseEmail)}:${todayYmd(date)}`;
  }

  // ---------- Base email persistence ----------

  function readBaseEmail(sandbox) {
    const v = safeGet(baseEmailStorageKey(sandbox));
    return v == null ? '' : v;
  }

  function writeBaseEmail(sandbox, value) {
    safeSet(baseEmailStorageKey(sandbox), String(value || ''));
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

  /**
   * Push a new entry to the front of the recent list (deduping by `scaledEmail`).
   * Caller passes a fully-formed entry like `{ scaledEmail, n, ts, snapshot }`.
   */
  function pushRecent(sandbox, baseEmail, entry, date) {
    if (!entry || !entry.scaledEmail) return;
    const list = readRecent(sandbox, baseEmail, date);
    const filtered = list.filter((e) => e && e.scaledEmail !== entry.scaledEmail);
    writeRecent(sandbox, baseEmail, [entry, ...filtered], date);
  }

  migrateLegacyGenericKeysOnce();

  window.AepProfileGenShared = {
    PREFIX_NEW,
    RECENT_LIMIT,
    migrateLegacyGenericKeysOnce,
    todayYmd,
    scaleEmail,
    baseEmailStorageKey,
    counterStorageKey,
    lastStreamedKey,
    recentKey,
    readBaseEmail,
    writeBaseEmail,
    readCounter,
    persistCounter,
    incrementCounter,
    persistLastStreamed,
    readLastStreamed,
    readRecent,
    writeRecent,
    pushRecent,
  };
})();
