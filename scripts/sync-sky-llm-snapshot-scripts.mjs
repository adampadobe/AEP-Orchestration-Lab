/**
 * Normalize llm-demo snapshot *.html script tags: build-id + blockers first, cache-bust lab JS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapDir = path.join(repoRoot, 'web', 'profile-viewer', 'demos', 'llm-demo', 'snapshot');
const buildIdPath = path.join(snapDir, 'llm-demo-snapshot-build-id.js');
const buildMatch = fs.readFileSync(buildIdPath, 'utf8').match(/LLM_DEMO_SNAPSHOT_BUILD\s*=\s*'([^']+)'/);
const BUILD = buildMatch ? buildMatch[1] : '20260621';
const v = '?v=' + BUILD;

const WALNUT_PAGE_SCRIPTS = [
  '<link rel="stylesheet" href="./llm-demo-snapshot-nav.css' + v + '">',
  '<link rel="stylesheet" href="./llm-demo-snapshot-platform.css' + v + '">',
  '<script src="./llm-demo-snapshot-build-id.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-blockers.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-opportunities-catalog.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-nav.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-patch.js' + v + '"></script>',
];

const PROMPTS_MANAGEMENT_SCRIPTS = WALNUT_PAGE_SCRIPTS.concat([
  '<link rel="stylesheet" href="./llm-demo-snapshot-intent-coverage.css' + v + '">',
  '<script src="./llm-demo-snapshot-prompts-management.js' + v + '"></script>',
]);

const INTENT_OVERLAY_SCRIPTS = [
  '<link rel="stylesheet" href="./llm-demo-snapshot-intent-coverage-overlay.css' + v + '">',
  '<script src="./llm-demo-snapshot-build-id.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-blockers.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-intent-coverage-overlay.js' + v + '"></script>',
];

const PAGE_SCRIPTS = {
  'overview.html': [
    '<link rel="stylesheet" href="./llm-demo-snapshot-nav.css' + v + '">',
    '<link rel="stylesheet" href="./llm-demo-snapshot-platform.css' + v + '">',
    '<script src="./llm-demo-snapshot-build-id.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-blockers.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-opportunities-catalog.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-nav.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-platform.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-overview.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-patch.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-market.js' + v + '"></script>',
  ],
  'brand-presence.html': [
    '<link rel="stylesheet" href="./llm-demo-snapshot-nav.css' + v + '">',
    '<link rel="stylesheet" href="./llm-demo-snapshot-platform.css' + v + '">',
    '<link rel="stylesheet" href="./llm-demo-snapshot-market-charts.css' + v + '">',
    '<script src="./llm-demo-snapshot-build-id.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-blockers.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-opportunities-catalog.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-nav.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-platform.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-patch.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-market.js' + v + '"></script>',
  ],
  'visibility-overview.html': WALNUT_PAGE_SCRIPTS,
  'prompt-research.html': WALNUT_PAGE_SCRIPTS,
  'market-comparison.html': WALNUT_PAGE_SCRIPTS,
  'prompts-management.html': PROMPTS_MANAGEMENT_SCRIPTS,
  'intent-coverage-overlay.html': INTENT_OVERLAY_SCRIPTS,
  'opportunities.html': [
    '<link rel="stylesheet" href="./llm-demo-snapshot-nav.css' + v + '">',
    '<link rel="stylesheet" href="./llm-demo-snapshot-platform.css' + v + '">',
    '<link rel="stylesheet" href="./llm-demo-snapshot-market-charts.css' + v + '">',
    '<link rel="stylesheet" href="./llm-demo-snapshot-opportunities.css' + v + '">',
    '<script src="./llm-demo-snapshot-build-id.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-blockers.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-opportunities-catalog.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-nav.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-opportunity-details.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-opportunities.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-patch.js' + v + '"></script>',
    '<script src="./llm-demo-snapshot-market.js' + v + '"></script>',
  ],
};

const DEFAULT_SCRIPTS = [
  '<link rel="stylesheet" href="./llm-demo-snapshot-nav.css' + v + '">',
  '<script src="./llm-demo-snapshot-build-id.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-blockers.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-opportunities-catalog.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-nav.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-patch.js' + v + '"></script>',
  '<script src="./llm-demo-snapshot-market.js' + v + '"></script>',
];

const blockWithLinksRe =
  /<link rel="stylesheet" href="\.\/llm-demo-snapshot[^"]*">[\s\S]*?<script src="\.\/llm-demo-snapshot-market\.js[^"]*"><\/script>/i;
const blockScriptsOnlyRe =
  /<script src="\.\/llm-demo-snapshot-build-id\.js[^"]*"><\/script>[\s\S]*?<script src="\.\/llm-demo-snapshot-market\.js[^"]*"><\/script>/i;
const blockPatchEndRe =
  /<link rel="stylesheet" href="\.\/llm-demo-snapshot-nav\.css[^"]*">[\s\S]*?<script src="\.\/llm-demo-snapshot-patch\.js[^"]*"><\/script>/i;

for (const file of fs.readdirSync(snapDir).filter((f) => f.endsWith('.html'))) {
  const fp = path.join(snapDir, file);
  let html = fs.readFileSync(fp, 'utf8');
  const injection = (PAGE_SCRIPTS[file] || DEFAULT_SCRIPTS).join('\n');
  if (blockWithLinksRe.test(html)) {
    html = html.replace(blockWithLinksRe, injection);
  } else if (blockScriptsOnlyRe.test(html)) {
    html = html.replace(blockScriptsOnlyRe, injection);
  } else if (
    (file === 'visibility-overview.html' ||
      file === 'prompt-research.html' ||
      file === 'market-comparison.html' ||
      file === 'prompts-management.html' ||
      file === 'intent-coverage-overlay.html') &&
    blockPatchEndRe.test(html)
  ) {
    html = html.replace(blockPatchEndRe, injection);
  } else if (!html.includes('llm-demo-snapshot-blockers.js')) {
    html = html.replace(/<\/body>/i, injection + '\n</body>');
  }
  fs.writeFileSync(fp, html, 'utf8');
  console.log('synced scripts:', file);
}

console.log('build', BUILD);
