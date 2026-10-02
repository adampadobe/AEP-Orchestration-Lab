/**
 * Background bulk tag attach/detach worker. DPS has no array-body batch
 * endpoint, so this loops sequentially over the offer ids verified by
 * lab_decisioning_tag_bulk_apply, calling apply-one per offer with a small
 * retry on transient failures. Mirrors decisioningBulkProcessor.mjs's
 * job-progress shape; resumable via resume_token = job_id (continues from
 * results.length instead of restarting).
 */

import { decisioningTagApplyOne } from './labApiClient.mjs';
import { updateBatchJob } from './batchJobStore.mjs';
import { writeAuditLog } from './auditLog.mjs';

const DEFAULT_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;
const MAX_ATTEMPTS = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function batchDelayMs(raw) {
  const n = Number(raw ?? DEFAULT_DELAY_MS);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DELAY_MS;
  return Math.min(n, MAX_DELAY_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyOneOffer(params) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await decisioningTagApplyOne(params);
    if (result.ok) return result;
    lastError = result;
    if (attempt < MAX_ATTEMPTS && RETRYABLE_STATUSES.has(Number(result.status))) continue;
    return result;
  }
  return lastError;
}

/**
 * @param {string} jobId
 * @param {object} opts
 * @param {string} opts.keyId
 */
export async function processDecisioningTagBulkJob(jobId, { keyId }) {
  const { getBatchJob } = await import('./batchJobStore.mjs');
  const job = await getBatchJob(jobId);
  if (!job) return;

  const params = job.params || {};
  const offerIds = Array.isArray(params.offerIds) ? params.offerIds : [];
  const delayMs = batchDelayMs(params.delay_ms);

  const results = Array.isArray(job.results) ? [...job.results] : [];
  const errors = Array.isArray(job.errors) ? [...job.errors] : [];
  let completed = results.filter((r) => r.ok).length;
  let failed = results.filter((r) => !r.ok).length;
  const startIndex = results.length;

  await updateBatchJob(jobId, { status: 'running', startedAt: job.startedAt || new Date().toISOString() });

  for (let i = startIndex; i < offerIds.length; i += 1) {
    const offerId = offerIds[i];
    try {
      const applyResult = await applyOneOffer({
        sandbox: params.sandbox,
        action: params.action,
        tags: params.tags,
        offer_id: offerId,
        schema_id: params.schema_id,
        auto_detect: params.auto_detect,
      });

      if (applyResult.ok) {
        completed += 1;
        results.push({ index: i, offer_id: offerId, ok: true, no_op: applyResult.data?.no_op, after_tags: applyResult.data?.after_tags });
      } else {
        failed += 1;
        const errMsg = applyResult.error || 'Decisioning tag API request failed';
        errors.push({ index: i, offer_id: offerId, error: errMsg });
        results.push({ index: i, offer_id: offerId, ok: false, error: errMsg });
      }
    } catch (err) {
      failed += 1;
      const errMsg = String(err?.message || err);
      errors.push({ index: i, offer_id: offerId, error: errMsg });
      results.push({ index: i, offer_id: offerId, ok: false, error: errMsg });
    }

    await updateBatchJob(jobId, {
      progress: { completed: completed + failed, total: offerIds.length, failed, succeeded: completed },
      results,
      errors,
    });

    if (i < offerIds.length - 1 && delayMs > 0) await sleep(delayMs);
  }

  const finalStatus = failed === offerIds.length ? 'failed' : failed > 0 ? 'completed_with_errors' : 'completed';
  await updateBatchJob(jobId, {
    status: finalStatus,
    finishedAt: new Date().toISOString(),
    progress: { completed: offerIds.length, total: offerIds.length, failed, succeeded: completed },
    results,
    errors,
  });

  writeAuditLog({
    keyId,
    tool: 'lab_decisioning_tag_bulk_apply',
    jobId,
    sandbox: params.sandbox,
    action: params.action,
    count: offerIds.length,
    succeeded: completed,
    failed,
    status: finalStatus,
  });
}
