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
} = require('./snowflakeIndustryManifest');

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
  return {
    industry: manifest.industry,
    label: manifest.label,
    phaseTables: manifest.phaseTables,
    allTables: manifest.allTables,
    baseProfiles: {
      table: manifest.baseProfiles.table,
      baseProfileTable: manifest.baseProfiles.baseProfileTable,
      legacyBatchTable: manifest.baseProfiles.legacyBatchTable,
      columnCount: manifest.baseProfiles.columnCount,
    },
    dualLoad: manifest.dualLoad,
    eventGroups: manifest.eventGroups,
    enrichEventTypes: manifest.enrichEventTypes,
    validationRules: manifest.validationRules,
    runner: {
      urlEnv: manifest.runner.urlEnv,
      secretEnv: manifest.runner.secretEnv,
      operations: manifest.runner.operations,
      ...runnerConfigured(),
    },
  };
}

async function withConnection(labUser, sandbox, fn) {
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
  const existing = new Set(rows.map((row) => String(row[0] || '').toUpperCase()));

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

  return withConnection(labUser, sandbox, async (conn, cfg) => {
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

/**
 * POST /api/snowflake/industry-validate-proposal — travel-only, read-only.
 */
async function handleValidateProposal(input) {
  const sandbox = String(input.sandbox || '').trim();
  if (!sandbox) throw new Error('sandbox is required');

  const industry = String(input.industry || 'travel').trim().toLowerCase();
  if (industry !== 'travel') {
    return {
      ok: false,
      error: {
        message: 'validate-proposal is travel-only in v3.22',
        code: 'UNSUPPORTED_INDUSTRY',
        sqlState: null,
        hints: [],
      },
    };
  }

  const validation = validateTravelProposal({
    phases: input.phases,
    eventTypes: input.eventTypes || input.event_types,
    count: input.count,
  });

  return {
    ok: validation.ok,
    sandbox,
    validation,
    runner: runnerConfigured(),
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
  checkTableExistence,
  handleIndustryCatalog,
  handleValidateProposal,
  validateTravelProposal,
};
