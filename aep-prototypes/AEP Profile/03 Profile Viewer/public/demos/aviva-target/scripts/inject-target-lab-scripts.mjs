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

/** Must load first — blocks Aviva production Launch/DTM baked into saved HTML. */
const headScriptsFirst = ['aviva-target-suppress-prod-tags.js'];

const headScripts = [
  'aviva-target-vec.js',
  'aviva-target-sdk-resume.js',
  'aviva-target-personalization.js',
];

const cookieScript = 'aviva-demo-head.js';
const journeyChromeScript = 'aviva-target-journey-chrome.js';

function injectHeadScript(html, prefix, name) {
  if (html.includes(name)) return html;
  const tag = `<script src="${prefix}${name}"></script>`;
  return html.replace('<head>', `<head>\n    ${tag}`);
}

/** sdk-resume must run before personalization so alloy exists when sendEvent fires. */
function fixLabHeadScriptOrder(html) {
  const wrong =
    /(<script src="([^"]*)aviva-target-personalization\.js"><\/script>)\s*(<script src="([^"]*)aviva-target-sdk-resume\.js"><\/script>)/;
  if (!wrong.test(html)) return html;
  return html.replace(
    wrong,
    '<script src="$4aviva-target-sdk-resume.js"></script>\n    <script src="$2aviva-target-personalization.js"></script>'
  );
}

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
  const before = html;

  for (const name of headScriptsFirst) {
    const next = injectHeadScript(html, prefix, name);
    if (next !== html) changed = true;
    html = next;
  }

  for (const name of headScripts) {
    const next = injectHeadScript(html, prefix, name);
    if (next !== html) changed = true;
    html = next;
  }

  const ordered = fixLabHeadScriptOrder(html);
  if (ordered !== html) {
    html = ordered;
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

  if (changed || html !== before) {
    fs.writeFileSync(filePath, html);
    console.log('Updated', file);
  } else {
    console.log('Skip (already wired):', file);
  }
}
