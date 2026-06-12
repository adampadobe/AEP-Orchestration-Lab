#!/usr/bin/env node
/**
 * One-time admin migration: flat ajoLookups/{slug} → ajoLookups/{ldap}/sandboxes/{sandbox}/…
 *
 * Usage:
 *   node scripts/migrate-demo-config-rtdb.mjs [--dry-run]
 *
 * Requires Application Default Credentials with Firebase Admin on project aep-orchestration-lab.
 *
 * Heuristic: if ajoLookups/{key} has top-level StaffPortal/TravelData (no sandboxes node),
 * copy into ajoLookups/{key}/sandboxes/{key}/ with all demo section stubs.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../functions/package.json'));
const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const RTDB_URL = process.env.FIREBASE_DATABASE_URL || 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';

if (!admin.apps.length) {
  admin.initializeApp({ databaseURL: RTDB_URL });
}

const db = admin.database();

const FLAT_KEYS = ['StaffPortal', 'CoreDemoData', 'Mobile', 'TravelData', 'CustomerLoyalty'];
const DEMO_SECTIONS = ['iPad', 'CallCentre', 'AgenticLayer', 'ExpAccelerator', 'ExpVisualiser', 'ContentDecisionLive'];

function isFlatDemoRoot(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  if (val.sandboxes || val.meta) return false;
  return FLAT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(val, k));
}

function buildSectionDefaults(flat) {
  const src = flat && typeof flat === 'object' ? flat : {};
  return {
    iPad: {
      StaffPortal: src.StaffPortal || {},
      CoreDemoData: src.CoreDemoData || {},
      Mobile: src.Mobile || {},
      TravelData: src.TravelData || {},
      CustomerLoyalty: src.CustomerLoyalty || {},
    },
    CallCentre: {
      StaffPortal: src.StaffPortal || {},
      CoreDemoData: src.CoreDemoData || {},
      Mobile: src.Mobile || {},
      industryId: 'travel',
    },
    AgenticLayer: {
      agentUrls: {
        brand: '',
        product: '',
        operational: '',
        field: '',
        audience: '',
        journey: '',
        data: '',
        support: '',
      },
    },
    ExpAccelerator: {
      displayNameOverride: '',
      opportunityIndustry: 'general',
      useIndustrySamplePack: true,
    },
    ExpVisualiser: {
      treatmentA: 'https://contenthosting.web.app/experiments/treatmenta.png',
      treatmentB: 'https://contenthosting.web.app/experiments/treatmentb.png',
      treatmentC: 'https://contenthosting.web.app/experiments/treatmentc.png',
      emailA: 'https://contenthosting.web.app/experiments/emailsubjecta.png',
      emailB: 'https://contenthosting.web.app/experiments/emailsubjectb.png',
    },
    ContentDecisionLive: {
      edgeConfigId: '',
      decisionScopes: '',
      edgeForceConfigure: false,
      edgeConfigBySandbox: {},
    },
  };
}

async function mergeMissingSections(ldapSlug, sandboxSlug) {
  const sbRef = db.ref(`ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}`);
  const snap = await sbRef.once('value');
  const existing = snap.val() || {};
  const defaults = buildSectionDefaults({});
  const patch = {};
  DEMO_SECTIONS.forEach((section) => {
    if (!existing[section]) patch[section] = defaults[section] || {};
  });
  if (Object.keys(patch).length && !DRY_RUN) {
    await sbRef.update(patch);
  }
  return Object.keys(patch);
}

async function main() {
  const snap = await db.ref('ajoLookups').once('value');
  const all = snap.val() || {};
  const report = [];

  for (const [ldapSlug, root] of Object.entries(all)) {
    if (isFlatDemoRoot(root)) {
      const targetRef = db.ref(`ajoLookups/${ldapSlug}/sandboxes/${ldapSlug}`);
      const existing = (await targetRef.once('value')).val();
      const sections = buildSectionDefaults(root);
      const action = existing && existing.iPad ? 'merge_sections' : 'migrate_flat';
      const merged = existing && existing.iPad ? await mergeMissingSections(ldapSlug, ldapSlug) : Object.keys(sections);

      report.push({ ldapSlug, action: DRY_RUN ? `would_${action}` : action, sections: merged });

      if (!DRY_RUN) {
        if (!existing || !existing.iPad) {
          await targetRef.update(sections);
        }
        await db.ref(`ajoLookups/${ldapSlug}/meta`).transaction((cur) => {
          if (cur && cur.version) return cur;
          return {
            version: 1,
            provisionedAt: new Date().toISOString(),
            migratedFromFlat: true,
          };
        });
        if (!root.sandboxes) {
          await db.ref(`ajoLookups/${ldapSlug}`).update({ sandboxes: { [ldapSlug]: sections } });
          for (const k of FLAT_KEYS) {
            await db.ref(`ajoLookups/${ldapSlug}/${k}`).remove();
          }
        }
      }
      continue;
    }

    if (root && root.sandboxes && typeof root.sandboxes === 'object') {
      for (const sandboxSlug of Object.keys(root.sandboxes)) {
        const merged = await mergeMissingSections(ldapSlug, sandboxSlug);
        if (merged.length) {
          report.push({
            ldapSlug,
            sandboxSlug,
            action: DRY_RUN ? 'would_merge_sections' : 'merge_sections',
            sections: merged,
          });
        }
      }
    }
  }

  console.log(JSON.stringify({ dryRun: DRY_RUN, entries: report.length, report }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
