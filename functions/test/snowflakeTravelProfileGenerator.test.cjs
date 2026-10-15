'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateTravelProfileRow, segmentEconomics } = require('../snowflakeTravelProfileGenerator');
const { COLUMNS: TRAVEL_COLUMNS } = require('../snowflakeTravelProfileSchema');
const { resolveDualLoadMode } = require('../snowflakeDataGeneratorService');

describe('snowflakeTravelProfileGenerator', () => {
  it('generates full CRM travel row with bound identity keys', () => {
    const { row, rowObject } = generateTravelProfileRow({
      idx: 1001,
      email: 'apalmer+22072026-1@adobetest.com',
      ecid: '00000000000000000000000000000001',
      crmId: 'CRM1001',
      runStamp: '2026-07-22T21:49:38.000Z',
    });

    assert.equal(row.length, TRAVEL_COLUMNS.length);
    assert.equal(rowObject.EMAIL, 'apalmer+22072026-1@adobetest.com');
    assert.equal(rowObject.ECID, '00000000000000000000000000000001');
    assert.equal(rowObject.CRMID, 'CRM1001');
    assert.equal(rowObject.RECIPIENT_ID, require('../snowflakeRecipientFactory').getRecipientId(
      'travel', 'CRM1001', rowObject.ECID,
    ));
    assert.equal(rowObject.PRIMARYEMAIL, 'apalmer+22072026-1@adobetest.com');
    assert.match(rowObject.PRIMARYPHONE, /^\+44\d{10,11}$/);
    assert.deepEqual(rowObject.PUSHTOKENS, [`demo-fcm-${require('node:crypto').createHash('sha256').update(`${rowObject.RECIPIENT_ID}:push`).digest('hex').slice(0, 32)}`]);
    assert.ok(rowObject.LIFETIMEVALUE > 0);
    assert.ok(rowObject.TOTALBOOKINGS >= 1);
    assert.ok(rowObject.LASTHOLIDAYDATE);
    assert.ok(rowObject.UPCOMINGHOLIDAYDESTINATION);
    assert.ok(rowObject.PREFERREDCABINCLASS);
    assert.notEqual(rowObject.CUSTOMERSEGMENT, null);
    assert.equal(rowObject._RECORDCREATEDTIMESTAMP, '2026-07-22 21:49:38.000');
  });

  it('binds firstName and lastName from AEP attributes when provided', () => {
    const { rowObject } = generateTravelProfileRow({
      idx: 1002,
      email: 'test@example.com',
      ecid: 'ecid-abc',
      crmId: 'CRM1002',
      attributes: {
        person: { name: { firstName: 'Alex', lastName: 'Traveler' } },
      },
    });

    assert.equal(rowObject.FIRSTNAME, 'Alex');
    assert.equal(rowObject.LASTNAME, 'Traveler');
    assert.ok(rowObject.LIFETIMEVALUE > 0);
    assert.ok(rowObject.LASTHOLIDAYDESTINATION);
  });

  it('segmentEconomics scales LTV by tier', () => {
    const diamond = segmentEconomics('diamond');
    const bronze = segmentEconomics('bronze');
    assert.ok(diamond.avgBooking >= 1200);
    assert.ok(bronze.avgBooking >= 250);
    assert.ok(diamond.totalBookings >= bronze.totalBookings);
  });

  it('generates a hero-compatible gold profile with UK locale values', () => {
    const { rowObject } = generateTravelProfileRow({
      idx: 1005,
      email: 'hero@example.com',
      ecid: 'ecid-hero',
      crmId: 'CRM1005',
      hero: true,
      asOfDate: '2026-10-15',
      upcomingTripDate: '2027-04-03',
      upcomingDestination: 'Paris',
    });

    assert.equal(rowObject.CUSTOMERSEGMENT, 'gold');
    assert.equal(rowObject.PREFERREDSEATTYPE, 'window');
    assert.equal(rowObject.UPCOMINGHOLIDAYDATE, '2027-04-03');
    assert.equal(rowObject.UPCOMINGHOLIDAYDESTINATION, 'Paris');
    assert.equal(rowObject.ADDRESSCOUNTRY, 'United Kingdom');
    assert.match(rowObject.PRIMARYPHONE, /^\+44\d{10,11}$/);
  });
});

describe('resolveDualLoadMode', () => {
  it('defaults travel table to crm_generate', () => {
    assert.equal(resolveDualLoadMode('AGENTIC_TRAVEL_PROFILE_CUSTOMER', ''), 'crm_generate');
    assert.equal(resolveDualLoadMode('AGENTIC_TRAVEL_PROFILE_CUSTOMER'), 'crm_generate');
  });

  it('honors explicit mirror mode', () => {
    assert.equal(resolveDualLoadMode('AGENTIC_TRAVEL_PROFILE_CUSTOMER', 'mirror'), 'mirror');
  });

  it('defaults BASE_PROFILES to mirror', () => {
    assert.equal(resolveDualLoadMode('BASE_PROFILES', ''), 'mirror');
  });
});
