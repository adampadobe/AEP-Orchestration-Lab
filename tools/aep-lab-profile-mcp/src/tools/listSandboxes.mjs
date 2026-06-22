import { listSandboxes } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerListSandboxesTool(mcpServer) {
  mcpServer.registerTool(
    'lab_list_sandboxes',
    {
      title: 'List AEP sandboxes',
      description:
        'Calls GET /api/sandboxes on the AEP Orchestration Lab. Returns active sandboxes (name, title, type). Cross-check sandbox param against MCP allowlist before generate/lookup.',
      inputSchema: {},
    },
    async () => {
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_list_sandboxes' });
      const apiResult = await listSandboxes();
      return fromLabApi(apiResult);
    },
  );
}
