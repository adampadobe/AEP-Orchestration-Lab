import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { getRecentProfiles } from '../labApiClient.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerListRecentProfilesTool(mcpServer) {
  mcpServer.registerTool(
    'lab_list_recent_profiles',
    {
      title: 'List recently generated profiles',
      description:
        'GET /api/lab/recent-profiles — same Firestore-backed list as Profile Viewer "Recently generated" dropdown. ' +
        'Synced when Portal or MCP generates profiles (source portal | mcp). Requires user MCP key or Firebase uid scope.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
      },
    },
    async ({ sandbox }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await getRecentProfiles({ sandbox: allowed.sandbox });
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        items: apiResult.data?.items,
        note: 'Newest first, max 20 per uid+sandbox. summaryLabel matches Portal dropdown format.',
      });
    },
  );
}
