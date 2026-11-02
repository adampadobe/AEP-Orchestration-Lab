'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { resolve } = require('node:path');
const { getIndustryManifest, listSupportedIndustries } = require('../snowflakeIndustryManifest');
const { getProvisionRecipe, buildCreateTableStatements } = require('../snowflakeProvisionRecipes');
const { getIndustryProfileConfig } = require('../snowflakeIndustryProfileRegistry');
const { listIndustryEventTables } = require('../snowflakeIndustryEventRegistry');
const { generateIndustryProfileRow } = require('../snowflakeIndustryProfileGenerator');
const { generateTravelProfileRow } = require('../snowflakeTravelProfileGenerator');
const { generateIndustryEventRows } = require('../snowflakeIndustryEventGenerator');

function assertFitsDdl(row, definitions, label) {
  for (const ddl of definitions) {
    const [column, type] = ddl.split(/\s+/);
    if (/^(?:CONSTRAINT|PRIMARY)$/i.test(column)) continue;
    assert.ok(Object.hasOwn(row, column), `${label}.${column} missing`);
    const value = row[column];
    if (value == null) {
      assert.doesNotMatch(ddl, /NOT NULL/, `${label}.${column} requires a value`);
      continue;
    }
    if (type.startsWith('VARCHAR')) {
      assert.equal(typeof value, 'string', `${label}.${column}`);
      assert.ok(value.length <= Number(type.match(/\((\d+)\)/)[1]), `${label}.${column} exceeds length`);
    } else if (type.startsWith('NUMBER')) {
      assert.equal(typeof value, 'number', `${label}.${column}`);
      assert.ok(Number.isFinite(value), `${label}.${column}`);
      const [, precision, scale] = type.match(/NUMBER\((\d+),(\d+)\)/);
      assert.ok(Math.abs(value) < 10 ** (Number(precision) - Number(scale)), `${label}.${column} exceeds precision`);
      assert.ok(Math.abs(value - Number(value.toFixed(Number(scale)))) < 1e-8, `${label}.${column} exceeds scale`);
    } else if (type === 'ARRAY') {
      assert.ok(Array.isArray(value), `${label}.${column}`);
    } else if (type === 'BOOLEAN') {
      assert.equal(typeof value, 'boolean', `${label}.${column}`);
    }
  }
}

for (const industry of listSupportedIndustries()) {
  test(`${industry} setup recipe covers every UI catalog table in a colleague-owned target`, () => {
    const manifest = getIndustryManifest(industry);
    const recipe = getProvisionRecipe(`${industry}.all.v1`);
    const statements = buildCreateTableStatements(recipe, 'COLLEAGUE_DB', 'DEMO');
    assert.deepEqual(statements.map(({ table }) => table), manifest.allTables);
    assert.equal(new Set(statements.map(({ table }) => table)).size, manifest.allTables.length);
    for (const { sql, fqTable } of statements) {
      assert.ok(fqTable.startsWith('COLLEAGUE_DB.DEMO.'));
      assert.match(sql, /^CREATE TABLE IF NOT EXISTS /);
      assert.doesNotMatch(sql, /\b(?:REPLACE|DROP|ALTER|TRUNCATE|GRANT)\b/);
    }
    const profile = getIndustryProfileConfig(industry);
    const actualColumns = new Set(recipe.tables.find(({ table }) => table === profile.table)
      .columnDdl.map((ddl) => ddl.split(/\s+/)[0]));
    for (const column of profile.columns) assert.ok(actualColumns.has(column), `${industry}.${column}`);
  });

  if (industry === 'travel') continue;
  test(`${industry} realistic CRM and activity rows fit the exact provisioned schemas`, () => {
    const config = getIndustryProfileConfig(industry);
    for (let idx = 1; idx <= 20; idx += 1) {
      const generated = generateIndustryProfileRow(industry, {
        idx, email: `demo+13102026-${idx}@example.com`, ecid: String(idx).padStart(38, '0'),
        crmId: `CRM${idx}`, runStamp: '2026-10-13T12:00:00Z', attributes: {},
      });
      assertFitsDdl(generated.rowObject, config.columnDdl, config.table);
      const activity = generateIndustryEventRows(industry, generated.rowObject, { now: '2026-10-13T12:00:00Z' });
      for (const entry of listIndustryEventTables(industry)) {
        for (const row of activity.rowsByType[entry.key]) {
          assertFitsDdl(row, entry.columnDdl, entry.table);
          for (const column of ['EMAIL', 'ECID', 'CRMID']) {
            assert.equal(row[column], generated.rowObject[column]);
          }
        }
      }
    }
  });
}

test('travel source DDL retains monetary scale, arrays, defaults, nullability, and primary keys', () => {
  const recipe = getProvisionRecipe('travel.all.v1');
  const customer = recipe.tables.find(({ table }) => table === 'AGENTIC_TRAVEL_PROFILE_CUSTOMER');
  assert.ok(customer.columnDdl.includes('LIFETIMEVALUE NUMBER(12,2)'));
  assert.ok(customer.columnDdl.includes('AVERAGEBOOKINGVALUE NUMBER(12,2)'));
  assert.ok(customer.columnDdl.includes('PUSHTOKENS ARRAY'));
  const base = recipe.tables[0].columnDdl.join('\n');
  assert.match(base, /CRMID VARCHAR\(100\) NOT NULL/);
  assert.match(base, /PRIMARY KEY \(CRMID\)/i);
  const ancillary = recipe.tables.find(({ table }) => table === 'AGENTIC_TRAVEL_EVENT_ANCILLARIES');
  assert.ok(ancillary.columnDdl.includes('AMOUNT NUMBER(18,2) NOT NULL'));
  assert.match(ancillary.columnDdl.join('\n'), /DEFAULT CURRENT_TIMESTAMP\(\)/);
});

test('travel Snowflake-only CRM rows fit the captured portable customer schema', () => {
  const customer = getProvisionRecipe('travel.all.v1').tables.find(({ table }) => table === 'AGENTIC_TRAVEL_PROFILE_CUSTOMER');
  for (let idx = 1; idx <= 20; idx += 1) {
    const generated = generateTravelProfileRow({
      idx, email: `demo+13102026-${idx}@example.com`, ecid: String(idx).padStart(38, '0'),
      crmId: `CRM${idx}`, runStamp: '2026-10-13T12:00:00Z', attributes: {},
    });
    assertFitsDdl(generated.rowObject, customer.columnDdl, customer.table);
  }
});

test('Snowflake UI displays partial DDL results, invalidates failed preview, and preserves mirror parity', async () => {
  const root = resolve(__dirname, '../..');
  const source = readFileSync(resolve(root, 'web/profile-viewer/profile-generation-snowflake.js'), 'utf8');
  assert.equal(source, readFileSync(resolve(root, 'aep-prototypes/AEP Profile/03 Profile Viewer/public/profile-generation-snowflake.js'), 'utf8'));
  const result = {
    ok: false, executed: false, error: { message: 'Table creation stopped' },
    tableResults: [{ table: 'COLLEAGUE_DB.LAB.FIRST', ok: true }, { table: 'COLLEAGUE_DB.LAB.SECOND', ok: false, error: 'CREATE denied' }],
  };
  const requests = [];
  const requestUrls = [];
  const messages = [];
  const context = {
    industryCatalog: { manifest: {} },
    industryProvisionPreview: { key: 'colleague:travel:travel.all.v1', tables: ['COLLEAGUE_DB.LAB.FIRST'], fingerprint: 'preview' },
    selectedProvisionRecipe: () => ({ id: 'travel.all.v1', requiresConfirmation: true }),
    readSandbox: () => 'colleague', readIndustry: () => 'travel',
    window: { confirm: () => true },
    authHeaders: async () => ({ Authorization: 'test-only' }),
    readContext: () => ({}), isCurrentContext: () => true,
    contextHeaders: async () => ({ Authorization: 'test-only' }),
    snowflakeApiUrl: (name) => `https://us-central1-fixture-project.cloudfunctions.net/${name}`,
    fetch: async (url, init) => {
      requestUrls.push(url);
      requests.push(JSON.parse(init.body));
      return { ok: false, json: async () => ({ result }) };
    },
    els: { industryProvisionOut: { hidden: true, textContent: '' } },
    safeStringify: JSON.stringify, setIndustryBusy() {},
    setIndustryMessage: (message, tone) => messages.push({ message, tone }),
  };
  const functionSource = source.slice(source.indexOf('  function provisionIndustry(dryRun) {'), source.indexOf('  function setUpdaterMessage('));
  runInNewContext(`${functionSource}\nprovisionIndustry(false);`, context);
  await new Promise(setImmediate);
  assert.equal(requestUrls[0], 'https://us-central1-fixture-project.cloudfunctions.net/snowflakeProvision');
  assert.equal(requests[0].confirmed, true);
  assert.equal(requests[0].preview_fingerprint, 'preview');
  assert.equal(context.els.industryProvisionOut.hidden, false);
  assert.deepEqual(JSON.parse(context.els.industryProvisionOut.textContent), result);
  assert.equal(context.industryProvisionPreview, null);
  assert.equal(messages.at(-1).tone, 'error');
  runInNewContext(`${functionSource}\nprovisionIndustry(false);`, context);
  assert.equal(requests.length, 1, 'failed creation must require a new preview before retry');
});
