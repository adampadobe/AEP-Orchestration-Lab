'use strict';

const assert = require('node:assert/strict');

// Models only the parameterized SQL emitted by the seed/enrichment writers.
function snowflakeMemoryFixture({ now = () => new Date().toISOString() } = {}) {
  let tables = new Map();
  let snapshot;
  let sequenceNext = 1000;
  const rows = (table) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table);
  };
  function execute(sql, binds = []) {
    if (sql.startsWith('SELECT "INCREMENT"')) return [{ INCREMENT: 1000 }];
    if (sql.endsWith('.NEXTVAL AS START_INDEX')) {
      const start = sequenceNext;
      sequenceNext += 1000;
      return [{ START_INDEX: start }];
    }
    if (sql === 'BEGIN TRANSACTION') {
      assert.equal(snapshot, undefined, 'nested transaction');
      snapshot = structuredClone(tables);
      return [];
    }
    if (sql === 'COMMIT') { snapshot = undefined; return []; }
    if (sql === 'ROLLBACK') { tables = snapshot; snapshot = undefined; return []; }
    if (sql.startsWith('UPDATE ') && sql.includes('CURRENT_TIMESTAMP()')) {
      assert.equal(snapshot, undefined, 'timestamp publication must run after commit in autocommit mode');
      const table = sql.match(/^UPDATE (\S+)/)[1];
      const key = sql.match(/WHERE ([A-Z_0-9]+) IN/)[1];
      const columns = [...sql.matchAll(/(_RECORDCREATEDTIMESTAMP|_RECORDUPDATEDTIMESTAMP|VERSION_TS) = /g)]
        .map((match) => match[1]);
      const created = columns.includes('_RECORDCREATEDTIMESTAMP') ? binds[0] : undefined;
      const ids = columns.includes('_RECORDCREATEDTIMESTAMP') ? binds.slice(1) : binds;
      const timestamp = now();
      let count = 0;
      for (const row of rows(table).filter((row) => ids.includes(row[key]))) {
        for (const column of columns) {
          if (column !== '_RECORDCREATEDTIMESTAMP' || row[column] === created) row[column] = timestamp;
        }
        count += 1;
      }
      return [{ 'number of rows updated': count }];
    }
    if (sql.startsWith('MERGE INTO ')) {
      const table = sql.match(/^MERGE INTO (\S+)/)[1];
      const key = sql.match(/ON target\.([A-Z_0-9]+) = source\.\1/)[1];
      const selects = sql.slice(sql.indexOf('USING (') + 7, sql.indexOf(') source'));
      let bindIndex = 0;
      for (const select of selects.split('\nUNION ALL\n')) {
        const source = Object.fromEntries([...select.matchAll(/(PARSE_JSON\(\?\)|\?|NULL) AS ([A-Z_0-9]+)/g)]
          .map(([, expression, column]) => {
            const value = expression === 'NULL' ? null : binds[bindIndex++];
            return [column, expression.startsWith('PARSE_JSON') ? JSON.parse(value) : value];
          }));
        assert.ok(Object.hasOwn(source, key), `missing ${key}`);
        const target = rows(table).find((row) => row[key] === source[key]);
        if (target) {
          for (const [column, value] of Object.entries(source)) {
            if (column !== key && column !== '_RECORDCREATEDTIMESTAMP') target[column] = value;
          }
        } else rows(table).push(source);
      }
      assert.equal(bindIndex, binds.length);
      return [];
    }
    if (sql.startsWith('INSERT INTO ')) {
      const [, table, columns] = sql.match(/^INSERT INTO (\S+) \(([^)]+)\)/);
      const names = columns.split(', ');
      for (let offset = 0; offset < binds.length; offset += names.length) {
        rows(table).push(Object.fromEntries(names.map((column, index) => {
          const value = binds[offset + index];
          return [column, /PARSE_JSON/.test(sql) && ['ITEMS', 'ADDONS', 'BENEFITS_USED'].includes(column)
            ? JSON.parse(value) : value];
        })));
      }
      return [];
    }
    if (sql.startsWith('SELECT COUNT(*) AS ROW_COUNT')) {
      const table = sql.match(/FROM (\S+)/)[1];
      return [{ ROW_COUNT: rows(table).filter((row) => row.GENERATIONID === binds[0]
        || (binds[1] && row.GENERATIONID.startsWith(binds[1]))).length }];
    }
    if (/WHERE (ECID|EMAIL|CRMID) = \? LIMIT 1$/.test(sql)) {
      const [, table, column] = sql.match(/FROM (\S+) WHERE (\w+) = \? LIMIT 1$/);
      return rows(table).filter((row) => row[column] === binds[0]).slice(0, 1);
    }
    if (/^(CREATE|ALTER|UPDATE) |INFORMATION_SCHEMA|HAVING COUNT\(\*\)/.test(sql)) return [];
    if (sql.startsWith('SELECT MAX(MX)')) return [{ MX: null }];
    throw new Error(`Unsupported fixture SQL: ${sql}`);
  }
  const connection = { execute(options) {
    try { options.complete(null, null, execute(options.sqlText, options.binds)); }
    catch (error) { options.complete(error); }
  } };
  return { execute, rows, connection };
}

module.exports = { snowflakeMemoryFixture };
