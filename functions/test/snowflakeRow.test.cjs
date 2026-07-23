'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readSnowflakeCell } = require('../snowflakeRow');
const { projectTableExistence } = require('../snowflakeIndustryCatalogService');

describe('snowflakeRow', () => {
  it('reads positional array rows', () => {
    assert.equal(
      readSnowflakeCell(['AGENTIC_FSI_PROFILE_CUSTOMER'], 0, 'TABLE_NAME'),
      'AGENTIC_FSI_PROFILE_CUSTOMER',
    );
  });

  it('reads Snowflake SDK object rows case-insensitively', () => {
    assert.equal(readSnowflakeCell({ TABLE_NAME: 'UPPER' }, 0, 'TABLE_NAME'), 'UPPER');
    assert.equal(readSnowflakeCell({ table_name: 'lower' }, 0, 'TABLE_NAME'), 'lower');
    assert.equal(readSnowflakeCell({ Column_Name: 'mixed' }, 0, 'column_name'), 'mixed');
  });

  it('returns undefined for missing or invalid cells', () => {
    assert.equal(readSnowflakeCell(null, 0, 'TABLE_NAME'), undefined);
    assert.equal(readSnowflakeCell({ OTHER: 'value' }, 0, 'TABLE_NAME'), undefined);
  });
});

describe('projectTableExistence', () => {
  it('recognizes object rows returned by the Snowflake Node SDK', () => {
    const result = projectTableExistence(
      [
        { TABLE_NAME: 'AGENTIC_FSI_PROFILE_CUSTOMER' },
        { TABLE_NAME: 'AGENTIC_FSI_EVENT_DIGITAL' },
      ],
      [
        'AGENTIC_FSI_PROFILE_CUSTOMER',
        'AGENTIC_FSI_EVENT_DIGITAL',
        'AGENTIC_FSI_EVENT_TRANSACTION',
      ],
    );

    assert.equal(result.existingCount, 2);
    assert.equal(result.missingCount, 1);
    assert.equal(result.tables.AGENTIC_FSI_PROFILE_CUSTOMER.exists, true);
    assert.equal(result.tables.AGENTIC_FSI_EVENT_TRANSACTION.exists, false);
  });
});
