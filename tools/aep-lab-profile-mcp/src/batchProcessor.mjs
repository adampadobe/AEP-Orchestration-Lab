/**
 * Background batch profile generation worker.
 */

import { executeGeneratePlan, planDualStreamGenerate } from './framework/dualStreamGenerate.mjs';
import { buildPersonaAttributes, resolveBatchEmail } from './personaBuilder.mjs';
import { resolveStoredPrefsEmail } from './tools/generationPrefs.mjs';
import { ensurePreferredLanguageOnAttributes, resolveTestProfileParam } from './framework/generateProfileParams.mjs';
import {
  personHintsFromAttributes,
  recordRecentProfileGenerated,
} from './framework/recordRecentProfile.mjs';
import { updateBatchJob } from './batchJobStore.mjs';
import { writeAuditLog } from './auditLog.mjs';
import { checkGenerateRate } from './rateLimiter.mjs';

const DEFAULT_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;

function batchDelayMs() {
  const raw = Number(process.env.AEP_LAB_MCP_BATCH_DELAY_MS || DEFAULT_DELAY_MS);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_DELAY_MS;
  return Math.min(raw, MAX_DELAY_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} jobId
 * @param {object} opts
 * @param {string} opts.keyId
 */
export async function processBatchJob(jobId, { keyId }) {
  const { getBatchJob } = await import('./batchJobStore.mjs');
  const job = await getBatchJob(jobId);
  if (!job) return;

  const params = job.params || {};
  const count = Number(params.count || 0);
  const delayMs =
    params.delay_ms != null && Number.isFinite(Number(params.delay_ms))
      ? Math.min(Math.max(0, Number(params.delay_ms)), MAX_DELAY_MS)
      : batchDelayMs();

  await updateBatchJob(jobId, { status: 'running', startedAt: new Date().toISOString() });

  /** @type {Array<{ index: number, email: string, ok: boolean, ecid?: string, error?: string }>} */
  const results = [];
  /** @type {Array<{ index: number, email: string, error: string }>} */
  const errors = [];
  let completed = 0;
  let failed = 0;

  for (let i = 1; i <= count; i += 1) {
    let email;
    if (params.use_stored_prefs) {
      const reserved = await resolveStoredPrefsEmail(params.sandbox);
      if (!reserved.ok) {
        failed += 1;
        const errMsg = reserved.error || 'Failed to reserve stored prefs email';
        errors.push({ index: i, email: '', error: errMsg });
        results.push({ index: i, email: '', ok: false, error: errMsg });
        continue;
      }
      email = reserved.email;
    } else {
      email = resolveBatchEmail({
        index: i,
        baseEmail: params.base_email,
        emailPattern: params.email_pattern,
        industry: params.industry,
      });
    }

    let attributes = params.attributes;
    if (params.randomize && (!attributes || Object.keys(attributes).length === 0)) {
      attributes = buildPersonaAttributes(params.industry, email, params.segment_hint || null, {
        loyalty_member: params.loyalty_member === true,
        last_order_details: params.last_order_details,
      });
    }
    if (attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0) {
      attributes = ensurePreferredLanguageOnAttributes(attributes).attributes;
    }

    const testProfileResolved = resolveTestProfileParam({
      test_profile: params.test_profile,
      test_profile_override_reason: params.test_profile_override_reason,
    });
    if (!testProfileResolved.ok) {
      failed += 1;
      const errMsg = testProfileResolved.error;
      errors.push({ index: i, email, error: errMsg });
      results.push({ index: i, email, ok: false, error: errMsg });
      continue;
    }

    try {
      const genRate = checkGenerateRate(keyId);
      if (!genRate.ok) {
        failed += 1;
        const errMsg = genRate.message;
        errors.push({ index: i, email, error: errMsg });
        results.push({ index: i, email, ok: false, error: errMsg });
      } else {
      const generatePlan = planDualStreamGenerate({
        industry: params.industry,
        attributes,
        email,
      });

      const apiResult = await executeGeneratePlan({
        email,
        sandbox: params.sandbox,
        plan: generatePlan,
        append_if_existing: params.append_if_existing,
        test_profile: testProfileResolved.test_profile,
      });

      if (apiResult.ok) {
        completed += 1;
        const ecid =
          apiResult.ecid ||
          apiResult.data?.ecid ||
          apiResult.data?.identification?.core?.ecid ||
          apiResult.data?.profile?.ecid ||
          undefined;
        results.push({ index: i, email, ok: true, ecid });
        const hints = personHintsFromAttributes(attributes);
        await recordRecentProfileGenerated({
          sandbox: params.sandbox,
          email,
          ecid,
          industry: params.industry,
          attributes,
          ...hints,
        });
      } else {
        failed += 1;
        const errMsg = apiResult.error || 'Lab API request failed';
        errors.push({ index: i, email, error: errMsg });
        results.push({ index: i, email, ok: false, error: errMsg });
      }
      }
    } catch (err) {
      failed += 1;
      const errMsg = String(err?.message || err);
      errors.push({ index: i, email, error: errMsg });
      results.push({ index: i, email, ok: false, error: errMsg });
    }

    await updateBatchJob(jobId, {
      progress: { completed: completed + failed, total: count, failed, succeeded: completed },
      results,
      errors,
    });

    if (i < count && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const finalStatus = failed === count ? 'failed' : failed > 0 ? 'completed_with_errors' : 'completed';
  await updateBatchJob(jobId, {
    status: finalStatus,
    finishedAt: new Date().toISOString(),
    progress: { completed: count, total: count, failed, succeeded: completed },
    results,
    errors,
  });

  writeAuditLog({
    keyId,
    tool: 'lab_generate_profiles_batch',
    jobId,
    sandbox: params.sandbox,
    industry: params.industry,
    count,
    succeeded: completed,
    failed,
    status: finalStatus,
  });
}
