import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { sendProfileEvent } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { checkEdgeSendRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

/**
 * @param {string | undefined | null} ecid
 */
function isValidEcid(ecid) {
  const s = ecid != null ? String(ecid).trim() : '';
  return /^\d{10,}$/.test(s);
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerSendProfileEventTool(mcpServer) {
  mcpServer.registerTool(
    'lab_send_profile_event',
    {
      title: 'Send profile experience event',
      description:
        'POST /api/events/generator — mirrors Profile Viewer Event tool. Requires email and/or ecid (from lab_generate_profile). Optional target_id from lab_list_event_targets; defaults to first preset.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        email: z.string().email().optional().describe('Profile email (at least one of email or ecid required)'),
        ecid: z.string().optional().describe('Experience Cloud ID from lab_generate_profile response'),
        target_id: z.string().optional().describe('Preset id from lab_list_event_targets'),
        event_type: z.string().optional().describe('XDM eventType (e.g. transaction, donation.made, web.webPageViews)'),
        view_name: z.string().optional().describe('Web page view name / title'),
        view_url: z.string().optional().describe('Web page URL'),
        channel: z.string().optional().describe('Interaction channel (web, mobile, email, …)'),
        orchestration_event_id: z.string().optional().describe('AJO orchestration event ID'),
        event_id: z.string().optional().describe('Alias for orchestration_event_id (eventID)'),
        timestamp: z.string().optional().describe('ISO-8601 event timestamp'),
        public: z
          .record(z.unknown())
          .optional()
          .describe('Public-sector / demo tenant fields (donationAmount, hotel*, etc.)'),
      },
    },
    async ({
      sandbox,
      email,
      ecid,
      target_id,
      event_type,
      view_name,
      view_url,
      channel,
      orchestration_event_id,
      event_id,
      timestamp,
      public: publicFields,
    }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();

      const rate = checkEdgeSendRate(keyId);
      if (!rate.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_send_profile_event',
          sandbox,
          email,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_send_profile_event',
          sandbox,
          email,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const emailTrim = email != null ? String(email).trim() : '';
      const ecidTrim = ecid != null ? String(ecid).trim() : '';
      if (!emailTrim && !isValidEcid(ecidTrim)) {
        return toolError(
          'At least one identity required: email and/or ecid (10+ digits, typically from lab_generate_profile).',
        );
      }

      const apiResult = await sendProfileEvent({
        sandbox: allowed.sandbox,
        email: emailTrim || undefined,
        ecid: ecidTrim || undefined,
        target_id,
        event_type,
        view_name,
        view_url,
        channel,
        orchestration_event_id,
        event_id,
        timestamp,
        public: publicFields,
      });

      const lab = apiResult.ok && apiResult.data && typeof apiResult.data === 'object' ? apiResult.data : {};

      writeAuditLog({
        keyId,
        tool: 'lab_send_profile_event',
        sandbox: allowed.sandbox,
        email: emailTrim || null,
        identifier: ecidTrim || emailTrim || null,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      if (!apiResult.ok) {
        return toolError(apiResult.error || 'Lab API request failed', {
          status: apiResult.status,
          url: apiResult.url,
          response: apiResult.data,
          sandbox: allowed.sandbox,
        });
      }

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        transport: lab.transport || null,
        requestId: lab.requestId || null,
        eventId: lab.eventId || null,
        targetId: lab.targetId || target_id || null,
        message: lab.message || null,
      });
    },
  );
}
