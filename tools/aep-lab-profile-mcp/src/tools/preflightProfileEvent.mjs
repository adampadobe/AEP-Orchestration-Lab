import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { listEventTargets, lookupProfile } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  buildEventPreflightSummary,
  extractEcidFromProfileTable,
  resolveEventIdentities,
} from '../framework/eventIdentity.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerPreflightProfileEventTool(mcpServer) {
  mcpServer.registerTool(
    'lab_preflight_profile_event',
    {
      title: 'Preflight profile experience event',
      description:
        'Dry-run event identity + target resolution without sending. Shows identityMap, _demoemea.identification.core, ' +
        'and resolved target_id (default lab-event-tool-edge). Auto-fetches ecid from UPS when email provided and ecid omitted.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        email: z.string().email().optional().describe('Profile email'),
        ecid: z.string().optional().describe('Experience Cloud ID (10+ digits)'),
        target_id: z
          .string()
          .optional()
          .describe('Preset id from lab_list_event_targets (default lab-event-tool-edge)'),
        auto_fetch_ecid: z
          .boolean()
          .optional()
          .describe('When true (default), lookup UPS ecid by email if ecid omitted'),
      },
    },
    async ({ sandbox, email, ecid, target_id, auto_fetch_ecid }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_preflight_profile_event',
          sandbox,
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
        writeAuditLog({
          keyId,
          tool: 'lab_preflight_profile_event',
          sandbox: allowed.sandbox,
          email: emailTrim || null,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(resolved.error);
      }

      const targetsResult = await listEventTargets({ sandbox: allowed.sandbox });
      const targets = targetsResult.ok && Array.isArray(targetsResult.data?.targets)
        ? targetsResult.data.targets
        : [];

      const summary = buildEventPreflightSummary({
        sandbox: allowed.sandbox,
        email: resolved.email,
        ecid: resolved.ecid,
        target_id,
        targets,
        warnings: resolved.warnings,
      });

      if (!targetsResult.ok) {
        summary.warnings = [
          ...(summary.warnings || []),
          `Could not list event targets: ${targetsResult.error || 'unknown error'}. Run lab_list_event_targets or configure Firestore eventConfig.`,
        ];
      } else if (!summary.target.resolved?.dataStreamId && !summary.target.resolved?.note) {
        summary.warnings.push(
          `target_id "${summary.target.requested_id}" not found for sandbox — Event send may fail until Event tool datastream is saved.`,
        );
      }

      writeAuditLog({
        keyId,
        tool: 'lab_preflight_profile_event',
        sandbox: allowed.sandbox,
        email: resolved.email || null,
        identifier: resolved.ecid || resolved.email || null,
        result: 'ok',
        durationMs: Date.now() - started,
      });

      return jsonResult({ ok: true, preflight: true, ...summary });
    },
  );
}
