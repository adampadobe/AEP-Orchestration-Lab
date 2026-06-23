import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { listEventTargets } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerListEventTargetsTool(mcpServer) {
  mcpServer.registerTool(
    'lab_list_event_targets',
    {
      title: 'List event generator targets',
      description:
        'GET /api/events/generator-targets — static presets plus per-sandbox Firestore Edge configs (Event tool / Decision lab). Use target id with lab_send_profile_event.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
      },
    },
    async ({ sandbox }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_list_event_targets',
          sandbox,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await listEventTargets({ sandbox: allowed.sandbox });

      writeAuditLog({
        keyId,
        tool: 'lab_list_event_targets',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      if (!apiResult.ok) {
        return toolError(apiResult.error || 'Lab API request failed', {
          status: apiResult.status,
          url: apiResult.url,
          response: apiResult.data,
        });
      }

      const raw = Array.isArray(apiResult.data?.targets) ? apiResult.data.targets : [];
      const targets = raw.map((t) => ({
        id: t.id || null,
        label: t.label || null,
        transport: t.transport || null,
        dataStreamId: t.dataStreamId || null,
        xdmStyle: t.xdmStyle || null,
        streamingUrl: t.streamingUrl || null,
        source: t.source || null,
      }));

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        count: targets.length,
        targets,
      });
    },
  );
}
