/**
 * AEP Lab "Retail Profile" wizard — thin config wrapper around
 * `profileInfraFactory`.
 *
 * Field-group strategy (verified against three sandboxes — apalmer, kirkham, prod)
 * --------------------------------------------------------------------------------
 *   1. Custom tenant FG `Profile Retail v2` (preferred — present in 3/3
 *      sandboxes; richer typing for retail-specific attributes).
 *      `Profile Retail v1` is auto-created via createIfMissing if neither
 *      v1 nor v2 exists, so a fresh sandbox bootstraps to a typed FG even
 *      without operator-imported assets. The same regex matches both, so
 *      sandboxes that already have v2 keep using it.
 *   2. Custom tenant FG `Profile Retail Scoring` (also present in 3/3).
 *   3. ootbByIndustryTag — Adobe ships no Profile-class Retail FG today
 *      (verified Apr 2026 against /global/fieldgroups), so this layer
 *      contributes zero refs in current sandboxes; kept for forward compat.
 *
 * All entries are `optional: true` so a sandbox missing any one of them
 * still lets step 2 succeed; the UI continues to stream into
 * `_<tenant>.industryRetail.*` regardless of which layer resolves.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const RETAIL_PROFILE_SCHEMA_TITLE = 'AEP Lab - Retail Profile - Schema';
const RETAIL_PROFILE_DATASET_NAME = 'AEP Lab - Retail Profile - Dataset';
const RETAIL_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Retail Profile - Dataflow';

/**
 * Body of the auto-created `Profile Retail v1` tenant field group. Mirrors
 * the SCALAR_FIELDS + FLAG_TOGGLES arrays in
 * `web/profile-viewer/profile-generation-retail.js`. Keys land at
 * `_<tenant>.industryRetail.*` — same path the UI streams to today.
 *
 * Operator-imported `Profile Retail v2` (3/3 sandboxes today) supersedes
 * this auto-create via the same regex; v1 is only created when neither v1
 * nor v2 already exists.
 */
const PROFILE_RETAIL_V1_PROPERTIES = {
  industryRetail: {
    type: 'object',
    title: 'AEP Lab Retail industry attributes',
    description: 'Auto-created by the AEP Orchestration Lab Profile Generation wizard.',
    properties: {
      favoriteCategory: { type: 'string', title: 'Favourite category' },
      ltvBand: { type: 'string', title: 'Lifetime value band' },
      householdComposition: { type: 'string', title: 'Household composition' },
      channelPreference: { type: 'string', title: 'Channel preference (online vs store)' },
      retailLoyaltyTier: { type: 'string', title: 'Retail loyalty tier' },
      lastPurchaseRecency: { type: 'string', title: 'Last-purchase recency band' },
      engagementFlags: {
        type: 'object',
        title: 'Engagement flags',
        properties: {
          cartAbandoned: { type: 'boolean', title: 'Recent cart abandonment' },
          wishlist: { type: 'boolean', title: 'Has active wishlist' },
          storeCardHolder: { type: 'boolean', title: 'Holds store card' },
          subscribed: { type: 'boolean', title: 'Subscribed to brand emails' },
          returnedRecent: { type: 'boolean', title: 'Returned an item recently' },
          reviewsItems: { type: 'boolean', title: 'Writes product reviews' },
        },
      },
    },
  },
};

const service = createProfileInfraService({
  industryKey: 'retail',
  industryDisplayName: 'Retail',
  schemaTitle: RETAIL_PROFILE_SCHEMA_TITLE,
  schemaDescription:
    'AEP Lab Retail Profile schema (Profile-enabled). Used by the Generate Profiles page (Retail industry) to stream sample customer profiles with category / lifetime-value / channel-preference / loyalty-tier attributes alongside the Generic profile base set.',
  datasetName: RETAIL_PROFILE_DATASET_NAME,
  datasetDescription:
    'AEP Lab Retail Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for Retail-industry sample profile generation in this lab.',
  dataflowName: RETAIL_PROFILE_HTTP_DATAFLOW_NAME,
  industryFieldGroups: [
    {
      source: 'tenantTitlePattern',
      match: /^Profile Retail( v\d+)?$/i,
      optional: true,
      label: 'Profile Retail (custom tenant FG)',
      createIfMissing: {
        title: 'Profile Retail v1',
        description: 'AEP Orchestration Lab — auto-created Profile-class field group for the Retail industry profile pipeline.',
        properties: PROFILE_RETAIL_V1_PROPERTIES,
      },
    },
    { source: 'tenantTitlePattern', match: /^Profile Retail Scoring$/i, optional: true, label: 'Profile Retail Scoring (custom tenant FG)' },
    {
      source: 'ootbByIndustryTag',
      industries: ['Retail', 'Commerce'],
      titleHints: [/\bretail\b/i, /\bcommerce\b/i, /\bmerchandis(e|ing)\b/i],
    },
  ],
  tenantSubtreePrefix: 'industryRetail',
});

module.exports = {
  ...service,
  RETAIL_PROFILE_SCHEMA_TITLE,
  RETAIL_PROFILE_DATASET_NAME,
  RETAIL_PROFILE_HTTP_DATAFLOW_NAME,
};
