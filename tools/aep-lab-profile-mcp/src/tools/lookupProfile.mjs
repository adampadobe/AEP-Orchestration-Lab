import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { lookupProfile } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

const NAMESPACE_HINT = 'email | ecid | crmId | loyaltyId | phone';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerLookupProfileTool(mcpServer) {
  mcpServer.registerTool(
    'lab_lookup_profile',
    {
      title: 'Lookup unified profile table',
      description:
        'GET /api/profile/table — UPS profile flattened to table rows. Params: sandbox (allowlist), namespace, identifier.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        namespace: z
          .string()
          .optional()
          .describe(`Identity namespace (default email). ${NAMESPACE_HINT}`),
        identifier: z.string().describe('Identity value (email address, ECID, etc.)'),
      },
    },
    async ({ sandbox, namespace, identifier }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const id = String(identifier || '').trim();
      if (!id) {
        return toolError('identifier is required.');
      }

      const ns = String(namespace || 'email').trim().toLowerCase();

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_lookup_profile',
        sandbox: allowed.sandbox,
        namespace: ns,
      });

      const apiResult = await lookupProfile({
        sandbox: allowed.sandbox,
        namespace: ns,
        identifier: id,
      });

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        namespace: ns,
        identifier: id,
      });
    },
  );
}
