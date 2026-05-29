/**
 * Prepares Opportunities saved HTML + copies Op assets into sky-llm-snapshot/assets/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOpportunitiesBranding } from './sky-llm-snapshot-sky-text.mjs';
import { stripLineDash, repairRechartsResponsiveHtml } from './sky-llm-snapshot-line-dash.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcHtml =
  process.env.SKY_LLM_OP_SOURCE_HTML ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe LLM Optimizer Op 2.html');
const srcAssetsDir =
  process.env.SKY_LLM_OP_SOURCE_ASSETS ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe LLM Optimizer Op 2_files');
const outDir = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot');
const assetsDir = path.join(outDir, 'assets');
const outHtml = path.join(outDir, 'opportunities.html');

const SNAPSHOT_ASSETS = [
  '<link rel="stylesheet" href="./sky-llm-snapshot-nav.css">',
  '<link rel="stylesheet" href="./sky-llm-snapshot-platform.css">',
  '<link rel="stylesheet" href="./sky-llm-snapshot-market-charts.css">',
  '<script src="./sky-llm-snapshot-nav.js"></script>',
  '<script src="./sky-llm-snapshot-patch.js"></script>',
  '<script src="./sky-llm-snapshot-platform.js"></script>',
  '<script src="./sky-llm-snapshot-market.js"></script>',
].join('\n');

function stripAuthScripts(html) {
  html = html.replace(/<script[^>]*src="\.\/assets\/rum-standalone\.js"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/adobe-ims\.[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/auth\.[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/vendor\.[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/main\.[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/launch-[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/RC[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/index\.js"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/web-vitals[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script>window\.SAMPLE_PAGEVIEWS_AT_RATE[^<]*<\/script>/i, '');
  return html;
}

function copyAssets() {
  if (!fs.existsSync(srcAssetsDir)) {
    console.error('Source assets folder not found:', srcAssetsDir);
    process.exit(1);
  }
  fs.mkdirSync(assetsDir, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(srcAssetsDir)) {
    const src = path.join(srcAssetsDir, name);
    if (!fs.statSync(src).isFile()) continue;
    const base = name.replace(/\.download$/i, '');
    const dest = path.join(assetsDir, base);
    try {
      fs.copyFileSync(src, dest);
      n++;
    } catch (err) {
      console.warn('Skip asset (locked or unreadable):', base, err.code || err.message);
    }
  }
  console.log('Copied', n, 'asset files to', assetsDir);
}

function patchHtml(html) {
  html = html.replace(/\.\/Adobe LLM Optimizer Op 2_files\//g, './assets/');
  html = html.replace(/\.\/Adobe LLM Optimizer Op_files\//g, './assets/');
  html = html.replace(/\.\/Adobe LLM Optimizer URL_files\//g, './assets/');
  html = html.replace(/\.\/Adobe LLM Optimizer_files\//g, './assets/');
  html = html.replace(/\.download/g, '');
  html = stripAuthScripts(html);
  html = applyOpportunitiesBranding(html);
  html = stripLineDash(html);
  html = repairRechartsResponsiveHtml(html);
  html = html.replace(/<link rel="stylesheet" href="\.\/sky-llm-snapshot[^"]*">[\s\S]*?<script src="\.\/sky-llm-snapshot-market\.js"><\/script>/gi, '');
  html = html.replace(/<link rel="stylesheet" href="\.\/sky-llm-snapshot[^"]*">[\s\S]*?<script src="\.\/sky-llm-snapshot-platform\.js"><\/script>/gi, '');
  if (!html.includes('sky-llm-snapshot-nav.js')) {
    html = html.replace('</body>', `${SNAPSHOT_ASSETS}\n</body>`);
  }
  return html;
}

if (!fs.existsSync(srcHtml)) {
  console.error('Source HTML not found:', srcHtml);
  process.exit(1);
}

copyAssets();
let html = fs.readFileSync(srcHtml, 'utf8');
html = patchHtml(html);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outHtml, html, 'utf8');
console.log('Wrote', outHtml, '(' + Math.round(html.length / 1024) + ' KB)');
