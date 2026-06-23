import * as z from 'zod';
import { getBatchJob } from '../batchJobStore.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerBatchJobStatusTool(mcpServer) {
  mcpServer.registerTool(
    'lab_batch_job_status',
    {
      title: 'Poll async MCP job',
      description:
        'Returns status, progress, and results for lab_generate_profiles_batch (profile_batch) or lab_onboard_sandbox mode=execute_all (onboard_all) job_id.',
      inputSchema: {
        job_id: z.string().uuid().describe('Job ID returned by lab_generate_profiles_batch'),
      },
    },
    async ({ job_id }) => {
      const job = await getBatchJob(job_id);
      if (!job) {
        return toolError(`Batch job not found: ${job_id}`);
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_batch_job_status',
        jobId: job_id,
        status: job.status,
      });

      const progress = job.progress || {};
      const results = Array.isArray(job.results) ? job.results : [];
      const errors = Array.isArray(job.errors) ? job.errors : [];

      return jsonResult({
        ok: true,
        job_id: job.jobId || job_id,
        job_type: job.jobType || 'profile_batch',
        status: job.status,
        progress,
        storeMode: job.storeMode,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        params: job.params,
        summary: {
          total: progress.total ?? results.length,
          succeeded: progress.succeeded ?? results.filter((r) => r.ok).length,
          failed: progress.failed ?? errors.length,
        },
        results: results.slice(0, 50),
        errors: errors.slice(0, 20),
        truncated: {
          results: results.length > 50,
          errors: errors.length > 20,
        },
      });
    },
  );
}
