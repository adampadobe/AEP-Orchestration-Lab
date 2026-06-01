#!/usr/bin/env node
/**
 * Guardrails: lab demo env strip must match Sky master (shared mount + CSS, no drift).
 * @see docs/demo-env-strip-standard.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pv = path.join(root, 'web/profile-viewer');

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

const FORBIDDEN_CSS_PATTERNS = [
  { re: /grid-template-columns:\s*1fr\s+300px/, label: 'legacy two-column env strip grid (use aep-demo-id-inner / Sky stacked layout)' },
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
  if (!html.includes('site-clone-bc-env-strip.css')) {
    fail(`${rel}: missing site-clone-bc-env-strip.css`);
  }
  if (!html.includes('aep-demo-id-inner')) {
    fail(`${rel}: missing aep-demo-id-inner on id-inner container`);
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
}

for (const cssFile of walkCss(pv)) {
  const rel = path.relative(pv, cssFile);
  if (rel === 'site-clone-bc-env-strip.css' || rel === 'aep-demo-env-bar.css') continue;
  const text = fs.readFileSync(cssFile, 'utf8');
  for (const { re, label } of FORBIDDEN_CSS_PATTERNS) {
    if (re.test(text)) fail(`${rel}: ${label}`);
  }
}

const stripJs = fs.readFileSync(path.join(pv, 'shared/demo-env-strip.js'), 'utf8');
if (!stripJs.includes('mod-demo-tags-company-row" hidden')) {
  fail('shared/demo-env-strip.js: Tags company row must include hidden attribute');
}

const stripCss = fs.readFileSync(path.join(pv, 'site-clone-bc-env-strip.css'), 'utf8');
if (!stripCss.includes('.mod-demo-tags-company-row')) {
  fail('site-clone-bc-env-strip.css: missing global .mod-demo-tags-company-row hide rule');
}

const envBarJs = read('aep-demo-env-bar.js');
if (!envBarJs.includes('launchScriptNotSet')) {
  fail('aep-demo-env-bar.js: must keep env editor expanded when Launch script is not set');
}

if (failed) {
  process.exit(1);
}
console.log('verify-demo-env-strip: OK (Sky master — no env strip drift detected)');
