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
 *  2. Per-panel badges — every #<industry>ProfilePanel header (h2.panel-title)
 *     gets a sibling <span data-industry-status="<key>" class="profile-status-badge">
 *     that renders the same 4-state legend in the panel surface itself, so
 *     architects can confirm the current industry's state in detail.
 *     This is the canonical surface for "is this industry Profile-enabled?".
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
 *     `window.AepProfileInfraStatus.invalidate()`.
 *   - On sandbox change (`aep-global-sandbox-change` + #sandboxSelect change).
 *
 * Tolerance: aggregator errors don't block other industries. Per-industry
 * `error` keys render as ? Status unknown; the dropdown indicator falls
 * back to "?" without throwing.
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
  // cycles don't refetch within the server's 30s window. `invalidate()`
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

  function applyToPanelBadges(payload) {
    const badges = document.querySelectorAll('[data-industry-status]');
    if (!badges.length) return;
    const industries = (payload && payload.industries) || {};
    badges.forEach((badge) => {
      const key = String(badge.getAttribute('data-industry-status') || '').trim().toLowerCase();
      if (!key) return;
      // Consent badge has its own resolver below.
      if (key === 'consent') return;
      const flags = industries[key];
      const stateKey = payload && payload.ok ? classifyFlags(flags) : 'unknown';
      setBadgeContent(badge, stateKey);
    });
  }

  function markPanelBadgesPending() {
    document.querySelectorAll('[data-industry-status]').forEach((badge) => {
      const key = String(badge.getAttribute('data-industry-status') || '').trim().toLowerCase();
      if (key === 'consent') return;
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
    badges.forEach((b) => setBadgeContent(b, 'pending'));
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
   * Refresh both surfaces (industry select + panel badges) for the
   * current sandbox. `force=true` bypasses the client + server caches
   * — used after Enable-for-Profile so the new state surfaces
   * immediately.
   */
  async function refresh({ force } = {}) {
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
