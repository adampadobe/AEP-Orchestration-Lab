/**
 * Profile table JSON shape for GET /api/profile/table (mirrors Express server.js handler).
 * Kept in functions/ for Firebase Hosting rewrite — not imported from aep-prototypes server.
 */

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
        rows.push({
          attribute: attr,
          displayName: humanize(attr),
          value: item == null ? '' : String(item),
          path,
        });
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
          const attr = attrForPath(subPath);
          rows.push({
            attribute: attr,
            displayName: humanize(attr),
            value: item == null ? '' : String(item),
            path: subPath,
          });
        }
      });
    } else {
      const attr = path && /\.\d+$/.test(path) ? path.split('.').slice(-2).join('.') : key;
      rows.push({
        attribute: attr,
        displayName: humanize(attr),
        value: value == null ? '' : String(value),
        path,
      });
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
  };
}

const UPS_ENTITIES = 'https://platform.adobe.io/data/core/ups/access/entities';

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

module.exports = {
  buildProfileTablePayload,
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
};
