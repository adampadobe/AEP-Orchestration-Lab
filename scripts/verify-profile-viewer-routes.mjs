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
  'web/profile-viewer/journey-arbitration-v2-iframe-bridge.css',
  'web/profile-viewer/journey-arbitration-v3.html',
  'web/profile-viewer/journey-arbitration-v3.css',
  'web/profile-viewer/journey-arbitration-v3.js',
  'web/profile-viewer/the-anatomy-of-a-decision-v19-1.html',
  'web/profile-viewer/ajo-pipeline-industry-labels.js',
  'web/profile-viewer/ajo-pipeline-industry-apply.js',
  'web/profile-viewer/eds-quickstart.html',
  'web/profile-viewer/eds-quickstart/index.html',
  'web/profile-viewer/assets/eds-doc-starter.zip',
  'web/profile-viewer/content-decision-live-edge.html',
];

// Files that were intentionally hard-deleted and must NOT come back via copy-paste,
// merge resurrection, or future automation. Bookmark URLs were accepted to 404.
const FORBIDDEN_FILES = [
  'web/profile-viewer/decisioning-overview-v2.html',
  'web/profile-viewer/demo-delivery-concept.html',
  'web/profile-viewer/demo-delivery-concept.css',
  'web/profile-viewer/demo-delivery-concept.js',
  'web/profile-viewer/ajo-decisioning-pipeline-v8-demo.html',
  'web/profile-viewer/experimentation-overview.html',
  'web/profile-viewer/content-decision-live.html',
  'web/profile-viewer/experimentation-visualiser.html',
  'web/profile-viewer/experimentation-visualiser.css',
  'web/profile-viewer/experimentation-visualiser-dock.css',
  'web/profile-viewer/experimentation-visualiser.js',
  'web/profile-viewer/experimentation-visualiser-customise.js',
  'web/profile-viewer/experimentation-visualiser-gif.js',
  'web/profile-viewer/experimentation-visualiser-gif.worker.js',
  'web/profile-viewer/architecture-end-to-end.html',
  'web/profile-viewer/architecture-end-to-end.css',
  'web/profile-viewer/architecture-end-to-end.js',
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
if (!jaV1.includes('journey-arbitration-v3.html')) {
  console.error('journey-arbitration.html must redirect to journey-arbitration-v3.html');
  failed = true;
}
if (!jaV1.includes('location.replace') && !jaV1.includes('http-equiv="refresh"')) {
  console.error('journey-arbitration.html must use meta refresh and/or location.replace for redirect');
  failed = true;
}

const jaV2Path = path.join(root, 'web/profile-viewer/journey-arbitration-v2.html');
const jaV2 = fs.readFileSync(jaV2Path, 'utf8');
if (!jaV2.includes('journey-arbitration-v3.html')) {
  console.error('journey-arbitration-v2.html must redirect to journey-arbitration-v3.html');
  failed = true;
}
if (!jaV2.includes('location.replace') && !jaV2.includes('http-equiv="refresh"')) {
  console.error('journey-arbitration-v2.html must use meta refresh and/or location.replace for redirect');
  failed = true;
}

const navPath = path.join(root, 'web/profile-viewer/aep-lab-nav.js');
const nav = fs.readFileSync(navPath, 'utf8');
if (nav.includes("href: 'journey-arbitration.html'")) {
  console.error('aep-lab-nav.js must not link to legacy journey-arbitration.html (use journey-arbitration-v3.html)');
  failed = true;
}
if (nav.includes('decisioning-overview-v2.html')) {
  console.error('aep-lab-nav.js must NOT include href decisioning-overview-v2.html (page hard-deleted)');
  failed = true;
}
if (nav.includes('demo-delivery-concept.html')) {
  console.error('aep-lab-nav.js must NOT include href demo-delivery-concept.html (page hard-deleted)');
  failed = true;
}
if (nav.includes('experimentation-overview.html')) {
  console.error('aep-lab-nav.js must NOT include href experimentation-overview.html (page hard-deleted)');
  failed = true;
}
if (nav.includes("navHideKey: 'experimentationOverview'")) {
  console.error('aep-lab-nav.js must NOT include nav hide key experimentationOverview (page hard-deleted)');
  failed = true;
}
if (nav.includes('content-decision-live.html')) {
  console.error('aep-lab-nav.js must NOT link to content-decision-live.html (page retired)');
  failed = true;
}
if (nav.includes('experimentation-visualiser.html') || nav.includes("navHideKey: 'experimentationVisualiser'")) {
  console.error('aep-lab-nav.js must NOT include the retired Experimentation visualiser');
  failed = true;
}
if (!nav.includes("href: 'content-decision-live-edge.html'")) {
  console.error('aep-lab-nav.js must keep the Decisioning lab (Edge) entry');
  failed = true;
}
if (nav.includes('architecture-end-to-end.html') || nav.includes("navHideKey: 'architectureEndToEnd'")) {
  console.error('aep-lab-nav.js must NOT include the retired Adobe integration flow');
  failed = true;
}
if (!nav.includes('journey-arbitration-v3.html')) {
  console.error('aep-lab-nav.js must include href journey-arbitration-v3.html');
  failed = true;
}
if (nav.includes("href: 'journey-arbitration-v2.html'")) {
  console.error('aep-lab-nav.js must not link to retired journey-arbitration-v2.html (redirect stub only)');
  failed = true;
}
if (nav.includes("navHideKey: 'journeyArbitrationV2'") || nav.includes("navHideKey: 'journeyArbitrationV3'")) {
  console.error('aep-lab-nav.js must not use journeyArbitrationV2/V3 nav hide keys (Journey arbitration is generally available)');
  failed = true;
}
const jaNavIdx = nav.indexOf("href: 'journey-arbitration-v3.html'");
if (jaNavIdx !== -1) {
  const jaNavWindow = nav.slice(Math.max(0, jaNavIdx - 220), jaNavIdx + 220);
  if (!jaNavWindow.includes("label: 'Journey arbitration'")) {
    console.error("aep-lab-nav.js: Journey arbitration nav entry must use label: 'Journey arbitration' (no version suffix)");
    failed = true;
  }
  if (!jaNavWindow.includes('skipNavVisibilityOption: true')) {
    console.error('aep-lab-nav.js: Journey arbitration entry must set skipNavVisibilityOption: true (no per-item Global values hide)');
    failed = true;
  }
  if (jaNavWindow.includes('inDevelopment: true')) {
    console.error('aep-lab-nav.js: Journey arbitration entry must not use inDevelopment: true');
    failed = true;
  }
}
if (!nav.includes("href: 'eds-quickstart.html'")) {
  console.error('aep-lab-nav.js must include the EDS Demo Creator entry (href: eds-quickstart.html)');
  failed = true;
}
// EDS Demo Creator is in-development; its nav entry MUST stay gated so it is hidden
// from everyone by default (master in-dev toggle off + per-item Global values hide-key).
const edsNavStart = nav.indexOf("href: 'eds-quickstart.html'");
if (edsNavStart !== -1) {
  const edsNavWindow = nav.slice(Math.max(0, edsNavStart - 200), edsNavStart + 600);
  if (!edsNavWindow.includes('inDevelopment: true')) {
    console.error('aep-lab-nav.js: EDS Demo Creator entry must set inDevelopment: true (hidden by default)');
    failed = true;
  }
  if (!edsNavWindow.includes("navHideKey: 'edsQuickstart'")) {
    console.error("aep-lab-nav.js: EDS Demo Creator entry must set navHideKey: 'edsQuickstart' (Global values toggle)");
    failed = true;
  }
}

if (!nav.includes('if (!isUserAllowedForNavItem(item)) return false;')) {
  console.error('aep-lab-nav.js must enforce owner-only visibility before rendering sidebar items');
  failed = true;
}

for (const file of [
  'decisioning-catalog.html',
  'decisioning-visualiser.html',
  'experience-decisioning.html',
]) {
  const html = fs.readFileSync(path.join(root, 'web/profile-viewer', file), 'utf8');
  if (html.includes('content-decision-live.html')) {
    console.error(`${file}: must not link to retired content-decision-live.html`);
    failed = true;
  }
}

for (const file of ['firebase.json', 'firebase.sandbox.json', 'firebase.sandbox.direct.json']) {
  const config = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const hostingConfigs = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
  const redirects = hostingConfigs.flatMap((hosting) => hosting.redirects || []);
  if (redirects.some((redirect) => redirect.source === '/content-decision-live.html')) {
    console.error(`${file}: must not redirect to retired content-decision-live.html`);
    failed = true;
  }
  if (!redirects.some((redirect) => redirect.source === '/content-decision-live-edge.html')) {
    console.error(`${file}: must preserve the Decisioning lab (Edge) redirect`);
    failed = true;
  }
}

const gsPath = path.join(root, 'web/profile-viewer/global-settings.html');
const gs = fs.readFileSync(gsPath, 'utf8');
if (gs.includes('data-aep-nav-hide-key="journeyArbitration"')) {
  console.error('global-settings.html must not include nav hide key journeyArbitration (legacy v1 removed)');
  failed = true;
}
if (gs.includes('decisioningOverviewV2')) {
  console.error('global-settings.html must NOT include nav hide key decisioningOverviewV2 (page hard-deleted)');
  failed = true;
}
if (gs.includes('demoDeliveryConcept')) {
  console.error('global-settings.html must not include nav hide key demoDeliveryConcept (page hard-deleted)');
  failed = true;
}
if (!nav.includes("navHideKey: 'edsQuickstart'")) {
  console.error("aep-lab-nav.js must include navHideKey: 'edsQuickstart' (per-item toggle for EDS Demo Creator)");
  failed = true;
}
if (!gs.includes('id="aepNavInDevChecklist"') || !gs.includes('id="aepNavSidebarChecklist"')) {
  console.error('global-settings.html must include in-development + full-menu checklist containers');
  failed = true;
}
if (!gs.includes('getMenuVisibilityOptions')) {
  console.error('global-settings.html must render nav visibility controls from AepNavInDev.getMenuVisibilityOptions()');
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log('OK: profile-viewer routes (preserved Decisioning pages and retired routes) verified');
