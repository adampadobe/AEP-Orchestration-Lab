#!/usr/bin/env node
/**
 * List CJA dimensions for a data view so you can find the dimension ID
 * for phone number / recipient (e.g. to use in ranked reports with bounce reasons).
 *
 * Usage: node cja-list-dimensions.js [dataviewId]
 * Example: node cja-list-dimensions.js dv_666acca0779b1c01e1aca5b7
 *
 * Auth: Always uses the bearer token and config from this AEP Profile project
 * (00 Adobe Auth .env: ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_ORG_ID, etc.).
 *
 * If you get 403 "Api Key is invalid": add "Customer Journey Analytics" API to your
 * project in Adobe Developer Console and use that project's Client ID in .env.
 */

import { getAccessToken, getConfig } from '../src/index.js';

const CJA_BASE = 'https://cja.adobe.io';
const DATA_VIEW_ID = process.argv[2] || process.env.CJA_DATAVIEW_ID || 'dv_666acca0779b1c01e1aca5b7';

async function main() {
  // Use bearer token and config from AEP Profile (00 Adobe Auth) only
  const token = await getAccessToken();
  const config = getConfig();
  const apiKey = config.clientId;
  const orgId = config.orgId || '';

  const url = `${CJA_BASE}/data/dataviews/${encodeURIComponent(DATA_VIEW_ID)}/dimensions?includeType=shared`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-api-key': apiKey,
      'x-gw-ims-org-id': orgId,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('CJA API error:', res.status, res.statusText, text);
    if (res.status === 403) {
      console.error('\nTo fix 403: Add "Customer Journey Analytics" API to your project at console.adobe.io');
      console.error('and use that project\'s Client ID in this project\'s .env.');
    }
    process.exit(1);
  }

  const data = await res.json();
  const dimensions = Array.isArray(data) ? data : data.dimensions || data.content || [];

  console.log('Data view:', DATA_VIEW_ID);
  console.log('Dimensions (look for phone / recipient / destination / mobile):\n');

  const keywords = ['phone', 'mobile', 'recipient', 'destination', 'address', 'to', 'ajo'];
  function matches(s) {
    if (!s) return false;
    const lower = String(s).toLowerCase();
    return keywords.some((k) => lower.includes(k));
  }

  dimensions.forEach((d) => {
    const id = d.id || d.dimensionId || d.name;
    const name = d.name || d.id || '';
    const highlight = matches(id) || matches(name) ? '  <-- possible phone/recipient' : '';
    console.log(`  ${id}`);
    if (name && name !== id) console.log(`    name: ${name}`);
    if (d.description) console.log(`    description: ${d.description}`);
    if (highlight) console.log(highlight);
    console.log('');
  });

  console.log('Total dimensions:', dimensions.length);
  console.log('\nUse one of the dimension IDs above as "dimension" (or breakdown) in your ranked report.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
