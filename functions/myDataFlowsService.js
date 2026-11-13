'use strict';

const { bindings } = require('./myDataFlowsRegistry');
const { summarizeRun } = require('./aepIngestionDiagnosticsService');

const BASE = 'https://platform.adobe.io/data/foundation';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const DATASET = /^[a-f0-9]{24}$/i;
const INDUSTRIES = ['generic', 'travel', 'fsi', 'retail', 'telecom', 'media', 'sports'];
const failure = (message) => new Error(message);
const safeString = (value) => typeof value === 'string' ? value.slice(0, 512) : null;

function enabledTag(value) {
  const values = Array.isArray(value) ? value : [value];
  if (values.some((v) => v === true || v === 'true' || /^enabled:true$/i.test(String(v)))) return true;
  if (values.some((v) => v === false || v === 'false' || /^enabled:false$/i.test(String(v)))) return false;
  return null;
}

function entity(data, id) {
  const result = data?.items?.[0] || data;
  if (result?.id !== id) throw failure('Adobe did not return the requested resource.');
  if (result.sandboxName && result.sandboxName !== 'apalmer') throw failure('Adobe resource sandbox does not match apalmer.');
  if (result.imsOrgId && result.imsOrgId !== 'BF9C27AA6464801C0A495FD0@AdobeOrg') {
    throw failure('Adobe resource organization does not match the reviewed architecture.');
  }
  return result;
}

async function jsonResponse(response) {
  if (!response.ok) {
    if (response.body) await response.body.cancel();
    throw failure(`Adobe returned HTTP ${response.status}.`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw failure('Adobe returned no readable response.');
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) throw failure('Adobe metadata exceeded the one-MiB response limit.');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel();
  }
}

function runSummary(run) {
  const summary = summarizeRun(run, Date.now());
  return {
    id: safeString(summary.run_id), state: safeString(summary.state),
    startedAt: summary.started_at, completedAt: summary.completed_at,
    readCount: summary.read_count, writtenCount: summary.written_count,
    updatedCount: run.metrics?.recordSummary?.updatedRecordCount ?? null,
    failedCount: summary.failed_count, deletedCount: run.metrics?.recordSummary?.deletedRecordCount ?? null,
    verifiedIdleEvidence: verifiedIdleEvidence(run),
  };
}

function verifiedIdleEvidence(run) {
  const activity = Array.isArray(run.activities) && run.activities.length === 1 ? run.activities[0] : null;
  if (!activity || activity.id !== '4f008a00-3a04-11eb-adc1-0242ac120002'
    || activity.name !== 'SnowFlake Copy Activity') return null;
  if ([run, activity].some((item) => Object.hasOwn(item, 'state') && item.state !== 'success')) return null;
  const metrics = run.metrics;
  const validTime = (value) => typeof value === 'number' && Number.isFinite(value)
    && value > 0 && value <= 8_640_000_000_000_000;
  const duration = metrics?.durationSummary;
  if (!validTime(duration?.startedAtUTC) || !validTime(duration?.completedAtUTC)
    || duration.completedAtUTC < duration.startedAtUTC
    || activity.durationSummary?.startedAtUTC !== duration.startedAtUTC
    || activity.durationSummary?.completedAtUTC !== duration.completedAtUTC) return null;
  const noErrors = (item) => [item.errors, item.statusSummary?.errors,
    item.statusSummary?.extensions?.errors].every((errors) => errors === undefined
      || (Array.isArray(errors) && errors.length === 0));
  if (!noErrors(run)) return null;
  for (const item of [metrics, activity]) {
    if (item?.statusSummary?.status !== 'success' || !noErrors(item)
      || item.recordSummary?.inputRecordCount !== 0 || item.sizeSummary?.inputBytes !== 0) return null;
    // Missing output/failure counters stay unknown; explicit contradictory counters invalidate idle evidence.
    for (const summary of [item.recordSummary, item.sizeSummary, item.fileSummary]) {
      if (summary === undefined) continue;
      if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
      for (const [key, value] of Object.entries(summary)) {
        if (/(Count|Bytes)$/.test(key) && value !== 0) return null;
      }
    }
  }
  return {
    policy: 'verified_empty_snowflake_copy_v1', runId: safeString(run.id),
    activityId: activity.id, activityName: activity.name,
    startedAt: new Date(duration.startedAtUTC).toISOString(),
    completedAt: new Date(duration.completedAtUTC).toISOString(),
    inputRecordCount: 0, inputBytes: 0,
    outputRecordCount: metrics.recordSummary.outputRecordCount ?? null,
    failedRecordCount: metrics.recordSummary.failedRecordCount ?? null,
    skippedRecordCount: metrics.recordSummary.skippedRecordCount ?? null,
  };
}

async function mapBounded(items, invoke, concurrency = 6) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await invoke(items[index]);
    }
  }));
  return results;
}

function createMyDataFlowsService({
  fetchImpl = fetch, getConnection, getEventConfig,
  registry = bindings, now = () => new Date(), budgetMs = 45_000,
}) {
  async function snapshot(auth) {
    if (auth.orgId !== 'BF9C27AA6464801C0A495FD0@AdobeOrg') {
      throw failure('Adobe organization does not match the reviewed architecture.');
    }
    const deadline = AbortSignal.timeout(budgetMs);
    const headers = {
      Authorization: `Bearer ${auth.accessToken}`,
      'x-api-key': auth.clientId, 'x-gw-ims-org-id': auth.orgId,
      'x-sandbox-name': 'apalmer', Accept: 'application/json',
    };
    const cache = new Map();
    const limitations = [
      'Reviewed flow registry only; not a complete sandbox inventory. New/replaced flows require a registry update.',
      'Read-only metadata, not a current Snowflake query, stored-field comparison or campaign-readiness certificate.',
    ];
    let incomplete = false;
    function read(path) {
      if (!cache.has(path)) cache.set(path, (async () => {
        deadline.throwIfAborted();
        const response = await fetchImpl(BASE + path, {
          method: 'GET', headers, redirect: 'error',
          signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]),
        });
        return jsonResponse(response);
      })());
      return cache.get(path);
    }
    async function resource(kind, id) {
      if (!UUID.test(id)) throw failure('Invalid Adobe resource identifier.');
      return entity(await read(`/flowservice/${kind}/${id}`), id);
    }
    async function dataset(id) {
      if (!DATASET.test(id)) throw failure('Target connection has no valid dataset identifier.');
      const result = (await read(`/catalog/dataSets/${id}`))?.[id];
      if (!result || !result.name) throw failure('Catalog did not return the requested dataset.');
      return {
        id, name: safeString(result.name), profileEnabled: enabledTag(result.tags?.unifiedProfile),
        schemaId: safeString(result.schemaRef?.id),
        ocStatus: safeString(result.extensions?.adobe_journeyOptimizer?.status),
      };
    }
    async function inspectFlow(id, expectedTable) {
      const f = await resource('flows', id);
      if (!Array.isArray(f.sourceConnectionIds) || f.sourceConnectionIds.length !== 1
        || !Array.isArray(f.targetConnectionIds) || f.targetConnectionIds.length !== 1) {
        throw failure('Flow is not a single-source, single-target reviewed binding.');
      }
      const source = await resource('sourceConnections', f.sourceConnectionIds[0]);
      const target = await resource('targetConnections', f.targetConnectionIds[0]);
      const table = source.params?.tableName;
      if (expectedTable && table !== expectedTable) throw failure('Source table differs from the reviewed binding.');
      const ds = await dataset(target.params?.dataSetId || target.params?.datasetId);
      let lastRun = null;
      if (f.lastRunDetails?.id) {
        const run = await resource('runs', f.lastRunDetails.id);
        if (run.flowId !== id) throw failure('Latest run belongs to a different flow.');
        lastRun = runSummary(run);
      }
      return {
        id, name: safeString(f.name), state: safeString(f.state),
        sourceConnectionId: source.id, targetConnectionId: target.id,
        sourceTables: table ? [safeString(table)] : [],
        cdcEnabled: typeof source.params?.cdcEnabled === 'boolean' ? source.params.cdcEnabled : null,
        datasets: [ds],
        schedule: f.scheduleParams ? {
          frequency: safeString(f.scheduleParams.frequency),
          interval: f.scheduleParams.interval ?? null,
          backfill: typeof f.scheduleParams.backfill === 'boolean' ? f.scheduleParams.backfill : null,
        } : null,
        mappings: (f.transformations || []).filter((t) => t.name === 'Mapping').map((t) => ({
          id: safeString(t.params?.mappingId), version: t.params?.mappingVersion ?? null,
        })),
        lastRun,
      };
    }
    function issue(section, error) {
      incomplete = true;
      // Do not forward network exceptions, Adobe bodies, signed links or credentials.
      const detail = /^Adobe returned HTTP \d{3}\.$/.test(error.message) ? error.message
        : deadline.aborted ? 'Refresh time budget exceeded.'
          : 'Metadata unavailable or binding verification failed.';
      limitations.push(`${section}: ${detail}`);
    }
    const flows = await mapBounded(registry, async ({ id, table, nodeIds = [] }) => {
      try { return { ...await inspectFlow(id, table), nodeIds, observationKind: 'scheduled' }; }
      catch (error) {
        issue(table, error);
        return { id, name: table, state: 'unknown', sourceTables: [table], datasets: [], schedule: null, mappings: [], lastRun: null, nodeIds, observationKind: 'scheduled' };
      }
    });
    const streaming = await mapBounded(INDUSTRIES, async (industry) => {
      try {
        const connection = await getConnection(industry);
        const saved = connection?.streaming;
        if (!saved?.flowId || !saved.datasetId) {
          return { industry, configured: false, datasetId: null, flowId: null, profileEnabled: null };
        }
        const flow = await inspectFlow(saved.flowId);
        if (flow.datasets[0].id !== saved.datasetId) throw failure('Saved streaming dataset differs from the flow.');
        flows.push({ ...flow, nodeIds: ['http'], observationKind: 'streaming_configuration' });
        return {
          industry, configured: flow.state === 'enabled',
          datasetId: flow.datasets[0].id, flowId: flow.id, profileEnabled: flow.datasets[0].profileEnabled,
        };
      } catch (error) {
        issue(`HTTP ${industry}`, error);
        return { industry, configured: false, datasetId: null, flowId: null, profileEnabled: null, unavailable: true };
      }
    });
    let event = null;
    try {
      const config = await getEventConfig();
      event = {
        configured: !!(config?.datastreamId && config?.schemaId),
        datastreamId: safeString(config?.datastreamId), schemaId: safeString(config?.schemaId),
        datasetName: safeString(config?.datasetName),
      };
      limitations.push('Event configuration is saved Lab metadata; live Edge routing and stored events are not revalidated.');
    } catch (error) { issue('Event configuration', error); }
    return { fetchedAt: now().toISOString(), complete: !incomplete, limitations, flows, streaming, event };
  }
  return { snapshot };
}

module.exports = { createMyDataFlowsService, enabledTag, runSummary };
