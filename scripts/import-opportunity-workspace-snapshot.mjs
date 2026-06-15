/**
 * One-off: import saved Adobe LLM Optimizer Opportunity Workspace HTML into sky-llm-snapshot.
 * Usage: node scripts/import-opportunity-workspace-snapshot.mjs [path-to.html]
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const srcHtml =
  process.argv[2] ||
  path.join(
    process.env.USERPROFILE || '',
    'Downloads',
    'Adobe LLM Optimizer Opportunity Workspace.html'
  );
const srcDir = path.join(path.dirname(srcHtml), 'Adobe LLM Optimizer Opportunity Workspace_files');
const assetsDir = path.join(repoRoot, 'web/profile-viewer/sky-llm-snapshot/assets');
const outHtml = path.join(repoRoot, 'web/profile-viewer/sky-llm-snapshot/opportunity-workspace.html');
const buildId = fs
  .readFileSync(path.join(repoRoot, 'web/profile-viewer/sky-llm-snapshot/sky-llm-snapshot-build-id.js'), 'utf8')
  .match(/'(\d{8})'/)?.[1];

if (!fs.existsSync(srcHtml)) {
  console.error('Source HTML not found:', srcHtml);
  process.exit(1);
}
if (!fs.existsSync(srcDir)) {
  console.error('Source _files folder not found:', srcDir);
  process.exit(1);
}
if (!buildId) {
  console.error('Could not read SKY_LLM_SNAPSHOT_BUILD');
  process.exit(1);
}

for (const name of fs.readdirSync(srcDir)) {
  const destName = name.replace(/\.download$/i, '');
  fs.copyFileSync(path.join(srcDir, name), path.join(assetsDir, destName));
}

let html = fs.readFileSync(srcHtml, 'utf8');
html = html.replace(/\.\/Adobe LLM Optimizer Opportunity Workspace_files\//g, './assets/');
html = html.replace(/\.download/g, '');
html = html.replace(
  /<title>[^<]*<\/title>/,
  '<title>Adobe LLM Optimizer</title>'
);

/** Frozen snapshots must not load the live SPA bundles (they replace #root and blank the page). */
html = html.replace(/<script>window\.SAMPLE_PAGEVIEWS_AT_RATE[^<]*<\/script>\s*/i, '');
html = html.replace(/<script defer="defer" src="\.\/assets\/[^"]+"><\/script>\s*/gi, '');

const inject = [
  `<link rel="stylesheet" href="./sky-llm-snapshot-nav.css?v=${buildId}">`,
  `<link rel="stylesheet" href="./sky-llm-snapshot-platform.css?v=${buildId}">`,
  `<link rel="stylesheet" href="./sky-llm-snapshot-opportunity-workspace.css?v=${buildId}">`,
  `<script src="./sky-llm-snapshot-build-id.js?v=${buildId}"></script>`,
  `<script src="./sky-llm-snapshot-blockers.js?v=${buildId}"></script>`,
  `<script src="./sky-llm-snapshot-nav.js?v=${buildId}"></script>`,
  `<script src="./sky-llm-snapshot-opportunity-workspace.js?v=${buildId}"></script>`,
  `<script src="./sky-llm-snapshot-patch.js?v=${buildId}"></script>`,
].join('\n');

const idx = html.indexOf('</body>');
if (idx >= 0) {
  html = html.slice(0, idx) + inject + '\n' + html.slice(idx);
} else {
  html = html.replace(/<\/html>\s*$/i, `${inject}\n</html>`);
}

fs.writeFileSync(outHtml, html);
console.log('Wrote', outHtml, `(${html.length} chars), build ${buildId}`);
