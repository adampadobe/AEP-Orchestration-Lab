'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSubscriptionMigration } = require('../scripts/plan-relational-subscription-migration');
const { getIndustryProfileConfig } = require('../snowflakeIndustryProfileRegistry');

const sql = (file) => fs.readFileSync(path.join(__dirname, '../sql/rel', file), 'utf8');
const statement = (file, table) => sql(file).split(';').find((part) => part.includes(`REL.${table}\n`));

test('telecom catalog and subscription use the same composite key over the catalog grain', () => {
  const subscription = statement('40_telecom.sql', 'REL_TELECOM_SUBSCRIPTION');
  const catalog = statement('40_telecom.sql', 'REL_TELECOM_PLAN_CATALOG');
  const expression = (source) => source.match(/  (.+) AS PLAN_CODE,/)[1];
  assert.equal(expression(subscription), expression(catalog));
  assert.equal(expression(catalog),
    "CONCAT('PLAN-', SHA2(TO_JSON(ARRAY_CONSTRUCT(UPPER(c.PLANTIER), c.BUNDLETYPE, c.DATAALLOWANCEGB)), 256))");
  assert.match(catalog, /GROUP BY UPPER\(c\.PLANTIER\), c\.BUNDLETYPE, c\.DATAALLOWANCEGB\s*$/);
  assert.match(catalog, /INITCAP\(REPLACE\(UPPER\(c\.PLANTIER\), '_', ' '\)\) AS PLAN_NAME/);
  assert.match(subscription, /c\.PLANTIER AS PLAN,/);
  const validation = sql('90_validate.sql');
  assert.match(validation, /GROUP BY PLAN_CODE\s+HAVING PLAN_CODE IS NULL OR COUNT\(\*\) > 1/);
  assert.match(validation, /ON c\.PLAN_CODE = s\.PLAN_CODE/);
  assert.match(validation, /HAVING COUNT\(c\.PLAN_CODE\) <> 1/);
});

for (const industry of ['telecom', 'media']) {
  test(`${industry} subscription watermarks prefer source update time, retaining creation time`, () => {
    const source = statement(industry === 'telecom' ? '40_telecom.sql' : '50_media.sql',
      `REL_${industry.toUpperCase()}_SUBSCRIPTION`);
    const updated = 'COALESCE(TRY_TO_TIMESTAMP_NTZ(TO_VARCHAR(c._RECORDUPDATEDTIMESTAMP)), TRY_TO_TIMESTAMP_NTZ(TO_VARCHAR(c._RECORDCREATEDTIMESTAMP)), r.VERSION_TS)';
    assert.ok(source.includes(`${updated} AS VERSION_TS`));
    assert.ok(source.includes(`${updated} AS _RECORDUPDATEDTIMESTAMP`));
    assert.match(source, /COALESCE\(TRY_TO_TIMESTAMP_NTZ\(TO_VARCHAR\(c\._RECORDCREATEDTIMESTAMP\)\), r\.VERSION_TS\) AS _RECORDCREATEDTIMESTAMP/);
    for (const column of ['_RECORDCREATEDTIMESTAMP', '_RECORDUPDATEDTIMESTAMP']) {
      assert.ok(getIndustryProfileConfig(industry).columns.includes(column));
    }
  });
}

test('migration plan reuses canonical definitions and replaces only the three derived targets', () => {
  const plan = buildSubscriptionMigration({ database: 'demo_db', schema: 'crm', warehouse: 'demo_wh' });
  assert.equal((plan.match(/CREATE OR REPLACE DYNAMIC TABLE/g) || []).length, 3);
  assert.match(plan, /CREATE OR REPLACE DYNAMIC TABLE DEMO_DB\.REL\.REL_TELECOM_PLAN_CATALOG/);
  assert.match(plan, /FROM DEMO_DB\.CRM\.AGENTIC_MEDIA_PROFILE_CUSTOMER/);
  assert.match(plan, /WAREHOUSE = DEMO_WH/);
  assert.doesNotMatch(plan, /IF NOT EXISTS|AEP_SCHEMA|\{\{|CREATE OR REPLACE DYNAMIC TABLE .*DEVICE/);
  assert.doesNotMatch(plan, /\b(?:DELETE|INSERT|UPDATE|TRUNCATE|GRANT|DROP)\b/);
  assert.throws(() => buildSubscriptionMigration({ database: 'DB;DROP TABLE X', schema: 'CRM', warehouse: 'WH' }), /identifier/);
  assert.throws(() => buildSubscriptionMigration({ database: 'DB', schema: 'CRM' }), /warehouse/);
});
