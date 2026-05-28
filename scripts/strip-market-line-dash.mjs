/**
 * Removes Recharts draw-animation dash attributes from market line paths in brand-presence.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'web',
  'profile-viewer',
  'sky-llm-snapshot',
  'brand-presence.html',
);

let html = fs.readFileSync(file, 'utf8');
const before = (html.match(/recharts-line-curve[^>]*stroke-dasharray/g) || []).length;
html = html.replace(
  /(<path[^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*)\sstroke-dasharray="[^"]*"/g,
  '$1',
);
html = html.replace(
  /(<path[^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*)\sstroke-dashoffset="[^"]*"/g,
  '$1',
);
const after = (html.match(/recharts-line-curve[^>]*stroke-dasharray/g) || []).length;
fs.writeFileSync(file, html, 'utf8');
console.log('strip-market-line-dash:', before, '->', after);
