'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const { runStatus, MEDIA_PROFILE_SCHEMA_TITLE, PROFILE_MEDIA_GENERATOR_FIELD_GROUP, PROFILE_MEDIA_V1_PROPERTIES } = require('../mediaProfileInfraService');
const { BASE_PROFILE_FIELD_GROUP_REFS } = require('../profileInfraFactory');

for (const state of ['legacy only', 'missing fields', 'wrong type', 'ready']) {
  it(`checks resolved Media generator paths when ${state}`, async (t) => {
    const schemaId = 'https://ns.adobe.com/demoemea/schemas/media-test';
    const coreId = 'https://ns.adobe.com/demoemea/mixins/core-test';
    const generatorId = 'https://ns.adobe.com/demoemea/mixins/media-generator';
    const legacyId = 'https://ns.adobe.com/demoemea/mixins/media-legacy';
    const schema = { title: MEDIA_PROFILE_SCHEMA_TITLE, $id: schemaId, 'meta:altId': '_demoemea.schemas.media-test' };
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.equal(init.method, 'GET', 'readiness must never repair infrastructure');
      const path = new URL(url).pathname;
      let body;
      if (path.endsWith('/tenant/schemas')) body = { results: [schema] };
      else if (path.includes('/tenant/schemas/')) {
        const refs = ['https://ns.adobe.com/xdm/context/profile', ...BASE_PROFILE_FIELD_GROUP_REFS,
          'https://ns.adobe.com/xdm/context/profile-subscriptions', coreId, legacyId,
          ...(state !== 'legacy only' ? [generatorId] : [])];
        const properties = state === 'ready' || state === 'wrong type' ? structuredClone(PROFILE_MEDIA_V1_PROPERTIES) : {};
        if (state === 'wrong type') properties.industryMedia.properties.engagementFlags.properties.adSupported.type = 'string';
        body = { ...schema, allOf: refs.map(($ref) => ({ $ref })), 'meta:immutableTags': ['union'],
          properties: { _demoemea: { type: 'object', properties } } };
      } else if (path.endsWith('/tenant/fieldgroups')) {
        body = { results: [{ title: 'Profile Core v2', $id: coreId }, { title: 'Profile Media v1', $id: legacyId },
          ...(state !== 'legacy only' ? [{ title: PROFILE_MEDIA_GENERATOR_FIELD_GROUP.createIfMissing.title, $id: generatorId }] : [])] };
      } else if (path.endsWith('/global/fieldgroups')) body = { results: [] };
      else if (path.endsWith('/dataSets')) body = { results: [{ id: 'media-dataset', schemaRef: { id: schemaId }, tags: { unifiedProfile: ['enabled:true'] } }] };
      else if (path.endsWith('/tenant/descriptors')) {
        body = { results: ['Email', 'ECID'].map((namespace) => ({
          '@type': 'xdm:descriptorIdentity', 'xdm:sourceSchema': schemaId,
          'xdm:namespace': namespace, 'xdm:isPrimary': namespace === 'Email',
          'xdm:sourceProperty': `/_demoemea/identification/core/${namespace.toLowerCase()}`,
        })) };
      } else assert.fail(`Unexpected registry request: ${path}`);
      return { ok: true, status: 200, json: async () => body };
    });
    const status = await runStatus('offline', 'token', 'client', 'org');
    assert.equal(status.ready, state === 'ready', JSON.stringify(status));
    assert.equal(status.requiredTenantFields.ready, state === 'ready');
    assert.equal(PROFILE_MEDIA_GENERATOR_FIELD_GROUP.optional, false);
    assert.equal(PROFILE_MEDIA_GENERATOR_FIELD_GROUP.match.test('Profile Media v1'), false);
    if (state === 'legacy only' || state === 'missing fields') assert.deepEqual(status.requiredTenantFields.missing, ['industryMedia']);
    if (state === 'wrong type') assert.equal(status.requiredTenantFields.conflicts[0].path, 'industryMedia.engagementFlags.adSupported');
  });
}
