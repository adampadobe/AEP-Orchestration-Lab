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
import { resolveStoredPrefsEmail } from './generationPrefs.mjs';

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
        'Shared Portal counter: omit email and set use_stored_prefs:true (default when email omitted) to atomically reserve next scaled email via Firestore. ' +
        'Preview with lab_confirm_generation_plan; configure with lab_get_generation_prefs / lab_set_generation_prefs. ' +
        'Set randomize:true to build correlated industry persona server-side (src/personaBuilder/). ' +
        'segment_hint overlays: travel (hotel_high_value, hotel_reactivation), fsi (high_net_worth, credit_rebuild), retail (loyalty_vip, cart_abandoner). ' +
        'See lab_get_execution_framework criticalRules and lab_get_industry_playbook.',
      inputSchema: {
        email: z.string().email().optional().describe('Profile email address (omit to use shared Firestore scaler via use_stored_prefs)'),
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
        use_stored_prefs: z
          .boolean()
          .optional()
          .describe('When true (default if email omitted), reserve next scaled email from shared Firestore prefs (Portal + MCP counter sync)'),
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
      use_stored_prefs,
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

      const useStored = use_stored_prefs ?? !email;
      let resolvedEmail = email;
      /** @type {Record<string, unknown>} */
      let storedPrefsMeta = {};
      if (useStored) {
        const reserved = await resolveStoredPrefsEmail(allowed.sandbox);
        if (!reserved.ok) {
          return toolError(reserved.error, {
            hint: 'Set base email via lab_set_generation_prefs or Profile Viewer, then retry.',
          });
        }
        resolvedEmail = reserved.email;
        storedPrefsMeta = {
          use_stored_prefs: true,
          counterN: reserved.counterN,
          nextCounterN: reserved.nextCounterN,
          baseEmail: reserved.baseEmail,
        };
      } else if (!resolvedEmail) {
        return toolError('email is required when use_stored_prefs is false.');
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
          resolvedEmail,
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
        email: resolvedEmail,
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
        email: resolvedEmail,
        emailDomain: String(resolvedEmail).split('@')[1] || null,
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
        ...storedPrefsMeta,
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
