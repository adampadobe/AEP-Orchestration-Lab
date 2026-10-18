'use strict';

const { createHash } = require('node:crypto');

const BASE = 'https://platform.adobe.io';
const CATALOG = '/data/foundation/catalog/dataSets';
const REGISTRY = '/data/foundation/schemaregistry/tenant';
const FLOW = '/data/foundation/flowservice';
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const WARNINGS = [
  'Deletion is irreversible and permanently removes dataset data or schema metadata.',
  'This metadata audit cannot prove that AJO campaigns, audiences, queries, destinations or external applications are unused. Independently clear their usage before confirming.',
  'Only the exact resource is deleted. Datasets must be deleted before schemas; incoming relationships and source/target connections must be resolved separately.',
  'Schema cleanup also deletes its audited owned descriptors. These operations are not atomic: a later failure can leave descriptors removed while the schema remains. Re-audit partial results; never automatically retry.',
];

function failure(status, message, detail) {
  return Object.assign(new Error(message), { status, detail });
}

function validateTarget(type, id) {
  if (!['dataset', 'schema'].includes(type)) throw failure(400, 'resource_type must be dataset or schema.');
  if (typeof id !== 'string') throw failure(400, 'An exact resource_id string is required.');
  if (type === 'dataset' && !/^[a-f0-9]{24}$/i.test(id)) throw failure(400, 'An exact Catalog dataset ID is required.');
  if (type === 'schema' && !/^https:\/\/ns\.adobe\.com\/[A-Za-z0-9_-]+\/schemas\/[a-f0-9]+$/i.test(id)) {
    throw failure(400, 'An exact tenant schema $id URI is required.');
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function references(value, ids) {
  if (typeof value === 'string') return ids.has(value);
  if (Array.isArray(value)) return value.some((item) => references(item, ids));
  return value && typeof value === 'object' && Object.values(value).some((item) => references(item, ids));
}

function profileEnabled(value) {
  const immutable = value?.['meta:immutableTags'] || [];
  return (Array.isArray(immutable) ? immutable : [immutable]).includes('union')
    || ['unifiedProfile', 'unifiedIdentity'].some((key) => {
      const tags = value?.tags?.[key];
      if (tags == null) return false;
      if (!Array.isArray(tags) && typeof tags !== 'string') throw failure(502, 'Invalid Profile/Identity metadata; deletion is blocked.');
      return (Array.isArray(tags) ? tags : [tags]).some((tag) => /^enabled(?::true)?$/i.test(String(tag)));
    });
}

function summary(type, raw, id = raw.$id) {
  return type === 'dataset'
    ? { id, name: raw.name, schemaId: raw.schemaRef?.id || null, profileEnabled: profileEnabled(raw) }
    : { id, name: raw.title, version: raw.version, profileEnabled: profileEnabled(raw) };
}

function createPlatformCleanupService({ fetchImpl = globalThis.fetch } = {}) {
  async function request(auth, path, { method = 'GET', accept = 'application/json', etag } = {}) {
    const response = await fetchImpl(new URL(path, BASE), {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${auth.token}`,
        'x-api-key': auth.clientId,
        'x-gw-ims-org-id': auth.orgId,
        'x-sandbox-name': auth.sandbox,
        ...(etag ? { 'If-Match': etag } : {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch {
        throw failure(502, `Platform returned invalid JSON (${response.status}).`);
      }
    }
    if (!response.ok) {
      // Do not relay raw Platform payloads, which may contain connection metadata.
      throw failure(response.status, `Platform ${method} ${new URL(path, BASE).pathname} failed (${response.status}).`);
    }
    return { data, status: response.status, etag: response.headers.get('etag') || '' };
  }

  async function get(auth, type, id) {
    validateTarget(type, id);
    const path = type === 'dataset' ? `${CATALOG}/${id}` : `${REGISTRY}/schemas/${encodeURIComponent(id)}`;
    const result = await request(auth, path, type === 'schema'
      ? { accept: 'application/vnd.adobe.xed+json;version=1' } : {});
    const raw = type === 'dataset' ? result.data?.[id] : result.data;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
        || (type === 'schema' && raw.$id !== id)) throw failure(502, 'Platform resource identity could not be verified.');
    if (type === 'schema' && (raw['meta:containerId'] !== 'tenant' || raw.imsOrg !== auth.orgId)) {
      throw failure(403, 'Only schemas owned by the configured Adobe organisation can be deleted.');
    }
    const name = type === 'dataset' ? raw.name : raw.title;
    if (typeof name !== 'string' || !name) throw failure(502, 'Platform resource name is missing or invalid.');
    return { raw, resource: summary(type, raw, id), etag: result.etag || raw['meta:registryMetadata']?.eTag || '' };
  }

  async function listCatalog(auth) {
    const result = [];
    const seen = new Set();
    for (let page = 0, start = 0; page < MAX_PAGES; page++) {
      const { data } = await request(auth, `${CATALOG}?start=${start}&limit=${PAGE_SIZE}&properties=name,schemaRef,tags,updated`);
      if (!data || Array.isArray(data) || typeof data !== 'object') throw failure(502, 'Unexpected Catalog list response.');
      const entries = Object.entries(data);
      if (!entries.length) return result;
      for (const [id, raw] of entries) {
        if (!/^[a-f0-9]{24}$/i.test(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)
            || typeof raw.name !== 'string' || typeof raw.schemaRef?.id !== 'string' || seen.has(id)) {
          throw failure(502, 'Incomplete or repeated Catalog page; cleanup audit stopped.');
        }
        seen.add(id);
        result.push({ ...raw, id });
      }
      // Servers may cap the requested page size. An empty page, not a short page, proves completion.
      start += entries.length;
    }
    throw failure(409, 'Catalog inventory limit reached; deletion is blocked.');
  }

  async function listPaged(auth, path, accept, key) {
    const result = [];
    const seenPages = new Set();
    const order = path.startsWith(REGISTRY) ? `&orderby=${key === 'results' && path.endsWith('/schemas') ? 'title' : '@id'}` : '';
    let next = `${path}?limit=${PAGE_SIZE}${order}`;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(next, `${BASE}${path}`);
      if (path.startsWith(FLOW) && url.pathname === `/${path.split('/').pop()}`) url.pathname = path;
      if (url.origin !== BASE || url.pathname !== path || seenPages.has(url.href)) {
        throw failure(502, 'Unsafe or repeated pagination link; cleanup audit stopped.');
      }
      seenPages.add(url.href);
      const { data } = await request(auth, url.href, { accept });
      let items = data?.[key];
      if (!Array.isArray(items) && path.endsWith('/descriptors')) {
        const grouped = items ?? data;
        const groups = grouped && typeof grouped === 'object' && !Array.isArray(grouped)
          ? Object.entries(grouped).filter(([name]) => !['_page', '_links'].includes(name)) : null;
        if (!groups || groups.some(([name, values]) => !name.startsWith('xdm:') || !Array.isArray(values))
            || (!Object.hasOwn(data?._page || {}, 'next') && !Object.hasOwn(data?._links || {}, 'next'))) {
          throw failure(502, 'Unverifiable grouped descriptor inventory; deletion is blocked.');
        }
        items = groups.flatMap(([, values]) => values);
      }
      if (!Array.isArray(items)) throw failure(502, `Unexpected ${path} inventory response.`);
      result.push(...items);
      const link = data._links?.next;
      const href = typeof link === 'string' ? link : link?.href;
      const cursor = data._page?.next;
      if (href) next = href;
      else if (cursor != null && cursor !== '') next = `${path}?limit=${PAGE_SIZE}${order}&start=${encodeURIComponent(cursor)}`;
      else {
        if (items.length >= PAGE_SIZE && data._page?.next !== null && link !== null) {
          throw failure(409, `Pagination completion is ambiguous for ${path}; deletion is blocked.`);
        }
        const ids = result.map((item) => item?.id || item?.['@id'] || item?.$id);
        if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
          throw failure(502, `Incomplete or duplicated inventory for ${path}; deletion is blocked.`);
        }
        return result;
      }
    }
    throw failure(409, `Inventory limit reached for ${path}; deletion is blocked.`);
  }

  async function descriptors(auth) {
    const items = await listPaged(auth, `${REGISTRY}/descriptors`, 'application/vnd.adobe.xdm-v2+json', 'results');
    if (items.some((item) => typeof item?.['@id'] !== 'string' || !item['@id']
        || typeof item['xdm:sourceSchema'] !== 'string' || !item['xdm:sourceSchema']
        || (item['xdm:destinationSchema'] !== undefined && typeof item['xdm:destinationSchema'] !== 'string')
        || (/descriptor(?:Relationship|OneToOne)$/.test(item['@type'] || '') && !item['xdm:destinationSchema']))) {
      throw failure(502, 'Incomplete descriptor inventory; deletion is blocked.');
    }
    return items;
  }

  async function list(auth, { resource_type, name = '' }) {
    if (!['dataset', 'schema'].includes(resource_type)) throw failure(400, 'resource_type must be dataset or schema.');
    const rows = resource_type === 'dataset'
      ? (await listCatalog(auth)).map((raw) => summary('dataset', raw, raw.id))
      : (await listPaged(auth, `${REGISTRY}/schemas`, 'application/vnd.adobe.xed-id+json', 'results'))
        .map((raw) => ({ id: raw.$id, name: raw.title, version: raw.version }));
    const resources = rows.filter((row) => String(row.name || '').toLowerCase().includes(name.toLowerCase()));
    return { resources, count: resources.length };
  }

  async function audit(auth, { resource_type: type, resource_id: id }) {
    const target = await get(auth, type, id);
    const blockers = [];
    if (profileEnabled(target.raw)) blockers.push('Profile/Identity-enabled resources are not supported by this cleanup tool.');
    const schemaId = type === 'schema' ? id : target.resource.schemaId;
    if (!schemaId) throw failure(409, 'Dataset schema reference is missing; dependency safety cannot be established.');
    const schema = type === 'schema' ? target : await get(auth, 'schema', schemaId);
    if (type === 'dataset' && profileEnabled(schema.raw)) blockers.push('The dataset schema is enabled for Profile; deletion is blocked.');
    const schemaIdentifiers = new Set([schemaId, schema.raw['meta:altId']].filter(Boolean));
    const [datasets, links, sources, targets] = await Promise.all([
      listCatalog(auth),
      descriptors(auth),
      listPaged(auth, `${FLOW}/sourceConnections`, 'application/json', 'items'),
      listPaged(auth, `${FLOW}/targetConnections`, 'application/json', 'items'),
    ]);
    const relatedDatasets = type === 'schema' ? datasets.filter((row) => schemaIdentifiers.has(row.schemaRef?.id)) : [];
    const incoming = links.filter((row) => !schemaIdentifiers.has(row['xdm:sourceSchema']) && references(row, schemaIdentifiers));
    const owned = type === 'schema' ? links.filter((row) => schemaIdentifiers.has(row['xdm:sourceSchema'])) : [];
    const identifiers = new Set([id, ...schemaIdentifiers]);
    const connections = [...sources, ...targets].filter((row) => references(row, identifiers));
    if (relatedDatasets.length) blockers.push('Delete every dataset using this schema first.');
    if (incoming.length) blockers.push('Incoming schema relationships remain; delete child datasets/schemas or separately resolve the relationships first.');
    if (connections.length) blockers.push('Source/target connections still reference this dataset or schema. Resolve them separately; no automatic flow or connection deletion.');
    if (owned.some((row) => !/^[a-zA-Z0-9_-]+$/.test(row['@id']))) {
      blockers.push('An owned descriptor ID is unsupported.');
    }
    const dependencies = {
      datasets: relatedDatasets.map((row) => summary('dataset', row, row.id)),
      incomingRelationships: incoming,
      ownedDescriptors: owned,
      connections: connections.map((row) => ({ id: row.id, name: row.name || '', state: row.state || '' })),
    };
    const auditFingerprint = fingerprint({
      orgId: auth.orgId, sandbox: auth.sandbox, type, id, raw: target.raw, schema: schema.raw,
      dependencies: {
        ...dependencies,
        incomingRelationships: [...incoming].sort((a, b) => a['@id'].localeCompare(b['@id'])),
        ownedDescriptors: [...owned].sort((a, b) => a['@id'].localeCompare(b['@id'])),
        datasets: [...dependencies.datasets].sort((a, b) => a.id.localeCompare(b.id)),
        connections: [...dependencies.connections].sort((a, b) => a.id.localeCompare(b.id)),
      },
    });
    return {
      resource: target.resource, dependencies, blockers, warnings: WARNINGS,
      deleteReviewReady: blockers.length === 0,
      fingerprint: auditFingerprint,
      etag: target.etag,
    };
  }

  async function remove(auth, params, approvedAudit) {
    const { resource_type: type, resource_id: id, expected_name: name } = params;
    const current = await audit(auth, params);
    if (current.resource.name !== name || current.fingerprint !== approvedAudit.fingerprint) {
      throw failure(409, 'Resource or dependencies changed. Run a fresh audit and confirm again.');
    }
    if (current.blockers.length) throw failure(409, 'Cleanup is blocked.', { blockers: current.blockers });
    const deletedDescriptors = [];
    let deleteAttempted = false;
    try {
      // Only descriptors owned by the schema being deleted, never incoming/shared descriptors.
      for (const descriptor of current.dependencies.ownedDescriptors) {
        const descriptorPath = `${REGISTRY}/descriptors/${encodeURIComponent(descriptor['@id'])}`;
        const result = await request(auth, descriptorPath, { method: 'DELETE' });
        if (result.status !== 204) throw failure(502, 'Descriptor deletion was not acknowledged as complete.');
        deletedDescriptors.push(descriptor['@id']);
        let absent = false;
        try { await request(auth, descriptorPath); } catch (error) {
          if (error.status !== 404) throw error;
          absent = true;
        }
        if (!absent) throw failure(409, 'Descriptor absence is not verified; schema deletion stopped.');
      }
      const path = type === 'dataset' ? `${CATALOG}/${id}` : `${REGISTRY}/schemas/${encodeURIComponent(id)}`;
      deleteAttempted = true;
      const result = await request(auth, path, { method: 'DELETE', etag: current.etag });
      if (type === 'dataset' && (!Array.isArray(result.data) || !result.data.includes(`@/dataSets/${id}`))) {
        throw failure(502, 'Catalog did not acknowledge deletion of the exact dataset.');
      }
      if (type === 'schema' && result.status !== 204) throw failure(502, 'Schema deletion was not acknowledged as complete.');
      let absent = false;
      try { await get(auth, type, id); } catch (error) {
        if (error.status !== 404) throw error;
        absent = true;
      }
      if (!absent) throw failure(409, 'Deletion requested but absence is not verified. Do not delete the parent schema; re-audit later.');
      return { deleted: current.resource, verifiedAbsent: true, deletedDescriptors };
    } catch (error) {
      error.detail = {
        ...error.detail, deletedDescriptors, deletionAttempted: deleteAttempted,
        verificationRequired: true,
        instruction: 'Partial changes or an uncertain deletion are possible. Re-audit before any retry; no rollback or automatic retry was attempted.',
      };
      throw error;
    }
  }

  return { list, audit, remove };
}

module.exports = { createPlatformCleanupService, validateTarget, fingerprint };
