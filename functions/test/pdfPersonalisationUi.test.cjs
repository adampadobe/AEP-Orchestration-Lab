'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const css = readFileSync(
  resolve(__dirname, '../../web/profile-viewer/pdf-personalisation.css'),
  'utf8',
);

test('keeps delivery progress sticky through the open transactional containers', () => {
  assert.match(
    css,
    /\.pdf-test-progress-card\s*\{[^}]*position:\s*sticky;[^}]*max-height:\s*calc\(100vh\s*-\s*36px\);[^}]*overflow-y:\s*auto;/s,
  );
  assert.match(
    css,
    /#pdfStageReuse\[open\],\s*#pdfJourneyTestDetails\[open\]\s*\{\s*overflow:\s*visible;\s*\}/s,
  );
});

test('uses a compact sticky progress rail when the form becomes one column', () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*1180px\)[\s\S]*?\.pdf-test-progress-card\s*\{[^}]*position:\s*sticky;[^}]*order:\s*-1;/s,
  );
  assert.match(css, /\.pdf-test-progress\s*\{\s*grid-template-columns:\s*repeat\(4,/s);
});
