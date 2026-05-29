/**
 * Strip Recharts line dash attributes from existing snapshot HTML files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripLineDash, repairRechartsResponsiveHtml } from './sky-llm-snapshot-line-dash.mjs';
import { applyCommonSiteBranding } from './sky-llm-snapshot-sky-text.mjs';

const snapshotDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'web',
  'profile-viewer',
  'sky-llm-snapshot',
);

const files = fs
  .readdirSync(snapshotDir)
  .filter((f) => f.endsWith('.html'));

for (const file of files) {
  const filePath = path.join(snapshotDir, file);
  let html = fs.readFileSync(filePath, 'utf8');
  const before = (html.match(/recharts-line-curve[^>]*stroke-dasharray/g) || []).length;
  html = stripLineDash(html);
  html = repairRechartsResponsiveHtml(html);
  html = applyCommonSiteBranding(html);
  const after = (html.match(/recharts-line-curve[^>]*stroke-dasharray/g) || []).length;
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(file, 'dash curves', before, '->', after);
}
