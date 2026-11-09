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
const { buildSportsEventCatalog, mergeRows, withTransaction } = require('./snowflakeSeedStore');

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
    sqlText: `SELECT ${profileConfig.columns.join(', ')} FROM ${fqTable} WHERE ${selector.column} = ? LIMIT 2`,
    binds: [selector.value],
  });
  if (rows.length > 1) throw new Error('Profile selector is ambiguous; inspect duplicate CRM identities before enrichment or readback.');
  if (!rows.length) return null;
  const profile = rowObject(rows[0], profileConfig.columns);
  for (const [column, aliases] of [
    ['ECID', ['ecid', 'ECID']], ['EMAIL', ['email', 'EMAIL']], ['CRMID', ['crmId', 'crmid', 'CRMID']],
  ]) {
    for (const alias of aliases) {
      if (selectorInput[alias] == null || String(selectorInput[alias]).trim() === '') continue;
      const expected = String(selectorInput[alias]).trim();
      const actual = String(profile[column] ?? '').trim();
      if ((column === 'EMAIL' ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected)) {
        throw new Error('Supplied profile identity selectors do not resolve to the same CRM person.');
      }
    }
  }
  return profile;
}

function bindValue(value, isArray) {
  if (value == null) return null;
  return isArray ? JSON.stringify(value) : value;
}

function buildInsertSql(fqTable, tableConfig, rowCount) {
  const arrayColumns = new Set(tableConfig.arrayColumns);
  const expressions = tableConfig.columns.map((column) =>
    arrayColumns.has(column) ? 'PARSE_JSON(?)::ARRAY' : '?',
  );
  const selects = Array.from(
    { length: rowCount },
    () => `SELECT ${expressions.join(', ')}`,
  );
  return `INSERT INTO ${fqTable} (${tableConfig.columns.join(', ')}) ${selects.join(' UNION ALL ')}`;
}

async function generationExists(conn, fqTable, generationId) {
  const rows = await execAsync(conn, {
    sqlText: `SELECT COUNT(*) AS ROW_COUNT FROM ${fqTable}
WHERE GENERATIONID = ? OR STARTSWITH(GENERATIONID, ?)`,
    binds: [generationId, `${generationId}-`],
  });
  return Number(readSnowflakeCell(rows[0], 0, 'ROW_COUNT') || 0) > 0;
}

async function insertRows(conn, fqTable, tableConfig, rows, chunkSize = 50, afterInsert) {
  if (!rows.length) return 0;
  const arrayColumns = new Set(tableConfig.arrayColumns);
  let inserted = 0;
  await execAsync(conn, { sqlText: 'BEGIN TRANSACTION' });
  try {
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const binds = chunk.flatMap((row) =>
        tableConfig.columns.map((column) => bindValue(row[column], arrayColumns.has(column))),
      );
      await execAsync(conn, {
        // SELECT/UNION ALL allows Snowflake ARRAY conversion with bound values.
        sqlText: buildInsertSql(fqTable, tableConfig, chunk.length),
        binds,
      });
      inserted += chunk.length;
    }
    if (afterInsert) await afterInsert();
    await execAsync(conn, { sqlText: 'COMMIT' });
  } catch (error) {
    try {
      await execAsync(conn, { sqlText: 'ROLLBACK' });
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Event insertion and rollback failed; inspect the table before retrying.');
    }
    throw error;
  }
  return inserted;
}

function validateIndustryAndTypes(industry, eventTypes) {
  const eventConfig = getIndustryEventConfig(industry);
  if (!eventConfig) {
    throw new Error('industry must be one of travel, fsi, retail, telecom, media, sports');
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
        const syncCatalog = industry === 'sports' && eventType === 'attendance'
          ? async (attendance) => {
            const catalog = buildSportsEventCatalog(attendance, profile.TESTPROFILE !== false);
            await mergeRows(
              (sqlText, binds) => execAsync(conn, { sqlText, binds }),
              fullyQualified(cfg.database, 'REL', 'REL_SPORTS_EVENT_CATALOG'), 'EVENT_ID', catalog,
            );
            return catalog.length;
          }
          : null;
        if (await generationExists(conn, fqTable, generationId)) {
          let catalogRowCount;
          if (syncCatalog) {
            const stored = await execAsync(conn, {
              sqlText: `SELECT ${tableConfig.columns.join(', ')} FROM ${fqTable}
WHERE GENERATIONID = ? OR STARTSWITH(GENERATIONID, ?)`,
              binds: [generationId, `${generationId}-`],
            });
            catalogRowCount = await withTransaction(
              (sqlText, binds) => execAsync(conn, { sqlText, binds }),
              () => syncCatalog(stored.map((row) => rowObject(row, tableConfig.columns))),
            );
          }
          tableResults.push({
            eventType,
            table: fqTable,
            rowCount: 0,
            generatedRowCount: rows.length,
            idempotent: true,
            ...(syncCatalog ? { catalogRowCount } : {}),
          });
          continue;
        }
        let catalogRowCount;
        const inserted = await insertRows(conn, fqTable, tableConfig, rows, 50,
          syncCatalog ? async () => { catalogRowCount = await syncCatalog(rows); } : undefined);
        tableResults.push({
          eventType,
          table: fqTable,
          rowCount: inserted,
          generatedRowCount: rows.length,
          idempotent: false,
          ...(syncCatalog ? { catalogRowCount: catalogRowCount ?? 0 } : {}),
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
 * Return an allowlisted profile plus bounded pages from its non-travel tables.
 */
async function handleIndustryProfileBundle(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  const industry = String(input.industry || '').trim().toLowerCase();
  if (!sandbox) throw new Error('sandbox is required');
  if (industry === 'travel') throw new Error('Travel readback uses the separate travel catalog/table preview path');
  validateIndustryAndTypes(industry);
  const limitRaw = Number(input.eventLimit || input.event_limit);
  const eventLimit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 25;
  const offsetRaw = input.eventOffset !== undefined ? input.eventOffset : input.event_offset;
  const eventOffset = offsetRaw === undefined ? 0 : offsetRaw;
  if (!Number.isSafeInteger(eventOffset) || eventOffset < 0) {
    throw new Error('eventOffset must be a nonnegative safe integer');
  }
  const tableKey = input.tableKey !== undefined ? input.tableKey : input.table_key;
  const registeredTables = listIndustryEventTables(industry);
  const selectedTables = tableKey === undefined
    ? registeredTables
    : registeredTables.filter((tableConfig) => tableConfig.key === tableKey);
  if (!selectedTables.length) {
    throw new Error(`tableKey must be a registered ${industry} table key: ${registeredTables.map((tableConfig) => tableConfig.key).join(', ')}`);
  }
  return withSnowflakeConnection(labUser, sandbox, async (conn, cfg) => {
    const profile = await findProfile(conn, cfg, industry, input);
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
    for (const tableConfig of selectedTables) {
      const fqTable = fullyQualified(cfg.database, cfg.schema, tableConfig.table);
      const countRows = await execAsync(conn, {
        sqlText: `SELECT COUNT(*) AS ROW_COUNT FROM ${fqTable} WHERE ECID = ?`,
        binds: [profile.ECID],
      });
      const totalCount = Number(readSnowflakeCell(countRows[0], 0, 'ROW_COUNT'));
      if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
        throw new Error(`Invalid stored row count for ${tableConfig.key}`);
      }
      // Event IDs break timestamp ties; enrichment snapshots have no unique ID,
      // so include every remaining value (including arrays) for deterministic pages.
      const arrayColumns = new Set(tableConfig.arrayColumns);
      const orderColumns = [
        '_RECORDCREATEDTIMESTAMP',
        ...['EVENTID', 'GENERATIONID'].filter((column) => tableConfig.columns.includes(column)),
        ...tableConfig.columns.filter((column) => !['_RECORDCREATEDTIMESTAMP', 'EVENTID', 'GENERATIONID'].includes(column)),
      ];
      const orderBy = orderColumns.map((column) =>
        `${arrayColumns.has(column) ? `TO_JSON(${column})` : column} DESC NULLS LAST`,
      ).join(', ');
      const rows = await execAsync(conn, {
        sqlText:
          `SELECT ${tableConfig.columns.join(', ')} FROM ${fqTable} ` +
          `WHERE ECID = ? ORDER BY ${orderBy} LIMIT ${eventLimit} OFFSET ${eventOffset}`,
        binds: [profile.ECID],
      });
      if (rows.length === 0 && eventOffset < totalCount) {
        throw new Error(`Stored row count and empty page are inconsistent for ${tableConfig.key}; data may have changed during readback. Restart pagination.`);
      }
      const hasMore = eventOffset + rows.length < totalCount;
      tables[tableConfig.key] = {
        table: tableConfig.table,
        kind: tableConfig.kind,
        count: rows.length,
        totalCount,
        offset: eventOffset,
        hasMore,
        nextOffset: hasMore ? eventOffset + rows.length : null,
        rows: rows.map((row) => rowObject(row, tableConfig.columns)),
      };
    }
    return {
      ok: true,
      sandbox,
      industry,
      eventLimit,
      eventOffset,
      profile,
      tables,
      totalReturnedRows: Object.values(tables).reduce((sum, result) => sum + result.count, 0),
    };
  });
}

module.exports = {
  buildInsertSql,
  insertRows,
  handleIndustryEnrich,
  handleIndustryProfileBundle,
  normalizeProfileSelector,
  rowObject,
};
