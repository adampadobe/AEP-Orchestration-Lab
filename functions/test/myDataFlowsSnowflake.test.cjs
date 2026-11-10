'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMyDataFlowsSnowflake, INSPECTION_TABLES, SANDBOX, ROW_LIMIT } = require('../myDataFlowsSnowflake');
const { INDUSTRY_CONFIG } = require('../snowflakeIndustryProfileRegistry');
const { listIndustryEventTables } = require('../snowflakeIndustryEventRegistry');
const { BASE_RECIPIENT_TABLE, RECIPIENT_COLUMN_DEFINITIONS } = require('../snowflakeRecipientStore');
const travel = require('../snowflakeTravelTableDefinitions.json');

const identity = { email: "saved+10112026-1@example.test", ecid: '12345678901234567890123456789012345678',
  crmId: 'CRM2000', recipientId: 'R-prepared' };
const prefs = { baseEmail: 'saved@example.test', mobilePhone: '+447700900777' };

function ddlMetadata(table, schema, ddl) {
  return ddl.filter((line) => !/^\s*(constraint|primary|foreign|unique|check)\b/i.test(line)).map((line) => {
    const [, name, type, precision, scale] = line.trim().match(/^(\w+)\s+(\w+)(?:\((\d+)(?:\s*,\s*(\d+))?\))?/);
    return { TABLE_NAME: table, COLUMN_NAME: name, TABLE_TYPE: table === 'RECIPIENT' ? 'VIEW' : 'BASE TABLE',
      TABLE_SCHEMA: schema, DATA_TYPE: type === 'VARCHAR' ? 'TEXT' : type,
      CHARACTER_MAXIMUM_LENGTH: type === 'VARCHAR' ? Number(precision || 16777216) : null,
      NUMERIC_PRECISION: Number(precision || 38), NUMERIC_SCALE: Number(scale || 0) };
  });
}

function metadata(industry) {
  const config = INDUSTRY_CONFIG[industry];
  const base = travel.find(({ table }) => table === BASE_RECIPIENT_TABLE);
  const parentDdl = new Map(base.columnDdl.filter((line) => !/^constraint/i.test(line)).map((line) => [line.split(' ')[0], line]));
  for (const [name, type] of RECIPIENT_COLUMN_DEFINITIONS) if (!parentDdl.has(name)) parentDdl.set(name, `${name} ${type}`);
  const definitions = [
    { table: BASE_RECIPIENT_TABLE, columnDdl: [...parentDdl.values()] }, config,
    ...(industry === 'travel' ? travel.filter(({ table }) => /AGENTIC_TRAVEL_EVENT_(BOOKING|DISRUPTION)$/.test(table)) : listIndustryEventTables(industry)),
  ];
  const rows = definitions.flatMap(({ table, columnDdl }) => ddlMetadata(table, 'AEP_SCHEMA', columnDdl));
  rows.push(...ddlMetadata('RECIPIENT', 'REL', [...parentDdl.values()].filter((line) =>
    RECIPIENT_COLUMN_DEFINITIONS.some(([name]) => line.startsWith(`${name} `)))));
  const file = fs.readdirSync(path.join(__dirname, '../sql/rel')).find((file) => file.endsWith(`_${industry}.sql`));
  const sql = fs.readFileSync(path.join(__dirname, '../sql/rel', file), 'utf8');
  for (const [, table, definition] of sql.matchAll(/CREATE\s+(?:DYNAMIC\s+)?TABLE\s+IF\s+NOT\s+EXISTS\s+REL\.(\w+)\s*([\s\S]*?)(?=;|$)/gi)) {
    if (definition.trim().startsWith('(')) {
      rows.push(...ddlMetadata(table, 'REL', definition.trim().slice(1).split('\n')
        .map((line) => line.trim().replace(/,$/, '')).filter((line) => line && line !== ')')));
    } else {
      const projection = definition.slice(definition.indexOf('SELECT') + 6, definition.indexOf('\nFROM'));
      for (const line of projection.split('\n').map((line) => line.trim().replace(/,$/, '')).filter(Boolean)) {
        const name = line.match(/\sAS\s+(\w+)$/i)?.[1] || line.match(/(?:\w+\.)?(\w+)$/)?.[1];
        rows.push(...ddlMetadata(table, 'REL', [`${name} ${/VERSION_TS|_RECORD.*TIMESTAMP/.test(name) ? 'TIMESTAMP_NTZ' : 'VARCHAR(320)'}`]));
      }
    }
  }
  return rows;
}

function fixture({ industry = 'retail', changeMetadata = (rows) => rows, queryRows, connectError = false,
  sequence = { INCREMENT: 1000, NEXT_VALUE: 2000 }, generationPrefs = prefs, lineage = true,
  conflict = false, credential = 'not-a-real-credential', generateProfiles,
  database = 'TRAVEL_DATABASE', schema = 'AEP_SCHEMA', readTimeoutMs, closeTimeoutMs,
  hangRead = false, hangConnect = false, closeError = false } = {}) {
  const calls = [];
  let closed = 0;
  let connections = 0;
  let generated;
  let cancelled = 0;
  const rows = changeMetadata(metadata(industry));
  const connection = {
    connect(callback) { if (!hangConnect) callback(connectError ? new Error('do not expose connection credential') : null); },
    destroy(callback) { closed++; callback(closeError ? new Error('secret cleanup failure') : null); },
    execute(options) {
      const { sqlText, binds } = options;
      calls.push({ sql: sqlText, binds });
      assert.equal(options.parameters.STATEMENT_TIMEOUT_IN_SECONDS, 10);
      if (hangRead) return { cancel() { cancelled++; } };
      try {
        let result;
        if (sqlText.includes('INFORMATION_SCHEMA.COLUMNS')) result = rows.filter((row) => row.TABLE_SCHEMA === binds[0] && binds.slice(1).includes(row.TABLE_NAME));
        else if (sqlText.includes('INFORMATION_SCHEMA.SEQUENCES')) result = sequence ? [sequence] : [];
        else if (sqlText.includes('GET_OBJECT_REFERENCES')) result = [{
          REFERENCED_DATABASE_NAME: database, REFERENCED_SCHEMA_NAME: schema,
          REFERENCED_OBJECT_NAME: lineage ? BASE_RECIPIENT_TABLE : 'UNRELATED_PERSON',
          REFERENCED_OBJECT_TYPE: 'TABLE',
        }];
        else if (sqlText.startsWith('SELECT 1 AS CONFLICT')) result = conflict ? [{ CONFLICT: 1 }] : [];
        else if (sqlText.startsWith('SELECT MAX(MX)')) result = [{ MX: 1000 }];
        else if (queryRows) result = queryRows(sqlText, binds);
        else result = [];
        options.complete(null, null, result);
      } catch (error) { options.complete(error); }
    },
  };
  const adapter = createMyDataFlowsSnowflake({
    readTimeoutMs, closeTimeoutMs,
    store: { resolveConnection: async (uid, sandbox) => {
      assert.equal(uid, 'owner');
      assert.equal(sandbox, SANDBOX);
      return { config: { database, schema, warehouse: 'DEMO_WH', account: 'saved-account', user: 'saved-user' }, credential };
    } },
    prefsStore: { getPrefs: async (_uid, sandbox) => { assert.equal(sandbox, 'apalmer'); return generationPrefs; },
      isValidEmail: (email) => typeof email === 'string' && email.includes('@') },
    buildOptions: (resolved) => ({ account: resolved.config.account, password: resolved.credential }),
    sdk: { createConnection(options) {
      assert.equal(options.timeout, 10000);
      connections++; return connection;
    } },
    generateProfiles: generateProfiles || (async (input) => { generated = input; return { ok: true }; }),
  });
  return { adapter, calls, closed: () => closed, cancelled: () => cancelled, connections: () => connections, generated: () => generated };
}

test('preflight verifies all six fixed industry contracts using only SELECT and always closes', async () => {
  for (const industry of Object.keys(INSPECTION_TABLES)) {
    const f = fixture({ industry });
    const result = await f.adapter.preflight({ uid: 'owner', industry });
    assert.equal(result.ready, true, industry);
    assert.equal(result.baseEmail, prefs.baseEmail);
    assert.equal(result.mobilePhone, prefs.mobilePhone);
    assert.ok(result.evidence.every(({ state }) => state === 'verified'));
    assert.ok(result.evidence.some(({ kind }) => kind === 'sequence'));
    assert.ok(result.evidence.some(({ kind }) => kind === 'lineage'));
    assert.equal(f.calls.every(({ sql }) => sql.startsWith('SELECT ')), true);
    assert.equal(f.calls.some(({ sql }) => /NEXTVAL|CREATE|ALTER|MERGE|INSERT|UPDATE\b/.test(sql)), false);
    assert.equal(f.closed(), 1);
    assert.equal(JSON.stringify(result).includes('not-a-real-credential'), false);
  }
});

test('preflight fails closed on missing columns, wrong types, narrow columns and wrong object kinds', async () => {
  for (const changeMetadata of [
    (rows) => rows.filter((row) => row.COLUMN_NAME !== 'PHONENUMBER'),
    (rows) => rows.map((row) => row.COLUMN_NAME === 'PUSHTOKENS' ? { ...row, DATA_TYPE: 'TEXT' } : row),
    (rows) => rows.map((row) => row.COLUMN_NAME === 'EMAIL' ? { ...row, CHARACTER_MAXIMUM_LENGTH: 10 } : row),
    (rows) => rows.map((row) => row.COLUMN_NAME === 'LIFETIMEVALUE' ? { ...row, NUMERIC_PRECISION: 2 } : row),
    (rows) => rows.map((row) => row.TABLE_NAME === BASE_RECIPIENT_TABLE ? { ...row, TABLE_TYPE: 'VIEW' } : row),
    (rows) => rows.filter((row) => row.TABLE_NAME !== 'REL_RETAIL_ORDER_LINE'),
  ]) {
    const f = fixture({ changeMetadata });
    await assert.rejects(f.adapter.preflight({ uid: 'owner', industry: 'retail' }), (error) =>
      error.status === 400 && error.code === 'SNOWFLAKE_NOT_READY'
      && error.evidence.some(({ state }) => state === 'unavailable'));
    assert.equal(f.closed(), 1);
    assert.equal(f.calls.some(({ sql }) => /NEXTVAL|^CREATE|^ALTER|^MERGE|^INSERT/.test(sql)), false);
  }
});

test('preflight requires safe allocator metadata, correct recipient lineage and compatible existing identities', async () => {
  for (const options of [{ sequence: null }, { sequence: { INCREMENT: 1, NEXT_VALUE: 2000 } },
    { sequence: { INCREMENT: 1000, NEXT_VALUE: 100 } }, { lineage: false }, { conflict: true }]) {
    const f = fixture(options);
    await assert.rejects(f.adapter.preflight({ uid: 'owner', industry: 'retail' }), { code: 'SNOWFLAKE_NOT_READY' });
    assert.equal(f.closed(), 1);
  }
});

test('preflight rejects missing saved preferences or credentials without connecting', async () => {
  for (const options of [{ generationPrefs: { ...prefs, baseEmail: '' } },
    { generationPrefs: { ...prefs, mobilePhone: '' } }, { credential: '' }]) {
    const f = fixture(options);
    await assert.rejects(f.adapter.preflight({ uid: 'owner', industry: 'retail' }), (error) => error.status === 400);
    assert.equal(f.connections(), 0);
  }
});

test('preflight and generation reject another saved database/schema before connecting or generating', async () => {
  for (const options of [{ database: 'OTHER_DATABASE' }, { schema: 'OTHER_SCHEMA' }]) {
    const f = fixture(options);
    await assert.rejects(f.adapter.preflight({ uid: 'owner', industry: 'retail' }), { code: 'SNOWFLAKE_CONTEXT_MISMATCH' });
    await assert.rejects(f.adapter.generate({ uid: 'owner', industry: 'retail' }), { code: 'SNOWFLAKE_CONTEXT_MISMATCH' });
    assert.equal(f.connections(), 0);
    assert.equal(f.generated(), undefined);
  }
});

test('connection failures are sanitized and the allocated connection is closed', async () => {
  const f = fixture({ connectError: true });
  await assert.rejects(f.adapter.preflight({ uid: 'owner', industry: 'retail' }), (error) =>
    error.code === 'SNOWFLAKE_UNAVAILABLE' && !error.message.includes('credential'));
  assert.equal(f.closed(), 1);
});

test('generate pins one recipient, sandbox, preferences and callback without preparation and preserves uncertain results', async () => {
  const original = { ok: false, outcomeUnknown: true, profiles: [identity] };
  let called = 0;
  const callback = async () => { called++; };
  const f = fixture({ generateProfiles: async (input) => {
    assert.equal(input.count, 1);
    assert.equal(input.labUser, 'owner');
    assert.equal(input.sandbox, 'apalmer');
    assert.equal(input.prepareTables, false);
    assert.equal(input.expectedBaseEmail, prefs.baseEmail);
    assert.equal(input.expectedMobilePhone, prefs.mobilePhone);
    assert.equal(input.expectedDatabase, 'TRAVEL_DATABASE');
    assert.equal(input.expectedSchema, 'AEP_SCHEMA');
    assert.equal(input.onPrepared, callback);
    await input.onPrepared({ profiles: [identity], runStamp: '2026-11-10T00:00:00Z' });
    return original;
  } });
  assert.equal(await f.adapter.generate({ uid: 'owner', industry: 'retail', onPrepared: callback,
    expectedBaseEmail: prefs.baseEmail, expectedMobilePhone: prefs.mobilePhone }), original);
  assert.equal(called, 1);
  assert.equal(f.connections(), 0);
});

test('generate refuses preflight snapshot drift before any generation/connection', async () => {
  for (const snapshot of [{ expectedBaseEmail: 'old@example.test' }, { expectedMobilePhone: '+447700900111' }]) {
    const f = fixture();
    await assert.rejects(f.adapter.generate({ uid: 'owner', industry: 'retail', ...snapshot }), { code: 'GENERATION_PREFS_CHANGED' });
    assert.equal(f.generated(), undefined);
    assert.equal(f.connections(), 0);
  }
});

function matchingRows(sql) {
  const names = sql.match(/^SELECT (.*), COUNT/)[1].split(', ');
  const entries = names.map((name) => [name, name === 'ECID' ? identity.ecid
    : name === 'CRMID' ? identity.crmId : name === 'RECIPIENT_ID' ? identity.recipientId
      : /TIMESTAMP|VERSION_TS/.test(name) ? '2026-11-10T10:00:00Z' : 'safe-key']);
  return [Object.fromEntries([...entries, ['MATCHED_ROWCOUNT', 1], ['PASSWORD', 'do-not-return']])];
}

test('inspect binds exact identities, reads every source/REL table and returns bounded keys/timestamps only', async () => {
  for (const industry of Object.keys(INSPECTION_TABLES)) {
    const f = fixture({ industry, queryRows: matchingRows });
    const result = await f.adapter.inspect({ uid: 'owner', industry, identity });
    assert.equal(result.source.state, 'verified');
    assert.equal(result.rel.state, 'verified');
    assert.equal(result.source.evidence.length, INSPECTION_TABLES[industry].source.length);
    assert.equal(result.rel.evidence.length, INSPECTION_TABLES[industry].rel.length);
    for (const { sql, binds } of f.calls) {
      assert.match(sql, /LIMIT 10$/);
      assert.doesNotMatch(sql, /SELECT \*|PHONENUMBER|FIRSTNAME|LASTNAME|PASSWORD/);
      assert.equal(sql.includes(identity.ecid), false);
      assert.equal(sql.includes(identity.email), false);
      if (sql.includes('_CATALOG ')) {
        assert.deepEqual(binds, []);
        assert.doesNotMatch(sql, /RECIPIENT_ID| WHERE /);
      } else if (sql.includes('EMAIL = ?')) {
        assert.deepEqual(binds.slice(0, 3), [identity.email, identity.ecid, identity.crmId]);
      } else assert.deepEqual(binds, [identity.recipientId]);
    }
    assert.equal(f.closed(), 1);
    assert.equal(JSON.stringify(result).includes('do-not-return'), false);
    assert.equal(JSON.stringify(result).includes('not-a-real-credential'), false);
    assert.ok(result.rel.evidence.find(({ scope }) => scope === 'catalog').detail.includes('not a per-person'));
  }
});

test('inspect does not verify REL just because its recipient view matches; empty optional tables stay waiting', async () => {
  const f = fixture({ queryRows: (sql) => sql.includes('.REL.RECIPIENT ') ? matchingRows(sql) : [] });
  const result = await f.adapter.inspect({ uid: 'owner', industry: 'retail', identity });
  assert.equal(result.rel.state, 'waiting');
  assert.equal(result.source.state, 'waiting');
  assert.equal(result.rel.evidence.find(({ table }) => table.endsWith('.RECIPIENT')).state, 'verified');
  assert.equal(result.rel.evidence.find(({ table }) => table.endsWith('.REL_RETAIL_RETURN')).state, 'waiting');
  assert.equal(result.rel.evidence.find(({ scope }) => scope === 'catalog').state, 'waiting');
});

test('inspect reports duplicate exact identities and partial table errors without leaking provider text', async () => {
  const f = fixture({ queryRows: (sql) => {
    if (sql.includes('.REL_RETAIL_ORDER_LINE ')) throw new Error('secret-password and private SQL');
    return matchingRows(sql).map((row) => ({ ...row, MATCHED_ROWCOUNT: sql.includes(`.${BASE_RECIPIENT_TABLE} `) ? 2 : 1 }));
  } });
  const result = await f.adapter.inspect({ uid: 'owner', industry: 'retail', identity });
  assert.equal(result.source.state, 'failed');
  assert.equal(result.rel.state, 'failed');
  assert.equal(result.rel.evidence.find(({ table }) => table.endsWith('.REL_RETAIL_ORDER')).state, 'verified');
  assert.equal(result.rel.evidence.find(({ table }) => table.endsWith('.REL_RETAIL_ORDER_LINE')).state, 'failed');
  assert.equal(JSON.stringify(result).includes('secret-password'), false);
  assert.equal(f.closed(), 1);
});

test('inspect keeps true rowcount and caps samples at ten and unavailable states name every unqueried table', async () => {
  const f = fixture({ queryRows: (sql) => Array.from({ length: 25 }, () => ({ ...matchingRows(sql)[0], MATCHED_ROWCOUNT: 25 })) });
  const result = await f.adapter.inspect({ uid: 'owner', industry: 'retail', identity });
  for (const entry of [...result.source.evidence, ...result.rel.evidence]) {
    assert.equal(entry.rows.length, ROW_LIMIT);
    assert.equal(entry.rowcount, 25);
    assert.equal(entry.truncated, true);
  }
  const broken = fixture({ connectError: true });
  const unavailable = await broken.adapter.inspect({ uid: 'owner', industry: 'retail', identity });
  assert.equal(unavailable.source.state, 'unavailable');
  assert.equal(unavailable.rel.state, 'unavailable');
  assert.equal(unavailable.rel.evidence.length, INSPECTION_TABLES.retail.rel.length);
  assert.equal(broken.closed(), 1);
});

test('adapter rejects non-allowlisted industries and incomplete identities before connecting', async () => {
  const f = fixture();
  for (const industry of ['telco', 'RETAIL', '__proto__', 'retail; DROP TABLE USERS']) {
    await assert.rejects(f.adapter.preflight({ uid: 'owner', industry }), { code: 'INVALID_INDUSTRY' });
  }
  await assert.rejects(f.adapter.inspect({ uid: 'owner', industry: 'retail', identity: { email: identity.email } }), { code: 'INVALID_IDENTITY' });
  assert.equal(f.connections(), 0);
});

test('inspection has a total deadline, cancels an active statement and closes without issuing later queries', async () => {
  const f = fixture({ hangRead: true, readTimeoutMs: 20, closeTimeoutMs: 20 });
  const result = await f.adapter.inspect({ uid: 'owner', industry: 'retail', identity });
  assert.equal(result.source.state, 'unavailable');
  assert.equal(result.rel.state, 'unavailable');
  assert.equal(f.calls.length, 1);
  assert.equal(f.cancelled(), 1);
  assert.equal(f.closed(), 1);
});

test('connection establishment is included in the total read deadline', async () => {
  const f = fixture({ hangConnect: true, readTimeoutMs: 20, closeTimeoutMs: 20 });
  const result = await f.adapter.inspect({ uid: 'owner', industry: 'retail', identity });
  assert.equal(result.source.state, 'unavailable');
  assert.equal(f.calls.length, 0);
  assert.equal(f.closed(), 1);
});

test('cleanup failure cannot leave a fully verified inspection result', async () => {
  const f = fixture({ queryRows: matchingRows, closeError: true });
  const result = await f.adapter.inspect({ uid: 'owner', industry: 'retail', identity });
  assert.equal(result.source.state, 'failed');
  assert.equal(result.rel.state, 'failed');
  assert.equal(JSON.stringify(result).includes('secret cleanup failure'), false);
});
