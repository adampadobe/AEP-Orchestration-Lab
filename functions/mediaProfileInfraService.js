/**
 * AEP Lab "Media Profile" wizard — thin config wrapper around
 * `profileInfraFactory`.
 *
 * The generator owns industryMedia.*. Existing Profile Media v1 groups can
 * instead own individualCharacteristics.media, so their title is not proof
 * that generator fields exist. Keep them intact and use a dedicated contract.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const MEDIA_PROFILE_SCHEMA_TITLE = 'AEP Lab - Media Profile - Schema';
const MEDIA_PROFILE_DATASET_NAME = 'AEP Lab - Media Profile - Dataset';
const MEDIA_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Media Profile - Dataflow';

/**
 * Body of the dedicated generator field group. Mirrors
 * the SCALAR_FIELDS + FLAG_TOGGLES arrays in
 * `web/profile-viewer/profile-generation-media.js`. Keys land at
 * `_<tenant>.industryMedia.*` — same path the UI streams to today.
 */
const PROFILE_MEDIA_V1_PROPERTIES = {
  industryMedia: {
    type: 'object',
    title: 'AEP Lab Media industry attributes',
    description: 'Auto-created by the AEP Orchestration Lab Profile Generation wizard.',
    properties: {
      subscriptionTier: { type: 'string', title: 'Subscription tier' },
      preferredDevice: { type: 'string', title: 'Preferred device' },
      viewingMinutesBand: { type: 'string', title: 'Monthly viewing minutes band' },
      primaryGenre: { type: 'string', title: 'Primary genre' },
      lastViewedRecency: { type: 'string', title: 'Last-viewed recency band' },
      accountSharingBand: { type: 'string', title: 'Account sharing band' },
      engagementFlags: {
        type: 'object',
        title: 'Engagement flags',
        properties: {
          adSupported: { type: 'boolean', title: 'On ad-supported plan' },
          downloadsEnabled: { type: 'boolean', title: 'Downloads enabled' },
          sportsPackage: { type: 'boolean', title: 'Has sports add-on' },
          hasKidsProfile: { type: 'boolean', title: 'Has a kids profile' },
          liveTv: { type: 'boolean', title: 'Watches live TV' },
          bingeWatcher: { type: 'boolean', title: 'Binge-watcher' },
        },
      },
    },
  },
};

const PROFILE_MEDIA_GENERATOR_FIELD_GROUP = {
  source: 'tenantTitlePattern',
  match: /^AEP Lab - Profile Media Generator v1$/i,
  optional: false,
  label: 'AEP Lab - Profile Media Generator v1 (industryMedia generator paths)',
  createIfMissing: {
    title: 'AEP Lab - Profile Media Generator v1',
    description: 'AEP Orchestration Lab - Profile-class field group for industryMedia generator attributes.',
    properties: PROFILE_MEDIA_V1_PROPERTIES,
  },
};

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
    PROFILE_MEDIA_GENERATOR_FIELD_GROUP,
    {
      source: 'tenantTitlePattern',
      match: /^Profile Media( v\d+)?$/i,
      optional: true,
      label: 'Profile Media (custom tenant FG)',
    },
    { source: 'ootb', $id: 'https://ns.adobe.com/xdm/context/profile-subscriptions', optional: true, label: 'Subscription Details' },
    {
      source: 'ootbByIndustryTag',
      industries: ['Media and Entertainment', 'Media', 'Entertainment'],
      // `Subscription Details` is the only Adobe Profile-class subscription
      // FG today and is already attached via the curated ootb $id above, so
      // a generic `subscription` hint is intentionally omitted — it would
      // also match `Telecom Subscription`, which belongs to Telecom's
      // pipeline. These hints are forward-compat discovery for any new
      // Profile-class Media-specific FG Adobe ships.
      titleHints: [/\bmedia\b/i, /\bcontent\b/i, /\bstream/i, /\bbroadcast/i, /\bpublishing/i, /\bvod\b/i, /\bott\b/i],
    },
  ],
  tenantSubtreePrefix: 'industryMedia',
  requiredTenantProperties: PROFILE_MEDIA_V1_PROPERTIES,
});

module.exports = {
  ...service,
  MEDIA_PROFILE_SCHEMA_TITLE,
  MEDIA_PROFILE_DATASET_NAME,
  MEDIA_PROFILE_HTTP_DATAFLOW_NAME,
  PROFILE_MEDIA_V1_PROPERTIES,
  PROFILE_MEDIA_GENERATOR_FIELD_GROUP,
};
