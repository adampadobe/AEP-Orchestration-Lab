'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { summarizeProfileUpdateRequest, buildPayloadLogEntry } = require('../profileUpdateRequestLog');

test('update request logs only counts and flags, never identities or arbitrary paths', () => {
  const summary = summarizeProfileUpdateRequest({
    email: 'private@example.com', sandbox: 'secret', dryRun: true, hasConsent: true,
    updates: [null, 5, { path: 'private@example.com', value: 'secret' }],
  });
  assert.deepEqual(summary, { dryRun: true, hasConsent: true, updateCount: 3 });
  assert.deepEqual(summarizeProfileUpdateRequest(), { dryRun: false, hasConsent: false, updateCount: 0 });
});

test('payload log entry replaces raw payloads and receipts with value-free wire diagnostics', () => {
  const wireBody = JSON.stringify({ _demoemea: { profilePlaceContext: { city: 'private' } } });
  const summary = buildPayloadLogEntry({
    wireBody, streamingResponse: { message: 'private', xactionId: 'private', errors: [{ message: 'private' }] },
    status: 400, errorCount: 1,
  });
  assert.equal(summary.payloadSha256, createHash('sha256').update(wireBody).digest('hex'));
  assert.equal(summary.tenant.industries.generic.profilePlaceContext.leafCount, 1);
  assert.equal(summary.streamErrorCount, 1);
  assert.equal(summary.responseErrorCount, 1);
  assert.equal(summary.xactionId, null);
  assert.equal(summary.payloadJson, undefined);
  assert.equal(JSON.stringify(summary).includes('private'), false);
});
