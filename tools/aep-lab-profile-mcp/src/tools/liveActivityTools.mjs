import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import {
  liveActivityDeleteTemplate,
  liveActivityListRuns,
  liveActivityListTemplates,
  liveActivityPreflight,
  liveActivitySend,
  liveActivityUpsertTemplate,
  lookupProfile,
} from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { checkEdgeSendRate } from '../rateLimiter.mjs';
import { extractEcidFromProfileTable } from '../framework/eventIdentity.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const variableDefinition = z.object({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  label: z.string().optional(),
  description: z.string().optional(),
  path: z
    .string()
    .describe(
      'Dot path inside recipients.0.context.requestPayload.aps.attributes, content-state, or alert',
    ),
  type: z.enum(['string', 'number', 'boolean', 'json']).optional(),
  required: z.boolean().optional(),
  example: z.unknown().optional(),
});

function allowSandbox(sandbox) {
  const allowed = assertSandboxAllowed(sandbox);
  if (!allowed.ok) {
    return {
      error: toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes }),
    };
  }
  return { sandbox: allowed.sandbox };
}

async function resolveEcid({ sandbox, ecid, identifier, namespace }) {
  const direct = String(ecid || '').trim();
  if (direct) return { ecid: direct, lookup: null };
  const value = String(identifier || '').trim();
  if (!value) return { ecid: '', lookup: null };
  const profile = await lookupProfile({
    sandbox,
    namespace: String(namespace || 'email').trim(),
    identifier: value,
  });
  if (!profile.ok) return { ecid: '', lookup: profile };
  return {
    ecid: extractEcidFromProfileTable(profile.data) || '',
    lookup: profile,
  };
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerLiveActivityTools(mcpServer) {
  mcpServer.registerTool(
    'lab_live_activity_list_templates',
    {
      title: 'List Live Activity customer templates',
      description:
        'Lists built-in and user-owned Live Activity templates for the MCP principal and sandbox. ' +
        'Use this first when the colleague names a customer or asks what can be tested. User templates are shared with the Portal Live Activities page.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name on this MCP key allowlist'),
        customer: z.string().optional().describe('Optional case-insensitive customer filter'),
      },
    },
    async ({ sandbox, customer }) => {
      const check = allowSandbox(sandbox);
      if (check.error) return check.error;
      const result = await liveActivityListTemplates({ sandbox: check.sandbox });
      if (!result.ok) return fromLabApi(result, { sandbox: check.sandbox });
      let templates = Array.isArray(result.data?.templates) ? result.data.templates : [];
      if (customer) {
        const needle = String(customer).trim().toLowerCase();
        templates = templates.filter((row) =>
          `${row.customer || ''} ${row.name || ''}`.toLowerCase().includes(needle));
      }
      return jsonResult({
        ok: true,
        sandbox: check.sandbox,
        count: templates.length,
        templates: templates.map((row) => ({
          id: row.id,
          name: row.name,
          customer: row.customer,
          description: row.description,
          source: row.source,
          readOnly: row.readOnly,
          version: row.version || 1,
          variableDefinitions: row.variableDefinitions || [],
        })),
        next:
          'Choose one template ID. Resolve the recipient and call lab_live_activity_preflight; it returns only the fields still needed.',
      });
    },
  );

  mcpServer.registerTool(
    'lab_live_activity_get_template',
    {
      title: 'Get Live Activity template',
      description:
        'Returns one template and its required variables. Read-only; use before editing or explaining a customer template.',
      inputSchema: {
        sandbox: z.string(),
        template_id: z.string(),
      },
    },
    async ({ sandbox, template_id }) => {
      const check = allowSandbox(sandbox);
      if (check.error) return check.error;
      const result = await liveActivityListTemplates({ sandbox: check.sandbox });
      if (!result.ok) return fromLabApi(result, { sandbox: check.sandbox });
      const template = (result.data?.templates || []).find((row) => row.id === template_id);
      if (!template) return toolError('Live Activity template not found.');
      return jsonResult({ ok: true, sandbox: check.sandbox, template });
    },
  );

  mcpServer.registerTool(
    'lab_live_activity_profile_context',
    {
      title: 'Resolve Live Activity recipient profile',
      description:
        'Looks up an AEP profile and resolves its ECID for AJO unitary execution. ' +
        'Push-token fields are diagnostic only; the Live Activity request uses ECID as recipients[0].userId.',
      inputSchema: {
        sandbox: z.string(),
        identifier: z.string().describe('Email, ECID, CRM ID, loyalty ID, or phone value'),
        namespace: z.enum(['email', 'ecid', 'crmId', 'loyaltyId', 'phone']).optional(),
      },
    },
    async ({ sandbox, identifier, namespace }) => {
      const check = allowSandbox(sandbox);
      if (check.error) return check.error;
      const profile = await lookupProfile({
        sandbox: check.sandbox,
        namespace: namespace || 'email',
        identifier,
      });
      if (!profile.ok) return fromLabApi(profile, { sandbox: check.sandbox });
      const resolvedEcid = extractEcidFromProfileTable(profile.data);
      return jsonResult({
        ok: true,
        sandbox: check.sandbox,
        identifier,
        namespace: namespace || 'email',
        found: !!profile.data,
        ecid: resolvedEcid || null,
        ready: !!resolvedEcid,
        note:
          'Use ecid in lab_live_activity_preflight. The AJO unitary payload does not take the device push token directly.',
      });
    },
  );

  mcpServer.registerTool(
    'lab_live_activity_preflight',
    {
      title: 'Preflight Live Activity execution',
      description:
        'Required read-only step before sending. Resolves an ECID from identifier when needed, validates the customer template, ' +
        'and returns missingFields for Coworker to ask the colleague. When ready, returns a redacted preview and short-lived preflightId. ' +
        'Do not invent missing values and do not send until the colleague explicitly confirms the summary.',
      inputSchema: {
        sandbox: z.string(),
        template_id: z.string(),
        identifier: z.string().optional().describe('Profile identifier, normally email'),
        namespace: z.enum(['email', 'ecid', 'crmId', 'loyaltyId', 'phone']).optional(),
        ecid: z.string().optional().describe('Direct ECID; otherwise resolved from identifier'),
        campaign_id: z.string().optional(),
        live_activity_id: z.string().optional(),
        event: z.enum(['start', 'update', 'end']).optional(),
        variables: z.record(z.unknown()).optional().describe('Template-specific values requested by missingFields'),
      },
    },
    async (params) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const check = allowSandbox(params.sandbox);
      if (check.error) return check.error;
      const resolved = await resolveEcid({
        sandbox: check.sandbox,
        ecid: params.ecid,
        identifier: params.identifier,
        namespace: params.namespace,
      });
      if (resolved.lookup && !resolved.lookup.ok) {
        return fromLabApi(resolved.lookup, { sandbox: check.sandbox });
      }
      const result = await liveActivityPreflight({
        ...params,
        sandbox: check.sandbox,
        ecid: resolved.ecid,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_live_activity_preflight',
        sandbox: check.sandbox,
        identifier: params.identifier || null,
        result: result.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      return fromLabApi(result, {
        sandbox: check.sandbox,
        ecidResolvedFromProfile: !params.ecid && !!resolved.ecid,
      });
    },
  );

  mcpServer.registerTool(
    'lab_live_activity_send',
    {
      title: 'Send confirmed Live Activity',
      description:
        'IMPORTANT EXTERNAL ACTION: sends an AJO Live Activity unitary execution. ' +
        'Call only after lab_live_activity_preflight returned ready=true and the colleague explicitly confirmed its summary. ' +
        'Requires the short-lived preflight_id and confirmed=true. The server enforces exact-payload integrity and idempotency.',
      inputSchema: {
        sandbox: z.string(),
        preflight_id: z.string().uuid(),
        confirmed: z.literal(true).describe('Must be true only after explicit colleague confirmation'),
        idempotency_key: z.string().optional().describe('Stable retry key; defaults to preflight_id'),
      },
    },
    async (params) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const check = allowSandbox(params.sandbox);
      if (check.error) return check.error;
      const rate = checkEdgeSendRate(keyId);
      if (!rate.ok) {
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }
      const result = await liveActivitySend({ ...params, sandbox: check.sandbox });
      writeAuditLog({
        keyId,
        tool: 'lab_live_activity_send',
        sandbox: check.sandbox,
        result: result.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      return fromLabApi(result, { sandbox: check.sandbox });
    },
  );

  mcpServer.registerTool(
    'lab_live_activity_upsert_template',
    {
      title: 'Create or update customer Live Activity template',
      description:
        'Creates or versions a user-owned customer template scoped to this MCP principal and sandbox. ' +
        'The template is also mirrored to the Portal Live Activities saved-template list. ' +
        'Use variable_definitions to tell Coworker which customer-specific values to request during preflight.',
      inputSchema: {
        sandbox: z.string(),
        template_id: z.string().optional().describe('Existing custom ID to update; omit to create'),
        customer: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        template: z.record(z.unknown()).describe('Complete one-recipient AJO unitary payload template'),
        variable_definitions: z.array(variableDefinition).max(40).optional(),
        validate_only: z
          .boolean()
          .optional()
          .describe('Validate and preview the template record without saving (recommended before first create)'),
      },
    },
    async (params) => {
      const check = allowSandbox(params.sandbox);
      if (check.error) return check.error;
      const result = await liveActivityUpsertTemplate({ ...params, sandbox: check.sandbox });
      return fromLabApi(result, { sandbox: check.sandbox });
    },
  );

  mcpServer.registerTool(
    'lab_live_activity_delete_template',
    {
      title: 'Delete custom Live Activity template',
      description:
        'Destructive: deletes a user-owned template from MCP storage and the Portal saved-template mirror. ' +
        'Never delete a template unless the colleague explicitly asks and confirms the exact template ID.',
      inputSchema: {
        sandbox: z.string(),
        template_id: z.string(),
        confirmed: z.literal(true),
      },
    },
    async ({ sandbox, template_id }) => {
      const check = allowSandbox(sandbox);
      if (check.error) return check.error;
      const result = await liveActivityDeleteTemplate({
        sandbox: check.sandbox,
        template_id,
      });
      return fromLabApi(result, { sandbox: check.sandbox });
    },
  );

  mcpServer.registerTool(
    'lab_live_activity_list_runs',
    {
      title: 'List recent Live Activity tests',
      description: 'Read-only audit view of recent Live Activity preflight executions for this principal and sandbox.',
      inputSchema: {
        sandbox: z.string(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ sandbox, limit }) => {
      const check = allowSandbox(sandbox);
      if (check.error) return check.error;
      const result = await liveActivityListRuns({ sandbox: check.sandbox, limit });
      return fromLabApi(result, { sandbox: check.sandbox });
    },
  );
}
