/**
 * AEP Lab "Sports Profile" wizard — thin config wrapper around
 * `profileInfraFactory`.
 *
 * Field-group strategy (verified against three sandboxes — apalmer, kirkham, prod)
 * --------------------------------------------------------------------------------
 *   - No Profile-class field group: the custom Sports FG that exists in
 *     some sandboxes is Plan-class (not attachable to a Profile schema)
 *     and there is no OOTB Adobe Sports FG. So `industryFieldGroups` is
 *     intentionally EMPTY — the factory always falls back to the
 *     `_<tenant>.industrySports.*` subtree (Profile Core v2). This is the
 *     cleanest validation that the Phase 0 layered field-group resolver
 *     handles the "no industry FG anywhere" case correctly.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const SPORTS_PROFILE_SCHEMA_TITLE = 'AEP Lab - Sports Profile - Schema';
const SPORTS_PROFILE_DATASET_NAME = 'AEP Lab - Sports Profile - Dataset';
const SPORTS_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Sports Profile - Dataflow';

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
  industryFieldGroups: [],
  tenantSubtreePrefix: 'industrySports',
});

module.exports = {
  ...service,
  SPORTS_PROFILE_SCHEMA_TITLE,
  SPORTS_PROFILE_DATASET_NAME,
  SPORTS_PROFILE_HTTP_DATAFLOW_NAME,
};
