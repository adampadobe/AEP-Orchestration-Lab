/**
 * AEP Lab "Telecommunications Profile" wizard — thin config wrapper around
 * `profileInfraFactory`.
 *
 * Field-group strategy (verified against three sandboxes — apalmer, kirkham, prod)
 * --------------------------------------------------------------------------------
 *   1. (no custom org-wide tenant Telecom FG in any of the three sandboxes)
 *   2. OOTB `profile-telecom-subscription` (Adobe Profile-class).
 *
 * Marked `optional: true` so step 2 still succeeds in a sandbox where Adobe
 * has not provisioned the OOTB Telecom field group; the operator falls back
 * to the `_<tenant>.industryTelecom.*` subtree (Profile Core v2) for any
 * data that would otherwise be typed.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const TELECOM_PROFILE_SCHEMA_TITLE = 'AEP Lab - Telecom Profile - Schema';
const TELECOM_PROFILE_DATASET_NAME = 'AEP Lab - Telecom Profile - Dataset';
const TELECOM_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Telecom Profile - Dataflow';

const service = createProfileInfraService({
  industryKey: 'telecom',
  industryDisplayName: 'Telecom',
  schemaTitle: TELECOM_PROFILE_SCHEMA_TITLE,
  schemaDescription:
    'AEP Lab Telecommunications Profile schema (Profile-enabled). Used by the Generate Profiles page (Telecom industry) to stream sample customer profiles with subscription / plan / contract attributes alongside the Generic profile base set.',
  datasetName: TELECOM_PROFILE_DATASET_NAME,
  datasetDescription:
    'AEP Lab Telecommunications Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for Telecom-industry sample profile generation in this lab.',
  dataflowName: TELECOM_PROFILE_HTTP_DATAFLOW_NAME,
  industryFieldGroups: [
    { source: 'ootb', $id: 'https://ns.adobe.com/xdm/mixins/profile/profile-telecom-subscription', optional: true, label: 'Telecom Subscription Details' },
  ],
  tenantSubtreePrefix: 'industryTelecom',
});

module.exports = {
  ...service,
  TELECOM_PROFILE_SCHEMA_TITLE,
  TELECOM_PROFILE_DATASET_NAME,
  TELECOM_PROFILE_HTTP_DATAFLOW_NAME,
};
