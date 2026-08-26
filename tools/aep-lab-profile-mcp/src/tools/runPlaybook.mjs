import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { createBatchJob } from '../batchJobStore.mjs';
import { processPlaybookJob } from '../playbookProcessor.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { normalizeSegmentHint } from '../personaBuilder.mjs';
import { checkBatchJobRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { checkGenerationPrefsConfigured } from './generationPrefs.mjs';
import { snowflakeProfileTableForIndustry } from '../snowflakeIndustry.mjs';
import { requireUserMcpKeyForSnowflake } from './snowflakeTools.mjs';
import { jsonResult, toolError } from './helpers.mjs';

const PLAYBOOK_MAX = 20;
const MAX_DELAY_MS = 5000;

/**
 * A first, deliberately narrow "coordinator" tool: generate N profiles for
 * an industry, then read each one back to confirm it actually landed,
 * instead of the calling LLM doing a generate call and a lookup call per
 * profile itself. Always uses the recommended stored-prefs email counter
 * and default test_profile:true — this is meant to be the fast, opinionated
 * path, not a replacement for lab_generate_profiles_batch's full knob set.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerRunPlaybookTool(mcpServer) {
  mcpServer.registerTool(
    'lab_run_playbook',
    {
      title: 'Run a playbook: generate + validate profiles (async)',
      description:
        'Generates 1-20 test profiles for an industry using the stored-prefs email counter, then reads each one back '
        + '(AEP profile table, and optionally the Snowflake dual-load bundle) to confirm what actually landed. Returns '
        + 'one consolidated report instead of a generate call plus a lookup call per profile. Poll with '
        + 'lab_batch_job_status. Call lab_confirm_profile_generation first if stored prefs are not yet configured.',
      inputSchema: {
        playbook: z.enum(['generate_and_validate']).describe('Which playbook to run.'),
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: z.string().optional().describe('Industry key or alias (default generic)'),
        count: z.number().int().min(1).max(PLAYBOOK_MAX).describe(`Number of profiles to generate and validate (1-${PLAYBOOK_MAX})`),
        segment_hint: z.string().optional().describe('Segment overlay, same values as lab_generate_profile'),
        loyalty_member: z.boolean().optional().describe('When true (default false), emit LYL-* loyalty on generated profiles'),
        delay_ms: z.number().int().min(0).max(MAX_DELAY_MS).optional().describe(`Delay between profiles in ms (0-${MAX_DELAY_MS})`),
        dual_load_snowflake: z
          .boolean()
          .optional()
          .describe('When true for a non-generic industry, also INSERT an independent CRM row per profile before validating it.'),
        validate_snowflake: z
          .boolean()
          .optional()
          .describe('When true, also read back the Snowflake side via the profile bundle. Requires dual_load_snowflake:true and a non-generic, non-travel industry.'),
        event_limit: z.number().int().min(1).max(100).optional().describe('Max rows per Snowflake table in the validation read-back (default 10)'),
      },
    },
    async ({
      playbook,
      sandbox,
      industry,
      count,
      segment_hint,
      loyalty_member,
      delay_ms,
      dual_load_snowflake,
      validate_snowflake,
      event_limit,
    }) => {
      const keyId = getRequestKeyId();

      const rate = checkBatchJobRate(keyId);
      if (!rate.ok) return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });

      const norm = normalizeIndustry(industry);
      if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
        return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`);
      }

      if (dual_load_snowflake === true && !snowflakeProfileTableForIndustry(norm.industry)) {
        return toolError('dual_load_snowflake requires a non-generic industry: travel, fsi, retail, telecom, media, or sports.');
      }
      if (validate_snowflake === true) {
        if (dual_load_snowflake !== true) {
          return toolError('validate_snowflake requires dual_load_snowflake:true — there is nothing to validate otherwise.');
        }
        if (norm.industry === 'travel' || norm.industry === 'generic') {
          return toolError('validate_snowflake (profile bundle read-back) supports fsi, retail, telecom, media, and sports only.');
        }
        const userKey = requireUserMcpKeyForSnowflake();
        if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
      }

      const segmentNorm = segment_hint ? normalizeSegmentHint(segment_hint, norm.industry) : null;
      if (segment_hint && segmentNorm && (segmentNorm.includes('Unknown') || segmentNorm.includes('not supported'))) {
        return toolError(segmentNorm);
      }

      const prefsCheck = await checkGenerationPrefsConfigured(allowed.sandbox);
      if (!prefsCheck.ok) {
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

      const job = await createBatchJob({
        jobType: 'playbook_generate_and_validate',
        count,
        params: {
          sandbox: allowed.sandbox,
          industry: norm.industry,
          count,
          segment_hint: typeof segmentNorm === 'string' ? segmentNorm : null,
          loyalty_member: loyalty_member === true,
          delay_ms,
          dual_load_snowflake: dual_load_snowflake === true,
          validate_snowflake: validate_snowflake === true,
          event_limit,
        },
      });

      writeAuditLog({
        keyId,
        tool: 'lab_run_playbook',
        sandbox: allowed.sandbox,
        industry: norm.industry,
        count,
        jobId: job.jobId,
        result: 'ok',
      });

      setImmediate(() => {
        processPlaybookJob(job.jobId, { keyId }).catch((err) => {
          console.error('[aep-lab-profile-mcp] playbook job failed:', job.jobId, err);
        });
      });

      return jsonResult({
        ok: true,
        job_id: job.jobId,
        job_type: 'playbook_generate_and_validate',
        playbook,
        status: job.status,
        count,
        sandbox: allowed.sandbox,
        industry: norm.industry,
        dual_load_snowflake: dual_load_snowflake === true,
        validate_snowflake: validate_snowflake === true,
        pollTool: 'lab_batch_job_status',
        note: 'Job runs in background. Poll lab_batch_job_status with job_id for the consolidated generate+validate report.',
      });
    },
  );
}
