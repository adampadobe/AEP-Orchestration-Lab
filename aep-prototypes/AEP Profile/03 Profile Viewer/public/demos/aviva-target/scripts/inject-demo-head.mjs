import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const pages = [
  'step1-registration.html',
  'step1-vehicle-details.html',
  'step2-driver.html',
  'step3-additional.html',
  'step4-quote.html',
];

const tag = '<script src="aviva-demo-head.js"></script>';

for (const file of pages) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) continue;
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('aviva-demo-head.js')) {
    console.log('Skip (already has head script):', file);
    continue;
  }
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n    ${tag}`);
  } else {
    continue;
  }
  fs.writeFileSync(filePath, html);
  console.log('Injected aviva-demo-head.js into', file);
}
