import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const pages = [
  { file: 'index.html', prefix: '' },
  { file: 'step1-registration.html', prefix: '' },
  { file: 'quote/Direct/Motor/vehicle-details.html', prefix: '../../../' },
  { file: 'quote/Direct/Motor/driver-details.html', prefix: '../../../' },
  { file: 'quote/Direct/Motor/additional-information.html', prefix: '../../../' },
  { file: 'quote/Direct/Motor/driver-quote.html', prefix: '../../../' },
];

const headScripts = [
  'aviva-target-vec.js',
  'aviva-target-sdk-resume.js',
  'aviva-target-personalization.js',
];

const cookieScript = 'aviva-demo-head.js';
const journeyChromeScript = 'aviva-target-journey-chrome.js';

for (const { file, prefix } of pages) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    console.log('Skip missing:', file);
    continue;
  }
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('location.replace(') && html.length < 600) {
    console.log('Skip redirect stub:', file);
    continue;
  }
  let changed = false;

  for (const name of headScripts) {
    const tag = `<script src="${prefix}${name}"></script>`;
    if (html.includes(name)) continue;
    html = html.replace('<head>', `<head>\n    ${tag}`);
    changed = true;
  }

  const isLanding = file === 'index.html';
  const cookieTag = `<script src="${prefix}${cookieScript}"></script>`;
  if (!isLanding && !html.includes(cookieScript)) {
    html = html.replace('<head>', `<head>\n    ${cookieTag}`);
    changed = true;
  }

  const journeyTag = `<script src="${prefix}aviva-journey-patch.js" defer></script>`;
  if (!html.includes('aviva-journey-patch.js')) {
    html = html.replace('</body>', `  ${journeyTag}\n</body>`);
    changed = true;
  }

  const chromeTag = `<script src="${prefix}${journeyChromeScript}" defer></script>`;
  if (!html.includes(journeyChromeScript)) {
    html = html.replace('</body>', `  ${chromeTag}\n</body>`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, html);
    console.log('Updated', file);
  } else {
    console.log('Skip (already wired):', file);
  }
}
