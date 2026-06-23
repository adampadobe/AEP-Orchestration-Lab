import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { setupEventInfra as setupEventInfraApi } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  DEFAULT_EVENT_SCHEMA_TITLE,
  buildEventInfraNextSteps,
  resolveEventInfraNames,
} from '../framework/eventInfraNaming.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerSetupEventInfraTool(mcpServer) {
  mcpServer.registerTool(
    'lab_setup_event_infra',
    {
      title: 'Set up event schema and dataset',
      description:
        'POST /api/events/infra/step step=setupEventInfra — creates ExperienceEvent schema, attaches Experience Event Core v2.1 + Interaction Details Lite + B2C Event Identity v1 (auto-creates tenant FGs when missing), registers ECID/Email identity descriptors, and creates dataset (same as Profile Viewer Event tool **Set up event infrastructure**). ' +
        'Default schema: AEP Lab - Event Generic - Schema; dataset name derives Schema→Dataset unless dataset_name is set. ' +
        'After success: Coworker dx-api creates Edge datastream (see docs/COWORKER_EDGE_DATASTREAMS.md), then lab_save_event_datastream or Event tool save.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        schema_title: z
          .string()
          .optional()
          .describe(`ExperienceEvent schema title (default "${DEFAULT_EVENT_SCHEMA_TITLE}")`),
        dataset_name: z
          .string()
          .optional()
          .describe('Catalog dataset name; default replaces word Schema with Dataset in schema_title'),
        enable_for_profile: z
          .boolean()
          .optional()
          .describe(
            'When true, also runs enableForProfile after setup (union tag + dataset Profile — identityMap alternate primary). Same as lab_enable_event_profile.',
          ),
      },
    },
    async ({ sandbox, schema_title, dataset_name, enable_for_profile }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const names = resolveEventInfraNames({ schema_title, dataset_name });

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_setup_event_infra',
        sandbox: allowed.sandbox,
        schemaTitle: names.schemaTitle,
        datasetName: names.datasetName,
      });

      const apiResult = await setupEventInfraApi({
        sandbox: allowed.sandbox,
        schemaTitle: names.schemaTitle,
        datasetName: names.datasetName,
        enableForProfile: enable_for_profile === true,
      });

      if (!apiResult.ok) {
        return fromLabApi(apiResult, {
          sandbox: allowed.sandbox,
          schema_title: names.schemaTitle,
          dataset_name: names.datasetName,
          route: '/api/events/infra/step',
        });
      }

      const lab = apiResult.data && typeof apiResult.data === 'object' ? apiResult.data : {};
      const nextSteps = buildEventInfraNextSteps({
        sandbox: allowed.sandbox,
        schemaId: lab.schemaId,
        datasetId: lab.datasetId,
      });

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        schema_title: names.schemaTitle,
        dataset_name: names.datasetName,
        derived_dataset_name: names.derivedDataset,
        schema_id: lab.schemaId || null,
        dataset_id: lab.datasetId || null,
        schema_meta_alt_id: lab.schemaMetaAltId || null,
        sub_steps: lab.subSteps || [],
        message: lab.message || null,
        identity_map_hint: lab.identityMapHint || null,
        schema_union: lab.schemaUnion || null,
        dataset_profile: lab.datasetProfile || null,
        next_steps: nextSteps,
        lab,
      });
    },
  );
}
