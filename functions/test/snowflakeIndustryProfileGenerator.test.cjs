'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateIndustryProfileRow } = require('../snowflakeIndustryProfileGenerator');
const {
  getIndustryProfileConfig,
  listSnowflakeProfileIndustries,
} = require('../snowflakeIndustryProfileRegistry');

const INPUT = {
  idx: 42,
  email: 'industry+22072026-1@adobetest.com',
  ecid: '12345678901234567890123456789012',
  crmId: 'CRM42',
  runStamp: '2026-07-22T10:20:30.000Z',
  attributes: { person: { name: { firstName: 'Avery', lastName: 'Tester' } } },
};

describe('Snowflake industry CRM profile registry', () => {
  it('contains all six non-generic industries and distinct target tables', () => {
    assert.deepEqual(listSnowflakeProfileIndustries(), ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']);
    const tables = listSnowflakeProfileIndustries().map((industry) => getIndustryProfileConfig(industry).table);
    assert.equal(new Set(tables).size, 6);
  });

  for (const industry of ['fsi', 'retail', 'telecom', 'media', 'sports']) {
    it(`generates a complete ${industry} CRM row with shared identity`, () => {
      const config = getIndustryProfileConfig(industry);
      const generated = generateIndustryProfileRow(industry, INPUT);
      assert.equal(generated.row.length, config.columns.length);
      assert.deepEqual(generated.columns, config.columns);
      assert.equal(generated.rowObject.EMAIL, INPUT.email);
      assert.equal(generated.rowObject.ECID, INPUT.ecid);
      assert.equal(generated.rowObject.CRMID, INPUT.crmId);
      assert.equal(generated.rowObject.FIRSTNAME, 'Avery');
      assert.equal(generated.rowObject.LASTNAME, 'Tester');
      assert.equal(generated.rowObject.TESTPROFILE, true);
      assert.equal(generated.rowObject._RECORDCREATEDTIMESTAMP, '2026-07-22 10:20:30.000');
      for (const column of config.columns) {
        assert.ok(Object.prototype.hasOwnProperty.call(generated.rowObject, column), `${industry}.${column}`);
      }
    });
  }

  it('correlates FSI 500k_plus with high income and strong credit', () => {
    const { rowObject } = generateIndustryProfileRow('fsi', {
      ...INPUT,
      attributes: { industryFsi: { householdIncomeBand: '500k_plus', creditScoreBand: 'good' } },
    });
    assert.ok(rowObject.HOUSEHOLDINCOME >= 450000);
    assert.ok(rowObject.CREDITSCORE >= 800);
    assert.equal(rowObject.CREDITSCOREBAND, 'excellent');
  });

  it('correlates but does not mirror retail AEP lifetime value', () => {
    const { rowObject } = generateIndustryProfileRow('retail', {
      ...INPUT,
      attributes: { orderProfile: { lifetimeValue: 10000 } },
    });
    assert.notEqual(rowObject.LIFETIMEVALUE, 10000);
    assert.ok(rowObject.LIFETIMEVALUE >= 8600 && rowObject.LIFETIMEVALUE <= 11400);
  });

  it('correlates premium telecom plan and flagship device to realistic UK spend', () => {
    const { rowObject } = generateIndustryProfileRow('telecom', {
      ...INPUT,
      attributes: { industryTelecom: { planTier: 'premium', deviceTier: 'flagship', dataAllowance: 'unlimited' } },
    });
    assert.equal(rowObject.PLANTIER, 'premium');
    assert.equal(rowObject.DEVICETIER, 'flagship');
    assert.ok(rowObject.MONTHLYSPEND >= 65);
    assert.equal(rowObject.DATAALLOWANCEGB, 999);
  });
});
