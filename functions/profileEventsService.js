/**
 * GET /api/profile/events — Query Service first, then UPS profile+events / experienceevent (mirrors server.js).
 */
const {
  flattenEntityToTableRows,
  get,
  toEcidString,
} = require('./profileTableHelpers');

const QUERY_SERVICE_BASE = 'https://platform.adobe.io/data/foundation/query';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';
const ACCESS_ENTITIES_ENDPOINT = 'https://platform.adobe.io/data/core/ups/access/entities';

const DATASET_ID_REGEX = /^[a-fA-F0-9]{24}$/;
const datasetTableNameCache = new Map();

function quoteTableId(id) {
  if (!id) return id;
  return `"${String(id).replace(/"/g, '""')}"`;
}

async function resolveDatasetToTableName(datasetId, token, clientId, orgId, sandboxName) {
  if (!datasetId) return datasetId;
  if (datasetTableNameCache.has(datasetId)) return datasetTableNameCache.get(datasetId);
  if (!DATASET_ID_REGEX.test(datasetId.trim())) return datasetId;
  try {
    const res = await fetch(`${CATALOG_BASE}/dataSets/${datasetId}?properties=qualifiedName,name`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': clientId,
        'x-gw-ims-org-id': orgId,
        'x-sandbox-name': sandboxName,
        Accept: 'application/json',
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

async function getTableRef(datasetId, token, clientId, orgId, sandboxName) {
  const tableName = await resolveDatasetToTableName(datasetId, token, clientId, orgId, sandboxName);
  return quoteTableId(tableName);
}

async function runQueryService(sql, queryParameters, sandboxName, token, clientId, orgId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandboxName,
  };
  const body = {
    dbName: `${sandboxName}:all`,
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

  const maxWaitMs = 110000;
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

async function getEventsFromQueryService(email, sandboxName, token, clientId, orgId) {
  const datasetId = process.env.AEP_QUERY_EVENTS_DATASET_ID || 'api_operational_events_dataset';
  const emailCol = process.env.AEP_QUERY_EVENTS_EMAIL_COLUMN || 'person.workEmail.address';
  const tsCol = process.env.AEP_QUERY_EVENTS_TIMESTAMP_COLUMN || 'timestamp';
  const tableRef = await getTableRef(datasetId, token, clientId, orgId, sandboxName);
  const emailColQuoted = emailCol.includes('.') ? `"${emailCol.replace(/"/g, '""')}"` : emailCol;
  const tsColQuoted = tsCol.includes('.') ? `"${tsCol.replace(/"/g, '""')}"` : tsCol;
  const sql = `SELECT * FROM ${tableRef} WHERE LOWER(CAST(${emailColQuoted} AS STRING)) = LOWER($email) ORDER BY ${tsColQuoted} DESC NULLS LAST LIMIT 50`;
  const result = await runQueryService(sql, { email }, sandboxName, token, clientId, orgId);
  if (result.state !== 'SUCCESS') {
    const errMsg = result.errors && result.errors[0] ? result.errors[0].message || String(result.errors[0]) : result.state;
    throw new Error(`Events query ${result.state}: ${errMsg}`);
  }
  const rows = result.rows || result.result || result.results || [];
  return Array.isArray(rows) ? rows : [];
}

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

function eventRowToEventPayload(row, index) {
  if (!row || typeof row !== 'object') return { entityId: String(index), timestamp: null, eventName: 'Event', rows: [] };
  const tsRaw = row.timestamp ?? row._id ?? row.eventTimestamp;
  const timestamp = tsRaw == null ? null : typeof tsRaw === 'number' ? tsRaw : new Date(tsRaw).getTime();
  const eventName =
    row.eventType ?? row.name ?? row._type ?? row['@type'] ?? deriveEventName(row) ?? 'Event';
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

function extractExperienceEventsFromProfileResponse(response) {
  const out = [];
  const pushEvent = (item) => {
    const entity = item.entity ?? item;
    const ts = item.timestamp ?? entity?.timestamp;
    const tsMs = ts == null ? null : typeof ts === 'number' ? ts : new Date(ts).getTime();
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

const EVENTS_NAMESPACE_TRIES = {
  email: ['email', 'Email'],
  ecid: ['ECID', 'ecid'],
  crmid: ['CRMId', 'crmId', 'CrmId', 'CRMid'],
  loyaltyid: ['Loyalty', 'loyaltyId', 'LoyaltyId'],
  phone: ['Phone', 'phone'],
};

async function getProfileWithExperienceEvents(identityValue, limit, sandboxName, token, clientId, orgId, namespaceKey = 'email') {
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandboxName,
    Accept: 'application/json',
  };
  async function fetchOne(entityIdNS) {
    const params = new URLSearchParams({
      'schema.name': '_xdm.context.profile',
      entityId: identityValue,
      entityIdNS,
      relatedEntities: 'experienceEvents',
      limit: String(limit),
    });
    const url = `${ACCESS_ENTITIES_ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }
  const rawKey = String(namespaceKey || 'email').trim();
  const norm = rawKey.toLowerCase().replace(/[\s_-]+/g, '');
  const nsTries = EVENTS_NAMESPACE_TRIES[norm] || (rawKey && rawKey !== 'email' ? [rawKey] : EVENTS_NAMESPACE_TRIES.email);
  let res, data;
  for (const ns of nsTries) {
    const result = await fetchOne(ns);
    res = result.res;
    data = result.data;
    const keyCount = Object.keys(data).filter((k) => !k.startsWith('_')).length;
    if (res.ok && keyCount > 0) return data;
  }
  if (!res.ok) {
    const msg = data.message || data.error_description || data.title || res.statusText;
    throw new Error(msg || `Profile API (profile + events) ${res.status}`);
  }
  return data;
}

async function getProfileExperienceEvents(relatedEntityId, relatedEntityIdNS, sandboxName, token, clientId, orgId) {
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
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandboxName,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error_description || data.title || res.statusText;
    throw new Error(msg || `Profile API (events) ${res.status}`);
  }
  return data;
}

/**
 * @returns {Promise<{ email: string, events: object[], source?: string }>}
 */
async function buildEventsPayload(identityValue, namespace, sandboxName, token, clientId, orgId) {
  const ns = String(namespace || 'email').trim().toLowerCase();
  const isEmailLookup = ns === 'email' || !ns;
  const explicitDataset = process.env.AEP_QUERY_EVENTS_DATASET_ID;
  if (isEmailLookup) {
    try {
      const rawRows = await getEventsFromQueryService(identityValue, sandboxName, token, clientId, orgId);
      const events = rawRows.map((row, i) => eventRowToEventPayload(row, i));
      return { email: identityValue, events, source: 'query_service' };
    } catch (queryErr) {
      if (explicitDataset !== undefined && explicitDataset !== '') {
        throw queryErr;
      }
    }
  }

  const limit = Math.min(parseInt(process.env.AEP_PROFILE_EVENTS_LIMIT || '50', 10) || 50, 100);
  const profileWithEvents = await getProfileWithExperienceEvents(identityValue, limit, sandboxName, token, clientId, orgId, ns);
  let events = extractExperienceEventsFromProfileResponse(profileWithEvents);
  if (events.length === 0) {
    const entityId = Object.keys(profileWithEvents).filter((k) => !k.startsWith('_'))[0];
    const entityPayload = entityId ? profileWithEvents[entityId] : null;
    const entity = entityPayload?.entity ?? entityPayload;
    const ecid =
      entity && (entity._demoemea?.identification?.core?.ecid ?? entity._demoemea?.identification?.core?.ECID != null)
        ? toEcidString(entity._demoemea.identification.core.ecid ?? entity._demoemea.identification.core.ECID)
        : null;
    const relatedId = ecid && ecid.length >= 10 ? ecid : identityValue;
    const relatedNS = ecid && ecid.length >= 10 ? 'ECID' : (isEmailLookup ? 'email' : ns);
    const raw = await getProfileExperienceEvents(relatedId, relatedNS, sandboxName, token, clientId, orgId);
    const children = raw.children || raw.results || [];
    events = children.map((child) => {
      const eventEntity = child.entity || child;
      const ts =
        child.timestamp != null
          ? child.timestamp
          : eventEntity.timestamp
            ? new Date(eventEntity.timestamp).getTime()
            : null;
      const rows = flattenEntityToTableRows(eventEntity).sort((a, b) => (a.path || '').localeCompare(b.path || ''));
      return {
        entityId: child.entityId || child.id || '',
        timestamp: ts,
        eventName: deriveEventName(eventEntity),
        rows,
      };
    });
  }

  return { email: identityValue, events };
}

module.exports = { buildEventsPayload };
