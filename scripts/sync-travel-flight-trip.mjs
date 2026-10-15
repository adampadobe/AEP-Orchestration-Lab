#!/usr/bin/env node
/**
 * Copies the canonical travel flight-trip builder (web/profile-viewer/travel-flight-trip.js)
 * into the AEP Lab Profile MCP source tree. The MCP Docker image only ships `src/`, so it
 * needs its own verbatim copy.
 *
 *   node scripts/sync-travel-flight-trip.mjs          # write the copy
 *   node scripts/sync-travel-flight-trip.mjs --check  # exit 1 when the copy has drifted
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'web/profile-viewer/travel-flight-trip.js');
const DEST = join(root, 'tools/aep-lab-profile-mcp/src/personaBuilder/flightTrip.cjs');

const source = readFileSync(SRC, 'utf8');
if (process.argv.includes('--check')) {
  const current = existsSync(DEST) ? readFileSync(DEST, 'utf8') : '';
  if (current !== source) {
    console.error(`[sync-travel-flight-trip] ${DEST} is out of date. Run: npm run sync:travel-flight-trip`);
    process.exit(1);
  }
  console.log('[sync-travel-flight-trip] MCP copy matches web/profile-viewer/travel-flight-trip.js');
} else {
  writeFileSync(DEST, source);
  console.log(`[sync-travel-flight-trip] wrote ${DEST}`);
}
