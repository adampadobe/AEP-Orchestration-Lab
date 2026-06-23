import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { createBatchJob, getBatchStoreMode } from '../batchJobStore.mjs';
import { processBatchJob } from '../batchProcessor.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { jsonResult, toolError } from './helpers.mjs';

const BATCH_MAX = 100;

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGenerateProfilesBatchTool(mcpServer) {
  mcpServer.registerTool(
    'lab_generate_profiles_batch',
    {
      title: 'Batch generate test profiles (async)',
      description:
        'Queue an async batch job that generates 1–100 profiles via POST /api/profile/generate. Returns job_id immediately; poll with lab_batch_job_status. Rate-limited between items.',
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
      attributes,
      append_if_existing,
      test_profile,
    }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const norm = normalizeIndustry(industry);
      if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
        return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`);
      }

      const useRandomize = randomize ?? fill_sample_data ?? true;
      const keyId = getRequestKeyId();

      const job = await createBatchJob({
        count,
        params: {
          sandbox: allowed.sandbox,
          industry: norm.industry,
          count,
          base_email,
          email_pattern,
          randomize: useRandomize,
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
      });

      setImmediate(() => {
        processBatchJob(job.jobId, { keyId }).catch((err) => {
          console.error('[aep-lab-profile-mcp] batch job failed:', job.jobId, err);
        });
      });

      return jsonResult({
        ok: true,
        job_id: job.jobId,
        status: job.status,
        count,
        sandbox: allowed.sandbox,
        industry: norm.industry,
        randomize: useRandomize,
        storeMode: getBatchStoreMode(),
        pollTool: 'lab_batch_job_status',
        note: 'Job runs in background. Poll lab_batch_job_status with job_id.',
      });
    },
  );
}
