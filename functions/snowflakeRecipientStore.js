'use strict';

const { COLUMNS: BASE_COLUMNS } = require('./snowflakeBaseProfileSchema');
const { readSnowflakeCell } = require('./snowflakeRow');
const BASE_DDL = require('./snowflakeTravelTableDefinitions.json')
  .find(({ table }) => table === 'AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE').columnDdl;
const BASE_RECIPIENT_TABLE = 'AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE';

const RECIPIENT_COLUMN_DEFINITIONS = Object.freeze([
  ['RECIPIENT_ID', 'VARCHAR(64) NOT NULL'],
  ['INDUSTRY', 'VARCHAR(32) NOT NULL'],
  ['CRMID', 'VARCHAR(320) NOT NULL'],
  ['ECID', 'VARCHAR(320)'],
  ['EMAIL', 'VARCHAR(320)'],
  ['EMAILIDSHA256', 'VARCHAR(128)'],
  ['GAID', 'VARCHAR(128)'],
  ['LOYALTYID', 'VARCHAR(64)'],
  ['PASSPORTID', 'VARCHAR(64)'],
  ['PHONENUMBER', 'VARCHAR(64)'],
  ['PUSHTOKENS', 'ARRAY'],
  ['STACKCHATID', 'VARCHAR(64)'],
  ['FIRSTNAME', 'VARCHAR(100)'],
  ['LASTNAME', 'VARCHAR(100)'],
  ['DATEOFBIRTH', 'DATE'],
  ['GENDER', 'VARCHAR(32)'],
  ['NATIONALITY', 'VARCHAR(64)'],
  ['PRIMARYEMAIL', 'VARCHAR(320)'],
  ['PRIMARYPHONE', 'VARCHAR(64)'],
  ['ADDRESSSTREET', 'VARCHAR(200)'],
  ['ADDRESSCITY', 'VARCHAR(100)'],
  ['ADDRESSPOSTALCODE', 'VARCHAR(32)'],
  ['ADDRESSCOUNTRY', 'VARCHAR(100)'],
  ['COUNTRYCODE', 'VARCHAR(2)'],
  ['PREFERREDLANGUAGE', 'VARCHAR(16)'],
  ['TIMEZONE', 'VARCHAR(64)'],
  ['CUSTOMERSEGMENT', 'VARCHAR(64)'],
  ['LIFETIMEVALUE', 'NUMBER(18,2)'],
  ['UPCOMINGHOLIDAYDATE', 'DATE'],
  ['UPCOMINGHOLIDAYDESTINATION', 'VARCHAR(100)'],
  ['PREFERREDSEATTYPE', 'VARCHAR(32)'],
  ['CONSENT_EMAIL', 'VARCHAR(1)'],
  ['CONSENT_SMS', 'VARCHAR(1)'],
  ['CONSENT_WHATSAPP', 'VARCHAR(1)'],
  ['CONSENT_PUSH', 'VARCHAR(1)'],
  ['PREFERREDCHANNEL', 'VARCHAR(32)'],
  ['VERSION_TS', 'TIMESTAMP_NTZ NOT NULL'],
  ['_RECORDCREATEDTIMESTAMP', 'TIMESTAMP_NTZ NOT NULL'],
  ['_RECORDUPDATEDTIMESTAMP', 'TIMESTAMP_NTZ NOT NULL'],
  ['TESTPROFILE', 'BOOLEAN NOT NULL'],
]);

const RECIPIENT_COLUMNS = Object.freeze(RECIPIENT_COLUMN_DEFINITIONS.map(([name]) => name));
const RECIPIENT_COLUMN_SET = new Set(RECIPIENT_COLUMNS);
const ARRAY_COLUMNS = new Set(['PUSHTOKENS']);

function qualifiedRecipientTable(database, schema = 'AEP_SCHEMA') {
  const identifier = String(database || '').trim();
  if (![identifier, schema].every((part) => /^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(part))) {
    throw new Error('database must be a valid unquoted Snowflake identifier');
  }
  return `${identifier}.${schema}.${BASE_RECIPIENT_TABLE}`;
}

function recipientTableStatements(database, schema = 'AEP_SCHEMA') {
  const table = qualifiedRecipientTable(database, schema);
  const additions = RECIPIENT_COLUMN_DEFINITIONS.filter(([name]) => !BASE_COLUMNS.includes(name));
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (\n  ${BASE_DDL.join(',\n  ')}\n)`,
    ...additions.map(([name, type]) => (
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${type.replace(/ NOT NULL/g, '')}`
    )),
    `UPDATE ${table} SET RECIPIENT_ID = 'R-' || LEFT(SHA2(ECID, 256), 32)
WHERE RECIPIENT_ID IS NULL AND ECID IS NOT NULL AND TRIM(ECID) <> ''`,
    `CREATE SCHEMA IF NOT EXISTS ${database}.REL`,
    `CREATE VIEW IF NOT EXISTS ${database}.REL.RECIPIENT AS SELECT ${RECIPIENT_COLUMNS.join(', ')} FROM ${table}`,
  ];
}

function baseRecipientRow(row) {
  const birth = row.DATEOFBIRTH ? String(row.DATEOFBIRTH).slice(0, 10) : null;
  const birthParts = birth && /^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth.split('-').map(Number) : null;
  return {
    ...row,
    BIRTHDATE: row.DATEOFBIRTH,
    HOMEADDRESS_STREET1: row.ADDRESSSTREET,
    HOMEADDRESS_CITY: row.ADDRESSCITY,
    HOMEADDRESS_POSTALCODE: row.ADDRESSPOSTALCODE,
    HOMEADDRESS_COUNTRY: row.ADDRESSCOUNTRY,
    PERSONALEMAIL_ADDRESS: row.PRIMARYEMAIL || row.EMAIL,
    MOBILEPHONE_NUMBER: row.PRIMARYPHONE || row.PHONENUMBER,
    PERSON_NAME_FULLNAME: [row.FIRSTNAME, row.LASTNAME].filter(Boolean).join(' ') || null,
    PERSON_BIRTHYEAR: birthParts?.[0] ?? null,
    PERSON_BIRTHMONTH: birthParts?.[1] ?? null,
    PERSON_BIRTHDAY: birthParts?.[2] ?? null,
    PERSON_BIRTHDAYANDMONTH: birthParts ? birth.slice(5) : null,
    PERSONALEMAIL_LABEL: 'Personal',
    PERSONALEMAIL_PRIMARY: true,
    PERSONALEMAIL_STATUS: 'Active',
    MOBILEPHONE_PRIMARY: true,
    MOBILEPHONE_STATUS: 'Active',
  };
}

function buildRecipientMerge(database, rows, schema = 'AEP_SCHEMA') {
  const table = qualifiedRecipientTable(database, schema);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  for (const column of rows.flatMap((row) => Object.keys(row))) {
    if (!RECIPIENT_COLUMN_SET.has(column)) {
      throw new Error(`Unsupported REL.RECIPIENT column "${column}"`);
    }
  }
  rows = rows.map(baseRecipientRow);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!columns.includes('RECIPIENT_ID')) throw new Error('Recipient rows must include RECIPIENT_ID');

  const binds = [];
  const selects = rows.map((row) => `SELECT ${columns.map((column) => {
    const value = row[column] ?? null;
    if (value == null) return `NULL AS ${column}`;
    if (ARRAY_COLUMNS.has(column) || Array.isArray(value)) {
      binds.push(JSON.stringify(value));
      return `PARSE_JSON(?) AS ${column}`;
    }
    binds.push(value);
    return `? AS ${column}`;
  }).join(', ')}`).join('\nUNION ALL\n');
  const updates = columns.filter((column) => !['RECIPIENT_ID', '_RECORDCREATEDTIMESTAMP'].includes(column));
  const distinct = updates.map((column) => `target.${column} IS DISTINCT FROM source.${column}`).join(' OR ');
  const updateClause = updates.length
    ? `WHEN MATCHED AND (${distinct}) THEN UPDATE SET ${updates.map((column) => (
      `target.${column} = source.${column}`
    )).join(', ')}`
    : '';
  const sqlText = `MERGE INTO ${table} target
USING (${selects}) source
ON target.RECIPIENT_ID = source.RECIPIENT_ID
${updateClause}
WHEN NOT MATCHED THEN INSERT (${columns.join(', ')})
VALUES (${columns.map((column) => `source.${column}`).join(', ')})`;
  return { sqlText, binds };
}

async function ensureRecipientTable(execute, database, schema) {
  const table = qualifiedRecipientTable(database, schema);
  const objects = await execute(`SELECT t.TABLE_TYPE, v.VIEW_DEFINITION
FROM ${database}.INFORMATION_SCHEMA.TABLES t
LEFT JOIN ${database}.INFORMATION_SCHEMA.VIEWS v
  ON t.TABLE_CATALOG = v.TABLE_CATALOG AND t.TABLE_SCHEMA = v.TABLE_SCHEMA AND t.TABLE_NAME = v.TABLE_NAME
WHERE t.TABLE_SCHEMA = 'REL' AND t.TABLE_NAME = 'RECIPIENT'`);
  if (objects.length) {
    const type = readSnowflakeCell(objects[0], 0, 'TABLE_TYPE');
    const definition = String(readSnowflakeCell(objects[0], 1, 'VIEW_DEFINITION') || '')
      .replaceAll('"', '').toUpperCase();
    const expectedSource = new RegExp(`(?<![\\w.])(?:${database}\\.)?${schema || 'AEP_SCHEMA'}\\.${BASE_RECIPIENT_TABLE}\\b`, 'i');
    if (type !== 'VIEW' || !expectedSource.test(definition)) {
      throw new Error('REL.RECIPIENT already exists with an incompatible definition. Review its migration to the shared base view before seeding.');
    }
  }
  const statements = recipientTableStatements(database, schema);
  for (const sqlText of statements.slice(0, -3)) await execute(sqlText);
  const conflicts = await execute(`SELECT ECID FROM ${table}
WHERE ECID IS NOT NULL AND TRIM(ECID) <> ''
GROUP BY ECID
HAVING COUNT(*) > 1 OR COUNT_IF(RECIPIENT_ID IS NOT NULL AND RECIPIENT_ID <> 'R-' || LEFT(SHA2(ECID, 256), 32)) > 0
LIMIT 1`);
  if (conflicts.length) {
    throw new Error('Shared base contains duplicate ECIDs or incompatible recipient IDs. Review identity migration before seeding; existing IDs were not overwritten.');
  }
  for (const sqlText of statements.slice(-3)) await execute(sqlText);
}

async function mergeRecipientRows(execute, database, rows, schema) {
  for (let offset = 0; offset < rows.length; offset += 50) {
    const merge = buildRecipientMerge(database, rows.slice(offset, offset + 50), schema);
    if (merge) await execute(merge.sqlText, merge.binds);
  }
}

module.exports = {
  BASE_RECIPIENT_TABLE,
  RECIPIENT_COLUMN_DEFINITIONS,
  RECIPIENT_COLUMNS,
  buildRecipientMerge,
  ensureRecipientTable,
  mergeRecipientRows,
  qualifiedRecipientTable,
  recipientTableStatements,
};
