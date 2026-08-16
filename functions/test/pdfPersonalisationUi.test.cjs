'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const css = readFileSync(
  resolve(__dirname, '../../web/profile-viewer/pdf-personalisation.css'),
  'utf8',
);
const html = readFileSync(
  resolve(__dirname, '../../web/profile-viewer/pdf-personalisation.html'),
  'utf8',
);
const script = readFileSync(
  resolve(__dirname, '../../web/profile-viewer/pdf-personalisation.js'),
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

test('presents story assistance as complete scenario generation', () => {
  assert.match(html, /invents a coherent fictional scenario for everything omitted/);
  assert.match(html, /generate every other passenger, booking, flight and check-in detail/);
  assert.match(script, /currentValues:\s*currentTestFieldValues\(\)/);
  assert.match(script, /Generating a complete scenario for every template field/);
});

test('lets publishers add, remove, and custom-map template fields', () => {
  assert.match(html, /id="pdfAddJourneyTemplateField"/);
  assert.match(html, /existing or new lowerCamelCase AJO/);
  assert.match(script, /createJourneyTemplateMappingRow/);
  assert.match(script, /pdf-template-mapping-remove/);
  assert.match(script, /fieldSelectionMode:\s*'editable'/);
  assert.match(script, /journeyMappingSourceValid/);
});
