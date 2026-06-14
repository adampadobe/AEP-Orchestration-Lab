'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PLATFORM_BASE_URL, resolvePlatformBaseUrl } = require('../adobePlatform');

test('resolvePlatformBaseUrl defaults when empty', () => {
  assert.equal(resolvePlatformBaseUrl(''), DEFAULT_PLATFORM_BASE_URL);
  assert.equal(resolvePlatformBaseUrl(null), DEFAULT_PLATFORM_BASE_URL);
});

test('resolvePlatformBaseUrl accepts platform.adobe.io', () => {
  assert.equal(resolvePlatformBaseUrl('https://platform.adobe.io'), 'https://platform.adobe.io');
});

test('resolvePlatformBaseUrl accepts regional platform hosts', () => {
  assert.equal(
    resolvePlatformBaseUrl('https://platform-nld2.adobe.io/'),
    'https://platform-nld2.adobe.io',
  );
});

test('resolvePlatformBaseUrl rejects non-platform hosts', () => {
  assert.equal(resolvePlatformBaseUrl('https://evil.example.com'), DEFAULT_PLATFORM_BASE_URL);
  assert.equal(resolvePlatformBaseUrl('http://platform.adobe.io'), DEFAULT_PLATFORM_BASE_URL);
});
