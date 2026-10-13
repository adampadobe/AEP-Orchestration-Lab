'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { buildInsertSql, insertRows } = require('../snowflakeIndustryEventService');

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
});
