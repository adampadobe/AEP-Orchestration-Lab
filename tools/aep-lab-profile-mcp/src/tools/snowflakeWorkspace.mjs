import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { snowflakeWorkspaceRequest } from '../labApiClient.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult, toolError } from './helpers.mjs';
import { requireUserMcpKeyForSnowflake } from './snowflakeTools.mjs';

const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]{0,254}$/);
const scalar = z.union([z.string().max(65536), z.number().finite(), z.boolean(), z.null()]);
const values = z.record(identifier, scalar).refine(
  (record) => Object.keys(record).length > 0 && Object.keys(record).length <= 100,
  'Provide between 1 and 100 columns',
);
const column = z.object({
  name: identifier,
  type: z.string().min(1).max(100).describe('Supported Snowflake scalar type, optionally with precision/scale or length'),
  nullable: z.boolean().optional(),
}).strict();
const grant = {
  table: identifier,
  role: identifier,
  privileges: z.array(z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES'])).min(1).max(5),
};
export const snowflakeChangeOperation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create_table'), table: identifier, columns: z.array(column).min(1).max(100) }).strict(),
  z.object({ kind: z.literal('add_column'), table: identifier, column }).strict(),
  z.object({ kind: z.literal('insert'), table: identifier, values }).strict(),
  z.object({ kind: z.literal('update'), table: identifier, values, where: values }).strict(),
  z.object({ kind: z.literal('delete'), table: identifier, where: values }).strict(),
  z.object({ kind: z.literal('grant'), ...grant }).strict(),
  z.object({ kind: z.literal('revoke'), ...grant }).strict(),
]);

const definitions = [
  ['capabilities', 'Inspect Snowflake workspace policy and connection readiness',
    'Inspect configured access and limits without treating saved credentials as proof of Snowflake privileges.', {}],
  ['objects_list', 'List Snowflake workspace objects',
    'List tables, views or schemas within the administrator-approved workspace.',
    { kind: z.enum(['tables', 'views', 'schemas']), database: identifier.optional(), schema: identifier.optional(), limit: z.number().int().min(1).max(500).optional() }],
  ['object_describe', 'Describe a Snowflake table',
    'Read column metadata for one exact table in the approved workspace.',
    { database: identifier.optional(), schema: identifier.optional(), name: identifier }],
  ['query_submit', 'Submit a read-only Snowflake SQL job',
    'Submit one SELECT/WITH query with scalar bindings. Use a fresh request_id for new work; reuse it only to recover the same submission. Never resubmit ambiguous outcomes with a new ID. Access is bounded by the configured Snowflake role, not an SQL schema parser.',
    { sql: z.string().min(1).max(50000), bindings: z.array(scalar).max(100).optional(), request_id: z.string().uuid() }],
  ['query_status', 'Inspect a Snowflake query job',
    'Inspect an owned durable query job. Unknown outcomes require reconciliation, not resubmission.',
    { job_id: z.string().min(1).max(200) }],
  ['query_results', 'Fetch bounded Snowflake query results',
    'Fetch a bounded page for an owned completed query; retain continuation and truncation metadata.',
    { job_id: z.string().min(1).max(200), offset: z.number().int().min(0).max(1000000).optional(), limit: z.number().int().min(1).max(500).optional() }],
  ['query_cancel', 'Cancel an owned Snowflake query',
    'Request cancellation of one owned query. Cancellation is not proof of rollback.',
    { job_id: z.string().min(1).max(200) }],
  ['data_check', 'Check Snowflake data quality',
    'Compute a row count, null count, duplicate-value groups, or maximum freshness timestamp for one workspace table. Freshness reports evidence, not an invented SLA.',
    { table: identifier, column: identifier.optional(), check: z.enum(['row_count', 'null_count', 'duplicates', 'freshness']) }],
  ['change_preview', 'Preview a Snowflake table, data or grant change',
    'Prepare one typed operation and inspect exact SQL, bound values, target and expiry. Does not execute changes. Human approval must be recorded separately through the authenticated Portal API; the MCP cannot approve its own changes.',
    { operation: snowflakeChangeOperation }],
  ['change_apply', 'Apply a separately approved Snowflake change',
    'Consume one unexpired, server-approved preview exactly once. Rechecks connection and policy. Never automatically retry an unknown result. DDL is not transactionally reversible.',
    { preview_id: z.string().min(1).max(200) }],
  ['grants_inspect', 'Inspect Snowflake role grants',
    'Inspect grants for the workspace role or an administrator-allowlisted grant target.',
    { role: identifier.optional() }],
  ['agents_list', 'List configured Snowflake Cortex Agents',
    'List approved Cortex Agent targets. An allowlist entry is configuration, not verified account availability.', {}],
  ['agent_run', 'Delegate a question to a Snowflake Cortex Agent',
    'Invoke one approved Cortex Agent using its native REST API, optionally continuing a thread. Can incur AI charges and invoke the agent’s configured tools. This is not a formal A2A endpoint. Never automatically replay an ambiguous run.',
    {
      agent: z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]*\.[A-Za-z_][A-Za-z0-9_$]*\.[A-Za-z_][A-Za-z0-9_$]*$/),
      message: z.string().min(1).max(20000), request_id: z.string().uuid(),
      thread_id: z.number().int().nonnegative().safe().optional(),
      parent_message_id: z.number().int().nonnegative().safe().optional(),
    }],
];

export const SNOWFLAKE_WORKSPACE_TOOL_NAMES = definitions.map(([action]) => `lab_snowflake_${action}`);

export function registerSnowflakeWorkspaceTools(server) {
  for (const [action, title, description, input] of definitions) {
    const name = `lab_snowflake_${action}`;
    server.registerTool(name, {
      title, description,
      inputSchema: { sandbox: z.string().min(1).max(100), ...input },
      annotations: {
        readOnlyHint: !['query_submit', 'query_cancel', 'change_apply', 'agent_run'].includes(action),
        destructiveHint: ['query_cancel', 'change_apply', 'agent_run'].includes(action),
        idempotentHint: !['change_preview', 'query_submit', 'query_cancel', 'change_apply', 'agent_run'].includes(action),
        openWorldHint: true,
      },
    }, async ({ sandbox, ...args }) => {
      const access = requireUserMcpKeyForSnowflake();
      if (!access.ok) return toolError(access.message, { code: access.code });
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      if (action === 'agent_run' && ((args.thread_id === undefined) !== (args.parent_message_id === undefined))) {
        return toolError('thread_id and parent_message_id must be supplied together.', { code: 'INVALID_INPUT' });
      }
      const started = Date.now();
      const response = await snowflakeWorkspaceRequest({ ...args, sandbox: allowed.sandbox, action });
      const result = response.data?.result;
      writeAuditLog({
        keyId: getRequestKeyId(), tool: name, sandbox: allowed.sandbox,
        result: response.ok && result?.ok === true ? 'ok' : 'error', durationMs: Date.now() - started,
      });
      if (!response.ok || result?.ok !== true) {
        return toolError(result?.error?.message || response.error || 'Snowflake workspace request failed.', {
          status: response.status, ...(result || response.data || {}),
        });
      }
      return jsonResult(result);
    });
  }
}
