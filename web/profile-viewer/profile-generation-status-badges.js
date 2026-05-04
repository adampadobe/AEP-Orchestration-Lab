/**
 * AEP Lab Profile Generation — at-a-glance Profile-enabled status badges.
 *
 * Adds two synchronised UI surfaces:
 *
 *  1. Industry-selector dropdown — option labels stay clean (no status
 *     glyph prefix). On macOS the native <select> renders its own
 *     checkmark in front of the selected option, and a second emoji
 *     tick caused a "double tick" visual collision (May 2026). Status
 *     is exposed only via `option.title` (hover tooltip) and
 *     `option.dataset.profileStatus` (for optional CSS hooks), so
 *     full keyboard / screen-reader compatibility stays intact.
 *
 *  2. Per-panel badges — every industry's "Enable schema + dataset for
 *     Profile" button (in .enable-profile-step__action, just below the
 *     yellow "Validate data is flowing first" warning) gets a sibling
 *     <span data-industry-status="<key>" class="profile-status-badge">
 *     that renders the same 4-state legend right next to the action.
 *     The badge is intentionally adjacent to the button — when it reads
 *     "✓ Profile enabled" the architect can see at a glance the action
 *     has already been taken and the button doesn't need to be pressed
 *     again. The consent page uses the same pattern next to its own
 *     enableProfileBtn. Was previously rendered next to the panel title
 *     (May 2026) but moved adjacent to the action so the "is this done?"
 *     signal is contextual to the action it gates.
 *
 * 4-state legend:
 *   ✓ Profile enabled   — schemaInUnion AND datasetProfileEnabled
 *   ◐ Partial           — exactly one of the two is enabled
 *   ○ Not enabled       — schema + dataset exist, neither enabled
 *   — Not provisioned   — schema or dataset missing (or aggregator error)
 *
 * Refresh triggers:
 *   - On page load (after sandbox select is populated).
 *   - On any panel-shown event (`aep-<industry>-panel-shown`).
 *   - After a successful Enable-for-Profile click — runtime calls
 *     `window.AepProfileInfraStatus.refresh({force: true})`.
 *   - On sandbox change (`aep-global-sandbox-change` + #sandboxSelect change).
 *   - On click of the per-badge "Re-check AEP" refresh icon (May 2026)
 *     — calls `refresh({force: true, industry: '<key>'})` to repoll a
 *     single industry without re-fetching the other six.
 *
 * Tolerance: aggregator errors don't block other industries. Per-industry
 * `error` keys render as ? Status unknown; the dropdown indicator falls
 * back to "?" without throwing.
 *
 * Caching (May 2026 — server side):
 *   The `/api/profile-infra/status-all` and `/api/<industry>-profile-infra
 *   /status` endpoints are now backed by a durable Firestore cache
 *   (functions/profileInfraStatusCache.js). Once a sandbox + industry
 *   has been verified Profile-enabled, the cache survives function cold
 *   starts and is shared across architects. Provisioning + Enable-for-
 *   Profile success paths invalidate the cache server-side, so the
 *   next read repopulates from AEP. The 7-day max-staleness safety net
 *   catches out-of-band changes; the per-badge refresh icon below is
 *   the manual escape hatch for architects who want to force a re-check
 *   sooner.
 */
(function () {
  'use strict';

  const INDUSTRY_KEYS = ['generic', 'travel', 'fsi', 'telecom', 'retail', 'media', 'sports'];

  // Map the dropdown's <option value> spellings to the aggregate key.
  // Telecommunications is shortened to "telecom" everywhere on the
  // server side (function id, route prefix, panel id) but the dropdown
  // historically uses "telecommunications". This map is the only place
  // the two spellings need to be reconciled.
  const OPTION_VALUE_TO_KEY = {
    generic: 'generic',
    travel: 'travel',
    fsi: 'fsi',
    telecom: 'telecom',
    telecommunications: 'telecom',
    retail: 'retail',
    media: 'media',
    sports: 'sports',
  };

  // Glyph + label for each 4-state slot. Single source of truth — both
  // the dropdown indicator and the panel badge consume this table so
  // the legend never drifts between surfaces.
  const STATE = {
    enabled:        { glyph: '✓', label: 'Profile enabled',                 cls: 'is-enabled' },
    partialSchema:  { glyph: '◐', label: 'Schema enabled · Dataset pending',cls: 'is-partial' },
    partialDataset: { glyph: '◐', label: 'Schema pending · Dataset enabled',cls: 'is-partial' },
    notEnabled:     { glyph: '○', label: 'Not enabled',                     cls: 'is-not-enabled' },
    notProvisioned: { glyph: '—', label: 'Not provisioned',                 cls: 'is-not-provisioned' },
    unknown:        { glyph: '?', label: 'Status unknown',                  cls: 'is-unknown' },
    pending:        { glyph: '…', label: 'Checking…',                       cls: 'is-pending' },
  };

  function classifyFlags(flags) {
    if (!flags || flags.error) return 'unknown';
    const sFound = !!flags.schemaFound;
    const sUnion = !!flags.schemaInUnion;
    const dFound = !!flags.datasetFound;
    const dEnabled = !!flags.datasetProfileEnabled;
    if (!sFound || !dFound) return 'notProvisioned';
    if (sUnion && dEnabled) return 'enabled';
    if (sUnion && !dEnabled) return 'partialSchema';
    if (!sUnion && dEnabled) return 'partialDataset';
    return 'notEnabled';
  }

  // Strip any legacy status-glyph prefix that earlier (cached) versions
  // of this module might have injected — "✓  FSI", "◐  Travel", etc.
  // Keeps the first page-paint on a returning browser clean even
  // before the aggregate fetch returns.
  const LEGACY_GLYPH_PREFIX_RE = /^(?:[✓◐○—?…•]|\s)+/u;
  function stripLegacyGlyphPrefix(text) {
    if (!text) return text;
    return String(text).replace(LEGACY_GLYPH_PREFIX_RE, '').replace(/^\s+/, '') || text;
  }

  function getSandboxName() {
    if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getCurrentSandboxName === 'function') {
      const v = window.AepGlobalSandbox.getCurrentSandboxName();
      if (v) return v;
    }
    const el = document.getElementById('sandboxSelect');
    return el && el.value ? String(el.value).trim() : '';
  }

  // ---- In-flight + cached aggregate response ----
  // Cache one payload per (sandbox) so panel-show / sandbox-change
  // cycles don't refetch within the server's cache TTL. `invalidate()`
  // (called by the runtime after Enable-for-Profile) drops the cache
  // and forces a fresh fetch with `?refresh=1`.
  let _cachedSandbox = null;
  let _cachedPayload = null;
  let _cachedAt = 0;
  let _inflight = null;
  const CLIENT_TTL_MS = 25_000;

  async function fetchStatusAll(sandbox, { force } = {}) {
    if (!sandbox) {
      return { ok: false, error: 'no sandbox', industries: {} };
    }
    if (!force) {
      if (_cachedSandbox === sandbox && _cachedPayload && Date.now() - _cachedAt < CLIENT_TTL_MS) {
        return _cachedPayload;
      }
    }
    if (_inflight && _inflight.sandbox === sandbox && !force) {
      return _inflight.promise;
    }
    const promise = (async () => {
      try {
        const url = `/api/profile-infra/status-all?sandbox=${encodeURIComponent(sandbox)}${force ? '&refresh=1' : ''}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          return { ok: false, sandbox, error: data.error || `HTTP ${res.status}`, industries: data.industries || {} };
        }
        _cachedSandbox = sandbox;
        _cachedPayload = data;
        _cachedAt = Date.now();
        return data;
      } catch (err) {
        return { ok: false, sandbox, error: err && err.message ? err.message : String(err), industries: {} };
      } finally {
        _inflight = null;
      }
    })();
    _inflight = { sandbox, promise };
    return promise;
  }

  function applyToIndustrySelect(payload) {
    const selectEl = document.getElementById('industry');
    if (!selectEl) return;
    const industries = (payload && payload.industries) || {};
    Array.from(selectEl.options).forEach((opt) => {
      // Defensive: strip any glyph a cached older bundle may have written.
      const cleaned = stripLegacyGlyphPrefix(opt.text);
      if (cleaned !== opt.text) opt.text = cleaned;
      const value = (opt.value || '').trim().toLowerCase();
      if (!value) return;
      const key = OPTION_VALUE_TO_KEY[value];
      if (!key) return;
      const flags = industries[key];
      const stateKey = payload && payload.ok ? classifyFlags(flags) : 'unknown';
      const state = STATE[stateKey] || STATE.unknown;
      // Intentionally DO NOT mutate opt.text — the per-panel badge is the
      // source of truth for Profile-enable status, and on macOS a glyph
      // prefix collides with the browser's own selected-option checkmark
      // (double-tick). Hover title + data attribute are enough.
      opt.title = `${state.label} (${key})`;
      opt.dataset.profileStatus = stateKey;
    });
  }

  function setBadgeContent(badgeEl, stateKey) {
    if (!badgeEl) return;
    const state = STATE[stateKey] || STATE.unknown;
    badgeEl.classList.remove(
      'is-enabled', 'is-partial', 'is-not-enabled', 'is-not-provisioned', 'is-unknown', 'is-pending'
    );
    badgeEl.classList.add('profile-status-badge', state.cls);
    badgeEl.dataset.profileStatus = stateKey;
    badgeEl.textContent = `${state.glyph} ${state.label}`;
    badgeEl.setAttribute('aria-label', `Profile-enable status: ${state.label}`);
    badgeEl.title = state.label;
  }

  // ---- Per-badge "Re-check AEP" refresh icon (May 2026) ----
  // Each badge gets a sibling <button.profile-status-refresh> that
  // re-polls JUST that industry's status endpoint with `?refresh=1`,
  // bypassing the durable Firestore cache for that one row. Uses
  // var(--dash-muted) styling so it doesn't compete with the main UI.
  // Tooltip: "Re-check AEP". Injected lazily — runs once per badge in
  // applyToPanelBadges so newly-rendered panels also get the button.
  function ensureRefreshButton(badge) {
    if (!badge || !badge.parentElement) return null;
    const key = String(badge.getAttribute('data-industry-status') || '').trim().toLowerCase();
    if (!key) return null;
    let btn = badge.parentElement.querySelector(`.profile-status-refresh[data-industry="${key}"]`);
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profile-status-refresh';
    btn.dataset.industry = key;
    btn.setAttribute('aria-label', 'Re-check AEP for Profile-enable status');
    btn.title = 'Re-check AEP';
    // Counter-clockwise refresh arrow (U+21BB). Inline glyph keeps the
    // module dependency-free; CSS handles size/colour/hover state.
    btn.textContent = '\u21BB';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      btn.disabled = true;
      btn.classList.add('is-spinning');
      Promise.resolve(refresh({ force: true, industry: key })).finally(() => {
        btn.disabled = false;
        btn.classList.remove('is-spinning');
      });
    });
    if (badge.nextSibling) {
      badge.parentElement.insertBefore(btn, badge.nextSibling);
    } else {
      badge.parentElement.appendChild(btn);
    }
    return btn;
  }

  function applyToPanelBadges(payload) {
    const badges = document.querySelectorAll('[data-industry-status]');
    if (!badges.length) return;
    const industries = (payload && payload.industries) || {};
    badges.forEach((badge) => {
      const key = String(badge.getAttribute('data-industry-status') || '').trim().toLowerCase();
      if (!key) return;
      ensureRefreshButton(badge);
      // Consent badge has its own resolver below.
      if (key === 'consent') return;
      const flags = industries[key];
      const stateKey = payload && payload.ok ? classifyFlags(flags) : 'unknown';
      setBadgeContent(badge, stateKey);
    });
  }

  function markPanelBadgesPending(filterIndustry) {
    document.querySelectorAll('[data-industry-status]').forEach((badge) => {
      const key = String(badge.getAttribute('data-industry-status') || '').trim().toLowerCase();
      if (key === 'consent') return;
      if (filterIndustry && key !== filterIndustry) return;
      setBadgeContent(badge, 'pending');
    });
  }

  // ---- Consent badge — uses the existing /api/consent-infra/status
  // endpoint (not part of the 7-industry aggregate). Single panel only;
  // refreshed on page load + after Enable-for-Profile + on sandbox change.
  async function refreshConsentBadge(sandbox) {
    const badges = document.querySelectorAll('[data-industry-status="consent"]');
    if (!badges.length) return;
    if (!sandbox) {
      badges.forEach((b) => setBadgeContent(b, 'unknown'));
      return;
    }
    badges.forEach((b) => {
      ensureRefreshButton(b);
      setBadgeContent(b, 'pending');
    });
    try {
      const res = await fetch(`/api/consent-infra/status?sandbox=${encodeURIComponent(sandbox)}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        badges.forEach((b) => setBadgeContent(b, 'unknown'));
        return;
      }
      const flags = {
        schemaFound: !!data.schemaFound,
        schemaInUnion: !!(data.schemaInUnion ?? data.schemaInProfileUnion),
        datasetFound: !!data.datasetFound,
        datasetProfileEnabled: !!data.datasetProfileEnabled,
      };
      // Consent dataset is intentionally NOT Profile-enabled. Map the
      // semantics so the badge reads correctly:
      //   - schema + dataset present, neither in union → "Profile enabled"
      //     (the desired good state for consent)
      //   - schema in union → "◐ Partial" with "schema in union" warning
      //   - either missing → "Not provisioned"
      let stateKey;
      if (!flags.schemaFound || !flags.datasetFound) stateKey = 'notProvisioned';
      else if (flags.schemaInUnion || flags.datasetProfileEnabled) stateKey = 'partialSchema';
      else stateKey = 'enabled';
      badges.forEach((b) => setBadgeContent(b, stateKey));
    } catch (_) {
      badges.forEach((b) => setBadgeContent(b, 'unknown'));
    }
  }

  function invalidate() {
    _cachedSandbox = null;
    _cachedPayload = null;
    _cachedAt = 0;
    _inflight = null;
  }

  /**
   * Single-industry refresh — hits `/api/<industry>-profile-infra
   * /status?sandbox=…&refresh=1` and updates only that badge. Lets
   * architects re-check ONE row without re-fetching the other six.
   * Also drops the aggregate client cache so the next aggregate refresh
   * picks up the new server-side value.
   */
  async function refreshOneIndustry(industry, { force } = {}) {
    const sandbox = getSandboxName();
    if (!sandbox || !INDUSTRY_KEYS.includes(industry)) return null;
    markPanelBadgesPending(industry);
    const url = `/api/${industry}-profile-infra/status?sandbox=${encodeURIComponent(sandbox)}${force ? '&refresh=1' : ''}`;
    const badges = document.querySelectorAll(`[data-industry-status="${industry}"]`);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        badges.forEach((b) => setBadgeContent(b, 'unknown'));
        return null;
      }
      const flags = {
        schemaFound: !!data.schemaFound,
        schemaInUnion: !!(data.schemaInUnion ?? data.schemaInProfileUnion),
        datasetFound: !!data.datasetFound,
        datasetProfileEnabled: !!data.datasetProfileEnabled,
      };
      const stateKey = classifyFlags(flags);
      badges.forEach((b) => setBadgeContent(b, stateKey));
      // Drop the aggregate client cache so the dropdown indicator
      // re-syncs on next access. (The next full aggregate refresh will
      // re-pull all 7 industries from the durable server cache.)
      invalidate();
      return data;
    } catch (_) {
      badges.forEach((b) => setBadgeContent(b, 'unknown'));
      return null;
    }
  }

  /**
   * Refresh both surfaces (industry select + panel badges) for the
   * current sandbox. `force=true` bypasses the client + server caches
   * — used after Enable-for-Profile so the new state surfaces
   * immediately. `industry` (May 2026) restricts the refresh to a
   * single row (used by the per-badge "Re-check AEP" icon).
   */
  async function refresh({ force, industry } = {}) {
    if (industry === 'consent') {
      const sandbox = getSandboxName();
      return refreshConsentBadge(sandbox);
    }
    if (industry && INDUSTRY_KEYS.includes(industry)) {
      return refreshOneIndustry(industry, { force });
    }
    const sandbox = getSandboxName();
    if (!sandbox) {
      const selectEl = document.getElementById('industry');
      if (selectEl) {
        Array.from(selectEl.options).forEach((opt) => {
          const cleaned = stripLegacyGlyphPrefix(opt.text);
          if (cleaned !== opt.text) opt.text = cleaned;
        });
      }
      markPanelBadgesPending();
      return null;
    }
    if (force) invalidate();
    markPanelBadgesPending();
    const payload = await fetchStatusAll(sandbox, { force: !!force });
    applyToIndustrySelect(payload);
    applyToPanelBadges(payload);
    // Consent uses its own endpoint — fire and forget so the aggregate
    // refresh isn't blocked by it.
    refreshConsentBadge(sandbox);
    try {
      window.dispatchEvent(new CustomEvent('aep-profile-infra-status-updated', { detail: payload }));
    } catch (_) {
      /* ignore */
    }
    return payload;
  }

  // ---- Auto-wire ----
  function init() {
    const sandboxSelect = document.getElementById('sandboxSelect');
    if (sandboxSelect) {
      sandboxSelect.addEventListener('change', () => refresh({ force: false }));
    }
    window.addEventListener('aep-global-sandbox-change', () => refresh({ force: false }));
    INDUSTRY_KEYS.forEach((key) => {
      window.addEventListener(`aep-${key}-panel-shown`, () => refresh({ force: false }));
    });
    // First paint — give the sandbox loader a moment, then fetch.
    setTimeout(() => refresh({ force: false }), 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AepProfileInfraStatus = {
    refresh,
    invalidate,
    classifyFlags,
    INDUSTRY_KEYS,
    STATE,
  };
})();
