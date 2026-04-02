#!/usr/bin/env node
/**
 * Resolve segment IDs to audience names via Audiences API.
 * Usage: node get-audience-names.js <segmentId1> <segmentId2> ...
 */

import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

const AUDIENCES_BASE = 'https://platform.adobe.io/data/core/ups/audiences';

async function getAudienceById(id) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const url = `${AUDIENCES_BASE}/${id}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': config.sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { id, name: id, error: data.message || res.statusText };
  }
  return { id, name: data.name || data.audienceId || id };
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => a && !a.startsWith('-'));
  if (ids.length === 0) {
    console.error('Usage: node get-audience-names.js <segmentId1> <segmentId2> ...');
    process.exit(1);
  }
  const results = await Promise.all(ids.map((id) => getAudienceById(id)));
  results.forEach((r) => console.log(`${r.id} => ${r.name}${r.error ? ' (error: ' + r.error + ')' : ''}`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
