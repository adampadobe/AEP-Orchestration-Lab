#!/usr/bin/env node
/**
 * Test reading a specific field from an AEP dataset.
 * Usage: node query-dataset-field.js [dataset] [fieldPath]
 */
import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

const QUERY_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/query';

function quoteTableId(id) {
  if (!id) return `"${String(id).replace(/"/g, '""')}"`;
  return `"${String(id).replace(/"/g, '""')}"`;
}

async function runQueryService(sql) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': config.sandboxName,
  };
  const createRes = await fetch(`${QUERY_SERVICE_BASE}/queries`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ dbName: `${config.sandboxName}:all`, sql }),
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
  const dataset = process.argv[2] || 'demo_system_event_dataset_for_website_global_v1_1';
  const fieldPath = process.argv[3] || '_experience.decisioning.propositions.scopeDetails.activity.name';

  const tableRef = quoteTableId(dataset);

  // Try different column formats used by AEP
  const variants = [
    `SELECT _experience.decisioning.propositions.scopeDetails.activity.name FROM ${tableRef} LIMIT 5`,
    `SELECT "_experience"."decisioning"."propositions"."scopeDetails"."activity"."name" FROM ${tableRef} LIMIT 5`,
    `SELECT "_experience_decisioning_propositions_scopeDetails_activity_name" FROM ${tableRef} LIMIT 5`,
  ];

  for (const sql of variants) {
    console.error(`\nTrying: ${sql}`);
    const result = await runQueryService(sql);
    console.error(`State: ${result.state}, rowCount: ${result.rowCount ?? 'N/A'}`);
    if (result.state === 'SUCCESS') {
      const rows = result.rows || result.result || result.results || [];
      console.log(JSON.stringify({ success: true, field: fieldPath, rowCount: result.rowCount, rows }, null, 2));
      return;
    }
    if (result.state === 'FAILED' && result.errors?.[0]) {
      console.error(`Error: ${result.errors[0].message || result.errors[0]}`);
    }
  }
  console.log(JSON.stringify({ success: false, message: 'Could not read field with any variant' }, null, 2));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
