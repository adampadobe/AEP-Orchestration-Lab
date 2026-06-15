#!/usr/bin/env node
/**
 * Remove stale RTDB demo-config fields after flat workspace-root simplification.
 *
 * - Strips airlineName / brand / customerShortName / brandName from CoreDemoData (flat + nested)
 * - Removes duplicate workspace sections nested under sandboxes/{sandbox}/
 *
 * Usage:
 *   node scripts/cleanup-rtdb-workspace-stale-fields.mjs [--ldap apalmer]
 *   node scripts/cleanup-rtdb-workspace-stale-fields.mjs --ldap apalmer --apply
 *
 * Dry-run by default. Requires Application Default Credentials on aep-orchestration-lab.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../functions/package.json'));
const admin = require('firebase-admin');
const {
  CANONICAL_CORE_DEMO_KEYS,
  WORKSPACE_ROOT_SECTIONS,
  SANDBOX_SECTIONS,
  sanitizeCoreDemoData,
} = require('../functions/labRtdbProvisionService');

const RTDB_URL = process.env.FIREBASE_DATABASE_URL || 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';
const APPLY = process.argv.includes('--apply');
const ldapArgIdx = process.argv.indexOf('--ldap');
const LDAP_FILTER = ldapArgIdx >= 0 ? String(process.argv[ldapArgIdx + 1] || '').trim() : '';

const STALE_CORE_KEYS = ['airlineName', 'brand', 'customerShortName', 'brandName'];

/** Workspace sections that must not live under sandboxes/{sandbox}/. */
const NESTED_WORKSPACE_SECTIONS = [
  ...WORKSPACE_ROOT_SECTIONS,
  'iPad',
];

if (!admin.apps.length) {
  admin.initializeApp({ databaseURL: RTDB_URL });
}

const db = admin.database();

function hasStaleCoreKeys(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return STALE_CORE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function coreNeedsSanitize(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (hasStaleCoreKeys(obj)) return true;
  const sanitized = sanitizeCoreDemoData(obj);
  return CANONICAL_CORE_DEMO_KEYS.some((k) => String(obj[k] || '') !== String(sanitized[k] || ''));
}

async function sanitizeCoreAtRef(ref, label) {
  const snap = await ref.once('value');
  const val = snap.val();
  if (!val || typeof val !== 'object') return null;

  const sanitized = sanitizeCoreDemoData(val);
  const staleKeys = STALE_CORE_KEYS.filter((k) => val[k] != null);
  if (!coreNeedsSanitize(val)) return null;

  const action = {
    path: ref.toString().replace(/^https?:\/\/[^/]+\/?/, ''),
    action: 'sanitize_CoreDemoData',
    removedKeys: staleKeys,
    before: val,
    after: sanitized,
  };

  if (APPLY) {
    await ref.set(sanitized);
  }
  return action;
}

async function removeNestedWorkspaceSection(ldapSlug, sandboxSlug, section) {
  const ref = db.ref(`ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}/${section}`);
  const snap = await ref.once('value');
  if (!snap.exists()) return null;

  const action = {
    path: `ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}/${section}`,
    action: 'remove_nested_workspace_section',
    value: snap.val(),
  };

  if (APPLY) {
    await ref.remove();
  }
  return action;
}

async function processWorkspace(ldapSlug) {
  const actions = [];
  const rootRef = db.ref(`ajoLookups/${ldapSlug}`);

  const flatCore = await sanitizeCoreAtRef(rootRef.child('CoreDemoData'), 'flat');
  if (flatCore) actions.push(flatCore);

  const sandboxesSnap = await rootRef.child('sandboxes').once('value');
  const sandboxes = sandboxesSnap.val();
  if (!sandboxes || typeof sandboxes !== 'object') {
    return { ldapSlug, actions };
  }

  for (const sandboxSlug of Object.keys(sandboxes)) {
    const sb = sandboxes[sandboxSlug];
    if (!sb || typeof sb !== 'object') continue;

    for (const section of NESTED_WORKSPACE_SECTIONS) {
      if (sb[section] == null) continue;
      const removed = await removeNestedWorkspaceSection(ldapSlug, sandboxSlug, section);
      if (removed) actions.push(removed);
    }

    const ipad = sb.iPad;
    if (ipad && typeof ipad === 'object') {
      for (const nestedKey of ['CoreDemoData', 'StaffPortal']) {
        if (ipad[nestedKey] == null) continue;
        const ref = rootRef.child(`sandboxes/${sandboxSlug}/iPad/${nestedKey}`);
        const action = {
          path: `ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}/iPad/${nestedKey}`,
          action: 'remove_nested_ipad_brand_copy',
          value: ipad[nestedKey],
        };
        actions.push(action);
        if (APPLY) await ref.remove();
      }
      const ipadSnap = await rootRef.child(`sandboxes/${sandboxSlug}/iPad`).once('value');
      const ipadVal = ipadSnap.val();
      if (ipadVal && typeof ipadVal === 'object' && !Object.keys(ipadVal).length) {
        actions.push({
          path: `ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}/iPad`,
          action: 'remove_empty_iPad',
        });
        if (APPLY) await rootRef.child(`sandboxes/${sandboxSlug}/iPad`).remove();
      }
    }
  }

  return { ldapSlug, actions };
}

async function main() {
  const snap = await db.ref('ajoLookups').once('value');
  const all = snap.val() || {};
  const ldapSlugs = Object.keys(all).filter((slug) => {
    if (LDAP_FILTER && slug !== LDAP_FILTER) return false;
    const root = all[slug];
    return root && typeof root === 'object' && (root.sandboxes || root.meta || root.CoreDemoData);
  });

  if (!ldapSlugs.length) {
    console.log(JSON.stringify({ apply: APPLY, ldapFilter: LDAP_FILTER || null, workspaces: 0, report: [] }, null, 2));
    return;
  }

  const report = [];
  for (const ldapSlug of ldapSlugs) {
    report.push(await processWorkspace(ldapSlug));
  }

  const totalActions = report.reduce((n, r) => n + r.actions.length, 0);
  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        ldapFilter: LDAP_FILTER || null,
        workspaces: report.length,
        totalActions,
        sandboxSectionsPreserved: SANDBOX_SECTIONS,
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
