'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TOKEN_TTL_MS,
  createProfileMergeToken,
  verifyProfileMergeToken,
} = require('../profileMergeToken');

const claims = {
  email: 'person@example.com',
  sandbox: 'apalmer',
  ecid: '12345678901234567890123456789012345678',
  secret: 'offline-test-secret',
};

describe('profile merge continuation token', () => {
  it('binds a canonical ECID to the email and sandbox', () => {
    const token = createProfileMergeToken({ ...claims, now: 1_000 });
    const verified = verifyProfileMergeToken({
      token,
      email: 'PERSON@example.com',
      sandbox: 'APALMER',
      secret: claims.secret,
      now: 1_001,
    });
    assert.deepEqual(verified, { ok: true, ecid: claims.ecid });
  });

  it('rejects a token used with another email or sandbox', () => {
    const token = createProfileMergeToken({ ...claims, now: 1_000 });
    assert.equal(verifyProfileMergeToken({
      token, email: 'other@example.com', sandbox: claims.sandbox, secret: claims.secret, now: 1_001,
    }).code, 'MERGE_TOKEN_SCOPE_MISMATCH');
    assert.equal(verifyProfileMergeToken({
      token, email: claims.email, sandbox: 'other', secret: claims.secret, now: 1_001,
    }).code, 'MERGE_TOKEN_SCOPE_MISMATCH');
  });

  it('rejects tampered and expired tokens', () => {
    const token = createProfileMergeToken({ ...claims, now: 1_000 });
    const [payload, signature] = token.split('.');
    const tampered = `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    assert.equal(verifyProfileMergeToken({
      token: tampered, ...claims, now: 1_001,
    }).code, 'MERGE_TOKEN_INVALID');
    assert.equal(verifyProfileMergeToken({
      token, ...claims, now: 1_000 + TOKEN_TTL_MS,
    }).code, 'MERGE_TOKEN_EXPIRED');
  });
});
