/**
 * Event Infrastructure — create XDM ExperienceEvent schema + dataset in a sandbox.
 * Optionally attaches **Experience Event Core v2.1** (ExperienceEvent-class field group) + ECID/Email
 * identity descriptors on `_{tenant}.identification.core.*` so the schema can be Profile-enabled in
 * the UI with **alternate primary identity** (`identityMap` per event).
 */

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';

const XDM_EXPERIENCE_EVENT_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';

const ACCEPT_JSON = 'application/json';
const ACCEPT_XED = 'application/vnd.adobe.xed+json;version=1';
const ACCEPT_XDM = 'application/vnd.adobe.xdm+json;version=1';

const eventEdgeService = require('./eventEdgeService');
const tagsReactorService = require('./tagsReactorService');

/** Shown after successful schema/dataset create (UI + API consumers). */
const EVENT_TOOL_IDENTITY_MAP_HINT =
  'Enable the schema for Profile in AEP: check "Use alternate primary identity" so the primary ID comes from each event\'s identityMap (anonymous: ECID primary only; known user: add Email with exactly one primary:true per event). This Event Tool sends identityMap on Edge — see ANONYMOUS_EDGE_DEMO_PATTERN.md in the repo docs folder.';

function log(sandbox, phase, detail = {}) {
  try { console.log('[eventInfra]', JSON.stringify({ sandbox, phase, ...detail })); }
  catch { console.log('[eventInfra]', sandbox, phase); }
}

function headers(token, clientId, orgId, sandbox, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/* ── Schema operations ── */

async function findSchemaByTitle(token, clientId, orgId, sandbox, title) {
  const url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=100&properties=title,$id,meta:altId,version,meta:class`;
  const h = headers(token, clientId, orgId, sandbox, {
    Accept: 'application/vnd.adobe.xed-id+json',
  });
  const { res, data } = await fetchJson(url, { method: 'GET', headers: h });
  if (!res.ok) return null;
  const results = data.results || [];
  return results.find((s) => String(s.title || '').trim() === title.trim()) || null;
}

async function createEventSchema(token, clientId, orgId, sandbox, schemaTitle) {
  const body = {
    title: schemaTitle,
    type: 'object',
    description:
      'XDM ExperienceEvent schema for Edge event streaming. Created by AEP Profile Viewer Event Tool. ' +
      'After creation, enable for Real-Time Customer Profile in the AEP UI (recommended: alternate primary identity from identityMap on each payload).',
    allOf: [{ $ref: XDM_EXPERIENCE_EVENT_CLASS }],
    'meta:class': XDM_EXPERIENCE_EVENT_CLASS,
  };

  const url = `${SCHEMA_REGISTRY}/tenant/schemas`;
  const acceptOrder = [
    'application/vnd.adobe.xed+json',
    'application/vnd.adobe.xed+json;version=1',
    'application/json',
  ];

  let lastErr = 'Unknown';
  for (const accept of acceptOrder) {
    const h = headers(token, clientId, orgId, sandbox, {
      Accept: accept,
    });
    const { res, data } = await fetchJson(url, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      log(sandbox, 'createSchema.ok', { title: schemaTitle, schemaId: data.$id });
      return data;
    }
    lastErr = data.message || data.title || data.detail || res.statusText || String(res.status);
    log(sandbox, 'createSchema.try', { httpStatus: res.status, accept, err: String(lastErr).slice(0, 160) });
    if (res.status !== 415 && res.status !== 406) {
      throw new Error(`Create schema failed: ${lastErr}`);
    }
  }
  throw new Error(`Create schema failed: ${lastErr}`);
}

/* ── Experience Event Core v2.1 + identity descriptors (ExperienceEvent, alternate primary via identityMap) ── */

function parseTenantFromUri(uri) {
  const m = String(uri || '').match(/^https:\/\/ns\.adobe\.com\/([^/]+)\//);
  return m ? m[1] : null;
}

function xdmKeyFromTenantId(tenantId) {
  return tenantId ? `_${tenantId}` : '_demoemea';
}

async function discoverTenantContextForEventTool(token, clientId, orgId, sandbox) {
  const url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=10&properties=title,$id,meta:altId`;
  const { res, data } = await fetchJson(url, {
    method: 'GET',
    headers: headers(token, clientId, orgId, sandbox, { Accept: 'application/vnd.adobe.xed-id+json' }),
  });
  if (!res.ok) {
    const msg = data.message || data.title || res.statusText;
    throw new Error(`Schema list failed: ${msg}`);
  }
  const results = data.results || [];
  for (const s of results) {
    const tid = parseTenantFromUri(s.$id);
    if (tid) {
      return { tenantId: tid, xdmKey: xdmKeyFromTenantId(tid), sampleSchemaId: s.$id };
    }
  }
  throw new Error(
    'No tenant XDM id found (expected a schema under https://ns.adobe.com/{tenant}/…). Create any tenant schema in this sandbox first, or import Experience Event Core v2.1.'
  );
}

async function listTenantFieldgroupsLike(token, clientId, orgId, sandbox) {
  const base = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const paths = ['/tenant/fieldgroups?limit=200', '/tenant/mixins?limit=200'];
  const accepts = ['application/vnd.adobe.xed-id+json', 'application/vnd.adobe.xed+json', ACCEPT_XED, ACCEPT_JSON];
  let lastErr = '';
  for (const pathSuffix of paths) {
    const url = `${SCHEMA_REGISTRY}${pathSuffix}`;
    for (const accept of accepts) {
      const { res, data } = await fetchJson(url, { method: 'GET', headers: { ...base, Accept: accept } });
      if (res.ok) return Array.isArray(data.results) ? data.results : [];
      lastErr = data.message || data.title || res.statusText || String(res.status);
      if (!/accept header/i.test(String(lastErr))) break;
    }
  }
  throw new Error(`Tenant field groups list failed: ${lastErr}`);
}

function mixinExtendsExperienceEventClass(m) {
  const ex = m && m['meta:intendedToExtend'];
  if (Array.isArray(ex)) {
    return ex.some((u) => String(u).toLowerCase().includes('experienceevent'));
  }
  if (typeof ex === 'string') {
    return ex.toLowerCase().includes('experienceevent');
  }
  return false;
}

/**
 * OOTB ExperienceEvent field group (not Profile Core v2 — that class is Profile).
 * Title in UI is typically "Experience Event Core v2.1".
 */
function findExperienceEventCoreV21Mixin(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const notProfile = list.filter((m) => {
    const t = String(m.title || '').toLowerCase();
    return !t.includes('profile core');
  });

  let hit = notProfile.find((m) => {
    const t = String(m.title || '').toLowerCase().replace(/\s+/g, ' ');
    const hasEE = /experience\s*event\s*core|experienceevent\s*core/.test(t);
    const has21 = t.includes('2.1');
    return hasEE && has21;
  });
  if (hit) return hit;

  hit = notProfile.find((m) => {
    const t = String(m.title || '').toLowerCase();
    return mixinExtendsExperienceEventClass(m) && t.includes('core') && t.includes('2.1');
  });
  return hit || null;
}

/** Adobe standard ExperienceEvent field group — channel on `interactionDetails.core.channel`. */
function findInteractionDetailsLiteMixin(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    list.find((m) => {
      if (!mixinExtendsExperienceEventClass(m)) return false;
      const t = String(m.title || '').toLowerCase().replace(/\s+/g, ' ');
      return /interaction\s*details\s*lite/.test(t);
    }) || null
  );
}

/** Adobe / lab "Travel - Hotel Experience v1" (ExperienceEvent) — hotel stay lifecycle fields. */
function findTravelHotelExperienceV1Mixin(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    list.find((m) => {
      if (!mixinExtendsExperienceEventClass(m)) return false;
      const t = String(m.title || '');
      return /travel\s*[-–]?\s*hotel\s*experience\s*v1/i.test(t);
    }) || null
  );
}

function dedupeFieldgroupsById(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (r && typeof r.$id === 'string' && r.$id && mixinExtendsExperienceEventClass(r)) {
      map.set(r.$id, r);
    }
  }
  return Array.from(map.values());
}

/**
 * Global OOTB field groups (ExperienceEvent-class) — used for Interaction Details Lite, Travel Hotel, etc.
 */
async function listGlobalExperienceEventFieldgroups(token, clientId, orgId, sandbox) {
  const url = `${SCHEMA_REGISTRY}/global/fieldgroups?limit=500&properties=title,$id,meta:intendedToExtend`;
  const base = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const accepts = ['application/vnd.adobe.xed-id+json', 'application/vnd.adobe.xed+json', ACCEPT_XED, ACCEPT_JSON];
  let lastErr = '';
  for (const accept of accepts) {
    const { res, data } = await fetchJson(url, { method: 'GET', headers: { ...base, Accept: accept } });
    if (res.ok) {
      const raw = Array.isArray(data.results) ? data.results : [];
      return raw.filter((m) => mixinExtendsExperienceEventClass(m));
    }
    lastErr = data.message || data.title || res.statusText || String(res.status);
    if (!/accept header/i.test(String(lastErr))) break;
  }
  throw new Error(`Global field groups list failed: ${lastErr}`);
}

/**
 * Merge tenant + global ExperienceEvent field group catalogs (deduped by $id).
 */
async function listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox) {
  let tenant = [];
  try {
    tenant = await listTenantFieldgroupsLike(token, clientId, orgId, sandbox);
  } catch {
    tenant = [];
  }
  let globalRows = [];
  try {
    globalRows = await listGlobalExperienceEventFieldgroups(token, clientId, orgId, sandbox);
  } catch {
    globalRows = [];
  }
  return dedupeFieldgroupsById([...(Array.isArray(tenant) ? tenant : []), ...globalRows]);
}

/**
 * Attach extra ExperienceEvent field groups by $ref (JSON Patch). Refetches schema between attempts.
 * @param {string[]} mixinIds
 */
async function attachFieldGroupRefsToSchema(token, clientId, orgId, sandbox, metaAltId, mixinIds) {
  const attached = [];
  const skipped = [];
  const warnings = [];
  for (const ref of mixinIds) {
    if (!ref) continue;
    const full = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || {};
    const ops = buildAddFieldGroupPatchOps(full, ref);
    if (!ops.length) {
      skipped.push(ref);
      continue;
    }
    try {
      await patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, ops);
      attached.push(ref);
    } catch (e) {
      warnings.push(`${ref}: ${String(e.message || e).slice(0, 220)}`);
    }
  }
  return { attached, skipped, warnings };
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

function buildAddFieldGroupPatchOps(fullSchema, mixinId) {
  const existing = collectSchemaRefUris(fullSchema);
  const ref = String(mixinId);
  if (existing.has(ref)) return [];
  return [
    { op: 'add', path: '/meta:extends/-', value: ref },
    { op: 'add', path: '/allOf/-', value: { $ref: ref } },
  ];
}

async function getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId) {
  const enc = encodeURIComponent(metaAltId);
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
  const { res, data } = await fetchJson(url, {
    method: 'GET',
    headers: headers(token, clientId, orgId, sandbox, { Accept: ACCEPT_XED }),
  });
  if (!res.ok) return null;
  return data;
}

async function patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, operations) {
  if (!operations || operations.length === 0) return null;
  const enc = encodeURIComponent(metaAltId);
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
  let ifMatch = '1';
  for (let attempt = 0; attempt < 4; attempt++) {
    const full = await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId);
    if (full && full.version != null) ifMatch = String(full.version);
    const { res, data } = await fetchJson(url, {
      method: 'PATCH',
      headers: {
        ...headers(token, clientId, orgId, sandbox),
        Accept: ACCEPT_JSON,
        'Content-Type': ACCEPT_JSON,
        'If-Match': ifMatch,
      },
      body: JSON.stringify(operations),
    });
    if (res.ok) return data;
    if (res.status === 412 || res.status === 428) {
      log(sandbox, 'eventInfra.patch.retry', { attempt, status: res.status });
      continue;
    }
    const msg = data.message || data.title || data.detail || res.statusText;
    throw new Error(`Schema PATCH failed: ${msg}`);
  }
  throw new Error('Schema PATCH failed: version conflict after retries');
}

async function postIdentityDescriptor(
  token,
  clientId,
  orgId,
  sandbox,
  schemaId,
  sourceVersion,
  sourceProperty,
  namespace,
  isPrimary
) {
  const body = {
    '@type': 'xdm:descriptorIdentity',
    'xdm:sourceSchema': schemaId,
    'xdm:sourceVersion': sourceVersion,
    'xdm:sourceProperty': sourceProperty,
    'xdm:namespace': namespace,
    'xdm:property': 'xdm:code',
    'xdm:isPrimary': !!isPrimary,
  };
  const url = `${SCHEMA_REGISTRY}/tenant/descriptors`;
  const base = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const attempts = [
    { 'Content-Type': ACCEPT_JSON, Accept: ACCEPT_XDM },
    { 'Content-Type': ACCEPT_JSON, Accept: ACCEPT_XED },
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
    if (res.status === 409 || /already exists|duplicate/i.test(String(lastErr))) return { skipped: true, duplicate: true };
    if (res.status !== 415 && !/unsupported media type/i.test(String(lastErr))) {
      throw new Error(`Create identity descriptor failed: ${lastErr}`);
    }
  }
  throw new Error(`Create identity descriptor failed: ${lastErr}`);
}

/**
 * Attach Experience Event Core v2.1 + non-primary ECID/Email descriptors on tenant identification.core.*
 * so Profile UI can map namespaces; primary per event should come from identityMap (user enables alternate primary).
 */
async function attachExperienceEventCoreV21AndIdentityDescriptors(token, clientId, orgId, sandbox, schemaRow) {
  const empty = {
    experienceEventCoreV21Attached: false,
    profileCoreAttached: false,
    interactionDetailsLiteAttached: false,
    travelHotelExperienceV1Attached: false,
    hospitalityFieldGroupWarnings: [],
    identityDescriptors: 0,
    warn: null,
    tenantXdmKey: null,
  };
  const metaAltId = schemaRow['meta:altId'];
  const schemaId = schemaRow.$id;
  if (!metaAltId || !schemaId) {
    return {
      ...empty,
      warn: 'Missing meta:altId on new schema; skip Experience Event Core v2.1 attach.',
    };
  }

  let tenantCtx;
  try {
    tenantCtx = await discoverTenantContextForEventTool(token, clientId, orgId, sandbox);
  } catch (e) {
    return {
      ...empty,
      warn: String(e.message || e),
    };
  }

  let merged;
  try {
    merged = await listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox);
  } catch (e) {
    try {
      merged = await listTenantFieldgroupsLike(token, clientId, orgId, sandbox);
    } catch (e2) {
      return {
        ...empty,
        warn: String(e2.message || e2 || e.message || e),
      };
    }
  }

  const eeCore = findExperienceEventCoreV21Mixin(merged);
  if (!eeCore || !eeCore.$id) {
    return {
      ...empty,
      tenantXdmKey: tenantCtx.xdmKey,
      warn:
        'Experience Event Core v2.1 field group not found in this sandbox. In AEP: Schemas → Browse → import the standard Experience Event Core v2.1 field group, then run "Create schema" again with a new title or add the field group manually.',
    };
  }

  let full = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || schemaRow;
  const ops = buildAddFieldGroupPatchOps(full, eeCore.$id);
  let experienceEventCoreV21Attached = false;
  if (ops.length) {
    try {
      await patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, ops);
      experienceEventCoreV21Attached = true;
    } catch (e) {
      const msg = String(e.message || e);
      log(sandbox, 'eventInfra.experienceEventCore.patchFail', { err: msg.slice(0, 220) });
      return {
        ...empty,
        tenantXdmKey: tenantCtx.xdmKey,
        warn: `Could not attach Experience Event Core v2.1 automatically (${msg.slice(0, 180)}). Add the field group in the Schema Editor if your org restricts this mixin on ExperienceEvent schemas.`,
      };
    }
    full = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || full;
  } else {
    experienceEventCoreV21Attached = true;
  }

  const interactionLite = findInteractionDetailsLiteMixin(merged);
  const travelHotel = findTravelHotelExperienceV1Mixin(merged);
  const extraRefs = [interactionLite && interactionLite.$id, travelHotel && travelHotel.$id].filter(Boolean);
  let interactionDetailsLiteAttached = false;
  let travelHotelExperienceV1Attached = false;
  const hospitalityFieldGroupWarnings = [];
  if (extraRefs.length) {
    const fgRes = await attachFieldGroupRefsToSchema(token, clientId, orgId, sandbox, metaAltId, extraRefs);
    for (const w of fgRes.warnings || []) hospitalityFieldGroupWarnings.push(w);
    if (interactionLite && interactionLite.$id && fgRes.attached.includes(interactionLite.$id)) {
      interactionDetailsLiteAttached = true;
    }
    if (travelHotel && travelHotel.$id && fgRes.attached.includes(travelHotel.$id)) {
      travelHotelExperienceV1Attached = true;
    }
    if (interactionLite && interactionLite.$id && fgRes.skipped.includes(interactionLite.$id)) {
      interactionDetailsLiteAttached = true;
    }
    if (travelHotel && travelHotel.$id && fgRes.skipped.includes(travelHotel.$id)) {
      travelHotelExperienceV1Attached = true;
    }
    if (!interactionLite) {
      hospitalityFieldGroupWarnings.push(
        'Interaction Details Lite (ExperienceEvent) not found in Schema Registry — import it in AEP (Add field groups) if you need root interactionDetails on the schema.'
      );
    }
    if (!travelHotel) {
      hospitalityFieldGroupWarnings.push(
        'Travel - Hotel Experience v1 (ExperienceEvent) not found in Schema Registry — add it from the standard library in AEP if you need hotel.bookingDetails on the schema.'
      );
    }
    full = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || full;
  }

  const ver = Number(full.version) || 1;
  const tenant = String(tenantCtx.xdmKey || '_demoemea').replace(/^_/, '');
  const ecidPath = `/_${tenant}/identification/core/ecid`;
  const emailPath = `/_${tenant}/identification/core/email`;
  let identityDescriptors = 0;
  const pairs = [
    { path: ecidPath, ns: 'ECID', label: 'ecid' },
    { path: emailPath, ns: 'Email', label: 'email' },
  ];
  for (const p of pairs) {
    try {
      const r = await postIdentityDescriptor(token, clientId, orgId, sandbox, schemaId, ver, p.path, p.ns, false);
      if (r && (r.duplicate || r['@id'] || r['meta:altId'])) identityDescriptors += 1;
    } catch (e) {
      log(sandbox, 'eventInfra.descriptor.warn', { label: p.label, err: String(e.message || e).slice(0, 160) });
    }
  }

  return {
    experienceEventCoreV21Attached,
    /** @deprecated Same as experienceEventCoreV21Attached; kept for API consumers that still read this key. */
    profileCoreAttached: experienceEventCoreV21Attached,
    interactionDetailsLiteAttached,
    travelHotelExperienceV1Attached,
    hospitalityFieldGroupWarnings,
    identityDescriptors,
    warn: null,
    tenantXdmKey: tenantCtx.xdmKey,
  };
}

/* ── Dataset operations ── */

function flattenDatasets(pages) {
  const rows = [];
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    if (Array.isArray(p.children)) rows.push(...p.children);
    if (Array.isArray(p.results)) rows.push(...p.results);
    for (const [k, v] of Object.entries(p)) {
      if (k.startsWith('_')) continue;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      if (/^[0-9a-f]{24}$/i.test(k) || typeof v.name === 'string' || v.schemaRef) {
        rows.push({ ...v, id: v.id || k });
      }
    }
  }
  return rows;
}

async function findDatasetByName(token, clientId, orgId, sandbox, name) {
  const url = `${CATALOG_BASE}/dataSets?limit=50&properties=name,schemaRef,tags&property=${encodeURIComponent(`name==${name}`)}`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headers(token, clientId, orgId, sandbox) });
  if (!res.ok) return null;
  const rows = flattenDatasets([data]);
  return rows.find((d) => String(d.name || '') === name) || null;
}

async function createDataset(token, clientId, orgId, sandbox, schemaId, name) {
  const body = {
    name,
    description:
      'XDM ExperienceEvent dataset for Edge (AEP Event Tool). In AEP: enable for Profile when the schema uses identityMap as alternate primary; send identityMap on each event (ECID for anonymous; one primary:true per event).',
    schemaRef: {
      id: schemaId,
      contentType: 'application/vnd.adobe.xed+json;version=1',
    },
  };
  const url = `${CATALOG_BASE}/dataSets`;
  const { res, data } = await fetchJson(url, {
    method: 'POST',
    headers: {
      ...headers(token, clientId, orgId, sandbox),
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
    if (m) return { id: m[1] };
  }
  if (data && data.id) return data;
  return { id: null, raw: data };
}

/* ── Status — check what exists ── */

async function runEventInfraStatus(sandbox, token, clientId, orgId, schemaTitle, datasetName) {
  log(sandbox, 'status.start', { schemaTitle, datasetName });

  const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
  const schemaFound = !!schema;
  const schemaId = schema ? schema.$id : null;
  const schemaMetaAltId = schema ? schema['meta:altId'] : null;

  let datasetFound = false;
  let datasetId = null;
  if (datasetName) {
    const ds = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
    if (ds) { datasetFound = true; datasetId = ds.id; }
  }

  log(sandbox, 'status.complete', { schemaFound, datasetFound });
  return { ok: true, sandbox, schemaFound, schemaId, schemaMetaAltId, datasetFound, datasetId };
}

/* ── Step-based provisioning ── */

async function runEventInfraStep(sandbox, token, clientId, orgId, step, opts = {}) {
  log(sandbox, 'step', { step, opts: Object.keys(opts) });

  if (step === 'createSchema') {
    const title = String(opts.schemaTitle || '').trim();
    if (!title) return { ok: false, error: 'schemaTitle is required.' };

    const existing = await findSchemaByTitle(token, clientId, orgId, sandbox, title);
    if (existing) {
      return {
        ok: true, sandbox, step, skipped: true,
        schemaId: existing.$id,
        schemaMetaAltId: existing['meta:altId'],
        message: `Schema "${title}" already exists.`,
      };
    }
    const created = await createEventSchema(token, clientId, orgId, sandbox, title);
    const attach = await attachExperienceEventCoreV21AndIdentityDescriptors(token, clientId, orgId, sandbox, created);
    const parts = [`Schema "${title}" created (ExperienceEvent class).`];
    if (attach.experienceEventCoreV21Attached) parts.push('Experience Event Core v2.1 field group attached.');
    if (attach.interactionDetailsLiteAttached) parts.push('Interaction Details Lite attached (root interactionDetails.core.channel).');
    if (attach.travelHotelExperienceV1Attached) parts.push('Travel - Hotel Experience v1 attached (maps core stay fields to hotel.bookingDetails on payloads).');
    for (const w of attach.hospitalityFieldGroupWarnings || []) {
      if (w) parts.push(`Note: ${w}`);
    }
    if (attach.identityDescriptors > 0) {
      parts.push(
        `Identity descriptors on ${attach.tenantXdmKey || 'tenant'}.identification.core.ecid / .email (not schema primary — use identityMap per event).`
      );
    }
    if (attach.warn) parts.push(`Note: ${attach.warn}`);
    parts.push(EVENT_TOOL_IDENTITY_MAP_HINT);
    return {
      ok: true,
      sandbox,
      step,
      schemaCreated: true,
      schemaId: created.$id,
      schemaMetaAltId: created['meta:altId'],
      experienceEventCoreV21Attached: !!attach.experienceEventCoreV21Attached,
      profileCoreAttached: !!attach.profileCoreAttached,
      interactionDetailsLiteAttached: !!attach.interactionDetailsLiteAttached,
      travelHotelExperienceV1Attached: !!attach.travelHotelExperienceV1Attached,
      hospitalityFieldGroupWarnings: attach.hospitalityFieldGroupWarnings || [],
      identityDescriptorsCreated: Number(attach.identityDescriptors) || 0,
      experienceEventCoreWarning: attach.warn || null,
      profileCoreWarning: attach.warn || null,
      tenantXdmKey: attach.tenantXdmKey || null,
      identityMapHint: EVENT_TOOL_IDENTITY_MAP_HINT,
      message: parts.join(' '),
    };
  }

  if (step === 'attachRecommendedFieldGroups') {
    const title = String(opts.schemaTitle || '').trim();
    if (!title) return { ok: false, error: 'schemaTitle is required.' };
    const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, title);
    if (!schema) {
      return { ok: false, error: `Schema "${title}" not found. Create the schema first or check the exact title.` };
    }
    const metaAltId = schema['meta:altId'];
    if (!metaAltId) {
      return { ok: false, error: `Schema "${title}" has no meta:altId yet — wait a few seconds after creation and retry.` };
    }
    let merged;
    try {
      merged = await listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox);
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
    const interactionLite = findInteractionDetailsLiteMixin(merged);
    const travelHotel = findTravelHotelExperienceV1Mixin(merged);
    const refs = [interactionLite && interactionLite.$id, travelHotel && travelHotel.$id].filter(Boolean);
    if (!refs.length) {
      return {
        ok: false,
        error:
          'No matching ExperienceEvent field groups found. In AEP → Schemas → Browse, import **Interaction Details Lite** and **Travel - Hotel Experience v1** for the ExperienceEvent class, then retry.',
      };
    }
    const fgRes = await attachFieldGroupRefsToSchema(token, clientId, orgId, sandbox, metaAltId, refs);
    const parts = [`Field groups processed for "${title}".`];
    if (fgRes.attached.length) parts.push(`Attached: ${fgRes.attached.length} (${fgRes.attached.map((r) => r.split('/').pop()).join(', ')}).`);
    if (fgRes.skipped.length) parts.push(`Already present: ${fgRes.skipped.length}.`);
    for (const w of fgRes.warnings) parts.push(`Warning: ${w}`);
    if (!interactionLite) parts.push('Note: Interaction Details Lite not found in registry — add from AEP field group library.');
    if (!travelHotel) parts.push('Note: Travel - Hotel Experience v1 not found in registry — add from AEP field group library.');
    return {
      ok: true,
      sandbox,
      step,
      schemaId: schema.$id,
      schemaMetaAltId: metaAltId,
      attachedFieldGroupIds: fgRes.attached,
      skippedFieldGroupIds: fgRes.skipped,
      interactionDetailsLiteFound: !!interactionLite,
      travelHotelExperienceV1Found: !!travelHotel,
      warnings: fgRes.warnings,
      message: parts.join(' '),
    };
  }

  if (step === 'createDataset') {
    const schemaTitle = String(opts.schemaTitle || '').trim();
    const datasetName = String(opts.datasetName || '').trim();
    if (!schemaTitle) return { ok: false, error: 'schemaTitle is required to find the schema.' };
    if (!datasetName) return { ok: false, error: 'datasetName is required.' };

    const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
    if (!schema) {
      return { ok: false, error: `Schema "${schemaTitle}" not found. Create the schema first.` };
    }

    const existing = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
    if (existing) {
      return {
        ok: true, sandbox, step, skipped: true,
        schemaId: schema.$id,
        datasetId: existing.id,
        message: `Dataset "${datasetName}" already exists.`,
      };
    }

    const dsRes = await createDataset(token, clientId, orgId, sandbox, schema.$id, datasetName);
    return {
      ok: true,
      sandbox,
      step,
      datasetCreated: true,
      schemaId: schema.$id,
      datasetId: dsRes.id,
      identityMapHint: EVENT_TOOL_IDENTITY_MAP_HINT,
      message:
        `Dataset "${datasetName}" created. Enable for Profile in AEP when the linked schema is Profile-enabled (alternate primary from identityMap). ` +
        `Then create a datastream below or in Data Collection. ${EVENT_TOOL_IDENTITY_MAP_HINT}`,
    };
  }

  if (step === 'createDatastream') {
    const schemaTitle = String(opts.schemaTitle || '').trim();
    const datasetName = String(opts.datasetName || '').trim();
    const datastreamName = String(opts.datastreamName || '').trim() || `AEP Lab Datastream — ${sandbox}`;
    if (!schemaTitle) return { ok: false, error: 'schemaTitle is required.' };
    if (!datasetName) return { ok: false, error: 'datasetName is required.' };

    const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
    if (!schema) {
      return { ok: false, error: `Schema "${schemaTitle}" not found. Create the schema first.` };
    }
    const ds = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
    if (!ds || !ds.id) {
      return { ok: false, error: `Dataset "${datasetName}" not found. Create the dataset first.` };
    }

    const created = await eventEdgeService.createDatastreamConfig(token, clientId, orgId, sandbox, {
      name: datastreamName,
      mappingSchemaId: schema.$id,
      datasetId: ds.id,
    });
    if (!created.ok) {
      log(sandbox, 'createDatastream.fail', {
        err: String(created.error || '').slice(0, 200),
        errorCount: Array.isArray(created.errors) ? created.errors.length : 0,
      });
      return {
        ok: false,
        sandbox,
        step,
        error: created.error || 'createDatastream failed',
        errors: created.errors,
        discovery: created.discovery,
      };
    }
    return {
      ok: true,
      sandbox,
      step,
      datastreamCreated: true,
      datastreamId: created.datastreamId,
      schemaId: schema.$id,
      datasetId: ds.id,
      message: `Datastream created. Edge ID: ${created.datastreamId}. In Tags, add the AEP Web SDK extension and set this Edge Configuration ID, then paste the embed URL into the lab.`,
      apiDetail: created.used || null,
    };
  }

  if (step === 'probeTagsApi') {
    const r = await tagsReactorService.probeTagsApiAccess(token, clientId, orgId);
    return { sandbox, step, ...r };
  }

  return {
    ok: false,
    error: `Unknown step: ${step}. Use createSchema, attachRecommendedFieldGroups, createDataset, createDatastream, or probeTagsApi.`,
  };
}

/* ── Fetch eventType enum from schema ── */

async function fetchSchemaById(token, clientId, orgId, sandbox, schemaId, accept) {
  const h = headers(token, clientId, orgId, sandbox, { Accept: accept });
  const enc = encodeURIComponent(schemaId);
  return fetchJson(`${SCHEMA_REGISTRY}/tenant/schemas/${enc}`, { method: 'GET', headers: h });
}

async function fetchFullSchema(token, clientId, orgId, sandbox, schema) {
  const ids = [schema['meta:altId'], schema.$id].filter(Boolean);
  const acceptOrder = [
    'application/vnd.adobe.xed-full+json;version=1',
    'application/vnd.adobe.xed+json;version=1',
    'application/json',
  ];
  for (const id of ids) {
    for (const accept of acceptOrder) {
      const { res, data } = await fetchSchemaById(token, clientId, orgId, sandbox, id, accept);
      log(sandbox, 'fetchFull.try', { id: String(id).slice(0, 60), accept, status: res.status, hasProps: !!(data && data.properties) });
      if (res.ok && data && typeof data === 'object') return data;
    }
  }
  return null;
}

async function fetchGlobalEventTypes(token, clientId, orgId, sandbox) {
  const classId = 'https://ns.adobe.com/xdm/context/experienceevent';
  const accepts = [
    'application/vnd.adobe.xed-full+json;version=1',
    'application/vnd.adobe.xed+json;version=1',
  ];
  for (const accept of accepts) {
    const h = headers(token, clientId, orgId, sandbox, { Accept: accept });
    const enc = encodeURIComponent(classId);
    const { res, data } = await fetchJson(`${SCHEMA_REGISTRY}/global/classes/${enc}`, { method: 'GET', headers: h });
    log(sandbox, 'fetchGlobalClass', { status: res.status, accept, hasProps: !!(data && data.properties) });
    if (res.ok && data) {
      const types = extractEventTypes(data);
      if (types.length > 0) return types;
    }
  }
  return [];
}

function extractEventTypes(schema) {
  if (!schema || typeof schema !== 'object') return [];

  const found = new Map();
  const visited = new WeakSet();

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (visited.has(obj)) return;
    visited.add(obj);

    for (const [key, val] of Object.entries(obj)) {
      if (!val || typeof val !== 'object') continue;

      if (key === 'eventType') {
        const metaEnum = val['meta:enum'];
        if (metaEnum && typeof metaEnum === 'object') {
          for (const [k, label] of Object.entries(metaEnum)) {
            if (k && typeof k === 'string') found.set(k, String(label || k));
          }
        }
        if (Array.isArray(val.enum)) {
          for (const v of val.enum) {
            if (typeof v === 'string' && v && !found.has(v)) found.set(v, v);
          }
        }
      }

      if (Array.isArray(val)) {
        val.forEach(walk);
      } else {
        walk(val);
      }
    }
  }

  walk(schema);

  return Array.from(found.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

async function fetchSchemaEventTypes(sandbox, token, clientId, orgId, schemaTitle) {
  log(sandbox, 'eventTypes.start', { schemaTitle });
  const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
  if (!schema) return { ok: false, error: `Schema "${schemaTitle}" not found.`, eventTypes: [] };

  const full = await fetchFullSchema(token, clientId, orgId, sandbox, schema);
  let eventTypes = [];

  if (full) {
    eventTypes = extractEventTypes(full);
    log(sandbox, 'eventTypes.fromSchema', { count: eventTypes.length, topKeys: full ? Object.keys(full).slice(0, 10) : [] });
  } else {
    log(sandbox, 'eventTypes.fullSchemaFailed');
  }

  if (eventTypes.length === 0) {
    log(sandbox, 'eventTypes.fallingBackToGlobal');
    eventTypes = await fetchGlobalEventTypes(token, clientId, orgId, sandbox);
    log(sandbox, 'eventTypes.fromGlobal', { count: eventTypes.length });
  }

  return { ok: true, schemaTitle, schemaId: schema.$id, eventTypes };
}

module.exports = { runEventInfraStatus, runEventInfraStep, fetchSchemaEventTypes };
