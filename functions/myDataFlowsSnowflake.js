'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { INDUSTRY_CONFIG } = require('./snowflakeIndustryProfileRegistry');
const { listIndustryEventTables } = require('./snowflakeIndustryEventRegistry');
const travelDefinitions = require('./snowflakeTravelTableDefinitions.json');
const { BASE_RECIPIENT_TABLE, RECIPIENT_COLUMN_DEFINITIONS } = require('./snowflakeRecipientStore');
const { CRM_SEQUENCE, CRM_BLOCK_SIZE, readNextSeedCrmIndex } = require('./snowflakeSeedStore');
const { readSnowflakeCell } = require('./snowflakeRow');

const SANDBOX = 'apalmer';
const DATABASE = 'TRAVEL_DATABASE';
const SOURCE_SCHEMA = 'AEP_SCHEMA';
const ROW_LIMIT = 10;
const READ_TIMEOUT_MS = 55000;
const CLOSE_TIMEOUT_MS = 5000;
const SQL_FILES = { travel: '10_travel.sql', fsi: '20_fsi.sql', retail: '30_retail.sql',
  telecom: '40_telecom.sql', media: '50_media.sql', sports: '60_sports.sql' };
const TIMESTAMPS = ['VERSION_TS', '_RECORDCREATEDTIMESTAMP', '_RECORDUPDATEDTIMESTAMP'];

function failure(code, message, evidence = []) {
  return Object.assign(new Error(message), { code, status: 400, statusCode: 400, evidence });
}

function identifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(String(value || ''))) {
    throw failure('SNOWFLAKE_CONFIG_REQUIRED', 'Saved Snowflake database, schema and warehouse must be valid identifiers.');
  }
  return String(value);
}

function industryConfig(industry) {
  if (!Object.hasOwn(SQL_FILES, industry)) throw failure('INVALID_INDUSTRY', 'Choose one of the six supported industries.');
  return INDUSTRY_CONFIG[industry];
}

function validateInput(uid, industry) {
  if (typeof uid !== 'string' || !uid.trim() || uid.length > 128) throw failure('INVALID_USER', 'A signed-in lab user is required.');
  industryConfig(industry);
}

function columnsFromDdl(ddl) {
  return ddl.filter((line) => !/^\s*(constraint|primary|foreign|unique|check)\b/i.test(line))
    .map((line) => {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s+([A-Z_]+)(?:\((\d+)(?:\s*,\s*(\d+))?\))?/i);
      if (!match) throw new Error('Unsupported fixed Snowflake column definition');
      return { name: match[1].toUpperCase(), type: match[2].toUpperCase(),
        precision: match[3] == null ? null : Number(match[3]), scale: match[4] == null ? 0 : Number(match[4]) };
    });
}

function sourceDefinitions(industry) {
  const config = industryConfig(industry);
  const base = travelDefinitions.find(({ table }) => table === BASE_RECIPIENT_TABLE);
  const parentColumns = new Map(columnsFromDdl(base.columnDdl).map((column) => [column.name, column]));
  for (const [name, type] of RECIPIENT_COLUMN_DEFINITIONS) {
    if (!parentColumns.has(name)) parentColumns.set(name, columnsFromDdl([`${name} ${type}`])[0]);
  }
  const linked = industry === 'travel'
    ? travelDefinitions.filter(({ table }) => ['AGENTIC_TRAVEL_EVENT_BOOKING', 'AGENTIC_TRAVEL_EVENT_DISRUPTION'].includes(table))
    : listIndustryEventTables(industry);
  return [
    { table: BASE_RECIPIENT_TABLE, columns: [...parentColumns.values()], exact: true, key: 'RECIPIENT_ID' },
    { table: config.table, columns: columnsFromDdl(config.columnDdl), exact: true, key: 'CRMID' },
    ...linked.map((definition) => ({ table: definition.table,
      columns: columnsFromDdl(definition.columnDdl), exact: false,
      key: industry === 'travel' ? '_ID' : definition.kind === 'event' ? 'EVENTID' : 'GENERATIONID' })),
  ];
}

// Only repository-owned SQL defines inspection targets; no caller supplies SQL or identifiers.
function relDefinitions(industry) {
  const sql = fs.readFileSync(path.join(__dirname, 'sql/rel', SQL_FILES[industry]), 'utf8');
  return [
    { table: 'RECIPIENT', key: 'RECIPIENT_ID', exact: true, catalog: false },
    ...[...sql.matchAll(/CREATE\s+(?:DYNAMIC\s+)?TABLE\s+IF\s+NOT\s+EXISTS\s+REL\.(\w+)\s*([\s\S]*?)(?=;|$)/gi)]
      .map(([, table, definition]) => {
        const catalog = table.endsWith('_CATALOG');
        let columns;
        if (definition.trim().startsWith('(')) {
          columns = columnsFromDdl(definition.trim().slice(1).split('\n')
            .map((line) => line.trim().replace(/,$/, '')).filter((line) => line && line !== ')'));
        } else {
          const select = definition.slice(definition.indexOf('SELECT') + 6, definition.indexOf('\nFROM'));
          columns = select.split('\n').map((line) => line.trim().replace(/,$/, '')).filter(Boolean).map((line) => {
            const name = (line.match(/\sAS\s+([A-Z_][A-Z0-9_]*)$/i)?.[1]
              || line.match(/(?:\w+\.)?([A-Z_][A-Z0-9_]*)$/i)?.[1]);
            if (!name) throw new Error('Unsupported fixed REL projection');
            const column = name.toUpperCase();
            return { name: column, type: TIMESTAMPS.includes(column) ? 'TIMESTAMP_NTZ'
              : column === 'RECIPIENT_ID' || /_ID$|_CODE$|^SKU$/.test(column) ? 'VARCHAR' : null };
          });
        }
        return { table, key: columns[0].name, catalog, exact: false, columns };
      }),
  ];
}

const INSPECTION_TABLES = Object.freeze(Object.fromEntries(Object.keys(SQL_FILES).map((industry) => [
  industry, Object.freeze({
    source: Object.freeze(sourceDefinitions(industry).map(({ table, key, exact }) => Object.freeze({ table, key, exact }))),
    rel: Object.freeze(relDefinitions(industry).map(({ table, key, catalog, exact }) => Object.freeze({ table, key, catalog, exact }))),
  }),
])));

function typeFamily(type) {
  if (['TEXT', 'VARCHAR', 'CHAR', 'CHARACTER', 'STRING'].includes(type)) return 'TEXT';
  if (['NUMBER', 'DECIMAL', 'NUMERIC', 'FIXED', 'INTEGER', 'INT', 'BIGINT'].includes(type)) return 'NUMBER';
  return type;
}

function compatible(expected, actual) {
  if (!expected.type) return true;
  if (typeFamily(expected.type) !== typeFamily(String(actual.DATA_TYPE).toUpperCase())) return false;
  if (typeFamily(expected.type) === 'TEXT' && expected.precision != null
    && Number(actual.CHARACTER_MAXIMUM_LENGTH) < expected.precision) return false;
  if (typeFamily(expected.type) === 'NUMBER' && expected.precision != null) {
    return Number(actual.NUMERIC_SCALE) >= expected.scale
      && Number(actual.NUMERIC_PRECISION) - Number(actual.NUMERIC_SCALE) >= expected.precision - expected.scale;
  }
  return true;
}

async function verifySeedReadiness(execute, cfg, industry) {
  industryConfig(industry);
  const database = identifier(cfg.database);
  const sourceSchema = identifier(cfg.schema);
  identifier(cfg.warehouse);
  const evidence = [];
  const queries = [];
  const descriptors = [
    ...sourceDefinitions(industry).map((entry) => ({ ...entry, schema: sourceSchema })),
    ...relDefinitions(industry).map((entry) => ({ ...entry, schema: 'REL',
      columns: entry.table === 'RECIPIENT'
        ? sourceDefinitions(industry)[0].columns.filter(({ name }) => RECIPIENT_COLUMN_DEFINITIONS.some(([column]) => column === name))
        : entry.columns })),
  ];
  for (const schema of [...new Set(descriptors.map((entry) => entry.schema))]) {
    const tables = descriptors.filter((entry) => entry.schema === schema).map(({ table }) => table);
    const sql = `SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH, c.NUMERIC_PRECISION, c.NUMERIC_SCALE, t.TABLE_TYPE
FROM ${database}.INFORMATION_SCHEMA.COLUMNS c
JOIN ${database}.INFORMATION_SCHEMA.TABLES t ON t.TABLE_CATALOG = c.TABLE_CATALOG AND t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME IN (${tables.map(() => '?').join(', ')})`;
    queries.push({ sql, parameters: ['schema', ...tables.map(() => 'fixedTable')] });
    const rows = await execute(sql, [schema.toUpperCase(), ...tables]);
    const metadata = new Map();
    for (const row of rows) {
      const values = Object.fromEntries(['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE', 'CHARACTER_MAXIMUM_LENGTH', 'NUMERIC_PRECISION', 'NUMERIC_SCALE', 'TABLE_TYPE']
        .map((name, index) => [name, readSnowflakeCell(row, index, name)]));
      const table = String(values.TABLE_NAME).toUpperCase();
      if (!metadata.has(table)) metadata.set(table, new Map());
      metadata.get(table).set(String(values.COLUMN_NAME).toUpperCase(), values);
    }
    for (const entry of descriptors.filter((entry) => entry.schema === schema)) {
      const actual = metadata.get(entry.table);
      const incompatible = entry.columns.filter((column) => !actual?.has(column.name)
        || !compatible(column, actual.get(column.name))).map(({ name }) => name);
      const tableType = actual?.values().next().value?.TABLE_TYPE;
      const compatibleObject = tableType === (schema === 'REL' && entry.table === 'RECIPIENT' ? 'VIEW' : 'BASE TABLE');
      evidence.push({ table: `${database}.${schema}.${entry.table}`,
        state: incompatible.length || !compatibleObject ? 'unavailable' : 'verified',
        objectType: tableType || null, incompatibleColumns: incompatible });
    }
  }
  const referencesSql = `SELECT REFERENCED_DATABASE_NAME, REFERENCED_SCHEMA_NAME, REFERENCED_OBJECT_NAME, REFERENCED_OBJECT_TYPE
FROM TABLE(GET_OBJECT_REFERENCES(DATABASE_NAME => '${database.toUpperCase()}', SCHEMA_NAME => 'REL', OBJECT_NAME => 'RECIPIENT'))`;
  queries.push({ sql: referencesSql, parameters: [] });
  const references = await execute(referencesSql);
  const expectedReference = [database.toUpperCase(), sourceSchema.toUpperCase(), BASE_RECIPIENT_TABLE, 'TABLE'];
  const referenceColumns = ['REFERENCED_DATABASE_NAME', 'REFERENCED_SCHEMA_NAME', 'REFERENCED_OBJECT_NAME', 'REFERENCED_OBJECT_TYPE'];
  const linked = references.length === 1 && expectedReference.every((expected, index) =>
    readSnowflakeCell(references[0], index, referenceColumns[index]) === expected);
  evidence.push({ table: `${database}.REL.RECIPIENT`, kind: 'lineage', state: linked ? 'verified' : 'unavailable' });
  const conflictSql = `SELECT 1 AS CONFLICT FROM ${database}.${sourceSchema}.${BASE_RECIPIENT_TABLE}
WHERE ECID IS NOT NULL AND TRIM(ECID) <> '' GROUP BY ECID
HAVING COUNT(*) > 1 OR COUNT_IF(RECIPIENT_ID IS NOT NULL AND RECIPIENT_ID <> 'R-' || LEFT(SHA2(ECID, 256), 32)) > 0 LIMIT 1`;
  queries.push({ sql: conflictSql, parameters: [] });
  const conflicts = await execute(conflictSql);
  evidence.push({ table: `${database}.${sourceSchema}.${BASE_RECIPIENT_TABLE}`, kind: 'identityCompatibility',
    state: conflicts.length ? 'unavailable' : 'verified' });
  const sequenceSql = `SELECT "INCREMENT", NEXT_VALUE FROM ${database}.INFORMATION_SCHEMA.SEQUENCES
WHERE SEQUENCE_SCHEMA = ? AND SEQUENCE_NAME = ?`;
  queries.push({ sql: sequenceSql, parameters: ['sourceSchema', 'crmSequence'] });
  const sequences = await execute(sequenceSql, [sourceSchema.toUpperCase(), CRM_SEQUENCE]);
  let sequenceReady = sequences.length === 1 && Number(readSnowflakeCell(sequences[0], 0, 'INCREMENT')) === CRM_BLOCK_SIZE;
  if (sequenceReady && evidence.every(({ state }) => state === 'verified')) {
    const next = Number(readSnowflakeCell(sequences[0], 1, 'NEXT_VALUE'));
    const minimum = await readNextSeedCrmIndex(execute, cfg, [industry]);
    sequenceReady = Number.isSafeInteger(next) && next >= minimum && Number.isSafeInteger(next + CRM_BLOCK_SIZE - 1);
  }
  evidence.push({ table: `${database}.${sourceSchema}.${CRM_SEQUENCE}`,
    state: sequenceReady ? 'verified' : 'unavailable', kind: 'sequence' });
  if (evidence.some(({ state }) => state !== 'verified')) {
    throw failure('SNOWFLAKE_NOT_READY', 'Saved Snowflake source/REL objects, column types or CRM allocator are not ready. No provisioning was attempted.', evidence);
  }
  return { evidence, queries };
}

function safeProviderFailure() {
  return failure('SNOWFLAKE_UNAVAILABLE', 'The saved Snowflake connection or required read could not be verified.');
}

function within(promise, milliseconds, onTimeout = () => {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(failure('SNOWFLAKE_TIMEOUT', 'Snowflake verification timed out; no automatic retry was started.'));
    }, Math.max(1, milliseconds));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function stage(evidence, queries) {
  const state = evidence.some((entry) => entry.state === 'failed') ? 'failed'
    : evidence.some((entry) => entry.state === 'unavailable') ? 'unavailable'
      : evidence.some((entry) => entry.state === 'waiting') ? 'waiting' : 'verified';
  return { state, detail: state === 'verified' ? 'Every listed table has bounded matching evidence.'
    : 'See per-table evidence; missing or optional rows are not proof of propagation.', evidence, queries };
}

/**
 * Owner authorization and trace persistence belong to the caller. Pass the
 * preflight baseEmail/mobilePhone as expectedBaseEmail/expectedMobilePhone to
 * generate, and persist its onPrepared receipt before allowing seed row writes.
 */
function createMyDataFlowsSnowflake(dependencies = {}) {
  const store = dependencies.store || require('./snowflakeConnectionStore');
  const prefs = dependencies.prefsStore || require('./labProfileGenerationPrefsStore');
  const buildOptions = dependencies.buildOptions || require('./snowflakeService').buildSnowflakeConnectOptions;
  const generateProfiles = dependencies.generateProfiles || ((input) => require('./snowflakeDataGeneratorService').handleGenerateIndustryProfiles(input));

  async function saved(uid) {
    const resolved = await store.resolveConnection(uid, SANDBOX);
    if (!resolved?.credential || !resolved.config?.account || !resolved.config?.user) {
      throw failure('SNOWFLAKE_CONFIG_REQUIRED', 'Save a Snowflake connection and credential for apalmer first.');
    }
    for (const name of ['database', 'schema', 'warehouse']) identifier(resolved.config[name]);
    if (resolved.config.database.toUpperCase() !== DATABASE || resolved.config.schema.toUpperCase() !== SOURCE_SCHEMA) {
      throw failure('SNOWFLAKE_CONTEXT_MISMATCH', 'The saved Snowflake connection does not target the reviewed Architecture source database and schema.');
    }
    return resolved;
  }

  async function preferences(uid) {
    const value = await prefs.getPrefs(uid, SANDBOX);
    if (!prefs.isValidEmail(value?.baseEmail) || !/^\+[1-9]\d{6,14}$/.test(String(value?.mobilePhone || ''))) {
      throw failure('GENERATION_PREFS_REQUIRED', 'Save a valid recipient base email and international mobile number first.');
    }
    return value;
  }

  async function withConnection(resolved, work, deadlineAt) {
    let connection;
    let activeStatement;
    let expired = false;
    const expire = () => {
      expired = true;
      // Cancellation is best-effort; destroying the owned connection below is mandatory.
      try { activeStatement?.cancel?.(() => {}); } catch { /* destroy still runs */ }
    };
    try {
      const sdk = dependencies.sdk || require('snowflake-sdk');
      connection = sdk.createConnection({ ...buildOptions(resolved), clientSessionKeepAlive: false,
        timeout: 10000 });
      return await within((async () => {
        await new Promise((resolve, reject) => connection.connect((error) => error ? reject(error) : resolve()));
        const execute = (sqlText, binds = []) => new Promise((resolve, reject) => {
          if (expired) { reject(safeProviderFailure()); return; }
          activeStatement = connection.execute({
            sqlText, binds, parameters: { STATEMENT_TIMEOUT_IN_SECONDS: 10, MULTI_STATEMENT_COUNT: 1 },
            complete(error, _statement, rows) {
              activeStatement = null;
              error ? reject(error) : resolve(rows || []);
            },
          });
        });
        return work(execute, resolved.config);
      })(), deadlineAt - Date.now(), expire);
    } finally {
      expired = true;
      if (connection) await within(new Promise((resolve, reject) => {
        connection.destroy((error) => error ? reject(safeProviderFailure()) : resolve());
      }), dependencies.closeTimeoutMs || CLOSE_TIMEOUT_MS);
    }
  }

  return {
    async preflight({ uid, industry }) {
      validateInput(uid, industry);
      const deadlineAt = Date.now() + (dependencies.readTimeoutMs || READ_TIMEOUT_MS);
      try {
        const [resolved, generationPrefs] = await within(Promise.all([saved(uid), preferences(uid)]), deadlineAt - Date.now());
        const readiness = await withConnection(resolved, (execute, cfg) => verifySeedReadiness(execute, cfg, industry), deadlineAt);
        return { ready: true, baseEmail: generationPrefs.baseEmail, mobilePhone: generationPrefs.mobilePhone, ...readiness };
      } catch (error) {
        if (error.status === 400) throw error;
        throw safeProviderFailure();
      }
    },
    async generate({ uid, industry, count = 1, samplingMode, onPrepared, expectedBaseEmail, expectedMobilePhone }) {
      validateInput(uid, industry);
      const [, generationPrefs] = await Promise.all([saved(uid), preferences(uid)]);
      if ((expectedBaseEmail != null && expectedBaseEmail !== generationPrefs.baseEmail)
        || (expectedMobilePhone != null && expectedMobilePhone !== generationPrefs.mobilePhone)) {
        throw failure('GENERATION_PREFS_CHANGED', 'Saved recipient email or mobile changed after preflight. Start a new trace.');
      }
      return generateProfiles({ labUser: uid, sandbox: SANDBOX, industry, count, samplingMode, prepareTables: false,
        expectedBaseEmail: generationPrefs.baseEmail, expectedMobilePhone: generationPrefs.mobilePhone,
        expectedDatabase: DATABASE, expectedSchema: SOURCE_SCHEMA, onPrepared });
    },
    async inspect({ uid, industry, identity }) {
      validateInput(uid, industry);
      if (!identity || !['email', 'ecid', 'crmId', 'recipientId'].every((name) =>
        typeof identity[name] === 'string' && identity[name].trim() && identity[name].length <= 320)) {
        throw failure('INVALID_IDENTITY', 'The persisted prepared identity is required.');
      }
      const sourceEvidence = [];
      const relEvidence = [];
      const sourceQueries = [];
      const relQueries = [];
      const deadlineAt = Date.now() + (dependencies.readTimeoutMs || READ_TIMEOUT_MS);
      try {
        const resolved = await within(saved(uid), deadlineAt - Date.now());
        await withConnection(resolved, async (execute, cfg) => {
          for (const [kind, entries, evidence, queries] of [
            ['source', sourceDefinitions(industry), sourceEvidence, sourceQueries],
            ['rel', relDefinitions(industry), relEvidence, relQueries],
          ]) {
            for (const entry of entries) {
              const table = `${identifier(cfg.database)}.${kind === 'source' ? identifier(cfg.schema) : 'REL'}.${entry.table}`;
              const names = new Set((entry.columns || RECIPIENT_COLUMN_DEFINITIONS.map(([name]) => ({ name }))).map(({ name }) => name));
              const selected = [...new Set([entry.key, ...(entry.catalog ? [] : ['ECID', 'CRMID', 'RECIPIENT_ID']),
                ...TIMESTAMPS].filter((column) => names.has(column)))];
              const predicates = entry.catalog ? [] : entry.exact
                ? ['EMAIL = ?', 'ECID = ?', 'CRMID = ?', 'RECIPIENT_ID = ?']
                : kind === 'source' ? ['EMAIL = ?', 'ECID = ?', 'CRMID = ?'] : ['RECIPIENT_ID = ?'];
              const binds = entry.catalog ? [] : entry.exact
                ? [identity.email, identity.ecid, identity.crmId, identity.recipientId]
                : kind === 'source' ? [identity.email, identity.ecid, identity.crmId] : [identity.recipientId];
              const sql = `SELECT ${selected.join(', ')}, COUNT(*) OVER () AS MATCHED_ROWCOUNT FROM ${table}${predicates.length ? ` WHERE ${predicates.join(' AND ')}` : ''} ORDER BY ${entry.key} LIMIT ${ROW_LIMIT}`;
              queries.push({ table, sql, parameters: entry.catalog ? [] : entry.exact
                ? ['identity.email', 'identity.ecid', 'identity.crmId', 'identity.recipientId']
                : kind === 'source' ? ['identity.email', 'identity.ecid', 'identity.crmId'] : ['identity.recipientId'] });
              try {
                const rows = await execute(sql, binds);
                const rowcount = rows.length ? Number(readSnowflakeCell(rows[0], selected.length, 'MATCHED_ROWCOUNT')) : 0;
                if (!Number.isSafeInteger(rowcount) || rowcount < rows.length) throw safeProviderFailure();
                const samples = rows.slice(0, ROW_LIMIT).map((row) => Object.fromEntries(selected.map((name, index) => {
                  const value = readSnowflakeCell(row, index, name);
                  return [name, value instanceof Date ? value.toISOString() : value];
                })));
                evidence.push({ table, scope: entry.catalog ? 'catalog' : 'identity', rowcount,
                  state: entry.exact && rowcount > 1 ? 'failed' : rowcount > 0 ? 'verified' : 'waiting',
                  detail: entry.catalog ? 'Shared catalog evidence, not a per-person row.'
                    : rowcount ? 'Exact prepared identity predicate matched.' : 'No matching row observed; this table may be optional or awaiting refresh.',
                  rows: samples, limit: ROW_LIMIT, truncated: rowcount > ROW_LIMIT });
              } catch {
                evidence.push({ table, state: 'failed', detail: 'Table read failed or its required columns are unavailable.', rows: [] });
              }
            }
          }
        }, deadlineAt);
      } catch {
        for (const [kind, evidence] of [['source', sourceEvidence], ['rel', relEvidence]]) {
          const expected = INSPECTION_TABLES[industry][kind];
          const before = evidence.length;
          for (const { table } of expected) if (!evidence.some((entry) => entry.table?.endsWith(`.${table}`))) {
            evidence.push({ table, state: 'unavailable', detail: 'Saved connection or required metadata could not be read.', rows: [] });
          }
          if (evidence.length === before) evidence.push({
            table: 'connection', state: 'failed', detail: 'Snowflake connection cleanup could not be confirmed.', rows: [],
          });
        }
      }
      return { source: stage(sourceEvidence, sourceQueries), rel: stage(relEvidence, relQueries) };
    },
  };
}

module.exports = { createMyDataFlowsSnowflake, verifySeedReadiness, INSPECTION_TABLES, SANDBOX, DATABASE, SOURCE_SCHEMA, ROW_LIMIT };
