import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import {
  enableProfileInfra,
  getProfileConnection,
  profileInfraStatusAll,
  provisionProfileInfraStep,
} from '../labApiClient.mjs';
import { createBatchJob, getBatchStoreMode } from '../batchJobStore.mjs';
import { processOnboardAllJob } from '../onboardJobProcessor.mjs';
import {
  assessIndustrySandboxConfig,
  buildOnboardingPlan,
  buildSandboxProfileConfigReport,
  connectionApiPathForIndustry,
} from '../sandboxConfig.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { routePrefixForIndustry } from '../industryRoutes.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerOnboardSandboxTool(mcpServer) {
  mcpServer.registerTool(
    'lab_onboard_sandbox',
    {
      title: 'Onboard sandbox profile config',
      description:
        'Guided sandbox onboarding: assess config → plan provisioning steps → optionally execute (provision all_core, enable profile, verify). Default mode=plan returns Coworker-chained steps; mode=execute runs one industry per call; mode=execute_all queues async job for all not-ready industries (poll lab_batch_job_status).',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        mode: z
          .enum(['plan', 'execute', 'execute_all'])
          .optional()
          .describe('plan = steps only (default); execute = one industry; execute_all = async all industries'),
        industry: z
          .string()
          .optional()
          .describe('Required when mode=execute — provision one industry per call'),
        refresh: z.boolean().optional().describe('Bypass infra status cache'),
        poll_delay_ms: z
          .number()
          .int()
          .min(0)
          .max(10000)
          .optional()
          .describe('Delay between industries for mode=execute_all (default 2000ms)'),
      },
    },
    async ({ sandbox, mode, industry, refresh, poll_delay_ms }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const runMode = mode === 'execute' ? 'execute' : mode === 'execute_all' ? 'execute_all' : 'plan';

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_onboard_sandbox',
        sandbox: allowed.sandbox,
        mode: runMode,
        industry: industry || null,
      });

      const statusResult = await profileInfraStatusAll({
        sandbox: allowed.sandbox,
        refresh: refresh === true,
      });
      if (!statusResult.ok) {
        return toolError(statusResult.error || 'Failed to fetch profile infra status', {
          status: statusResult.status,
        });
      }

      const statusAllIndustries = statusResult.data?.industries || {};
      const connectionsByIndustry = {};
      await Promise.all(
        LAB_INDUSTRY_KEYS.map(async (key) => {
          const path = connectionApiPathForIndustry(key);
          if (!path) return;
          const connResult = await getProfileConnection({ path, sandbox: allowed.sandbox });
          if (connResult.ok) connectionsByIndustry[key] = connResult.data;
        }),
      );

      const report = buildSandboxProfileConfigReport({
        sandbox: allowed.sandbox,
        statusAllIndustries,
        connectionsByIndustry,
      });

      const plan = buildOnboardingPlan(report, { execute: runMode === 'execute' });

      if (runMode === 'execute_all') {
        const industries =
          report.notReadyIndustries.length > 0 ? report.notReadyIndustries : LAB_INDUSTRY_KEYS;
        const job = await createBatchJob({
          jobType: 'onboard_all',
          count: industries.length,
          progress: { completed: 0, total: industries.length, failed: 0, succeeded: 0 },
          params: {
            sandbox: allowed.sandbox,
            refresh: refresh === true,
            poll_delay_ms: poll_delay_ms ?? 2000,
            industries,
          },
        });

        const keyId = getRequestKeyId();
        setImmediate(() => {
          processOnboardAllJob(job.jobId, { keyId }).catch((err) => {
            console.error('[aep-lab-profile-mcp] onboard job failed:', job.jobId, err);
          });
        });

        return jsonResult({
          ok: true,
          sandbox: allowed.sandbox,
          ready: report.ready,
          notReadyIndustries: report.notReadyIndustries,
          job_id: job.jobId,
          job_type: 'onboard_all',
          status: job.status,
          industryCount: industries.length,
          storeMode: getBatchStoreMode(),
          pollTool: 'lab_batch_job_status',
          warning:
            'execute_all runs sequentially in background — provisioning can take several minutes per industry. Poll lab_batch_job_status.',
        });
      }

      if (runMode === 'plan') {
        return jsonResult({
          ok: true,
          sandbox: allowed.sandbox,
          ready: report.ready,
          notReadyIndustries: report.notReadyIndustries,
          plan,
          manualChain:
            'Coworker can chain: lab_sandbox_profile_config → lab_provision_profile_infra_step (all_core) → lab_enable_profile → lab_sandbox_profile_config (verify).',
        });
      }

      if (!industry) {
        return toolError('mode=execute requires industry (one industry per call to avoid MCP timeout).', {
          notReadyIndustries: report.notReadyIndustries,
          suggestedPlan: plan,
        });
      }

      const norm = normalizeIndustry(industry);
      if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
        return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`);
      }

      const target = report.industries[norm.industry];
      if (target?.ready) {
        return jsonResult({
          ok: true,
          sandbox: allowed.sandbox,
          industry: norm.industry,
          message: 'Industry already ready — no provisioning needed.',
          assessment: target,
        });
      }

      const routePrefix = routePrefixForIndustry(norm.industry);
      if (!routePrefix) {
        return toolError(`No route prefix for industry "${norm.industry}".`);
      }

      /** @type {Array<{ step: string, ok: boolean, detail: unknown }>} */
      const executed = [];

      const needsProvision =
        target?.missingSteps?.includes('provision_infra') ||
        target?.missingSteps?.includes('save_http_streaming_connection') ||
        target?.missingSteps?.includes('complete_connection_manifest');

      if (needsProvision) {
        const prov = await provisionProfileInfraStep({
          routePrefix,
          sandbox: allowed.sandbox,
          step: 'all_core',
        });
        executed.push({
          step: 'lab_provision_profile_infra_step:all_core',
          ok: prov.ok,
          detail: prov.ok ? prov.data : { error: prov.error, status: prov.status },
        });
        if (!prov.ok) {
          return jsonResult({
            ok: false,
            sandbox: allowed.sandbox,
            industry: norm.industry,
            executed,
            error: prov.error || 'Provisioning failed',
          });
        }
      }

      const needsEnable =
        target?.missingSteps?.includes('enable_profile_on_dataset') ||
        target?.missingSteps?.includes('schema_profile_union');

      if (needsEnable) {
        const enable = await enableProfileInfra({
          routePrefix,
          sandbox: allowed.sandbox,
        });
        executed.push({
          step: 'lab_enable_profile',
          ok: enable.ok,
          detail: enable.ok ? enable.data : { error: enable.error, status: enable.status },
        });
      }

      const refreshedStatus = await profileInfraStatusAll({
        sandbox: allowed.sandbox,
        refresh: true,
      });
      const connPath = connectionApiPathForIndustry(norm.industry);
      let connData = null;
      if (connPath) {
        const connResult = await getProfileConnection({ path: connPath, sandbox: allowed.sandbox });
        if (connResult.ok) connData = connResult.data;
      }

      const verification = assessIndustrySandboxConfig({
        industry: norm.industry,
        sandbox: allowed.sandbox,
        infraStatus: refreshedStatus.ok ? refreshedStatus.data?.industries?.[norm.industry] : null,
        connectionResponse: connData,
      });

      return jsonResult({
        ok: verification.ready,
        sandbox: allowed.sandbox,
        industry: norm.industry,
        executed,
        verification,
        nextAction: verification.nextAction,
      });
    },
  );
}
