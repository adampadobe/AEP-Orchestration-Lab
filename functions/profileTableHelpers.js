/**
 * Profile table JSON shape for GET /api/profile/table (mirrors Express server.js handler).
 * Kept in functions/ for Firebase Hosting rewrite — not imported from aep-prototypes server.
 */

const { resolveIndustryForPath, RESOLUTION_REASON } = require('./industryAttributeMap');

const get = (obj, path) => path.split('.').reduce((o, k) => (o && o[k]), obj);

function humanize(str) {
  if (!str || typeof str !== 'string') return str;
  return (
    str
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .replace(/[._](.)/g, (_, c) => ` ${c.toUpperCase()}`)
      .trim() || str
  );
}

/**
 * Attach `{ industry, ownershipReason }` to one row by resolving its
 * `path` against the static industry-attribute map. `industry` is `null`
 * when no map entry claims the path; the row is still returned so the
 * UI can render a muted "(no dataflow)" placeholder. Existing keys on
 * the row are preserved (back-compat with any client that still reads
 * the original `attribute / displayName / value / path` quartet only).
 *
 * Kept private to this module — `flattenEntityToTableRows()` is the
 * single call site so every row added by the table builder gets the
 * same enrichment exactly once.
 */
function annotateRowWithIndustry(row) {
  if (!row || typeof row !== 'object') return row;
  if ('industry' in row && 'ownershipReason' in row) return row;
  const { industry, reason } = resolveIndustryForPath(row.path);
  row.industry = industry;
  row.ownershipReason = reason;
  return row;
}

function scalarValueType(value) {
  if (value == null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'string';
  return 'string';
}

function buildScalarRow(path, value, attributeOverride) {
  const attr = attributeOverride || (path ? path.split('.').pop() : '');
  return annotateRowWithIndustry({
    attribute: attr,
    displayName: humanize(attr),
    value: value == null ? '' : String(value),
    valueType: scalarValueType(value),
    path,
  });
}

function flattenEntityToTableRows(obj, prefix = '') {
  const rows = [];
  if (obj === null || typeof obj === 'undefined') {
    if (prefix) {
      rows.push(buildScalarRow(prefix, obj));
    }
    return rows;
  }
  if (typeof obj !== 'object') {
    rows.push(buildScalarRow(prefix, obj));
    return rows;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        rows.push(...flattenEntityToTableRows(item, path));
      } else {
        rows.push(buildScalarRow(path, item));
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
        const attrForPath = (p) =>
          p && /\.\d+$/.test(p) ? p.split('.').slice(-2).join('.') : (p || '').split('.').pop();
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          rows.push(...flattenEntityToTableRows(item, subPath));
        } else {
          rows.push(buildScalarRow(subPath, item, attrForPath(subPath)));
        }
      });
    } else {
      const attr = path && /\.\d+$/.test(path) ? path.split('.').slice(-2).join('.') : key;
      rows.push(buildScalarRow(path, value, attr));
    }
  }
  return rows;
}

function toEcidString(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val.trim() || null;
  if (typeof val === 'number') return String(val);
  return null;
}

function ensureSingleEcid(ecid) {
  if (ecid == null) return null;
  if (Array.isArray(ecid)) {
    const first = ecid.find(
      (x) => x != null && (typeof x === 'string' ? x.trim().length >= 10 : typeof x === 'number')
    );
    return ensureSingleEcid(
      first != null && typeof first === 'object' && first.id != null ? first.id : first
    );
  }
  const str = toEcidString(ecid);
  if (!str || !/^\d+$/.test(str)) return str;
  if (str.length <= 38) return str;
  return str.slice(0, 38);
}

const ECID_PATH_DEMOEMEA = '_demoemea.identification.core.ecid';

function getProfileEcidFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
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
  const first = arr.find((x) => x && x.id != null);
  if (first) return toEcidString(first.id);
  return null;
}

function getProfileEcid(entity) {
  if (!entity || typeof entity !== 'object') return null;
  let val = toEcidString(get(entity, ECID_PATH_DEMOEMEA));
  if (val && val.length >= 10) return val;
  val = getProfileEcidFromObject(entity);
  if (val) return val;
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

function getFirstEcidFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const normalizeVal = (v) =>
    v != null && typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const looksLikeEcid = (v) => {
    const s = normalizeVal(v);
    return s.length >= 10 && /^\d+$/.test(s);
  };
  const pathNorm = (p) => (p && typeof p === 'string' ? p.trim().toLowerCase() : '');
  const isDemoemeaEcidPath = (p) =>
    pathNorm(p) === '_demoemea.identification.core.ecid' || (p && p.endsWith('.identification.core.ecid'));
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
 * Lightweight diagnostics for operators tracing OOTB `xdm:testProfile` (Profile
 * test details). Does not echo the full UPS entity — only merge-policy id (when
 * UPS returns it) and whether the test flag appears on the merged root / in rows.
 *
 * @param {object|null|undefined} entityPayload - UPS wrapper `{ entity, mergePolicy?, … }`
 * @param {object|null|undefined} entity - merged XDM object passed to flatten
 * @param {object[]} rows - flattened table rows
 */
function buildProfileAccessHints(entityPayload, entity, rows) {
  const mp = entityPayload && typeof entityPayload === 'object' ? entityPayload.mergePolicy : null;
  const mergePolicyFromUps =
    mp && typeof mp === 'object' && mp.id != null ? String(mp.id).trim() || null : null;
  const upsRootHasXdmTestProfileKey =
    entity &&
    typeof entity === 'object' &&
    !Array.isArray(entity) &&
    Object.prototype.hasOwnProperty.call(entity, 'xdm:testProfile');
  const profileTableHasXdmTestProfileRow = Array.isArray(rows)
    ? rows.some(
        (r) =>
          r &&
          typeof r.path === 'string' &&
          (r.path === 'xdm:testProfile' || r.path.endsWith('.xdm:testProfile')),
      )
    : false;
  return {
    mergePolicyFromUps,
    upsRootHasXdmTestProfileKey,
    profileTableHasXdmTestProfileRow,
  };
}

/**
 * @param {string} email
 * @param {object} response - UPS Profile Access API JSON
 */
function buildProfileTablePayload(email, response) {
  const keys = Object.keys(response || {}).filter((k) => !k.startsWith('_'));
  if (keys.length === 0) {
    return { email, found: false, rows: [] };
  }
  const entityId = keys[0];
  const entityPayload = response[entityId];
  const entity = entityPayload?.entity ?? entityPayload;
  if (!entity || (typeof entity === 'object' && Object.keys(entity).length === 0)) {
    return {
      email,
      found: true,
      rows: [],
      profileEmail: null,
      ecid: null,
      entityId: entityId || null,
      lastModified: null,
      profileAccessHints: buildProfileAccessHints(entityPayload, entity, []),
    };
  }
  const rows = flattenEntityToTableRows(entity).sort((a, b) => (a.path || '').localeCompare(b.path || ''));
  let profileEmail = getProfileEmail(entity) || getProfileEmail(entityPayload);
  const demoemeaEcid = entity?._demoemea?.identification?.core?.ecid ?? entity?._demoemea?.identification?.core?.ECID;
  let ecid =
    toEcidString(demoemeaEcid) ||
    toEcidString(get(entity, ECID_PATH_DEMOEMEA)) ||
    (entityPayload?.entity &&
      toEcidString(
        entityPayload.entity._demoemea?.identification?.core?.ecid ??
          entityPayload.entity._demoemea?.identification?.core?.ECID
      )) ||
    getProfileEcid(entity) ||
    getProfileEcid(entityPayload);
  if ((ecid == null || ecid === '') && rows.length) ecid = getFirstEcidFromRows(rows);
  if ((profileEmail == null || profileEmail === '') && rows.length) {
    const emailRow = rows.find(
      (r) => r.path && (r.path.endsWith('.email') || r.attribute === 'email') && r.value
    );
    if (emailRow) profileEmail = emailRow.value;
  }
  if ((profileEmail == null || profileEmail === '') && email) profileEmail = email;
  if ((ecid == null || ecid === '') && rows.length) {
    const pathLower = (p) => (p && typeof p === 'string' ? p.toLowerCase() : '');
    const ecidRow = rows.find((r) => {
      const p = pathLower(r.path);
      const a = r.attribute && typeof r.attribute === 'string' ? r.attribute.toLowerCase() : '';
      return (p.endsWith('.ecid') || a === 'ecid' || p.includes('ecid')) && r.value;
    });
    if (ecidRow) ecid = toEcidString(ecidRow.value) || ecidRow.value;
  }
  ecid = ensureSingleEcid(ecid);
  const lastModifiedAt = entity?.lastModifiedAt ?? entityPayload?.lastModifiedAt ?? null;
  return {
    email,
    found: true,
    rows,
    profileEmail: profileEmail || null,
    ecid: ecid && ecid.length >= 10 ? ecid : null,
    entityId: entityId || null,
    lastModified: lastModifiedAt ?? null,
    profileAccessHints: buildProfileAccessHints(entityPayload, entity, rows),
  };
}

const UPS_ENTITIES = 'https://platform.adobe.io/data/core/ups/access/entities';

/** Optional; same env as profile events — steers UPS merge when org default is unset. */
function profileAccessMergePolicyId() {
  const id = String(
    process.env.AEP_PROFILE_ACCESS_MERGE_POLICY_ID || process.env.AEP_PROFILE_EVENTS_MERGE_POLICY_ID || '',
  ).trim();
  return id || null;
}

/**
 * UI namespace key → UPS entityIdNS attempts (order matters; sandboxes vary casing).
 * Unknown keys fall back to a single attempt using the key as entityIdNS (custom namespaces).
 */
const PROFILE_LOOKUP_NAMESPACE_TRIES = {
  email: ['email', 'Email'],
  ecid: ['ECID', 'ecid'],
  crmid: ['CRMId', 'crmId', 'CrmId', 'CRMid'],
  loyaltyid: ['Loyalty', 'loyaltyId', 'LoyaltyId'],
  phone: ['Phone', 'phone'],
};

/**
 * Fetch profile by identity value and namespace (Consent Manager / Profile table).
 * @param {string} identityValue - email, ECID, CRM ID, etc.
 * @param {string} [namespaceKey='email'] - key from PROFILE_LOOKUP_NAMESPACE_TRIES or custom UPS namespace code
 */
async function fetchUpsProfileEntities(identityValue, sandboxName, token, clientId, orgId, namespaceKey = 'email') {
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandboxName,
    Accept: 'application/json',
  };
  const rawKey = String(namespaceKey || 'email').trim();
  const norm = rawKey.toLowerCase().replace(/[\s_-]+/g, '');
  const entityIdNsList =
    PROFILE_LOOKUP_NAMESPACE_TRIES[norm] || (rawKey && rawKey !== 'email' ? [rawKey] : PROFILE_LOOKUP_NAMESPACE_TRIES.email);
  let lastMessage = null;
  let sawOkEmpty = false;
  for (const entityIdNS of entityIdNsList) {
    const qs = new URLSearchParams({
      'schema.name': '_xdm.context.profile',
      entityId: identityValue,
      entityIdNS,
    });
    const mp = profileAccessMergePolicyId();
    if (mp) qs.set('mergePolicyId', mp);
    const url = `${UPS_ENTITIES}?${qs}`;
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastMessage = data.message || data.error_description || data.title || res.statusText;
      continue;
    }
    const keys = Object.keys(data).filter((k) => !k.startsWith('_'));
    if (keys.length > 0) return data;
    sawOkEmpty = true;
  }
  if (sawOkEmpty) return {};
  const err = new Error(lastMessage || 'Profile not found');
  err.code = 'UPS_FAILED';
  throw err;
}

/**
 * Reason templates for the new `writable=false` rows. The UI surfaces
 * these as `<input disabled title="…">` tooltips.
 *
 *   - INDUSTRY_NOT_PROVISIONED — the row's owning industry has no schema
 *     OR no dataset (per `/api/profile-infra/status-all`). The architect
 *     would have to run that industry's setup wizard first.
 *   - INDUSTRY_NOT_PROFILE_ENABLED — schema + dataset exist but at least
 *     one is not Profile-enabled (schemaInUnion + datasetProfileEnabled
 *     must both be true to write).
 *   - INDUSTRY_NO_DATAFLOW — schema + dataset are Profile-enabled but no
 *     HTTP API streaming connection is saved in Firestore for this
 *     sandbox; architect needs to save a connection on the industry's
 *     panel.
 *   - UNOWNED_PATH — no industry schema in this sandbox declares this
 *     path (resolveIndustryForPath returned null). Almost always means
 *     the path was streamed via a previous sandbox/schema, or the path
 *     is part of an OOTB mixin we haven't mapped yet.
 */
const WRITABLE_FALSE_REASON = {
  INDUSTRY_NOT_PROVISIONED: (display) =>
    `${display} not yet provisioned in this sandbox (run the ${display} setup wizard first).`,
  INDUSTRY_NOT_PROFILE_ENABLED: (display) =>
    `${display} schema or dataset is not yet enabled for Real-Time Customer Profile in this sandbox.`,
  INDUSTRY_NO_DATAFLOW: (display) =>
    `${display} has no HTTP API streaming connection saved for this sandbox (open the ${display} panel and click Save connection).`,
  UNOWNED_PATH: 'No industry schema in this sandbox declares this path.',
};

/** Display labels for industry pills in the new Dataflow column. */
const INDUSTRY_DISPLAY_NAMES = {
  generic: 'Generic',
  travel: 'Travel',
  fsi: 'FSI',
  telecom: 'Telecom',
  retail: 'Retail',
  media: 'Media',
  sports: 'Sports',
};

/**
 * Resolve `{ get }` from an industry connection store regardless of its
 * export shape. Some stores spread the factory output (`...store`, so
 * `store.get` exists), others export a wrapped function with the
 * industry name baked in (e.g. `getGenericProfileConnection`).
 */
function resolveConnectionGetter(store, industryKey) {
  if (!store) return null;
  if (typeof store.get === 'function') return store.get.bind(store);
  const candidates = [
    `get${industryKey.charAt(0).toUpperCase()}${industryKey.slice(1)}ProfileConnection`,
  ];
  for (const name of candidates) {
    if (typeof store[name] === 'function') return store[name].bind(store);
  }
  return null;
}

/**
 * Build a per-industry `{ industryKey -> { dataflow, writable, reason } }`
 * map for one sandbox by combining:
 *
 *   1. The aggregate `/api/profile-infra/status-all` flags
 *      (schemaFound, schemaInUnion, datasetFound, datasetProfileEnabled)
 *      → tells us whether a write would even land in Profile.
 *   2. The per-industry Firestore connection record
 *      (`streaming.url`, `streaming.flowId`, `streaming.datasetId`,
 *      `streaming.schemaId`, `streaming.xdmKey`)
 *      → tells us whether a streaming dataflow exists to write to.
 *
 * @param {object} cfg
 * @param {object} cfg.statusAllPayload   - shape of runProfileInfraStatusAll output
 * @param {object} cfg.connectionStores   - { generic, travel, fsi, telecom, retail, media, sports }
 * @param {string} cfg.sandbox
 * @returns {Promise<Record<string, { display: string,
 *   schemaFound: boolean, schemaInUnion: boolean, datasetFound: boolean,
 *   datasetProfileEnabled: boolean, dataflowId: string|null,
 *   datasetId: string|null, schemaId: string|null,
 *   collectionUrl: string|null, xdmKey: string|null,
 *   writable: boolean, notWritableReason: string|null }>>}
 */
async function buildIndustryWritabilityMap({ statusAllPayload, connectionStores, sandbox }) {
  const industriesFlags = (statusAllPayload && statusAllPayload.industries) || {};
  /** @type {Record<string, object>} */
  const out = {};
  await Promise.all(
    Object.keys(INDUSTRY_DISPLAY_NAMES).map(async (industryKey) => {
      const display = INDUSTRY_DISPLAY_NAMES[industryKey];
      const flags = industriesFlags[industryKey] || {};
      const schemaFound = !!flags.schemaFound;
      const schemaInUnion = !!flags.schemaInUnion;
      const datasetFound = !!flags.datasetFound;
      const datasetProfileEnabled = !!flags.datasetProfileEnabled;

      let dataflowId = null;
      let datasetId = null;
      let schemaId = null;
      let collectionUrl = null;
      let xdmKey = null;
      try {
        const getter = resolveConnectionGetter(connectionStores[industryKey], industryKey);
        if (getter) {
          const record = await getter(sandbox);
          if (record && record.streaming && typeof record.streaming === 'object') {
            const s = record.streaming;
            dataflowId = String(s.flowId || '').trim() || null;
            datasetId = String(s.datasetId || '').trim() || null;
            schemaId = String(s.schemaId || '').trim() || null;
            collectionUrl = String(s.url || '').trim() || null;
            xdmKey = String(s.xdmKey || '').trim() || null;
          }
        }
      } catch {
        // Connection store read failed — treat as no-dataflow but keep
        // the rest of the map intact so other industries still surface.
      }

      let writable;
      let notWritableReason = null;
      if (!schemaFound || !datasetFound) {
        writable = false;
        notWritableReason = WRITABLE_FALSE_REASON.INDUSTRY_NOT_PROVISIONED(display);
      } else if (!schemaInUnion || !datasetProfileEnabled) {
        writable = false;
        notWritableReason = WRITABLE_FALSE_REASON.INDUSTRY_NOT_PROFILE_ENABLED(display);
      } else if (!collectionUrl || !dataflowId) {
        writable = false;
        notWritableReason = WRITABLE_FALSE_REASON.INDUSTRY_NO_DATAFLOW(display);
      } else {
        writable = true;
      }

      out[industryKey] = {
        display,
        schemaFound,
        schemaInUnion,
        datasetFound,
        datasetProfileEnabled,
        dataflowId,
        datasetId,
        schemaId,
        collectionUrl,
        xdmKey,
        writable,
        notWritableReason,
      };
    }),
  );
  return out;
}

/**
 * Layer per-row writability/dataflow context onto a payload returned by
 * `buildProfileTablePayload`. Mutates each row in place; safe to call
 * even if the payload is empty / not-found. Adds a top-level
 * `industries` block so the UI can render legend / debug info without
 * a second round-trip.
 *
 * @param {object} payload   - output of buildProfileTablePayload
 * @param {object} writability - output of buildIndustryWritabilityMap
 */
/**
 * For Generate Profiles "merge into existing": resolve ECID from Profile Access by email.
 * @returns {{ ecid: string|null, diagnostics: object }}
 */
async function resolveExistingEcidForProfileMerge(email, sandbox, token, clientId, orgId) {
  const rawNs = String(process.env.AEP_PROFILE_MERGE_ENTITY_ID_NS || '').trim();
  const namespaces = rawNs ? rawNs.split(',').map((s) => s.trim()).filter(Boolean) : ['Email', 'email'];
  const trimmed = String(email || '').trim();
  const emailVariants = [...new Set([trimmed, trimmed.toLowerCase()].filter(Boolean))];
  const diagnostics = { namespacesAttempted: namespaces, entityIdsAttempted: emailVariants, attempts: [] };
  for (const entityId of emailVariants) {
    for (const entityIdNS of namespaces) {
      try {
        const data = await fetchUpsProfileEntities(entityId, sandbox, token, clientId, orgId, entityIdNS);
        const payload = buildProfileTablePayload(entityId, data);
        const ecid = payload.ecid && String(payload.ecid).length >= 10 ? String(payload.ecid) : null;
        diagnostics.attempts.push({ entityId, entityIdNS, foundEcid: Boolean(ecid) });
        if (ecid) {
          diagnostics.usedNamespace = entityIdNS;
          diagnostics.usedEntityId = entityId;
          return { ecid: ensureSingleEcid(ecid), diagnostics };
        }
      } catch (e) {
        diagnostics.attempts.push({
          entityId,
          entityIdNS,
          error: String(e && e.message ? e.message : e).slice(0, 240),
        });
      }
    }
  }
  diagnostics.message =
    'Profile Access returned no ECID. Set AEP_PROFILE_MERGE_ENTITY_ID_NS (comma-separated) if your email namespace code differs.';
  return { ecid: null, diagnostics };
}

function enrichProfileTablePayloadWithWritability(payload, writability) {
  if (!payload || typeof payload !== 'object') return payload;
  const map = writability && typeof writability === 'object' ? writability : {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  for (const row of rows) {
    const key = row && row.industry;
    if (!key) {
      row.dataflowId = null;
      row.datasetId = null;
      row.schemaId = null;
      row.collectionUrl = null;
      row.industryDisplay = null;
      row.writable = false;
      row.notWritableReason = WRITABLE_FALSE_REASON.UNOWNED_PATH;
      continue;
    }
    const entry = map[key];
    if (!entry) {
      row.dataflowId = null;
      row.datasetId = null;
      row.schemaId = null;
      row.collectionUrl = null;
      row.industryDisplay = INDUSTRY_DISPLAY_NAMES[key] || key;
      row.writable = false;
      row.notWritableReason = `${INDUSTRY_DISPLAY_NAMES[key] || key} status unavailable for this sandbox.`;
      continue;
    }
    row.industryDisplay = entry.display;
    row.dataflowId = entry.dataflowId;
    row.datasetId = entry.datasetId;
    row.schemaId = entry.schemaId;
    row.collectionUrl = entry.collectionUrl;
    row.writable = !!entry.writable;
    row.notWritableReason = entry.notWritableReason;
  }
  payload.industries = map;
  return payload;
}

module.exports = {
  buildProfileTablePayload,
  resolveExistingEcidForProfileMerge,
  fetchUpsProfileEntities,
  flattenEntityToTableRows,
  get,
  getProfileEmail,
  getProfileEcid,
  getFirstEcidFromRows,
  ensureSingleEcid,
  toEcidString,
  humanize,
  ECID_PATH_DEMOEMEA,
  buildIndustryWritabilityMap,
  enrichProfileTablePayloadWithWritability,
  resolveConnectionGetter,
  INDUSTRY_DISPLAY_NAMES,
  WRITABLE_FALSE_REASON,
  RESOLUTION_REASON,
};
