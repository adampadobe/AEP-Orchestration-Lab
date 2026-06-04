/**
 * Normalize sky-llm-snapshot *.html script tags: build-id + blockers first, cache-bust lab JS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapDir = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot');
const buildIdPath = path.join(snapDir, 'sky-llm-snapshot-build-id.js');
const buildMatch = fs.readFileSync(buildIdPath, 'utf8').match(/SKY_LLM_SNAPSHOT_BUILD\s*=\s*'([^']+)'/);
const BUILD = buildMatch ? buildMatch[1] : '20260621';
const v = '?v=' + BUILD;

const PAGE_SCRIPTS = {
  'overview.html': [
    '<link rel="stylesheet" href="./sky-llm-snapshot-nav.css' + v + '">',
    '<link rel="stylesheet" href="./sky-llm-snapshot-platform.css' + v + '">',
    '<script src="./sky-llm-snapshot-build-id.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-blockers.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-opportunities-catalog.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-nav.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-platform.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-overview.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-patch.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-market.js' + v + '"></script>',
  ],
  'brand-presence.html': [
    '<link rel="stylesheet" href="./sky-llm-snapshot-nav.css' + v + '">',
    '<link rel="stylesheet" href="./sky-llm-snapshot-platform.css' + v + '">',
    '<link rel="stylesheet" href="./sky-llm-snapshot-market-charts.css' + v + '">',
    '<script src="./sky-llm-snapshot-build-id.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-blockers.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-opportunities-catalog.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-nav.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-platform.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-patch.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-market.js' + v + '"></script>',
  ],
  'opportunities.html': [
    '<link rel="stylesheet" href="./sky-llm-snapshot-nav.css' + v + '">',
    '<link rel="stylesheet" href="./sky-llm-snapshot-platform.css' + v + '">',
    '<link rel="stylesheet" href="./sky-llm-snapshot-market-charts.css' + v + '">',
    '<link rel="stylesheet" href="./sky-llm-snapshot-opportunities.css' + v + '">',
    '<script src="./sky-llm-snapshot-build-id.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-blockers.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-opportunities-catalog.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-nav.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-opportunity-details.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-opportunities.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-patch.js' + v + '"></script>',
    '<script src="./sky-llm-snapshot-market.js' + v + '"></script>',
  ],
};

const DEFAULT_SCRIPTS = [
  '<script src="./sky-llm-snapshot-build-id.js' + v + '"></script>',
  '<script src="./sky-llm-snapshot-blockers.js' + v + '"></script>',
  '<script src="./sky-llm-snapshot-opportunities-catalog.js' + v + '"></script>',
  '<script src="./sky-llm-snapshot-nav.js' + v + '"></script>',
  '<script src="./sky-llm-snapshot-patch.js' + v + '"></script>',
  '<script src="./sky-llm-snapshot-market.js' + v + '"></script>',
];

const blockWithLinksRe =
  /<link rel="stylesheet" href="\.\/sky-llm-snapshot[^"]*">[\s\S]*?<script src="\.\/sky-llm-snapshot-market\.js[^"]*"><\/script>/i;
const blockScriptsOnlyRe =
  /<script src="\.\/sky-llm-snapshot-build-id\.js[^"]*"><\/script>[\s\S]*?<script src="\.\/sky-llm-snapshot-market\.js[^"]*"><\/script>/i;

for (const file of fs.readdirSync(snapDir).filter((f) => f.endsWith('.html'))) {
  const fp = path.join(snapDir, file);
  let html = fs.readFileSync(fp, 'utf8');
  const injection = (PAGE_SCRIPTS[file] || DEFAULT_SCRIPTS).join('\n');
  if (blockWithLinksRe.test(html)) {
    html = html.replace(blockWithLinksRe, injection);
  } else if (blockScriptsOnlyRe.test(html)) {
    html = html.replace(blockScriptsOnlyRe, injection);
  } else if (!html.includes('sky-llm-snapshot-blockers.js')) {
    html = html.replace(/<\/body>/i, injection + '\n</body>');
  }
  fs.writeFileSync(fp, html, 'utf8');
  console.log('synced scripts:', file);
}

console.log('build', BUILD);
