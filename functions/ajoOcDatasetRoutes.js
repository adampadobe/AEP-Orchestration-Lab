'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');
const { MAX_DATASETS, summarizeDataset } = require('./ajoOcDatasetService');

const CONFIRMATION_PREFIX = 'ENABLE ORCHESTRATED CAMPAIGNS IN';
const DATASET_ID_PATTERN = /^[a-f0-9]{24}$/i;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function responseStatus(error, fallback = 500) {
  const status = Number(error && error.status);
  return status >= 400 && status <= 599 ? status : fallback;
}

async function auditedRejection(res, store, auditBase, status, message) {
  await store.writeAudit({ ...auditBase, result: 'rejected', status, message });
  return res.status(status).json({ ok: false, error: message });
}

function selectedIds(input) {
  if (input.dataset_ids !== undefined && input.name_prefix !== undefined) {
    throw Object.assign(new Error('Provide either dataset_ids or name_prefix, not both.'), { status: 400 });
  }
  if (input.dataset_ids !== undefined) {
    const rawIds = Array.isArray(input.dataset_ids)
      ? input.dataset_ids
      : typeof input.dataset_ids === 'string' ? input.dataset_ids.split(',').filter(Boolean) : null;
    if (!rawIds || !rawIds.length || rawIds.length > MAX_DATASETS
        || rawIds.some((id) => typeof id !== 'string' || !DATASET_ID_PATTERN.test(id))) {
      throw Object.assign(new Error(`dataset_ids must contain 1-${MAX_DATASETS} exact Catalog dataset IDs.`), { status: 400 });
    }
    const ids = [...new Set(rawIds)];
    if (ids.length !== rawIds.length) {
      throw Object.assign(new Error('dataset_ids must not contain duplicates.'), { status: 400 });
    }
    return ids;
  }
  if (input.name_prefix !== undefined && input.name_prefix !== 'rel_') {
    throw Object.assign(new Error('Only the exact rel_ name prefix is supported.'), { status: 400 });
  }
  return null;
}

function confirmationPhrase(sandbox, count) {
  return `${CONFIRMATION_PREFIX} ${sandbox} FOR ${count} DATASETS`;
}

function extensionState(summary) {
  const extension = summary.extension;
  if (extension?.enabled === true || extension?.status === 'COMPLETED') return 'enabled';
  if (extension?.status === 'IN_PROGRESS') return 'in_progress';
  if (extension?.status === 'PENDING') return 'pending';
  return 'not_enabled';
}

function previewDecision(item) {
  if (extensionState(item) === 'enabled') return { eligible: false, reason: 'already_enabled' };
  if (extensionState(item) === 'in_progress' || extensionState(item) === 'pending') {
    return { eligible: false, reason: extensionState(item) };
  }
  if (item.system_dataset) return { eligible: false, reason: 'system_dataset' };
  if (item.profile_enabled) return { eligible: false, reason: 'profile_enabled' };
  if (item.ingestion_type !== 'cdc') return { eligible: false, reason: 'not_cdc' };
  if (item.data_behavior !== 'record') return { eligible: false, reason: 'not_record_behavior' };
  if (!item.schema_id) return { eligible: false, reason: 'missing_schema' };
  if (!item.extension_supported) return { eligible: false, reason: 'extension_not_supported' };
  return { eligible: true, reason: 'ready' };
}

function registerAjoOcDatasetRoutes(deps) {
  const {
    onRequest, profileFnOpts, setCors, getAdobeAccessToken, ADOBE_CLIENT_ID, ADOBE_IMS_ORG,
    mcpApiKeyStore, ajoOcDatasetService: service, ajoOcDatasetStore: store,
  } = deps;

  const ajoOcDatasetProxy = onRequest({ ...profileFnOpts, timeoutSeconds: 300 }, async (req, res) => {
    setCors(res, 'GET, POST, OPTIONS');
    res.set('Cache-Control', 'private, no-store');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'Method not allowed.' });

    let principal;
    try { principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore, deps); }
    catch (error) {
      return res.status(500).json({ ok: false, error: 'MCP principal validation failed.', detail: String(error.message || error) });
    }
    if (!principal.ok) return res.status(principal.status).json(principal.body);

    const input = req.method === 'GET' ? (req.query || {}) : (req.body || {});
    const sandbox = String(input.sandbox || principal.sandbox).trim().toLowerCase();
    if (sandbox !== String(principal.sandbox).toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'Sandbox does not match the authenticated principal scope.' });
    }
    const orgId = ADOBE_IMS_ORG.value();
    if (req.headers['x-gw-ims-org-id'] && req.headers['x-gw-ims-org-id'] !== orgId) {
      return res.status(403).json({ ok: false, error: 'Adobe organisation does not match the configured platform organisation.' });
    }

    const action = String(input.action || '').trim();
    const auditBase = { principalUid: principal.principalUid, orgId, sandbox, action };
    try {
      const ids = selectedIds(input);
      const auth = { token: await getAdobeAccessToken(), clientId: ADOBE_CLIENT_ID.value(), orgId, sandbox };
      let payload;

      if (req.method === 'GET' && action === 'status') {
        const datasets = ids
          ? await Promise.all(ids.map((id) => service.getDatasetStatus(auth, id)))
          : (await service.listRelDatasets(auth)).map(summarizeDataset);
        payload = { datasets };
      } else if (req.method === 'GET' && action === 'validate') {
        const datasetIds = ids || (await service.listRelDatasets(auth)).map((dataset) => dataset.id);
        const results = [];
        for (const id of datasetIds) results.push(await service.validateAndSummarize(auth, id));
        payload = { dataset_ids: datasetIds, results };
      } else if (req.method === 'GET' && action === 'job_status') {
        const expected = { principalUid: principal.principalUid, orgId, sandbox };
        let items;
        let batchJobId = input.batch_job_id ? String(input.batch_job_id) : null;
        if (batchJobId) {
          if (!UUID_PATTERN.test(batchJobId)) {
            return await auditedRejection(res, store, auditBase, 400, 'batch_job_id must be a UUID.');
          }
          const batch = await store.getBatch(batchJobId, expected);
          items = batch.items || [];
        } else {
          const jobIds = Array.isArray(input.job_ids)
            ? input.job_ids
            : typeof input.job_ids === 'string' ? input.job_ids.split(',').filter(Boolean) : [];
          if (!jobIds.length || jobIds.length > MAX_DATASETS
              || jobIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))
              || new Set(jobIds).size !== jobIds.length) {
            return await auditedRejection(res, store, auditBase, 400, 'Provide batch_job_id or 1-100 unique UUID job_ids.');
          }
          items = await store.findJobs(jobIds, expected);
          if (items.length !== jobIds.length) {
            return await auditedRejection(
              res, store, auditBase, 404,
              'One or more Adobe job IDs are not owned by this principal and sandbox.',
            );
          }
        }
        const results = [];
        for (const item of items) {
          if (!item.job_id) {
            results.push({ ...item, job: null, dataset: null });
            continue;
          }
          const [job, dataset] = await Promise.all([
            service.getEnablementJob(auth, item.job_id),
            service.getDatasetStatus(auth, item.dataset_id),
          ]);
          results.push({ ...item, job, dataset });
        }
        payload = { batch_job_id: batchJobId, results };
      } else if (req.method === 'POST' && action === 'preview') {
        const datasetIds = ids || (await service.listRelDatasets(auth)).map((dataset) => dataset.id);
        if (!datasetIds.length) return res.status(200).json({ ok: true, sandbox, orgId, selected_count: 0, items: [], confirmation: null });
        const items = [];
        for (const id of datasetIds) {
          const item = await service.validateAndSummarize(auth, id);
          items.push({ ...item, ...previewDecision(item) });
        }
        const plannedIds = items.filter((item) => item.eligible).map((item) => item.dataset_id);
        const preflight = plannedIds.length
          ? await store.savePreflight({
            ...auditBase,
            datasetIds: plannedIds,
            snapshots: items.filter((item) => item.eligible).map(({ dataset_id, fingerprint }) => ({ dataset_id, fingerprint })),
          })
          : null;
        payload = {
          selected_count: datasetIds.length,
          planned_count: plannedIds.length,
          dataset_ids: datasetIds,
          planned_dataset_ids: plannedIds,
          items: items.map(({ fingerprint, validation, ...item }) => ({ ...item, validation })),
          warnings: items.filter((item) => item.data_ingested).map((item) =>
            `${item.dataset_name} already contains ingested data; extension enablement may involve existing data processing.`),
          confirmation: preflight ? {
            ...preflight,
            sandbox,
            dataset_ids: plannedIds,
            confirmation_phrase: confirmationPhrase(sandbox, plannedIds.length),
            instruction: 'Show the exact sandbox, dataset IDs and names, warnings, and confirmation phrase. Apply only after the colleague explicitly confirms this exact scope.',
          } : null,
        };
      } else if (req.method === 'POST' && action === 'apply') {
        const applyIds = ids;
        if (!applyIds || input.confirmed !== true || typeof input.confirmation_phrase !== 'string'
            || !UUID_PATTERN.test(input.preflight_id || '')) {
          return await auditedRejection(
            res, store, auditBase, 400,
            'Exact dataset_ids, preflight_id, the exact confirmation_phrase, and confirmed=true are required.',
          );
        }
        const expected = {
          principalUid: principal.principalUid, orgId, sandbox, action: 'preview', datasetIds: applyIds,
        };
        const phrase = confirmationPhrase(sandbox, applyIds.length);
        if (input.confirmation_phrase !== phrase) {
          return await auditedRejection(
            res, store, auditBase, 400,
            'confirmation_phrase does not exactly match the preview.',
          );
        }
        const plan = await store.consumePreflight(input.preflight_id, expected);
        const batch = {
          ...auditBase,
          preflightId: input.preflight_id,
          items: [],
          status: 'running',
          submittedCount: 0,
          skippedCount: 0,
        };
        const batchJobId = await store.createBatch(batch);
        for (const planned of plan.snapshots) {
          let current;
          try { current = await service.validateAndSummarize(auth, planned.dataset_id); }
          catch (error) {
            batch.items.push({
              dataset_id: planned.dataset_id,
              state: 'stopped_before_submission',
              error: String(error.message || error),
              platform_status: Number(error.status) || null,
              platform_response: error.platformResponse || null,
            });
            batch.status = 'stopped';
            await store.updateBatch(batchJobId, batch);
            break;
          }
          if (current.fingerprint !== planned.fingerprint) {
            batch.items.push({ dataset_id: planned.dataset_id, state: 'skipped_changed' });
            batch.skippedCount += 1;
            await store.updateBatch(batchJobId, batch);
            continue;
          }
          const state = extensionState(current);
          if (state !== 'not_enabled' || !current.extension_supported) {
            batch.items.push({
              dataset_id: planned.dataset_id,
              state: state === 'enabled' ? 'skipped_already_enabled' : `skipped_${state === 'not_enabled' ? 'ineligible' : state}`,
            });
            batch.skippedCount += 1;
            await store.updateBatch(batchJobId, batch);
            continue;
          }
          try {
            const response = await service.enableDataset(auth, planned.dataset_id);
            const job = Array.isArray(response) ? response[0] : response;
            if (!job?.jobId) {
              batch.items.push({
                dataset_id: planned.dataset_id,
                state: 'submission_uncertain',
                platform_response: response,
              });
              batch.status = 'stopped_uncertain';
              await store.updateBatch(batchJobId, batch);
              break;
            }
            batch.items.push({
              dataset_id: planned.dataset_id,
              dataset_name: job.datasetName || current.dataset_name,
              job_id: job.jobId,
              job_status: job.jobStatus || 'PENDING',
              job_state: job.jobState || null,
              state: 'submitted',
            });
            batch.submittedCount += 1;
            await store.updateBatch(batchJobId, batch);
          } catch (error) {
            batch.items.push({
              dataset_id: planned.dataset_id,
              state: 'submission_uncertain',
              error: String(error.message || error),
              platform_status: Number(error.status) || null,
              platform_response: error.platformResponse || null,
            });
            batch.status = 'stopped_uncertain';
            await store.updateBatch(batchJobId, batch);
            break;
          }
        }
        if (batch.status === 'running') batch.status = 'submitted';
        await store.updateBatch(batchJobId, batch);
        payload = { batch_job_id: batchJobId, ...batch, ok: batch.status === 'submitted' };
      } else {
        return await auditedRejection(res, store, auditBase, 400, 'Unsupported action or HTTP method.');
      }

      await store.writeAudit({
        ...auditBase,
        result: payload.ok === false ? 'partial_or_stopped' : 'ok',
        datasetIds: payload.dataset_ids || payload.planned_dataset_ids || ids || [],
        batchJobId: payload.batch_job_id || null,
        itemCount: payload.items?.length || payload.results?.length || 0,
      });
      return res.status(200).json({ ok: true, sandbox, orgId, ...payload });
    } catch (error) {
      const status = responseStatus(error);
      await store.writeAudit({
        ...auditBase,
        result: 'error',
        status,
        message: String(error.message || error),
        platformResponse: error.platformResponse || null,
      }).catch((auditError) => {
        console.error('[ajoOcDataset] audit write failed', { message: String(auditError.message || auditError) });
      });
      console.error('[ajoOcDataset] request failed', {
        action, principalUid: principal.principalUid, sandbox, status, message: String(error.message || error),
      });
      return res.status(status).json({
        ok: false,
        error: String(error.message || error),
        platformStatus: Number(error.status) || null,
        platformResponse: error.platformResponse || null,
      });
    }
  });

  return { ajoOcDatasetProxy };
}

module.exports = {
  CONFIRMATION_PREFIX,
  DATASET_ID_PATTERN,
  UUID_PATTERN,
  confirmationPhrase,
  extensionState,
  previewDecision,
  registerAjoOcDatasetRoutes,
};
