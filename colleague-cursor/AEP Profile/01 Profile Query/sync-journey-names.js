#!/usr/bin/env node
/**
 * Sync journey names from AEP Query Editor into a JSON cache.
 *
 * The journeys table (_experience.journeyOrchestration.stepEvents) is an AJO system
 * schema. The Query Service REST API does not return result rows for it. This script
 * lets you run the query in Query Editor (UI), export the results, and build a
 * journey-names.json cache that the Profile Viewer server uses for lookups.
 *
 * Usage:
 *   node sync-journey-names.js                    # Print SQL and instructions
 *   node sync-journey-names.js <file.json>         # Convert JSON export to cache
 *   node sync-journey-names.js <file.csv>         # Convert CSV export to cache
 *   node sync-journey-names.js --out <path>       # Custom output path
 *
 * Output: journey-names.json (or path from --out) with format:
 *   { "journeyVersionID": "Journey Name", ... }
 *   and optionally a "list" array for /api/journeys.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(__dirname, '../03 Profile Viewer/journey-names.json');

const SQL = `SELECT DISTINCT 
  _experience.journeyOrchestration.stepEvents.journeyID,
  _experience.journeyOrchestration.stepEvents.journeyVersionID,
  _experience.journeyOrchestration.stepEvents.name
FROM "journeys" 
ORDER BY _experience.journeyOrchestration.stepEvents.name
LIMIT 200`;

function printInstructions() {
  console.log(`
=== Sync Journey Names (AJO System Schema Workaround) ===

The "journeys" table is an AJO system schema. The Query Service REST API does not
return result rows for it. Use this workflow:

1. Open AEP Query Editor: https://experience.adobe.com → Data Management → Queries

2. Run this SQL:

${SQL}

3. Export results:
   - Click "Export" or "Download" (if available), or
   - Copy the result grid and save as CSV (columns: journeyID, journeyVersionID, name)

4. Run this script with the exported file:
   node sync-journey-names.js your-export.json
   node sync-journey-names.js your-export.csv

5. Restart the Profile Viewer server to pick up the new cache.

Output: journey-names.json in 03 Profile Viewer/
`);
}

function parseJson(data) {
  const raw = JSON.parse(data);
  const arr = Array.isArray(raw) ? raw : (raw.rows || raw.results || raw.data || []);
  return arr.map((r) => ({
    journeyID: r.journeyID ?? r.journeyid ?? r.journey_id ?? r[0],
    journeyVersionID: r.journeyVersionID ?? r.journeyversionid ?? r.journey_version_id ?? r[1],
    name: r.name ?? r[2],
  })).filter((r) => r.journeyVersionID || r.journeyID);
}

function parseCsv(data) {
  const lines = data.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const cols = header.split(',').map((c) => c.trim().replace(/"/g, ''));
  const journeyIdx = cols.findIndex((c) => /journeyid/.test(c) && !/version/.test(c));
  const versionIdx = cols.findIndex((c) => /journeyversion/.test(c) || (/version/.test(c) && /id/.test(c)));
  const nameIdx = cols.findIndex((c) => c === 'name');
  const jIdx = journeyIdx >= 0 ? journeyIdx : 0;
  const vIdx = versionIdx >= 0 ? versionIdx : 1;
  const nIdx = nameIdx >= 0 ? nameIdx : 2;

  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.replace(/^"|"$/g, '').trim());
    return {
      journeyID: vals[jIdx] ?? '',
      journeyVersionID: vals[vIdx] ?? '',
      name: vals[nIdx] ?? '',
    };
  }).filter((r) => (r.journeyVersionID || r.journeyID) && r.name);
}

function buildCache(rows) {
  const byVersion = {};
  const byJourney = {};
  const list = [];
  for (const r of rows) {
    const name = (r.name || '').trim();
    if (!name) continue;
    const vid = (r.journeyVersionID || '').trim();
    const jid = (r.journeyID || '').trim();
    if (vid) {
      byVersion[vid] = name;
      if (!byJourney[jid]) byJourney[jid] = name;
    }
    if (jid && !byJourney[jid]) byJourney[jid] = name;
    list.push({ journeyID: jid, journeyVersionID: vid, name });
  }
  return {
    byVersionId: byVersion,
    byJourneyId: byJourney,
    list: list.filter((r) => r.name),
    updated: new Date().toISOString(),
  };
}

function main() {
  const args = process.argv.slice(2);
  let outPath = DEFAULT_OUT;
  let inputPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outPath = args[++i];
    } else if (!args[i].startsWith('-')) {
      inputPath = args[i];
      break;
    }
  }

  if (!inputPath) {
    printInstructions();
    return;
  }

  if (!existsSync(inputPath)) {
    console.error('File not found:', inputPath);
    process.exit(1);
  }

  const data = readFileSync(inputPath, 'utf8');
  const ext = inputPath.toLowerCase().slice(-5);
  const rows = ext.endsWith('.csv') ? parseCsv(data) : parseJson(data);

  if (rows.length === 0) {
    console.error('No valid rows found. Expected columns: journeyID, journeyVersionID, name');
    process.exit(1);
  }

  const cache = buildCache(rows);
  writeFileSync(outPath, JSON.stringify(cache, null, 2), 'utf8');
  console.log(`Wrote ${cache.list.length} journeys to ${outPath}`);
}

main();
