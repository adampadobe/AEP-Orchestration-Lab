'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TRAVEL_PROFILE_COLUMNS,
  buildQueryProfilesSql,
  mapTravelProfileRow,
  readPhaseTableDdl,
  PHASE_TABLES,
} = require('../snowflakeAgenticTravelService');
const { COLUMNS } = require('../snowflakeTravelProfileSchema');
const { COLUMNS: FSI_COLUMNS, TABLE: FSI_TABLE } = require('../snowflakeFsiProfileSchema');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function guardedService({ rows = [], error, connectError } = {}) {
  const queries = [];
  const runnerCalls = [];
  let destroyed = false;
  const filename = require.resolve('../snowflakeAgenticTravelService');
  const originalRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, Buffer, console, URL, AbortController, setTimeout, clearTimeout,
    process: { env: { AGENTIC_TRAVEL_RUNNER_URL: 'https://runner.example.invalid', AGENTIC_TRAVEL_RUNNER_HMAC_SECRET: 'offline-fixture' } },
    fetch: async (url, init) => {
      runnerCalls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
    require(id) {
      if (id === './snowflakeConnectionStore') return { resolveConnection: async () => ({
        config: { database: 'TARGET_DB', schema: 'CUSTOM_SCHEMA' },
      }) };
      if (id === './snowflakeService') return {
        buildSnowflakeConnectOptions: () => ({ database: 'TARGET_DB', schema: 'CUSTOM_SCHEMA', password: 'offline-only' }),
        describeConnectError: (e) => ({ message: e.message }),
      };
      if (id === 'snowflake-sdk') return { createConnection: () => ({
        connect(callback) { callback(connectError); },
        execute(options) { queries.push(options); options.complete(error, null, rows); },
        destroy(callback) { destroyed = true; callback(); },
      }) };
      return originalRequire(id);
    },
  }, { filename });
  return { service: module.exports, queries, runnerCalls, destroyed: () => destroyed };
}

describe('legacy full generation allocator guard', () => {
  it('blocks the Python runner when the actual saved target has an allocator', async () => {
    const fixture = guardedService({ rows: [{ SEQUENCE_NAME: 'AEP_LAB_RECIPIENT_CRM_SEQUENCE' }] });
    const result = await fixture.service.handleAgenticGenerateFull({ labUser: 'test', sandbox: 'test', count: 2 });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'LEGACY_GENERATION_BLOCKED');
    assert.match(result.error.hints[0], /Seed recipients/);
    assert.equal(fixture.runnerCalls.length, 0);
    assert.match(fixture.queries[0].sqlText, /FROM TARGET_DB.INFORMATION_SCHEMA.SEQUENCES/);
    assert.deepEqual(Array.from(fixture.queries[0].binds), ['CUSTOM_SCHEMA', 'AEP_LAB_RECIPIENT_CRM_SEQUENCE']);
    assert.equal(fixture.destroyed(), true);
  });

  it('fails closed on metadata or connection errors without calling the runner', async () => {
    for (const options of [{ error: new Error('not authorized') }, { connectError: new Error('connection refused') }]) {
      const fixture = guardedService(options);
      const result = await fixture.service.handleAgenticGenerateFull({ labUser: 'test', sandbox: 'test', count: 1 });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'CRM_ALLOCATOR_CHECK_FAILED');
      assert.equal(fixture.runnerCalls.length, 0);
      assert.match(result.error.hints[0], /No legacy runner request/);
      if (!options.connectError) assert.equal(fixture.destroyed(), true);
    }
  });

  it('retains legacy generation on unmanaged targets after a successful metadata check', async () => {
    const fixture = guardedService();
    const result = await fixture.service.handleAgenticGenerateFull({ labUser: 'test', sandbox: 'test', count: 2 });
    assert.equal(result.ok, true);
    assert.equal(fixture.queries.length, 1);
    assert.equal(fixture.runnerCalls.length, 1);
    assert.match(fixture.runnerCalls[0].url, /internal\/generate$/);
    const body = JSON.parse(fixture.runnerCalls[0].init.body);
    assert.equal(body.count, 2);
    assert.equal(body.snowflake.database, 'TARGET_DB');
    assert.equal(body.snowflake.schema, 'CUSTOM_SCHEMA');
    assert.equal(fixture.destroyed(), true);
  });
});

describe('snowflakeAgenticTravelService query profiles', () => {
  it('TRAVEL_PROFILE_COLUMNS matches travel schema', () => {
    assert.deepEqual(TRAVEL_PROFILE_COLUMNS, COLUMNS);
    assert.ok(COLUMNS.includes('FIRSTNAME'));
    assert.ok(COLUMNS.includes('DATEOFBIRTH'));
    assert.ok(COLUMNS.includes('NATIONALITY'));
  });

  describe('snowflakeAgenticTravelService exact schema export', () => {
    it('reads all 16 allowlisted tables without executing DDL or selecting customer rows', async () => {
      const calls = [];
      const ddl = 'create or replace TABLE T (PRICE NUMBER(18,2), LABEL VARCHAR(64), ID NUMBER NOT NULL, PRIMARY KEY (ID));';
      const conn = {
        execute(options) {
          calls.push(options);
          options.complete(null, null, [{ TABLE_DDL: ddl }]);
        },
      };
      const definitions = [];
      for (const phase of Object.keys(PHASE_TABLES)) {
        definitions.push(...await readPhaseTableDdl(conn, { database: 'COLLEAGUE_DB', schema: 'LAB' }, phase));
      }
      assert.equal(definitions.length, 16);
      assert.deepEqual(definitions.map((entry) => entry.table), Object.values(PHASE_TABLES).flat());
      for (const [index, call] of calls.entries()) {
        assert.equal(call.sqlText, "SELECT GET_DDL('TABLE', ?) AS TABLE_DDL");
        assert.deepEqual(call.binds, [`COLLEAGUE_DB.LAB.${definitions[index].table}`]);
        assert.equal(definitions[index].ddl, ddl);
      }
    });

    it('rejects phases and target identifiers outside the allowlist before querying', async () => {
      const conn = { execute() { assert.fail('must not query'); } };
      for (const phase of ['phase4', 'constructor', '__proto__']) {
        await assert.rejects(readPhaseTableDdl(conn, { database: 'DB', schema: 'LAB' }, phase), /Invalid phase/);
      }
      await assert.rejects(
        readPhaseTableDdl(conn, { database: 'DB;DROP TABLE X', schema: 'LAB' }, 'phase1'),
        /invalid identifier/i,
      );
    });

    it('propagates permission errors and rejects incomplete schema exports', async () => {
      const denied = { execute(options) { options.complete(new Error('Insufficient privileges')); } };
      await assert.rejects(readPhaseTableDdl(denied, { database: 'DB', schema: 'LAB' }, 'phase1'), /Insufficient privileges/);
      const empty = { execute(options) { options.complete(null, null, []); } };
      await assert.rejects(readPhaseTableDdl(empty, { database: 'DB', schema: 'LAB' }, 'phase1'), /No table DDL returned/);
    });
  });

  it('buildQueryProfilesSql selects all travel columns', () => {
    const { sql, binds } = buildQueryProfilesSql({
      fqTable: 'TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER',
      limit: 10,
    });
    assert.match(sql, /SELECT 'R-' \|\| LEFT\(SHA2\(ECID, 256\), 32\) AS RECIPIENT_ID, CRMID, ECID, EMAIL/);
    assert.match(sql, /FIRSTNAME, LASTNAME, DATEOFBIRTH, GENDER, NATIONALITY/);
    assert.match(sql, /FROM TRAVEL_DATABASE\.AEP_SCHEMA\.AGENTIC_TRAVEL_PROFILE_CUSTOMER/);
    assert.match(sql, /LIMIT 10/);
    assert.deepEqual(binds, []);
  });

  it('buildQueryProfilesSql binds email and ecid filters', () => {
    const { sql, binds } = buildQueryProfilesSql({
      fqTable: 'DB.SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER',
      email: 'travel_demo+user22072024-2@gmail.com',
      ecid: '1234567890',
      limit: 1,
    });
    assert.match(sql, /UPPER\(EMAIL\) = UPPER\(\?\)/);
    assert.match(sql, /ECID = \?/);
    assert.deepEqual(binds, ['travel_demo+user22072024-2@gmail.com', '1234567890']);
    assert.match(sql, /LIMIT 1/);
  });

  it('buildQueryProfilesSql selects the requested industry columns', () => {
    const { sql } = buildQueryProfilesSql({
      fqTable: `DB.SCHEMA.${FSI_TABLE}`,
      columns: FSI_COLUMNS,
      limit: 5,
    });
    assert.match(sql, /HOUSEHOLDINCOME, CREDITSCOREBAND, CREDITSCORE/);
    assert.match(sql, new RegExp(`FROM DB\\.SCHEMA\\.${FSI_TABLE}`));
  });

  it('maps a non-travel row using its industry schema and table', () => {
    const row = FSI_COLUMNS.map((column) => column === 'EMAIL' ? 'fsi@example.com' : column === 'HOUSEHOLDINCOME' ? 600000 : null);
    const profile = mapTravelProfileRow(row, { columns: FSI_COLUMNS, table: FSI_TABLE });
    assert.equal(profile.email, 'fsi@example.com');
    assert.equal(profile.columns.HOUSEHOLDINCOME, 600000);
    assert.equal(profile.table, FSI_TABLE);
    assert.equal(Object.keys(profile.columns).length, FSI_COLUMNS.length);
  });

  it('mapTravelProfileRow returns full columns and backward-compat fields', () => {
    const row = COLUMNS.map((col) => {
      if (col === 'CRMID') return 'CRM-001';
      if (col === 'EMAIL') return 'jamie@example.com';
      if (col === 'ECID') return 'ecid-abc';
      if (col === 'FIRSTNAME') return 'Jamie';
      if (col === 'LASTNAME') return 'Brown';
      if (col === 'DATEOFBIRTH') return '1990-05-15';
      if (col === 'NATIONALITY') return 'GB';
      if (col === 'PRIMARYEMAIL') return 'jamie@example.com';
      if (col === '_RECORDCREATEDTIMESTAMP') return '2026-07-22T10:00:00.000Z';
      return null;
    });
    const profile = mapTravelProfileRow(row);
    assert.equal(profile.crmId, 'CRM-001');
    assert.equal(profile.email, 'jamie@example.com');
    assert.equal(profile.firstName, 'Jamie');
    assert.equal(profile.lastName, 'Brown');
    assert.equal(profile.dateOfBirth, '1990-05-15');
    assert.equal(profile.nationality, 'GB');
    assert.equal(profile.columns.FIRSTNAME, 'Jamie');
    assert.equal(profile.columns.LASTNAME, 'Brown');
    assert.equal(profile.columns.DATEOFBIRTH, '1990-05-15');
    assert.equal(profile.columns.NATIONALITY, 'GB');
    assert.equal(Object.keys(profile.columns).length, COLUMNS.length);
    assert.equal(profile.table, 'AGENTIC_TRAVEL_PROFILE_CUSTOMER');
  });

  it('mapTravelProfileRow reads column-keyed Snowflake rows (not only arrays)', () => {
    const rowObject = {};
    for (const col of COLUMNS) {
      if (col === 'CRMID') rowObject[col] = 'CRM-002';
      else if (col === 'EMAIL') rowObject[col] = 'object-row@example.com';
      else if (col === 'ECID') rowObject[col] = 'ecid-object';
      else if (col === 'FIRSTNAME') rowObject[col] = 'Object';
      else if (col === 'LASTNAME') rowObject[col] = 'Row';
      else rowObject[col] = null;
    }
    const profile = mapTravelProfileRow(rowObject);
    assert.equal(profile.email, 'object-row@example.com');
    assert.equal(profile.ecid, 'ecid-object');
    assert.equal(profile.firstName, 'Object');
    assert.equal(profile.columns.EMAIL, 'object-row@example.com');
    assert.equal(profile.columns.FIRSTNAME, 'Object');
  });
});
