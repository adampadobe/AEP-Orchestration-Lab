'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const {
  normalizePrivateKeyForSnowflake,
  sanitizePemInput,
  normalizeSnowflakeLoginName,
  buildSnowflakeConnectOptions,
} = require('../snowflakeService');

test('normalizePrivateKeyForSnowflake converts PKCS#1 RSA PEM to PKCS#8 PEM', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pkcs1Pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  assert.match(pkcs1Pem, /BEGIN RSA PRIVATE KEY/);

  const normalized = normalizePrivateKeyForSnowflake(pkcs1Pem, undefined);
  assert.match(normalized, /BEGIN PRIVATE KEY/);
  assert.match(normalized, /END PRIVATE KEY/);
  assert.doesNotMatch(normalized, /BEGIN RSA PRIVATE KEY/);
});

test('normalizePrivateKeyForSnowflake leaves PKCS#8 PEM usable', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pkcs8Pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const normalized = normalizePrivateKeyForSnowflake(pkcs8Pem, undefined);
  assert.match(normalized, /BEGIN PRIVATE KEY/);
});

test('sanitizePemInput strips BOM and CRLF', () => {
  const inner = 'line1\nline2';
  const withBomCrlf = `\ufeffline1\r\nline2\r\n`;
  assert.strictEqual(sanitizePemInput(withBomCrlf), inner);
});

test('normalizeSnowflakeLoginName uppercases non-email logins', () => {
  assert.strictEqual(normalizeSnowflakeLoginName('  aep_integration_1  '), 'AEP_INTEGRATION_1');
  assert.strictEqual(normalizeSnowflakeLoginName('user@example.com'), 'user@example.com');
});

test('buildSnowflakeConnectOptions uppercases username for keyPair', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pkcs8Pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const opts = buildSnowflakeConnectOptions({
    config: {
      account: 'xy12345.us-east-1.aws',
      user: 'svc_account',
      role: '',
      warehouse: 'WH',
      database: 'DB',
      schema: 'SC',
      authMethod: 'keyPair',
    },
    credential: pkcs8Pem,
    passphrase: '',
  });
  assert.strictEqual(opts.username, 'SVC_ACCOUNT');
  assert.strictEqual(opts.authenticator, 'SNOWFLAKE_JWT');
  assert.match(opts.privateKey, /BEGIN PRIVATE KEY/);
});
