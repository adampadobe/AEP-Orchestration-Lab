import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySkyBranding } from './sky-llm-snapshot-sky-text.mjs';

const dir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'web',
  'profile-viewer',
  'sky-llm-snapshot',
);

for (const name of ['overview.html', 'brand-presence.html']) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = applySkyBranding(before);
  fs.writeFileSync(file, after, 'utf8');
  console.log(name, 'frescopa', (before.match(/frescopa/gi) || []).length, '->', (after.match(/frescopa/gi) || []).length);
}
