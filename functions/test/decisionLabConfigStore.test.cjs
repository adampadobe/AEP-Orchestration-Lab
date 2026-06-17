'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeSurfaceStyleEntry,
  sanitizeSurfaceStyles,
  sanitizeMountMinHeight,
} = require('../decisionLabConfigStore');

test('sanitizeMountMinHeight accepts px lengths and rejects injection', () => {
  assert.equal(sanitizeMountMinHeight('48px'), '48px');
  assert.equal(sanitizeMountMinHeight(' 6rem '), '6rem');
  assert.equal(sanitizeMountMinHeight(''), '');
  assert.equal(sanitizeMountMinHeight('32px; background: red'), '');
  assert.equal(sanitizeMountMinHeight('<script>'), '');
});

test('sanitizeSurfaceStyleEntry persists mountMinHeight and visibility flags', () => {
  const entry = sanitizeSurfaceStyleEntry({
    layoutMode: 'overlay',
    titleColor: '#112233',
    mountMinHeight: '40px',
    showTitle: false,
    showDesc: true,
    showCta: false,
    showImage: true,
    updatedAt: '2026-06-15T12:00:00.000Z',
  });
  assert.ok(entry);
  assert.equal(entry.mountMinHeight, '40px');
  assert.equal(entry.showTitle, false);
  assert.equal(entry.showDesc, true);
  assert.equal(entry.showCta, false);
  assert.equal(entry.showImage, true);
  assert.equal(entry.titleColor, '#112233');
});

test('sanitizeSurfaceStyles keeps per-fragment height keyed by fragment id', () => {
  const out = sanitizeSurfaceStyles({
    TopRibbon: { mountMinHeight: '32px', titleColor: '#ffffff' },
    'hero-banner': { mountMinHeight: '420px', titleColor: '#eeeeee' },
  });
  assert.equal(out.TopRibbon.mountMinHeight, '32px');
  assert.equal(out['hero-banner'].mountMinHeight, '420px');
});
