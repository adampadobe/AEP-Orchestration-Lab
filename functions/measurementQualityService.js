'use strict';

const { BASE_IMS_SCOPES, TOKEN_PROFILES } = require('./adobeApiCapabilityRegistry');

const ASSURANCE_URL = 'https://graffias.adobe.io/graffias/graphql';
const STATUS_URL = 'https://status.adobe.io/api/v1/events';
const ASSURANCE_SCOPES = TOKEN_PROFILES.assuranceSessionEventRead;

function boundedInt(value, fallback, max) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

function safeId(value, label) {
  const id = String(value || '').trim();
  if (!id || id.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(id)) {
    const error = new Error(`${label} is invalid.`);
    error.status = 400;
    throw error;
  }
  return id;
}

function upstreamError(service, status) {
  const error = new Error(`${service} read failed with HTTP ${status}.`);
  error.status = status === 401 || status === 403 ? status : 502;
  return error;
}

function payloadKeys(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  return Object.keys(payload).slice(0, 40);
}

function createMeasurementQualityService(deps) {
  const {
    getAccessToken,
    getClientId,
    getImsOrg,
    tagsService,
    fetchImpl = fetch,
  } = deps;

  function headers(token, contentType) {
    return {
      Authorization: `Bearer ${token}`,
      'x-api-key': getClientId(),
      'x-gw-ims-org-id': getImsOrg(),
      Accept: 'application/json',
      ...(contentType ? { 'Content-Type': contentType } : {}),
    };
  }

  async function assuranceQuery(query, variables) {
    const token = await getAccessToken(ASSURANCE_SCOPES.join(' '));
    const response = await fetchImpl(ASSURANCE_URL, {
      method: 'POST',
      headers: headers(token, 'application/json'),
      body: JSON.stringify({ query, variables }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw upstreamError('Adobe Assurance', response.status);
    if (Array.isArray(data.errors) && data.errors.length) {
      const error = new Error('Adobe Assurance returned a GraphQL error.');
      error.status = 502;
      throw error;
    }
    return data.data || {};
  }

  async function listAssuranceSessions({ limit } = {}) {
    const size = boundedInt(limit, 20, 50);
    const data = await assuranceQuery('query AssuranceSessions { sessions { uuid name } }', {});
    const sessions = Array.isArray(data.sessions) ? data.sessions.slice(0, size) : [];
    return {
      ok: true,
      evidence: 'tenant_read_verified',
      sessions: sessions.map((item) => ({ uuid: String(item.uuid || ''), name: String(item.name || '') })),
      returned: sessions.length,
      limit: size,
    };
  }

  async function inspectAssuranceEvents({ session_uuid, page, limit } = {}) {
    const sessionUuid = safeId(session_uuid, 'session_uuid');
    const pageNumber = Math.max(0, Math.min(Number.isInteger(Number(page)) ? Number(page) : 0, 1000));
    const size = boundedInt(limit, 20, 50);
    const data = await assuranceQuery(
      'query AssuranceEvents($sessionUuid: UUID!, $page: Int!, $size: Int!) { events(sessionUuid: $sessionUuid, _page: $page, _size: $size) { uuid clientId timestamp vendor type payload } }',
      { sessionUuid, page: pageNumber, size },
    );
    const events = Array.isArray(data.events) ? data.events : [];
    return {
      ok: true,
      evidence: 'tenant_read_verified',
      session_uuid: sessionUuid,
      page: pageNumber,
      events: events.map((item) => ({
        uuid: String(item.uuid || ''),
        client_id: String(item.clientId || ''),
        timestamp: item.timestamp ?? null,
        vendor: String(item.vendor || ''),
        type: String(item.type || ''),
        payload_keys: payloadKeys(item.payload),
      })),
      returned: events.length,
      privacy: 'Raw event payloads are intentionally omitted.',
    };
  }

  async function launchToken() {
    return getAccessToken();
  }

  function assertTagsResult(result) {
    if (result?.ok) return result;
    throw upstreamError('Adobe Experience Platform Tags', Number(result?.httpStatus) || 502);
  }

  async function auditLaunchProperties({ property_id, limit } = {}) {
    const token = await launchToken();
    const result = assertTagsResult(await tagsService.listAllPropertiesAcrossCompanies(
      token, getClientId(), getImsOrg(),
    ));
    const requestedId = property_id ? safeId(property_id, 'property_id') : '';
    const size = boundedInt(limit, 25, 50);
    const properties = result.rows.filter((row) => !requestedId || row.propertyId === requestedId).slice(0, size);
    if (requestedId && properties.length === 0) {
      const error = new Error('Launch property was not found for this organization.');
      error.status = 404;
      throw error;
    }
    const audits = [];
    for (const property of properties) {
      const [extensions, rules] = await Promise.all([
        tagsService.listExtensions(token, getClientId(), getImsOrg(), property.propertyId),
        tagsService.listRules(token, getClientId(), getImsOrg(), property.propertyId),
      ]);
      audits.push({
        property,
        extensions: assertTagsResult(extensions).items.map((item) => ({
          extensionId: item.extensionId, name: item.name, enabled: item.enabled, updatedAt: item.updatedAt,
        })),
        rules: assertTagsResult(rules).items.map((item) => ({
          ruleId: item.ruleId, name: item.name, enabled: item.enabled, updatedAt: item.updatedAt,
        })),
      });
    }
    return { ok: true, evidence: 'tenant_read_verified', audits, returned: audits.length, limit: size };
  }

  async function listLaunchEnvironments({ property_id } = {}) {
    const propertyId = safeId(property_id, 'property_id');
    const token = await launchToken();
    const result = assertTagsResult(await tagsService.listEnvironments(
      token, getClientId(), getImsOrg(), propertyId,
    ));
    return {
      ok: true,
      evidence: 'tenant_read_verified',
      property_id: propertyId,
      environments: result.items.slice(0, 50),
      returned: Math.min(result.items.length, 50),
    };
  }

  async function correlateStatusIncidents({ from, to, product_ids, keywords, limit } = {}) {
    const fromDate = String(from || '').trim();
    const toDate = String(to || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      const error = new Error('from and to must use YYYY-MM-DD.');
      error.status = 400;
      throw error;
    }
    const start = Date.parse(`${fromDate}T00:00:00Z`);
    const end = Date.parse(`${toDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 31 * 86400000) {
      const error = new Error('Status incident window must be between 0 and 31 days.');
      error.status = 400;
      throw error;
    }
    const ids = Array.isArray(product_ids)
      ? product_ids.slice(0, 20).map((id) => safeId(id, 'product_id'))
      : [];
    const url = new URL(STATUS_URL);
    url.searchParams.set('api_key', 'StatusAdobeIOClient');
    url.searchParams.set('from', fromDate);
    url.searchParams.set('to', toDate);
    if (ids.length) url.searchParams.set('productIds', ids.join(','));
    const token = await getAccessToken(BASE_IMS_SCOPES.join(' '));
    const response = await fetchImpl(url, { method: 'GET', headers: headers(token) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw upstreamError('Adobe Status', response.status);
    const raw = Array.isArray(data) ? data : Array.isArray(data.events) ? data.events : Array.isArray(data.data) ? data.data : [];
    const terms = Array.isArray(keywords)
      ? keywords.slice(0, 10).map((v) => String(v).trim().slice(0, 80).toLowerCase()).filter(Boolean)
      : [];
    const filtered = terms.length
      ? raw.filter((item) => terms.some((term) => JSON.stringify(item).toLowerCase().includes(term)))
      : raw;
    const size = boundedInt(limit, 25, 100);
    return {
      ok: true,
      evidence: 'tenant_read_verified',
      window: { from: fromDate, to: toDate },
      incidents: filtered.slice(0, size).map((item) => ({
        id: String(item.id || item.eventId || ''),
        title: String(item.title || item.name || item.message || ''),
        status: String(item.status || item.state || ''),
        type: String(item.type || item.eventType || ''),
        start: item.start || item.startTime || item.created_at || null,
        end: item.end || item.endTime || item.updated_at || null,
        products: Array.isArray(item.products) ? item.products.slice(0, 20) : [],
      })),
      returned: Math.min(filtered.length, size),
      limit: size,
    };
  }

  return {
    listAssuranceSessions,
    inspectAssuranceEvents,
    auditLaunchProperties,
    listLaunchEnvironments,
    correlateStatusIncidents,
  };
}

module.exports = {
  ASSURANCE_URL,
  STATUS_URL,
  ASSURANCE_SCOPES,
  createMeasurementQualityService,
};
