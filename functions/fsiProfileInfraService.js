/**
 * AEP Lab "FSI (Financial Services) Profile" wizard — thin config wrapper
 * around `profileInfraFactory`.
 *
 * Field-group strategy (verified against three sandboxes — apalmer, kirkham, prod)
 * --------------------------------------------------------------------------------
 *   1. Custom tenant FG `Profile FSI v2` (preferred when present — richer typing).
 *      `Profile FSI v1` is auto-created via createIfMissing if neither v1 nor v2
 *      exists, so a fresh sandbox bootstraps to a typed FG instead of falling
 *      through to the tenant subtree fallback only.
 *   2. OOTB `profile-personal-finance-details` (Adobe Profile-class).
 *   3. OOTB `profile-personal-tax-profile-details` (Adobe Profile-class).
 *   4. ootbByIndustryTag — discovers any other Profile-class /global FGs whose
 *      `meta:industries` includes Financial Services, OR (effective today, since
 *      Adobe doesn't populate that tag) whose title matches finance/tax/banking
 *      keywords. The two curated $ids above are deduped automatically.
 *
 * All entries are `optional: true` so a sandbox missing any one of them still
 * lets step 2 succeed; the UI continues to stream into `_<tenant>.industryFsi.*`
 * (Profile Core v2 tenant subtree) regardless of which layer resolves.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const FSI_PROFILE_SCHEMA_TITLE = 'AEP Lab - FSI Profile - Schema';
const FSI_PROFILE_DATASET_NAME = 'AEP Lab - FSI Profile - Dataset';
const FSI_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - FSI Profile - Dataflow';

/**
 * Body of the auto-created `Profile FSI v1` tenant field group. Top-level
 * keys live directly under `_<tenant>` (added by the factory), so they
 * appear at runtime as `_<tenant>.industryFsi.*` — exactly the paths the
 * UI module `profile-generation-fsi.js` streams to. Properties typed as
 * string for the band/segment scalars (today rendered as select-of-band
 * labels) and boolean for product-holding flags.
 */
const PROFILE_FSI_V1_PROPERTIES = {
  industryFsi: {
    type: 'object',
    title: 'AEP Lab FSI industry attributes',
    description: 'Auto-created by the AEP Orchestration Lab Profile Generation wizard.',
    properties: {
      primaryBankingChannel: { type: 'string', title: 'Primary banking channel' },
      creditScoreBand: { type: 'string', title: 'Credit score band' },
      lifeStage: { type: 'string', title: 'Life stage' },
      employment: { type: 'string', title: 'Employment status' },
      householdIncomeBand: { type: 'string', title: 'Household income band' },
      financialProducts: {
        type: 'object',
        title: 'Financial products held',
        properties: {
          checking: { type: 'boolean', title: 'Holds checking account' },
          savings: { type: 'boolean', title: 'Holds savings account' },
          creditCard: { type: 'boolean', title: 'Holds credit card' },
          mortgage: { type: 'boolean', title: 'Holds mortgage' },
          investment: { type: 'boolean', title: 'Holds investment account' },
          loan: { type: 'boolean', title: 'Holds loan' },
        },
      },
    },
  },
};

const service = createProfileInfraService({
  industryKey: 'fsi',
  industryDisplayName: 'FSI',
  schemaTitle: FSI_PROFILE_SCHEMA_TITLE,
  schemaDescription:
    'AEP Lab FSI Profile schema (Profile-enabled). Used by the Generate Profiles page (FSI industry) to stream sample customer profiles with banking/credit/tax/lifestage attributes alongside the Generic profile base set.',
  datasetName: FSI_PROFILE_DATASET_NAME,
  datasetDescription:
    'AEP Lab FSI Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for FSI-industry sample profile generation in this lab.',
  dataflowName: FSI_PROFILE_HTTP_DATAFLOW_NAME,
  industryFieldGroups: [
    {
      source: 'tenantTitlePattern',
      match: /^Profile FSI( v\d+)?$/i,
      optional: true,
      label: 'Profile FSI (custom tenant FG)',
      createIfMissing: {
        title: 'Profile FSI v1',
        description: 'AEP Orchestration Lab — auto-created Profile-class field group for the FSI industry profile pipeline.',
        properties: PROFILE_FSI_V1_PROPERTIES,
      },
    },
    // Note the URI shape: `/xdm/mixins/profile-personal-finance-details` (NO
    // `/profile/` segment). The WITH-`/profile/` variant 404s in /global —
    // verified against apalmer Apr 2026. This was a stale URI in the original
    // curated list; surfaced (and fixed) by the new ootbByIndustryTag layer
    // which independently rediscovered the correct $id via title hints.
    { source: 'ootb', $id: 'https://ns.adobe.com/xdm/mixins/profile-personal-finance-details', optional: true, label: 'Personal Finance Details' },
    { source: 'ootb', $id: 'https://ns.adobe.com/xdm/mixins/profile/profile-personal-tax-profile-details', optional: true, label: 'Personal Tax Details' },
    {
      source: 'ootbByIndustryTag',
      industries: ['Financial Services', 'FSI', 'Banking', 'Insurance'],
      titleHints: [/finance/i, /tax/i, /banking/i, /\bfsi\b/i, /credit/i],
    },
  ],
  tenantSubtreePrefix: 'industryFsi',
});

module.exports = {
  ...service,
  FSI_PROFILE_SCHEMA_TITLE,
  FSI_PROFILE_DATASET_NAME,
  FSI_PROFILE_HTTP_DATAFLOW_NAME,
};
