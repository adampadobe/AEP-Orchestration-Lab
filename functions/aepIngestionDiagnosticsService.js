'use strict';

const { randomUUID } = require('node:crypto');

const BASE = 'https://platform.adobe.io/data/foundation';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const BATCH_ID = /^(?:[0-9A-HJKMNP-TV-Z]{26}|[a-f0-9]{24,32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_SAMPLE_BYTES = 256 * 1024;
const MAX_FILE_PAGES = 5;

function failure(status, message, platformResponse = null) {
  return Object.assign(new Error(message), { status, platformResponse });
}

function identifier(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw failure(400, `${label} is invalid.`);
  return value;
}

function integer(value, fallback, min, max, label) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))
      || Number(value) < min || Number(value) > max) {
    throw failure(400, `${label} must be an integer between ${min} and ${max}.`);
  }
  return Number(value);
}

function tagValues(value) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function expandTags(tags, pattern) {
  return Object.entries(tags || {}).filter(([name]) => pattern.test(name)).flatMap(([name, values]) =>
    tagValues(values).map((raw, index) => {
      if (typeof raw !== 'string' || !/^\s*[\[{]/.test(raw)) return { tag: name, index, value: raw };
      try { return { tag: name, index, value: JSON.parse(raw) }; }
      catch { return { tag: name, index, value: raw, parse_error: 'Tag is not valid JSON.' }; }
    }));
}

function timestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' || /^\d+$/.test(String(value)) ? Number(value) : Date.parse(value);
  return Number.isFinite(ms) && Math.abs(ms) <= 8_640_000_000_000_000 ? ms : null;
}

function summarizeRun(run, now) {
  const metrics = run.metrics || {};
  const records = metrics.recordSummary || {};
  const duration = metrics.durationSummary || {};
  const started = timestamp(duration.startedAtUTC);
  const completed = timestamp(duration.completedAtUTC);
  const activities = run.activities || [];
  const errors = [
    ...(metrics.statusSummary?.errors || []),
    ...(metrics.statusSummary?.extensions?.errors || []),
    ...activities.flatMap((activity) => [
      ...(activity.statusSummary?.errors || []),
      ...(activity.statusSummary?.extensions?.errors || []),
    ]),
  ];
  return {
    run_id: run.id,
    flow_id: run.flowId,
    state: metrics.statusSummary?.status ?? run.state ?? null,
    read_count: records.inputRecordCount ?? null,
    written_count: records.outputRecordCount ?? null,
    failed_count: records.failedRecordCount ?? null,
    skipped_count: records.skippedRecordCount ?? null,
    started_at: started === null ? null : new Date(started).toISOString(),
    completed_at: completed === null ? null : new Date(completed).toISOString(),
    duration_ms: started === null ? null : Math.max(0, (completed ?? now) - started),
    duration_is_elapsed: started !== null && completed === null,
    first_errors: errors.slice(0, 10),
    errors,
    activities,
    raw: run,
  };
}

async function boundedText(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) throw failure(502, 'Adobe response has no readable body.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw failure(502, `Adobe response exceeds the ${maxBytes}-byte diagnostic limit.`);
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function jsonBody(text) {
  if (!text.trim()) return null;
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

// Only continuation tokens are reused; resource paths and sandbox/flow filters stay server-owned.
function continuation(data, endpoint) {
  const href = data?._links?.next?.href;
  if (!href) return null;
  const url = new URL(href, `${BASE}/`);
  if (url.origin !== 'https://platform.adobe.io'
      || ![endpoint, endpoint.replace('/data/foundation/flowservice', '')].includes(url.pathname)
      || url.username || url.password) {
    throw failure(502, 'Adobe returned an unexpected diagnostic continuation URL.');
  }
  const token = url.searchParams.get('continuationToken');
  if (!token) throw failure(502, 'Adobe run continuation is missing its token.');
  return token;
}

function createAepIngestionDiagnosticsService({ fetchImpl = fetch, now = Date.now } = {}) {
  async function response(auth, path, query = {}) {
    const url = new URL(`${BASE}${path}`);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
    try {
      return await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${auth.token}`,
          'x-api-key': auth.clientId,
          'x-gw-ims-org-id': auth.orgId,
          'x-sandbox-name': auth.sandbox,
          'x-request-id': randomUUID(),
        },
        redirect: 'error',
        signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(auth.signal ? [auth.signal] : [])]),
      });
    } catch (error) {
      throw failure(error.name === 'TimeoutError' ? 504 : 502, `Adobe diagnostic request failed: ${error.message}`);
    }
  }

  async function read(auth, path, query) {
    const res = await response(auth, path, query);
    let data;
    try { data = jsonBody(await boundedText(res, MAX_JSON_BYTES)); }
    catch (error) {
      if (!res.ok) throw failure(res.status, `Adobe returned HTTP ${res.status}; its error body could not be read within diagnostic limits.`);
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw failure(504, 'Adobe diagnostic response timed out.');
      throw error;
    }
    if (!res.ok) throw failure(res.status, `Adobe diagnostic request returned HTTP ${res.status}.`, data);
    if (!data || data.raw !== undefined) throw failure(502, 'Adobe returned an invalid JSON diagnostic response.', data);
    return data;
  }

  async function optionalRead(invoke, section, issues) {
    try { return { available: true, data: await invoke() }; }
    catch (error) {
      if (error.status === 401 || error.status === 403) throw error;
      const issue = { section, status: error.status || 500, error: error.message, platform_response: error.platformResponse };
      issues.push(issue);
      return { available: false, ...issue };
    }
  }

  function checkRun(run, auth, flowId) {
    if (run.flowId !== flowId || (run.sandboxName && run.sandboxName !== auth.sandbox)) {
      throw failure(403, 'Adobe flow run does not match the requested flow and sandbox.');
    }
    return summarizeRun(run, now());
  }

  async function getRun(auth, runId, flowId) {
    const data = await read(auth, `/flowservice/runs/${identifier(runId, UUID, 'run_id')}`);
    const run = data.items?.[0] || data;
    if (run.id !== runId) throw failure(502, 'Adobe response does not identify the requested run.');
    return checkRun(run, auth, flowId);
  }

  async function flowRunStatus(auth, input) {
    const flowId = identifier(input.flow_id, UUID, 'flow_id');
    const limit = integer(input.limit, 10, 1, 50, 'limit');
    let since;
    if (input.since !== undefined) {
      if (typeof input.since !== 'string'
          || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.since)
          || !Number.isFinite(Date.parse(input.since))) throw failure(400, 'since must be an ISO 8601 timestamp with timezone.');
      since = Date.parse(input.since);
    }
    if (input.continuation_token !== undefined
        && (typeof input.continuation_token !== 'string' || !input.continuation_token.length
            || input.continuation_token.length > 8192)) throw failure(400, 'continuation_token is invalid.');
    const data = await read(auth, '/flowservice/runs', {
      property: `flowId==${flowId}`, limit, continuationToken: input.continuation_token,
    });
    if (!Array.isArray(data.items) || data.items.length > limit) throw failure(502, 'Adobe runs response is missing items or exceeds the requested page limit.');
    const pageRuns = data.items.map((run) => checkRun(run, auth, flowId));
    const runs = since === undefined ? pageRuns
      : pageRuns.filter((run) => timestamp(run.raw.createdAt) !== null && timestamp(run.raw.createdAt) >= since);
    return {
      ok: true, sandbox: auth.sandbox, flow_id: flowId, runs,
      continuation_token: continuation(data, '/data/foundation/flowservice/runs'),
      since_filter: {
        applied_locally: since !== undefined, scanned: data.items.length, field: 'createdAt',
        unknown_timestamp_count: data.items.filter((run) => timestamp(run.createdAt) === null).length,
      },
      raw: data,
    };
  }

  async function fileList(auth, batchId, kind, issues) {
    const path = `/export/batches/${batchId}/${kind}`;
    return optionalRead(async () => {
      const files = [];
      const pages = [];
      let start = 0;
      for (let page = 0; page < MAX_FILE_PAGES; page++) {
        const data = await read(auth, path, { limit: 100, start, ...(kind === 'meta' ? { path: 'row_errors' } : {}) });
        if (!Array.isArray(data.data) || data.data.length > 100) throw failure(502, 'Adobe file listing is missing data or exceeds the requested page limit.');
        pages.push(data);
        files.push(...data.data);
        const next = data._links?.next?.href;
        if (!next && data.data.length < 100) return { files, pages, complete: true, next: null };
        if (next) {
          const url = new URL(next, `${BASE}/`);
          if (url.origin !== 'https://platform.adobe.io' || url.pathname !== `/data/foundation${path}`
              || url.username || url.password) throw failure(502, 'Adobe returned an unexpected file continuation URL.');
          const nextStart = Number(url.searchParams.get('start'));
          if (!Number.isSafeInteger(nextStart) || nextStart <= start) throw failure(502, 'Adobe file continuation is missing a forward start offset.');
          start = nextStart;
        } else {
          start += data.data.length;
        }
        if (page === MAX_FILE_PAGES - 1) {
          issues.push({ section: kind, status: null, error: 'File listing reached the five-page limit.', platform_response: null });
          return { files, pages, complete: false, next_start: start };
        }
      }
    }, kind, issues);
  }

  async function sampleRows(auth, batchId, name, limit) {
    if (typeof name !== 'string' || !name.length || name.length > 512 || name.includes('..')
        || name.includes('\\') || name.startsWith('/') || /[\u0000-\u001f]/.test(name)) {
      throw failure(502, 'Adobe diagnostic file name is invalid.');
    }
    const res = await response(auth, `/export/batches/${batchId}/meta`, { path: `row_errors/${name}` });
    if (!res.ok) {
      let body;
      try { body = jsonBody(await boundedText(res, MAX_JSON_BYTES)); }
      catch { throw failure(res.status, `Adobe returned HTTP ${res.status}; its sample error body could not be read within diagnostic limits.`); }
      throw failure(res.status, `Adobe diagnostic sample returned HTTP ${res.status}.`, body);
    }
    const reader = res.body?.getReader();
    if (!reader) throw failure(502, 'Adobe diagnostic sample has no readable body.');
    const decoder = new TextDecoder();
    const rows = [];
    let buffer = '';
    let text = '';
    let bytes = 0;
    let lineMode = true;
    try {
      while (true) {
        const { value, done } = await reader.read();
        const chunk = decoder.decode(value, { stream: !done });
        text += chunk;
        buffer += chunk;
        bytes += value?.byteLength || 0;
        if (bytes > MAX_SAMPLE_BYTES) throw failure(502, 'Diagnostic sample exceeded the 256 KiB limit before the requested rows were read.');
        while (lineMode && buffer.includes('\n')) {
          const newline = buffer.indexOf('\n');
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            try {
              const parsed = JSON.parse(line);
              rows.push(...(Array.isArray(parsed) ? parsed : [parsed]));
            }
            catch { lineMode = false; break; }
          }
          if (rows.length >= limit) return rows.slice(0, limit);
        }
        if (done) {
          if (lineMode && rows.length) {
            if (buffer.trim()) {
              try { rows.push(JSON.parse(buffer)); }
              catch { throw failure(502, 'Adobe returned invalid NDJSON diagnostic rows.'); }
            }
            return rows.slice(0, limit);
          }
          const data = jsonBody(text);
          if (!data || data.raw !== undefined) throw failure(502, 'Adobe returned invalid diagnostic rows.');
          return (Array.isArray(data) ? data : [data]).slice(0, limit);
        }
      }
    } finally { await reader.cancel(); }
  }

  async function diagnoseOne(auth, batchId, expected, sampleLimit) {
    const raw = await read(auth, `/catalog/batches/${batchId}`);
    const batch = raw[batchId];
    if (!batch || typeof batch !== 'object') throw failure(502, 'Adobe Catalog response is missing the requested batch.');
    if ((batch.imsOrg && batch.imsOrg !== auth.orgId)
        || (batch.sandboxName && batch.sandboxName !== auth.sandbox)) {
      throw failure(403, 'Adobe batch does not match the configured organisation and sandbox.');
    }
    const tags = batch.tags || {};
    if (expected.runId && !tagValues(tags.flowRunId).includes(expected.runId)) {
      throw failure(403, 'Batch does not match the requested run.');
    }
    if (expected.flowId && !tagValues(tags.flowId).includes(expected.flowId)) {
      throw failure(403, 'Batch does not match the requested flow.');
    }
    const issues = [];
    const stalledFlags = expandTags(tags, /stall/i);
    const processingAttempts = expandTags(tags, /attempt|^siphon\//i);
    for (const entry of [...stalledFlags, ...processingAttempts]) {
      if (entry.parse_error) issues.push({ section: entry.tag, status: null, error: entry.parse_error, platform_response: null });
    }
    const failed = await fileList(auth, batchId, 'failed', issues);
    const files = await fileList(auth, batchId, 'files', issues);
    const enabled = tagValues(tags.acp_enableErrorDiagnostics).some((value) => value === true || value === 'true');
    const diagnostics = { enabled, requested_rows: sampleLimit, rows: [], files: null };
    if (enabled && sampleLimit) {
      const listing = await fileList(auth, batchId, 'meta', issues);
      diagnostics.files = listing;
      if (listing.available) {
        const candidates = listing.data.files.filter((entry) => entry.name !== '_SUCCESS');
        for (const file of candidates.slice(0, 5)) {
          if (diagnostics.rows.length >= sampleLimit) break;
          const sampled = await optionalRead(() =>
            sampleRows(auth, batchId, file.name, sampleLimit - diagnostics.rows.length), `row_errors/${file.name}`, issues);
          if (sampled.available) diagnostics.rows.push(...sampled.data);
          if (issues.length >= 10) break;
        }
        if (candidates.length > 5 && diagnostics.rows.length < sampleLimit) {
          issues.push({ section: 'row_errors', status: null, error: 'Sampling reached the five-file limit.', platform_response: null });
        }
      }
    }
    return {
      batch_id: batchId,
      status: batch.status ?? null,
      stalled_flags: stalledFlags,
      processing_attempts: processingAttempts,
      errors: batch.errors ?? [],
      metrics: batch.metrics ?? {},
      failed_files: failed,
      files,
      diagnostics: { ...diagnostics, returned_rows: diagnostics.rows.length, limit_reached: sampleLimit > 0 && diagnostics.rows.length >= sampleLimit },
      complete: issues.length === 0,
      issues,
      raw: batch,
    };
  }

  async function batchDiagnose(auth, input) {
    auth = { ...auth, signal: AbortSignal.timeout(240_000) };
    const sampleLimit = integer(input.sample_limit, 10, 0, 50, 'sample_limit');
    const batchId = input.batch_id === undefined ? null : identifier(input.batch_id, BATCH_ID, 'batch_id');
    const flowId = input.flow_id === undefined ? null : identifier(input.flow_id, UUID, 'flow_id');
    let runId = input.run_id === undefined ? null : identifier(input.run_id, UUID, 'run_id');
    if ((!batchId && (!flowId || !runId)) || (!!flowId !== !!runId)) {
      throw failure(400, 'Provide batch_id, or flow_id and run_id together.');
    }
    let run = null;
    let ids = batchId ? [batchId] : [];
    if (runId) run = await getRun(auth, runId, flowId);
    if (!batchId) {
      ids = [...new Set(run.activities.flatMap((activity) => (activity.targetInfo || [])
        .filter((target) => target.reference?.type === 'Batch')
        .flatMap((target) => target.reference.ids || [])))];
      let raw;
      if (ids.length) {
        for (const id of ids) identifier(id, BATCH_ID, 'Flow run batch reference');
      } else {
        const flowData = await read(auth, `/flowservice/flows/${flowId}`);
        const flow = flowData.items?.[0] || flowData;
        if (flow.id !== flowId || (flow.sandboxName && flow.sandboxName !== auth.sandbox)) {
          throw failure(403, 'Adobe flow does not match the requested flow and sandbox.');
        }
        if (!Array.isArray(flow.targetConnectionIds) || flow.targetConnectionIds.length !== 1) {
          throw failure(409, 'Run has no Batch references and its flow does not have a single target; provide batch_id.');
        }
        const targetId = identifier(flow.targetConnectionIds[0], UUID, 'Flow target connection');
        const targetData = await read(auth, `/flowservice/targetConnections/${targetId}`);
        const target = targetData.items?.[0] || targetData;
        if (target.id !== targetId || (target.sandboxName && target.sandboxName !== auth.sandbox)) {
          throw failure(403, 'Adobe target connection does not match the requested target and sandbox.');
        }
        const datasetId = identifier(target.params?.dataSetId, /^[a-f0-9]{24}$/i, 'Flow target dataset');
        raw = await read(auth, '/catalog/batches', {
          property: `tags.flowRunId==${runId}`, dataSet: datasetId, limit: 10,
        });
        ids = Object.keys(raw).filter((id) => BATCH_ID.test(id));
      }
      if (!ids.length) throw failure(404, 'No Catalog batches were found for the requested run.', raw);
      if (ids.length >= 10) throw failure(409, 'Run lookup reached ten batches; provide an exact batch_id to diagnose without omission.');
    }
    const batches = [];
    for (const id of ids) batches.push(await diagnoseOne(auth, id, { flowId, runId }, sampleLimit));
    if (!run && batches.length === 1) {
      runId = tagValues(batches[0].raw.tags?.flowRunId)[0];
      const batchFlowId = tagValues(batches[0].raw.tags?.flowId)[0];
      if (runId && batchFlowId) {
        identifier(runId, UUID, 'Catalog flowRunId');
        identifier(batchFlowId, UUID, 'Catalog flowId');
        const related = await optionalRead(() => getRun(auth, runId, batchFlowId), 'flow_run', batches[0].issues);
        run = related.available ? related.data : related;
        batches[0].complete = batches[0].issues.length === 0;
      } else {
        batches[0].issues.push({ section: 'flow_run', status: null, error: 'Batch tags do not identify an associated flow and run.', platform_response: null });
        batches[0].complete = false;
      }
    }
    return { ok: true, sandbox: auth.sandbox, complete: batches.every((batch) => batch.complete), batches, flow_run: run };
  }

  return { batchDiagnose, flowRunStatus };
}

module.exports = { createAepIngestionDiagnosticsService, summarizeRun, expandTags };
