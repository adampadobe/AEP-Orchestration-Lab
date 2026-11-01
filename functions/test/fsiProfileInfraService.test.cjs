'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  runStatus,
  FSI_PROFILE_SCHEMA_TITLE,
  PROFILE_FSI_V1_FIELD_GROUP,
  PROFILE_FSI_V1_PROPERTIES,
  PROFILE_FSI_V2_FIELD_GROUP,
} = require('../fsiProfileInfraService');
const { BASE_PROFILE_FIELD_GROUP_REFS } = require('../profileInfraFactory');
const { projectStatusFlags } = require('../profileInfraStatusAll');

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

  for (const scenario of ['v1 missing', 'only v2 attached', 'v1 attached']) {
    it(`propagates actual FSI readiness when ${scenario}`, async (t) => {
      const schemaId = 'https://ns.adobe.com/demoemea/schemas/fsi-test';
      const schemaAlt = '_demoemea.schemas.fsi-test';
      const coreId = 'https://ns.adobe.com/demoemea/mixins/core-test';
      const v1Id = 'https://ns.adobe.com/demoemea/mixins/fsi-v1-test';
      const v2Id = 'https://ns.adobe.com/demoemea/mixins/fsi-v2-test';
      const schema = { title: FSI_PROFILE_SCHEMA_TITLE, $id: schemaId, 'meta:altId': schemaAlt };
      const refs = ['https://ns.adobe.com/xdm/context/profile', ...BASE_PROFILE_FIELD_GROUP_REFS, coreId, v2Id];
      if (scenario === 'v1 attached') refs.push(v1Id);
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        assert.equal(init.method, 'GET', 'status must not mutate infrastructure');
        const path = new URL(url).pathname;
        let body;
        if (path.endsWith('/tenant/schemas')) {
          body = { results: [schema] };
        } else if (path.includes('/tenant/schemas/')) {
          body = { ...schema, allOf: refs.map(($ref) => ({ $ref })), 'meta:immutableTags': ['union'] };
        } else if (path.endsWith('/tenant/fieldgroups')) {
          const results = [{ title: 'Profile Core v2', $id: coreId }, { title: 'Profile FSI v2', $id: v2Id }];
          if (scenario !== 'v1 missing') results.push({ title: 'Profile FSI v1', $id: v1Id });
          body = { results };
        } else if (path.endsWith('/global/fieldgroups')) {
          body = { results: [] };
        } else if (path.endsWith('/dataSets')) {
          body = { results: [{ id: 'dataset-test', schemaRef: { id: schemaId }, tags: { unifiedProfile: ['enabled:true'] } }] };
        } else if (path.endsWith('/tenant/descriptors')) {
          body = { results: [{ 'xdm:sourceSchema': schemaId, 'xdm:isPrimary': true, 'xdm:sourceProperty': '/_demoemea/identification/core/email' }] };
        } else {
          assert.fail(`Unexpected registry request: ${path}`);
        }
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
      });
      const status = await runStatus('offline-test', 'test-token', 'test-client', 'test-org');
      assert.equal(status.ok, true, JSON.stringify(status));
      assert.equal(status.ready, scenario === 'v1 attached', JSON.stringify(status));
      assert.equal(status.prepSteps.step2_fieldGroupsIdentity, scenario === 'v1 attached');
      assert.equal(status.requiredFieldGroups[0].attached, scenario === 'v1 attached');
      const aggregate = projectStatusFlags(status);
      assert.equal(aggregate.ready, status.ready);
      assert.deepEqual(aggregate.prepSteps, status.prepSteps);
      assert.deepEqual(aggregate.requiredFieldGroups, status.requiredFieldGroups);
    });
  }
});
