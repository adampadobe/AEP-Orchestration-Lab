'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readInvocations, summarizeInvocations } = require('../labUsageInvocations');

const now = new Date('2026-10-06T09:00:00Z');
const users = [{ uid: 'user', email: 'synthetic@example.test' }];
function record(extra = {}) {
  return {
    version: 1, principalUid: 'user', authSource: 'user', endpoint: '/mcp/commerce',
    toolset: 'commerce', tool: 'commerce_capabilities', outcome: 'result',
    timestamp: '2026-10-05T12:00:00.000Z', expiresAt: new Date('2026-12-01'), durationMs: 100,
    handlerStarted: true, ...extra,
  };
}
function summary(records, extra = {}) {
  return summarizeInvocations({ records, users, now, days: 7, truncated: false, ...extra });
}

test('invocation summaries separate dispatch outcomes, tools, current actors and UTC timing', () => {
  const result = summary([
    record({ arguments: { email: 'private-profile' }, id: 'private-invocation' }),
    record({ outcome: 'tool_error', authSource: 'ims', durationMs: 300 }),
    record({ authSource: 'env', outcome: 'rejected', tool: null, handlerStarted: false, durationMs: null }),
    record({ outcome: 'protocol_error', principalUid: 'deleted', durationMs: -1 }),
    record({ outcome: 'cancelled', timestamp: '2026-10-04T03:00:00Z', durationMs: Infinity }),
  ]);
  assert.deepEqual(result.summary, {
    invocations: 5, activeUsers: 1, unattributed: 2,
    result: 1, tool_error: 1, rejected: 1, protocol_error: 1, cancelled: 1,
  });
  assert.equal(result.tools[0].name, 'commerce_capabilities');
  assert.equal(result.tools[0].averageDurationMs, 200);
  assert.equal(result.tools[0].timedInvocations, 2);
  assert.equal(result.hours[1][12], 4);
  assert.equal(result.hours[0][3], 1);
  assert.deepEqual(result.endpoints, [{ name: '/mcp/commerce (commerce)', invocations: 5 }]);
  assert.deepEqual(result.users, [{ uid: 'user', invocations: 3, latestAt: '2026-10-05T12:00:00.000Z' }]);
  assert.doesNotMatch(JSON.stringify(result), /private|arguments|expiresAt|principalUid/);
});

test('expired, future, out-of-window and unsupported invocation records are excluded', () => {
  assert.equal(summary([
    record({ version: 2 }), record({ outcome: 'made-up' }), record({ timestamp: 'invalid' }),
    record({ timestamp: '2026-10-07' }), record({ timestamp: '2026-09-01' }),
    record({ expiresAt: new Date('2026-10-06T09:00:00Z') }), record({ expiresAt: null }),
    record({ endpoint: '/mcp?token=private' }), record({ authSource: 'caller-assertion' }),
  ]).summary.invocations, 0);
});

test('empty/capped summaries do not manufacture actors, calls or duration', () => {
  const result = summary([], { truncated: true });
  assert.equal(result.truncated, true);
  assert.equal(result.limit, 5000);
  assert.equal(result.completeness, 'partial');
  assert.equal(result.summary.invocations, 0);
  assert.deepEqual(result.users, []);
  assert.deepEqual(result.tools, []);
  assert.deepEqual(result.daily, []);
});

test('reads project safe fields, use completion timestamp and cap records with a sentinel', async () => {
  const observed = [];
  const query = {
    where: (...args) => { observed.push(['where', ...args]); return query; },
    orderBy: (...args) => { observed.push(['orderBy', ...args]); return query; },
    select: (...args) => { observed.push(['select', ...args]); return query; },
    limit: (value) => { assert.equal(value, 5001); return query; },
    get: async () => ({ docs: Array.from({ length: 5001 }, () => ({ data: () => record() })) }),
  };
  const result = await readInvocations({
    db: { collection: (name) => { assert.equal(name, 'mcpUsageInvocations'); return query; } }, now, days: 7,
  });
  assert.equal(result.records.length, 5000);
  assert.equal(result.truncated, true);
  assert.deepEqual(observed[2], ['orderBy', 'timestamp', 'desc']);
  assert.doesNotMatch(JSON.stringify(observed), /keyId|arguments|resultContent|startedAt/);
});
