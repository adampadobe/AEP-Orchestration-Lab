import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetDir = process.argv[2] || 'step2';
const indexPath = path.join(__dirname, '../assets', assetDir, 'index.css');

if (!fs.existsSync(indexPath)) {
  console.error('Missing', indexPath);
  process.exit(1);
}

let css = fs.readFileSync(indexPath, 'utf8');

const motorImgBase = './img/';
const fontBase = 'https://static.aviva.io/assets/fonts/';
const fontMap = {
  'AvivaCurve-Light': 'avivacurve-light',
  'AvivaCurve-Regular': 'avivacurve-regular',
  'AvivaCurve-Medium': 'avivacurve-medium',
  'AvivaCurve-Bold': 'avivacurve-bold',
};

css = css.replace(/url\(\.\.\/img\/([^)]+)\)/g, (_match, assetPath) => {
  return `url(${motorImgBase}${assetPath})`;
});

for (const [from, to] of Object.entries(fontMap)) {
  const pattern = new RegExp(`url\\(\\.\\./fonts/${from}\\.([^)]+)\\)`, 'g');
  css = css.replace(pattern, (_match, ext) => {
    const cleanExt = ext.replace(/\?#.*/, '');
    if (cleanExt === 'eot' || cleanExt === 'otf') {
      return `url(${fontBase}${to}.woff2)`;
    }
    return `url(${fontBase}${to}.${cleanExt})`;
  });
}

fs.writeFileSync(indexPath, css);
console.log('Patched', indexPath);
