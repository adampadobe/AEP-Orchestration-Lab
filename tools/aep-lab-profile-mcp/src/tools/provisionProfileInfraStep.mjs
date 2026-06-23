import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { provisionProfileInfraStep } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { routePrefixForIndustry } from '../industryRoutes.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

const KNOWN_STEPS = [
  'createSchema',
  'attachFieldGroups',
  'createDataset',
  'createDataflow',
  'saveConnection',
  'all_core',
];

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerProvisionProfileInfraStepTool(mcpServer) {
  mcpServer.registerTool(
    'lab_provision_profile_infra_step',
    {
      title: 'Run profile infra provisioning step',
      description:
        'POST /api/{industry}-profile-infra/step — runs one wizard step (e.g. all_core, createSchema). Same X-AEP-Lab-Mcp-Key auth and sandbox allowlist as other tools.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: z.string().describe('Industry key (generic, travel, fsi, telecom, retail, media, sports)'),
        step: z
          .string()
          .describe(`Provisioning step name. Common: ${KNOWN_STEPS.join(', ')}`),
      },
    },
    async ({ sandbox, industry, step }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const norm = normalizeIndustry(industry);
      if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
        return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`);
      }

      const routePrefix = routePrefixForIndustry(norm.industry);
      if (!routePrefix) {
        return toolError(`No route prefix for industry "${norm.industry}".`);
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_provision_profile_infra_step',
        sandbox: allowed.sandbox,
        industry: norm.industry,
        step,
      });

      const apiResult = await provisionProfileInfraStep({
        routePrefix,
        sandbox: allowed.sandbox,
        step: String(step || '').trim(),
      });

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        industry: norm.industry,
        step,
        route: `/api/${routePrefix}-infra/step`,
      });
    },
  );
}
