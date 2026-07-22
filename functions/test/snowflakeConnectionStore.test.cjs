'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  sharedDocId,
  sharedSecretId,
  isSandboxSharedEligible,
  mergeUserConfigWithSharedFallback,
} = require('../snowflakeConnectionStore');
const { projectConfigGetResponse } = require('../snowflakeService');

describe('snowflakeConnectionStore shared helpers', () => {
  it('sharedDocId uses _sandbox__ prefix', () => {
    assert.equal(sharedDocId('apalmer'), '_sandbox__apalmer');
  });

  it('sharedSecretId has no uid segment', () => {
    assert.equal(sharedSecretId('apalmer'), 'snowflake-cred-sandbox-apalmer');
    assert.equal(sharedSecretId('apalmer', 'pass'), 'snowflake-cred-sandbox-apalmer-pass');
  });

  it('isSandboxSharedEligible for apalmer and kirkham', () => {
    assert.equal(isSandboxSharedEligible('apalmer'), true);
    assert.equal(isSandboxSharedEligible('prod-apalmer-dev'), true);
    assert.equal(isSandboxSharedEligible('kirkham'), true);
    assert.equal(isSandboxSharedEligible('other-sandbox'), false);
  });

  it('mergeUserConfigWithSharedFallback prefers user fields, shared credential', () => {
    const user = {
      sandbox: 'apalmer',
      labUser: 'uid-new',
      docExists: false,
      account: '',
      user: '',
      role: '',
      warehouse: '',
      database: '',
      schema: '',
      authMethod: 'password',
      hasCredential: false,
      hasPassphrase: false,
    };
    const shared = {
      sandbox: 'apalmer',
      labUser: '_sandbox',
      docExists: true,
      account: 'dh96551.west-europe.azure',
      user: 'AEP_INTEGRATION_1',
      role: '',
      warehouse: 'AEP_WH',
      database: 'TRAVEL_DATABASE',
      schema: 'AEP_SCHEMA',
      authMethod: 'keyPair',
      hasCredential: true,
      hasPassphrase: false,
      credentialSetAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'uid-original',
    };
    const merged = mergeUserConfigWithSharedFallback(user, shared);
    assert.equal(merged.hasCredential, true);
    assert.equal(merged.credentialScope, 'sandbox_shared');
    assert.equal(merged.account, 'dh96551.west-europe.azure');
    assert.equal(merged.user, 'AEP_INTEGRATION_1');
    assert.equal(merged.authMethod, 'password');
  });
});

describe('projectConfigGetResponse shared fallback', () => {
  it('apalmer new browser sees saved_ready when shared credential exists', () => {
    const raw = mergeUserConfigWithSharedFallback(
      {
        sandbox: 'apalmer',
        labUser: 'uid-new-browser',
        docExists: false,
        account: '',
        user: '',
        role: '',
        warehouse: '',
        database: '',
        schema: '',
        authMethod: 'keyPair',
        hasCredential: false,
        hasPassphrase: false,
        credentialSetAt: null,
        updatedAt: null,
        updatedBy: null,
      },
      {
        sandbox: 'apalmer',
        labUser: '_sandbox',
        docExists: true,
        account: 'dh96551.west-europe.azure',
        user: 'AEP_INTEGRATION_1',
        role: '',
        warehouse: 'AEP_WH',
        database: 'TRAVEL_DATABASE',
        schema: 'AEP_SCHEMA',
        authMethod: 'keyPair',
        hasCredential: true,
        hasPassphrase: false,
        credentialSetAt: '2026-01-01T00:00:00.000Z',
        updatedAt: null,
        updatedBy: 'uid-original',
        credentialScope: 'sandbox_shared',
      }
    );
    const out = projectConfigGetResponse(raw, { labUser: 'uid-new-browser', sandbox: 'apalmer' });
    assert.equal(out.hasCredential, true);
    assert.equal(out.credentialScope, 'sandbox_shared');
    assert.equal(out.configState, 'saved_ready');
    assert.equal(out.account, 'dh96551.west-europe.azure');
  });
});
