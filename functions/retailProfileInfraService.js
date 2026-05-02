/**
 * AEP Lab "Retail Profile" wizard — thin config wrapper around
 * `profileInfraFactory`.
 *
 * Field-group strategy (verified against three sandboxes — apalmer, kirkham, prod)
 * --------------------------------------------------------------------------------
 *   1. Custom tenant FG `Profile Retail v2` (preferred — present in 3/3
 *      sandboxes; richer typing for retail-specific attributes).
 *   2. Custom tenant FG `Profile Retail Scoring` (also present in 3/3).
 *
 * Both are marked `optional: true` so a sandbox missing either still lets
 * step 2 succeed; the operator falls back to the
 * `_<tenant>.industryRetail.*` subtree (Profile Core v2) for any data that
 * would otherwise be typed.
 *
 * No OOTB Adobe Profile-class Retail mixin exists (verified at the time
 * of writing), hence the layered list contains only custom tenant entries
 * plus the subtree fallback baked into the factory.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const RETAIL_PROFILE_SCHEMA_TITLE = 'AEP Lab - Retail Profile - Schema';
const RETAIL_PROFILE_DATASET_NAME = 'AEP Lab - Retail Profile - Dataset';
const RETAIL_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Retail Profile - Dataflow';

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
    { source: 'tenantTitlePattern', match: /^Profile Retail( v\d+)?$/i, optional: true, label: 'Profile Retail (custom tenant FG)' },
    { source: 'tenantTitlePattern', match: /^Profile Retail Scoring$/i, optional: true, label: 'Profile Retail Scoring (custom tenant FG)' },
  ],
  tenantSubtreePrefix: 'industryRetail',
});

module.exports = {
  ...service,
  RETAIL_PROFILE_SCHEMA_TITLE,
  RETAIL_PROFILE_DATASET_NAME,
  RETAIL_PROFILE_HTTP_DATAFLOW_NAME,
};
