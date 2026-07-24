import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractLiveActivityPushToken } from '../src/tools/liveActivityTools.mjs';

describe('Live Activity profile context', () => {
  it('prefers the normalized profile consent token', () => {
    assert.equal(
      extractLiveActivityPushToken({
        liveActivityPushToken: 'token-from-profile',
        rows: [{ path: 'liveActivityPushNotificationDetails.0.token', value: 'older-token' }],
      }),
      'token-from-profile',
    );
  });

  it('recognizes the raw profile attribute path', () => {
    assert.equal(
      extractLiveActivityPushToken({
        rows: [{
          path: 'liveActivityPushNotificationDetails[0].token',
          value: 'token-from-row',
        }],
      }),
      'token-from-row',
    );
  });

  it('does not confuse unrelated token fields with the Live Activity token', () => {
    assert.equal(
      extractLiveActivityPushToken({
        rows: [{ path: 'pushNotificationDetails.0.token', value: 'not-live-activity' }],
      }),
      '',
    );
  });
});
