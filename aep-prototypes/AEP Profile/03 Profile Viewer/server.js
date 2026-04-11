/**
 * Local web server for AEP Profile Viewer.
 * Serves the UI and /api/profile?email=... using auth from ../00 Adobe Auth.
 */

import express from 'express';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerFirebaseHostingRoutes, hostingRenameHandler } from './firebase-hosting-routes.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

/** Journey names cache (AJO system schema workaround). Loaded from journey-names.json if present. */
let journeyNamesCache = null;
function loadJourneyNamesCache() {
  const path = process.env.JOURNEY_NAMES_JSON || join(__dirname, 'journey-names.json');
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    journeyNamesCache = JSON.parse(raw);
    return journeyNamesCache;
  } catch {
    return null;
  }
}
loadJourneyNamesCache();
const PROFILE_API_BASE = 'https://platform.adobe.io/data/core/ups/access/entities';
/** Endpoint used to obtain profile and experience events: GET https://platform.adobe.io/data/core/ups/access/entities */
const ACCESS_ENTITIES_ENDPOINT = 'https://platform.adobe.io/data/core/ups/access/entities';
const QUERY_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/query';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';
const SANDBOX_MANAGEMENT_BASE = 'https://platform.adobe.io/data/foundation/sandbox-management';
const SCHEMA_REGISTRY_BASE = 'https://platform.adobe.io/data/foundation/schemaregistry';
const AUDIENCES_BASE = 'https://platform.adobe.io/data/core/ups/audiences';
const SEGMENT_JOBS_BASE = 'https://platform.adobe.io/data/core/ups/segment/jobs';
const SEGMENTATION_PREVIEW_BASE = 'https://platform.adobe.io/data/core/ups/preview';

/** Default schema for eventType enum lookup (demoemea events). */
const DEFAULT_EVENT_SCHEMA_ID = 'https://ns.adobe.com/demoemea/schemas/d9b88a044ad96154637965a97ed63c7b20bdf2ab3b4f642e';

const get = (obj, path) => path.split('.').reduce((o, k) => (o && o[k]), obj);

/** Get auth config with optional sandbox override. When sandboxOverride is provided, use it instead of env sandbox. */
async function getAuthForSandbox(sandboxOverride) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const sandboxName = (sandboxOverride && String(sandboxOverride).trim()) || config.sandboxName;
  return { token, config: { ...config, sandboxName }, cfg };
}

/**
 * DCS / HTTP API profile streaming — same headers as working Postman (no x-gw-ims-org-id).
 * Order: Content-Type, sandbox-name, x-adobe-flow-id (if provided), Authorization, x-api-key.
 */
function buildProfileDcsStreamingHeaders(token, sandboxName, flowId, apiKey) {
  const h = {
    'Content-Type': 'application/json',
    'sandbox-name': sandboxName || 'production',
  };
  if (flowId) h['x-adobe-flow-id'] = flowId;
  h.Authorization = `Bearer ${token}`;
  h['x-api-key'] = apiKey;
  return h;
}

function redactedProfileDcsRequestHeaders(headers) {
  return {
    'Content-Type': headers['Content-Type'],
    'sandbox-name': headers['sandbox-name'],
    'x-adobe-flow-id': headers['x-adobe-flow-id'],
    'x-api-key': headers['x-api-key'] ? '***' : undefined,
    Authorization: 'Bearer ***',
  };
}

/** Hint returned from profile streaming APIs (update + generate). */
const PROFILE_STREAM_DATAFLOW_HINT =
  'Bare payloads include root identityMap (Email + ECID) plus _demoemea, consents, and optInOut. Set AEP_PROFILE_STREAMING_ENVELOPE=1 for DCS envelope (header + body.xdmEntity). Set AEP_PROFILE_DATASET_ID / AEP_PROFILE_SCHEMA_ID to match the dataflow when using envelope. If values still do not appear: wait for ingestion latency, confirm AEP_PROFILE_XDM_KEY, and check Data Prep mapping (only mapped paths write to Profile). GET /api/streaming-flow-info to inspect mappings.';

/** Set a nested property by dot path (e.g. '_demoemea.identification.core.email' => obj._demoemea.identification.core.email = value). */
function setByPath(obj, path, value) {
  if (!path || typeof path !== 'string') return;
  const keys = path.split('.').filter(Boolean);
  if (keys.length === 0) return;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

/**
 * First path segment for fields that belong on the streaming JSON root beside `_demoemea`
 * (profile mixin group), not nested under the tenant key. Matches AEP Operational Profile
 * union samples where e.g. `telecomSubscription` and `loyalty` are siblings of `_demoemea`.
 */
const PROFILE_STREAM_ROOT_PATH_PREFIXES = new Set([
  'telecomSubscription',
  'person',
  'personID',
  'personalEmail',
  'homeAddress',
  'homePhone',
  'workAddress',
  'workPhone',
  'billingAddress',
  'billingAddressPhone',
  'mailingAddress',
  'shippingAddress',
  'shippingAddressPhone',
  'faxPhone',
  'mobilePhone',
  'loyalty',
]);

/** Ensure XDM calendar dates on update: YYYY-MM-DD; fix legacy YYYY-DD-MM when middle segment > 12. */
function normalizeProfileUpdateDateString(relativePath, val) {
  if (val == null || typeof val !== 'string') return val;
  const p = String(relativePath).toLowerCase();
  if (!p.includes('donationdate')) return val;
  const s = val.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return val;
  const [, y, a, b] = m;
  const na = parseInt(a, 10);
  if (na > 12) {
    return `${y}-${b}-${a}`;
  }
  return `${y}-${a}-${b}`;
}

/** Merge dotted-path attributes into tenant object vs root extras for streaming. */
function assignProfileStreamingAttributes(demoemeaTenant, rootExtras, filteredAttrs) {
  for (const [path, val] of Object.entries(filteredAttrs)) {
    const cleanPath = (path || '')
      .replace(/^(_demoemea\.|xdm:demoss\.)/i, '')
      .replace(/^demoemea\./i, '')
      .trim();
    if (!cleanPath) continue;
    const out = val !== undefined && val !== null ? val : '';
    const top = cleanPath.split('.')[0];
    const target = PROFILE_STREAM_ROOT_PATH_PREFIXES.has(top) ? rootExtras : demoemeaTenant;
    if (typeof out === 'string' && out.trim() !== '' && /^\d+$/.test(out)) setByPath(target, cleanPath, parseInt(out, 10));
    else setByPath(target, cleanPath, out);
  }
}

/**
 * DCS / HTTP streaming: status can be 2xx while the JSON body reports failed ingestion or RFC7807 errors.
 */
function parseStreamingCollectionResponse(httpStatus, rawText) {
  const trimmed = (rawText || '').trim();
  let parsed = {};
  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = { _nonJsonResponse: trimmed.slice(0, 800) };
    }
  }
  const streamErrors = [];
  const streamWarnings = [];

  if (httpStatus < 200 || httpStatus >= 300) {
    streamErrors.push(`HTTP ${httpStatus}`);
  }

  const inspectRoot = (root) => {
    if (!root || typeof root !== 'object' || Array.isArray(root)) return;
    if (root.title && typeof root.status === 'number' && root.status >= 400) {
      streamErrors.push(`${root.title}${root.detail ? ': ' + root.detail : ''}`);
    }
    if (Array.isArray(root.errors)) {
      root.errors.forEach((e) => {
        const m = e && (e.message || e.detail || e.reason || e.code);
        if (m) streamErrors.push(String(m));
      });
    }
    if (Array.isArray(root.eventIngestionResults)) {
      root.eventIngestionResults.forEach((r) => {
        const f = r && r.failedRecordCount;
        if (typeof f === 'number' && f > 0) {
          streamErrors.push(`Ingestion: ${f} failed record(s)${r.datasetId ? ` (dataset ${r.datasetId})` : ''}.`);
        }
        if (r && Array.isArray(r.messages)) {
          r.messages.forEach((msg) => {
            const s = typeof msg === 'string' ? msg : msg?.message || msg?.description;
            if (s && /fail|error|invalid|reject|denied/i.test(s)) streamErrors.push(String(s));
          });
        }
      });
    }
    if (root.report && root.report.message && /fail|error|invalid|reject/i.test(String(root.report.message))) {
      streamErrors.push(String(root.report.message));
    }
  };

  if (Array.isArray(parsed)) {
    parsed.forEach(inspectRoot);
  } else {
    inspectRoot(parsed);
    if (parsed.body && typeof parsed.body === 'object') inspectRoot(parsed.body);
  }

  if (httpStatus >= 200 && httpStatus < 300 && !trimmed) {
    streamWarnings.push('Streaming returned an empty body; verify dataflow, mapping, and sandbox in AEP.');
  }

  /** Failures are sometimes nested (not only top-level eventIngestionResults). */
  function collectDeepIngestionFailures(node, seen, depth) {
    const out = [];
    if (depth > 12 || node == null || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
      for (const item of node) out.push(...collectDeepIngestionFailures(item, seen, depth + 1));
      return out;
    }
    const f = node.failedRecordCount;
    if (typeof f === 'number' && f > 0) {
      const key = `${f}:${node.datasetId || ''}:${node.sandboxName || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(`Ingestion: ${f} failed record(s)${node.datasetId ? ` (dataset ${node.datasetId})` : ''}.`);
      }
    }
    for (const v of Object.values(node)) {
      out.push(...collectDeepIngestionFailures(v, seen, depth + 1));
    }
    return out;
  }
  const seenFail = new Set();
  for (const msg of collectDeepIngestionFailures(parsed, seenFail, 0)) {
    if (!streamErrors.includes(msg)) streamErrors.push(msg);
  }

  return { parsed, streamErrors, streamWarnings };
}

/**
 * Recursively find eventType field in schema (properties or allOf/refs) and return suggested values.
 * Looks for meta:enum (object), meta:enum.values (array), or enum (array).
 */
function extractEventTypeEnum(node, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return null;
  seen.add(node);
  if (node.properties && typeof node.properties.eventType === 'object') {
    const field = node.properties.eventType;
    const metaEnum = field['meta:enum'];
    if (metaEnum && typeof metaEnum === 'object' && !Array.isArray(metaEnum)) {
      return Object.keys(metaEnum).filter((k) => typeof k === 'string' && k.trim().length > 0);
    }
    if (Array.isArray(metaEnum) && metaEnum.length) return metaEnum.map(String).filter(Boolean);
    const vals = field['meta:enum.values'];
    if (Array.isArray(vals) && vals.length) return vals.map(String).filter(Boolean);
    if (Array.isArray(field.enum) && field.enum.length) return field.enum.map(String).filter(Boolean);
  }
  const toSearch = ['properties', 'allOf'];
  for (const key of toSearch) {
    const child = node[key];
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        for (const item of child) {
          const out = extractEventTypeEnum(item, seen);
          if (out && out.length) return out;
        }
      } else {
        for (const v of Object.values(child)) {
          const out = extractEventTypeEnum(v, seen);
          if (out && out.length) return out;
        }
      }
    }
  }
  // Nested tenant/mixin objects (e.g. _demoemea with properties.eventType)
  if (node.properties) {
    for (const v of Object.values(node.properties)) {
      if (v && typeof v === 'object') {
        const out = extractEventTypeEnum(v, seen);
        if (out && out.length) return out;
      }
    }
  }
  return null;
}

/**
 * Light schema resource (title, class, registry metadata) — smaller than xed-full.
 */
async function fetchSchemaSummaryLight(schemaId, sandboxOverride) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const sandboxName = (sandboxOverride && String(sandboxOverride).trim()) || config.sandboxName;
  const encodedId = encodeURIComponent(schemaId);
  const headers = {
    Accept: 'application/vnd.adobe.xed-id+json',
    Authorization: `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': sandboxName,
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

async function fetchSchemaSummariesLightBatched(schemaIds, sandboxOverride, concurrency = 8) {
  const unique = [...new Set((schemaIds || []).filter((id) => typeof id === 'string' && id.trim()))];
  const out = [];
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= unique.length) break;
      const id = unique[i];
      try {
        const summary = await fetchSchemaSummaryLight(id, sandboxOverride);
        if (summary && schemaSummaryKey(summary)) out.push(summary);
      } catch {
        /* skip */
      }
    }
  }
  const n = Math.min(concurrency, Math.max(1, unique.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Fetch schema from Schema Registry by $id and return parsed JSON.
 * Uses tenant container; Accept: application/vnd.adobe.xed-full+json;version=1.
 */
async function fetchSchemaById(schemaId, sandboxOverride) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const sandboxName = (sandboxOverride && String(sandboxOverride).trim()) || config.sandboxName;
  const encodedId = encodeURIComponent(schemaId);
  const url = `${SCHEMA_REGISTRY_BASE}/tenant/schemas/${encodedId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.adobe.xed-full+json;version=1',
      Authorization: `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.title || data.detail || data.error_description || res.statusText;
    throw new Error(msg || `Schema Registry ${res.status}`);
  }
  return data;
}

/**
 * Paginate a Schema Registry list (tenant or global) with xed-id summaries.
 */
async function paginateSchemaRegistryList(initialUrl, headers) {
  const aggregated = [];
  let url = initialUrl;
  for (let page = 0; page < 100; page++) {
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.title || data.detail || data.error_description || res.statusText;
      throw new Error(msg || `Schema list ${res.status}`);
    }
    const batch = Array.isArray(data.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];
    aggregated.push(...batch);
    const nextHref = data._links?.next?.href;
    if (!nextHref) break;
    url = String(nextHref).startsWith('http') ? nextHref : `https://platform.adobe.io${nextHref}`;
  }
  return aggregated;
}

/**
 * Tenant schema list matching Postman "Get Schemas Copy":
 * GET /tenant/schemas?orderby=title&start={prefix} with Accept: application/vnd.adobe.xdm+json
 * Paginates via _links.next (same pattern as paginateSchemaRegistryList).
 */
async function fetchTenantSchemasPostmanList(sandboxOverride, startPrefix = '') {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const sandboxName = (sandboxOverride && String(sandboxOverride).trim()) || config.sandboxName;
  const headers = {
    Accept: 'application/vnd.adobe.xdm+json',
    Authorization: `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': sandboxName,
  };
  const qs = new URLSearchParams({ orderby: 'title' });
  const sp = (startPrefix && String(startPrefix).trim()) || '';
  if (sp) qs.set('start', sp);
  let url = `${SCHEMA_REGISTRY_BASE}/tenant/schemas?${qs.toString()}`;
  const aggregated = [];
  for (let page = 0; page < 100; page++) {
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data.message ||
        data.title ||
        data.detail ||
        (Array.isArray(data.errors) && data.errors.map((e) => e?.message || e?.detail).filter(Boolean).join('; ')) ||
        res.statusText ||
        String(res.status);
      throw new Error(msg || `Schema Registry tenant/schemas (xdm+json) ${res.status}`);
    }
    const batch = Array.isArray(data.results) ? data.results : [];
    aggregated.push(...batch);
    const nextHref = data._links?.next?.href;
    if (!nextHref) break;
    url = String(nextHref).startsWith('http') ? nextHref : `https://platform.adobe.io${nextHref}`;
  }
  return { sandboxName, rawList: aggregated };
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

/**
 * Global ∪ tenant registry list (class-based when supported), noise-filtered, unsorted merge array.
 */
async function fetchRegistryComposedSchemaSummaries(sandboxOverride) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const sandboxName = (sandboxOverride && String(sandboxOverride).trim()) || config.sandboxName;
  const headers = {
    Accept: 'application/vnd.adobe.xed-id+json',
    Authorization: `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': sandboxName,
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
    } catch (e) {
      tenantErr = e;
    }

    try {
      globalAgg = await paginateSchemaRegistryList(`${SCHEMA_REGISTRY_BASE}/global/schemas?${qs}`, headers);
    } catch {
      globalAgg = [];
    }

    if (tenantErr) {
      if (useMetaClassFilter) {
        useMetaClassFilter = false;
        continue;
      }
      throw tenantErr;
    }

    merged = mergeTenantAndGlobalSchemaSummaries(tenantAgg, globalAgg);
    break;
  }

  const filtered = merged.filter((s) => !isDatasetAdhocSchemaNoise(s));
  return { sandboxName, schemas: filtered };
}

/**
 * Schemas for the sandbox: primarily **Catalog-backed** (schema $ids used by datasets → light Registry GET
 * for each). That surfaces operational XDM names AEP shows, and drops most unused ad-hoc registry clutter.
 * Remaining class-based registry rows (not in Catalog) are merged in so library schemas without datasets still appear.
 *
 * @param catalogInfoPreloaded — optional result of fetchCatalogDatasetSchemaInfo to avoid a second Catalog walk.
 */
async function fetchComposedSchemasListForSandbox(sandboxOverride, catalogInfoPreloaded = null) {
  let catalogInfo = catalogInfoPreloaded;
  if (!catalogInfo) {
    try {
      catalogInfo = await fetchCatalogDatasetSchemaInfo(sandboxOverride);
    } catch {
      catalogInfo = null;
    }
  }

  const { sandboxName: snRegistry, schemas: registryFiltered } =
    await fetchRegistryComposedSchemaSummaries(sandboxOverride);

  if (!catalogInfo || catalogInfo.canonicalIdByNorm.size === 0) {
    const sorted = [...registryFiltered].sort((a, b) => {
      const ta = pickSchemaRegistryListTitle(a) || schemaSummaryKey(a);
      const tb = pickSchemaRegistryListTitle(b) || schemaSummaryKey(b);
      return ta.localeCompare(tb, undefined, { sensitivity: 'base' });
    });
    return {
      sandboxName: snRegistry,
      schemas: sorted,
      schemaListSource: 'registry',
      catalogLightGetMisses: 0,
    };
  }

  const canonicalIds = [...new Set(catalogInfo.canonicalIdByNorm.values())];
  const fromCatalogRaw = await fetchSchemaSummariesLightBatched(canonicalIds, snRegistry, 8);
  const fromCatalog = fromCatalogRaw.filter((s) => !isDatasetAdhocSchemaNoise(s));

  const resolvedNorm = new Set(
    fromCatalog.map((s) => normalizeSchemaIdForDatasetMatch(schemaSummaryKey(s))).filter(Boolean),
  );
  let catalogLightGetMisses = 0;
  for (const [norm, canonId] of catalogInfo.canonicalIdByNorm) {
    if (!norm || !canonId || resolvedNorm.has(norm)) continue;
    const dsName =
      typeof catalogInfo.firstDatasetNameByNorm?.get === 'function'
        ? catalogInfo.firstDatasetNameByNorm.get(norm)
        : '';
    let displayTitle = (typeof dsName === 'string' && dsName.trim()) || canonId;
    if (titleLooksLikeDatasetAdhocNoise(displayTitle)) displayTitle = canonId;
    const stub = { $id: canonId, id: canonId, title: displayTitle };
    if (isDatasetAdhocSchemaNoise(stub)) continue;
    fromCatalog.push(stub);
    resolvedNorm.add(norm);
    catalogLightGetMisses += 1;
  }

  const catNorm = new Set(
    fromCatalog.map((s) => normalizeSchemaIdForDatasetMatch(schemaSummaryKey(s))).filter(Boolean),
  );

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

  return {
    sandboxName: snRegistry,
    schemas: merged,
    schemaListSource: 'catalog+registry',
    catalogLightGetMisses,
  };
}

/**
 * Human-facing XDM schema name from Registry summary (xed-id + occasional labels), aligned with AEP UI.
 */
function pickSchemaRegistryListTitle(s) {
  if (!s || typeof s !== 'object') return '';
  if (typeof s.title === 'string' && s.title.trim()) return s.title.trim();
  const mt = s['meta:title'];
  if (typeof mt === 'string' && mt.trim()) return mt.trim();
  const fromLabels = pickTitleFromI18nLabels(s.labels);
  if (fromLabels) return fromLabels;
  return '';
}

/** Locale-aware title from `labels` (string or { title }) — matches common AEP i18n shapes. */
function pickTitleFromI18nLabels(labels) {
  if (!labels || typeof labels !== 'object') return '';
  const prefer = ['en-US', 'en-us', 'en', 'en_US', 'en-GB'];
  for (const loc of prefer) {
    if (!Object.prototype.hasOwnProperty.call(labels, loc)) continue;
    const block = labels[loc];
    if (typeof block === 'string' && block.trim()) return block.trim();
    if (block && typeof block === 'object' && typeof block.title === 'string' && block.title.trim()) {
      return block.title.trim();
    }
  }
  for (const loc of Object.keys(labels)) {
    const block = labels[loc];
    if (typeof block === 'string' && block.trim()) return block.trim();
    if (block && typeof block === 'object' && typeof block.title === 'string' && block.title.trim()) {
      return block.title.trim();
    }
  }
  return '';
}

/** Human-readable XDM class label for browse table (AEP Schemas column). */
function formatSchemaClassLabel(classUri) {
  if (!classUri || typeof classUri !== 'string') return '—';
  const u = classUri.toLowerCase();
  if (u.includes('context/profile') || u.includes('individual-profile')) return 'XDM Individual Profile';
  if (u.includes('context/experienceevent') || u.includes('experienceevent')) return 'XDM ExperienceEvent';
  const seg = classUri.split('/').filter(Boolean).pop() || classUri;
  return seg.replace(/([a-z])([A-Z])/g, '$1 $2') || '—';
}

function inferSchemaBehavior(classUri) {
  if (!classUri || typeof classUri !== 'string') return '—';
  const u = classUri.toLowerCase();
  if (u.includes('experienceevent') || u.includes('time-series')) return 'Time-series';
  if (u.includes('profile') || u.includes('/xdm/data/record')) return 'Record';
  return 'Record';
}

function inferSchemaTypeLabel(schemaId, classUri) {
  const id = (schemaId || '').toLowerCase();
  const cls = (classUri || '').toLowerCase();
  if (cls.startsWith('https://ns.adobe.com/xdm/') || id.includes('https://ns.adobe.com/xdm/')) return 'Standard';
  return 'Custom';
}

/** Profile vs event (experience) split for Data viewer overview — uses meta:class URI. */
function classifySchemaOverviewKind(metaClass) {
  if (!metaClass || typeof metaClass !== 'string') return 'other';
  const u = metaClass.toLowerCase();
  if (u.includes('experienceevent') || u.includes('time-series')) return 'event';
  if (u.includes('context/profile') || u.includes('individual-profile')) return 'profile';
  return 'other';
}

/** Epoch ms from Schema Registry meta:registryMetadata (epoch string/number or ISO date). */
function registryMetadataEpochMs(registryMeta, key) {
  if (!registryMeta || typeof registryMeta !== 'object') return null;
  const raw = registryMeta[key];
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const n = parseInt(trimmed, 10);
      if (Number.isFinite(n)) return n;
    }
    const d = Date.parse(trimmed);
    if (!Number.isNaN(d)) return d;
  }
  return null;
}

function registryMetadataLastModified(registryMeta) {
  return registryMetadataEpochMs(registryMeta, 'repo:lastModifiedDate');
}

/** Strip invisible chars / NBSP so ad-hoc title checks are reliable (ZWSP breaks /^adhoc/). */
function normalizeSchemaNoiseTitle(t) {
  if (t == null || typeof t !== 'string') return '';
  return t
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

/**
 * Human-visible title patterns for auto-generated dataset / ad-hoc registry rows (not Schema Library names).
 */
function titleLooksLikeDatasetAdhocNoise(normalizedTitle) {
  const t = normalizeSchemaNoiseTitle(normalizedTitle);
  if (!t) return false;
  if (/^xdm schema for dataset\b/i.test(t)) return true;
  if (/^adhoc\b/i.test(t)) return true;
  if (/Random identifier:/i.test(t)) return true;
  if (/cjm_qsaccel|qsaccel|\.cjm_reporting/i.test(t)) return true;
  return false;
}

/**
 * True for auto-generated ad-hoc / dataset-local registry entries (still "schemas" in API terms, but not
 * the named Schema Library artifacts users expect in the Schemas UI).
 */
/** Only hide true ad-hoc XDM extends; title heuristics are too aggressive and hide valid library schemas. */
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

function normalizeSchemaIdForDatasetMatch(id) {
  if (id == null || typeof id !== 'string') return '';
  return id.replace(/;version=\d+$/i, '').trim();
}

/**
 * Normalize Catalog GET /dataSets response: key–value map, or `children` / `results` arrays (some gateways).
 * Invokes fn(catalogKeyOrId, datasetObject) for each dataset.
 */
function forEachCatalogDataSetObject(data, fn) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data.children)) {
    data.children.forEach((obj, i) => {
      if (!obj || typeof obj !== 'object') return;
      const id =
        (typeof obj.id === 'string' && obj.id) ||
        (typeof obj['@id'] === 'string' && obj['@id']) ||
        `child-${i}`;
      fn(id, obj);
    });
    return;
  }
  if (Array.isArray(data.results)) {
    data.results.forEach((obj, i) => {
      if (!obj || typeof obj !== 'object') return;
      const id =
        (typeof obj.id === 'string' && obj.id) ||
        (typeof obj['@id'] === 'string' && obj['@id']) ||
        `result-${i}`;
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

/**
 * Paginate Catalog GET /dataSets — same headers and URL shape for every caller (schema browse counts + datasets list).
 * @param {string} propertiesCsv – comma-separated Catalog properties, e.g. "schemaRef,name"
 */
async function paginateCatalogDataSets(sandboxOverride, propertiesCsv) {
  const { token, config } = await getAuth();
  const cfg = getConfig();
  const sandboxName = (sandboxOverride && String(sandboxOverride).trim()) || config.sandboxName;
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': sandboxName,
  };
  const pages = [];
  const propsQ = encodeURIComponent(propertiesCsv);
  let url = `${CATALOG_BASE}/dataSets?limit=100&properties=${propsQ}`;
  for (let page = 0; page < 500; page++) {
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data.message ||
        data.title ||
        data.detail ||
        (Array.isArray(data.errors) && data.errors.map((e) => e?.message || e?.detail).filter(Boolean).join('; ')) ||
        res.statusText ||
        String(res.status);
      const err = new Error(msg || `Catalog dataSets ${res.status}`);
      err.catalogStatus = res.status;
      throw err;
    }
    pages.push(data);
    const href = data._links?.next?.href;
    const nextHref =
      typeof href === 'string'
        ? href
        : typeof data._links?.next === 'string'
          ? data._links.next
          : typeof data._page?.next === 'string'
            ? data._page.next
            : null;
    if (!nextHref) break;
    url = nextHref.startsWith('http')
      ? nextHref
      : `https://platform.adobe.io${nextHref.startsWith('/') ? nextHref : `/${nextHref}`}`;
  }
  return { sandboxName, pages };
}

/**
 * Paginate Catalog dataSets: per-schema dataset counts, canonical $id for GETs, optional sample dataset name.
 */
async function fetchCatalogDatasetSchemaInfo(sandboxOverride) {
  const { pages } = await paginateCatalogDataSets(sandboxOverride, 'schemaRef,name');
  const counts = new Map();
  const canonicalIdByNorm = new Map();
  const firstDatasetNameByNorm = new Map();
  for (const data of pages) {
    forEachCatalogDataSetObject(data, (key, obj) => {
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
  if (Array.isArray(tags)) {
    return tags
      .map((t) => (typeof t === 'string' ? t : t && (t.name || t.id)))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof tags === 'object') {
    const parts = [];
    for (const [k, v] of Object.entries(tags)) {
      if (v === true) parts.push(k);
      else if (Array.isArray(v) && v.length) parts.push(`${k}: ${v.join(', ')}`);
      else if (v && typeof v === 'object') parts.push(k);
      else if (v != null && v !== false) parts.push(`${k}: ${String(v)}`);
    }
    return parts.slice(0, 8).join(' · ') + (parts.length > 8 ? ' …' : '');
  }
  return '';
}

/**
 * Resolve friendly schema titles for dataset rows (Registry light GET, batched).
 */
async function enrichDatasetsWithSchemaTitles(datasets, sandboxName) {
  const ids = [...new Set(datasets.map((d) => d.schemaId).filter((x) => typeof x === 'string' && x.trim()))];
  if (ids.length === 0) return datasets;
  const summaries = await fetchSchemaSummariesLightBatched(ids, sandboxName, 8);
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
    const st =
      sid &&
      (titleByNorm.get(normalizeSchemaIdForDatasetMatch(sid)) || titleByNorm.get(sid) || '');
    return { ...d, schemaTitle: st || '' };
  });
}

/**
 * Paginate Catalog dataSets into a flat list for the Data viewer Datasets tab.
 * Same Catalog endpoint/headers as schema browse; prefers `created`/`updated` when the tenant allows that
 * `properties` list, otherwise falls back to exactly `schemaRef,name` (identical to fetchCatalogDatasetSchemaInfo).
 */
async function fetchCatalogDatasetsList(sandboxOverride) {
  let sandboxName;
  let pages;
  try {
    ({ sandboxName, pages } = await paginateCatalogDataSets(
      sandboxOverride,
      'schemaRef,name,created,updated',
    ));
  } catch {
    ({ sandboxName, pages } = await paginateCatalogDataSets(sandboxOverride, 'schemaRef,name'));
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
      const id =
        (typeof obj.id === 'string' && obj.id) ||
        (typeof obj['@id'] === 'string' && obj['@id']) ||
        key;
      const tagsLabel = formatDatasetTagsLabel(obj.tags);
      datasets.push({
        id,
        name: typeof obj.name === 'string' ? obj.name : '',
        description: typeof obj.description === 'string' ? obj.description : '',
        schemaId,
        created: obj.created ?? null,
        updated: obj.updated ?? null,
        tagsLabel,
        dataLakeStorage: null,
        dataLakeRetention: null,
        profileStorage: null,
        profileRetention: null,
        lastBatchStatus: 'none',
        lastBatchUpdated: null,
      });
    });
  }
  return { sandboxName, datasets };
}

/** Normalize AEP timestamps (ms, s, or μs) to milliseconds. */
function normalizeAudienceTimestampMs(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n > 1e15) return Math.floor(n / 1000);
  if (n > 1e12) return Math.floor(n);
  if (n > 1e9) return Math.floor(n * 1000);
  return Math.floor(n * 1000);
}

function formatAudienceOriginLabel(originName) {
  if (!originName || typeof originName !== 'string') return '—';
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
    raw.profileCount,
    raw.totalProfiles,
    raw.qualifiedProfiles,
    raw.metrics && raw.metrics.totalProfiles,
    raw.metrics && raw.metrics.profileCount,
    raw.segmentState && raw.segmentState.totalProfiles,
    raw.cjmAudienceDetails && raw.cjmAudienceDetails.profileCount,
  ];
  for (const c of candidates) {
    if (c != null && Number.isFinite(Number(c))) return Number(c);
  }
  return null;
}

function mapAudienceApiRow(raw) {
  const id = (raw.id || raw.audienceId || '').trim();
  return {
    id,
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

/**
 * Fetch profile counts from the latest successful segment job.
 * Returns a map of segmentId → profileCount.
 */
async function fetchSegmentJobCounts(headers) {
  try {
    const url = `${SEGMENT_JOBS_BASE}?limit=1&status=SUCCEEDED&sort=updateTime:desc`;
    const res = await fetch(url, { headers });
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

/**
 * Paginated GET /audiences (Segmentation Service) for the selected sandbox.
 * After fetching the list, enriches rows with profile counts from the latest segment job.
 */
async function fetchAudiencesList(sandboxOverride) {
  const { token, config, cfg } = await getAuthForSandbox(sandboxOverride);
  const sandboxName = config.sandboxName || 'production';
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': sandboxName,
  };
  const limit = 100;
  const all = [];
  let totalPages = null;
  for (let page = 0, guard = 0; guard < 500; guard++) {
    const url = `${AUDIENCES_BASE}?limit=${limit}&start=${page}&sort=name:asc`;
    const res = await fetch(url, { headers });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!res.ok) {
      const msg =
        data.message ||
        data.title ||
        (Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) ||
        `Audiences API ${res.status}`;
      throw new Error(msg);
    }
    const children = Array.isArray(data.children) ? data.children : [];
    if (page === 0 && data._page && data._page.totalPages != null) {
      const tp = Number(data._page.totalPages);
      if (Number.isFinite(tp) && tp > 0) totalPages = Math.min(tp, 500);
    }
    for (const raw of children) {
      all.push(mapAudienceApiRow(raw));
    }
    if (children.length === 0) break;
    if (totalPages != null) {
      page += 1;
      if (page >= totalPages) break;
    } else if (children.length < limit) {
      break;
    } else {
      page += 1;
    }
  }
  const jobCounts = await fetchSegmentJobCounts(headers);
  for (const row of all) {
    if (row.profileCount == null && row.id && jobCounts[row.id] != null) {
      row.profileCount = jobCounts[row.id];
    }
  }
  return { sandboxName, audiences: all };
}

/**
 * Flatten Profile preview `results` into { objectId, profileHref } rows (handles nested XID maps).
 */
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
  return out.filter((r) => {
    if (!r.objectId || seen.has(r.objectId)) return false;
    seen.add(r.objectId);
    return true;
  });
}

async function fetchAudienceExpression(audienceId, sandboxOverride) {
  const id = String(audienceId || '').trim();
  if (!id) throw new Error('Missing audience id');
  const { token, config, cfg } = await getAuthForSandbox(sandboxOverride);
  const sandboxName = config.sandboxName || 'production';
  const url = `${AUDIENCES_BASE}/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.message ||
      data.title ||
      (Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) ||
      `Audiences API ${res.status}`;
    throw new Error(msg);
  }
  const expr = data.expression;
  const pql = expr && typeof expr.value === 'string' ? expr.value.trim() : '';
  if (!pql) throw new Error('This audience has no PQL expression to preview (may be external or rule-based only).');
  const model =
    data.schema && typeof data.schema.name === 'string' && data.schema.name.trim()
      ? data.schema.name.trim()
      : '_xdm.context.profile';
  const name = typeof data.name === 'string' ? data.name : id;
  return { pql, model, name, sandboxName };
}

/**
 * Run Segmentation preview for an audience and return a sample of matching profile entity links.
 * @see https://experienceleague.adobe.com/en/docs/experience-platform/segmentation/api/previews-and-estimates
 */
async function runAudiencePreviewSample(audienceId, sandboxOverride) {
  const { pql, model, name, sandboxName } = await fetchAudienceExpression(audienceId, sandboxOverride);
  const { token, config, cfg } = await getAuthForSandbox(sandboxOverride);
  const headersJson = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': sandboxName,
  };
  const headersGet = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': sandboxName,
  };
  const postRes = await fetch(SEGMENTATION_PREVIEW_BASE, {
    method: 'POST',
    headers: headersJson,
    body: JSON.stringify({
      predicateExpression: pql,
      predicateType: 'pql/text',
      predicateModel: model,
      graphType: 'pdg',
    }),
  });
  const postData = await postRes.json().catch(() => ({}));
  if (!postRes.ok) {
    const msg =
      postData.message ||
      postData.title ||
      (Array.isArray(postData.errors) && postData.errors[0] && postData.errors[0].message) ||
      `Preview create ${postRes.status}`;
    throw new Error(msg);
  }
  const previewId = postData.previewId;
  if (!previewId || typeof previewId !== 'string') {
    throw new Error('No previewId returned from Segmentation preview API.');
  }

  const deadline = Date.now() + 90000;
  let lastState = '';
  while (Date.now() < deadline) {
    const getUrl = `${SEGMENTATION_PREVIEW_BASE}/${encodeURIComponent(previewId)}?limit=100`;
    const getRes = await fetch(getUrl, { method: 'GET', headers: headersGet });
    const getData = await getRes.json().catch(() => ({}));
    if (!getRes.ok) {
      const msg =
        getData.message ||
        getData.title ||
        (Array.isArray(getData.errors) && getData.errors[0] && getData.errors[0].message) ||
        `Preview poll ${getRes.status}`;
      throw new Error(msg);
    }
    lastState = getData.state || '';
    if (lastState === 'RESULT_READY') {
      const members = flattenPreviewResults(getData.results);
      return {
        audienceId: String(audienceId).trim(),
        audienceName: name,
        sandbox: sandboxName,
        previewId,
        state: lastState,
        memberCount: members.length,
        members: members.slice(0, 100),
        note: 'Sample rows from Segmentation preview API (not a full audience export). Profile links are Adobe API URLs.',
      };
    }
    if (lastState === 'FAILED' || lastState === 'CANCELLED') {
      throw new Error(`Preview job ended: ${lastState}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Preview timed out waiting for results (last state: ${lastState || 'unknown'}).`);
}

/** @deprecated use fetchCatalogDatasetSchemaInfo; kept for call sites that only need counts */
async function fetchCatalogDatasetCountsBySchema(sandboxOverride) {
  const { counts } = await fetchCatalogDatasetSchemaInfo(sandboxOverride);
  return counts;
}

function resolveDatasetCountForSchema(countsMap, id, metaAltId) {
  if (!countsMap || !id) return 0;
  const keys = [normalizeSchemaIdForDatasetMatch(id), id].filter(Boolean);
  const uniq = [...new Set(keys)];
  for (const k of uniq) {
    if (countsMap.has(k)) return countsMap.get(k);
  }
  if (metaAltId && typeof metaAltId === 'string' && countsMap.has(metaAltId)) {
    return countsMap.get(metaAltId);
  }
  return 0;
}

/**
 * Get firstName and lastName from a single object (no deep search).
 */
function getProfileNamesFromObject(obj) {
  if (!obj || typeof obj !== 'object') return { firstName: '', lastName: '' };
  const paths = [
    'person.name.firstName',
    'person.name.lastName',
    'name.firstName',
    'name.lastName',
    'name.givenName',
    'name.familyName',
    '_demoemea.person.name.firstName',
    '_demoemea.person.name.lastName',
    'identification.core.firstName',
    'identification.core.lastName',
    '_demoemea.identification.core.firstName',
    '_demoemea.identification.core.lastName',
  ];
  let firstName = '';
  let lastName = '';
  for (const p of paths) {
    const val = get(obj, p);
    if (val && typeof val === 'string') {
      if (p.includes('firstName') || p.includes('givenName')) firstName = val;
      else if (p.includes('lastName') || p.includes('familyName')) lastName = val;
    }
  }
  if (!firstName && get(obj, 'person.name.fullName')) {
    const parts = String(get(obj, 'person.name.fullName')).trim().split(/\s+/);
    if (parts.length >= 1) firstName = parts[0];
    if (parts.length >= 2) lastName = parts.slice(1).join(' ');
  }
  return { firstName, lastName };
}

/**
 * Get firstName and lastName from profile entity. Searches top-level paths, then
 * entity.attributes (fragment-based response), then any tenant/schema keyed object.
 */
function getProfileNames(entity) {
  if (!entity || typeof entity !== 'object') return { firstName: '', lastName: '' };
  let result = getProfileNamesFromObject(entity);
  if (result.firstName || result.lastName) return result;
  if (entity.attributes && typeof entity.attributes === 'object') {
    for (const v of Object.values(entity.attributes)) {
      if (v && typeof v === 'object') {
        result = getProfileNamesFromObject(v);
        if (result.firstName || result.lastName) return result;
      }
    }
  }
  for (const v of Object.values(entity)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && (get(v, 'person.name') || get(v, 'person.name.firstName') || get(v, 'name.firstName'))) {
      result = getProfileNamesFromObject(v);
      if (result.firstName || result.lastName) return result;
    }
  }
  return result;
}

/** Normalize AEP gender strings to `male`, `female`, or null. */
function normalizeProfileGender(raw) {
  if (raw == null || raw === '') return null;
  const g = String(raw).trim().toLowerCase();
  if (!g) return null;
  if (g === 'f' || g === 'female' || g === 'woman' || g === 'w') return 'female';
  if (g === 'm' || g === 'male' || g === 'man') return 'male';
  if (g.includes('female') || g.includes('woman')) return 'female';
  if (g.includes('male') && !g.includes('female')) return 'male';
  return null;
}

/**
 * XDM / AEP often stores gender as a string, enum object (`code`, `value`), or `@id` URI fragment.
 */
function normalizeGenderFromRaw(val) {
  if (val == null) return null;
  if (typeof val === 'string') return normalizeProfileGender(val);
  if (typeof val === 'object' && !Array.isArray(val)) {
    const id = val['@id'];
    if (id != null && typeof id === 'string') {
      const idLower = id.toLowerCase();
      if (idLower.includes('female') || idLower.includes('woman')) return 'female';
      if (idLower.includes('male') && !idLower.includes('female')) return 'male';
    }
    for (const k of ['code', 'value', 'name', 'type', 'key', 'enum', 'gender']) {
      const inner = val[k];
      if (inner != null && typeof inner === 'string') {
        const n = normalizeProfileGender(inner);
        if (n) return n;
      }
    }
  }
  return null;
}

/** Case-insensitive `gender` on a person-shaped object (XDM payloads may use `Gender`). */
function readGenderFieldFromObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  for (const k of Object.keys(obj)) {
    if (String(k).toLowerCase() === 'gender') {
      return obj[k];
    }
  }
  return null;
}

/**
 * `person` may be an object or a one-element array; dot-path `person.gender` fails when `person` is an array.
 */
function getGenderFromPersonContainer(personVal) {
  if (personVal == null) return null;
  const nodes = Array.isArray(personVal) ? personVal : [personVal];
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    let raw = readGenderFieldFromObject(node);
    if (raw == null && node.demographics && typeof node.demographics === 'object') {
      raw = readGenderFieldFromObject(node.demographics);
    }
    if (raw == null && node.demographic && typeof node.demographic === 'object') {
      raw = readGenderFieldFromObject(node.demographic);
    }
    const n = normalizeGenderFromRaw(raw);
    if (n) return n;
  }
  return null;
}

function getProfileGenderFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const fromPerson =
    getGenderFromPersonContainer(obj.person) ||
    getGenderFromPersonContainer(get(obj, '_demoemea.person')) ||
    getGenderFromPersonContainer(get(obj, 'xdm.person')) ||
    (obj.xdm && typeof obj.xdm === 'object' ? getGenderFromPersonContainer(obj.xdm.person) : null);
  if (fromPerson) return fromPerson;

  const paths = [
    'person.gender',
    'person.demographics.gender',
    'person.demographic.gender',
    'demographics.gender',
    'gender',
    'xdm.person.gender',
    '_demoemea.person.gender',
    '_demoemea.person.demographics.gender',
    '_demoemea.demographics.gender',
    '_demoemea.individualCharacteristics.person.gender',
    'individualCharacteristics.gender',
    'individualCharacteristics.person.gender',
  ];
  for (const p of paths) {
    const val = get(obj, p);
    const n = normalizeGenderFromRaw(val);
    if (n) return n;
  }
  return null;
}

/**
 * Best-effort gender from profile entity (same traversal pattern as getProfileNames).
 */
function getProfileGender(entity) {
  if (!entity || typeof entity !== 'object') return null;
  let g = getProfileGenderFromObject(entity);
  if (g) return g;
  if (entity.attributes && typeof entity.attributes === 'object') {
    for (const v of Object.values(entity.attributes)) {
      if (v && typeof v === 'object') {
        g = getProfileGenderFromObject(v);
        if (g) return g;
      }
    }
  }
  for (const v of Object.values(entity)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          g = getProfileGenderFromObject(item);
          if (g) return g;
        }
      }
      continue;
    }
    if (v && typeof v === 'object') {
      g = getProfileGenderFromObject(v);
      if (g) return g;
    }
  }
  try {
    const rows = flattenEntityToTableRows(entity);
    for (const row of rows || []) {
      const p = String(row.path || '').toLowerCase();
      if (!p.includes('gender')) continue;
      const n = normalizeGenderFromRaw(row.value);
      if (n) return n;
    }
  } catch {
    /* ignore flatten errors */
  }
  return null;
}

/** Linked identities from flattened profile rows (identityMap.*.id / .xid paths). */
function extractLinkedIdentitiesFromFlattenedRows(rows) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const p = String(row.path || '').toLowerCase();
    if (!p.includes('identitymap')) continue;
    const m = p.match(/identitymap\.([^.]+)/);
    if (!m) continue;
    if (!p.match(/\.(id|xid)$/)) continue;
    const ns = m[1];
    const v = String(row.value ?? '').trim();
    if (!v || v.length > 256) continue;
    const key = `${ns}:${v.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ namespace: ns, value: v });
  }
  return out;
}

/** Merge identityMap on entity with flattened rows for donate identity graph + UI. */
function collectIdentitiesForGraph(entity, flatRows) {
  const map = new Map();
  function add(ns, val) {
    const n = String(ns || '').trim();
    const v = String(val ?? '').trim();
    if (!n || !v || v.length > 256) return;
    const key = `${n}:${v.slice(0, 120)}`;
    if (map.has(key)) return;
    map.set(key, { namespace: n, value: v });
  }
  for (const x of extractLinkedIdentitiesFromFlattenedRows(flatRows)) {
    add(x.namespace, x.value);
  }
  const im = entity?.identityMap;
  if (im && typeof im === 'object' && !Array.isArray(im)) {
    for (const [ns, arr] of Object.entries(im)) {
      const list = Array.isArray(arr) ? arr : [];
      for (const item of list) {
        const id = item?.id ?? item?.ID ?? item?.xid;
        if (id != null && id !== '') add(ns, String(id));
      }
    }
  }
  return [...map.values()].slice(0, 40);
}

/**
 * Get email from a single object (no deep search).
 */
function getProfileEmailFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const paths = [
    'personalEmail.address',
    'person.email',
    'identification.core.email',
    '_demoemea.identification.core.email',
  ];
  for (const p of paths) {
    const val = get(obj, p);
    if (val && typeof val === 'string') return val;
  }
  const im = obj.identityMap?.email || obj.identityMap?.Email;
  const arr = Array.isArray(im) ? im : [];
  const first = arr.find((x) => x && x.id);
  if (first && typeof first.id === 'string') return first.id;
  return null;
}

/**
 * Get email from profile entity. Tries top-level, then entity.attributes, then nested objects.
 */
function getProfileEmail(entity) {
  if (!entity || typeof entity !== 'object') return null;
  let val = getProfileEmailFromObject(entity);
  if (val) return val;
  if (entity.attributes && typeof entity.attributes === 'object') {
    for (const v of Object.values(entity.attributes)) {
      val = getProfileEmailFromObject(v);
      if (val) return val;
    }
  }
  for (const v of Object.values(entity)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      val = getProfileEmailFromObject(v);
      if (val) return val;
    }
  }
  return null;
}

/**
 * Get ECID from a single object (no deep search).
 */
function toEcidString(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val.trim() || null;
  if (typeof val === 'number') return String(val);
  return null;
}

/** Ensure a single ECID string (max 38 digits). If array, take first; if string longer than 38 digits, take first 38. */
function ensureSingleEcid(ecid) {
  if (ecid == null) return null;
  if (Array.isArray(ecid)) {
    const first = ecid.find((x) => x != null && (typeof x === 'string' ? x.trim().length >= 10 : typeof x === 'number'));
    return ensureSingleEcid(first != null && typeof first === 'object' && first.id != null ? first.id : first);
  }
  const str = toEcidString(ecid);
  if (!str || !/^\d+$/.test(str)) return str;
  if (str.length <= 38) return str;
  return str.slice(0, 38);
}

/** Canonical ECID path in AEP profile (tenant _demoemea). */
const ECID_PATH_DEMOEMEA = '_demoemea.identification.core.ecid';

function getProfileEcidFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  // Explicit primary path per AEP profile structure
  const paths = [
    ECID_PATH_DEMOEMEA,
    '_demoemea.identification.core.ECID',
    'identification.core.ecid',
    'identification.core.ECID',
  ];
  for (const p of paths) {
    const val = get(obj, p);
    const str = toEcidString(val);
    if (str && str.length >= 10) return str;
  }
  const core = get(obj, '_demoemea.identification.core') || get(obj, 'identification.core');
  if (core && typeof core === 'object') {
    const val = core.ecid ?? core.ECID;
    const str = toEcidString(val);
    if (str && str.length >= 10) return str;
  }
  const im = obj.identityMap?.ecid || obj.identityMap?.ECID;
  const arr = Array.isArray(im) ? im : [];
  const first = arr.find((x) => x && (x.id != null));
  if (first) return toEcidString(first.id);
  return null;
}

/**
 * Get ECID from profile entity. Uses _demoemea.identification.core.ecid first, then entity.attributes, then tenant keys.
 */
function getProfileEcid(entity) {
  if (!entity || typeof entity !== 'object') return null;
  // 1) Direct path on entity (canonical location)
  let val = toEcidString(get(entity, ECID_PATH_DEMOEMEA));
  if (val && val.length >= 10) return val;
  val = getProfileEcidFromObject(entity);
  if (val) return val;
  // 2) If entity is a payload wrapper, try .entity
  const inner = entity.entity;
  if (inner && typeof inner === 'object') {
    val = toEcidString(get(inner, ECID_PATH_DEMOEMEA)) || getProfileEcidFromObject(inner);
    if (val && val.length >= 10) return val;
  }
  if (entity.attributes && typeof entity.attributes === 'object') {
    for (const v of Object.values(entity.attributes)) {
      val = getProfileEcidFromObject(v);
      if (val) return val;
    }
  }
  for (const [key, v] of Object.entries(entity)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      val = getProfileEcidFromObject(v);
      if (val) return val;
      if (key === '_demoemea' || (typeof key === 'string' && key.toLowerCase().includes('demoemea'))) {
        val = get(v, 'identification.core.ecid') ?? get(v, 'identification.core.ECID');
        val = toEcidString(val);
        if (val && val.length >= 10) return val;
      }
    }
  }
  return null;
}

/** Return first ECID found in flattened profile rows. Prefers path _demoemea.identification.core.ecid. */
function getFirstEcidFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const normalizeVal = (v) => (v != null && typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const looksLikeEcid = (v) => {
    const s = normalizeVal(v);
    return s.length >= 10 && /^\d+$/.test(s);
  };
  const pathNorm = (p) => (p && typeof p === 'string' ? p.trim().toLowerCase() : '');
  const isDemoemeaEcidPath = (p) => pathNorm(p) === '_demoemea.identification.core.ecid' || (p && p.endsWith('.identification.core.ecid'));
  let fromDemoemea = null;
  let firstAny = null;
  for (const r of rows) {
    const val = normalizeVal(r.value);
    if (!val || !looksLikeEcid(r.value)) continue;
    const p = r.path && typeof r.path === 'string' ? r.path : '';
    const attr = (r.attribute && typeof r.attribute === 'string' ? r.attribute : '').toLowerCase();
    const isEcid = isDemoemeaEcidPath(p) || p.toLowerCase().includes('ecid') || attr === 'ecid';
    if (!isEcid) continue;
    if (isDemoemeaEcidPath(p)) fromDemoemea = val;
    if (firstAny == null) firstAny = val;
  }
  return fromDemoemea != null ? fromDemoemea : firstAny;
}

/**
 * Flatten entity into rows for ATTRIBUTE / DISPLAY NAME / VALUE / PATH table.
 * path = full dot path (e.g. _demoemea.identification.core.email).
 * attribute = last segment (e.g. email). displayName = humanized attribute.
 */
function flattenEntityToTableRows(obj, prefix = '') {
  const rows = [];
  if (obj === null || typeof obj === 'undefined') {
    if (prefix) {
      const attr = prefix.split('.').pop();
      rows.push({ attribute: attr, displayName: humanize(attr), value: String(obj), path: prefix });
    }
    return rows;
  }
  if (typeof obj !== 'object') {
    const attr = prefix ? prefix.split('.').pop() : '';
    rows.push({ attribute: attr, displayName: humanize(attr), value: String(obj), path: prefix });
    return rows;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        rows.push(...flattenEntityToTableRows(item, path));
      } else {
        const attr = path.split('.').pop();
        rows.push({ attribute: attr, displayName: humanize(attr), value: item == null ? '' : String(item), path });
      }
    });
    return rows;
  }
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
      rows.push(...flattenEntityToTableRows(value, path));
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        const subPath = `${path}.${i}`;
        const attrForPath = (p) => (p && /\.\d+$/.test(p) ? p.split('.').slice(-2).join('.') : (p || '').split('.').pop());
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          rows.push(...flattenEntityToTableRows(item, subPath));
        } else {
          const attr = attrForPath(subPath);
          rows.push({ attribute: attr, displayName: humanize(attr), value: item == null ? '' : String(item), path: subPath });
        }
      });
    } else {
      const attr = path && /\.\d+$/.test(path) ? path.split('.').slice(-2).join('.') : key;
      rows.push({ attribute: attr, displayName: humanize(attr), value: value == null ? '' : String(value), path });
    }
  }
  return rows;
}

function humanize(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/[._](.)/g, (_, c) => ' ' + c.toUpperCase())
    .trim() || str;
}

function listAttributePaths(obj, prefix = '') {
  const paths = [];
  if (obj === null || typeof obj !== 'object') {
    if (prefix) paths.push(prefix);
    return paths;
  }
  if (Array.isArray(obj)) {
    paths.push(prefix || '(array)');
    return paths;
  }
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
      paths.push(...listAttributePaths(value, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/** optInOut._channels: all supported channel keys and allowed values (in, out, not_provided). */
const OPTINOUT_CHANNELS = ['email', 'sms', 'push', 'phone', 'directMail', 'whatsapp', 'facebookFeed', 'web', 'mobileApp', 'twitterFeed'];
const OPTINOUT_VALUES = ['in', 'out', 'not_provided'];

/**
 * Find the object that contains optInOut/consents. Profile API may return entity at root,
 * or nested under entity.attributes (consents and optInOut as separate keys), or under a schema-keyed object.
 */
function getProfileForConsent(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj.optInOut != null || (obj.consents?.marketing != null)) return obj;
  if (obj.attributes && typeof obj.attributes === 'object') {
    const att = obj.attributes;
    if (att.consents != null || att.optInOut != null) {
      return {
        consents: att.consents ?? obj.consents,
        optInOut: att.optInOut ?? obj.optInOut,
      };
    }
    for (const v of Object.values(att)) {
      if (v && typeof v === 'object' && (v.optInOut != null || v.consents?.marketing != null)) {
        return v;
      }
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && (v.optInOut != null || v.consents?.marketing != null)) {
      return v;
    }
  }
  return obj;
}

/** Map raw profile value (y, n, in, out, VI, etc.) to radio value in/out/not_provided. */
function normalizeChannelValue(raw) {
  if (raw == null || typeof raw !== 'string') return 'not_provided';
  const v = raw.toLowerCase().trim();
  if (v === 'in' || v === 'y' || v === 'yes' || v === 'vi') return 'in';
  if (v === 'out' || v === 'n' || v === 'no') return 'out';
  if (v === 'not_provided') return 'not_provided';
  return 'not_provided';
}

/** Alternate schema key names for consents.marketing (e.g. direct_mail vs directMail). */
const MARKETING_CHANNEL_ALIASES = {
  directMail: ['directMail', 'direct_mail'],
  mobileApp: ['mobileApp', 'mobile_app'],
  facebookFeed: ['facebookFeed', 'facebook_feed'],
  twitterFeed: ['twitterFeed', 'twitter_feed'],
  /** XDM uses camelCase whatsApp; optInOut._channels uses lowercase whatsapp */
  whatsapp: ['whatsApp', 'whatsapp'],
};

/**
 * Get consents.marketing.preferred from profile (entity, attributes, or nested).
 */
function getPreferredMarketingChannel(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const from = (obj) => {
    const p = obj?.consents?.marketing?.preferred;
    return p != null && typeof p === 'string' ? String(p).toLowerCase().trim() : null;
  };
  let v = from(entity);
  if (v) return v;
  if (entity.attributes && typeof entity.attributes === 'object') {
    for (const att of Object.values(entity.attributes)) {
      if (att && typeof att === 'object') {
        v = from(att);
        if (v) return v;
      }
    }
  }
  for (const val of Object.values(entity)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      v = from(val);
      if (v) return v;
    }
  }
  return null;
}

/**
 * Get raw channel value from profile: optInOut._channels first, then consents.marketing.<key>.val (Y/N).
 */
function getChannelRawValue(entity, key) {
  const fromChannels = entity.optInOut?._channels?.[key];
  if (fromChannels != null && typeof fromChannels === 'string') return fromChannels;
  const marketing = entity.consents?.marketing;
  if (!marketing || typeof marketing !== 'object') return null;
  const keysToTry = MARKETING_CHANNEL_ALIASES[key] || [key];
  for (const k of keysToTry) {
    const ch = marketing[k];
    if (ch != null) {
      const val = typeof ch === 'object' ? (ch.val ?? ch.consentValue) : ch;
      if (val != null && typeof val === 'string') return val;
    }
  }
  return null;
}

/** Map consent val (y, n, dn, etc.) to radio value y/n/na. */
function toConsentRadio(val) {
  if (val == null || typeof val !== 'string') return 'na';
  const v = val.toLowerCase().trim();
  if (v === 'y' || v === 'yes') return 'y';
  if (v === 'n' || v === 'no' || v === 'dn') return 'n';
  return 'na';
}

/**
 * Extract all consent fields from profile for the consent form radios.
 * Uses getProfileForConsent so we read from the resolved profile (entity or attributes).
 */
function extractConsents(entity) {
  const result = {
    marketingConsent: null,
    channelOptInOut: null,
    channels: {},
    dataCollection: 'na',
    dataSharing: 'na',
    contentPersonalization: 'na',
  };
  if (!entity || typeof entity !== 'object') return result;

  const profile = getProfileForConsent(entity);
  const c = profile?.consents;
  if (c) {
    const collectVal = c.collect?.val ?? c.collect?.consentValue;
    result.dataCollection = toConsentRadio(collectVal != null ? String(collectVal) : null);
    const shareVal = c.share?.val ?? c.share?.consentValue;
    result.dataSharing = toConsentRadio(shareVal != null ? String(shareVal) : null);
    const personalizeVal = c.personalize?.content?.val ?? c.personalize?.val ?? c.personalize?.consentValue;
    result.contentPersonalization = toConsentRadio(personalizeVal != null ? String(personalizeVal) : null);
  }

  const marketing = profile?.consents?.marketing ?? c?.marketing;
  if (marketing && typeof marketing === 'object') {
    const rawVal = marketing.val ?? marketing.consentValue ?? marketing.any?.val;
    if (rawVal != null && typeof rawVal === 'string') {
      const v = rawVal.toLowerCase();
      result.marketingConsent = v === 'y' || v === 'yes' ? 'Y' : v === 'n' || v === 'no' ? 'N' : null;
    }
  }

  const channelVals = [];
  for (const key of OPTINOUT_CHANNELS) {
    const raw = getChannelRawValue(profile || entity, key);
    const normalized = normalizeChannelValue(raw);
    result.channels[key] = normalized;
    channelVals.push(normalized);
  }
  if (channelVals.length > 0) {
    const allIn = channelVals.every((v) => v === 'in');
    const allOut = channelVals.every((v) => v === 'out');
    if (allIn) result.channelOptInOut = 'In';
    else if (allOut) result.channelOptInOut = 'Out';
  }

  return result;
}

/**
 * Build XDM profile fragment: identityMap + general consents + consents.marketing + optInOut._channels.
 * If channels object is provided, use it for _channels; otherwise use channelOptInOut for all.
 */
function buildConsentXdm(email, {
  marketingConsent,
  channelOptInOut,
  channels,
  dataCollection,
  dataSharing,
  contentPersonalization,
}) {
  const val = marketingConsent != null ? (marketingConsent.toUpperCase() === 'Y' ? 'y' : 'n') : 'y';
  const defaultChannelVal =
    channelOptInOut != null && channelOptInOut.toLowerCase() === 'out' ? 'out' : 'in';
  const toYorN = (v) => (v != null && String(v).toLowerCase() === 'y' ? 'y' : 'n');
  const channelYn = defaultChannelVal === 'out' ? 'n' : 'y';
  const marketingNow = new Date().toISOString();
  const marketing = {
    val,
    // Required by many Data Prep mappings (matches XDM consents.marketing.any)
    any: { val, reason: 'Profile streaming default', time: marketingNow },
    preferred: 'email',
    email: { val: channelYn },
    sms: { val: channelYn },
    push: { val: channelYn },
    call: { val: channelYn },
    whatsApp: { val: channelYn },
    fax: { val: channelYn },
    postalMail: { val: channelYn },
    commercialEmail: { val: channelYn },
  };
  const _channels = {};
  if (channels && typeof channels === 'object' && Object.keys(channels).length > 0) {
    for (const key of OPTINOUT_CHANNELS) {
      const v = channels[key];
      _channels[key] =
        v === 'in' || v === 'out' || v === 'not_provided' ? v : defaultChannelVal;
    }
  } else {
    for (const key of OPTINOUT_CHANNELS) {
      _channels[key] = defaultChannelVal;
    }
  }
  const consents = {
    marketing,
    ...(dataCollection != null && { collect: { val: toYorN(dataCollection) } }),
    ...(dataSharing != null && { share: { val: toYorN(dataSharing) } }),
    ...(contentPersonalization != null && { personalize: { content: { val: toYorN(contentPersonalization) } } }),
  };
  return {
    identityMap: { Email: [{ id: email, primary: true }] },
    consents,
    optInOut: { _channels },
    // Required by demoemea schema: tenant object (DCVS-1106-400 expects "demoemea" key)
    _demoemea: {
      identification: { core: { email } },
      consents,
      optInOut: { _channels },
    },
    demoemea: {
      identification: { core: { email } },
      consents,
      optInOut: { _channels },
    },
  };
}

/**
 * Default top-level consents + optInOut for profile streaming (generate/update).
 * Many Data Prep flows require paths like consents.marketing.call.val on every record.
 */
function buildDefaultProfileStreamingConsentFields(email) {
  const fragment = buildConsentXdm(email, {
    marketingConsent: 'Y',
    channelOptInOut: 'In',
    channels: undefined,
    dataCollection: 'Y',
    dataSharing: 'Y',
    contentPersonalization: 'Y',
  });
  return { consents: fragment.consents, optInOut: fragment.optInOut };
}

/** Dataset/schema IDs for DCS envelope mode (AEP_PROFILE_STREAMING_ENVELOPE=1). Bare Postman-style bodies omit these. */
const PROFILE_STREAM_DATASET_ID = process.env.AEP_PROFILE_DATASET_ID || '699323ce1b3a85affd7095fc';
const PROFILE_STREAM_SCHEMA_ID =
  process.env.AEP_PROFILE_SCHEMA_ID ||
  'https://ns.adobe.com/demoemea/schemas/a951877632f590031b11072842a80e09818b31874d291cec';
const PROFILE_STREAM_SCHEMA_CONTENT_TYPE = 'application/vnd.adobe.xed-full+json;version=1.0';

/**
 * Postman-style bare JSON includes `_demoemea` plus root `identityMap` (Email + ECID) so the dataflow can
 * resolve the profile; envelope mode builds the same identities inside `body.xdmEntity`.
 * Envelope (header + body.xdmEntity) when AEP_PROFILE_STREAMING_ENVELOPE=1, or legacy AEP_PROFILE_STREAMING_BARE=0.
 */
function profileStreamingUseEnvelope() {
  const bare = (process.env.AEP_PROFILE_STREAMING_BARE || '').toLowerCase();
  if (bare === '1' || bare === 'true' || bare === 'yes') return false;
  const env = (process.env.AEP_PROFILE_STREAMING_ENVELOPE || '').toLowerCase();
  if (env === '1' || env === 'true' || env === 'yes') return true;
  if (bare === '0' || bare === 'false' || bare === 'no') return true;
  return false;
}

/**
 * XDM record sent inside envelope.body.xdmEntity: identityMap + tenant mixin (and lowercase alias for demoemea).
 */
function buildProfileXdmEntityForStream(tenantPayload, email, ecid, xdmKey, rootProfileFields) {
  const key = (xdmKey && String(xdmKey).trim()) || '_demoemea';
  const { consents, optInOut } = buildDefaultProfileStreamingConsentFields(email);
  const roots = rootProfileFields && typeof rootProfileFields === 'object' ? rootProfileFields : {};
  const entity = {
    identityMap: {
      Email: [{ id: email, primary: true }],
      ECID: [{ id: String(ecid), primary: false }],
    },
    consents,
    optInOut,
    ...roots,
  };
  entity[key] = tenantPayload;
  if (key === '_demoemea') {
    entity.demoemea = tenantPayload;
  }
  return entity;
}

function buildProfileStreamingEnvelope(xdmEntity, orgId, sourceLabel) {
  return {
    header: {
      schemaRef: {
        id: PROFILE_STREAM_SCHEMA_ID,
        contentType: PROFILE_STREAM_SCHEMA_CONTENT_TYPE,
      },
      imsOrgId: orgId,
      datasetId: PROFILE_STREAM_DATASET_ID,
      source: { name: sourceLabel || 'Profile Viewer' },
    },
    body: {
      xdmMeta: {
        schemaRef: {
          id: PROFILE_STREAM_SCHEMA_ID,
          contentType: PROFILE_STREAM_SCHEMA_CONTENT_TYPE,
        },
      },
      xdmEntity,
    },
  };
}

/**
 * @param {Record<string, unknown>} [rootProfileFields] — XDM root mixins (e.g. telecomSubscription) beside the tenant key.
 * @returns {{ payload: object, format: 'envelope' | 'bare' }}
 */
function buildProfileStreamPayload(demoemeaTenantObject, email, ecid, xdmKey, orgId, sourceLabel, rootProfileFields) {
  const roots = rootProfileFields && typeof rootProfileFields === 'object' ? rootProfileFields : {};
  const hasRoots = Object.keys(roots).length > 0;
  if (!profileStreamingUseEnvelope()) {
    const k = (xdmKey && String(xdmKey).trim()) || '_demoemea';
    const { consents, optInOut } = buildDefaultProfileStreamingConsentFields(email);
    return {
      payload: {
        identityMap: {
          Email: [{ id: email, primary: true }],
          ECID: [{ id: String(ecid), primary: false }],
        },
        [k]: demoemeaTenantObject,
        consents,
        optInOut,
        ...(hasRoots ? roots : {}),
      },
      format: 'bare',
    };
  }
  const xdmEntity = buildProfileXdmEntityForStream(demoemeaTenantObject, email, ecid, xdmKey, hasRoots ? roots : undefined);
  return {
    payload: buildProfileStreamingEnvelope(xdmEntity, orgId, sourceLabel),
    format: 'envelope',
  };
}

async function getProfileByEmail(email, sandboxOverride) {
  const { token, config, cfg } = await getAuthForSandbox(sandboxOverride);
  const params = new URLSearchParams({
    'schema.name': '_xdm.context.profile',
    entityId: email,
    entityIdNS: 'email',
  });
  const url = `${PROFILE_API_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': config.sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error_description || data.title || res.statusText;
    throw new Error(msg || `Profile API ${res.status}`);
  }
  return data;
}

/** ECID from identityMap when merged profile view omits _demoemea.identification.core. */
function getEcidFromEntityIdentityMap(entity) {
  if (!entity || typeof entity !== 'object' || !entity.identityMap || typeof entity.identityMap !== 'object') return null;
  for (const key of ['ECID', 'ecid', 'ECIDs']) {
    const arr = entity.identityMap[key];
    if (!Array.isArray(arr)) continue;
    const first = arr.find((x) => x && x.id != null);
    if (first) {
      const s = ensureSingleEcid(first.id);
      if (s && String(s).length >= 10) return s;
    }
  }
  return null;
}

/**
 * Scan Profile Access API payload (one or more entity buckets) for an ECID.
 */
function findEcidInProfileAccessPayload(data) {
  if (!data || typeof data !== 'object') return null;
  const keys = Object.keys(data).filter((k) => !k.startsWith('_'));
  for (const id of keys) {
    const block = data[id];
    if (!block || typeof block !== 'object') continue;
    const entity = block.entity ?? block;
    if (!entity || typeof entity !== 'object') continue;
    const fromPaths = getProfileEcid(entity);
    if (fromPaths) return ensureSingleEcid(fromPaths);
    const fromMap = getEcidFromEntityIdentityMap(entity);
    if (fromMap) return fromMap;
    const rows = flattenEntityToTableRows(entity);
    const fromRows = getFirstEcidFromRows(rows);
    if (fromRows) return ensureSingleEcid(fromRows);
  }
  return null;
}

/**
 * Non-throwing fetch for merge-by-email. Tries identity namespaces (Email vs email varies by sandbox).
 * @returns {{ ecid: string | null, diagnostics: object }}
 */
async function resolveExistingEcidForProfileMerge(email, sandboxOverride) {
  const rawNs = (process.env.AEP_PROFILE_MERGE_ENTITY_ID_NS || '').trim();
  const namespaces = rawNs
    ? rawNs.split(',').map((s) => s.trim()).filter(Boolean)
    : ['Email', 'email'];
  const trimmed = (email || '').trim();
  const emailVariants = [...new Set([trimmed, trimmed.toLowerCase()].filter(Boolean))];
  const diagnostics = { namespacesAttempted: namespaces, entityIdsAttempted: emailVariants, attempts: [] };
  const { token, config, cfg } = await getAuthForSandbox(sandboxOverride);
  const baseHeaders = {
    'Authorization': `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': config.sandboxName,
  };

  for (const entityId of emailVariants) {
    for (const entityIdNS of namespaces) {
      const params = new URLSearchParams({
        'schema.name': '_xdm.context.profile',
        entityId,
        entityIdNS,
      });
      const url = `${PROFILE_API_BASE}?${params.toString()}`;
      const res = await fetch(url, { method: 'GET', headers: baseHeaders });
      const data = await res.json().catch(() => ({}));
      const attempt = { entityId, entityIdNS, httpStatus: res.status };
      if (!res.ok) {
        attempt.error = data.message || data.title || res.statusText || `HTTP ${res.status}`;
        diagnostics.attempts.push(attempt);
        continue;
      }
      const ecid = findEcidInProfileAccessPayload(data);
      attempt.topLevelKeys = Object.keys(data || {}).filter((k) => !k.startsWith('_')).slice(0, 8);
      attempt.foundEcid = Boolean(ecid);
      diagnostics.attempts.push(attempt);
      if (ecid) {
        diagnostics.usedNamespace = entityIdNS;
        diagnostics.usedEntityId = entityId;
        return { ecid: ensureSingleEcid(ecid), diagnostics };
      }
    }
  }
  diagnostics.message =
    'Profile Access returned no ECID in the response. Try AEP_PROFILE_MERGE_ENTITY_ID_NS (comma-separated) with your sandbox email namespace code from Identity.';
  return { ecid: null, diagnostics };
}

/**
 * Fetch profile with related experience events in one call.
 * GET https://platform.adobe.io/data/core/ups/access/entities?schema.name=_xdm.context.profile&entityId=...&entityIdNS=email&relatedEntities=experienceEvents&limit=...
 */
async function getProfileWithExperienceEvents(email, limit = 50, sandboxOverride) {
  const { token, config, cfg } = await getAuthForSandbox(sandboxOverride);
  const params = new URLSearchParams({
    'schema.name': '_xdm.context.profile',
    entityId: email,
    entityIdNS: 'email',
    relatedEntities: 'experienceEvents',
    limit: String(limit),
  });
  const url = `${ACCESS_ENTITIES_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': config.sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error_description || data.title || res.statusText;
    throw new Error(msg || `Profile API (profile + events) ${res.status}`);
  }
  return data;
}

/**
 * Extract experience events from profile API response (with relatedEntities=experienceEvents).
 * Handles shapes: entityId -> { entity, relatedEntities: { experienceEvents: { entities/children/... } } } or similar.
 */
function extractExperienceEventsFromProfileResponse(response) {
  const out = [];
  const pushEvent = (item) => {
    const entity = item.entity ?? item;
    const ts = item.timestamp ?? entity?.timestamp;
    const tsMs = ts == null ? null : (typeof ts === 'number' ? ts : new Date(ts).getTime());
    const rows = flattenEntityToTableRows(entity).sort((a, b) => (a.path || '').localeCompare(b.path || ''));
    out.push({
      entityId: item.entityId ?? item.id ?? '',
      timestamp: isNaN(tsMs) ? null : tsMs,
      eventName: deriveEventName(entity),
      rows,
    });
  };

  const keys = Object.keys(response || {}).filter((k) => !k.startsWith('_'));
  for (const entityId of keys) {
    const block = response[entityId];
    if (!block || typeof block !== 'object') continue;
    const related = block.relatedEntities || block.relatedEntityIds;
    const exp = related?.experienceEvents ?? related?.experienceevents;
    if (!exp) continue;
    const list = exp.entities ?? exp.children ?? exp.results ?? (Array.isArray(exp) ? exp : []);
    if (!Array.isArray(list)) continue;
    for (const item of list) pushEvent(item);
  }
  const topLevel = response?.experienceEvents ?? response?.timeSeriesEvents ?? response?.relatedEntities?.experienceEvents;
  if (out.length === 0 && topLevel) {
    const list = topLevel.entities ?? topLevel.children ?? (Array.isArray(topLevel) ? topLevel : []);
    if (Array.isArray(list)) for (const item of list) pushEvent(item);
  }
  return out.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

/**
 * Fetch experience events for a profile by identity (ECID or email).
 * GET https://platform.adobe.io/data/core/ups/access/entities?schema.name=_xdm.context.experienceevent&...
 * Fallback when getProfileWithExperienceEvents is not used or returns no events.
 */
async function getProfileExperienceEvents(relatedEntityId, relatedEntityIdNS = 'email', sandboxOverride) {
  const { token, config, cfg } = await getAuthForSandbox(sandboxOverride);
  const params = new URLSearchParams({
    'schema.name': '_xdm.context.experienceevent',
    'relatedSchema.name': '_xdm.context.profile',
    relatedEntityId: String(relatedEntityId),
    relatedEntityIdNS: String(relatedEntityIdNS),
    orderby: '-timestamp',
    limit: '50',
  });
  const url = `${ACCESS_ENTITIES_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': config.sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error_description || data.title || res.statusText;
    throw new Error(msg || `Profile API (events) ${res.status}`);
  }
  return data;
}

/** Derive a short event name from an experience event entity (e.g. web.webpagedetails.pageViews). */
function deriveEventName(entity) {
  if (!entity || typeof entity !== 'object') return 'Experience event';
  const e = entity;
  const eventType = e.eventType || e.eventTypeId;
  if (eventType) return String(eventType);
  const webName = get(e, 'web.webPageDetails.name') || get(e, 'web.webPageDetails.URL');
  if (webName) return String(webName);
  const implName = get(e, 'implementationDetails.name') || get(e, 'implementationDetails.environment');
  if (implName) return String(implName);
  const mobileName = get(e, 'mobile.messageProfile.name') || get(e, 'application.name');
  if (mobileName) return String(mobileName);
  const keys = Object.keys(e).filter((k) => !k.startsWith('_'));
  if (keys.length) {
    const first = keys[0];
    const sub = e[first] && typeof e[first] === 'object' && !Array.isArray(e[first]) ? Object.keys(e[first])[0] : null;
    if (sub) return `${first}.${sub}`;
    return first;
  }
  return 'Experience event';
}

/**
 * Run a Query Service query with parameters and poll until complete.
 * Returns the final query object. Note: AEP API typically does not include result rows in the response.
 */
async function runQueryService(sql, queryParameters = {}, sandboxOverride) {
  const { token, config, cfg } = await getAuthForSandbox(sandboxOverride);
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': config.sandboxName,
  };
  const body = {
    dbName: `${config.sandboxName}:all`,
    sql,
    ...(Object.keys(queryParameters).length ? { queryParameters } : {}),
  };
  const createRes = await fetch(`${QUERY_SERVICE_BASE}/queries`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    const msg = createData.message || createData.error_description || createData.title || createRes.statusText;
    throw new Error(msg || `Query Service ${createRes.status}`);
  }
  const queryId = createData.id;
  if (!queryId) throw new Error('Query Service did not return query id');

  const maxWaitMs = 120000;
  const pollIntervalMs = 2000;
  const start = Date.now();
  let last = createData;
  while (Date.now() - start < maxWaitMs) {
    if (last.state === 'SUCCESS' || last.state === 'FAILED' || last.state === 'CANCELLED') {
      return last;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const getRes = await fetch(`${QUERY_SERVICE_BASE}/queries/${queryId}`, { headers });
    last = await getRes.json().catch(() => ({}));
    if (!getRes.ok) throw new Error(last.message || `Query Service GET ${getRes.status}`);
  }
  return last;
}

/**
 * Try to get emails from AEP via Query Service (partial/wildcard).
 * Requires AEP_QUERY_PROFILE_DATASET_ID (dataset ID or qualified name).
 * Optional: AEP_QUERY_SEARCH_SQL custom SQL with $search parameter; otherwise uses default.
 * Returns { emails: string[], message?: string }.
 */
function quoteTableId(id) {
  if (!id) return id;
  return `"${String(id).replace(/"/g, '""')}"`;
}

/** Dataset ID = 24 hex chars. Query Service needs qualified name for table reference. */
const DATASET_ID_REGEX = /^[a-fA-F0-9]{24}$/;
const datasetTableNameCache = new Map();

async function resolveDatasetToTableName(datasetId) {
  if (!datasetId) return datasetId;
  if (datasetTableNameCache.has(datasetId)) return datasetTableNameCache.get(datasetId);
  if (!DATASET_ID_REGEX.test(datasetId.trim())) return datasetId;
  try {
    const { token, config } = await getAuth();
    const cfg = getConfig();
    const res = await fetch(`${CATALOG_BASE}/dataSets/${datasetId}?properties=qualifiedName,name`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': cfg.clientId,
        'x-gw-ims-org-id': config.orgId,
        'x-sandbox-name': config.sandboxName,
      },
    });
    const data = await res.json().catch(() => ({}));
    const name = res.ok ? (data.qualifiedName || data.name || datasetId) : datasetId;
    datasetTableNameCache.set(datasetId, name);
    return name;
  } catch {
    return datasetId;
  }
}

/** Catalog qualified name for the profile streaming dataset (shown in Profile update UI). */
async function getProfileStreamDatasetDisplayMeta() {
  const datasetId = PROFILE_STREAM_DATASET_ID;
  let datasetQualifiedName = datasetId;
  try {
    datasetQualifiedName = await resolveDatasetToTableName(datasetId);
  } catch {
    datasetQualifiedName = datasetId;
  }
  return { datasetId, datasetQualifiedName, schemaId: PROFILE_STREAM_SCHEMA_ID };
}

async function getTableRef(datasetId) {
  const tableName = await resolveDatasetToTableName(datasetId);
  return quoteTableId(tableName);
}

async function searchEmailsViaQueryService(q) {
  const datasetId = process.env.AEP_QUERY_PROFILE_DATASET_ID;
  if (!datasetId || !q) return { emails: [], message: 'AEP_QUERY_PROFILE_DATASET_ID not set.' };

  const tableRef = await getTableRef(datasetId);
  const customSql = process.env.AEP_QUERY_SEARCH_SQL;
  const sql = customSql
    ? customSql.replace(/\$table/g, tableRef)
    : `SELECT DISTINCT _demoemea.identification.core.email AS email FROM ${tableRef} WHERE LOWER(CAST(_demoemea.identification.core.email AS STRING)) LIKE LOWER('%' || $search || '%') LIMIT 200`;
  const queryParameters = { search: q };

  const result = await runQueryService(sql, queryParameters);
  if (result.state !== 'SUCCESS') {
    const errMsg = (result.errors && result.errors[0]) ? result.errors[0].message || String(result.errors[0]) : result.state;
    return { emails: [], message: `Query ${result.state}: ${errMsg}` };
  }

  const rowCount = result.rowCount ?? 0;
  const rows = result.rows || result.result || result.results;
  if (Array.isArray(rows) && rows.length > 0) {
    const emails = rows
      .map((r) => {
        if (!r || typeof r === 'string') return typeof r === 'string' ? r : null;
        return (
          r.email ??
          r['_demoemea.identification.core.email'] ??
          r._demoemea_identification_core_email ??
          r.person_email_address ??
          r['person.email.address'] ??
          null
        );
      })
      .filter(Boolean);
    return { emails: [...new Set(emails)] };
  }
  return {
    emails: [],
    message: `Query completed (${rowCount} rows). The Query Service API did not return result rows in the response. Ensure AEP_QUERY_PROFILE_DATASET_ID is set (e.g. demo_system_website_profile_dataset_global_v1_2).`,
  };
}

/** Valid XDM attribute path: letters, numbers, underscore, dot. */
const ATTR_PATH_REGEX = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

/**
 * Search profiles by attribute value via Query Service.
 * Returns { emails: string[], message?: string }.
 */
async function searchProfilesByAttribute(attrPath, value, match = 'exact', sandboxOverride) {
  const datasetId = process.env.AEP_QUERY_PROFILE_DATASET_ID;
  if (!datasetId) return { emails: [], message: 'AEP_QUERY_PROFILE_DATASET_ID not set.' };
  if (!attrPath || !ATTR_PATH_REGEX.test(attrPath)) {
    return { emails: [], message: 'Invalid attribute path. Use only letters, numbers, underscore, dot (e.g. loyalty.tier or _demoemea.identification.core.email).' };
  }
  if (!value || typeof value !== 'string') return { emails: [], message: 'Value is required.' };

  const tableRef = await getTableRef(datasetId);
  const condition = match === 'contains'
    ? `LOWER(CAST(${attrPath} AS STRING)) LIKE LOWER('%' || $value || '%')`
    : `CAST(${attrPath} AS STRING) = $value`;
  const sql = `SELECT DISTINCT _demoemea.identification.core.email AS email FROM ${tableRef} WHERE ${condition} LIMIT 200`;
  const queryParameters = { value: value.trim() };

  const result = await runQueryService(sql, queryParameters, sandboxOverride);
  if (result.state !== 'SUCCESS') {
    const errMsg = (result.errors && result.errors[0]) ? result.errors[0].message || String(result.errors[0]) : result.state;
    const hint = (result.state === 'SUBMITTED' || result.state === 'RUNNING')
      ? ' Query may be queued or the API may not complete for this dataset. Run the SQL in AEP Query Editor (Data Management → Queries) to verify.'
      : '';
    return { emails: [], message: `Query ${result.state}: ${errMsg}.${hint}` };
  }

  const rowCount = result.rowCount ?? 0;
  const rows = result.rows || result.result || result.results;
  if (Array.isArray(rows) && rows.length > 0) {
    const emails = rows
      .map((r) => {
        if (!r || typeof r === 'string') return typeof r === 'string' ? r : null;
        return (
          r.email ??
          r['_demoemea.identification.core.email'] ??
          r._demoemea_identification_core_email ??
          r.person_email_address ??
          r['person.email.address'] ??
          null
        );
      })
      .filter(Boolean);
    return { emails: [...new Set(emails)] };
  }
  return {
    emails: [],
    message: `Query completed (${rowCount} rows). The Query Service API did not return result rows.`,
  };
}

/**
 * Fetch events for a profile from the events dataset via Query Service.
 * Uses table AEP_QUERY_EVENTS_DATASET_ID (default api_operational_events_dataset).
 * Optional: AEP_QUERY_EVENTS_EMAIL_COLUMN (default person.workEmail.address), AEP_QUERY_EVENTS_TIMESTAMP_COLUMN (default timestamp).
 */
async function getEventsFromQueryService(email, sandboxOverride) {
  const datasetId = process.env.AEP_QUERY_EVENTS_DATASET_ID || 'api_operational_events_dataset';
  const emailCol = process.env.AEP_QUERY_EVENTS_EMAIL_COLUMN || 'person.workEmail.address';
  const tsCol = process.env.AEP_QUERY_EVENTS_TIMESTAMP_COLUMN || 'timestamp';
  const tableRef = await getTableRef(datasetId);
  const emailColQuoted = emailCol.includes('.') ? `"${emailCol.replace(/"/g, '""')}"` : emailCol;
  const tsColQuoted = tsCol.includes('.') ? `"${tsCol.replace(/"/g, '""')}"` : tsCol;
  const sql = `SELECT * FROM ${tableRef} WHERE LOWER(CAST(${emailColQuoted} AS STRING)) = LOWER($email) ORDER BY ${tsColQuoted} DESC NULLS LAST LIMIT 50`;
  const result = await runQueryService(sql, { email }, sandboxOverride);
  if (result.state !== 'SUCCESS') {
    const errMsg = (result.errors && result.errors[0]) ? result.errors[0].message || String(result.errors[0]) : result.state;
    throw new Error(`Events query ${result.state}: ${errMsg}`);
  }
  const rows = result.rows || result.result || result.results || [];
  return Array.isArray(rows) ? rows : [];
}

/** Turn a flat event row (key-value from Query Service) into { eventName, timestamp, rows } for the Events tab. */
function eventRowToEventPayload(row, index) {
  if (!row || typeof row !== 'object') return { entityId: String(index), timestamp: null, eventName: 'Event', rows: [] };
  const tsRaw = row.timestamp ?? row._id ?? row.eventTimestamp;
  const timestamp = tsRaw == null ? null : (typeof tsRaw === 'number' ? tsRaw : new Date(tsRaw).getTime());
  const eventName =
    row.eventType ?? row.name ?? row._type ?? row['eventType'] ?? row['@type'] ?? deriveEventName(row) ?? 'Event';
  const pathToAttr = (path) => {
    const last = path.split(/[._]/).filter(Boolean).pop() || path;
    return last.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim() || last;
  };
  const rows = Object.entries(row)
    .filter(([, v]) => v !== undefined)
    .map(([path, value]) => ({
      attribute: path.split(/[._]/).pop() || path,
      displayName: pathToAttr(path),
      value: value == null ? '' : String(value),
      path,
    }))
    .sort((a, b) => (a.path || '').localeCompare(b.path || ''));
  return {
    entityId: String(row._id ?? index),
    timestamp: isNaN(timestamp) ? null : timestamp,
    eventName: String(eventName),
    rows,
  };
}

const app = express();
app.use(express.json());

// Firebase hosting (upload, deploy, rename) — register early so /api/hosting/* is always available
registerFirebaseHostingRoutes(app);
// Rename is bound here too so POST /api/hosting/rename always exists (avoids "Cannot POST" if the module stack is stale).
app.post('/api/hosting/rename', hostingRenameHandler);

// API routes first so /api/* never falls through to static (avoids HTML 404)

/** GET /api/sandboxes – list all sandboxes available to the authenticated user (paginated fetch). */
app.get('/api/sandboxes', async (req, res) => {
  try {
    const { token, config, cfg } = await getAuthForSandbox();
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
    };
    const all = [];
    let offset = 0;
    const limit = 100;
    for (;;) {
      const url = `${SANDBOX_MANAGEMENT_BASE}/?limit=${limit}&offset=${offset}`;
      const apiRes = await fetch(url, { method: 'GET', headers });
      const data = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ error: data.message || data.error_description || apiRes.statusText, sandboxes: [] });
      }
      const batch = data.sandboxes || [];
      all.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
    }
    const sandboxes = all
      .filter((s) => s.state === 'active')
      .map((s) => ({ name: s.name, title: s.title || s.name, type: s.type || '' }));
    res.json({ sandboxes });
  } catch (err) {
    res.status(500).json({ error: err.message, sandboxes: [] });
  }
});

app.get('/api/profile', async (req, res) => {
  const email = (req.query.email || '').trim();
  const sandbox = (req.query.sandbox || '').trim() || undefined;
  if (!email) {
    return res.status(400).json({ error: 'Missing email. Use ?email=user@example.com' });
  }
  try {
    const response = await getProfileByEmail(email, sandbox);
    const keys = Object.keys(response).filter((k) => !k.startsWith('_'));
    if (keys.length === 0) {
      return res.json({ email, found: false, attributes: [], entity: null, entityId: null });
    }
    const entityId = keys[0];
    const entityPayload = response[entityId];
    const entity = entityPayload?.entity ?? entityPayload;
    if (!entity || (typeof entity === 'object' && Object.keys(entity).length === 0)) {
      return res.json({ email, found: true, attributes: [], entity: null, entityId, raw: response });
    }
    const attributes = listAttributePaths(entity).sort();
    res.json({ email, found: true, attributes, entity, entityId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Debug: fetch profile and return raw response + key structure (for testing ECID path). */
app.get('/api/profile/raw', async (req, res) => {
  const email = (req.query.email || 'kirkham+media-1@adobetest.com').trim();
  try {
    const response = await getProfileByEmail(email);
    const topLevelKeys = Object.keys(response || {});
    const keys = topLevelKeys.filter((k) => !k.startsWith('_'));
    const entityId = keys[0] || null;
    const payload = entityId ? response[entityId] : null;
    const entity = payload?.entity ?? payload;
    const entityKeys = entity && typeof entity === 'object' ? Object.keys(entity) : [];
    const rows = entity ? flattenEntityToTableRows(entity) : [];
    const ecidRows = rows.filter((r) => (r.path && r.path.toLowerCase().includes('ecid')) || (r.attribute && r.attribute.toLowerCase() === 'ecid'));
    const demoemeaPaths = entity && entity._demoemea ? (() => {
      const core = entity._demoemea?.identification?.core;
      return { hasDemoemea: true, hasIdentification: !!entity._demoemea.identification, hasCore: !!core, ecid: core?.ecid ?? core?.ECID };
    })() : { hasDemoemea: false };
    res.json({
      email,
      topLevelKeys,
      entityId,
      payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
      entityKeys,
      demoemeaPaths,
      ecidRows: ecidRows.map((r) => ({ path: r.path, attribute: r.attribute, value: r.value })),
      sampleFields: rows.slice(0, 30).map((r) => ({ path: r.path, attribute: r.attribute, value: String(r.value).slice(0, 80) })),
      raw: response,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Returns profile as table rows (ATTRIBUTE, DISPLAY NAME, VALUE, PATH) for the detail page. */
app.get('/api/profile/table', async (req, res) => {
  const email = (req.query.email || '').trim();
  const sandbox = (req.query.sandbox || '').trim() || undefined;
  if (!email) {
    return res.status(400).json({ error: 'Missing email. Use ?email=user@example.com' });
  }
  try {
    const response = await getProfileByEmail(email, sandbox);
    const keys = Object.keys(response).filter((k) => !k.startsWith('_'));
    if (keys.length === 0) {
      return res.json({ email, found: false, rows: [] });
    }
    const entityId = keys[0];
    const entityPayload = response[entityId];
    const entity = entityPayload?.entity ?? entityPayload;
    if (!entity || (typeof entity === 'object' && Object.keys(entity).length === 0)) {
      return res.json({ email, found: true, rows: [], profileEmail: null, ecid: null, entityId: entityId || null, lastModified: null });
    }
    const rows = flattenEntityToTableRows(entity).sort((a, b) => (a.path || '').localeCompare(b.path || ''));
    let profileEmail = getProfileEmail(entity) || getProfileEmail(entityPayload);
    const demoemeaEcid = entity?._demoemea?.identification?.core?.ecid ?? entity?._demoemea?.identification?.core?.ECID;
    let ecid =
      toEcidString(demoemeaEcid) ||
      toEcidString(get(entity, ECID_PATH_DEMOEMEA)) ||
      (entityPayload?.entity && toEcidString(entityPayload.entity._demoemea?.identification?.core?.ecid ?? entityPayload.entity._demoemea?.identification?.core?.ECID)) ||
      getProfileEcid(entity) ||
      getProfileEcid(entityPayload);
    if ((ecid == null || ecid === '') && rows.length) ecid = getFirstEcidFromRows(rows);
    if ((profileEmail == null || profileEmail === '') && rows.length) {
      const emailRow = rows.find((r) => r.path && (r.path.endsWith('.email') || r.attribute === 'email') && r.value);
      if (emailRow) profileEmail = emailRow.value;
    }
    if ((profileEmail == null || profileEmail === '') && email) profileEmail = email;
    if ((ecid == null || ecid === '') && rows.length) {
      const pathLower = (p) => (p && typeof p === 'string' ? p.toLowerCase() : '');
      const ecidRow = rows.find((r) => {
        const p = pathLower(r.path);
        const a = (r.attribute && typeof r.attribute === 'string' ? r.attribute.toLowerCase() : '');
        return (p.endsWith('.ecid') || a === 'ecid' || p.includes('ecid')) && r.value;
      });
      if (ecidRow) ecid = toEcidString(ecidRow.value) || ecidRow.value;
    }
    ecid = ensureSingleEcid(ecid);
    const lastModifiedAt =
      entity?.lastModifiedAt ??
      entityPayload?.lastModifiedAt ??
      null;
    res.json({
      email,
      found: true,
      rows,
      profileEmail: profileEmail || null,
      ecid: ecid && ecid.length >= 10 ? ecid : null,
      entityId: entityId || null,
      lastModified: lastModifiedAt ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/profile/events – events for a profile (by email). Prefers table api_operational_events_dataset via Query Service (set AEP_QUERY_EVENTS_DATASET_ID); else Profile Access API (requires CDP Ultimate). */
app.get('/api/profile/events', async (req, res) => {
  const email = (req.query.email || '').trim();
  const sandbox = (req.query.sandbox || '').trim() || undefined;
  if (!email) {
    return res.status(400).json({ error: 'Missing email. Use ?email=user@example.com', events: [] });
  }
  try {
    const eventsDatasetId = process.env.AEP_QUERY_EVENTS_DATASET_ID || 'api_operational_events_dataset';
    try {
      const rawRows = await getEventsFromQueryService(email, sandbox);
      const events = rawRows.map((row, i) => eventRowToEventPayload(row, i));
      return res.json({ email, events, source: 'query_service' });
    } catch (queryErr) {
      if (process.env.AEP_QUERY_EVENTS_DATASET_ID !== undefined && process.env.AEP_QUERY_EVENTS_DATASET_ID !== '') {
        return res.status(500).json({ error: queryErr.message, events: [] });
      }
    }

    const limit = Math.min(parseInt(process.env.AEP_PROFILE_EVENTS_LIMIT || '50', 10) || 50, 100);
    const profileWithEvents = await getProfileWithExperienceEvents(email, limit, sandbox);
    let events = extractExperienceEventsFromProfileResponse(profileWithEvents);
    if (events.length === 0) {
      const entityId = Object.keys(profileWithEvents).filter((k) => !k.startsWith('_'))[0];
      const entityPayload = entityId ? profileWithEvents[entityId] : null;
      const entity = entityPayload?.entity ?? entityPayload;
      const ecid =
        entity && (entity._demoemea?.identification?.core?.ecid ?? entity._demoemea?.identification?.core?.ECID != null)
          ? toEcidString(entity._demoemea.identification.core.ecid ?? entity._demoemea.identification.core.ECID)
          : null;
      const relatedId = ecid && ecid.length >= 10 ? ecid : email;
      const relatedNS = ecid && ecid.length >= 10 ? 'ECID' : 'email';
      const raw = await getProfileExperienceEvents(relatedId, relatedNS, sandbox);
      const children = raw.children || raw.results || [];
      events = children.map((child) => {
        const eventEntity = child.entity || child;
        const ts = child.timestamp != null ? child.timestamp : (eventEntity.timestamp ? new Date(eventEntity.timestamp).getTime() : null);
        const rows = flattenEntityToTableRows(eventEntity).sort((a, b) => (a.path || '').localeCompare(b.path || ''));
        return {
          entityId: child.entityId || child.id || '',
          timestamp: ts,
          eventName: deriveEventName(eventEntity),
          rows,
        };
      });
    }

    res.json({ email, events });
  } catch (err) {
    res.status(500).json({ error: err.message, events: [] });
  }
});

const DPS_BASE = 'https://platform.adobe.io/data/core/dps';
const CJM_CAMPAIGN_BASE = process.env.CJM_CAMPAIGN_BASE || 'https://journey.adobe.io/campaign/campaigns';
const CJM_JOURNEY_BASE = process.env.CJM_JOURNEY_BASE || 'https://journey.adobe.io/journey/journeys';

/** Look up campaign name from Journey Optimizer by campaign ID. */
const campaignNameCache = new Map();
async function getCampaignNameById(id) {
  if (!id || typeof id !== 'string' || !id.trim()) return null;
  const trimmed = id.trim();
  if (campaignNameCache.has(trimmed)) return campaignNameCache.get(trimmed);
  try {
    const { token, config } = await getAuth();
    const cfg = getConfig();
    const url = `${CJM_CAMPAIGN_BASE}/${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': cfg.clientId,
        'x-gw-ims-org-id': config.orgId,
        'x-sandbox-name': config.sandboxName,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      campaignNameCache.set(trimmed, null);
      return null;
    }
    const name = data.name ?? data.label ?? data.title ?? data['@id'] ?? null;
    campaignNameCache.set(trimmed, name);
    return name;
  } catch {
    campaignNameCache.set(trimmed, null);
    return null;
  }
}

/** Look up journey name from Journey Optimizer API, or from journeys table via Query Service if API returns 404. */
const journeyNameCache = new Map();
async function getJourneyNameById(id) {
  if (!id || typeof id !== 'string' || !id.trim()) return null;
  const trimmed = id.trim();
  if (journeyNameCache.has(trimmed)) return journeyNameCache.get(trimmed);
  // Check journey-names.json cache first (AJO system schema workaround – Query Service API doesn't return rows)
  if (journeyNamesCache) {
    const name = journeyNamesCache.byVersionId?.[trimmed] ?? journeyNamesCache.byJourneyId?.[trimmed];
    if (name) {
      journeyNameCache.set(trimmed, name);
      return name;
    }
  }
  try {
    const { token, config } = await getAuth();
    const cfg = getConfig();
    const url = `${CJM_JOURNEY_BASE}/${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': cfg.clientId,
        'x-gw-ims-org-id': config.orgId,
        'x-sandbox-name': config.sandboxName,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const name = data.name ?? data.label ?? data.title ?? data['@id'] ?? null;
      journeyNameCache.set(trimmed, name);
      return name;
    }
    if (res.status !== 404) {
      journeyNameCache.set(trimmed, null);
      return null;
    }
    const nameFromTable = await getJourneyNameFromJourneysTable(trimmed);
    journeyNameCache.set(trimmed, nameFromTable);
    return nameFromTable;
  } catch {
    journeyNameCache.set(trimmed, null);
    return null;
  }
}

/** Look up journey name from journeys table via Query Service. */
async function getJourneyNameFromJourneysTable(id) {
  try {
    const sql = `SELECT DISTINCT 
  _experience.journeyOrchestration.stepEvents.journeyID,
  _experience.journeyOrchestration.stepEvents.journeyVersionID,
  _experience.journeyOrchestration.stepEvents.name
FROM "journeys" 
WHERE _experience.journeyOrchestration.stepEvents.journeyVersionID = '${id.replace(/'/g, "''")}'
   OR _experience.journeyOrchestration.stepEvents.journeyID = '${id.replace(/'/g, "''")}'
LIMIT 5`;
    const result = await runQueryService(sql);
    if (result.state !== 'SUCCESS') return null;
    const rows = result.rows || result.result || result.results || [];
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.name ?? null;
  } catch {
    return null;
  }
}

/** Look up treatment/offer name from AEP Decisioning by treatmentID or offer item ID. */
async function getTreatmentNameById(id) {
  if (!id || typeof id !== 'string' || !id.trim()) return null;
  const trimmed = id.trim();
  try {
    const { token, config } = await getAuth();
    const cfg = getConfig();
    const url = `${DPS_BASE}/offer-items/${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': cfg.clientId,
        'x-gw-ims-org-id': config.orgId,
        'x-sandbox-name': config.sandboxName,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const item = data['_experience']?.decisioning?.decisionitem ?? data?.decisionitem ?? data;
    return item?.itemName ?? item?.name ?? null;
  } catch {
    return null;
  }
}

async function getAudienceNameById(id, sandboxOverride) {
  const { token, config, cfg } = await getAuthForSandbox(sandboxOverride);
  const url = `${AUDIENCES_BASE}/${id}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': config.sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return id;
  return data.name || data.audienceId || id;
}

async function getProfileAudiences(email, sandboxOverride) {
  const response = await getProfileByEmail(email, sandboxOverride);
  const keys = Object.keys(response || {}).filter((k) => !k.startsWith('_'));
  if (keys.length === 0) return { realized: [], exited: [] };
  const entityPayload = response[keys[0]];
  const entity = entityPayload?.entity ?? entityPayload;
  const segmentMembership = entity?.segmentMembership?.ups ?? entity?.segmentMembership ?? {};
  const entries = Object.entries(segmentMembership);
  const realized = [];
  const exited = [];
  const namePromises = entries.map(([segmentId]) => getAudienceNameById(segmentId, sandboxOverride));
  const names = await Promise.all(namePromises);
  entries.forEach(([segmentId, info], i) => {
    const status = info?.status ?? 'realized';
    const lastQualificationTime = info?.lastQualificationTime ?? null;
    const item = { segmentId, name: names[i], lastQualificationTime };
    if (status === 'realized') realized.push(item);
    else exited.push(item);
  });
  const sortByTime = (a, b) => {
    const ta = a.lastQualificationTime ? new Date(a.lastQualificationTime).getTime() : 0;
    const tb = b.lastQualificationTime ? new Date(b.lastQualificationTime).getTime() : 0;
    return tb - ta;
  };
  realized.sort(sortByTime);
  exited.sort(sortByTime);
  return { realized, exited };
}

/** GET /api/profile/audiences – audience membership for a profile (by email). */
app.get('/api/profile/audiences', async (req, res) => {
  const email = (req.query.email || '').trim();
  const sandbox = (req.query.sandbox || '').trim() || undefined;
  if (!email) {
    return res.status(400).json({ error: 'Missing email. Use ?email=user@example.com', realized: [], exited: [] });
  }
  try {
    const { realized, exited } = await getProfileAudiences(email, sandbox);
    res.json({ email, realized, exited });
  } catch (err) {
    res.status(500).json({ error: err.message, realized: [], exited: [] });
  }
});

/** GET /api/decisioning/treatment-name?id=... – look up treatment name from AEP Decisioning by treatmentID. */
app.get('/api/decisioning/treatment-name', async (req, res) => {
  const id = (req.query.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'Missing id. Use ?id=...', name: null });
  }
  try {
    const name = await getTreatmentNameById(id);
    res.json({ id, name });
  } catch (err) {
    res.status(500).json({ error: err.message, name: null });
  }
});

/** GET /api/campaign-name?id=... – look up campaign name from Journey Optimizer by campaign ID. */
app.get('/api/campaign-name', async (req, res) => {
  const id = (req.query.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'Missing id. Use ?id=...', name: null });
  }
  try {
    const name = await getCampaignNameById(id);
    res.json({ id, name });
  } catch (err) {
    res.status(500).json({ error: err.message, name: null });
  }
});

/** GET /api/journey-name?id=... – look up journey name from Journey Optimizer by journey version ID. */
app.get('/api/journey-name', async (req, res) => {
  const id = (req.query.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'Missing id. Use ?id=...', name: null });
  }
  try {
    const name = await getJourneyNameById(id);
    res.json({ id, name });
  } catch (err) {
    res.status(500).json({ error: err.message, name: null });
  }
});

/** GET /api/journeys – list journeys from journey-names.json cache (AJO system schema workaround). */
app.get('/api/journeys', (req, res) => {
  if (req.query.refresh === '1') loadJourneyNamesCache();
  if (!journeyNamesCache?.list?.length) {
    return res.json({
      journeys: [],
      message: 'No journey cache. Run: node sync-journey-names.js (see 01 Profile Query/) and export from Query Editor.',
    });
  }
  res.json({ journeys: journeyNamesCache.list, updated: journeyNamesCache.updated });
});

/** Partial-email search: AEP Query Service only (LIKE / contains). Requires AEP_QUERY_PROFILE_DATASET_ID. */
app.get('/api/profile/search', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) {
    return res.json({ profiles: [], message: undefined });
  }
  if (!process.env.AEP_QUERY_PROFILE_DATASET_ID) {
    return res.status(400).json({
      error: 'Search from AEP requires AEP_QUERY_PROFILE_DATASET_ID (profile dataset ID) in environment.',
      profiles: [],
    });
  }
  try {
    const { emails, message } = await searchEmailsViaQueryService(q);
    if (emails.length === 0) {
      return res.json({ profiles: [], message });
    }
    const profiles = [];
    const limit = 100;
    for (let i = 0; i < Math.min(emails.length, limit); i++) {
      const email = emails[i];
      try {
        const response = await getProfileByEmail(email);
        const keys = Object.keys(response).filter((k) => !k.startsWith('_'));
        if (keys.length === 0) {
          profiles.push({ firstName: '', lastName: '', email });
          continue;
        }
        const entityPayload = response[keys[0]];
        const entity = entityPayload?.entity ?? entityPayload;
        const { firstName, lastName } = getProfileNames(entity || {});
        profiles.push({ firstName, lastName, email });
      } catch {
        profiles.push({ firstName: '', lastName: '', email });
      }
    }
    res.json({ profiles, message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/profile/search-by-attribute/sql – return the SQL that would be run (for testing in Query Editor). */
app.get('/api/profile/search-by-attribute/sql', async (req, res) => {
  const attr = (req.query.attr || req.query.attribute || '').trim();
  const value = (req.query.value || '').trim();
  const match = (req.query.match || 'exact').toLowerCase() === 'contains' ? 'contains' : 'exact';
  const datasetId = process.env.AEP_QUERY_PROFILE_DATASET_ID;
  if (!attr || !value) {
    return res.status(400).json({ error: 'Missing attr and value.', sql: null });
  }
  if (!datasetId) {
    return res.status(400).json({ error: 'AEP_QUERY_PROFILE_DATASET_ID not set.', sql: null });
  }
  if (!ATTR_PATH_REGEX.test(attr)) {
    return res.status(400).json({ error: 'Invalid attribute path.', sql: null });
  }
  const tableRef = await getTableRef(datasetId);
  const escaped = value.replace(/'/g, "''");
  const condition = match === 'contains'
    ? `LOWER(CAST(${attr} AS STRING)) LIKE LOWER('%${escaped}%')`
    : `CAST(${attr} AS STRING) = '${escaped}'`;
  const sql = `SELECT DISTINCT _demoemea.identification.core.email AS email FROM ${tableRef} WHERE ${condition} LIMIT 200`;
  res.json({ sql, attr, value, match, table: datasetId });
});

/** GET /api/profile/search-by-attribute – search profiles by attribute value. Query: attr, value, match=exact|contains. */
app.get('/api/profile/search-by-attribute', async (req, res) => {
  const attr = (req.query.attr || req.query.attribute || '').trim();
  const value = (req.query.value || '').trim();
  const match = (req.query.match || 'exact').toLowerCase() === 'contains' ? 'contains' : 'exact';
  const quick = req.query.quick === '1';
  const sandbox = (req.query.sandbox || '').trim() || undefined;

  if (!attr || !value) {
    return res.status(400).json({
      error: 'Missing attr and value. Use ?attr=loyalty.tier&value=Gold',
      profiles: [],
    });
  }
  if (!process.env.AEP_QUERY_PROFILE_DATASET_ID) {
    return res.status(400).json({
      error: 'AEP_QUERY_PROFILE_DATASET_ID is required.',
      profiles: [],
    });
  }
  try {
    const { emails, message } = await searchProfilesByAttribute(attr, value, match, sandbox);
    if (emails.length === 0) {
      return res.json({ profiles: [], message });
    }
    if (quick) {
      const limit = Math.min(parseInt(req.query.limit, 10) || 25, 200);
      const profiles = emails.slice(0, limit).map((email) => ({ email }));
      return res.json({ profiles, message });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const toFetch = emails.slice(0, limit);
    const BATCH = 5;
    const profiles = [];
    for (let i = 0; i < toFetch.length; i += BATCH) {
      const batch = toFetch.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (email) => {
          try {
            const response = await getProfileByEmail(email, sandbox);
            const keys = Object.keys(response).filter((k) => !k.startsWith('_'));
            if (keys.length === 0) return { firstName: '', lastName: '', email };
            const entityPayload = response[keys[0]];
            const entity = entityPayload?.entity ?? entityPayload;
            const { firstName, lastName } = getProfileNames(entity || {});
            return { firstName, lastName, email };
          } catch {
            return { firstName: '', lastName: '', email };
          }
        })
      );
      profiles.push(...results);
    }
    res.json({ profiles, message });
  } catch (err) {
    res.status(500).json({ error: err.message, profiles: [] });
  }
});

const OPERATIONAL_SCHEMA_SAMPLE_PATH = join(__dirname, 'schema', 'operational-profile-schema-sample.json');

/** GET /api/schema-viewer/operational-sample – static operational profile shape sample (instance JSON). */
app.get('/api/schema-viewer/operational-sample', (req, res) => {
  try {
    if (!existsSync(OPERATIONAL_SCHEMA_SAMPLE_PATH)) {
      return res.status(404).json({ error: 'operational-profile-schema-sample.json not found' });
    }
    const raw = readFileSync(OPERATIONAL_SCHEMA_SAMPLE_PATH, 'utf8');
    res.type('json').send(raw);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to read sample' });
  }
});

/** GET /api/schema-viewer/registry?schemaId=...&sandbox= – raw XED schema from Schema Registry (requires auth). */
app.get('/api/schema-viewer/registry', async (req, res) => {
  const schemaId = (req.query.schemaId || req.query.schema_id || '').trim();
  if (!schemaId) {
    return res.status(400).json({ error: 'Missing schemaId (full schema URI).' });
  }
  const sandbox = (req.query.sandbox || '').trim() || undefined;
  try {
    const schema = await fetchSchemaById(schemaId, sandbox);
    res.json({ schemaId, schema });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Schema Registry request failed', schemaId });
  }
});

/** GET /api/schema-viewer/tenant-schemas?sandbox= – XDM schemas: Catalog-backed (datasets’ schemaRefs) merged with registry library rows; titles from light Registry GETs where used. */
app.get('/api/schema-viewer/tenant-schemas', async (req, res) => {
  const raw = req.query.sandbox;
  const sandbox = (Array.isArray(raw) ? raw[0] : raw || '').trim() || undefined;
  try {
    let catalogInfo = null;
    try {
      catalogInfo = await fetchCatalogDatasetSchemaInfo(sandbox);
    } catch {
      catalogInfo = null;
    }
    const {
      sandboxName,
      schemas: rawList,
      schemaListSource,
      catalogLightGetMisses = 0,
    } = await fetchComposedSchemasListForSandbox(sandbox, catalogInfo);
    const datasetCounts = catalogInfo?.counts ?? null;
    const mapped = rawList
      .map((s) => {
        const id =
          (s && (s.$id || s['$id'] || s.id || s['@id'] || s['meta:altId'])) || '';
        const metaAltId = s && s['meta:altId'];
        const title = pickSchemaRegistryListTitle(s) || id;
        const metaClass = (s && s['meta:class']) || '';
        const regMeta = s && s['meta:registryMetadata'];
        const lastModifiedMs = registryMetadataLastModified(regMeta);
        const datasetCount =
          datasetCounts != null ? resolveDatasetCountForSchema(datasetCounts, id, metaAltId) : undefined;
        return {
          id,
          title,
          version: s && s.version,
          metaAltId,
          metaClass: metaClass || undefined,
          classLabel: formatSchemaClassLabel(metaClass),
          behavior: metaClass ? inferSchemaBehavior(metaClass) : '—',
          typeLabel: inferSchemaTypeLabel(id, metaClass),
          lastModifiedMs: lastModifiedMs != null ? lastModifiedMs : undefined,
          datasetCount,
        };
      })
      .filter((x) => x.id);
    res.json({
      sandbox: sandboxName,
      count: mapped.length,
      schemas: mapped,
      datasetCountsFromCatalog: datasetCounts != null,
      schemaListSource: schemaListSource || 'registry',
      catalogLightGetMisses,
      omittedByTitleNoiseFilter: 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list tenant schemas', sandbox: null, count: 0, schemas: [] });
  }
});

/**
 * GET /api/schema-viewer/tenant-schemas-v2?sandbox=&start=
 * Postman-style tenant list: Accept application/vnd.adobe.xdm+json, optional title-prefix `start` (e.g. B2B).
 */
app.get('/api/schema-viewer/tenant-schemas-v2', async (req, res) => {
  const raw = req.query.sandbox;
  const sandbox = (Array.isArray(raw) ? raw[0] : raw || '').trim() || undefined;
  const startRaw = req.query.start;
  const start = (Array.isArray(startRaw) ? startRaw[0] : startRaw || '').trim();
  try {
    let catalogInfo = null;
    try {
      catalogInfo = await fetchCatalogDatasetSchemaInfo(sandbox);
    } catch {
      catalogInfo = null;
    }
    const datasetCounts = catalogInfo?.counts ?? null;
    const { sandboxName, rawList } = await fetchTenantSchemasPostmanList(sandbox, start);
    const mapped = rawList
      .map((s) => {
        const id =
          (s && (s.$id || s['$id'] || s.id || s['@id'] || s['meta:altId'])) || '';
        const metaAltId = s && s['meta:altId'];
        const title = pickSchemaRegistryListTitle(s) || id;
        const metaClass = (s && s['meta:class']) || '';
        const regMeta = s && s['meta:registryMetadata'];
        const lastModifiedMs = registryMetadataLastModified(regMeta);
        const datasetCount =
          datasetCounts != null ? resolveDatasetCountForSchema(datasetCounts, id, metaAltId) : undefined;
        return {
          id,
          title,
          version: s && s.version,
          metaAltId,
          metaClass: metaClass || undefined,
          classLabel: formatSchemaClassLabel(metaClass),
          behavior: metaClass ? inferSchemaBehavior(metaClass) : '—',
          typeLabel: inferSchemaTypeLabel(id, metaClass),
          lastModifiedMs: lastModifiedMs != null ? lastModifiedMs : undefined,
          datasetCount,
        };
      })
      .filter((x) => x.id);
    res.json({
      sandbox: sandboxName,
      count: mapped.length,
      schemas: mapped,
      datasetCountsFromCatalog: datasetCounts != null,
      schemaListSource: 'postman-tenant-schemas-xdm+json',
      start: start || null,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message || 'Failed to list tenant schemas (v2)',
      sandbox: null,
      count: 0,
      schemas: [],
    });
  }
});

/** GET /api/schema-viewer/overview-stats?sandbox= – schema counts (profile / event / other) and dataset total for Data viewer Overview. */
app.get('/api/schema-viewer/overview-stats', async (req, res) => {
  const raw = req.query.sandbox;
  const sandbox = (Array.isArray(raw) ? raw[0] : raw || '').trim() || undefined;
  try {
    const [composed, dsResult] = await Promise.all([
      (async () => {
        let catalogInfo = null;
        try {
          catalogInfo = await fetchCatalogDatasetSchemaInfo(sandbox);
        } catch {
          catalogInfo = null;
        }
        return fetchComposedSchemasListForSandbox(sandbox, catalogInfo);
      })(),
      fetchCatalogDatasetsList(sandbox),
    ]);
    const { sandboxName, schemas: rawList, schemaListSource } = composed;
    let profileCount = 0;
    let eventCount = 0;
    let otherCount = 0;
    for (const s of rawList) {
      const id =
        (s && (s.$id || s['$id'] || s.id || s['@id'] || s['meta:altId'])) || '';
      if (!id) continue;
      const kind = classifySchemaOverviewKind(s && s['meta:class']);
      if (kind === 'profile') profileCount += 1;
      else if (kind === 'event') eventCount += 1;
      else otherCount += 1;
    }
    const schemaCount = profileCount + eventCount + otherCount;
    res.json({
      sandbox: sandboxName,
      schemaCount,
      profileSchemaCount: profileCount,
      eventSchemaCount: eventCount,
      otherSchemaCount: otherCount,
      datasetCount: dsResult.datasets.length,
      schemaListSource: schemaListSource || 'registry',
    });
  } catch (err) {
    res.status(500).json({
      error: err.message || 'Failed to load overview stats',
      sandbox: null,
      schemaCount: 0,
      profileSchemaCount: 0,
      eventSchemaCount: 0,
      otherSchemaCount: 0,
      datasetCount: 0,
    });
  }
});

/** GET /api/schema-viewer/datasets?sandbox= – Catalog datasets list for Data viewer Datasets tab. */
app.get('/api/schema-viewer/datasets', async (req, res) => {
  const raw = req.query.sandbox;
  const sandbox = (Array.isArray(raw) ? raw[0] : raw || '').trim() || undefined;
  try {
    const { sandboxName, datasets } = await fetchCatalogDatasetsList(sandbox);
    let enriched = datasets;
    try {
      enriched = await enrichDatasetsWithSchemaTitles(datasets, sandboxName);
    } catch {
      enriched = datasets.map((d) => ({ ...d, schemaTitle: '' }));
    }
    const sorted = [...enriched].sort((a, b) =>
      String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), undefined, {
        sensitivity: 'base',
      }),
    );
    res.json({ sandbox: sandboxName, count: sorted.length, datasets: sorted });
  } catch (err) {
    res.status(500).json({
      error: err.message || 'Failed to list datasets',
      sandbox: null,
      count: 0,
      datasets: [],
    });
  }
});

/** GET /api/schema-viewer/audiences?sandbox= – Segmentation Service audiences list (Data viewer Audiences tab). */
app.get('/api/schema-viewer/audiences', async (req, res) => {
  const raw = req.query.sandbox;
  const sandbox = (Array.isArray(raw) ? raw[0] : raw || '').trim() || undefined;
  try {
    const { sandboxName, audiences } = await fetchAudiencesList(sandbox);
    const sorted = [...audiences].sort((a, b) =>
      String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), undefined, {
        sensitivity: 'base',
      }),
    );
    res.json({ sandbox: sandboxName, count: sorted.length, audiences: sorted });
  } catch (err) {
    res.status(500).json({
      error: err.message || 'Failed to list audiences',
      sandbox: null,
      count: 0,
      audiences: [],
    });
  }
});

/**
 * GET /api/schema-viewer/audience-members?audienceId=&sandbox=
 * Sample audience membership via Segmentation preview (Platform API).
 */
app.get('/api/schema-viewer/audience-members', async (req, res) => {
  const audienceId = (req.query.audienceId || '').trim();
  const sandbox = (req.query.sandbox || '').trim() || undefined;
  if (!audienceId) {
    return res.status(400).json({ error: 'Missing audienceId query parameter.', members: [] });
  }
  try {
    const payload = await runAudiencePreviewSample(audienceId, sandbox);
    res.json(payload);
  } catch (err) {
    res.status(500).json({
      error: err.message || 'Failed to preview audience members',
      audienceId,
      members: [],
    });
  }
});

/** GET /api/schema/event-types – fetch schema by id and return suggested eventType values from meta:enum / enum. */
app.get('/api/schema/event-types', async (req, res) => {
  const schemaId = (req.query.schemaId || req.query.schema_id || '').trim() || DEFAULT_EVENT_SCHEMA_ID;
  try {
    const schema = await fetchSchemaById(schemaId);
    const eventTypes = extractEventTypeEnum(schema);
    if (eventTypes && eventTypes.length) {
      return res.json({ schemaId, eventTypes });
    }
    res.json({ schemaId, eventTypes: [], message: 'No eventType enum found in schema.' });
  } catch (err) {
    res.status(500).json({ error: err.message, schemaId });
  }
});

/** Get the merged profile entity from Profile API response (handles response.entity or response[id].entity). */
function getEntityFromProfileResponse(response) {
  if (response?.entity != null && typeof response.entity === 'object') return response.entity;
  const keys = Object.keys(response || {}).filter((k) => !k.startsWith('_'));
  for (const k of keys) {
    const v = response[k];
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      if (v.entity != null && typeof v.entity === 'object') return v.entity;
      if (v.optInOut != null || v.consents?.marketing != null) return v;
      if (v.attributes?.consents != null || v.attributes?.optInOut != null) return v;
    }
  }
  return keys.length ? response[keys[0]] : null;
}

/** Get current consent and customer info for a profile. */
app.get('/api/profile/consent', async (req, res) => {
  const email = (req.query.email || '').trim();
  const sandbox = (req.query.sandbox || '').trim() || undefined;
  if (!email) {
    return res.status(400).json({ error: 'Missing email. Use ?email=user@example.com' });
  }
  try {
    const response = await getProfileByEmail(email, sandbox);
    const entity = getEntityFromProfileResponse(response);
    if (!entity || typeof entity !== 'object') {
      return res.json({ email, found: false });
    }
    const profile = getProfileForConsent(entity);
    const extracted = extractConsents(entity);
    const {
      marketingConsent,
      channelOptInOut,
      channels,
      dataCollection,
      dataSharing,
      contentPersonalization,
    } = extracted;
    const preferredMarketingChannel = getPreferredMarketingChannel(entity);
    const { firstName, lastName } = getProfileNames(entity);
    const gender = getProfileGender(entity);
    const profileEmail = getProfileEmail(entity);
    const keys = Object.keys(response || {}).filter((k) => !k.startsWith('_'));
    const payload = keys.length ? response[keys[0]] : null;
    // ECID: exact path from AEP profile (entity._demoemea.identification.core.ecid)
    const demoemeaEcid = entity?._demoemea?.identification?.core?.ecid ?? entity?._demoemea?.identification?.core?.ECID;
    let ecid =
      toEcidString(demoemeaEcid) ||
      toEcidString(get(entity, ECID_PATH_DEMOEMEA)) ||
      (payload?.entity && toEcidString(payload.entity._demoemea?.identification?.core?.ecid ?? payload.entity._demoemea?.identification?.core?.ECID)) ||
      (payload && toEcidString(get(payload, 'entity._demoemea.identification.core.ecid'))) ||
      getProfileEcid(entity) ||
      getProfileEcid(payload);
    const flatRows = flattenEntityToTableRows(entity);
    if ((ecid == null || ecid === '') && entity) {
      ecid = getFirstEcidFromRows(flatRows);
    }
    ecid = ensureSingleEcid(ecid);
    const identities = collectIdentitiesForGraph(entity, flatRows);
    const lastModifiedAt =
      entity?.lastModifiedAt ??
      payload?.lastModifiedAt ??
      response?.lastModifiedAt ??
      null;
    res.json({
      found: true,
      email: profileEmail || email,
      firstName: firstName || null,
      lastName: lastName || null,
      gender: gender || null,
      lastModifiedAt: lastModifiedAt ?? null,
      profileSource: 'Adobe Experience Platform',
      ecid: ecid || null,
      identities,
      marketingConsent: marketingConsent ?? null,
      channelOptInOut: channelOptInOut ?? null,
      channels: channels && Object.keys(channels).length ? channels : null,
      preferredMarketingChannel: preferredMarketingChannel || null,
      dataCollection: dataCollection || 'na',
      dataSharing: dataSharing || 'na',
      contentPersonalization: contentPersonalization || 'na',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Update consent (consents.marketing Y/N and optInOut._channels In/Out). Requires profile streaming config. */
app.patch('/api/profile/consent', async (req, res) => {
  const email = (req.body?.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'Missing email in body.' });
  }
  const marketingConsent = req.body.marketingConsent;
  const channelOptInOut = req.body.channelOptInOut;
  const channels = req.body.channels;
  const dataCollection = req.body.dataCollection;
  const dataSharing = req.body.dataSharing;
  const contentPersonalization = req.body.contentPersonalization;

  const streamUrl = process.env.AEP_PROFILE_STREAMING_URL;
  const datasetId = process.env.AEP_PROFILE_DATASET_ID || '699323ce1b3a85affd7095fc';
  const schemaId = PROFILE_STREAM_SCHEMA_ID;
  const flowId = process.env.AEP_PROFILE_FLOW_ID;

  if (!streamUrl || !datasetId || !schemaId) {
    return res.status(501).json({
      error: 'Profile consent update is not configured.',
      message:
        'Set AEP_PROFILE_STREAMING_URL, AEP_PROFILE_DATASET_ID, and AEP_PROFILE_SCHEMA_ID (and optionally AEP_PROFILE_FLOW_ID) for streaming profile updates.',
    });
  }

  try {
    const xdmEntity = buildConsentXdm(email, {
      marketingConsent,
      channelOptInOut,
      channels,
      dataCollection,
      dataSharing,
      contentPersonalization,
    });
    const { token, config } = await getAuth();
    const cfg = getConfig();
    const payload = {
      header: {
        schemaRef: {
          id: schemaId,
          contentType: 'application/vnd.adobe.xed-full+json;version=1.0',
        },
        imsOrgId: config.orgId,
        datasetId,
        source: { name: 'Profile Viewer consent update' },
      },
      body: {
        xdmMeta: {
          schemaRef: {
            id: schemaId,
            contentType: 'application/vnd.adobe.xed-full+json;version=1.0',
          },
        },
        xdmEntity,
      },
    };
    const apiKey = process.env.AEP_PROFILE_STREAMING_API_KEY || cfg.clientId;
    const headers = buildProfileDcsStreamingHeaders(token, config.sandboxName, flowId, apiKey);

    const streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await streamRes.json().catch(() => ({}));
    if (!streamRes.ok) {
      return res.status(502).json({
        error: data.message || data.title || data.detail || `Streaming ${streamRes.status}`,
      });
    }
    res.json({ message: 'Consent update sent successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Event ingestion (API Operational Events schema, HTTP Streaming) ---
const XDM_TENANT_ID = 'demoemea';
const EVENT_SCHEMA_ID = `https://ns.adobe.com/${XDM_TENANT_ID}/schemas/9bc433dd59aeea8231b6d1a25a9d1f6de0cd3ea609aa1ebb`;
const EVENT_SCHEMA_CONTENT_TYPE = 'application/vnd.adobe.xed-full+json;version=1.0';
const EVENT_STREAMING_URL = process.env.AEP_EVENT_STREAMING_URL || 'https://dcs.adobedc.net/collection/1706a1fe8d0a94139a5d329d85b147a9016d96fc7d4c6c01420ce5c8c022b620?syncValidation=false';
const EVENT_FLOW_ID = process.env.AEP_EVENT_FLOW_ID || 'b326ba47-fb29-4e32-a2f3-54f47c9e1ea7';
const EVENT_DATASET_ID = process.env.AEP_EVENT_DATASET_ID || '698f17dbf12b21fe67779cb1';
const EVENT_SANDBOX_NAME = process.env.AEP_EVENT_SANDBOX || 'kirkham';

/** Event Generator: DCS HTTP streaming (envelope). Override with AEP_EVENT_GENERATOR_STREAMING_URL. */
const EVENT_GENERATOR_STREAMING_URL =
  process.env.AEP_EVENT_GENERATOR_STREAMING_URL ||
  'https://dcs.adobedc.net/collection/d7824b017e820f769cb6efe11330d650136377522b4e75515fdd14102a4a9449';
const EVENT_GENERATOR_FLOW_ID = process.env.AEP_EVENT_GENERATOR_FLOW_ID || EVENT_FLOW_ID;
const EVENT_GENERATOR_SCHEMA_ID = process.env.AEP_EVENT_GENERATOR_SCHEMA_ID || EVENT_SCHEMA_ID;
const EVENT_GENERATOR_DATASET_ID = process.env.AEP_EVENT_GENERATOR_DATASET_ID || EVENT_DATASET_ID;
const EVENT_GENERATOR_TARGETS_PATH = join(__dirname, 'public', 'event-generator-targets.json');

function loadEventGeneratorTargets() {
  if (!existsSync(EVENT_GENERATOR_TARGETS_PATH)) return [];
  try {
    const raw = readFileSync(EVENT_GENERATOR_TARGETS_PATH, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function buildEventPayload(body) {
  const email = (body.email || '').trim();
  if (!email) return null;
  const eventId = (body.eventId || '').trim() || `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const viewNameVal = (body.viewName || '').trim();
  const viewUrlVal = (body.viewUrl || body.url || '').trim();
  const xdmEntity = {
    _id: eventId,
    '@id': eventId,
    'xdm:timestamp': now,
    timestamp: now,
    web: {
      webPageDetails: {
        URL: viewUrlVal,
        name: viewNameVal,
        viewName: viewNameVal,
      },
    },
    eventType: body.eventType || 'form.formSubmit',
    producedBy: (body.producedBy || 'self').trim() || 'self',
    identityMap: { Email: [{ id: email, primary: true }] },
    _demoemea: {
      identification: { core: { email } },
      interactionDetails: {
        core: {
          form: {
            name: (body.formName || '').trim() || 'Event Generator',
            category: (body.formCategory || '').trim() || 'General',
            action: (body.formAction || '').trim() || 'submit',
          },
          channel: (body.channel || '').trim() || 'web',
          campaignChannel: (body.campaignChannel || '').trim() || 'website',
        },
      },
    },
  };
  return {
    header: {
      schemaRef: { id: EVENT_SCHEMA_ID, contentType: EVENT_SCHEMA_CONTENT_TYPE },
      imsOrgId: body._imsOrgId,
      datasetId: EVENT_DATASET_ID,
      source: { name: 'Profile Viewer Event Generator' },
    },
    body: {
      xdmMeta: { schemaRef: { id: EVENT_SCHEMA_ID, contentType: EVENT_SCHEMA_CONTENT_TYPE } },
      xdmEntity,
    },
  };
}

/** POST /api/events/ingest – send one experience event to AEP (streaming). Body: email, eventType, producedBy?, formName?, formCategory?, formAction?, channel?, campaignChannel?, eventId? */
app.post('/api/events/ingest', async (req, res) => {
  const email = (req.body?.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'Missing email.' });
  }
  try {
    const { token, config } = await getAuth();
    const payload = buildEventPayload({ ...req.body, _imsOrgId: config.orgId });
    if (!payload) {
      return res.status(400).json({ error: 'Invalid request body.' });
    }
    const streamRes = await fetch(EVENT_STREAMING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sandbox-name': EVENT_SANDBOX_NAME,
        Authorization: `Bearer ${token}`,
        'x-adobe-flow-id': EVENT_FLOW_ID,
      },
      body: JSON.stringify(payload),
    });
    const text = await streamRes.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {}
    if (!streamRes.ok) {
      return res.status(502).json({
        error: data.message || data.title || data.detail || `Streaming ${streamRes.status}`,
      });
    }
    res.json({ ok: true, message: 'Event sent to AEP.', eventId: payload.body.xdmEntity['@id'] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Edge Network interact (datastream) – API event call (transaction, ECID) ---
const EDGE_INTERACT_URL =
  process.env.AEP_EDGE_INTERACT_URL ||
  'https://server.adobedc.net/ee/v2/interact?dataStreamId=a7f9f0c6-5729-44dd-9f00-62c0da687b03';

const EDGE_INTERACT_ECID = process.env.AEP_EDGE_ECID || '62722406001178632594092146103219305888';

function buildEdgeInteractPayload() {
  const isoTimestamp = new Date().toISOString();
  const timestamp = String(Date.now());
  const ecid = EDGE_INTERACT_ECID;
  return {
    event: {
      xdm: {
        identityMap: {
          ECID: [{ id: ecid, primary: true }],
        },
        _experience: {
          campaign: {
            orchestration: {
              eventID: 'e9be0273f1c354c81ec459d439a99f2ee41e6bcad259967b6c367c7e29d0ab21',
            },
          },
        },
        eventType: 'transaction',
        timestamp: isoTimestamp,
        _id: timestamp,
        web: {
          webPageDetails: {
            URL: '',
            name: '',
            viewName: '',
          },
        },
        _demoemea: {
          identification: {
            core: { ecid },
          },
        },
      },
    },
  };
}

/** Some Edge / XDM pipelines expect lowercase `demoemea` alongside `_demoemea` (same as profile streaming envelope). */
function syncXdmDemoemeaLowercaseAlias(xdm) {
  if (!xdm || typeof xdm !== 'object' || !xdm._demoemea || typeof xdm._demoemea !== 'object') return;
  try {
    xdm.demoemea = JSON.parse(JSON.stringify(xdm._demoemea));
  } catch {
    xdm.demoemea = { ...xdm._demoemea };
  }
}

function mergeGeneratorPublicIntoDemoemea(_demoemea, pubIn) {
  if (!_demoemea || !pubIn || typeof pubIn !== 'object' || Array.isArray(pubIn)) return;
  const dest = {};
  /** Numeric donation for union fields outside `public` (e.g. omnichannel CDP use case pack). */
  let donationAmountNumber = null;
  const da = pubIn.donationAmount;
  const donatedOnly = pubIn.donatedAmount;
  if (da != null && da !== '') {
    if (typeof da === 'number' && Number.isFinite(da)) {
      dest.donationAmount = da;
      donationAmountNumber = da;
    } else {
      const n = Number(String(da).replace(/,/g, ''));
      dest.donationAmount = Number.isFinite(n) && !Number.isNaN(n) ? n : String(da).trim();
      if (Number.isFinite(n) && !Number.isNaN(n)) donationAmountNumber = n;
    }
  } else if (donatedOnly != null && donatedOnly !== '') {
    const n =
      typeof donatedOnly === 'number' && Number.isFinite(donatedOnly)
        ? donatedOnly
        : Number(String(donatedOnly).replace(/,/g, ''));
    if (Number.isFinite(n) && !Number.isNaN(n)) {
      dest.donationAmount = n;
      donationAmountNumber = n;
    }
  }
  const er = pubIn.eventRegistration;
  if (er != null && String(er).trim() !== '') dest.eventRegistration = String(er).trim();
  const dd = pubIn.donationDate;
  if (dd != null && String(dd).trim() !== '') dest.donationDate = String(dd).trim();
  if (Object.keys(dest).length > 0) _demoemea.public = dest;

  // Profile union path is often _demoemea.omnichannelCdpUseCasePack.donatedAmount; events previously only set public.donationAmount.
  if (donationAmountNumber != null && Number.isFinite(donationAmountNumber)) {
    if (!_demoemea.omnichannelCdpUseCasePack || typeof _demoemea.omnichannelCdpUseCasePack !== 'object') {
      _demoemea.omnichannelCdpUseCasePack = {};
    }
    _demoemea.omnichannelCdpUseCasePack.donatedAmount = donationAmountNumber;
  }
}

function mergeGeneratorInteractionDetailsChannel(_demoemea, channelIn) {
  if (!_demoemea) return;
  const ch =
    channelIn == null ? '' : typeof channelIn === 'string' ? channelIn.trim() : String(channelIn).trim();
  if (!ch) return;
  if (!_demoemea.interactionDetails) _demoemea.interactionDetails = {};
  if (!_demoemea.interactionDetails.core) _demoemea.interactionDetails.core = {};
  _demoemea.interactionDetails.core.channel = ch;
}

/**
 * Shared XDM for Event Generator. `minimal` is donation-style: no `web`; still includes `identityMap` (Edge EXEG-0306 requires a primary identity).
 * @param {Record<string, unknown>} reqBody
 * @param {{ style?: 'full' | 'minimal', defaultOrchestrationEventID?: string }} [options]
 */
function buildEventGeneratorXdm(reqBody, options = {}) {
  const body = reqBody && typeof reqBody === 'object' ? reqBody : {};
  const style = options.style === 'minimal' ? 'minimal' : 'full';

  if (style === 'minimal') {
    const now =
      typeof body.timestamp === 'string' && body.timestamp.trim()
        ? body.timestamp.trim()
        : new Date().toISOString();
    const _id = body._id != null ? String(body._id) : String(Date.now());
    const eventType = (body.eventType || '').trim() || 'donation.made';
    const orchestrationId =
      (body.eventID || '').trim() ||
      (body.orchestrationEventID || '').trim() ||
      (options.defaultOrchestrationEventID || '').trim() ||
      'e9be0273f1c354c81ec459d439a99f2ee41e6bcad259967b6c367c7e29d0ab21';
    const email = (body.email || '').trim();
    const ecidRaw = body.ecid != null ? String(body.ecid).trim() : '';
    const ecid = ecidRaw || EDGE_INTERACT_ECID;
    const _demoemea = {
      identification: {
        core: {
          ecid,
          email: email || '',
        },
      },
    };
    mergeGeneratorPublicIntoDemoemea(_demoemea, body.public);
    mergeGeneratorInteractionDetailsChannel(_demoemea, body.channel);
    /** @type {Record<string, Array<{ id: string; primary: boolean }>>} */
    const identityMap = {
      ECID: [{ id: ecid, primary: true }],
    };
    if (email) {
      identityMap.Email = [{ id: email, primary: false }];
    }
    const xdm = {
      identityMap,
      _demoemea,
      _id,
      _experience: {
        campaign: {
          orchestration: { eventID: orchestrationId },
        },
      },
      eventType,
      timestamp: now,
    };
    syncXdmDemoemeaLowercaseAlias(xdm);
    return xdm;
  }

  const payload = buildEdgeInteractPayload();
  const xdm = payload.event.xdm;
  if (body.timestamp) xdm.timestamp = body.timestamp;
  if (body._id != null) xdm._id = String(body._id);
  if (body.eventID) xdm._experience.campaign.orchestration.eventID = body.eventID;
  if (body.eventType != null && typeof body.eventType === 'string') {
    const et = body.eventType.trim();
    if (et) xdm.eventType = et;
  }
  if (body.ecid) {
    const ecid = String(body.ecid);
    if (!xdm.identityMap.ECID || !xdm.identityMap.ECID[0]) {
      xdm.identityMap.ECID = [{ id: ecid, primary: true }];
    } else {
      xdm.identityMap.ECID[0].id = ecid;
    }
    xdm._demoemea.identification.core.ecid = ecid;
  }
  const emailInteract = (body.email || '').trim();
  if (emailInteract) {
    xdm.identityMap.Email = [{ id: emailInteract, primary: false }];
    if (!xdm._demoemea) xdm._demoemea = {};
    if (!xdm._demoemea.identification) xdm._demoemea.identification = {};
    if (!xdm._demoemea.identification.core) xdm._demoemea.identification.core = {};
    xdm._demoemea.identification.core.email = emailInteract;
  }
  const viewName = body.viewName != null ? String(body.viewName).trim() : '';
  const viewUrl = body.viewUrl != null ? String(body.viewUrl).trim() : '';
  if (viewName || viewUrl) {
    xdm.web = {
      webPageDetails: {
        URL: viewUrl,
        name: viewName,
        viewName: viewName,
      },
    };
  } else {
    delete xdm.web;
  }
  mergeGeneratorPublicIntoDemoemea(xdm._demoemea, body.public);
  mergeGeneratorInteractionDetailsChannel(xdm._demoemea, body.channel);
  syncXdmDemoemeaLowercaseAlias(xdm);
  return xdm;
}

/** Build AJO journey event payload: eventType from dropdown, identity from email. Same shape as Edge interact. */
function buildAjoJourneyPayload(eventType, email) {
  const isoTimestamp = new Date().toISOString();
  const timestamp = String(Date.now());
  const eventId =
    'e9be0273f1c354c81ec459d439a99f2ee41e6bcad259967b6c367c7e29d0ab21';
  return {
    event: {
      xdm: {
        identityMap: {
          Email: [{ id: email, primary: true }],
        },
        _experience: {
          campaign: {
            orchestration: { eventID: eventId },
          },
        },
        eventType: eventType,
        timestamp: isoTimestamp,
        _id: timestamp,
        _demoemea: {
          identification: {
            core: {
              email: email,
            },
          },
        },
      },
    },
  };
}

/** POST /api/events/ajo – send journey event to Edge (AJO). Body: { eventType, email }. */
app.post('/api/events/ajo', async (req, res) => {
  const eventType = (req.body?.eventType || '').trim();
  const email = (req.body?.email || '').trim();
  if (!eventType || !email) {
    return res.status(400).json({ error: 'Missing eventType or email.' });
  }
  try {
    const payload = buildAjoJourneyPayload(eventType, email);
    const headers = { 'Content-Type': 'application/json' };
    const edgeUrl =
      process.env.AEP_AJO_EDGE_INTERACT_URL || EDGE_INTERACT_URL;
    if (process.env.AEP_EDGE_USE_AUTH === 'true' || process.env.AEP_EDGE_USE_AUTH === '1') {
      try {
        const { token, config } = await getAuth();
        const cfg = getConfig();
        headers.Authorization = `Bearer ${token}`;
        headers['x-api-key'] = cfg.clientId;
        headers['x-gw-ims-org-id'] = config.orgId;
      } catch (authErr) {
        return res.status(503).json({
          error: 'Edge auth requested but failed: ' + (authErr.message || 'missing config'),
        });
      }
    }
    const edgeRes = await fetch(edgeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const text = await edgeRes.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {}
    if (!edgeRes.ok) {
      const msg =
        data.message ||
        data.title ||
        data.detail ||
        data.error ||
        text.slice(0, 200) ||
        `Edge responded with ${edgeRes.status}`;
      return res.status(502).json({
        error: msg,
        edgeStatus: edgeRes.status,
        edgeBody: text.slice(0, 500),
      });
    }
    res.json({
      ok: true,
      message: 'Journey event sent to AJO.',
      eventType,
      requestId: data.requestId || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const AJO_UNITARY_EXECUTIONS_URL = 'https://platform.adobe.io/ajo/im/executions/unitary';

/** POST /api/ajo/live-activity — AJO unitary execution (Live Activity); IMS token and org/API key from Adobe Auth. */
app.post('/api/ajo/live-activity', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const payload = body.payload;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'payload must be a JSON object' });
  }

  let token;
  let cfg;
  let authConf;
  try {
    const auth = await getAuth();
    token = auth.token;
    authConf = auth.config;
    cfg = getConfig();
  } catch (err) {
    return res.status(503).json({
      error: 'Adobe auth failed: ' + (err.message || String(err)),
    });
  }

  const sandboxFromBody = String(body.sandboxName || '').trim();
  const sandboxName = sandboxFromBody || authConf.sandboxName || cfg.sandboxName || 'production';

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-gw-ims-org-id': String(authConf.orgId || cfg.orgId || '').slice(0, 512),
    'x-api-key': String(cfg.clientId || '').slice(0, 256),
    'x-sandbox-name': String(sandboxName).slice(0, 120),
    Authorization: `Bearer ${token}`,
  };

  let upstream;
  try {
    upstream = await fetch(AJO_UNITARY_EXECUTIONS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }

  const ct = upstream.headers.get('Content-Type') || '';
  let platformResponse;
  if (ct.toLowerCase().includes('json')) {
    try {
      platformResponse = await upstream.json();
    } catch {
      platformResponse = { raw: await upstream.text() };
    }
  } else {
    const text = await upstream.text();
    platformResponse = { raw: text.slice(0, 50000) };
  }

  res.status(upstream.status).json({
    ok: upstream.ok,
    status: upstream.status,
    platform_response: platformResponse,
    request_url: AJO_UNITARY_EXECUTIONS_URL,
  });
});

// --- Events Trigger (event-triggers.json: predefined payloads per eventType, ECID injected) ---
const EVENT_TRIGGERS_PATH = join(__dirname, 'public', 'event-triggers.json');
const EVENT_TRIGGER_STREAMING_URL = process.env.AEP_TRIGGER_STREAMING_URL || process.env.AEP_EVENT_STREAMING_URL || process.env.AEP_PROFILE_STREAMING_URL;

function loadEventTriggers() {
  if (!existsSync(EVENT_TRIGGERS_PATH)) return {};
  try {
    const raw = readFileSync(EVENT_TRIGGERS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Replace {{key}} placeholders in a JSON-serializable object. Returns replaced value (mutates objects/arrays in place). */
function replacePlaceholders(obj, replacements) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    let s = obj;
    for (const [key, val] of Object.entries(replacements)) {
      s = s.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
    }
    return s;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      obj[i] = replacePlaceholders(item, replacements);
    });
    return obj;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      obj[k] = replacePlaceholders(obj[k], replacements);
    }
    return obj;
  }
  return obj;
}

/** Deep clone and replace placeholders. */
function buildTriggerPayload(template, ecid, email, eventType) {
  const payload = JSON.parse(JSON.stringify(template));
  const _id = `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const timestamp = new Date().toISOString();
  const replacements = { ecid, email: email || '', _id, timestamp, eventType };
  replacePlaceholders(payload, replacements);
  return payload;
}

/** GET /api/events/trigger-config – return event types from event-triggers.json. */
app.get('/api/events/trigger-config', (req, res) => {
  const config = loadEventTriggers();
  const eventTypes = Object.keys(config).filter((k) => typeof config[k] === 'object' && config[k].payload);
  res.json({ eventTypes });
});

/** POST /api/events/trigger – send event using predefined payload from event-triggers.json. Body: { eventType, ecid, email }. Uses Edge interact (like Event Generator) when datastreamId is in config. */
app.post('/api/events/trigger', async (req, res) => {
  const eventType = (req.body?.eventType || '').trim();
  const ecid = req.body?.ecid != null ? String(req.body.ecid).trim() : '';
  const email = (req.body?.email || '').trim();
  if (!eventType || !ecid) {
    return res.status(400).json({ error: 'Missing eventType or ecid. Query a profile first to get ECID.' });
  }
  if (ecid.length < 10 || !/^\d+$/.test(ecid)) {
    return res.status(400).json({ error: 'Invalid ECID. Query a profile first.' });
  }

  const config = loadEventTriggers();
  const triggerConfig = config[eventType];
  if (!triggerConfig || !triggerConfig.payload) {
    return res.status(400).json({ error: `Event type "${eventType}" not found in event-triggers.json. Add it to the config.` });
  }

  const datastreamId = triggerConfig.datastreamId;
  const useEdge = datastreamId && typeof datastreamId === 'string';

  try {
    const { token, config: authConfig } = await getAuth();
    const cfg = getConfig();
    const payload = buildTriggerPayload(triggerConfig.payload, ecid, email, eventType);

    if (useEdge) {
      if (payload.event && payload.event.xdm) {
        payload.event.xdm.identityMap = {
          ECID: [{ id: ecid, primary: true }],
        };
        if (email) {
          payload.event.xdm.identityMap.Email = [{ id: email, primary: false }];
        }
      }
      const edgeUrl =
        process.env.AEP_EDGE_INTERACT_BASE ||
        'https://server.adobedc.net/ee/v2/interact';
      const url = `${edgeUrl}?dataStreamId=${encodeURIComponent(datastreamId)}`;
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': cfg.clientId,
        'x-gw-ims-org-id': authConfig.orgId,
      };
      const edgeRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const text = await edgeRes.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {}
      if (!edgeRes.ok) {
        const errDetail =
          data.message ||
          data.title ||
          data.detail ||
          data.error ||
          text.slice(0, 200) ||
          `Edge ${edgeRes.status}`;
        console.error(`[events/trigger] ${eventType} Edge failed:`, errDetail);
        return res.status(502).json({
          error: errDetail,
          edgeStatus: edgeRes.status,
          edgeBody: text.slice(0, 500),
        });
      }
      return res.json({
        ok: true,
        message: `Event "${eventType}" sent to Edge.`,
        requestId: data.requestId || null,
      });
    }

    if (!EVENT_TRIGGER_STREAMING_URL) {
      return res.status(501).json({
        error: `Event type "${eventType}" has no datastreamId in event-triggers.json and AEP_TRIGGER_STREAMING_URL is not set.`,
      });
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': authConfig.orgId,
      'sandbox-name': authConfig.sandboxName || 'production',
    };
    if (process.env.AEP_TRIGGER_FLOW_ID) headers['x-adobe-flow-id'] = process.env.AEP_TRIGGER_FLOW_ID;

    const streamRes = await fetch(EVENT_TRIGGER_STREAMING_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const text = await streamRes.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {}
    if (!streamRes.ok) {
      const errDetail = data.message || data.title || data.detail || data.error || (data.report && data.report.message) || `Streaming ${streamRes.status}`;
      console.error(`[events/trigger] ${eventType} failed: ${streamRes.status}`, errDetail);
      return res.status(502).json({
        error: errDetail,
        streamingResponse: data,
      });
    }
    res.json({
      ok: true,
      message: `Event "${eventType}" sent.`,
      requestId: data.requestId || null,
    });
  } catch (err) {
    console.error('[events/trigger]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/events/generator-targets – presets for Event Generator (Edge datastream vs DCS collection). */
app.get('/api/events/generator-targets', (req, res) => {
  const targets = loadEventGeneratorTargets().map((t) => ({
    id: t.id,
    label: t.label,
    transport: t.transport,
    dataStreamId: t.dataStreamId || null,
    xdmStyle: t.xdmStyle || 'full',
    streamingUrl: t.streamingUrl || null,
  }));
  res.json({ targets });
});

/** POST /api/events/generator – Event Generator. Body: targetId?, email, eventType?, ecid?, viewName?, viewUrl?, channel?, public?, eventID?, timestamp?, _id? (optional ISO UTC + event id when overriding time) */
app.post('/api/events/generator', async (req, res) => {
  const email = (req.body?.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'Missing email. Enter a customer email in Step 1.' });
  }
  const targets = loadEventGeneratorTargets();
  const wantId = (req.body?.targetId || '').trim();
  let preset = targets.find((t) => t && typeof t === 'object' && t.id === wantId);
  if (!preset && targets.length) preset = targets[0];
  if (!preset) {
    return res.status(500).json({ error: 'No event-generator-targets.json presets found.' });
  }

  try {
    const { token, config } = await getAuth();
    const cfg = getConfig();
    const transport = (preset.transport || 'dcs').toLowerCase() === 'edge' ? 'edge' : 'dcs';

    if (transport === 'edge') {
      if (!preset.dataStreamId || typeof preset.dataStreamId !== 'string') {
        return res.status(500).json({ error: 'Preset is missing dataStreamId.' });
      }
      const xdmStyle = preset.xdmStyle === 'minimal' ? 'minimal' : 'full';
      const xdm = buildEventGeneratorXdm(req.body, {
        style: xdmStyle,
        defaultOrchestrationEventID: preset.defaultOrchestrationEventID || '',
      });
      const edgeBase = (preset.edgeInteractBase || 'https://server.adobedc.net/ee/v2/interact').split('?')[0];
      const edgeUrl = `${edgeBase}?dataStreamId=${encodeURIComponent(preset.dataStreamId)}`;
      const payload = { event: { xdm } };
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': cfg.clientId,
        'x-gw-ims-org-id': config.orgId,
      };
      const edgeRes = await fetch(edgeUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
      const text = await edgeRes.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {}
      if (!edgeRes.ok) {
        const msg =
          data.message ||
          data.title ||
          data.detail ||
          data.error ||
          text.slice(0, 200) ||
          `Edge ${edgeRes.status}`;
        return res.status(502).json({
          error: msg,
          edgeStatus: edgeRes.status,
          edgeBody: text.slice(0, 500),
          edgeUrl,
        });
      }
      return res.json({
        ok: true,
        message: 'Event sent to Edge interact.',
        transport: 'edge',
        edgeUrl,
        requestId: data.requestId || null,
        targetId: preset.id,
      });
    }

    const xdm = buildEventGeneratorXdm(req.body, { style: 'full' });
    const idStr = xdm._id != null ? String(xdm._id) : `event-${Date.now()}`;
    const ts = xdm.timestamp || new Date().toISOString();
    const xdmEntity = {
      ...xdm,
      _id: idStr,
      '@id': idStr,
      'xdm:timestamp': ts,
      timestamp: ts,
    };
    const streamEnvelope = {
      header: {
        schemaRef: { id: EVENT_GENERATOR_SCHEMA_ID, contentType: EVENT_SCHEMA_CONTENT_TYPE },
        imsOrgId: config.orgId,
        datasetId: EVENT_GENERATOR_DATASET_ID,
        source: { name: 'Profile Viewer Event Generator' },
      },
      body: {
        xdmMeta: { schemaRef: { id: EVENT_GENERATOR_SCHEMA_ID, contentType: EVENT_SCHEMA_CONTENT_TYPE } },
        xdmEntity,
      },
    };
    const sandbox =
      (process.env.AEP_EVENT_GENERATOR_SANDBOX || '').trim() || config.sandboxName || EVENT_SANDBOX_NAME;
    const streamUrl =
      (preset.streamingUrl && String(preset.streamingUrl).trim()) || EVENT_GENERATOR_STREAMING_URL;
    const streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sandbox-name': sandbox,
        Authorization: `Bearer ${token}`,
        'x-adobe-flow-id': EVENT_GENERATOR_FLOW_ID,
      },
      body: JSON.stringify(streamEnvelope),
    });
    const text = await streamRes.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {}
    if (!streamRes.ok) {
      return res.status(502).json({
        error: data.message || data.title || data.detail || data.report?.message || `Streaming ${streamRes.status}`,
        streamingResponse: data,
        streamingUrl: streamUrl,
        targetId: preset.id,
      });
    }
    res.json({
      ok: true,
      message: 'Event sent to AEP (streaming).',
      eventId: xdmEntity['@id'],
      streamingUrl: streamUrl,
      targetId: preset.id,
      transport: 'dcs',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/events/interact – send transaction event to Edge (datastream). Uses Bearer + x-gw-ims-org-id + x-api-key. Payload: eventType transaction, ECID from env or default. */
app.post('/api/events/interact', async (req, res) => {
  try {
    const xdm = buildEventGeneratorXdm(req.body);
    const payload = { event: { xdm } };

    const { token, config } = await getAuth();
    const cfg = getConfig();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
    };
    const edgeRes = await fetch(EDGE_INTERACT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const text = await edgeRes.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {}
    if (!edgeRes.ok) {
      const msg =
        data.message ||
        data.title ||
        data.detail ||
        data.error ||
        (typeof data === 'object' && Object.keys(data).length ? JSON.stringify(data).slice(0, 200) : null) ||
        text.slice(0, 200) ||
        `Edge responded with ${edgeRes.status}`;
      return res.status(502).json({
        error: msg,
        edgeStatus: edgeRes.status,
        edgeBody: text.slice(0, 500),
      });
    }
    res.json({
      ok: true,
      message: 'Event sent to Edge interact.',
      requestId: data.requestId || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const FLOW_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/flowservice';
const CONVERSION_BASE = 'https://platform.adobe.io/data/foundation/conversion';

/** GET /api/streaming-flow-info?flowId=... – fetch flow details and its Data Prep mapping (which paths are actually written). */
app.get('/api/streaming-flow-info', async (req, res) => {
  try {
    const flowId = (req.query?.flowId || process.env.AEP_PROFILE_FLOW_ID || '').trim();
    if (!flowId) {
      return res.status(400).json({ error: 'flowId required. Use ?flowId=... or set AEP_PROFILE_FLOW_ID.' });
    }
    const { token, config } = await getAuth();
    const cfg = getConfig();
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': process.env.AEP_IMS_ORG_ID || process.env.ADOBE_ORG_ID || config.orgId || '',
      'x-sandbox-name': config.sandboxName || 'production',
    };
    const flowRes = await fetch(`${FLOW_SERVICE_BASE}/flows/${flowId}`, { headers });
    const flowJson = await flowRes.json().catch(() => ({}));
    if (!flowRes.ok) {
      return res.status(flowRes.status).json({
        error: flowJson.message || flowJson.title || `Flow Service ${flowRes.status}`,
        flowId,
        response: flowJson,
      });
    }
    const flowEntity = flowJson.items?.[0] ?? flowJson;
    const sourceConnectionIds = flowEntity.sourceConnectionIds || flowJson.items?.[0]?.sourceConnectionIds || flowJson.sourceConnectionIds || [];
    let sourceConnection = null;
    if (sourceConnectionIds.length > 0) {
      const srcId = sourceConnectionIds[0];
      const srcRes = await fetch(`${FLOW_SERVICE_BASE}/sourceConnections/${srcId}`, { headers });
      sourceConnection = await srcRes.json().catch(() => ({}));
    }

    let mappingSet = null;
    const transformations = flowEntity.transformations || flowJson.items?.[0]?.transformations || [];
    const mappingParams = transformations.find((t) => t.name === 'Mapping' || t.params?.mappingId)?.params;
    const mappingId = mappingParams?.mappingId;
    if (mappingId) {
      const mapRes = await fetch(`${CONVERSION_BASE}/mappingSets/${mappingId}`, { headers });
      const mapJson = await mapRes.json().catch(() => ({}));
      if (mapRes.ok && mapJson.mappings) {
        mappingSet = {
          id: mappingId,
          mappedPaths: (mapJson.mappings || []).map((m) => ({
            source: m.source ?? m.sourceAttribute,
            destination: m.destination ?? m.destinationXdmPath,
          })),
          hint: 'Only these source paths are written to the profile. To update other attributes, add mappings in AEP: Sources → your HTTP API connection → Dataflow → Mapping.',
        };
      } else {
        mappingSet = { id: mappingId, error: mapRes.status, response: mapJson };
      }
    }

    res.json({
      flowId,
      flow: flowJson,
      sourceConnectionIds,
      sourceConnection: sourceConnection || undefined,
      mappingSet: mappingSet || undefined,
      hint: mappingSet?.mappedPaths?.length
        ? `Only ${mappingSet.mappedPaths.length} path(s) are mapped; only those attributes update. Add more mappings in AEP for other fields.`
        : 'Check sourceConnection or add mappings in AEP Dataflow for the attributes you want to update.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/** Generate a 38-digit ECID for new profiles. */
function generateEcid() {
  let s = '4';
  for (let i = 0; i < 37; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** POST /api/profile/generate – stream a profile record to AEP. Body: { email, industry?, profileIndex?, sandbox?, attributes?, appendIfExisting? }. */
app.post('/api/profile/generate', async (req, res) => {
  const email = (req.body?.email ?? '').trim();
  const industry = (req.body?.industry ?? '').trim().toLowerCase();
  const sandbox = (req.body?.sandbox || '').trim() || undefined;
  const attributes = req.body?.attributes && typeof req.body.attributes === 'object' ? req.body.attributes : {};
  const appendIfExisting =
    req.body?.appendIfExisting === true ||
    req.body?.appendIfExisting === 'true' ||
    (process.env.AEP_PROFILE_GENERATE_APPEND_IF_EXISTS || '').toLowerCase() === '1' ||
    (process.env.AEP_PROFILE_GENERATE_APPEND_IF_EXISTS || '').toLowerCase() === 'true';

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const streamUrl = process.env.AEP_PROFILE_STREAMING_URL || '';
  const flowId = process.env.AEP_PROFILE_FLOW_ID || '';
  const xdmKey = process.env.AEP_PROFILE_XDM_KEY || '_demoemea';

  if (!streamUrl || !flowId) {
    return res.status(400).json({
      error: 'Profile streaming not configured. Set AEP_PROFILE_STREAMING_URL and AEP_PROFILE_FLOW_ID in .env.',
    });
  }

  let mergeDiagnostics = null;
  try {
    const { token, config, cfg } = await getAuthForSandbox(sandbox);
    let ecid = generateEcid();
    let ecidSource = 'generated';
    if (appendIfExisting) {
      try {
        const { ecid: existingEcid, diagnostics } = await resolveExistingEcidForProfileMerge(email, sandbox);
        mergeDiagnostics = diagnostics;
        if (existingEcid && String(existingEcid).length >= 10) {
          ecid = existingEcid;
          ecidSource = 'existing';
        }
      } catch (lookupErr) {
        mergeDiagnostics = { error: String(lookupErr.message || lookupErr), namespacesAttempted: [] };
        console.warn(`[profile/generate] appendIfExisting: ${lookupErr.message || lookupErr}`);
      }
    }

    // Email from request body is mapped to _demoemea.identification.core.email
    const demoemea = {
      identification: {
        core: {
          ecid,
          email,
        },
      },
    };

    // Only process attributes with non-empty values
    const isEmpty = (v) => {
      if (v === undefined || v === null) return true;
      if (typeof v === 'string') return v.trim() === '';
      if (Array.isArray(v)) return v.length === 0 || v.every(isEmpty);
      if (typeof v === 'object') return Object.keys(v).length === 0 || Object.values(v).every(isEmpty);
      return false;
    };
    const stripEmpty = (obj) => {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(stripEmpty).filter((v) => !isEmpty(v));
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (isEmpty(v)) continue;
        const cleaned = stripEmpty(v);
        if (!isEmpty(cleaned)) out[k] = cleaned;
      }
      return out;
    };

    const filteredAttrs = stripEmpty(attributes);
    const rootExtras = {};
    assignProfileStreamingAttributes(demoemea, rootExtras, filteredAttrs);
    demoemea.testProfile = true;

    const { payload, format: payloadFormat } = buildProfileStreamPayload(
      demoemea,
      email,
      ecid,
      xdmKey,
      config.orgId,
      'Profile Viewer generate',
      rootExtras,
    );

    const apiKey = process.env.AEP_PROFILE_STREAMING_API_KEY || cfg.clientId;
    const headers = buildProfileDcsStreamingHeaders(token, config.sandboxName, flowId, apiKey);

    const dsMeta = await getProfileStreamDatasetDisplayMeta();
    const profileStreamingTarget = {
      profileStreamingUrl: streamUrl,
      profileStreamingFlowId: flowId,
      profileStreamingDatasetId: dsMeta.datasetId,
      profileStreamingDatasetQualifiedName: dsMeta.datasetQualifiedName,
      profileStreamingSchemaId: dsMeta.schemaId,
      profileStreamingDatasetInPayload: payloadFormat === 'envelope',
    };

    /** Schema $id vs dataflow: bare mode omits schemaRef in JSON; envelope includes it. */
    const streamingTransport = {
      payloadFormat,
      tenantSchemaId: PROFILE_STREAM_SCHEMA_ID,
      profileDatasetIdForEnvelope: PROFILE_STREAM_DATASET_ID,
      schemaRefInHttpBody: payloadFormat === 'envelope',
      dataflowFlowIdInHeader: Boolean(flowId),
      howIngestionIsResolved:
        payloadFormat === 'envelope'
          ? 'Envelope includes header.schemaRef and body.xdmMeta.schemaRef (tenantSchemaId) and datasetId; the collection URL plus x-adobe-flow-id still select the HTTP dataflow/inlet.'
          : 'Bare body has no schemaRef. Ingestion is driven by the HTTP dataflow (x-adobe-flow-id) and its dataset/Data Prep mapping. Set AEP_PROFILE_STREAMING_ENVELOPE=1 to include tenantSchemaId and datasetId in the JSON body.',
      profileAccessForAppend: {
        endpoint: PROFILE_API_BASE,
        schemaName: '_xdm.context.profile',
        note: 'Append uses Profile Access with schema.name=_xdm.context.profile (union profile), not the tenant schema URI. entityIdNS must match an Identity namespace code (Email, email, or AEP_PROFILE_MERGE_ENTITY_ID_NS).',
      },
    };

    const streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const rawText = await streamRes.text();
    const { parsed: data, streamErrors, streamWarnings } = parseStreamingCollectionResponse(streamRes.status, rawText);
    console.log(
      `[profile/generate] ${streamRes.status} ${email} format=${payloadFormat} xdmKey=${xdmKey} bodyPreview=${rawText ? rawText.slice(0, 200).replace(/\s+/g, ' ') : '(empty)'}`,
    );

    const reportMsg = data.report && (typeof data.report.message === 'string' ? data.report.message : JSON.stringify(data.report));
    const httpDetail = data.detail || data.message || data.title || reportMsg || `Streaming ${streamRes.status}`;
    const redacted = redactedProfileDcsRequestHeaders(headers);

    if (!streamRes.ok || streamErrors.length > 0) {
      const detail = streamErrors.length ? streamErrors.join(' ') : httpDetail;
      return res.status(502).json({
        error: detail,
        streamingStatus: streamRes.status,
        streamingResponse: data,
        sentToAep: payload,
        payloadFormat,
        streamErrors,
        streamWarnings,
        requestUrl: streamUrl,
        ...profileStreamingTarget,
        requestHeaders: redacted,
        email,
        ecid,
        ecidSource,
        appendIfExisting,
        mergeDiagnostics,
        streamingTransport,
        requestDetails: { method: 'POST', url: streamUrl, headers: redacted },
      });
    }

    return res.json({
      ok: true,
      message: `Request sent: ${email}`,
      email,
      ecid,
      ecidSource,
      appendIfExisting,
      mergeDiagnostics,
      streamingTransport,
      sentToAep: payload,
      payloadFormat,
      url: streamUrl,
      requestUrl: streamUrl,
      ...profileStreamingTarget,
      requestHeaders: redacted,
      streamingStatus: streamRes.status,
      streamingResponse: data,
      streamingWarning: streamWarnings.length ? streamWarnings.join(' ') : undefined,
      dataflowHint: PROFILE_STREAM_DATAFLOW_HINT,
      requestDetails: { method: 'POST', url: streamUrl, headers: redacted },
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Server error',
      sentToAep: null,
      streamingResponse: null,
    });
  }
});

/** POST /api/profile/update – streaming merge. Body: { email, ecid, updates?: [ { path, value } ], consent?: object, sandbox? }. Send either updates or consent, not both. */
app.post('/api/profile/update', async (req, res) => {
  const email = (req.body?.email ?? '').trim();
  const ecid = req.body?.ecid != null ? String(req.body.ecid).trim() : '';
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  const consentRaw = req.body?.consent;
  const hasConsent = consentRaw != null && typeof consentRaw === 'object' && !Array.isArray(consentRaw);
  const sandbox = (req.body?.sandbox || '').trim() || undefined;

  if (!email) {
    return res.status(400).json({ error: 'Email is required. Load a profile first.' });
  }
  if (!ecid || ecid.length < 10) {
    return res.status(400).json({ error: 'ECID is required. Load a profile first to get the ECID.' });
  }

  if (hasConsent && updates.length > 0) {
    return res.status(400).json({ error: 'Send either updates or consent, not both.' });
  }
  if (!hasConsent && updates.length === 0) {
    return res.status(400).json({
      error: 'No updates provided. Send a non-empty updates array or a consent object.',
      hint: 'Consent Manager must send updates[] (same as Profile Viewer) or a consent object.',
    });
  }

  const streamUrl = process.env.AEP_PROFILE_STREAMING_URL || '';
  const flowId = process.env.AEP_PROFILE_FLOW_ID || '';
  const xdmKey = process.env.AEP_PROFILE_XDM_KEY || '_demoemea';

  if (!streamUrl || !flowId) {
    return res.status(400).json({
      error: 'Profile streaming not configured. Set AEP_PROFILE_STREAMING_URL and AEP_PROFILE_FLOW_ID in this folder\'s .env (use the same URL and flow ID as in Postman).',
    });
  }

  try {
    const { token, config, cfg } = await getAuthForSandbox(sandbox);

    const apiKey = process.env.AEP_PROFILE_STREAMING_API_KEY || cfg.clientId;
    const headers = buildProfileDcsStreamingHeaders(token, config.sandboxName, flowId, apiKey);

    let demoemea;
    let applied;
    const skippedPaths = [];
    const rootExtras = {};
    let sourceLabel = 'Profile Viewer attribute update';
    let successMessage;
    /** Set for attribute updates only — paths merged into streaming payload (after tenant-prefix strip). */
    let appliedPathsDetail = null;

    if (hasConsent) {
      const c = consentRaw;
      const fragment = buildConsentXdm(email, {
        marketingConsent: c.marketingConsent,
        channelOptInOut: c.channelOptInOut,
        channels: c.channels,
        dataCollection: c.dataCollection,
        dataSharing: c.dataSharing,
        contentPersonalization: c.contentPersonalization,
      });
      demoemea = {
        identification: {
          core: {
            ecid,
            email,
          },
        },
        consents: fragment._demoemea.consents,
        optInOut: fragment._demoemea.optInOut,
      };
      applied = 1;
      sourceLabel = 'Consent Manager update';
      successMessage =
        'Profile update accepted (consent preferences). Refresh the profile or re-query to see changes.';
    } else {
      demoemea = {
        identification: {
          core: {
            ecid,
            email,
          },
        },
      };
      applied = 0;
      appliedPathsDetail = [];
      for (const u of updates) {
        const rawPath = u?.path != null ? String(u.path).trim() : '';
        let path = rawPath
          .replace(/^(_demoemea\.|xdm:demoss\.)/i, '')
          .replace(/^demoemea\./i, '');
        if (!path) {
          if (rawPath) skippedPaths.push(rawPath);
          continue;
        }
        const val = u.value;
        let out = val !== undefined && val !== null ? val : '';
        if (typeof out === 'string') {
          out = normalizeProfileUpdateDateString(path, out);
        }
        const top = path.split('.')[0];
        const underRootMixin = PROFILE_STREAM_ROOT_PATH_PREFIXES.has(top);
        const target = underRootMixin ? rootExtras : demoemea;
        if (typeof out === 'string' && out.trim() !== '' && /^\d+$/.test(out)) setByPath(target, path, parseInt(out, 10));
        else setByPath(target, path, out);
        applied++;
        appliedPathsDetail.push({ sourcePath: rawPath, relativePath: path, underRootMixin });
      }

      if (applied === 0) {
        return res.status(400).json({
          error: 'No valid attribute paths to update (paths empty after stripping schema prefix). Check that row paths are under your profile XDM.',
          skippedPaths,
        });
      }
      successMessage = `Profile update accepted (${applied} attribute${applied === 1 ? '' : 's'}). Refresh the profile to see changes.`;
    }

    const { payload, format: payloadFormat } = buildProfileStreamPayload(
      demoemea,
      email,
      ecid,
      xdmKey,
      config.orgId,
      sourceLabel,
      rootExtras,
    );

    const dsMeta = await getProfileStreamDatasetDisplayMeta();
    const profileStreamingTarget = {
      profileStreamingUrl: streamUrl,
      profileStreamingFlowId: flowId,
      profileStreamingDatasetId: dsMeta.datasetId,
      profileStreamingDatasetQualifiedName: dsMeta.datasetQualifiedName,
      profileStreamingSchemaId: dsMeta.schemaId,
      profileStreamingDatasetInPayload: payloadFormat === 'envelope',
    };

    const streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const rawText = await streamRes.text();
    const { parsed: data, streamErrors, streamWarnings } = parseStreamingCollectionResponse(streamRes.status, rawText);
    const pathsLogged =
      appliedPathsDetail && appliedPathsDetail.length
        ? ` relativePaths=${appliedPathsDetail.map((p) => p.relativePath).join(',')}`
        : '';
    console.log(
      `[profile/update] ${streamRes.status} ${email} applied=${applied} format=${payloadFormat} xdmKey=${xdmKey}${pathsLogged} bodyPreview=${rawText ? rawText.slice(0, 200).replace(/\s+/g, ' ') : '(empty)'}`,
    );

    const reportMsg = data.report && (typeof data.report.message === 'string' ? data.report.message : JSON.stringify(data.report));
    const httpDetail = data.detail || data.message || data.title || reportMsg || `Streaming ${streamRes.status}`;

    if (!streamRes.ok || streamErrors.length > 0) {
      const detail = streamErrors.length ? streamErrors.join(' ') : httpDetail;
      return res.status(502).json({
        error: detail,
        streamingStatus: streamRes.status,
        streamingResponse: data,
        sentToAep: payload,
        payloadFormat,
        streamErrors,
        streamWarnings,
        requestUrl: streamUrl,
        ...profileStreamingTarget,
        requestHeaders: redactedProfileDcsRequestHeaders(headers),
      });
    }

    return res.json({
      ok: true,
      message: successMessage,
      sentToAep: payload,
      payloadFormat,
      url: streamUrl,
      requestUrl: streamUrl,
      ...profileStreamingTarget,
      requestHeaders: redactedProfileDcsRequestHeaders(headers),
      streamingResponse: data,
      streamingWarning: streamWarnings.length ? streamWarnings.join(' ') : undefined,
      dataflowHint: PROFILE_STREAM_DATAFLOW_HINT,
      ...(appliedPathsDetail && appliedPathsDetail.length ? { appliedPathsDetail } : {}),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }

});

const publicDir = join(__dirname, 'public');
app.get('/', (req, res) => res.redirect('/home.html'));
app.get('/home.html', (req, res) => res.sendFile('home.html', { root: publicDir }));
app.use(express.static(publicDir));

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`Profile Viewer: http://localhost:${PORT}`);
  console.log(`Serving static from: ${publicDir}`);
});
