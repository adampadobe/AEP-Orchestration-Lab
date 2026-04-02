/**
 * Adobe Experience Platform Schema Registry (tenant schemas + global field groups).
 * Base path: /data/foundation/schemaregistry
 * @see https://experienceleague.adobe.com/docs/experience-platform/xdm/api/schemas.html
 */

const SCHEMA_REGISTRY_BASE = 'https://platform.adobe.io/data/foundation/schemaregistry';
const ACCEPT_XDM = 'application/vnd.adobe.xdm+json;version=1';

/**
 * @param {string} token
 * @param {string} clientId
 * @param {string} orgId
 * @param {string} sandbox
 * @param {{ contentType?: boolean, ifMatch?: string }} [opts]
 */
function schemaRegistryHeaders(token, clientId, orgId, sandbox, opts = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: ACCEPT_XDM,
  };
  if (opts.contentType) {
    headers['Content-Type'] = ACCEPT_XDM;
  }
  if (opts.ifMatch != null && String(opts.ifMatch).trim() !== '') {
    headers['If-Match'] = String(opts.ifMatch).trim();
  }
  return headers;
}

function encodeSchemaPathId(metaAltIdOrEncoded) {
  const s = String(metaAltIdOrEncoded || '').trim();
  if (!s) throw new Error('Missing schema id (meta:altId or encoded $id)');
  if (s.startsWith('http')) {
    return encodeURIComponent(s);
  }
  return encodeURIComponent(s);
}

/**
 * @param {string} pathWithLeadingSlash
 * @param {Record<string, string | number | undefined>} [query]
 */
function buildUrl(pathWithLeadingSlash, query) {
  let url = `${SCHEMA_REGISTRY_BASE}${pathWithLeadingSlash}`;
  if (query && typeof query === 'object') {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === '') continue;
      qs.set(k, String(v));
    }
    const q = qs.toString();
    if (q) url += (url.includes('?') ? '&' : '?') + q;
  }
  return url;
}

async function parseJsonResponse(res) {
  const ct = res.headers.get('Content-Type') || '';
  if (ct.toLowerCase().includes('json')) {
    return res.json().catch(() => ({}));
  }
  const text = await res.text();
  return { _raw: text.slice(0, 20000) };
}

/**
 * List tenant schemas (optionally limit fields returned).
 */
async function listTenantSchemas(token, clientId, orgId, sandbox, query = {}) {
  const url = buildUrl('/tenant/schemas', query);
  const res = await fetch(url, {
    method: 'GET',
    headers: schemaRegistryHeaders(token, clientId, orgId, sandbox),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    const msg = data.title || data.message || data.error_code || res.statusText;
    const err = new Error(`Schema Registry ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * GET a single tenant schema by meta:altId or full schema $id URI.
 */
async function getTenantSchema(token, clientId, orgId, sandbox, metaAltIdOrSchemaId) {
  const enc = encodeSchemaPathId(metaAltIdOrSchemaId);
  const url = buildUrl(`/tenant/schemas/${enc}`);
  const res = await fetch(url, {
    method: 'GET',
    headers: schemaRegistryHeaders(token, clientId, orgId, sandbox),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    const msg = data.title || data.message || data.error_code || res.statusText;
    const err = new Error(`Schema Registry ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * Create tenant schema (descriptor body matches Postman / Adobe docs).
 */
async function createTenantSchema(token, clientId, orgId, sandbox, descriptor) {
  const url = buildUrl('/tenant/schemas');
  const res = await fetch(url, {
    method: 'POST',
    headers: schemaRegistryHeaders(token, clientId, orgId, sandbox, { contentType: true }),
    body: JSON.stringify(descriptor),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    const msg = data.title || data.message || data.error_code || res.statusText;
    const err = new Error(`Schema Registry ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * PATCH tenant schema descriptor (e.g. JSON Patch to add field group $ref to allOf).
 * @param {unknown} patchBody - Array of JSON Patch ops or object per your Adobe contract
 */
async function patchTenantSchema(token, clientId, orgId, sandbox, metaAltIdOrSchemaId, patchBody, ifMatch) {
  const enc = encodeSchemaPathId(metaAltIdOrSchemaId);
  const url = buildUrl(`/tenant/schemas/${enc}`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: schemaRegistryHeaders(token, clientId, orgId, sandbox, {
      contentType: true,
      ifMatch,
    }),
    body: JSON.stringify(patchBody),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    const msg = data.title || data.message || data.error_code || res.statusText;
    const err = new Error(`Schema Registry ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * List global field groups; pass class URL to filter (e.g. profile class).
 */
async function listGlobalFieldGroups(token, clientId, orgId, sandbox, query = {}) {
  const url = buildUrl('/global/fieldgroups', query);
  const res = await fetch(url, {
    method: 'GET',
    headers: schemaRegistryHeaders(token, clientId, orgId, sandbox),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    const msg = data.title || data.message || data.error_code || res.statusText;
    const err = new Error(`Schema Registry ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

module.exports = {
  SCHEMA_REGISTRY_BASE,
  ACCEPT_XDM,
  listTenantSchemas,
  getTenantSchema,
  createTenantSchema,
  patchTenantSchema,
  listGlobalFieldGroups,
};
