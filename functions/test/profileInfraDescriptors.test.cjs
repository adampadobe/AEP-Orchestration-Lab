'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const { createProfileInfraService, BASE_PROFILE_FIELD_GROUP_REFS, isSecondaryEcidIdentityDescriptor } = require('../profileInfraFactory');
const { projectStatusFlags } = require('../profileInfraStatusAll');
const statusCache = require('../profileInfraStatusCache');
const { buildCompositeSubtreeFromManifest } = require('../profileInfraFactory');
const { getManifestForIndustry } = require('../profileCoreV2Manifest');

async function statusWithDescriptors(t, descriptorResponse, { ecid = true, identityMap = true } = {}) {
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
      if (ecid && !response.httpError) response.results = [...(response.results || []), {
        ...descriptor, 'xdm:namespace': 'ECID', 'xdm:isPrimary': false,
        'xdm:sourceProperty': '/_demoemea/identification/core/ecid',
      }];
    } else if (parsed.pathname.endsWith('/tenant/schemas')) {
      response = { results: [schema] };
    } else if (parsed.pathname.includes('/tenant/schemas/')) {
      response = {
        ...schema, 'meta:immutableTags': ['union'],
        allOf: ['https://ns.adobe.com/xdm/context/profile', ...BASE_PROFILE_FIELD_GROUP_REFS, coreId]
          .filter((ref) => identityMap || ref !== 'https://ns.adobe.com/xdm/context/identitymap')
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
  assert.equal(statusCache.CACHE_VERSION, 5);
});

it('blocks schemas that discard the outgoing identityMap even when both descriptors exist', async (t) => {
  const { status } = await statusWithDescriptors(t, (_url, descriptor) => ({ results: [descriptor] }), { identityMap: false });
  assert.equal(status.primaryEmailDescriptor, true);
  assert.equal(status.secondaryEcidDescriptor, true);
  assert.equal(status.prepSteps.step2_fieldGroupsIdentity, false);
  assert.equal(status.ready, false);
});

it('blocks email-only infrastructure rather than claiming ECID lookup is ready', async (t) => {
  const { status } = await statusWithDescriptors(t, (_url, descriptor) => ({ results: [descriptor] }), { ecid: false });
  assert.equal(status.primaryEmailDescriptor, true);
  assert.equal(status.secondaryEcidDescriptor, false);
  assert.equal(status.prepSteps.step2_fieldGroupsIdentity, false);
  assert.equal(status.ready, false);
  assert.equal(projectStatusFlags(status).secondaryEcidDescriptor, false);
});

it('requires the exact tenant ECID descriptor and keeps Email primary', () => {
  const descriptor = {
    '@type': 'xdm:descriptorIdentity', 'xdm:namespace': 'ECID', 'xdm:isPrimary': false,
    'xdm:sourceProperty': '/_example/identification/core/ecid',
  };
  assert.equal(isSecondaryEcidIdentityDescriptor(descriptor, '_example'), true);
  for (const change of [
    { 'xdm:isPrimary': true }, { 'xdm:namespace': 'Email' },
    { 'xdm:sourceProperty': '/_other/identification/core/ecid' },
    { '@type': 'xdm:descriptorOneToOne' },
  ]) assert.equal(isSecondaryEcidIdentityDescriptor({ ...descriptor, ...change }, '_example'), false);
});

for (const [existingNamespaces, identityMapAttached] of [
  [[], true], [['Email'], true], [['Email', 'ECID'], true], [['Email', 'ECID'], false],
]) {
  it(`provisions only missing identities with major sourceVersion when existing: ${existingNamespaces.join(',')}, IdentityMap attached: ${identityMapAttached}`, async (t) => {
    const schemaId = 'https://ns.adobe.com/example/schemas/identity-test';
    const coreId = 'https://ns.adobe.com/example/mixins/core-test';
    const schema = {
      title: 'Identity provisioning test', $id: schemaId, 'meta:altId': '_example.schemas.identity-test',
      version: '1.4',
      allOf: ['https://ns.adobe.com/xdm/context/profile', ...BASE_PROFILE_FIELD_GROUP_REFS, coreId]
        .filter((ref) => identityMapAttached || ref !== 'https://ns.adobe.com/xdm/context/identitymap')
        .map(($ref) => ({ $ref })),
    };
    const core = { title: 'Profile Core v2', $id: coreId, 'meta:altId': '_example.mixins.core-test',
      version: '1.3', properties: { _example: buildCompositeSubtreeFromManifest(getManifestForIndustry('generic'), '') } };
    const descriptor = (namespace) => ({
      '@type': 'xdm:descriptorIdentity', 'xdm:sourceSchema': schemaId,
      'xdm:namespace': namespace, 'xdm:isPrimary': namespace === 'Email',
      'xdm:sourceProperty': `/_example/identification/core/${namespace.toLowerCase()}`,
    });
    const created = [];
    const patches = [];
    t.mock.method(statusCache, 'invalidateStatusCache', async () => {});
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      const path = new URL(url).pathname;
      let body;
      if (init.method === 'PATCH' && path.includes('/tenant/schemas/')) {
        const ops = JSON.parse(init.body);
        assert.deepEqual(ops, [
          { op: 'add', path: '/meta:extends/-', value: 'https://ns.adobe.com/xdm/context/identitymap' },
          { op: 'add', path: '/allOf/-', value: { $ref: 'https://ns.adobe.com/xdm/context/identitymap' } },
        ]);
        patches.push(ops);
        schema.allOf.push(ops[1].value);
        body = schema;
      } else if (init.method === 'POST' && path.endsWith('/tenant/descriptors')) {
        body = JSON.parse(init.body);
        assert.equal(body['xdm:sourceVersion'], 1);
        assert.deepEqual({ ...body, 'xdm:sourceVersion': undefined, 'xdm:property': undefined },
          { ...descriptor(body['xdm:namespace']), 'xdm:sourceVersion': undefined, 'xdm:property': undefined });
        created.push(body);
      } else {
        assert.equal(init.method, 'GET', 'the already-attached field groups must not change');
        if (path.endsWith('/tenant/schemas')) body = { results: [schema] };
        else if (path.includes('/tenant/schemas/')) body = schema;
        else if (path.endsWith('/tenant/fieldgroups')) body = { results: [core] };
        else if (path.includes('/tenant/fieldgroups/')) body = core;
        else if (path.endsWith('/global/fieldgroups')) body = { results: [] };
        else if (path.endsWith('/tenant/descriptors')) body = { results: existingNamespaces.map(descriptor) };
        else assert.fail(`Unexpected registry request: ${path}`);
      }
      return { ok: true, status: 200, json: async () => body };
    });
    const service = createProfileInfraService({ industryKey: 'generic', schemaTitle: schema.title,
      datasetName: 'Identity test dataset', dataflowName: 'Identity test flow' });
    const result = await service.runStep('offline', 'token', 'client', 'org', 'attachFieldGroups');
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.descriptorOk, true);
    assert.equal(result.ecidDescriptorOk, true);
    assert.equal(patches.length, identityMapAttached ? 0 : 1);
    assert.deepEqual(created.map((body) => body['xdm:namespace']),
      ['Email', 'ECID'].filter((namespace) => !existingNamespaces.includes(namespace)));
  });
}
