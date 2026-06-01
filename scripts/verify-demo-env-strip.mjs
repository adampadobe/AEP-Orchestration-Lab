#!/usr/bin/env node
/**
 * Guardrails: lab demo env strip must match Sky master (shared mount + CSS bundle + bootstrap, no drift).
 * @see docs/demo-env-strip-standard.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pv = path.join(root, 'web/profile-viewer');

const BUNDLE_CSS = 'shared/demo-env-bar.bundle.css';
const BUNDLE_BOOTSTRAP = 'shared/demo-env-bar-bootstrap.js';

const SITE_CLONE_DEMO_HTML = [
  'sky-demo.html',
  'jlr-demo.html',
  'mod-demo.html',
  'premier-inn-demo.html',
  'etihad-demo.html',
  'admiral-demo.html',
  'navigator-global-demo.html',
  'race-for-life-demo.html',
  'donate-demo.html',
  'oldmutual-demo.html',
  'oldmutual-wealth.html',
  'oldmutual-insurance-for-business.html',
  'oldmutual-business-quote-thank-you.html',
  'social/facebook.html',
  'social/tiktok.html',
  'ferrari-world-abu-dhabi/index.html',
  'ferrari-world-abu-dhabi/booking.html',
  'seaworld-abu-dhabi/index.html',
  'wb-world-abu-dhabi/index.html',
];

const SITE_CLONE_DEMO_JS = [
  'sky-demo.js',
  'jlr-demo.js',
  'mod-demo.js',
  'premier-inn-demo.js',
  'etihad-demo.js',
  'admiral-demo.js',
  'navigator-global-demo.js',
  'race-for-life-demo.js',
  'donate-demo.js',
  'oldmutual-demo.js',
  'social/facebook-home-demo.js',
  'social/tiktok-demo.js',
  'ferrari-world-abu-dhabi-demo.js',
  'seaworld-abu-dhabi-demo.js',
  'wb-world-abu-dhabi-demo.js',
  'miral/miral-theme-parks-demo.js',
];

const CSS_DRIFT_ALLOWLIST = new Set([
  'aep-demo-env-bar.css',
  'site-clone-bc-env-strip.css',
  BUNDLE_CSS,
  'site-clone-bc.css',
]);

const FORBIDDEN_CSS_PATTERNS = [
  { re: /grid-template-columns:\s*1fr\s+300px/, label: 'legacy two-column env strip grid (use aep-demo-id-inner / Sky stacked layout)' },
  { re: /\.aep-demo-env-/, label: 'per-demo .aep-demo-env-* override (use shared/demo-env-bar.bundle.css)' },
  { re: /#aepDemoProfileSection/, label: 'per-demo #aepDemoProfileSection override (use shared/demo-env-bar.bundle.css)' },
  { re: /\.site-clone-bc-env-strip/, label: 'per-demo site-clone-bc-env-strip override (use shared/demo-env-bar.bundle.css)' },
  { re: /\.aep-demo-profile-section-grid/, label: 'per-demo aep-demo-profile-section-grid override (use aep-demo-env-bar.css Sky master)' },
];

const FORBIDDEN_HTML_PATTERNS = [
  { re: /om-aep-env-editor-grid/, label: 'legacy om-aep-env-editor-grid class' },
  { re: /\bid="injectSdkBtn"/, label: 'unprefixed injectSdkBtn id in HTML' },
];

let failed = false;

function fail(msg) {
  console.error(msg);
  failed = true;
}

function read(rel) {
  return fs.readFileSync(path.join(pv, rel), 'utf8');
}

function walkCss(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') walkCss(abs, out);
    else if (ent.isFile() && ent.name.endsWith('.css') && !ent.name.startsWith('sky-llm-snapshot')) out.push(abs);
  }
  return out;
}

for (const rel of SITE_CLONE_DEMO_HTML) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    fail(`Missing site-clone demo HTML: ${rel}`);
    continue;
  }
  const html = fs.readFileSync(abs, 'utf8');
  if (!html.includes('data-demo-env-strip-mount="site-clone-tags"')) {
    fail(`${rel}: missing data-demo-env-strip-mount="site-clone-tags"`);
  }
  if (!html.includes('shared/demo-env-strip.js')) {
    fail(`${rel}: missing shared/demo-env-strip.js`);
  }
  if (!html.includes(BUNDLE_CSS)) {
    fail(`${rel}: missing ${BUNDLE_CSS} (unified env bar CSS bundle)`);
  }
  if (!html.includes(BUNDLE_BOOTSTRAP)) {
    fail(`${rel}: missing ${BUNDLE_BOOTSTRAP}`);
  }
  if (/href="[^"]*\/aep-demo-env-bar\.css/.test(html) || /href="aep-demo-env-bar\.css/.test(html)) {
    fail(`${rel}: must not load aep-demo-env-bar.css directly — use ${BUNDLE_CSS}`);
  }
  if (/href="[^"]*\/site-clone-bc-env-strip\.css/.test(html) || /href="site-clone-bc-env-strip\.css/.test(html)) {
    fail(`${rel}: must not load site-clone-bc-env-strip.css directly — use ${BUNDLE_CSS}`);
  }
  if (!html.includes('aep-demo-id-inner')) {
    fail(`${rel}: missing aep-demo-id-inner on id-inner container`);
  }
  if (!html.includes('mod-demo-profile-actions')) {
    fail(`${rel}: profile lookup actions row must include mod-demo-profile-actions (Sky master)`);
  }
  for (const { re, label } of FORBIDDEN_HTML_PATTERNS) {
    if (label && re.test(html)) fail(`${rel}: ${label}`);
  }
}

for (const rel of SITE_CLONE_DEMO_JS) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    fail(`Missing site-clone demo JS: ${rel}`);
    continue;
  }
  const js = fs.readFileSync(abs, 'utf8');
  if (!/hideTagsCompanyUi:\s*true/.test(js)) {
    fail(`${rel}: DemoTagsInjection.init must set hideTagsCompanyUi: true`);
  }
  if (/injectButtonId:\s*['"]injectSdkBtn['"]/.test(js)) {
    fail(`${rel}: injectButtonId must be prefixed ({prefix}InjectSdkBtn), not injectSdkBtn`);
  }
  if (!/initLabDemoEnvBar\s*\(/.test(js)) {
    fail(`${rel}: must call initLabDemoEnvBar({ prefix: ... }) from shared/demo-env-bar-bootstrap.js`);
  }
  if (/AepDemoEnvStrip\.initStandardEnvBar\s*\(/.test(js)) {
    fail(`${rel}: must not call AepDemoEnvStrip.initStandardEnvBar directly — use initLabDemoEnvBar`);
  }
}

for (const cssFile of walkCss(pv)) {
  const rel = path.relative(pv, cssFile);
  if (CSS_DRIFT_ALLOWLIST.has(rel)) continue;
  const text = fs.readFileSync(cssFile, 'utf8');
  for (const { re, label } of FORBIDDEN_CSS_PATTERNS) {
    if (re.test(text)) fail(`${rel}: ${label}`);
  }
}

const stripJs = fs.readFileSync(path.join(pv, 'shared/demo-env-strip.js'), 'utf8');
if (!stripJs.includes('mod-demo-tags-company-row" hidden')) {
  fail('shared/demo-env-strip.js: Tags company row must include hidden attribute');
}

const bundleCss = read(BUNDLE_CSS);
if (!bundleCss.includes("@import url('../aep-demo-env-bar.css')")) {
  fail(`${BUNDLE_CSS}: must @import aep-demo-env-bar.css`);
}
if (!bundleCss.includes("@import url('../site-clone-bc-env-strip.css')")) {
  fail(`${BUNDLE_CSS}: must @import site-clone-bc-env-strip.css`);
}

const bootstrapJs = read(BUNDLE_BOOTSTRAP);
if (!bootstrapJs.includes('initLabDemoEnvBar')) {
  fail(`${BUNDLE_BOOTSTRAP}: must export window.initLabDemoEnvBar`);
}

const stripCss = fs.readFileSync(path.join(pv, 'site-clone-bc-env-strip.css'), 'utf8');
if (!stripCss.includes('.mod-demo-tags-company-row')) {
  fail('site-clone-bc-env-strip.css: missing global .mod-demo-tags-company-row hide rule');
}

const envBarJs = read('aep-demo-env-bar.js');
if (!envBarJs.includes('launchScriptNotSet')) {
  fail('aep-demo-env-bar.js: must keep env editor expanded when Launch script is not set');
}

const envBarCss = read('aep-demo-env-bar.css');
if (!/\.aep-demo-id-inner\s+\.mod-demo-profile-actions/.test(envBarCss)) {
  fail('aep-demo-env-bar.css: missing .aep-demo-id-inner .mod-demo-profile-actions (Sky master profile lookup row)');
}

if (failed) {
  process.exit(1);
}
console.log('verify-demo-env-strip: OK (Sky master — unified bundle + bootstrap, no env strip drift detected)');
