#!/usr/bin/env node
/**
 * Look up journey name by journey ID or journey version ID.
 * Tries: 1) Journey API, 2) dataset (journey_step_events or specified dataset ID).
 *
 * Usage: node get-journey-name.js <journey-id> [dataset-id]
 * Example: node get-journey-name.js 00e99672-2e1a-4a2a-bf5d-64755b8c4e28 6628c9b187ba5a2c9eaec10d
 */

import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

const QUERY_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/query';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';
const CJM_JOURNEY_BASE = 'https://journey.adobe.io/journey/journeys';

async function getDatasetTableName(datasetId) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const url = `${CATALOG_BASE}/dataSets/${datasetId}?properties=qualifiedName,name`;
  const res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': config.sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return datasetId;
  return data.qualifiedName || data.name || datasetId;
}

async function getJourneyNameFromApi(id) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const url = CJM_JOURNEY_BASE + '/' + encodeURIComponent(id);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': config.sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function quoteTableId(id) {
  if (!id) return id;
  return `"${String(id).replace(/"/g, '""')}"`;
}

async function getJourneyNameFromDataset(id, datasetId) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': config.sandboxName,
  };
  let tableName = datasetId ? null : 'journey_step_events';
  if (datasetId) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(datasetId)) {
      tableName = datasetId;
    } else {
      tableName = await getDatasetTableName(datasetId);
    }
  }
  const tableRef = quoteTableId(tableName);
  const sql = `SELECT DISTINCT 
  _experience.journeyOrchestration.stepEvents.journeyID,
  _experience.journeyOrchestration.stepEvents.journeyVersionID,
  _experience.journeyOrchestration.stepEvents.name
FROM ${tableRef} 
WHERE _experience.journeyOrchestration.stepEvents.journeyVersionID = '${id}'
   OR _experience.journeyOrchestration.stepEvents.journeyID = '${id}'
LIMIT 5`;
  const body = { dbName: config.sandboxName + ':all', sql };
  const createRes = await fetch(QUERY_SERVICE_BASE + '/queries', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) return { error: createData.message || 'Query create failed', state: null, rows: [] };
  const queryId = createData.id;
  if (!queryId) return { error: 'No query id', state: null, rows: [] };

  let last = createData;
  for (let i = 0; i < 90; i++) {
    if (last.state === 'SUCCESS' || last.state === 'FAILED' || last.state === 'CANCELLED') break;
    await new Promise((r) => setTimeout(r, 2000));
    const getRes = await fetch(QUERY_SERVICE_BASE + '/queries/' + queryId, { headers });
    last = await getRes.json().catch(() => ({}));
  }
  const rows = last.rows || last.result || last.results || [];
  const rowArray = Array.isArray(rows) ? rows : [];
  const r0 = rowArray[0];
  const name = r0?.journeyVersionName ?? r0?.name ?? r0?.[2] ?? null;
  return { state: last.state, rowCount: last.rowCount, rows: rowArray, name };
}

async function main() {
  const id = process.argv[2] || '00e99672-2e1a-4a2a-bf5d-64755b8c4e28';
  const datasetId = process.argv[3] || null;
  console.log('=== Journey lookup for ID:', id, '===');
  if (datasetId) console.log('Dataset ID:', datasetId);
  console.log('');

  const apiResult = await getJourneyNameFromApi(id);
  console.log('API (journey.adobe.io):');
  console.log('  Status:', apiResult.status, apiResult.ok ? 'OK' : '');
  if (apiResult.ok && apiResult.data) {
    const d = apiResult.data;
    console.log('  Journey name:', d.name ?? d.label ?? d.title ?? '(none)');
    console.log('  ID:', d.id ?? d['@id'] ?? '(none)');
    console.log('  Version:', d.version ?? d.journeyVersion ?? '(none)');
    if (Object.keys(d).length <= 5) console.log('  Full response:', JSON.stringify(d, null, 2));
    return;
  }
  if (apiResult.data && Object.keys(apiResult.data).length) {
    console.log('  Response:', JSON.stringify(apiResult.data, null, 2));
  }
  console.log('');

  console.log('Dataset (' + (datasetId || 'journey_step_events') + '):');
  const dsResult = await getJourneyNameFromDataset(id, datasetId);
  console.log('  Query state:', dsResult.state ?? dsResult.error ?? '(unknown)');
  console.log('  Row count:', dsResult.rowCount ?? 'N/A');
  if (dsResult.name) {
    console.log('  Journey name:', dsResult.name);
  }
  if (dsResult.rows && dsResult.rows.length) {
    console.log('  Rows:', JSON.stringify(dsResult.rows, null, 2));
  }
  if (!dsResult.name && !dsResult.rows?.length) {
    console.log('  Journey name: (not found)');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
