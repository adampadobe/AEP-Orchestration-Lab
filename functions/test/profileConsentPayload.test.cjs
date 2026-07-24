'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildConsentGetPayload,
  getLiveActivityPushTokenForConsent,
} = require('../profileConsentPayload');

test('getLiveActivityPushTokenForConsent reads liveActivityPushNotificationDetails.0.token', () => {
  const entity = {
    liveActivityPushNotificationDetails: [
      { token: '80591d31bfd981b80ce6fd88678fd382d6b75d95dd9' },
    ],
  };

  assert.equal(
    getLiveActivityPushTokenForConsent(entity, {}, null),
    '80591d31bfd981b80ce6fd88678fd382d6b75d95dd9',
  );
});

test('getLiveActivityPushTokenForConsent finds a nested flattened token', () => {
  const entity = {
    attributes: {
      mobileMessaging: {
        liveActivityPushNotificationDetails: [
          { token: 'nested-live-activity-token' },
        ],
      },
    },
  };

  assert.equal(
    getLiveActivityPushTokenForConsent(entity, {}, null),
    'nested-live-activity-token',
  );
});

test('buildConsentGetPayload exposes the first Live Activity push token', () => {
  const response = {
    profile: {
      entity: {
        _demoemea: {
          identification: {
            core: {
              email: 'person@example.com',
              ecid: '21341564807001999326331939889005167831',
            },
          },
        },
        liveActivityPushNotificationDetails: [
          { token: 'profile-live-activity-token' },
          { token: 'second-token' },
        ],
      },
    },
  };

  const payload = buildConsentGetPayload('person@example.com', response);

  assert.equal(payload.found, true);
  assert.equal(payload.liveActivityPushToken, 'profile-live-activity-token');
});

test('buildConsentGetPayload returns null when the profile has no Live Activity token', () => {
  const response = {
    profile: {
      entity: {
        _demoemea: {
          identification: {
            core: {
              email: 'person@example.com',
              ecid: '21341564807001999326331939889005167831',
            },
          },
        },
      },
    },
  };

  const payload = buildConsentGetPayload('person@example.com', response);

  assert.equal(payload.liveActivityPushToken, null);
});
