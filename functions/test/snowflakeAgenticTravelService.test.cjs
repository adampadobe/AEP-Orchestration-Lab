'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TRAVEL_PROFILE_COLUMNS,
  buildQueryProfilesSql,
  mapTravelProfileRow,
} = require('../snowflakeAgenticTravelService');
const { COLUMNS } = require('../snowflakeTravelProfileSchema');

describe('snowflakeAgenticTravelService query profiles', () => {
  it('TRAVEL_PROFILE_COLUMNS matches travel schema', () => {
    assert.deepEqual(TRAVEL_PROFILE_COLUMNS, COLUMNS);
    assert.ok(COLUMNS.includes('FIRSTNAME'));
    assert.ok(COLUMNS.includes('DATEOFBIRTH'));
    assert.ok(COLUMNS.includes('NATIONALITY'));
  });

  it('buildQueryProfilesSql selects all travel columns', () => {
    const { sql, binds } = buildQueryProfilesSql({
      fqTable: 'TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER',
      limit: 10,
    });
    assert.match(sql, /SELECT CRMID, ECID, EMAIL/);
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
});
