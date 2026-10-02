import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { createBatchJob, getBatchStoreMode } from '../batchJobStore.mjs';
import { processBatchJob } from '../batchProcessor.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { normalizeSegmentHint } from '../personaBuilder.mjs';
import { checkBatchJobRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { normalizeGenerateProfileParams } from '../framework/generateProfileParams.mjs';
import { jsonResult, toolError } from './helpers.mjs';
import {
  batchPlaceInputSchema,
  planBatchPlaces,
  summarizePlacePlan,
  validatePlaceParams,
} from '../framework/placeParams.mjs';
import { buildEmailFormatRules, validateScaledLabEmail } from '../framework/emailFormatGuardrails.mjs';
import { checkGenerationPrefsConfigured } from './generationPrefs.mjs';
import { resolveBatchEmail } from '../personaBuilder.mjs';
import { snowflakeProfileTableForIndustry } from '../snowflakeIndustry.mjs';

const BATCH_MAX = 100;
const MAX_DELAY_MS = 5000;

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGenerateProfilesBatchTool(mcpServer) {
  mcpServer.registerTool(
    'lab_generate_profiles_batch',
    {
      title: 'Batch generate test profiles (async)',
      description:
        'Batch generate 1–100 test profiles. FORMAT RULES: prefer use_stored_prefs:true (default when base_email omitted) — each profile reserves <local>+DDMMYYYY-N@<domain>. ' +
        'Legacy base_email patterns (e.g. kirkham+retail-seed) are rejected unless email_pattern produces scaled addresses. ' +
        'Call lab_confirm_profile_generation before first batch. ' +
        'Every randomized profile carries place context; place_mode featured (ten common areas) | global (anywhere on Earth) | area + place_area. ' +
        'Batches of 10+ are clustered (cluster_size default 12, >= k=10) so each cluster shows on the k-anonymous hotspot map; response lists place_clusters. ' +
        'Travel loyalty_member (all industries, default false): LYL-* when true. Retail last_order_details (default true). Optional delay_ms between items (default env AEP_LAB_MCP_BATCH_DELAY_MS, max 5000).',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: z
          .string()
          .optional()
          .describe('Industry key or alias (default generic)'),
        count: z
          .number()
          .int()
          .min(1)
          .max(BATCH_MAX)
          .describe(`Number of profiles to generate (1–${BATCH_MAX})`),
        base_email: z
          .string()
          .optional()
          .describe('Base email or local-part prefix; generates tagged addresses per index'),
        email_pattern: z
          .string()
          .optional()
          .describe('Optional template with {n}, {index}, {industry} placeholders'),
        randomize: z
          .boolean()
          .optional()
          .describe('When true (default), fill sample persona attributes server-side when attributes omitted'),
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
          .describe('When true (default false), emit LYL-* loyalty on randomized profiles'),
        last_order_details: z
          .boolean()
          .optional()
          .describe('Retail only: when false, omit orderProfile last-order detail block'),
        delay_ms: z
          .number()
          .int()
          .min(0)
          .max(MAX_DELAY_MS)
          .optional()
          .describe(`Delay between generates in ms (0–${MAX_DELAY_MS}; overrides env default)`),
        attributes: z
          .record(z.unknown())
          .optional()
          .describe('Optional fixed attributes merged for every profile in the batch'),
        append_if_existing: z.boolean().optional(),
        test_profile: z
          .boolean()
          .optional()
          .describe('Mark as AEP test profile (default true). false requires test_profile_override_reason.'),
        test_profile_override_reason: z
          .string()
          .optional()
          .describe('Required when test_profile is false'),
        use_stored_prefs: z
          .boolean()
          .optional()
          .describe(
            'When true (default when base_email and email_pattern omitted), each profile uses POST /api/lab/generation-prefs/next-email',
          ),
        dual_load_snowflake: z
          .boolean()
          .optional()
          .describe(
            'When true for any non-generic industry, INSERT an independent industry CRM row per profile with shared email + ECID',
          ),
        dual_load_snowflake_mode: z
          .enum(['crm_generate', 'mirror'])
          .optional()
          .describe('Snowflake dual-load mode (default crm_generate). mirror = legacy AEP attribute mapper.'),
        snowflake_enrichment: z
          .boolean()
          .optional()
          .describe('Non-travel opt-in: populate all governed event/enrichment tables after each CRM insert.'),
        snowflake_event_types: z
          .array(z.string())
          .optional()
          .describe('Optional industry event/enrichment keys; omit for all five tables.'),
        snowflake_table: z
          .string()
          .optional()
          .describe('Optional Snowflake table override; default is selected from industry'),
        ...batchPlaceInputSchema(),
      },
    },
    async ({
      sandbox,
      industry,
      count,
      base_email,
      email_pattern,
      randomize,
      fill_sample_data,
      segment_hint,
      loyalty_member,
      last_order_details,
      delay_ms,
      attributes,
      append_if_existing,
      test_profile,
      test_profile_override_reason,
      use_stored_prefs,
      dual_load_snowflake,
      dual_load_snowflake_mode,
      snowflake_enrichment,
      snowflake_event_types,
      snowflake_table,
      place_mode,
      place_area,
      place_clustering,
      cluster_size,
    }) => {
      const keyId = getRequestKeyId();

      const rate = checkBatchJobRate(keyId);
      if (!rate.ok) {
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const norm = normalizeIndustry(industry);
      if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
        return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`);
      }
      if (dual_load_snowflake === true && !snowflakeProfileTableForIndustry(norm.industry)) {
        return toolError('dual_load_snowflake requires a non-generic industry: travel, fsi, retail, telecom, media, or sports.');
      }

      const segmentNorm = segment_hint ? normalizeSegmentHint(segment_hint, norm.industry) : null;
      if (segment_hint && segmentNorm && (segmentNorm.includes('Unknown') || segmentNorm.includes('not supported'))) {
        return toolError(segmentNorm);
      }

      const useRandomize = randomize ?? fill_sample_data ?? true;

      const placeCheck = validatePlaceParams({ place_mode, place_area });
      if (!placeCheck.ok) {
        return toolError(placeCheck.error);
      }
      const placePlan = useRandomize
        ? planBatchPlaces({
            count,
            place_mode: placeCheck.place_mode,
            place_area: placeCheck.place_area,
            place_clustering,
            cluster_size,
          })
        : null;

      const normalizedTest = normalizeGenerateProfileParams({
        test_profile,
        test_profile_override_reason,
        ensureLanguage: false,
      });
      if (!normalizedTest.ok) {
        return toolError(normalizedTest.error);
      }

      const useStoredPrefs = use_stored_prefs ?? (!base_email && !email_pattern);
      if (dual_load_snowflake === true && !useStoredPrefs) {
        return toolError(
          'dual_load_snowflake batch requires use_stored_prefs:true (omit base_email) so each profile gets a unique Firestore counter email.',
          { confirmTool: 'lab_confirm_profile_generation' },
        );
      }
      if (useStoredPrefs) {
        const prefsCheck = await checkGenerationPrefsConfigured(allowed.sandbox);
        if (!prefsCheck.ok) {
          writeAuditLog({
            keyId,
            tool: 'lab_generate_profiles_batch',
            sandbox: allowed.sandbox,
            result: 'error',
          });
          return toolError(prefsCheck.error, {
            hint: prefsCheck.hint,
            coworkerPrompt: prefsCheck.coworkerPrompt,
            confirmTool: prefsCheck.confirmTool,
            questionsForColleague: prefsCheck.questionsForColleague,
            formatRules: prefsCheck.formatRules,
            recommendedAction: prefsCheck.recommendedAction,
            nextStep: prefsCheck.nextStep,
          });
        }
      }
      if (!useStoredPrefs) {
        const sampleEmail = resolveBatchEmail({
          index: 1,
          baseEmail: base_email,
          emailPattern: email_pattern,
          industry: norm.industry,
        });
        const sampleCheck = validateScaledLabEmail(sampleEmail);
        if (!sampleCheck.ok) {
          return toolError(sampleCheck.error, {
            coworkerPrompt: sampleCheck.coworkerPrompt,
            example: sampleCheck.example,
            expectedPattern: sampleCheck.expectedPattern,
            sampleEmail,
            formatRules: buildEmailFormatRules(),
            hint: 'Use use_stored_prefs:true (recommended) or email_pattern with +DDMMYYYY-N placeholders.',
            confirmTool: 'lab_confirm_profile_generation',
          });
        }
      }

      const job = await createBatchJob({
        jobType: 'profile_batch',
        count,
        params: {
          sandbox: allowed.sandbox,
          industry: norm.industry,
          count,
          base_email,
          email_pattern,
          randomize: useRandomize,
          segment_hint: typeof segmentNorm === 'string' ? segmentNorm : null,
          loyalty_member: loyalty_member === true,
          last_order_details,
          delay_ms,
          attributes,
          append_if_existing,
          test_profile: normalizedTest.test_profile,
          test_profile_override_reason: normalizedTest.testProfileOverrideReason || null,
          use_stored_prefs: useStoredPrefs,
          dual_load_snowflake: dual_load_snowflake === true,
          dual_load_snowflake_mode: dual_load_snowflake_mode || 'crm_generate',
          snowflake_enrichment: snowflake_enrichment === true,
          snowflake_event_types,
          snowflake_table,
          place_mode: placeCheck.place_mode || null,
          place_area: placeCheck.place_area || null,
          place_plan: placePlan ? placePlan.places : null,
        },
      });

      writeAuditLog({
        keyId,
        tool: 'lab_generate_profiles_batch',
        sandbox: allowed.sandbox,
        industry: norm.industry,
        count,
        jobId: job.jobId,
        segmentHint: typeof segmentNorm === 'string' ? segmentNorm : null,
        result: 'ok',
      });

      setImmediate(() => {
        processBatchJob(job.jobId, { keyId }).catch((err) => {
          console.error('[aep-lab-profile-mcp] batch job failed:', job.jobId, err);
        });
      });

      return jsonResult({
        ok: true,
        job_id: job.jobId,
        job_type: 'profile_batch',
        status: job.status,
        count,
        sandbox: allowed.sandbox,
        industry: norm.industry,
        randomize: useRandomize,
        segment_hint: typeof segmentNorm === 'string' ? segmentNorm : null,
        delay_ms: delay_ms ?? null,
        use_stored_prefs: useStoredPrefs,
        dual_load_snowflake: dual_load_snowflake === true,
        place_mode: placeCheck.place_mode || 'featured',
        place_area: placeCheck.place_area || null,
        place_clusters: summarizePlacePlan(placePlan),
        formatRules: buildEmailFormatRules(),
        pollTool: 'lab_batch_job_status',
        note: 'Job runs in background. Poll lab_batch_job_status with job_id.',
      });
    },
  );
}
