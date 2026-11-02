'use strict';

function structuredColumnTypes(columnDdl = []) {
  return new Map(columnDdl.flatMap((ddl) => {
    const match = String(ddl).match(/^(\w+)\s+(ARRAY|OBJECT|VARIANT)\b/i);
    return match ? [[match[1].toUpperCase(), match[2].toUpperCase()]] : [];
  }));
}

function bindSnowflakeValue(value, type) {
  if (!type) return { expression: '?', value: value instanceof Date ? value.toISOString() : value };
  if (!['ARRAY', 'OBJECT', 'VARIANT'].includes(type)) throw new Error('Unsupported structured Snowflake type');
  if (value == null) return { expression: `PARSE_JSON(?)::${type}`, value: null };
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (type === 'ARRAY' && !Array.isArray(parsed)) throw new Error('Expected an ARRAY value');
  if (type === 'OBJECT' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
    throw new Error('Expected an OBJECT value');
  }
  return { expression: `PARSE_JSON(?)::${type}`, value: JSON.stringify(parsed) };
}

module.exports = { structuredColumnTypes, bindSnowflakeValue };
