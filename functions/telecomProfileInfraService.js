/**
 * AEP Lab "Telecommunications Profile" wizard — thin config wrapper around
 * `profileInfraFactory`.
 *
 * Field-group strategy (verified against three sandboxes — apalmer, kirkham, prod)
 * --------------------------------------------------------------------------------
 *   1. Custom tenant FG `Profile Telecom v1` — auto-created by createIfMissing
 *      so every sandbox bootstraps to the same typed FG. Mirrors the
 *      `_<tenant>.industryTelecom.*` tree the UI module already streams to.
 *   2. OOTB `profile-telecom-subscription` (Adobe Profile-class).
 *   3. ootbByIndustryTag — discovers any other Profile-class /global FGs
 *      tagged Telecommunications (or matching telecom keywords by title).
 *
 * All entries are `optional: true` so a sandbox missing any one of them
 * still lets step 2 succeed; the UI continues to stream into
 * `_<tenant>.industryTelecom.*` regardless of which layer resolves.
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const TELECOM_PROFILE_SCHEMA_TITLE = 'AEP Lab - Telecom Profile - Schema';
const TELECOM_PROFILE_DATASET_NAME = 'AEP Lab - Telecom Profile - Dataset';
const TELECOM_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Telecom Profile - Dataflow';

/**
 * Body of the auto-created `Profile Telecom v1` tenant field group. Mirrors
 * the SCALAR_FIELDS + FLAG_TOGGLES arrays in
 * `web/profile-viewer/profile-generation-telecom.js`. Keys land at
 * `_<tenant>.industryTelecom.*` — same path the UI streams to today.
 */
const PROFILE_TELECOM_V1_PROPERTIES = {
  industryTelecom: {
    type: 'object',
    title: 'AEP Lab Telecom industry attributes',
    description: 'Auto-created by the AEP Orchestration Lab Profile Generation wizard.',
    properties: {
      planTier: { type: 'string', title: 'Plan tier' },
      monthlySpendBand: { type: 'string', title: 'Monthly spend band' },
      dataAllowance: { type: 'string', title: 'Data allowance band' },
      contractEndBand: { type: 'string', title: 'Contract end band' },
      deviceTier: { type: 'string', title: 'Device tier' },
      networkNps: { type: 'string', title: 'Network NPS bucket' },
      serviceFlags: {
        type: 'object',
        title: 'Service subscriptions',
        properties: {
          hasMobile: { type: 'boolean', title: 'Has mobile line' },
          hasBroadband: { type: 'boolean', title: 'Has broadband' },
          hasTv: { type: 'boolean', title: 'Has TV bundle' },
          hasFamilyPlan: { type: 'boolean', title: 'Has family plan' },
          recentNetworkIssue: { type: 'boolean', title: 'Reported a recent network issue' },
          upgradeEligible: { type: 'boolean', title: 'Upgrade eligible' },
        },
      },
    },
  },
};

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
    {
      source: 'tenantTitlePattern',
      match: /^Profile Telecom( v\d+)?$/i,
      optional: true,
      label: 'Profile Telecom (custom tenant FG)',
      createIfMissing: {
        title: 'Profile Telecom v1',
        description: 'AEP Orchestration Lab — auto-created Profile-class field group for the Telecom industry profile pipeline.',
        properties: PROFILE_TELECOM_V1_PROPERTIES,
      },
    },
    { source: 'ootb', $id: 'https://ns.adobe.com/xdm/mixins/profile/profile-telecom-subscription', optional: true, label: 'Telecom Subscription Details' },
    {
      source: 'ootbByIndustryTag',
      industries: ['Telecommunications', 'Telecom'],
      // Tight regex: matches "Telecom Subscription" but NOT "Subscription
      // Details" (the latter is owned by Media's tag layer).
      titleHints: [/\btelecom\b/i, /\btelco\b/i, /\bcarrier\b/i],
    },
  ],
  tenantSubtreePrefix: 'industryTelecom',
});

module.exports = {
  ...service,
  TELECOM_PROFILE_SCHEMA_TITLE,
  TELECOM_PROFILE_DATASET_NAME,
  TELECOM_PROFILE_HTTP_DATAFLOW_NAME,
};
