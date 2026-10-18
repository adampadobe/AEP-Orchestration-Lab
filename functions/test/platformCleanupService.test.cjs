'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPlatformCleanupService, validateTarget } = require('../platformCleanupService');

const id = '69c38a17866d0ec0db681793';
const schemaId = 'https://ns.adobe.com/example/schemas/abcdef1234';
const auth = { token: 'test-token', clientId: 'test-client', orgId: 'org@AdobeOrg', sandbox: 'sandbox' };
const dataset = { name: 'Example dataset', schemaRef: { id: schemaId }, tags: {} };
const schema = { $id: schemaId, title: 'example_table', version: '1.0', imsOrg: auth.orgId, 'meta:containerId': 'tenant' };
const params = { resource_type: 'dataset', resource_id: id, expected_name: dataset.name };

function fixture(options = {}) {
  const calls = [];
  const removed = new Set();
  const deletedDescriptors = new Set();
  let changed = false;
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    const path = decodeURIComponent(url.pathname);
    calls.push({ url, path, ...init });
    const reply = (data, status = 200) => new Response(data == null ? null : JSON.stringify(data), { status });
    if (init.method === 'DELETE') {
      if (options.rejectDelete?.(path)) return reply({ error: 'blocked' }, 409);
      if (path.includes('/descriptors/')) {
        deletedDescriptors.add(path.split('/').pop());
        return reply(null, 204);
      }
      if (!options.pending) removed.add(path);
      return path.includes('/dataSets/')
        ? reply(options.emptyAcknowledgment ? [] : [`@/dataSets/${id}`])
        : reply(null, 204);
    }
    if (removed.has(path)) return reply({ error: 'not found' }, 404);
    if (path.includes('/descriptors/')) return reply(null, !options.pendingDescriptors && deletedDescriptors.has(path.split('/').pop()) ? 404 : 200);
    if (path.endsWith(`/dataSets/${id}`)) return reply({ [id]: { ...(options.dataset || dataset), ...(changed ? { name: 'Renamed' } : {}) } });
    if (path.includes('/schemas/')) return reply(options.schema || schema);
    if (path.endsWith('/dataSets')) {
      if (options.catalog) return reply(options.catalog(url));
      return reply(url.searchParams.get('start') === '0' ? (options.datasets || {}) : {});
    }
    if (path.endsWith('/descriptors')) {
      assert.match(init.headers.Accept, /xdm-v2/);
      assert.equal(url.searchParams.get('orderby'), '@id');
      return reply(options.descriptorPage ? options.descriptorPage(url) : {
        results: (options.descriptors || []).filter((item) => !deletedDescriptors.has(item['@id'])), _page: { next: null },
      });
    }
    if (path.endsWith('/sourceConnections') || path.endsWith('/targetConnections')) {
      if (options.permissionDenied) return reply({ error: 'permission denied' }, 403);
      if (options.connectionPage) return reply(options.connectionPage(url));
      return reply({ items: options.connections || [], _links: { next: null } });
    }
    if (path.endsWith('/schemas')) return reply(options.schemaPage ? options.schemaPage(url) : { results: [schema], _page: { next: null } });
    throw new Error(`Unexpected mock URL ${url}`);
  };
  return { calls, service: createPlatformCleanupService({ fetchImpl }), rename: () => { changed = true; } };
}

test('audits metadata only, with exact scoped headers and warnings', async () => {
  const { service, calls } = fixture();
  const audit = await service.audit(auth, params);
  assert.equal(audit.deleteReviewReady, true);
  assert.equal(audit.resource.name, dataset.name);
  assert.match(audit.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(audit.warnings.some((warning) => warning.includes('AJO')));
  assert.ok(calls.every((call) => call.method === 'GET'));
  assert.ok(calls.every((call) => call.headers['x-sandbox-name'] === auth.sandbox));
  assert.ok(calls.every((call) => call.headers['x-gw-ims-org-id'] === auth.orgId));
  assert.ok(calls.every((call) => !/samples|preview|query/.test(call.path)));
});

test('deletes a dataset once and verifies absence without deleting its schema', async () => {
  const { service, calls } = fixture();
  const audit = await service.audit(auth, params);
  const result = await service.remove(auth, params, audit);
  assert.equal(result.verifiedAbsent, true);
  assert.equal(result.deleted.id, id);
  assert.deepEqual(calls.filter((call) => call.method === 'DELETE').map((call) => call.path), [`/data/foundation/catalog/dataSets/${id}`]);
});

test('blocks all mutation when the confirmed resource changed', async () => {
  const { service, calls, rename } = fixture();
  const audit = await service.audit(auth, params);
  rename();
  await assert.rejects(service.remove(auth, params, audit), { status: 409 });
  assert.equal(calls.some((call) => call.method === 'DELETE'), false);
});

test('blocks schema deletion while datasets or incoming links remain', async () => {
  const { service, calls } = fixture({
    datasets: { [id]: dataset },
    descriptors: [{ '@id': 'incoming', 'xdm:sourceSchema': `${schemaId}99`, 'xdm:destinationSchema': schemaId }],
  });
  const target = { resource_type: 'schema', resource_id: schemaId, expected_name: schema.title };
  const audit = await service.audit(auth, target);
  assert.equal(audit.blockers.length, 2);
  await assert.rejects(service.remove(auth, target, audit), { status: 409 });
  assert.equal(calls.some((call) => call.method === 'DELETE'), false);
});

test('blocks dataset source and target connections, including disabled connections', async () => {
  const { service } = fixture({ connections: [{ id: 'conn-1', state: 'disabled', params: { dataSetId: id } }] });
  const audit = await service.audit(auth, params);
  assert.equal(audit.deleteReviewReady, false);
  assert.match(audit.blockers.join(' '), /connections/);
});

test('blocks Profile/Identity-enabled dataset and union schema deletion', async () => {
  for (const key of ['unifiedProfile', 'unifiedIdentity']) {
    const { service } = fixture({ dataset: { ...dataset, tags: { [key]: ['enabled:true'] } } });
    assert.equal((await service.audit(auth, params)).deleteReviewReady, false);
  }
  const { service } = fixture({ schema: { ...schema, 'meta:immutableTags': ['union'] } });
  assert.equal((await service.audit(auth, { resource_type: 'schema', resource_id: schemaId })).deleteReviewReady, false);
  assert.equal((await service.audit(auth, params)).deleteReviewReady, false);
});

test('reports Profile and Identity independently while blocking either enablement', async () => {
  for (const [profile, identity] of [[false, false], [true, false], [false, true], [true, true]]) {
    const { service } = fixture({
      dataset: { ...dataset, tags: {
        unifiedProfile: [profile ? 'enabled:true' : 'disabled'],
        unifiedIdentity: [identity ? 'enabled:true' : 'disabled'],
      } },
    });
    const audit = await service.audit(auth, params);
    assert.equal(audit.resource.profileEnabled, profile);
    assert.equal(audit.resource.identityEnabled, identity);
    assert.equal(audit.deleteReviewReady, !profile && !identity);
  }
});

test('lists datasets without schema references but blocks dependency review explicitly', async () => {
  const incompleteId = '69c38a17866d0ec0db681794';
  for (const schemaRef of [undefined, {}, { id: '' }, { id: 42 }]) {
    const { service, calls } = fixture({
      datasets: { [id]: dataset, [incompleteId]: { name: 'Unrelated schemaless dataset', schemaRef } },
    });
    const inventory = await service.list(auth, { resource_type: 'dataset', name: 'Example' });
    assert.equal(inventory.count, 1);
    const all = await service.list(auth, { resource_type: 'dataset' });
    assert.equal(all.resources.find((row) => row.id === incompleteId).schemaId, null);
    for (const target of [params, { resource_type: 'schema', resource_id: schemaId, expected_name: schema.title }]) {
      const audit = await service.audit(auth, target);
      assert.equal(audit.deleteReviewReady, false);
      assert.match(audit.blockers.join(' '), /dependency completeness/);
      assert.equal(audit.dependencies.unresolvedDatasets[0].id, incompleteId);
      await assert.rejects(service.remove(auth, target, audit), { status: 409 });
    }
    assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  }
});

test('matches schema alternate IDs for datasets and incoming relationships', async () => {
  const altId = '_example.schemas.abcdef1234';
  const { service } = fixture({
    schema: { ...schema, 'meta:altId': altId },
    datasets: { [id]: { ...dataset, schemaRef: { id: altId } } },
    descriptors: [{ '@id': 'incoming', 'xdm:sourceSchema': `${schemaId}99`, 'xdm:destinationSchema': altId }],
  });
  const audit = await service.audit(auth, { resource_type: 'schema', resource_id: schemaId });
  assert.equal(audit.dependencies.datasets.length, 1);
  assert.equal(audit.dependencies.incomingRelationships.length, 1);
});

test('normalizes only same-resource relative Flow continuation links', async () => {
  const { service } = fixture({
    connectionPage: (url) => {
      const resource = url.pathname.split('/').pop();
      return url.searchParams.has('continuationToken')
        ? { items: [{ id: `${resource}-connection`, params: { dataSetId: id } }], _links: { next: null } }
        : { items: [], _links: { next: { href: `/${resource}?continuationToken=next` } } };
    },
  });
  const audit = await service.audit(auth, params);
  assert.equal(audit.dependencies.connections.length, 2);
});

test('deletes only schema-owned descriptors then the exact schema', async () => {
  const { service, calls } = fixture({ descriptors: [
    { '@id': 'owned-key', 'xdm:sourceSchema': schemaId },
    { '@id': 'unrelated-key', 'xdm:sourceSchema': `${schemaId}99` },
  ] });
  const target = { resource_type: 'schema', resource_id: schemaId, expected_name: schema.title };
  const audit = await service.audit(auth, target);
  const result = await service.remove(auth, target, audit);
  assert.equal(result.verifiedAbsent, true);
  assert.deepEqual(result.deletedDescriptors, ['owned-key']);
  const deletes = calls.filter((call) => call.method === 'DELETE');
  assert.equal(deletes.length, 2);
  assert.match(deletes[0].path, /descriptors\/owned-key$/);
  assert.ok(deletes[1].path.endsWith(schemaId));
});

test('reports partial descriptor changes if schema deletion fails, with no retry', async () => {
  const { service, calls } = fixture({
    descriptors: [{ '@id': 'owned-key', 'xdm:sourceSchema': schemaId }],
    rejectDelete: (path) => path.includes('/schemas/'),
  });
  const target = { resource_type: 'schema', resource_id: schemaId, expected_name: schema.title };
  const audit = await service.audit(auth, target);
  await assert.rejects(service.remove(auth, target, audit), (error) => {
    assert.deepEqual(error.detail.deletedDescriptors, ['owned-key']);
    assert.equal(error.detail.verificationRequired, true);
    return true;
  });
  assert.equal(calls.filter((call) => call.method === 'DELETE').length, 2);
});

test('does not claim success for pending deletion or empty Catalog acknowledgment', async () => {
  for (const options of [{ pending: true }, { emptyAcknowledgment: true }]) {
    const { service } = fixture(options);
    const audit = await service.audit(auth, params);
    await assert.rejects(service.remove(auth, params, audit), (error) => {
      assert.equal(error.detail.verificationRequired, true);
      return true;
    });
  }
});

test('never deletes a schema while an owned descriptor remains visible', async () => {
  const { service, calls } = fixture({
    descriptors: [{ '@id': 'owned-key', 'xdm:sourceSchema': schemaId }], pendingDescriptors: true,
  });
  const target = { resource_type: 'schema', resource_id: schemaId, expected_name: schema.title };
  const audit = await service.audit(auth, target);
  await assert.rejects(service.remove(auth, target, audit), { status: 409 });
  assert.ok(calls.filter((call) => call.method === 'DELETE').every((call) => call.path.includes('/descriptors/')));
});

test('permission errors and inventory limits fail closed without mutation retries', async () => {
  const denied = fixture({ permissionDenied: true });
  await assert.rejects(denied.service.audit(auth, params), { status: 403 });
  assert.equal(denied.calls.filter((call) => call.path.endsWith('/sourceConnections')).length, 1);
  const limited = fixture({
    descriptorPage: (url) => ({
      results: [], _page: { next: `${url.searchParams.get('start') || ''}x` },
    }),
  });
  await assert.rejects(limited.service.audit(auth, params), { status: 409 });
  assert.equal(limited.calls.filter((call) => call.path.endsWith('/descriptors')).length, 200);
  assert.equal(limited.calls.some((call) => call.method === 'DELETE'), false);
});

test('Catalog pagination continues after server-capped short pages', async () => {
  const secondId = '69c38a17866d0ec0db681794';
  const { service, calls } = fixture({
    catalog: (url) => {
      const start = url.searchParams.get('start');
      if (start === '0') return { [secondId]: { name: 'Other', schemaRef: { id: `${schemaId}99` } } };
      if (start === '1') return { [id]: dataset };
      return {};
    },
  });
  const audit = await service.audit(auth, { resource_type: 'schema', resource_id: schemaId });
  assert.equal(audit.dependencies.datasets[0].id, id);
  assert.ok(calls.some((call) => call.url.searchParams.get('start') === '2'));
});

test('Catalog metadata is not interpreted as a dataset or counted in offsets', async () => {
  const { service, calls } = fixture({
    catalog: (url) => url.searchParams.get('start') === '0'
      ? { [id]: dataset, _page: { count: 1 }, _links: {} }
      : { _page: { count: 0 }, _links: {} },
  });
  const inventory = await service.list(auth, { resource_type: 'dataset' });
  assert.equal(inventory.count, 1);
  const pages = calls.filter((call) => call.path.endsWith('/dataSets'));
  assert.deepEqual(pages.map((call) => call.url.searchParams.get('start')), ['0', '1']);
});

test('Catalog supports Data Viewer envelopes with exact IDs and explicit pagination', async () => {
  const other = '69c38a17866d0ec0db681794';
  for (const wrapper of ['children', 'results', 'datasets']) {
    const { service } = fixture({
      catalog: (url) => url.searchParams.get('start') === '0'
        ? { [wrapper]: [{ id, ...dataset }], _links: { next: { href: '/dataSets?start=1&limit=100' } } }
        : { [wrapper]: [{ '@id': other, ...dataset }], _page: { next: null } },
    });
    const inventory = await service.list(auth, { resource_type: 'dataset' });
    assert.deepEqual(inventory.resources.map((row) => row.id), [id, other]);
  }
});

test('Catalog follows numeric offsets and stops only on verified completion', async () => {
  const { service } = fixture({
    catalog: (url) => url.searchParams.get('start') === '0'
      ? { [id]: dataset, _page: { next: 1 } }
      : { _page: { next: null } },
  });
  assert.equal((await service.list(auth, { resource_type: 'dataset' })).count, 1);
});

test('Catalog rejects backward numeric continuations without another request', async () => {
  const { service, calls } = fixture({
    catalog: () => ({ [id]: dataset, _page: { next: 0 } }),
  });
  await assert.rejects(service.list(auth, { resource_type: 'dataset' }), { status: 502 });
  assert.equal(calls.length, 1);
});

test('Catalog refuses missing identities, unknown keys, mixed envelopes and unsafe continuation', async () => {
  for (const data of [
    { results: [dataset] },
    { unknown: {} },
    { results: [], children: [] },
    { results: [], [id]: dataset },
    { results: {}, _page: { next: null } },
    { _links: { next: { href: 'https://example.com/dataSets' } } },
    { _page: { next: 'unverified-cursor' } },
    { _page: [] },
    { _links: 'invalid' },
    { _links: { next: {} } },
    { _page: { next: false } },
    { _page: { next: [1] } },
  ]) {
    const { service, calls } = fixture({ catalog: () => data });
    await assert.rejects(service.list(auth, { resource_type: 'dataset' }));
    assert.ok(calls.every((call) => call.url.origin === 'https://platform.adobe.io'));
    assert.ok(calls.every((call) => call.method === 'GET'));
  }
});

test('Schema Registry accepts only same-resource service-relative continuation paths', async () => {
  for (const source of ['_links', '_page']) {
    for (const href of [
      '/tenant/schemas?orderby=title&start=Example',
      '/data/foundation/schemaregistry/tenant/schemas?orderby=title&start=Example',
      'https://platform.adobe.io/tenant/schemas?orderby=title&start=Example',
    ]) {
      const { service, calls } = fixture({
        schemaPage: (url) => url.searchParams.has('start')
          ? { results: [{ ...schema, $id: `${schemaId}99`, title: 'Other' }], _page: { next: null } }
          : { results: [schema], [source]: { next: source === '_links' ? { href } : href } },
      });
      assert.equal((await service.list(auth, { resource_type: 'schema' })).count, 2);
      assert.ok(calls.every((call) => call.path === '/data/foundation/schemaregistry/tenant/schemas'));
    }
    for (const href of [
      '/global/schemas?start=Example',
      '/tenant/descriptors?start=Example',
      'https://example.com/tenant/schemas?start=Example',
      '/tenant/schemas?orderby=title&limit=100',
    ]) {
      const { service } = fixture({
        schemaPage: () => ({ results: [], _links: { next: { href } } }),
      });
      await assert.rejects(service.list(auth, { resource_type: 'schema' }), { status: 502 });
    }
  }
});

test('follows descriptor cursors and finds incoming dependencies beyond the first page', async () => {
  const { service } = fixture({
    descriptorPage: (url) => url.searchParams.has('start')
      ? { results: [{ '@id': 'incoming', 'xdm:sourceSchema': `${schemaId}99`, 'xdm:destinationSchema': schemaId }], _page: { next: null } }
      : { results: [], _page: { next: 'cursor' } },
  });
  const audit = await service.audit(auth, params);
  assert.equal(audit.deleteReviewReady, false);
});

test('supports expanded descriptor arrays and type-grouped paginated inventories', async () => {
  for (const nested of [false, true]) {
    const { service } = fixture({
      descriptorPage: (url) => {
        const groups = {
          'xdm:descriptorRelationship': url.searchParams.has('start')
            ? [{ '@id': 'incoming', 'xdm:sourceSchema': `${schemaId}99`, 'xdm:destinationSchema': schemaId }]
            : [],
        };
        return { ...(nested ? { results: groups } : groups), _page: { next: url.searchParams.has('start') ? null : 'cursor' } };
      },
    });
    assert.equal((await service.audit(auth, params)).dependencies.incomingRelationships.length, 1);
  }
});

test('accepts an explicitly terminal full descriptor page without requesting another', async () => {
  const { service, calls } = fixture({
    descriptorPage: () => ({
      results: Array.from({ length: 100 }, (_, index) => ({ '@id': `key-${index}`, 'xdm:sourceSchema': `${schemaId}99` })),
      _page: { next: null },
    }),
  });
  assert.equal((await service.audit(auth, params)).deleteReviewReady, true);
  assert.equal(calls.filter((call) => call.path.endsWith('/descriptors')).length, 1);
});

test('fails closed on unsafe, repeated, incomplete or failed inventory', async () => {
  for (const connectionPage of [
    () => ({ items: [], _links: { next: { href: 'https://example.com/steal' } } }),
    () => ({ items: [], _links: { next: { href: '/data/foundation/flowservice/sourceConnections?limit=100' } } }),
    () => ({ items: [{}], _links: { next: null } }),
    () => ({ unexpected: [] }),
  ]) {
    const { service, calls } = fixture({ connectionPage });
    await assert.rejects(service.audit(auth, params));
    assert.ok(calls.every((call) => call.url.origin === 'https://platform.adobe.io'));
    assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  }
});

test('pagination diagnostics distinguish unsafe and repeated pages without exposing links', async () => {
  for (const [href, reason] of [
    ['https://example.com/other?token=sensitive', 'unexpected_origin'],
    ['/other?token=sensitive', 'unexpected_path'],
    ['/data/foundation/flowservice/sourceConnections?limit=100', 'repeated_page'],
  ]) {
    const { service } = fixture({
      connectionPage: () => ({ items: [], _links: { next: { href } } }),
    });
    await assert.rejects(service.audit(auth, params), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.detail.reason, reason);
      assert.equal(error.detail.page, 2);
      assert.equal(JSON.stringify(error.detail).includes('sensitive'), false);
      return true;
    });
  }
});

test('Catalog diagnostics identify repeated IDs and invalid metadata', async () => {
  for (const [row, reason, page] of [
    [dataset, 'repeated_dataset_id', 2],
    [{ schemaRef: { id: schemaId } }, 'invalid_dataset_metadata', 1],
  ]) {
    const { service } = fixture({ catalog: () => ({ [id]: row }) });
    await assert.rejects(service.list(auth, { resource_type: 'dataset' }), (error) => {
      assert.equal(error.detail.reason, reason);
      assert.equal(error.detail.page, page);
      return true;
    });
  }
});

test('rejects path injection, unsupported resource types and non-owned schemas', async () => {
  for (const [type, value] of [['dataset', '../../other'], ['schema', 'https://example.com/abc'], ['dataset', [id]], ['flow', id]]) {
    assert.throws(() => validateTarget(type, value), { status: 400 });
  }
  const { service } = fixture({ schema: { ...schema, imsOrg: 'other-org' } });
  await assert.rejects(service.audit(auth, { resource_type: 'schema', resource_id: schemaId }), { status: 403 });
});

test('list filters names without exposing full schema or connection metadata', async () => {
  const { service } = fixture();
  const result = await service.list(auth, { resource_type: 'schema', name: 'EXAMPLE' });
  assert.deepEqual(result, { count: 1, resources: [{ id: schemaId, name: schema.title, version: '1.0' }] });
});
