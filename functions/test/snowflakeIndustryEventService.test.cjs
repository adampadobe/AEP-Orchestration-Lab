'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { buildInsertSql } = require('../snowflakeIndustryEventService');

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
});
