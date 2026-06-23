import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { createBatchJob, getBatchStoreMode } from '../batchJobStore.mjs';
import { processBatchJob } from '../batchProcessor.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { normalizeSegmentHint } from '../personaBuilder.mjs';
import { checkBatchJobRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { jsonResult, toolError } from './helpers.mjs';

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
        'Queue an async batch job that generates 1–100 profiles via POST /api/profile/generate. Returns job_id immediately; poll with lab_batch_job_status. Optional segment_hint: travel (hotel_high_value, hotel_reactivation), fsi (high_net_worth, credit_rebuild), retail (loyalty_vip, cart_abandoner). Optional delay_ms between items (default env AEP_LAB_MCP_BATCH_DELAY_MS, max 5000).',
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
        test_profile: z.boolean().optional(),
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
      delay_ms,
      attributes,
      append_if_existing,
      test_profile,
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

      const segmentNorm = segment_hint ? normalizeSegmentHint(segment_hint, norm.industry) : null;
      if (segment_hint && segmentNorm && (segmentNorm.includes('Unknown') || segmentNorm.includes('not supported'))) {
        return toolError(segmentNorm);
      }

      const useRandomize = randomize ?? fill_sample_data ?? true;

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
          delay_ms,
          attributes,
          append_if_existing,
          test_profile,
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
        storeMode: getBatchStoreMode(),
        pollTool: 'lab_batch_job_status',
        note: 'Job runs in background. Poll lab_batch_job_status with job_id.',
      });
    },
  );
}
