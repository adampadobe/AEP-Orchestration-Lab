/**
 * Static per-industry attribute path ownership map for the Profile Viewer
 * Attributes table.
 *
 * The Profile Viewer's lookup endpoint flattens an AEP Profile entity into
 * one row per leaf-path. Each row is enriched (in
 * `functions/profileTableHelpers.js#flattenEntityToTableRows`) with the
 * industry that owns the path according to the rules below, so the new
 * "Dataflow" column can render the correct per-industry pill and the
 * client-side Update handler can fan its writes out to the right
 * per-industry HTTP API streaming dataflow.
 *
 * Source of truth for the prefixes is each
 * `web/profile-viewer/profile-generation-{industry}.js` module's
 * `buildUpdates({ push })` block — every dotted path the per-industry
 * profile-generation wizard streams is captured here so a write made
 * through the generation panel and a write made through the table editor
 * land on the same dataflow. Cross-referenced with
 * `PROFILE_STREAM_ROOT_PATH_PREFIXES` in
 * `functions/profileStreamingCore.js` (root-level OOTB mixins that are
 * NOT auto-prefixed under `_<tenant>.…`) so we cover both shapes:
 *
 *   - Root-mixin form  : `personalFinances.creditScores.0.score`
 *   - Tenant-prefixed  : `_demoemea.industryFsi.financialProducts.checking`
 *
 * Resolution semantics
 * --------------------
 * The list is ordered: industry-specific rules first, the Generic catch-all
 * LAST. `resolveIndustryForPath()` walks the list in order and returns the
 * first match, so a row whose path starts with `personalFinances.` lands
 * on FSI even though Generic also claims very broad prefixes like
 * `individualCharacteristics.core.*`.
 *
 * Tenant prefix
 * -------------
 * Tenant-prefixed paths use `_demoemea.` because that is the live xdmKey
 * default in this lab (see `profileStreamingCore.js` —
 * `key = xdmKey || '_demoemea'`). If a sandbox ever runs against a
 * different tenant key, expand `expandTenantPrefixes()` to inject the
 * resolved tenant from the request instead of relying on this constant.
 *
 * What is intentionally NOT in this map
 * -------------------------------------
 *   - Per-attribute provenance from AEP. UPS `/access/entities` does not
 *     expose dataset-level lineage; the column reflects this static map,
 *     not "which dataflow physically wrote this value last".
 *   - Loyalty namespace fall-out. Server-side identity-namespace tries
 *     for `loyaltyid` are kept in `profileTableHelpers.js` defensively
 *     even though the UI no longer offers Loyalty ID as an identity
 *     namespace; the Loyalty paths themselves (`loyalty.*`,
 *     `loyaltyDetails.*`, `identification.core.loyaltyId`) are owned by
 *     Generic per the architectural decision to keep loyalty shared.
 */

'use strict';

/**
 * Tenant key used by the runtime — matches the default xdmKey in
 * `profileStreamingCore.js`. A future multi-tenant build can swap this
 * constant for a per-request value.
 */
const TENANT_PREFIX = '_demoemea.';

/** Resolution-reason templates. Surfaced to the UI for tooltips. */
const RESOLUTION_REASON = {
  PREFIX_MATCH: (prefix) => `matched ${prefix}*`,
  CATCH_ALL_GENERIC: 'matched Generic catch-all (no industry-specific prefix)',
  UNOWNED: 'no industry schema declares this path',
};

/**
 * Ordered ownership rules. First match wins — industry-specific entries
 * MUST come before the Generic catch-all so e.g.
 * `personalFinances.creditScores.0.score` lands on FSI, not Generic.
 *
 * Each entry's `prefixes` list contains both shapes the path can show up
 * in: bare (root-mixin) and tenant-prefixed. The `<TENANT>` token is a
 * placeholder — `expandTenantPrefixes()` substitutes the real tenant
 * prefix at module load.
 */
const RAW_PATH_OWNERSHIP = [
  // ----- FSI -------------------------------------------------------------
  // Tenant subtree: `_<tenant>.industryFsi.*` (operator-context dropdowns
  // + financialProducts toggles, declared in the auto-created
  // `Profile FSI v1` tenant FG — see fsiProfileInfraService.js).
  // Tenant subtree: `_<tenant>.individualCharacteristics.fsi.*` is reserved
  // for any FSI-specific Profile Core extension; Generic claims the
  // `.core.*` slot.
  // Root mixin: `personalFinances.*` (OOTB Personal Finance Details +
  // Personal Tax Profile Details FGs — listed in
  // PROFILE_STREAM_ROOT_PATH_PREFIXES).
  {
    industry: 'fsi',
    prefixes: [
      'industryFsi.',
      'personalFinances.',
      '<TENANT>industryFsi.',
      '<TENANT>individualCharacteristics.fsi.',
      '<TENANT>personalFinances.',
    ],
  },

  // ----- Telecom ---------------------------------------------------------
  // Tenant: `_<tenant>.industryTelecom.*` (operator-context scalar fields
  // + serviceFlags toggles, declared in the auto-created
  // `Profile Telecom v1` tenant FG — see telecomProfileInfraService.js).
  // Root mixin: `telecomSubscription.*` (OOTB Telecom Subscription FG —
  // listed in PROFILE_STREAM_ROOT_PATH_PREFIXES).
  {
    industry: 'telecom',
    prefixes: [
      'industryTelecom.',
      'telecomSubscription.',
      '<TENANT>industryTelecom.',
      '<TENANT>individualCharacteristics.telecom.',
      '<TENANT>telecomSubscription.',
    ],
  },

  // ----- Retail ----------------------------------------------------------
  // Tenant: `_<tenant>.industryRetail.*` is reserved for the auto-created
  // `Profile Retail v1` tenant FG. The current Generate-N flow streams to
  // `individualCharacteristics.retail.*` and `scoring.retail.*` only.
  // `orderProfile.*` is intentionally Generic-owned (shared shopping
  // history) — Retail-specific writes go to `individualCharacteristics.
  // retail.*` instead.
  {
    industry: 'retail',
    prefixes: [
      'industryRetail.',
      'individualCharacteristics.retail.',
      'scoring.retail.',
      '<TENANT>industryRetail.',
      '<TENANT>individualCharacteristics.retail.',
      '<TENANT>scoring.retail.',
    ],
  },

  // ----- Travel ----------------------------------------------------------
  // Tenant: `_<tenant>.travelReservations.*` (Profile Travel v1 tenant FG;
  // `travelReservations` is NOT in PROFILE_STREAM_ROOT_PATH_PREFIXES, so
  // the proxy auto-prefixes it under the tenant key).
  // Root mixin: `travelPreferences.*` (OOTB Travel Preferences FG — listed
  // in PROFILE_STREAM_ROOT_PATH_PREFIXES).
  {
    industry: 'travel',
    prefixes: [
      'travelReservations.',
      'travelPreferences.',
      'industryTravel.',
      '<TENANT>travelReservations.',
      '<TENANT>travelPreferences.',
      '<TENANT>industryTravel.',
      '<TENANT>individualCharacteristics.travel.',
    ],
  },

  // ----- Media -----------------------------------------------------------
  // Tenant: `_<tenant>.industryMedia.*` (operator-context scalar fields
  // + engagementFlags toggles, declared in the auto-created
  // `Profile Media v1` tenant FG — see mediaProfileInfraService.js).
  // Root mixin: `subscriptions.*` (OOTB Subscription Details FG — listed
  // in PROFILE_STREAM_ROOT_PATH_PREFIXES).
  {
    industry: 'media',
    prefixes: [
      'industryMedia.',
      'subscriptions.',
      '<TENANT>industryMedia.',
      '<TENANT>individualCharacteristics.media.',
      '<TENANT>subscriptions.',
    ],
  },

  // ----- Sports ----------------------------------------------------------
  // Tenant: `_<tenant>.industrySports.*` (operator-context scalar fields
  // + fanFlags toggles, declared in the auto-created
  // `Profile Sports v1` tenant FG — see sportsProfileInfraService.js).
  // Sports has no OOTB Profile-class root mixin in the Adobe library
  // today; everything stays under the tenant subtree.
  {
    industry: 'sports',
    prefixes: [
      'industrySports.',
      '<TENANT>industrySports.',
      '<TENANT>individualCharacteristics.sports.',
    ],
  },

  // ----- Generic (catch-all — MUST be last) ------------------------------
  // Shared core paths owned by the AEP Lab Generic Profile schema. Any
  // attribute that doesn't match an industry-specific prefix above falls
  // through to Generic. The list mirrors what
  // `web/profile-viewer/profile-generation-generic.js` streams plus the
  // OOTB profile mixins it pulls in (consents, optInOut, preferences,
  // identification, person, loyalty, …).
  {
    industry: 'generic',
    prefixes: [
      'personalEmail.',
      'mobilePhone.',
      'homePhone.',
      'workPhone.',
      'workAddress.',
      'homeAddress.',
      'billingAddress.',
      'mailingAddress.',
      'shippingAddress.',
      'person.',
      'personID',
      'loyalty.',
      'loyaltyDetails.',
      'consents.',
      'optInOut.',
      'preferences.',
      'preferredLanguage',
      'orderProfile.',
      'individualCharacteristics.core.',
      'identification.core.',
      'identification.',
      'identityMap.',
      'scoring.',
      'demoEnvironment.',
      'metadata.',
      '_id',
      '_repo.',
      '<TENANT>identification.',
      '<TENANT>individualCharacteristics.core.',
      '<TENANT>person.',
      '<TENANT>consents.',
      '<TENANT>optInOut.',
      '<TENANT>preferences.',
      '<TENANT>preferredLanguage',
      '<TENANT>loyalty.',
      '<TENANT>loyaltyDetails.',
      '<TENANT>orderProfile.',
      '<TENANT>scoring.',
      '<TENANT>demoEnvironment.',
      '<TENANT>personalEmail.',
      '<TENANT>mobilePhone.',
      '<TENANT>homeAddress.',
    ],
  },
];

/**
 * Expand the `<TENANT>` token into the live tenant prefix and return the
 * concrete ownership list used by `resolveIndustryForPath()`.
 *
 * @param {string} tenantPrefix - e.g. `_demoemea.`
 */
function expandTenantPrefixes(tenantPrefix) {
  return RAW_PATH_OWNERSHIP.map((entry) => ({
    industry: entry.industry,
    prefixes: entry.prefixes.map((p) =>
      p.startsWith('<TENANT>') ? p.replace('<TENANT>', tenantPrefix) : p
    ),
  }));
}

/** Concrete ownership map — what callers should consume. */
const PATH_OWNERSHIP = expandTenantPrefixes(TENANT_PREFIX);

/**
 * Resolve the owning industry for a flattened attribute path.
 *
 * @param {string} path - e.g. `personalFinances.creditScores.0.score`
 *                        or `_demoemea.industryFsi.financialProducts.checking`
 * @returns {{ industry: string|null, reason: string }}
 */
function resolveIndustryForPath(path) {
  if (!path || typeof path !== 'string') {
    return { industry: null, reason: RESOLUTION_REASON.UNOWNED };
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return { industry: null, reason: RESOLUTION_REASON.UNOWNED };
  }
  for (const entry of PATH_OWNERSHIP) {
    for (const prefix of entry.prefixes) {
      // Treat both `prefix.` (subtree) and bare `prefix` (exact-match
      // scalar root-leaf, e.g. `preferredLanguage`) as a hit.
      if (
        trimmed === prefix ||
        trimmed.startsWith(prefix) ||
        (!prefix.endsWith('.') && trimmed === prefix)
      ) {
        const reason =
          entry.industry === 'generic'
            ? RESOLUTION_REASON.CATCH_ALL_GENERIC
            : RESOLUTION_REASON.PREFIX_MATCH(prefix);
        return { industry: entry.industry, reason };
      }
    }
  }
  return { industry: null, reason: RESOLUTION_REASON.UNOWNED };
}

/**
 * Serialisable view of the static ownership map — used by the new
 * `GET /api/profile/attribute-ownership` endpoint so the client can
 * render the same legend we resolve server-side.
 */
function getAttributeOwnershipPayload() {
  return {
    tenantPrefix: TENANT_PREFIX,
    industries: PATH_OWNERSHIP.map((entry) => ({
      industry: entry.industry,
      prefixes: entry.prefixes,
    })),
    reasonTemplates: {
      PREFIX_MATCH: 'matched <prefix>*',
      CATCH_ALL_GENERIC: RESOLUTION_REASON.CATCH_ALL_GENERIC,
      UNOWNED: RESOLUTION_REASON.UNOWNED,
    },
  };
}

module.exports = {
  TENANT_PREFIX,
  PATH_OWNERSHIP,
  RAW_PATH_OWNERSHIP,
  RESOLUTION_REASON,
  expandTenantPrefixes,
  resolveIndustryForPath,
  getAttributeOwnershipPayload,
};
