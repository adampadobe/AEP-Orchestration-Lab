'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../profileStreamingCore');
const { alignGenerationWithSchema } = require('../profileGenerationSchema');
const schema = require('./fixtures/profileGenerationSchema.cjs');

function align(attributes, resolved = schema) {
  const tenant = { identification: { core: { email: 'offline@example.com', ecid: '12345678901234567890123456789012345678' } } };
  const roots = { testProfile: true };
  core.assignProfileStreamingAttributes(tenant, roots, attributes);
  core.mirrorPreferredLanguageDemoSchema(tenant, roots);
  const entity = core.buildProfileStreamPayload(
    tenant, tenant.identification.core.email, tenant.identification.core.ecid, '_demoemea',
    'offline-org', 'offline-test', roots, { useEnvelope: false },
  ).payload;
  return alignGenerationWithSchema(entity, attributes, resolved);
}

test('all seven unsupported compatibility paths normalize or disappear without weakening readback', () => {
  const result = align({
    'consents.marketing.val': 'n',
    'optInOut._channels.push': 'out',
    'optInOut._channels.whatsapp': 'not_provided',
    'personalEmail.language': 'de-DE',
    'preferences.preferredLanguage': 'de-DE',
    '_demoemea.consents.marketing.preferred': 'email',
    '_demoemea.preferredLanguage': 'de-DE',
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.persistenceAttributes, {
    'consents.marketing.any.val': 'n',
    'consents.marketing.push.val': 'n',
    'consents.marketing.whatsApp.val': 'u',
    preferredLanguage: 'de-DE',
    'consents.marketing.preferred': 'email',
  });
  assert.equal(result.entity.consents.marketing.any.val, 'n');
  assert.equal(result.entity.consents.marketing.push.val, 'n');
  assert.equal(result.entity.consents.marketing.whatsApp.val, 'u');
  assert.equal(result.entity.personalEmail?.language, undefined);
  assert.equal(result.entity.preferences, undefined);
  assert.equal(result.entity._demoemea.preferredLanguage, undefined);
  assert.equal(result.entity._demoemea.consents, undefined);
  assert.equal(result.entity.optInOut?._channels?.push, undefined);
  assert.equal(result.entity.consents.marketing.val, undefined);
  assert.equal(result.entity.testProfile, true);
  assert.equal(result.entity.identityMap.ECID[0].primary, false);
  assert.ok(result.omittedPaths.includes('consents.marketing.val'));
});

test('exact supported legacy paths are preserved instead of unconditionally remapped', () => {
  const compatible = structuredClone(schema);
  compatible.allOf = [{ $ref: 'retained-inheritance-metadata' }];
  compatible.properties.personalEmail.properties.language = { type: 'string' };
  compatible.properties._demoemea.properties.preferredLanguage = { type: 'string' };
  const result = align({ 'personalEmail.language': 'fr-FR' }, compatible);
  assert.equal(result.ok, true);
  assert.equal(result.persistenceAttributes['personalEmail.language'], 'fr-FR');
  assert.equal(result.entity.personalEmail.language, 'fr-FR');
  const tenantLanguage = align({ '_demoemea.preferredLanguage': 'fr-FR' }, compatible);
  assert.equal(tenantLanguage.ok, true);
  assert.deepEqual(tenantLanguage.persistenceAttributes, { '_demoemea.preferredLanguage': 'fr-FR' });
});

test('unsupported fields, ambiguous consent values, conflicting aliases and enum errors fail explicitly', () => {
  for (const attributes of [
    { 'unknown.customField': 'value' },
    { 'optInOut._channels.push': 'maybe' },
    { 'consents.marketing.preferred': 'not-a-channel' },
    { preferredLanguage: 'en-US', 'personalEmail.language': 'de-DE' },
    { preferredLanguage: 'en-US', '_demoemea.preferredLanguage': 'de-DE' },
    { 'consents.marketing.preferred': 'email', '_demoemea.consents.marketing.preferred': 'sms' },
    { 'consents.marketing.val': 'n', 'consents.marketing.any.val': 'y' },
    { preferredLanguage: 123 },
  ]) {
    const result = align(attributes);
    assert.equal(result.ok, false, JSON.stringify(attributes));
    assert.ok(result.invalidPaths.length);
  }
});

test('schema-aware expectations preserve false, zero, arrays and streaming numeric coercion', () => {
  const attributes = {
    'individualCharacteristics.core.childrenInHouseHold': false,
    'scoring.core.propensityScore': 0,
    'scoring.core.count': '12',
    'scoring.core.tags': ['one', 'two'],
  };
  const result = align(attributes);
  assert.equal(result.ok, true);
  assert.deepEqual(result.persistenceAttributes, {
    '_demoemea.individualCharacteristics.core.childrenInHouseHold': false,
    '_demoemea.scoring.core.propensityScore': 0,
    '_demoemea.scoring.core.count': 12,
    '_demoemea.scoring.core.tags.0': 'one',
    '_demoemea.scoring.core.tags.1': 'two',
  });
});

test('unresolved schema and missing identity/test-profile schema support fail closed', () => {
  assert.throws(() => align({}, {}), /no properties/);
  const incomplete = structuredClone(schema);
  delete incomplete.properties.identityMap;
  assert.equal(align({}, incomplete).ok, false);
  delete incomplete.properties.testProfile;
  assert.ok(align({}, incomplete).invalidPaths.includes('testProfile'));
  const unresolved = structuredClone(schema);
  unresolved.properties.preferredLanguage = { $ref: 'unresolved-language' };
  assert.throws(() => align({ preferredLanguage: 'en-GB' }, unresolved), /fully resolved/);
});

test('test-profile compatibility aliases and legal consent values retain their meaning', () => {
  const result = align({
    testProfile: true, 'xdm:testProfile': true,
    'consents.marketing.val': 'LI',
  });
  assert.equal(result.ok, true);
  assert.equal(result.entity.testProfile, true);
  assert.equal(result.entity['xdm:testProfile'], undefined);
  assert.equal(result.persistenceAttributes.testProfile, true);
  assert.equal(result.persistenceAttributes['consents.marketing.any.val'], 'LI');
});
