#!/usr/bin/env node
/**
 * Migrate site-clone demo JS from initLabDemoEnvBar to window.envBar integration.
 * @see docs/env-bar-shared-module.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pv = path.join(__dirname, '..', 'web', 'profile-viewer');

/** Demo JS files that must use envBar (not initLabDemoEnvBar). */
const DEMO_JS = [
  'jlr-demo.js',
  'mod-demo.js',
  'premier-inn-demo.js',
  'etihad-demo.js',
  'admiral-demo.js',
  'navigator-global-demo.js',
  'race-for-life-demo.js',
  'donate-demo.js',
  'oldmutual-demo.js',
  'saga-demo.js',
  'demos/aviva-target/aviva-target-lab-core.js',
  'social/facebook-home-demo.js',
  'social/tiktok-demo.js',
  'ferrari-world-abu-dhabi-demo.js',
  'seaworld-abu-dhabi-demo.js',
  'wb-world-abu-dhabi-demo.js',
  'miral/miral-theme-parks-demo.js',
  'aviva-target-demo.js',
];

function registerBlock(varName, useGlobal) {
  const root = useGlobal ? 'global' : 'window';
  return `
if (${varName} && ${root}.envBar && typeof ${root}.envBar.registerTagsInjection === 'function') {
  ${root}.envBar.registerTagsInjection(${varName});
}`;
}

function readyWrapper(inner, useGlobal) {
  const root = useGlobal ? 'global' : 'window';
  return `
if (${root}.envBar && typeof ${root}.envBar.ready === 'function') {
  ${root}.envBar.ready().then(function () {
    ${inner}
  });
} else {
  ${inner}
}`;
}

function findTagsInjectionVar(js) {
  const m = js.match(/(?:const|var|let)\s+(\w+TagsInjection)\s*=/);
  return m ? m[1] : null;
}

function migrateLabCore(js) {
  let out = js;
  out = out.replace(
    /\s*if \(typeof global\.initLabDemoEnvBar === 'function'\) \{\s*global\.initLabDemoEnvBar\(\{ prefix: '[^']+' \}\);\s*\}\s*/g,
    '',
  );
  const tagsVar = findTagsInjectionVar(out);
  if (tagsVar && !out.includes('registerTagsInjection')) {
    const insertPoint = out.lastIndexOf('return {');
    if (insertPoint !== -1) {
      out =
        out.slice(0, insertPoint) +
        registerBlock(tagsVar, true) +
        '\n\n    ' +
        out.slice(insertPoint);
    }
  }
  return out;
}

function migrateFlatDemo(js) {
  if (js.includes('envBar.ready')) return js;
  const tagsVar = findTagsInjectionVar(js);
  let body = js.replace(/^\/\*\*[\s\S]*?\*\/\s*/m, '');
  body = body.replace(/\nwindow\.initLabDemoEnvBar && window\.initLabDemoEnvBar\(\{ prefix: '[^']+' \}\);\s*/g, '\n');
  if (tagsVar && !body.includes('registerTagsInjection')) {
    const initLabIdx = body.search(/\n\(function init\w+/);
    const insertAt = initLabIdx !== -1 ? initLabIdx : body.length;
    body = body.slice(0, insertAt) + registerBlock(tagsVar, false) + '\n' + body.slice(insertAt);
  }
  const indented = body
    .split('\n')
    .map((line) => (line ? '    ' + line : ''))
    .join('\n');
  return `/**
 * Env bar: waits for shared/env-bar.js before Tags injection.
 */
(function (global) {
  'use strict';
  function run() {
${indented}
  }
${readyWrapper('run();', true)}
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

function migrateAvivaShell(js) {
  if (js.includes('envBar.ready')) return js;
  const indented = js
    .split('\n')
    .map((line) => (line ? '    ' + line : ''))
    .join('\n');
  return `/**
 * Aviva Target lab shell — waits for shared/env-bar.js before lab init.
 */
(function (global) {
  'use strict';
  function run() {
${indented}
  }
${readyWrapper('run();', true)}
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

function migrateFile(rel) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    console.warn('skip missing:', rel);
    return false;
  }
  const original = fs.readFileSync(abs, 'utf8');
  if (
    original.includes('registerTagsInjection') &&
    !original.includes('initLabDemoEnvBar') &&
    (original.includes('envBar.ready') || rel.endsWith('-lab-core.js'))
  ) {
    console.log('already migrated:', rel);
    return false;
  }
  let out;
  if (rel === 'aviva-target-demo.js') {
    out = migrateAvivaShell(original);
  } else if (rel.endsWith('-lab-core.js')) {
    out = migrateLabCore(original);
  } else if (original.includes('initLabDemoEnvBar')) {
    out = migrateFlatDemo(original);
  } else {
    console.log('no initLabDemoEnvBar:', rel);
    return false;
  }
  if (out === original) return false;
  fs.writeFileSync(abs, out);
  console.log('migrated JS:', rel);
  return true;
}

let count = 0;
for (const rel of DEMO_JS) {
  if (migrateFile(rel)) count += 1;
}
console.log(`migrate-env-bar-js: ${count} JS file(s) updated`);
