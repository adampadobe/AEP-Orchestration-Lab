import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const sourceHtml = 'c:/Users/kirkham/Downloads/Signature motor insurance - Aviva motor insurance - Step1 - Vehical Details.html';
const sourceAssets = 'c:/Users/kirkham/Downloads/Signature motor insurance - Aviva motor insurance - Step1 - Vehical Details_files';
const destHtml = path.join(root, 'step1-vehicle-details.html');
const destAssets = path.join(root, 'assets/step1-vehicle');

const assetFolderName = 'Signature motor insurance - Aviva motor insurance - Step1 - Vehical Details_files';
const assetPrefix = `./${assetFolderName}/`;
const assetTarget = './assets/step1-vehicle/';

let html = fs.readFileSync(sourceHtml, 'utf8');
html = html.split(assetPrefix).join(assetTarget);

html = html.replace(
  /if \(window\.self === window\.top\) \{[\s\S]*?window\.applicationBasePath = '\/quote\/Direct\/Motor';/,
  "/* aviva demo: clickjack guard disabled for lab iframe */\n\n        window.applicationBasePath = '/quote/Direct/Motor';",
);

if (!html.includes('aviva-journey-patch.js')) {
  html = html.replace(
    '</body>',
    '  <script src="aviva-journey-patch.js" defer></script>\n</body>',
  );
}

fs.writeFileSync(destHtml, html);
console.log('Wrote', destHtml);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

copyDir(sourceAssets, destAssets);
console.log('Copied assets to', destAssets);

const fixedCore = path.join(__dirname, 'step1-vehicle-core.css');
fs.copyFileSync(fixedCore, path.join(destAssets, 'core.css'));
console.log('Applied CDN core.css imports');
