'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const corePath = path.resolve(__dirname, '../../web/profile-viewer/content-decision-surface-styles-core.js');
const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(corePath, 'utf8'), sandbox);
const core = sandbox.CdSurfaceStylesCore;

test('normaliseHex accepts 3/6 digit hex and lowercases', () => {
  assert.equal(core.normaliseHex('112233'), '#112233');
  assert.equal(core.normaliseHex('#ABC'), '#abc');
  assert.equal(core.normaliseHex('  #FF00AA  '), '#ff00aa');
  assert.equal(core.normaliseHex('not-a-color'), '');
  assert.equal(core.normaliseHex(''), '');
});

test('sanitizeMountMinHeight accepts px/rem and rejects injection', () => {
  assert.equal(core.sanitizeMountMinHeight('48px'), '48px');
  assert.equal(core.sanitizeMountMinHeight(' 6rem '), '6rem');
  assert.equal(core.sanitizeMountMinHeight(''), '');
  assert.equal(core.sanitizeMountMinHeight('32px; background: red'), '');
  assert.equal(core.sanitizeMountMinHeight('<script>'), '');
});

test('mountHeightPxFromCss parses px lengths only', () => {
  assert.equal(core.mountHeightPxFromCss('120px'), '120');
  assert.equal(core.mountHeightPxFromCss('6rem'), '');
  assert.equal(core.mountHeightPxFromCss(''), '');
});

test('mergeStyleEntry merges saved values with defaults', () => {
  const merged = core.mergeStyleEntry({ titleColor: '#ffffff', showTitle: false });
  assert.equal(merged.titleColor, '#ffffff');
  assert.equal(merged.showTitle, false);
  assert.equal(merged.layoutMode, core.STYLE_DEFAULTS_LAB.layoutMode);
  assert.equal(merged.descColor, core.STYLE_DEFAULTS_LAB.descColor);
});

test('pickLayout and pickJustify fall back to defaults for invalid values', () => {
  assert.equal(core.pickLayout('bogus', 'overlay'), 'overlay');
  assert.equal(core.pickLayout('half', 'overlay'), 'half');
  assert.equal(core.pickJustify('center', 'flex-start'), 'center');
  assert.equal(core.pickJustify('bogus', 'flex-end'), 'flex-end');
});

test('pickHex normalises or falls back', () => {
  assert.equal(core.pickHex('112233', '#000000'), '#112233');
  assert.equal(core.pickHex('invalid', '#aabbcc'), '#aabbcc');
});
