import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { executeGeneratePlan, planDualStreamGenerate } from '../framework/dualStreamGenerate.mjs';
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
import { resolveProfileEmailForGenerate, applyStoredPrefsMobileToAttributes } from './generationPrefs.mjs';
import {
  personHintsFromAttributes,
  recordRecentProfileGenerated,
} from '../framework/recordRecentProfile.mjs';

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
        'FORMAT RULES — email: <local>+DDMMYYYY-N@<domain> via shared Firestore counter (labProfileGenerationPrefs). ' +
        'Omit email (default) to atomically reserve next scaled email; custom email MUST match +DDMMYYYY-N or is rejected. ' +
        'Call lab_confirm_profile_generation before first generate to prompt colleague for base email + domain. ' +
        'Mobile: static E.164 from prefs (default +447425627462). ' +
        'CRITICAL: test_profile defaults true (AEP test profile); false requires test_profile_override_reason. ' +
        'Language enforced on attributes (default en-US on preferredLanguage + preferences.preferredLanguage + personalEmail.language). ' +
        'Shared Portal counter: omit email and set use_stored_prefs:true (default when email omitted) to atomically reserve next scaled email via Firestore. ' +
        'Preview with lab_confirm_generation_plan; configure with lab_get_generation_prefs / lab_set_generation_prefs. ' +
        'Set randomize:true to build correlated industry persona server-side (src/personaBuilder/). ' +
        'Non-generic industries dual-stream automatically: generic-owned paths first (POST industry generic), then industry-owned paths (POST industry travel|fsi|… with appendIfExisting). ' +
        'segment_hint overlays: travel (hotel_high_value, hotel_reactivation), fsi (high_net_worth, credit_rebuild), retail (loyalty_vip, cart_abandoner). ' +
        'Travel randomize emits portal-parity paths: travelReservations.flightReservations.*, travelPreferences.*, hotel.*. ' +
        'loyalty_member (all industries, default false — matches Portal loyalty toggles): when true, adds LYL-{6 digits} + loyalty.* / loyaltyDetails.*. ' +
        'Retail last_order_details (default true): when false, skips orderProfile last-order SKU/store block (Portal #retailLastOrderEnabled). ' +
        'See lab_get_execution_framework criticalRules and lab_get_industry_playbook.',
      inputSchema: {
        email: z
          .string()
          .email()
          .optional()
          .describe(
            'Scaled profile email (<local>+DDMMYYYY-N@domain). Omit to reserve next from Firestore prefs (recommended).',
          ),
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
        loyalty_member: z
          .boolean()
          .optional()
          .describe('When true (default false, matching Portal loyalty toggles), emit LYL-* loyalty ID and loyalty.* paths'),
        last_order_details: z
          .boolean()
          .optional()
          .describe('Retail only: when false, omit orderProfile last-order SKU/store/YTD block (Portal #retailLastOrderEnabled; default true on randomize)'),
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
      loyalty_member,
      last_order_details,
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

      const emailResolved = await resolveProfileEmailForGenerate({
        sandbox: allowed.sandbox,
        email,
        use_stored_prefs,
      });
      if (!emailResolved.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_generate_profile',
          sandbox: allowed.sandbox,
          email,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(emailResolved.error, {
          hint: emailResolved.hint,
          coworkerPrompt: emailResolved.coworkerPrompt,
          expectedPattern: emailResolved.expectedPattern,
          example: emailResolved.example,
          provided: emailResolved.provided,
          formatRules: emailResolved.formatRules,
          questionsForColleague: emailResolved.questionsForColleague,
          recommendedAction: emailResolved.recommendedAction,
          nextStep: emailResolved.nextStep,
          confirmTool: emailResolved.confirmTool || 'lab_confirm_profile_generation',
          blockedReason: emailResolved.use_stored_prefs === false ? undefined : 'generation_prefs_missing',
        });
      }

      const resolvedEmail = emailResolved.email;
      /** @type {Record<string, unknown>} */
      const storedPrefsMeta = emailResolved.use_stored_prefs
        ? {
            use_stored_prefs: true,
            counterN: emailResolved.counterN,
            nextCounterN: emailResolved.nextCounterN,
            baseEmail: emailResolved.baseEmail,
            mobilePhone: emailResolved.mobilePhone,
          }
        : {};

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
          { loyalty_member: loyalty_member === true, last_order_details },
        );
      }

      if (mergedAttributes && typeof mergedAttributes === 'object' && Object.keys(mergedAttributes).length > 0) {
        mergedAttributes = ensurePreferredLanguageOnAttributes(mergedAttributes).attributes;
        if (emailResolved.mobilePhone) {
          mergedAttributes = applyStoredPrefsMobileToAttributes(mergedAttributes, emailResolved.mobilePhone);
        }
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

      const generatePlan = planDualStreamGenerate({
        industry: norm.industry,
        attributes: normalized.attributes,
        email: resolvedEmail,
      });

      const apiResult = await executeGeneratePlan({
        email: resolvedEmail,
        sandbox: allowed.sandbox,
        plan: generatePlan,
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

      let recentSync = null;
      if (apiResult.ok) {
        const ecid =
          apiResult.ecid ||
          apiResult.data?.ecid ||
          apiResult.data?.identification?.core?.ecid ||
          apiResult.data?.profile?.ecid ||
          undefined;
        const hints = personHintsFromAttributes(normalized.attributes);
        recentSync = await recordRecentProfileGenerated({
          sandbox: allowed.sandbox,
          email: resolvedEmail,
          ecid,
          industry: norm.industry,
          attributes: normalized.attributes,
          ...hints,
        });
      }

      const labApiShape = apiResult.ok
        ? { ok: true, status: 200, data: apiResult.data }
        : {
            ok: false,
            status: apiResult.data?.streamingStatus || 502,
            error: apiResult.error || 'Generate failed',
            data: apiResult.data,
          };

      return fromLabApi(labApiShape, {
        sandbox: allowed.sandbox,
        industry: norm.industry,
        normalizedFrom: norm.normalizedFrom,
        aliasNote: norm.aliasNote,
        randomized: useRandomize && (!attributes || !Object.keys(attributes).length),
        segment_hint: typeof segmentNorm === 'string' ? segmentNorm : null,
        test_profile: normalized.test_profile,
        preferredLanguage: readLanguageFromAttrs(normalized.attributes),
        recent_profiles_sync: recentSync,
        dual_stream: generatePlan.dualStream,
        generate_plan: generatePlan.steps.map((s) => ({
          step: s.step,
          industry: s.industry,
          role: s.role,
          appendIfExisting: s.appendIfExisting,
          attributeCount: Object.keys(s.attributes || {}).length,
        })),
        generate_step_results: apiResult.stepResults || null,
        ecid: apiResult.ecid || apiResult.data?.ecid || null,
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
