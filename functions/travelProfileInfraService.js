/**
 * Ensure schema (Profile-union ENABLED) + tenant attribute extensibility + dataset
 * for the lab's "Travel Profile" generator. Mirrors genericProfileInfraService.js
 * exactly — same OOTB Profile field-group set, same wizard steps, same dataset
 * Profile-enabled flag — but uses Travel-specific titles so Generic and Travel
 * end up as two independent (schema, dataset, dataflow) triplets in the same
 * sandbox.
 *
 * The HTTP API streaming dataflow is still created in the AEP UI; step 4
 * returns instructions for that, then `Fetch URL & Flow ID` resolves them
 * via Flow Service (same shared `consentFlowLookup` helper used by Generic).
 *
 * No tenant field group is auto-created or auto-attached. Travel-specific
 * tenant paths (e.g. `_demoemea.individualCharacteristics.travel.*`,
 * `_demoemea.travelReservations.*`) are streamed via Profile Core v2's
 * tenant subtree so they surface in UPS without needing a custom tenant
 * field group attached at schema level.
 *
 * Travel-only addition vs Generic: the Adobe-OOTB **Travel Preferences**
 * field group (`https://ns.adobe.com/xdm/mixins/profile/travel-preferences`)
 * is attached on top of the Generic set. It is the only Travel-themed
 * Adobe field group that is intended for the Profile class — Flight
 * Reservation, Dining Reservation and Upgrade Details are scoped to the
 * ExperienceEvent class (`meta:intendedToExtend` enforced by the Schema
 * Registry) and would be rejected by step 2 if attached here. Reservation
 * data therefore continues to ride on the tenant subtree (above) for now;
 * a separate Travel ExperienceEvent pipeline is the right home for canonical
 * flight/dining/upgrade event data — see plan "Out of scope" / follow-ups.
 */

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';

/** Canonical XDM schema title (use the same in every sandbox). */
const TRAVEL_PROFILE_SCHEMA_TITLE = 'AEP Lab - Travel Profile - Schema';
/** Catalog dataset name (same in every sandbox; Profile-enabled). */
const TRAVEL_PROFILE_DATASET_NAME = 'AEP Lab - Travel Profile - Dataset';
/** Recommended name when creating the HTTP API streaming dataflow in AEP UI. */
const TRAVEL_PROFILE_HTTP_DATAFLOW_NAME = 'AEP Lab - Travel Profile - Dataflow';

const ACCEPT_XDM = 'application/vnd.adobe.xdm+json;version=1';
const ACCEPT_XED = 'application/vnd.adobe.xed+json;version=1';
const ACCEPT_JSON = 'application/json';

function logTravel(sandbox, phase, detail = {}) {
  try {
    console.log('[travelProfileInfra]', JSON.stringify({ sandbox, phase, ...detail }));
  } catch (_) {
    console.log('[travelProfileInfra]', sandbox, phase);
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
  logTravel(sandbox, 'discoverTenant.start', {});
  const url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=10&properties=title,$id,meta:altId`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
  if (!res.ok) {
    const msg = data.message || data.title || res.statusText;
    logTravel(sandbox, 'discoverTenant.failed', { httpStatus: res.status, msg });
    throw new Error(`Schema list failed: ${msg}`);
  }
  const results = data.results || [];
  for (const s of results) {
    const tid = parseTenantFromUri(s.$id);
    if (tid) {
      logTravel(sandbox, 'discoverTenant.ok', { tenantId: tid, xdmKey: xdmKeyFromTenantId(tid) });
      return { tenantId: tid, xdmKey: xdmKeyFromTenantId(tid), sampleSchemaId: s.$id };
    }
  }
  logTravel(sandbox, 'discoverTenant.noTenantSchema', { scanned: results.length });
  throw new Error(
    'Could not discover XDM tenant id: no tenant schemas in this sandbox. Create any tenant schema first, or use a sandbox with existing XDM resources.'
  );
}

/** List tenant field groups with the same Accept-fallback strategy as Generic. */
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
        logTravel(sandbox, 'listFieldGroupsLike.ok', { path: pathSuffix.split('?')[0], count: rows.length });
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

function findTravelProfileSchema(schemas) {
  const norm = (t) => String(t || '').trim();
  return schemas.find((s) => norm(s.title) === TRAVEL_PROFILE_SCHEMA_TITLE);
}

async function getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId) {
  const enc = encodeURIComponent(metaAltId);
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
  if (!res.ok) return null;
  return data;
}

/** POST /tenant/schemas — accept retry mirrors Generic (some clusters return 415). */
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
      logTravel(sandbox, 'postTenantSchema.ok', { acceptUsed: accept.slice(0, 48) });
      return data;
    }
    lastErr = data.message || data.title || data.detail || res.statusText || String(res.status);
    const retry = res.status === 415 || res.status === 406 || /unsupported media type|not acceptable/i.test(String(lastErr));
    if (!retry) throw new Error(`Create schema failed: ${lastErr}`);
  }
  throw new Error(`Create schema failed: ${lastErr}`);
}

function buildTravelProfileSchemaShellBody() {
  return {
    title: TRAVEL_PROFILE_SCHEMA_TITLE,
    type: 'object',
    description:
      'AEP Lab Travel Profile schema (Profile-enabled). Used by the Generate Profiles page (Travel industry) to stream sample customer profiles with travel attribute and reservation data alongside the standard Generic profile fields.',
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

async function createTravelProfileSchemaShell(token, clientId, orgId, sandbox) {
  return postTenantSchemaCreate(token, clientId, orgId, sandbox, buildTravelProfileSchemaShellBody());
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
 * PATCH ops to attach the same OOTB Profile field group set as Generic
 * (Profile Core v2 + Demographic Details + Personal Contact Details +
 * Loyalty Details + Consent and Preference Details + Preference Details),
 * PLUS the Travel-only OOTB Profile field group **Travel Preferences**
 * (home airport, meal preference, seat preference, etc.).
 *
 * Only Profile-class Adobe field groups are listed here. The Schema
 * Registry rejects ExperienceEvent-scoped field groups (Flight / Dining /
 * Upgrade) when PATCH'd onto a Profile schema, so those are deliberately
 * NOT in `toAdd` — see the file-level comment for the longer explanation.
 *
 * Travel-specific attribute paths (`_<tenant>.individualCharacteristics.travel.*`,
 * `_<tenant>.travelReservations.*`) ride on Profile Core v2's tenant
 * subtree extensibility — no extra tenant field group is attached here so
 * the wizard stays sandbox-portable. If a sandbox restricts that subtree
 * later we can introduce a custom tenant FG in a follow-up commit (see
 * the plan's "Out of scope" section).
 */
function buildAttachFieldGroupPatchOps(fullSchema, profileCoreMixinId) {
  const existing = collectSchemaRefUris(fullSchema);
  const toAdd = [
    'https://ns.adobe.com/xdm/context/profile-person-details',
    'https://ns.adobe.com/xdm/context/profile-personal-details',
    'https://ns.adobe.com/xdm/mixins/profile/profile-loyalty-details',
    'https://ns.adobe.com/xdm/mixins/profile-consents',
    'https://ns.adobe.com/xdm/context/profile-preferences-details',
    'https://ns.adobe.com/xdm/mixins/profile/travel-preferences',
    String(profileCoreMixinId),
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
  // 6 attempts to absorb both 412/428 precondition-conflict retries and
  // the AEP propagation window where the schema appears in the listing
  // index seconds before it becomes retrievable by altId. Backoff for
  // 404: 1.5s, 3s, 4.5s, 6s, 7.5s — total ~22s of patience.
  const NOT_FOUND_BACKOFF_MS = [1500, 3000, 4500, 6000, 7500];
  for (let attempt = 0; attempt < 6; attempt++) {
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
      logTravel(sandbox, 'patchSchema.preconditionRetry', { attempt, status: res.status });
      continue;
    }
    if (res.status === 404 && attempt < NOT_FOUND_BACKOFF_MS.length) {
      logTravel(sandbox, 'patchSchema.notFoundRetry', {
        attempt,
        metaAltId,
        backoffMs: NOT_FOUND_BACKOFF_MS[attempt],
      });
      await new Promise((r) => setTimeout(r, NOT_FOUND_BACKOFF_MS[attempt]));
      continue;
    }
    const msg = data.message || data.title || data.detail || res.statusText;
    throw new Error(`Schema PATCH failed: HTTP ${res.status} — ${msg} (altId: ${metaAltId})`);
  }
  throw new Error(`Schema PATCH failed: gave up after 6 attempts (last status seen for altId ${metaAltId} was 404 — AEP eventual-consistency window may be longer than usual; refresh the page and re-run step 2).`);
}

function travelProfileFieldGroupsComplete(fullSchema, profileCoreMixinId) {
  if (!fullSchema || !profileCoreMixinId) return false;
  const refs = collectSchemaRefUris(fullSchema);
  const need = [
    'https://ns.adobe.com/xdm/context/profile',
    'https://ns.adobe.com/xdm/context/profile-person-details',
    'https://ns.adobe.com/xdm/context/profile-personal-details',
    'https://ns.adobe.com/xdm/mixins/profile/profile-loyalty-details',
    'https://ns.adobe.com/xdm/mixins/profile-consents',
    'https://ns.adobe.com/xdm/context/profile-preferences-details',
    'https://ns.adobe.com/xdm/mixins/profile/travel-preferences',
    String(profileCoreMixinId),
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
  schemaRow
) {
  const metaAltId = schemaRow['meta:altId'];
  const schemaId = schemaRow.$id;
  let full = (await getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId)) || schemaRow;
  const ops = buildAttachFieldGroupPatchOps(full, profileCore.$id);
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
  return datasets.find((d) => d && String(d.name || '') === TRAVEL_PROFILE_DATASET_NAME);
}

async function listDataSetsByPropertyFilter(token, clientId, orgId, sandbox, propertyExpr) {
  const url = `${CATALOG_BASE}/dataSets?limit=50&properties=name,schemaRef,tags&property=${encodeURIComponent(propertyExpr)}`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headersJson(token, clientId, orgId, sandbox) });
  if (!res.ok) return [];
  return flattenDatasets([data]);
}

function datasetHasProfileEnabledTag(ds) {
  const tags = ds && ds.tags;
  if (!tags || typeof tags !== 'object') return false;
  const v = tags.unifiedProfile;
  if (!Array.isArray(v)) return false;
  return v.some((s) => /enabled\s*[:=]\s*true/i.test(String(s)));
}

/** Profile-ENABLED dataset (matches Generic). Tags include unifiedProfile=["enabled:true"]. */
async function createDataset(token, clientId, orgId, sandbox, schemaId, name) {
  const body = {
    name,
    description:
      'AEP Lab Travel Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for Travel-industry sample profile generation in this lab.',
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
    `In AEP: Sources → Streaming → HTTP API — create a connection and dataflow named "${TRAVEL_PROFILE_HTTP_DATAFLOW_NAME}" targeting dataset "${TRAVEL_PROFILE_DATASET_NAME}".`,
    'When prompted, accept that the dataset is enabled for Real-Time Customer Profile (intended for Travel Profile, same as Generic).',
    'After the dataflow is created, click "Fetch URL & Flow ID from AEP" on this page to populate the Collection URL and Flow ID, then click Save connection.',
    'Use Generate or Update to stream Travel profiles via /api/profile/update.',
  ];
}

async function runTravelProfileInfraStatus(sandbox, token, clientId, orgId) {
  logTravel(sandbox, 'status.start', {});
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
        schema: TRAVEL_PROFILE_SCHEMA_TITLE,
        dataset: TRAVEL_PROFILE_DATASET_NAME,
        httpDataflow: TRAVEL_PROFILE_HTTP_DATAFLOW_NAME,
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
        schema: TRAVEL_PROFILE_SCHEMA_TITLE,
        dataset: TRAVEL_PROFILE_DATASET_NAME,
        httpDataflow: TRAVEL_PROFILE_HTTP_DATAFLOW_NAME,
      },
      nextSteps: manualFlowSteps(),
    };
  }
  const profileCore = findProfileCoreV2Mixin(mixins);

  const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
  const schema = findTravelProfileSchema(allSchemas);

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
        `name==${TRAVEL_PROFILE_DATASET_NAME}`
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
        if (profileCore) {
          fieldGroupsAttached = travelProfileFieldGroupsComplete(full, profileCore.$id);
        }
      }
    }
  }

  const datasetProfileEnabled = !!dataset && datasetHasProfileEnabledTag(dataset);
  const ready = !!(profileCore && schema && dataset && hasDescriptor && fieldGroupsAttached);

  return {
    ok: true,
    sandbox,
    ready,
    schemaInProfileUnion,
    tenantId: tenantCtx.tenantId,
    xdmKey: tenantCtx.xdmKey,
    profileCoreMixinFound: !!profileCore,
    profileCoreMixinId: profileCore?.$id || null,
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
      schema: TRAVEL_PROFILE_SCHEMA_TITLE,
      dataset: TRAVEL_PROFILE_DATASET_NAME,
      httpDataflow: TRAVEL_PROFILE_HTTP_DATAFLOW_NAME,
    },
    nextSteps: ready ? [] : manualFlowSteps(),
  };
}

const TRAVEL_PROFILE_INFRA_STEP_NAMES = ['createSchema', 'attachFieldGroups', 'createDataset', 'httpFlow'];

async function runTravelProfileInfraStep(sandbox, token, clientId, orgId, stepName) {
  const step = String(stepName || '').trim();
  logTravel(sandbox, 'wizard.step', { step });
  if (!TRAVEL_PROFILE_INFRA_STEP_NAMES.includes(step)) {
    return {
      ok: false,
      sandbox,
      error: `Invalid step "${step}". Use one of: ${TRAVEL_PROFILE_INFRA_STEP_NAMES.join(', ')}.`,
    };
  }

  try {
    if (step === 'createSchema') {
      const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
      const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
      const existing = findTravelProfileSchema(allSchemas);
      if (existing) {
        return {
          ok: true,
          sandbox,
          step,
          skipped: true,
          message: `Schema "${TRAVEL_PROFILE_SCHEMA_TITLE}" already exists. Run step 2.`,
          tenantId: tenantCtx.tenantId,
          xdmKey: tenantCtx.xdmKey,
          schemaId: existing.$id,
          schemaMetaAltId: existing['meta:altId'],
        };
      }
      const created = await createTravelProfileSchemaShell(token, clientId, orgId, sandbox);
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
          'Schema shell created (Profile class only). Run step 2 to attach the standard Profile field groups (including Consent and Preference Details and the OOTB Travel Preferences field group) + primary Email identity. Travel-specific reservation attributes still ride on Profile Core v2 — no extra tenant FG required.',
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
      const schema = findTravelProfileSchema(allSchemas);
      if (!schema) {
        return {
          ok: false,
          sandbox,
          step,
          error: `No schema "${TRAVEL_PROFILE_SCHEMA_TITLE}". Run step 1 (Create schema) first.`,
        };
      }
      // AEP eventual-consistency guard: list-by-altId can return a row before
      // get-by-altId becomes retrievable (same as Generic — see comments
      // there). Surface a clearer "wait and retry" message before burning
      // PATCH retries.
      const schemaMetaAltId = schema['meta:altId'];
      if (!schemaMetaAltId) {
        return {
          ok: false,
          sandbox,
          step,
          error: `Schema "${TRAVEL_PROFILE_SCHEMA_TITLE}" was returned by the listing endpoint but has no meta:altId yet. AEP propagation can take a few seconds — wait 5–10 seconds and try step 2 again.`,
        };
      }
      const schemaProbe = await getSchemaByAltId(token, clientId, orgId, sandbox, schemaMetaAltId);
      if (!schemaProbe) {
        logTravel(sandbox, 'attachFieldGroups.schemaNotYetRetrievable', { metaAltId: schemaMetaAltId });
        return {
          ok: false,
          sandbox,
          step,
          error: `Schema "${TRAVEL_PROFILE_SCHEMA_TITLE}" was found in the listing index but is not yet retrievable by id. This is normal right after step 1 — AEP propagation can take a few seconds. Wait 5–10 seconds and click "2 · Attach field groups" again.`,
        };
      }
      const ar = await attachFieldGroupsAndDescriptor(
        token,
        clientId,
        orgId,
        sandbox,
        tenantCtx,
        profileCore,
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
        patchApplied: ar.patchApplied,
        descriptorOk: ar.descriptorOk,
        message: ar.patchApplied
          ? 'Field groups attached and primary Email identity set (Profile Core v2 + Demographic Details + Personal Contact Details + Loyalty Details + Consent and Preference Details + Preference Details + Travel Preferences).'
          : 'Field groups were already present; primary Email identity checked.',
      };
    }

    if (step === 'createDataset') {
      const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
      const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
      const schema = findTravelProfileSchema(allSchemas);
      if (!schema) {
        return {
          ok: false,
          sandbox,
          step,
          error: 'Travel Profile schema not found. Complete steps 1 and 2 first.',
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
            `name==${TRAVEL_PROFILE_DATASET_NAME}`
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
            ? `Dataset already exists (${dataset.name || TRAVEL_PROFILE_DATASET_NAME}) and is Profile-enabled.`
            : `Dataset already exists but is NOT Profile-enabled. Enable it for Real-Time Customer Profile in AEP UI before generating Travel profiles.`,
          tenantId: tenantCtx.tenantId,
          xdmKey: tenantCtx.xdmKey,
          schemaId,
          schemaMetaAltId: schema['meta:altId'],
          datasetId: dataset.id,
        };
      }
      const dsRes = await createDataset(token, clientId, orgId, sandbox, schemaId, TRAVEL_PROFILE_DATASET_NAME);
      dataset = { id: dsRes.id, name: TRAVEL_PROFILE_DATASET_NAME, schemaRef: { id: schemaId } };
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
        message: `Dataset "${TRAVEL_PROFILE_DATASET_NAME}" created (Profile-enabled). Run step 4 for HTTP flow instructions.`,
      };
    }

    return {
      ok: true,
      sandbox,
      step: 'httpFlow',
      manual: true,
      naming: {
        schema: TRAVEL_PROFILE_SCHEMA_TITLE,
        dataset: TRAVEL_PROFILE_DATASET_NAME,
        httpDataflow: TRAVEL_PROFILE_HTTP_DATAFLOW_NAME,
      },
      nextSteps: manualFlowSteps(),
      message: `Create HTTP API dataflow "${TRAVEL_PROFILE_HTTP_DATAFLOW_NAME}" for dataset "${TRAVEL_PROFILE_DATASET_NAME}". Then use "Fetch URL & Flow ID from AEP" on this page (Flow Service) or paste URL + Flow ID below.`,
    };
  } catch (e) {
    const msg = String(e.message || e);
    logTravel(sandbox, 'wizard.step.error', { step, error: msg.slice(0, 400) });
    return { ok: false, sandbox, step, error: msg };
  }
}

module.exports = {
  runTravelProfileInfraStatus,
  runTravelProfileInfraStep,
  TRAVEL_PROFILE_SCHEMA_TITLE,
  TRAVEL_PROFILE_DATASET_NAME,
  TRAVEL_PROFILE_HTTP_DATAFLOW_NAME,
  TRAVEL_PROFILE_INFRA_STEP_NAMES,
};
