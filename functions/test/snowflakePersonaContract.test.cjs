'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { applyPersonaContract, personaColumnPaths } = require('../snowflakePersonaContract');
const { generateIndustryProfileRow } = require('../snowflakeIndustryProfileGenerator');
const { generateTravelProfileRow } = require('../snowflakeTravelProfileGenerator');
const { getIndustryProfileConfig } = require('../snowflakeIndustryProfileRegistry');

const INPUT = { idx: 42, crmId: 'CRM42', email: 'persona@example.test', ecid: '12345678901234567890123456789012345678' };
const generate = (industry, attributes) => (industry === 'travel'
  ? generateTravelProfileRow({ ...INPUT, attributes })
  : generateIndustryProfileRow(industry, { ...INPUT, attributes })).rowObject;

describe('shared persona contract', () => {
  for (const industry of ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']) {
    it(`preserves shared identity-person fields and zero LTV for ${industry}`, () => {
      const row = generate(industry, {
        _demoemea: { orderProfile: { lifetimeValue: 0 } },
        person: { name: { firstName: 'Alex', lastName: 'Tester' }, birthDate: '1980-04-05' },
        mobilePhone: { number: '+441234567890' }, homeAddress: { city: 'Paris' },
      });
      assert.equal(row.LIFETIMEVALUE, 0);
      assert.equal(row.FIRSTNAME, 'Alex');
      assert.equal(row.DATEOFBIRTH, '1980-04-05');
      assert.equal(row.PHONENUMBER, '+441234567890');
      assert.equal(row.PRIMARYPHONE, '+441234567890');
      assert.equal(row.ADDRESSCITY, 'Paris');
      assert.equal(row.EMAIL, INPUT.email);
      assert.equal(row.ECID, INPUT.ecid);
    });

    it(`supports every declared CRM override with typed values for ${industry}`, () => {
      const config = getIndustryProfileConfig(industry);
      for (const [column, [path]] of Object.entries(personaColumnPaths(industry))) {
        const ddl = config.columnDdl.find((entry) => entry.startsWith(`${column} `));
        const value = /\bBOOLEAN\b/.test(ddl) ? false : /\bNUMBER\b/.test(ddl) ? 0
          : /\bARRAY\b/.test(ddl) ? [] : /\bDATE\b/.test(ddl) ? '2026-01-02' : 'exact-value';
        const row = applyPersonaContract(industry, { EMAIL: INPUT.email }, { [path]: value });
        assert.deepEqual(row[column], value, `${industry}.${column}`);
        const nullRow = applyPersonaContract(industry, {}, { [path]: null });
        assert.equal(nullRow[column], null, `${industry}.${column}: null`);
      }
    });
  }

  it('mirrors explicit FSI score from the first credit-score array entry', () => {
    const row = generate('fsi', { personalFinances: { creditScores: [{ score: 484 }] } });
    assert.equal(row.CREDITSCORE, 484);
  });

  it('does not turn explicit false into random true across industries', () => {
    for (let i = 0; i < 10; i += 1) {
      const sports = generate('sports', { industrySports: {
        fanSegment: 'day_one', fanFlags: { seasonTicket: false, streamLive: false, newsletterSub: false },
      } });
      assert.equal(sports.SEASONTICKET, false);
      assert.equal(sports.STREAMLIVE, false);
      assert.equal(sports.NEWSLETTERSUBSCRIBED, false);
      assert.equal(generate('media', { industryMedia: {
        subscriptionTier: 'free', engagementFlags: { adSupported: false },
      } }).ADSUPPORTED, false);
      assert.equal(generate('telecom', { industryTelecom: {
        serviceFlags: { upgradeEligible: false },
      } }).UPGRADEELIGIBLE, false);
    }
  });

  it('rejects conflicting shared values rather than choosing a silent precedence', () => {
    assert.throws(() => generate('fsi', {
      'fsiProfile.customerValue.creditScore': 800, 'personalFinances.creditScores': [{ score: 484 }],
    }), /Conflicting persona values for CREDITSCORE/);
  });

  it('rejects invalid types and unsupported CRM fields', () => {
    assert.throws(() => generate('retail', { 'retailProfile.customerValue.totalOrders': 'zero' }),
      /Invalid persona value type/);
    assert.throws(() => generate('sports', { 'sportsProfile.attributes.streamlive': 'false' }),
      /Invalid persona value type/);
    assert.throws(() => generate('fsi', { 'fsiProfile.notAField': 3 }), /Unsupported CRM persona attribute/);
    assert.throws(() => generate('fsi', { 'fsiProfile.contactDetails.primaryEmail': 'different@example.test' }),
      /primary email must match/);
    assert.throws(() => generate('travel', { 'customerProfile.travelHistory.favoriteDestinations': [{}] }),
      /Invalid persona value type/);
    assert.throws(() => generate('travel', { 'customerProfile.personalDetails.dateOfBirth': '2026-02-30' }),
      /Invalid persona value type/);
    assert.throws(() => generate('travel', { 'customerProfile.personalDetails.firstName': 'x'.repeat(1000) }),
      /exceeds column length/);
    assert.throws(() => generate('travel', { 'customerProfile.customerValue.totalBookings': 1.5 }),
      /numeric precision or scale/);
    assert.throws(() => generate('retail', { 'orderProfile.lifetimeValue': 1.234 }),
      /numeric precision or scale/);
    assert.throws(() => generate('travel', { 'orderProfile.lifetimeValue': 1e15 }),
      /numeric precision or scale/);
  });

  it('uses the same contract for industry aliases', () => {
    assert.equal(applyPersonaContract('telco', {}, {
      'telecomProfile.attributes.upgradeeligible': false,
    }).UPGRADEELIGIBLE, false);
  });

  it('preserves actual randomized MCP persona values across all industries', async () => {
    const { buildPersonaAttributes } = await import('../../tools/aep-lab-profile-mcp/src/personaBuilder/index.mjs');
    for (const industry of ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']) {
      for (let n = 0; n < 5; n += 1) {
        const attrs = buildPersonaAttributes(industry, INPUT.email);
        const row = generate(industry, attrs);
        for (const [column, paths] of Object.entries(personaColumnPaths(industry))) {
          for (const path of paths) {
            if (Object.hasOwn(attrs, path)) assert.deepEqual(row[column], attrs[path], `${industry}.${path}`);
          }
        }
      }
    }
  });
});
