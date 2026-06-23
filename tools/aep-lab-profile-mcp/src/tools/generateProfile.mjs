import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { generateProfile } from '../labApiClient.mjs';
import { buildPersonaAttributes, normalizeSegmentHint } from '../personaBuilder.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { checkGenerateRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import {
  ensurePreferredLanguageOnAttributes,
  normalizeGenerateProfileParams,
} from '../framework/generateProfileParams.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGenerateProfileTool(mcpServer) {
  mcpServer.registerTool(
    'lab_generate_profile',
    {
      title: 'Generate / stream test profile',
      description:
        'POST /api/profile/generate — streams a sample profile via the lab saved industry HTTP connection (Firestore manifest). ' +
        'Requires sandbox on MCP allowlist and industry connection ready (lab_sandbox_profile_config / lab_preflight_profile_generate). ' +
        'Email: use @adobetest.com plus-addressing (e.g. travel.demo+001@adobetest.com). ' +
        'CRITICAL: test_profile defaults true (AEP test profile); false requires test_profile_override_reason. ' +
        'Language enforced on attributes (default en-US on preferredLanguage + preferences.preferredLanguage + personalEmail.language). ' +
        'Set randomize:true to build correlated industry persona server-side (src/personaBuilder/). ' +
        'segment_hint overlays: travel (hotel_high_value, hotel_reactivation), fsi (high_net_worth, credit_rebuild), retail (loyalty_vip, cart_abandoner). ' +
        'See lab_get_execution_framework criticalRules and lab_get_industry_playbook.',
      inputSchema: {
        email: z.string().email().describe('Profile email address'),
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: z
          .string()
          .optional()
          .describe('Industry key or alias (default generic). Canonical: generic, travel, fsi, telecom, retail, media, sports'),
        attributes: z
          .record(z.unknown())
          .optional()
          .describe('Optional XDM attribute overrides merged into the streamed payload'),
        randomize: z
          .boolean()
          .optional()
          .describe('When true, build sample persona attributes server-side if attributes omitted'),
        fill_sample_data: z
          .boolean()
          .optional()
          .describe('Alias for randomize'),
        segment_hint: z
          .string()
          .optional()
          .describe('Segment overlay: travel hotel_high_value | hotel_reactivation; fsi high_net_worth | credit_rebuild; retail loyalty_vip | cart_abandoner'),
        append_if_existing: z
          .boolean()
          .optional()
          .describe('Reuse existing ECID when profile already exists (appendIfExisting)'),
        test_profile: z
          .boolean()
          .optional()
          .describe('Mark as AEP test profile (lab default true when omitted). false requires test_profile_override_reason.'),
        test_profile_override_reason: z
          .string()
          .optional()
          .describe('Required when test_profile is false — non-demo justification only'),
      },
    },
    async ({
      email,
      sandbox,
      industry,
      attributes,
      randomize,
      fill_sample_data,
      segment_hint,
      append_if_existing,
      test_profile,
      test_profile_override_reason,
    }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();

      const rate = checkGenerateRate(keyId);
      if (!rate.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_generate_profile',
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
          tool: 'lab_generate_profile',
          sandbox,
          email,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const norm = normalizeIndustry(industry);
      if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
        return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`, {
          aliases: ['telecommunications→telecom', 'public→generic'],
        });
      }

      const segmentNorm = segment_hint ? normalizeSegmentHint(segment_hint, norm.industry) : null;
      if (segment_hint && segmentNorm && (segmentNorm.includes('Unknown') || segmentNorm.includes('not supported'))) {
        return toolError(segmentNorm);
      }

      const useRandomize = randomize ?? fill_sample_data ?? false;
      let mergedAttributes = attributes;
      if (useRandomize && (!attributes || Object.keys(attributes).length === 0)) {
        mergedAttributes = buildPersonaAttributes(
          norm.industry,
          email,
          typeof segmentNorm === 'string' ? segmentNorm : null,
        );
      }

      if (mergedAttributes && typeof mergedAttributes === 'object' && Object.keys(mergedAttributes).length > 0) {
        mergedAttributes = ensurePreferredLanguageOnAttributes(mergedAttributes).attributes;
      }

      const normalized = normalizeGenerateProfileParams({
        test_profile,
        test_profile_override_reason,
        attributes: mergedAttributes,
        ensureLanguage: false,
      });
      if (!normalized.ok) {
        return toolError(normalized.error);
      }

      const apiResult = await generateProfile({
        email,
        sandbox: allowed.sandbox,
        industry: norm.industry,
        attributes: normalized.attributes,
        append_if_existing,
        test_profile: normalized.test_profile,
      });

      writeAuditLog({
        keyId,
        tool: 'lab_generate_profile',
        sandbox: allowed.sandbox,
        industry: norm.industry,
        email,
        emailDomain: String(email).split('@')[1] || null,
        segmentHint: typeof segmentNorm === 'string' ? segmentNorm : null,
        randomized: useRandomize && (!attributes || !Object.keys(attributes).length),
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        industry: norm.industry,
        normalizedFrom: norm.normalizedFrom,
        aliasNote: norm.aliasNote,
        randomized: useRandomize && (!attributes || !Object.keys(attributes).length),
        segment_hint: typeof segmentNorm === 'string' ? segmentNorm : null,
        test_profile: normalized.test_profile,
        preferredLanguage: readLanguageFromAttrs(normalized.attributes),
        lab_defaults_applied: {
          test_profile: normalized.test_profile,
          preferredLanguage: readLanguageFromAttrs(normalized.attributes),
        },
      });
    },
  );
}

/**
 * @param {Record<string, unknown> | undefined} attrs
 */
function readLanguageFromAttrs(attrs) {
  if (!attrs) return null;
  return (
    attrs.preferredLanguage ||
    attrs['preferences.preferredLanguage'] ||
    attrs['personalEmail.language'] ||
    null
  );
}
