/**
 * Snowflake industry catalog — manifest projection + INFORMATION_SCHEMA table checks.
 */

'use strict';

const store = require('./snowflakeConnectionStore');
const { buildSnowflakeConnectOptions, describeConnectError } = require('./snowflakeService');
const { safeIdentifier } = require('./snowflakeDataGeneratorService');
const {
  getIndustryManifest,
  listSupportedIndustries,
  validateTravelProposal,
  validateIndustryProposal,
} = require('./snowflakeIndustryManifest');
const { validateProvisionProposal, listProvisionRecipes } = require('./snowflakeProvisionRecipes');
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

function connectAsync(snowflake, options) {
  return new Promise((resolve, reject) => {
    const conn = snowflake.createConnection(options);
    conn.connect((err) => (err ? reject(err) : resolve(conn)));
  });
}

function destroyAsync(conn) {
  return new Promise((resolve) => {
    try {
      conn.destroy(() => resolve());
    } catch (_) {
      resolve();
    }
  });
}

function runnerConfigured() {
  const url = String(process.env.AGENTIC_TRAVEL_RUNNER_URL || '').trim();
  const secret = String(process.env.AGENTIC_TRAVEL_RUNNER_HMAC_SECRET || '').trim();
  return {
    configured: Boolean(url && secret),
    runnerUrlSet: Boolean(url),
    runnerSecretSet: Boolean(secret),
    runnerUrlEnv: 'AGENTIC_TRAVEL_RUNNER_URL',
  };
}

/**
 * Public manifest slice (no credential / env secret values).
 * @param {string} [industry]
 */
function projectManifest(industry) {
  const manifest = getIndustryManifest(industry);
  if (!manifest) return null;

  const base = {
    industry: manifest.industry,
    label: manifest.label,
    status: manifest.status || 'active',
    proposedTables: manifest.proposedTables || undefined,
    provisionRecipes: listProvisionRecipes(manifest.industry).map((r) => ({
      id: r.id,
      label: r.label,
      provisionMode: r.provisionMode,
    })),
  };

  if (manifest.status === 'draft') {
    return base;
  }

  return {
    ...base,
    phaseTables: manifest.phaseTables,
    allTables: manifest.allTables,
    baseProfiles: manifest.baseProfiles
      ? {
          table: manifest.baseProfiles.table,
          baseProfileTable: manifest.baseProfiles.baseProfileTable,
          legacyBatchTable: manifest.baseProfiles.legacyBatchTable,
          columnCount: manifest.baseProfiles.columnCount,
        }
      : undefined,
    dualLoad: manifest.dualLoad,
    eventGroups: manifest.eventGroups,
    enrichEventTypes: manifest.enrichEventTypes,
    validationRules: manifest.validationRules,
    runner: manifest.runner
      ? {
          urlEnv: manifest.runner.urlEnv,
          secretEnv: manifest.runner.secretEnv,
          operations: manifest.runner.operations,
          ...runnerConfigured(),
        }
      : undefined,
  };
}

async function withSnowflakeConnection(labUser, sandbox, fn) {
  const resolved = await store.resolveConnection(labUser, sandbox);
  if (!resolved) {
    return {
      ok: false,
      error: {
        message:
          'No Snowflake credential saved for this user/sandbox yet. Save the connection first.',
        code: 'NO_CREDENTIAL',
        sqlState: null,
        hints: [],
      },
    };
  }
  let snowflake;
  try {
    snowflake = require('snowflake-sdk');
  } catch (e) {
    return {
      ok: false,
      error: {
        message: 'snowflake-sdk is not installed.',
        code: 'SDK_MISSING',
        sqlState: null,
        hints: [],
      },
    };
  }
  let connectOptions;
  try {
    connectOptions = buildSnowflakeConnectOptions(resolved);
  } catch (err) {
    return { ok: false, error: describeConnectError(err) };
  }
  const cfg = resolved.config;
  let conn;
  try {
    conn = await connectAsync(snowflake, connectOptions);
    if (cfg.warehouse) {
      await execAsync(conn, {
        sqlText: `USE WAREHOUSE ${safeIdentifier(cfg.warehouse, '')}`,
      });
    }
    if (cfg.database) {
      await execAsync(conn, {
        sqlText: `USE DATABASE ${safeIdentifier(cfg.database, '')}`,
      });
    }
    if (cfg.schema) {
      await execAsync(conn, { sqlText: `USE SCHEMA ${safeIdentifier(cfg.schema, '')}` });
    }
    return await fn(conn, cfg, resolved);
  } catch (err) {
    return { ok: false, error: describeConnectError(err) };
  } finally {
    if (conn) await destroyAsync(conn);
  }
}

/**
 * @param {import('snowflake-sdk').Connection} conn
 * @param {object} cfg
 * @param {string[]} tableNames
 */
async function checkTableExistence(conn, cfg, tableNames) {
  const db = safeIdentifier(cfg.database, '');
  const sc = safeIdentifier(cfg.schema, '');
  const upperNames = tableNames.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean);
  if (!upperNames.length) {
    return { tables: {}, existingCount: 0, missingCount: 0 };
  }

  const placeholders = upperNames.map(() => '?').join(', ');
  const sql = `
    SELECT TABLE_NAME
    FROM ${db}.INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = ?
      AND TABLE_TYPE = 'BASE TABLE'
      AND TABLE_NAME IN (${placeholders})
  `;
  const rows = await execAsync(conn, {
    sqlText: sql,
    binds: [sc.toUpperCase(), ...upperNames],
  });
  return projectTableExistence(rows, upperNames);
}

/**
 * Convert Snowflake INFORMATION_SCHEMA rows into the public table check shape.
 * Snowflake SDK rows are objects by default; positional arrays remain supported.
 *
 * @param {unknown[]} rows
 * @param {string[]} tableNames
 */
function projectTableExistence(rows, tableNames) {
  const upperNames = tableNames
    .map((name) => String(name || '').trim().toUpperCase())
    .filter(Boolean);
  const existing = new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => String(readSnowflakeCell(row, 0, 'TABLE_NAME') || '').toUpperCase())
      .filter(Boolean),
  );

  /** @type {Record<string, { exists: boolean }>} */
  const tables = {};
  for (const name of upperNames) {
    tables[name] = { exists: existing.has(name) };
  }
  const existingCount = [...existing].filter((n) => upperNames.includes(n)).length;
  return {
    tables,
    existingCount,
    missingCount: upperNames.length - existingCount,
  };
}

function clampPreviewLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(50, Math.max(1, parsed));
}

function validatePreviewTable(industry, table) {
  const normalizedIndustry = String(industry || 'travel').trim().toLowerCase();
  const manifest = projectManifest(normalizedIndustry);
  if (!manifest) {
    return {
      ok: false,
      industry: normalizedIndustry,
      error: {
        message:
          `Unsupported industry "${normalizedIndustry}". Supported: ${listSupportedIndustries().join(', ')}`,
        code: 'UNSUPPORTED_INDUSTRY',
        sqlState: null,
        hints: [],
      },
    };
  }

  const normalizedTable = String(table || '').trim().toUpperCase();
  const allowedTables = Array.isArray(manifest.allTables) ? manifest.allTables : [];
  if (!normalizedTable || !allowedTables.includes(normalizedTable)) {
    return {
      ok: false,
      industry: normalizedIndustry,
      error: {
        message: normalizedTable
          ? `Table "${normalizedTable}" is not governed by the ${normalizedIndustry} manifest.`
          : 'table is required',
        code: 'TABLE_NOT_ALLOWLISTED',
        sqlState: null,
        hints: ['Choose a table from the industry readiness list.'],
      },
    };
  }

  return {
    ok: true,
    industry: normalizedIndustry,
    table: normalizedTable,
    manifest,
  };
}

function buildPreviewSql(database, schema, table, columns, orderBy, limit) {
  const db = safeIdentifier(database, '');
  const sc = safeIdentifier(schema, '');
  const tb = safeIdentifier(table, '');
  const selectedColumns = columns.map((column) => safeIdentifier(column, '')).join(', ');
  const orderClause = orderBy ? ` ORDER BY ${safeIdentifier(orderBy, '')} DESC` : '';
  return `SELECT ${selectedColumns} FROM ${db}.${sc}.${tb}${orderClause} LIMIT ${clampPreviewLimit(limit)}`;
}

function serializePreviewCell(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return String(value);
  return value;
}

/**
 * POST /api/snowflake/industry-table-preview — read a bounded sample from one
 * table selected from the governed industry manifest. Arbitrary SQL and table
 * names are intentionally unsupported.
 */
async function handleIndustryTablePreview(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  if (!sandbox) throw new Error('sandbox is required');

  const validation = validatePreviewTable(input.industry, input.table);
  if (!validation.ok) return validation;
  const limit = clampPreviewLimit(input.limit);

  return withSnowflakeConnection(labUser, sandbox, async (conn, cfg) => {
    const db = safeIdentifier(cfg.database, '');
    const sc = safeIdentifier(cfg.schema, '');
    const columnRows = await execAsync(conn, {
      sqlText: `
        SELECT COLUMN_NAME
        FROM ${db}.INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `,
      binds: [sc.toUpperCase(), validation.table],
    });
    const columns = columnRows
      .map((row) => String(readSnowflakeCell(row, 0, 'COLUMN_NAME') || '').trim().toUpperCase())
      .filter(Boolean);
    if (!columns.length) {
      return {
        ok: false,
        sandbox,
        industry: validation.industry,
        table: validation.table,
        error: {
          message: `Table "${validation.table}" was not found in the configured Snowflake schema.`,
          code: 'TABLE_NOT_FOUND',
          sqlState: null,
          hints: ['Run the industry readiness check or provision the governed tables first.'],
        },
      };
    }

    const orderBy = [
      '_RECORDCREATEDTIMESTAMP',
      'TIMESTAMP',
      'CREATED_AT',
      'CREATEDAT',
    ].find((column) => columns.includes(column)) || null;
    const rows = await execAsync(conn, {
      sqlText: buildPreviewSql(
        cfg.database,
        cfg.schema,
        validation.table,
        columns,
        orderBy,
        limit,
      ),
    });
    const projectedRows = rows.map((row) => {
      const projected = {};
      columns.forEach((column, index) => {
        projected[column] = serializePreviewCell(readSnowflakeCell(row, index, column));
      });
      return projected;
    });

    return {
      ok: true,
      sandbox,
      industry: validation.industry,
      database: cfg.database || null,
      schema: cfg.schema || null,
      table: validation.table,
      columns,
      rows: projectedRows,
      rowCount: projectedRows.length,
      limit,
      orderBy,
    };
  });
}

/**
 * GET/POST /api/snowflake/industry-catalog
 * @param {object} input
 * @param {string} input.labUser
 * @param {string} input.sandbox
 * @param {string} [input.industry]
 * @param {boolean} [input.checkTables] — when true (default), probe INFORMATION_SCHEMA
 */
async function handleIndustryCatalog(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  if (!sandbox) throw new Error('sandbox is required');

  const industry = String(input.industry || 'travel').trim().toLowerCase();
  const manifest = projectManifest(industry);
  if (!manifest) {
    return {
      ok: false,
      error: {
        message: `Unsupported industry "${industry}". Supported: ${listSupportedIndustries().join(', ')}`,
        code: 'UNSUPPORTED_INDUSTRY',
        sqlState: null,
        hints: [],
      },
    };
  }

  const checkTables = input.checkTables !== false;
  if (!checkTables) {
    return {
      ok: true,
      sandbox,
      industry,
      manifest,
      supportedIndustries: listSupportedIndustries(),
      tableCheckSkipped: true,
    };
  }

  return withSnowflakeConnection(labUser, sandbox, async (conn, cfg) => {
    const tableCheck = await checkTableExistence(conn, cfg, manifest.allTables);
    return {
      ok: true,
      sandbox,
      industry,
      manifest,
      supportedIndustries: listSupportedIndustries(),
      database: cfg.database || null,
      schema: cfg.schema || null,
      tableCheck,
    };
  });
}

/** POST /api/snowflake/industry-validate-proposal — allowlisted provision validation. */
async function handleValidateProposal(input) {
  const sandbox = String(input.sandbox || '').trim();
  if (!sandbox) throw new Error('sandbox is required');

  const industry = String(input.industry || 'travel').trim().toLowerCase();
  const recipeId = input.recipe_id || input.recipeId;
  const proposedTables = input.proposed_tables || input.proposedTables;
  const hasProvisionInput = Boolean(recipeId) || (Array.isArray(proposedTables) && proposedTables.length);

  if (hasProvisionInput) {
    const provisionValidation = validateProvisionProposal({
      industry,
      recipe_id: recipeId,
      proposed_tables: proposedTables,
    });
    const industryValidation = validateIndustryProposal({
      industry,
      phases: input.phases,
      eventTypes: input.eventTypes || input.event_types,
      count: input.count,
    });

    const errors = [
      ...provisionValidation.errors,
      ...industryValidation.errors,
    ];
    const warnings = [
      ...provisionValidation.warnings,
      ...industryValidation.warnings,
    ];

    return {
      ok: errors.length === 0,
      sandbox,
      industry,
      validation: {
        ok: errors.length === 0,
        valid: errors.length === 0,
        errors,
        warnings,
        provision: provisionValidation,
        industry: industryValidation,
      },
      runner: industry === 'travel' ? runnerConfigured() : null,
      manifest: industryValidation.manifestSummary,
    };
  }

  const validation = validateIndustryProposal({
    industry,
    phases: input.phases,
    eventTypes: input.eventTypes || input.event_types,
    count: input.count,
  });

  return {
    ok: validation.ok,
    sandbox,
    industry,
    validation,
    runner: industry === 'travel' ? runnerConfigured() : null,
    manifest: {
      dualLoadTarget: validation.manifestSummary.dualLoadTarget,
      queryTable: validation.manifestSummary.queryTable,
      enrichEventTypes: validation.manifestSummary.enrichEventTypes,
    },
  };
}

module.exports = {
  runnerConfigured,
  projectManifest,
  projectTableExistence,
  clampPreviewLimit,
  validatePreviewTable,
  buildPreviewSql,
  withSnowflakeConnection,
  checkTableExistence,
  handleIndustryCatalog,
  handleIndustryTablePreview,
  handleValidateProposal,
  validateTravelProposal,
};
