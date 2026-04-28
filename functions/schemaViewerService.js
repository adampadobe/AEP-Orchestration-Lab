/**
 * Schema Viewer service — ported from Express server.js for Firebase Cloud Functions.
 * Provides Schema Registry, Catalog, and Audiences helpers used by the Data Viewer page.
 *
 * All public functions accept (token, clientId, orgId, sandbox) instead of calling getAuth().
 */

const SCHEMA_REGISTRY_BASE = 'https://platform.adobe.io/data/foundation/schemaregistry';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';
const AUDIENCES_BASE = 'https://platform.adobe.io/data/core/ups/audiences';
const SEGMENT_JOBS_BASE = 'https://platform.adobe.io/data/core/ups/segment/jobs';
const SEGMENTATION_PREVIEW_BASE = 'https://platform.adobe.io/data/core/ups/preview';

function platformHeaders(token, clientId, orgId, sandbox) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox || 'prod',
  };
}

function apiError(data, res) {
  return (
    (data && (data.message || data.title || data.detail || data.error_description)) ||
    (Array.isArray(data?.errors) && data.errors.map((e) => e?.message || e?.detail).filter(Boolean).join('; ')) ||
    (res && res.statusText) ||
    ''
  );
}

function resolveNextPageUrl(data) {
  const href =
    data?._links?.next?.href ??
    (typeof data?._links?.next === 'string' ? data._links.next : null) ??
    (typeof data?._page?.next === 'string' ? data._page.next : null);
  if (!href) return null;
  return String(href).startsWith('http')
    ? href
    : `https://platform.adobe.io${href.startsWith('/') ? href : `/${href}`}`;
}

// ---------------------------------------------------------------------------
// Schema Registry helpers
// ---------------------------------------------------------------------------

async function fetchSchemaById(token, clientId, orgId, sandbox, schemaId) {
  const encodedId = encodeURIComponent(schemaId);
  const url = `${SCHEMA_REGISTRY_BASE}/tenant/schemas/${encodedId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.adobe.xed-full+json;version=1',
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiError(data, res) || `Schema Registry ${res.status}`);
  return data;
}

async function fetchSchemaSummaryLight(token, clientId, orgId, sandbox, schemaId) {
  const encodedId = encodeURIComponent(schemaId);
  const headers = {
    Accept: 'application/vnd.adobe.xed-id+json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const tryOne = async (container) => {
    const base =
      container === 'global' ? `${SCHEMA_REGISTRY_BASE}/global/schemas` : `${SCHEMA_REGISTRY_BASE}/tenant/schemas`;
    const res = await fetch(`${base}/${encodedId}`, { method: 'GET', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data && typeof data === 'object' ? data : null;
  };
  return (await tryOne('tenant')) || (await tryOne('global'));
}

async function fetchSchemaSummariesLightBatched(token, clientId, orgId, sandbox, schemaIds, concurrency = 8) {
  const unique = [...new Set((schemaIds || []).filter((id) => typeof id === 'string' && id.trim()))];
  const out = [];
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= unique.length) break;
      try {
        const summary = await fetchSchemaSummaryLight(token, clientId, orgId, sandbox, unique[i]);
        if (summary && schemaSummaryKey(summary)) out.push(summary);
      } catch { /* skip */ }
    }
  }
  const n = Math.min(concurrency, Math.max(1, unique.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function paginateSchemaRegistryList(initialUrl, headers) {
  const aggregated = [];
  let url = initialUrl;
  for (let page = 0; page < 100; page++) {
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(apiError(data, res) || `Schema list ${res.status}`);
    const batch = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];
    aggregated.push(...batch);
    const nextHref = resolveNextPageUrl(data);
    if (!nextHref) break;
    url = nextHref;
  }
  return aggregated;
}

async function fetchTenantSchemasPostmanList(token, clientId, orgId, sandbox, startPrefix = '') {
  const headers = {
    Accept: 'application/vnd.adobe.xdm+json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const qs = new URLSearchParams({ orderby: 'title' });
  const sp = (startPrefix && String(startPrefix).trim()) || '';
  if (sp) qs.set('start', sp);
  let url = `${SCHEMA_REGISTRY_BASE}/tenant/schemas?${qs.toString()}`;
  const aggregated = [];
  for (let page = 0; page < 100; page++) {
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(apiError(data, res) || `Schema Registry tenant/schemas ${res.status}`);
    const batch = Array.isArray(data.results) ? data.results : [];
    aggregated.push(...batch);
    const nextHref = resolveNextPageUrl(data);
    if (!nextHref) break;
    url = nextHref;
  }
  return { sandboxName: sandbox, rawList: aggregated };
}

function schemaSummaryKey(s) {
  return (s && (s.$id || s['$id'] || s.id || s['@id'] || s['meta:altId'])) || '';
}

function mergeTenantAndGlobalSchemaSummaries(tenantList, globalList) {
  const byId = new Map();
  for (const item of globalList || []) {
    const k = schemaSummaryKey(item);
    if (k) byId.set(k, item);
  }
  for (const item of tenantList || []) {
    const k = schemaSummaryKey(item);
    if (k) byId.set(k, item);
  }
  return [...byId.values()];
}

function isDatasetAdhocSchemaNoise(s) {
  if (!s || typeof s !== 'object') return false;
  const ext = s['meta:extends'];
  if (Array.isArray(ext)) {
    for (const u of ext) {
      if (typeof u === 'string' && (u.includes('xdm/data/adhoc') || u.includes('adhoc-v2'))) return true;
    }
  }
  return false;
}

async function fetchRegistryComposedSchemaSummaries(token, clientId, orgId, sandbox) {
  const headers = {
    Accept: 'application/vnd.adobe.xed-id+json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  let useMetaClassFilter = true;
  let merged = [];
  for (;;) {
    const qs = useMetaClassFilter ? 'orderby=title&property=meta%3Aclass' : 'orderby=title';
    let tenantAgg = [];
    let globalAgg = [];
    let tenantErr = null;
    try {
      tenantAgg = await paginateSchemaRegistryList(`${SCHEMA_REGISTRY_BASE}/tenant/schemas?${qs}`, headers);
    } catch (e) { tenantErr = e; }
    try {
      globalAgg = await paginateSchemaRegistryList(`${SCHEMA_REGISTRY_BASE}/global/schemas?${qs}`, headers);
    } catch { globalAgg = []; }
    if (tenantErr) {
      if (useMetaClassFilter) { useMetaClassFilter = false; continue; }
      throw tenantErr;
    }
    merged = mergeTenantAndGlobalSchemaSummaries(tenantAgg, globalAgg);
    break;
  }
  return { sandboxName: sandbox, schemas: merged.filter((s) => !isDatasetAdhocSchemaNoise(s)) };
}

function normalizeSchemaIdForDatasetMatch(id) {
  if (id == null || typeof id !== 'string') return '';
  return id.replace(/;version=\d+$/i, '').trim();
}

function pickSchemaRegistryListTitle(s) {
  if (!s || typeof s !== 'object') return '';
  if (typeof s.title === 'string' && s.title.trim()) return s.title.trim();
  const mt = s['meta:title'];
  if (typeof mt === 'string' && mt.trim()) return mt.trim();
  const fromLabels = pickTitleFromI18nLabels(s.labels);
  if (fromLabels) return fromLabels;
  return '';
}

function pickTitleFromI18nLabels(labels) {
  if (!labels || typeof labels !== 'object') return '';
  const prefer = ['en-US', 'en-us', 'en', 'en_US', 'en-GB'];
  for (const loc of prefer) {
    if (!Object.prototype.hasOwnProperty.call(labels, loc)) continue;
    const block = labels[loc];
    if (typeof block === 'string' && block.trim()) return block.trim();
    if (block && typeof block === 'object' && typeof block.title === 'string' && block.title.trim()) return block.title.trim();
  }
  for (const loc of Object.keys(labels)) {
    const block = labels[loc];
    if (typeof block === 'string' && block.trim()) return block.trim();
    if (block && typeof block === 'object' && typeof block.title === 'string' && block.title.trim()) return block.title.trim();
  }
  return '';
}

function titleLooksLikeDatasetAdhocNoise(normalizedTitle) {
  const t = (normalizedTitle || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ').trim();
  if (!t) return false;
  if (/^xdm schema for dataset\b/i.test(t)) return true;
  if (/^adhoc\b/i.test(t)) return true;
  if (/Random identifier:/i.test(t)) return true;
  if (/cjm_qsaccel|qsaccel|\.cjm_reporting/i.test(t)) return true;
  return false;
}

async function fetchComposedSchemasListForSandbox(token, clientId, orgId, sandbox, catalogInfoPreloaded = null) {
  let catalogInfo = catalogInfoPreloaded;
  if (!catalogInfo) {
    try { catalogInfo = await fetchCatalogDatasetSchemaInfo(token, clientId, orgId, sandbox); } catch { catalogInfo = null; }
  }
  const { schemas: registryFiltered } = await fetchRegistryComposedSchemaSummaries(token, clientId, orgId, sandbox);

  if (!catalogInfo || catalogInfo.canonicalIdByNorm.size === 0) {
    const sorted = [...registryFiltered].sort((a, b) => {
      const ta = pickSchemaRegistryListTitle(a) || schemaSummaryKey(a);
      const tb = pickSchemaRegistryListTitle(b) || schemaSummaryKey(b);
      return ta.localeCompare(tb, undefined, { sensitivity: 'base' });
    });
    return { sandboxName: sandbox, schemas: sorted, schemaListSource: 'registry', catalogLightGetMisses: 0 };
  }

  const canonicalIds = [...new Set(catalogInfo.canonicalIdByNorm.values())];
  const fromCatalogRaw = await fetchSchemaSummariesLightBatched(token, clientId, orgId, sandbox, canonicalIds, 8);
  const fromCatalog = fromCatalogRaw.filter((s) => !isDatasetAdhocSchemaNoise(s));

  const resolvedNorm = new Set(fromCatalog.map((s) => normalizeSchemaIdForDatasetMatch(schemaSummaryKey(s))).filter(Boolean));
  let catalogLightGetMisses = 0;
  for (const [norm, canonId] of catalogInfo.canonicalIdByNorm) {
    if (!norm || !canonId || resolvedNorm.has(norm)) continue;
    const dsName = typeof catalogInfo.firstDatasetNameByNorm?.get === 'function' ? catalogInfo.firstDatasetNameByNorm.get(norm) : '';
    let displayTitle = (typeof dsName === 'string' && dsName.trim()) || canonId;
    if (titleLooksLikeDatasetAdhocNoise(displayTitle)) displayTitle = canonId;
    const stub = { $id: canonId, id: canonId, title: displayTitle };
    if (isDatasetAdhocSchemaNoise(stub)) continue;
    fromCatalog.push(stub);
    resolvedNorm.add(norm);
    catalogLightGetMisses += 1;
  }

  const catNorm = new Set(fromCatalog.map((s) => normalizeSchemaIdForDatasetMatch(schemaSummaryKey(s))).filter(Boolean));
  const fromRegistryOnly = registryFiltered.filter((s) => {
    const k = normalizeSchemaIdForDatasetMatch(schemaSummaryKey(s));
    return k && !catNorm.has(k);
  });
  const merged = [...fromCatalog, ...fromRegistryOnly];
  merged.sort((a, b) => {
    const ta = pickSchemaRegistryListTitle(a) || schemaSummaryKey(a);
    const tb = pickSchemaRegistryListTitle(b) || schemaSummaryKey(b);
    return ta.localeCompare(tb, undefined, { sensitivity: 'base' });
  });
  return { sandboxName: sandbox, schemas: merged, schemaListSource: 'catalog+registry', catalogLightGetMisses };
}

// ---------------------------------------------------------------------------
// Schema mapping helpers (used by route handlers)
// ---------------------------------------------------------------------------

function formatSchemaClassLabel(classUri) {
  if (!classUri || typeof classUri !== 'string') return '\u2014';
  const u = classUri.toLowerCase();
  if (u.includes('context/profile') || u.includes('individual-profile')) return 'XDM Individual Profile';
  if (u.includes('context/experienceevent') || u.includes('experienceevent')) return 'XDM ExperienceEvent';
  const seg = classUri.split('/').filter(Boolean).pop() || classUri;
  return seg.replace(/([a-z])([A-Z])/g, '$1 $2') || '\u2014';
}

function inferSchemaBehavior(classUri) {
  if (!classUri || typeof classUri !== 'string') return '\u2014';
  const u = classUri.toLowerCase();
  if (u.includes('experienceevent') || u.includes('time-series')) return 'Time-series';
  return 'Record';
}

function inferSchemaTypeLabel(schemaId, classUri) {
  const id = (schemaId || '').toLowerCase();
  const cls = (classUri || '').toLowerCase();
  if (cls.startsWith('https://ns.adobe.com/xdm/') || id.includes('https://ns.adobe.com/xdm/')) return 'Standard';
  return 'Custom';
}

function classifySchemaOverviewKind(metaClass) {
  if (!metaClass || typeof metaClass !== 'string') return 'other';
  const u = metaClass.toLowerCase();
  if (u.includes('experienceevent') || u.includes('time-series')) return 'event';
  if (u.includes('context/profile') || u.includes('individual-profile')) return 'profile';
  return 'other';
}

function registryMetadataLastModified(registryMeta) {
  if (!registryMeta || typeof registryMeta !== 'object') return null;
  const raw = registryMeta['repo:lastModifiedDate'];
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) { const n = parseInt(trimmed, 10); if (Number.isFinite(n)) return n; }
    const d = Date.parse(trimmed);
    if (!Number.isNaN(d)) return d;
  }
  return null;
}

function resolveDatasetCountForSchema(countsMap, id, metaAltId) {
  if (!countsMap || !id) return 0;
  const keys = [normalizeSchemaIdForDatasetMatch(id), id].filter(Boolean);
  for (const k of [...new Set(keys)]) {
    if (countsMap.has(k)) return countsMap.get(k);
  }
  if (metaAltId && typeof metaAltId === 'string' && countsMap.has(metaAltId)) return countsMap.get(metaAltId);
  return 0;
}

function mapSchemaToRow(s, datasetCounts) {
  const id = (s && (s.$id || s['$id'] || s.id || s['@id'] || s['meta:altId'])) || '';
  const metaAltId = s && s['meta:altId'];
  const title = pickSchemaRegistryListTitle(s) || id;
  const metaClass = (s && s['meta:class']) || '';
  const regMeta = s && s['meta:registryMetadata'];
  const lastModifiedMs = registryMetadataLastModified(regMeta);
  const datasetCount = datasetCounts != null ? resolveDatasetCountForSchema(datasetCounts, id, metaAltId) : undefined;
  return {
    id, title,
    version: s && s.version,
    metaAltId,
    metaClass: metaClass || undefined,
    classLabel: formatSchemaClassLabel(metaClass),
    behavior: metaClass ? inferSchemaBehavior(metaClass) : '\u2014',
    typeLabel: inferSchemaTypeLabel(id, metaClass),
    lastModifiedMs: lastModifiedMs != null ? lastModifiedMs : undefined,
    datasetCount,
  };
}

// ---------------------------------------------------------------------------
// Catalog helpers
// ---------------------------------------------------------------------------

function forEachCatalogDataSetObject(data, fn) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data.children)) {
    data.children.forEach((obj, i) => {
      if (!obj || typeof obj !== 'object') return;
      const id = (typeof obj.id === 'string' && obj.id) || (typeof obj['@id'] === 'string' && obj['@id']) || `child-${i}`;
      fn(id, obj);
    });
    return;
  }
  if (Array.isArray(data.results)) {
    data.results.forEach((obj, i) => {
      if (!obj || typeof obj !== 'object') return;
      const id = (typeof obj.id === 'string' && obj.id) || (typeof obj['@id'] === 'string' && obj['@id']) || `result-${i}`;
      fn(id, obj);
    });
    return;
  }
  for (const [key, obj] of Object.entries(data)) {
    if (key.startsWith('_')) continue;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    fn(key, obj);
  }
}

async function paginateCatalogDataSets(token, clientId, orgId, sandbox, propertiesCsv) {
  const headers = platformHeaders(token, clientId, orgId, sandbox);
  const pages = [];
  const propsQ = encodeURIComponent(propertiesCsv);
  const LIMIT = 100;
  let offset = 0;
  for (let page = 0; page < 500; page++) {
    const url = `${CATALOG_BASE}/dataSets?limit=${LIMIT}&start=${offset}&properties=${propsQ}`;
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(apiError(data, res) || `Catalog dataSets ${res.status}`);
    pages.push(data);
    const nextHref = resolveNextPageUrl(data);
    if (nextHref) { offset = -1; break; }
    const datasetKeys = Object.keys(data).filter((k) => !k.startsWith('_'));
    if (datasetKeys.length < LIMIT) break;
    offset += datasetKeys.length;
  }
  return pages;
}

async function fetchCatalogDatasetSchemaInfo(token, clientId, orgId, sandbox) {
  const pages = await paginateCatalogDataSets(token, clientId, orgId, sandbox, 'schemaRef,name');
  const counts = new Map();
  const canonicalIdByNorm = new Map();
  const firstDatasetNameByNorm = new Map();
  for (const data of pages) {
    forEachCatalogDataSetObject(data, (_key, obj) => {
      const ref = obj.schemaRef;
      if (!ref || typeof ref !== 'object') return;
      const sid = ref.id || ref.$id || ref['@id'];
      if (typeof sid === 'string' && sid.trim()) {
        const trimmed = sid.trim();
        const norm = normalizeSchemaIdForDatasetMatch(trimmed);
        counts.set(norm, (counts.get(norm) || 0) + 1);
        if (!canonicalIdByNorm.has(norm)) canonicalIdByNorm.set(norm, trimmed);
        if (!firstDatasetNameByNorm.has(norm) && typeof obj.name === 'string' && obj.name.trim()) {
          firstDatasetNameByNorm.set(norm, obj.name.trim());
        }
      }
    });
  }
  return { counts, canonicalIdByNorm, firstDatasetNameByNorm };
}

function formatDatasetTagsLabel(tags) {
  if (tags == null) return '';
  if (typeof tags === 'string') return tags.trim();
  if (Array.isArray(tags)) return tags.map((t) => (typeof t === 'string' ? t : t && (t.name || t.id))).filter(Boolean).join(', ');
  if (typeof tags === 'object') {
    const parts = [];
    for (const [k, v] of Object.entries(tags)) {
      if (v === true) parts.push(k);
      else if (Array.isArray(v) && v.length) parts.push(`${k}: ${v.join(', ')}`);
      else if (v && typeof v === 'object') parts.push(k);
      else if (v != null && v !== false) parts.push(`${k}: ${String(v)}`);
    }
    return parts.slice(0, 8).join(' \u00B7 ') + (parts.length > 8 ? ' \u2026' : '');
  }
  return '';
}

async function fetchCatalogDatasetsList(token, clientId, orgId, sandbox) {
  let pages;
  try {
    pages = await paginateCatalogDataSets(token, clientId, orgId, sandbox, 'schemaRef,name,created,updated');
  } catch {
    pages = await paginateCatalogDataSets(token, clientId, orgId, sandbox, 'schemaRef,name');
  }
  const datasets = [];
  for (const data of pages) {
    forEachCatalogDataSetObject(data, (key, obj) => {
      const ref = obj.schemaRef;
      let schemaId = '';
      if (ref && typeof ref === 'object') {
        const sid = ref.id || ref.$id || ref['@id'];
        if (typeof sid === 'string') schemaId = sid.trim();
      }
      const id = (typeof obj.id === 'string' && obj.id) || (typeof obj['@id'] === 'string' && obj['@id']) || key;
      datasets.push({
        id, name: typeof obj.name === 'string' ? obj.name : '',
        description: typeof obj.description === 'string' ? obj.description : '',
        schemaId,
        created: obj.created ?? null, updated: obj.updated ?? null,
        tagsLabel: formatDatasetTagsLabel(obj.tags),
        dataLakeStorage: null, dataLakeRetention: null, profileStorage: null, profileRetention: null,
        lastBatchStatus: 'none', lastBatchUpdated: null,
      });
    });
  }
  return { sandboxName: sandbox, datasets };
}

async function enrichDatasetsWithSchemaTitles(token, clientId, orgId, sandbox, datasets) {
  const ids = [...new Set(datasets.map((d) => d.schemaId).filter((x) => typeof x === 'string' && x.trim()))];
  if (ids.length === 0) return datasets;
  const summaries = await fetchSchemaSummariesLightBatched(token, clientId, orgId, sandbox, ids, 8);
  const titleByNorm = new Map();
  for (const s of summaries) {
    const key = schemaSummaryKey(s);
    if (!key) continue;
    const title = pickSchemaRegistryListTitle(s) || key;
    titleByNorm.set(normalizeSchemaIdForDatasetMatch(key), title);
    titleByNorm.set(key, title);
  }
  return datasets.map((d) => {
    const sid = d.schemaId;
    const st = sid && (titleByNorm.get(normalizeSchemaIdForDatasetMatch(sid)) || titleByNorm.get(sid) || '');
    return { ...d, schemaTitle: st || '' };
  });
}

function getByPath(obj, path) {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = String(path || '').split('.');
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function pickFirstString(obj, paths) {
  for (const path of paths || []) {
    const v = getByPath(obj, path);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickFirstNumber(obj, paths) {
  for (const path of paths || []) {
    const v = getByPath(obj, path);
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickFirstTimestamp(obj, paths) {
  for (const path of paths || []) {
    const raw = getByPath(obj, path);
    if (raw == null || raw === '') continue;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof raw === 'string') {
      const direct = Date.parse(raw);
      if (!Number.isNaN(direct)) return new Date(direct).toISOString();
      if (/^\d+$/.test(raw.trim())) {
        const n = Number(raw.trim());
        if (Number.isFinite(n)) {
          const d = new Date(n);
          if (!Number.isNaN(d.getTime())) return d.toISOString();
        }
      }
    }
  }
  return null;
}

function normalizeBatchStatus(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'unknown';
  if (v.includes('succ')) return 'success';
  if (v.includes('fail') || v.includes('error')) return 'failed';
  if (v.includes('partial') || v.includes('warn')) return 'partial';
  if (v.includes('run') || v.includes('progress') || v.includes('queue') || v.includes('pend')) return 'running';
  return v;
}

function extractDatasetIdFromBatch(obj) {
  const direct = pickFirstString(obj, [
    'dataSetId',
    'datasetId',
    'dataset.id',
    'dataSet.id',
    'inputDatasetId',
    'related.datasetId',
    'metrics.datasetId',
  ]);
  if (direct) return direct;
  const rel = getByPath(obj, 'relatedObjects');
  if (Array.isArray(rel)) {
    for (const item of rel) {
      if (!item || typeof item !== 'object') continue;
      const type = String(item.type || item.objectType || '').toLowerCase();
      if (!type.includes('dataset')) continue;
      const id = item.id || item.objectId || item.dataSetId || item.datasetId;
      if (typeof id === 'string' && id.trim()) return id.trim();
    }
  }
  return '';
}

function extractDataflowRunIdFromBatch(obj) {
  const direct = pickFirstString(obj, [
    'dataflowRunId',
    'flowRunId',
    'runId',
    'related.runId',
    'metrics.dataflowRunId',
    'metrics.flowRunId',
    'metrics.runId',
    'job.runId',
  ]);
  if (direct) return direct;
  const rel = getByPath(obj, 'relatedObjects');
  if (Array.isArray(rel)) {
    for (const item of rel) {
      if (!item || typeof item !== 'object') continue;
      const type = String(item.type || item.objectType || '').toLowerCase();
      if (!type.includes('flow') && !type.includes('run')) continue;
      const id = item.id || item.objectId || item.runId || item.dataflowRunId;
      if (typeof id === 'string' && id.trim()) return id.trim();
    }
  }
  return '';
}

function mapCatalogBatchRow(id, obj) {
  const batchId =
    (typeof obj.id === 'string' && obj.id.trim()) ||
    (typeof obj['@id'] === 'string' && obj['@id'].trim()) ||
    String(id || '').trim();
  const statusRaw = pickFirstString(obj, [
    'status',
    'state',
    'statusCode',
    'metrics.status',
    'metrics.state',
    'metrics.statusSummary.status',
    'summary.status',
  ]);
  const ingestedAt = pickFirstTimestamp(obj, [
    'completed',
    'completedAt',
    'completedAtUTC',
    'finishedAt',
    'updated',
    'updatedAt',
    'metrics.durationSummary.completedAtUTC',
    'metrics.durationSummary.startedAtUTC',
    'created',
    'createdAt',
    'submittedAt',
  ]);
  const recordsIngested = pickFirstNumber(obj, [
    'recordsIngested',
    'outputRecordCount',
    'recordCount',
    'summary.recordsIngested',
    'summary.outputRecordCount',
    'stats.recordsIngested',
    'metrics.outputRecordCount',
    'metrics.recordSummary.outputRecordCount',
    'metrics.recordSummary.inputRecordCount',
    'metrics.ingestionSummary.recordsIngested',
  ]);
  const recordsFailed = pickFirstNumber(obj, [
    'recordsFailed',
    'failedRecordCount',
    'summary.recordsFailed',
    'stats.recordsFailed',
    'metrics.failedRecordCount',
    'metrics.recordSummary.failedRecordCount',
    'metrics.ingestionSummary.recordsFailed',
  ]);
  const newProfileFragments = pickFirstNumber(obj, [
    'newProfileFragments',
    'metrics.newProfileFragments',
    'summary.newProfileFragments',
    'stats.newProfileFragments',
  ]);
  const existingProfileFragments = pickFirstNumber(obj, [
    'existingProfileFragments',
    'metrics.existingProfileFragments',
    'summary.existingProfileFragments',
    'stats.existingProfileFragments',
  ]);
  return {
    batchId,
    datasetId: extractDatasetIdFromBatch(obj),
    dataflowRunId: extractDataflowRunIdFromBatch(obj) || null,
    ingestedAt,
    recordsIngested,
    recordsFailed,
    newProfileFragments,
    existingProfileFragments,
    status: normalizeBatchStatus(statusRaw),
  };
}

function forEachCatalogBatchObject(data, fn) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data.children)) {
    data.children.forEach((obj, i) => {
      if (!obj || typeof obj !== 'object') return;
      const id = (typeof obj.id === 'string' && obj.id) || (typeof obj['@id'] === 'string' && obj['@id']) || `child-${i}`;
      fn(id, obj);
    });
    return;
  }
  if (Array.isArray(data.results)) {
    data.results.forEach((obj, i) => {
      if (!obj || typeof obj !== 'object') return;
      const id = (typeof obj.id === 'string' && obj.id) || (typeof obj['@id'] === 'string' && obj['@id']) || `result-${i}`;
      fn(id, obj);
    });
    return;
  }
  for (const [key, obj] of Object.entries(data)) {
    if (key.startsWith('_')) continue;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    fn(key, obj);
  }
}

async function fetchCatalogBatchesByDataset(token, clientId, orgId, sandbox, datasetId, limit = 25) {
  const headers = platformHeaders(token, clientId, orgId, sandbox);
  const target = String(datasetId || '').trim();
  if (!target) throw new Error('Missing datasetId');

  const props = [
    'dataSetId',
    'datasetId',
    'status',
    'state',
    'created',
    'updated',
    'completed',
    'metrics',
    'stats',
    'summary',
    'runId',
    'flowRunId',
    'dataflowRunId',
    'relatedObjects',
  ].join(',');

  let batches = [];

  const collectRows = (data) => {
    forEachCatalogBatchObject(data, (id, obj) => {
      batches.push(mapCatalogBatchRow(id, obj));
    });
  };

  try {
    const qs = new URLSearchParams({
      limit: String(Math.max(1, Math.min(200, Number(limit) || 25))),
      start: '0',
      properties: props,
      property: `dataSetId==${target}`,
    });
    const url = `${CATALOG_BASE}/batches?${qs.toString()}`;
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json().catch(() => ({}));
    if (res.ok) collectRows(data);
  } catch {
    /* fall through to unfiltered fallback */
  }

  if (batches.length === 0) {
    // Fallback: list recent batches and filter by dataset id locally.
    const pageLimit = 100;
    let offset = 0;
    for (let page = 0; page < 4; page++) {
      const qs = new URLSearchParams({
        limit: String(pageLimit),
        start: String(offset),
        properties: props,
      });
      const url = `${CATALOG_BASE}/batches?${qs.toString()}`;
      const res = await fetch(url, { method: 'GET', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) break;
      const before = batches.length;
      collectRows(data);
      const after = batches.length;
      const nextHref = resolveNextPageUrl(data);
      if (!nextHref) break;
      if (after - before < pageLimit) break;
      offset += pageLimit;
    }
  }

  const targetNorm = normalizeSchemaIdForDatasetMatch(target);
  const filtered = batches.filter((row) => {
    const ds = String(row.datasetId || '').trim();
    if (!ds) return false;
    const norm = normalizeSchemaIdForDatasetMatch(ds);
    return ds === target || norm === targetNorm;
  });

  filtered.sort((a, b) => {
    const ta = a.ingestedAt ? Date.parse(a.ingestedAt) : 0;
    const tb = b.ingestedAt ? Date.parse(b.ingestedAt) : 0;
    if (tb !== ta) return tb - ta;
    return String(b.batchId || '').localeCompare(String(a.batchId || ''));
  });

  const finalRows = filtered.slice(0, Math.max(1, Math.min(200, Number(limit) || 25)));
  return {
    sandboxName: sandbox,
    datasetId: target,
    rows: finalRows,
    metricsSource: {
      newProfileFragments: 'unavailable',
      existingProfileFragments: 'unavailable',
    },
  };
}

// ---------------------------------------------------------------------------
// Audiences helpers
// ---------------------------------------------------------------------------

function normalizeAudienceTimestampMs(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n > 1e15) return Math.floor(n / 1000);
  if (n > 1e12) return Math.floor(n);
  return Math.floor(n * 1000);
}

function formatAudienceOriginLabel(originName) {
  if (!originName || typeof originName !== 'string') return '\u2014';
  const map = {
    REAL_TIME_CUSTOMER_PROFILE: 'Segmentation service',
    AUDIENCE_ORCHESTRATION: 'Audience orchestration',
    AUDIENCE_MANAGER: 'Audience Manager',
    CUSTOM_UPLOAD: 'Custom upload',
  };
  return map[originName] || originName.replace(/_/g, ' ');
}

function pickAudienceProfileCount(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const candidates = [
    raw.profileCount, raw.totalProfiles, raw.qualifiedProfiles,
    raw.metrics && raw.metrics.totalProfiles, raw.metrics && raw.metrics.profileCount,
    raw.segmentState && raw.segmentState.totalProfiles,
    raw.cjmAudienceDetails && raw.cjmAudienceDetails.profileCount,
  ];
  for (const c of candidates) {
    if (c != null && Number.isFinite(Number(c))) return Number(c);
  }
  return null;
}

function mapAudienceApiRow(raw) {
  return {
    id: (raw.id || raw.audienceId || '').trim(),
    name: typeof raw.name === 'string' ? raw.name : '',
    profileCount: pickAudienceProfileCount(raw),
    originName: typeof raw.originName === 'string' ? raw.originName : '',
    originLabel: formatAudienceOriginLabel(raw.originName),
    creationMs: normalizeAudienceTimestampMs(raw.creationTime ?? raw.createEpoch),
    updateMs: normalizeAudienceTimestampMs(raw.updateTime ?? raw.updateEpoch),
    tagsLabel: Array.isArray(raw.labels) ? raw.labels.join(', ') : '',
    evaluationInfo: raw.evaluationInfo && typeof raw.evaluationInfo === 'object' ? raw.evaluationInfo : null,
    audienceType: typeof raw.type === 'string' ? raw.type : '',
  };
}

async function fetchSegmentJobCounts(headers) {
  try {
    const url = `${SEGMENT_JOBS_BASE}?limit=1&status=SUCCEEDED&sort=updateTime:desc`;
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) return {};
    const data = await res.json().catch(() => ({}));
    const children = Array.isArray(data.children) ? data.children : [];
    if (children.length === 0) return {};
    const job = children[0];
    const counters = (job.metrics && (job.metrics.segmentedProfileCounter || job.metrics.segmentProfileCounter)) || {};
    const statusCounters = (job.metrics && (job.metrics.segmentedProfileByStatusCounter || job.metrics.segmentProfileByStatusCounter)) || {};
    const map = {};
    for (const [segId, val] of Object.entries(counters)) {
      if (val != null && Number.isFinite(Number(val))) {
        map[segId] = Number(val);
      }
    }
    for (const [segId, statusObj] of Object.entries(statusCounters)) {
      if (map[segId] != null) continue;
      if (statusObj && typeof statusObj === 'object') {
        const realized = Number(statusObj.realized || statusObj.existing || 0);
        if (Number.isFinite(realized) && realized > 0) map[segId] = realized;
      }
    }
    return map;
  } catch {
    return {};
  }
}

async function fetchAudiencesList(token, clientId, orgId, sandbox) {
  const headers = platformHeaders(token, clientId, orgId, sandbox);
  const limit = 100;
  const all = [];
  let totalPages = null;
  for (let page = 0, guard = 0; guard < 500; guard++) {
    const url = `${AUDIENCES_BASE}?limit=${limit}&start=${page}&sort=name:asc`;
    const res = await fetch(url, { method: 'GET', headers });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!res.ok) throw new Error(apiError(data, res) || `Audiences API ${res.status}`);
    const children = Array.isArray(data.children) ? data.children : [];
    if (page === 0 && data._page && data._page.totalPages != null) {
      const tp = Number(data._page.totalPages);
      if (Number.isFinite(tp) && tp > 0) totalPages = Math.min(tp, 500);
    }
    for (const raw of children) all.push(mapAudienceApiRow(raw));
    if (children.length === 0) break;
    if (totalPages != null) { page += 1; if (page >= totalPages) break; }
    else if (children.length < limit) break;
    else page += 1;
  }
  const jobCounts = await fetchSegmentJobCounts(headers);
  for (const row of all) {
    if (row.profileCount == null && row.id && jobCounts[row.id] != null) {
      row.profileCount = jobCounts[row.id];
    }
  }
  return { sandboxName: sandbox, audiences: all };
}

function flattenPreviewResults(results) {
  const out = [];
  if (!Array.isArray(results)) return out;
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.objectId === 'string' && typeof item._href === 'string') {
      out.push({ objectId: item.objectId, profileHref: item._href });
      continue;
    }
    for (const [objectId, node] of Object.entries(item)) {
      if (node && typeof node === 'object' && typeof node._href === 'string') {
        out.push({ objectId, profileHref: node._href });
      }
    }
  }
  const seen = new Set();
  return out.filter((r) => { if (!r.objectId || seen.has(r.objectId)) return false; seen.add(r.objectId); return true; });
}

async function fetchAudienceExpression(token, clientId, orgId, sandbox, audienceId) {
  const id = String(audienceId || '').trim();
  if (!id) throw new Error('Missing audience id');
  const url = `${AUDIENCES_BASE}/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'GET', headers: platformHeaders(token, clientId, orgId, sandbox) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiError(data, res) || `Audiences API ${res.status}`);
  const expr = data.expression;
  const pql = expr && typeof expr.value === 'string' ? expr.value.trim() : '';
  if (!pql) throw new Error('This audience has no PQL expression to preview (may be external or rule-based only).');
  const model = data.schema && typeof data.schema.name === 'string' && data.schema.name.trim()
    ? data.schema.name.trim() : '_xdm.context.profile';
  const name = typeof data.name === 'string' ? data.name : id;
  return { pql, model, name, sandboxName: sandbox };
}

async function runAudiencePreviewSample(token, clientId, orgId, sandbox, audienceId) {
  const { pql, model, name } = await fetchAudienceExpression(token, clientId, orgId, sandbox, audienceId);
  const headersJson = { ...platformHeaders(token, clientId, orgId, sandbox), 'Content-Type': 'application/json' };
  const headersGet = platformHeaders(token, clientId, orgId, sandbox);

  const postRes = await fetch(SEGMENTATION_PREVIEW_BASE, {
    method: 'POST', headers: headersJson,
    body: JSON.stringify({ predicateExpression: pql, predicateType: 'pql/text', predicateModel: model, graphType: 'pdg' }),
  });
  const postData = await postRes.json().catch(() => ({}));
  if (!postRes.ok) throw new Error(apiError(postData, postRes) || `Preview create ${postRes.status}`);
  const previewId = postData.previewId;
  if (!previewId || typeof previewId !== 'string') throw new Error('No previewId returned from Segmentation preview API.');

  const deadline = Date.now() + 90000;
  let lastState = '';
  while (Date.now() < deadline) {
    const getUrl = `${SEGMENTATION_PREVIEW_BASE}/${encodeURIComponent(previewId)}?limit=100`;
    const getRes = await fetch(getUrl, { method: 'GET', headers: headersGet });
    const getData = await getRes.json().catch(() => ({}));
    if (!getRes.ok) throw new Error(apiError(getData, getRes) || `Preview poll ${getRes.status}`);
    lastState = getData.state || '';
    if (lastState === 'RESULT_READY') {
      const members = flattenPreviewResults(getData.results);
      return {
        audienceId: String(audienceId).trim(), audienceName: name, sandbox, previewId, state: lastState,
        memberCount: members.length, members: members.slice(0, 100),
        note: 'Sample rows from Segmentation preview API (not a full audience export). Profile links are Adobe API URLs.',
      };
    }
    if (lastState === 'FAILED' || lastState === 'CANCELLED') throw new Error(`Preview job ended: ${lastState}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Preview timed out waiting for results (last state: ${lastState || 'unknown'}).`);
}

module.exports = {
  fetchSchemaById,
  fetchSchemaSummariesLightBatched,
  fetchComposedSchemasListForSandbox,
  fetchCatalogDatasetSchemaInfo,
  fetchCatalogDatasetsList,
  enrichDatasetsWithSchemaTitles,
  fetchCatalogBatchesByDataset,
  fetchAudiencesList,
  runAudiencePreviewSample,
  classifySchemaOverviewKind,
  mapSchemaToRow,
  schemaSummaryKey,
  resolveDatasetCountForSchema,
  pickSchemaRegistryListTitle,
};
