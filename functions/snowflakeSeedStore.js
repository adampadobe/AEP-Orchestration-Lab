'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getIndustryProfileConfig } = require('./snowflakeIndustryProfileRegistry');
const { listIndustryEventTables, getIndustryEventTable } = require('./snowflakeIndustryEventRegistry');
const { generateIndustryEventRows } = require('./snowflakeIndustryEventGenerator');
const { createRecipient, recipientRow } = require('./snowflakeRecipientFactory');
const { ensureRecipientTable, mergeRecipientRows, qualifiedRecipientTable } = require('./snowflakeRecipientStore');
const { generateTravelRelationalRecords } = require('./snowflakeRelationalGenerator');
const travelDefinitions = require('./snowflakeTravelTableDefinitions.json');
const { readSnowflakeCell } = require('./snowflakeRow');

const SQL_FILES = {
  travel: '10_travel.sql', fsi: '20_fsi.sql', retail: '30_retail.sql',
  telecom: '40_telecom.sql', media: '50_media.sql', sports: '60_sports.sql',
};
const CRM_SEQUENCE = 'AEP_LAB_RECIPIENT_CRM_SEQUENCE';
const CRM_BLOCK_SIZE = 1000;

function identifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(String(value || ''))) {
    throw new Error('Invalid Snowflake seed identifier');
  }
  return value;
}

function sourceTable(cfg, table) {
  return [cfg.database, cfg.schema, table].map(identifier).join('.');
}

async function readNextSeedCrmIndex(execute, cfg, industries = []) {
  const tables = [qualifiedRecipientTable(cfg.database, cfg.schema), ...industries.map((industry) => {
    const config = getIndustryProfileConfig(industry);
    if (!config) throw new Error(`Unsupported seed industry "${industry}"`);
    return sourceTable(cfg, config.table);
  })];
  const scans = tables.map((table) => `SELECT MAX(TRY_TO_NUMBER(REGEXP_SUBSTR(CRMID, '[0-9]+$'))) AS MX FROM ${table}`);
  const rows = await execute(`SELECT MAX(MX) AS MX FROM (${scans.join('\nUNION ALL\n')})`);
  const max = readSnowflakeCell(rows[0], 0, 'MX');
  const next = max == null ? 1000 : Number(max) + 1;
  if (!Number.isSafeInteger(next) || next < 1) throw new Error('Shared base CRM ordinal is invalid or exceeds the supported integer range.');
  return next;
}

function crmSequence(cfg) {
  return sourceTable(cfg, CRM_SEQUENCE);
}

async function getNextSeedCrmIndex(execute, cfg, industries = [], count = 1) {
  if (!Number.isInteger(count) || count < 1 || count > CRM_BLOCK_SIZE) {
    throw new Error(`CRM allocation count must be between 1 and ${CRM_BLOCK_SIZE}`);
  }
  const sequence = crmSequence(cfg);
  const metadata = await execute(`SELECT "INCREMENT" FROM ${identifier(cfg.database)}.INFORMATION_SCHEMA.SEQUENCES
WHERE SEQUENCE_SCHEMA = ? AND SEQUENCE_NAME = ?`, [identifier(cfg.schema).toUpperCase(), CRM_SEQUENCE]);
  if (metadata.length !== 1 || Number(readSnowflakeCell(metadata[0], 0, 'INCREMENT')) !== CRM_BLOCK_SIZE) {
    throw new Error(`CRM allocator ${sequence} is missing, inaccessible, or has an incompatible increment. Apply the reviewed CRM sequence migration; MAX+1 fallback is disabled.`);
  }
  const minimum = await readNextSeedCrmIndex(execute, cfg, industries);
  const allocated = await execute(`SELECT ${sequence}.NEXTVAL AS START_INDEX`);
  const start = Number(readSnowflakeCell(allocated[0], 0, 'START_INDEX'));
  if (!Number.isSafeInteger(start) || start < minimum || !Number.isSafeInteger(start + CRM_BLOCK_SIZE - 1)) {
    throw new Error(`CRM allocator ${sequence} is behind existing rows or outside the supported range. Stop all writers and review the allocator migration; do not reset the sequence or retry generation automatically.`);
  }
  return start;
}

async function planCrmSequenceMigration(execute, cfg) {
  const tables = await execute(`SELECT TABLE_NAME FROM ${identifier(cfg.database)}.INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = ?`, [identifier(cfg.schema).toUpperCase()]);
  const existing = new Set(tables.map((row) => String(readSnowflakeCell(row, 0, 'TABLE_NAME')).toUpperCase()));
  const industries = Object.keys(SQL_FILES).filter((industry) => existing.has(getIndustryProfileConfig(industry).table));
  const parent = qualifiedRecipientTable(cfg.database, cfg.schema);
  if (!existing.has(parent.split('.').at(-1))) throw new Error('Prepare the shared recipient parent before planning CRM sequence migration.');
  const start = await readNextSeedCrmIndex(execute, cfg, industries);
  if (!Number.isSafeInteger(start + CRM_BLOCK_SIZE - 1)) throw new Error('CRM sequence start exceeds supported integer range.');
  return {
    sequence: crmSequence(cfg), start, blockSize: CRM_BLOCK_SIZE,
    scannedTables: [parent, ...industries.map((industry) => sourceTable(cfg, getIndustryProfileConfig(industry).table))],
    sql: `CREATE SEQUENCE IF NOT EXISTS ${crmSequence(cfg)} START WITH ${start} INCREMENT BY ${CRM_BLOCK_SIZE} ORDER;`,
    warning: 'READ-ONLY PLAN. Stop every writer before computing/applying this plan. Existing sequences are never reset. After applying, verify INCREMENT=1000 and a reserved NEXTVAL above all scanned CRMIDs. Keep legacy Python/MAX+1 writers stopped; only sequence-backed writers may share this target.',
  };
}

async function prepareSeedTables(execute, cfg, industry) {
  const config = getIndustryProfileConfig(industry);
  if (!config) throw new Error(`Unsupported seed industry "${industry}"`);
  identifier(cfg.warehouse);
  await ensureRecipientTable(execute, cfg.database, cfg.schema);
  const definitions = industry === 'travel'
    ? travelDefinitions.filter(({ table }) => table !== 'AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE')
    : [{ table: config.table, columnDdl: config.columnDdl }, ...listIndustryEventTables(industry)];
  for (const definition of definitions) {
    await execute(`CREATE TABLE IF NOT EXISTS ${sourceTable(cfg, definition.table)} (
  ${definition.columnDdl.join(',\n  ')}
)`);
  }
  await execute(`ALTER TABLE ${sourceTable(cfg, config.table)} ADD COLUMN IF NOT EXISTS RECIPIENT_ID VARCHAR(64)`);
  const sql = fs.readFileSync(path.join(__dirname, 'sql/rel', SQL_FILES[industry]), 'utf8')
    .replaceAll('{{WAREHOUSE}}', identifier(cfg.warehouse))
    .replaceAll('AEP_SCHEMA.', `${identifier(cfg.database)}.${identifier(cfg.schema)}.`)
    .replaceAll('REL.', `${identifier(cfg.database)}.REL.`);
  for (const statement of sql.split(/;\s*(?=\r?\n|$)/).map((value) => value.trim()).filter(Boolean)) {
    await execute(statement);
  }
}

async function mergeRows(execute, table, primaryKey, rows, batchSize = 50) {
  if (!rows.length) return;
  const normalized = rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [identifier(key.toUpperCase()), value]),
  ));
  const columns = [...new Set(normalized.flatMap(Object.keys))];
  if (!columns.includes(primaryKey)) throw new Error(`${table} rows must include ${primaryKey}`);
  const updates = columns.filter((column) => ![primaryKey, '_RECORDCREATEDTIMESTAMP'].includes(column));
  const chunkSize = Math.min(50, Math.max(1, batchSize));
  for (let offset = 0; offset < normalized.length; offset += chunkSize) {
    const binds = [];
    const selects = normalized.slice(offset, offset + chunkSize).map((row) => `SELECT ${columns.map((column) => {
      const value = row[column];
      if (value == null) return `NULL AS ${column}`;
      if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date))) {
        binds.push(JSON.stringify(value));
        return `PARSE_JSON(?) AS ${column}`;
      }
      binds.push(value instanceof Date ? value.toISOString() : value);
      return `? AS ${column}`;
    }).join(', ')}`).join('\nUNION ALL\n');
    await execute(`MERGE INTO ${table} target USING (${selects}) source
ON target.${primaryKey} = source.${primaryKey}
${updates.length ? `WHEN MATCHED AND (${updates.map((column) => (
    `target.${column} IS DISTINCT FROM source.${column}`
  )).join(' OR ')}) THEN UPDATE SET ${updates.map((column) => (
    `target.${column} = source.${column}`
  )).join(', ')}` : ''}
WHEN NOT MATCHED THEN INSERT (${columns.join(', ')})
VALUES (${columns.map((column) => `source.${column}`).join(', ')})`, binds);
  }
}

async function withTransaction(execute, work) {
  await execute('BEGIN TRANSACTION');
  try {
    const result = await work();
    await execute('COMMIT');
    return result;
  } catch (error) {
    try {
      await execute('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Seed write and rollback failed; inspect Snowflake before retrying.');
    }
    throw error;
  }
}

function buildSeedRecord(industry, profile, { index = 0, asOfDate, runStamp, hero = false }) {
  const recipient = createRecipient({
    industry, crmId: profile.CRMID, ecid: profile.ECID, email: profile.EMAIL, index, hero,
  });
  const trip = industry === 'travel'
    ? generateTravelRelationalRecords({ recipient, profile, index, asOfDate, runStamp, hero })
    : null;
  const updatedProfile = {
    ...profile,
    RECIPIENT_ID: recipient.recipientId,
    PUSHTOKENS: recipient.pushTokens,
    ...(trip ? {
      UPCOMINGHOLIDAYDATE: trip.upcomingTripDate,
      UPCOMINGHOLIDAYDESTINATION: trip.upcomingDestination,
    } : {}),
  };
  const events = trip ? null : generateIndustryEventRows(industry, updatedProfile, { now: runStamp });
  return {
    profile: updatedProfile,
    parent: recipientRow(recipient, updatedProfile, runStamp, profile.TESTPROFILE !== false),
    trip,
    events,
  };
}

async function writeSeedRecords(execute, cfg, industry, records, batchSize = 50) {
  const config = getIndustryProfileConfig(industry);
  const counts = {};
  const merge = async (table, key, rows) => {
    await mergeRows(execute, table, key, rows, batchSize);
    counts[table] = rows.length;
  };
  await withTransaction(execute, async () => {
    await mergeRecipientRows(execute, cfg.database, records.map(({ parent }) => parent), cfg.schema);
    counts[qualifiedRecipientTable(cfg.database, cfg.schema)] = records.length;
    await merge(sourceTable(cfg, config.table), 'ECID', records.map(({ profile }) => profile));
    const rel = (table) => `${identifier(cfg.database)}.REL.${table}`;
    if (industry === 'travel') {
      for (const [table, key, property, many] of [
        ['REL_TRAVEL_PRODUCT_CATALOG', 'PRODUCT_CODE', 'catalog', true],
        ['REL_TRAVEL_RESERVATION', 'RESERVATION_ID', 'reservation', false],
        ['REL_TRAVEL_FLIGHT_SEGMENT', 'SEGMENT_ID', 'segments', true],
        ['REL_TRAVEL_PASSENGER', 'PASSENGER_ID', 'passengers', true],
        ['REL_TRAVEL_ANCILLARY_PURCHASE', 'ANCILLARY_ID', 'ancillaries', true],
      ]) {
        const selected = property === 'catalog' ? records.slice(0, 1) : records;
        const rows = selected.flatMap(({ trip }) => many ? trip[property] : [trip[property]]);
        await merge(rel(table), key, rows);
      }
      for (const [type, property, many] of [
        ['booking', 'bookingEvent', false], ['disruption', 'disruptionEvents', true],
      ]) {
        await merge(sourceTable(cfg, getIndustryEventTable('travel', type).table), '_ID',
          records.flatMap(({ trip }) => many ? trip[property] : [trip[property]]));
      }
    } else {
      for (const table of listIndustryEventTables(industry)) {
        const rows = records.flatMap(({ events }) => events.rowsByType[table.key] || []);
        await merge(sourceTable(cfg, table.table), table.kind === 'event' ? 'EVENTID' : 'GENERATIONID', rows);
      }
      if (industry === 'sports') {
        const catalog = records.flatMap(({ events, parent }) => events.rowsByType.attendance.map((event) => ({
          EVENT_ID: event.EVENT_ID, EVENT_NAME: event.EVENT_NAME, SPORT: event.SPORT,
          VENUE: event.VENUE, EVENT_DATE: event.TIMESTAMP.slice(0, 10), SECTION: event.SECTION,
          TICKET_TYPE: event.TICKET_TYPE, PRICE_FROM: event.TICKET_PRICE,
          VERSION_TS: parent.VERSION_TS, _RECORDCREATEDTIMESTAMP: parent.VERSION_TS,
          _RECORDUPDATEDTIMESTAMP: parent.VERSION_TS, TESTPROFILE: parent.TESTPROFILE, INDUSTRY: 'sports',
        })));
        const uniqueCatalog = [...new Map(catalog.map((row) => [row.EVENT_ID, row])).values()];
        await merge(rel('REL_SPORTS_EVENT_CATALOG'), 'EVENT_ID', uniqueCatalog);
      }
    }
  });
  return counts;
}

module.exports = { prepareSeedTables, buildSeedRecord, writeSeedRecords, mergeRows, withTransaction, sourceTable, getNextSeedCrmIndex, readNextSeedCrmIndex, planCrmSequenceMigration, CRM_BLOCK_SIZE, CRM_SEQUENCE };
