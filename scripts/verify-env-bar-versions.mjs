#!/usr/bin/env node
/**
 * Ensures embedded DEFAULT_VERSIONS in shared/env-bar.js matches env-bar-versions.json.
 * @see docs/env-bar-shared-module.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pv = path.join(root, 'web/profile-viewer');
const JSON_PATH = path.join(pv, 'shared/env-bar-versions.json');
const JS_PATH = path.join(pv, 'shared/env-bar.js');

let failed = false;

function fail(msg) {
  console.error(msg);
  failed = true;
}

function extractEmbeddedDefaults(jsText) {
  const marker = 'var DEFAULT_VERSIONS = ';
  const start = jsText.indexOf(marker);
  if (start < 0) return null;
  const braceStart = jsText.indexOf('{', start);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < jsText.length; i++) {
    const ch = jsText[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const raw = jsText.slice(braceStart, i + 1);
        try {
          return JSON.parse(raw.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"'));
        } catch {
          // Fallback: Function constructor for object literal (trusted local file only)
          // eslint-disable-next-line no-new-func
          return Function('return ' + raw)();
        }
      }
    }
  }
  return null;
}

const jsonText = fs.readFileSync(JSON_PATH, 'utf8');
const jsText = fs.readFileSync(JS_PATH, 'utf8');
const jsonManifest = JSON.parse(jsonText);
const embedded = extractEmbeddedDefaults(jsText);

if (!embedded) {
  fail('shared/env-bar.js: could not parse DEFAULT_VERSIONS object');
  process.exit(1);
}

function compare(key, a, b) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) {
    fail(`version drift on ${key}:\n  JSON: ${sa}\n  embedded: ${sb}`);
  }
}

compare('manifestVersion', jsonManifest.manifestVersion, embedded.manifestVersion);
compare('moduleVersion', jsonManifest.moduleVersion, embedded.moduleVersion);
compare('assets', jsonManifest.assets, embedded.assets);

if (failed) {
  process.exit(1);
}

console.log(
  `verify-env-bar-versions: OK (manifest ${jsonManifest.manifestVersion}, ${Object.keys(jsonManifest.assets).length} assets in sync)`,
);
