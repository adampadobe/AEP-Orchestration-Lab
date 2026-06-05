import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const downloads = 'c:/Users/kirkham/Downloads';

const STEPS = {
  step3: {
    label: 'Step3',
    destHtml: 'step3-additional.html',
    assetDir: 'step3',
  },
  step4: {
    label: 'Step4',
    destHtml: 'quote/Direct/Motor/driver-quote.html',
    assetDir: 'step4',
    depthPrefix: '../../../',
  },
};

function importStep(key) {
  const cfg = STEPS[key];
  if (!cfg) {
    console.error('Unknown step:', key, '(use step3 or step4)');
    process.exit(1);
  }

  const base = `Signature motor insurance - Aviva motor insurance - ${cfg.label}`;
  const sourceHtml = path.join(downloads, `${base}.html`);
  const sourceAssets = path.join(downloads, `${base}_files`);
  const destHtml = path.join(root, cfg.destHtml);
  const destAssets = path.join(root, 'assets', cfg.assetDir);
  const assetFolderName = `${base}_files`;
  const assetPrefix = `./${assetFolderName}/`;
  const assetTarget = cfg.depthPrefix
    ? `${cfg.depthPrefix}assets/${cfg.assetDir}/`
    : `./assets/${cfg.assetDir}/`;
  const scriptPrefix = cfg.depthPrefix || './';

  let html = fs.readFileSync(sourceHtml, 'utf8');
  html = html.split(assetPrefix).join(assetTarget);

  html = html.replace(
    /if \(window\.self === window\.top\) \{[\s\S]*?window\.applicationBasePath = '\/quote\/Direct\/Motor';/,
    "/* aviva demo: clickjack guard disabled for lab iframe */\n\n        window.applicationBasePath = '/quote/Direct/Motor';",
  );

  html = html.replace(/<script[^>]*src="[^"]*otBannerSdk[^"]*"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="[^"]*otSDKStub[^"]*"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="[^"]*cookielaw\.org[^"]*"[^>]*><\/script>/gi, '');

  if (!html.includes('aviva-demo-head.js')) {
    html = html.replace(
      '<head>',
      `<head>\n    <script src="${scriptPrefix}aviva-demo-head.js"></script>`,
    );
  }

  if (!html.includes('aviva-target-sdk-resume.js')) {
    html = html.replace(
      '<head>',
      `<head>\n    <script src="${scriptPrefix}aviva-target-sdk-resume.js"></script>`,
    );
  }

  if (!html.includes('aviva-target-personalization.js')) {
    html = html.replace(
      '<head>',
      `<head>\n    <script src="${scriptPrefix}aviva-target-personalization.js"></script>`,
    );
  }

  if (!html.includes('aviva-journey-patch.js')) {
    html = html.replace(
      '</body>',
      `  <script src="${scriptPrefix}aviva-journey-patch.js" defer></script>\n</body>`,
    );
  }

  fs.mkdirSync(path.dirname(destHtml), { recursive: true });
  fs.writeFileSync(destHtml, html);
  console.log('Wrote', destHtml);

  copyDir(sourceAssets, destAssets);
  console.log('Copied assets to', destAssets);

  const fixedCore = path.join(__dirname, 'step1-vehicle-core.css');
  fs.copyFileSync(fixedCore, path.join(destAssets, 'core.css'));
  console.log('Applied CDN core.css imports for', key);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function copyImg(fromDir, toDir) {
  const src = path.join(root, 'assets', fromDir, 'img');
  const dst = path.join(root, 'assets', toDir, 'img');
  if (!fs.existsSync(src)) return;
  copyDir(src, dst);
  console.log('Copied img from', fromDir, 'to', toDir);
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Usage: node import-quote-step.mjs step3 [step4 ...]');
  process.exit(1);
}

for (const key of targets) {
  importStep(key);
  copyImg('step2', STEPS[key].assetDir);
}
