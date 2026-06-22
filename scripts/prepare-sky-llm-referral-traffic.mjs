/**
 * Prepares Referral Traffic saved HTML + copies RT assets into demos/llm-demo/snapshot/assets/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyReferralTrafficBranding } from './llm-demo-snapshot-sky-text.mjs';
import { stripLineDash, repairRechartsResponsiveHtml } from './llm-demo-snapshot-line-dash.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcHtml =
  process.env.SKY_LLM_RT_SOURCE_HTML ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Take a tour of Adobe LLM Optimizer - RT.html');
const srcAssetsDir =
  process.env.SKY_LLM_RT_SOURCE_ASSETS ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Take a tour of Adobe LLM Optimizer - RT_files');
const outDir = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot');
const assetsDir = path.join(outDir, 'assets');
const outHtml = path.join(outDir, 'referral-traffic.html');

const buildId = fs
  .readFileSync(path.join(outDir, 'llm-demo-snapshot-build-id.js'), 'utf8')
  .match(/'(\d{8})'/)?.[1];

if (!buildId) {
  console.error('Could not read LLM_DEMO_SNAPSHOT_BUILD');
  process.exit(1);
}

const SNAPSHOT_ASSETS = [
  `<link rel="stylesheet" href="./llm-demo-snapshot-nav.css?v=${buildId}">`,
  `<script src="./llm-demo-snapshot-build-id.js?v=${buildId}"></script>`,
  `<script src="./llm-demo-snapshot-blockers.js?v=${buildId}"></script>`,
  `<script src="./llm-demo-snapshot-opportunities-catalog.js?v=${buildId}"></script>`,
  `<script src="./llm-demo-snapshot-nav.js?v=${buildId}"></script>`,
  `<script src="./llm-demo-snapshot-patch.js?v=${buildId}"></script>`,
  `<script src="./llm-demo-snapshot-market.js?v=${buildId}"></script>`,
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
  html = html.replace(/<script defer="defer" src="\.\/assets\/[^"]+"><\/script>\s*/gi, '');
  html = html.replace(/<script defer="defer" src="\.\/Take a tour[^"]+"><\/script>\s*/gi, '');
  html = html.replace(/<script src="\.\/assets\/launch-[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script src="\.\/assets\/RC[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<style id="sr-loading-spinner-keyframes">[\s\S]*?<\/style>/gi, '');
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
  html = html.replace(/\.\/Take a tour of Adobe LLM Optimizer - RT_files\//g, './assets/');
  html = html.replace(/\.\/Take a tour of Adobe LLM Optimizer Agent_files\//g, './assets/');
  html = html.replace(/\.\/Adobe LLM Optimizer RT_files\//g, './assets/');
  html = html.replace(/\.download/g, '');
  html = stripAuthScripts(html);
  html = html.replace(/<title>Take a tour of Adobe LLM Optimizer<\/title>/i, '<title>Adobe LLM Optimizer</title>');
  html = html.replace(/href="https:\/\/play\.llmo\.now\/public\/favicon\.ico"/i, 'href="./assets/favicon.ico"');
  html = applyReferralTrafficBranding(html);
  html = stripLineDash(html);
  html = repairRechartsResponsiveHtml(html);
  html = html.replace(
    /<link rel="stylesheet" href="\.\/sky-llm-snapshot[^"]*">[\s\S]*?<script src="\.\/llm-demo-snapshot-market\.js[^"]*"><\/script>/gi,
    '',
  );
  html = html.replace(
    /<script src="\.\/llm-demo-snapshot-build-id\.js[^"]*"><\/script>[\s\S]*?<script src="\.\/llm-demo-snapshot-market\.js[^"]*"><\/script>/gi,
    '',
  );
  const idx = html.indexOf('</body>');
  if (idx >= 0) {
    html = html.slice(0, idx) + SNAPSHOT_ASSETS + '\n' + html.slice(idx);
  } else {
    html = html.replace(/<\/html>\s*$/i, `${SNAPSHOT_ASSETS}\n</html>`);
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
console.log('Wrote', outHtml, '(' + Math.round(html.length / 1024) + ' KB), build', buildId);

execSync('node scripts/sync-sky-llm-nav.mjs', {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    SKY_LLM_NEW_OVERVIEW_HTML: path.join(outDir, 'overview.html'),
  },
});
console.log('Synced sidebar nav from overview.html');
