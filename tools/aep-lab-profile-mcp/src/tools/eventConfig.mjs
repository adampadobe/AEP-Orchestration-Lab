import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { getEventConfig as getEventConfigApi } from '../labApiClient.mjs';
import { getSharedEventConfig, saveSharedEventConfig } from '../eventConfigStore.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { deriveDatasetNameFromSchemaTitle } from '../framework/eventInfraNaming.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

function serializeRecord(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    datastreamId: record.datastreamId || null,
    datastreamTitle: record.datastreamTitle || null,
    schemaTitle: record.schemaTitle || null,
    schemaId: record.schemaId || null,
    datasetName: record.datasetName || null,
    updatedAt: record.updatedAt || null,
  };
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerEventConfigTools(mcpServer) {
  mcpServer.registerTool(
    'lab_get_event_config',
    {
      title: 'Get saved Edge event config',
      description:
        'Reads per-sandbox Firestore eventEdgeConfig (datastream ID, schema title/id, dataset name). ' +
        'Same store as Profile Viewer Event tool. Use before/after lab_save_event_datastream.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        prefer_firestore: z
          .boolean()
          .optional()
          .describe('When true, read Firestore shared doc directly (default false uses GET /api/events/config)'),
      },
    },
    async ({ sandbox, prefer_firestore }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_get_event_config',
        sandbox: allowed.sandbox,
      });

      if (prefer_firestore === true) {
        const record = await getSharedEventConfig(allowed.sandbox);
        return jsonResult({
          ok: true,
          sandbox: allowed.sandbox,
          source: 'firestore_shared',
          record: serializeRecord(record),
          has_datastream: !!(record && record.datastreamId),
        });
      }

      const apiResult = await getEventConfigApi({ sandbox: allowed.sandbox });
      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox, route: '/api/events/config' });
      }

      const record = apiResult.data?.record;
      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        source: apiResult.data?.storage || 'api',
        record: serializeRecord(record),
        has_datastream: !!(record && record.datastreamId),
      });
    },
  );

  mcpServer.registerTool(
    'lab_save_event_datastream',
    {
      title: 'Save Edge datastream ID for sandbox',
      description:
        'Writes datastreamId (+ optional schema/dataset metadata) to Firestore eventEdgeConfig shared doc — ' +
        'enables lab-event-tool-edge preset for lab_send_profile_event. ' +
        'Create the datastream via Coworker dx-api (Edge Configuration) or Data Collection UI first; this tool only persists the ID.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        datastream_id: z.string().describe('Edge configuration / datastream ID from dx-api or Data Collection'),
        schema_title: z.string().optional().describe('Optional schema title to persist with config'),
        schema_id: z.string().optional().describe('Optional schema $id to persist with config'),
        dataset_name: z.string().optional().describe('Optional dataset name to persist with config'),
        datastream_title: z.string().optional().describe('Optional human label for the datastream'),
      },
    },
    async ({ sandbox, datastream_id, schema_title, schema_id, dataset_name, datastream_title }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const dsId = String(datastream_id || '').trim();
      if (!dsId) {
        return toolError('datastream_id is required.');
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_save_event_datastream',
        sandbox: allowed.sandbox,
      });

      /** @type {Record<string, string>} */
      const patch = { datastreamId: dsId };
      if (schema_title != null && String(schema_title).trim()) {
        patch.schemaTitle = String(schema_title).trim();
      }
      if (schema_id != null && String(schema_id).trim()) {
        patch.schemaId = String(schema_id).trim();
      }
      if (dataset_name != null && String(dataset_name).trim()) {
        patch.datasetName = String(dataset_name).trim();
      } else if (patch.schemaTitle) {
        patch.datasetName = deriveDatasetNameFromSchemaTitle(patch.schemaTitle);
      }
      if (datastream_title != null && String(datastream_title).trim()) {
        patch.datastreamTitle = String(datastream_title).trim();
      }

      let record;
      try {
        record = await saveSharedEventConfig(allowed.sandbox, patch);
      } catch (err) {
        return toolError(String(err.message || err), { sandbox: allowed.sandbox });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        record: serializeRecord(record),
        next_step: 'Call lab_list_event_targets — lab-event-tool-edge should include this dataStreamId.',
      });
    },
  );
}
