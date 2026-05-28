/**
 * Brand Claims snapshot — clone Brand Presence export and retitle main heading.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot', 'brand-presence.html');
const out = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot', 'brand-claims.html');

if (!fs.existsSync(src)) {
  console.error('Missing brand-presence.html');
  process.exit(1);
}

let html = fs.readFileSync(src, 'utf8');
html = html.replace(
  /(-macro-static-Gb7QEd">)Brand Presence(<\/h1>)/,
  '$1Brand Claims$2',
);
html = html.replace(
  /<title>Adobe LLM Optimizer<\/title>/i,
  '<title>Adobe LLM Optimizer — Brand Claims</title>',
);

fs.writeFileSync(out, html, 'utf8');
console.log('Wrote', out, '(' + Math.round(html.length / 1024) + ' KB)');
