'use strict';

const { createHash } = require('node:crypto');

const BASE = 'https://platform.adobe.io';
const CATALOG = '/data/foundation/catalog/dataSets';
const REGISTRY = '/data/foundation/schemaregistry/tenant';
const FLOW = '/data/foundation/flowservice';
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const CATALOG_DATASET_ID = /^(?:[a-f0-9]{24}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i;
const WARNINGS = [
  'Deletion is irreversible and permanently removes dataset data or schema metadata.',
  'This metadata audit cannot prove that AJO campaigns, audiences, queries, destinations or external applications are unused. Independently clear their usage before confirming.',
  'Only the exact resource is deleted. Datasets must be deleted before schemas; incoming relationships and source/target connections must be resolved separately.',
  'Schema cleanup also deletes its audited owned descriptors. These operations are not atomic: a later failure can leave descriptors removed while the schema remains. Re-audit partial results; never automatically retry.',
];

function failure(status, message, detail) {
  return Object.assign(new Error(message), { status, detail });
}

function isCatalogDatasetId(value) {
  return typeof value === 'string' && CATALOG_DATASET_ID.test(value);
}

function validateTarget(type, id) {
  if (!['dataset', 'schema'].includes(type)) throw failure(400, 'resource_type must be dataset or schema.');
  if (typeof id !== 'string') throw failure(400, 'An exact resource_id string is required.');
  if (type === 'dataset' && !isCatalogDatasetId(id)) throw failure(400, 'An exact Catalog dataset ID is required.');
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

function enabledTag(value, key) {
  const tags = value?.tags?.[key];
  if (tags == null) return false;
  if (!Array.isArray(tags) && typeof tags !== 'string') throw failure(502, 'Invalid Profile/Identity metadata; deletion is blocked.');
  return (Array.isArray(tags) ? tags : [tags]).some((tag) => /^enabled(?::true)?$/i.test(String(tag)));
}

function profileEnabled(value) {
  const immutable = value?.['meta:immutableTags'] || [];
  return (Array.isArray(immutable) ? immutable : [immutable]).includes('union')
    || enabledTag(value, 'unifiedProfile');
}

function identityEnabled(value) {
  return enabledTag(value, 'unifiedIdentity');
}

function cleanupEnabled(value) {
  return profileEnabled(value) || identityEnabled(value);
}

function summary(type, raw, id = raw.$id) {
  const status = { profileEnabled: profileEnabled(raw), identityEnabled: identityEnabled(raw) };
  return type === 'dataset'
    ? { id, name: raw.name, schemaId: typeof raw.schemaRef?.id === 'string' && raw.schemaRef.id ? raw.schemaRef.id : null, ...status }
    : { id, name: raw.title, version: raw.version, ...status };
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

  function inventoryUrl(next, path, page, seenPages) {
    const url = new URL(next, `${BASE}${path}`);
    const relativePath = path.startsWith(REGISTRY) ? path.slice('/data/foundation/schemaregistry'.length)
      : path.startsWith(FLOW) ? path.slice(FLOW.length)
        : path === CATALOG ? '/dataSets' : null;
    // Adobe uses service-relative continuation paths; only the same exact resource is allowed.
    if (url.origin === BASE && url.pathname === relativePath) url.pathname = path;
    if (url.origin === BASE && url.pathname === `${relativePath}/`) url.pathname = path;
    if (url.origin === BASE && url.pathname === `${path}/`) url.pathname = path;
    url.searchParams.sort();
    const reason = url.origin !== BASE || url.username || url.password || url.hash ? 'unexpected_origin'
      : url.pathname !== path ? 'unexpected_path'
        : seenPages.has(url.href) ? 'repeated_page' : null;
    if (reason) {
      throw failure(502, 'Unsafe or repeated pagination link; cleanup audit stopped.', {
        inventory: path, page: page + 1, reason,
        ...(reason === 'unexpected_path' ? { receivedPath: url.pathname } : {}),
      });
    }
    seenPages.add(url.href);
    return url;
  }

  function continuation(data, { catalog = false, path, page, url, cursorPage }) {
    if (data._links != null && (typeof data._links !== 'object' || Array.isArray(data._links))) {
      throw failure(502, 'Invalid inventory pagination metadata; cleanup audit stopped.');
    }
    if (data._page != null && (typeof data._page !== 'object' || Array.isArray(data._page))
        && !(catalog && (typeof data._page === 'string' || Number.isSafeInteger(data._page)))) {
      throw failure(502, 'Invalid inventory pagination metadata; cleanup audit stopped.');
    }
    const link = data._links?.next;
    const linkedHref = typeof link === 'string' ? link : link?.href;
    const cursor = data._page?.next;
    const rootNext = catalog ? data.next : undefined;
    const rawRootHref = typeof rootNext === 'string' ? rootNext : rootNext?.href;
    const rootHref = catalog && typeof rawRootHref === 'string' && rawRootHref.startsWith('@/')
      ? rawRootHref.slice(1) : rawRootHref;
    if ((link != null && (typeof linkedHref !== 'string' || !linkedHref))
        || (rootNext != null && (typeof rootHref !== 'string' || !rootHref))
        || (cursor != null && typeof cursor !== 'string'
          && !(typeof cursor === 'number' && Number.isSafeInteger(cursor) && cursor >= 0))) {
      throw failure(502, 'Invalid inventory continuation; cleanup audit stopped.');
    }
    const candidates = [linkedHref, rootHref, cursor].filter((value) => value != null && value !== '');
    const conflictingTerminal = candidates.length > 0 && (link === null || rootNext === null || cursor === null);
    const conflict = () => failure(502, 'Conflicting inventory continuations; cleanup audit stopped.', {
      inventory: path, page: page + 1, reason: 'conflicting_continuations',
      hasLinkedNext: linkedHref != null, hasRootNext: rootHref != null, hasCursor: cursor != null,
    });
    if (conflictingTerminal) throw conflict();
    let resolvedHref;
    if (candidates.length > 1) {
      const destinations = candidates.map((value) => {
        const destination = typeof value === 'string' && /^(?:https?:\/\/|\/|\?)/.test(value)
          ? value : cursorPage(value);
        const normalized = inventoryUrl(destination, path, page + 1, new Set());
        // A next link may omit the current page's limit, ordering or filter.
        for (const [key, value] of url.searchParams) {
          if (key !== 'start' && !normalized.searchParams.has(key)) normalized.searchParams.append(key, value);
        }
        if ([...normalized.searchParams.keys()].some((key) => normalized.searchParams.getAll(key).length > 1)) {
          throw failure(502, 'Invalid inventory continuation; cleanup audit stopped.');
        }
        normalized.searchParams.sort();
        return normalized.href;
      });
      if (new Set(destinations).size > 1) throw conflict();
      resolvedHref = destinations[0];
    }
    const href = resolvedHref || rootHref || linkedHref;
    return { link: link ?? rootNext, href, cursor: href ? null : cursor };
  }

  function catalogId(value) {
    if (typeof value !== 'string') return null;
    if (isCatalogDatasetId(value)) return value;
    const prefixes = [
      '@/dataSets/',
      '/data/foundation/catalog/dataSets/',
      'https://platform.adobe.io/data/foundation/catalog/dataSets/',
    ];
    const prefix = prefixes.find((candidate) => value.toLowerCase().startsWith(candidate.toLowerCase()));
    if (!prefix) return null;
    const id = value.slice(prefix.length);
    return isCatalogDatasetId(id) ? id : null;
  }

  function catalogIdShape(value) {
    if (typeof value !== 'string') return 'missing';
    if (/^[a-f0-9]+$/i.test(value)) return `hex-${value.length}`;
    if (value === 'next') return 'catalog-continuation';
    if (value.startsWith('@/dataSets/')) return 'catalog-link';
    if (value.startsWith('/')) return 'path';
    if (/^https?:\/\//i.test(value)) return 'url';
    if (/^[a-z][a-z0-9_.-]{0,31}$/i.test(value)) return 'name-like';
    return 'other';
  }

  async function listCatalog(auth, name = '') {
    const result = [];
    const seen = new Set();
    const seenPages = new Set();
    // Catalog's property regex keeps name discovery server-side; audits omit it.
    const namePattern = Array.from(name, (character) => {
      const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const variants = [...new Set([character, character.toLowerCase(), character.toUpperCase()])];
      return variants.length === 1 ? escape(character) : `(?:${variants.map(escape).join('|')})`;
    }).join('');
    const property = name ? `name~${namePattern}` : null;
    const catalogPage = (start) => {
      const url = new URL(CATALOG, BASE);
      url.searchParams.set('start', String(start));
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('properties', 'name,schemaRef,tags,updated');
      if (property) url.searchParams.set('property', property);
      return url.href;
    };
    let next = null;
    for (let page = 0, start = 0; page < MAX_PAGES; page++) {
      const candidate = new URL(next || catalogPage(start), `${BASE}${CATALOG}`);
      if (property) {
        const filters = candidate.searchParams.getAll('property');
        if (filters.length && (filters.length !== 1 || filters[0] !== property)) {
          throw failure(502, 'Catalog name filter changed during pagination; cleanup inventory stopped.');
        }
        candidate.searchParams.set('property', property);
      }
      const url = inventoryUrl(candidate.href, CATALOG, page, seenPages);
      const { data } = await request(auth, url.href);
      if (!data || Array.isArray(data) || typeof data !== 'object') throw failure(502, 'Unexpected Catalog list response.');
      // The Data Viewer supports keyed Catalog objects plus children/results envelopes.
      const wrappers = ['children', 'results', 'datasets'].filter((key) => Object.hasOwn(data, key));
      if (wrappers.length > 1 || (wrappers.length && (
        !Array.isArray(data[wrappers[0]])
        || Object.keys(data).some((key) => ![wrappers[0], '_page', '_links', 'next'].includes(key))
      ))) throw failure(502, 'Ambiguous Catalog inventory envelope; cleanup audit stopped.');
      const entries = wrappers.length
        ? data[wrappers[0]].map((raw) => ({ key: raw?.id || raw?.['@id'], raw }))
        : Object.entries(data).filter(([key]) => !key.startsWith('_') && key !== 'next')
          .map(([key, raw]) => ({ key, raw }));
      for (const { key, raw } of entries) {
        const keyId = catalogId(key);
        const recordIdValues = raw && typeof raw === 'object' && !Array.isArray(raw)
          ? ['id', '@id'].filter((field) => Object.hasOwn(raw, field)).map((field) => raw[field]) : [];
        const recordIds = recordIdValues.map(catalogId);
        const validIds = [keyId, ...recordIds].filter(Boolean);
        const id = recordIdValues.some((_value, index) => !recordIds[index])
          || new Set(validIds).size > 1 ? null : validIds[0];
        const reason = seen.has(id) ? 'repeated_dataset_id'
          : !id ? 'invalid_dataset_id'
            : !raw || typeof raw !== 'object' || Array.isArray(raw)
              ? 'invalid_dataset_metadata' : null;
        if (reason) {
          throw failure(502, 'Incomplete or repeated Catalog page; cleanup audit stopped.', {
            inventory: 'datasets', page: page + 1, reason,
            ...(reason === 'invalid_dataset_id' ? {
              keyShape: catalogIdShape(key),
              recordIdShape: recordIdValues.length ? catalogIdShape(recordIdValues[0]) : 'missing',
              keyLength: typeof key === 'string' ? key.length : null,
              valueType: raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw,
              hasName: typeof raw?.name === 'string',
              hasSchemaRef: raw != null && Object.hasOwn(raw, 'schemaRef'),
            } : {}),
          });
        }
        seen.add(id);
        result.push({ ...raw, id });
      }
      const { link, href, cursor } = continuation(data, {
        catalog: true, path: CATALOG, page, url,
        cursorPage: (value) => {
          if (!/^\d+$/.test(String(value))) throw failure(502, 'Unverifiable Catalog continuation; cleanup audit stopped.');
          return catalogPage(value);
        },
      });
      if (href) next = href;
      else if (cursor != null && cursor !== '') {
        if (typeof cursor === 'string' && /^(?:https?:\/\/|\/|\?)/.test(cursor)) next = cursor;
        else if (/^\d+$/.test(String(cursor))) {
          next = catalogPage(cursor);
        } else throw failure(502, 'Unverifiable Catalog continuation; cleanup audit stopped.');
      } else {
        if (data._page?.next === null || link === null || !entries.length) return result;
        next = null;
      }
      // Without an explicit terminal marker, only an empty page proves completion.
      const offset = url.searchParams.get('start');
      if (offset != null && /^\d+$/.test(offset) && Number.isSafeInteger(Number(offset))) {
        start = Number(offset) + entries.length;
      } else if (!next) throw failure(502, 'Unverifiable Catalog completion; cleanup audit stopped.');
    }
    throw failure(409, 'Catalog inventory limit reached; deletion is blocked.');
  }

  async function listPaged(auth, path, accept, key) {
    const result = [];
    const seenPages = new Set();
    const order = path.startsWith(REGISTRY) ? `&orderby=${key === 'results' && path.endsWith('/schemas') ? 'title' : '@id'}` : '';
    let next = `${path}?limit=${PAGE_SIZE}${order}`;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = inventoryUrl(next, path, page, seenPages);
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
      const { link, href, cursor } = continuation(data, {
        path, page, url,
        cursorPage: (value) => `${path}?limit=${PAGE_SIZE}${order}&start=${encodeURIComponent(value)}`,
      });
      if (href) next = href;
      else if (cursor != null && cursor !== '') {
        next = typeof cursor === 'string' && /^(?:https?:\/\/|\/|\?)/.test(cursor)
          ? cursor : `${path}?limit=${PAGE_SIZE}${order}&start=${encodeURIComponent(cursor)}`;
      } else {
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
      ? (await listCatalog(auth, name)).map((raw) => summary('dataset', raw, raw.id))
      : (await listPaged(auth, `${REGISTRY}/schemas`, 'application/vnd.adobe.xed-id+json', 'results'))
        .map((raw) => ({ id: raw.$id, name: raw.title, version: raw.version }));
    const resources = rows.filter((row) => String(row.name || '').toLowerCase().includes(name.toLowerCase()));
    return { resources, count: resources.length };
  }

  async function audit(auth, { resource_type: type, resource_id: id }) {
    const target = await get(auth, type, id);
    const blockers = [];
    if (cleanupEnabled(target.raw)) blockers.push('Profile/Identity-enabled resources are not supported by this cleanup tool.');
    const schemaId = type === 'schema' ? id : target.resource.schemaId;
    if (!schemaId) throw failure(409, 'Dataset schema reference is missing; dependency safety cannot be established.');
    const schema = type === 'schema' ? target : await get(auth, 'schema', schemaId);
    if (type === 'dataset' && cleanupEnabled(schema.raw)) blockers.push('The dataset schema is enabled for Profile/Identity; deletion is blocked.');
    const schemaIdentifiers = new Set([schemaId, schema.raw['meta:altId']].filter(Boolean));
    const [datasets, links, sources, targets] = await Promise.all([
      listCatalog(auth),
      descriptors(auth),
      listPaged(auth, `${FLOW}/sourceConnections`, 'application/json', 'items'),
      listPaged(auth, `${FLOW}/targetConnections`, 'application/json', 'items'),
    ]);
    const relatedDatasets = type === 'schema' ? datasets.filter((row) => schemaIdentifiers.has(row.schemaRef?.id)) : [];
    const unresolvedDatasets = datasets.filter((row) => typeof row.schemaRef?.id !== 'string' || !row.schemaRef.id);
    if (unresolvedDatasets.length) blockers.push('Dataset schema references are missing or invalid; dependency completeness cannot be established.');
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
      unresolvedDatasets: unresolvedDatasets.map((row) => summary('dataset', row, row.id)),
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
        unresolvedDatasets: [...dependencies.unresolvedDatasets].sort((a, b) => a.id.localeCompare(b.id)),
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
