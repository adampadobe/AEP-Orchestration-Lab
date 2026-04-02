/**
 * Ensure Profile + Consent schema (not in Real-Time Customer Profile union), primary Email identity,
 * dataset (not Profile-enabled), and streaming manifest (HTTP flow still created in AEP UI or Sources API).
 */

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';

/** Canonical XDM schema title (use the same in every sandbox). */
const CONSENT_SCHEMA_TITLE = 'AEP Profile Viewer - Consent - Schema';
/** Legacy title from earlier lab builds — still recognized so we do not create a duplicate schema. */
const LEGACY_CONSENT_SCHEMA_TITLES = ['AEP Decisioning — Profile + Consent'];
/** Catalog dataset name (same in every sandbox; not Profile-enabled). */
const CONSENT_DATASET_NAME = 'AEP Profile Viewer - Consent - Dataset';
/** Recommended name when creating the HTTP API streaming dataflow in AEP UI. */
const CONSENT_HTTP_DATAFLOW_NAME = 'AEP Profile Viewer - Consent - Dataflow';

/** Shown when schema already has `union` in immutable tags (Profile-enabled); Adobe does not support turning this off. */
const PROFILE_UNION_IRREVERSIBLE =
  'This schema is enabled for Real-Time Customer Profile (it has the union tag). Adobe does not support disabling Profile for a schema after that — use another sandbox or a new schema if you need a non-Profile consent schema. This automation never adds the union tag.';

const ACCEPT_XDM = 'application/vnd.adobe.xdm+json;version=1';
const ACCEPT_XED = 'application/vnd.adobe.xed+json;version=1';
const ACCEPT_JSON = 'application/json';

/** One-line JSON for Cloud Logging / `gcloud logs` filters: textPayload:"[consentInfra]" */
function logConsentInfra(sandbox, phase, detail = {}) {
  try {
    console.log('[consentInfra]', JSON.stringify({ sandbox, phase, ...detail }));
  } catch (_) {
    console.log('[consentInfra]', sandbox, phase);
  }
}

function headersJson(token, clientId, orgId, sandbox, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: ACCEPT_JSON,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function headersXdm(token, clientId, orgId, sandbox, withContentType) {
  const h = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: ACCEPT_XDM,
  };
  if (withContentType) h['Content-Type'] = ACCEPT_XDM;
  return h;
}

/** List mixins/schemas use XED Accept (not application/vnd.adobe.xdm+json). */
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

/**
 * Discover org XDM tenant id (e.g. demoemea) from any existing tenant schema in the sandbox.
 */
async function discoverTenantContext(token, clientId, orgId, sandbox) {
  logConsentInfra(sandbox, 'discoverTenant.start', { urlHint: 'tenant/schemas?limit=10' });
  const url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=10&properties=title,$id,meta:altId`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
  if (!res.ok) {
    const msg = data.message || data.title || res.statusText;
    logConsentInfra(sandbox, 'discoverTenant.failed', { httpStatus: res.status, msg });
    throw new Error(`Schema list failed: ${msg}`);
  }
  const results = data.results || [];
  logConsentInfra(sandbox, 'discoverTenant.schemasPage', { tenantSchemaCandidates: results.length });
  for (const s of results) {
    const tid = parseTenantFromUri(s.$id);
    if (tid) {
      logConsentInfra(sandbox, 'discoverTenant.ok', {
        tenantId: tid,
        xdmKey: xdmKeyFromTenantId(tid),
        sampleSchemaTitle: s.title || null,
      });
      return {
        tenantId: tid,
        xdmKey: xdmKeyFromTenantId(tid),
        sampleSchemaId: s.$id,
      };
    }
  }
  logConsentInfra(sandbox, 'discoverTenant.noTenantSchema', { scanned: results.length });
  throw new Error(
    'Could not discover XDM tenant id: no tenant schemas in this sandbox. Create any tenant schema first, or use a sandbox with existing XDM resources.'
  );
}

async function listTenantMixins(token, clientId, orgId, sandbox) {
  // Field group LIST: docs use Accept application/vnd.adobe.xed-id+json (no ;version=1).
  // Some gateways/params return misleading "Accept header invalid" — try minimal query + legacy /tenant/mixins.
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
    '/tenant/fieldgroups?limit=200&orderby=title',
    '/tenant/fieldgroups',
    '/tenant/mixins?limit=200',
    '/tenant/mixins?limit=200&orderby=title',
    '/tenant/mixins',
  ];

  let lastErr = 'Unknown';
  for (const pathSuffix of pathVariants) {
    const url = `${SCHEMA_REGISTRY}${pathSuffix}`;
    for (const accept of acceptCandidates) {
      const { res, data } = await fetchJson(url, {
        method: 'GET',
        headers: { ...base, Accept: accept },
      });
      if (res.ok) {
        const rows = data.results || [];
        logConsentInfra(sandbox, 'listFieldGroupsLike.ok', {
          path: pathSuffix.split('?')[0],
          count: rows.length,
          acceptUsed: accept.slice(0, 56),
        });
        return rows;
      }
      lastErr = data.message || data.title || res.statusText || String(res.status);
      logConsentInfra(sandbox, 'listFieldGroupsLike.try', {
        path: pathSuffix.split('?')[0],
        httpStatus: res.status,
        acceptTried: accept.slice(0, 48),
        err: String(lastErr).slice(0, 160),
      });
      if (!/accept header/i.test(String(lastErr))) {
        logConsentInfra(sandbox, 'listFieldGroupsLike.failed', { path: pathSuffix, msg: lastErr });
        throw new Error(`Tenant field groups list failed: ${lastErr}`);
      }
    }
  }
  logConsentInfra(sandbox, 'listFieldGroupsLike.exhausted', { lastErr });
  throw new Error(
    `Tenant field groups list failed: ${lastErr}. Deploy the latest functions (fieldgroups Accept + path fallbacks). If this persists, verify x-sandbox-name and Schema Registry access for this OAuth client.`
  );
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

function findConsentSchema(schemas) {
  const norm = (t) => String(t || '').trim();
  const match = (title) => schemas.find((s) => norm(s.title) === title);
  const primary = match(CONSENT_SCHEMA_TITLE);
  if (primary) return primary;
  for (const legacy of LEGACY_CONSENT_SCHEMA_TITLES) {
    const found = match(legacy);
    if (found) return found;
  }
  return undefined;
}

async function getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId) {
  const enc = encodeURIComponent(metaAltId);
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
  if (!res.ok) return null;
  return data;
}

/** Adobe POST /tenant/schemas expects Content-Type: application/json (not vnd.adobe.xdm) — otherwise 415 Unsupported Media Type. */
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
      logConsentInfra(sandbox, 'postTenantSchema.ok', { acceptUsed: accept.slice(0, 48) });
      return data;
    }
    lastErr = data.message || data.title || data.detail || res.statusText || String(res.status);
    logConsentInfra(sandbox, 'postTenantSchema.try', {
      httpStatus: res.status,
      accept: accept.slice(0, 40),
      err: String(lastErr).slice(0, 120),
    });
    const retry =
      res.status === 415 ||
      res.status === 406 ||
      /unsupported media type|not acceptable/i.test(String(lastErr));
    if (!retry) {
      throw new Error(`Create schema failed: ${lastErr}`);
    }
  }
  throw new Error(`Create schema failed: ${lastErr}`);
}

/** Step 1: minimal Profile schema shell (Profile class only). Field groups are attached in step 2 via PATCH. */
function buildConsentSchemaShellBody() {
  return {
    title: CONSENT_SCHEMA_TITLE,
    type: 'object',
    description:
      'AEP Profile Viewer consent streaming only — do NOT enable this schema for Real-Time Customer Profile in the UI (union cannot be reliably removed). Email primary identity at tenant identification.core.email (Profile Core v2).',
    allOf: [{ $ref: 'https://ns.adobe.com/xdm/context/profile' }],
    'meta:class': 'https://ns.adobe.com/xdm/context/profile',
  };
}

/** `meta:immutableTags` containing `union` registers the schema with Real-Time Customer Profile (irreversible in practice). */
function schemaHasProfileUnionTag(fullSchema) {
  if (!fullSchema || typeof fullSchema !== 'object') return false;
  const tags = fullSchema['meta:immutableTags'];
  if (!Array.isArray(tags)) return false;
  return tags.includes('union');
}

async function createConsentSchemaShell(token, clientId, orgId, sandbox) {
  return postTenantSchemaCreate(token, clientId, orgId, sandbox, buildConsentSchemaShellBody());
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

/** JSON Patch ops to add standard consent field groups + tenant Profile Core v2 (Adobe pattern: meta:extends + allOf). */
function buildAttachFieldGroupPatchOps(fullSchema, profileCoreMixinId) {
  const existing = collectSchemaRefUris(fullSchema);
  const toAdd = [
    'https://ns.adobe.com/xdm/context/profile-person-details',
    'https://ns.adobe.com/xdm/mixins/profile-consents',
    'https://ns.adobe.com/xdm/context/profile-preferences-details',
    String(profileCoreMixinId),
  ];
  const ops = [];
  for (const ref of toAdd) {
    if (existing.has(ref)) continue;
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
        Accept: ACCEPT_JSON,
        'Content-Type': 'application/json',
        'If-Match': ifMatch,
      },
      body: JSON.stringify(operations),
    });
    if (res.ok) return data;
    if (res.status === 412 || res.status === 428) {
      logConsentInfra(sandbox, 'patchSchema.preconditionRetry', { attempt, status: res.status });
      continue;
    }
    const msg = data.message || data.title || data.detail || res.statusText;
    throw new Error(`Schema PATCH failed: ${msg}`);
  }
  throw new Error('Schema PATCH failed: version conflict after retries');
}

function consentFieldGroupsComplete(fullSchema, profileCoreMixinId) {
  if (!fullSchema || !profileCoreMixinId) return false;
  const refs = collectSchemaRefUris(fullSchema);
  const need = [
    'https://ns.adobe.com/xdm/context/profile',
    'https://ns.adobe.com/xdm/context/profile-person-details',
    'https://ns.adobe.com/xdm/mixins/profile-consents',
    'https://ns.adobe.com/xdm/context/profile-preferences-details',
    String(profileCoreMixinId),
  ];
  return need.every((r) => refs.has(r));
}

/**
 * Apply field-group PATCHes and primary Email descriptor.
 * Does not add the `union` immutable tag — that would register the schema with Real-Time Customer Profile.
 * @returns {{ patchApplied: boolean, descriptorOk: boolean }}
 */
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
  const existingDesc = await listDescriptorsForSchema(token, clientId, orgId, sandbox, schemaId);
  const hasPrimaryEmail = existingDesc.some(
    (d) =>
      d['xdm:isPrimary'] === true &&
      String(d['xdm:namespace'] || '').toLowerCase() === 'email' &&
      String(d['xdm:sourceProperty'] || '').includes('identification/core/email')
  );
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
  return {
    patchApplied,
    descriptorOk,
    fullSchema: full,
  };
}

async function listDescriptorsForSchema(token, clientId, orgId, sandbox, schemaId) {
  const url = `${SCHEMA_REGISTRY}/tenant/descriptors?limit=200&properties=@type,xdm:sourceSchema,xdm:sourceProperty,xdm:namespace,xdm:isPrimary`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
  if (!res.ok) return [];
  const results = data.results || [];
  return results.filter((d) => d && d['xdm:sourceSchema'] === schemaId);
}

async function createPrimaryEmailDescriptor(
  token,
  clientId,
  orgId,
  sandbox,
  schemaId,
  sourceVersion,
  xdmKey
) {
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
    { ...headersXdm(token, clientId, orgId, sandbox, true) },
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
    if (Array.isArray(p.children)) rows.push(...p.children);
    if (Array.isArray(p.results)) rows.push(...p.results);
  }
  return rows;
}

function findDatasetForSchema(datasets, schemaId) {
  return datasets.find((d) => d && d.schemaRef && d.schemaRef.id === schemaId);
}

async function createDataset(token, clientId, orgId, sandbox, schemaId, name) {
  const body = {
    name,
    description:
      'AEP Profile Viewer consent streaming dataset. Do not enable for Real-Time Customer Profile — use HTTP API streaming only as configured for this lab.',
    schemaRef: {
      id: schemaId,
      contentType: 'application/vnd.adobe.xed+json;version=1',
    },
  };
  const url = `${CATALOG_BASE}/dataSets`;
  const { res, data } = await fetchJson(url, {
    method: 'POST',
    headers: {
      ...headersJson(token, clientId, orgId, sandbox),
      Accept: 'application/vnd.adobe.xdm+json',
      'Content-Type': 'application/json',
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

/**
 * @param {{ dryRun?: boolean }} opts
 */
async function runConsentInfraEnsure(sandbox, token, clientId, orgId, opts = {}) {
  const dryRun = !!opts.dryRun;
  const steps = [];
  const errors = [];

  logConsentInfra(sandbox, 'ensure.start', { dryRun, schemaTitle: CONSENT_SCHEMA_TITLE });

  const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
  steps.push({ step: 'discoverTenant', ok: true, tenantId: tenantCtx.tenantId, xdmKey: tenantCtx.xdmKey });

  let mixins;
  try {
    mixins = await listTenantMixins(token, clientId, orgId, sandbox);
  } catch (e) {
    const msg = String(e.message || e);
    logConsentInfra(sandbox, 'ensure.listMixins.error', { error: msg.slice(0, 400) });
    steps.push({ step: 'listTenantFieldGroups', ok: false, error: msg });
    return {
      ok: false,
      ready: false,
      sandbox,
      tenantId: tenantCtx.tenantId,
      xdmKey: tenantCtx.xdmKey,
      steps,
      error: msg,
      fieldGroupsListFailed: true,
    };
  }
  const profileCore = findProfileCoreV2Mixin(mixins);
  if (!profileCore) {
    logConsentInfra(sandbox, 'ensure.abort.profileCoreMissing', {
      fieldGroupCount: mixins.length,
      hint: 'Import Profile Core v2 field group into this sandbox',
    });
    return {
      ok: false,
      ready: false,
      sandbox,
      tenantId: tenantCtx.tenantId,
      xdmKey: tenantCtx.xdmKey,
      steps,
      error:
        'Tenant field group "Profile Core v2" was not found. Import or create it in this sandbox (same org as your working sandbox), then run again. It provides _{tenant}.identification.core.email for the primary identity.',
      profileCoreMixinMissing: true,
    };
  }
  steps.push({ step: 'profileCoreMixin', ok: true, mixinId: profileCore.$id });
  logConsentInfra(sandbox, 'ensure.profileCore.ok', {
    title: profileCore.title || null,
    mixinIdSuffix: String(profileCore.$id || '').split('/').pop(),
  });

  const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
  let schema = findConsentSchema(allSchemas);
  let schemaCreated = false;

  logConsentInfra(sandbox, 'ensure.schemas.scanned', {
    tenantSchemaCount: allSchemas.length,
    consentSchemaFound: !!schema,
  });

  if (!schema && !dryRun) {
    logConsentInfra(sandbox, 'ensure.schema.createShell', {});
    schema = await createConsentSchemaShell(token, clientId, orgId, sandbox);
    schemaCreated = true;
    steps.push({ step: 'createSchemaShell', ok: true, schemaId: schema.$id, metaAltId: schema['meta:altId'] });
    logConsentInfra(sandbox, 'ensure.schema.created', {
      schemaIdSuffix: String(schema.$id || '').split('/').pop(),
      metaAltId: schema['meta:altId'] || null,
    });
  } else if (!schema && dryRun) {
    steps.push({ step: 'createSchema', ok: false, skipped: true, dryRun: true });
    logConsentInfra(sandbox, 'ensure.dryRun.exit', { wouldCreateSchema: true });
    return {
      ok: true,
      dryRun: true,
      ready: false,
      sandbox,
      tenantId: tenantCtx.tenantId,
      xdmKey: tenantCtx.xdmKey,
      wouldCreate: { schema: true, descriptor: true, dataset: true },
      steps,
      nextSteps: manualFlowSteps(),
    };
  } else {
    steps.push({ step: 'schemaExists', ok: true, schemaId: schema.$id, metaAltId: schema['meta:altId'] });
    logConsentInfra(sandbox, 'ensure.schema.exists', {
      schemaIdSuffix: String(schema.$id || '').split('/').pop(),
    });
  }

  const schemaId = schema.$id;
  const metaAltId = schema['meta:altId'];

  const fullUnionGuard = await getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId);
  if (fullUnionGuard && schemaHasProfileUnionTag(fullUnionGuard)) {
    logConsentInfra(sandbox, 'ensure.abort.schemaInProfileUnion', { schemaIdSuffix: String(schemaId || '').split('/').pop() });
    steps.push({ step: 'schemaProfileUnionCheck', ok: false, schemaInProfileUnion: true });
    return {
      ok: false,
      ready: false,
      sandbox,
      tenantId: tenantCtx.tenantId,
      xdmKey: tenantCtx.xdmKey,
      schemaId,
      schemaMetaAltId: metaAltId,
      steps,
      error: PROFILE_UNION_IRREVERSIBLE,
      schemaInProfileUnion: true,
      nextSteps: manualFlowSteps(),
    };
  }

  if (!dryRun) {
    const ar = await attachFieldGroupsAndDescriptor(
      token,
      clientId,
      orgId,
      sandbox,
      tenantCtx,
      profileCore,
      schema
    );
    steps.push({
      step: 'attachFieldGroupsAndDescriptor',
      ok: true,
      patchApplied: ar.patchApplied,
      descriptorOk: ar.descriptorOk,
      profileSchemaUnionTagSkipped: true,
    });
    logConsentInfra(sandbox, 'ensure.attach.done', {
      patchApplied: ar.patchApplied,
      descriptorOk: ar.descriptorOk,
    });
  } else {
    steps.push({ step: 'attachFieldGroupsAndDescriptor', ok: false, skipped: true, dryRun: true });
  }

  const pages = await paginateDataSets(token, clientId, orgId, sandbox);
  const datasets = flattenDatasets(pages);
  let dataset = findDatasetForSchema(datasets, schemaId);
  let datasetCreated = false;
  const datasetName = CONSENT_DATASET_NAME;

  logConsentInfra(sandbox, 'ensure.catalog.scanned', {
    datasetRows: datasets.length,
    datasetForSchema: !!dataset,
  });

  if (!dataset && !dryRun) {
    logConsentInfra(sandbox, 'ensure.dataset.create', { name: datasetName });
    const dsRes = await createDataset(token, clientId, orgId, sandbox, schemaId, datasetName);
    dataset = { id: dsRes.id, name: datasetName, schemaRef: { id: schemaId } };
    datasetCreated = true;
    steps.push({ step: 'createDataset', ok: true, datasetId: dataset.id });
    logConsentInfra(sandbox, 'ensure.dataset.created', { datasetId: dataset.id });
  } else if (!dataset && dryRun) {
    steps.push({ step: 'createDataset', skipped: true, dryRun: true });
  } else {
    steps.push({ step: 'datasetExists', ok: true, datasetId: dataset.id, name: dataset.name });
    logConsentInfra(sandbox, 'ensure.dataset.exists', { datasetId: dataset.id });
  }

  const manifest = {
    sandbox,
    imsOrg: orgId,
    tenantId: tenantCtx.tenantId,
    xdmKey: tenantCtx.xdmKey,
    schemaId,
    schemaMetaAltId: metaAltId,
    datasetId: dataset?.id || null,
    profileCoreMixinId: profileCore.$id,
    schemaCreated,
    datasetCreated,
    useEnvelope: false,
    naming: {
      schema: CONSENT_SCHEMA_TITLE,
      dataset: CONSENT_DATASET_NAME,
      httpDataflow: CONSENT_HTTP_DATAFLOW_NAME,
    },
    streaming: {
      configured: false,
      hint: `Never enable this consent schema or dataset for Real-Time Customer Profile in AEP (irreversible for the schema). Sources → Streaming → HTTP API: dataflow "${CONSENT_HTTP_DATAFLOW_NAME}" → dataset "${CONSENT_DATASET_NAME}". Copy collection URL and x-adobe-flow-id into the Consent page.`,
    },
  };

  const ready = !!(dataset && dataset.id && schemaId);
  logConsentInfra(sandbox, 'ensure.complete', {
    ready,
    schemaCreated,
    datasetCreated,
    schemaIdSuffix: String(schemaId || '').split('/').pop(),
    datasetId: dataset?.id || null,
  });

  return {
    ok: true,
    ready,
    dryRun: false,
    manifest,
    steps,
    nextSteps: manualFlowSteps(),
  };
}

function manualFlowSteps() {
  return [
    'Schema (critical): In AEP → Schemas, never enable this schema for Real-Time Customer Profile (do not turn on Profile / add it to the union). That change is effectively permanent — Adobe does not support turning it off. This app never adds the union tag.',
    'Dataset (critical): When creating the HTTP API dataflow or editing the dataset, do not enable the dataset for Real-Time Customer Profile — decline or skip if prompted.',
    `In AEP: Sources → Streaming → HTTP API — create a connection and dataflow named "${CONSENT_HTTP_DATAFLOW_NAME}" targeting dataset "${CONSENT_DATASET_NAME}".`,
    'Paste the collection URL (dcs.adobedc.net/...) and Flow ID into Profile Viewer Consent page under “Streaming connection”, then save.',
    'Use “Update consent preferences” to stream profile updates.',
  ];
}

async function runConsentInfraStatus(sandbox, token, clientId, orgId) {
  logConsentInfra(sandbox, 'status.start', {});

  let tenantCtx;
  try {
    tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
  } catch (e) {
    logConsentInfra(sandbox, 'status.discoverTenant.error', { error: String(e.message || e).slice(0, 400) });
    return {
      ok: false,
      sandbox,
      error: String(e.message || e),
      ready: false,
      naming: {
        schema: CONSENT_SCHEMA_TITLE,
        dataset: CONSENT_DATASET_NAME,
        httpDataflow: CONSENT_HTTP_DATAFLOW_NAME,
      },
    };
  }
  let mixins;
  try {
    mixins = await listTenantMixins(token, clientId, orgId, sandbox);
  } catch (e) {
    const msg = String(e.message || e);
    logConsentInfra(sandbox, 'status.listMixins.error', { error: msg.slice(0, 400) });
    return {
      ok: false,
      sandbox,
      ready: false,
      error: msg,
      tenantId: tenantCtx.tenantId,
      xdmKey: tenantCtx.xdmKey,
      profileCoreMixinFound: false,
      profileCoreMixinId: null,
      schemaFound: false,
      schemaId: null,
      schemaMetaAltId: null,
      primaryEmailDescriptor: false,
      datasetFound: false,
      datasetId: null,
      fieldGroupsListFailed: true,
      naming: {
        schema: CONSENT_SCHEMA_TITLE,
        dataset: CONSENT_DATASET_NAME,
        httpDataflow: CONSENT_HTTP_DATAFLOW_NAME,
      },
      nextSteps: manualFlowSteps(),
    };
  }
  const profileCore = findProfileCoreV2Mixin(mixins);
  logConsentInfra(sandbox, 'status.profileCore', {
    found: !!profileCore,
    fieldGroupListSize: mixins.length,
    mixinIdSuffix: profileCore ? String(profileCore.$id || '').split('/').pop() : null,
  });

  const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
  const schema = findConsentSchema(allSchemas);
  logConsentInfra(sandbox, 'status.consentSchema', {
    tenantSchemaCount: allSchemas.length,
    found: !!schema,
    title: CONSENT_SCHEMA_TITLE,
    schemaIdSuffix: schema ? String(schema.$id || '').split('/').pop() : null,
  });

  const pages = await paginateDataSets(token, clientId, orgId, sandbox);
  const datasets = flattenDatasets(pages);
  const dataset = schema ? findDatasetForSchema(datasets, schema.$id) : null;
  logConsentInfra(sandbox, 'status.dataset', {
    catalogDatasetRows: datasets.length,
    found: !!dataset,
    datasetId: dataset?.id || null,
  });

  let hasDescriptor = false;
  if (schema) {
    const desc = await listDescriptorsForSchema(token, clientId, orgId, sandbox, schema.$id);
    hasDescriptor = desc.some(
      (d) =>
        d['xdm:isPrimary'] === true &&
        String(d['xdm:namespace'] || '').toLowerCase() === 'email' &&
        String(d['xdm:sourceProperty'] || '').includes('identification/core/email')
    );
    logConsentInfra(sandbox, 'status.descriptors', {
      descriptorCountForSchema: desc.length,
      primaryEmailOk: hasDescriptor,
    });
  } else {
    logConsentInfra(sandbox, 'status.descriptors.skip', { reason: 'no consent schema' });
  }

  let fieldGroupsAttached = false;
  let schemaInProfileUnion = false;
  if (schema && schema['meta:altId']) {
    const full = await getSchemaByAltId(token, clientId, orgId, sandbox, schema['meta:altId']);
    if (full) {
      schemaInProfileUnion = schemaHasProfileUnionTag(full);
      if (profileCore) fieldGroupsAttached = consentFieldGroupsComplete(full, profileCore.$id);
    }
  }

  const ready =
    !!(profileCore && schema && dataset && hasDescriptor) && !schemaInProfileUnion;

  logConsentInfra(sandbox, 'status.complete', {
    ready,
    schemaInProfileUnion,
    tenantId: tenantCtx.tenantId,
    checklist: {
      profileCore: !!profileCore,
      consentSchema: !!schema,
      dataset: !!dataset,
      primaryEmailDescriptor: hasDescriptor,
    },
  });

  return {
    ok: true,
    sandbox,
    ready,
    schemaInProfileUnion,
    warnings: schemaInProfileUnion ? [PROFILE_UNION_IRREVERSIBLE] : [],
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
    prepSteps: {
      step1_schemaShell: !!schema,
      step2_fieldGroupsIdentity: !!(schema && fieldGroupsAttached && hasDescriptor),
      step3_dataset: !!dataset,
      /** Dataset exists; create HTTP API flow in AEP and paste URL + Flow ID client-side (not detectable server-side). */
      step4_readyForManualHttpFlow: !!dataset,
    },
    naming: {
      schema: CONSENT_SCHEMA_TITLE,
      dataset: CONSENT_DATASET_NAME,
      httpDataflow: CONSENT_HTTP_DATAFLOW_NAME,
    },
    nextSteps: ready ? [] : manualFlowSteps(),
  };
}

const CONSENT_INFRA_STEP_NAMES = ['createSchema', 'attachFieldGroups', 'createDataset', 'httpFlow'];

/**
 * Run one consent-infra preparation step (UI wizard).
 * @param {string} stepName - createSchema | attachFieldGroups | createDataset | httpFlow
 */
async function runConsentInfraStep(sandbox, token, clientId, orgId, stepName) {
  const step = String(stepName || '').trim();
  logConsentInfra(sandbox, 'wizard.step', { step });

  if (!CONSENT_INFRA_STEP_NAMES.includes(step)) {
    return {
      ok: false,
      sandbox,
      error: `Invalid step "${step}". Use one of: ${CONSENT_INFRA_STEP_NAMES.join(', ')}.`,
    };
  }

  try {
    if (step === 'createSchema') {
      const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
      const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
      const existing = findConsentSchema(allSchemas);
      if (existing) {
        let schemaInProfileUnion = false;
        const alt = existing['meta:altId'];
        if (alt) {
          const fullEx = await getSchemaByAltId(token, clientId, orgId, sandbox, alt);
          if (fullEx) schemaInProfileUnion = schemaHasProfileUnionTag(fullEx);
        }
        return {
          ok: true,
          sandbox,
          step,
          skipped: true,
          schemaInProfileUnion,
          message: schemaInProfileUnion
            ? `Schema "${CONSENT_SCHEMA_TITLE}" exists but is enabled for Real-Time Customer Profile (union tag). Adobe does not support turning that off — use another sandbox or schema. Do not run steps 2–3 for this lab.`
            : `Schema "${CONSENT_SCHEMA_TITLE}" already exists (not in Profile union). Run step 2.`,
          tenantId: tenantCtx.tenantId,
          xdmKey: tenantCtx.xdmKey,
          schemaId: existing.$id,
          schemaMetaAltId: existing['meta:altId'],
        };
      }
      const created = await createConsentSchemaShell(token, clientId, orgId, sandbox);
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
          'Schema shell created (Profile class only). Run step 2 to attach field groups and primary Email identity (schema stays out of Profile union).',
      };
    }

    if (step === 'attachFieldGroups') {
      const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
      const mixins = await listTenantMixins(token, clientId, orgId, sandbox);
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
      const schema = findConsentSchema(allSchemas);
      if (!schema) {
        return {
          ok: false,
          sandbox,
          step,
          error: `No schema "${CONSENT_SCHEMA_TITLE}". Run step 1 (Create schema) first.`,
        };
      }
      const fullPre = await getSchemaByAltId(token, clientId, orgId, sandbox, schema['meta:altId']);
      if (fullPre && schemaHasProfileUnionTag(fullPre)) {
        return {
          ok: false,
          sandbox,
          step,
          schemaInProfileUnion: true,
          error: PROFILE_UNION_IRREVERSIBLE,
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
        schemaNotInProfileUnion: true,
        message: ar.patchApplied
          ? 'Field groups attached and primary Email identity set. Schema is not enabled for Real-Time Customer Profile (no union tag).'
          : 'Field groups were already present; primary Email identity checked. Schema remains outside Profile union.',
      };
    }

    if (step === 'createDataset') {
      const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
      const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
      const schema = findConsentSchema(allSchemas);
      if (!schema) {
        return {
          ok: false,
          sandbox,
          step,
          error: 'Consent schema not found. Complete steps 1 and 2 first.',
        };
      }
      const fullDs = await getSchemaByAltId(token, clientId, orgId, sandbox, schema['meta:altId']);
      if (fullDs && schemaHasProfileUnionTag(fullDs)) {
        return {
          ok: false,
          sandbox,
          step,
          schemaInProfileUnion: true,
          error: PROFILE_UNION_IRREVERSIBLE,
        };
      }
      const schemaId = schema.$id;
      const pages = await paginateDataSets(token, clientId, orgId, sandbox);
      const datasets = flattenDatasets(pages);
      let dataset = findDatasetForSchema(datasets, schemaId);
      if (dataset) {
        return {
          ok: true,
          sandbox,
          step,
          skipped: true,
          message: `Dataset already exists for this schema (${dataset.name || CONSENT_DATASET_NAME}).`,
          tenantId: tenantCtx.tenantId,
          xdmKey: tenantCtx.xdmKey,
          schemaId,
          schemaMetaAltId: schema['meta:altId'],
          datasetId: dataset.id,
        };
      }
      const dsRes = await createDataset(token, clientId, orgId, sandbox, schemaId, CONSENT_DATASET_NAME);
      dataset = { id: dsRes.id, name: CONSENT_DATASET_NAME, schemaRef: { id: schemaId } };
      return {
        ok: true,
        sandbox,
        step,
        datasetCreated: true,
        tenantId: tenantCtx.tenantId,
        xdmKey: tenantCtx.xdmKey,
        schemaId,
        schemaMetaAltId: schema['meta:altId'],
        datasetId: dataset.id,
        message: `Dataset "${CONSENT_DATASET_NAME}" created (not enabled for Profile). Run step 4 for HTTP flow instructions.`,
      };
    }

    // httpFlow — manual in AEP UI
    return {
      ok: true,
      sandbox,
      step: 'httpFlow',
      manual: true,
      naming: {
        schema: CONSENT_SCHEMA_TITLE,
        dataset: CONSENT_DATASET_NAME,
        httpDataflow: CONSENT_HTTP_DATAFLOW_NAME,
      },
      nextSteps: manualFlowSteps(),
      message: `Create HTTP API dataflow "${CONSENT_HTTP_DATAFLOW_NAME}" for dataset "${CONSENT_DATASET_NAME}". Never enable this schema or dataset for Real-Time Customer Profile in AEP (schema union is irreversible). Then use “Fetch URL & Flow ID from AEP” on this page (Flow Service) or paste URL + Flow ID below.`,
    };
  } catch (e) {
    const msg = String(e.message || e);
    logConsentInfra(sandbox, 'wizard.step.error', { step, error: msg.slice(0, 400) });
    return { ok: false, sandbox, step, error: msg };
  }
}

module.exports = {
  runConsentInfraEnsure,
  runConsentInfraStatus,
  runConsentInfraStep,
  CONSENT_SCHEMA_TITLE,
  CONSENT_DATASET_NAME,
  CONSENT_HTTP_DATAFLOW_NAME,
  CONSENT_INFRA_STEP_NAMES,
};
