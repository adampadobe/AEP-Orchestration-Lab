#!/usr/bin/env node
/**
 * Migrate StaffPortal.FlightTerminalInfo → StaffPortal.LocationLabel in RTDB.
 *
 * Usage:
 *   node scripts/migrate-staffportal-location-label.mjs --dry-run
 *   node scripts/migrate-staffportal-location-label.mjs --slug apalmer
 *   node scripts/migrate-staffportal-location-label.mjs
 *
 * Requires Application Default Credentials with Firebase Admin on aep-orchestration-lab.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../functions/package.json'));
const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const slugArgIdx = process.argv.indexOf('--slug');
const SLUG_FILTER = slugArgIdx >= 0 ? String(process.argv[slugArgIdx + 1] || '').trim() : '';
const RTDB_URL = process.env.FIREBASE_DATABASE_URL || 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';

if (!admin.apps.length) {
  admin.initializeApp({ databaseURL: RTDB_URL });
}

const db = admin.database();

function pickTrimmed(val) {
  if (val == null) return '';
  return String(val).trim();
}

function buildPatch(staffPortal) {
  const sp = staffPortal && typeof staffPortal === 'object' ? staffPortal : {};
  const legacy = pickTrimmed(sp.FlightTerminalInfo);
  const current = pickTrimmed(sp.LocationLabel);
  if (!legacy) return null;
  const patch = {};
  if (!current) patch.LocationLabel = legacy;
  patch.FlightTerminalInfo = null;
  return patch;
}

async function migrateWorkspaceSlug(ldapSlug) {
  const ref = db.ref(`ajoLookups/${ldapSlug}/StaffPortal`);
  const snap = await ref.once('value');
  const sp = snap.val();
  if (!sp || typeof sp !== 'object') {
    console.log(`  skip ${ldapSlug}: no StaffPortal`);
    return { migrated: false };
  }
  const patch = buildPatch(sp);
  if (!patch) {
    console.log(`  skip ${ldapSlug}: nothing to migrate`);
    return { migrated: false };
  }
  console.log(`  ${DRY_RUN ? '[dry-run] ' : ''}patch ${ldapSlug}/StaffPortal`, patch);
  if (!DRY_RUN) {
    await ref.update(patch);
  }
  return { migrated: true, patch };
}

async function main() {
  if (SLUG_FILTER) {
    console.log(`Migrating workspace: ${SLUG_FILTER}${DRY_RUN ? ' (dry-run)' : ''}`);
    const result = await migrateWorkspaceSlug(SLUG_FILTER);
    console.log('Done.', result);
    return;
  }

  const rootSnap = await db.ref('ajoLookups').once('value');
  const root = rootSnap.val();
  if (!root || typeof root !== 'object') {
    console.log('No ajoLookups root found.');
    return;
  }

  const slugs = Object.keys(root).filter((k) => k && !k.startsWith('_'));
  console.log(`Scanning ${slugs.length} workspace(s)${DRY_RUN ? ' (dry-run)' : ''}…`);
  let migrated = 0;
  for (const slug of slugs.sort()) {
    const result = await migrateWorkspaceSlug(slug);
    if (result.migrated) migrated += 1;
  }
  console.log(`Done. Migrated ${migrated} workspace(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
