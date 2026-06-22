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
const SPECTRUM_CSS = 'shared/demo-env-bar-spectrum.css';
const BUNDLE_BOOTSTRAP = 'shared/demo-env-bar-bootstrap.js';
const SPECTRUM_STRIP_JS = 'shared/demo-env-strip-spectrum.js';
const SPECTRUM_SYNC_JS = 'shared/demo-env-bar-spectrum-sync.js';
const ENV_BAR_JS = 'shared/env-bar.js';
const ENV_BAR_VERSIONS_JSON = 'shared/env-bar-versions.json';

let envBarVersions = null;
try {
  envBarVersions = JSON.parse(fs.readFileSync(path.join(pv, ENV_BAR_VERSIONS_JSON), 'utf8'));
} catch {
  envBarVersions = null;
}

const SPECTRUM_CACHE = envBarVersions?.assets?.demoEnvStrip ?? '20260623-spectrum';
const ENV_BAR_MANIFEST = envBarVersions?.manifestVersion ?? '20260612-env-bar';

/**
 * Redirect stubs — no env bar on page (target demo or canonical URL carries chrome).
 */
const ENV_BAR_REDIRECT_HTML = [
  'call-center-demo-apalmer.html',
  'mobile-demo.html',
  'mobile-demo-apalmer.html',
  'sky-llm-referral-traffic.html',
  'sky-llm-llm-response.html',
];

/** @deprecated — kept empty; all former exceptions migrated to shared/env-bar.js (Jun 2026). */
const ENV_STRIP_EXCEPTION_HTML = [];

const ENV_STRIP_EXCEPTION_BASENAME_RE = [];

const MINIMAL_ENV_BAR_HTML = [
  'sky-llm-brand-presence.html',
  'sky-llm-agentic-traffic.html',
  'sky-llm-opportunities.html',
  'sky-llm-url-inspector.html',
  'sky-llm-brand-claims.html',
  'sky-llm-prompts-management.html',
  'sky-llm-opportunity-workspace.html',
  'call-center-demo.html',
  'demos/llm-demo/llm-demo.html',
];

const SANDBOX_ONLY_ENV_BAR_HTML = [
  'fnb-demo.html',
  'fnb-business-banking.html',
  'fnb-business-accounts.html',
  'fnb-gold-business-thank-you.html',
  'fnb-platinum-business-thank-you.html',
  'call-centre-demo-v1.html',
];

const SITE_CLONE_DEMO_HTML = [
  'sky-demo.html',
  'jlr-demo.html',
  'mod-demo.html',
  'premier-inn-demo.html',
  'etihad-demo.html',
  'ksia-demo.html',
  'starbucks-demo.html',
  'admiral-demo.html',
  'navigator-global-demo.html',
  'race-for-life-demo.html',
  'donate-demo.html',
  'oldmutual-demo.html',
  'oldmutual-wealth.html',
  'oldmutual-insurance-for-business.html',
  'oldmutual-business-quote-thank-you.html',
  'saga-demo.html',
  'aviva-target-demo.html',
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
  'demos/ksia/ksia-lab-core.js',
  'demos/alshaya/starbucks/starbucks-lab-core.js',
  'admiral-demo.js',
  'navigator-global-demo.js',
  'race-for-life-demo.js',
  'donate-demo.js',
  'oldmutual-demo.js',
  'saga-demo.js',
  'demos/aviva-target/aviva-target-lab-core.js',
  'social/facebook-home-demo.js',
  'social/tiktok-demo.js',
  'ferrari-world-abu-dhabi-demo.js',
  'seaworld-abu-dhabi-demo.js',
  'wb-world-abu-dhabi-demo.js',
  'miral/miral-theme-parks-demo.js',
];

const MINIMAL_ENV_BAR_JS = [
  'sky-llm-optimizer.js',
  'call-center-demo.js',
  'call-center-demo-apalmer.js',
  'demos/llm-demo/llm-demo.js',
];

const SANDBOX_ONLY_ENV_BAR_JS = ['fnb-demo.js'];

/** Site-clone demos on shared/env-bar.js — must match SITE_CLONE_DEMO_HTML. @see docs/env-bar-shared-module.md */
const MIGRATED_TO_ENV_BAR_HTML = new Set(SITE_CLONE_DEMO_HTML);

/**
 * Spectrum site-clone shells exempt from static *-demo-top-anchor in HTML (anchor injected at runtime).
 * @see shared/env-bar-compact.js findTopAnchor()
 */
const DEMO_TOP_ANCHOR_EXCEPTION_HTML = new Set([]);

/** Matches mod-demo-top-anchor or {prefix}-demo-top-anchor in HTML class attributes. */
const DEMO_TOP_ANCHOR_CLASS_RE = /(?:mod-demo-top-anchor|[\w-]+-demo-top-anchor)/;

/** Demo JS that delegates env bar init to shared/env-bar.js */
const MIGRATED_ENV_BAR_JS = new Set(SITE_CLONE_DEMO_JS);

const CSS_DRIFT_ALLOWLIST = new Set([
  'aep-demo-env-bar.css',
  'site-clone-bc-env-strip.css',
  BUNDLE_CSS,
  'site-clone-bc.css',
  'shared/demo-env-bar-spectrum.css',
  'shared/env-bar-compact.css',
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

/** Loader-only scripts — migrated demos must not preload these (env-bar.js loads them). */
const FORBIDDEN_LOADER_SCRIPT_BASENAMES = [
  'demo-env-strip.js',
  'aep-demo-env-bar.js',
  'demo-env-bar-bootstrap.js',
  'site-clone-bc-env.js',
  'env-bar-compact.js',
];

function htmlHasForbiddenLoaderScript(html) {
  for (const base of FORBIDDEN_LOADER_SCRIPT_BASENAMES) {
    if (new RegExp('<script[^>]+src="[^"]*' + base.replace(/\./g, '\\.') + '"', 'i').test(html)) {
      return base;
    }
  }
  return null;
}

let failed = false;

function fail(msg) {
  console.error(msg);
  failed = true;
}

function read(rel) {
  return fs.readFileSync(path.join(pv, rel), 'utf8');
}

function isEnvBarRedirect(rel) {
  return ENV_BAR_REDIRECT_HTML.includes(rel.replace(/\\/g, '/'));
}

function isEnvStripException(rel) {
  return isEnvBarRedirect(rel);
}

function envBarHrefFor(rel) {
  return rel.includes('/') ? '../shared/env-bar.js' : 'shared/env-bar.js';
}

function walkJs(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') walkJs(abs, out);
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(path.relative(pv, abs).replace(/\\/g, '/'));
  }
  return out;
}

function walkHtml(dir, out = [], skipDirs = new Set(['node_modules', 'sky-llm-snapshot'])) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!skipDirs.has(ent.name)) walkHtml(abs, out, skipDirs);
    } else if (ent.isFile() && ent.name.endsWith('.html') && !ent.name.startsWith('sky-llm-snapshot')) {
      out.push(path.relative(pv, abs).replace(/\\/g, '/'));
    }
  }
  return out;
}

function walkCss(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') walkCss(abs, out);
    else if (ent.isFile() && ent.name.endsWith('.css') && !ent.name.startsWith('sky-llm-snapshot')) out.push(abs);
  }
  return out;
}

for (const rel of ENV_STRIP_EXCEPTION_HTML) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    fail(`Env strip exception listed but missing: ${rel}`);
  }
}

for (const rel of MINIMAL_ENV_BAR_HTML) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    fail(`Missing minimal env bar HTML: ${rel}`);
    continue;
  }
  const html = read(rel);
  const envBarHref = envBarHrefFor(rel);
  if (!html.includes(envBarHref)) {
    fail(`${rel}: minimal demo must load ${ENV_BAR_JS}`);
  }
  if (!html.includes(`env-bar.js?v=${ENV_BAR_MANIFEST}`)) {
    fail(`${rel}: env-bar.js cache bust must be ?v=${ENV_BAR_MANIFEST}`);
  }
  if (!html.includes('envBarConfig')) {
    fail(`${rel}: minimal demo must set window.envBarConfig`);
  }
  if (!html.includes('data-demo-env-strip-mount="site-clone-minimal"')) {
    fail(`${rel}: minimal demo must use site-clone-minimal mount`);
  }
  if (html.includes('id="aepDemoEnvSection"') && html.includes('data-demo-env-strip-mount="site-clone-minimal"')) {
    fail(`${rel}: inline aepDemoEnvSection with site-clone-minimal — env bar must be JS-mounted only`);
  }
  if (/href="[^"]*\/aep-demo-env-bar\.css/.test(html) || /href="aep-demo-env-bar\.css/.test(html)) {
    fail(`${rel}: must not load aep-demo-env-bar.css directly — use ${ENV_BAR_JS}`);
  }
  if (html.includes('aep-demo-env-bar.js') && !html.includes('shared/env-bar.js')) {
    fail(`${rel}: must not load aep-demo-env-bar.js directly — use ${ENV_BAR_JS}`);
  }
}

for (const rel of SANDBOX_ONLY_ENV_BAR_HTML) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    fail(`Missing sandbox-only env bar HTML: ${rel}`);
    continue;
  }
  const html = read(rel);
  const envBarHref = envBarHrefFor(rel);
  if (!html.includes(envBarHref)) {
    fail(`${rel}: sandbox-only demo must load ${ENV_BAR_JS}`);
  }
  if (!html.includes('data-demo-env-strip-mount="site-clone-sandbox-only"')) {
    fail(`${rel}: sandbox-only demo must use site-clone-sandbox-only mount`);
  }
  if (/href="[^"]*\/aep-demo-env-bar\.css/.test(html) || /href="aep-demo-env-bar\.css/.test(html)) {
    fail(`${rel}: must not load aep-demo-env-bar.css directly — use ${ENV_BAR_JS}`);
  }
}

for (const rel of walkHtml(pv)) {
  if (isEnvStripException(rel) || SITE_CLONE_DEMO_HTML.includes(rel)) continue;
  if (MINIMAL_ENV_BAR_HTML.includes(rel) || SANDBOX_ONLY_ENV_BAR_HTML.includes(rel)) continue;
  const html = read(rel);
  if (/href="[^"]*\/aep-demo-env-bar\.css/.test(html) || /href="aep-demo-env-bar\.css/.test(html)) {
    fail(`${rel}: must not load aep-demo-env-bar.css directly — use shared/env-bar.js`);
  }
  if (html.includes('id="aepDemoEnvSection"') && !html.includes('data-demo-env-strip-mount')) {
    fail(`${rel}: inline aepDemoEnvSection without env-bar mount — use shared/env-bar.js`);
  }
  if (html.includes('data-demo-env-strip-mount="site-clone-tags"') && !html.includes('data-demo-env-strip-mount="site-clone-shell"')) {
    fail(`${rel}: site-clone-tags mount without site-clone-shell — use centralized env bar`);
  }
}

for (const rel of SITE_CLONE_DEMO_HTML) {
  if (isEnvStripException(rel)) {
    fail(`Site-clone demo must not be on env-strip exception allowlist: ${rel}`);
  }
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    fail(`Missing site-clone demo HTML: ${rel}`);
    continue;
  }
  const html = fs.readFileSync(abs, 'utf8');
  if (!html.includes('data-demo-env-strip-mount="site-clone-shell"')) {
    fail(`${rel}: missing data-demo-env-strip-mount="site-clone-shell" (centralized env bar)`);
  }
  if (html.includes('data-demo-env-strip-mount="site-clone-tags"') && !html.includes('data-demo-env-strip-mount="site-clone-shell"')) {
    fail(`${rel}: legacy site-clone-tags mount without site-clone-shell — run node scripts/migrate-demo-env-shell.mjs`);
  }
  if (html.includes('id="aepDemoEnvSection"') && html.includes('data-demo-env-strip-mount="site-clone-shell"')) {
    fail(`${rel}: inline aepDemoEnvSection with site-clone-shell — env bar must be JS-mounted only`);
  }
  if (!html.includes('data-demo-env-strip-variant="spectrum"')) {
    fail(`${rel}: missing data-demo-env-strip-variant="spectrum" (Sky canonical env bar)`);
  }
  if (!html.includes('data-demo-env-strip-title=')) {
    fail(`${rel}: missing data-demo-env-strip-title (Spectrum status bar header)`);
  }
  if (!html.includes('data-demo-env-strip-subtitle="Active Configuration"')) {
    fail(`${rel}: missing data-demo-env-strip-subtitle="Active Configuration"`);
  }
  if (!html.includes('data-demo-env-strip-bc-bottom="1"')) {
    fail(`${rel}: missing data-demo-env-strip-bc-bottom="1" (Centre bottom display mode)`);
  }

  const migrated = MIGRATED_TO_ENV_BAR_HTML.has(rel);
  if (!migrated) {
    fail(`${rel}: site-clone demo must use ${ENV_BAR_JS} — add to SITE_CLONE_DEMO_HTML migration`);
  }
  const envBarHref = rel.includes('/') ? `../${ENV_BAR_JS}` : ENV_BAR_JS;
  if (!html.includes(envBarHref)) {
    fail(`${rel}: migrated demo must load ${ENV_BAR_JS} (shared env bar loader)`);
  }
  if (!html.includes(`env-bar.js?v=${ENV_BAR_MANIFEST}`)) {
    fail(`${rel}: env-bar.js cache bust must be ?v=${ENV_BAR_MANIFEST} (from ${ENV_BAR_VERSIONS_JSON})`);
  }
  if (!html.includes('envBarConfig')) {
    fail(`${rel}: migrated demo must set window.envBarConfig`);
  }
  if (html.includes('shared/demo-env-strip.js') || html.includes(BUNDLE_BOOTSTRAP)) {
    fail(`${rel}: migrated demo must not load strip/bootstrap directly — use ${ENV_BAR_JS}`);
  }
  if (html.includes('demo-tags-injection.js') || html.includes('aep-demo-env-bar.js')) {
    fail(`${rel}: migrated demo must not load Tags/env-bar scripts directly — ${ENV_BAR_JS} loads them`);
  }
  const forbiddenScript = htmlHasForbiddenLoaderScript(html);
  if (forbiddenScript) {
    fail(`${rel}: migrated demo must not preload ${forbiddenScript} — ${ENV_BAR_JS} loads the chain`);
  }
  const bundleCssHref = rel.includes('/') ? `../${BUNDLE_CSS}` : BUNDLE_CSS;
  const spectrumCssHref = rel.includes('/') ? `../${SPECTRUM_CSS}` : SPECTRUM_CSS;
  if (html.includes(bundleCssHref) || html.includes(spectrumCssHref)) {
    fail(`${rel}: migrated demo must not link env bar CSS directly — ${ENV_BAR_JS} loads bundle + spectrum`);
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
  if (!html.includes('mod-demo-profile-actions') && !html.includes('data-demo-env-strip-mount="site-clone-shell"')) {
    fail(`${rel}: profile lookup actions row must include mod-demo-profile-actions or site-clone-shell mount`);
  }
  for (const { re, label } of FORBIDDEN_HTML_PATTERNS) {
    if (label && re.test(html)) fail(`${rel}: ${label}`);
  }
  if (!DEMO_TOP_ANCHOR_EXCEPTION_HTML.has(rel) && !DEMO_TOP_ANCHOR_CLASS_RE.test(html)) {
    fail(
      `${rel}: missing *-demo-top-anchor wrapper (required for EnvBarCompact.init overlay — see shared/env-bar-compact.js)`,
    );
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
  const migratedJs = MIGRATED_ENV_BAR_JS.has(rel);
  if (!migratedJs) {
    fail(`${rel}: site-clone demo JS must integrate with window.envBar`);
  }
  if (/initLabDemoEnvBar\s*\(/.test(js)) {
    fail(`${rel}: migrated demo JS must not call initLabDemoEnvBar — use shared/env-bar.js`);
  }
  if (!/envBar/.test(js)) {
    fail(`${rel}: migrated demo JS must integrate with window.envBar (ready/registerTagsInjection)`);
  }
  if (/AepDemoEnvStrip\.initStandardEnvBar\s*\(/.test(js)) {
    fail(`${rel}: must not call AepDemoEnvStrip.initStandardEnvBar directly — use initLabDemoEnvBar`);
  }
}

for (const cssFile of walkCss(pv)) {
  const rel = path.relative(pv, cssFile).replace(/\\/g, '/');
  if (CSS_DRIFT_ALLOWLIST.has(rel)) continue;
  const text = fs.readFileSync(cssFile, 'utf8');
  for (const { re, label } of FORBIDDEN_CSS_PATTERNS) {
    if (re.test(text)) fail(`${rel}: ${label}`);
  }
}

for (const rel of MINIMAL_ENV_BAR_JS) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    fail(`Missing minimal env bar JS: ${rel}`);
    continue;
  }
  const js = fs.readFileSync(abs, 'utf8');
  if (/AepDemoEnvStrip\.initStandardEnvBar\s*\(/.test(js)) {
    fail(`${rel}: must not call AepDemoEnvStrip.initStandardEnvBar directly — use shared/env-bar.js`);
  }
  if (!/envBar/.test(js)) {
    fail(`${rel}: minimal demo JS must integrate with window.envBar.ready()`);
  }
}

const FORBIDDEN_INIT_STANDARD_ENV_BAR_JS = new Set([
  'aep-demo-env-bar.js',
  'shared/demo-env-bar-bootstrap.js',
  'shared/demo-env-strip.js',
  'shared/demo-env-strip-spectrum.js',
]);

for (const rel of walkJs(pv)) {
  if (FORBIDDEN_INIT_STANDARD_ENV_BAR_JS.has(rel)) continue;
  if (MIGRATED_ENV_BAR_JS.has(rel) || MINIMAL_ENV_BAR_JS.includes(rel) || SANDBOX_ONLY_ENV_BAR_JS.includes(rel)) continue;
  const js = fs.readFileSync(path.join(pv, rel), 'utf8');
  if (/AepDemoEnvStrip\.initStandardEnvBar\s*\(/.test(js)) {
    fail(`${rel}: must not call AepDemoEnvStrip.initStandardEnvBar outside env-bar loader — use shared/env-bar.js`);
  }
}

const stripJs = fs.readFileSync(path.join(pv, 'shared/demo-env-strip.js'), 'utf8');
if (!stripJs.includes('site-clone-minimal')) {
  fail('shared/demo-env-strip.js: must implement site-clone-minimal mount');
}
if (!stripJs.includes('site-clone-sandbox-only')) {
  fail('shared/demo-env-strip.js: must implement site-clone-sandbox-only mount');
}
if (!stripJs.includes('mod-demo-tags-company-row" hidden')) {
  fail('shared/demo-env-strip.js: Tags company row must include hidden attribute');
}
if (!stripJs.includes('site-clone-shell')) {
  fail('shared/demo-env-strip.js: must implement site-clone-shell mount');
}
if (!stripJs.includes('Adobe Target')) {
  fail('shared/demo-env-strip.js: Tags block must label Adobe Target datastream section');
}
if (!stripJs.includes('mod-demo-profile-actions')) {
  fail('shared/demo-env-strip.js: shell grid must include mod-demo-profile-actions row');
}

const bundleCss = read(BUNDLE_CSS);
if (!bundleCss.includes("@import url('../aep-demo-env-bar.css')")) {
  fail(`${BUNDLE_CSS}: must @import aep-demo-env-bar.css`);
}
if (!bundleCss.includes("@import url('../site-clone-bc-env-strip.css')")) {
  fail(`${BUNDLE_CSS}: must @import site-clone-bc-env-strip.css`);
}
if (!bundleCss.includes("@import url('env-bar-compact.css')")) {
  fail(`${BUNDLE_CSS}: must @import env-bar-compact.css`);
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

if (!envBarVersions || !envBarVersions.assets) {
  fail(`${ENV_BAR_VERSIONS_JSON}: missing or invalid version manifest`);
} else {
  const requiredAssets = [
    'bundleCss',
    'spectrumCss',
    'demoEnvStrip',
    'bootstrap',
    'tagsInjection',
    'aepDemoEnvBar',
  ];
  for (const key of requiredAssets) {
    if (!envBarVersions.assets[key]) {
      fail(`${ENV_BAR_VERSIONS_JSON}: missing assets.${key}`);
    }
  }
}

const sharedEnvBarJs = read(ENV_BAR_JS);
if (!sharedEnvBarJs.includes('window.envBar')) {
  fail(`${ENV_BAR_JS}: must expose window.envBar API`);
}
if (!sharedEnvBarJs.includes('initLabDemoEnvBar')) {
  fail(`${ENV_BAR_JS}: must delegate to initLabDemoEnvBar (no fork)`);
}
if (!sharedEnvBarJs.includes('reloadSDK')) {
  fail(`${ENV_BAR_JS}: must expose reloadSDK()`);
}
if (!sharedEnvBarJs.includes('/api/env-bar-config')) {
  fail(`${ENV_BAR_JS}: must fetch remote config via /api/env-bar-config`);
}

if (failed) {
  process.exit(1);
}
console.log(
  `verify-demo-env-strip: OK (${SITE_CLONE_DEMO_HTML.length} site-clone demos, ${MIGRATED_TO_ENV_BAR_HTML.size} on shared/env-bar.js, ${MINIMAL_ENV_BAR_HTML.length} minimal + ${SANDBOX_ONLY_ENV_BAR_HTML.length} sandbox-only, ${ENV_BAR_REDIRECT_HTML.length} redirect stubs, ${ENV_STRIP_EXCEPTION_HTML.length} legacy exceptions, no env strip drift)`,
);
