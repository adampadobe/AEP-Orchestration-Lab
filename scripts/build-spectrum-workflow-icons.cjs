/**
 * Vendors SVGs from @adobe/spectrum-css-workflow-icons (Apache-2.0) into
 * web/profile-viewer/vendor/spectrum-workflow-icons/ and writes a JSON index
 * for the architecture diagram icon picker.
 *
 * Run: node scripts/build-spectrum-workflow-icons.cjs
 * Requires: npm install (devDependency on @adobe/spectrum-css-workflow-icons)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgRoot = path.join(root, 'node_modules/@adobe/spectrum-css-workflow-icons');
const manifestPath = path.join(pkgRoot, 'dist/manifest.json');
const svgSrcDir = path.join(pkgRoot, 'dist/assets/svg');
const destDir = path.join(root, 'web/profile-viewer/vendor/spectrum-workflow-icons');
const dataOut = path.join(root, 'web/profile-viewer/data/spectrum-workflow-icons.json');

function humanize(filename) {
  var base = filename.replace(/^S2_Icon_/i, '').replace(/_20_N\.svg$/i, '');
  return base
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

if (!fs.existsSync(manifestPath)) {
  console.error('Missing package. Run: npm install @adobe/spectrum-css-workflow-icons');
  process.exit(1);
}

var pkgJson = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
var files = manifest.svg;
if (!Array.isArray(files)) {
  console.error('Unexpected manifest format');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(path.join(pkgRoot, 'LICENSE'), path.join(destDir, 'LICENSE.txt'));

var icons = [];
for (var i = 0; i < files.length; i++) {
  var f = files[i];
  var from = path.join(svgSrcDir, f);
  if (!fs.existsSync(from)) {
    console.warn('Skip missing:', f);
    continue;
  }
  fs.copyFileSync(from, path.join(destDir, f));
  icons.push({ file: f, label: humanize(f) });
}

fs.mkdirSync(path.dirname(dataOut), { recursive: true });
fs.writeFileSync(
  dataOut,
  JSON.stringify(
    {
      package: '@adobe/spectrum-css-workflow-icons',
      packageVersion: pkgJson.version,
      license: 'Apache-2.0',
      licenseNote:
        'Icons are from Adobe’s Spectrum CSS Workflow Icons. See vendor/spectrum-workflow-icons/LICENSE.txt',
      icons: icons,
    },
    null,
    2
  ),
  'utf8'
);

console.log('Vendored', icons.length, 'SVGs to web/profile-viewer/vendor/spectrum-workflow-icons/');
console.log('Wrote', path.relative(root, dataOut));
