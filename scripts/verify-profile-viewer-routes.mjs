#!/usr/bin/env node
/**
 * Guardrails for hosted Profile Viewer routes that must stay in web/profile-viewer/
 * (Firebase Hosting serves web/ — do not delete or orphan these files on main).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const REQUIRED_FILES = [
  'web/profile-viewer/journey-arbitration.html',
  'web/profile-viewer/journey-arbitration.js',
  'web/profile-viewer/journey-arbitration.css',
  'web/profile-viewer/decisioning-overview-v2.html',
  'web/profile-viewer/decisioning-overview-v3.html',
  'web/profile-viewer/decisioning-overview-v3.css',
  'web/profile-viewer/journey-arbitration-v2.html',
  'web/profile-viewer/journey-arbitration-v2.css',
  'web/profile-viewer/journey-arbitration-v2.js',
  'web/profile-viewer/journey-arbitration-v2-iframe-bridge.css',
  'web/profile-viewer/ajo-decisioning-pipeline-v8-demo.html',
  'web/profile-viewer/ajo-pipeline-industry-labels.js',
  'web/profile-viewer/ajo-pipeline-industry-apply.js',
];

let failed = false;

for (const rel of REQUIRED_FILES) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error('Missing required file:', rel);
    failed = true;
  }
}

const navPath = path.join(root, 'web/profile-viewer/aep-lab-nav.js');
const nav = fs.readFileSync(navPath, 'utf8');
if (!nav.includes('journey-arbitration.html')) {
  console.error('aep-lab-nav.js must include href journey-arbitration.html');
  failed = true;
}
if (!nav.includes('decisioning-overview-v2.html')) {
  console.error('aep-lab-nav.js must include href decisioning-overview-v2.html');
  failed = true;
}
if (!nav.includes('decisioning-overview-v3.html')) {
  console.error('aep-lab-nav.js must include href decisioning-overview-v3.html');
  failed = true;
}
if (!nav.includes('journey-arbitration-v2.html')) {
  console.error('aep-lab-nav.js must include href journey-arbitration-v2.html');
  failed = true;
}

const gsPath = path.join(root, 'web/profile-viewer/global-settings.html');
const gs = fs.readFileSync(gsPath, 'utf8');
if (!gs.includes('journeyArbitration')) {
  console.error('global-settings.html must include nav hide key journeyArbitration');
  failed = true;
}
if (!gs.includes('decisioningOverviewV2')) {
  console.error('global-settings.html must include nav hide key decisioningOverviewV2');
  failed = true;
}
if (!gs.includes('decisioningOverviewV3')) {
  console.error('global-settings.html must include nav hide key decisioningOverviewV3');
  failed = true;
}
if (!gs.includes('journeyArbitrationV2')) {
  console.error('global-settings.html must include nav hide key journeyArbitrationV2');
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log('OK: profile-viewer routes (journey-arbitration, journey-arbitration-v2, decisioning-overview-v2, decisioning-overview-v3) verified');
