import * as z from 'zod';
import { adobeCapabilityCatalog, ajoSuppressionAddresses, genstudioExperienceList } from '../labApiClient.mjs';
import { fromLabApi } from './helpers.mjs';

/** Read-only Adobe API inventory and the first bounded operational probes. */
export function registerAdobeCapabilityTools(mcpServer) {
  mcpServer.registerTool('adobe_api_catalog', {
    title: 'List connected Adobe API capabilities',
    description:
      'Returns the reviewed 35-service Developer Console inventory, service-specific scopes, delivery phases, risk labels, and Lab use cases. ' +
      'Connected does not mean tenant-verified; use a bounded operation probe before claiming access.',
    inputSchema: { sandbox: z.string().optional().describe('Defaults to the sandbox scoped to the connected MCP key') },
  }, async (params) => fromLabApi(await adobeCapabilityCatalog(params)));

  mcpServer.registerTool('ajo_suppression_addresses', {
    title: 'Inspect AJO suppression or allow-list entries',
    description:
      'Performs a bounded read of the Journey Optimizer client suppression list or allowed list. Address and domain values are redacted by the server.',
    inputSchema: {
      sandbox: z.string().optional().describe('Defaults to the sandbox scoped to the connected MCP key'),
      type: z.enum(['client', 'allowed']).optional().describe('client = suppression list; allowed = allowed list'),
      limit: z.number().int().min(1).max(100).optional().describe('Default 20'),
    },
  }, async (params) => fromLabApi(await ajoSuppressionAddresses(params)));

  mcpServer.registerTool('genstudio_experience_list', {
    title: 'List approved GenStudio Experiences',
    description:
      'Lists bounded approved GenStudio Experience summaries for selection and orchestration. Does not retrieve signed asset renditions or mutate GenStudio.',
    inputSchema: {
      sandbox: z.string().optional().describe('Used only to authorize the MCP principal'),
      limit: z.number().int().min(1).max(50).optional().describe('Default 20'),
      cursor: z.string().max(2_000).optional(),
      channel: z.string().max(100).optional(),
      language: z.string().max(40).optional(),
    },
  }, async (params) => fromLabApi(await genstudioExperienceList(params)));
}
