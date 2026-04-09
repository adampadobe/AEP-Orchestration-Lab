/**
 * Journey browse — list AJO journeys via journey.adobe.io authoring API
 * with fallback to platform.adobe.io/ajo/journey.
 */

const CJM_JOURNEY_BASE =
  process.env.CJM_JOURNEY_BASE || 'https://journey.adobe.io/authoring/journeys';
const PLATFORM_AJO_JOURNEY_BASE =
  process.env.PLATFORM_AJO_JOURNEY_BASE || 'https://platform.adobe.io/ajo/journey';
const AJO_PAGE_SIZE = 100;

function authoringHeaders(token, clientId, orgId, sandbox) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
}

function platformHeaders(token, clientId, orgId, sandbox) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
}

function extractListArray(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of ['results', 'data', 'journeys', 'items', 'content', 'records', 'value']) {
    if (Array.isArray(data[k])) return data[k];
  }
  if (data._embedded && typeof data._embedded === 'object') {
    for (const v of Object.values(data._embedded)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

async function fetchFromAuthoring(start, limit, headers) {
  const base = CJM_JOURNEY_BASE.replace(/\/$/, '');
  const urls = [
    `${base}?start=${start}&limit=${limit}`,
    `${base}?page=${Math.floor(start / AJO_PAGE_SIZE)}&pageSize=${Math.min(AJO_PAGE_SIZE, limit)}`,
    base,
  ];
  let lastData = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET', headers });
      const data = await res.json().catch(() => ({}));
      lastData = data;
      if (!res.ok) continue;
      let list = extractListArray(data);
      if (Array.isArray(data) && list.length === 0) list = data;
      if (list.length === 0 && url !== base) continue;
      if (url === base) list = list.slice(start, start + limit);
      return { ok: true, list, meta: data, source: 'journey.authoring' };
    } catch {
      continue;
    }
  }
  return { ok: false, list: [], meta: lastData, source: 'journey.authoring' };
}

async function fetchFromPlatform(start, limit, headers) {
  const startPage = Math.floor(start / AJO_PAGE_SIZE);
  const endPage = Math.floor((start + limit - 1) / AJO_PAGE_SIZE);
  const base = PLATFORM_AJO_JOURNEY_BASE.replace(/\/$/, '');
  const combined = [];
  let lastMeta = null;
  for (let p = startPage; p <= endPage; p++) {
    const url = `${base}?page=${p}&pageSize=${AJO_PAGE_SIZE}`;
    try {
      const res = await fetch(url, { method: 'GET', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, list: [], meta: data, source: 'platform.ajo' };
      lastMeta = data;
      const batch = extractListArray(data);
      combined.push(...batch);
      if (!batch.length || (data.pages != null && p >= data.pages - 1)) break;
    } catch {
      break;
    }
  }
  const offset = start - startPage * AJO_PAGE_SIZE;
  const list = combined.slice(offset, offset + limit);
  return { ok: true, list, meta: lastMeta, source: 'platform.ajo' };
}

function coalesceNum(raw, ...paths) {
  for (const p of paths) {
    let v = raw;
    for (const seg of p.split('.')) {
      if (v == null || typeof v !== 'object') { v = undefined; break; }
      v = v[seg];
    }
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const md = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : null;
  const nested = raw._experience?.journeyOrchestration?.journey;

  const journeyVersionID =
    raw.journeyVersionID ?? raw.journeyVersionId ?? raw.versionId ??
    raw.journeyVersion?.id ?? raw.journeyVersion?.journeyVersionID ?? null;
  const journeyID = raw.journeyID ?? raw.journeyId ?? raw.id ?? raw.journey?.id ?? null;

  const name =
    raw.itemName ?? raw.name ?? nested?.itemName ?? nested?.name ??
    raw.label ?? raw.title ?? raw.journeyName ?? raw.displayName ?? null;

  const tags = raw.tags ?? raw.tagList ?? raw.labels;
  const tagArray = Array.isArray(tags)
    ? tags.map((t) => (typeof t === 'string' ? t : t?.name ?? t?.label ?? String(t))).filter(Boolean)
    : [];

  const status = raw.status ?? raw.state ?? raw.lifecycleState ?? raw.journeyStatus ?? null;

  const createdAt =
    raw.createdAt ?? raw.createdDate ?? raw.created ?? md?.createdAt ?? null;
  const updatedAt =
    raw.updatedAt ?? raw.modifiedAt ?? raw.lastModified ?? raw.updatedDate ?? raw.modified ?? md?.updatedAt ?? null;
  const createdBy =
    raw.createdBy ?? raw.createdByName ?? md?.createdBy ?? null;
  const updatedBy =
    raw.updatedBy ?? raw.modifiedBy ?? raw.lastModifiedBy ?? raw.updatedByName ?? md?.updatedBy ?? null;
  const publishedAt =
    raw.publishedAt ?? raw.publishedDate ?? raw.publishDate ?? md?.publishedAt ?? null;
  const publishedBy =
    raw.publishedBy ?? raw.publishedByName ?? md?.publishedBy ?? null;

  const entryTotal = coalesceNum(
    raw,
    'entryTotal',
    'entryCount',
    'journeyVersion.entryTotal',
    'journeyVersion.entryCount',
    'statistics.entryTotal',
    'statistics.entryCount',
    'currentVersion.entryTotal',
  );

  return {
    journeyID,
    journeyVersionID,
    name: name != null ? String(name).trim() || null : null,
    status: status != null ? String(status) : null,
    tags: tagArray,
    entryTotal,
    createdAt,
    updatedAt,
    createdBy: createdBy != null ? String(createdBy) : null,
    updatedBy: updatedBy != null ? String(updatedBy) : null,
    publishedAt,
    publishedBy: publishedBy != null ? String(publishedBy) : null,
  };
}

async function buildBrowseResponse(sandbox, token, clientId, orgId, start, limit) {
  const authHdrs = authoringHeaders(token, clientId, orgId, sandbox);
  const platHdrs = platformHeaders(token, clientId, orgId, sandbox);

  let result = await fetchFromAuthoring(start, limit, authHdrs);
  if (!result.ok) {
    result = await fetchFromPlatform(start, limit, platHdrs);
  }
  if (!result.ok) {
    const m = result.meta || {};
    const msg = m.message || m.error || m.title || m.reason || 'Journey API error';
    return { ok: false, error: String(msg), journeys: [], source: result.source };
  }

  const rows = result.list.map(normalizeRow).filter(Boolean);

  let total = rows.length;
  const meta = result.meta;
  if (meta && typeof meta === 'object' && meta.pages != null && meta.limit != null) {
    total = Number(meta.pages) * Number(meta.limit);
  }

  return {
    ok: true,
    journeys: rows,
    start,
    limit,
    total: Number.isFinite(total) ? total : rows.length,
    source: result.source,
  };
}

module.exports = { buildBrowseResponse };
