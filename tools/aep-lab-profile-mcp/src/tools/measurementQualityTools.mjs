import * as z from 'zod';
import {
  assuranceSessionList,
  assuranceEventInspect,
  launchPropertyAudit,
  launchEnvironmentList,
  statusIncidentCorrelate,
} from '../labApiClient.mjs';
import { fromLabApi } from './helpers.mjs';

const sandbox = z.string().optional().describe('Defaults to the sandbox scoped to the connected MCP principal');

export function registerMeasurementQualityTools(mcpServer) {
  mcpServer.registerTool('assurance_session_list', {
    title: 'List Adobe Assurance sessions',
    description: 'Bounded read-only list of Assurance session IDs and names. A successful result verifies tenant read access.',
    inputSchema: { sandbox, limit: z.number().int().min(1).max(50).optional() },
  }, async (params) => fromLabApi(await assuranceSessionList(params)));

  mcpServer.registerTool('assurance_event_inspect', {
    title: 'Inspect Adobe Assurance event metadata',
    description: 'Reads bounded event metadata for one Assurance session. Raw payload values are omitted; only top-level payload keys are returned.',
    inputSchema: {
      sandbox,
      session_uuid: z.string().min(1).max(160),
      page: z.number().int().min(0).max(1000).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  }, async (params) => fromLabApi(await assuranceEventInspect(params)));

  mcpServer.registerTool('launch_property_audit', {
    title: 'Audit Adobe Tags properties',
    description: 'Read-only audit of visible Tags properties, enabled extensions, and enabled rules. Supply a property ID for a focused audit.',
    inputSchema: {
      sandbox,
      property_id: z.string().max(160).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  }, async (params) => fromLabApi(await launchPropertyAudit(params)));

  mcpServer.registerTool('launch_environment_list', {
    title: 'List Adobe Tags environments',
    description: 'Lists the development, staging, and production environments for one exact Tags property without changing builds or libraries.',
    inputSchema: { sandbox, property_id: z.string().min(1).max(160) },
  }, async (params) => fromLabApi(await launchEnvironmentList(params)));

  mcpServer.registerTool('status_incident_correlate', {
    title: 'Correlate Adobe Status incidents',
    description: 'Reads Adobe Status incidents for a bounded 31-day window and optionally filters by product IDs or local keywords.',
    inputSchema: {
      sandbox,
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      product_ids: z.array(z.string().min(1).max(160)).max(20).optional(),
      keywords: z.array(z.string().min(1).max(80)).max(10).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  }, async (params) => fromLabApi(await statusIncidentCorrelate(params)));
}
