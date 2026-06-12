#!/usr/bin/env node
/**
 * One-time admin migration: flat ajoLookups/{slug} → ajoLookups/{ldap}/sandboxes/{sandbox}/…
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=… node scripts/migrate-demo-config-rtdb.mjs [--dry-run]
 *
 * Heuristic: if ajoLookups/{key} has top-level StaffPortal/TravelData (no sandboxes node),
 * copy into ajoLookups/{key}/sandboxes/{key}/iPad and CallCentre when nested path is empty.
 */
import admin from 'firebase-admin';

const DRY_RUN = process.argv.includes('--dry-run');
const RTDB_URL = process.env.FIREBASE_DATABASE_URL || 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';

if (!admin.apps.length) {
  admin.initializeApp({ databaseURL: RTDB_URL });
}

const db = admin.database();

const FLAT_KEYS = ['StaffPortal', 'CoreDemoData', 'Mobile', 'TravelData', 'CustomerLoyalty'];

function isFlatDemoRoot(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  if (val.sandboxes || val.meta) return false;
  return FLAT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(val, k));
}

function splitFlat(flat) {
  return {
    iPad: {
      StaffPortal: flat.StaffPortal || {},
      CoreDemoData: flat.CoreDemoData || {},
      Mobile: flat.Mobile || {},
      TravelData: flat.TravelData || {},
      CustomerLoyalty: flat.CustomerLoyalty || {},
    },
    CallCentre: {
      StaffPortal: flat.StaffPortal || {},
      CoreDemoData: flat.CoreDemoData || {},
      Mobile: flat.Mobile || {},
      industryId: 'travel',
    },
  };
}

async function main() {
  const snap = await db.ref('ajoLookups').once('value');
  const all = snap.val() || {};
  const report = [];

  for (const [ldapSlug, root] of Object.entries(all)) {
    if (!isFlatDemoRoot(root)) continue;

    const targetRef = db.ref(`ajoLookups/${ldapSlug}/sandboxes/${ldapSlug}`);
    const existing = (await targetRef.once('value')).val();
    if (existing && existing.iPad) {
      report.push({ ldapSlug, action: 'skip_nested_exists' });
      continue;
    }

    const sections = splitFlat(root);
    report.push({ ldapSlug, action: DRY_RUN ? 'would_migrate' : 'migrate', sections: Object.keys(sections) });

    if (!DRY_RUN) {
      await targetRef.update(sections);
      await db.ref(`ajoLookups/${ldapSlug}/meta`).transaction((cur) => {
        if (cur && cur.version) return cur;
        return {
          version: 1,
          provisionedAt: new Date().toISOString(),
          migratedFromFlat: true,
        };
      });
      if (!root.sandboxes) {
        const keep = { sandboxes: { [ldapSlug]: sections } };
        await db.ref(`ajoLookups/${ldapSlug}`).update(keep);
        for (const k of FLAT_KEYS) {
          await db.ref(`ajoLookups/${ldapSlug}/${k}`).remove();
        }
      }
    }
  }

  console.log(JSON.stringify({ dryRun: DRY_RUN, migrated: report.length, report }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
