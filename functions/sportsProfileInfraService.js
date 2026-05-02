/**
 * AEP Lab "Sports Profile" wizard — thin config wrapper around
 * `profileInfraFactory`.
 *
 * Field-group strategy (verified against three sandboxes — apalmer, kirkham, prod)
 * --------------------------------------------------------------------------------
 *   1. Custom tenant FG `Profile Sports v1` — auto-created by createIfMissing
 *      in any sandbox where it doesn't exist. The previous shipped behaviour
 *      was zero industry FGs (always falling back to the tenant subtree);
 *      the new auto-create gives every sandbox a typed FG with the same
 *      attribute tree the UI module already streams to.
 *   2. ootbByIndustryTag — Adobe ships no Profile-class Sports FG today
 *      (verified Apr 2026 against /global/fieldgroups), so this layer
 *      contributes zero refs in current sandboxes; kept for forward compat.
 *
 * Optional by definition; the UI continues to stream into
 * `_<tenant>.industrySports.*` regardless of which layer resolves.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const SPORTS_PROFILE_SCHEMA_TITLE = 'AEP Lab - Sports Profile - Schema';
const SPORTS_PROFILE_DATASET_NAME = 'AEP Lab - Sports Profile - Dataset';
const SPORTS_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Sports Profile - Dataflow';

/**
 * Body of the auto-created `Profile Sports v1` tenant field group. Mirrors
 * the SCALAR_FIELDS + FLAG_TOGGLES arrays in
 * `web/profile-viewer/profile-generation-sports.js`. Keys land at
 * `_<tenant>.industrySports.*` — same path the UI streams to today.
 */
const PROFILE_SPORTS_V1_PROPERTIES = {
  industrySports: {
    type: 'object',
    title: 'AEP Lab Sports industry attributes',
    description: 'Auto-created by the AEP Orchestration Lab Profile Generation wizard.',
    properties: {
      favouriteSport: { type: 'string', title: 'Favourite sport' },
      favouriteTeam: { type: 'string', title: 'Favourite team' },
      fanSegment: { type: 'string', title: 'Fan segment' },
      jerseySize: { type: 'string', title: 'Jersey size' },
      merchSpendBand: { type: 'string', title: 'Merchandise spend band' },
      lastAttendedEvent: { type: 'string', title: 'Last attended event recency band' },
      fanFlags: {
        type: 'object',
        title: 'Fan engagement flags',
        properties: {
          seasonTicket: { type: 'boolean', title: 'Season ticket holder' },
          fantasyPlayer: { type: 'boolean', title: 'Plays fantasy sports' },
          betsRegularly: { type: 'boolean', title: 'Bets on this sport regularly' },
          streamLive: { type: 'boolean', title: 'Streams live games' },
          newsletterSub: { type: 'boolean', title: 'Subscribes to club newsletter' },
          childFan: { type: 'boolean', title: 'Has a child who follows the team' },
        },
      },
    },
  },
};

const service = createProfileInfraService({
  industryKey: 'sports',
  industryDisplayName: 'Sports',
  schemaTitle: SPORTS_PROFILE_SCHEMA_TITLE,
  schemaDescription:
    'AEP Lab Sports Profile schema (Profile-enabled). Used by the Generate Profiles page (Sports industry) to stream sample fan profiles with favourite-team / fan-segment / season-ticket / merchandise attributes alongside the Generic profile base set.',
  datasetName: SPORTS_PROFILE_DATASET_NAME,
  datasetDescription:
    'AEP Lab Sports Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for Sports-industry sample profile generation in this lab.',
  dataflowName: SPORTS_PROFILE_HTTP_DATAFLOW_NAME,
  industryFieldGroups: [
    {
      source: 'tenantTitlePattern',
      match: /^Profile Sports( v\d+)?$/i,
      optional: true,
      label: 'Profile Sports (custom tenant FG)',
      createIfMissing: {
        title: 'Profile Sports v1',
        description: 'AEP Orchestration Lab — auto-created Profile-class field group for the Sports industry profile pipeline.',
        properties: PROFILE_SPORTS_V1_PROPERTIES,
      },
    },
    {
      source: 'ootbByIndustryTag',
      industries: ['Sports'],
      titleHints: [/\bsports\b/i, /\bfan\b/i, /\bteam\b/i, /\bleague\b/i],
    },
  ],
  tenantSubtreePrefix: 'industrySports',
});

module.exports = {
  ...service,
  SPORTS_PROFILE_SCHEMA_TITLE,
  SPORTS_PROFILE_DATASET_NAME,
  SPORTS_PROFILE_HTTP_DATAFLOW_NAME,
};
