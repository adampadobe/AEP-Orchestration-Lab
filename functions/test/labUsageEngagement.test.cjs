'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeEngagement } = require('../labUsageEngagement');
const { validateEvent } = require('../labUsageTelemetry');
const { randomUUID } = require('node:crypto');

const now = new Date('2026-10-06T12:00:00Z');
function record(ms, extra = {}) {
  return { uid: 'a', type: 'page_view', route: '/profile-viewer/profile.html',
    timestamp: new Date(ms).toISOString(), expiresAt: new Date(now.getTime() + 86400000), ...extra };
}
function summarize(records, extra = {}) {
  return summarizeEngagement({ records, users: [{ uid: 'a' }], now, days: 7, truncated: false, ...extra });
}
test('session cutoff is exact, source order independent, no activity inferred after final event', () => {
  const start = now.getTime() - 3600000;
  const result = summarize([record(start + 1800000), record(start + 1799999), record(start),
    record(start + 3600000)]);
  assert.equal(result.summary.sessions, 2);
  assert.equal(result.summary.activeMs, 0);
  assert.equal(result.summary.activeTimeRecorded, false);
});
test('heartbeats union overlapping tabs/retries and clip to reporting window', () => {
  const end = now.getTime() - 60000;
  const beat = (offset, activeMs) => record(end + offset, {
    type: 'heartbeat', occurredAt: new Date(end + offset).toISOString(), activeMs,
  });
  const result = summarize([beat(0, 15000), beat(5000, 15000), beat(0, 15000), beat(40000, 10000)]);
  assert.equal(result.summary.activeMs, 30000);
  assert.equal(result.summary.sessions, 1);
  const start = now.getTime() - 7 * 86400000;
  assert.equal(summarize([record(start + 5000, {
    type: 'heartbeat', occurredAt: new Date(start + 5000).toISOString(), activeMs: 15000,
  })]).summary.activeMs, 5000);
});
test('expired, malformed, over-cap, unsupported, future and unmapped records cannot inflate engagement', () => {
  const base = record(now.getTime() - 60000, { type: 'heartbeat',
    occurredAt: new Date(now.getTime() - 60000).toISOString(), activeMs: 15000 });
  assert.equal(summarize([
    { ...base, activeMs: 30001 }, { ...base, activeMs: -1 }, { ...base, activeMs: 0.5 },
    { ...base, occurredAt: 'invalid' }, { ...base, uid: 'deleted' },
    { ...base, expiresAt: now }, { ...base, route: '/other' },
    { ...base, timestamp: new Date(now.getTime() + 1000).toISOString() },
  ]).summary.sessions, 0);
  assert.equal(summarize([base], { truncated: true }).truncated, true);
});
test('v2 heartbeat payload is bounded and v1 reports remain compatible', async () => {
  const heartbeat = { version: 2, id: randomUUID(), type: 'heartbeat',
    route: '/profile-viewer/profile.html', occurredAt: now.toISOString(), activeMs: 15000 };
  assert.equal(validateEvent(heartbeat, { uid: 'a' }, now).activeMs, 15000);
  for (const extra of [{ version: 1 }, { activeMs: 30001 }, { activeMs: '15000' },
    { activeMs: 0 }, { navigation: 'navigate' }, { keys: 'private' }]) {
    assert.throws(() => validateEvent({ ...heartbeat, ...extra }, { uid: 'a' }, now), { status: 400 });
  }
  assert.throws(() => validateEvent({ ...heartbeat, type: 'page_view', navigation: 'navigate' },
    { uid: 'a' }, now), { status: 400 });
  assert.equal(validateEvent({ version: 1, id: randomUUID(), type: 'page_view',
    route: heartbeat.route, occurredAt: now.toISOString(), navigation: 'navigate' }, {}, now).version, 1);
});
