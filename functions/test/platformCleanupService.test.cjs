'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPlatformCleanupService, validateTarget, validateBatchTarget } = require('../platformCleanupService');

const id = '69c38a17866d0ec0db681793';
const schemaId = 'https://ns.adobe.com/example/schemas/abcdef1234';
const auth = { token: 'test-token', clientId: 'test-client', orgId: 'org@AdobeOrg', sandbox: 'sandbox' };
const dataset = { name: 'Example dataset', schemaRef: { id: schemaId }, tags: {} };
const schema = { $id: schemaId, title: 'example_table', version: '1.0', imsOrg: auth.orgId, 'meta:containerId': 'tenant' };
const params = { resource_type: 'dataset', resource_id: id, expected_name: dataset.name };

function fixture(options = {}) {
  const datasetId = options.datasetId || id;
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
        ? reply(options.emptyAcknowledgment ? [] : [`@/dataSets/${datasetId}`])
        : reply(null, 204);
    }
    if (removed.has(path)) return reply({ error: 'not found' }, 404);
    if (path.endsWith('/schemaregistry/stats')) {
      return reply(options.stats || { imsOrg: auth.orgId, tenantId: 'example' }, options.statsStatus || 200);
    }
    if (path.includes('/descriptors/')) return reply(null, !options.pendingDescriptors && deletedDescriptors.has(path.split('/').pop()) ? 404 : 200);
    if (path.endsWith(`/dataSets/${datasetId}`)) return reply({ [datasetId]: { ...(options.dataset || dataset), ...(changed ? { name: 'Renamed' } : {}) } });
    if (path.startsWith('/data/foundation/catalog/dataSets/')) {
      if (options.catalogLookup) return reply(options.catalogLookup(url), options.catalogLookupStatus || 200);
      return reply({ error: 'not found' }, 404);
    }
    if (path.includes('/schemas/')) return reply(options.schema || schema);
    if (path.endsWith('/dataSets')) {
      if (options.catalog) return reply(options.catalog(url));
      return reply(url.searchParams.get('start') === '0' ? (options.datasets || {}) : {});
    }
    if (path.endsWith('/descriptors')) {
      assert.match(init.headers.Accept, /xdm-v2/);
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

test('verifies relational schemas missing imsOrg against authenticated registry stats', async () => {
  const relational = { ...schema, 'meta:extends': ['https://ns.adobe.com/xdm/data/adhoc-v2'] };
  delete relational.imsOrg;
  for (const target of [params, { resource_type: 'schema', resource_id: schemaId }]) {
    const { service, calls } = fixture({ schema: relational });
    assert.equal((await service.audit(auth, target)).deleteReviewReady, true);
    const statsCalls = calls.filter((call) => call.path.endsWith('/schemaregistry/stats'));
    assert.equal(statsCalls.length, 1);
    assert.equal(statsCalls[0].headers['x-gw-ims-org-id'], auth.orgId);
    assert.equal(statsCalls[0].headers['x-sandbox-name'], auth.sandbox);
    assert.ok(calls.every((call) => call.method === 'GET'));
  }
});

test('relational ownership fails closed on conflicting, absent or unverifiable metadata', async () => {
  const relational = { ...schema, 'meta:extends': ['https://ns.adobe.com/xdm/data/adhoc-v2'] };
  delete relational.imsOrg;
  for (const options of [
    { schema: { ...relational, imsOrg: 'other-org' } },
    { schema: { ...relational, imsOrg: null } },
    { schema: { ...relational, imsOrg: '' } },
    { schema: { ...relational, 'meta:extends': [] } },
    { schema: relational, stats: { imsOrg: 'other-org', tenantId: 'example' } },
    { schema: relational, stats: { imsOrg: auth.orgId, tenantId: 'other' } },
    { schema: relational, stats: { imsOrg: auth.orgId, tenantId: 'example/schemas/..' } },
    { schema: relational, stats: { imsOrg: auth.orgId } },
    { schema: relational, stats: null, statsStatus: 403 },
  ]) {
    const { service, calls } = fixture(options);
    await assert.rejects(service.audit(auth, params), { status: 403 });
    assert.ok(calls.every((call) => call.method === 'GET'));
    assert.ok(calls.filter((call) => call.path.endsWith('/schemaregistry/stats')).length <= 1);
  }
});

test('dataset protection inspection is independent of schema deletion eligibility', async () => {
  for (const container of ['model-container', 'global', undefined]) {
    const relational = { ...schema, 'meta:containerId': container, 'meta:extends': ['https://ns.adobe.com/xdm/data/adhoc-v2'] };
    const f = fixture({ schema: relational });
    assert.equal((await f.service.audit(auth, params)).deleteReviewReady, true);
    assert.ok(f.calls.filter((call) => call.path.includes('/schemas/')).every((call) => call.headers.Accept === 'application/vnd.adobe.xed-id+json'));
    const target = { resource_type: 'schema', resource_id: schemaId };
    if (container === 'model-container') assert.equal((await f.service.audit(auth, target)).deleteReviewReady, true);
    else await assert.rejects(f.service.audit(auth, target), { status: 403 });
    for (const protectedSchema of [{ ...relational, 'meta:immutableTags': ['union'] }, { ...relational, title: 'REL_protected' }]) {
      assert.equal((await fixture({ schema: protectedSchema }).service.audit(auth, params)).deleteReviewReady, false);
    }
  }
});

test('fresh pre-delete audit revalidates relational registry ownership before mutation', async () => {
  const relational = { ...schema, 'meta:extends': ['https://ns.adobe.com/xdm/data/adhoc-v2'] };
  delete relational.imsOrg;
  const stats = { imsOrg: auth.orgId, tenantId: 'example' };
  const { service, calls } = fixture({ schema: relational, stats });
  const audit = await service.audit(auth, params);
  stats.imsOrg = 'other-org';
  await assert.rejects(service.remove(auth, params, audit), { status: 403 });
  assert.equal(calls.filter((call) => call.path.endsWith('/schemaregistry/stats')).length, 2);
  assert.ok(calls.every((call) => call.method === 'GET'));
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

test('legacy single-asset audit cannot bypass hard REL and Agentic name protections', async () => {
  for (const name of ['REL_old_feed', 'Agentic_feed', 'REL travel profile dataset', 'AEP Lab - Agentic Travel Dataset']) {
    const { service, calls } = fixture({ dataset: { ...dataset, name } });
    const audit = await service.audit(auth, params);
    assert.equal(audit.deleteReviewReady, false);
    assert.match(audit.blockers.join(' '), /protected/i);
    await assert.rejects(service.remove(auth, params, audit), { status: 409 });
    assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  }
});

test('batch plans use exact inventory, dependency order and fail closed on unresolved contracts', async () => {
  const flowId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const datasetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const schemaUri = 'https://ns.adobe.com/example/schemas/abcdef1234';
  const flow = { id: flowId, name: 'Old feed', targetDataSetId: datasetId, state: 'enabled' };
  const batchDataset = { id: datasetId, name: 'Old relational dataset', schemaRef: { id: schemaUri }, tags: {} };
  const batchSchema = { $id: schemaUri, title: 'old_feed', version: '1.0', imsOrg: auth.orgId, 'meta:containerId': 'tenant' };
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    const path = decodeURIComponent(url.pathname);
    calls.push({ path, method: init.method });
    const reply = (data, status = 200) => new Response(data == null ? null : JSON.stringify(data), { status });
    if (path.endsWith('/dataSets')) return reply({ [datasetId]: batchDataset, _page: { next: null } });
    if (path.endsWith('/dataSets/' + datasetId)) return reply({ [datasetId]: batchDataset });
    if (path.endsWith('/flows/' + flowId)) return reply(flow);
    if (path.endsWith('/flows')) return reply({ items: [flow], _links: { next: null } });
    if (path.endsWith('/sourceConnections') || path.endsWith('/targetConnections') || path.endsWith('/connections')) {
      return reply({ items: [], _links: { next: null } });
    }
    if (path.endsWith('/descriptors')) return reply({ results: [], _page: { next: null } });
    if (path.endsWith('/schemas')) return reply({ results: [batchSchema], _page: { next: null } });
    if (path.includes('/schemas/')) return reply(batchSchema);
    throw new Error(`Unexpected mock URL ${url}`);
  };
  const service = createPlatformCleanupService({ fetchImpl });
  const targets = [
    { resource_type: 'flow', resource_id: flowId },
    { resource_type: 'dataset', resource_id: datasetId },
    { resource_type: 'schema', resource_id: schemaUri },
  ];
  const inventory = await service.batchInventory(auth, { targets });
  assert.equal(inventory.resources.length, 3);
  const plan = await service.plan(auth, { targets });
  assert.deepEqual(plan.ordered_resource_ids, [flowId, datasetId, schemaUri]);
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.mutation_adapters_enabled, true);
  assert.ok(plan.blockers.some((blocker) => /Disable this flow/.test(blocker)));
  assert.ok(plan.warnings.some((warning) => /conditional DELETE/.test(warning)));
  assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  flow.name = 'Changed after review';
  const stale = await service.revalidatePlan(auth, plan);
  assert.equal(stale.ok, false);
  assert.ok(stale.blockers.some((blocker) => /changed after review/.test(blocker)));
  const verification = await service.verify(auth, { plan_id: 'plan', targets }, null);
  assert.equal(verification.status, 'not_verified');
  assert.ok(verification.results.every((item) => item.exists === true && item.status === 'not_attempted'));
});

test('batch target parser rejects wildcard names, duplicate-like and unbounded identifiers', () => {
  assert.throws(() => validateBatchTarget({ resource_type: 'flow', resource_id: '*' }), { status: 400 });
  assert.throws(() => validateBatchTarget({ resource_type: 'flow', resource_id: '-'.repeat(36) }), { status: 400 });
  assert.throws(() => validateBatchTarget({
    resource_type: 'flow', resource_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', secret: 'fake-secret',
  }), { status: 400 });
  assert.throws(() => validateBatchTarget({ resource_type: 'dataset', resource_id: 'not-an-id' }), { status: 400 });
  assert.throws(() => validateBatchTarget({ resource_type: 'unknown', resource_id: 'x' }), { status: 400 });
});

test('protected baseline compares stable list metadata and blocks overall success on incomplete, changed, missing or unknown coverage', async () => {
  const targetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const protectedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let protectedFlow = {
    id: protectedId, name: 'REL_protected', state: 'enabled',
    sourceConnectionIds: ['source-original'], updatedAt: 1, metrics: { count: 1 },
  };
  let targetExists = true;
  let denyInventory = false;
  const target = { resource_type: 'flow', resource_id: targetId };
  const fetchImpl = async (input, init) => {
    assert.equal(init.method, 'GET');
    const url = new URL(input);
    const path = decodeURIComponent(url.pathname);
    const reply = (data, status = 200) => new Response(data == null ? null : JSON.stringify(data), { status });
    if (path.endsWith(`/flows/${targetId}`)) {
      return targetExists ? reply({ id: targetId, name: 'candidate' }) : reply({}, 404);
    }
    if (path.endsWith('/flows')) {
      if (denyInventory) return reply({}, 403);
      return reply({ items: [targetExists && { id: targetId, name: 'candidate' }, protectedFlow].filter(Boolean), _links: { next: null } });
    }
    if (path.endsWith('/dataSets')) return reply({ _page: { next: null } });
    if (path.endsWith('/schemas')) return reply({ results: [], _page: { next: null } });
    if (path.endsWith('/descriptors')) return reply({ results: [], _page: { next: null } });
    if (path.endsWith('/sourceConnections') || path.endsWith('/targetConnections') || path.endsWith('/connections')) {
      return reply({ items: [], _links: { next: null } });
    }
    if (path.endsWith(`/flows/${protectedId}`)) return reply({ ...protectedFlow, extraGetOnly: true });
    throw new Error(`Unexpected mock URL ${url}`);
  };
  const service = createPlatformCleanupService({ fetchImpl });
  const plan = await service.plan(auth, { targets: [target] });
  targetExists = false;
  const execution = { items: { [`flow:${targetId}`]: { status: 'succeeded' } } };
  protectedFlow = { ...protectedFlow, updatedAt: 2, metrics: { count: 999 }, lastRunId: 'new-run' };
  let result = await service.verify(auth, plan, execution);
  assert.equal(result.results[0].exists, false);
  assert.equal(result.results[0].status, 'succeeded');
  assert.equal(result.protected_baseline.results[0].status, 'preserved');
  assert.equal(result.protected_baseline.coverage, 'metadata_only');
  assert.equal(result.protected_baseline.status, 'preserved');
  assert.equal(result.status, 'verified_absent');
  const incomplete = await service.verify(auth, { ...plan, coverage: { protectedFlowIdBaseline: 'incomplete' } }, execution);
  assert.equal(incomplete.protected_baseline.status, 'incomplete');
  assert.notEqual(incomplete.status, 'verified_absent');
  protectedFlow = { ...protectedFlow, sourceConnectionIds: ['source-changed'] };
  result = await service.verify(auth, plan, execution);
  assert.equal(result.protected_baseline.results[0].status, 'changed');
  assert.notEqual(result.status, 'verified_absent');
  protectedFlow = null;
  result = await service.verify(auth, plan, execution);
  assert.equal(result.protected_baseline.results[0].status, 'missing');
  assert.notEqual(result.status, 'verified_absent');
  denyInventory = true;
  result = await service.verify(auth, plan, execution);
  assert.equal(result.protected_baseline.results[0].status, 'unknown');
  assert.equal(result.protected_baseline.error.status, 403);
  assert.match(result.protected_baseline.error.message, /flows failed \(403\)/);
  assert.equal(result.status, 'uncertain');
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

test('dataset name discovery filters in Catalog, escapes patterns, and retains duplicate names', async () => {
  const other = '69c38a17866d0ec0db681794';
  for (const name of ['frescopa', 'Fres.Copa+[test](x)*?^$|\\', 'frescopa &property=id==other']) {
    const { service, calls } = fixture({
      catalog: (url) => {
        const property = url.searchParams.get('property');
        assert.ok(property.startsWith('name~'));
        assert.equal(url.searchParams.getAll('property').length, 1);
        const pattern = new RegExp(property.slice('name~'.length));
        assert.ok(pattern.test(`prefix ${name.toUpperCase()} suffix`));
        assert.equal(pattern.test('unrelated'), false);
        if (name.includes('.')) assert.equal(pattern.test(name.replace('.', 'X')), false);
        return url.searchParams.get('start') === '0'
          ? { [id]: { ...dataset, name }, [other]: { ...dataset, name } } : {};
      },
    });
    const inventory = await service.list(auth, { resource_type: 'dataset', name });
    assert.deepEqual(inventory.resources.map((row) => row.id), [id, other]);
    assert.deepEqual(calls.map((call) => call.url.searchParams.get('start')), ['0', '2']);
    assert.ok(calls.every((call) => call.method === 'GET'));
  }
});

test('dataset name filters persist across numeric and linked continuation pages', async () => {
  const other = '69c38a17866d0ec0db681794';
  for (const next of [1, '/dataSets?start=1&limit=20']) {
    const { service, calls } = fixture({
      catalog: (url) => url.searchParams.get('start') === '0'
        ? { [id]: { ...dataset, name: 'frescopa' }, _page: { next } }
        : { [other]: { ...dataset, name: 'FRESCOPA' }, _page: { next: null } },
    });
    const inventory = await service.list(auth, { resource_type: 'dataset', name: 'frescopa' });
    assert.equal(inventory.count, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url.searchParams.get('property'), calls[1].url.searchParams.get('property'));
  }
});

test('dataset name discovery rejects changed filters and unsafe links without another request', async () => {
  for (const next of [
    '/dataSets?start=1&property=name~different',
    '/dataSets?start=1&property=name~different&property=id==other',
    'https://example.com/dataSets?start=1',
  ]) {
    const { service, calls } = fixture({
      catalog: () => ({ [id]: { ...dataset, name: 'frescopa' }, _links: { next: { href: next } } }),
    });
    await assert.rejects(service.list(auth, { resource_type: 'dataset', name: 'frescopa' }), { status: 502 });
    assert.equal(calls.length, 1);
  }
});

test('successful name discovery never narrows subsequent dependency audits', async () => {
  const { service, calls } = fixture({
    catalog: (url) => url.searchParams.has('property')
      ? { [id]: dataset, _page: { next: null } }
      : { unknown: {} },
  });
  assert.equal((await service.list(auth, { resource_type: 'dataset', name: 'Example' })).count, 1);
  for (const target of [params, { resource_type: 'schema', resource_id: schemaId }]) {
    await assert.rejects(service.audit(auth, target), (error) => {
      assert.equal(error.detail.reason, 'invalid_dataset_id');
      return true;
    });
  }
  const catalogCalls = calls.filter((call) => call.path.endsWith('/dataSets'));
  assert.equal(catalogCalls.length, 3);
  assert.ok(catalogCalls.slice(1).every((call) => !call.url.searchParams.has('property')));
  assert.ok(calls.every((call) => call.method === 'GET'));
});

test('Catalog metadata is not interpreted as a dataset or counted in offsets', async () => {
  const { service, calls } = fixture({
    catalog: (url) => url.searchParams.get('start') === '0'
      ? { [id]: dataset, _page: { count: 1 }, _links: {}, _metadata: { total: 1 } }
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

test('Catalog follows Adobe root next links and excludes pagination metadata from IDs', async () => {
  const other = '69c38a17866d0ec0db681794';
  const { service, calls } = fixture({
    catalog: (url) => {
      const start = url.searchParams.get('start');
      if (start === '0') return {
        [id]: dataset, _page: 1,
        next: { href: 'https://platform.adobe.io/data/foundation/catalog/dataSets?start=1&limit=20' },
      };
      if (start === '1') return { [other]: { id: `@/dataSets/${other}` }, _page: 2 };
      return { _page: 3 };
    },
  });
  const inventory = await service.list(auth, { resource_type: 'dataset' });
  assert.deepEqual(inventory.resources.map((row) => row.id), [id, other]);
  assert.deepEqual(calls.filter((call) => call.path.endsWith('/dataSets'))
    .map((call) => call.url.searchParams.get('start')), ['0', '1', '2']);
});

test('Catalog accepts exact IDs from documented record identifiers and blocks conflicts', async () => {
  const secondId = '69c38a17866d0ec0db681794';
  for (const key of [`@/dataSets/${id}`, `/data/foundation/catalog/dataSets/${id}`]) {
    const { service } = fixture({
      catalog: (url) => url.searchParams.get('start') === '0' ? { [key]: dataset } : {},
    });
    assert.deepEqual((await service.list(auth, { resource_type: 'dataset' })).resources.map((row) => row.id), [id]);
  }
  const { service } = fixture({
    catalog: (url) => url.searchParams.get('start') === '0'
      ? { record: { ...dataset, id: secondId } } : {},
  });
  assert.deepEqual((await service.list(auth, { resource_type: 'dataset' })).resources.map((row) => row.id), [secondId]);

  const { service: conflicting } = fixture({
    catalog: () => ({ [id]: { ...dataset, id: secondId } }),
  });
  await assert.rejects(conflicting.list(auth, { resource_type: 'dataset' }), { status: 502 });

  const { service: malformed } = fixture({
    catalog: () => ({ [id]: { ...dataset, id: 'not-a-catalog-id' } }),
  });
  await assert.rejects(malformed.list(auth, { resource_type: 'dataset' }), { status: 502 });
});

test('Catalog supports exact UUID dataset IDs through inventory, audit, and delete validation', async () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  const { service, calls } = fixture({
    datasetId: uuid,
    catalog: (url) => url.searchParams.get('start') === '0' ? { [uuid]: dataset } : {},
  });
  const target = { ...params, resource_id: uuid };
  assert.doesNotThrow(() => validateTarget('dataset', uuid));
  assert.equal((await service.list(auth, { resource_type: 'dataset' })).resources[0].id, uuid);
  const audit = await service.audit(auth, target);
  assert.equal(audit.resource.id, uuid);
  const result = await service.remove(auth, target, audit);
  assert.equal(result.deleted.id, uuid);
  assert.ok(calls.some((call) => call.method === 'DELETE' && call.path.endsWith(`/dataSets/${uuid}`)));
});

test('Catalog inventories verified opaque identities without allowing them as cleanup targets', async () => {
  const opaque = `derived_dataset_${'a'.repeat(55)}_123e4567-e89b-12d3-a456-426614174000`;
  const { service, calls } = fixture({
    catalog: (url) => url.searchParams.get('start') === '0' ? { [opaque]: dataset } : {},
    catalogLookup: () => ({ [opaque]: dataset }),
  });
  const inventory = await service.list(auth, { resource_type: 'dataset' });
  assert.deepEqual(inventory.resources.map((row) => row.id), [opaque]);
  const audit = await service.audit(auth, { resource_type: 'schema', resource_id: schemaId });
  assert.equal(audit.deleteReviewReady, false);
  assert.deepEqual(audit.dependencies.datasets.map((row) => row.id), [opaque]);
  assert.throws(() => validateTarget('dataset', opaque), { status: 400 });
  assert.throws(() => validateBatchTarget({ resource_type: 'dataset', resource_id: opaque }), { status: 400 });
  const lookups = calls.filter((call) => call.path.endsWith(`/dataSets/${opaque}`));
  assert.equal(lookups.length, 2);
  assert.ok(calls.every((call) => call.method === 'GET'));
  assert.ok(calls.every((call) => call.headers['x-sandbox-name'] === auth.sandbox));
});

test('Catalog refuses unverified or conflicting opaque identities without returning partial inventory', async () => {
  const opaque = 'derived_dataset_example-opaque-id';
  for (const lookup of [
    {},
    { [id]: dataset },
    { [opaque]: { ...dataset, name: 'Changed' } },
    { [opaque]: { ...dataset, schemaRef: { id: `${schemaId}99` } } },
    { [opaque]: { ...dataset, id } },
    { [opaque]: dataset, [id]: dataset },
  ]) {
    const { service, calls } = fixture({
      catalog: () => ({ [opaque]: dataset }),
      catalogLookup: () => lookup,
    });
    await assert.rejects(service.list(auth, { resource_type: 'dataset' }), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.detail.reason, 'invalid_dataset_id');
      return true;
    });
    assert.ok(calls.every((call) => call.method === 'GET'));
  }
});

test('Catalog surfaces opaque-identity verification failures instead of skipping the record', async () => {
  const opaque = 'derived_dataset_example-opaque-id';
  const { service, calls } = fixture({
    catalog: () => ({ [opaque]: dataset }),
    catalogLookup: () => ({ error: 'permission denied' }),
    catalogLookupStatus: 403,
  });
  await assert.rejects(service.list(auth, { resource_type: 'dataset' }), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.detail.reason, 'dataset_identity_verification_failed');
    assert.equal(error.detail.page, 1);
    assert.equal(JSON.stringify({ message: error.message, detail: error.detail }).includes(opaque), false);
    return true;
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.method === 'GET'));
});

test('Catalog rejects unsafe opaque identifiers without following them as lookup paths', async () => {
  for (const opaque of ['..', '../outside', 'a%2fb', 'https://example.com/record', 'a'.repeat(513)]) {
    const { service, calls } = fixture({ catalog: () => ({ [opaque]: dataset }) });
    await assert.rejects(service.list(auth, { resource_type: 'dataset' }), { status: 502 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
  }
});

test('Catalog metadata-only records remain visible for dependency completeness checks', async () => {
  const { service } = fixture({
    catalog: (url) => url.searchParams.get('start') === '0' ? ({ [id]: {}, _page: 1 }) : { _page: 2 },
  });
  const inventory = await service.list(auth, { resource_type: 'dataset' });
  assert.deepEqual(inventory.resources, [{
    id, name: undefined, schemaId: null, profileEnabled: false, identityEnabled: false,
  }]);
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
    { '0123456789abcdef0123456789abcdef': dataset },
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

test('Catalog diagnostics classify invalid keys without returning the key value', async () => {
  const invalidId = '0123456789abcdef0123456789abcdef';
  const { service } = fixture({ catalog: () => ({ [invalidId]: dataset }) });
  await assert.rejects(service.list(auth, { resource_type: 'dataset' }), (error) => {
    assert.equal(error.detail.reason, 'invalid_dataset_id');
    assert.equal(error.detail.keyShape, 'hex-32');
    assert.equal(error.detail.keyLength, 32);
    assert.equal(error.detail.valueType, 'object');
    assert.equal(error.detail.hasName, true);
    assert.equal(error.detail.hasSchemaRef, true);
    assert.equal(JSON.stringify(error.detail).includes(invalidId), false);
    return true;
  });
});

test('Catalog diagnostics classify common non-ID metadata keys', async () => {
  const { service } = fixture({
    catalog: (url) => url.searchParams.get('start') === '0' ? { unexpected: {} } : {},
  });
  await assert.rejects(service.list(auth, { resource_type: 'dataset' }), (error) => {
    assert.equal(error.detail.reason, 'invalid_dataset_id');
    assert.equal(error.detail.keyShape, 'name-like');
    assert.equal(JSON.stringify(error.detail).includes('unexpected'), false);
    return true;
  });
});

test('Schema Registry accepts only same-resource service-relative continuation paths', async () => {
  for (const source of ['_links', '_page']) {
    for (const href of [
      '/tenant/schemas?orderby=title&start=Example',
      '/tenant/schemas/?orderby=title&start=Example',
      '/data/foundation/schemaregistry/tenant/schemas/?orderby=title&start=Example',
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
    const { service } = fixture({
      schemaPage: (url) => url.searchParams.has('start')
        ? { results: [{ ...schema, $id: `${schemaId}99`, title: 'Other' }], _page: { next: null } }
        : { results: [schema], _links: { next: { href: 'https://platform.adobe.io/data/foundation/schemaregistry/tenant/schemas/?start=Example' } } },
    });
    assert.equal((await service.list(auth, { resource_type: 'schema' })).count, 2);
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

test('descriptor inventory uses a working sort cursor through three pages without losing incoming relationships', async () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({
    '@id': `descriptor-${index}`, 'xdm:sourceSchema': `${schemaId}99`, created: 1700000000000 + index,
  }));
  const paged = (results, next, orderby = 'created') => ({
    results, _page: { count: results.length, next, orderby },
    _links: { next: next === null ? null : { href: `/tenant/descriptors/?limit=100&orderby=${orderby}&start=${next}` } },
  });
  const { service, calls } = fixture({
    descriptorPage: (url) => {
      const orderby = url.searchParams.get('orderby');
      // The live Registry returns a non-advancing empty cursor when sorted by @id.
      if (orderby !== 'created') return paged(rows.slice(0, 100), '', orderby);
      const start = url.searchParams.get('start');
      if (start === null) return paged(rows.slice(0, 100), String(rows[99].created));
      if (start === String(rows[99].created)) return paged(rows.slice(100), String(rows[199].created));
      assert.equal(start, String(rows[199].created));
      return paged([{
        '@id': 'incoming', '@type': 'xdm:descriptorRelationship',
        'xdm:sourceSchema': `${schemaId}99`, 'xdm:destinationSchema': schemaId,
      }], null);
    },
  });
  const audit = await service.audit(auth, params);
  assert.equal(audit.deleteReviewReady, false);
  assert.equal(audit.dependencies.incomingRelationships.length, 1);
  assert.equal(calls.filter((call) => call.path.endsWith('/descriptors')).length, 3);
  assert.ok(calls.every((call) => call.method === 'GET'));
});

test('descriptor inventory still rejects non-advancing empty cursors rather than accepting a partial scan', async () => {
  const { service, calls } = fixture({
    descriptorPage: () => ({
      results: [{ '@id': 'descriptor', 'xdm:sourceSchema': `${schemaId}99` }],
      _page: { next: '', orderby: 'created' },
      _links: { next: { href: '/tenant/descriptors/?limit=100&orderby=created&start=' } },
    }),
  });
  await assert.rejects(service.audit(auth, params), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.detail.reason, 'repeated_page');
    return true;
  });
  assert.ok(calls.every((call) => call.method === 'GET'));
});

test('Schema Registry reconciles equivalent next links and sort cursors', async () => {
  const cursor = 'Example + & / caf\u00e9';
  for (const href of [
    `/tenant/schemas/?start=${encodeURIComponent(cursor)}`,
    `/data/foundation/schemaregistry/tenant/schemas?start=${encodeURIComponent(cursor)}&limit=100&orderby=title`,
    `https://platform.adobe.io/tenant/schemas?orderby=title&start=${encodeURIComponent(cursor)}`,
  ]) {
    const { service, calls } = fixture({
      schemaPage: (url) => url.searchParams.has('start')
        ? { results: [{ ...schema, $id: `${schemaId}99` }], _page: { next: null }, _links: { next: null } }
        : { results: [schema], _page: { next: cursor }, _links: { next: { href } } },
    });
    assert.equal((await service.list(auth, { resource_type: 'schema' })).count, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url.searchParams.get('start'), cursor);
    assert.ok(calls.every((call) => call.method === 'GET'));
  }
});

test('equivalent descriptor links and cursors retain later incoming relationships', async () => {
  const { service, calls } = fixture({
    descriptorPage: (url) => url.searchParams.has('start')
      ? { results: [{ '@id': 'incoming', 'xdm:sourceSchema': `${schemaId}99`, 'xdm:destinationSchema': schemaId }], _page: { next: null } }
      : { results: [], _page: { next: 'cursor' }, _links: { next: { href: '/tenant/descriptors?start=cursor' } } },
  });
  const audit = await service.audit(auth, params);
  assert.equal(audit.deleteReviewReady, false);
  assert.equal(audit.dependencies.incomingRelationships.length, 1);
  assert.equal(calls.filter((call) => call.path.endsWith('/descriptors')).length, 2);
  assert.ok(calls.every((call) => call.method === 'GET'));
});

test('Catalog reconciles root links, linked pages and numeric cursors without losing name filters', async () => {
  const other = `${id.slice(0, -1)}4`;
  const { service, calls } = fixture({
    catalog: (url) => url.searchParams.get('start') === '0'
      ? {
        [id]: { ...dataset, name: 'frescopa' }, _page: { next: 1 },
        next: '@/dataSets/?start=1&limit=100',
        _links: { next: { href: '/data/foundation/catalog/dataSets?limit=100&start=1' } },
      }
      : { [other]: { ...dataset, name: 'frescopa' }, _page: { next: null } },
  });
  assert.equal((await service.list(auth, { resource_type: 'dataset', name: 'frescopa' })).count, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get('property'), calls[1].url.searchParams.get('property'));
});

test('conflicting, unsafe and ambiguous continuations stop before another request', async () => {
  for (const metadata of [
    { _page: { next: 'cursor-secret' }, _links: { next: { href: '/tenant/schemas?start=different-secret' } } },
    { _page: { next: 'cursor-secret' }, _links: { next: { href: '/tenant/schemas?start=cursor-secret&orderby=-title' } } },
    { _page: { next: 'cursor-secret' }, _links: { next: { href: '/tenant/schemas?start=cursor-secret&start=cursor-secret' } } },
    { _page: { next: 'cursor-secret' }, _links: { next: { href: 'https://example.com/tenant/schemas?start=cursor-secret' } } },
    { _page: { next: 'cursor-secret' }, _links: { next: { href: '/tenant/descriptors?start=cursor-secret' } } },
    { _page: { next: null }, _links: { next: { href: '/tenant/schemas?start=cursor-secret' } } },
    { _page: { next: 'cursor-secret' }, _links: { next: null } },
  ]) {
    const { service, calls } = fixture({ schemaPage: () => ({ results: [schema], ...metadata }) });
    await assert.rejects(service.list(auth, { resource_type: 'schema' }), (error) => {
      assert.equal(error.status, 502);
      assert.equal(JSON.stringify(error.detail || {}).includes('secret'), false);
      return true;
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
  }
});

test('equivalent continuations still reject repeated schema pages', async () => {
  const { service, calls } = fixture({
    schemaPage: () => ({
      results: [], _page: { next: 'cursor' },
      _links: { next: { href: '/tenant/schemas?start=cursor&limit=100&orderby=title' } },
    }),
  });
  await assert.rejects(service.list(auth, { resource_type: 'schema' }), (error) => {
    assert.equal(error.detail.reason, 'repeated_page');
    return true;
  });
  assert.equal(calls.length, 2);
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
    [null, 'invalid_dataset_metadata', 1],
  ]) {
    const { service } = fixture({
      catalog: (url) => url.searchParams.get('start') === '0' || reason === 'repeated_dataset_id'
        ? ({ [id]: row }) : {},
    });
    await assert.rejects(service.list(auth, { resource_type: 'dataset' }), (error) => {
      assert.equal(error.detail.reason, reason);
      assert.equal(error.detail.page, page);
      return true;
    });
  }
});

test('rejects path injection, unsupported resource types and non-owned schemas', async () => {
  for (const [type, value] of [
    ['dataset', '../../other'], ['dataset', '123e4567-e89b-12d3-a456-42661417400z'],
    ['schema', 'https://example.com/abc'], ['dataset', [id]], ['flow', id],
  ]) {
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

function executableBatchFixture(options = {}) {
  const flowId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const sourceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const targetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const accountId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const rows = {
    flow: new Map([[flowId, { id: flowId, name: 'Old feed', state: 'disabled', sourceConnectionIds: [sourceId], targetConnectionIds: [targetId] }]]),
    dataset: new Map([[id, structuredClone(dataset)]]),
    schema: new Map([[schemaId, structuredClone(schema)]]),
    descriptor: new Map([['owned-descriptor', { '@id': 'owned-descriptor', 'xdm:sourceSchema': schemaId }]]),
    sourceConnection: new Map([[sourceId, { id: sourceId, name: 'Old source', baseConnectionId: accountId }]]),
    targetConnection: new Map([[targetId, { id: targetId, name: 'Old target', params: { dataSetId: id } }]]),
    baseConnection: new Map([[accountId, { id: accountId, name: 'Old account' }]]),
  };
  if (options.singleDataset) {
    for (const type of ['flow', 'descriptor', 'sourceConnection', 'targetConnection', 'baseConnection']) rows[type].clear();
  }
  const calls = [];
  const pendingFlowDeletes = new Map();
  let time = 1000;
  let items = {};
  let state = 'applying';
  const prefixes = {
    flow: '/data/foundation/flowservice/flows',
    sourceConnection: '/data/foundation/flowservice/sourceConnections',
    targetConnection: '/data/foundation/flowservice/targetConnections',
    baseConnection: '/data/foundation/flowservice/connections',
    dataset: '/data/foundation/catalog/dataSets',
    schema: '/data/foundation/schemaregistry/tenant/schemas',
    descriptor: '/data/foundation/schemaregistry/tenant/descriptors',
  };
  const store = {
    recordItemIntent: async (_plan, identity, intent) => {
      assert.equal(items[identity].status, 'not_attempted');
      items[identity] = { ...intent, status: 'intent_recorded' };
    },
    recordItemResult: async (_plan, identity, result) => {
      assert.equal(items[identity].status, 'intent_recorded');
      if (options.resultStoreFailure) throw new Error('Ledger write acknowledgment lost');
      items[identity] = { ...items[identity], ...result };
    },
    finishExecution: async (_plan, terminal, detail) => {
      state = terminal;
      if (terminal === 'succeeded') assert.ok(Object.values(items).every((item) => item.status === 'succeeded'));
      return { state, items: structuredClone(items), ...detail };
    },
    getExecution: async () => ({ execution: { state, items: structuredClone(items) } }),
  };
  const reply = (data, status = 200, headers = {}) => new Response(data == null ? null : JSON.stringify(data), { status, headers });
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    const path = decodeURIComponent(url.pathname).replace(/\/$/, '');
    calls.push({ path, url, atMs: time, ...init });
    if (path.endsWith('/schemaregistry/stats')) return reply(options.stats || { imsOrg: auth.orgId, tenantId: 'example' });
    if (init.method === 'POST' && path.endsWith('/action')) {
      const resourceId = path.split('/').at(-2);
      assert.equal(url.searchParams.get('op'), 'disable');
      assert.equal(init.body, undefined);
      assert.equal(items[`flow:${resourceId}`].status, 'intent_recorded');
      assert.equal(init.headers['If-Match'], options.flowHeaderEtag || rows.flow.get(resourceId).etag);
      if (options.disableError === 'network') throw new TypeError('Disable acknowledgment lost');
      if (options.disableError) return reply({ code: 'ADOBE_DISABLE_DENIED' }, options.disableError);
      if (!options.disablePending) Object.assign(rows.flow.get(resourceId), { state: 'disabled', etag: 'version-2', version: 2 });
      options.afterDisable?.({ rows, resourceId, advance: (amount) => { time += amount; } });
      if (options.loseDisableAcknowledgment) throw new TypeError('Disable acknowledgment lost after mutation');
      return reply(options.disableAcknowledgment || { id: resourceId, etag: 'version-2' });
    }
    if (path.endsWith('/runs')) {
      assert.ok(rows.flow.has(url.searchParams.get('property')?.slice('flowId=='.length)));
      return reply(options.runPage ? options.runPage(url) : { items: options.runs || [], _links: { next: null } });
    }
    for (const [type, prefix] of Object.entries(prefixes)) {
      if (path === prefix && init.method === 'GET') {
        const values = [...rows[type].values()];
        return reply(type === 'dataset' ? { ...Object.fromEntries(rows.dataset), _page: { next: null } }
          : ['schema', 'descriptor'].includes(type) ? { results: values, _page: { next: null } }
            : { items: values, _links: { next: null } });
      }
      if (!path.startsWith(`${prefix}/`)) continue;
      const resourceId = path.slice(prefix.length + 1);
      if (init.method === 'DELETE') {
        assert.equal(items[`${type === 'baseConnection' && options.accountAlias ? 'account' : type}:${resourceId}`].status, 'intent_recorded');
        assert.equal(init.headers['If-Match'], undefined);
        if (type === 'schema') assert.equal(init.headers.Accept, 'application/vnd.adobe.xed+json;version=1');
        if (type === 'descriptor') assert.equal(init.headers.Accept, 'application/vnd.adobe.xdm-v2+json');
        if (options.deleteError === 'network') throw new TypeError('fetch failed');
        if (options.deleteError) return reply({ code: 'ADOBE_DELETE_DENIED', secret: 'must-not-leak' }, options.deleteError, { 'x-request-id': 'req-delete' });
        if (type === 'flow' && options.flowDeleteDelayMs !== undefined) {
          Object.assign(rows.flow.get(resourceId), {
            state: 'delete-finalizing', lastOperation: { operation: 'delete', status: 'inProgress' },
          });
          pendingFlowDeletes.set(resourceId, time + options.flowDeleteDelayMs);
        } else if (!options.pending) rows[type].delete(resourceId);
        options.afterDelete?.({ type, resourceId, rows, advance: (amount) => { time += amount; } });
        if (type === 'flow' && options.flowDeleteStatus !== undefined) {
          return reply(options.flowDeleteStatus === 204 ? null
            : Object.hasOwn(options, 'flowDeleteAcknowledgment') ? options.flowDeleteAcknowledgment : { id: resourceId },
          options.flowDeleteStatus);
        }
        return type === 'dataset' ? reply(options.emptyAcknowledgment ? [] : [`@/dataSets/${resourceId}`])
          : reply(null, 204);
      }
      if (type === 'flow' && pendingFlowDeletes.has(resourceId) && time >= pendingFlowDeletes.get(resourceId)) {
        rows.flow.delete(resourceId);
        pendingFlowDeletes.delete(resourceId);
      }
      const raw = rows[type].get(resourceId);
      if (!raw) return reply({}, options.readbackError || 404);
      return reply(type === 'dataset' ? { [resourceId]: raw } : raw, 200,
        type === 'flow' && options.flowHeaderEtag ? { etag: options.flowHeaderEtag } : {});
    }
    throw new Error(`Unexpected mock URL ${url}`);
  };
  const service = createPlatformCleanupService({ fetchImpl, now: () => time, sleep: async (ms) => {
    time += ms;
    options.afterPoll?.();
  } });
  const batchAuth = { ...auth, sandbox: options.sandbox || auth.sandbox };
  const targets = Object.entries(rows).flatMap(([type, resources]) => [...resources.keys()].map((resource_id) => ({
    resource_type: type === 'baseConnection' && options.accountAlias ? 'account' : type, resource_id,
  })));
  async function prepare(selected = targets, operation = 'delete') {
    const reviewed = operation === 'disable' ? await service.planFlowDisable(batchAuth, { targets: selected })
      : await service.plan(batchAuth, { targets: selected });
    items = Object.fromEntries(selected.map((target) => [`${target.resource_type}:${target.resource_id}`, { ...target, status: 'not_attempted' }]));
    return { ...reviewed, plan_id: '11111111-2222-4333-8444-555555555555', principalUid: 'uid', expiresAtMs: time + 900_000 };
  }
  return { service, auth: batchAuth, rows, calls, store, targets, prepare, flowId, sourceId, targetId, accountId };
}

function retirementFixture(options = {}) {
  const { bindings, retiredBindings } = require('../myDataFlowsRegistry');
  const f = executableBatchFixture({ sandbox: 'apalmer', ...options });
  f.auth.orgId = 'BF9C27AA6464801C0A495FD0@AdobeOrg';
  for (const type of ['flow', 'sourceConnection', 'targetConnection', 'dataset', 'baseConnection']) f.rows[type].clear();
  const accountId = 'a0682068-80a4-4c97-842c-f2ab0eebc841';
  f.rows.baseConnection.set(accountId, { id: accountId, name: 'Shared Snowflake account' });
  for (const [index, binding] of bindings.entries()) {
    const sourceId = `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    const targetId = `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    const datasetId = `300000000000${String(index).padStart(12, '0')}`;
    f.rows.flow.set(binding.id, {
      id: binding.id, name: 'Renamed protected flow', state: 'enabled',
      scheduleParams: { frequency: 'minute', interval: 15 },
      sourceConnectionIds: [sourceId], targetConnectionIds: [targetId],
    });
    f.rows.sourceConnection.set(sourceId, {
      id: sourceId, baseConnectionId: accountId, params: { tableName: binding.table, cdcEnabled: true },
    });
    f.rows.targetConnection.set(targetId, {
      id: targetId, params: { dataSetId: datasetId }, data: { schema: { id: schemaId } },
    });
    f.rows.dataset.set(datasetId, {
      id: datasetId, name: binding.table === 'REL.RECIPIENT' ? 'rel_recipient' : binding.table.slice(4).toLowerCase(),
      schemaRef: { id: schemaId }, extensions: { adobe_journeyOptimizer: { status: 'COMPLETED', enabled: true } },
    });
  }
  for (const binding of retiredBindings) {
    f.rows.flow.set(binding.id, {
      id: binding.id, name: 'Legacy feed from Agentic table', state: options.enabled ? 'enabled' : 'disabled', etag: 'version-1',
      sourceConnectionIds: [binding.sourceConnectionId], targetConnectionIds: [binding.targetConnectionId],
      transformations: [{ name: 'Mapping', params: { mappingId: binding.mappingId, mappingVersion: 0 } }],
    });
    f.rows.sourceConnection.set(binding.sourceConnectionId, {
      id: binding.sourceConnectionId, baseConnectionId: accountId, params: { tableName: binding.table },
    });
    f.rows.targetConnection.set(binding.targetConnectionId, {
      id: binding.targetConnectionId, params: { dataSetId: binding.datasetId }, data: { schema: { id: binding.schemaId } },
    });
  }
  return { ...f, bindings, retiredBindings,
    retirementTargets: retiredBindings.map((binding) => ({ resource_type: 'flow', resource_id: binding.id })) };
}

test('only exact reviewed orphaned legacy flows can pass guarded disable and deletion review', async () => {
  for (const enabled of [false, true]) {
    const f = retirementFixture({ enabled });
    const plan = await f.prepare(f.retirementTargets, enabled ? 'disable' : 'delete');
    assert.equal(plan.status, 'ready');
    assert.equal(plan.manifest.length, 4);
    assert.ok(plan.manifest.every((item) => item.retirement.blockers.length === 0));
    assert.equal(plan.coverage.protectedFlowIdBaseline, 'verified');
    assert.ok(plan.protected_baseline.some((item) => item.resource_id === 'a0682068-80a4-4c97-842c-f2ab0eebc841'));
    assert.ok(f.calls.every((call) => call.method === 'GET'));
    const result = enabled ? await f.service.applyFlowDisable(f.auth, plan, f.store)
      : await f.service.apply(f.auth, plan, f.store);
    assert.equal(result.state, 'succeeded');
    const mutations = f.calls.filter((call) => call.method !== 'GET');
    assert.equal(mutations.length, 4);
    assert.ok(mutations.every((call) => call.path.includes('/flows/')));
    assert.ok(f.bindings.every((binding) => f.rows.flow.get(binding.id).state === 'enabled'));
    assert.ok(f.retiredBindings.every((binding) => f.rows.sourceConnection.has(binding.sourceConnectionId)
      && f.rows.targetConnection.has(binding.targetConnectionId)));
    const companionPlan = await f.prepare([{
      resource_type: 'sourceConnection', resource_id: f.retiredBindings[0].sourceConnectionId,
    }]);
    assert.ok(companionPlan.blockers.some((message) => message.includes('companion connections')));
  }
});

test('retirement fails closed on scope, source, target, mapping, sharing and replacement drift', async () => {
  const changes = [
    (f) => { f.auth.orgId = 'other-org'; },
    (f) => { f.auth.sandbox = 'other-sandbox'; },
    (f, b) => { f.rows.sourceConnection.get(b.sourceConnectionId).params.tableName = 'OTHER.TABLE'; },
    (f, b) => { f.rows.sourceConnection.get(b.sourceConnectionId).baseConnectionId = f.accountId; },
    (f, b) => { f.rows.targetConnection.get(b.targetConnectionId).params.dataSetId = id; },
    (f, b) => { f.rows.targetConnection.get(b.targetConnectionId).data.schema.id = schemaId; },
    (f, b) => { f.rows.flow.get(b.id).transformations[0].params.mappingVersion = 1; },
    (f, b) => { f.rows.dataset.set(b.datasetId, { ...dataset, id: b.datasetId }); },
    (f, b) => { f.rows.flow.get(f.bindings[0].id).sourceConnectionIds.push(b.sourceConnectionId); },
    (f, b) => { f.rows.flow.get(f.bindings[0].id).transformations = [{ params: { mappingId: b.mappingId } }]; },
    (f) => { f.rows.flow.delete(f.bindings[0].id); },
    (f) => {
      const base = f.bindings.find((binding) => binding.id === '065f3b53-df40-43d1-9d91-c42f031996d6');
      f.rows.flow.delete(base.id);
    },
    (f) => {
      const base = f.rows.flow.get('065f3b53-df40-43d1-9d91-c42f031996d6');
      f.rows.sourceConnection.get(base.sourceConnectionIds[0]).params.tableName = 'OTHER.TABLE';
    },
    (f) => { f.rows.flow.get(f.bindings[0].id).state = 'disabled'; },
    (f) => { f.rows.flow.get(f.bindings[0].id).scheduleParams.interval = 30; },
    (f) => {
      const source = f.rows.flow.get(f.bindings[0].id).sourceConnectionIds[0];
      f.rows.sourceConnection.get(source).params.cdcEnabled = false;
    },
    (f) => {
      const target = f.rows.flow.get(f.bindings[0].id).targetConnectionIds[0];
      f.rows.targetConnection.get(target).data.schema.id = `${schemaId}99`;
    },
    (f) => { [...f.rows.dataset.values()][0].extensions.adobe_journeyOptimizer.status = 'FAILED'; },
    (f) => { delete [...f.rows.dataset.values()][0].schemaRef; },
  ];
  for (const enabled of [false, true]) {
    for (const change of changes) {
      const f = retirementFixture({ enabled });
      change(f, f.retiredBindings[0]);
      const plan = await f.prepare([f.retirementTargets[0]], enabled ? 'disable' : 'delete');
      assert.equal(plan.status, 'blocked');
      assert.ok(f.calls.every((call) => call.method === 'GET'));
    }
  }
  const f = retirementFixture({ readbackError: 403 });
  assert.equal((await f.prepare([f.retirementTargets[0]])).status, 'blocked');
});

test('fresh retirement review stops mutations when a destination reappears or a replacement connection changes', async () => {
  for (const enabled of [false, true]) {
    for (const reappears of [false, true]) {
      const f = retirementFixture({ enabled });
      const plan = await f.prepare([f.retirementTargets[0]], enabled ? 'disable' : 'delete');
      assert.equal(plan.status, 'ready');
      if (reappears) {
        const b = f.retiredBindings[0];
        f.rows.dataset.set(b.datasetId, { ...dataset, id: b.datasetId });
      } else {
        const source = f.rows.flow.get(f.bindings[0].id).sourceConnectionIds[0];
        f.rows.sourceConnection.get(source).params.newConfiguration = 'changed';
      }
      const result = enabled ? await f.service.applyFlowDisable(f.auth, plan, f.store)
        : await f.service.apply(f.auth, plan, f.store);
      assert.equal(result.state, 'blocked');
      assert.ok(f.calls.every((call) => call.method === 'GET'));
    }
  }
});

test('batch executor deletes each supported exact type in dependency order with durable intents and verified readback', async () => {
  for (const accountAlias of [false, true]) {
    const f = executableBatchFixture({ accountAlias });
    const plan = await f.prepare();
    assert.equal(plan.status, 'ready');
    assert.equal(plan.coverage.complete, false);
    const result = await f.service.apply(f.auth, plan, f.store);
    assert.equal(result.state, 'succeeded');
    assert.equal(result.delete_requests_issued, 7);
    assert.ok(Object.values(result.items).every((item) => item.status === 'succeeded'));
    const deletes = f.calls.filter((call) => call.method === 'DELETE');
    assert.equal(deletes.length, 7);
    deletes.forEach((call, index) => assert.ok(call.path.endsWith(`/${plan.ordered_resource_ids[index]}`)));
    for (const edge of plan.dependency_edges) {
      assert.ok(plan.ordered_resource_ids.indexOf(edge.before) < plan.ordered_resource_ids.indexOf(edge.after));
    }
    assert.ok(f.calls.every((call) => call.headers['x-sandbox-name'] === f.auth.sandbox));
    const verified = await f.service.verify(f.auth, plan, result);
    assert.equal(verified.status, 'verified_absent');
  }
});

test('asynchronous flow deletion waits for exact-ID absence before deleting the next flow', async () => {
  for (const flowDeleteStatus of [200, 202, 204]) {
    const f = executableBatchFixture({ flowDeleteStatus, flowDeleteDelayMs: 60_000 });
    const secondId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    f.rows.flow.set(secondId, { ...structuredClone(f.rows.flow.get(f.flowId)), id: secondId, name: 'Another old feed' });
    const approved = await f.prepare([f.flowId, secondId].map((resource_id) => ({ resource_type: 'flow', resource_id })));
    assert.equal(approved.status, 'ready');
    const result = await f.service.apply(f.auth, approved, f.store);
    assert.equal(result.state, 'succeeded');
    assert.equal(result.delete_requests_issued, 2);
    const deletes = f.calls.filter((call) => call.method === 'DELETE');
    assert.equal(deletes.length, 2);
    assert.equal(deletes[1].atMs - deletes[0].atMs, 60_000);
    assert.ok(Object.values(result.items).every((item) => item.status === 'succeeded' && item.http_status === flowDeleteStatus));
    assert.equal((await f.service.verify(f.auth, approved, result)).status, 'verified_absent');
  }
});

test('bodyless asynchronous flow acceptance still requires verified absence', async () => {
  for (const flowDeleteStatus of [200, 202]) {
    const f = executableBatchFixture({
      flowDeleteStatus, flowDeleteAcknowledgment: null, flowDeleteDelayMs: 5000,
    });
    const approved = await f.prepare([{ resource_type: 'flow', resource_id: f.flowId }]);
    const result = await f.service.apply(f.auth, approved, f.store);
    assert.equal(result.state, 'succeeded');
    assert.equal(result.delete_requests_issued, 1);
    assert.equal(result.items[`flow:${f.flowId}`].http_status, flowDeleteStatus);
    assert.equal(f.rows.flow.has(f.flowId), false);
  }
});

test('protected configuration drift during flow deletion polling blocks the next mutation', async () => {
  const protectedId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const f = executableBatchFixture({
    flowDeleteStatus: 202, flowDeleteDelayMs: 10_000,
    afterPoll: () => { f.rows.flow.get(protectedId).state = 'disabled'; },
  });
  f.rows.flow.set(protectedId, { id: protectedId, name: 'REL_protected', state: 'enabled' });
  const secondId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  f.rows.flow.set(secondId, { ...structuredClone(f.rows.flow.get(f.flowId)), id: secondId, name: 'Another old feed' });
  const approved = await f.prepare([f.flowId, secondId].map((resource_id) => ({ resource_type: 'flow', resource_id })));
  assert.equal(approved.status, 'ready');
  const result = await f.service.apply(f.auth, approved, f.store);
  assert.equal(result.state, 'failed');
  assert.equal(result.delete_requests_issued, 1);
  assert.equal(result.items[`flow:${f.flowId}`].status, 'succeeded');
  assert.equal(result.items[`flow:${secondId}`].status, 'not_attempted');
  assert.match(result.blockers.join(' '), /protected baseline changed/);
});

test('pending flow deletion stops within the readback and expiry budgets without another mutation', async () => {
  for (const remainingMs of [900_000, 50_000]) {
    const f = executableBatchFixture({ flowDeleteStatus: 202, flowDeleteDelayMs: 120_000 });
    const approved = await f.prepare();
    approved.expiresAtMs = 1000 + remainingMs;
    const result = await f.service.apply(f.auth, approved, f.store);
    assert.equal(result.state, 'uncertain');
    assert.equal(result.safe_error_code, 'DELETE_NOT_VERIFIED');
    assert.equal(result.delete_requests_issued, 1);
    assert.equal(result.items[`flow:${f.flowId}`].status, 'uncertain');
    assert.equal(result.items[`targetConnection:${f.targetId}`].status, 'not_attempted');
    const deletion = f.calls.findIndex((call) => call.method === 'DELETE');
    const readbacks = f.calls.slice(deletion + 1);
    assert.ok(readbacks.length > 1 && readbacks.length <= 18);
    assert.ok(readbacks.every((call) => call.method === 'GET'
      && call.path.endsWith(`/flows/${f.flowId}`)
      && call.atMs < Math.min(91_000, approved.expiresAtMs - 20_000)));
    assert.equal((await f.service.verify(f.auth, approved, result)).status, 'uncertain');
    assert.equal(f.calls.filter((call) => call.method === 'DELETE').length, 1);
  }
});

test('unexpected flow acknowledgments never enable polling or subsequent deletes', async () => {
  for (const acknowledgment of [
    { flowDeleteStatus: 201 },
    { flowDeleteStatus: 200, flowDeleteAcknowledgment: { id: 'another-flow' } },
    { flowDeleteStatus: 202, flowDeleteAcknowledgment: [] },
    { flowDeleteStatus: 200, flowDeleteAcknowledgment: { error_code: 'DELETE_DENIED' } },
  ]) {
    const f = executableBatchFixture({ ...acknowledgment, flowDeleteDelayMs: 60_000 });
    const result = await f.service.apply(f.auth, await f.prepare(), f.store);
    assert.equal(result.state, 'uncertain');
    assert.equal(result.safe_error_code, 'DELETE_ACK_MISMATCH');
    assert.equal(result.delete_requests_issued, 1);
    assert.equal(f.calls.at(-1).method, 'DELETE');
  }
});

test('serial flow polling shares the execution deadline and leaves later targets untouched', async () => {
  const f = executableBatchFixture({ flowDeleteStatus: 202, flowDeleteDelayMs: 60_000 });
  const ids = [
    f.flowId,
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
  ];
  for (const [index, id] of ids.entries()) {
    f.rows.flow.set(id, { ...structuredClone(f.rows.flow.get(f.flowId)), id, name: `Old feed ${index}` });
  }
  const approved = await f.prepare(ids.map((resource_id) => ({ resource_type: 'flow', resource_id })));
  const result = await f.service.apply(f.auth, approved, f.store);
  assert.equal(result.state, 'uncertain');
  assert.equal(result.safe_error_code, 'DELETE_NOT_VERIFIED');
  const deletions = f.calls.filter((call) => call.method === 'DELETE');
  assert.equal(deletions.length, 4);
  assert.deepEqual(deletions.map((call) => call.atMs), [1000, 61_000, 121_000, 181_000]);
  assert.equal(Object.values(result.items).filter((item) => item.status === 'succeeded').length, 3);
  assert.equal(Object.values(result.items).filter((item) => item.status === 'not_attempted').length, 1);
  assert.ok(f.calls.at(-1).atMs < deletions[0].atMs + 230_000 - 20_000);
});

test('flow polling fails closed on forbidden, failed, malformed or foreign readback', async () => {
  for (const options of [
    { flowDeleteDelayMs: 0, readbackError: 403 },
    { flowDeleteDelayMs: 0, readbackError: 503 },
    { afterDelete: ({ rows, resourceId }) => { rows.flow.get(resourceId).id = 'wrong-id'; } },
    { afterDelete: ({ rows, resourceId }) => { rows.flow.get(resourceId).sandboxName = 'another-sandbox'; } },
    { afterDelete: ({ rows, resourceId }) => { rows.flow.get(resourceId).imsOrgId = 'another@AdobeOrg'; } },
  ]) {
    const f = executableBatchFixture({ flowDeleteStatus: 202, flowDeleteDelayMs: 60_000, ...options });
    const result = await f.service.apply(f.auth, await f.prepare(), f.store);
    assert.equal(result.state, 'uncertain');
    assert.equal(result.delete_requests_issued, 1);
    assert.equal(result.items[`targetConnection:${f.targetId}`].status, 'not_attempted');
    assert.equal(f.calls.filter((call) => call.method === 'DELETE').length, 1);
    assert.equal(f.calls.filter((call) => call.method === 'DELETE').at(-1).atMs, f.calls.at(-1).atMs);
  }
});

test('enabled flows, active/unknown runs, unsupported types and unlisted references block only affected plans', async () => {
  const enabled = executableBatchFixture();
  enabled.rows.flow.get(enabled.flowId).state = 'enabled';
  assert.match((await enabled.prepare()).blockers.join(' '), /Disable this flow/);
  for (const status of ['inProgress', 'unknown']) {
    const f = executableBatchFixture({
      runs: [{ id: 'run-1', flowId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', metrics: { statusSummary: { status } } }],
    });
    const plan = await f.prepare();
    assert.equal(plan.status, 'blocked');
    const result = await f.service.apply(f.auth, plan, f.store);
    assert.equal(result.state, 'blocked');
    assert.equal(f.calls.some((call) => call.method === 'DELETE'), false);
  }
  const f = executableBatchFixture();
  const unsupported = await f.prepare([{ resource_type: 'mappingSet', resource_id: 'mapping-1' }]);
  assert.equal(unsupported.status, 'blocked');
  const unlisted = await f.prepare([{ resource_type: 'dataset', resource_id: id }]);
  assert.match(unlisted.blockers.join(' '), /Unlisted resources/);
});

test('paginated run checks preserve the exact flow filter and reject scope drift', async () => {
  const f = executableBatchFixture({
    runPage: (url) => url.searchParams.has('continuationToken')
      ? { items: [{ id: 'run-2', flowId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'failed' }], _links: { next: null } }
      : { items: [], _links: { next: { href: '/runs?continuationToken=second' } } },
  });
  assert.equal((await f.prepare()).status, 'ready');
  assert.equal(f.calls.filter((call) => call.path.endsWith('/runs')).length, 2);
  const drift = executableBatchFixture({
    runPage: () => ({ items: [{ id: 'wrong-flow', flowId: 'other-flow', state: 'success' }], _links: { next: null } }),
  });
  await assert.rejects(drift.prepare(), { status: 502 });
});

test('renamed reviewed architecture flows stay protected by ID and the REL baseline is loaded from the shared registry', async () => {
  const f = executableBatchFixture({ sandbox: 'apalmer' });
  const bindings = require('../myDataFlowsRegistry').bindings.filter((binding) => binding.nodeIds.includes('rel-flow'));
  for (const binding of bindings) f.rows.flow.set(binding.id, { id: binding.id, name: 'Renamed protected feed', state: 'disabled' });
  const plan = await f.prepare();
  assert.equal(plan.coverage.protectedFlowIdBaseline, 'verified');
  assert.equal(plan.protected_baseline.filter((entry) => entry.resource_type === 'flow').length, 28);
  const protectedPlan = await f.prepare([{ resource_type: 'flow', resource_id: bindings[0].id }]);
  assert.match(protectedPlan.blockers.join(' '), /architecture registry/);
  f.rows.flow.delete(bindings[0].id);
  assert.match((await f.prepare()).blockers.join(' '), /baseline is incomplete/);
});

test('dataset and descriptor plans preserve full schema Profile/Identity protections', async () => {
  for (const selected of [[{ resource_type: 'dataset', resource_id: id }], [{ resource_type: 'descriptor', resource_id: 'owned-descriptor' }]]) {
    const f = executableBatchFixture();
    f.rows.schema.get(schemaId)['meta:immutableTags'] = ['union'];
    const plan = await f.prepare(selected);
    assert.equal(plan.status, 'blocked');
    assert.match(plan.blockers.join(' '), /Profile\/Identity|protected schema/);
  }
});

test('fresh resource drift or a new incoming dependency stops execution without silently refreshing approval', async () => {
  const stale = executableBatchFixture();
  const plan = await stale.prepare();
  stale.rows.dataset.get(id).name = 'Renamed after review';
  assert.equal((await stale.service.apply(stale.auth, plan, stale.store)).state, 'blocked');
  assert.equal(stale.calls.some((call) => call.method === 'DELETE'), false);
  const f = executableBatchFixture({
    afterDelete: ({ type, rows }) => {
      if (type === 'flow') rows.flow.set('external', { id: 'external', name: 'New external feed', targetConnectionIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'] });
    },
  });
  const approved = await f.prepare();
  const result = await f.service.apply(f.auth, approved, f.store);
  assert.equal(result.state, 'failed');
  assert.equal(result.delete_requests_issued, 1);
  assert.equal(result.items[`targetConnection:${f.targetId}`].status, 'not_attempted');
});

test('Adobe rejections and ambiguous failures retain their status, stop at one DELETE and never expose raw bodies', async () => {
  for (const deleteError of [403, 503, 'network']) {
    const f = executableBatchFixture({ deleteError });
    const plan = await f.prepare();
    const result = await f.service.apply(f.auth, plan, f.store);
    assert.equal(result.state, deleteError === 403 ? 'failed' : 'uncertain');
    assert.equal(result.delete_requests_issued, 1);
    assert.equal(f.calls.filter((call) => call.method === 'DELETE').length, 1);
    const item = result.items[`flow:${f.flowId}`];
    if (typeof deleteError === 'number') {
      assert.equal(item.http_status, deleteError);
      assert.equal(item.error_code, 'ADOBE_DELETE_DENIED');
      assert.equal(item.request_id, 'req-delete');
    }
    assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
    assert.ok(Object.values(result.items).slice(1).every((value) => value.status === 'not_attempted'));
  }
});

test('missing acknowledgment, pending deletion or forbidden readback never becomes success even when an asset is absent', async () => {
  for (const options of [{ emptyAcknowledgment: true }, { pending: true }, { readbackError: 403 }]) {
    const f = executableBatchFixture({ singleDataset: true, ...options });
    const plan = await f.prepare([{ resource_type: 'dataset', resource_id: id }]);
    assert.equal(plan.status, 'ready');
    const result = await f.service.apply(f.auth, plan, f.store);
    assert.equal(result.state, 'uncertain');
    assert.equal(f.calls.filter((call) => call.method === 'DELETE').length, 1);
    assert.equal((await f.service.verify(f.auth, plan, result)).status, 'uncertain');
  }
});

test('execution budget stops before the next write, and a lost ledger acknowledgment cannot trigger another delete', async () => {
  const f = executableBatchFixture({ afterDelete: ({ advance }) => advance(190_000) });
  const result = await f.service.apply(f.auth, await f.prepare(), f.store);
  assert.equal(result.state, 'failed');
  assert.equal(result.delete_requests_issued, 1);
  assert.match(result.blockers.join(' '), /time or plan expiry/);
  const lost = executableBatchFixture({ resultStoreFailure: true });
  await assert.rejects(lost.service.apply(lost.auth, await lost.prepare(), lost.store), /durable result could not be acknowledged/);
  assert.equal(lost.calls.filter((call) => call.method === 'DELETE').length, 1);
});

test('final protected-baseline drift prevents successful completion after the last deletion', async () => {
  const protectedId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const f = executableBatchFixture({
    singleDataset: true, afterDelete: ({ rows }) => rows.flow.delete(protectedId),
  });
  f.rows.flow.set(protectedId, { id: protectedId, name: 'REL_protected', state: 'enabled' });
  const approved = await f.prepare([{ resource_type: 'dataset', resource_id: id }]);
  const result = await f.service.apply(f.auth, approved, f.store);
  assert.equal(result.items[`dataset:${id}`].status, 'succeeded');
  assert.equal(result.state, 'uncertain');
  assert.match(result.blockers.join(' '), /protected-baseline/);
});

test('run cursors use continuationToken and foreign sandbox metadata is rejected', async () => {
  const f = executableBatchFixture({
    runPage: (url) => url.searchParams.has('continuationToken')
      ? { items: [], _page: { next: null } }
      : { items: [], _page: { next: 'run-page-two' } },
  });
  assert.equal((await f.prepare()).status, 'ready');
  assert.equal(f.calls.filter((call) => call.path.endsWith('/runs'))[1].url.searchParams.get('continuationToken'), 'run-page-two');
  const foreign = executableBatchFixture();
  foreign.rows.flow.get(foreign.flowId).sandboxName = 'another-sandbox';
  const blocked = await foreign.prepare();
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.manifest.find((item) => item.resource_type === 'flow').blockers.length > 0);
  assert.equal((await foreign.service.apply(foreign.auth, blocked, foreign.store)).delete_requests_issued, 0);
});

test('protected flow run churn does not invalidate cleanup but target churn still does', async () => {
  const protectedId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  for (const targetChurn of [false, true]) {
    const f = executableBatchFixture();
    f.rows.flow.set(protectedId, {
      id: protectedId, name: 'REL_protected', state: 'enabled', version: 1, etag: 'old',
      flowSpec: { id: 'spec', version: '1.0' }, scheduleParams: { frequency: 'minute', interval: 15 },
      lastRunDetails: { id: 'run-1', state: 'success' },
    });
    const approved = await f.prepare([{ resource_type: 'flow', resource_id: f.flowId }]);
    Object.assign(f.rows.flow.get(protectedId), { version: 2, etag: 'new', lastRunDetails: { id: 'run-2', state: 'running' } });
    if (targetChurn) f.rows.flow.get(f.flowId).version = 2;
    const result = await f.service.apply(f.auth, approved, f.store);
    assert.equal(result.state, targetChurn ? 'blocked' : 'succeeded');
    assert.equal(result.delete_requests_issued, targetChurn ? 0 : 1);
  }
});

test('protected flow configuration, nested spec versions and unknown configuration remain bound', async () => {
  for (const change of [
    { state: 'disabled' }, { sourceConnectionIds: ['new-source'] }, { targetConnectionIds: ['new-target'] },
    { flowSpec: { version: '2.0' } }, { scheduleParams: { interval: 30 } },
    { transformations: [{ mappingId: 'new-mapping' }] }, { customConfiguration: { enabled: true } },
  ]) {
    const f = executableBatchFixture();
    const protectedId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    f.rows.flow.set(protectedId, { id: protectedId, name: 'REL_protected', state: 'enabled', flowSpec: { version: '1.0' } });
    const approved = await f.prepare([{ resource_type: 'flow', resource_id: f.flowId }]);
    Object.assign(f.rows.flow.get(protectedId), change);
    const result = await f.service.apply(f.auth, approved, f.store);
    assert.equal(result.state, 'blocked');
    assert.equal(result.delete_requests_issued, 0);
  }
});

test('schema inspection failures block only affected manifest items and issue no mutations', async () => {
  const f = executableBatchFixture({ singleDataset: true });
  const secondId = '69c38a17866d0ec0db681794';
  const secondSchema = `${schemaId}99`;
  f.rows.dataset.set(secondId, { ...dataset, name: 'Other dataset', schemaRef: { id: secondSchema } });
  f.rows.schema.set(secondSchema, { ...schema, $id: secondSchema, imsOrg: 'foreign-org' });
  const approved = await f.prepare([
    { resource_type: 'dataset', resource_id: id }, { resource_type: 'dataset', resource_id: secondId },
    { resource_type: 'schema', resource_id: secondSchema },
  ]);
  assert.equal(approved.status, 'blocked');
  assert.deepEqual(approved.manifest.find((item) => item.resource_id === id).blockers, []);
  assert.ok(approved.manifest.find((item) => item.resource_id === secondId).blockers.length);
  assert.ok(approved.manifest.find((item) => item.resource_id === secondSchema).blockers.length);
  assert.equal((await f.service.apply(f.auth, approved, f.store)).delete_requests_issued, 0);
});

async function prepareDisable(f) {
  Object.assign(f.rows.flow.get(f.flowId), { state: 'enabled', etag: 'version-1', version: 1 });
  return f.prepare([{ resource_type: 'flow', resource_id: f.flowId }], 'disable');
}

test('governed disable uses one exact bodyless action and verifies disabled state and terminal runs', async () => {
  const f = executableBatchFixture();
  const plan = await prepareDisable(f);
  assert.equal(plan.status, 'ready');
  const result = await f.service.applyFlowDisable(f.auth, plan, f.store);
  assert.equal(result.state, 'succeeded');
  assert.equal(result.disable_requests_issued, 1);
  assert.equal(result.items[`flow:${f.flowId}`].operation, 'DISABLE_FLOW');
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
  assert.equal(f.calls.filter((call) => call.method === 'DELETE' || call.method === 'PATCH').length, 0);
  const verified = await f.service.verify(f.auth, plan, result);
  assert.equal(verified.status, 'verified_disabled');
  assert.equal(verified.ready_for_cleanup, true);
});

test('disable draining is bounded and verify never repeats the mutation', async () => {
  const runs = [];
  const f = executableBatchFixture({ runs });
  const plan = await prepareDisable(f);
  runs.push({ id: 'run-1', flowId: f.flowId, state: 'inProgress' });
  const result = await f.service.applyFlowDisable(f.auth, plan, f.store);
  assert.equal(result.state, 'draining');
  assert.equal(f.calls.filter((call) => call.path.endsWith('/runs')).length, 3);
  assert.equal((await f.service.verify(f.auth, plan, result)).ready_for_cleanup, false);
  runs[0].state = 'success';
  assert.equal((await f.service.verify(f.auth, plan, result)).ready_for_cleanup, true);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
});

test('disable stops on scope/configuration changes, uncertainty, rejection and unverified readback', async () => {
  for (const [options, expected] of [
    [{ disableError: 'network' }, 'uncertain'], [{ disableError: 409 }, 'failed'],
    [{ disablePending: true }, 'uncertain'], [{ disableAcknowledgment: { id: 'different', etag: 'v2' } }, 'uncertain'],
  ]) {
    const f = executableBatchFixture(options);
    const plan = await prepareDisable(f);
    const result = await f.service.applyFlowDisable(f.auth, plan, f.store);
    assert.equal(result.state, expected);
    assert.equal(result.disable_requests_issued, 1);
  }
  for (const change of [{ version: 2 }, { etag: 'changed' }, { sandboxName: 'foreign' }, { imsOrgId: 'foreign' }]) {
    const f = executableBatchFixture();
    const plan = await prepareDisable(f);
    Object.assign(f.rows.flow.get(f.flowId), change);
    assert.equal((await f.service.applyFlowDisable(f.auth, plan, f.store)).state, 'blocked');
    assert.equal(f.calls.filter((call) => call.method === 'POST').length, 0);
  }
});

test('already disabled flows need no action; protected feeds and expired plans cannot disable', async () => {
  const f = executableBatchFixture();
  const plan = await f.prepare([{ resource_type: 'flow', resource_id: f.flowId }], 'disable');
  assert.equal((await f.service.applyFlowDisable(f.auth, plan, f.store)).disable_requests_issued, 0);
  for (const protect of ['flow', 'dataset', 'schema']) {
    const blocked = executableBatchFixture();
    if (protect === 'flow') blocked.rows.flow.get(blocked.flowId).name = 'Agentic protected feed';
    else blocked.rows[protect].get(protect === 'dataset' ? id : schemaId)[protect === 'dataset' ? 'name' : 'title'] = 'REL_protected';
    const reviewed = await prepareDisable(blocked);
    assert.equal(reviewed.status, 'blocked');
    assert.equal((await blocked.service.applyFlowDisable(blocked.auth, reviewed, blocked.store)).disable_requests_issued, 0);
  }
  const expired = executableBatchFixture();
  const approved = await prepareDisable(expired);
  approved.expiresAtMs = 1000;
  assert.equal((await expired.service.applyFlowDisable(expired.auth, approved, expired.store)).disable_requests_issued, 0);
});

test('disable handles exact multi-flow scope serially and stops before changed remaining targets', async () => {
  const secondId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  for (const drift of [false, true]) {
    const f = executableBatchFixture({
      afterDisable: ({ rows, resourceId }) => {
        if (drift && resourceId !== secondId) rows.flow.get(secondId).version = 3;
      },
    });
    Object.assign(f.rows.flow.get(f.flowId), { state: 'enabled', etag: 'version-1', version: 1 });
    f.rows.flow.set(secondId, { ...structuredClone(f.rows.flow.get(f.flowId)), id: secondId, name: 'Another old feed' });
    const plan = await f.prepare([f.flowId, secondId].map((resource_id) => ({ resource_type: 'flow', resource_id })), 'disable');
    const result = await f.service.applyFlowDisable(f.auth, plan, f.store);
    assert.equal(result.state, drift ? 'failed' : 'succeeded');
    assert.equal(result.disable_requests_issued, drift ? 1 : 2);
    assert.equal(result.items[`flow:${secondId}`].status, drift ? 'not_attempted' : 'succeeded');
  }
});

test('disable preserves etag-only drift and reports incomplete/foreign run evidence', async () => {
  const options = { flowHeaderEtag: 'header-1' };
  const f = executableBatchFixture(options);
  const plan = await prepareDisable(f);
  options.flowHeaderEtag = 'header-2';
  assert.equal((await f.service.applyFlowDisable(f.auth, plan, f.store)).disable_requests_issued, 0);
  for (const run of [
    { flowId: 'foreign', id: 'run-1', state: 'success' },
    { flowId: f.flowId, state: 'success' },
    { flowId: f.flowId, id: 'run-1', state: 'unrecognized' },
  ]) {
    const other = executableBatchFixture({ runs: [run] });
    const approved = await prepareDisable(other);
    const result = await other.service.applyFlowDisable(other.auth, approved, other.store);
    assert.equal(result.state, run.state === 'unrecognized' ? 'draining' : 'uncertain');
    assert.equal((await other.service.verify(other.auth, approved, result)).ready_for_cleanup, false);
    assert.equal(other.calls.filter((call) => call.method === 'POST').length, 1);
  }
});

test('disable acknowledgment loss is reconciled read-only without rewriting historical status', async () => {
  const f = executableBatchFixture({ loseDisableAcknowledgment: true });
  const plan = await prepareDisable(f);
  const result = await f.service.applyFlowDisable(f.auth, plan, f.store);
  assert.equal(result.state, 'uncertain');
  assert.equal(result.items[`flow:${f.flowId}`].status, 'uncertain');
  const readback = await f.service.verify(f.auth, plan, result);
  assert.equal(readback.status, 'verified_disabled');
  assert.equal(readback.execution_status, 'uncertain');
  assert.equal(readback.ready_for_cleanup, true);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
});

test('four disabled targets delete despite protected run churn between every mutation', async () => {
  const protectedId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const f = executableBatchFixture({
    afterDelete: ({ rows }) => Object.assign(rows.flow.get(protectedId), {
      version: (rows.flow.get(protectedId).version || 0) + 1, lastRunDetails: { id: 'next-run', state: 'running' },
    }),
  });
  f.rows.flow.set(protectedId, { id: protectedId, name: 'REL_protected', state: 'enabled' });
  const ids = [f.flowId, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
  for (const flowId of ids.slice(1)) f.rows.flow.set(flowId, { ...structuredClone(f.rows.flow.get(f.flowId)), id: flowId });
  const plan = await f.prepare(ids.map((resource_id) => ({ resource_type: 'flow', resource_id })));
  const result = await f.service.apply(f.auth, plan, f.store);
  assert.equal(result.state, 'succeeded');
  assert.equal(result.delete_requests_issued, 4);
  assert.equal((await f.service.verify(f.auth, plan, result)).status, 'verified_absent');
  assert.ok(f.rows.flow.has(protectedId));
});

test('unselected descriptors, schema aliases and Catalog URI references remain dependency blockers', async () => {
  const f = executableBatchFixture();
  const missingDescriptor = await f.prepare(f.targets.filter((target) => target.resource_type !== 'descriptor'));
  assert.equal(missingDescriptor.status, 'blocked');
  assert.match(missingDescriptor.blockers.join(' '), /Unlisted resources/);
  f.rows.schema.get(schemaId)['meta:altId'] = 'example.schemas.old_feed';
  f.rows.dataset.get(id).schemaRef.id = 'example.schemas.old_feed';
  assert.equal((await f.prepare([{ resource_type: 'schema', resource_id: schemaId }])).status, 'blocked');
  f.rows.dataset.get(id).schemaRef.id = schemaId;
  f.rows.targetConnection.get(f.targetId).params.dataSetId = `@/dataSets/${id}`;
  const approved = await f.prepare();
  assert.equal(approved.status, 'ready');
  assert.ok(approved.dependency_edges.some((edge) => edge.before === f.targetId && edge.after === id));
});

test('expired, previous-policy or malformed-order plans cannot issue even the first delete', async () => {
  for (const change of [
    { expiresAtMs: 1000 }, { policy_version: 'previous-policy' },
    { ordered_resource_ids: Array(7).fill('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') },
  ]) {
    const f = executableBatchFixture();
    const approved = { ...await f.prepare(), ...change };
    const result = await f.service.apply(f.auth, approved, f.store);
    assert.equal(result.state, 'blocked');
    assert.equal(f.calls.some((call) => call.method === 'DELETE'), false);
  }
});
