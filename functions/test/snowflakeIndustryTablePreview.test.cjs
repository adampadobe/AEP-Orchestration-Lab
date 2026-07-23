'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  projectManifest,
  clampPreviewLimit,
  validatePreviewTable,
  buildPreviewSql,
} = require('../snowflakeIndustryCatalogService');

const INDUSTRIES = ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports'];

test('preview accepts every governed table for each industry', () => {
  for (const industry of INDUSTRIES) {
    const manifest = projectManifest(industry);
    assert.ok(manifest);
    for (const table of manifest.allTables) {
      const result = validatePreviewTable(industry, table.toLowerCase());
      assert.equal(result.ok, true);
      assert.equal(result.table, table);
    }
  }
});

test('preview rejects arbitrary and cross-industry table names', () => {
  const arbitrary = validatePreviewTable('travel', 'CUSTOM_UNSAFE_TABLE');
  assert.equal(arbitrary.ok, false);
  assert.equal(arbitrary.error.code, 'TABLE_NOT_ALLOWLISTED');

  const fsiTable = projectManifest('fsi').allTables[0];
  const crossIndustry = validatePreviewTable('travel', fsiTable);
  assert.equal(crossIndustry.ok, false);
  assert.equal(crossIndustry.error.code, 'TABLE_NOT_ALLOWLISTED');
});

test('preview limit defaults and remains bounded', () => {
  assert.equal(clampPreviewLimit(undefined), 10);
  assert.equal(clampPreviewLimit('not-a-number'), 10);
  assert.equal(clampPreviewLimit(0), 1);
  assert.equal(clampPreviewLimit(12), 12);
  assert.equal(clampPreviewLimit(500), 50);
});

test('preview SQL uses validated identifiers, explicit columns, ordering, and bounded limit', () => {
  const sql = buildPreviewSql(
    'AGENTICAI',
    'TRAVEL',
    'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
    ['CRMID', 'EMAIL', '_RECORDCREATEDTIMESTAMP'],
    '_RECORDCREATEDTIMESTAMP',
    500,
  );
  assert.equal(
    sql,
    'SELECT CRMID, EMAIL, _RECORDCREATEDTIMESTAMP ' +
      'FROM AGENTICAI.TRAVEL.AGENTIC_TRAVEL_PROFILE_CUSTOMER ' +
      'ORDER BY _RECORDCREATEDTIMESTAMP DESC LIMIT 50',
  );
});
