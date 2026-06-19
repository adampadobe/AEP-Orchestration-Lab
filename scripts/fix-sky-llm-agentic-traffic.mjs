/**
 * Restores agentic-traffic.html from the last working snapshot and grafts Top+Bottom Movers
 * from the tour re-import using stable element ids.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyAgenticTrafficBranding } from './sky-llm-snapshot-sky-text.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outHtml = path.join(repo, 'web/profile-viewer/sky-llm-snapshot/agentic-traffic.html');
const tourBroken = process.env.SKY_LLM_AT_TOUR_HTML
  ? fs.readFileSync(process.env.SKY_LLM_AT_TOUR_HTML, 'utf8')
  : execSync('git show 27f23ad2:web/profile-viewer/sky-llm-snapshot/agentic-traffic.html', {
      encoding: 'utf8',
      cwd: repo,
    });
const buildId = fs
  .readFileSync(path.join(repo, 'web/profile-viewer/sky-llm-snapshot/sky-llm-snapshot-build-id.js'), 'utf8')
  .match(/'(\d{8})'/)?.[1];

if (!buildId) {
  console.error('Missing SKY_LLM_SNAPSHOT_BUILD');
  process.exit(1);
}
const oldBase = execSync('git show 566424c8:web/profile-viewer/sky-llm-snapshot/agentic-traffic.html', {
  encoding: 'utf8',
  cwd: repo,
});

function balanceFrom(html, start) {
  let depth = 0;
  let i = start;
  while (i < html.length) {
    const open = html.indexOf('<div', i);
    const close = html.indexOf('</div>', i);
    if (close < 0) return null;
    if (open >= 0 && open < close) {
      depth++;
      i = open + 4;
      continue;
    }
    depth--;
    i = close + 6;
    if (depth === 0) return html.slice(start, i);
  }
  return null;
}

function extractMoversGrid(html) {
  const top = html.indexOf('Top Movers');
  const bot = html.indexOf('Bottom Movers');
  if (top < 0 || bot < 0) return null;
  let start = Math.min(top, bot);
  let best = null;
  for (let step = 0; step < 30; step++) {
    const prev = html.lastIndexOf('<div', start - 4);
    if (prev < 0) break;
    start = prev;
    const block = balanceFrom(html, start);
    if (!block) continue;
    if (block.includes('Top Movers') && block.includes('Bottom Movers')) {
      if (!best || block.length < best.length) best = block;
    }
  }
  return best;
}

function extractOldMoversGrid(html) {
  const idx = html.indexOf('id="agentic-traffic-top-movers-table"');
  if (idx < 0) return null;
  let pos = idx;
  for (let step = 0; step < 30; step++) {
    const ihIdx = html.lastIndexOf('-macro-static-IHcRc', pos);
    if (ihIdx < 0) break;
    const divStart = html.lastIndexOf('<div', ihIdx);
    if (divStart < 0) break;
    const block = balanceFrom(html, divStart);
    if (
      block &&
      block.includes('agentic-traffic-top-movers-table') &&
      !block.includes('agentic-traffic-bottom-movers-table')
    ) {
      return block;
    }
    pos = divStart - 1;
  }
  return null;
}

const tourGrid = extractMoversGrid(tourBroken);
const oldGrid = extractOldMoversGrid(oldBase);

if (!tourGrid || !oldGrid) {
  console.error('Could not extract movers grids', { tour: !!tourGrid, old: !!oldGrid });
  process.exit(1);
}

let html = oldBase.replace(oldGrid, tourGrid);
html = applyAgenticTrafficBranding(html);

const SNAPSHOT_ASSETS = [
  `<link rel="stylesheet" href="./sky-llm-snapshot-nav.css?v=${buildId}">`,
  `<script src="./sky-llm-snapshot-build-id.js?v=${buildId}"></script>`,
  `<script src="./sky-llm-snapshot-blockers.js?v=${buildId}"></script>`,
  `<script src="./sky-llm-snapshot-opportunities-catalog.js?v=${buildId}"></script>`,
  `<script src="./sky-llm-snapshot-nav.js?v=${buildId}"></script>`,
  `<script src="./sky-llm-snapshot-patch.js?v=${buildId}"></script>`,
  `<script src="./sky-llm-snapshot-market.js?v=${buildId}"></script>`,
].join('\n');

html = html.replace(
  /<link rel="stylesheet" href="\.\/sky-llm-snapshot[^"]*">[\s\S]*?<script src="\.\/sky-llm-snapshot-market\.js[^"]*"><\/script>/gi,
  '',
);
html = html.replace(
  /<script src="\.\/sky-llm-snapshot-build-id\.js[^"]*"><\/script>[\s\S]*?<script src="\.\/sky-llm-snapshot-market\.js[^"]*"><\/script>/gi,
  '',
);

const bodyIdx = html.indexOf('</body>');
if (bodyIdx >= 0) {
  html = html.slice(0, bodyIdx) + SNAPSHOT_ASSETS + '\n' + html.slice(bodyIdx);
}

fs.writeFileSync(outHtml, html, 'utf8');
console.log('Wrote', outHtml, Math.round(html.length / 1024) + ' KB');
console.log({
  bottomMovers: html.includes('Bottom Movers'),
  topMovers: html.includes('Top Movers'),
  platformJs: html.includes('sky-llm-snapshot-platform.js'),
  tourGridLen: tourGrid.length,
  oldGridLen: oldGrid.length,
});
