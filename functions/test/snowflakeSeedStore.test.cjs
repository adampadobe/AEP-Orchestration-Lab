'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateTravelProfileRow } = require('../snowflakeTravelProfileGenerator');
const { generateIndustryProfileRow } = require('../snowflakeIndustryProfileGenerator');
const { seedNewProfiles } = require('../scripts/generate-relational-snowflake');
const { prepareSeedTables, buildSeedRecord, writeSeedRecords, getNextSeedCrmIndex, readNextSeedCrmIndex, planCrmSequenceMigration } = require('../snowflakeSeedStore');
const { getIndustryProfileConfig, listSnowflakeProfileIndustries } = require('../snowflakeIndustryProfileRegistry');
const { listIndustryEventTables } = require('../snowflakeIndustryEventRegistry');
const travelDefinitions = require('../snowflakeTravelTableDefinitions.json');
const { RECIPIENT_COLUMNS } = require('../snowflakeRecipientStore');
const { snowflakeMemoryFixture } = require('./snowflakeMemoryFixture.cjs');

const CFG = { database: 'DEMO_DB', schema: 'CUSTOM_SCHEMA', warehouse: 'DEMO_WH' };
const STAMP = '2026-10-15T12:00:00.000Z';

function allocationResponse(sql) {
  if (sql.startsWith('SELECT "INCREMENT"')) return [{ INCREMENT: 1000 }];
  if (sql.endsWith('.NEXTVAL AS START_INDEX')) return [{ START_INDEX: 1000 }];
  return [];
}

function record(industry, index = 0) {
  const input = {
    idx: 1000 + index, crmId: `CRM${1000 + index}`, ecid: `ecid-${index}`,
    email: `demo${index}@example.com`, runStamp: STAMP,
  };
  const generated = industry === 'travel'
    ? generateTravelProfileRow(input) : generateIndustryProfileRow(industry, input);
  return buildSeedRecord(industry, generated.rowObject, {
    index, asOfDate: '2026-10-15', runStamp: STAMP,
  });
}

describe('Snowflake-first shared base seeding', () => {
  for (const industry of listSnowflakeProfileIndustries()) {
    it(`prepares only the shared parent and selected ${industry} schema in the configured database`, async () => {
      const calls = [];
      await prepareSeedTables(async (sql) => { calls.push(sql); return []; }, CFG, industry);
      assert.ok(calls.some((sql) => /CREATE TABLE IF NOT EXISTS DEMO_DB\.CUSTOM_SCHEMA\.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE/.test(sql)));
      assert.ok(calls.some((sql) => sql.includes(`CREATE VIEW IF NOT EXISTS DEMO_DB.REL.RECIPIENT`)));
      assert.ok(calls.some((sql) => sql.includes(getIndustryProfileConfig(industry).table)));
      assert.doesNotMatch(calls.join('\n'), /CREATE OR REPLACE|DROP TABLE|CREATE TABLE IF NOT EXISTS .*REL\.RECIPIENT/);
      assert.doesNotMatch(calls.join('\n'), /AEP_SCHEMA\.|r\.INDUSTRY =|r\.CRMID =/);
      assert.doesNotMatch(calls.join('\n'), /DEMO_DB\.DEMO_DB/);
      assert.equal(calls.some((sql) => sql === 'BEGIN TRANSACTION'), false);
      assert.equal(calls.some((sql) => sql.startsWith('MERGE INTO')), false);
    });

    it(`writes ${industry} base, profile, and nonempty detail rows in one transaction`, async () => {
      const item = record(industry);
      assert.equal(item.profile.RECIPIENT_ID, item.parent.RECIPIENT_ID);
      assert.equal(item.parent.ECID, item.profile.ECID);
      if (item.trip) {
        assert.equal(item.trip.reservation.recipient_id, item.parent.RECIPIENT_ID);
        assert.equal(item.parent.UPCOMINGHOLIDAYDATE, item.trip.segments[0].departure_utc.slice(0, 10));
      }
      const calls = [];
      const counts = await writeSeedRecords(async (sql, binds) => {
        calls.push({ sql, binds }); return [];
      }, CFG, industry, [item]);
      assert.equal(calls[0].sql, 'BEGIN TRANSACTION');
      assert.equal(calls.at(-1).sql, 'COMMIT');
      assert.match(calls[1].sql, /MERGE INTO DEMO_DB\.CUSTOM_SCHEMA\.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE/);
      assert.ok(calls[1].binds.includes(item.parent.RECIPIENT_ID));
      assert.ok(calls[1].sql.includes('HOMEADDRESS_CITY'));
      assert.ok(calls[1].sql.includes('PERSONALEMAIL_ADDRESS'));
      assert.ok(calls.some(({ sql }) => sql.includes(getIndustryProfileConfig(industry).table)));
      assert.ok(Object.values(counts).some((count) => count > 1));
      assert.doesNotMatch(calls.map(({ sql }) => sql).join('\n'), /CREATE |ALTER |DROP /);
      if (industry !== 'travel') {
        for (const table of listIndustryEventTables(industry)) {
          assert.ok(Object.hasOwn(counts, `DEMO_DB.CUSTOM_SCHEMA.${table.table}`));
        }
      }
    });
  }

  it('rolls back the base and every child when an industry write fails', async () => {
    const calls = [];
    await assert.rejects(writeSeedRecords(async (sql) => {
      calls.push(sql);
      if (sql.includes('REL_TRAVEL_FLIGHT_SEGMENT')) throw new Error('injected segment failure');
      return [];
    }, CFG, 'travel', [record('travel')]), /injected segment failure/);
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.equal(calls.includes('COMMIT'), false);
  });

  it('surfaces rollback failures rather than returning seed success', async () => {
    await assert.rejects(writeSeedRecords(async (sql) => {
      if (sql.startsWith('MERGE') || sql === 'ROLLBACK') throw new Error('injected failure');
      return [];
    }, CFG, 'retail', [record('retail')]), AggregateError);
  });

  it('fits generated travel events to existing source columns, BOOLEAN types, and VARCHAR limits', () => {
    for (let index = 0; index < 10; index += 1) {
      const { trip } = record('travel', index);
      for (const [table, rows] of [
        ['AGENTIC_TRAVEL_EVENT_BOOKING', [trip.bookingEvent]],
        ['AGENTIC_TRAVEL_EVENT_DISRUPTION', trip.disruptionEvents],
      ]) {
        const ddl = travelDefinitions.find((definition) => definition.table === table).columnDdl;
        const fields = new Map(ddl.map((column) => [column.split(' ')[0], column]));
        for (const row of rows) {
          for (const [column, value] of Object.entries(row)) {
            assert.ok(fields.has(column), `${table}.${column}`);
            if (value != null && /\bBOOLEAN\b/.test(fields.get(column))) {
              assert.equal(typeof value, 'boolean', `${table}.${column}`);
            }
            const max = fields.get(column).match(/VARCHAR\((\d+)\)/)?.[1];
            if (max && value != null) assert.ok(String(value).length <= Number(max), `${table}.${column}`);
          }
        }
      }
    }
  });

  it('uses recipient-scoped order and fixture keys with valid child links across seed batches', () => {
    const keys = new Set();
    for (let index = 0; index < 50; index += 1) {
      for (const industry of ['retail', 'sports']) {
        const rows = record(industry, index).events.rowsByType;
        const parents = industry === 'retail' ? rows.order : rows.attendance;
        const parentKey = industry === 'retail' ? 'ORDER_ID' : 'EVENT_ID';
        const ids = new Set(parents.map((row) => row[parentKey]));
        assert.equal(ids.size, parents.length);
        for (const id of ids) {
          assert.equal(keys.has(id), false);
          keys.add(id);
        }
        const children = industry === 'retail' ? rows.return : rows.betting;
        for (const row of children) assert.ok(ids.has(row[parentKey]));
      }
    }
  });

  it('seeds new people from an empty database and shares them across all six industries', async () => {
    const parentIds = [];
    const parentConsents = [];
    const counts = await seedNewProfiles(async (sql, binds) => {
      if (sql.startsWith('MERGE INTO DEMO_DB.CUSTOM_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE')) {
        parentIds.push(binds[0]);
        const prefix = sql.slice(0, sql.indexOf(' AS CONSENT_WHATSAPP'));
        parentConsents.push(binds[(prefix.match(/\?/g) || []).length - 1]);
      }
      return allocationResponse(sql);
    }, CFG, { industry: 'all', count: 1, heroProfiles: 1, asOfDate: '2026-10-15', baseEmail: 'demo@example.com' });
    assert.equal(counts.recipientsCreated, 1);
    assert.equal(Object.keys(counts.tableRowcounts).length, 6);
    assert.equal(parentIds.length, 6);
    assert.equal(new Set(parentIds).size, 1);
    assert.deepEqual(parentConsents, ['y', 'y', 'y', 'y', 'y', 'y']);
  });

  it('preserves travel-owned fields in the final all-industry parent while allowing explicit updates and clears', async () => {
    const db = snowflakeMemoryFixture();
    let travelParent;
    await seedNewProfiles(async (sql, binds) => {
      const result = db.execute(sql, binds);
      if (sql === 'COMMIT' && !travelParent) {
        travelParent = { ...db.rows('DEMO_DB.CUSTOM_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE')[0] };
      }
      return result;
    }, CFG, { industry: 'all', count: 1, heroProfiles: 1, asOfDate: '2026-10-15', baseEmail: 'demo@example.com' });
    const parentTable = 'DEMO_DB.CUSTOM_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE';
    const finalParent = db.rows(parentTable)[0];
    assert.equal(db.rows(parentTable).length, 1);
    assert.equal(finalParent.INDUSTRY, 'sports');
    for (const column of ['PASSPORTID', 'UPCOMINGHOLIDAYDATE', 'UPCOMINGHOLIDAYDESTINATION', 'PREFERREDSEATTYPE']) {
      assert.ok(travelParent[column], column);
      assert.equal(finalParent[column], travelParent[column], column);
    }
    const { mergeRecipientRows } = require('../snowflakeRecipientStore');
    await mergeRecipientRows(db.execute, CFG.database, [{
      RECIPIENT_ID: finalParent.RECIPIENT_ID, INDUSTRY: 'travel',
      UPCOMINGHOLIDAYDATE: null, UPCOMINGHOLIDAYDESTINATION: 'Updated destination',
      PREFERREDSEATTYPE: 'aisle', PASSPORTID: null,
    }], CFG.schema);
    assert.equal(finalParent.UPCOMINGHOLIDAYDATE, null);
    assert.equal(finalParent.PASSPORTID, null);
    assert.equal(finalParent.UPCOMINGHOLIDAYDESTINATION, 'Updated destination');
    assert.equal(finalParent.PREFERREDSEATTYPE, 'aisle');
  });

  it('references only actual source columns and stable timestamps in dynamic SQL', () => {
    const columnsByTable = new Map([['RECIPIENT', RECIPIENT_COLUMNS]]);
    for (const industry of listSnowflakeProfileIndustries()) {
      const config = getIndustryProfileConfig(industry);
      columnsByTable.set(config.table, config.columns);
      for (const table of listIndustryEventTables(industry)) columnsByTable.set(table.table, table.columns);
    }
    const directory = path.resolve(__dirname, '../sql/rel');
    for (const file of fs.readdirSync(directory).filter((name) => /^[2-6]0_/.test(name))) {
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      assert.doesNotMatch(sql, /CURRENT_TIMESTAMP/i);
      for (const statement of sql.split(';')) {
        const aliases = new Map([...statement.matchAll(
          /(?:AEP_SCHEMA\.([A-Z0-9_]+)|REL\.(RECIPIENT))\s+([a-z])\b/g,
        )].map((match) => [match[3], columnsByTable.get(match[1] || match[2])]));
        for (const [alias, columns] of aliases) {
          assert.ok(columns, `${file}: unknown source for ${alias}`);
          for (const [, column] of statement.matchAll(new RegExp(`\\b${alias}\\.([A-Z_][A-Z0-9_]*)\\b`, 'g'))) {
            assert.ok(columns.includes(column), `${file}: unknown ${alias}.${column}`);
          }
        }
      }
    }
  });

  it('rejects invalid CLI seed email before creating tables', async () => {
    await assert.rejects(seedNewProfiles(() => assert.fail('must not execute'), CFG, {
      baseEmail: 'not-an-email',
    }), /valid email/);
  });

  it('reads shared CRM ordinals from object or positional rows and propagates SQL errors', async () => {
    assert.equal(await readNextSeedCrmIndex(async () => [{ MX: 1200 }], CFG), 1201);
    assert.equal(await readNextSeedCrmIndex(async () => [[null]], CFG), 1000);
    assert.equal(await readNextSeedCrmIndex(async () => [[0]], CFG), 1);
    await assert.rejects(readNextSeedCrmIndex(async () => [{ MX: 'invalid' }], CFG), /ordinal is invalid/);
    await assert.rejects(readNextSeedCrmIndex(async () => { throw new Error('not authorized'); }, CFG), /not authorized/);
  });

  it('reports industries already committed if a later CLI industry fails', async () => {
    await assert.rejects(seedNewProfiles(async (sql) => {
      if (sql.startsWith('MERGE INTO') && sql.includes('AGENTIC_FSI_PROFILE_CUSTOMER target')) {
        throw new Error('injected FSI failure');
      }
      return allocationResponse(sql);
    }, CFG, { industry: 'all', count: 1, heroProfiles: 0, asOfDate: '2026-10-15', baseEmail: 'demo@example.com' }),
    /Previously committed industries: travel\. injected FSI failure/);
  });

  it('reserves disjoint blocks across concurrent sessions sharing stale MAX results', async () => {
    let next = 22001;
    const session = () => async (sql) => {
      if (sql.startsWith('SELECT "INCREMENT"')) return [{ INCREMENT: 1000 }];
      if (sql.startsWith('SELECT MAX')) { await new Promise((resolve) => setImmediate(resolve)); return [{ MX: 22000 }]; }
      if (sql.endsWith('.NEXTVAL AS START_INDEX')) {
        const start = next;
        next += 1000;
        return [[start]];
      }
      assert.fail(sql);
    };
    const starts = await Promise.all(Array.from({ length: 20 }, (_, index) => (
      getNextSeedCrmIndex(session(), CFG, [index % 2 ? 'fsi' : 'travel'], 1000)
    )));
    assert.equal(new Set(starts).size, 20);
    const ids = starts.flatMap((start) => Array.from({ length: 1000 }, (_, index) => `CRM${start + index}`));
    assert.equal(new Set(ids).size, 20000);
    assert.ok(starts.every((start) => start > 22000));
  });

  it('fails closed on missing privileges, incompatible sequences, stale allocations and oversize batches', async () => {
    await assert.rejects(getNextSeedCrmIndex(async () => { throw new Error('not authorized'); }, CFG), /not authorized/);
    for (const metadata of [[], [{ INCREMENT: 1 }], [{ INCREMENT: -1000 }]]) {
      const calls = [];
      await assert.rejects(getNextSeedCrmIndex(async (sql) => {
        calls.push(sql); return metadata;
      }, CFG), /MAX\+1 fallback is disabled/);
      assert.equal(calls.length, 1);
    }
    for (const start of [1200, null, 'invalid', Number.MAX_SAFE_INTEGER]) {
      await assert.rejects(getNextSeedCrmIndex(async (sql) => {
        if (sql.startsWith('SELECT "INCREMENT"')) return [{ INCREMENT: 1000 }];
        if (sql.startsWith('SELECT MAX')) return [{ MX: 1200 }];
        return [{ START_INDEX: start }];
      }, CFG), /behind existing rows|supported range/);
    }
    for (const count of [0, 1001, 1.5]) {
      await assert.rejects(getNextSeedCrmIndex(() => assert.fail('no SQL'), CFG, [], count), /allocation count/);
    }
  });

  it('plans initialization above all existing industry maxima without executing DDL or NEXTVAL', async () => {
    const calls = [];
    const plan = await planCrmSequenceMigration(async (sql) => {
      calls.push(sql);
      if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [
        ['AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE'], ['AGENTIC_RETAIL_PROFILE_CUSTOMER'], ['AGENTIC_FSI_PROFILE_CUSTOMER'],
      ];
      return [{ MX: 99999 }];
    }, CFG);
    assert.equal(plan.start, 100000);
    assert.equal(plan.scannedTables.length, 3);
    assert.match(plan.sql, /^CREATE SEQUENCE IF NOT EXISTS DEMO_DB.CUSTOM_SCHEMA.AEP_LAB_RECIPIENT_CRM_SEQUENCE START WITH 100000 INCREMENT BY 1000 ORDER;$/);
    assert.doesNotMatch(plan.sql, /REPLACE|ALTER/);
    assert.ok(calls.every((sql) => sql.startsWith('SELECT') && !sql.includes('NEXTVAL')));
    assert.match(plan.warning, /Stop every writer/);
  });

  it('concurrent bootstrap plans preserve the first allocator rather than restarting consumed blocks', async () => {
    const read = async (sql) => sql.includes('INFORMATION_SCHEMA.TABLES')
      ? [['AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE']] : [{ MX: 22000 }];
    const plans = await Promise.all([planCrmSequenceMigration(read, CFG), planCrmSequenceMigration(read, CFG)]);
    let allocator;
    function applyReviewedPlan(plan) {
      assert.match(plan.sql, /^CREATE SEQUENCE IF NOT EXISTS /);
      allocator ||= { next: plan.start, increment: plan.blockSize };
    }
    const session = async (sql) => {
      if (sql.startsWith('SELECT "INCREMENT"')) return [{ INCREMENT: allocator.increment }];
      if (sql.startsWith('SELECT MAX')) return [{ MX: 22000 }];
      const start = allocator.next;
      allocator.next += allocator.increment;
      return [{ START_INDEX: start }];
    };
    applyReviewedPlan(plans[0]);
    const first = await getNextSeedCrmIndex(session, CFG, [], 1000);
    applyReviewedPlan(plans[1]);
    const second = await getNextSeedCrmIndex(session, CFG, [], 1000);
    assert.equal(first, 22001);
    assert.equal(second, 23001);
  });
});
