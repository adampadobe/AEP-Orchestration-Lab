import * as z from 'zod';
import { getIndustryPlaybook } from '../framework/labFramework.mjs';
import { LAB_INDUSTRY_KEYS } from '../industries.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGetIndustryPlaybookTool(mcpServer) {
  mcpServer.registerTool(
    'lab_get_industry_playbook',
    {
      title: 'Get per-industry lab playbook',
      description:
        'Industry param returns persona field groups, tenant XDM paths, testProfile + preferredLanguage rules, dataflow manifest shape, segment_hints + semantics, failure_modes, infra prerequisites, and example Coworker prompt chain. ' +
        'Omit industry to list all playbooks. Complements lab_generate_profile (randomize + segment_hint). ' +
        'Resource: lab://framework/industries/{industry}.',
      inputSchema: {
        industry: z
          .string()
          .optional()
          .describe(
            `Canonical industry key or alias (telecom/telco, public→generic). Omit for all. Supported: ${LAB_INDUSTRY_KEYS.join(', ')}`,
          ),
      },
    },
    async ({ industry }) => {
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_get_industry_playbook',
        industry: industry || 'all',
      });

      const result = getIndustryPlaybook(industry);
      if (!result.ok) {
        return toolError(result.error, { supported: result.supported });
      }
      return jsonResult(result);
    },
  );
}
