/**
 * Prepares Brand Claims saved HTML + copies BC assets into sky-llm-snapshot/assets/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcHtml =
  process.env.SKY_LLM_BC_SOURCE_HTML ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe LLM Optimizer BC.html');
const srcAssetsDir =
  process.env.SKY_LLM_BC_SOURCE_ASSETS ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe LLM Optimizer BC_files');
const outDir = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot');
const assetsDir = path.join(outDir, 'assets');
const outHtml = path.join(outDir, 'brand-claims.html');

const SNAPSHOT_ASSETS = [
  '<link rel="stylesheet" href="./sky-llm-snapshot-nav.css">',
  '<link rel="stylesheet" href="./sky-llm-snapshot-platform.css">',
  '<script src="./sky-llm-snapshot-nav.js"></script>',
  '<script src="./sky-llm-snapshot-patch.js"></script>',
  '<script src="./sky-llm-snapshot-platform.js"></script>',
  '<script src="./sky-llm-snapshot-market.js"></script>',
].join('\n');

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
    fs.copyFileSync(src, path.join(assetsDir, base));
    n++;
  }
  console.log('Copied', n, 'asset files to', assetsDir);
}

function patchHtml(html) {
  html = html.replace(/\.\/Adobe LLM Optimizer BC_files\//g, './assets/');
  html = html.replace(/\.\/Adobe LLM Optimizer BP_files\//g, './assets/');
  html = html.replace(/\.\/Adobe LLM Optimizer_files\//g, './assets/');
  html = html.replace(/\.download/g, '');

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

  html = html.replace(/wknd-site-internal[^<"]*/gi, 'sky.com');
  html = html.replace(/wknd\.enablementadobe\.com/gi, 'sky.com');
  html = html.replace(/frescos\.adobe-demo\.com/gi, 'sky.com');
  html = html.replace(/Prentice coffee/gi, 'Sky');
  html = html.replace(/Frescos coffee/gi, 'Sky');

  html = html.replace(/<link rel="stylesheet" href="\.\/sky-llm-snapshot[^"]*">[\s\S]*?<script src="\.\/sky-llm-snapshot-market\.js"><\/script>/gi, '');
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
