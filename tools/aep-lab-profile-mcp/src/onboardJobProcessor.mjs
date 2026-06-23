/**
 * Background worker for lab_onboard_sandbox mode=execute_all jobs.
 */

import { LAB_INDUSTRY_KEYS } from './industries.mjs';
import {
  enableProfileInfra,
  getProfileConnection,
  profileInfraStatusAll,
  provisionProfileInfraStep,
} from './labApiClient.mjs';
import {
  assessIndustrySandboxConfig,
  buildSandboxProfileConfigReport,
  connectionApiPathForIndustry,
} from './sandboxConfig.mjs';
import { routePrefixForIndustry } from './industryRoutes.mjs';
import { updateBatchJob } from './batchJobStore.mjs';
import { writeAuditLog } from './auditLog.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute provisioning for one industry (same logic as onboardSandbox execute mode).
 * @param {object} opts
 */
async function executeIndustryOnboard({ sandbox, industry, report }) {
  const target = report.industries[industry];
  if (target?.ready) {
    return {
      industry,
      ok: true,
      skipped: true,
      message: 'Already ready',
      verification: target,
    };
  }

  const routePrefix = routePrefixForIndustry(industry);
  if (!routePrefix) {
    return { industry, ok: false, error: `No route prefix for industry "${industry}".` };
  }

  /** @type {Array<{ step: string, ok: boolean }>} */
  const executed = [];

  const needsProvision =
    target?.missingSteps?.includes('provision_infra') ||
    target?.missingSteps?.includes('save_http_streaming_connection') ||
    target?.missingSteps?.includes('complete_connection_manifest');

  if (needsProvision) {
    const prov = await provisionProfileInfraStep({
      routePrefix,
      sandbox,
      step: 'all_core',
    });
    executed.push({ step: 'all_core', ok: prov.ok });
    if (!prov.ok) {
      return {
        industry,
        ok: false,
        executed,
        error: prov.error || 'Provisioning failed',
        status: prov.status,
      };
    }
  }

  const needsEnable =
    target?.missingSteps?.includes('enable_profile_on_dataset') ||
    target?.missingSteps?.includes('schema_profile_union');

  if (needsEnable) {
    const enable = await enableProfileInfra({ routePrefix, sandbox });
    executed.push({ step: 'enable_profile', ok: enable.ok });
    if (!enable.ok) {
      return {
        industry,
        ok: false,
        executed,
        error: enable.error || 'Enable profile failed',
        status: enable.status,
      };
    }
  }

  const refreshedStatus = await profileInfraStatusAll({ sandbox, refresh: true });
  const connPath = connectionApiPathForIndustry(industry);
  let connData = null;
  if (connPath) {
    const connResult = await getProfileConnection({ path: connPath, sandbox });
    if (connResult.ok) connData = connResult.data;
  }

  const verification = assessIndustrySandboxConfig({
    industry,
    sandbox,
    infraStatus: refreshedStatus.ok ? refreshedStatus.data?.industries?.[industry] : null,
    connectionResponse: connData,
  });

  return {
    industry,
    ok: verification.ready,
    executed,
    verification,
    nextAction: verification.nextAction,
  };
}

/**
 * @param {string} jobId
 * @param {object} opts
 * @param {string} opts.keyId
 */
export async function processOnboardAllJob(jobId, { keyId }) {
  const { getBatchJob } = await import('./batchJobStore.mjs');
  const job = await getBatchJob(jobId);
  if (!job) return;

  const params = job.params || {};
  const sandbox = params.sandbox;
  const pollDelayMs = Number(params.poll_delay_ms || 2000);

  await updateBatchJob(jobId, { status: 'running', startedAt: new Date().toISOString() });

  const statusResult = await profileInfraStatusAll({ sandbox, refresh: params.refresh === true });
  if (!statusResult.ok) {
    await updateBatchJob(jobId, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      errors: [{ error: statusResult.error || 'Failed to fetch infra status' }],
    });
    return;
  }

  const connectionsByIndustry = {};
  await Promise.all(
    LAB_INDUSTRY_KEYS.map(async (key) => {
      const path = connectionApiPathForIndustry(key);
      if (!path) return;
      const connResult = await getProfileConnection({ path, sandbox });
      if (connResult.ok) connectionsByIndustry[key] = connResult.data;
    }),
  );

  const report = buildSandboxProfileConfigReport({
    sandbox,
    statusAllIndustries: statusResult.data?.industries || {},
    connectionsByIndustry,
  });

  const industries = report.notReadyIndustries.length > 0 ? report.notReadyIndustries : LAB_INDUSTRY_KEYS;
  const total = industries.length;

  /** @type {Array<object>} */
  const results = [];
  /** @type {Array<object>} */
  const errors = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < industries.length; i += 1) {
    const industry = industries[i];

    const freshStatus = await profileInfraStatusAll({ sandbox, refresh: true });
    const freshConnections = { ...connectionsByIndustry };
    const connPath = connectionApiPathForIndustry(industry);
    if (connPath) {
      const connResult = await getProfileConnection({ path: connPath, sandbox });
      if (connResult.ok) freshConnections[industry] = connResult.data;
    }

    const freshReport = buildSandboxProfileConfigReport({
      sandbox,
      statusAllIndustries: freshStatus.ok ? freshStatus.data?.industries || {} : {},
      connectionsByIndustry: freshConnections,
      industryFilter: [industry],
    });

    const itemResult = await executeIndustryOnboard({
      sandbox,
      industry,
      report: freshReport,
    });

    if (itemResult.ok) {
      succeeded += 1;
    } else {
      failed += 1;
      errors.push({ industry, error: itemResult.error || 'Onboard failed' });
    }
    results.push(itemResult);

    await updateBatchJob(jobId, {
      progress: {
        completed: i + 1,
        total,
        failed,
        succeeded,
        currentIndustry: industry,
      },
      results,
      errors,
    });

    if (i < industries.length - 1 && pollDelayMs > 0) {
      await sleep(pollDelayMs);
    }
  }

  const finalStatus =
    failed === total ? 'failed' : failed > 0 ? 'completed_with_errors' : 'completed';

  await updateBatchJob(jobId, {
    status: finalStatus,
    finishedAt: new Date().toISOString(),
    progress: { completed: total, total, failed, succeeded },
    results,
    errors,
  });

  writeAuditLog({
    keyId,
    tool: 'lab_onboard_sandbox',
    sandbox,
    mode: 'execute_all',
    count: total,
    succeeded,
    failed,
    status: finalStatus,
    jobId,
    result: failed === 0 ? 'ok' : 'error',
  });
}
