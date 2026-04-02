#!/usr/bin/env node
/**
 * Access a schema's data by finding datasets that use it, then query the last N entries.
 *
 * Usage: node query-schema-last-entries.js [schemaId] [limit]
 * Example: node query-schema-last-entries.js "https://ns.adobe.com/demoemea/schemas/d9b88a044ad96154637965a97ed63c7b20bdf2ab3b4f642e" 10
 */

import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

const SCHEMA_ID = 'https://ns.adobe.com/demoemea/schemas/d9b88a044ad96154637965a97ed63c7b20bdf2ab3b4f642e';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';
const QUERY_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/query';

function quoteTableId(id) {
  if (!id) return id;
  return `"${String(id).replace(/"/g, '""')}"`;
}

async function getAuthHeaders() {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': config.sandboxName,
  };
}

async function findDatasetsBySchema(schemaId) {
  const headers = await getAuthHeaders();
  const url = `${CATALOG_BASE}/dataSets?limit=100&properties=name,schemaRef,qualifiedName`;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Catalog ${res.status}`);

  const datasets = [];
  const raw = typeof data === 'object' ? data : {};
  for (const [id, obj] of Object.entries(raw)) {
    if (id.startsWith('_')) continue;
    const schemaRef = obj?.schemaRef || obj?.schemaRef?.id;
    const refId = typeof schemaRef === 'string' ? schemaRef : schemaRef?.id;
    if (refId && (refId === schemaId || refId.startsWith(schemaId.split(';')[0]))) {
      datasets.push({ id, name: obj?.name || id, qualifiedName: obj?.qualifiedName });
    }
  }
  return datasets;
}

async function runQueryService(sql) {
  const headers = await getAuthHeaders();
  const { config } = await getAuth();
  const body = { dbName: `${config.sandboxName}:all`, sql };
  const createRes = await fetch(`${QUERY_SERVICE_BASE}/queries`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error(createData.message || createRes.statusText);
  const queryId = createData.id;
  if (!queryId) throw new Error('No query id');

  const maxWaitMs = 300000;
  const pollIntervalMs = 2000;
  const start = Date.now();
  let last = createData;
  while (Date.now() - start < maxWaitMs) {
    if (last.state === 'SUCCESS' || last.state === 'FAILED' || last.state === 'CANCELLED') return last;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const getRes = await fetch(`${QUERY_SERVICE_BASE}/queries/${queryId}`, { headers });
    last = await getRes.json().catch(() => ({}));
  }
  return last;
}

async function main() {
  const schemaId = process.argv[2] || SCHEMA_ID;
  const limit = parseInt(process.argv[3], 10) || 10;

  console.error(`Schema: ${schemaId}`);
  console.error(`Finding datasets...`);

  const datasets = await findDatasetsBySchema(schemaId);
  if (datasets.length === 0) {
    console.log(JSON.stringify({ error: 'No datasets found for this schema', schemaId }, null, 2));
    return;
  }

  console.error(`Found ${datasets.length} dataset(s): ${datasets.map((d) => d.name || d.id).join(', ')}`);

  const ds = datasets[0];
  // Query Service table: qualifiedName (e.g. demo_system_event_dataset_for_website_global_v1_1) or dataset ID
  const tableRef = quoteTableId(ds.qualifiedName || ds.id);
  const sql = `SELECT * FROM ${tableRef} ORDER BY timestamp DESC NULLS LAST LIMIT ${limit}`;

  console.error(`\nQuerying: ${sql}`);

  const result = await runQueryService(sql);
  console.error(`State: ${result.state}, rowCount: ${result.rowCount ?? 'N/A'}`);

  if (result.state !== 'SUCCESS') {
    const err = (result.errors && result.errors[0]) ? result.errors[0].message || String(result.errors[0]) : result.state;
    console.log(JSON.stringify({ error: err, schemaId, dataset: datasets[0] }, null, 2));
    return;
  }

  const rows = result.rows || result.result || result.results || [];
  const rowArray = Array.isArray(rows) ? rows : [];

  console.log(JSON.stringify({
    schemaId,
    dataset: { id: datasets[0].id, name: datasets[0].name },
    rowCount: result.rowCount ?? 0,
    rows: rowArray,
  }, null, 2));

  if (rowArray.length === 0 && (result.rowCount ?? 0) > 0) {
    console.error('\nNote: Query Service API did not return rows. Run in AEP Query Editor:');
    console.error(sql);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
