'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PRESET_AGENTIC_TRAVEL_DEMO,
  projectConfigGetResponse,
} = require('../snowflakeService');

describe('snowflakeService.projectConfigGetResponse', () => {
  it('returns apalmer preset when Firestore doc missing (empty shell)', () => {
    const raw = {
      sandbox: 'apalmer',
      labUser: 'uid-abc',
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
      credentialSetAt: null,
      updatedAt: null,
      updatedBy: null,
    };
    const out = projectConfigGetResponse(raw, { labUser: 'uid-abc', sandbox: 'apalmer' });
    assert.equal(out.account, PRESET_AGENTIC_TRAVEL_DEMO.account);
    assert.equal(out.user, PRESET_AGENTIC_TRAVEL_DEMO.user);
    assert.equal(out.presetSource, 'agentic_travel_demo');
    assert.equal(out.configState, 'preset_only');
    assert.equal(out.hasCredential, false);
  });

  it('returns saved config when account is set', () => {
    const raw = {
      sandbox: 'apalmer',
      labUser: 'uid-abc',
      docExists: true,
      account: 'my.account',
      user: 'MY_USER',
      role: '',
      warehouse: 'WH',
      database: 'DB',
      schema: 'SC',
      authMethod: 'keyPair',
      hasCredential: true,
      hasPassphrase: false,
      credentialSetAt: '2026-01-01T00:00:00.000Z',
      updatedAt: null,
      updatedBy: 'uid-abc',
    };
    const out = projectConfigGetResponse(raw, { labUser: 'uid-abc', sandbox: 'apalmer' });
    assert.equal(out.account, 'my.account');
    assert.equal(out.configState, 'saved_ready');
    assert.equal(out.presetSource, null);
  });

  it('preset_with_credential when apalmer has credential but empty account fields', () => {
    const raw = {
      sandbox: 'apalmer',
      labUser: 'uid-other',
      docExists: true,
      account: '',
      user: '',
      role: '',
      warehouse: '',
      database: '',
      schema: '',
      authMethod: 'keyPair',
      hasCredential: true,
      hasPassphrase: false,
      credentialSetAt: '2026-01-01T00:00:00.000Z',
      updatedAt: null,
      updatedBy: 'uid-other',
    };
    const out = projectConfigGetResponse(raw, { labUser: 'uid-other', sandbox: 'apalmer' });
    assert.equal(out.account, PRESET_AGENTIC_TRAVEL_DEMO.account);
    assert.equal(out.configState, 'preset_with_credential');
    assert.equal(out.hasCredential, true);
  });

  it('empty non-apalmer sandbox without preset', () => {
    const raw = {
      sandbox: 'kirkham',
      labUser: 'uid-abc',
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
      credentialSetAt: null,
      updatedAt: null,
      updatedBy: null,
    };
    const out = projectConfigGetResponse(raw, { labUser: 'uid-abc', sandbox: 'kirkham' });
    assert.equal(out.configState, 'empty');
    assert.equal(out.presetSource, null);
    assert.equal(out.account, '');
  });
});
