'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { normalizePrivateKeyForSnowflake } = require('../snowflakeService');

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
