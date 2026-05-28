/**
 * Prepares Brand Presence saved HTML + copies BP assets into sky-llm-snapshot/assets/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcHtml =
  process.env.SKY_LLM_BP_SOURCE_HTML ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe LLM Optimizer BP.html');
const srcAssetsDir =
  process.env.SKY_LLM_BP_SOURCE_ASSETS ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe LLM Optimizer BP_files');
const outDir = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot');
const assetsDir = path.join(outDir, 'assets');
const outHtml = path.join(outDir, 'brand-presence.html');

const SNAPSHOT_SCRIPTS = [
  '<link rel="stylesheet" href="./sky-llm-snapshot-nav.css">',
  '<link rel="stylesheet" href="./sky-llm-snapshot-platform.css">',
  '<link rel="stylesheet" href="./sky-llm-snapshot-market-charts.css">',
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
  html = html.replace(/wknd-site-content-man[^<"]*/gi, 'sky.com');

  const axisLabelReplacements = [
    ['Adobe', 'Sky'],
    ['WKND', 'Virgin Media'],
    ['Automattic', 'BT'],
    ['Contentful', 'TalkTalk'],
    ['Global', 'Netflix'],
    ['AEM', 'Disney+'],
    ['Wix', 'TalkTalk'],
    ['Webflow', 'Netflix'],
  ];
  for (const [from, to] of axisLabelReplacements) {
    html = html.replace(new RegExp(`(<text[^>]*>)\\s*${from}\\s*(</text>)`, 'gi'), `$1${to}$2`);
    html = html.replace(new RegExp(`>(\\s*)${from}(\\s*)<`, 'g'), `>$1${to}$2<`);
  }
  html = html.split('WKND').join('Virgin Media');

  html = html.replace(
    /(<path[^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*)\sstroke-dasharray="[^"]*"/g,
    '$1',
  );
  html = html.replace(
    /(<path[^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*)\sstroke-dashoffset="[^"]*"/g,
    '$1',
  );

  if (!html.includes('sky-llm-snapshot-market-charts.css')) {
    html = html.replace(
      '<link rel="stylesheet" href="./sky-llm-snapshot-platform.css">',
      '<link rel="stylesheet" href="./sky-llm-snapshot-market-charts.css">\n<link rel="stylesheet" href="./sky-llm-snapshot-platform.css">',
    );
  }

  if (!html.includes('sky-llm-snapshot-nav.js')) {
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
console.log('Wrote', outHtml, '(' + Math.round(html.length / 1024) + ' KB)');
