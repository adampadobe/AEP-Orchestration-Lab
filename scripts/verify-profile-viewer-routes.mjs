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
  'web/profile-viewer/journey-arbitration-v2.html',
  'web/profile-viewer/journey-arbitration-v2.css',
  'web/profile-viewer/journey-arbitration-v2.js',
  'web/profile-viewer/journey-arbitration-v2-iframe-bridge.css',
  'web/profile-viewer/ajo-decisioning-pipeline-v8-demo.html',
  'web/profile-viewer/ajo-pipeline-industry-labels.js',
  'web/profile-viewer/ajo-pipeline-industry-apply.js',
  'web/profile-viewer/eds-quickstart.html',
  'web/profile-viewer/eds-quickstart/index.html',
];

// Files that were intentionally hard-deleted and must NOT come back via copy-paste,
// merge resurrection, or future automation. Bookmark URLs were accepted to 404.
const FORBIDDEN_FILES = [
  'web/profile-viewer/decisioning-overview-v2.html',
];

let failed = false;

for (const rel of REQUIRED_FILES) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error('Missing required file:', rel);
    failed = true;
  }
}

for (const rel of FORBIDDEN_FILES) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) {
    console.error('Forbidden file resurrected (was hard-deleted by product decision):', rel);
    failed = true;
  }
}

const jaV1Path = path.join(root, 'web/profile-viewer/journey-arbitration.html');
const jaV1 = fs.readFileSync(jaV1Path, 'utf8');
if (!jaV1.includes('journey-arbitration-v2.html')) {
  console.error('journey-arbitration.html must redirect to journey-arbitration-v2.html');
  failed = true;
}
if (!jaV1.includes('location.replace') && !jaV1.includes('http-equiv="refresh"')) {
  console.error('journey-arbitration.html must use meta refresh and/or location.replace for redirect');
  failed = true;
}

const navPath = path.join(root, 'web/profile-viewer/aep-lab-nav.js');
const nav = fs.readFileSync(navPath, 'utf8');
if (nav.includes("href: 'journey-arbitration.html'")) {
  console.error('aep-lab-nav.js must not link to legacy journey-arbitration.html (use v2 only)');
  failed = true;
}
if (nav.includes('decisioning-overview-v2.html')) {
  console.error('aep-lab-nav.js must NOT include href decisioning-overview-v2.html (page hard-deleted)');
  failed = true;
}
if (!nav.includes('journey-arbitration-v2.html')) {
  console.error('aep-lab-nav.js must include href journey-arbitration-v2.html');
  failed = true;
}
if (!nav.includes("href: 'eds-quickstart.html'")) {
  console.error('aep-lab-nav.js must include the EDS Site Bootstrap demo entry (href: eds-quickstart.html)');
  failed = true;
}

const gsPath = path.join(root, 'web/profile-viewer/global-settings.html');
const gs = fs.readFileSync(gsPath, 'utf8');
if (gs.includes('data-aep-nav-hide-key="journeyArbitration"')) {
  console.error('global-settings.html must not include nav hide key journeyArbitration (legacy v1 removed)');
  failed = true;
}
if (!gs.includes('journeyArbitrationV2')) {
  console.error('global-settings.html must include nav hide key journeyArbitrationV2');
  failed = true;
}
if (gs.includes('decisioningOverviewV2')) {
  console.error('global-settings.html must NOT include nav hide key decisioningOverviewV2 (page hard-deleted)');
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log('OK: profile-viewer routes (journey-arbitration redirect, journey-arbitration-v2, eds-quickstart) verified');
