#!/usr/bin/env node
/**
 * Patch env-bar demo JS to use AepDemoGeneratorTargets.bindGeneratorTargetLifecycle
 * and re-query #generatorTarget inside loadGeneratorTargets().
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pvRoot = path.join(repoRoot, 'web/profile-viewer');

const inlineDemoFiles = [
  'admiral-demo.js',
  'call-center-demo.js',
  'call-center-demo-apalmer.js',
  'donate-demo.js',
  'etihad-demo.js',
  'ferrari-world-abu-dhabi-demo.js',
  'jlr-demo.js',
  'miral/miral-theme-parks-demo.js',
  'mod-demo.js',
  'navigator-global-demo.js',
  'oldmutual-demo.js',
  'premier-inn-demo.js',
  'race-for-life-demo.js',
  'rocco-forte-demo.js',
  'saga-demo.js',
  'seaworld-abu-dhabi-demo.js',
  'sky-demo.js',
  'sky-news-demo-lab-events.js',
  'social/facebook-home-demo.js',
  'social/linkedin-demo.js',
  'social/tiktok-demo.js',
  'wb-world-abu-dhabi-demo.js',
  'brand-scraper-site-clone-lab-core.js',
];

const lifecycleBlock = `if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle) {
      global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(function () {
        return loadGeneratorTargets();
      });
    } else {
      void loadGeneratorTargets();
      if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.onSandboxChange) {
        global.AepDemoGeneratorTargets.onSandboxChange(function () {
          void loadGeneratorTargets();
        });
      }
    }`;

const lifecycleBlockGlobal = lifecycleBlock.replace(/global\./g, 'window.');

function patchFile(relPath) {
  const filePath = path.join(pvRoot, relPath);
  if (!fs.existsSync(filePath)) {
    console.warn('skip missing', relPath);
    return false;
  }
  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes('bindGeneratorTargetLifecycle')) {
    console.log('skip already patched', relPath);
    return false;
  }

  const usesWindow = /\bwindow\.AepDemoGeneratorTargets\b/.test(src) && !/\bglobal\.AepDemoGeneratorTargets\b/.test(src);
  const block = usesWindow ? lifecycleBlockGlobal : lifecycleBlock;

  const loadBlockRe =
    /void loadGeneratorTargets\(\);\s*\n\s*if \(typeof (?:global|window)\.AepDemoGeneratorTargets !== 'undefined' && (?:global|window)\.AepDemoGeneratorTargets\.onSandboxChange\) \{\s*\n\s*(?:global|window)\.AepDemoGeneratorTargets\.onSandboxChange\(function \(\) \{\s*\n\s*void loadGeneratorTargets\(\);\s*\n\s*\}\);\s*\n\s*\}/;

  if (!loadBlockRe.test(src)) {
    console.warn('skip no load block', relPath);
    return false;
  }
  src = src.replace(loadBlockRe, block);

  const fnRe = /(async function loadGeneratorTargets\(\) \{\s*\n)(\s*)if \(!generatorTargetSelect\) return;/;
  if (fnRe.test(src)) {
    src = src.replace(
      fnRe,
      "$1$2var selectEl = document.getElementById('generatorTarget');\n$2if (!selectEl) return;",
    );
    src = src.replace(/generatorTargetSelect\.innerHTML/g, 'selectEl.innerHTML');
    src = src.replace(/generatorTargetSelect\.appendChild/g, 'selectEl.appendChild');
    src = src.replace(/generatorTargetSelect\.value/g, 'selectEl.value');
    src = src.replace(
      /loadGeneratorTargetsIntoSelect\(generatorTargetSelect,/g,
      'loadGeneratorTargetsIntoSelect(selectEl,',
    );
    src = src.replace(/loadGeneratorTargetsIntoSelect\(generatorTargetSelect\)/g, 'loadGeneratorTargetsIntoSelect(selectEl)');
  }

  fs.writeFileSync(filePath, src);
  console.log('patched', relPath);
  return true;
}

function patchLabCore(relPath) {
  const filePath = path.join(pvRoot, relPath);
  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes('getGeneratorTargetSelect')) {
    console.log('skip lab-core already has getGeneratorTargetSelect', relPath);
    return false;
  }

  src = src.replace(
    /\n    var generatorTargetSelect = document\.getElementById\('generatorTarget'\);\n/,
    "\n    function getGeneratorTargetSelect() {\n      return document.getElementById('generatorTarget');\n    }\n\n",
  );

  src = src.replace(
    /var id = \(generatorTargetSelect && generatorTargetSelect\.value\) \|\| '';/g,
    "var selectEl = getGeneratorTargetSelect();\n      var id = (selectEl && selectEl.value) || '';",
  );

  const fnRe = /(async function loadGeneratorTargets\(\) \{\s*\n)(\s*)if \(!generatorTargetSelect\) return;/;
  if (fnRe.test(src)) {
    src = src.replace(fnRe, "$1$2var selectEl = getGeneratorTargetSelect();\n$2if (!selectEl) return;");
    src = src.replace(/generatorTargetSelect\.innerHTML/g, 'selectEl.innerHTML');
    src = src.replace(/generatorTargetSelect\.appendChild/g, 'selectEl.appendChild');
    src = src.replace(
      /loadGeneratorTargetsIntoSelect\(generatorTargetSelect,/g,
      'loadGeneratorTargetsIntoSelect(selectEl,',
    );
    src = src.replace(/loadGeneratorTargetsIntoSelect\(generatorTargetSelect\)/g, 'loadGeneratorTargetsIntoSelect(selectEl)');
  }

  const loadBlockRe =
    /void loadGeneratorTargets\(\);\s*\n\s*if \(typeof global\.AepDemoGeneratorTargets !== 'undefined' && global\.AepDemoGeneratorTargets\.onSandboxChange\) \{\s*\n\s*global\.AepDemoGeneratorTargets\.onSandboxChange\(function \(\) \{\s*\n\s*void loadGeneratorTargets\(\);\s*\n\s*\}\);\s*\n\s*\}/;

  const block = `if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle) {
      global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(function () {
        return loadGeneratorTargets();
      });
    } else {
      void loadGeneratorTargets();
      if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.onSandboxChange) {
        global.AepDemoGeneratorTargets.onSandboxChange(function () {
          void loadGeneratorTargets();
        });
      }
    }`;

  if (loadBlockRe.test(src)) {
    src = src.replace(loadBlockRe, block);
  }

  fs.writeFileSync(filePath, src);
  console.log('patched lab-core', relPath);
  return true;
}

const labCores = [
  'demos/alshaya/starbucks/starbucks-lab-core.js',
  'demos/ksia/ksia-lab-core.js',
  'etihad-lab-core.js',
  'demos/aviva-target/aviva-target-lab-core.js',
];

let count = 0;
for (const f of labCores) {
  if (patchLabCore(f)) count++;
}
for (const f of inlineDemoFiles) {
  if (patchFile(f)) count++;
}

// armcom: replace local bindGeneratorTargetReload with shared lifecycle
const armcomPath = path.join(pvRoot, 'demos/armcom/armcom-lab-core.js');
let armcom = fs.readFileSync(armcomPath, 'utf8');
if (armcom.includes('function bindGeneratorTargetReload()')) {
  armcom = armcom.replace(
    /    function bindGeneratorTargetReload\(\) \{[\s\S]*?    \}\n\n    bindGeneratorTargetReload\(\);\n    void loadGeneratorTargets\(\);\n    if \(typeof global\.AepDemoGeneratorTargets !== 'undefined' && global\.AepDemoGeneratorTargets\.onSandboxChange\) \{\n      global\.AepDemoGeneratorTargets\.onSandboxChange\(function \(\) \{\n        void loadGeneratorTargets\(\);\n      \}\);\n    \}\n/,
    `    if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle) {
      global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(function () {
        return loadGeneratorTargets();
      });
    } else {
      void loadGeneratorTargets();
      if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.onSandboxChange) {
        global.AepDemoGeneratorTargets.onSandboxChange(function () {
          void loadGeneratorTargets();
        });
      }
    }
`,
  );
  fs.writeFileSync(armcomPath, armcom);
  console.log('patched armcom-lab-core lifecycle');
  count++;
}

console.log('done, files patched:', count);
