'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CLIENT_DEFAULT_SANDBOX_KEY,
  FIRESTORE_DEFAULT_SANDBOX_KEY,
  firestoreSafePreferences,
  decodePreferencesFromFirestore,
  encodeSandboxMapKey,
  decodeSandboxMapKey,
} = require('../envBarPreferencesStore');

describe('envBarPreferencesStore Firestore key encoding', () => {
  it('encodes __default__ sandbox keys for Firestore write', () => {
    const safe = firestoreSafePreferences({
      tagsBySandbox: {
        [CLIENT_DEFAULT_SANDBOX_KEY]: { launchScript: 'https://example.test/launch.js' },
      },
      bcBySandbox: {
        [CLIENT_DEFAULT_SANDBOX_KEY]: { webPush: true },
      },
      generatorTargetBySandbox: {
        [CLIENT_DEFAULT_SANDBOX_KEY]: 'profile',
      },
    });

    assert.ok(!(CLIENT_DEFAULT_SANDBOX_KEY in safe.tagsBySandbox));
    assert.ok(!(CLIENT_DEFAULT_SANDBOX_KEY in safe.bcBySandbox));
    assert.ok(!(CLIENT_DEFAULT_SANDBOX_KEY in safe.generatorTargetBySandbox));
    assert.equal(safe.tagsBySandbox[FIRESTORE_DEFAULT_SANDBOX_KEY].launchScript, 'https://example.test/launch.js');
    assert.equal(safe.bcBySandbox[FIRESTORE_DEFAULT_SANDBOX_KEY].webPush, true);
    assert.equal(safe.generatorTargetBySandbox[FIRESTORE_DEFAULT_SANDBOX_KEY], 'profile');
  });

  it('round-trips __default__ through encode and decode', () => {
    const clientPrefs = {
      selectedSandbox: '',
      tagsBySandbox: {
        [CLIENT_DEFAULT_SANDBOX_KEY]: { configured: '1' },
      },
      bcBySandbox: {},
      generatorTargetBySandbox: {},
    };

    const stored = firestoreSafePreferences(clientPrefs);
    const restored = decodePreferencesFromFirestore(stored);

    assert.deepEqual(restored.tagsBySandbox, clientPrefs.tagsBySandbox);
  });

  it('keeps normal sandbox keys unchanged', () => {
    assert.equal(encodeSandboxMapKey('apalmer'), 'apalmer');
    assert.equal(decodeSandboxMapKey('apalmer'), 'apalmer');
  });

  it('encodes other double-underscore sandbox keys', () => {
    assert.equal(encodeSandboxMapKey('__custom__'), '_fs_custom__');
    assert.equal(encodeSandboxMapKey('__foo'), '_fs_foo');
    assert.equal(decodeSandboxMapKey('_fs_foo'), '__foo');
    assert.equal(decodeSandboxMapKey('_fs_custom__'), '__custom__');
  });
});
