#!/usr/bin/env node
/**
 * Validates web/profile-viewer/data/aep-architecture-tour-default.json
 * (16 deck-aligned states, required fields per state).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tourPath = join(root, 'web/profile-viewer/data/aep-architecture-tour-default.json');
const EXPECTED = 16;

function fail(msg) {
  console.error('[validate:aep-architecture-tour]', msg);
  process.exit(1);
}

let raw;
try {
  raw = JSON.parse(readFileSync(tourPath, 'utf8'));
} catch (e) {
  fail('Could not read or parse ' + tourPath + ': ' + e.message);
}

if (!raw || typeof raw !== 'object') fail('root must be an object');
if (!Array.isArray(raw.states)) fail('missing states array');
if (raw.states.length !== EXPECTED) {
  fail('expected ' + EXPECTED + ' states, got ' + raw.states.length);
}

const flowIds = new Set([
  'flow-tags-edge',
  'flow-sources-stream',
  'flow-sources-batch',
  'flow-stream-lake',
  'flow-batch-lake',
  'flow-lake-pipeline',
  'flow-pipeline-profile',
  'flow-edge-profile',
  'flow-profile-seg',
  'flow-seg-jo',
  'flow-profile-cdp',
  'flow-edge-inbound',
  'flow-jo-msg',
  'flow-cdp-paid',
  'flow-cja-jrpt',
  'flow-mix-mrpt',
]);

raw.states.forEach((st, i) => {
  const n = i + 1;
  if (!st || typeof st !== 'object') fail('state ' + n + ' must be an object');
  for (const key of ['label', 'headline', 'body']) {
    if (typeof st[key] !== 'string' || !st[key].trim()) fail('state ' + n + ': missing ' + key);
  }
  if (!Array.isArray(st.highlights)) fail('state ' + n + ': highlights must be an array');
  if (!Array.isArray(st.flows)) fail('state ' + n + ': flows must be an array');
  st.flows.forEach((f, fi) => {
    if (!f || typeof f.id !== 'string' || !flowIds.has(f.id)) {
      fail('state ' + n + ' flow ' + fi + ': unknown or missing flow id');
    }
    if (!['ingress', 'intra', 'egress'].includes(f.kind)) {
      fail('state ' + n + ' flow ' + f.id + ': invalid kind');
    }
  });
});

console.log('[validate:aep-architecture-tour] OK — ' + EXPECTED + ' states in ' + tourPath);
