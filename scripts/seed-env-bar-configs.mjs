#!/usr/bin/env node
/**
 * Seed Firestore envBarConfigs/{demoId} for shared env bar remote defaults.
 *
 * Collection: envBarConfigs (default Firestore on aep-orchestration-lab)
 * API: GET /api/env-bar-config?demoId=ksia
 *
 * Usage:
 *   node scripts/seed-env-bar-configs.mjs
 *   node scripts/seed-env-bar-configs.mjs --dry-run
 *   node scripts/seed-env-bar-configs.mjs --only ksia,sky
 *   node scripts/seed-env-bar-configs.mjs --export-json   # write JSON only, no Firestore
 *
 * Requires Application Default Credentials (Firebase Admin) on project aep-orchestration-lab:
 *   gcloud auth application-default login
 *   # or GOOGLE_APPLICATION_CREDENTIALS pointing at a service account key
 *
 * Manual import (no credentials): use JSON files in scripts/env-bar-config-seeds/
 *   Firebase console → Firestore → envBarConfigs → Add document → doc id = filename stem
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = path.join(__dirname, 'env-bar-config-seeds');
const COLLECTION = 'envBarConfigs';
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'aep-orchestration-lab';

const require = createRequire(path.join(__dirname, '../functions/package.json'));
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { docId } = require('../functions/envBarConfigStore');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const exportJsonOnly = args.includes('--export-json');
const onlyArg = args.find((a) => a.startsWith('--only='))?.split('=')[1]
  || (args.includes('--only') ? args[args.indexOf('--only') + 1] : '');
const onlySet = onlyArg
  ? new Set(onlyArg.split(',').map((s) => docId(s.trim())).filter(Boolean))
  : null;

function loadSeedFiles() {
  const files = fs.readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.json')).sort();
  return files.map((file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8'));
    const id = docId(raw.demoId || raw.prefix || path.basename(file, '.json'));
    if (!id) throw new Error(`Invalid seed file (no demoId/prefix): ${file}`);
    const config = { ...raw, demoId: raw.demoId || id };
    if (!config.prefix) config.prefix = config.demoId;
    return { file, id, config };
  });
}

const seeds = loadSeedFiles().filter(({ id }) => !onlySet || onlySet.has(id));

if (!seeds.length) {
  console.error('No seed files matched. Check scripts/env-bar-config-seeds/*.json and --only filter.');
  process.exit(1);
}

console.log(`Project: ${PROJECT_ID}  collection: ${COLLECTION}  seeds: ${seeds.map((s) => s.id).join(', ')}`);

if (exportJsonOnly) {
  for (const { file, id, config } of seeds) {
    const outPath = path.join(SEEDS_DIR, `${id}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`✓ exported ${outPath} (from ${file})`);
  }
  process.exit(0);
}

if (dryRun) {
  for (const { id, config } of seeds) {
    console.log(`[dry-run] would set ${COLLECTION}/${id}`, JSON.stringify(config, null, 2));
  }
  process.exit(0);
}

let db;
try {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  const databaseId = String(process.env.FIRESTORE_DATABASE_ID || '').trim();
  db = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore();
} catch (e) {
  console.error('Failed to initialize Firebase Admin:', e.message || e);
  console.error('\nManual import: Firebase console → Firestore →', COLLECTION);
  for (const { id } of seeds) {
    console.error(`  Document id: ${id}  ← scripts/env-bar-config-seeds/${id}.json`);
  }
  process.exit(1);
}

for (const { id, config } of seeds) {
  const doc = {
    ...config,
    updatedAt: FieldValue.serverTimestamp(),
    seededBy: 'seed-env-bar-configs.mjs',
  };
  await db.collection(COLLECTION).doc(id).set(doc, { merge: true });
  console.log(`✓ wrote ${COLLECTION}/${id}`);
}

console.log('Done. Verify: curl "/api/env-bar-config?demoId=ksia" on hosted lab.');
