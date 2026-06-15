#!/usr/bin/env node
/**
 * Migrate RTDB demo config from sandboxes/{sandbox}/ nesting to flat workspace root.
 *
 * Moves AgenticLayer, ExpAccelerator, ExpVisualiser, ContentDecisionLive (and any
 * duplicate workspace sections) to ajoLookups/{ldap}/{section}, then deletes
 * the entire sandboxes/ subtree.
 *
 * Usage:
 *   node scripts/migrate-rtdb-flat-workspace.mjs [--ldap apalmer]
 *   node scripts/migrate-rtdb-flat-workspace.mjs --ldap apalmer --apply
 *
 * Dry-run by default. Requires Application Default Credentials on aep-orchestration-lab.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../functions/package.json'));
const admin = require('firebase-admin');
const {
  WORKSPACE_ROOT_SECTIONS,
  splitStubIntoSections,
  buildFlatLabStub,
} = require('../functions/labRtdbProvisionService');

const RTDB_URL = process.env.FIREBASE_DATABASE_URL || 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';
const APPLY = process.argv.includes('--apply');
const ldapArgIdx = process.argv.indexOf('--ldap');
const LDAP_FILTER = ldapArgIdx >= 0 ? String(process.argv[ldapArgIdx + 1] || '').trim() : '';

const FLAT_SECTIONS = [...WORKSPACE_ROOT_SECTIONS];
const NESTED_LEGACY = ['iPad'];

if (!admin.apps.length) {
  admin.initializeApp({ databaseURL: RTDB_URL });
}

const db = admin.database();

function isNonemptyObject(val) {
  return val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0;
}

function deepMergePreferPrimary(primary, fallback) {
  if (!isNonemptyObject(fallback)) return primary || fallback;
  if (!isNonemptyObject(primary)) return fallback;
  const out = { ...fallback, ...primary };
  for (const key of Object.keys(fallback)) {
    if (isNonemptyObject(primary[key]) && isNonemptyObject(fallback[key])) {
      out[key] = deepMergePreferPrimary(primary[key], fallback[key]);
    }
  }
  return out;
}

async function migrateWorkspace(ldapSlug) {
  const actions = [];
  const rootRef = db.ref(`ajoLookups/${ldapSlug}`);
  const rootSnap = await rootRef.once('value');
  const root = rootSnap.val();
  if (!root || typeof root !== 'object') {
    return { ldapSlug, actions, skipped: true };
  }

  const sandboxes = root.sandboxes;
  if (!sandboxes || typeof sandboxes !== 'object' || !Object.keys(sandboxes).length) {
    return { ldapSlug, actions, skipped: true, reason: 'no_sandboxes' };
  }

  const defaults = splitStubIntoSections(buildFlatLabStub());

  for (const sandboxSlug of Object.keys(sandboxes)) {
    const sb = sandboxes[sandboxSlug];
    if (!sb || typeof sb !== 'object') continue;

    for (const section of [...FLAT_SECTIONS, ...NESTED_LEGACY]) {
      const nestedVal = sb[section];
      if (!isNonemptyObject(nestedVal)) continue;

      if (section === 'iPad') {
        for (const nestedKey of ['Mobile', 'TravelData', 'CustomerLoyalty', 'CoreDemoData', 'StaffPortal']) {
          const ipadChild = nestedVal[nestedKey];
          if (!isNonemptyObject(ipadChild)) continue;
          const flatRef = rootRef.child(nestedKey);
          const flatSnap = await flatRef.once('value');
          const flatVal = flatSnap.val();
          const merged = deepMergePreferPrimary(flatVal, ipadChild);
          actions.push({
            action: 'hoist_ipad_child',
            from: `ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}/iPad/${nestedKey}`,
            to: `ajoLookups/${ldapSlug}/${nestedKey}`,
            value: merged,
          });
          if (APPLY) await flatRef.set(merged);
        }
        continue;
      }

      const flatRef = rootRef.child(section);
      const flatSnap = await flatRef.once('value');
      const flatVal = flatSnap.val();
      const merged = deepMergePreferPrimary(flatVal, nestedVal);
      const needsWrite = JSON.stringify(flatVal || null) !== JSON.stringify(merged);

      if (needsWrite) {
        actions.push({
          action: 'hoist_section',
          from: `ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}/${section}`,
          to: `ajoLookups/${ldapSlug}/${section}`,
          before: flatVal || null,
          after: merged,
        });
        if (APPLY) await flatRef.set(merged);
      } else {
        actions.push({
          action: 'skip_section_already_flat',
          from: `ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}/${section}`,
          to: `ajoLookups/${ldapSlug}/${section}`,
        });
      }
    }
  }

  for (const section of FLAT_SECTIONS) {
    const flatRef = rootRef.child(section);
    const flatSnap = await flatRef.once('value');
    if (!flatSnap.exists() && defaults[section]) {
      actions.push({
        action: 'provision_missing_flat_stub',
        to: `ajoLookups/${ldapSlug}/${section}`,
        value: defaults[section],
      });
      if (APPLY) await flatRef.set(defaults[section]);
    }
  }

  actions.push({
    action: 'remove_sandboxes_subtree',
    path: `ajoLookups/${ldapSlug}/sandboxes`,
    sandboxKeys: Object.keys(sandboxes),
  });
  if (APPLY) await rootRef.child('sandboxes').remove();

  return { ldapSlug, actions };
}

async function main() {
  const snap = await db.ref('ajoLookups').once('value');
  const all = snap.val() || {};
  const ldapSlugs = Object.keys(all).filter((slug) => {
    if (LDAP_FILTER && slug !== LDAP_FILTER) return false;
    const root = all[slug];
    return root && typeof root === 'object' && root.sandboxes;
  });

  if (!ldapSlugs.length) {
    console.log(
      JSON.stringify({ apply: APPLY, ldapFilter: LDAP_FILTER || null, workspaces: 0, report: [] }, null, 2),
    );
    return;
  }

  const report = [];
  for (const ldapSlug of ldapSlugs) {
    report.push(await migrateWorkspace(ldapSlug));
  }

  const totalActions = report.reduce((n, r) => n + (r.actions ? r.actions.length : 0), 0);
  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        ldapFilter: LDAP_FILTER || null,
        workspaces: report.length,
        totalActions,
        flatSections: FLAT_SECTIONS,
        report,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
