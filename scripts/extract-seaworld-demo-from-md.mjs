#!/usr/bin/env node
/**
 * One-off: extract fenced HTML from worktree seaworld-abudhabi-demo.md →
 * web/profile-viewer/seaworld-abu-dhabi/index.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const mdPath = path.join(
  root,
  '.claude/worktrees/quirky-vaughan-f3e3fc/seaworld-abudhabi-demo.md',
);
const outDir = path.join(root, 'web/profile-viewer/seaworld-abu-dhabi');
const outFile = path.join(outDir, 'index.html');

const s = fs.readFileSync(mdPath, 'utf8');
const fence = '```html';
const start = s.indexOf(fence);
if (start === -1) throw new Error('Missing ```html fence');
let i = start + fence.length;
if (s[i] === '\r') i++;
if (s[i] === '\n') i++;

const endMarker = '</html>';
const endHtml = s.indexOf(endMarker, i);
if (endHtml === -1) throw new Error('Missing </html>');
const afterHtml = endHtml + endMarker.length;
let j = afterHtml;
if (s[j] === '\r') j++;
if (s[j] === '\n') j++;
if (s.slice(j, j + 3) !== '```') {
  throw new Error('Expected ``` fence after </html>');
}

const html = s.slice(i, afterHtml).trim();
if (!html.startsWith('<!DOCTYPE')) throw new Error('Extracted fragment does not start with DOCTYPE');

/** Cache-bust + client hints (same pattern as wb-world-abu-dhabi) */
const patched = html
  .replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">`,
  )
  .replace(
    /(href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)(")/,
    '$1&v=20260220sw$2',
  );

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${patched}\n`, 'utf8');
console.log('Wrote', path.relative(root, outFile), `(${patched.length} chars)`);
