#!/usr/bin/env node
/**
 * Query a dataset via AEP Query Service and list the last few entries.
 *
 * Usage: node query-dataset-last-entries.js [datasetLabel] [limit]
 * Example: node query-dataset-last-entries.js demo_system_event_dataset_for_customer_experience_app_global_v1_ 10
 *
 * Requires: ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_ORG_ID, ADOBE_SANDBOX_NAME in .env (or 00 Adobe Auth config)
 */

import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

const QUERY_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/query';

function quoteTableId(id) {
  if (!id) return id;
  return `"${String(id).replace(/"/g, '""')}"`;
}

async function runQueryService(sql, queryParameters = {}) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': config.sandboxName,
  };
  const body = {
    dbName: `${config.sandboxName}:all`,
    sql,
    ...(Object.keys(queryParameters).length ? { queryParameters } : {}),
  };
  const createRes = await fetch(`${QUERY_SERVICE_BASE}/queries`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    const msg = createData.message || createData.error_description || createData.title || createRes.statusText;
    throw new Error(msg || `Query Service ${createRes.status}`);
  }
  const queryId = createData.id;
  if (!queryId) throw new Error('Query Service did not return query id');

  const maxWaitMs = 300000;
  const pollIntervalMs = 2000;
  const start = Date.now();
  let last = createData;
  while (Date.now() - start < maxWaitMs) {
    if (last.state === 'SUCCESS' || last.state === 'FAILED' || last.state === 'CANCELLED') {
      return last;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const getRes = await fetch(`${QUERY_SERVICE_BASE}/queries/${queryId}`, { headers });
    last = await getRes.json().catch(() => ({}));
    if (!getRes.ok) throw new Error(last.message || `Query Service GET ${getRes.status}`);
  }
  return last;
}

async function main() {
  const datasetLabel = process.argv[2] || 'demo_system_event_dataset_for_customer_experience_app_global_v1_';
  const limit = parseInt(process.argv[3], 10) || 10;

  const tableRef = quoteTableId(datasetLabel);
  const sql = `SELECT * FROM ${tableRef} ORDER BY timestamp DESC NULLS LAST LIMIT ${limit}`;

  console.error(`Querying dataset: ${datasetLabel}`);
  console.error(`SQL: ${sql}\n`);

  const result = await runQueryService(sql);
  console.error(`Query state: ${result.state}, rowCount: ${result.rowCount ?? 'N/A'}`);

  if (result.state !== 'SUCCESS') {
    const errMsg = (result.errors && result.errors[0]) ? result.errors[0].message || String(result.errors[0]) : result.state;
    console.error(`Query ${result.state}: ${errMsg}`);
    process.exit(1);
  }

  const rowCount = result.rowCount ?? 0;
  const rows = result.rows || result.result || result.results || [];
  const rowArray = Array.isArray(rows) ? rows : [];

  console.log(JSON.stringify({ dataset: datasetLabel, rowCount, rows: rowArray }, null, 2));

  if (rowArray.length === 0 && rowCount > 0) {
    console.error('\nNote: Query Service API did not return result rows. Run this SQL in AEP Query Editor to see data:');
    console.error(sql);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
