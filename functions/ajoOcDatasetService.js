'use strict';

const { randomUUID, createHash } = require('node:crypto');

const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog/dataSets';
const RELATIONAL_BASE = 'https://platform.adobe.io/ajo/relational';
const EXTENSION_KEY = 'adobe_journeyOptimizer';
const MAX_DATASETS = 100;

function failure(status, message, platformResponse = null) {
  return Object.assign(new Error(message), { status, platformResponse });
}

function adobeHeaders(auth, requestId, contentType = false) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${auth.token}`,
    'x-api-key': auth.clientId,
    'x-gw-ims-org-id': auth.orgId,
    'x-sandbox-name': auth.sandbox,
    'x-request-id': requestId,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function readResponse(response, label) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = text ? { raw: text.slice(0, 20_000) } : null; }
  if (!response.ok) {
    const message = data?.errorMessage || data?.message || data?.error || data?.title || response.statusText;
    throw failure(response.status, String(message || `${label} returned HTTP ${response.status}`), data);
  }
  return data;
}

function datasetFromResponse(data, id) {
  return data && typeof data === 'object' && data[id] && typeof data[id] === 'object'
    ? { id, ...data[id] }
    : data && typeof data === 'object' ? { id, ...data } : null;
}

function profileEnabled(dataset) {
  const value = dataset?.tags?.unifiedProfile;
  return value === true || value === 'true'
    || (Array.isArray(value) && value.some((entry) => String(entry).toLowerCase() === 'true'));
}

function summarizeDataset(dataset) {
  const extension = dataset.extensions?.[EXTENSION_KEY] || null;
  const systemTag = dataset.tags?.system;
  return {
    dataset_id: dataset.id,
    dataset_name: dataset.name || dataset.id,
    schema_id: dataset.schemaRef?.id || null,
    ingestion_type: dataset.ingestionType || null,
    data_behavior: dataset.classification?.dataBehavior || null,
    data_ingested: dataset.dataIngested === true,
    profile_enabled: profileEnabled(dataset),
    system_dataset: systemTag === true || systemTag === 'true'
      || (Array.isArray(systemTag) && systemTag.some((entry) => String(entry).toLowerCase() === 'true')),
    extension,
  };
}

function stateFingerprint(summary, validation) {
  const snapshot = {
    ...summary,
    extension: summary.extension,
    extension_supported: validation?.extensionSupported === true,
  };
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function normalizeCatalogRows(data) {
  if (Array.isArray(data)) return data.filter((row) => row && typeof row === 'object');
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).map(([id, row]) => ({ id, ...(row || {}) }));
}

function createAjoOcDatasetService({ fetchImpl = fetch, requestId = randomUUID } = {}) {
  async function request(auth, url, { method = 'GET', body } = {}) {
    const response = await fetchImpl(url, {
      method,
      headers: adobeHeaders(auth, requestId(), body !== undefined),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return readResponse(response, 'Adobe Orchestrated Campaign dataset API');
  }

  async function listRelDatasets(auth) {
    const url = new URL(CATALOG_BASE);
    url.searchParams.set('property', 'name~^rel_');
    url.searchParams.set('limit', String(MAX_DATASETS));
    const data = await request(auth, url);
    return normalizeCatalogRows(data)
      .filter((row) => String(row.name || '').startsWith('rel_'))
      .map((row) => ({ ...row, id: String(row.id || row.datasetId || '') }))
      .filter((row) => row.id);
  }

  async function getDataset(auth, id) {
    const data = await request(auth, `${CATALOG_BASE}/${encodeURIComponent(id)}`);
    const dataset = datasetFromResponse(data, id);
    if (!dataset || !dataset.id) throw failure(404, `Dataset ${id} was not found in the Catalog response.`);
    if (!String(dataset.name || '').startsWith('rel_')) {
      throw failure(403, `Dataset ${id} is outside the rel_ dataset scope.`);
    }
    return dataset;
  }

  async function validateDataset(auth, id) {
    const path = `${RELATIONAL_BASE}/modeler/datasets/${encodeURIComponent(id)}/extensions/validation`;
    return request(auth, path);
  }

  async function getDatasetStatus(auth, id) {
    const dataset = await getDataset(auth, id);
    return summarizeDataset(dataset);
  }

  async function validateAndSummarize(auth, id) {
    const dataset = await getDataset(auth, id);
    const summary = summarizeDataset(dataset);
    const validation = await validateDataset(auth, id);
    return {
      ...summary,
      extension_supported: validation?.extensionSupported === true,
      validation,
      fingerprint: stateFingerprint(summary, validation),
    };
  }

  async function enableDataset(auth, id) {
    return request(auth, `${RELATIONAL_BASE}/modeler/datasets/extensions/enablement`, {
      method: 'POST',
      body: { datasetIds: [id] },
    });
  }

  async function getEnablementJob(auth, jobId) {
    return request(
      auth,
      `${RELATIONAL_BASE}/modeler/datasets/extensions/enablement/jobs/${encodeURIComponent(jobId)}`,
    );
  }

  return {
    listRelDatasets,
    getDataset,
    getDatasetStatus,
    validateDataset,
    validateAndSummarize,
    enableDataset,
    getEnablementJob,
  };
}

module.exports = {
  CATALOG_BASE,
  RELATIONAL_BASE,
  EXTENSION_KEY,
  MAX_DATASETS,
  createAjoOcDatasetService,
  summarizeDataset,
  stateFingerprint,
};
