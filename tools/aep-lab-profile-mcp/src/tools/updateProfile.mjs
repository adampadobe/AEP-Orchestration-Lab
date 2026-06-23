import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { lookupProfile, updateProfile } from '../labApiClient.mjs';
import { mergeProfileForUpdate } from '../profileMerge.mjs';
import { normalizeIndustry } from '../industries.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const changeSchema = z.object({
  path: z.string().describe('Dot-path attribute (e.g. person.name.firstName)'),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).describe('New scalar value'),
  valueType: z
    .string()
    .optional()
    .describe('Original UPS type hint: string | number | boolean | null'),
});

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerUpdateProfileTool(mcpServer) {
  mcpServer.registerTool(
    'lab_update_profile',
    {
      title: 'Update profile (full-snapshot stitch)',
      description:
        'POST /api/profile/update using Profile Viewer full-snapshot stitch: fetch current profile, merge attribute_changes, stream ALL writable rows for the industry dataflow. Or pass explicit attributes dot-path map for a complete snapshot. NOT minimal delta patches.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: z.string().describe('Industry dataflow key (generic, travel, fsi, telecom, retail, media, sports)'),
        email: z.string().optional().describe('Profile email (primary identity for streaming)'),
        namespace: z.string().optional().describe('Lookup namespace when using identifier instead of email'),
        identifier: z.string().optional().describe('Identity value when email omitted'),
        attribute_changes: z
          .array(changeSchema)
          .optional()
          .describe('Paths/values to merge into current profile before full-snapshot POST'),
        attributes: z
          .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .optional()
          .describe('Explicit full dot-path snapshot — posted directly as updates[] (skips fetch/merge)'),
        ecid: z.string().optional().describe('Optional ECID for identityMap merge fidelity'),
        dry_run: z.boolean().optional().describe('Preview payload only (requires streaming connection saved)'),
      },
    },
    async ({
      sandbox,
      industry,
      email,
      namespace,
      identifier,
      attribute_changes,
      attributes,
      ecid,
      dry_run,
    }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const { industry: industryKey, normalizedFrom, aliasNote } = normalizeIndustry(industry);
      const profileEmail = String(email || (String(namespace || 'email').toLowerCase() === 'email' ? identifier : '') || '')
        .trim();
      const lookupId = String(identifier || profileEmail || '').trim();
      const ns = String(namespace || 'email').trim().toLowerCase();

      if (!lookupId) {
        return toolError('email or identifier is required.');
      }
      if (!profileEmail) {
        return toolError('email is required for POST /api/profile/update (primary streaming identity).');
      }

      const hasAttributes = attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0;
      const hasChanges = Array.isArray(attribute_changes) && attribute_changes.length > 0;
      if (!hasAttributes && !hasChanges) {
        return toolError('Provide attribute_changes and/or attributes (explicit full snapshot).');
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_update_profile',
        sandbox: allowed.sandbox,
        industry: industryKey,
      });

      let profilePayload = null;
      if (!hasAttributes) {
        const lookupResult = await lookupProfile({
          sandbox: allowed.sandbox,
          namespace: ns,
          identifier: lookupId,
        });
        if (!lookupResult.ok) {
          return fromLabApi(lookupResult, {
            sandbox: allowed.sandbox,
            namespace: ns,
            identifier: lookupId,
            stage: 'profile_fetch_before_merge',
          });
        }
        profilePayload = lookupResult.data;
        if (!profilePayload?.found) {
          return toolError('Profile not found — generate or lookup first before update.', {
            sandbox: allowed.sandbox,
            namespace: ns,
            identifier: lookupId,
          });
        }
      }

      const mergeResult = mergeProfileForUpdate({
        profilePayload,
        industry: industryKey,
        attributeChanges: attribute_changes,
        attributes,
      });

      if (!mergeResult.updates.length) {
        return toolError('No writable snapshot fields for industry after merge.', {
          industry: industryKey,
          mode: mergeResult.mode,
          mergedRowCount: mergeResult.mergedRowCount,
          hint: 'Check industry provisioning or attribute-ownership for paths.',
        });
      }

      const ecidForPayload =
        String(ecid || profilePayload?.ecid || '').trim().length >= 10
          ? String(ecid || profilePayload?.ecid || '').trim()
          : undefined;

      const updateBody = {
        email: profileEmail,
        sandbox: allowed.sandbox,
        industry: industryKey,
        updates: mergeResult.updates.map(({ path, value, valueType }) => ({ path, value, valueType })),
        ...(ecidForPayload ? { ecid: ecidForPayload } : {}),
        ...(dry_run ? { dryRun: true } : {}),
      };

      const apiResult = await updateProfile({
        industry: industryKey,
        body: updateBody,
      });

      if (!apiResult.ok) {
        return fromLabApi(apiResult, {
          sandbox: allowed.sandbox,
          industry: industryKey,
          merge: {
            mode: mergeResult.mode,
            snapshotFieldCount: mergeResult.updates.length,
            note: mergeResult.note,
          },
        });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        industry: industryKey,
        ...(normalizedFrom ? { industryNormalizedFrom: normalizedFrom, aliasNote } : {}),
        email: profileEmail,
        merge: {
          mode: mergeResult.mode,
          snapshotFieldCount: mergeResult.updates.length,
          note: mergeResult.note,
        },
        lab: apiResult.data,
      });
    },
  );
}
