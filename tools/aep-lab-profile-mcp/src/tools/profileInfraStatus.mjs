import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { profileInfraStatusAll } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerProfileInfraStatusTool(mcpServer) {
  mcpServer.registerTool(
    'lab_profile_infra_status',
    {
      title: 'Profile infra status (all industries)',
      description:
        'GET /api/profile-infra/status-all — Profile-enabled flags for all 7 industries in one sandbox. Optional industry filters the response to one key after fetch.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (must be on MCP allowlist)'),
        industry: z
          .string()
          .optional()
          .describe('Optional industry filter (aliases normalized; omit for all industries)'),
        refresh: z
          .boolean()
          .optional()
          .describe('When true, bypass Firestore cache (?refresh=1)'),
      },
    },
    async ({ sandbox, industry, refresh }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_profile_infra_status',
        sandbox: allowed.sandbox,
        industry: industry || null,
      });

      const apiResult = await profileInfraStatusAll({
        sandbox: allowed.sandbox,
        refresh: refresh === true,
      });
      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox });
      }

      const payload = apiResult.data;
      if (!industry) {
        return jsonResult({ ok: true, sandbox: allowed.sandbox, ...payload });
      }

      const norm = normalizeIndustry(industry);
      if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
        return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`, {
          normalizedFrom: norm.normalizedFrom,
        });
      }

      const industries = payload && payload.industries ? payload.industries : {};
      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        industry: norm.industry,
        normalizedFrom: norm.normalizedFrom,
        aliasNote: norm.aliasNote,
        status: industries[norm.industry] ?? { error: 'No status returned for industry' },
        fetchedAt: payload.fetchedAt,
      });
    },
  );
}
