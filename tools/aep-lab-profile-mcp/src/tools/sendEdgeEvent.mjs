import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { sendEdgeEvent } from '../labApiClient.mjs';
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
export function registerSendEdgeEventTool(mcpServer) {
  mcpServer.registerTool(
    'lab_send_edge_event',
    {
      title: 'Send Edge experience event (advanced)',
      description:
        'POST /api/events/edge — direct Edge interact when you have datastream_id. Sandbox is audit-only. Prefer lab_send_profile_event for preset targets.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist; audit only, not sent to Edge)'),
        datastream_id: z.string().describe('Adobe datastream / Edge configuration id'),
        email: z.string().email().optional(),
        ecid: z.string().optional(),
        event_type: z.string().optional(),
        view_name: z.string().optional(),
        view_url: z.string().optional(),
        channel: z.string().optional(),
        orchestration_event_id: z.string().optional(),
        event_id: z.string().optional(),
        timestamp: z.string().optional(),
        public: z.record(z.unknown()).optional(),
        raw_payload: z
          .unknown()
          .optional()
          .describe('Full Edge interact payload { event: { xdm } } — skips buildXdm when set'),
      },
    },
    async ({
      sandbox,
      datastream_id,
      email,
      ecid,
      event_type,
      view_name,
      view_url,
      channel,
      orchestration_event_id,
      event_id,
      timestamp,
      public: publicFields,
      raw_payload,
    }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();

      const rate = checkEdgeSendRate(keyId);
      if (!rate.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_send_edge_event',
          sandbox,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_send_edge_event',
          sandbox,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const dsId = String(datastream_id || '').trim();
      if (!dsId) {
        return toolError('datastream_id is required.');
      }

      const hasRaw = raw_payload != null && typeof raw_payload === 'object';
      if (!hasRaw) {
        const emailTrim = email != null ? String(email).trim() : '';
        const ecidTrim = ecid != null ? String(ecid).trim() : '';
        if (!emailTrim && !isValidEcid(ecidTrim)) {
          return toolError('Without raw_payload, provide email and/or ecid (10+ digits).');
        }
      }

      const apiResult = await sendEdgeEvent({
        datastream_id: dsId,
        email: email != null ? String(email).trim() : undefined,
        ecid: ecid != null ? String(ecid).trim() : undefined,
        event_type,
        view_name,
        view_url,
        channel,
        orchestration_event_id,
        event_id,
        timestamp,
        public: publicFields,
        raw_payload: hasRaw ? raw_payload : undefined,
      });

      writeAuditLog({
        keyId,
        tool: 'lab_send_edge_event',
        sandbox: allowed.sandbox,
        email: email != null ? String(email).trim() : null,
        identifier: ecid != null ? String(ecid).trim() : null,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        datastream_id: dsId,
      });
    },
  );
}
