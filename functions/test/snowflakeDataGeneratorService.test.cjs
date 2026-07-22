'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  generateBaseProfileRow,
  generateAgenticEmail,
  rowToObject,
  resolveDualLoadInsertSchema,
} = require('../snowflakeDataGeneratorService');
const { scaleEmail } = require('../labProfileGenerationPrefsStore');

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
    assert.equal(travel.skipCreateTable, true);
    assert.ok(travel.columns.includes('DATEOFBIRTH'));
    assert.ok(!travel.columns.includes('BIRTHDATE'));

    const legacy = resolveDualLoadInsertSchema('BASE_PROFILES');
    assert.equal(legacy.schemaKey, 'BASE_PROFILES');
    assert.equal(legacy.skipCreateTable, false);
    assert.ok(legacy.columns.includes('BIRTHDATE'));
  });
});
