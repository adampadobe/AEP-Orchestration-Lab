/**
 * Strip Walnut pop-in markup saved after </body> in frozen LLM Optimizer HTML snapshots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const snapDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'web',
  'profile-viewer',
  'sky-llm-snapshot',
);

const files = fs.readdirSync(snapDir).filter((f) => f.endsWith('.html'));

for (const file of files) {
  const fp = path.join(snapDir, file);
  let html = fs.readFileSync(fp, 'utf8');
  const before = html.length;
  if (!html.includes('walnut-root-popin-element')) {
    console.log('skip (no walnut):', file);
    continue;
  }
  html = html.replace(/<\/body>\s*<div id="walnut-root-popin-element"[\s\S]*$/i, '</body>\n');
  if (!/<\/html>/i.test(html)) {
    html = html.trimEnd() + '\n</html>\n';
  }
  fs.writeFileSync(fp, html, 'utf8');
  console.log('stripped walnut:', file, Math.round((before - html.length) / 1024) + ' KB removed');
}
