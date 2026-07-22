'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapAepAttributesToBaseProfileRow,
  mapAepAttributesToTravelProfileRow,
} = require('../snowflakeProfileMapper');
const { COLUMNS } = require('../snowflakeBaseProfileSchema');
const { COLUMNS: TRAVEL_COLUMNS } = require('../snowflakeTravelProfileSchema');

describe('snowflakeProfileMapper', () => {
  it('maps AEP dot-path attributes to BASE_PROFILES column order', () => {
    const { row, rowObject } = mapAepAttributesToBaseProfileRow({
      email: 'apalmer+21072026-1@adobetest.com',
      ecid: '00000000000000000000000000000001',
      crmId: 'CRM1001',
      attributes: {
        'person.name.firstName': 'Alex',
        'person.name.lastName': 'Traveler',
        'person.gender': 'female',
        'person.birthDate': '1990-05-15',
        'homeAddress.street1': '1 High Street',
        'homeAddress.city': 'London',
        'homeAddress.country': 'United Kingdom',
        'mobilePhone.number': '+447425627462',
        'loyalty.loyaltyId': 'LYL123456',
        testProfile: true,
      },
      runStamp: '2026-07-21T12:00:00.000Z',
    });

    assert.equal(row.length, COLUMNS.length);
    assert.equal(rowObject.EMAIL, 'apalmer+21072026-1@adobetest.com');
    assert.equal(rowObject.ECID, '00000000000000000000000000000001');
    assert.equal(rowObject.CRMID, 'CRM1001');
    assert.equal(rowObject.FIRSTNAME, 'Alex');
    assert.equal(rowObject.LASTNAME, 'Traveler');
    assert.equal(rowObject.GENDER, 'female');
    assert.equal(rowObject.BIRTHDATE, '1990-05-15');
    assert.equal(rowObject.LOYALTYID, 'LYL123456');
    assert.equal(rowObject.TESTPROFILE, true);
    assert.equal(rowObject.MOBILEPHONE_NUMBER, '+447425627462');
    assert.ok(rowObject.EMAILIDSHA256);
  });

  it('requires email and ecid', () => {
    assert.throws(
      () => mapAepAttributesToBaseProfileRow({ email: '', ecid: 'abc' }),
      /email is required/,
    );
    assert.throws(
      () => mapAepAttributesToBaseProfileRow({ email: 'a@b.com', ecid: '' }),
      /ecid is required/,
    );
  });

  it('maps AEP attributes to AGENTIC_TRAVEL_PROFILE_CUSTOMER column order', () => {
    const { row, rowObject } = mapAepAttributesToTravelProfileRow({
      email: 'apalmer+21072026-1@adobetest.com',
      ecid: '00000000000000000000000000000001',
      crmId: 'CRM1001',
      attributes: {
        'person.name.firstName': 'Alex',
        'person.name.lastName': 'Traveler',
        'person.gender': 'female',
        'person.birthDate': '1990-05-15',
        'homeAddress.street1': '1 High Street',
        'homeAddress.city': 'London',
        'homeAddress.country': 'United Kingdom',
        'mobilePhone.number': '+447425627462',
        'loyalty.loyaltyId': 'LYL123456',
        testProfile: true,
      },
      runStamp: '2026-07-21T12:00:00.000Z',
    });

    assert.equal(row.length, TRAVEL_COLUMNS.length);
    assert.equal(rowObject.DATEOFBIRTH, '1990-05-15');
    assert.equal(rowObject.PRIMARYEMAIL, 'apalmer+21072026-1@adobetest.com');
    assert.equal(rowObject.NATIONALITY, 'GB');
    assert.equal(rowObject.CUSTOMERSEGMENT, 'bronze');
    assert.ok(!Object.prototype.hasOwnProperty.call(rowObject, 'BIRTHDATE'));
    assert.ok(!TRAVEL_COLUMNS.includes('BIRTHDATE'));
  });
});
