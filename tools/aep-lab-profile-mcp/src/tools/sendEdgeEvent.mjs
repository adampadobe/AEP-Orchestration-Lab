import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { lookupProfile, sendEdgeEvent } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { checkEdgeSendRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  buildEventIdentityMap,
  extractEcidFromProfileTable,
  resolveEventIdentities,
} from '../framework/eventIdentity.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerSendEdgeEventTool(mcpServer) {
  mcpServer.registerTool(
    'lab_send_edge_event',
    {
      title: 'Send Edge experience event (advanced)',
      description:
        'POST /api/events/edge — direct Edge interact when you have datastream_id. Sandbox is audit-only. ' +
        'Prefer lab_send_profile_event for preset targets. Same identity rules: email and/or ecid; when both present ECID is primary in identityMap. ' +
        'Include matching _demoemea.identification.core.ecid + email for Demo Website stitching. Auto-fetches ecid from UPS when email-only.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist; audit only, not sent to Edge)'),
        datastream_id: z.string().describe('Adobe datastream / Edge configuration id'),
        email: z.string().email().optional(),
        ecid: z.string().optional().describe('10+ digit ECID — pass with email after lab_generate_profile'),
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
        auto_fetch_ecid: z
          .boolean()
          .optional()
          .describe('When true (default), lookup UPS ecid by email if ecid omitted'),
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
      auto_fetch_ecid,
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
      let resolved = { ok: true, email: '', ecid: '', warnings: [] };

      if (!hasRaw) {
        let profileEcid = null;
        let autoFetched = false;
        const shouldFetch = auto_fetch_ecid !== false;
        const emailTrim = email != null ? String(email).trim() : '';
        const ecidTrim = ecid != null ? String(ecid).trim() : '';

        if (shouldFetch && emailTrim && !ecidTrim) {
          const profileResult = await lookupProfile({
            sandbox: allowed.sandbox,
            namespace: 'email',
            identifier: emailTrim,
          });
          if (profileResult.ok) {
            profileEcid = extractEcidFromProfileTable(profileResult.data);
            autoFetched = !!profileEcid;
          }
        }

        const identityResult = resolveEventIdentities({
          email: emailTrim,
          ecid: ecidTrim,
          profileEcid,
          autoFetchedEcid: autoFetched,
        });
        if (!identityResult.ok) {
          return toolError(identityResult.error);
        }
        resolved = identityResult;
      }

      const apiResult = await sendEdgeEvent({
        datastream_id: dsId,
        email: resolved.email || (email != null ? String(email).trim() : undefined),
        ecid: resolved.ecid || (ecid != null ? String(ecid).trim() : undefined),
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
        email: resolved.email || (email != null ? String(email).trim() : null),
        identifier: resolved.ecid || (ecid != null ? String(ecid).trim() : null),
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        datastream_id: dsId,
        identityMap: hasRaw
          ? undefined
          : buildEventIdentityMap({ email: resolved.email, ecid: resolved.ecid }),
        warnings: resolved.warnings?.length ? resolved.warnings : undefined,
      });
    },
  );
}
