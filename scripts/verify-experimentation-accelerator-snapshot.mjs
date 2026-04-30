/**
 * Guardrail: fail if canonical Experimentation Accelerator files lose expected
 * integration points (early Customise apply, global sandbox shell line, etc.).
 * Run after editing web/profile-viewer/experimentation-accelerator* or before
 * deploying hosting from a branch that should carry the full accelerator UI.
 *
 * See CONTRIBUTING.md — Profile Viewer UI under web/profile-viewer/ is canonical.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pv = path.join(root, 'web', 'profile-viewer');

function read(rel) {
  return fs.readFileSync(path.join(pv, rel), 'utf8');
}

const checks = [
  {
    file: 'experimentation-accelerator-customise.js',
    mustInclude: [
      'function bootstrapPrefs',
      'function applyShellUserLine',
      'sandboxTechnicalNameFallback',
      'aep-global-sandbox-change',
      'applyLatestUpdateTitles',
    ],
  },
  {
    file: 'experimentation-accelerator.html',
    mustInclude: ['id="expAccelShellUserLine"', 'experimentation-accelerator-customise.js?v=', '<script src="experimentation-accelerator-customise.js'],
  },
  {
    file: 'experimentation-accelerator-experiment.html',
    mustInclude: ['id="expAccelShellUserLine"', 'experimentation-accelerator-customise.js?v='],
  },
];

let failed = false;
for (const { file, mustInclude } of checks) {
  let text;
  try {
    text = read(file);
  } catch (e) {
    console.error(`FAIL: missing or unreadable ${file}`);
    failed = true;
    continue;
  }
  for (const needle of mustInclude) {
    if (!text.includes(needle)) {
      console.error(`FAIL: ${file} must contain: ${needle}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('\nExperimentation Accelerator snapshot checks failed. Restore from branch cursor/bc-launcher-hosted-icon or tag exp-accelerator-ui-snapshot.');
  process.exit(1);
}
console.log('OK: experimentation-accelerator snapshot (canonical web/profile-viewer)');
