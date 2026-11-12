'use strict';

const { createHash } = require('node:crypto');
const { bindings: reviewedFlowBindings } = require('./myDataFlowsRegistry');

const BASE = 'https://platform.adobe.io';
const CATALOG = '/data/foundation/catalog/dataSets';
const REGISTRY = '/data/foundation/schemaregistry/tenant';
const FLOW = '/data/foundation/flowservice';
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const MAX_BATCH_TARGETS = 100;
const BATCH_POLICY_VERSION = '2026-11-12.2';
const PROTECTED_SNOWFLAKE_ACCOUNT_ID = 'a0682068-80a4-4c97-842c-f2ab0eebc841';
const BATCH_TYPES = new Set([
  'flow', 'dataset', 'schema', 'descriptor', 'sourceConnection',
  'targetConnection', 'baseConnection', 'account', 'mappingSet', 'ajoChannel',
]);
const MUTATION_ADAPTERS_ENABLED = true;
const REVIEWED_FLOW_IDS = new Set(reviewedFlowBindings.map((binding) => binding.id));
const REQUIRED_REL_FLOW_IDS = reviewedFlowBindings.filter((binding) => binding.nodeIds.includes('rel-flow')).map((binding) => binding.id);
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
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

function validateBatchTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)
      || Object.keys(target).some((key) => !['resource_type', 'resource_id'].includes(key))
      || !BATCH_TYPES.has(target.resource_type) || typeof target.resource_id !== 'string'
      || !target.resource_id || target.resource_id.length > 512) {
    throw failure(400, 'Each target requires a supported resource_type and exact resource_id.');
  }
  const { resource_type: type, resource_id: id } = target;
  if (type === 'dataset' || type === 'schema') return validateTarget(type, id);
  if (type === 'mappingSet' || type === 'ajoChannel') {
    if (/[*?]/.test(id)) throw failure(400, 'Wildcard resource IDs are not supported.');
    return;
  }
  if (type === 'descriptor') {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw failure(400, 'An exact descriptor ID is required.');
    return;
  }
  if (!UUID.test(id)) throw failure(400, `An exact ${type} UUID is required.`);
}

function protectedMetadata(value) {
  if (Array.isArray(value)) return value.map(protectedMetadata);
  if (!value || typeof value !== 'object') return value;
  const operationalKey = /^(?:created|updated|modified|lastModified|lastUpdated|lastRun|lastExecution|nextRun|runCount|metrics|statistics|stats|runs|etag|eTag|timestamp)(?:At|Time|Timestamp|Date|Id|Status|Count|s)?$/i;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !operationalKey.test(key))
    .map(([key, item]) => [key, protectedMetadata(item)]));
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

function protectedResource(type, id, name = '', sandbox) {
  const normalizedName = String(name).trim().toLowerCase();
  if (type === 'flow' && sandbox === 'apalmer' && REVIEWED_FLOW_IDS.has(id)) {
    return 'This flow is protected by the reviewed architecture registry, independently of its current name.';
  }
  if (['account', 'baseConnection'].includes(type) && id.toLowerCase() === PROTECTED_SNOWFLAKE_ACCOUNT_ID) {
    return 'The protected Adobe DEV Snowflake travel account cannot be deleted.';
  }
  if (/(^|[^a-z0-9])rel_/.test(normalizedName)
      || /\brel\b/.test(normalizedName)
      || /(^|[^a-z0-9])agentic(?:_|$|[^a-z0-9])/.test(normalizedName)) {
    return 'REL and Agentic resources are protected independently of their current display state.';
  }
  if (/(^|[^a-z0-9])cjm_/.test(normalizedName)
      || /\b(ajo|cja|system|global|lakehouse|ttl)\b/.test(normalizedName)) {
    return 'AJO/CJA, system/global, CJM and Lakehouse TTL resources are protected.';
  }
  return null;
}

function batchResource(type, raw, id) {
  const name = raw?.name || raw?.title || raw?.flowName || raw?.connectionName || raw?.label || '';
  return {
    resource_type: type,
    resource_id: id,
    name: typeof name === 'string' ? name : '',
    state: typeof raw?.state === 'string' ? raw.state : '',
    profileEnabled: profileEnabled(raw),
    identityEnabled: identityEnabled(raw),
  };
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

function createPlatformCleanupService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
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
        if (response.ok) throw failure(502, `Platform returned invalid JSON (${response.status}).`);
      }
    }
    const requestId = response.headers.get('x-request-id') || response.headers.get('x-requestid') || response.headers.get('x-adobe-request-id');
    const errorCode = data?.error_code || data?.errorCode || data?.code;
    if (!response.ok) {
      // Do not relay raw Platform payloads, which may contain connection metadata.
      throw failure(response.status, `Platform ${method} ${new URL(path, BASE).pathname} failed (${response.status}).`, {
        ...(typeof errorCode === 'string' && /^[A-Z0-9_-]{1,80}$/i.test(errorCode) ? { error_code: errorCode } : {}),
        ...(typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId) ? { request_id: requestId } : {}),
      });
    }
    return { data, status: response.status, etag: response.headers.get('etag') || '', request_id: requestId };
  }

  async function get(auth, type, id) {
    validateTarget(type, id);
    const path = type === 'dataset' ? `${CATALOG}/${id}` : `${REGISTRY}/schemas/${encodeURIComponent(id)}`;
    const result = await request(auth, path, type === 'schema'
      ? { accept: 'application/vnd.adobe.xed+json;version=1' } : {});
    const raw = type === 'dataset' ? result.data?.[id] : result.data;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
        || (type === 'schema' && raw.$id !== id)) throw failure(502, 'Platform resource identity could not be verified.');
    if (type === 'schema') {
      const denyOwnership = () => failure(403, 'Only schemas owned by the configured Adobe organisation can be deleted.', {
        containerIsTenant: raw['meta:containerId'] === 'tenant',
        hasImsOrg: Object.hasOwn(raw, 'imsOrg'),
        orgMatches: raw.imsOrg === auth.orgId,
      });
      if (raw['meta:containerId'] !== 'tenant') throw denyOwnership();
      if (raw.imsOrg !== auth.orgId) {
        const relational = Array.isArray(raw['meta:extends'])
          && raw['meta:extends'].includes('https://ns.adobe.com/xdm/data/adhoc-v2');
        if (Object.hasOwn(raw, 'imsOrg') || !relational) throw denyOwnership();
        // Relational responses may omit imsOrg; verify the authenticated registry's namespace.
        const { data: stats } = await request(auth, '/data/foundation/schemaregistry/stats');
        if (stats?.imsOrg !== auth.orgId || typeof stats.tenantId !== 'string'
            || !/^[A-Za-z0-9_-]+$/.test(stats.tenantId)
            || !id.startsWith(`https://ns.adobe.com/${stats.tenantId}/schemas/`)) throw denyOwnership();
      }
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

  function catalogId(value, allowOpaque = false) {
    if (typeof value !== 'string') return null;
    const valid = (id) => isCatalogDatasetId(id)
      || (allowOpaque && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,511}$/.test(id));
    if (valid(value)) return value;
    const prefixes = [
      '@/dataSets/',
      '/data/foundation/catalog/dataSets/',
      'https://platform.adobe.io/data/foundation/catalog/dataSets/',
    ];
    const prefix = prefixes.find((candidate) => value.toLowerCase().startsWith(candidate.toLowerCase()));
    if (!prefix) return null;
    const id = value.slice(prefix.length);
    return valid(id) ? id : null;
  }

  async function verifyOpaqueCatalogIdentity(auth, id, raw, page) {
    if (typeof raw?.name !== 'string' || !raw.name) return false;
    let data;
    try {
      ({ data } = await request(auth, `${CATALOG}/${encodeURIComponent(id)}`));
    } catch (error) {
      if (error.status === 404) return false;
      if (Number.isInteger(error.status)) {
        throw failure(error.status, 'Catalog identity verification failed; cleanup inventory stopped.', {
          inventory: 'datasets', page: page + 1, reason: 'dataset_identity_verification_failed',
        });
      }
      throw error;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, id)
        || Object.keys(data).filter((key) => !key.startsWith('_') && key !== 'next').length !== 1) return false;
    const verified = data[id];
    return verified != null && typeof verified === 'object' && !Array.isArray(verified)
      && verified.name === raw.name && verified.schemaRef?.id === raw.schemaRef?.id
      && ['id', '@id'].every((key) => !Object.hasOwn(verified, key) || catalogId(verified[key], true) === id);
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
        const recordIds = recordIdValues.map((value) => catalogId(value, true));
        const validIds = [keyId, ...recordIds].filter(Boolean);
        let id = recordIdValues.some((_value, index) => !recordIds[index])
          || new Set(validIds).size > 1 ? null : validIds[0] || catalogId(key, true);
        // Opaque identities are inventory-only; deletion target validation stays strict.
        if (id && !seen.has(id) && !isCatalogDatasetId(id)
            && !(await verifyOpaqueCatalogIdentity(auth, id, raw, page))) id = null;
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

  async function listPaged(auth, path, accept, key, filters = {}) {
    const result = [];
    const seenPages = new Set();
    // Descriptor @id sorting can return an empty, non-advancing cursor; use creation time.
    const order = path.startsWith(REGISTRY) ? `&orderby=${key === 'results' && path.endsWith('/schemas') ? 'title' : 'created'}` : '';
    const filterQuery = new URLSearchParams(filters).toString();
    const cursorParameter = path === `${FLOW}/runs` ? 'continuationToken' : 'start';
    let next = `${path}?limit=${PAGE_SIZE}${order}${filterQuery ? `&${filterQuery}` : ''}`;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = inventoryUrl(next, path, page, seenPages);
      for (const [name, value] of Object.entries(filters)) {
        if (url.searchParams.has(name) && (url.searchParams.getAll(name).length !== 1 || url.searchParams.get(name) !== value)) {
          throw failure(502, 'Inventory continuation changed the required scope filter.');
        }
        url.searchParams.set(name, value);
      }
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
        cursorPage: (value) => `${path}?limit=${PAGE_SIZE}${order}&${cursorParameter}=${encodeURIComponent(value)}`,
      });
      if (href) next = href;
      else if (cursor != null && cursor !== '') {
        next = typeof cursor === 'string' && /^(?:https?:\/\/|\/|\?)/.test(cursor)
          ? cursor : `${path}?limit=${PAGE_SIZE}${order}&${cursorParameter}=${encodeURIComponent(cursor)}`;
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
    const policyBlock = protectedResource(type, id, target.resource.name, auth.sandbox);
    if (policyBlock) blockers.push(policyBlock);
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

  function inventoryId(type, raw) {
    if (type === 'schema') return raw?.$id;
    if (type === 'descriptor') return raw?.['@id'];
    return raw?.id || raw?.flowId || raw?.connectionId || raw?.['@id'];
  }

  async function collectBatchInventory(auth) {
    const [datasets, schemas, descriptorRows, flows, sources, targets, accounts] = await Promise.all([
      listCatalog(auth),
      listPaged(auth, `${REGISTRY}/schemas`, 'application/vnd.adobe.xed-id+json', 'results'),
      descriptors(auth),
      listPaged(auth, `${FLOW}/flows`, 'application/json', 'items'),
      listPaged(auth, `${FLOW}/sourceConnections`, 'application/json', 'items'),
      listPaged(auth, `${FLOW}/targetConnections`, 'application/json', 'items'),
      listPaged(auth, `${FLOW}/connections`, 'application/json', 'items'),
    ]);
    const entries = [
      ...flows.map((raw) => ({ type: 'flow', raw })),
      ...datasets.map((raw) => ({ type: 'dataset', raw })),
      ...schemas.map((raw) => ({ type: 'schema', raw })),
      ...descriptorRows.map((raw) => ({ type: 'descriptor', raw })),
      ...sources.map((raw) => ({ type: 'sourceConnection', raw })),
      ...targets.map((raw) => ({ type: 'targetConnection', raw })),
      ...accounts.map((raw) => ({ type: 'baseConnection', raw })),
    ].map(({ type, raw }) => ({ type, id: inventoryId(type, raw), raw }));
    const incomplete = entries.find((entry) => typeof entry.id !== 'string' || !entry.id);
    if (incomplete) throw failure(502, `Incomplete ${incomplete.type} inventory; batch planning stopped.`);
    const identities = entries.map(({ type, id }) => `${type}:${id}`);
    if (new Set(identities).size !== identities.length) throw failure(502, 'Duplicate inventory identity; batch planning stopped.');
    return {
      entries,
      coverage: {
        complete: false,
        metadata_scans_complete: true,
        resources: {
          flows: flows.length, datasets: datasets.length, schemas: schemas.length,
          descriptors: descriptorRows.length, sourceConnections: sources.length,
          targetConnections: targets.length, baseConnections: accounts.length,
        },
        unsupported: [
          { resource_type: 'mappingSet', reason: 'No verified inventory contract is enabled.' },
          { resource_type: 'ajoChannel', reason: 'No verified inventory contract is enabled.' },
        ],
        limitations: [
          'External AJO, audience, destination and application usage is not established by these inventories.',
          'Flow run checks establish observed terminal status, not an atomic guarantee against another writer.',
          'Mapping sets, AJO channels and external application usage require independent review.',
        ],
        protectedFlowIdBaseline: auth.sandbox !== 'apalmer' ? 'not_applicable'
          : REQUIRED_REL_FLOW_IDS.every((id) => flows.some((flow) => flow.id === id)) ? 'verified' : 'incomplete',
      },
    };
  }

  async function getBatchTarget(auth, target) {
    validateBatchTarget(target);
    const { resource_type: type, resource_id: id } = target;
    if (type === 'mappingSet' || type === 'ajoChannel') {
      return { raw: null, resource: { resource_type: type, resource_id: id, name: '' }, unsupported: true };
    }
    if (type === 'dataset' || type === 'schema') {
      const current = await get(auth, type, id);
      return { ...current, resource: batchResource(type, current.raw, id) };
    }
    const path = type === 'flow' ? `${FLOW}/flows/${encodeURIComponent(id)}`
      : type === 'sourceConnection' ? `${FLOW}/sourceConnections/${encodeURIComponent(id)}`
        : type === 'targetConnection' ? `${FLOW}/targetConnections/${encodeURIComponent(id)}`
          : type === 'baseConnection' || type === 'account'
            ? `${FLOW}/connections/${encodeURIComponent(id)}/`
            : `${REGISTRY}/descriptors/${encodeURIComponent(id)}`;
    const { data, etag } = await request(auth, path, {
      accept: type === 'descriptor' ? 'application/vnd.adobe.xdm-v2+json' : 'application/json',
    });
    const raw = Array.isArray(data?.items) ? data.items.find((item) => inventoryId(type, item) === id)
      : data?.[id] || data;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || inventoryId(type, raw) !== id) {
      throw failure(502, 'Platform resource identity could not be verified.');
    }
    if (raw.sandboxName && raw.sandboxName !== auth.sandbox) {
      throw failure(403, 'Platform resource sandbox does not match the authenticated scope.');
    }
    return { raw, resource: batchResource(type, raw, id), etag };
  }

  function referencesBetween(entries, selected) {
    const selectedIds = new Set(selected.map((target) => target.resource_id));
    const aliases = new Map(selected.map((target) => {
      const schema = target.resource_type === 'schema'
        ? entries.find((entry) => entry.type === 'schema' && entry.id === target.resource_id) : null;
      return [target.resource_id, new Set([
        target.resource_id,
        ...(typeof schema?.raw?.['meta:altId'] === 'string' ? [schema.raw['meta:altId']] : []),
        ...(target.resource_type === 'dataset' ? [
          `@/dataSets/${target.resource_id}`, `/dataSets/${target.resource_id}`,
          `${CATALOG}/${target.resource_id}`, `${BASE}${CATALOG}/${target.resource_id}`,
        ] : []),
      ])];
    }));
    const edges = [];
    const external = [];
    for (const entry of entries) {
      const found = [...selectedIds].filter((id) => id !== entry.id && references(entry.raw, aliases.get(id)));
      if (!found.length) continue;
      const isSelected = selected.some((target) => (target.resource_type === 'account' ? 'baseConnection' : target.resource_type) === entry.type
        && target.resource_id === entry.id);
      for (const referencedId of found) {
        if (isSelected) edges.push({ before: entry.id, after: referencedId, source_type: entry.type });
        else external.push({ source_type: entry.type, source_id: entry.id, referenced_id: referencedId });
      }
    }
    return { edges, external };
  }

  function dependencyOrder(targets, edges) {
    const remaining = new Map(targets.map((target) => [target.resource_id, 0]));
    const outgoing = new Map(targets.map((target) => [target.resource_id, []]));
    for (const edge of edges) {
      if (!remaining.has(edge.before) || !remaining.has(edge.after)) continue;
      outgoing.get(edge.before).push(edge.after);
      remaining.set(edge.after, remaining.get(edge.after) + 1);
    }
    const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id).sort();
    const ordered = [];
    while (ready.length) {
      const id = ready.shift();
      ordered.push(id);
      for (const dependent of outgoing.get(id)) {
        remaining.set(dependent, remaining.get(dependent) - 1);
        if (remaining.get(dependent) === 0) {
          ready.push(dependent);
          ready.sort();
        }
      }
    }
    return { ordered, cyclic: ordered.length !== targets.length };
  }

  async function batchInventory(auth, { targets }) {
    validateBatchTargets(targets);
    const snapshot = await collectBatchInventory(auth);
    const requested = await Promise.all(targets.map((target) => getBatchTarget(auth, target)));
    return {
      sandbox: auth.sandbox,
      resources: requested.map(({ resource, unsupported }) => ({ ...resource, inventory_supported: !unsupported })),
      counts: snapshot.coverage.resources,
      coverage: snapshot.coverage,
    };
  }

  function validateBatchTargets(targets) {
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > MAX_BATCH_TARGETS) {
      throw failure(400, `targets must contain 1-${MAX_BATCH_TARGETS} exact resources.`);
    }
    for (const target of targets) validateBatchTarget(target);
    const identities = targets.map((target) => target.resource_id);
    if (new Set(identities).size !== identities.length) throw failure(400, 'Duplicate target IDs are not allowed, including across resource types.');
  }

  async function plan(auth, { targets }) {
    validateBatchTargets(targets);
    const snapshot = await collectBatchInventory(auth);
    const exact = await Promise.all(targets.map((target) => getBatchTarget(auth, target)));
    const schemaIds = [...new Set(exact.flatMap((current, index) => {
      const type = targets[index].resource_type;
      const id = type === 'dataset' ? current.raw?.schemaRef?.id
        : type === 'descriptor' ? current.raw?.['xdm:sourceSchema'] : null;
      return typeof id === 'string' && id ? [id] : [];
    }))];
    const relatedSchemas = new Map(await Promise.all(schemaIds.map(async (id) => [id, await get(auth, 'schema', id)])));
    const blockers = [];
    const manifest = targets.map((target, index) => {
      const current = exact[index];
      const targetBlockers = [];
      if (current.unsupported) targetBlockers.push('No supported inventory or deletion contract is available for this resource type.');
      else if (!snapshot.entries.some((entry) => entry.id === target.resource_id
          && entry.type === (target.resource_type === 'account' ? 'baseConnection' : target.resource_type))) {
        targetBlockers.push('The exact resource is missing from the complete metadata inventory.');
      }
      const policyBlock = protectedResource(target.resource_type, target.resource_id, current.resource.name, auth.sandbox);
      if (policyBlock) targetBlockers.push(policyBlock);
      if (current.raw && cleanupEnabled(current.raw)) targetBlockers.push('Profile/Identity-enabled resources are protected.');
      if (current.raw && target.resource_type === 'dataset') {
        const schemaId = current.raw.schemaRef?.id;
        if (typeof schemaId !== 'string' || !schemaId) targetBlockers.push('Dataset schema ownership is unresolved.');
        else {
          const schema = snapshot.entries.find((entry) => entry.type === 'schema' && entry.id === schemaId);
          if (!schema) targetBlockers.push('Dataset schema is outside the complete schema inventory.');
          else if (cleanupEnabled(relatedSchemas.get(schemaId).raw)) targetBlockers.push('The dataset schema is enabled for Profile/Identity.');
          else if (protectedResource('schema', schemaId, relatedSchemas.get(schemaId).raw.title, auth.sandbox)) {
            targetBlockers.push('The dataset belongs to a protected schema.');
          }
        }
      }
      if (current.raw && target.resource_type === 'flow' && current.raw.state !== 'disabled') {
        targetBlockers.push('Disable this flow separately and wait for terminal runs before planning deletion; cleanup never pauses or cancels ingestion.');
      }
      if (current.raw && target.resource_type === 'descriptor') {
        const owner = relatedSchemas.get(current.raw['xdm:sourceSchema']);
        if (!owner) targetBlockers.push('Descriptor source schema ownership is unresolved.');
        else if (cleanupEnabled(owner.raw) || protectedResource('schema', owner.raw.$id, owner.raw.title, auth.sandbox)) {
          targetBlockers.push('The descriptor belongs to a protected schema.');
        }
      }
      return {
        ...current.resource,
        state_fingerprint: fingerprint(current.raw || { unsupported: current.unsupported }),
        blockers: targetBlockers,
      };
    });
    const { edges, external } = referencesBetween(snapshot.entries, targets);
    const { ordered, cyclic } = dependencyOrder(targets, edges);
    if (cyclic) blockers.push('Target dependencies contain a cycle; safe ordering cannot be established.');
    if (external.length) blockers.push('Unlisted resources refer to selected targets; silently expanding the requested scope is prohibited.');
    if (targets.some((target) => target.resource_type === 'schema')
        && snapshot.entries.some((entry) => entry.type === 'dataset'
          && (typeof entry.raw.schemaRef?.id !== 'string' || !entry.raw.schemaRef.id))) {
      blockers.push('Dataset schema references are unresolved; schema dependency completeness cannot be established.');
    }
    if (snapshot.coverage.protectedFlowIdBaseline === 'incomplete') {
      blockers.push('The reviewed REL flow-ID baseline is incomplete in the live inventory.');
    }
    for (let index = 0; index < targets.length; index++) {
      if (targets[index].resource_type !== 'flow' || exact[index].raw?.state !== 'disabled' || manifest[index].blockers.length) continue;
      const runs = await listPaged(auth, `${FLOW}/runs`, 'application/json', 'items', {
        property: `flowId==${targets[index].resource_id}`,
      });
      if (runs.some((run) => run.flowId !== targets[index].resource_id
          || (run.sandboxName && run.sandboxName !== auth.sandbox))) {
        throw failure(502, 'Run inventory does not match the exact flow and sandbox.');
      }
      if (runs.some((run) => !['success', 'succeeded', 'failed', 'cancelled', 'canceled'].includes(
        String(run.metrics?.statusSummary?.status || run.state || '').toLowerCase()))) {
        blockers.push(`flow ${targets[index].resource_id}: Active or unrecognized run status remains; wait and create a fresh plan.`);
      }
    }
    for (const item of manifest) {
      for (const reason of item.blockers) blockers.push(`${item.resource_type} ${item.resource_id}: ${reason}`);
    }
    const protectedBaseline = snapshot.entries
      .filter((entry) => protectedResource(entry.type, entry.id, entry.raw?.name || entry.raw?.title || entry.raw?.flowName, auth.sandbox)
        || cleanupEnabled(entry.raw))
      .map((entry) => ({
        resource_type: entry.type, resource_id: entry.id,
        state_fingerprint: fingerprint(protectedMetadata(entry.raw)),
      }))
      .sort((a, b) => `${a.resource_type}:${a.resource_id}`.localeCompare(`${b.resource_type}:${b.resource_id}`));
    const stateFingerprint = fingerprint({
      orgId: auth.orgId, sandbox: auth.sandbox, policyVersion: BATCH_POLICY_VERSION,
      manifest, edges: [...edges].sort((a, b) => `${a.before}:${a.after}`.localeCompare(`${b.before}:${b.after}`)),
      externalReferences: [...external].sort((a, b) => `${a.source_type}:${a.source_id}:${a.referenced_id}`.localeCompare(`${b.source_type}:${b.source_id}:${b.referenced_id}`)),
      protectedBaseline, coverage: snapshot.coverage,
    });
    return {
      status: blockers.length ? 'blocked' : 'ready',
      policy_version: BATCH_POLICY_VERSION,
      sandbox: auth.sandbox,
      expected_count: manifest.length,
      targets: targets.map(({ resource_type, resource_id }) => ({ resource_type, resource_id })),
      manifest,
      dependency_edges: edges,
      external_references: external,
      ordered_resource_ids: ordered,
      blockers: [...new Set(blockers)],
      warnings: [
        'Batch deletion is irreversible. No rollback, cascade, or automatic retry is available.',
        'Only the exact reviewed IDs may be targeted; every required side-effect target must be explicitly reviewed.',
        'Adobe does not document conditional DELETE for these endpoints. Fresh reads and MCP coordination cannot prevent an external writer changing an asset between the final read and DELETE.',
        'Independently clear mapping, AJO, audience, destination and application usage; coverage.complete remains false without that external evidence.',
      ],
      coverage: snapshot.coverage,
      protected_baseline: protectedBaseline,
      state_fingerprint: stateFingerprint,
      mutation_adapters_enabled: MUTATION_ADAPTERS_ENABLED,
    };
  }

  async function revalidatePlan(auth, approvedPlan, completedIds = new Set()) {
    const current = await plan(auth, { targets: approvedPlan.targets.filter((target) => !completedIds.has(target.resource_id)) });
    const blockers = [...current.blockers];
    const sameManifest = current.manifest.every((item) => approvedPlan.manifest.some((approved) => (
      approved.resource_type === item.resource_type && approved.resource_id === item.resource_id
      && approved.state_fingerprint === item.state_fingerprint
    )));
    const expectedEdges = approvedPlan.dependency_edges.filter((edge) => !completedIds.has(edge.before) && !completedIds.has(edge.after));
    const edgeDigest = (edges) => fingerprint([...edges].sort((a, b) => `${a.before}:${a.after}:${a.source_type}`.localeCompare(`${b.before}:${b.after}:${b.source_type}`)));
    if (approvedPlan.policy_version !== BATCH_POLICY_VERSION || !sameManifest
        || fingerprint(current.protected_baseline) !== fingerprint(approvedPlan.protected_baseline)
        || edgeDigest(current.dependency_edges) !== edgeDigest(expectedEdges)) {
      blockers.push('Resource state, dependency coverage, or protected baseline changed after review.');
    }
    return {
      ok: blockers.length === 0,
      blockers: [...new Set(blockers)],
      current_state_fingerprint: current.state_fingerprint,
    };
  }

  function deletePath(target) {
    const id = encodeURIComponent(target.resource_id);
    switch (target.resource_type) {
      case 'dataset': return `${CATALOG}/${id}`;
      case 'schema': return `${REGISTRY}/schemas/${id}`;
      case 'descriptor': return `${REGISTRY}/descriptors/${id}`;
      case 'flow': return `${FLOW}/flows/${id}`;
      case 'sourceConnection': return `${FLOW}/sourceConnections/${id}`;
      case 'targetConnection': return `${FLOW}/targetConnections/${id}`;
      case 'baseConnection':
      case 'account': return `${FLOW}/connections/${id}/`;
      default: throw failure(409, 'No supported DELETE contract exists for this target.');
    }
  }

  async function apply(auth, approvedPlan, store) {
    const completed = new Set();
    const deadline = Math.min(approvedPlan.expiresAtMs, now() + 230_000);
    let issued = 0;
    const finish = (state, detail = {}) => store.finishExecution(approvedPlan.plan_id, state, {
      ...detail, delete_requests_issued: issued,
    });
    const requireTime = () => {
      if (!Number.isFinite(deadline) || now() + 45_000 >= deadline) {
        throw failure(409, 'Execution time or plan expiry limit reached. Verify readback and review a new plan for remaining targets.');
      }
    };
    if (approvedPlan.mutation_adapters_enabled !== true || approvedPlan.policy_version !== BATCH_POLICY_VERSION
        || !Array.isArray(approvedPlan.ordered_resource_ids)
        || approvedPlan.ordered_resource_ids.length !== approvedPlan.targets.length
        || new Set(approvedPlan.ordered_resource_ids).size !== approvedPlan.targets.length
        || approvedPlan.ordered_resource_ids.some((id) => !approvedPlan.targets.some((target) => target.resource_id === id))) {
      return finish('blocked', { blockers: ['This plan predates executable cleanup or has an invalid mutation order. Create a fresh plan.'] });
    }
    for (const id of approvedPlan.ordered_resource_ids) {
      const target = approvedPlan.targets.find((item) => item.resource_id === id);
      if (!target || completed.has(id)) return finish(issued ? 'failed' : 'blocked', { blockers: ['The reviewed mutation order is invalid.'] });
      const identity = `${target.resource_type}:${id}`;
      let intentRecorded = false;
      let attempted = false;
      let acknowledged = false;
      let recordingResult = false;
      try {
        requireTime();
        const check = await revalidatePlan(auth, approvedPlan, completed);
        if (!check.ok) return finish(issued ? 'failed' : 'blocked', { blockers: check.blockers });
        for (const edge of approvedPlan.dependency_edges.filter((edge) => edge.after === id)) {
          if (!completed.has(edge.before)) throw failure(409, 'A reviewed prerequisite has not completed.');
          const dependency = approvedPlan.targets.find((item) => item.resource_id === edge.before);
          let absent = false;
          try { await getBatchTarget(auth, dependency); } catch (error) {
            if (error.status !== 404) throw error;
            absent = true;
          }
          if (!absent) throw failure(409, 'A previously deleted prerequisite is present again; execution stopped.');
        }
        const current = await getBatchTarget(auth, target);
        const reviewed = approvedPlan.manifest.find((item) => item.resource_id === id);
        if (fingerprint(current.raw) !== reviewed.state_fingerprint) throw failure(409, 'Target changed immediately before deletion.');
        requireTime();
        const path = deletePath(target);
        await store.recordItemIntent(approvedPlan.plan_id, identity, {
          ...target, operation: 'DELETE', state_fingerprint: reviewed.state_fingerprint,
        });
        intentRecorded = true;
        requireTime();
        attempted = true;
        issued++;
        const result = await request(auth, path, {
          method: 'DELETE',
          accept: target.resource_type === 'schema' ? 'application/vnd.adobe.xed+json;version=1'
            : target.resource_type === 'descriptor' ? 'application/vnd.adobe.xdm-v2+json' : 'application/json',
        });
        acknowledged = true;
        if (target.resource_type === 'dataset'
          ? result.status !== 200 || !Array.isArray(result.data) || !result.data.includes(`@/dataSets/${id}`)
          : result.status !== 204) {
          throw failure(502, 'Adobe did not acknowledge the exact deletion; verify before any new plan.', { error_code: 'DELETE_ACK_MISMATCH' });
        }
        let absent = false;
        try { await getBatchTarget(auth, target); } catch (error) {
          if (error.status !== 404) throw error;
          absent = true;
        }
        if (!absent) throw failure(409, 'Deletion acknowledged but absence is not yet verified. No retry was attempted.', { error_code: 'DELETE_NOT_VERIFIED' });
        recordingResult = true;
        await store.recordItemResult(approvedPlan.plan_id, identity, {
          status: 'succeeded', http_status: result.status, request_id: result.request_id,
        });
        completed.add(id);
      } catch (error) {
        if (recordingResult) {
          throw failure(500, 'Deletion was verified but its durable result could not be acknowledged. Use verify; do not replay.');
        }
        const uncertain = attempted && (acknowledged || !error.status || error.status >= 500 || error.status === 408);
        const state = uncertain ? 'uncertain' : issued ? 'failed' : 'blocked';
        if (intentRecorded) {
          await store.recordItemResult(approvedPlan.plan_id, identity, {
            status: uncertain ? 'uncertain' : 'failed', http_status: error.status,
            error_code: error.detail?.error_code, request_id: error.detail?.request_id,
          });
        }
        console.error('[platformCleanup] batch stopped', { plan_id: approvedPlan.plan_id, identity, state, status: error.status || null });
        return finish(state, {
          blockers: [error.message],
          safe_error_code: error.detail?.error_code, safe_request_id: error.detail?.request_id,
        });
      }
    }
    const { execution } = await store.getExecution(approvedPlan.plan_id, {
      principalUid: approvedPlan.principalUid, orgId: auth.orgId, sandbox: auth.sandbox,
    });
    const finalReadback = await verify(auth, approvedPlan, execution);
    if (finalReadback.status !== 'verified_absent') {
      return finish('uncertain', { blockers: ['Final target/protected-baseline readback is incomplete or changed. Inspect verify; do not replay.'] });
    }
    return finish('succeeded');
  }

  async function verify(auth, approvedPlan, execution) {
    const results = [];
    for (const target of approvedPlan.targets) {
      let exists = null;
      let readError = null;
      try {
        const current = await getBatchTarget(auth, target);
        if (current.unsupported) readError = 'No verified inventory contract exists for this resource type.';
        else exists = true;
      } catch (error) {
        if (error.status === 404) exists = false;
        else readError = error.message;
      }
      const recordedStatus = execution?.items?.[`${target.resource_type}:${target.resource_id}`]?.status || 'not_attempted';
      const itemStatus = recordedStatus === 'intent_recorded' ? 'uncertain' : recordedStatus;
      results.push({
        resource_type: target.resource_type, resource_id: target.resource_id,
        exists, status: readError ? 'unknown' : itemStatus,
        ...(readError ? { error: readError } : {}),
      });
    }
    const baseline = approvedPlan.protected_baseline;
    let snapshot;
    let inventoryError;
    try {
      snapshot = await collectBatchInventory(auth);
    } catch (error) {
      inventoryError = { status: error.status || 502, message: error.message };
      snapshot = null;
    }
    const baselineResults = (baseline || []).map((item) => {
      const current = snapshot?.entries.find((entry) => entry.type === item.resource_type && entry.id === item.resource_id);
      return {
        resource_type: item.resource_type, resource_id: item.resource_id,
        status: !snapshot ? 'unknown' : !current ? 'missing'
          : fingerprint(protectedMetadata(current.raw)) === item.state_fingerprint ? 'preserved' : 'changed',
      };
    });
    const baselineCoverageKnown = Array.isArray(baseline)
      && ['verified', 'not_applicable'].includes(approvedPlan.coverage?.protectedFlowIdBaseline)
      && ['verified', 'not_applicable'].includes(snapshot?.coverage?.protectedFlowIdBaseline);
    const baselineStatus = baselineResults.some((item) => item.status === 'unknown') ? 'unknown'
      : baselineResults.some((item) => item.status !== 'preserved') ? 'changed'
        : !snapshot ? 'unknown'
        : baselineCoverageKnown ? 'preserved' : 'incomplete';
    return {
      plan_id: approvedPlan.plan_id,
      execution_status: execution?.state || approvedPlan.state,
      status: results.length > 0 && baselineStatus === 'preserved'
        && results.every((item) => item.status === 'succeeded' && item.exists === false)
        ? 'verified_absent'
        : baselineStatus === 'unknown' || results.some((item) => item.status === 'uncertain' || item.status === 'unknown') ? 'uncertain' : 'not_verified',
      results,
      protected_baseline: {
        status: baselineStatus, results: baselineResults, coverage: 'metadata_only',
        ...(inventoryError ? { error: inventoryError } : {}),
        limitation: 'Comparison uses list metadata only; it does not establish full configuration, operational health or downstream output.',
      },
    };
  }

  return { list, audit, remove, batchInventory, plan, revalidatePlan, apply, verify };
}

module.exports = {
  createPlatformCleanupService, validateTarget, validateBatchTarget, fingerprint,
  MAX_BATCH_TARGETS, BATCH_POLICY_VERSION, MUTATION_ADAPTERS_ENABLED, UUID,
};
