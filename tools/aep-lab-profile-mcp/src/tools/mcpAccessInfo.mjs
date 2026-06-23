import * as z from 'zod';
import { writeAuditLog } from '../auditLog.mjs';
import { getPrincipalAccess, getRequestKeyId } from '../requestContext.mjs';
import { jsonResult } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerMcpAccessInfoTool(mcpServer) {
  mcpServer.registerTool(
    'lab_mcp_access_info',
    {
      title: 'MCP access info (read-only)',
      description:
        'Returns the current MCP principal keyId (SHA-256 prefix, not the secret), allowed sandboxes, principal label, and allowlist source (Firestore mcpSandboxAllowlist doc or env fallback). No secrets exposed.',
      inputSchema: {},
    },
    async () => {
      const keyId = getRequestKeyId();
      const access = getPrincipalAccess();

      writeAuditLog({
        keyId,
        tool: 'lab_mcp_access_info',
        result: 'ok',
      });

      return jsonResult({
        ok: true,
        keyId,
        allowedSandboxes: access?.allowedSandboxes || [],
        principalLabel: access?.principalLabel || null,
        allowlistSource: access?.source || 'unknown',
        note: 'Ops can add Firestore doc mcpSandboxAllowlist/{keyId} with allowedSandboxes[] and principalLabel to grant sandboxes without redeploy.',
      });
    },
  );
}
