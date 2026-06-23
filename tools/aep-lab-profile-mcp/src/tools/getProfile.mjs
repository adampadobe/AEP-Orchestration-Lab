import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { getAttributeOwnership, lookupProfile } from '../labApiClient.mjs';
import { summarizeProfileTable } from '../profileMerge.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const NAMESPACE_HINT = 'email | ecid | crmId | loyaltyId | phone';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGetProfileTool(mcpServer) {
  mcpServer.registerTool(
    'lab_get_profile',
    {
      title: 'Get profile with Coworker metadata',
      description:
        'Fetch UPS profile via GET /api/profile/table plus attribute-ownership hints and a Coworker-friendly summary (writability, industries). Prefer over lab_lookup_profile when discussing edits or activity.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        namespace: z
          .string()
          .optional()
          .describe(`Identity namespace (default email). ${NAMESPACE_HINT}`),
        identifier: z.string().describe('Identity value (email address, ECID, etc.)'),
        include_attribute_ownership: z
          .boolean()
          .optional()
          .describe('Include GET /api/profile/attribute-ownership map (default true)'),
      },
    },
    async ({ sandbox, namespace, identifier, include_attribute_ownership }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const id = String(identifier || '').trim();
      if (!id) {
        return toolError('identifier is required.');
      }

      const ns = String(namespace || 'email').trim().toLowerCase();
      const includeOwnership = include_attribute_ownership !== false;

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_get_profile',
        sandbox: allowed.sandbox,
        namespace: ns,
      });

      const profileResult = await lookupProfile({
        sandbox: allowed.sandbox,
        namespace: ns,
        identifier: id,
      });

      if (!profileResult.ok) {
        return fromLabApi(profileResult, {
          sandbox: allowed.sandbox,
          namespace: ns,
          identifier: id,
        });
      }

      let attributeOwnership = null;
      if (includeOwnership) {
        const ownershipResult = await getAttributeOwnership();
        attributeOwnership = ownershipResult.ok ? ownershipResult.data : { error: ownershipResult.error };
      }

      const profile = profileResult.data || {};
      const summary = summarizeProfileTable(profile);

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        namespace: ns,
        identifier: id,
        summary,
        profile,
        attributeOwnership,
        coworkerHints: {
          profileEmail: profile.profileEmail || (ns === 'email' ? id : null),
          ecid: profile.ecid || null,
          writableIndustries: Object.keys(summary.writableByIndustry || {}),
          updatePattern:
            'Use lab_update_profile with attribute_changes — server fetches this snapshot, merges, and POSTs full writable industry snapshot to /api/profile/update (not minimal deltas).',
        },
      });
    },
  );
}
