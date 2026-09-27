const assert = require('node:assert/strict');
const test = require('node:test');

const { ECID_HALF_MAX, generateEcid, isCanonicalEcid } = require('../ecidGenerator');

test('generated ECIDs always use the canonical Adobe two-half format', () => {
  for (let i = 0; i < 2000; i += 1) {
    const ecid = generateEcid();
    assert.match(ecid, /^\d{38}$/, `ECID must be 38 digits: ${ecid}`);
    const high = BigInt(ecid.slice(0, 19));
    const low = BigInt(ecid.slice(19));
    assert.ok(high <= ECID_HALF_MAX, `high half out of range: ${ecid}`);
    assert.ok(low <= ECID_HALF_MAX, `low half out of range: ${ecid}`);
    assert.ok(isCanonicalEcid(ecid), `generated ECID must validate: ${ecid}`);
  }
});

test('ECID validation rejects the fabricated values Edge Network refuses', () => {
  assert.equal(ECID_HALF_MAX, 9223372036854775807n);
  // A real, Adobe-issued ECID.
  assert.equal(isCanonicalEcid('62722406001178632594092146103219305888'), true);
  // Legacy lab format: '4' + 37 random digits can produce an out-of-range low half.
  assert.equal(isCanonicalEcid('4000000000000000000' + '9999999999999999999'), false);
  assert.equal(isCanonicalEcid('9999999999999999999' + '1000000000000000000'), false);
  // Too short / non-numeric / padded values are never acceptable identities.
  assert.equal(isCanonicalEcid('1234567890'), false);
  assert.equal(isCanonicalEcid('123456789012345678901234567890123456789'), false);
  assert.equal(isCanonicalEcid('abc'), false);
  assert.equal(isCanonicalEcid(''), false);
  assert.equal(isCanonicalEcid(null), false);
  assert.equal(isCanonicalEcid(undefined), false);
});

test('profile and snowflake generators emit canonical ECIDs', () => {
  const profileGenerateService = require('../profileGenerateService');
  const snowflakeDataGeneratorService = require('../snowflakeDataGeneratorService');
  assert.equal(typeof profileGenerateService.generateEcid, 'function');
  assert.equal(typeof snowflakeDataGeneratorService.generateEcid, 'function');
  for (let i = 0; i < 200; i += 1) {
    assert.ok(isCanonicalEcid(profileGenerateService.generateEcid()));
    assert.ok(isCanonicalEcid(snowflakeDataGeneratorService.generateEcid()));
  }
});
