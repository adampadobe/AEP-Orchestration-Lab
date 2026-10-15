'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../scripts/generate-relational-snowflake');

describe('relational Snowflake generator CLI arguments', () => {
  it('parses the selected industries, recipient count, hero count, and fixed date', () => {
    assert.deepEqual(parseArgs([
      '--industry', 'travel',
      '--count', '20',
      '--hero-profiles', '7',
      '--as-of-date', '2026-10-15',
    ]), {
      industry: 'travel',
      count: 20,
      heroProfiles: 7,
      asOfDate: '2026-10-15',
      baseEmail: null,
    });
  });

  it('defaults hero generation to five for travel/all and zero for other industries', () => {
    assert.equal(parseArgs(['--industry', 'travel']).heroProfiles, 5);
    assert.equal(parseArgs(['--industry', 'all']).heroProfiles, 5);
    assert.equal(parseArgs(['--industry', 'travel', '--count', '2']).heroProfiles, 2);
    assert.equal(parseArgs(['--industry', 'retail']).heroProfiles, 0);
  });

  it('rejects invalid counts, non-travel heroes, and malformed dates', () => {
    assert.throws(() => parseArgs(['--count', '0']), /--count must be/);
    assert.throws(() => parseArgs(['--industry', 'retail', '--hero-profiles', '1']), /only be used with travel or all/);
    assert.throws(() => parseArgs(['--as-of-date', '2026-02-30']), /valid date/);
  });

  it('accepts the base demo email without requiring existing profiles', () => {
    assert.equal(parseArgs(['--base-email', 'demo@example.com']).baseEmail, 'demo@example.com');
  });
});
