import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'profile-viewer');

let html = fs.readFileSync(path.join(root, 'mod-demo.html'), 'utf8');
html = html
  .replace('<title>MOD (British Army demo)', '<title>Sky (demo)')
  .replace(
    'body class="mod-demo-page home-dashboard-concierge"',
    'body class="mod-demo-page sky-demo-page home-dashboard-concierge"',
  )
  .replace(
    "defaultFrameSrc: 'mod-demo-assets/army-home-snapshot.html'",
    "defaultFrameSrc: 'sky-demo-assets/sky-home-snapshot.html'",
  )
  .replace("snapshotLayout: 'british-army-home'", "snapshotLayout: 'sky-home'")
  .replace('British Army — homepage snapshot', 'Sky — homepage snapshot')
  .replace('id="modDemoTopAnchor"', 'id="skyDemoTopAnchor"')
  .replace(/modSdk/g, 'skySdk')
  .replace(/modInjectSdkBtn/g, 'skyInjectSdkBtn')
  .replace(/modNs/g, 'skyNs')
  .replace('id="modMessage"', 'id="skyMessage"')
  .replace('id="modSelectedScript"', 'id="skySelectedScript"')
  .replace(
    /<p class="mod-demo-disclaimer">[\s\S]*?<\/p>/,
    '<p class="mod-demo-disclaimer">Embedded snapshot (saved HTML + local asset folder). Imagery and fonts may load from <a href="https://www.sky.com/" target="_blank" rel="noopener">sky.com</a> CDNs. Not affiliated with Sky Group.</p>',
  )
  .replace('mod-demo.js?v=20260526-mod-sandbox-env-flush', 'sky-demo.js?v=20260527-site-clone-bc')
  .replace('mod-demo.css?v=20260526-bc-env-grid', 'mod-demo.css?v=20260527-site-clone-bc')
  .replace('aep-lab-nav.js?v=20260520-miral-pages-removed', 'aep-lab-nav.js?v=20260527-site-clone-bc');
fs.writeFileSync(path.join(root, 'sky-demo.html'), html);

let js = fs.readFileSync(path.join(root, 'mod-demo.js'), 'utf8');
const jsReps = [
  ['modDemo', 'skyDemo'],
  ['mod.identity', 'sky.identity'],
  ['modInjectSdkBtn', 'skyInjectSdkBtn'],
  ['modSdk', 'skySdk'],
  ['modNs', 'skyNs'],
  ['modMessage', 'skyMessage'],
  ['modWebPush', 'skyWebPush'],
  ['MOD_WEB_PUSH', 'SKY_WEB_PUSH'],
  ['setModMessage', 'setSkyMessage'],
  ['initModDemo', 'initSkyDemo'],
  ['applyModDemo', 'applySkyDemo'],
  ['flushModDemo', 'flushSkyDemo'],
  ['normalizeSnapshotFrame', 'normalizeSkySnapshotFrame'],
  ["viewName: 'MOD (British Army)'", "viewName: 'Sky'"],
  ['readModStorageMap', 'readSkyStorageMap'],
  ['writeModStorageMap', 'writeSkyStorageMap'],
  ['getModSandboxKey', 'getSkySandboxKey'],
  ['migrateLegacyModScalar', 'migrateLegacySkyScalar'],
  ['readModSandboxString', 'readSkySandboxString'],
  ['writeModSandboxString', 'writeSkySandboxString'],
  ['modDemoEnvSandboxKey', 'skyDemoEnvSandboxKey'],
  ['modTagsInjection', 'skyTagsInjection'],
];
for (const [a, b] of jsReps) js = js.split(a).join(b);
js = js.replace(/^\/\*\*[\s\S]*?\*\//, '/**\n * Sky site-clone demo — lab strip + embed BC stack.\n */');
fs.writeFileSync(path.join(root, 'sky-demo.js'), js);
console.log('wrote sky-demo.html and sky-demo.js');
