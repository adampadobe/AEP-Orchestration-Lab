#!/usr/bin/env node
/**
 * Query a dataset for entries where a specific treatmentID appears in propositions.
 *
 * Usage: node query-dataset-by-treatment.js [datasetLabel] [treatmentID] [limit]
 * Example: node query-dataset-by-treatment.js demo_system_event_dataset_for_website_global_v1_1 17718520971601fecde4 10
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
  const datasetLabel = process.argv[2] || 'demo_system_event_dataset_for_website_global_v1_1';
  const treatmentID = process.argv[3] || '17718520971601fecde4';
  const limit = parseInt(process.argv[4], 10) || 10;

  const tableRef = quoteTableId(datasetLabel);

  const safeId = treatmentID.replace(/'/g, "''");

  // AEP may use flattened column names. Try underscore format first, then dot notation.
  const sqlVariants = [
    `SELECT * FROM ${tableRef} WHERE "_experience_decisioning_propositions_0_scopeDetails_strategies_0_treatmentID" = '${safeId}' ORDER BY timestamp DESC NULLS LAST LIMIT ${limit}`,
    `SELECT * FROM ${tableRef} WHERE _experience.decisioning.propositions[1].scopeDetails.strategies[1].treatmentID = '${safeId}' ORDER BY timestamp DESC NULLS LAST LIMIT ${limit}`,
  ];

  let result;
  let usedSql;
  for (const sql of sqlVariants) {
    console.error(`Trying: ${sql.substring(0, 100)}...`);
    result = await runQueryService(sql);
    usedSql = sql;
    if (result.state === 'SUCCESS') break;
    if (result.state === 'FAILED' && result.errors?.[0]?.message?.includes('column')) continue;
    break;
  }

  console.error(`\nQuery state: ${result.state}, rowCount: ${result.rowCount ?? 'N/A'}`);

  if (result.state !== 'SUCCESS') {
    const errMsg = (result.errors && result.errors[0]) ? result.errors[0].message || String(result.errors[0]) : result.state;
    console.error(`Query ${result.state}: ${errMsg}`);
    process.exit(1);
  }

  const rowCount = result.rowCount ?? 0;
  const rows = result.rows || result.result || result.results || [];
  const rowArray = Array.isArray(rows) ? rows : [];

  console.log(JSON.stringify({ dataset: datasetLabel, treatmentID, rowCount, rows: rowArray }, null, 2));

  if (rowArray.length === 0) {
    console.error('\nSQL used (run in AEP Query Editor to inspect):');
    console.error(usedSql || 'N/A');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
