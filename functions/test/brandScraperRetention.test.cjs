'use strict';

const test = require('node:test');
const assert = require('node:assert');
const brandScrapeStore = require('../brandScrapeStore');

test('computeInitialPayloadRetentionExpiresAtMs uses max(created, now) + 14d', () => {
  const now = Date.UTC(2026, 0, 10, 12, 0, 0);
  const created = Date.UTC(2026, 0, 1, 0, 0, 0);
  const ms = brandScrapeStore.computeInitialPayloadRetentionExpiresAtMs({ createdAtMs: created, nowMs: now });
  assert.strictEqual(ms, now + brandScrapeStore.DEFAULT_PAYLOAD_RETENTION_MS);
});

test('derivePayloadRetentionExpiresAtMsFromIndex respects stored expiry', () => {
  const ts = { toMillis: () => Date.UTC(2026, 2, 1, 0, 0, 0) };
  const ms = brandScrapeStore.derivePayloadRetentionExpiresAtMsFromIndex({
    payloadRetentionExpiresAt: ts,
    createdAt: { toMillis: () => Date.UTC(2026, 0, 1, 0, 0, 0) },
  });
  assert.strictEqual(ms, Date.UTC(2026, 2, 1, 0, 0, 0));
});

test('derivePayloadRetentionExpiresAtMsFromIndex uses migration floor when field absent', () => {
  const ms = brandScrapeStore.derivePayloadRetentionExpiresAtMsFromIndex({
    createdAt: { toMillis: () => Date.UTC(2025, 0, 1, 0, 0, 0) },
  });
  const minExpected = Date.now() + brandScrapeStore.DEFAULT_PAYLOAD_RETENTION_MS - 5000;
  const maxExpected = Date.now() + brandScrapeStore.DEFAULT_PAYLOAD_RETENTION_MS + 120_000;
  assert.ok(ms >= minExpected && ms <= maxExpected, 'expected ~14d from now for old createdAt');
});
