'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  LIVE_ACTIVITY_EXECUTION_KEY,
  normalizeLiveActivityExecutionFields,
} = require('../labUserSandboxStore');

describe('labUserSandboxStore Live Activity state', () => {
  it('uses the same storage key as the Portal UI', () => {
    assert.equal(LIVE_ACTIVITY_EXECUTION_KEY, 'aepLaExecutionFieldsV1');
  });

  it('normalizes the Portal execution state shape and removes unsafe IDs', () => {
    const result = normalizeLiveActivityExecutionFields(JSON.stringify({
      campaignId: 'campaign-123',
      userId: '12345678901234567890',
      liveActivityId: 'token:abc_123',
      event: 'UPDATE',
      campaignIds: ['campaign-123', 'campaign-123', 'bad value'],
      liveActivityIds: ['token:abc_123'],
    }));
    assert.deepEqual(result, {
      campaignId: 'campaign-123',
      userId: '12345678901234567890',
      liveActivityId: 'token:abc_123',
      event: 'update',
      campaignIds: ['campaign-123'],
      liveActivityIds: ['token:abc_123'],
    });
  });

  it('returns an empty safe shape for malformed persisted JSON', () => {
    assert.deepEqual(normalizeLiveActivityExecutionFields('{not-json'), {
      campaignId: '',
      userId: '',
      liveActivityId: '',
      event: '',
      campaignIds: [],
      liveActivityIds: [],
    });
  });
});
