import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { enableEventProfileInfra } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  DEFAULT_EVENT_SCHEMA_TITLE,
  resolveEventInfraNames,
} from '../framework/eventInfraNaming.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerEnableEventProfileTool(mcpServer) {
  mcpServer.registerTool(
    'lab_enable_event_profile',
    {
      title: 'Enable event schema and dataset for Profile',
      description:
        'POST /api/events/infra/step step=enableForProfile — enables the ExperienceEvent schema (union tag + identityMap alternate primary) and linked dataset for Real-Time Customer Profile. Same as Event tool **Enable schema & dataset for Profile (identityMap)**.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        schema_title: z
          .string()
          .optional()
          .describe(`ExperienceEvent schema title (default "${DEFAULT_EVENT_SCHEMA_TITLE}")`),
        dataset_name: z
          .string()
          .optional()
          .describe('Catalog dataset name; default replaces Schema with Dataset in schema_title'),
        schema_id: z.string().optional().describe('Full schema $id URI (optional if schema_title is set)'),
        dataset_id: z.string().optional().describe('Catalog dataset id (optional if dataset_name is set)'),
      },
    },
    async ({ sandbox, schema_title, dataset_name, schema_id, dataset_id }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const names = resolveEventInfraNames({ schema_title, dataset_name });

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_enable_event_profile',
        sandbox: allowed.sandbox,
        schemaTitle: names.schemaTitle,
        datasetName: names.datasetName,
      });

      const apiResult = await enableEventProfileInfra({
        sandbox: allowed.sandbox,
        schemaTitle: schema_id ? undefined : names.schemaTitle,
        schemaId: schema_id,
        datasetName: dataset_id ? undefined : names.datasetName,
        datasetId: dataset_id,
      });

      if (!apiResult.ok) {
        return fromLabApi(apiResult, {
          sandbox: allowed.sandbox,
          schema_title: names.schemaTitle,
          dataset_name: names.datasetName,
          route: '/api/events/infra/step',
          step: 'enableForProfile',
        });
      }

      const lab = apiResult.data && typeof apiResult.data === 'object' ? apiResult.data : {};

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        schema_title: names.schemaTitle,
        dataset_name: names.datasetName,
        schema_id: lab.schemaId || schema_id || null,
        dataset_id: lab.datasetId || dataset_id || null,
        schema_union: lab.schemaUnion || null,
        dataset_profile: lab.datasetProfile || null,
        alternate_primary_identity: true,
        identity_map_hint: lab.identityMapHint || null,
        message: lab.message || null,
        lab,
      });
    },
  );
}
