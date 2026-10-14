#!/usr/bin/env node
/**
 * Keep loader consumers and offline defaults aligned with the canonical manifest.
 * Default: verify without writing. Use --write after updating the manifest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pv = path.join(root, 'web/profile-viewer');
const manifest = JSON.parse(fs.readFileSync(path.join(pv, 'shared/env-bar-versions.json'), 'utf8'));
const write = process.argv.includes('--write');
if (process.argv.slice(2).some((arg) => arg !== '--write')) throw new Error('Usage: sync-env-bar-versions.mjs [--write]');
if (!/^[a-zA-Z0-9-]+$/.test(manifest.manifestVersion)) throw new Error('Invalid manifest version');

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const filename = path.join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(filename) : entry.name.endsWith('.html') ? [filename] : [];
  });
}

const consumers = [...htmlFiles(pv), path.join(root, 'functions/brandScraperProfileViewerDemo.js')];
const changed = [];
for (const filename of consumers) {
  const before = fs.readFileSync(filename, 'utf8');
  const after = before.replace(/(<script\b[^>]*\bsrc=["'][^"']*shared\/env-bar\.js)(?:\?[^"']*)?(["'])/g,
    '$1?v=' + manifest.manifestVersion + '$2');
  if (before === after) continue;
  changed.push(path.relative(root, filename));
  if (write) fs.writeFileSync(filename, after);
}

const loaderPath = path.join(pv, 'shared/env-bar.js');
const loader = fs.readFileSync(loaderPath, 'utf8');
const defaults = loader.match(/var DEFAULT_VERSIONS = \{[\s\S]*?\n  \};/);
if (!defaults) throw new Error('Cannot locate env-bar.js DEFAULT_VERSIONS');
let updated = defaults[0];
for (const [key, value] of Object.entries({ manifestVersion: manifest.manifestVersion, moduleVersion: manifest.moduleVersion, ...manifest.assets })) {
  const expression = new RegExp('(\\b' + key + ":\\s*')[^']*(')");
  if (!expression.test(updated)) throw new Error('Missing embedded version: ' + key);
  updated = updated.replace(expression, (_match, prefix, suffix) => prefix + value + suffix);
}
if (updated !== defaults[0]) {
  changed.push(path.relative(root, loaderPath));
  if (write) fs.writeFileSync(loaderPath, loader.replace(defaults[0], updated));
}

if (changed.length) {
  console.log((write ? 'Updated' : 'Environment-bar version drift:') + '\n' + changed.join('\n'));
  if (!write) process.exitCode = 1;
} else {
  console.log('Environment-bar consumers and defaults match ' + manifest.manifestVersion);
}
