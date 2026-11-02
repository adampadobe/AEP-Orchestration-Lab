'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const { createProfileInfraService, BASE_PROFILE_FIELD_GROUP_REFS } = require('../profileInfraFactory');
const { projectStatusFlags } = require('../profileInfraStatusAll');
const statusCache = require('../profileInfraStatusCache');

async function statusWithDescriptors(t, descriptorResponse) {
  const schemaId = 'https://ns.adobe.com/demoemea/schemas/descriptor-test';
  const schemaAlt = '_demoemea.schemas.descriptor-test';
  const coreId = 'https://ns.adobe.com/demoemea/mixins/core-test';
  const schema = { title: 'Descriptor test', $id: schemaId, 'meta:altId': schemaAlt };
  const descriptor = {
    '@type': 'xdm:descriptorIdentity',
    'xdm:sourceSchema': schemaId,
    'xdm:sourceProperty': '/_demoemea/identification/core/email',
    'xdm:namespace': 'Email',
    'xdm:isPrimary': true,
  };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.method, 'GET', 'readiness must never mutate AEP');
    const parsed = new URL(url);
    calls.push(parsed);
    let response;
    if (parsed.pathname.endsWith('/tenant/descriptors')) {
      assert.ok(Number(parsed.searchParams.get('limit')) <= 300);
      response = descriptorResponse(parsed, descriptor);
    } else if (parsed.pathname.endsWith('/tenant/schemas')) {
      response = { results: [schema] };
    } else if (parsed.pathname.includes('/tenant/schemas/')) {
      response = {
        ...schema, 'meta:immutableTags': ['union'],
        allOf: ['https://ns.adobe.com/xdm/context/profile', ...BASE_PROFILE_FIELD_GROUP_REFS, coreId]
          .map(($ref) => ({ $ref })),
      };
    } else if (parsed.pathname.endsWith('/tenant/fieldgroups')) {
      response = { results: [{ title: 'Profile Core v2', $id: coreId }] };
    } else if (parsed.pathname.endsWith('/global/fieldgroups')) {
      response = { results: [] };
    } else if (parsed.pathname.endsWith('/dataSets')) {
      response = { results: [{ id: 'test-dataset', schemaRef: { id: schemaId }, tags: { unifiedProfile: ['enabled:true'] } }] };
    } else {
      assert.fail(`Unexpected API request: ${parsed.pathname}`);
    }
    return {
      ok: !response.httpError, status: response.httpError || 200,
      json: async () => response, text: async () => JSON.stringify(response),
    };
  });
  const service = createProfileInfraService({
    industryKey: 'generic', schemaTitle: schema.title,
    datasetName: 'Descriptor test dataset', dataflowName: 'Descriptor test dataflow',
  });
  return { status: await service.runStatus('offline', 'token', 'client', 'org'), calls };
}

for (const shape of ['results', 'children', 'xdm:descriptorIdentity']) {
  it(`accepts the existing tenant primary Email path from ${shape}`, async (t) => {
    const { status } = await statusWithDescriptors(t, (_url, descriptor) => ({ [shape]: [descriptor] }));
    assert.equal(status.primaryEmailDescriptor, true);
    assert.equal(status.ready, true);
    assert.equal(projectStatusFlags(status).primaryEmailDescriptor, true);
  });
}

it('reads later pages even when the first page contains another descriptor for this schema', async (t) => {
  const { status, calls } = await statusWithDescriptors(t, (url, descriptor) =>
    url.searchParams.has('start')
      ? { 'xdm:descriptorIdentity': [descriptor] }
      : {
          results: [{ ...descriptor, 'xdm:isPrimary': false }],
          _links: { next: { href: '?limit=300&start=next' } },
        });
  assert.equal(status.primaryEmailDescriptor, true);
  assert.ok(calls.some(url => url.searchParams.get('start') === 'next'));
});

for (const overrides of [
  { 'xdm:isPrimary': false },
  { 'xdm:namespace': 'ECID' },
  { 'xdm:sourceSchema': 'https://ns.adobe.com/demoemea/schemas/other' },
  { 'xdm:sourceProperty': '/unrelated/path' },
]) {
  it(`does not accept an unrelated or non-primary descriptor: ${JSON.stringify(overrides)}`, async (t) => {
    const { status } = await statusWithDescriptors(t, (_url, descriptor) => ({
      'xdm:descriptorIdentity': [{ ...descriptor, ...overrides }],
    }));
    assert.equal(status.primaryEmailDescriptor, false);
    assert.equal(status.ready, false);
  });
}

it('surfaces descriptor API failures rather than claiming the identity is missing', async (t) => {
  await assert.rejects(statusWithDescriptors(t, () => ({ httpError: 403, detail: 'Access denied' })), /Descriptor list failed: HTTP 403/);
});

it('does not forward credentials to an unexpected pagination host', async (t) => {
  await assert.rejects(statusWithDescriptors(t, () => ({
    results: [], _links: { next: { href: 'https://example.invalid/tenant/descriptors' } },
  })), /unexpected pagination URL/);
});

it('invalidates cached descriptor readiness from the old API contract', () => {
  assert.equal(statusCache.CACHE_VERSION, 2);
});
