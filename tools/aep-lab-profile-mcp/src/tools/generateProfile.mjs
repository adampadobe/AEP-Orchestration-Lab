import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { generateProfile } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGenerateProfileTool(mcpServer) {
  mcpServer.registerTool(
    'lab_generate_profile',
    {
      title: 'Generate / stream test profile',
      description:
        'POST /api/profile/generate — streams a sample profile via the lab saved industry connection. Requires email + sandbox on allowlist. Industry aliases normalized (telecommunications→telecom).',
      inputSchema: {
        email: z.string().email().describe('Profile email address'),
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: z
          .string()
          .optional()
          .describe('Industry key or alias (default generic). Canonical: generic, travel, fsi, telecom, retail, media, sports'),
        attributes: z
          .record(z.unknown())
          .optional()
          .describe('Optional XDM attribute overrides merged into the streamed payload'),
        append_if_existing: z
          .boolean()
          .optional()
          .describe('Reuse existing ECID when profile already exists (appendIfExisting)'),
        test_profile: z
          .boolean()
          .optional()
          .describe('Set testProfile flag on payload (lab default true when omitted)'),
      },
    },
    async ({ email, sandbox, industry, attributes, append_if_existing, test_profile }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const norm = normalizeIndustry(industry);
      if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
        return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`, {
          aliases: ['telecommunications→telecom', 'public→generic'],
        });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_generate_profile',
        sandbox: allowed.sandbox,
        industry: norm.industry,
        emailDomain: String(email).split('@')[1] || null,
      });

      const apiResult = await generateProfile({
        email,
        sandbox: allowed.sandbox,
        industry: norm.industry,
        attributes,
        append_if_existing,
        test_profile,
      });

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        industry: norm.industry,
        normalizedFrom: norm.normalizedFrom,
        aliasNote: norm.aliasNote,
      });
    },
  );
}
