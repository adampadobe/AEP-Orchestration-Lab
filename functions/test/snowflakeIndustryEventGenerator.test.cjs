'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  listIndustryEventTables,
  listIndustryEventTypes,
} = require('../snowflakeIndustryEventRegistry');
const { generateIndustryEventRows } = require('../snowflakeIndustryEventGenerator');

const identity = { EMAIL: 'profile@example.com', ECID: '123456789', CRMID: 'CRM42' };
const profiles = {
  fsi: { ...identity, TOTALACCOUNTS: 4, CHECKINGBALANCE: 2500, SAVINGSBALANCE: 12000, MORTGAGEBALANCE: 175000, INVESTMENTVALUE: 45000 },
  retail: { ...identity, ORDERSYTD: 10, TOTALORDERS: 42, RETURNRATE: 0.2, REWARDPOINTS: 8000, FAVOURITECATEGORY: 'fashion' },
  telecom: { ...identity, DATAUSAGEGB: 20, MONTHLYSPEND: 55, DEVICEMODEL: 'iPhone 17 Pro', NETWORKNPS: 9 },
  media: { ...identity, PRIMARYGENRE: 'drama', MONTHLYFEE: 17.99, SUBSCRIPTIONTIER: 'premium', DOWNLOADSPERMONTH: 6 },
  sports: { ...identity, FAVOURITESPORT: 'football', FAVOURITETEAM: 'Arsenal', MERCHSPENDYTD: 480, BETSREGULARLY: true, MEMBERSHIPTYPE: 'premium' },
};

describe('Snowflake industry event registry and generators', () => {
  for (const industry of Object.keys(profiles)) {
    it(`${industry} exposes exactly five governed event/enrichment tables`, () => {
      const tables = listIndustryEventTables(industry);
      assert.equal(tables.length, 5);
      assert.equal(listIndustryEventTypes(industry).length, 5);
      assert.equal(tables.filter((entry) => entry.kind === 'event').length, 4);
      assert.equal(tables.filter((entry) => entry.kind === 'enrichment').length, 1);
      for (const table of tables) {
        for (const column of ['EMAIL', 'ECID', 'CRMID', 'GENERATIONID', '_RECORDCREATEDTIMESTAMP']) {
          assert.ok(table.columns.includes(column));
        }
        if (table.kind === 'event') {
          assert.ok(table.columns.includes('EVENTID'));
          assert.ok(table.columns.includes('TIMESTAMP'));
        }
      }
    });

    it(`${industry} generation is deterministic, complete, and identity-consistent`, () => {
      const options = { now: '2026-07-23T10:00:00.000Z' };
      const first = generateIndustryEventRows(industry, profiles[industry], options);
      assert.deepEqual(first, generateIndustryEventRows(industry, profiles[industry], options));
      assert.deepEqual(Object.keys(first.rowsByType), listIndustryEventTypes(industry));
      for (const rows of Object.values(first.rowsByType)) {
        assert.ok(rows.length >= 1);
        for (const row of rows) {
          assert.equal(row.EMAIL, identity.EMAIL);
          assert.equal(row.ECID, identity.ECID);
          assert.equal(row.CRMID, identity.CRMID);
          assert.equal(row.GENERATIONID, first.generationId);
        }
      }
    });
  }

  it('retail returns always reference generated orders', () => {
    const generated = generateIndustryEventRows('retail', profiles.retail, {
      now: '2026-07-23T10:00:00.000Z',
    });
    const orderIds = new Set(generated.rowsByType.order.map((row) => row.ORDER_ID));
    for (const row of generated.rowsByType.return) assert.ok(orderIds.has(row.ORDER_ID));
  });

  it('sports betting is omitted when the profile does not bet regularly', () => {
    const generated = generateIndustryEventRows(
      'sports',
      { ...profiles.sports, BETSREGULARLY: false },
      { now: '2026-07-23T10:00:00.000Z' },
    );
    assert.equal(generated.rowsByType.betting.length, 0);
  });
});
