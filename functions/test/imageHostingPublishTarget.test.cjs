'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeExistingReplacementRelPath,
} = require('../imageHostingLibrary');

test('normalizes an existing library replacement target without changing its stable path', () => {
  assert.equal(normalizeExistingReplacementRelPath('/logo/logo.png'), 'logo/logo.png');
  assert.equal(normalizeExistingReplacementRelPath('customer/hero-banner.webp'), 'customer/hero-banner.webp');
});

test('rejects traversal, folders, and folder markers as replacement targets', () => {
  for (const value of ['', '../logo.png', 'customer/../logo.png', 'customer\\logo.png', 'customer/', 'customer/.aep-library-folder']) {
    assert.throws(
      () => normalizeExistingReplacementRelPath(value),
      /existing library file/,
      value,
    );
  }
});
