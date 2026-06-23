import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { enableProfileInfra } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { routePrefixForIndustry } from '../industryRoutes.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerEnableProfileTool(mcpServer) {
  mcpServer.registerTool(
    'lab_enable_profile',
    {
      title: 'Enable profile on industry infra',
      description:
        'POST /api/{industry}-profile-infra/enable-profile — enables profile after infra steps. Same X-AEP-Lab-Mcp-Key auth and sandbox allowlist as other tools.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: z.string().describe('Industry key (generic, travel, fsi, telecom, retail, media, sports)'),
      },
    },
    async ({ sandbox, industry }) => {
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
        tool: 'lab_enable_profile',
        sandbox: allowed.sandbox,
        industry: norm.industry,
      });

      const apiResult = await enableProfileInfra({
        routePrefix,
        sandbox: allowed.sandbox,
      });

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        industry: norm.industry,
        route: `/api/${routePrefix}-infra/enable-profile`,
      });
    },
  );
}
