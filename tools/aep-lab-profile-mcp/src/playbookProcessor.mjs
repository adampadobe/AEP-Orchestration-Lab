/**
 * Background "generate + validate" playbook worker.
 *
 * Generates N profiles for an industry, then reads each one back (AEP
 * profile table, and optionally the Snowflake dual-load bundle) to confirm
 * what actually landed — one consolidated report instead of the calling
 * LLM doing N generate calls plus N more read-back calls by hand.
 *
 * Deliberately a separate, self-contained worker rather than a refactor of
 * batchProcessor.mjs's per-item generate logic: that function has no
 * dedicated regression test, and duplicating the (short) generate step here
 * is a safer tradeoff than risking a live-untestable change to the
 * existing, working batch-generate path.
 */

import { executeGeneratePlan, planDualStreamGenerate } from './framework/dualStreamGenerate.mjs';
import { buildPersonaAttributes } from './personaBuilder.mjs';
import { resolveStoredPrefsEmail } from './tools/generationPrefs.mjs';
import { ensurePreferredLanguageOnAttributes, resolveTestProfileParam } from './framework/generateProfileParams.mjs';
import { personHintsFromAttributes, recordRecentProfileGenerated } from './framework/recordRecentProfile.mjs';
import { lookupProfile, snowflakeInsertProfileFromAep, snowflakeProfileBundle } from './labApiClient.mjs';
import { summarizeProfileTable } from './profileMerge.mjs';
import { getBatchJob, updateBatchJob } from './batchJobStore.mjs';
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
export async function processPlaybookJob(jobId, { keyId }) {
  const job = await getBatchJob(jobId);
  if (!job) return;

  const params = job.params || {};
  const count = Number(params.count || 0);
  const delayMs =
    params.delay_ms != null && Number.isFinite(Number(params.delay_ms))
      ? Math.min(Math.max(0, Number(params.delay_ms)), MAX_DELAY_MS)
      : batchDelayMs();

  await updateBatchJob(jobId, { status: 'running', startedAt: new Date().toISOString() });

  /** @type {Array<Record<string, unknown>>} */
  const results = [];
  /** @type {Array<{ index: number, email: string, error: string }>} */
  const errors = [];
  let completed = 0;
  let failed = 0;

  for (let i = 1; i <= count; i += 1) {
    const reserved = await resolveStoredPrefsEmail(params.sandbox);
    if (!reserved.ok) {
      failed += 1;
      const errMsg = reserved.error || 'Failed to reserve stored prefs email';
      errors.push({ index: i, email: '', error: errMsg });
      results.push({ index: i, email: '', ok: false, error: errMsg });
      await updateBatchJob(jobId, {
        progress: { completed: completed + failed, total: count, failed, succeeded: completed },
        results,
        errors,
      });
      continue;
    }
    const email = reserved.email;
    const row = { index: i, email };

    try {
      const genRate = checkGenerateRate(keyId);
      if (!genRate.ok) throw new Error(genRate.message);

      let attributes = buildPersonaAttributes(params.industry, email, params.segment_hint || null, {
        loyalty_member: params.loyalty_member === true,
      });
      attributes = ensurePreferredLanguageOnAttributes(attributes).attributes;

      const testProfileResolved = resolveTestProfileParam({ test_profile: true });
      const generatePlan = planDualStreamGenerate({ industry: params.industry, attributes, email });
      const genResult = await executeGeneratePlan({
        email,
        sandbox: params.sandbox,
        plan: generatePlan,
        test_profile: testProfileResolved.test_profile,
      });
      if (!genResult.ok) throw new Error(genResult.error || 'Profile generate failed');

      const ecid =
        genResult.ecid ||
        genResult.data?.ecid ||
        genResult.data?.identification?.core?.ecid ||
        genResult.data?.profile?.ecid ||
        undefined;
      row.ecid = ecid;

      const hints = personHintsFromAttributes(attributes);
      await recordRecentProfileGenerated({
        sandbox: params.sandbox,
        email,
        ecid,
        industry: params.industry,
        attributes,
        ...hints,
      });

      let snowflakeInsert = null;
      if (params.dual_load_snowflake === true && ecid) {
        const sfResult = await snowflakeInsertProfileFromAep({
          sandbox: params.sandbox,
          email,
          ecid: String(ecid),
          attributes,
          industry: params.industry,
          mode: 'crm_generate',
        });
        snowflakeInsert = {
          ok: sfResult.ok,
          crmId: sfResult.data?.result?.crmId || null,
          error: sfResult.ok ? null : sfResult.error || sfResult.data?.result?.error || null,
        };
      }

      // Validation step — read back what generation (and the optional
      // Snowflake insert above) just wrote, rather than trusting the write
      // response alone.
      const aepLookup = await lookupProfile({ sandbox: params.sandbox, namespace: 'email', identifier: email });
      const aep = {
        ok: aepLookup.ok,
        error: aepLookup.ok ? null : aepLookup.error || null,
        summary: aepLookup.ok ? summarizeProfileTable(aepLookup.data) : null,
      };

      let snowflakeValidation = null;
      if (params.validate_snowflake === true) {
        const bundle = await snowflakeProfileBundle({
          sandbox: params.sandbox,
          industry: params.industry,
          email,
          ecid: ecid ? String(ecid) : undefined,
          event_limit: params.event_limit || 10,
        });
        const bundleResult = bundle.data?.result;
        snowflakeValidation = {
          ok: bundle.ok && bundleResult?.ok !== false,
          error: bundle.ok ? bundleResult?.error?.message || null : bundle.error || null,
          tableCount: bundleResult?.tables ? Object.keys(bundleResult.tables).length : 0,
          totalReturnedRows: bundleResult?.totalReturnedRows || 0,
        };
      }

      row.aep = aep;
      if (snowflakeInsert) row.snowflakeInsert = snowflakeInsert;
      if (snowflakeValidation) row.snowflakeValidation = snowflakeValidation;

      const rowOk = aep.ok && (!snowflakeInsert || snowflakeInsert.ok) && (!snowflakeValidation || snowflakeValidation.ok);
      row.ok = rowOk;

      if (rowOk) {
        completed += 1;
      } else {
        failed += 1;
        row.error =
          (!aep.ok && `AEP validation failed: ${aep.error}`) ||
          (snowflakeInsert && !snowflakeInsert.ok && `Snowflake insert failed: ${snowflakeInsert.error}`) ||
          (snowflakeValidation && !snowflakeValidation.ok && `Snowflake validation failed: ${snowflakeValidation.error}`) ||
          'Validation failed';
        errors.push({ index: i, email, error: row.error });
      }
      results.push(row);
    } catch (err) {
      failed += 1;
      const errMsg = String(err?.message || err);
      row.ok = false;
      row.error = errMsg;
      errors.push({ index: i, email, error: errMsg });
      results.push(row);
    }

    await updateBatchJob(jobId, {
      progress: { completed: completed + failed, total: count, failed, succeeded: completed },
      results,
      errors,
    });

    if (i < count && delayMs > 0) await sleep(delayMs);
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
    tool: 'lab_run_playbook',
    jobId,
    sandbox: params.sandbox,
    industry: params.industry,
    count,
    succeeded: completed,
    failed,
    status: finalStatus,
  });
}
