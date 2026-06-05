import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const motorDir = path.join(root, 'quote/Direct/Motor');
const depthPrefix = '../../../';

const HEAD_SCRIPTS = [
  'aviva-target-vec.js',
  'aviva-target-sdk-resume.js',
  'aviva-target-personalization.js',
  'aviva-demo-head.js',
];

function patchPathsForMotor(html, assetDir) {
  html = html.split(`./assets/${assetDir}/`).join(`${depthPrefix}assets/${assetDir}/`);
  for (const name of HEAD_SCRIPTS) {
    const re = new RegExp(`src="${name.replace('.', '\\.')}"`, 'g');
    html = html.replace(re, `src="${depthPrefix}${name}"`);
  }
  if (!html.includes('aviva-journey-patch.js')) {
    html = html.replace(
      '</body>',
      `  <script src="${depthPrefix}aviva-journey-patch.js" defer></script>\n</body>`,
    );
  } else {
    html = html.replace(
      /src="(?:\.\.\/)*aviva-journey-patch\.js"/g,
      `src="${depthPrefix}aviva-journey-patch.js"`,
    );
  }
  return html;
}

function ensureHeadScripts(html, assetDir) {
  html = patchPathsForMotor(html, assetDir);
  if (!html.includes('<head>')) return html;
  for (const name of HEAD_SCRIPTS) {
    if (html.includes(name)) continue;
    html = html.replace('<head>', `<head>\n    <script src="${depthPrefix}${name}"></script>`);
  }
  return html;
}

function writeRedirect(filePath, targetRelative, title) {
  const dir = path.dirname(filePath);
  const sameDir = !targetRelative.includes('/');
  const fromDir = sameDir
    ? ''
    : dir === root
      ? ''
      : path.relative(dir, root).split(path.sep).join('/') + '/';
  const href = `${fromDir}${targetRelative}`.replace(/\/+/g, '/');
  fs.writeFileSync(
    filePath,
    `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=${href}">
  <title>${title}</title>
  <script>location.replace('${href}');</script>
</head>
<body>
  <p><a href="${href}">Continue</a></p>
</body>
</html>
`,
  );
  console.log('Redirect stub', filePath, '->', href);
}

fs.mkdirSync(motorDir, { recursive: true });

const relocations = [
  { src: 'step2-driver.html', dest: 'driver-details.html', assetDir: 'step2' },
  { src: 'step3-additional.html', dest: 'additional-information.html', assetDir: 'step3' },
  { src: 'quote/Direct/Motor/quote-details.html', dest: 'driver-quote.html', assetDir: 'step4' },
];

for (const { src, dest, assetDir } of relocations) {
  const srcPath = path.join(root, src);
  if (!fs.existsSync(srcPath)) {
    console.warn('Skip missing', srcPath);
    continue;
  }
  let html = fs.readFileSync(srcPath, 'utf8');
  if (html.includes('location.replace(') && html.length < 500) {
    console.warn('Skip redirect stub source', src);
    continue;
  }
  html = ensureHeadScripts(html, assetDir);
  const destPath = path.join(motorDir, dest);
  fs.writeFileSync(destPath, html);
  console.log('Wrote', destPath);
}

writeRedirect(
  path.join(root, 'step2-driver.html'),
  'quote/Direct/Motor/driver-details.html',
  'Redirecting to driver details…',
);
writeRedirect(
  path.join(root, 'step3-additional.html'),
  'quote/Direct/Motor/additional-information.html',
  'Redirecting to additional information…',
);
writeRedirect(
  path.join(root, 'step4-quote.html'),
  'quote/Direct/Motor/driver-quote.html',
  'Redirecting to your quote…',
);
writeRedirect(
  path.join(motorDir, 'quote-details.html'),
  'driver-quote.html',
  'Redirecting to your quote…',
);
