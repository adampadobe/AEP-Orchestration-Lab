/**
 * Event-level place context for AEP Lab ExperienceEvent schemas.
 *
 * Events use the XDM-native path for coordinates: the standard global
 * "Environment Details" field group provides placeContext.geo._schema.{latitude,longitude},
 * placeContext.geo.{city,countryCode,stateProvince,...} and placeContext.POIinteraction.
 * The tenant supplement below only adds what XDM lacks (geohash, neighborhood,
 * ISO 3166-2 region, accuracy, provenance, store/POI ids) at _{tenant}.eventPlaceContext.
 *
 * Both target schemas are union (Profile) enabled, so after attach these leaves
 * are additive-only: never rename, retype, tighten, or remove.
 */

'use strict';

const XDM_EXPERIENCE_EVENT_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';
const ENVIRONMENT_DETAILS_FIELD_GROUP_ID = 'https://ns.adobe.com/xdm/context/experienceevent-environment-details';
const EXPERIENCE_EVENT_UNION_ALT_ID = '_xdm.context.experienceevent__union';

const EVENT_PLACE_CONTEXT_FIELD_GROUP_TITLE = 'AEP Lab - Event Place Context v1';
const EVENT_PLACE_CONTEXT_TARGET_SCHEMA_TITLES = Object.freeze(['AEP Lab - Event Generic - Schema', 'AEP Event Tool - Schema - v1']);

const EVENT_PLACE_CONTEXT_SOURCES = ['ui-sample', 'event-tool', 'mcp-seed', 'store-poi', 'device-gps', 'edge-ip', 'import'];
const EVENT_PLACE_CONTEXT_SOURCE_LABELS = {
  'ui-sample': 'Event Tool page sample data',
  'event-tool': 'Entered manually in the Event Tool',
  'mcp-seed': 'Lab MCP geo demo seed',
  'store-poi': 'Store / point-of-interest location',
  'device-gps': 'Device GPS fix',
  'edge-ip': 'Experience Edge IP geo lookup',
  import: 'Bulk import',
};

const EVENT_PLACE_CONTEXT_V1_PROPERTIES = {
  eventPlaceContext: {
    type: 'object',
    title: 'Event place context',
    description:
      'Lab supplement to the standard placeContext.geo block: where this event happened. Written by the AEP Orchestration Lab event generators; powers event location heat maps.',
    properties: {
      geohash: {
        type: 'string',
        title: 'Geohash',
        description: 'Precision-7 geohash (~150 m) derived server-side from placeContext.geo._schema latitude/longitude.',
        pattern: '^[0-9b-hjkmnp-z]{7}$',
      },
      accuracyMeters: {
        type: 'integer',
        title: 'Accuracy (meters)',
        description: 'Radius of uncertainty around the event coordinates.',
        minimum: 0,
        maximum: 100000,
      },
      neighborhood: { type: 'string', title: 'Neighborhood', description: 'Neighborhood or district name.', maxLength: 100 },
      regionCode: {
        type: 'string',
        title: 'Region code',
        description: 'ISO 3166-2 subdivision code, e.g. SA-01.',
        pattern: '^[A-Z]{2}-[A-Z0-9]{1,3}$',
      },
      storeId: { type: 'string', title: 'Store ID', description: 'Lab store identifier where the event occurred.', maxLength: 64 },
      poiId: { type: 'string', title: 'POI ID', description: 'Point-of-interest identifier (mirrors placeContext.POIinteraction.poiDetail.poiID).', maxLength: 64 },
      source: {
        type: 'string',
        title: 'Source',
        description: 'Which lab writer produced this event place context.',
        enum: EVENT_PLACE_CONTEXT_SOURCES,
        'meta:enum': EVENT_PLACE_CONTEXT_SOURCE_LABELS,
      },
    },
  },
};

const EVENT_PLACE_CONTEXT_LEAF_PATHS = Object.freeze(
  Object.keys(EVENT_PLACE_CONTEXT_V1_PROPERTIES.eventPlaceContext.properties)
    .sort()
    .map((leaf) => `eventPlaceContext.${leaf}`)
);

const EVENT_PLACE_CONTEXT_FIELD_GROUP_DESCRIPTION =
  'AEP Orchestration Lab — ExperienceEvent supplement to Environment Details placeContext.geo (geohash, neighborhood, region, accuracy, store/POI, source).';

function buildEventPlaceContextFieldGroupCreateBody(tenantId) {
  const tenant = String(tenantId || '').trim();
  if (!tenant) throw new Error('tenantId is required.');
  return {
    title: EVENT_PLACE_CONTEXT_FIELD_GROUP_TITLE,
    description: EVENT_PLACE_CONTEXT_FIELD_GROUP_DESCRIPTION,
    type: 'object',
    'meta:intendedToExtend': [XDM_EXPERIENCE_EVENT_CLASS],
    definitions: {
      customFields: {
        type: 'object',
        properties: {
          [`_${tenant}`]: { type: 'object', properties: EVENT_PLACE_CONTEXT_V1_PROPERTIES },
        },
      },
    },
    allOf: [{ $ref: '#/definitions/customFields', type: 'object', 'meta:xdmType': 'object' }],
  };
}

module.exports = {
  XDM_EXPERIENCE_EVENT_CLASS,
  ENVIRONMENT_DETAILS_FIELD_GROUP_ID,
  EXPERIENCE_EVENT_UNION_ALT_ID,
  EVENT_PLACE_CONTEXT_FIELD_GROUP_TITLE,
  EVENT_PLACE_CONTEXT_TARGET_SCHEMA_TITLES,
  EVENT_PLACE_CONTEXT_SOURCES,
  EVENT_PLACE_CONTEXT_V1_PROPERTIES,
  EVENT_PLACE_CONTEXT_LEAF_PATHS,
  buildEventPlaceContextFieldGroupCreateBody,
};
