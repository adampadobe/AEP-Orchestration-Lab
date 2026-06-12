#!/usr/bin/env node
/**
 * Admin migration: flat/nested demo config → sandbox-level shared brand + app sections.
 *
 * Usage:
 *   node scripts/migrate-demo-config-rtdb.mjs [--dry-run]
 *
 * Requires Application Default Credentials with Firebase Admin on project aep-orchestration-lab.
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
const DEMO_SECTIONS = [
  'CoreDemoData',
  'StaffPortal',
  'iPad',
  'CallCentre',
  'AgenticLayer',
  'ExpAccelerator',
  'ExpVisualiser',
  'ContentDecisionLive',
];

function isFlatDemoRoot(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  if (val.sandboxes || val.meta) return false;
  return FLAT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(val, k));
}

function pickObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return Object.keys(obj).length ? obj : null;
}

function buildSectionDefaults(flat) {
  const src = flat && typeof flat === 'object' ? flat : {};
  const coreSrc = src.CoreDemoData && typeof src.CoreDemoData === 'object' ? src.CoreDemoData : {};
  return {
    CoreDemoData: {
      name: coreSrc.name || '',
      airlineName: coreSrc.airlineName || coreSrc.name || '',
      slogan: coreSrc.slogan || '',
      url: coreSrc.url || '',
      customerLogo: coreSrc.customerLogo || '',
      shortName: coreSrc.shortName || '',
    },
    StaffPortal: Object.assign(
      {
        AgentName: 'Demo agent',
        AgentID: 'AG-001',
        AgentType: 'Customer Care',
        Colour: '#1473e6',
      },
      src.StaffPortal || {},
    ),
    iPad: {
      Mobile: src.Mobile || {},
      TravelData: src.TravelData || {},
      CustomerLoyalty: src.CustomerLoyalty || {},
    },
    CallCentre: {
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

async function mergeMissingSections(ldapSlug, sandboxSlug, flatLegacy) {
  const sbRef = db.ref(`ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}`);
  const snap = await sbRef.once('value');
  const existing = snap.val() || {};
  const defaults = buildSectionDefaults(flatLegacy || {});
  const patch = {};
  DEMO_SECTIONS.forEach((section) => {
    if (!existing[section]) patch[section] = defaults[section] || {};
  });
  if (Object.keys(patch).length && !DRY_RUN) {
    await sbRef.update(patch);
  }
  return Object.keys(patch);
}

async function hoistSharedBrand(ldapSlug, sandboxSlug, flatLegacy) {
  const sbRef = db.ref(`ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}`);
  const snap = await sbRef.once('value');
  const existing = snap.val() || {};
  const ipad = existing.iPad && typeof existing.iPad === 'object' ? existing.iPad : {};
  const cc = existing.CallCentre && typeof existing.CallCentre === 'object' ? existing.CallCentre : {};
  const defaults = buildSectionDefaults(flatLegacy || {});
  const patch = {};
  const stripped = [];

  if (!existing.CoreDemoData) {
    patch.CoreDemoData =
      pickObject(ipad.CoreDemoData) ||
      pickObject(cc.CoreDemoData) ||
      pickObject(flatLegacy && flatLegacy.CoreDemoData) ||
      defaults.CoreDemoData;
  }
  if (!existing.StaffPortal) {
    patch.StaffPortal =
      pickObject(ipad.StaffPortal) ||
      pickObject(cc.StaffPortal) ||
      pickObject(flatLegacy && flatLegacy.StaffPortal) ||
      defaults.StaffPortal;
  }

  if (Object.keys(patch).length && !DRY_RUN) {
    await sbRef.update(patch);
  }

  const nestedRemovals = [
    ['iPad', 'CoreDemoData'],
    ['iPad', 'StaffPortal'],
    ['CallCentre', 'CoreDemoData'],
    ['CallCentre', 'StaffPortal'],
  ];
  for (const [section, key] of nestedRemovals) {
    const parent = section === 'iPad' ? ipad : cc;
    if (parent && parent[key] != null) {
      stripped.push(`${section}/${key}`);
      if (!DRY_RUN) {
        await sbRef.child(`${section}/${key}`).remove();
      }
    }
  }

  return {
    hoisted: Object.keys(patch),
    stripped,
  };
}

async function processSandbox(ldapSlug, sandboxSlug, flatLegacy) {
  const merged = await mergeMissingSections(ldapSlug, sandboxSlug, flatLegacy);
  const hoist = await hoistSharedBrand(ldapSlug, sandboxSlug, flatLegacy);
  if (!merged.length && !hoist.hoisted.length && !hoist.stripped.length) {
    return null;
  }
  return {
    ldapSlug,
    sandboxSlug,
    action: DRY_RUN ? 'would_migrate_sandbox' : 'migrate_sandbox',
    mergedSections: merged,
    hoisted: hoist.hoisted,
    strippedNested: hoist.stripped,
  };
}

async function main() {
  const snap = await db.ref('ajoLookups').once('value');
  const all = snap.val() || {};
  const report = [];

  for (const [ldapSlug, root] of Object.entries(all)) {
    if (isFlatDemoRoot(root)) {
      const targetRef = db.ref(`ajoLookups/${ldapSlug}/sandboxes/${ldapSlug}`);
      const existing = (await targetRef.once('value')).val();
      if (!DRY_RUN && (!existing || !existing.iPad)) {
        await targetRef.update(buildSectionDefaults(root));
      }
      if (!DRY_RUN) {
        await db.ref(`ajoLookups/${ldapSlug}/meta`).transaction((cur) => {
          if (cur && cur.version) return cur;
          return {
            version: 1,
            provisionedAt: new Date().toISOString(),
            migratedFromFlat: true,
          };
        });
        if (!root.sandboxes) {
          await db.ref(`ajoLookups/${ldapSlug}`).update({
            sandboxes: { [ldapSlug]: buildSectionDefaults(root) },
          });
          for (const k of FLAT_KEYS) {
            await db.ref(`ajoLookups/${ldapSlug}/${k}`).remove();
          }
        }
      }
      const entry = await processSandbox(ldapSlug, ldapSlug, root);
      if (entry) report.push(entry);
      continue;
    }

    if (root && root.sandboxes && typeof root.sandboxes === 'object') {
      for (const sandboxSlug of Object.keys(root.sandboxes)) {
        const entry = await processSandbox(ldapSlug, sandboxSlug, null);
        if (entry) report.push(entry);
      }
    }
  }

  console.log(JSON.stringify({ dryRun: DRY_RUN, entries: report.length, report }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
