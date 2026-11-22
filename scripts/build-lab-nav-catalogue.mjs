#!/usr/bin/env node
/**
 * Writes functions/labNavCatalogue.json from the sidebar NAV in
 * web/profile-viewer/aep-lab-nav.js so the usage route allowlist and heat map
 * labels follow the nav automatically.
 *
 * Usage:
 *   node scripts/build-lab-nav-catalogue.mjs           # regenerate
 *   node scripts/build-lab-nav-catalogue.mjs --check   # exit 1 when stale (CI)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogue } from './lab-nav-catalogue.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(repoRoot, 'functions/labNavCatalogue.json');
const output = JSON.stringify(buildCatalogue(repoRoot), null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (current !== output) {
    console.error('[lab-nav-catalogue] functions/labNavCatalogue.json is stale. Run: npm run build:lab-nav-catalogue');
    process.exit(1);
  }
  console.log('[lab-nav-catalogue] up to date');
} else {
  writeFileSync(target, output, 'utf8');
  const pages = JSON.parse(output).pages;
  console.log(`[lab-nav-catalogue] wrote ${pages.length} pages (${pages.filter((p) => p.tracked).length} tracked)`);
}
