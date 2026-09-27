/**
 * AEP Lab "Generic Profile" wizard — thin config wrapper around
 * `profileInfraFactory`. The factory holds all of the heavy lifting (schema
 * shell + base field groups + identity descriptor + Profile-enabled dataset
 * + manual HTTP API flow instructions); this file only declares the per-
 * industry naming.
 *
 * Phase 0 refactor preserves the original public surface 1:1 so
 * `functions/index.js` doesn't need to be touched: the same exported
 * functions (`runGenericProfileInfraStatus`, `runGenericProfileInfraStep`)
 * and constants (`GENERIC_PROFILE_*`) remain available with identical
 * return shapes.
 *
 * Generic has exactly one `industryFieldGroups` entry: the purpose-built
 * `AEP Lab - Profile Place Context v1` tenant FG (last-known place at
 * `_<tenant>.profilePlaceContext.*`). It is optional and auto-created when
 * missing, like the Sports/Telecom FGs. These leaves are deliberately NOT in
 * `profileCoreV2Manifest.js` — a second definition of the same path in the
 * Profile union would conflict. The first sandbox (apalmer) is governed by
 * `scripts/ensure-generic-place-context-fieldgroup.cjs` (dry-run by default).
 *
 * The legacy "Customer Analytics" tenant FG is still decided separately by
 * the operator (the wizard never auto-creates or attaches it).
 */

const { createProfileInfraService } = require('./profileInfraFactory');

const GENERIC_PROFILE_SCHEMA_TITLE = 'AEP Lab - Generic Profile - Schema';
const GENERIC_PROFILE_DATASET_NAME = 'AEP Lab - Generic Profile - Dataset';
const GENERIC_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Generic Profile - Dataflow';
/**
 * Title of the optional "Customer Analytics" tenant field group. Kept as a
 * constant for any future tooling that may want to surface it; the wizard
 * itself does NOT auto-create or attach this FG.
 */
const GENERIC_PROFILE_FIELD_GROUP_TITLE = 'AEP Lab - Customer Analytics';

const PROFILE_PLACE_CONTEXT_FIELD_GROUP_TITLE = 'AEP Lab - Profile Place Context v1';

const PLACE_CONTEXT_SOURCES = ['ui-sample', 'ui-manual', 'profile-update', 'mcp-persona', 'mcp-seed', 'import'];
const PLACE_CONTEXT_SOURCE_LABELS = {
  'ui-sample': 'Generate Profiles page sample data',
  'ui-manual': 'Entered manually in the lab UI',
  'profile-update': 'Profile update round-trip',
  'mcp-persona': 'Lab MCP persona builder',
  'mcp-seed': 'Lab MCP geo demo seed',
  import: 'Bulk import',
};

/**
 * Additive-only body of the place-context FG. The schema is Profile-enabled,
 * so after attach these leaves may only gain optional siblings — never
 * rename, retype, tighten, or remove.
 */
const PROFILE_PLACE_CONTEXT_V1_PROPERTIES = {
  profilePlaceContext: {
    type: 'object',
    title: 'Profile place context',
    description:
      'Last-known place of the person (not the residential address). Written by the AEP Orchestration Lab profile generators; powers audience geo hotspots.',
    properties: {
      latitude: { type: 'number', title: 'Latitude', description: 'WGS84 latitude in decimal degrees.', minimum: -90, maximum: 90 },
      longitude: { type: 'number', title: 'Longitude', description: 'WGS84 longitude in decimal degrees.', minimum: -180, maximum: 180 },
      geohash: {
        type: 'string',
        title: 'Geohash',
        description: 'Precision-7 geohash (~150 m) derived server-side from latitude/longitude.',
        pattern: '^[0-9b-hjkmnp-z]{7}$',
      },
      accuracyMeters: {
        type: 'integer',
        title: 'Accuracy (meters)',
        description: 'Radius of uncertainty around the coordinates.',
        minimum: 0,
        maximum: 100000,
      },
      neighborhood: { type: 'string', title: 'Neighborhood', description: 'Neighborhood or district name.', maxLength: 100 },
      city: { type: 'string', title: 'City', description: 'City name.', maxLength: 100 },
      regionCode: {
        type: 'string',
        title: 'Region code',
        description: 'ISO 3166-2 subdivision code, e.g. SA-01.',
        pattern: '^[A-Z]{2}-[A-Z0-9]{1,3}$',
      },
      countryCode: { type: 'string', title: 'Country code', description: 'ISO 3166-1 alpha-2 country code.', pattern: '^[A-Z]{2}$' },
      lastSeenAt: { type: 'string', format: 'date-time', title: 'Last seen at', description: 'When the person was last observed at this place.' },
      source: {
        type: 'string',
        title: 'Source',
        description: 'Which lab writer produced this place context.',
        enum: PLACE_CONTEXT_SOURCES,
        'meta:enum': PLACE_CONTEXT_SOURCE_LABELS,
      },
    },
  },
};

const PROFILE_PLACE_CONTEXT_LEAF_PATHS = Object.freeze(
  Object.keys(PROFILE_PLACE_CONTEXT_V1_PROPERTIES.profilePlaceContext.properties)
    .map((leaf) => `profilePlaceContext.${leaf}`)
    .sort()
);

const PROFILE_PLACE_CONTEXT_FIELD_GROUP_SPEC = {
  title: PROFILE_PLACE_CONTEXT_FIELD_GROUP_TITLE,
  description:
    'AEP Orchestration Lab — Profile-class field group holding the last-known place of a generated profile (lat/lon, geohash, city, region, country, last seen, source).',
  properties: PROFILE_PLACE_CONTEXT_V1_PROPERTIES,
};

const GENERIC_PROFILE_INDUSTRY_FIELD_GROUPS = [
  {
    source: 'tenantTitlePattern',
    match: /^AEP Lab - Profile Place Context( v\d+)?$/i,
    optional: true,
    label: 'AEP Lab - Profile Place Context (custom tenant FG)',
    createIfMissing: PROFILE_PLACE_CONTEXT_FIELD_GROUP_SPEC,
  },
];

const service = createProfileInfraService({
  industryKey: 'generic',
  industryDisplayName: 'Generic',
  schemaTitle: GENERIC_PROFILE_SCHEMA_TITLE,
  schemaDescription:
    'AEP Lab Generic Profile schema (Profile-enabled). Used by the Generate Profiles page to stream sample customer profiles with churn/propensity/NPS/AOV/loyalty/preferences attributes.',
  datasetName: GENERIC_PROFILE_DATASET_NAME,
  datasetDescription:
    'AEP Lab Generic Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for sample profile generation in this lab.',
  dataflowName: GENERIC_PROFILE_HTTP_DATAFLOW_NAME,
  industryFieldGroups: GENERIC_PROFILE_INDUSTRY_FIELD_GROUPS,
  tenantSubtreePrefix: null,
});

const GENERIC_PROFILE_INFRA_STEP_NAMES = service.STEP_NAMES;

module.exports = {
  ...service,
  GENERIC_PROFILE_SCHEMA_TITLE,
  GENERIC_PROFILE_DATASET_NAME,
  GENERIC_PROFILE_HTTP_DATAFLOW_NAME,
  GENERIC_PROFILE_FIELD_GROUP_TITLE,
  GENERIC_PROFILE_INDUSTRY_FIELD_GROUPS,
  PROFILE_PLACE_CONTEXT_FIELD_GROUP_TITLE,
  PROFILE_PLACE_CONTEXT_FIELD_GROUP_SPEC,
  PROFILE_PLACE_CONTEXT_V1_PROPERTIES,
  PROFILE_PLACE_CONTEXT_LEAF_PATHS,
  PLACE_CONTEXT_SOURCES,
  GENERIC_PROFILE_INFRA_STEP_NAMES: service.STEP_NAMES,
  runGenericProfileInfraStatus: (...args) => service.runStatus(...args),
  runGenericProfileInfraStep: (...args) => service.runStep(...args),
  runGenericProfileInfraEnableProfile: (...args) => service.runEnableProfile(...args),
};
