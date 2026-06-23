import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { getProfileConnection, profileInfraStatusAll } from '../labApiClient.mjs';
import {
  buildSandboxProfileConfigReport,
  connectionApiPathForIndustry,
} from '../sandboxConfig.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerSandboxProfileConfigTool(mcpServer) {
  mcpServer.registerTool(
    'lab_sandbox_profile_config',
    {
      title: 'Sandbox profile config manifest',
      description:
        'For a sandbox (+ optional industry): returns profile infra status, saved Firestore connection manifest (url, flowId, datasetId, schemaId, xdmKey), ready flag, missing_steps, and next_action for Coworker. Use when switching sandboxes in Coworker.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: z
          .string()
          .optional()
          .describe('Optional industry filter (omit for all 7 industries)'),
        refresh: z
          .boolean()
          .optional()
          .describe('Bypass infra status cache (?refresh=1)'),
      },
    },
    async ({ sandbox, industry, refresh }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      let industryFilter = null;
      if (industry) {
        const norm = normalizeIndustry(industry);
        if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
          return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`);
        }
        industryFilter = [norm.industry];
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_sandbox_profile_config',
        sandbox: allowed.sandbox,
        industry: industryFilter?.[0] || 'all',
      });

      const statusResult = await profileInfraStatusAll({
        sandbox: allowed.sandbox,
        refresh: refresh === true,
      });
      if (!statusResult.ok) {
        return toolError(statusResult.error || 'Failed to fetch profile infra status', {
          status: statusResult.status,
          url: statusResult.url,
        });
      }

      const statusAllIndustries = statusResult.data?.industries || {};
      const keys = industryFilter || LAB_INDUSTRY_KEYS;

      /** @type {Record<string, object>} */
      const connectionsByIndustry = {};
      const connectionErrors = {};

      await Promise.all(
        keys.map(async (key) => {
          const path = connectionApiPathForIndustry(key);
          if (!path) return;
          const connResult = await getProfileConnection({ path, sandbox: allowed.sandbox });
          if (connResult.ok) {
            connectionsByIndustry[key] = connResult.data;
          } else {
            connectionErrors[key] = {
              error: connResult.error,
              status: connResult.status,
              path,
            };
          }
        }),
      );

      const report = buildSandboxProfileConfigReport({
        sandbox: allowed.sandbox,
        statusAllIndustries,
        connectionsByIndustry,
        industryFilter: industryFilter || undefined,
      });

      return jsonResult({
        ok: true,
        ...report,
        infraFetchedAt: statusResult.data?.fetchedAt || null,
        connectionErrors: Object.keys(connectionErrors).length ? connectionErrors : undefined,
        docs: {
          firestorePattern:
            'One Firestore collection per industry ({industry}ProfileConnections), document id = sanitized sandbox name.',
          resolution:
            'profileGenerateService and profileUpdateProxy read streaming.{url,flowId,datasetId,schemaId,xdmKey} from these docs when body.streaming is omitted.',
        },
      });
    },
  );
}
