/**
 * Background bulk create/update worker for the Decisioning catalog. DPS has no
 * array-body batch endpoint, so this loops sequentially: preview (to obtain the
 * server-computed preflight_id/confirmation) then apply, per item, with a small
 * retry on transient failures. Mirrors batchProcessor.mjs's job-progress shape.
 */

import { decisioningCatalogChangeApply, decisioningCatalogChangePreview } from './labApiClient.mjs';
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

async function applyOneItem(params) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const previewResult = await decisioningCatalogChangePreview(params);
    if (!previewResult.ok) return previewResult;

    const applyResult = await decisioningCatalogChangeApply({
      ...params,
      preflight_id: previewResult.data.preflight_id,
      confirmation: previewResult.data.required_confirmation,
    });
    if (applyResult.ok) return applyResult;

    lastError = applyResult;
    if (attempt < MAX_ATTEMPTS && RETRYABLE_STATUSES.has(Number(applyResult.status))) continue;
    return applyResult;
  }
  return lastError;
}

/**
 * @param {string} jobId
 * @param {object} opts
 * @param {string} opts.keyId
 */
export async function processDecisioningBulkJob(jobId, { keyId }) {
  const { getBatchJob } = await import('./batchJobStore.mjs');
  const job = await getBatchJob(jobId);
  if (!job) return;

  const params = job.params || {};
  const items = Array.isArray(params.items) ? params.items : [];
  const delayMs = batchDelayMs(params.delay_ms);

  await updateBatchJob(jobId, { status: 'running', startedAt: new Date().toISOString() });

  /** @type {Array<{ index: number, id?: string, ok: boolean, entityId?: string, error?: string }>} */
  const results = [];
  const errors = [];
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += 1) {
    const op = items[i] || {};
    try {
      const applyResult = await applyOneItem({
        sandbox: params.sandbox,
        entity_type: params.entity_type,
        action: params.action,
        id: op.id,
        item: op.item,
        patches: op.patches,
        schema_id: params.schema_id,
        auto_detect: params.auto_detect,
      });

      if (applyResult.ok) {
        completed += 1;
        results.push({ index: i, id: op.id, ok: true, entityId: applyResult.data?.id });
      } else {
        failed += 1;
        const errMsg = applyResult.error || 'Decisioning API request failed';
        errors.push({ index: i, id: op.id, error: errMsg });
        results.push({ index: i, id: op.id, ok: false, error: errMsg });
      }
    } catch (err) {
      failed += 1;
      const errMsg = String(err?.message || err);
      errors.push({ index: i, id: op.id, error: errMsg });
      results.push({ index: i, id: op.id, ok: false, error: errMsg });
    }

    await updateBatchJob(jobId, {
      progress: { completed: completed + failed, total: items.length, failed, succeeded: completed },
      results,
      errors,
    });

    if (i < items.length - 1 && delayMs > 0) await sleep(delayMs);
  }

  const finalStatus = failed === items.length ? 'failed' : failed > 0 ? 'completed_with_errors' : 'completed';
  await updateBatchJob(jobId, {
    status: finalStatus,
    finishedAt: new Date().toISOString(),
    progress: { completed: items.length, total: items.length, failed, succeeded: completed },
    results,
    errors,
  });

  writeAuditLog({
    keyId,
    tool: 'lab_decisioning_catalog_bulk_apply',
    jobId,
    sandbox: params.sandbox,
    entityType: params.entity_type,
    action: params.action,
    count: items.length,
    succeeded: completed,
    failed,
    status: finalStatus,
  });
}
