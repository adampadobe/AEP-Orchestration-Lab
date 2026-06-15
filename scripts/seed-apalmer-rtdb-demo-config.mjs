#!/usr/bin/env node
/**
 * Seed apalmer workspace demo config in RTDB (flat workspace root).
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
  SANDBOX_SECTIONS,
} = require('../functions/labRtdbProvisionService');

const PROJECT_ID = 'aep-orchestration-lab';
const DATABASE_URL = 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';
const LDAP_SLUG = 'apalmer';
const SANDBOX_SLUG = 'apalmer';

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
  for (const [section] of Object.entries(TEST_VALUES)) {
    if (WORKSPACE_ROOT_SECTIONS.has(section)) {
      console.log('  flat:', `ajoLookups/${LDAP_SLUG}/${section}`);
    } else {
      console.log('  nested:', `ajoLookups/${LDAP_SLUG}/sandboxes/${SANDBOX_SLUG}/${section}`);
    }
  }
  process.exit(0);
}

for (const [section, partial] of Object.entries(TEST_VALUES)) {
  const result = await saveDemoSection(db, LDAP_SLUG, SANDBOX_SLUG, section, partial);
  const target = result.flatPath || result.nestedPath;
  console.log('Saved', section, '→', target);
}

const defaults = splitStubIntoSections(buildFlatLabStub());
const sbRef = db.ref(`ajoLookups/${LDAP_SLUG}/sandboxes/${SANDBOX_SLUG}`);
const snap = await sbRef.once('value');
const existing = snap.val() || {};
const patch = {};
for (const section of SANDBOX_SECTIONS) {
  if (!existing[section]) {
    patch[section] = defaults[section] || {};
  }
}
if (Object.keys(patch).length) {
  await sbRef.update(patch);
  console.log('Merged missing sandbox-scoped default sections:', Object.keys(patch).join(', '));
}

console.log('Done. Verify:');
console.log('  curl -s "' + DATABASE_URL + '/ajoLookups/' + LDAP_SLUG + '/CoreDemoData/name.json"');
console.log('  curl -s "' + DATABASE_URL + '/ajoLookups/' + LDAP_SLUG + '/StaffPortal/AgentName.json"');
console.log('  curl -s "' + DATABASE_URL + '/ajoLookups/' + LDAP_SLUG + '/TravelData/flightNumber.json"');
