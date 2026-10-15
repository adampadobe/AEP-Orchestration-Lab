'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { buildInsertSql, insertRows } = require('../snowflakeIndustryEventService');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { generateIndustryProfileRow } = require('../snowflakeIndustryProfileGenerator');
const { generateIndustryEventRows } = require('../snowflakeIndustryEventGenerator');
const { buildSeedRecord, writeSeedRecords } = require('../snowflakeSeedStore');
const { listIndustryEventTables } = require('../snowflakeIndustryEventRegistry');
const { snowflakeMemoryFixture } = require('./snowflakeMemoryFixture.cjs');

const CFG = { database: 'DB', schema: 'AEP_SCHEMA', warehouse: 'WH' };
const STAMP = '2026-10-15T12:00:00Z';
function enrichService(db) {
  const filename = require.resolve('../snowflakeIndustryEventService');
  const originalRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, Buffer, console,
    require(id) {
      return id === './snowflakeIndustryCatalogService'
        ? { withSnowflakeConnection: async (_user, _sandbox, work) => work(db.connection, CFG) }
        : originalRequire(id);
    },
  }, { filename });
  return module.exports;
}

describe('Snowflake industry event inserts', () => {
  it('uses SELECT for ARRAY expressions because Snowflake rejects them in VALUES', () => {
    const sql = buildInsertSql(
      'TRAVEL_DATABASE.AEP_SCHEMA.EVENTS',
      {
        columns: ['EVENTID', 'ITEMS'],
        arrayColumns: ['ITEMS'],
      },
      2,
    );

    assert.equal(
      sql,
      'INSERT INTO TRAVEL_DATABASE.AEP_SCHEMA.EVENTS (EVENTID, ITEMS) ' +
        'SELECT ?, PARSE_JSON(?)::ARRAY UNION ALL SELECT ?, PARSE_JSON(?)::ARRAY',
    );
    assert.doesNotMatch(sql, /\bVALUES\b/);
  });

  it('commits all chunks together so GENERATIONID retries cannot skip a partially written table', async () => {
    const calls = [];
    const conn = { execute(options) { calls.push(options); options.complete(null, null, []); } };
    const count = await insertRows(conn, 'COLLEAGUE_DB.LAB.EVENTS', {
      columns: ['GENERATIONID', 'ITEMS'], arrayColumns: ['ITEMS'],
    }, [{ GENERATIONID: 'g1', ITEMS: ['one'] }, { GENERATIONID: 'g1', ITEMS: ['two'] }], 1);
    assert.equal(count, 2);
    assert.deepEqual(calls.map(({ sqlText }) => sqlText.split(' ')[0]), ['BEGIN', 'INSERT', 'INSERT', 'COMMIT']);
    assert.deepEqual(calls[1].binds, ['g1', '["one"]']);
  });

  it('rolls back the first chunk when a later chunk fails, and surfaces the failure', async () => {
    const calls = [];
    const conn = {
      execute(options) {
        calls.push(options.sqlText);
        options.complete(calls.length === 3 ? new Error('second chunk rejected') : null, null, []);
      },
    };
    await assert.rejects(insertRows(conn, 'DB.LAB.EVENTS', {
      columns: ['GENERATIONID'], arrayColumns: [],
    }, [{ GENERATIONID: 'g1' }, { GENERATIONID: 'g1' }], 1), /second chunk rejected/);
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.ok(!calls.includes('COMMIT'));
  });

  it('does not open a transaction for intentionally empty activity', async () => {
    assert.equal(await insertRows({ execute() { assert.fail('no query expected'); } }, 'DB.LAB.EVENTS', {
      columns: [], arrayColumns: [],
    }, []), 0);
  });

  for (const industry of ['fsi', 'retail', 'telecom', 'media', 'sports']) {
    it(`${industry} seed, enrich and repeat preserve actual row identities and counts`, async () => {
      const db = snowflakeMemoryFixture();
      const profile = generateIndustryProfileRow(industry, {
        idx: 1000, ecid: '12345678901234567890123456789012345678', email: 'demo@example.com', runStamp: STAMP,
        attributes: { 'industrySports.fanFlags.betsRegularly': true },
      }).rowObject;
      const record = buildSeedRecord(industry, profile, { index: 0, asOfDate: '2026-10-15', runStamp: STAMP });
      await writeSeedRecords(db.execute, CFG, industry, [record]);
      const original = new Map(listIndustryEventTables(industry).map((table) => [
        table.table, structuredClone(db.rows(`DB.AEP_SCHEMA.${table.table}`)),
      ]));
      const regenerated = generateIndustryEventRows(industry, record.profile, { now: STAMP });
      for (const table of listIndustryEventTables(industry)) {
        assert.deepEqual(record.events.rowsByType[table.key], regenerated.rowsByType[table.key]);
      }
      const service = enrichService(db);
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await service.handleIndustryEnrich({
          labUser: 'offline', sandbox: 'test', industry, profiles: [{ ecid: profile.ECID }],
        });
        assert.equal(result.ok, true);
        assert.equal(result.insertedRowCount, 0);
        for (const table of listIndustryEventTables(industry)) {
          assert.deepEqual(db.rows(`DB.AEP_SCHEMA.${table.table}`), original.get(table.table));
          assert.ok(result.profileResults[0].tableResults.find((item) => item.eventType === table.key).idempotent
            || !original.get(table.table).length);
        }
      }
    });

    it(`${industry} enrich-only followed by seed and enrich does not duplicate historical generations`, async () => {
      const db = snowflakeMemoryFixture();
      const profile = generateIndustryProfileRow(industry, {
        idx: 1000, ecid: `ecid-${industry}`, email: 'demo@example.com', runStamp: STAMP,
      }).rowObject;
      const { getIndustryProfileConfig } = require('../snowflakeIndustryProfileRegistry');
      db.rows(`DB.AEP_SCHEMA.${getIndustryProfileConfig(industry).table}`).push(profile);
      const service = enrichService(db);
      const input = { labUser: 'offline', sandbox: 'test', industry, profiles: [{ ecid: profile.ECID }] };
      const first = await service.handleIndustryEnrich(input);
      assert.ok(first.insertedRowCount > 0);
      const counts = listIndustryEventTables(industry).map((table) => db.rows(`DB.AEP_SCHEMA.${table.table}`).length);
      assert.equal((await service.handleIndustryEnrich(input)).insertedRowCount, 0);
      const record = buildSeedRecord(industry, profile, { index: 0, asOfDate: '2026-10-15', runStamp: STAMP });
      await writeSeedRecords(db.execute, CFG, industry, [record]);
      assert.deepEqual(listIndustryEventTables(industry).map((table) => db.rows(`DB.AEP_SCHEMA.${table.table}`).length), counts);
      assert.equal((await service.handleIndustryEnrich(input)).insertedRowCount, 0);
    });
  }

  it('recognizes legacy unsuffixed enrichment generations without inserting another snapshot', async () => {
    const db = snowflakeMemoryFixture();
    const profile = { ECID: 'legacy-ecid', EMAIL: 'legacy@example.com', CRMID: 'CRM1000' };
    db.rows('DB.AEP_SCHEMA.AGENTIC_RETAIL_PROFILE_CUSTOMER').push(profile);
    const generated = generateIndustryEventRows('retail', profile, { now: STAMP, eventTypes: ['rewards'] });
    db.rows('DB.AEP_SCHEMA.AGENTIC_RETAIL_PROFILE_REWARDS').push({
      ...generated.rowsByType.rewards[0], GENERATIONID: generated.generationId,
    });
    const result = await enrichService(db).handleIndustryEnrich({
      labUser: 'offline', sandbox: 'test', industry: 'retail', profiles: [{ ecid: profile.ECID }], eventTypes: ['rewards'],
    });
    assert.equal(result.insertedRowCount, 0);
    assert.equal(db.rows('DB.AEP_SCHEMA.AGENTIC_RETAIL_PROFILE_REWARDS').length, 1);
  });
});
