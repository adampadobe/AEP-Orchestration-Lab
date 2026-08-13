'use strict';

const AUDIENCES_BASE = 'https://platform.adobe.io/data/core/ups/audiences';

function platformHeaders(token, clientId, orgId, sandbox) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
}

function parseTimestamp(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeRefList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return String(item.id || item.audienceId || item.name || '').trim();
    })
    .filter(Boolean);
}

function normalizeAudience(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(item.id || '').trim(),
    audienceId: String(item.audienceId || '').trim(),
    name: String(item.name || '').trim(),
    description: String(item.description || '').trim(),
    type: String(item.type || '').trim(),
    originName: String(item.originName || '').trim(),
    namespace: String(item.namespace || '').trim(),
    lifecycleState: String(item.lifecycleState || '').trim(),
    createdBy: String(item.createdBy || '').trim(),
    createdAt: parseTimestamp(item.creationTime ?? item.createEpoch),
    updatedAt: parseTimestamp(item.updateTime ?? item.updateEpoch),
    dependencies: normalizeRefList(item.dependencies),
    dependents: normalizeRefList(item.dependents),
    evaluationInfo: item.evaluationInfo && typeof item.evaluationInfo === 'object'
      ? item.evaluationInfo
      : null,
    labels: Array.isArray(item.labels) ? item.labels : [],
    etag: String(item._etag || '').trim(),
  };
}

async function readPlatformResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { raw: text.slice(0, 20_000) } : null;
  }
  if (!response.ok) {
    const detail = data && typeof data === 'object'
      ? data.message || data.error || data.detail || data.title
      : '';
    const error = new Error(String(detail || response.statusText || `Audience API ${response.status}`));
    error.status = response.status;
    error.platformResponse = data;
    throw error;
  }
  return data;
}

async function listAudiences({ token, clientId, orgId, sandbox, start = 0, limit = 50, name, includeInactive = true }) {
  const url = new URL(AUDIENCES_BASE);
  url.searchParams.set('start', String(Math.max(0, Number(start) || 0)));
  url.searchParams.set('limit', String(Math.min(100, Math.max(1, Number(limit) || 50))));
  url.searchParams.set('sort', 'updateTime:desc');
  if (name) url.searchParams.set('name', String(name).trim().slice(0, 200));
  // Adobe documents property=audienceId as the way to include inactive audiences.
  if (includeInactive) url.searchParams.set('property', 'audienceId');

  const response = await fetch(url, {
    method: 'GET',
    headers: platformHeaders(token, clientId, orgId, sandbox),
  });
  const data = await readPlatformResponse(response) || {};
  const audiences = (Array.isArray(data.children) ? data.children : [])
    .map(normalizeAudience)
    .filter((item) => item.id);
  return {
    sandbox,
    start: Math.max(0, Number(start) || 0),
    limit: Math.min(100, Math.max(1, Number(limit) || 50)),
    count: audiences.length,
    page: data._page && typeof data._page === 'object' ? data._page : null,
    audiences,
  };
}

async function getAudience({ token, clientId, orgId, sandbox, audienceId }) {
  const id = String(audienceId || '').trim();
  if (!id) throw Object.assign(new Error('audienceId is required.'), { status: 400 });
  const response = await fetch(`${AUDIENCES_BASE}/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: platformHeaders(token, clientId, orgId, sandbox),
  });
  const data = await readPlatformResponse(response);
  return normalizeAudience(data);
}

async function deleteAudience({ token, clientId, orgId, sandbox, audienceId }) {
  const id = String(audienceId || '').trim();
  if (!id) throw Object.assign(new Error('audienceId is required.'), { status: 400 });
  const response = await fetch(`${AUDIENCES_BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: platformHeaders(token, clientId, orgId, sandbox),
  });
  await readPlatformResponse(response);
  return { ok: true, status: response.status };
}

module.exports = {
  AUDIENCES_BASE,
  normalizeAudience,
  listAudiences,
  getAudience,
  deleteAudience,
};
