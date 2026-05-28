/**
 * Replaces frozen snapshot left <nav> with the nav from the latest Overview export.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcHtml =
  process.env.SKY_LLM_NEW_OVERVIEW_HTML ||
  path.join(
    process.env.USERPROFILE || '',
    'Downloads',
    'Adobe LLM Optimizer New Overview.html',
  );
const snapshotDir = path.join(repoRoot, 'web', 'profile-viewer', 'sky-llm-snapshot');
const targets = [
  'overview.html',
  'brand-presence.html',
  'brand-claims.html',
  'prompts-management.html',
  'url-inspector.html',
  'agentic-traffic.html',
].map((f) => path.join(snapshotDir, f));

function extractNav(html) {
  const flexNav = html.indexOf('<nav style="display: flex');
  if (flexNav >= 0) return extractNavElement(html, flexNav);

  const classNav = html.indexOf('<nav class=" sd11');
  if (classNav >= 0) return extractNavElement(html, classNav);

  throw new Error('Could not find <nav> in source HTML');
}

function extractNavElement(html, navStart) {
  let depth = 0;
  for (let i = navStart; i < html.length; i++) {
    if (html.startsWith('<nav', i)) depth++;
    if (html.startsWith('</nav>', i)) {
      depth--;
      if (depth === 0) return html.slice(navStart, i + 6);
    }
  }
  throw new Error('Could not close </nav> in source HTML');
}

function replaceNav(html, newNav) {
  const patterns = ['<nav style="display: flex', '<nav class=" sd11'];
  for (const pattern of patterns) {
    const navStart = html.indexOf(pattern);
    if (navStart < 0) continue;
    let depth = 0;
    for (let i = navStart; i < html.length; i++) {
      if (html.startsWith('<nav', i)) depth++;
      if (html.startsWith('</nav>', i)) {
        depth--;
        if (depth === 0) {
          return html.slice(0, navStart) + newNav + html.slice(i + 6);
        }
      }
    }
  }
  throw new Error('Could not replace nav in target HTML');
}

function ensureNavAssets(html, basename) {
  const inject = [
    '<link rel="stylesheet" href="./sky-llm-snapshot-nav.css">',
    '<script src="./sky-llm-snapshot-nav.js"></script>',
  ];
  if (basename === 'overview.html') {
    inject.push('<script src="./sky-llm-snapshot-overview.js"></script>');
  }
  let out = html;
  for (const tag of inject) {
    if (!out.includes(tag)) {
      out = out.replace('</body>', `${tag}\n</body>`);
    }
  }
  return out;
}

if (!fs.existsSync(srcHtml)) {
  console.error('Source not found:', srcHtml);
  process.exit(1);
}

const source = fs.readFileSync(srcHtml, 'utf8');
const newNav = extractNav(source);

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.warn('Skip missing', file);
    continue;
  }
  let html = fs.readFileSync(file, 'utf8');
  html = replaceNav(html, newNav);
  html = ensureNavAssets(html, path.basename(file));
  fs.writeFileSync(file, html, 'utf8');
  console.log('Updated nav in', path.basename(file));
}
