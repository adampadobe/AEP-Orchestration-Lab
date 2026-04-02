#!/usr/bin/env node
/**
 * List journeys from the journeys table.
 * Path: _experience.journeyOrchestration.stepEvents.name
 *
 * Usage: node list-journeys.js [limit]
 * Example: node list-journeys.js 50
 */

import { getAuth } from '../00 Adobe Auth/src/index.js';

const QUERY_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/query';

async function runQuery(sql) {
  const { token, config } = await getAuth();
  const cfg = (await import('../00 Adobe Auth/src/index.js')).getConfig();
  const headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': config.sandboxName,
  };
  const body = { dbName: config.sandboxName + ':all', sql };
  const createRes = await fetch(QUERY_SERVICE_BASE + '/queries', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error(createData.message || 'Query create failed');
  const queryId = createData.id;
  if (!queryId) throw new Error('No query id');

  let last = createData;
  for (let i = 0; i < 90; i++) {
    if (last.state === 'SUCCESS' || last.state === 'FAILED' || last.state === 'CANCELLED') break;
    await new Promise((r) => setTimeout(r, 2000));
    const getRes = await fetch(QUERY_SERVICE_BASE + '/queries/' + queryId, { headers });
    last = await getRes.json().catch(() => ({}));
  }
  return last;
}

async function main() {
  const limit = parseInt(process.argv[2], 10) || 100;
  const sql = `SELECT DISTINCT 
  _experience.journeyOrchestration.stepEvents.journeyID,
  _experience.journeyOrchestration.stepEvents.journeyVersionID,
  _experience.journeyOrchestration.stepEvents.name
FROM "journeys" 
ORDER BY _experience.journeyOrchestration.stepEvents.name
LIMIT ${limit}`;

  console.log('Listing journeys from journeys table...\n');
  console.log('SQL:', sql, '\n');

  const result = await runQuery(sql);
  console.log('Query state:', result.state);
  console.log('Row count:', result.rowCount ?? 'N/A');

  const rows = result.rows || result.result || result.results || [];
  const arr = Array.isArray(rows) ? rows : [];

  if (arr.length === 0) {
    console.log('\nNote: The journeys table is an AJO system schema. Query Service API does not return rows.');
    console.log('Workaround: Run the SQL in AEP Query Editor, export results, then run:');
    console.log('  node sync-journey-names.js <your-export.json|.csv>');
    console.log('\nSQL to run in Query Editor:\n');
    console.log(sql);
    return;
  }

  console.log('\nJourneys:\n');
  arr.forEach((r, i) => {
    const name = r?.name ?? r?.[2] ?? '—';
    const journeyId = r?.journeyID ?? r?.[0] ?? '—';
    const versionId = r?.journeyVersionID ?? r?.[1] ?? '—';
    console.log(`${i + 1}. ${name}`);
    console.log(`   journeyID: ${journeyId}`);
    console.log(`   journeyVersionID: ${versionId}`);
    console.log('');
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
