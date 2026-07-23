'use strict';

/**
 * Read a Snowflake SDK result cell from either array rows or object rows.
 * The Node SDK returns object rows by default, while some tests and older
 * integrations use positional arrays.
 *
 * @param {unknown} row
 * @param {number} index
 * @param {string} column
 * @returns {unknown}
 */
function readSnowflakeCell(row, index, column) {
  if (Array.isArray(row)) return row[index];
  if (!row || typeof row !== 'object') return undefined;

  const expected = String(column || '').toLowerCase();
  for (const [key, value] of Object.entries(row)) {
    if (String(key).toLowerCase() === expected) return value;
  }
  return undefined;
}

module.exports = { readSnowflakeCell };
