/**
 * AgenticAI Demo parity: query profiles, table structure by phase, and optional
 * delegation to the Python `services/agentic-travel-runner` for full phased
 * generate (Phase 1–3) and profile enrichment.
 *
 * Query + table-structure run entirely in Node via snowflake-sdk. Full generate
 * and enrich require AGENTIC_TRAVEL_RUNNER_URL + AGENTIC_TRAVEL_RUNNER_HMAC_SECRET
 * on the Cloud Function (see services/agentic-travel-runner/).
 */

'use strict';

const crypto = require('crypto');
const store = require('./snowflakeConnectionStore');
const {
  buildSnowflakeConnectOptions,
  describeConnectError,
} = require('./snowflakeService');
const {
  safeIdentifier,
  fullyQualified,
} = require('./snowflakeDataGeneratorService');

const PHASE_TABLES = {
  phase1: [
    'AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE',
    'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
    'AGENTIC_TRAVEL_EVENT_WEBSITE',
    'AGENTIC_TRAVEL_EVENT_BOOKING',
  ],
  phase2: [
    'AGENTIC_TRAVEL_PROFILE_LOYALTY',
    'AGENTIC_TRAVEL_PROFILE_PREFERENCES',
    'AGENTIC_TRAVEL_EVENT_MOBILE',
    'AGENTIC_TRAVEL_EVENT_CALLCENTRE',
    'AGENTIC_TRAVEL_EVENT_CHECKIN',
  ],
  phase3: [
    'AGENTIC_TRAVEL_EVENT_DISRUPTION',
    'AGENTIC_TRAVEL_EVENT_INFLIGHT',
    'AGENTIC_TRAVEL_EVENT_HOTEL',
    'AGENTIC_TRAVEL_EVENT_LOYALTY',
    'AGENTIC_TRAVEL_EVENT_POS',
  ],
};

const ALLOWED_FILTER = new Set(['all', 'loyalty', 'non_loyalty']);
const ALLOWED_TIME = new Set([
  'all_time',
  'today',
  'yesterday',
  'last_7_days',
  'this_week',
  'last_week',
  'last_30_days',
  'this_month',
  'last_month',
  'last_90_days',
]);

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

function timeFilterSql(timePeriod) {
  switch (timePeriod) {
    case 'today':
      return "AND DATE(_RECORDCREATEDTIMESTAMP) = CURRENT_DATE()";
    case 'yesterday':
      return "AND DATE(_RECORDCREATEDTIMESTAMP) = DATEADD(day, -1, CURRENT_DATE())";
    case 'last_7_days':
      return "AND _RECORDCREATEDTIMESTAMP >= DATEADD(day, -7, CURRENT_TIMESTAMP())";
    case 'this_week':
      return "AND DATE_TRUNC('week', _RECORDCREATEDTIMESTAMP) = DATE_TRUNC('week', CURRENT_DATE())";
    case 'last_week':
      return "AND DATE_TRUNC('week', _RECORDCREATEDTIMESTAMP) = DATEADD(week, -1, DATE_TRUNC('week', CURRENT_DATE()))";
    case 'last_30_days':
      return "AND _RECORDCREATEDTIMESTAMP >= DATEADD(day, -30, CURRENT_TIMESTAMP())";
    case 'this_month':
      return "AND DATE_TRUNC('month', _RECORDCREATEDTIMESTAMP) = DATE_TRUNC('month', CURRENT_DATE())";
    case 'last_month':
      return "AND DATE_TRUNC('month', _RECORDCREATEDTIMESTAMP) = DATEADD(month, -1, DATE_TRUNC('month', CURRENT_DATE()))";
    case 'last_90_days':
      return "AND _RECORDCREATEDTIMESTAMP >= DATEADD(day, -90, CURRENT_TIMESTAMP())";
    case 'all_time':
    default:
      return '';
  }
}

function loyaltyWhere(filterType) {
  if (filterType === 'loyalty') return 'AND LOYALTYID IS NOT NULL';
  if (filterType === 'non_loyalty') return 'AND LOYALTYID IS NULL';
  return '';
}

function snowflakePayloadFromResolved(resolved) {
  let opts;
  try {
    opts = buildSnowflakeConnectOptions(resolved);
  } catch (e) {
    const err = new Error((e && e.message) || String(e));
    err.code = 'CONNECT_OPTIONS';
    throw err;
  }
  const body = {
    account: opts.account,
    username: opts.username,
    role: opts.role || '',
    warehouse: opts.warehouse || '',
    database: opts.database || '',
    schema: opts.schema || '',
    application: opts.application || 'AEP_ORCHESTRATION_LAB',
  };
  if (opts.authenticator === 'SNOWFLAKE_JWT') {
    body.authenticator = 'SNOWFLAKE_JWT';
    body.privateKeyPem = opts.privateKey;
  } else {
    body.password = opts.password;
  }
  return body;
}

async function postSignedRunner(pathSuffix, snowflakePayload, opFields) {
  const base = String(process.env.AGENTIC_TRAVEL_RUNNER_URL || '').trim().replace(/\/$/, '');
  const secret = String(process.env.AGENTIC_TRAVEL_RUNNER_HMAC_SECRET || '').trim();
  if (!base || !secret) {
    return {
      ok: false,
      error: {
        message:
          'Full Agentic phased generate and enrich are not configured for this deployment. ' +
          'Set Cloud Function env vars AGENTIC_TRAVEL_RUNNER_URL and AGENTIC_TRAVEL_RUNNER_HMAC_SECRET ' +
          'to a private host running services/agentic-travel-runner (see that folder’s Dockerfile).',
        code: 'RUNNER_NOT_CONFIGURED',
        sqlState: null,
        hints: [],
      },
    };
  }
  const url = `${base}${pathSuffix}`;
  const payloadObj = { snowflake: snowflakePayload, ...opFields };
  const payload = JSON.stringify(payloadObj);
  const sig = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 520000);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Runner-Signature': sig,
      },
      body: payload,
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(t);
    const msg = e && e.name === 'AbortError' ? 'Runner request timed out' : String((e && e.message) || e);
    return {
      ok: false,
      error: { message: msg, code: 'RUNNER_FETCH', sqlState: null, hints: [] },
    };
  } finally {
    clearTimeout(t);
  }

  let json;
  try {
    json = await res.json();
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        message: (json && (json.detail || json.message)) || res.statusText || `HTTP ${res.status}`,
        code: 'RUNNER_HTTP',
        sqlState: null,
        hints: [],
      },
    };
  }
  return { ok: true, data: json };
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
 * POST body mirrors AgenticAI `index_enhanced.html` → `/api/query-profiles`.
 */
async function handleQueryProfiles(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  if (!sandbox) throw new Error('sandbox is required');

  const filterType = ALLOWED_FILTER.has(input.filterType) ? input.filterType : 'all';
  const timePeriod = ALLOWED_TIME.has(input.timePeriod) ? input.timePeriod : 'all_time';
  const limitRaw = Number(input.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(1000, Math.max(1, Math.floor(limitRaw))) : 50;

  return withConnection(labUser, sandbox, async (conn, cfg) => {
    const fq = fullyQualified(cfg.database, cfg.schema, 'AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    const tf = timeFilterSql(timePeriod);
    const lw = loyaltyWhere(filterType);
    const sql = `
      SELECT CRMID, EMAIL, ECID, LOYALTYID, PHONENUMBER, _RECORDCREATEDTIMESTAMP
      FROM ${fq}
      WHERE 1=1
      ${lw}
      ${tf}
      ORDER BY _RECORDCREATEDTIMESTAMP DESC
      LIMIT ${limit}
    `;
    const rows = await execAsync(conn, { sqlText: sql });
    const profiles = rows.map((row) => ({
      crmId: row[0],
      email: row[1],
      ecid: row[2],
      loyaltyId: row[3],
      phoneNumber: row[4],
      createdAt: row[5] != null ? String(row[5]) : null,
    }));
    return {
      ok: true,
      profiles,
      count: profiles.length,
      time_period: timePeriod,
      filter_type: filterType,
    };
  });
}

async function formatTableStructure(conn, cfg, tableName) {
  const db = safeIdentifier(cfg.database, '');
  const sc = safeIdentifier(cfg.schema, '');
  const upperTable = String(tableName || '').trim().toUpperCase();
  const fqTable = fullyQualified(cfg.database, cfg.schema, upperTable);

  const lines = [];
  lines.push(`-- Table: ${fqTable}`);
  lines.push('-- Columns:');

  const colSql = `
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
    FROM ${db}.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `;
  const columns = await execAsync(conn, {
    sqlText: colSql,
    binds: [sc.toUpperCase(), upperTable],
  });
  if (columns.length) {
    for (const row of columns) {
      const colName = row[0];
      const dataType = row[1];
      const isNullable = row[2];
      const defaultVal = row[3];
      const nullable = isNullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultText = defaultVal != null ? ` DEFAULT ${defaultVal}` : '';
      lines.push(`  - ${colName} ${dataType} ${nullable}${defaultText}`);
    }
  } else {
    lines.push('  - (No column metadata found)');
  }

  let pkRows = [];
  try {
    pkRows = await execAsync(conn, { sqlText: `SHOW PRIMARY KEYS IN TABLE ${fqTable}` });
  } catch (_) {
    pkRows = [];
  }
  if (pkRows.length) {
    const pkCols = pkRows
      .map((row) => (row.length > 4 ? row[4] : ''))
      .filter(Boolean)
      .join(', ');
    lines.push(`-- Primary Key: ${pkCols || '(unknown)'}`);
  } else {
    lines.push('-- Primary Key: (none defined)');
  }

  let fkRows = [];
  try {
    fkRows = await execAsync(conn, { sqlText: `SHOW IMPORTED KEYS IN TABLE ${fqTable}` });
  } catch (_) {
    fkRows = [];
  }
  if (fkRows.length) {
    lines.push('-- Foreign Keys:');
    for (const row of fkRows) {
      const fkCol = row.length > 7 ? row[7] : 'UNKNOWN';
      const refTable = row.length > 2 ? row[2] : 'UNKNOWN';
      const refCol = row.length > 3 ? row[3] : 'UNKNOWN';
      lines.push(`  - ${fkCol} -> ${refTable}.${refCol}`);
    }
  } else {
    lines.push('-- Foreign Keys: (none defined)');
  }
  lines.push('');
  return lines.join('\n');
}

async function handleTableStructure(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  if (!sandbox) throw new Error('sandbox is required');
  const phase = String(input.phase || '').trim().toLowerCase();
  if (!PHASE_TABLES[phase]) {
    throw new Error(`Invalid phase. Expected one of: ${Object.keys(PHASE_TABLES).join(', ')}`);
  }

  return withConnection(labUser, sandbox, async (conn, cfg) => {
    const blocks = [];
    for (const t of PHASE_TABLES[phase]) {
      blocks.push(await formatTableStructure(conn, cfg, t));
    }
    return {
      ok: true,
      phase,
      table_count: PHASE_TABLES[phase].length,
      structure_text: blocks.join('\n'),
    };
  });
}

async function handleAgenticGenerateFull(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  if (!sandbox) throw new Error('sandbox is required');
  const countRaw = Number(input.count);
  const count = Number.isFinite(countRaw) ? Math.floor(countRaw) : 1;
  if (count < 1 || count > 1000) throw new Error('count must be between 1 and 1000');

  const resolved = await store.resolveConnection(labUser, sandbox);
  if (!resolved) {
    return {
      ok: false,
      error: {
        message: 'No Snowflake credential saved for this user/sandbox yet.',
        code: 'NO_CREDENTIAL',
        sqlState: null,
        hints: [],
      },
    };
  }
  let sfPayload;
  try {
    sfPayload = snowflakePayloadFromResolved(resolved);
  } catch (e) {
    return { ok: false, error: describeConnectError(e) };
  }
  return postSignedRunner('/internal/generate', sfPayload, { count });
}

async function handleAgenticEnrich(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  if (!sandbox) throw new Error('sandbox is required');
  const profiles = Array.isArray(input.profiles) ? input.profiles : [];
  const eventTypes = Array.isArray(input.eventTypes) ? input.eventTypes : [];
  if (!profiles.length) throw new Error('profiles is required');
  if (!eventTypes.length) throw new Error('event_types is required');

  const resolved = await store.resolveConnection(labUser, sandbox);
  if (!resolved) {
    return {
      ok: false,
      error: {
        message: 'No Snowflake credential saved for this user/sandbox yet.',
        code: 'NO_CREDENTIAL',
        sqlState: null,
        hints: [],
      },
    };
  }
  let sfPayload;
  try {
    sfPayload = snowflakePayloadFromResolved(resolved);
  } catch (e) {
    return { ok: false, error: describeConnectError(e) };
  }
  const normalized = profiles.map((p) => ({
    crmId: p.crmId,
    ecid: p.ecid,
    email: p.email,
    phoneNumber: p.phoneNumber,
    loyaltyId: p.loyaltyId,
  }));
  return postSignedRunner('/internal/enrich', sfPayload, {
    profiles: normalized,
    event_types: eventTypes,
  });
}

module.exports = {
  PHASE_TABLES,
  handleQueryProfiles,
  handleTableStructure,
  handleAgenticGenerateFull,
  handleAgenticEnrich,
};
