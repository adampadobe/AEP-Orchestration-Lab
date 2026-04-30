/**
 * Ensure schema (Profile-union ENABLED) + tenant Customer Analytics field group + dataset
 * for the lab's "Generic Profile" generator. Mirrors consentInfraService.js but the dataset
 * IS Profile-enabled (opposite of consent), because the page is meant to populate Profile.
 *
 * The HTTP API streaming dataflow itself is still created in the AEP UI (Sources → Streaming → HTTP API);
 * step 4 returns instructions for that, then `Fetch URL & Flow ID` resolves them via Flow Service.
 */

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';

/** Canonical XDM schema title (use the same in every sandbox). */
const GENERIC_PROFILE_SCHEMA_TITLE = 'AEP Lab - Generic Profile - Schema';
/** Catalog dataset name (same in every sandbox; Profile-enabled). */
const GENERIC_PROFILE_DATASET_NAME = 'AEP Lab - Generic Profile - Dataset';
/** Recommended name when creating the HTTP API streaming dataflow in AEP UI. */
const GENERIC_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Generic Profile - Dataflow';
/** Tenant field group title for the analytics fields (churn, propensity, NPS, AOV). */
const GENERIC_PROFILE_FIELD_GROUP_TITLE = 'AEP Lab - Customer Analytics';
/** Description of the analytics field group when we create it. */
const GENERIC_PROFILE_FIELD_GROUP_DESCRIPTION =
  'AEP Lab Customer Analytics: churn risk, propensity score, NPS, average order value (lab-only).';

const ACCEPT_XDM = 'application/vnd.adobe.xdm+json;version=1';
const ACCEPT_XED = 'application/vnd.adobe.xed+json;version=1';
const ACCEPT_JSON = 'application/json';

function logGen(sandbox, phase, detail = {}) {
  try {
    console.log('[genericProfileInfra]', JSON.stringify({ sandbox, phase, ...detail }));
  } catch (_) {
    console.log('[genericProfileInfra]', sandbox, phase);
  }
}

function headersJson(token, clientId, orgId, sandbox, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: ACCEPT_JSON,
    'Content-Type': ACCEPT_JSON,
    ...extra,
  };
}

function headersXed(token, clientId, orgId, sandbox, withContentType) {
  const h = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: ACCEPT_XED,
  };
  if (withContentType) h['Content-Type'] = ACCEPT_XED;
  return h;
}

function parseTenantFromUri(uri) {
  const m = String(uri || '').match(/^https:\/\/ns\.adobe\.com\/([^/]+)\//);
  return m ? m[1] : null;
}

function xdmKeyFromTenantId(tenantId) {
  return tenantId ? `_${tenantId}` : '_demoemea';
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/** Discover org tenant id (e.g. demoemea) from any existing tenant schema in the sandbox. */
async function discoverTenantContext(token, clientId, orgId, sandbox) {
  logGen(sandbox, 'discoverTenant.start', {});
  const url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=10&properties=title,$id,meta:altId`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
  if (!res.ok) {
    const msg = data.message || data.title || res.statusText;
    logGen(sandbox, 'discoverTenant.failed', { httpStatus: res.status, msg });
    throw new Error(`Schema list failed: ${msg}`);
  }
  const results = data.results || [];
  for (const s of results) {
    const tid = parseTenantFromUri(s.$id);
    if (tid) {
      logGen(sandbox, 'discoverTenant.ok', { tenantId: tid, xdmKey: xdmKeyFromTenantId(tid) });
      return { tenantId: tid, xdmKey: xdmKeyFromTenantId(tid), sampleSchemaId: s.$id };
    }
  }
  logGen(sandbox, 'discoverTenant.noTenantSchema', { scanned: results.length });
  throw new Error(
    'Could not discover XDM tenant id: no tenant schemas in this sandbox. Create any tenant schema first, or use a sandbox with existing XDM resources.'
  );
}

/** List tenant field groups with the same Accept-fallback strategy as consent infra. */
async function listTenantFieldGroups(token, clientId, orgId, sandbox) {
  const base = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const acceptCandidates = [
    'application/vnd.adobe.xed-id+json',
    'application/vnd.adobe.xed+json',
    'application/vnd.adobe.xed-id+json;version=1',
    'application/vnd.adobe.xed+json;version=1',
    'application/vnd.adobe.xdm+json;version=1',
    'application/json',
  ];
  const pathVariants = [
    '/tenant/fieldgroups?limit=200',
    '/tenant/fieldgroups',
    '/tenant/mixins?limit=200',
    '/tenant/mixins',
  ];
  let lastErr = 'Unknown';
  for (const pathSuffix of pathVariants) {
    const url = `${SCHEMA_REGISTRY}${pathSuffix}`;
    for (const accept of acceptCandidates) {
      const { res, data } = await fetchJson(url, { method: 'GET', headers: { ...base, Accept: accept } });
      if (res.ok) {
        const rows = data.results || [];
        logGen(sandbox, 'listFieldGroupsLike.ok', { path: pathSuffix.split('?')[0], count: rows.length });
        return rows;
      }
      lastErr = data.message || data.title || res.statusText || String(res.status);
      if (!/accept header/i.test(String(lastErr))) {
        throw new Error(`Tenant field groups list failed: ${lastErr}`);
      }
    }
  }
  throw new Error(`Tenant field groups list failed: ${lastErr}`);
}

function findProfileCoreV2Mixin(results) {
  return results.find((m) => {
    const t = String(m.title || '').toLowerCase();
    return t === 'profile core v2' || t.includes('profile core v2');
  });
}

function findCustomerAnalyticsFieldGroup(results) {
  const want = String(GENERIC_PROFILE_FIELD_GROUP_TITLE).toLowerCase();
  return results.find((m) => String(m.title || '').toLowerCase() === want);
}

async function listAllTenantSchemas(token, clientId, orgId, sandbox) {
  const out = [];
  let url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=100&properties=title,$id,meta:altId,version`;
  for (let page = 0; page < 50; page++) {
    const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
    if (!res.ok) break;
    const results = data.results || [];
    out.push(...results);
    const next =
      data._links?.next?.href ||
      (typeof data._links?.next === 'string' ? data._links.next : null) ||
      (typeof data._page?.next === 'string' ? data._page.next : null);
    if (!next) break;
    url = next.startsWith('http') ? next : `https://platform.adobe.io${next.startsWith('/') ? next : `/${next}`}`;
  }
  return out;
}

function findGenericProfileSchema(schemas) {
  const norm = (t) => String(t || '').trim();
  return schemas.find((s) => norm(s.title) === GENERIC_PROFILE_SCHEMA_TITLE);
}

async function getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId) {
  const enc = encodeURIComponent(metaAltId);
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
  if (!res.ok) return null;
  return data;
}

/** POST /tenant/schemas — accept retry mirrors consentInfraService (some clusters return 415). */
async function postTenantSchemaCreate(token, clientId, orgId, sandbox, body) {
  const url = `${SCHEMA_REGISTRY}/tenant/schemas`;
  const baseHeaders = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    'Content-Type': 'application/json',
  };
  const acceptOrder = [
    'application/vnd.adobe.xed+json',
    'application/vnd.adobe.xed+json;version=1',
    ACCEPT_XED,
    ACCEPT_XDM,
    'application/json',
  ];
  let lastErr = 'Unknown';
  for (const accept of acceptOrder) {
    const { res, data } = await fetchJson(url, {
      method: 'POST',
      headers: { ...baseHeaders, Accept: accept },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      logGen(sandbox, 'postTenantSchema.ok', { acceptUsed: accept.slice(0, 48) });
      return data;
    }
    lastErr = data.message || data.title || data.detail || res.statusText || String(res.status);
    const retry = res.status === 415 || res.status === 406 || /unsupported media type|not acceptable/i.test(String(lastErr));
    if (!retry) throw new Error(`Create schema failed: ${lastErr}`);
  }
  throw new Error(`Create schema failed: ${lastErr}`);
}

function buildGenericProfileSchemaShellBody() {
  return {
    title: GENERIC_PROFILE_SCHEMA_TITLE,
    type: 'object',
    description:
      'AEP Lab Generic Profile schema (Profile-enabled). Used by the Generate Profiles page to stream sample customer profiles with churn/propensity/NPS/AOV/loyalty/preferences attributes.',
    allOf: [{ $ref: 'https://ns.adobe.com/xdm/context/profile' }],
    'meta:class': 'https://ns.adobe.com/xdm/context/profile',
  };
}

function schemaHasProfileUnionTag(fullSchema) {
  if (!fullSchema || typeof fullSchema !== 'object') return false;
  const tags = fullSchema['meta:immutableTags'];
  if (!Array.isArray(tags)) return false;
  return tags.includes('union');
}

async function createGenericProfileSchemaShell(token, clientId, orgId, sandbox) {
  return postTenantSchemaCreate(token, clientId, orgId, sandbox, buildGenericProfileSchemaShellBody());
}

function collectSchemaRefUris(schema) {
  const set = new Set();
  for (const x of schema.allOf || []) {
    if (x && typeof x.$ref === 'string') set.add(x.$ref);
  }
  for (const u of schema['meta:extends'] || []) {
    if (typeof u === 'string') set.add(u);
  }
  return set;
}

/**
 * Build the tenant field group body (Customer Analytics).
 * Tenant XDM key is `_<tenantId>` (e.g. `_demoemea`). Properties live under that key.
 */
function buildCustomerAnalyticsFieldGroupBody(tenantId) {
  const xdmKey = `_${tenantId}`;
  return {
    title: GENERIC_PROFILE_FIELD_GROUP_TITLE,
    description: GENERIC_PROFILE_FIELD_GROUP_DESCRIPTION,
    type: 'object',
    'meta:intendedToExtend': ['https://ns.adobe.com/xdm/context/profile'],
    definitions: {
      customerAnalytics: {
        properties: {
          [xdmKey]: {
            type: 'object',
            properties: {
              scoring: {
                type: 'object',
                properties: {
                  core: {
                    type: 'object',
                    properties: {
                      propensityScore: {
                        type: 'number',
                        title: 'Propensity score',
                        description: 'Likelihood-to-purchase score (0-100).',
                      },
                    },
                  },
                  churn: {
                    type: 'object',
                    properties: {
                      churnPrediction: {
                        type: 'number',
                        title: 'Churn prediction',
                        description: 'Likelihood-to-churn score (0-100).',
                      },
                    },
                  },
                  nps: {
                    type: 'integer',
                    title: 'NPS score',
                    description: 'Net Promoter Score (0-10).',
                    minimum: 0,
                    maximum: 10,
                  },
                },
              },
              commerce: {
                type: 'object',
                properties: {
                  averageOrderValue: {
                    type: 'number',
                    title: 'Average order value',
                    description: 'Average spending per order (currency-units, tenant-defined).',
                  },
                },
              },
            },
          },
        },
      },
    },
    allOf: [{ $ref: '#/definitions/customerAnalytics' }],
  };
}

/** Idempotent: lookup by title, create if missing, return the full row. */
async function ensureCustomerAnalyticsFieldGroup(token, clientId, orgId, sandbox, tenantId) {
  const list = await listTenantFieldGroups(token, clientId, orgId, sandbox);
  const existing = findCustomerAnalyticsFieldGroup(list);
  if (existing && existing.$id) {
    logGen(sandbox, 'analyticsFG.exists', { fgIdSuffix: String(existing.$id).split('/').pop() });
    return { row: existing, created: false };
  }
  const body = buildCustomerAnalyticsFieldGroupBody(tenantId);
  const url = `${SCHEMA_REGISTRY}/tenant/fieldgroups`;
  const baseHeaders = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    'Content-Type': 'application/json',
  };
  const acceptOrder = [
    'application/vnd.adobe.xed+json',
    'application/vnd.adobe.xed+json;version=1',
    ACCEPT_XED,
    ACCEPT_XDM,
    'application/json',
  ];
  let lastErr = 'Unknown';
  for (const accept of acceptOrder) {
    const { res, data } = await fetchJson(url, {
      method: 'POST',
      headers: { ...baseHeaders, Accept: accept },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      logGen(sandbox, 'analyticsFG.created', { fgIdSuffix: String(data.$id || '').split('/').pop() });
      return { row: data, created: true };
    }
    lastErr = data.message || data.title || data.detail || res.statusText || String(res.status);
    const retry = res.status === 415 || res.status === 406 || /unsupported media type|not acceptable/i.test(String(lastErr));
    if (!retry) throw new Error(`Create Customer Analytics field group failed: ${lastErr}`);
  }
  throw new Error(`Create Customer Analytics field group failed: ${lastErr}`);
}

/** PATCH ops to attach Profile Core v2 + Demographic Details + Personal Contact Details + Loyalty Details + Customer Analytics. */
function buildAttachFieldGroupPatchOps(fullSchema, profileCoreMixinId, analyticsFgId) {
  const existing = collectSchemaRefUris(fullSchema);
  const toAdd = [
    'https://ns.adobe.com/xdm/context/profile-person-details',
    'https://ns.adobe.com/xdm/context/profile-personal-details',
    'https://ns.adobe.com/xdm/mixins/profile-loyalty-details',
    'https://ns.adobe.com/xdm/context/profile-preferences-details',
    String(profileCoreMixinId),
    String(analyticsFgId),
  ];
  const ops = [];
  for (const ref of toAdd) {
    if (!ref || existing.has(ref)) continue;
    ops.push({ op: 'add', path: '/meta:extends/-', value: ref });
    ops.push({ op: 'add', path: '/allOf/-', value: { $ref: ref } });
    existing.add(ref);
  }
  return ops;
}

async function patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, operations) {
  if (!operations || operations.length === 0) return null;
  const enc = encodeURIComponent(metaAltId);
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
  let ifMatch = '1';
  for (let attempt = 0; attempt < 4; attempt++) {
    const full = await getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId);
    if (full && full.version != null) ifMatch = String(full.version);
    const { res, data } = await fetchJson(url, {
      method: 'PATCH',
      headers: {
        ...headersJson(token, clientId, orgId, sandbox),
        'If-Match': ifMatch,
      },
      body: JSON.stringify(operations),
    });
    if (res.ok) return data;
    if (res.status === 412 || res.status === 428) {
      logGen(sandbox, 'patchSchema.preconditionRetry', { attempt, status: res.status });
      continue;
    }
    const msg = data.message || data.title || data.detail || res.statusText;
    throw new Error(`Schema PATCH failed: ${msg}`);
  }
  throw new Error('Schema PATCH failed: version conflict after retries');
}

function genericProfileFieldGroupsComplete(fullSchema, profileCoreMixinId, analyticsFgId) {
  if (!fullSchema || !profileCoreMixinId || !analyticsFgId) return false;
  const refs = collectSchemaRefUris(fullSchema);
  const need = [
    'https://ns.adobe.com/xdm/context/profile',
    'https://ns.adobe.com/xdm/context/profile-person-details',
    'https://ns.adobe.com/xdm/context/profile-personal-details',
    'https://ns.adobe.com/xdm/context/profile-preferences-details',
    String(profileCoreMixinId),
    String(analyticsFgId),
  ];
  return need.every((r) => refs.has(r));
}

async function attachFieldGroupsAndDescriptor(
  token,
  clientId,
  orgId,
  sandbox,
  tenantCtx,
  profileCore,
  analyticsFg,
  schemaRow
) {
  const metaAltId = schemaRow['meta:altId'];
  const schemaId = schemaRow.$id;
  let full = (await getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId)) || schemaRow;
  const ops = buildAttachFieldGroupPatchOps(full, profileCore.$id, analyticsFg.$id);
  let patchApplied = false;
  if (ops.length) {
    await patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, ops);
    patchApplied = true;
    full = (await getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId)) || full;
  }
  const sourceVersion = Number(full.version) || 1;
  const existingDesc = await listDescriptorsForSchema(token, clientId, orgId, sandbox, schemaId, metaAltId);
  const hasPrimaryEmail = existingDesc.some((d) => isPrimaryEmailIdentityDescriptor(d));
  let descriptorOk = hasPrimaryEmail;
  if (!hasPrimaryEmail) {
    try {
      await createPrimaryEmailDescriptor(token, clientId, orgId, sandbox, schemaId, sourceVersion, tenantCtx.xdmKey);
      descriptorOk = true;
    } catch (e) {
      const msg = String(e.message || e);
      if (/409|already exists|duplicate/i.test(msg)) descriptorOk = true;
      else throw e;
    }
  }
  return { patchApplied, descriptorOk, fullSchema: full };
}

function isPrimaryEmailIdentityDescriptor(d) {
  if (!d) return false;
  const primary = d['xdm:isPrimary'];
  if (primary !== true && primary !== 'true') return false;
  const prop = String(d['xdm:sourceProperty'] || '');
  if (!/email/i.test(prop)) return false;
  const ns = String(d['xdm:namespace'] || '').toLowerCase();
  const nsOk = !ns || ns === 'email' || ns.includes('email');
  if (!nsOk) return false;
  return /identification/i.test(prop) || /\/core\/email/i.test(prop) || /email$/i.test(prop.replace(/\/+$/, ''));
}

function descriptorSourceSchemaMatches(src, schemaId, schemaMetaAltId) {
  if (!src || !schemaId) return false;
  if (src === schemaId) return true;
  if (schemaMetaAltId && src === schemaMetaAltId) return true;
  const a = String(schemaId).replace(/\/+$/, '');
  const b = String(src).replace(/\/+$/, '');
  if (a === b) return true;
  if (schemaMetaAltId) {
    const c = String(schemaMetaAltId).replace(/\/+$/, '');
    if (b === c) return true;
  }
  return false;
}

function collectDescriptorResults(data) {
  if (!data || typeof data !== 'object') return [];
  const out = [];
  for (const x of [...(data.results || []), ...(data.children || [])]) {
    if (x && typeof x === 'object') out.push(x);
  }
  return out;
}

async function listDescriptorsForSchema(token, clientId, orgId, sandbox, schemaId, schemaMetaAltId) {
  const filterBySchema = (uri) =>
    `${SCHEMA_REGISTRY}/tenant/descriptors?limit=500&property=${encodeURIComponent(`xdm:sourceSchema==${uri}`)}`;
  const startUrls = [];
  if (schemaId) startUrls.push(filterBySchema(schemaId));
  if (schemaMetaAltId && schemaMetaAltId !== schemaId) startUrls.push(filterBySchema(schemaMetaAltId));
  startUrls.push(`${SCHEMA_REGISTRY}/tenant/descriptors?limit=500`);
  const acceptOrder = ['application/vnd.adobe.xdm+json', 'application/vnd.adobe.xdm-v2+json'];
  const baseHeaders = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  for (const accept of acceptOrder) {
    for (const startUrl of startUrls) {
      const { res, data } = await fetchJson(startUrl, {
        method: 'GET',
        headers: { ...baseHeaders, Accept: accept },
      });
      if (!res.ok) continue;
      const merged = collectDescriptorResults(data);
      const filtered = merged.filter((d) => {
        if (!d) return false;
        return descriptorSourceSchemaMatches(d['xdm:sourceSchema'], schemaId, schemaMetaAltId);
      });
      if (filtered.length > 0) return filtered;
    }
  }
  return [];
}

async function createPrimaryEmailDescriptor(token, clientId, orgId, sandbox, schemaId, sourceVersion, xdmKey) {
  const tenant = String(xdmKey || '_demoemea').replace(/^_/, '');
  const sourceProperty = `/_${tenant}/identification/core/email`;
  const body = {
    '@type': 'xdm:descriptorIdentity',
    'xdm:sourceSchema': schemaId,
    'xdm:sourceVersion': sourceVersion,
    'xdm:sourceProperty': sourceProperty,
    'xdm:namespace': 'Email',
    'xdm:property': 'xdm:code',
    'xdm:isPrimary': true,
  };
  const url = `${SCHEMA_REGISTRY}/tenant/descriptors`;
  const base = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const attempts = [
    { 'Content-Type': 'application/json', Accept: ACCEPT_XDM },
    { 'Content-Type': 'application/json', Accept: ACCEPT_XED },
  ];
  let lastErr = '';
  for (const h of attempts) {
    const { res, data } = await fetchJson(url, {
      method: 'POST',
      headers: { ...base, ...h },
      body: JSON.stringify(body),
    });
    if (res.ok) return data;
    lastErr = data.message || data.title || data.detail || res.statusText;
    if (res.status !== 415 && !/unsupported media type/i.test(String(lastErr))) {
      throw new Error(`Create identity descriptor failed: ${lastErr}`);
    }
  }
  throw new Error(`Create identity descriptor failed: ${lastErr}`);
}

async function paginateDataSets(token, clientId, orgId, sandbox) {
  const pages = [];
  let url = `${CATALOG_BASE}/dataSets?limit=100&properties=name,schemaRef,tags`;
  for (let i = 0; i < 100; i++) {
    const { res, data } = await fetchJson(url, { method: 'GET', headers: headersJson(token, clientId, orgId, sandbox) });
    if (!res.ok) {
      const msg = data.message || data.title || res.statusText;
      throw new Error(`Catalog dataSets: ${msg}`);
    }
    pages.push(data);
    const next = data._links?.next?.href || data._page?.next;
    if (!next) break;
    url = next.startsWith('http') ? next : `https://platform.adobe.io${next.startsWith('/') ? next : `/${next}`}`;
  }
  return pages;
}

function flattenDatasets(pages) {
  const rows = [];
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    if (Array.isArray(p)) {
      rows.push(...p);
      continue;
    }
    if (Array.isArray(p.children)) rows.push(...p.children);
    if (Array.isArray(p.results)) rows.push(...p.results);
    if (Array.isArray(p.datasets)) rows.push(...p.datasets);
    for (const [k, v] of Object.entries(p)) {
      if (k.startsWith('_')) continue;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const idKey24 = /^[0-9a-f]{24}$/i.test(k);
      const idKeyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k);
      if (idKey24 || idKeyUuid || typeof v.name === 'string' || v.schemaRef) {
        rows.push({ ...v, id: v.id || k });
      }
    }
  }
  const byId = new Map();
  for (const r of rows) {
    const id = r && r.id;
    if (id && !byId.has(id)) byId.set(id, r);
  }
  return [...byId.values()];
}

function findDatasetForSchema(datasets, schemaId, schemaMetaAltId) {
  if (!schemaId) return undefined;
  const byRef = datasets.find((d) => {
    const refId = d?.schemaRef?.id;
    if (!refId) return false;
    if (refId === schemaId) return true;
    if (schemaMetaAltId && refId === schemaMetaAltId) return true;
    const a = String(schemaId).replace(/\/+$/, '');
    const b = String(refId).replace(/\/+$/, '');
    return a === b;
  });
  if (byRef) return byRef;
  return datasets.find((d) => d && String(d.name || '') === GENERIC_PROFILE_DATASET_NAME);
}

async function listDataSetsByPropertyFilter(token, clientId, orgId, sandbox, propertyExpr) {
  const url = `${CATALOG_BASE}/dataSets?limit=50&properties=name,schemaRef,tags&property=${encodeURIComponent(propertyExpr)}`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headersJson(token, clientId, orgId, sandbox) });
  if (!res.ok) return [];
  return flattenDatasets([data]);
}

/** True when the dataset row already has the unifiedProfile=enabled tag. */
function datasetHasProfileEnabledTag(ds) {
  const tags = ds && ds.tags;
  if (!tags || typeof tags !== 'object') return false;
  const v = tags.unifiedProfile;
  if (!Array.isArray(v)) return false;
  return v.some((s) => /enabled\s*[:=]\s*true/i.test(String(s)));
}

/** Profile-ENABLED dataset (opposite of consent). Tags include unifiedProfile=["enabled:true"]. */
async function createDataset(token, clientId, orgId, sandbox, schemaId, name) {
  const body = {
    name,
    description:
      'AEP Lab Generic Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for sample profile generation in this lab.',
    schemaRef: {
      id: schemaId,
      contentType: 'application/vnd.adobe.xed+json;version=1',
    },
    tags: {
      unifiedProfile: ['enabled:true'],
    },
  };
  const url = `${CATALOG_BASE}/dataSets`;
  const { res, data } = await fetchJson(url, {
    method: 'POST',
    headers: {
      ...headersJson(token, clientId, orgId, sandbox),
      Accept: 'application/vnd.adobe.xdm+json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = data.message || data.title || data.detail || res.statusText;
    throw new Error(`Create dataset failed: ${msg}`);
  }
  if (Array.isArray(data) && data[0] && typeof data[0] === 'string') {
    const m = data[0].match(/@\/dataSets\/([0-9a-fA-F]+)/);
    if (m) return { id: m[1], raw: data };
  }
  if (data && data.id) return data;
  return { id: null, raw: data };
}

/** PATCH an existing dataset to add unifiedProfile=enabled:true (best-effort; some clusters disallow). */
async function enableProfileOnDataset(token, clientId, orgId, sandbox, datasetId) {
  if (!datasetId) return { ok: false };
  const url = `${CATALOG_BASE}/dataSets/${encodeURIComponent(datasetId)}`;
  const body = { tags: { unifiedProfile: ['enabled:true'] } };
  const { res, data } = await fetchJson(url, {
    method: 'PATCH',
    headers: { ...headersJson(token, clientId, orgId, sandbox), Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: data.message || data.title || res.statusText };
}

function manualFlowSteps() {
  return [
    `In AEP: Sources → Streaming → HTTP API — create a connection and dataflow named "${GENERIC_PROFILE_HTTP_DATAFLOW_NAME}" targeting dataset "${GENERIC_PROFILE_DATASET_NAME}".`,
    'When prompted, accept that the dataset is enabled for Real-Time Customer Profile (this is the intended setup for Generic Profile, opposite of the Consent dataset).',
    'After the dataflow is created, click "Fetch URL & Flow ID from AEP" on this page to populate the Collection URL and Flow ID, then click Save connection.',
    'Use Generate or Update to stream profiles via /api/profile/update.',
  ];
}

async function runGenericProfileInfraStatus(sandbox, token, clientId, orgId) {
  logGen(sandbox, 'status.start', {});
  let tenantCtx;
  try {
    tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
  } catch (e) {
    return {
      ok: false,
      sandbox,
      error: String(e.message || e),
      ready: false,
      naming: {
        schema: GENERIC_PROFILE_SCHEMA_TITLE,
        dataset: GENERIC_PROFILE_DATASET_NAME,
        httpDataflow: GENERIC_PROFILE_HTTP_DATAFLOW_NAME,
        fieldGroup: GENERIC_PROFILE_FIELD_GROUP_TITLE,
      },
    };
  }

  let mixins;
  try {
    mixins = await listTenantFieldGroups(token, clientId, orgId, sandbox);
  } catch (e) {
    const msg = String(e.message || e);
    return {
      ok: false,
      sandbox,
      ready: false,
      error: msg,
      tenantId: tenantCtx.tenantId,
      xdmKey: tenantCtx.xdmKey,
      fieldGroupsListFailed: true,
      naming: {
        schema: GENERIC_PROFILE_SCHEMA_TITLE,
        dataset: GENERIC_PROFILE_DATASET_NAME,
        httpDataflow: GENERIC_PROFILE_HTTP_DATAFLOW_NAME,
        fieldGroup: GENERIC_PROFILE_FIELD_GROUP_TITLE,
      },
      nextSteps: manualFlowSteps(),
    };
  }
  const profileCore = findProfileCoreV2Mixin(mixins);
  const analyticsFg = findCustomerAnalyticsFieldGroup(mixins);

  const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
  const schema = findGenericProfileSchema(allSchemas);

  const pages = await paginateDataSets(token, clientId, orgId, sandbox);
  let datasets = flattenDatasets(pages);
  let dataset = schema ? findDatasetForSchema(datasets, schema.$id, schema['meta:altId']) : null;
  if (!dataset && schema) {
    try {
      const byName = await listDataSetsByPropertyFilter(
        token,
        clientId,
        orgId,
        sandbox,
        `name==${GENERIC_PROFILE_DATASET_NAME}`
      );
      dataset = findDatasetForSchema(byName, schema.$id, schema['meta:altId']);
    } catch (_) {
      /* ignore */
    }
  }

  let hasDescriptor = false;
  let fieldGroupsAttached = false;
  let schemaInProfileUnion = false;
  if (schema) {
    const desc = await listDescriptorsForSchema(token, clientId, orgId, sandbox, schema.$id, schema['meta:altId']);
    hasDescriptor = desc.some((d) => isPrimaryEmailIdentityDescriptor(d));
    if (schema['meta:altId']) {
      const full = await getSchemaByAltId(token, clientId, orgId, sandbox, schema['meta:altId']);
      if (full) {
        schemaInProfileUnion = schemaHasProfileUnionTag(full);
        if (profileCore && analyticsFg) {
          fieldGroupsAttached = genericProfileFieldGroupsComplete(full, profileCore.$id, analyticsFg.$id);
        }
      }
    }
  }

  const datasetProfileEnabled = !!dataset && datasetHasProfileEnabledTag(dataset);
  const ready = !!(profileCore && analyticsFg && schema && dataset && hasDescriptor && fieldGroupsAttached);

  return {
    ok: true,
    sandbox,
    ready,
    schemaInProfileUnion,
    tenantId: tenantCtx.tenantId,
    xdmKey: tenantCtx.xdmKey,
    profileCoreMixinFound: !!profileCore,
    profileCoreMixinId: profileCore?.$id || null,
    analyticsFieldGroupFound: !!analyticsFg,
    analyticsFieldGroupId: analyticsFg?.$id || null,
    schemaFound: !!schema,
    schemaId: schema?.$id || null,
    schemaMetaAltId: schema?.['meta:altId'] || null,
    primaryEmailDescriptor: hasDescriptor,
    datasetFound: !!dataset,
    datasetId: dataset?.id || null,
    datasetProfileEnabled,
    prepSteps: {
      step1_schemaShell: !!schema,
      step2_fieldGroupsIdentity: !!(schema && fieldGroupsAttached),
      step3_dataset: !!dataset && datasetProfileEnabled,
      step4_readyForManualHttpFlow: !!dataset,
    },
    naming: {
      schema: GENERIC_PROFILE_SCHEMA_TITLE,
      dataset: GENERIC_PROFILE_DATASET_NAME,
      httpDataflow: GENERIC_PROFILE_HTTP_DATAFLOW_NAME,
      fieldGroup: GENERIC_PROFILE_FIELD_GROUP_TITLE,
    },
    nextSteps: ready ? [] : manualFlowSteps(),
  };
}

const GENERIC_PROFILE_INFRA_STEP_NAMES = ['createSchema', 'attachFieldGroups', 'createDataset', 'httpFlow'];

async function runGenericProfileInfraStep(sandbox, token, clientId, orgId, stepName) {
  const step = String(stepName || '').trim();
  logGen(sandbox, 'wizard.step', { step });
  if (!GENERIC_PROFILE_INFRA_STEP_NAMES.includes(step)) {
    return {
      ok: false,
      sandbox,
      error: `Invalid step "${step}". Use one of: ${GENERIC_PROFILE_INFRA_STEP_NAMES.join(', ')}.`,
    };
  }

  try {
    if (step === 'createSchema') {
      const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
      const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
      const existing = findGenericProfileSchema(allSchemas);
      if (existing) {
        return {
          ok: true,
          sandbox,
          step,
          skipped: true,
          message: `Schema "${GENERIC_PROFILE_SCHEMA_TITLE}" already exists. Run step 2.`,
          tenantId: tenantCtx.tenantId,
          xdmKey: tenantCtx.xdmKey,
          schemaId: existing.$id,
          schemaMetaAltId: existing['meta:altId'],
        };
      }
      const created = await createGenericProfileSchemaShell(token, clientId, orgId, sandbox);
      return {
        ok: true,
        sandbox,
        step,
        schemaCreated: true,
        tenantId: tenantCtx.tenantId,
        xdmKey: tenantCtx.xdmKey,
        schemaId: created.$id,
        schemaMetaAltId: created['meta:altId'],
        message:
          'Schema shell created (Profile class only). Run step 2 to attach field groups + Customer Analytics + primary Email identity.',
      };
    }

    if (step === 'attachFieldGroups') {
      const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
      const mixins = await listTenantFieldGroups(token, clientId, orgId, sandbox);
      const profileCore = findProfileCoreV2Mixin(mixins);
      if (!profileCore) {
        return {
          ok: false,
          sandbox,
          step,
          profileCoreMixinMissing: true,
          error:
            'Profile Core v2 field group not found in this sandbox. Import it first, then run this step again.',
        };
      }
      const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
      const schema = findGenericProfileSchema(allSchemas);
      if (!schema) {
        return {
          ok: false,
          sandbox,
          step,
          error: `No schema "${GENERIC_PROFILE_SCHEMA_TITLE}". Run step 1 (Create schema) first.`,
        };
      }
      const analytics = await ensureCustomerAnalyticsFieldGroup(token, clientId, orgId, sandbox, tenantCtx.tenantId);
      const ar = await attachFieldGroupsAndDescriptor(
        token,
        clientId,
        orgId,
        sandbox,
        tenantCtx,
        profileCore,
        analytics.row,
        schema
      );
      return {
        ok: true,
        sandbox,
        step,
        tenantId: tenantCtx.tenantId,
        xdmKey: tenantCtx.xdmKey,
        schemaId: schema.$id,
        schemaMetaAltId: schema['meta:altId'],
        profileCoreMixinId: profileCore.$id,
        analyticsFieldGroupId: analytics.row.$id,
        analyticsFieldGroupCreated: analytics.created,
        patchApplied: ar.patchApplied,
        descriptorOk: ar.descriptorOk,
        message: ar.patchApplied
          ? 'Field groups attached and primary Email identity set (Profile Core v2 + Demographic Details + Personal Contact Details + Loyalty Details + Customer Analytics).'
          : 'Field groups were already present; primary Email identity checked.',
      };
    }

    if (step === 'createDataset') {
      const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
      const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
      const schema = findGenericProfileSchema(allSchemas);
      if (!schema) {
        return {
          ok: false,
          sandbox,
          step,
          error: 'Generic Profile schema not found. Complete steps 1 and 2 first.',
        };
      }
      const schemaId = schema.$id;
      const pages = await paginateDataSets(token, clientId, orgId, sandbox);
      const datasets = flattenDatasets(pages);
      let dataset = findDatasetForSchema(datasets, schemaId, schema['meta:altId']);
      if (!dataset) {
        try {
          const byName = await listDataSetsByPropertyFilter(
            token,
            clientId,
            orgId,
            sandbox,
            `name==${GENERIC_PROFILE_DATASET_NAME}`
          );
          dataset = findDatasetForSchema(byName, schemaId, schema['meta:altId']);
        } catch (_) {
          /* ignore */
        }
      }
      if (dataset) {
        const profileEnabled = datasetHasProfileEnabledTag(dataset);
        let enabledNow = profileEnabled;
        if (!profileEnabled) {
          const r = await enableProfileOnDataset(token, clientId, orgId, sandbox, dataset.id);
          enabledNow = r.ok;
        }
        return {
          ok: true,
          sandbox,
          step,
          skipped: true,
          datasetProfileEnabled: enabledNow,
          message: enabledNow
            ? `Dataset already exists (${dataset.name || GENERIC_PROFILE_DATASET_NAME}) and is Profile-enabled.`
            : `Dataset already exists but is NOT Profile-enabled. Enable it for Real-Time Customer Profile in AEP UI before generating profiles.`,
          tenantId: tenantCtx.tenantId,
          xdmKey: tenantCtx.xdmKey,
          schemaId,
          schemaMetaAltId: schema['meta:altId'],
          datasetId: dataset.id,
        };
      }
      const dsRes = await createDataset(token, clientId, orgId, sandbox, schemaId, GENERIC_PROFILE_DATASET_NAME);
      dataset = { id: dsRes.id, name: GENERIC_PROFILE_DATASET_NAME, schemaRef: { id: schemaId } };
      return {
        ok: true,
        sandbox,
        step,
        datasetCreated: true,
        datasetProfileEnabled: true,
        tenantId: tenantCtx.tenantId,
        xdmKey: tenantCtx.xdmKey,
        schemaId,
        schemaMetaAltId: schema['meta:altId'],
        datasetId: dataset.id,
        message: `Dataset "${GENERIC_PROFILE_DATASET_NAME}" created (Profile-enabled). Run step 4 for HTTP flow instructions.`,
      };
    }

    return {
      ok: true,
      sandbox,
      step: 'httpFlow',
      manual: true,
      naming: {
        schema: GENERIC_PROFILE_SCHEMA_TITLE,
        dataset: GENERIC_PROFILE_DATASET_NAME,
        httpDataflow: GENERIC_PROFILE_HTTP_DATAFLOW_NAME,
        fieldGroup: GENERIC_PROFILE_FIELD_GROUP_TITLE,
      },
      nextSteps: manualFlowSteps(),
      message: `Create HTTP API dataflow "${GENERIC_PROFILE_HTTP_DATAFLOW_NAME}" for dataset "${GENERIC_PROFILE_DATASET_NAME}". Then use "Fetch URL & Flow ID from AEP" on this page (Flow Service) or paste URL + Flow ID below.`,
    };
  } catch (e) {
    const msg = String(e.message || e);
    logGen(sandbox, 'wizard.step.error', { step, error: msg.slice(0, 400) });
    return { ok: false, sandbox, step, error: msg };
  }
}

module.exports = {
  runGenericProfileInfraStatus,
  runGenericProfileInfraStep,
  GENERIC_PROFILE_SCHEMA_TITLE,
  GENERIC_PROFILE_DATASET_NAME,
  GENERIC_PROFILE_HTTP_DATAFLOW_NAME,
  GENERIC_PROFILE_FIELD_GROUP_TITLE,
  GENERIC_PROFILE_INFRA_STEP_NAMES,
};
