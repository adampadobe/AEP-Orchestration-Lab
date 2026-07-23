'use strict';

const { createHash } = require('crypto');
const { withSnowflakeConnection } = require('./snowflakeIndustryCatalogService');
const { getIndustryProfileConfig } = require('./snowflakeIndustryProfileRegistry');
const {
  getIndustryEventConfig,
  getIndustryEventTable,
  listIndustryEventTables,
  listIndustryEventTypes,
} = require('./snowflakeIndustryEventRegistry');
const { generateIndustryEventRows } = require('./snowflakeIndustryEventGenerator');
const { fullyQualified } = require('./snowflakeProvisionRecipes');
const { readSnowflakeCell } = require('./snowflakeRow');

function execAsync(conn, options) {
  return new Promise((resolve, reject) => {
    conn.execute({
      ...options,
      complete(err, _stmt, rows) {
        if (err) reject(err);
        else resolve(rows || []);
      },
    });
  });
}

function serialize(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (typeof value === 'object' && typeof value.toJSON === 'function') return value.toJSON();
  return value;
}

function rowObject(row, columns) {
  return Object.fromEntries(
    columns.map((column, index) => [column, serialize(readSnowflakeCell(row, index, column))]),
  );
}

function normalizeProfileSelector(profile) {
  const ecid = String(profile && (profile.ecid || profile.ECID) || '').trim();
  const email = String(profile && (profile.email || profile.EMAIL) || '').trim();
  const crmId = String(profile && (profile.crmId || profile.crmid || profile.CRMID) || '').trim();
  if (ecid) return { column: 'ECID', value: ecid };
  if (email) return { column: 'EMAIL', value: email };
  if (crmId) return { column: 'CRMID', value: crmId };
  throw new Error('Each profile requires ecid, email, or crmId');
}

async function findProfile(conn, cfg, industry, selectorInput) {
  const profileConfig = getIndustryProfileConfig(industry);
  const selector = normalizeProfileSelector(selectorInput);
  const fqTable = fullyQualified(cfg.database, cfg.schema, profileConfig.table);
  const rows = await execAsync(conn, {
    sqlText: `SELECT ${profileConfig.columns.join(', ')} FROM ${fqTable} WHERE ${selector.column} = ? LIMIT 1`,
    binds: [selector.value],
  });
  return rows.length ? rowObject(rows[0], profileConfig.columns) : null;
}

function bindValue(value, isArray) {
  if (value == null) return null;
  return isArray ? JSON.stringify(value) : value;
}

async function generationExists(conn, fqTable, generationId) {
  const rows = await execAsync(conn, {
    sqlText: `SELECT COUNT(*) AS ROW_COUNT FROM ${fqTable} WHERE GENERATIONID = ?`,
    binds: [generationId],
  });
  return Number(readSnowflakeCell(rows[0], 0, 'ROW_COUNT') || 0) > 0;
}

async function insertRows(conn, fqTable, tableConfig, rows, chunkSize = 50) {
  if (!rows.length) return 0;
  const arrayColumns = new Set(tableConfig.arrayColumns);
  const expressions = tableConfig.columns.map((column) =>
    arrayColumns.has(column) ? 'PARSE_JSON(?)::ARRAY' : '?',
  );
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const valueSql = chunk.map(() => `(${expressions.join(', ')})`).join(', ');
    const binds = chunk.flatMap((row) =>
      tableConfig.columns.map((column) => bindValue(row[column], arrayColumns.has(column))),
    );
    await execAsync(conn, {
      sqlText: `INSERT INTO ${fqTable} (${tableConfig.columns.join(', ')}) VALUES ${valueSql}`,
      binds,
    });
    inserted += chunk.length;
  }
  return inserted;
}

function validateIndustryAndTypes(industry, eventTypes) {
  const eventConfig = getIndustryEventConfig(industry);
  if (!eventConfig) {
    throw new Error('industry must be one of fsi, retail, telecom, media, sports');
  }
  const requested = Array.isArray(eventTypes) && eventTypes.length
    ? eventTypes.map((value) => String(value).trim().toLowerCase())
    : listIndustryEventTypes(industry);
  const invalid = requested.filter((type) => !getIndustryEventTable(industry, type));
  if (invalid.length) {
    throw new Error(
      `Unsupported ${industry} event type(s): ${invalid.join(', ')}. Allowed: ${listIndustryEventTypes(industry).join(', ')}`,
    );
  }
  return [...new Set(requested)];
}

/**
 * Generate idempotent non-travel event/enrichment rows for existing CRM profiles.
 */
async function handleIndustryEnrich(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  const industry = String(input.industry || '').trim().toLowerCase();
  if (!sandbox) throw new Error('sandbox is required');
  const profiles = Array.isArray(input.profiles) ? input.profiles : [];
  if (!profiles.length) throw new Error('profiles must contain at least one profile selector');
  const eventTypes = validateIndustryAndTypes(industry, input.eventTypes || input.event_types);

  return withSnowflakeConnection(labUser, sandbox, async (conn, cfg) => {
    const profileResults = [];
    for (const selector of profiles) {
      const profile = await findProfile(conn, cfg, industry, selector);
      if (!profile) {
        profileResults.push({
          ok: false,
          selector,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found in Snowflake CRM table' },
        });
        continue;
      }
      const generationId = createHash('sha256')
        .update(`${industry}:${profile.ECID}:industry-events-v1`)
        .digest('hex')
        .slice(0, 32);
      const generated = generateIndustryEventRows(industry, profile, {
        generationId,
        eventTypes,
      });
      const tableResults = [];
      for (const eventType of eventTypes) {
        const tableConfig = getIndustryEventTable(industry, eventType);
        const fqTable = fullyQualified(cfg.database, cfg.schema, tableConfig.table);
        const rows = generated.rowsByType[eventType] || [];
        if (await generationExists(conn, fqTable, generationId)) {
          tableResults.push({
            eventType,
            table: fqTable,
            rowCount: 0,
            generatedRowCount: rows.length,
            idempotent: true,
          });
          continue;
        }
        const inserted = await insertRows(conn, fqTable, tableConfig, rows);
        tableResults.push({
          eventType,
          table: fqTable,
          rowCount: inserted,
          generatedRowCount: rows.length,
          idempotent: false,
        });
      }
      profileResults.push({
        ok: true,
        email: profile.EMAIL,
        ecid: profile.ECID,
        crmId: profile.CRMID,
        generationId,
        tableResults,
        insertedRowCount: tableResults.reduce((sum, result) => sum + result.rowCount, 0),
      });
    }
    return {
      ok: profileResults.every((result) => result.ok),
      sandbox,
      industry,
      eventTypes,
      profileResults,
      insertedRowCount: profileResults.reduce(
        (sum, result) => sum + Number(result.insertedRowCount || 0),
        0,
      ),
    };
  });
}

/**
 * Return an allowlisted profile plus bounded samples from its industry tables.
 */
async function handleIndustryProfileBundle(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  const industry = String(input.industry || '').trim().toLowerCase();
  if (!sandbox) throw new Error('sandbox is required');
  validateIndustryAndTypes(industry);
  const limitRaw = Number(input.eventLimit || input.event_limit);
  const eventLimit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 25;
  const selector = {
    email: input.email,
    ecid: input.ecid,
    crmId: input.crmId || input.crmid,
  };

  return withSnowflakeConnection(labUser, sandbox, async (conn, cfg) => {
    const profile = await findProfile(conn, cfg, industry, selector);
    if (!profile) {
      return {
        ok: false,
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'Profile not found in Snowflake CRM table',
          hints: [],
        },
      };
    }
    const tables = {};
    for (const tableConfig of listIndustryEventTables(industry)) {
      const fqTable = fullyQualified(cfg.database, cfg.schema, tableConfig.table);
      const rows = await execAsync(conn, {
        sqlText:
          `SELECT ${tableConfig.columns.join(', ')} FROM ${fqTable} ` +
          `WHERE ECID = ? ORDER BY _RECORDCREATEDTIMESTAMP DESC LIMIT ${eventLimit}`,
        binds: [profile.ECID],
      });
      tables[tableConfig.key] = {
        table: tableConfig.table,
        kind: tableConfig.kind,
        count: rows.length,
        rows: rows.map((row) => rowObject(row, tableConfig.columns)),
      };
    }
    return {
      ok: true,
      sandbox,
      industry,
      eventLimit,
      profile,
      tables,
      totalReturnedRows: Object.values(tables).reduce((sum, result) => sum + result.count, 0),
    };
  });
}

module.exports = {
  handleIndustryEnrich,
  handleIndustryProfileBundle,
  normalizeProfileSelector,
  rowObject,
};
