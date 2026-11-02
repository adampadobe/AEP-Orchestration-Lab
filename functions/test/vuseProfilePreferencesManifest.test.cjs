'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getManifestForIndustry, INDUSTRY_EXTENSIONS } = require('../profileCoreV2Manifest');
const { diffManifestAgainstMixin, buildTopUpJsonPatchOps } = require('../profileInfraFactory');
const brandPaths = ['vuse', 'velo', 'glo'].flatMap((brand) =>
  ['email', 'sms', 'whatsapp'].map((channel) => `preferences.brands.${brand}.${channel}`)
);
const manifest = Object.fromEntries(brandPaths.map((path) => [path, getManifestForIndustry('generic')[path]]));

test('nine optional brand booleans are Generic-only, without defaults or global marketing consent', () => {
  for (const path of brandPaths) {
    assert.equal(manifest[path].type, 'boolean');
    assert.equal(manifest[path].default, undefined);
    assert.deepEqual(manifest[path].required, []);
    for (const industry of Object.keys(INDUSTRY_EXTENSIONS).filter((key) => key !== 'generic')) {
      assert.equal(getManifestForIndustry(industry)[path], undefined);
    }
  }
  assert.equal(brandPaths.length, 9);
  assert.equal(Object.keys(manifest).some((path) => path.startsWith('consents.')), false);
});
test('local preflight builds one additive schema subtree without calling APIs', () => {
  const diff = diffManifestAgainstMixin(manifest, new Set(), new Map(), new Set());
  assert.deepEqual(diff.conflicts, []);
  const ops = buildTopUpJsonPatchOps('_demoemea', diff.needsAdd);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'add');
  assert.equal(ops[0].path, '/definitions/customFields/properties/_demoemea/properties/preferences');
  for (const brand of ['vuse', 'velo', 'glo']) for (const channel of ['email', 'sms', 'whatsapp']) {
    assert.equal(ops[0].value.properties.brands.properties[brand].properties[channel].type, 'boolean');
  }
});
test('schema preflight preserves existing siblings and reports type/ref conflicts instead of replacing', () => {
  const nodes = new Map([
    ['preferences', { type: 'object' }],
    ['preferences.preferredLanguage', { type: 'string' }],
    ['preferences.brands', { type: 'object' }],
    ['preferences.brands.vuse', { type: 'object' }],
    ['preferences.brands.vuse.email', { type: 'string' }]
  ]);
  const diff = diffManifestAgainstMixin(manifest, new Set(nodes.keys()), nodes, new Set());
  assert.equal(diff.conflicts.length, 1);
  assert.equal(diff.conflicts[0].path, 'preferences.brands.vuse.email');
  assert.equal(diff.needsAdd.some((item) => item.path === 'preferences'), false);
  const ops = buildTopUpJsonPatchOps('_tenant', diff.needsAdd);
  assert.equal(ops.every((op) => op.op === 'add' && !op.path.endsWith('/email')), true);
  const blocked = diffManifestAgainstMixin(manifest, new Set(nodes.keys()), nodes, new Set(['preferences']));
  assert.equal(blocked.needsAdd.length, 0);
  assert.equal(blocked.conflicts.length, 8);
});
