'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const { structuredColumnTypes, bindSnowflakeValue } = require('../snowflakeStructuredValues');
const definitions = require('../snowflakeTravelTableDefinitions.json');
const { mergeRows } = require('../snowflakeSeedStore');

it('uses declared types, including nulls, across all 16 Travel tables', async () => {
  assert.equal(definitions.length, 16);
  for (const { table, columnDdl } of definitions) {
    const types = structuredColumnTypes(columnDdl);
    for (const [column, type] of types) {
      for (const value of [null, [], ['demo-token'], '["demo-token"]']) {
        const calls = [];
        await mergeRows(async (sql, binds) => calls.push({ sql, binds }),
          `DB.LAB.${table}`, 'OFFLINE_ID', [{ OFFLINE_ID: 'test', [column]: value }]);
        assert.match(calls[0].sql, new RegExp(`PARSE_JSON\\(\\?\\)::${type} AS ${column}`), table);
        assert.deepEqual(calls[0].binds, ['test', value == null ? null : typeof value === 'string' ? value : JSON.stringify(value)]);
      }
    }
    for (const ddl of columnDdl.filter((value) => /^PUSHTOKENS VARCHAR/.test(value))) {
      assert.equal(types.has(ddl.split(' ')[0]), false, 'Do not retype legacy text columns');
    }
  }
});

it('validates structured values and supports ARRAY, OBJECT and VARIANT without double encoding', () => {
  for (const [type, value] of [['ARRAY', []], ['OBJECT', { tokens: ['one'] }], ['VARIANT', { enabled: true }]]) {
    assert.deepEqual(bindSnowflakeValue(JSON.stringify(value), type), {
      expression: `PARSE_JSON(?)::${type}`, value: JSON.stringify(value),
    });
    assert.equal(bindSnowflakeValue(null, type).value, null);
  }
  assert.throws(() => bindSnowflakeValue('not JSON', 'ARRAY'), SyntaxError);
  assert.throws(() => bindSnowflakeValue({}, 'ARRAY'), /Expected an ARRAY/);
  assert.throws(() => bindSnowflakeValue([], 'OBJECT'), /Expected an OBJECT/);
  assert.deepEqual(bindSnowflakeValue('plain text'), { expression: '?', value: 'plain text' });
});
