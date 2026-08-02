import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { checkEdgeSendRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { sendProfileEventSequence } from '../framework/sendProfileEventSequence.mjs';
import { buildEventsFromEventTypes } from '../framework/demoEventPacks.mjs';
import { sanitizeCoworkerEventSteps } from '../framework/sanitizeCoworkerEventParams.mjs';
import { INDUSTRY_EVENT_IDS } from '../framework/industryEventPayload.mjs';
import { jsonResult, toolError } from './helpers.mjs';

const eventStepSchema = z.object({
  event_type: z.string().describe('Any XDM eventType string — server builds XDM; do not pass xdm blobs'),
  channel: z.string().optional().describe('Interaction channel (web, mobile, …) — server adds interactionDetails.core.channel'),
  timestamp: z.string().optional(),
  industry: z
    .string()
    .optional()
    .describe(`Optional governed rich event industry: ${INDUSTRY_EVENT_IDS.join(', ')}`),
  industry_fields: z
    .record(z.unknown())
    .optional()
    .describe('Optional flat, allowlisted fields for the selected industry; omit for safe sample defaults'),
});

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerSendProfileEventsBatchTool(mcpServer) {
  mcpServer.registerTool(
    'lab_send_profile_events_batch',
    {
      title: 'Send multiple profile experience events',
      description:
        'Convenience wrapper: sends multiple Experience Events for one profile via sequential POST /api/events/generator calls ' +
        '(one event per request, default 800ms delay — NOT one Edge bulk payload). Server builds minimal XDM by default. ' +
        'Coworker/agents: pass events[] with event_type (+ optional channel, timestamp, industry, industry_fields per step) OR event_types[] shorthand. ' +
        'Industry steps are validated, nested under public.{industry}, and sent as full XDM. ' +
        'NEVER pass view_name, view_url, custom xdm, schema refs, mixin definitions, or tenant field groups. ' +
        'Requires email + ecid from lab_generate_profile for reliable stitching. ' +
        'Results: requestId for Edge transport (eventId is null for lab-event-tool-edge). Verify with lab_profile_activity after 30–60s UPS lag.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        email: z.string().email().describe('Profile email'),
        ecid: z.string().optional().describe('Experience Cloud ID from lab_generate_profile'),
        events: z.array(eventStepSchema).optional().describe('Full event steps (portal-shaped)'),
        event_types: z
          .array(z.string())
          .optional()
          .describe('Shorthand: list of eventType strings only'),
        channel: z.string().optional().describe('Default channel (web, Mobile App, …)'),
        target_id: z.string().optional().describe('Generator target (default lab-event-tool-edge)'),
        delay_ms: z.number().int().min(0).max(10000).optional().describe('Delay between events ms (default 800)'),
        preflight: z.boolean().optional().describe('Identity preflight before send (default true)'),
        auto_fetch_ecid: z.boolean().optional().describe('UPS ecid lookup when ecid omitted (default true)'),
      },
    },
    async ({
      sandbox,
      email,
      ecid,
      events,
      event_types,
      channel,
      target_id,
      delay_ms,
      preflight,
      auto_fetch_ecid,
    }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();

      const rate = checkEdgeSendRate(keyId);
      if (!rate.ok) {
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      let resolvedEvents = Array.isArray(events) ? events : [];
      if (!resolvedEvents.length && Array.isArray(event_types) && event_types.length) {
        resolvedEvents = buildEventsFromEventTypes(event_types, { channel });
      }
      const {
        events: sanitizedEvents,
        warnings: strippedWarnings,
        errors: eventStepErrors,
      } = sanitizeCoworkerEventSteps(resolvedEvents);
      if (eventStepErrors.length) return toolError(eventStepErrors.join(' '));
      resolvedEvents = sanitizedEvents;
      if (!resolvedEvents.length) {
        return toolError('Provide events[] or event_types[] with at least one event.');
      }

      const outcome = await sendProfileEventSequence({
        sandbox: allowed.sandbox,
        email,
        ecid,
        events: resolvedEvents,
        target_id,
        delay_ms: delay_ms ?? 800,
        preflight: preflight !== false,
        auto_fetch_ecid,
      });

      writeAuditLog({
        keyId,
        tool: 'lab_send_profile_events_batch',
        sandbox: allowed.sandbox,
        email: outcome.email || email,
        identifier: outcome.ecid || email,
        result: outcome.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      if (!outcome.ok && outcome.error && !outcome.results?.length) {
        return toolError(outcome.error);
      }

      return jsonResult({
        ok: outcome.ok,
        sandbox: allowed.sandbox,
        event_types: resolvedEvents.map((e) => e.event_type),
        warnings: strippedWarnings.length ? strippedWarnings : undefined,
        ...outcome,
      });
    },
  );
}
