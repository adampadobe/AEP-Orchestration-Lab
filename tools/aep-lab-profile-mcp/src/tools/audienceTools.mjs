import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { audienceAudit, audienceDelete, audienceList } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

function allowSandbox(sandbox) {
  const allowed = assertSandboxAllowed(sandbox);
  if (!allowed.ok) {
    return {
      error: toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes }),
      sandbox: '',
    };
  }
  return { error: null, sandbox: allowed.sandbox };
}

/**
 * Register governed AEP audience inventory, audit, and deletion tools.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerAudienceTools(mcpServer) {
  mcpServer.registerTool(
    'lab_audience_list',
    {
      title: 'List and search AEP audiences',
      description:
        'Read-only governed inventory from the AEP Segmentation /audiences endpoint. ' +
        'Use this to identify candidates by exact ID, name, origin, lifecycle, and last-updated date before lab_audience_audit. ' +
        'This tool never deletes or changes an audience.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name; must match the user-generated MCP key scope'),
        name: z.string().max(200).optional().describe('Case-insensitive audience name search'),
        start: z.number().int().min(0).optional().describe('Page start offset (default 0)'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size (default 50, max 100)'),
        include_inactive: z.boolean().optional().describe('Include inactive audiences (default true)'),
      },
    },
    async (params) => {
      const started = Date.now();
      const check = allowSandbox(params.sandbox);
      if (check.error) return check.error;
      const result = await audienceList({ ...params, sandbox: check.sandbox });
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_audience_list',
        sandbox: check.sandbox,
        result: result.ok ? 'ok' : 'error',
        count: result.ok ? result.data?.count : null,
        durationMs: Date.now() - started,
      });
      return fromLabApi(result, { sandbox: check.sandbox });
    },
  );

  mcpServer.registerTool(
    'lab_audience_audit',
    {
      title: 'Audit one AEP audience before deletion',
      description:
        'Read-only required pre-delete review for one exact audience ID. Returns current name, origin, lifecycle, dates, ' +
        'dependencies/dependents, limitations of the audit, and the exact expected_name needed for deletion. ' +
        'Show the result to the colleague and ask for explicit confirmation; do not call delete in the same turn unless they already confirmed that exact ID and name.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name; must match the user-generated MCP key scope'),
        audience_id: z.string().min(1).describe('Exact AEP audience id field (not a guessed name or audienceId alias)'),
      },
    },
    async ({ sandbox, audience_id }) => {
      const started = Date.now();
      const check = allowSandbox(sandbox);
      if (check.error) return check.error;
      const result = await audienceAudit({ sandbox: check.sandbox, audience_id });
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_audience_audit',
        sandbox: check.sandbox,
        identifier: audience_id,
        result: result.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      return fromLabApi(result, { sandbox: check.sandbox, audienceId: audience_id });
    },
  );

  mcpServer.registerTool(
    'lab_audience_delete',
    {
      title: 'Delete one explicitly confirmed AEP audience',
      description:
        'DESTRUCTIVE AND IRREVERSIBLE. Call only after lab_audience_audit and explicit colleague confirmation of the exact ' +
        'sandbox, audience_id, and expected_name. The server re-reads the audience and fails closed if its ID/name changed. ' +
        'Never infer confirmation from a general cleanup request and never batch-delete audiences.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name; must match the user-generated MCP key scope'),
        audience_id: z.string().min(1).describe('Exact id returned by lab_audience_audit'),
        expected_name: z.string().min(1).describe('Exact current name returned by lab_audience_audit'),
        confirmed: z.literal(true).describe('True only after the colleague explicitly confirms this exact audience'),
      },
    },
    async ({ sandbox, audience_id, expected_name, confirmed }) => {
      const started = Date.now();
      const check = allowSandbox(sandbox);
      if (check.error) return check.error;
      const result = await audienceDelete({
        sandbox: check.sandbox,
        audience_id,
        expected_name,
        confirmed,
      });
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_audience_delete',
        sandbox: check.sandbox,
        identifier: audience_id,
        result: result.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      return fromLabApi(result, { sandbox: check.sandbox, audienceId: audience_id });
    },
  );
}
