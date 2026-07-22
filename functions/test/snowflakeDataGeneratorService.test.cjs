'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  generateBaseProfileRow,
  generateAgenticEmail,
  rowToObject,
  resolveDualLoadInsertSchema,
} = require('../snowflakeDataGeneratorService');
const { COLUMNS: TRAVEL_COLUMNS } = require('../snowflakeTravelProfileSchema');
const { scaleEmail } = require('../labProfileGenerationPrefsStore');

const TRAVEL_CREATED_IDX = TRAVEL_COLUMNS.indexOf('_RECORDCREATEDTIMESTAMP');
const TRAVEL_UPDATED_IDX = TRAVEL_COLUMNS.indexOf('_RECORDUPDATEDTIMESTAMP');

describe('snowflakeDataGeneratorService email alignment', () => {
  it('generateBaseProfileRow uses emailOverride for EMAIL columns', () => {
    const scaled = scaleEmail('adamp.adobedemo@gmail.com', 1, new Date('2026-07-22T12:00:00Z'));
    const row = generateBaseProfileRow(1001, '2026-07-22T12:00:00.000Z', 99, scaled);
    const obj = rowToObject(row);
    assert.equal(obj.EMAIL, scaled);
    assert.equal(obj.PERSONALEMAIL_ADDRESS, scaled);
    assert.equal(scaled, 'adamp.adobedemo+22072026-1@gmail.com');
  });

  it('legacy generateAgenticEmail keeps Agentic plus-plus scheme', () => {
    const legacy = generateAgenticEmail(3);
    assert.match(legacy, /^adamp\.adobedemo\+\d{8}\+3@gmail\.com$/);
  });

  it('dual_load path email override matches generation prefs hyphen format', () => {
    const prefsEmail = 'apalmer+22072026-5@adobetest.com';
    const row = generateBaseProfileRow(2000, '2026-07-22T12:00:00.000Z', 1, prefsEmail);
    const obj = rowToObject(row);
    assert.equal(obj.EMAIL, prefsEmail);
    assert.match(obj.EMAIL, /\+\d{8}-\d+@/);
  });

  it('resolveDualLoadInsertSchema uses travel mapper for AGENTIC_TRAVEL_PROFILE_CUSTOMER', () => {
    const travel = resolveDualLoadInsertSchema('AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    assert.equal(travel.schemaKey, 'AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    assert.equal(travel.defaultMode, 'crm_generate');
    assert.equal(typeof travel.generateRow, 'function');
    assert.equal(travel.skipCreateTable, true);
    assert.ok(travel.columns.includes('DATEOFBIRTH'));
    assert.ok(!travel.columns.includes('BIRTHDATE'));

    const legacy = resolveDualLoadInsertSchema('BASE_PROFILES');
    assert.equal(legacy.schemaKey, 'BASE_PROFILES');
    assert.equal(legacy.skipCreateTable, false);
    assert.ok(legacy.columns.includes('BIRTHDATE'));
  });

  it('dual-load insert mapping writes Python-runner timestamps into travel row binds', () => {
    const { mapRow } = resolveDualLoadInsertSchema('AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    const runStamp = '2026-07-22T21:49:38.000Z';
    const expectedStamp = '2026-07-22 21:49:38.000';
    const { row, rowObject } = mapRow({
      email: 'apalmer+22072026-1@adobetest.com',
      ecid: '00000000000000000000000000000001',
      crmId: 'CRM1001',
      attributes: {},
      runStamp,
    });

    assert.equal(rowObject._RECORDCREATEDTIMESTAMP, expectedStamp);
    assert.equal(rowObject._RECORDUPDATEDTIMESTAMP, expectedStamp);
    assert.equal(row[TRAVEL_CREATED_IDX], expectedStamp);
    assert.equal(row[TRAVEL_UPDATED_IDX], expectedStamp);
  });

  it('dual-load travel mapper binds persona fields from nested AEP attributes', () => {
    const { mapRow } = resolveDualLoadInsertSchema('AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    const { rowObject } = mapRow({
      email: 'apalmer+22072026-2@adobetest.com',
      ecid: '40000000000000000000000000000003',
      crmId: 'CRM1003',
      attributes: {
        person: {
          name: { firstName: 'Alex', lastName: 'Traveler' },
          gender: 'female',
          birthDate: '1990-05-15',
        },
        mobilePhone: { number: '+447425627462' },
        testProfile: true,
      },
      runStamp: '2026-07-22T22:00:00.000Z',
    });

    assert.equal(rowObject.FIRSTNAME, 'Alex');
    assert.equal(rowObject.LASTNAME, 'Traveler');
    assert.equal(rowObject.EMAIL, 'apalmer+22072026-2@adobetest.com');
    assert.equal(rowObject.ECID, '40000000000000000000000000000003');
    assert.equal(rowObject.DATEOFBIRTH, '1990-05-15');
    assert.equal(rowObject.PRIMARYEMAIL, 'apalmer+22072026-2@adobetest.com');
    assert.equal(rowObject.LIFETIMEVALUE, 0);
  });
});
