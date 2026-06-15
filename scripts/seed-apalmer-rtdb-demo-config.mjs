#!/usr/bin/env node
/**
 * Seed apalmer workspace demo config in RTDB (flat workspace root only).
 *
 * Usage:
 *   node scripts/seed-apalmer-rtdb-demo-config.mjs --dry-run
 *   node scripts/seed-apalmer-rtdb-demo-config.mjs
 *
 * Requires Application Default Credentials with Firebase Admin on aep-orchestration-lab.
 */
import { createRequire as cr } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = cr(path.join(path.dirname(fileURLToPath(import.meta.url)), '../functions/package.json'));
const admin = require('firebase-admin');
const {
  saveDemoSection,
  splitStubIntoSections,
  buildFlatLabStub,
  WORKSPACE_ROOT_SECTIONS,
} = require('../functions/labRtdbProvisionService');

const PROJECT_ID = 'aep-orchestration-lab';
const DATABASE_URL = 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';
const LDAP_SLUG = 'apalmer';

const dryRun = process.argv.includes('--dry-run');

const TEST_VALUES = {
  CoreDemoData: {
    name: 'Saga',
    shortName: 'SAG',
    slogan: 'Experience is Everything',
    url: 'https://saga.co.uk/#',
    customerLogo: 'https://aep-orchestration-lab.web.app/cdn/apalmer/logo/logo.png',
  },
  StaffPortal: {
    AgentName: 'Alex Palmer',
    AgentID: 'AG-001',
    AgentType: 'Customer Care',
    Colour: '#1473e6',
  },
  CallCentre: {
    industryId: 'travel',
  },
  Mobile: {
    StaffName: 'Alex Palmer',
    Gate: 'B12',
  },
  TravelData: {
    flightNumber: 'SG101',
    route: 'LHR → FCO',
    gate: 'B12',
  },
  AgenticLayer: {
    agentUrls: {
      brand: 'https://example.com/brand-agent',
      product: '',
      operational: '',
      field: '',
      audience: '',
      journey: '',
      data: '',
      support: '',
    },
  },
};

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL });
}

const db = admin.database();

console.log('Project:', PROJECT_ID);
console.log('Workspace LDAP:', LDAP_SLUG);
console.log('Mode:', dryRun ? 'DRY RUN' : 'APPLY');
console.log('Values:', JSON.stringify(TEST_VALUES, null, 2));
console.log('---');

if (dryRun) {
  console.log('Would write sections:', Object.keys(TEST_VALUES).join(', '));
  for (const section of Object.keys(TEST_VALUES)) {
    console.log('  flat:', `ajoLookups/${LDAP_SLUG}/${section}`);
  }
  process.exit(0);
}

for (const [section, partial] of Object.entries(TEST_VALUES)) {
  const result = await saveDemoSection(db, LDAP_SLUG, null, section, partial);
  console.log('Saved', section, '→', result.flatPath);
}

const defaults = splitStubIntoSections(buildFlatLabStub());
const rootRef = db.ref(`ajoLookups/${LDAP_SLUG}`);
const snap = await rootRef.once('value');
const existing = snap.val() || {};
const patch = {};
for (const section of WORKSPACE_ROOT_SECTIONS) {
  if (!existing[section]) {
    patch[section] = defaults[section] || {};
  }
}
if (Object.keys(patch).length) {
  await rootRef.update(patch);
  console.log('Merged missing flat default sections:', Object.keys(patch).join(', '));
}

if (existing.sandboxes) {
  await rootRef.child('sandboxes').remove();
  console.log('Removed legacy sandboxes/ subtree');
}

console.log('Done. Verify:');
console.log('  curl -s "' + DATABASE_URL + '/ajoLookups/' + LDAP_SLUG + '/CoreDemoData/name.json"');
console.log('  curl -s "' + DATABASE_URL + '/ajoLookups/' + LDAP_SLUG + '/StaffPortal/AgentName.json"');
console.log('  curl -s "' + DATABASE_URL + '/ajoLookups/' + LDAP_SLUG + '/TravelData/flightNumber.json"');
console.log('  curl -s "' + DATABASE_URL + '/ajoLookups/' + LDAP_SLUG + '/AgenticLayer/agentUrls/brand.json"');
