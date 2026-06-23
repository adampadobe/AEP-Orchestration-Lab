/**
 * Event infrastructure naming — mirrors Profile Viewer event-tool.js and profile infra constants.
 */

export const DEFAULT_EVENT_SCHEMA_TITLE = 'AEP Lab - Event Generic - Schema';

/**
 * Derive catalog dataset name from schema title (word-boundary Schema → Dataset).
 * @param {string} schemaTitle
 * @returns {string}
 */
export function deriveDatasetNameFromSchemaTitle(schemaTitle) {
  return String(schemaTitle || '').replace(/\bSchema\b/i, 'Dataset');
}

/**
 * Resolve schema + dataset names for setupEventInfra (MCP + tests).
 * @param {object} [params]
 * @param {string} [params.schema_title]
 * @param {string} [params.dataset_name]
 * @returns {{ schemaTitle: string, datasetName: string, derivedDataset: boolean }}
 */
export function resolveEventInfraNames(params = {}) {
  const schemaTitle = String(params.schema_title || DEFAULT_EVENT_SCHEMA_TITLE).trim();
  const explicitDataset = String(params.dataset_name || '').trim();
  if (explicitDataset) {
    return { schemaTitle, datasetName: explicitDataset, derivedDataset: false };
  }
  return {
    schemaTitle,
    datasetName: deriveDatasetNameFromSchemaTitle(schemaTitle),
    derivedDataset: true,
  };
}

/**
 * Build next-step guidance after setupEventInfra succeeds.
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} [params.schemaId]
 * @param {string} [params.datasetId]
 */
export function buildEventInfraNextSteps({ sandbox, schemaId, datasetId }) {
  const origin = String(process.env.AEP_LAB_API_ORIGIN || 'https://aep-orchestration-lab.web.app').replace(/\/$/, '');
  const eventToolUrl = `${origin}/profile-viewer/event-tool.html?sandbox=${encodeURIComponent(sandbox)}`;
  return {
    enable_profile_in_aep:
      'Click Enable schema & dataset for Profile (identityMap) in Event tool, or MCP lab_enable_event_profile / lab_setup_event_infra with enable_for_profile:true (PATCH schema meta:immutableTags union + dataset tags.unifiedProfile).',
    create_datastream:
      'Coworker dx-api: POST https://edge.adobe.io/ee/v2/datastreamConfigs with mappingSchemaId + Adobe Experience Platform service datasets[{id,schema}]. Or Data Collection UI. See docs/COWORKER_EDGE_DATASTREAMS.md.',
    save_datastream_id:
      `Save the datastream ID in Firestore via Profile Viewer Event tool (${eventToolUrl}) or MCP lab_save_event_datastream.`,
    verify_targets: 'Call lab_list_event_targets — preset lab-event-tool-edge should include dataStreamId when config is saved.',
    optional_mcp_save_tool: 'lab_save_event_datastream',
    event_tool_url: eventToolUrl,
    schema_id: schemaId || null,
    dataset_id: datasetId || null,
  };
}
