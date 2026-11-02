'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  runStatus,
  FSI_PROFILE_SCHEMA_TITLE,
  PROFILE_FSI_GENERATOR_FIELD_GROUP,
  PROFILE_FSI_GENERATOR_PROPERTIES,
  PROFILE_FSI_V2_FIELD_GROUP,
} = require('../fsiProfileInfraService');
const { BASE_PROFILE_FIELD_GROUP_REFS, buildTenantFieldGroupCreateBody, walkResolvedMixinTenantTree } = require('../profileInfraFactory');
const { projectStatusFlags } = require('../profileInfraStatusAll');

describe('FSI profile field-group contract', () => {
  it('requires a dedicated group without reusing either existing tenant group', () => {
    assert.equal(PROFILE_FSI_GENERATOR_FIELD_GROUP.match.test('AEP Lab - Profile FSI Generator v1'), true);
    assert.equal(PROFILE_FSI_GENERATOR_FIELD_GROUP.match.test('Profile FSI v1'), false);
    assert.equal(PROFILE_FSI_GENERATOR_FIELD_GROUP.match.test('Profile FSI v2'), false);
    assert.equal(PROFILE_FSI_GENERATOR_FIELD_GROUP.optional, false);
    assert.equal(PROFILE_FSI_GENERATOR_FIELD_GROUP.createIfMissing.title, 'AEP Lab - Profile FSI Generator v1');
    assert.ok(PROFILE_FSI_GENERATOR_PROPERTIES.industryFsi.properties.financialProducts);
  });

  it('keeps the v2 individualCharacteristics extension separately optional', () => {
    assert.equal(PROFILE_FSI_V2_FIELD_GROUP.match.test('Profile FSI v2'), true);
    assert.equal(PROFILE_FSI_V2_FIELD_GROUP.optional, true);
    assert.equal(PROFILE_FSI_V2_FIELD_GROUP.createIfMissing, undefined);
  });

  it('creates only the dedicated tenant subtree with the required scalar types', () => {
    const body = buildTenantFieldGroupCreateBody('demoemea', PROFILE_FSI_GENERATOR_FIELD_GROUP.createIfMissing);
    const walked = walkResolvedMixinTenantTree(body);
    assert.equal(body.title, 'AEP Lab - Profile FSI Generator v1');
    assert.equal(walked.tenantKey, '_demoemea');
    assert.equal(walked.presentNodeMap.get('industryFsi.creditScoreBand').type, 'string');
    assert.equal(walked.presentNodeMap.get('industryFsi.financialProducts.savings').type, 'boolean');
    assert.equal(walked.presentPathSet.has('individualCharacteristics'), false);
  });

  for (const scenario of ['generator missing', 'generator unattached', 'legacy v1 attached',
    'generator attached without fields', 'generator fields incomplete', 'generator fields wrong type', 'generator field type unknown',
    'generator ready']) {
    it(`propagates actual FSI readiness when ${scenario}`, async (t) => {
      const schemaId = 'https://ns.adobe.com/demoemea/schemas/fsi-test';
      const schemaAlt = '_demoemea.schemas.fsi-test';
      const coreId = 'https://ns.adobe.com/demoemea/mixins/core-test';
      const generatorId = 'https://ns.adobe.com/demoemea/mixins/fsi-generator-test';
      const v1Id = 'https://ns.adobe.com/demoemea/mixins/existing-fsi-v1-test';
      const v2Id = 'https://ns.adobe.com/demoemea/mixins/fsi-v2-test';
      const schema = { title: FSI_PROFILE_SCHEMA_TITLE, $id: schemaId, 'meta:altId': schemaAlt };
      const refs = ['https://ns.adobe.com/xdm/context/profile', ...BASE_PROFILE_FIELD_GROUP_REFS, coreId, v2Id];
      if (scenario === 'legacy v1 attached') refs.push(v1Id);
      const generatorAttached = scenario.startsWith('generator ') && !['generator missing', 'generator unattached'].includes(scenario);
      if (generatorAttached) refs.push(generatorId);
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        assert.equal(init.method, 'GET', 'status must not mutate infrastructure');
        const path = new URL(url).pathname;
        let body;
        if (path.endsWith('/tenant/schemas')) {
          body = { results: [schema] };
        } else if (path.includes('/tenant/schemas/')) {
          body = { ...schema, allOf: refs.map(($ref) => ({ $ref })), 'meta:immutableTags': ['union'] };
          if (init.headers.Accept.includes('xed-full')) {
            const properties = generatorAttached && scenario !== 'generator attached without fields'
              ? structuredClone(PROFILE_FSI_GENERATOR_PROPERTIES) : {};
            if (scenario === 'generator fields incomplete') delete properties.industryFsi.properties.financialProducts.properties.savings;
            if (scenario === 'generator fields wrong type') properties.industryFsi.properties.creditScoreBand.type = 'number';
            if (scenario === 'generator field type unknown') delete properties.industryFsi.properties.creditScoreBand.type;
            body.properties = { _demoemea: { type: 'object', properties } };
          }
        } else if (path.endsWith('/tenant/fieldgroups')) {
          const results = [{ title: 'Profile Core v2', $id: coreId }, { title: 'Profile FSI v2', $id: v2Id },
            { title: 'Profile FSI v1', $id: v1Id }];
          if (!['generator missing', 'legacy v1 attached'].includes(scenario)) {
            results.push({ title: 'AEP Lab - Profile FSI Generator v1', $id: generatorId });
          }
          body = { results };
        } else if (path.endsWith('/global/fieldgroups')) {
          body = { results: [] };
        } else if (path.endsWith('/dataSets')) {
          body = { results: [{ id: 'dataset-test', schemaRef: { id: schemaId }, tags: { unifiedProfile: ['enabled:true'] } }] };
        } else if (path.endsWith('/tenant/descriptors')) {
          assert.ok(Number(new URL(url).searchParams.get('limit')) <= 300);
          body = { 'xdm:descriptorIdentity': [{
            '@type': 'xdm:descriptorIdentity',
            'xdm:sourceSchema': schemaId, 'xdm:isPrimary': true,
            'xdm:namespace': 'Email', 'xdm:sourceProperty': '/_demoemea/identification/core/email',
          }, {
            '@type': 'xdm:descriptorIdentity', 'xdm:sourceSchema': schemaId,
            'xdm:namespace': 'ECID', 'xdm:isPrimary': false,
            'xdm:sourceProperty': '/_demoemea/identification/core/ecid',
          }] };
        } else {
          assert.fail(`Unexpected registry request: ${path}`);
        }
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
      });
      const status = await runStatus('offline-test', 'test-token', 'test-client', 'test-org');
      assert.equal(status.ok, true, JSON.stringify(status));
      assert.equal(status.ready, scenario === 'generator ready', JSON.stringify(status));
      assert.equal(status.prepSteps.step2_fieldGroupsIdentity, scenario === 'generator ready');
      assert.equal(status.requiredFieldGroups[0].attached, generatorAttached);
      assert.equal(status.requiredTenantFields.ready, scenario === 'generator ready');
      if (scenario === 'generator fields incomplete') assert.deepEqual(status.requiredTenantFields.missing, ['industryFsi.financialProducts.savings']);
      if (scenario === 'generator fields wrong type') assert.equal(status.requiredTenantFields.conflicts[0].path, 'industryFsi.creditScoreBand');
      if (scenario === 'generator field type unknown') assert.equal(status.requiredTenantFields.conflicts[0].path, 'industryFsi.creditScoreBand');
      const aggregate = projectStatusFlags(status);
      assert.equal(aggregate.ready, status.ready);
      assert.deepEqual(aggregate.prepSteps, status.prepSteps);
      assert.deepEqual(aggregate.requiredFieldGroups, status.requiredFieldGroups);
      assert.deepEqual(aggregate.requiredTenantFields, status.requiredTenantFields);
    });
  }
});
