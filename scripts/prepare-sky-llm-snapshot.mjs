/**
 * Prepares the saved Adobe LLM Optimizer HTML for Sky hosting (overview snapshot).
 * Run after copying assets into web/profile-viewer/sky-llm-snapshot/assets/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcHtml =
  process.env.SKY_LLM_SOURCE_HTML ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe LLM Optimizer.html');
const outDir = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot');
const outHtml = path.join(outDir, 'overview.html');

if (!fs.existsSync(srcHtml)) {
  console.error('Source HTML not found:', srcHtml);
  process.exit(1);
}

let html = fs.readFileSync(srcHtml, 'utf8');

html = html.replace(/\.\/Adobe LLM Optimizer_files\//g, './assets/');
html = html.replace(/\.download/g, '');

// Drop scripts that re-auth, re-hydrate, or phone home — keep pre-rendered #root DOM + CSS.
html = html.replace(/<script[^>]*src="\.\/assets\/rum-standalone\.js"[^>]*><\/script>/gi, '');
html = html.replace(/<script[^>]*src="\.\/assets\/adobe-ims\.[^"]+"[^>]*><\/script>/gi, '');
html = html.replace(/<script[^>]*src="\.\/assets\/auth\.[^"]+"[^>]*><\/script>/gi, '');
html = html.replace(/<script[^>]*src="\.\/assets\/vendor\.[^"]+"[^>]*><\/script>/gi, '');
html = html.replace(/<script[^>]*src="\.\/assets\/main\.[^"]+"[^>]*><\/script>/gi, '');
html = html.replace(/<script[^>]*src="\.\/assets\/launch-[^"]+"[^>]*><\/script>/gi, '');
html = html.replace(/<script[^>]*src="\.\/assets\/RC[^"]+"[^>]*><\/script>/gi, '');
html = html.replace(/<script>window\.SAMPLE_PAGEVIEWS_AT_RATE[^<]*<\/script>/i, '');

// Site property (saved WKND tenant URL in the Site combobox).
html = html.replace(/wknd-site-internal[^<"]*/gi, 'sky.com');
html = html.replace(/wknd\.enablementadobe\.com/gi, 'sky.com');
html = html.replace(/wknd-site-content-man[^<"]*/gi, 'sky.com');

// Market comparison Y-axis labels (saved export uses WKND tenant competitors).
const axisLabelReplacements = [
  ['Adobe', 'Sky'],
  ['WKND', 'Virgin Media'],
  ['Automattic', 'BT'],
  ['Contentful', 'TalkTalk'],
  ['Global', 'Netflix'],
  ['AEM', 'Disney+'],
];
for (const [from, to] of axisLabelReplacements) {
  html = html.replace(new RegExp(`(<text[^>]*>)\\s*${from}\\s*(</text>)`, 'gi'), `$1${to}$2`);
  html = html.replace(new RegExp(`>(\\s*)${from}(\\s*)<`, 'g'), `>$1${to}$2<`);
}
// Recharts axis ticks sometimes escape the patterns above.
html = html.split('WKND').join('Virgin Media');

const snapshotScripts = [
  '<link rel="stylesheet" href="./sky-llm-snapshot-platform.css">',
  '<script src="./sky-llm-snapshot-nav.js"></script>',
  '<script src="./sky-llm-snapshot-patch.js"></script>',
  '<script src="./sky-llm-snapshot-platform.js"></script>',
  '<script src="./sky-llm-snapshot-market.js"></script>',
].join('\n');
if (!html.includes('sky-llm-snapshot-platform.js')) {
  html = html.replace('</body>', `${snapshotScripts}\n</body>`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outHtml, html, 'utf8');
console.log('Wrote', outHtml, '(' + Math.round(html.length / 1024) + ' KB)');
