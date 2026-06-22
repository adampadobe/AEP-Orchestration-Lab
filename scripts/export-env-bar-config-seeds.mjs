#!/usr/bin/env node
/**
 * Derive Firestore envBarConfigs seed JSON from site-clone demo HTML envBarConfig patterns.
 * Writes scripts/env-bar-config-seeds/{docId}.json (one doc per unique prefix).
 *
 * Usage: node scripts/export-env-bar-config-seeds.mjs [--write]
 *   --write   Write JSON files (default: dry-run to stdout)
 *
 * @see scripts/seed-env-bar-configs.mjs
 * @see scripts/verify-demo-env-strip.mjs SITE_CLONE_DEMO_HTML
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PV = path.join(ROOT, 'web/profile-viewer');
const SEEDS_DIR = path.join(__dirname, 'env-bar-config-seeds');

const require = createRequire(path.join(__dirname, '../functions/package.json'));
const { docId } = require('../functions/envBarConfigStore');

/** Align with scripts/verify-demo-env-strip.mjs */
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

/** Remote defaults not fully expressed in static HTML. */
const SEED_OVERRIDES = {
  sky: {
    features: { webPush: true, bc: true, decisioning: true },
    decisioning: { mountLayoutPreset: 'sky-home' },
  },
  ksia: {
    mode: 'journey',
    storagePrefix: 'ksia',
    features: { webPush: true, bc: true, decisioning: true },
    labCoreScript: 'demos/ksia/ksia-lab-core.js',
    iframeIds: ['ksiaSiteFrame'],
  },
  starbucks: {
    storagePrefix: 'starbucks',
    features: { webPush: true, bc: true, decisioning: true },
    labCoreScript: 'demos/alshaya/starbucks/starbucks-lab-core.js',
    iframeIds: ['starbucksSiteFrame'],
  },
  race: {
    features: { webPush: true, bc: true, decisioning: true },
    decisioning: {
      useParentDocument: true,
      viewName: 'Race for Life',
      mountLayoutPreset: 'generic',
    },
  },
  avivatarget: {
    features: { webPush: true, bc: true, decisioning: true },
    iframeIds: ['avivaTargetFrame'],
  },
  om: {
    siteCloneDemoEnv: {
      storagePrefix: 'oldMutualPersonal',
      webPushBySandboxKey: 'oldMutualPersonalWebPushOnInjectBySandbox',
      webPushLegacyKey: 'oldMutualPersonalWebPushOnInjectToggle',
      webPushToggleId: 'omWebPushOnInjectToggle',
      bcOnInjectToggleId: 'omBcOnInjectToggle',
      bcStyleSelectId: 'omBcStyleSelect',
    },
  },
  premierinn: {
    iframeIds: ['premierInnSiteFrame'],
  },
  admiral: { iframeIds: ['admiralSiteFrame'] },
  etihad: { iframeIds: ['etihadSiteFrame'] },
  navigator: { iframeIds: ['navigatorDemoSiteFrame'] },
  jlr: { iframeIds: ['jlrSiteFrame'] },
  mod: { iframeIds: ['modSiteFrame'] },
  saga: { iframeIds: ['sagaSiteFrame'] },
  facebookhome: { iframeIds: [] },
  ferrariworld: { iframeIds: [] },
  seaworld: { iframeIds: [] },
  wbworld: { iframeIds: [] },
  tiktok: { iframeIds: [] },
};

function parseObjectLiteral(src) {
  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${src});`)();
  } catch {
    return null;
  }
}

function extractEnvBarConfig(html) {
  const m = html.match(/window\.envBarConfig\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return null;
  return parseObjectLiteral(m[1]);
}

function extractSiteCloneDemoEnv(html) {
  const block = html.match(/window\.SiteCloneDemoEnv\s*=\s*(\{[\s\S]*?\});/);
  if (block) {
    const parsed = parseObjectLiteral(block[1]);
    if (parsed) return parsed;
  }
  const iife = html.match(/window\.SiteCloneDemoEnv\s*=\s*\(\s*function\s*\(\)\s*\{[\s\S]*?return\s*(\{[\s\S]*?\});[\s\S]*?\}\s*\)\(\)/);
  if (iife) return parseObjectLiteral(iife[1]);
  return null;
}

function extractIframeId(html) {
  const m = html.match(/SiteCloneBcPage\s*=\s*\{[^}]*iframeId:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

function deepMerge(base, patch) {
  if (!patch) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function buildSeed(prefix, htmlConfig, siteCloneDemoEnv, iframeId) {
  const id = docId(prefix);
  const features = htmlConfig?.features || { webPush: true, bc: true, decisioning: false };
  if (features.decisioning === undefined) features.decisioning = false;

  const seed = {
    demoId: id,
    prefix: htmlConfig?.prefix || prefix,
    defaultSandbox: 'apalmer',
    variant: htmlConfig?.variant || 'spectrum',
    mode: htmlConfig?.mode || 'shell',
    features,
    siteCloneDemoEnv: siteCloneDemoEnv || undefined,
  };

  if (htmlConfig?.storagePrefix) seed.storagePrefix = htmlConfig.storagePrefix;
  if (htmlConfig?.decisioning) seed.decisioning = htmlConfig.decisioning;
  if (htmlConfig?.labCoreScript) seed.labCoreScript = htmlConfig.labCoreScript;

  if (iframeId) seed.iframeIds = [iframeId];
  else if (htmlConfig?.iframeIds) seed.iframeIds = htmlConfig.iframeIds;

  return deepMerge(seed, SEED_OVERRIDES[id]);
}

function collectSeeds() {
  const byPrefix = new Map();

  for (const rel of SITE_CLONE_DEMO_HTML) {
    const abs = path.join(PV, rel);
    if (!fs.existsSync(abs)) {
      console.error(`Missing: ${rel}`);
      continue;
    }
    const html = fs.readFileSync(abs, 'utf8');
    const htmlConfig = extractEnvBarConfig(html);
    if (!htmlConfig?.prefix) {
      console.error(`No envBarConfig.prefix in ${rel}`);
      continue;
    }
    const prefix = htmlConfig.prefix;
    const id = docId(prefix);
    const siteCloneDemoEnv = extractSiteCloneDemoEnv(html);
    const iframeId = extractIframeId(html);
    const seed = buildSeed(prefix, htmlConfig, siteCloneDemoEnv, iframeId);
    byPrefix.set(id, seed);
  }

  return [...byPrefix.values()].sort((a, b) => a.demoId.localeCompare(b.demoId));
}

const write = process.argv.includes('--write');
const seeds = collectSeeds();

if (!write) {
  console.log(JSON.stringify(seeds, null, 2));
  console.error(`\n${seeds.length} seeds (dry-run). Pass --write to update ${SEEDS_DIR}/`);
  process.exit(0);
}

fs.mkdirSync(SEEDS_DIR, { recursive: true });
for (const seed of seeds) {
  const outPath = path.join(SEEDS_DIR, `${seed.demoId}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`✓ ${outPath}`);
}
console.log(`Wrote ${seeds.length} seed files.`);
