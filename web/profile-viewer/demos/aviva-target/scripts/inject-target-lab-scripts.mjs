import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const pages = [
  'index.html',
  'step1-registration.html',
  'step1-vehicle-details.html',
  'step2-driver.html',
  'step3-additional.html',
  'step4-quote.html',
];

const headScripts = [
  '<script src="aviva-target-sdk-resume.js"></script>',
  '<script src="aviva-target-personalization.js"></script>',
];

const cookieScript = '<script src="aviva-demo-head.js"></script>';

for (const file of pages) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) continue;
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const tag of headScripts) {
    if (html.includes(tag)) continue;
    html = html.replace('<head>', '<head>\n    ' + tag);
    changed = true;
  }

  if (file !== 'index.html' && !html.includes('aviva-demo-head.js')) {
    html = html.replace('<head>', '<head>\n    ' + cookieScript);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, html);
    console.log('Updated', file);
  } else {
    console.log('Skip (already wired):', file);
  }
}
