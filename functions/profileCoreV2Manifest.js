/**
 * Per-industry manifest of tenant-relative leaves the AEP Orchestration Lab
 * expects to exist inside the sandbox-local `Profile Core v2` field group
 * (the custom `mixins` FG whose `_<tenant>` subtree holds everything the
 * lab streams that isn't covered by an Adobe-OOTB Profile-class FG).
 *
 * Why this file exists
 * --------------------
 * The Profile Core v2 mixin is NOT identical across sandboxes. Two real
 * datapoints verified Apr 2026:
 *
 *   - apalmer (Adam Palmer) sandbox, mixin v1.5 — tenant subtree INCLUDES
 *     `travelReservations.flightReservations.*` (with the full `multiLeg`
 *     sub-object), `scoring.npsScore`, and `scoring.gaming.*`.
 *
 *   - kirkham (Alan Kirkham) sandbox, mixin v1.6 — tenant subtree is
 *     MISSING `travelReservations.*` entirely AND missing `scoring.npsScore`.
 *     But v1.6 ADDS Sports-flavoured leaves nobody else has.
 *
 * Result: when the Travel profile generator runs in a sandbox that lacks
 * `_<tenant>.travelReservations.*`, every streamed value silently dies
 * (AEP drops unrecognised paths with no error). The "top-up" runs during
 * the per-industry wizard's step 2 to guarantee the sandbox-local Profile
 * Core v2 has every tenant-subtree leaf the lab depends on for that
 * industry, adding missing leaves via add-only JSON-Patch.
 *
 * What goes in this manifest
 * --------------------------
 * Only tenant-prefixed paths that the lab ACTUALLY streams. Every leaf
 * listed here maps to a real `push('…')` call in one of the
 * `web/profile-viewer/profile-generation-*.js` modules. If the lab stops
 * streaming a path, it SHOULD be removed from the manifest (keeps the
 * top-up diff tight). If the lab starts streaming a new tenant path,
 * add it here in the same commit.
 *
 * Root-prefixed paths (first segment is in `PROFILE_STREAM_ROOT_PATH_PREFIXES`
 * — `person.*`, `loyalty.*`, `travelPreferences.*`, `personalFinances.*`,
 * `subscriptions.*`, etc.) do NOT go through the custom mixin and therefore
 * MUST NOT appear here. The top-up would try to patch them under the
 * tenant subtree where they'd be silently rejected.
 *
 * Schema-typo fidelity
 * --------------------
 * The apalmer mixin's flight-layover-2 airport-name leaf is spelled
 * `layoverAiport_2` (missing the 'r'). That's the canonical name today and
 * the UI streams that exact key. The manifest preserves the typo on
 * purpose. If upstream ever rebuilds the mixin without the typo we'll fix
 * both the UI and the manifest in the same commit.
 *
 * Entry shape
 * -----------
 * Each industry entry is `{ [tenantRelativeDotPath]: inlineJsonSchema }`.
 * `tenantRelativeDotPath` is everything AFTER `_<tenant>.` (so
 * `travelReservations.flightReservations` not `_demoemea.travelReservations.flightReservations`).
 * `inlineJsonSchema` is the JSON-Schema property body to ADD if the leaf
 * (or its nearest missing ancestor) is absent — matches the canonical
 * shape lifted from apalmer's live Profile Core v2 body. The top-up
 * builder folds these into `/definitions/customFields/properties/_<tenant>/properties/...`
 * via JSON-Patch ADD ops, picking the shallowest non-overlapping subtree
 * for each missing path (one op for a whole missing parent, not N ops
 * for each leaf inside it).
 *
 * Type conflict handling
 * ----------------------
 * ADD-only. If a leaf already exists but with a different type, the
 * top-up reports it as a `conflict` and DOES NOT overwrite — drift in
 * the opposite direction (sandbox-local divergence a teammate added on
 * purpose) is the operator's call to resolve, not the wizard's.
 */

/**
 * Reusable inline schema snippets lifted from apalmer's live Profile Core v2
 * body (apalmer mixin version 1.5, Apr 2026). Kept as constants so
 * per-industry entries can compose without drifting.
 */

const NUMBER_LEAF = (title) => ({
  type: 'number',
  title,
  description: '',
  required: [],
  'meta:xdmType': 'number',
});

const INT_LEAF = (title) => ({
  type: 'integer',
  title,
  description: '',
  required: [],
  minimum: -2147483648,
  maximum: 2147483647,
  'meta:xdmType': 'int',
});

const STRING_LEAF = (title) => ({
  type: 'string',
  title,
  description: '',
  required: [],
  minLength: 1,
  'meta:xdmType': 'string',
});

const BOOLEAN_LEAF = (title) => ({
  type: 'boolean',
  title,
  description: '',
  required: [],
  'meta:xdmType': 'boolean',
});

const DATE_LEAF = (title) => ({
  type: 'string',
  format: 'date',
  title,
  description: '',
  required: [],
  'meta:xdmType': 'date',
});

/**
 * `travelReservations.flightReservations` + its `multiLeg` sub-object.
 * Mirrors apalmer mixin verbatim (confirmed Apr 2026 by diffing the
 * live authoring-form FG body).
 *
 * Schema-typo preserved deliberately: `layoverAiport_2` (no 'r').
 */
const TRAVEL_RESERVATIONS_SUBTREE = {
  type: 'object',
  title: 'travelReservations',
  description: '',
  required: [],
  note: '',
  'meta:xdmType': 'object',
  properties: {
    flightReservations: {
      type: 'object',
      title: 'flightReservations',
      required: [],
      'meta:xdmType': 'object',
      properties: {
        usaFlight: BOOLEAN_LEAF('usaFlight'),
        numberofPassengers: INT_LEAF('numberofPassengers'),
        flightNumber: STRING_LEAF('flightNumber'),
        flightDate: DATE_LEAF('flightDate'),
        flightClass: STRING_LEAF('flightClass'),
        departureCountry: STRING_LEAF('departureCountry'),
        departureAirportCode: STRING_LEAF('departureAirportCode'),
        confirmationNumber: STRING_LEAF('confirmationNumber'),
        childrenTravelling: BOOLEAN_LEAF('childrenTravelling'),
        arrivalCountry: STRING_LEAF('arrivalCountry'),
        arrivalAirportCode: STRING_LEAF('arrivalAirportCode'),
        multiLeg: {
          type: 'object',
          title: 'multiLeg',
          description: '',
          required: [],
          note: '',
          'meta:xdmType': 'object',
          properties: {
            numberofLayovers: INT_LEAF('numberofLayovers'),
            multiLeg: BOOLEAN_LEAF('multiLeg'),
            layoverDuration_1: INT_LEAF('layoverDuration_1'),
            layoverDuration_2: INT_LEAF('layoverDuration_2'),
            layoverAirport_1: STRING_LEAF('layoverAirport_1'),
            layoverAirportCode_1: STRING_LEAF('layoverAirportCode_1'),
            // Schema-typo preserved intentionally: `layoverAiport_2` (no 'r')
            // — matches the canonical apalmer mixin and the UI streams this
            // exact key. See the note in `buildUpdatesFromForm` in
            // `web/profile-viewer/profile-generation-travel.js`.
            layoverAiport_2: STRING_LEAF('layoverAiport_2'),
            layoverAirportCode_2: STRING_LEAF('layoverAirportCode_2'),
          },
        },
      },
    },
  },
};

/**
 * Shared generic leaves the lab streams for every industry via the
 * `web/profile-viewer/profile-generation-industry-runtime.js` helper and
 * the Generic / Travel per-industry JS modules (which haven't been
 * migrated to the shared runtime yet).
 *
 * Most of these already exist in every sandbox's Profile Core v2; the
 * one that drifts today is `scoring.npsScore` (present in apalmer, missing
 * in Alan Kirkham's sandbox). Keeping the full set listed here means
 * any future sandbox rebuild would be covered automatically by a single
 * wizard run — even if apalmer's mixin later drifts in the opposite
 * direction.
 */
const SHARED_TENANT_LEAVES = {
  // Streamed from the shared runtime's `buildCustomerAnalyticsUpdates`
  // helper (the `churn` / `propensity` / `nps` / `aov` quad).
  'scoring.churn.churnPrediction': NUMBER_LEAF('churnPrediction'),
  'scoring.core.propensityScore': NUMBER_LEAF('propensityScore'),
  'scoring.npsScore': NUMBER_LEAF('npsScore'),
  'orderProfile.avgOrderSize': NUMBER_LEAF('avgOrderSize'),
  // Age streamed alongside `person.birthDate` (root). See the birthDate
  // + age pair in the industry-runtime module.
  'individualCharacteristics.core.age': INT_LEAF('age'),
  // Loyalty-details leaves the shared `renderLoyaltySection` streams when
  // the loyalty toggle is enabled.
  'loyaltyDetails.level': STRING_LEAF('level'),
  'loyaltyDetails.points': NUMBER_LEAF('points'),
  // `identification.core.loyaltyId` lives under a `$ref` to the shared
  // identification.core datatype. Add-only via FG PATCH wouldn't apply —
  // the top-up treats ref-blocked leaves as `alreadyPresent` when resolved
  // (or as `conflict` when resolved but typed differently), never as
  // `needsAdd`, since patching shared datatypes is out of scope for the
  // wizard.
};

/**
 * Per-industry manifests. Each industry ALWAYS gets the shared set; the
 * per-industry extension adds only paths that specific industry streams
 * above the shared set.
 */
const INDUSTRY_EXTENSIONS = {
  travel: {
    // Travel's flight-reservation stream is the biggest drift case —
    // apalmer has the full subtree, Alan's sandbox has nothing under
    // `travelReservations.*`. Stream paths mirror
    // `buildUpdatesFromForm` in `web/profile-viewer/profile-generation-travel.js`.
    travelReservations: TRAVEL_RESERVATIONS_SUBTREE,
  },
  retail: {
    // Retail's `individualCharacteristics.retail.*` and `scoring.retail.*`
    // tenant paths are typed by the separately-attached Profile Retail v2
    // FG (not Profile Core v2), so the top-up does NOT need to add them
    // here. See functions/retailProfileInfraService.js for the FG resolver.
  },
  fsi: {
    // FSI streams almost everything to root (`personalFinances.*`) or to
    // the `industryFsi.*` subtree typed by the separate Profile FSI v2 FG.
    // Nothing extra needed under Profile Core v2.
  },
  media: {
    // Media streams to `subscriptions.*` (root) and `industryMedia.*`
    // (Profile Media v1/v2 FG). Nothing extra under Profile Core v2.
  },
  sports: {
    // Sports streams `industrySports.*` (Profile Sports v1 FG) and the
    // existing shared `scoring.npsScore` / `scoring.product.affinity`.
    // `scoring.product.affinity` lives under a $ref datatype so the
    // wizard cannot add it via FG PATCH anyway; it's already present in
    // both verified sandboxes.
  },
  telecom: {
    // Telecom streams to `telecomSubscription.*` (root via the OOTB
    // profile-telecom-subscription FG) and `industryTelecom.*` (Profile
    // Telecom v1 FG). Nothing extra under Profile Core v2.
  },
  generic: {
    // Generic is the baseline — no additions beyond the shared set.
  },
};

/**
 * Look up the full manifest for an industry: shared generic leaves first,
 * then the per-industry extension merged on top. Unknown industries
 * fall back to the shared set (same behaviour as Generic).
 *
 * Returns a plain `{ [tenantRelativeDotPath]: inlineJsonSchema }` object
 * — the caller (`topUpProfileCoreV2` in `profileInfraFactory.js`) then
 * diffs it against the live FG and builds the smallest non-overlapping
 * JSON-Patch ADD ops.
 */
function getManifestForIndustry(industryKey) {
  const key = String(industryKey || '').toLowerCase();
  const extension = INDUSTRY_EXTENSIONS[key] || {};
  return { ...SHARED_TENANT_LEAVES, ...extension };
}

/**
 * Flat list of all industries the factory knows about. Useful for the
 * verifier / test probes that want to iterate every manifest.
 */
const KNOWN_INDUSTRIES = Object.freeze(Object.keys(INDUSTRY_EXTENSIONS));

module.exports = {
  SHARED_TENANT_LEAVES,
  INDUSTRY_EXTENSIONS,
  KNOWN_INDUSTRIES,
  getManifestForIndustry,
  // Exposed for tests / docs.
  TRAVEL_RESERVATIONS_SUBTREE,
  _schemaLeafBuilders: { NUMBER_LEAF, INT_LEAF, STRING_LEAF, BOOLEAN_LEAF, DATE_LEAF },
};
