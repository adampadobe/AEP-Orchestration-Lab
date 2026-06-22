/**
 * Prepares Visibility Overview saved HTML + copies VO assets into llm-demo snapshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripLineDash, repairRechartsResponsiveHtml } from './sky-llm-snapshot-line-dash.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultAssetsDir = path.join(
  process.env.USERPROFILE || '',
  'Downloads',
  'Adobe Brand Visibility - Jun 08, 2026 VO_files',
);
const srcAssetsDir = process.env.LLM_DEMO_VO_SOURCE_ASSETS || defaultAssetsDir;

function findVoSourceHtml(assetsDir) {
  if (process.env.LLM_DEMO_VO_SOURCE_HTML && fs.existsSync(process.env.LLM_DEMO_VO_SOURCE_HTML)) {
    return process.env.LLM_DEMO_VO_SOURCE_HTML;
  }
  const preferred = path.join(assetsDir, 'assets(14).html');
  if (fs.existsSync(preferred)) return preferred;
  if (fs.existsSync(assetsDir)) {
    for (const name of fs.readdirSync(assetsDir)) {
      if (!name.endsWith('.html')) continue;
      const fp = path.join(assetsDir, name);
      const html = fs.readFileSync(fp, 'utf8');
      if (
        html.includes('Visibility Overview') &&
        html.includes('AI Visibility') &&
        html.includes('Mentions by model')
      ) {
        return fp;
      }
    }
  }
  return path.join(assetsDir, 'assets.html');
}

const srcHtml = findVoSourceHtml(srcAssetsDir);
const outDir = path.join(repoRoot, 'web', 'profile-viewer', 'demos', 'llm-demo', 'snapshot');
const assetsDir = path.join(outDir, 'assets');
const outHtml = path.join(outDir, 'visibility-overview.html');

const SNAPSHOT_SCRIPTS = [
  '<link rel="stylesheet" href="./llm-demo-snapshot-nav.css">',
  '<script src="./llm-demo-snapshot-build-id.js"></script>',
  '<script src="./llm-demo-snapshot-blockers.js"></script>',
  '<script src="./llm-demo-snapshot-opportunities-catalog.js"></script>',
  '<script src="./llm-demo-snapshot-nav.js"></script>',
  '<script src="./llm-demo-snapshot-patch.js"></script>',
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
  html = html.replace(/\.\/Adobe Brand Visibility - Jun 08, 2026 VO_files\//g, './assets/');
  html = html.replace(/\.\/assets\((\d+)\)/g, './assets($1)');
  html = html.replace(/href="\.\/assets"/g, 'href="./assets/index"');
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

  html = html.replace(/Adobe LLM Optimizer/gi, 'Adobe Brand Visibility');
  html = stripLineDash(html);
  html = repairRechartsResponsiveHtml(html);

  html = html.replace(/<\/body>\s*<div id="walnut-root-popin-element"[\s\S]*$/i, '</body>\n');
  html = html.replace(
    /<link rel="stylesheet" href="\.\/llm-demo-snapshot[^"]*">[\s\S]*?<script src="\.\/llm-demo-snapshot-market\.js"><\/script>/gi,
    '',
  );
  if (!html.includes('llm-demo-snapshot-nav.js')) {
    html = html.replace('</body>', `${SNAPSHOT_SCRIPTS}\n</body>`);
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
console.log('Source:', srcHtml);
console.log('Wrote', outHtml, '(' + Math.round(html.length / 1024) + ' KB)');
