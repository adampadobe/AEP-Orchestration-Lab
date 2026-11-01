'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROFILE_FSI_V1_FIELD_GROUP,
  PROFILE_FSI_V1_PROPERTIES,
  PROFILE_FSI_V2_FIELD_GROUP,
} = require('../fsiProfileInfraService');

describe('FSI profile field-group contract', () => {
  it('requires the v1 field group that declares industryFsi generator paths', () => {
    assert.equal(PROFILE_FSI_V1_FIELD_GROUP.match.test('Profile FSI v1'), true);
    assert.equal(PROFILE_FSI_V1_FIELD_GROUP.match.test('Profile FSI v2'), false);
    assert.equal(PROFILE_FSI_V1_FIELD_GROUP.optional, false);
    assert.equal(PROFILE_FSI_V1_FIELD_GROUP.createIfMissing.title, 'Profile FSI v1');
    assert.ok(PROFILE_FSI_V1_PROPERTIES.industryFsi.properties.financialProducts);
  });

  it('keeps the v2 individualCharacteristics extension separately optional', () => {
    assert.equal(PROFILE_FSI_V2_FIELD_GROUP.match.test('Profile FSI v2'), true);
    assert.equal(PROFILE_FSI_V2_FIELD_GROUP.optional, true);
    assert.equal(PROFILE_FSI_V2_FIELD_GROUP.createIfMissing, undefined);
  });
});
