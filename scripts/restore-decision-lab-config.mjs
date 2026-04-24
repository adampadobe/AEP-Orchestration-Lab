#!/usr/bin/env node
/**
 * Write the shared Firestore document `decisionLabConfig/<docId(sandbox)>` using the
 * same merge rules as production (`functions/decisionLabConfigStore.js`).
 *
 * Prereqs (once):
 *   cd functions && npm install
 *
 * Auth (pick one):
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   gcloud auth application-default login
 *
 * Usage:
 *   node scripts/restore-decision-lab-config.mjs kirkham scripts/data/kirkham-decision-lab-restore.preset.json
 *   node scripts/restore-decision-lab-config.mjs kirkham --preset=race-for-life-retail
 *
 * JSON files may include a top-level "_comment" string; it is ignored when building the patch.
 *
 * For a full snapshot from Firestore console export or PITR, copy fields:
 *   datastreamId, launchScriptUrl, tagsPropertyRef, targetPageUrl,
 *   edgePersonalizationMode, placements, surfaceOverrides, surfaceStyles,
 *   schemaTitle, datasetName
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

const PRESETS = {
  'race-for-life-retail': path.join(__dirname, 'data/kirkham-decision-lab-restore.preset.json'),
};

function usage() {
  console.error(`Usage:
  node scripts/restore-decision-lab-config.mjs <sandbox> <path-to-patch.json>
  node scripts/restore-decision-lab-config.mjs <sandbox> --preset=race-for-life-retail

Examples:
  node scripts/restore-decision-lab-config.mjs kirkham scripts/data/kirkham-decision-lab-restore.preset.json
  node scripts/restore-decision-lab-config.mjs kirkham --preset=race-for-life-retail
`);
  process.exit(1);
}

function loadPatch(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const o = JSON.parse(raw);
  if (!o || typeof o !== 'object') throw new Error('JSON root must be an object');
  const { _comment, ...rest } = o;
  return rest;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) usage();
  const sandbox = String(argv[0] || '').trim();
  if (!sandbox) usage();

  let filePath;
  const arg1 = argv[1];
  if (arg1.startsWith('--preset=')) {
    const key = arg1.slice('--preset='.length).trim();
    filePath = PRESETS[key];
    if (!filePath) {
      console.error('Unknown preset:', key, '— known:', Object.keys(PRESETS).join(', '));
      process.exit(1);
    }
    if (!fs.existsSync(filePath)) {
      console.error('Preset file missing:', filePath);
      process.exit(1);
    }
  } else {
    filePath = path.isAbsolute(arg1) ? arg1 : path.join(repoRoot, arg1);
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      process.exit(1);
    }
  }

  const patch = loadPatch(filePath);
  const store = require(path.join(repoRoot, 'functions/decisionLabConfigStore.js'));

  const saved = await store.saveDecisionLabConfig(sandbox, patch);
  console.log('Saved decisionLabConfig for sandbox:', sandbox);
  console.log(JSON.stringify(saved, null, 2));
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
