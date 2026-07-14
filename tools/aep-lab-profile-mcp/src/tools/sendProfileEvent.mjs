import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { lookupProfile, listEventTargets, sendProfileEvent } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { checkEdgeSendRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { EVENT_TYPE_SUGGESTIONS } from '../framework/buildGeneratorPostBody.mjs';
import {
  buildEventIdentityMap,
  extractEcidFromProfileTable,
  resolveEventIdentities,
  validateEventTarget,
} from '../framework/eventIdentity.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

const eventTypeDescribe =
  'XDM eventType — any custom string (same free-text field as Event tool). ' +
  `Suggestions: ${EVENT_TYPE_SUGGESTIONS.slice(0, 6).join(', ')}, …`;

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerSendProfileEventTool(mcpServer) {
  mcpServer.registerTool(
    'lab_send_profile_event',
    {
      title: 'Send profile experience event',
      description:
        'POST /api/events/generator — identical payload to Profile Viewer Event tool / mobile lab senders. ' +
        'event_type accepts ANY string (datalist suggestions are optional). ' +
        'Requires email and/or ecid (10+ digits). After lab_generate_profile, pass BOTH for reliable stitching. ' +
        'Default: minimal Edge XDM (identityMap + eventType + _id + timestamp). Rich tenant/channel/FG when public, message, channel, view_name, view_url, xdm_tenant_key, or xdm_style=full. ' +
        'Default target_id lab-event-tool-edge. Preflight: lab_preflight_profile_event. Batch: lab_send_profile_events_batch.',
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
        event_type: z.string().optional().describe(eventTypeDescribe),
        view_name: z.string().optional().describe('Web page view name / title'),
        view_url: z.string().optional().describe('Web page URL'),
        channel: z.string().optional().describe('Interaction channel (web, mobile, Mobile App, email, …)'),
        orchestration_event_id: z.string().optional().describe('AJO orchestration event ID (sent as eventID)'),
        event_id: z.string().optional().describe('Alias for orchestration_event_id (portal eventID field)'),
        timestamp: z.string().optional().describe('ISO-8601 event timestamp (also sets _id like Event tool)'),
        public: z
          .record(z.unknown())
          .optional()
          .describe('Tenant public fields (donationAmount, hotel*, quoteForm, retail via public object, etc.)'),
        message: z
          .record(z.unknown())
          .optional()
          .describe('_demoemea.message object (call centre / contact centre demos)'),
        industry: z
          .string()
          .optional()
          .describe('Industry context label (portal uses public sector fields when industry=public)'),
        xdm_tenant_key: z
          .string()
          .optional()
          .describe('XDM tenant prefix e.g. _demoemea (mobile demos default _demoemea)'),
        identity_map_ecid_key: z
          .string()
          .optional()
          .describe('identityMap ECID key (default ECID; mobile demos use ECID)'),
        primary_identity: z
          .enum(['email'])
          .optional()
          .describe('Email-only primary identity for guests without ECID'),
        email_primary_identity: z.boolean().optional().describe('Alias for primary_identity email'),
        edge_minimal: z
          .boolean()
          .optional()
          .describe('When true (default), minimal Edge XDM unless rich fields (public, channel, message) are set'),
        xdm_style: z
          .enum(['minimal', 'full'])
          .optional()
          .describe('Force minimal or full XDM shape (full adds tenant mirror, channel FG, demoemea alias)'),
        auto_fetch_ecid: z
          .boolean()
          .optional()
          .describe('When true (default), lookup UPS ecid by email if ecid omitted'),
      },
    },
    async (params) => {
      const {
        sandbox,
        email,
        ecid,
        auto_fetch_ecid,
        ...eventFields
      } = params;

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

      const targetsResult = await listEventTargets({ sandbox: allowed.sandbox });
      const targets = targetsResult.ok && Array.isArray(targetsResult.data?.targets)
        ? targetsResult.data.targets
        : [];
      const targetCheck = validateEventTarget({
        target_id: eventFields.target_id,
        targets,
      });
      if (!targetCheck.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_send_profile_event',
          sandbox: allowed.sandbox,
          email: resolved.email || null,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(targetCheck.error, {
          ...targetCheck,
          targets_list_error: targetsResult.ok ? undefined : targetsResult.error,
        });
      }

      const apiResult = await sendProfileEvent({
        sandbox: allowed.sandbox,
        email: resolved.email || undefined,
        ecid: resolved.ecid || undefined,
        target_id: targetCheck.requested_id,
        ...eventFields,
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
        targetId: lab.targetId || targetCheck.requested_id || null,
        message: lab.message || null,
        identityMap: buildEventIdentityMap({ email: resolved.email, ecid: resolved.ecid }),
        ecid: resolved.ecid || null,
        warnings: resolved.warnings.length ? resolved.warnings : undefined,
        stitch_note:
          'ok:true means Edge accepted the event — not that UPS already shows it on the profile. ' +
          'Verify with lab_profile_activity after 30–60s; pass ecid from lab_generate_profile for reliable stitching.',
      });
    },
  );
}
