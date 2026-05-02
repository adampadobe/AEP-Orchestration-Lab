/**
 * AEP Lab "FSI (Financial Services) Profile" wizard — thin config wrapper
 * around `profileInfraFactory`.
 *
 * Field-group strategy (verified against three sandboxes — apalmer, kirkham, prod)
 * --------------------------------------------------------------------------------
 *   1. Custom tenant FG `Profile FSI v2` (preferred when present — richer typing).
 *   2. OOTB `profile-personal-finance-details` (Adobe Profile-class).
 *   3. OOTB `profile-personal-tax-profile-details` (Adobe Profile-class).
 *
 * All three are marked `optional: true` so a sandbox missing any one of them
 * still lets step 2 succeed; the operator falls back to the
 * `_<tenant>.industryFsi.*` subtree (Profile Core v2) for any data that
 * would otherwise be typed.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const FSI_PROFILE_SCHEMA_TITLE = 'AEP Lab - FSI Profile - Schema';
const FSI_PROFILE_DATASET_NAME = 'AEP Lab - FSI Profile - Dataset';
const FSI_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - FSI Profile - Dataflow';

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
    { source: 'tenantTitlePattern', match: /^Profile FSI( v\d+)?$/i, optional: true, label: 'Profile FSI (custom tenant FG)' },
    { source: 'ootb', $id: 'https://ns.adobe.com/xdm/mixins/profile/profile-personal-finance-details', optional: true, label: 'Personal Finance Details' },
    { source: 'ootb', $id: 'https://ns.adobe.com/xdm/mixins/profile/profile-personal-tax-profile-details', optional: true, label: 'Personal Tax Details' },
  ],
  tenantSubtreePrefix: 'industryFsi',
});

module.exports = {
  ...service,
  FSI_PROFILE_SCHEMA_TITLE,
  FSI_PROFILE_DATASET_NAME,
  FSI_PROFILE_HTTP_DATAFLOW_NAME,
};
