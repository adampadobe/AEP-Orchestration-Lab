'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { recipientRow, createRecipient } = require('../snowflakeRecipientFactory');
const {
  RECIPIENT_COLUMNS,
  buildRecipientMerge,
  recipientTableStatements,
  ensureRecipientTable,
} = require('../snowflakeRecipientStore');

describe('snowflakeRecipientStore', () => {
  it('adds shared fields without replacing the existing base table or its original column types', () => {
    const recipient = createRecipient({ industry: 'travel', crmId: 'CRM101', email: 'a@example.com' });
    const row = recipientRow(recipient, {
      CRMID: 'CRM101',
      ECID: 'ecid-101',
      EMAIL: 'a@example.com',
      TESTPROFILE: true,
    }, '2026-10-15 00:00:00.000');
    assert.deepEqual(Object.keys(row), RECIPIENT_COLUMNS);
    const statements = recipientTableStatements('DEMO_DB', 'CUSTOM_SCHEMA');
    assert.match(statements[0], /CREATE TABLE IF NOT EXISTS DEMO_DB\.CUSTOM_SCHEMA\.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE/);
    assert.match(statements[0], /BIRTHDATE DATE/);
    assert.match(statements.at(-1), /CREATE VIEW IF NOT EXISTS DEMO_DB\.REL\.RECIPIENT/);
    assert.doesNotMatch(statements.join('\n'), /CREATE OR REPLACE|DROP|CREATE TABLE.*REL\.RECIPIENT/);
    const sql = fs.readFileSync(path.resolve(__dirname, '../sql/rel/00_recipient.sql'), 'utf8');
    const additions = statements.filter((statement) => statement.startsWith('ALTER TABLE'))
      .map((statement) => statement.match(/IF NOT EXISTS ([A-Z0-9_]+)/)[1]);
    for (const column of additions) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
  });

  it('creates stable, change-only merges with JSON arrays for tokens', () => {
    const row = {
      RECIPIENT_ID: 'R-TRV-101',
      INDUSTRY: 'travel',
      PUSHTOKENS: ['demo-token'],
      TESTPROFILE: true,
    };
    const merge = buildRecipientMerge('DEMO_DB', [row]);
    assert.match(merge.sqlText, /ON target\.RECIPIENT_ID = source\.RECIPIENT_ID/);
    assert.match(merge.sqlText, /PARSE_JSON\(\?\) AS PUSHTOKENS/);
    assert.match(merge.sqlText, /WHEN MATCHED AND/);
    assert.deepEqual(merge.binds.slice(0, 4), ['R-TRV-101', 'travel', '["demo-token"]', true]);
    assert.match(merge.sqlText, /MERGE INTO DEMO_DB\.AEP_SCHEMA\.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE/);
    assert.equal(buildRecipientMerge('DEMO_DB', []), null);
    assert.throws(() => buildRecipientMerge('DEMO_DB', [{ RECIPIENT_ID: 'R-TRV-1', EVIL: 1 }]), /Unsupported/);
  });

  it('rejects unsafe database identifiers', () => {
    assert.throws(() => recipientTableStatements('DEMO_DB; DROP TABLE X'), /valid unquoted/);
  });

  it('stops before mutations when a physical or incompatible recipient object already exists', async () => {
    for (const object of [
      { TABLE_TYPE: 'BASE TABLE', VIEW_DEFINITION: null },
      { TABLE_TYPE: 'VIEW', VIEW_DEFINITION: 'SELECT * FROM OTHER_DB.OTHER_SCHEMA.OTHER_RECIPIENT' },
    ]) {
      const calls = [];
      await assert.rejects(ensureRecipientTable(async (sql) => {
        calls.push(sql);
        return [object];
      }, 'DEMO_DB', 'CUSTOM_SCHEMA'), /incompatible definition/);
      assert.equal(calls.length, 1);
      assert.ok(calls[0].startsWith('SELECT'));
    }
  });

  it('accepts the existing shared-base view and blocks conflicting identities before backfill', async () => {
    const calls = [];
    await assert.rejects(ensureRecipientTable(async (sql) => {
      calls.push(sql);
      if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [{
        TABLE_TYPE: 'VIEW',
        VIEW_DEFINITION: 'SELECT * FROM "DEMO_DB"."CUSTOM_SCHEMA"."AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE"',
      }];
      if (sql.includes('HAVING COUNT(*)')) return [{ ECID: 'conflicting-identity' }];
      return [];
    }, 'DEMO_DB', 'CUSTOM_SCHEMA'), /Review identity migration/);
    assert.equal(calls.some((sql) => sql.startsWith('UPDATE')), false);
    assert.equal(calls.some((sql) => sql.startsWith('CREATE VIEW')), false);
  });
});
