import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { lookupProfile, sendProfileEvent } from '../labApiClient.mjs';
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
export function registerSendProfileEventTool(mcpServer) {
  mcpServer.registerTool(
    'lab_send_profile_event',
    {
      title: 'Send profile experience event',
      description:
        'POST /api/events/generator — mirrors Profile Viewer Event tool. Append experience events (not profile attribute rewrites). ' +
        'Requires email and/or ecid (10+ digits). After lab_generate_profile, pass BOTH email and ecid from the generate response for reliable stitching. ' +
        'When ecid is omitted but email is set, auto-fetches ecid from UPS (lab_get_profile). ' +
        'identityMap: ECID primary + Email secondary when both present; _demoemea.identification.core mirrors both. ' +
        'Default target_id lab-event-tool-edge (Firestore Event tool datastream). Preflight: lab_preflight_profile_event.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        email: z.string().email().optional().describe('Profile email (at least one of email or ecid required)'),
        ecid: z
          .string()
          .optional()
          .describe('Experience Cloud ID from lab_generate_profile response — strongly recommended with email'),
        target_id: z
          .string()
          .optional()
          .describe('Preset id from lab_list_event_targets (default lab-event-tool-edge)'),
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
        auto_fetch_ecid: z
          .boolean()
          .optional()
          .describe('When true (default), lookup UPS ecid by email if ecid omitted'),
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
      auto_fetch_ecid,
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

      const resolved = resolveEventIdentities({
        email: emailTrim,
        ecid: ecidTrim,
        profileEcid,
        autoFetchedEcid: autoFetched,
      });

      if (!resolved.ok) {
        return toolError(resolved.error);
      }

      const apiResult = await sendProfileEvent({
        sandbox: allowed.sandbox,
        email: resolved.email || undefined,
        ecid: resolved.ecid || undefined,
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
        email: resolved.email || null,
        identifier: resolved.ecid || resolved.email || null,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      if (!apiResult.ok) {
        return toolError(apiResult.error || 'Lab API request failed', {
          status: apiResult.status,
          url: apiResult.url,
          response: apiResult.data,
          sandbox: allowed.sandbox,
          identityMap: buildEventIdentityMap({ email: resolved.email, ecid: resolved.ecid }),
          warnings: resolved.warnings,
        });
      }

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        transport: lab.transport || null,
        requestId: lab.requestId || null,
        eventId: lab.eventId || null,
        targetId: lab.targetId || target_id || null,
        message: lab.message || null,
        identityMap: buildEventIdentityMap({ email: resolved.email, ecid: resolved.ecid }),
        ecid: resolved.ecid || null,
        warnings: resolved.warnings.length ? resolved.warnings : undefined,
      });
    },
  );
}
