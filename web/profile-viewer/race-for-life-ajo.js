/**
 * @deprecated Phase 5 (decisioning mount plan) — Race for Life uses shared/env-bar.js →
 * SiteCloneDecisioningBoot + DecisioningProfileRuntime + content-decision-edge-mounts.js.
 * Logic was migrated to content-decision-edge-mounts.js; do not load this file on demo pages.
 *
 * Kept for historical reference only. Safe to delete once no external bookmarks depend on it.
 */
(function (global) {
  'use strict';

  if (typeof global.console !== 'undefined' && typeof global.console.warn === 'function') {
    global.console.warn(
      '[race-for-life-ajo.js] Deprecated — use env-bar decisioning (SiteCloneDecisioningBoot) instead.',
    );
  }

  global.RaceForLifeAjo = {
    refreshFromProfile: function deprecatedRefreshFromProfile() {
      return Promise.resolve();
    },
    buildSurfaces: function deprecatedBuildSurfaces() {
      return [];
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
