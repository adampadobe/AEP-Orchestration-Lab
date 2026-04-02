#!/usr/bin/env node
/**
 * Ingest experience events to AEP using the API Operational Events schema.
 * Uses auth from ../00 Adobe Auth. Supports batch ingestion (default).
 *
 * Schema: https://ns.adobe.com/demoemea/schemas/9bc433dd59aeea8231b6d1a25a9d1f6de0cd3ea609aa1ebb
 * Tenant: _demoemea
 *
 * Usage:
 *   node ingest-events.js [path-to-events.json]
 *   Default events file: ./events/mortgage-purchase-events.json
 *
 * Optional env:
 *   AEP_DATASET_ID - dataset ID for the schema (if not set, looked up via Catalog API)
 */

import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCHEMA_ID = 'https://ns.adobe.com/demoemea/schemas/9bc433dd59aeea8231b6d1a25a9d1f6de0cd3ea609aa1ebb';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';
const BATCH_BASE = 'https://platform.adobe.io/data/foundation/import/batches';

async function getHeaders() {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  return {
    'Authorization': `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': config.sandboxName,
    'Content-Type': 'application/json',
  };
}

async function findDatasetBySchema(schemaId) {
  const headers = await getHeaders();
  // Catalog filter: property=schemaRef.id==<url>
  const propValue = `schemaRef.id==${schemaId}`;
  const url = `${CATALOG_BASE}/dataSets?limit=20&properties=name,schemaRef&property=${encodeURIComponent(propValue)}`;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Catalog API ${res.status}: ${data.message || res.statusText}`);
  }
  const ids = Object.keys(data);
  if (ids.length === 0) return null;
  // Prefer first dataset that has matching schemaRef
  for (const id of ids) {
    const ref = data[id]?.schemaRef?.id;
    if (ref === schemaId) return id;
  }
  return ids[0];
}

async function createBatch(datasetId) {
  const headers = await getHeaders();
  const res = await fetch(BATCH_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      datasetId,
      inputFormat: { format: 'json' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Batch create ${res.status}: ${data.message || data.title || res.statusText}`);
  }
  const batchId = data.id;
  if (!batchId) throw new Error('Batch create response missing id');
  return batchId;
}

async function uploadBatchFile(batchId, datasetId, fileName, body) {
  const headers = await getHeaders();
  delete headers['Content-Type'];
  headers['Content-Type'] = 'application/octet-stream';
  const url = `${BATCH_BASE}/${batchId}/datasets/${datasetId}/files/${fileName}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Batch upload ${res.status}: ${text}`);
  }
}

async function completeBatch(batchId) {
  const headers = await getHeaders();
  const res = await fetch(`${BATCH_BASE}/${batchId}?action=COMPLETE`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Batch complete ${res.status}: ${data.message || res.statusText}`);
  }
}

async function main() {
  const eventsPath = process.argv[2] || join(__dirname, 'events', 'mortgage-purchase-events.json');
  let datasetId = process.env.AEP_DATASET_ID;

  if (!datasetId) {
    console.error('Looking up dataset for schema...');
    datasetId = await findDatasetBySchema(SCHEMA_ID);
    if (!datasetId) {
      console.error('No dataset found for schema:', SCHEMA_ID);
      console.error('Create a dataset from this schema in AEP, then set AEP_DATASET_ID or run from a sandbox that has one.');
      process.exit(1);
    }
    console.error('Using dataset:', datasetId);
  }

  let body;
  try {
    body = readFileSync(eventsPath, 'utf8');
  } catch (e) {
    console.error('Failed to read events file:', eventsPath, e.message);
    process.exit(1);
  }

  const lines = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const normalized = lines.map((line) => {
    try {
      const rec = JSON.parse(line);
      if (!rec._id) rec._id = rec['@id'] || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      return JSON.stringify(rec);
    } catch {
      return line;
    }
  }).join('\n');
  const lineCount = lines.length;
  console.error('Events to ingest:', lineCount);

  const batchId = await createBatch(datasetId);
  console.error('Batch created:', batchId);

  const fileName = `mortgage-events-${Date.now()}.json`;
  await uploadBatchFile(batchId, datasetId, fileName, Buffer.from(normalized, 'utf8'));
  console.error('File uploaded:', fileName);

  await completeBatch(batchId);
  console.error('Batch completed successfully.');
  console.log(JSON.stringify({ batchId, datasetId, eventsCount: lineCount }));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
