/**
 * AEP Lab "Media Profile" wizard — thin config wrapper around
 * `profileInfraFactory`.
 *
 * Field-group strategy (verified against three sandboxes — apalmer, kirkham, prod)
 * --------------------------------------------------------------------------------
 *   1. Custom tenant FG `Profile Media v1` (per-sandbox — present in 1/3
 *      sandboxes; richer typing for media-specific attributes when imported).
 *   2. OOTB `profile-subscriptions` (Adobe Profile-class) as a generic
 *      subscription-tier carrier.
 *
 * Both are marked `optional: true` so step 2 still succeeds in a sandbox
 * with neither; the operator falls back to the
 * `_<tenant>.industryMedia.*` subtree (Profile Core v2) for any data that
 * would otherwise be typed.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const MEDIA_PROFILE_SCHEMA_TITLE = 'AEP Lab - Media Profile - Schema';
const MEDIA_PROFILE_DATASET_NAME = 'AEP Lab - Media Profile - Dataset';
const MEDIA_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Media Profile - Dataflow';

const service = createProfileInfraService({
  industryKey: 'media',
  industryDisplayName: 'Media',
  schemaTitle: MEDIA_PROFILE_SCHEMA_TITLE,
  schemaDescription:
    'AEP Lab Media Profile schema (Profile-enabled). Used by the Generate Profiles page (Media industry) to stream sample customer profiles with subscription-tier / device / viewing-minutes / genre attributes alongside the Generic profile base set.',
  datasetName: MEDIA_PROFILE_DATASET_NAME,
  datasetDescription:
    'AEP Lab Media Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for Media-industry sample profile generation in this lab.',
  dataflowName: MEDIA_PROFILE_HTTP_DATAFLOW_NAME,
  industryFieldGroups: [
    { source: 'tenantTitlePattern', match: /^Profile Media( v\d+)?$/i, optional: true, label: 'Profile Media (custom tenant FG)' },
    { source: 'ootb', $id: 'https://ns.adobe.com/xdm/context/profile-subscriptions', optional: true, label: 'Subscription Details' },
  ],
  tenantSubtreePrefix: 'industryMedia',
});

module.exports = {
  ...service,
  MEDIA_PROFILE_SCHEMA_TITLE,
  MEDIA_PROFILE_DATASET_NAME,
  MEDIA_PROFILE_HTTP_DATAFLOW_NAME,
};
